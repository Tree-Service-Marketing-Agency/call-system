import { NextRequest, NextResponse } from "next/server";
import { ilike, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, retellNumbers } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { deriveRetellStatus } from "@/lib/retell-numbers";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

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

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const requestedPageSize = parseInt(
    searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE),
    10,
  );
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, requestedPageSize || DEFAULT_PAGE_SIZE),
  );
  const search = (searchParams.get("q") ?? "").trim();
  const where = search ? ilike(companies.name, `%${search}%`) : undefined;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const totalQuery = db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(companies);
  const totalRow = where
    ? await totalQuery.where(where)
    : await totalQuery;
  const total = Number(totalRow[0]?.count ?? 0);

  const dataQuery = db
    .select({
      id: companies.id,
      name: companies.name,
      createdAt: companies.createdAt,
      retellPhoneNumber: companies.retellPhoneNumber,
      monthlyBillingCents: sql<number>`COALESCE((SELECT SUM(amount_cents) FROM billing_ledger WHERE billing_ledger.company_id = ${companies.id} AND billing_ledger.created_at >= ${startOfMonth}), 0)`.as("monthly_billing_cents"),
    })
    .from(companies)
    .orderBy(companies.name)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const rows = where ? await dataQuery.where(where) : await dataQuery;

  // One extra query for the whole page (no N+1): pull every enabled flag
  // for the page's companies and aggregate in memory.
  const companyIds = rows.map((r) => r.id);
  const flagsByCompany = new Map<string, boolean[]>();
  if (companyIds.length > 0) {
    const numberRows = await db
      .select({
        companyId: retellNumbers.companyId,
        enabled: retellNumbers.enabled,
      })
      .from(retellNumbers)
      .where(inArray(retellNumbers.companyId, companyIds));
    for (const row of numberRows) {
      const flags = flagsByCompany.get(row.companyId) ?? [];
      flags.push(row.enabled);
      flagsByCompany.set(row.companyId, flags);
    }
  }

  const data = rows.map((row) => ({
    ...row,
    retellStatus: deriveRetellStatus(flagsByCompany.get(row.id) ?? []),
  }));

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, agentIds } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // agentIds is optional since phase 2 (PRD #41): companies can be created
  // without agents. When provided (current dialog), each id becomes a
  // retell_numbers row with no phone yet.
  let normalizedAgentIds: string[] = [];
  if (agentIds !== undefined && agentIds !== null) {
    if (
      !Array.isArray(agentIds) ||
      !agentIds.every((a) => typeof a === "string")
    ) {
      return NextResponse.json(
        { error: "agentIds must be an array of strings" },
        { status: 400 }
      );
    }
    normalizedAgentIds = Array.from(
      new Set(agentIds.map((a) => a.trim()).filter((a) => a.length > 0))
    );
  }

  if (normalizedAgentIds.length > 0) {
    const conflicting = await db
      .select({ agentId: retellNumbers.agentId })
      .from(retellNumbers)
      .where(inArray(retellNumbers.agentId, normalizedAgentIds));
    if (conflicting.length > 0) {
      return NextResponse.json(
        {
          error: `Agent IDs already assigned to another company: ${conflicting
            .map((c) => c.agentId)
            .join(", ")}`,
        },
        { status: 409 }
      );
    }
  }

  const company = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(companies)
      .values({ name: name.trim() })
      .returning();

    if (normalizedAgentIds.length > 0) {
      await tx.insert(retellNumbers).values(
        normalizedAgentIds.map((agentId) => ({
          companyId: created.id,
          agentId,
        }))
      );
    }

    return created;
  });

  return NextResponse.json(company, { status: 201 });
}
