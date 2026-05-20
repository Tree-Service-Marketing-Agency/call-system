import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  billingLedger,
  calls,
  companies,
  invoices,
} from "@/lib/db/schema";
import type { LedgerStatus } from "@/lib/billing/state";

export const INVOICE_CALLS_PAGE_SIZE = 15;

export interface InvoiceCallRow {
  id: string;
  callId: string;
  customerName: string | null;
  customerPhone: string | null;
  callStatus: string | null;
  durationMs: number | null;
  callDate: string | null;
  createdAt: string;
  audioUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  ledgerStatus: LedgerStatus | null;
  billingPriceCents: number | null;
  // Numeric(10,6) USD column rendered as string (PG numeric). Agency-only at
  // the API boundary — this module is purely a data shaper.
  retellCost: string | null;
}

export interface GetCallsForInvoiceParams {
  invoiceId: string;
  page?: number;
  pageSize?: number;
  /** Case-insensitive substring over customer name / phone. */
  search?: string;
}

export interface GetCallsForInvoiceResult {
  data: InvoiceCallRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Calls linked to an invoice via `billing_ledger.invoiceId` (the canonical
 * link from invoice creation through `paid`). This intentionally does NOT
 * use `calls.invoiceId`, which only gets populated on `paid`.
 */
export async function getCallsForInvoice(
  params: GetCallsForInvoiceParams,
): Promise<GetCallsForInvoiceResult> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = params.pageSize ?? INVOICE_CALLS_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  const search = params.search?.trim() ?? "";

  const conditions: SQL[] = [eq(billingLedger.invoiceId, params.invoiceId)];

  if (search.length > 0) {
    const pattern = `%${search}%`;
    const searchClause = or(
      ilike(calls.customerName, pattern),
      ilike(calls.customerPhone, pattern),
    );
    if (searchClause) conditions.push(searchClause);
  }

  const where = and(...conditions);

  const selection = {
    id: calls.id,
    callId: calls.callId,
    customerName: calls.customerName,
    customerPhone: calls.customerPhone,
    callStatus: calls.callStatus,
    durationMs: calls.durationMs,
    callDate: calls.callDate,
    createdAt: calls.createdAt,
    audioUrl: calls.audioUrl,
    companyId: calls.companyId,
    companyName: companies.name,
    ledgerStatus: billingLedger.status,
    billingPriceCents: calls.billingPriceCents,
    retellCost: calls.retellCost,
  };

  const [data, totalResult] = await Promise.all([
    db
      .select(selection)
      .from(billingLedger)
      .innerJoin(calls, eq(billingLedger.callRowId, calls.id))
      .leftJoin(companies, eq(calls.companyId, companies.id))
      .where(where)
      .orderBy(desc(calls.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(billingLedger)
      .innerJoin(calls, eq(billingLedger.callRowId, calls.id))
      .where(where),
  ]);

  return {
    data: data.map((row) => ({
      ...row,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : row.createdAt,
    })),
    total: Number(totalResult[0]?.count ?? 0),
    page,
    pageSize,
  };
}

export interface InvoiceWithAggregates {
  id: string;
  companyId: string;
  companyName: string | null;
  stripeInvoiceId: string | null;
  amountCents: number;
  status: string;
  hostedInvoiceUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  callsCount: number;
  sumBillingPriceCents: number;
  // Numeric(10,6) USD — kept as USD (not micros) to match the column's
  // storage. PRD referred to "sumRetellCostMicros"; the underlying column is
  // USD with 6-decimal precision, so the value is USD. null when no joined
  // call has a retellCost.
  sumRetellCostUsd: number | null;
}

/**
 * One query for the header + footer: invoice metadata, joined company name,
 * and aggregates over the calls linked through `billing_ledger.invoiceId`.
 * Returns null when the invoice doesn't exist.
 */
export async function getInvoiceWithAggregates(
  invoiceId: string,
): Promise<InvoiceWithAggregates | null> {
  const [invoiceRow] = await db
    .select({
      id: invoices.id,
      companyId: invoices.companyId,
      companyName: companies.name,
      stripeInvoiceId: invoices.stripeInvoiceId,
      amountCents: invoices.amountCents,
      status: invoices.status,
      hostedInvoiceUrl: invoices.hostedInvoiceUrl,
      createdAt: invoices.createdAt,
      paidAt: invoices.paidAt,
    })
    .from(invoices)
    .leftJoin(companies, eq(invoices.companyId, companies.id))
    .where(eq(invoices.id, invoiceId))
    .limit(1);

  if (!invoiceRow) return null;

  const [aggregates] = await db
    .select({
      callsCount: sql<number>`count(*)::int`,
      sumBillingPriceCents: sql<number>`COALESCE(SUM(${calls.billingPriceCents}), 0)::int`,
      sumRetellCostUsd: sql<string | null>`SUM(${calls.retellCost})::text`,
    })
    .from(billingLedger)
    .innerJoin(calls, eq(billingLedger.callRowId, calls.id))
    .where(eq(billingLedger.invoiceId, invoiceId));

  const sumRetellRaw = aggregates?.sumRetellCostUsd ?? null;
  const sumRetellCostUsd =
    sumRetellRaw === null ? null : Number(sumRetellRaw);

  return {
    id: invoiceRow.id,
    companyId: invoiceRow.companyId,
    companyName: invoiceRow.companyName,
    stripeInvoiceId: invoiceRow.stripeInvoiceId,
    amountCents: invoiceRow.amountCents,
    status: invoiceRow.status,
    hostedInvoiceUrl: invoiceRow.hostedInvoiceUrl,
    createdAt:
      invoiceRow.createdAt instanceof Date
        ? invoiceRow.createdAt.toISOString()
        : invoiceRow.createdAt,
    paidAt:
      invoiceRow.paidAt instanceof Date
        ? invoiceRow.paidAt.toISOString()
        : invoiceRow.paidAt,
    callsCount: Number(aggregates?.callsCount ?? 0),
    sumBillingPriceCents: Number(aggregates?.sumBillingPriceCents ?? 0),
    sumRetellCostUsd:
      sumRetellCostUsd !== null && Number.isFinite(sumRetellCostUsd)
        ? sumRetellCostUsd
        : null,
  };
}
