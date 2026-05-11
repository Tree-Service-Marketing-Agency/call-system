import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { businessConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth-helpers";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "root") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await db.query.businessConfig.findFirst();
  return NextResponse.json({
    pricePerCallCents: config?.pricePerCallCents ?? 100,
    billingThresholdCalls: config?.billingThresholdCalls ?? 25,
    updatedAt: config?.updatedAt ?? null,
  });
}

export async function PUT(request: Request) {
  const user = await getSessionUser();
  if (!user || user.role !== "root") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { pricePerCallCents, billingThresholdCalls } = body;

  const updates: {
    pricePerCallCents?: number;
    billingThresholdCalls?: number;
  } = {};

  if (pricePerCallCents !== undefined) {
    const n = Number(pricePerCallCents);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json(
        { error: "pricePerCallCents must be a non-negative integer" },
        { status: 400 }
      );
    }
    updates.pricePerCallCents = n;
  }

  if (billingThresholdCalls !== undefined) {
    const n = Number(billingThresholdCalls);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json(
        { error: "billingThresholdCalls must be a positive integer" },
        { status: 400 }
      );
    }
    updates.billingThresholdCalls = n;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update" },
      { status: 400 }
    );
  }

  const existing = await db.query.businessConfig.findFirst();

  if (existing) {
    await db
      .update(businessConfig)
      .set({
        ...updates,
        updatedAt: new Date(),
        updatedBy: user.id,
      })
      .where(eq(businessConfig.id, existing.id));
  } else {
    await db.insert(businessConfig).values({
      pricePerCallCents: updates.pricePerCallCents ?? 100,
      billingThresholdCalls: updates.billingThresholdCalls ?? 25,
      updatedBy: user.id,
    });
  }

  return NextResponse.json({ success: true, ...updates });
}
