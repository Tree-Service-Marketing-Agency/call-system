import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls, companyAgents, companies } from "@/lib/db/schema";
import {
  insertCallChargeLedgerEntry,
  insertVoidedCallChargeLedgerEntry,
} from "@/lib/billing/ledger";
import { isBillableDisconnection } from "@/lib/billing/rules";
import { resolveBillingOutcome } from "@/lib/billing/resolve-billing-outcome";
import { verifyN8nSecret } from "@/lib/webhook-auth";
import { mapCallEndedPayload } from "@/lib/calls/map-call-ended-payload";

// ADR-004/006: payload comes from n8n (Retell → n8n → Lola). Auth is a shared
// bearer secret. Since ADR-006, call_ended is the single ingestion webhook:
// it carries customer data, metadata, and transcript in one event.
export async function POST(request: Request) {
  const authError = verifyN8nSecret(request);
  if (authError) return authError;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ADR-004 #4 (kept by ADR-006): n8n unwraps Retell's `[{...}]` array before
  // sending. Lola only accepts a flat object; arrays are rejected with 400.
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
  if (!call_id || !agent_id) {
    return NextResponse.json(
      { error: "call_id and agent_id are required" },
      { status: 400 }
    );
  }

  const mapped = mapCallEndedPayload(callObj);

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
        event: mapped.event ?? event,
        retellEvent: "call_ended",
        callStatus: mapped.callStatus,
        disconnectionReason: mapped.disconnectionReason,
        startTimestamp: mapped.startTimestamp,
        endTimestamp: mapped.endTimestamp,
        durationMs: mapped.durationMs,
        audioUrl: mapped.audioUrl,
        retellCost: mapped.retellCost,
        companyId: companyId ?? existing.companyId,
        // ADR-004 #6 (kept by ADR-006): the "don't overwrite if already
        // populated" rule now guards against n8n reprocess/retry and future
        // manual edits. Only fill when the existing column is null/blank.
        customerName: hasValue(existing.customerName)
          ? existing.customerName
          : mapped.customerName,
        customerPhone: hasValue(existing.customerPhone)
          ? existing.customerPhone
          : mapped.customerPhone,
        summary: hasValue(existing.summary)
          ? existing.summary
          : mapped.summary,
        // Remaining customer fields: keep prior value when the payload omits
        // it so a partial retry can't wipe good data.
        customerAddress: mapped.customerAddress ?? existing.customerAddress,
        customerCity: mapped.customerCity ?? existing.customerCity,
        customerZipcode: mapped.customerZipcode ?? existing.customerZipcode,
        service: mapped.service ?? existing.service,
        callDate: mapped.callDate ?? existing.callDate,
        // Transcript always takes the fresh version when the payload brings
        // a non-empty array; otherwise keep the previous value.
        transcript: mapped.transcript ?? existing.transcript,
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
        event: mapped.event ?? event,
        retellEvent: "call_ended",
        callStatus: mapped.callStatus,
        disconnectionReason: mapped.disconnectionReason,
        startTimestamp: mapped.startTimestamp,
        endTimestamp: mapped.endTimestamp,
        durationMs: mapped.durationMs,
        audioUrl: mapped.audioUrl,
        retellCost: mapped.retellCost,
        customerName: mapped.customerName,
        customerPhone: mapped.customerPhone,
        customerAddress: mapped.customerAddress,
        customerCity: mapped.customerCity,
        customerZipcode: mapped.customerZipcode,
        service: mapped.service,
        summary: mapped.summary,
        callDate: mapped.callDate,
        transcript: mapped.transcript,
      })
      .returning({ id: calls.id });
    callRowId = inserted[0].id;
  }

  const config = await db.query.businessConfig.findFirst();
  const priceCents = config?.pricePerCallCents ?? 100;
  const minBillableSeconds = config?.minBillableDurationSeconds ?? 20;

  // ADR-007: a single deep resolver owns the full billing precedence.
  const outcome = resolveBillingOutcome({
    disconnectionReason: mapped.disconnectionReason,
    companyId,
    durationMs: mapped.durationMs,
    minBillableSeconds,
  });

  // 'no_ledger' → no Ledger entry, Billing cell stays `—` (existing behaviour).
  // Two distinct causes are logged separately for auditing, as before.
  if (outcome === "no_ledger") {
    if (!isBillableDisconnection(mapped.disconnectionReason)) {
      console.log(
        "[call-ended] non-billable disconnection",
        JSON.stringify({
          call_id,
          disconnection_reason: mapped.disconnectionReason,
        })
      );
    } else {
      console.warn(
        "[call-ended] billable call but no company resolved",
        JSON.stringify({ call_id, agent_id })
      );
    }
    return new NextResponse(null, { status: 204 });
  }

  // companyId is non-null past this point (resolver returned 'no_ledger' otherwise).
  const resolvedCompanyId = companyId as string;

  // 'void' → ADR-007 auto short-call exclusion: insert the Ledger entry
  // directly as `void`. Snapshot billing_price_cents (so a later Restore
  // knows what it would have charged) but never touch balance nor
  // billing_counted_at.
  if (outcome === "void") {
    await db.transaction(async (tx) => {
      await tx
        .update(calls)
        .set({ billingPriceCents: priceCents, updatedAt: new Date() })
        .where(eq(calls.id, callRowId));

      const { inserted } = await insertVoidedCallChargeLedgerEntry(tx, {
        companyId: resolvedCompanyId,
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

      console.log(
        "[call-ended] auto_voided_short_call",
        JSON.stringify({
          call_id,
          company_id: resolvedCompanyId,
          duration_ms: mapped.durationMs,
          min_billable_seconds: minBillableSeconds,
          amount_cents: priceCents,
        })
      );
    });

    return new NextResponse(null, { status: 204 });
  }

  // 'pending' → normal billable flow (unchanged): insert pending, +balance,
  // billing_counted_at.
  await db.transaction(async (tx) => {
    await tx
      .update(calls)
      .set({
        billingPriceCents: priceCents,
        updatedAt: new Date(),
      })
      .where(eq(calls.id, callRowId));

    const { inserted } = await insertCallChargeLedgerEntry(tx, {
      companyId: resolvedCompanyId,
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
      .where(eq(companies.id, resolvedCompanyId));

    await tx
      .update(calls)
      .set({ billingCountedAt: new Date() })
      .where(eq(calls.id, callRowId));

    console.log(
      "[call-ended] ledger_inserted",
      JSON.stringify({
        call_id,
        company_id: resolvedCompanyId,
        amount_cents: priceCents,
      })
    );
  });

  return new NextResponse(null, { status: 204 });
}

function hasValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
