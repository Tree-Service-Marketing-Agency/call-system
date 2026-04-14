import { NextResponse } from "next/server";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { calls } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ phone: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { phone } = await params;
  const conditions = [eq(calls.customerPhone, decodeURIComponent(phone))];

  if (!isAgencyRole(user.role) && user.companyId) {
    conditions.push(eq(calls.companyId, user.companyId));
  }

  const data = await db
    .select({
      id: calls.id,
      service: calls.service,
      callStatus: calls.callStatus,
      durationMs: calls.durationMs,
      callDate: calls.callDate,
      createdAt: calls.createdAt,
      summary: calls.summary,
    })
    .from(calls)
    .where(and(...conditions))
    .orderBy(desc(calls.createdAt));

  return NextResponse.json({ data });
}
