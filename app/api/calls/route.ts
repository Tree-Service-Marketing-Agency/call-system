import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls, companies } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

const PAGE_SIZE = 15;

const PERIODS = ["today", "7d", "30d", "all"] as const;
type Period = (typeof PERIODS)[number];

function isPeriod(value: string | null): value is Period {
  return value !== null && (PERIODS as readonly string[]).includes(value);
}

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface PeriodWindow {
  start: Date;
  prevStart: Date;
  prevEnd: Date;
}

function periodWindow(period: Period, now: Date): PeriodWindow | null {
  if (period === "all") return null;
  const today = startOfToday(now);
  if (period === "today") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { start: today, prevStart: yesterday, prevEnd: today };
  }
  const days = period === "7d" ? 7 : 30;
  const start = new Date(today);
  start.setDate(start.getDate() - (days - 1));
  const prevEnd = start;
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);
  return { start, prevStart, prevEnd };
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

const COMPLETED_STATUSES_SQL = sql.raw(
  `(${["completed", "ended", "successful"]
    .map((s) => `'${s.replace(/'/g, "''")}'`)
    .join(",")})`,
);

interface Stats {
  total: number;
  avgDurationMs: number;
  completionRate: number;
  customers: number;
  deltas: {
    total: number | null;
    avgDurationMs: number | null;
    completionRate: number | null;
    customers: number | null;
  };
}

function emptyStats(): Stats {
  return {
    total: 0,
    avgDurationMs: 0,
    completionRate: 0,
    customers: 0,
    deltas: {
      total: null,
      avgDurationMs: null,
      completionRate: null,
      customers: null,
    },
  };
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1");
  const companyFilter = searchParams.get("companyId");
  const periodParam = searchParams.get("period");
  const period: Period = isPeriod(periodParam) ? periodParam : "all";
  const offset = (page - 1) * PAGE_SIZE;

  const scopeConditions: SQL[] = [];

  if (isAgencyRole(user.role)) {
    if (companyFilter) {
      scopeConditions.push(eq(calls.companyId, companyFilter));
    }
  } else {
    if (!user.companyId) {
      return NextResponse.json({
        data: [],
        total: 0,
        page,
        pageSize: PAGE_SIZE,
        period,
        stats: emptyStats(),
      });
    }
    scopeConditions.push(eq(calls.companyId, user.companyId));
  }

  const now = new Date();
  const window = periodWindow(period, now);
  const listConditions = [...scopeConditions];
  if (window) listConditions.push(gte(calls.createdAt, window.start));

  const listWhere =
    listConditions.length > 0 ? and(...listConditions) : undefined;
  const scopeWhere =
    scopeConditions.length > 0 ? and(...scopeConditions) : undefined;

  const [data, totalResult] = await Promise.all([
    db
      .select({
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
        webhook1Received: calls.webhook1Received,
        webhook2Received: calls.webhook2Received,
      })
      .from(calls)
      .leftJoin(companies, eq(calls.companyId, companies.id))
      .where(listWhere)
      .orderBy(desc(calls.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(calls)
      .where(listWhere),
  ]);

  // Aggregates: split into "current period" and (when applicable) "previous
  // period of the same length" so deltas are like-for-like.
  const currentPeriodFilter = window
    ? sql`${calls.createdAt} >= ${window.start}`
    : sql`true`;
  const previousPeriodFilter = window
    ? sql`${calls.createdAt} >= ${window.prevStart} and ${calls.createdAt} < ${window.prevEnd}`
    : sql`false`;

  const [aggregates] = await db
    .select({
      total: sql<number>`count(*) filter (where ${currentPeriodFilter})::int`,
      prevTotal: sql<number>`count(*) filter (where ${previousPeriodFilter})::int`,
      avgDuration: sql<
        number | null
      >`(avg(${calls.durationMs}) filter (where ${currentPeriodFilter} and ${calls.durationMs} is not null))::float`,
      prevAvgDuration: sql<
        number | null
      >`(avg(${calls.durationMs}) filter (where ${previousPeriodFilter} and ${calls.durationMs} is not null))::float`,
      withStatus: sql<number>`count(*) filter (where ${currentPeriodFilter} and ${calls.callStatus} is not null)::int`,
      completed: sql<number>`count(*) filter (where ${currentPeriodFilter} and ${calls.callStatus} in ${COMPLETED_STATUSES_SQL})::int`,
      prevWithStatus: sql<number>`count(*) filter (where ${previousPeriodFilter} and ${calls.callStatus} is not null)::int`,
      prevCompleted: sql<number>`count(*) filter (where ${previousPeriodFilter} and ${calls.callStatus} in ${COMPLETED_STATUSES_SQL})::int`,
      customers: sql<number>`count(distinct ${calls.customerPhone}) filter (where ${currentPeriodFilter} and ${calls.customerPhone} is not null)::int`,
      prevCustomers: sql<number>`count(distinct ${calls.customerPhone}) filter (where ${previousPeriodFilter} and ${calls.customerPhone} is not null)::int`,
    })
    .from(calls)
    .where(scopeWhere);

  const completionRate =
    aggregates.withStatus > 0
      ? aggregates.completed / aggregates.withStatus
      : 0;
  const prevCompletionRate =
    aggregates.prevWithStatus > 0
      ? aggregates.prevCompleted / aggregates.prevWithStatus
      : 0;

  const stats: Stats = {
    total: aggregates.total,
    avgDurationMs: aggregates.avgDuration ?? 0,
    completionRate,
    customers: aggregates.customers,
    deltas: {
      total: window ? pctChange(aggregates.total, aggregates.prevTotal) : null,
      avgDurationMs: window
        ? pctChange(
            aggregates.avgDuration ?? 0,
            aggregates.prevAvgDuration ?? 0,
          )
        : null,
      completionRate: window
        ? completionRate === 0 && prevCompletionRate === 0
          ? 0
          : (completionRate - prevCompletionRate) * 100
        : null,
      customers: window
        ? pctChange(aggregates.customers, aggregates.prevCustomers)
        : null,
    },
  };

  return NextResponse.json({
    data,
    total: totalResult[0].count,
    page,
    pageSize: PAGE_SIZE,
    period,
    stats,
  });
}
