import { NextRequest, NextResponse } from "next/server";
import { eq, desc, sql, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls } from "@/lib/db/schema";
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

  // Only include calls where webhook1 was received (has customer data)
  conditions.push(sql`${calls.webhook1Received} = true`);
  conditions.push(sql`${calls.customerPhone} IS NOT NULL`);

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

  const where = sql`${sql.join(conditions, sql` AND `)}`;

  const [data, totalResult] = await Promise.all([
    db
      .select({
        customerPhone: calls.customerPhone,
        customerName: sql<string>`MAX(${calls.customerName})`.as("customer_name"),
        customerAddress: sql<string>`MAX(${calls.customerAddress})`.as("customer_address"),
        customerCity: sql<string>`MAX(${calls.customerCity})`.as("customer_city"),
        totalCalls: count().as("total_calls"),
      })
      .from(calls)
      .where(where)
      .groupBy(calls.customerPhone)
      .orderBy(desc(sql`MAX(${calls.createdAt})`))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({
        count: sql<number>`COUNT(DISTINCT ${calls.customerPhone})`.as("count"),
      })
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
