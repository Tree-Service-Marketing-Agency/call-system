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
  const [row] = await db
    .select({
      call: calls,
      companyName: companies.name,
    })
    .from(calls)
    .leftJoin(companies, eq(calls.companyId, companies.id))
    .where(eq(calls.id, id))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Staff can only see their company's calls
  if (!isAgencyRole(user.role) && row.call.companyId !== user.companyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ledger = await db.query.billingLedger.findFirst({
    where: eq(billingLedger.callRowId, row.call.id),
  });

  let invoiceUrl: string | null = null;
  if (row.call.invoiceId) {
    const invoice = await db.query.invoices.findFirst({
      where: eq(invoices.id, row.call.invoiceId),
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

  const ledgerStatus: LedgerStatus | null = ledger?.status ?? null;
  const state: BillingState | null = deriveBillingState(ledgerStatus);

  const isRoot = user.role === "root";
  const canVoid = isRoot && ledgerStatus === "pending";
  const canRestore = isRoot && ledgerStatus === "void";

  // ADR-003: retell_cost is agency-only. Strip it from the response for
  // staff/staff_admin so it never reaches the browser.
  const { retellCost, ...callWithoutCost } = row.call;
  const callPayload = isAgencyRole(user.role)
    ? { ...callWithoutCost, retellCost }
    : callWithoutCost;

  return NextResponse.json({
    ...callPayload,
    companyName: row.companyName,
    billing: {
      state,
      ledgerStatus,
      amountCents: ledger?.amountCents ?? row.call.billingPriceCents ?? null,
      invoiceUrl,
      voidedAt: ledger?.voidedAt ?? null,
      voidedByEmail,
      canVoid,
      canRestore,
    },
  });
}
