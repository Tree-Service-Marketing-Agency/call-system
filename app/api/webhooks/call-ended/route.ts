import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  calls,
  companyAgents,
  companies,
  type TranscriptTurn,
} from "@/lib/db/schema";
import { insertCallChargeLedgerEntry } from "@/lib/billing/ledger";
import { isBillableDisconnection } from "@/lib/billing/rules";
import { verifyN8nSecret } from "@/lib/webhook-auth";

// ADR-004: payload comes from n8n (Retell → n8n → Lola). Auth is a shared
// bearer secret instead of Retell's signature.
export async function POST(request: Request) {
  const authError = verifyN8nSecret(request);
  if (authError) return authError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (Array.isArray(payload)) {
    return NextResponse.json(
      { error: "expected object, got array" },
      { status: 400 }
    );
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "expected object" }, { status: 400 });
  }
  const callObj = payload as Record<string, unknown>;

  const event = (callObj.event as string | undefined) ?? null;
  if (event !== "call_ended") {
    return new NextResponse(null, { status: 204 });
  }

  const call_id = callObj.call_id as string | undefined;
  const agent_id = callObj.agent_id as string | undefined;
  // n8n's payload doesn't always include call_status; the event itself
  // already declares the call ended, so default to "ended" when missing.
  const call_status =
    (callObj.call_status as string | undefined) ?? "ended";
  const disconnection_reason = callObj.disconnection_reason as
    | string
    | undefined;
  const start_timestamp = callObj.start_timestamp as number | undefined;
  const end_timestamp = callObj.end_timestamp as number | undefined;
  const duration_ms = callObj.duration_ms as number | undefined;
  const audio_url = (callObj.recording_url ?? callObj.audio_url) as
    | string
    | undefined;
  // ADR-003: call_cost arrives from n8n as a flat decimal in USD dollars
  // (e.g. 0.230749). Anything that isn't a number is ignored.
  const rawCallCost = callObj.call_cost;
  const call_cost =
    typeof rawCallCost === "number" && Number.isFinite(rawCallCost)
      ? rawCallCost.toString()
      : null;
  const customerPhoneFromWebhook =
    (callObj.from_number as string | undefined) ?? null;
  const customerNameFromWebhook =
    (callObj.name as string | undefined) ?? null;
  const summaryFromWebhook =
    (callObj.summary as string | undefined) ?? null;
  const transcriptFromWebhook = filterTranscript(callObj.transcription_object);

  if (!call_id || !agent_id) {
    return NextResponse.json(
      { error: "call_id and agent_id are required" },
      { status: 400 }
    );
  }

  const agent = await db.query.companyAgents.findFirst({
    where: eq(companyAgents.agentId, agent_id),
  });
  const companyId = agent?.companyId ?? null;

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
        // ADR-004: customerName, summary, customerPhone follow the
        // "don't overwrite if already populated" rule. Only fill when the
        // existing column is null or trimmed-empty.
        customerName: hasValue(existing.customerName)
          ? existing.customerName
          : customerNameFromWebhook,
        summary: hasValue(existing.summary)
          ? existing.summary
          : summaryFromWebhook,
        customerPhone: hasValue(existing.customerPhone)
          ? existing.customerPhone
          : customerPhoneFromWebhook,
        // Transcript always takes the fresh version when the payload brings
        // a non-empty array; otherwise keep the previous value.
        transcript: transcriptFromWebhook ?? existing.transcript,
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
        customerName: customerNameFromWebhook,
        summary: summaryFromWebhook,
        customerPhone: customerPhoneFromWebhook,
        transcript: transcriptFromWebhook,
        webhook1Received: false,
        webhook2Received: true,
      })
      .returning({ id: calls.id });
    callRowId = inserted[0].id;
  }

  if (!isBillableDisconnection(disconnection_reason)) {
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

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// ADR-004: keep only `role` and `content` per turn, drop turns with empty
// content. Returns null when input is missing/invalid/empty so the caller
// can preserve the previous DB value.
function filterTranscript(input: unknown): TranscriptTurn[] | null {
  if (!Array.isArray(input)) return null;
  const turns: TranscriptTurn[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const turn = raw as { role?: unknown; content?: unknown };
    const role = turn.role;
    const content = turn.content;
    if (role !== "agent" && role !== "user") continue;
    if (typeof content !== "string" || content.trim().length === 0) continue;
    turns.push({ role, content });
  }
  return turns.length > 0 ? turns : null;
}
