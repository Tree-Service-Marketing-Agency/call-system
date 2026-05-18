import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingLedger, calls, companies } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

const BILLING_FILTER_TO_STATUSES = {
  pending: ["pending", "reserved"],
  charged: ["paid"],
  "non-billable": ["void"],
} as const;

type BillingFilter = keyof typeof BILLING_FILTER_TO_STATUSES;
type LedgerStatusValue =
  (typeof BILLING_FILTER_TO_STATUSES)[BillingFilter][number];

function isBillingFilter(value: string): value is BillingFilter {
  return value in BILLING_FILTER_TO_STATUSES;
}

function parseList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

const PAGE_SIZE = 15;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1");
  const companyId = searchParams.get("companyId")?.trim() || null;
  const billingValues = parseList(searchParams.get("billing")).filter(
    isBillingFilter,
  );
  const offset = (page - 1) * PAGE_SIZE;

  const conditions: SQL[] = [];

  if (isAgencyRole(user.role)) {
    if (companyId) {
      conditions.push(eq(calls.companyId, companyId));
    }
  } else {
    if (!user.companyId) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        pageSize: PAGE_SIZE,
      });
    }
    conditions.push(eq(calls.companyId, user.companyId));
  }

  if (billingValues.length > 0) {
    const ledgerStatuses = Array.from(
      new Set(
        billingValues.flatMap(
          (v) => BILLING_FILTER_TO_STATUSES[v] as readonly LedgerStatusValue[],
        ),
      ),
    );
    conditions.push(inArray(billingLedger.status, ledgerStatuses));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const isAgency = isAgencyRole(user.role);

  // ADR-003: retell_cost is agency-only. Field is excluded from SELECT for
  // staff/staff_admin so it never reaches the wire.
  const baseSelection = {
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
  };
  const selection = isAgency
    ? { ...baseSelection, retellCost: calls.retellCost }
    : baseSelection;

  const [data, totalResult] = await Promise.all([
    db
      .select(selection)
      .from(calls)
      .leftJoin(companies, eq(calls.companyId, companies.id))
      .leftJoin(billingLedger, eq(billingLedger.callRowId, calls.id))
      .where(where)
      .orderBy(desc(calls.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(calls)
      .leftJoin(billingLedger, eq(billingLedger.callRowId, calls.id))
      .where(where),
  ]);

  return NextResponse.json({
    data,
    total: totalResult[0].count,
    page,
    pageSize: PAGE_SIZE,
  });
}
