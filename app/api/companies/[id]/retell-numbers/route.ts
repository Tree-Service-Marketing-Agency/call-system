import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, retellNumbers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { normalizeUsPhone } from "@/lib/phone";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("root", "admin");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const numbers = await db.query.retellNumbers.findMany({
    where: eq(retellNumbers.companyId, id),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
    columns: {
      id: true,
      agentId: true,
      phoneNumber: true,
      enabled: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ data: numbers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole("root", "admin");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    agentId?: unknown;
    phoneNumber?: unknown;
  };

  if (typeof body.agentId !== "string" || body.agentId.trim().length === 0) {
    return NextResponse.json(
      { error: "agentId is required" },
      { status: 400 }
    );
  }
  const agentId = body.agentId.trim();

  let phoneNumber: string | null = null;
  if (
    "phoneNumber" in body &&
    body.phoneNumber !== null &&
    body.phoneNumber !== undefined
  ) {
    if (typeof body.phoneNumber !== "string") {
      return NextResponse.json(
        { error: "phoneNumber must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.phoneNumber.trim();
    if (trimmed.length > 0) {
      phoneNumber = normalizeUsPhone(trimmed);
      if (phoneNumber === null) {
        return NextResponse.json(
          { error: "invalid phone number" },
          { status: 400 }
        );
      }
    }
  }

  const agentConflict = await db.query.retellNumbers.findFirst({
    where: eq(retellNumbers.agentId, agentId),
  });
  if (agentConflict) {
    return NextResponse.json(
      { error: "agentId is already assigned to a retell number" },
      { status: 409 }
    );
  }

  if (phoneNumber) {
    const phoneConflict = await db.query.retellNumbers.findFirst({
      where: eq(retellNumbers.phoneNumber, phoneNumber),
    });
    if (phoneConflict) {
      return NextResponse.json(
        { error: "phone number is already assigned to a retell number" },
        { status: 409 }
      );
    }
  }

  const [created] = await db
    .insert(retellNumbers)
    .values({ companyId: id, agentId, phoneNumber })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
