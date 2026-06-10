import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { retellNumbers } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { normalizeUsPhone } from "@/lib/phone";

// DB-only edits. Live enable/disable goes through ./toggle, which is the
// only path that talks to the Retell API.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; numberId: string }> }
) {
  const auth = await requireRole("root", "admin");
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
    agentId?: unknown;
    phoneNumber?: unknown;
  };

  const updates: { agentId?: string; phoneNumber?: string | null } = {};

  if ("agentId" in body) {
    if (typeof body.agentId !== "string" || body.agentId.trim().length === 0) {
      return NextResponse.json(
        { error: "agentId must be a non-empty string" },
        { status: 400 }
      );
    }
    updates.agentId = body.agentId.trim();
  }

  if ("phoneNumber" in body) {
    if (body.phoneNumber !== null && typeof body.phoneNumber !== "string") {
      return NextResponse.json(
        { error: "phoneNumber must be a string or null" },
        { status: 400 }
      );
    }
    const trimmed =
      typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    if (trimmed.length === 0) {
      updates.phoneNumber = null;
    } else {
      const normalized = normalizeUsPhone(trimmed);
      if (normalized === null) {
        return NextResponse.json(
          { error: "invalid phone number" },
          { status: 400 }
        );
      }
      updates.phoneNumber = normalized;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "nothing to update: provide agentId and/or phoneNumber" },
      { status: 400 }
    );
  }

  if (updates.agentId && updates.agentId !== row.agentId) {
    const conflict = await db.query.retellNumbers.findFirst({
      where: and(
        eq(retellNumbers.agentId, updates.agentId),
        ne(retellNumbers.id, numberId)
      ),
    });
    if (conflict) {
      return NextResponse.json(
        { error: "agentId is already assigned to a retell number" },
        { status: 409 }
      );
    }
  }

  if (updates.phoneNumber && updates.phoneNumber !== row.phoneNumber) {
    const conflict = await db.query.retellNumbers.findFirst({
      where: and(
        eq(retellNumbers.phoneNumber, updates.phoneNumber),
        ne(retellNumbers.id, numberId)
      ),
    });
    if (conflict) {
      return NextResponse.json(
        { error: "phone number is already assigned to a retell number" },
        { status: 409 }
      );
    }
  }

  const [updated] = await db
    .update(retellNumbers)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(retellNumbers.id, numberId))
    .returning();

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; numberId: string }> }
) {
  const auth = await requireRole("root", "admin");
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

  await db.delete(retellNumbers).where(eq(retellNumbers.id, numberId));

  return NextResponse.json({ success: true });
}
