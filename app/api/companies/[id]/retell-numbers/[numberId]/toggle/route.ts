import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { retellNumbers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import {
  enableAgentOnNumber,
  disableAgentOnNumber,
} from "@/lib/retell-client";

// Live toggle (root only). Write-through: Retell is the source of truth —
// the DB flag is only persisted after Retell confirms, so `enabled` never
// claims a routing state Retell doesn't have.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; numberId: string }> }
) {
  const auth = await requireRole("root");
  if (!auth.ok) return auth.response;

  const { id, numberId } = await params;
  const row = await db.query.retellNumbers.findFirst({
    where: and(
      eq(retellNumbers.id, numberId),
      eq(retellNumbers.companyId, id)
    ),
  });
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: unknown;
  };
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled must be a boolean" },
      { status: 400 }
    );
  }

  if (!row.phoneNumber) {
    return NextResponse.json(
      { error: "phone number required to toggle" },
      { status: 400 }
    );
  }

  const result = body.enabled
    ? await enableAgentOnNumber(row.phoneNumber, row.agentId)
    : await disableAgentOnNumber(row.phoneNumber);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const [updated] = await db
    .update(retellNumbers)
    .set({ enabled: body.enabled, updatedAt: new Date() })
    .where(eq(retellNumbers.id, numberId))
    .returning();

  return NextResponse.json(updated);
}
