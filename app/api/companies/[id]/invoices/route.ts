import { NextRequest, NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = request.nextUrl;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = parseInt(
    searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, requestedPageSize || DEFAULT_PAGE_SIZE),
  );

  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(invoices)
    .where(eq(invoices.companyId, id));
  const total = Number(totalRow?.count ?? 0);

  const data = await db
    .select({
      id: invoices.id,
      stripeInvoiceId: invoices.stripeInvoiceId,
      amountCents: invoices.amountCents,
      status: invoices.status,
      hostedInvoiceUrl: invoices.hostedInvoiceUrl,
      createdAt: invoices.createdAt,
      paidAt: invoices.paidAt,
      failedAt: invoices.failedAt,
    })
    .from(invoices)
    .where(eq(invoices.companyId, id))
    .orderBy(desc(invoices.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({ data, total, page, pageSize });
}
