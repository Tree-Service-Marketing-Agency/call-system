import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingLedger, calls, companies, users } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { isValidAreaCode } from "@/lib/area-code";
import { validateNotificationPhones } from "@/lib/notification-phones";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user || !isAgencyRole(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    with: {
      retellNumbers: {
        orderBy: (table, { asc }) => [asc(table.createdAt)],
      },
      users: true,
    },
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [billingRow] = await db
    .select({
      monthlyBillingCents: sql<number>`COALESCE(SUM(${billingLedger.amountCents}), 0)::int`,
    })
    .from(billingLedger)
    .where(
      and(
        eq(billingLedger.companyId, id),
        gte(billingLedger.createdAt, startOfMonth),
      ),
    );

  return NextResponse.json({
    ...company,
    numberCount: company.retellNumbers.length,
    activeNumberCount: company.retellNumbers.filter((n) => n.enabled).length,
    userCount: company.users.length,
    monthlyBillingCents: Number(billingRow?.monthlyBillingCents ?? 0),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getSessionUser();
  if (!currentUser || !isAgencyRole(currentUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
  });
  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    areaCode?: unknown;
    notificationPhones?: unknown;
    leadSnapWebhook?: unknown;
  };

  const companyUpdates: Record<string, unknown> = {};

  if ("name" in body) {
    if (typeof body.name !== "string") {
      return NextResponse.json(
        { error: "name must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.name.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "name cannot be empty" },
        { status: 400 }
      );
    }
    companyUpdates.name = trimmed;
  }

  if ("areaCode" in body) {
    if (typeof body.areaCode !== "string") {
      return NextResponse.json(
        { error: "area code must be a string" },
        { status: 400 }
      );
    }
    const trimmed = body.areaCode.trim();
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "area code cannot be empty" },
        { status: 400 }
      );
    }
    if (!isValidAreaCode(trimmed)) {
      return NextResponse.json(
        { error: "area code must be 3 digits" },
        { status: 400 }
      );
    }
    companyUpdates.areaCode = trimmed;
  }

  if ("notificationPhones" in body) {
    const validated = validateNotificationPhones(body.notificationPhones);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    companyUpdates.notificationPhones = validated.value;
  }

  if ("leadSnapWebhook" in body) {
    if (
      body.leadSnapWebhook !== null &&
      typeof body.leadSnapWebhook !== "string"
    ) {
      return NextResponse.json(
        { error: "leadSnapWebhook must be a string or null" },
        { status: 400 }
      );
    }
    const trimmed =
      typeof body.leadSnapWebhook === "string"
        ? body.leadSnapWebhook.trim()
        : null;
    companyUpdates.leadSnapWebhook = trimmed && trimmed.length > 0 ? trimmed : null;
  }

  if (Object.keys(companyUpdates).length > 0) {
    companyUpdates.updatedAt = new Date();
    await db.update(companies).set(companyUpdates).where(eq(companies.id, id));
  }

  const updated = await db.query.companies.findFirst({
    where: eq(companies.id, id),
    with: { retellNumbers: true, users: true },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getSessionUser();
  if (!currentUser || currentUser.role !== "root") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const company = await db.query.companies.findFirst({
    where: eq(companies.id, id),
  });

  if (!company) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.transaction(async (tx) => {
    await tx.delete(users).where(eq(users.companyId, id));
    await tx.delete(calls).where(eq(calls.companyId, id));
    await tx.delete(companies).where(eq(companies.id, id));
  });

  return NextResponse.json({ success: true });
}
