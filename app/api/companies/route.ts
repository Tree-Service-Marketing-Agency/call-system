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
    })
    .from(companies)
    .orderBy(companies.name)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const rows = where ? await dataQuery.where(where) : await dataQuery;

  // One extra query for the whole page (no N+1): pull every retell number
  // for the page's companies and aggregate in memory.
  const companyIds = rows.map((r) => r.id);
  const numbersByCompany = new Map<
    string,
    { enabled: boolean; phoneNumber: string | null }[]
  >();
  if (companyIds.length > 0) {
    const numberRows = await db
      .select({
        companyId: retellNumbers.companyId,
        enabled: retellNumbers.enabled,
        phoneNumber: retellNumbers.phoneNumber,
      })
      .from(retellNumbers)
      .where(inArray(retellNumbers.companyId, companyIds))
      .orderBy(retellNumbers.createdAt);
    for (const row of numberRows) {
      const list = numbersByCompany.get(row.companyId) ?? [];
      list.push({ enabled: row.enabled, phoneNumber: row.phoneNumber });
      numbersByCompany.set(row.companyId, list);
    }
  }

  const data = rows.map((row) => {
    const numbers = numbersByCompany.get(row.id) ?? [];
    return {
      ...row,
      retellStatus: deriveRetellStatus(numbers.map((n) => n.enabled)),
      phoneNumbers: numbers
        .map((n) => n.phoneNumber)
        .filter((p): p is string => p !== null),
    };
  });

  return NextResponse.json({ data, total, page, pageSize });
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Companies are created without agents since phase 3 (PRD #41); Retell
  // numbers are managed from the company's Settings tab.
  const [company] = await db
    .insert(companies)
    .values({ name: name.trim() })
    .returning();

  return NextResponse.json(company, { status: 201 });
}
