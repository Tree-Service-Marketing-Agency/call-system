import { NextRequest, NextResponse } from "next/server";
import { eq, desc, count, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls, companies } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

const PAGE_SIZE = 15;

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const page = parseInt(searchParams.get("page") ?? "1");
  const companyFilter = searchParams.get("companyId");
  const offset = (page - 1) * PAGE_SIZE;

  const conditions = [];

  if (isAgencyRole(user.role)) {
    if (companyFilter) {
      conditions.push(eq(calls.companyId, companyFilter));
    }
  } else {
    if (!user.companyId) {
      return NextResponse.json({ data: [], total: 0, page, pageSize: PAGE_SIZE });
    }
    conditions.push(eq(calls.companyId, user.companyId));
  }

  const where = conditions.length > 0
    ? sql`${sql.join(conditions.map(c => sql`${c}`), sql` AND `)}`
    : undefined;

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
      .where(where)
      .orderBy(desc(calls.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: count() })
      .from(calls)
      .where(where),
  ]);

  return NextResponse.json({
    data,
    total: totalResult[0].count,
    page,
    pageSize: PAGE_SIZE,
  });
}
