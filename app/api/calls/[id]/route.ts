import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  billingLedger,
  calls,
  companies,
  invoices,
  users,
} from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import {
  deriveBillingState,
  type BillingState,
  type LedgerStatus,
} from "@/lib/billing/state";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const call = await db.query.calls.findFirst({
    where: eq(calls.id, id),
  });

  if (!call) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isAgencyRole(user.role) && call.companyId !== user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ledger = await db.query.billingLedger.findFirst({
    where: eq(billingLedger.callRowId, call.id),
  });

  let invoiceUrl: string | null = null;
  if (call.invoiceId) {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, call.invoiceId),
    });
    invoiceUrl = invoice?.hostedInvoiceUrl ?? null;
  }

  let voidedByEmail: string | null = null;
  if (ledger?.voidedBy) {
    const voidUser = await db.query.users.findFirst({
      where: eq(users.id, ledger.voidedBy),
    });
    voidedByEmail = voidUser?.email ?? null;
  }

  let companyName: string | null = null;
  if (call.companyId) {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, call.companyId),
    });
    companyName = company?.name ?? null;
  }

  const ledgerStatus: LedgerStatus | null = ledger?.status ?? null;
  const state: BillingState = deriveBillingState({
    webhook2Received: call.webhook2Received,
    ledgerStatus,
  });

  const isRoot = user.role === "root";
  const canVoid = isRoot && ledgerStatus === "pending";
  const canRestore = isRoot && ledgerStatus === "void";

  return NextResponse.json({
    ...call,
    companyName,
    billing: {
      state,
      ledgerStatus,
      amountCents: ledger?.amountCents ?? call.billingPriceCents ?? null,
      invoiceUrl,
      voidedAt: ledger?.voidedAt ?? null,
      voidedByEmail,
      canVoid,
      canRestore,
    },
  });
}
