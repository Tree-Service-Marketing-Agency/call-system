import { eq, and, inArray } from "drizzle-orm";
import type { db as DbType } from "@/lib/db";
import { billingLedger, calls } from "@/lib/db/schema";

type DrizzleClient = typeof DbType;
type Tx = Parameters<Parameters<DrizzleClient["transaction"]>[0]>[0];

export async function insertCallChargeLedgerEntry(
  client: DrizzleClient | Tx,
  params: {
    companyId: string;
    callId: string;
    callRowId: string;
    amountCents: number;
  }
): Promise<{ inserted: boolean }> {
  const result = await client
    .insert(billingLedger)
    .values({
      companyId: params.companyId,
      callId: params.callId,
      callRowId: params.callRowId,
      entryType: "call_charge",
      amountCents: params.amountCents,
      status: "pending",
    })
    .onConflictDoNothing({
      target: [billingLedger.callId, billingLedger.entryType],
    })
    .returning({ id: billingLedger.id });

  return { inserted: result.length > 0 };
}

/**
 * ADR-007: insert the Ledger entry directly as `void` for a call that was
 * auto-excluded for being shorter than the Minimum billable duration.
 *
 * Unlike a manual Void, this never touches `companies.current_balance_cents`
 * nor `calls.billing_counted_at` (the auto-void never summed to the balance,
 * so a later Restore correctly adds `amount_cents` back). `voidedBy` stays
 * NULL so the data distinguishes a system exclusion from a human Void.
 *
 * Keeps the same `onConflictDoNothing` on UNIQUE(call_id, entry_type) so an
 * n8n reprocess/retry stays idempotent.
 */
export async function insertVoidedCallChargeLedgerEntry(
  client: DrizzleClient | Tx,
  params: {
    companyId: string;
    callId: string;
    callRowId: string;
    amountCents: number;
  }
): Promise<{ inserted: boolean }> {
  const result = await client
    .insert(billingLedger)
    .values({
      companyId: params.companyId,
      callId: params.callId,
      callRowId: params.callRowId,
      entryType: "call_charge",
      amountCents: params.amountCents,
      status: "void",
      voidedAt: new Date(),
      voidedBy: null,
    })
    .onConflictDoNothing({
      target: [billingLedger.callId, billingLedger.entryType],
    })
    .returning({ id: billingLedger.id });

  return { inserted: result.length > 0 };
}

export async function reservePendingLedgerForInvoice(
  tx: Tx,
  params: { companyId: string; invoiceId: string }
) {
  return tx
    .update(billingLedger)
    .set({
      status: "reserved",
      invoiceId: params.invoiceId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(billingLedger.companyId, params.companyId),
        eq(billingLedger.status, "pending")
      )
    )
    .returning({
      id: billingLedger.id,
      callRowId: billingLedger.callRowId,
      amountCents: billingLedger.amountCents,
    });
}

export async function releaseReservedLedger(
  client: DrizzleClient | Tx,
  invoiceId: string
) {
  await client
    .update(billingLedger)
    .set({
      status: "pending",
      invoiceId: null,
      updatedAt: new Date(),
    })
    .where(eq(billingLedger.invoiceId, invoiceId));
}

export async function markLedgerPaid(
  client: DrizzleClient | Tx,
  invoiceId: string
): Promise<{ callRowIds: string[] }> {
  const rows = await client
    .update(billingLedger)
    .set({ status: "paid", updatedAt: new Date() })
    .where(eq(billingLedger.invoiceId, invoiceId))
    .returning({ callRowId: billingLedger.callRowId });

  return { callRowIds: rows.map((r) => r.callRowId) };
}

/**
 * After a paid invoice, link each call row to it so the call history shows
 * which invoice settled the charge.
 */
export async function linkCallsToInvoice(
  client: DrizzleClient | Tx,
  callRowIds: string[],
  invoiceId: string
) {
  if (callRowIds.length === 0) return;
  await client
    .update(calls)
    .set({ invoiceId, updatedAt: new Date() })
    .where(inArray(calls.id, callRowIds));
}
