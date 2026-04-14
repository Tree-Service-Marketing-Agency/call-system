import { NextRequest, NextResponse } from "next/server";
import { eq, sql, count, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, companyAgents, users, calls } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const minimal = searchParams.get("minimal") === "true";

  if (minimal) {
    const data = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .orderBy(companies.name);
    return NextResponse.json({ data });
  }

  // Full query with aggregated counts
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const data = await db
    .select({
      id: companies.id,
      name: companies.name,
      createdAt: companies.createdAt,
      agentCount: sql<number>`(SELECT COUNT(*) FROM company_agents WHERE company_agents.company_id = ${companies.id})`.as("agent_count"),
      userCount: sql<number>`(SELECT COUNT(*) FROM users WHERE users.company_id = ${companies.id})`.as("user_count"),
      monthlyBillingCents: sql<number>`COALESCE((SELECT SUM(billing_price_cents) FROM calls WHERE calls.company_id = ${companies.id} AND calls.created_at >= ${startOfMonth}), 0)`.as("monthly_billing_cents"),
    })
    .from(companies)
    .orderBy(companies.name);

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, agentIds } = body;

  if (!name || !agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
    return NextResponse.json(
      { error: "name and agentIds are required" },
      { status: 400 }
    );
  }

  const [company] = await db.insert(companies).values({ name }).returning();

  await db.insert(companyAgents).values(
    agentIds.map((agentId: string) => ({
      companyId: company.id,
      agentId,
    }))
  );

  return NextResponse.json(company, { status: 201 });
}
