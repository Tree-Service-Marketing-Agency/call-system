import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import Retell from "retell-sdk";
import { db } from "@/lib/db";
import { calls, companyAgents, companies } from "@/lib/db/schema";
import { insertCallChargeLedgerEntry } from "@/lib/billing/ledger";

export async function POST(request: Request) {
  // 1. Read raw body BEFORE parsing — re-serializing changes whitespace and
  // breaks signature verification.
  const rawBody = await request.text();

  // 2. Verify Retell signature using the SDK with the raw body.
  const apiKey = process.env.RETELL_API_KEY;
  const signature = request.headers.get("x-retell-signature");

  if (!apiKey) {
    console.error(
      "[call-ended] RETELL_API_KEY is not configured; rejecting webhook"
    );
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  if (!signature) {
    console.warn("[call-ended] missing x-retell-signature header");
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  let valid = false;
  try {
    valid = await Retell.verify(rawBody, apiKey, signature);
  } catch (err) {
    console.warn(
      "[call-ended] signature verification threw",
      err instanceof Error ? err.message : err
    );
    valid = false;
  }
  if (!valid) {
    console.warn(
      "[call-ended] invalid signature",
      JSON.stringify({ signature_present: true })
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. Parse JSON only after signature passes.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  console.log(payload)

  const event = (payload.event as string | undefined) ?? null;
  if (event !== "call_ended") {
    return new NextResponse(null, { status: 204 });
  }

  // Retell wraps the call in payload.call (per their docs); fall back to the
  // top level for older payloads.
  const callObj =
    (payload.call as Record<string, unknown> | undefined) ?? payload;

  const call_id = callObj.call_id as string | undefined;
  const agent_id = callObj.agent_id as string | undefined;
  const call_status = callObj.call_status as string | undefined;
  const disconnection_reason = callObj.disconnection_reason as
    | string
    | undefined;
  const start_timestamp = callObj.start_timestamp as number | undefined;
  const end_timestamp = callObj.end_timestamp as number | undefined;
  const duration_ms = callObj.duration_ms as number | undefined;
  const audio_url = (callObj.recording_url ?? callObj.audio_url) as
    | string
    | undefined;
  const call_cost = callObj.call_cost
    ? JSON.stringify(callObj.call_cost)
    : null;
  const customerPhoneFromWebhook =
    (callObj.from_number as string | undefined) ?? null;

  if (!call_id || !agent_id) {
    return NextResponse.json(
      { error: "call_id and agent_id are required" },
      { status: 400 }
    );
  }

  // 4. Resolve company by agent.
  const agent = await db.query.companyAgents.findFirst({
    where: eq(companyAgents.agentId, agent_id),
  });
  const companyId = agent?.companyId ?? null;

  // 5. Always upsert the call row, even if not billable.
  const existing = await db.query.calls.findFirst({
    where: and(eq(calls.callId, call_id), eq(calls.agentId, agent_id)),
  });

  let callRowId: string;
  if (existing) {
    await db
      .update(calls)
      .set({
        event,
        retellEvent: "call_ended",
        callStatus: call_status ?? null,
        disconnectionReason: disconnection_reason ?? null,
        startTimestamp: start_timestamp ?? null,
        endTimestamp: end_timestamp ?? null,
        durationMs: duration_ms ?? null,
        audioUrl: audio_url ?? null,
        retellCost: call_cost,
        companyId: companyId ?? existing.companyId,
        // Only fill the phone if call-data hasn't already populated it.
        customerPhone: existing.customerPhone ?? customerPhoneFromWebhook,
        webhook2Received: true,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, existing.id));
    callRowId = existing.id;
  } else {
    const inserted = await db
      .insert(calls)
      .values({
        callId: call_id,
        agentId: agent_id,
        companyId,
        event,
        retellEvent: "call_ended",
        callStatus: call_status ?? null,
        disconnectionReason: disconnection_reason ?? null,
        startTimestamp: start_timestamp ?? null,
        endTimestamp: end_timestamp ?? null,
        durationMs: duration_ms ?? null,
        audioUrl: audio_url ?? null,
        retellCost: call_cost,
        customerPhone: customerPhoneFromWebhook,
        webhook1Received: false,
        webhook2Received: true,
      })
      .returning({ id: calls.id });
    callRowId = inserted[0].id;
  }

  // 6. Billable filter.
  if (disconnection_reason !== "user_hangup") {
    console.log(
      "[call-ended] non-billable disconnection",
      JSON.stringify({
        call_id,
        disconnection_reason: disconnection_reason ?? null,
      })
    );
    return new NextResponse(null, { status: 204 });
  }

  if (!companyId) {
    console.warn(
      "[call-ended] billable call but no company resolved",
      JSON.stringify({ call_id, agent_id })
    );
    return new NextResponse(null, { status: 204 });
  }

  // 7. Resolve current price and write the ledger entry.
  const config = await db.query.businessConfig.findFirst();
  const priceCents = config?.pricePerCallCents ?? 100;

  await db.transaction(async (tx) => {
    await tx
      .update(calls)
      .set({
        billingPriceCents: priceCents,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callRowId));

    const { inserted } = await insertCallChargeLedgerEntry(tx, {
      companyId,
      callId: call_id,
      callRowId,
      amountCents: priceCents,
    });

    if (!inserted) {
      console.log(
        "[call-ended] ledger_duplicate_ignored",
        JSON.stringify({ call_id })
      );
      return;
    }

    await tx
      .update(companies)
      .set({
        currentBalanceCents: sql`${companies.currentBalanceCents} + ${priceCents}`,
        billingUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    await tx
      .update(calls)
      .set({ billingCountedAt: new Date() })
      .where(eq(calls.id, callRowId));

    console.log(
      "[call-ended] ledger_inserted",
      JSON.stringify({ call_id, company_id: companyId, amount_cents: priceCents })
    );
  });

  return new NextResponse(null, { status: 204 });
}
