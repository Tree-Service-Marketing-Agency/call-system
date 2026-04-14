import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getSessionUser();
  if (!currentUser || currentUser.role === "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // staff_admin can only modify users in their company
  if (
    !isAgencyRole(currentUser.role) &&
    targetUser.companyId !== currentUser.companyId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (body.email !== undefined) updates.email = body.email;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.role !== undefined && body.role !== "root" && body.role !== "admin") {
    updates.role = body.role;
  }

  await db.update(users).set(updates).where(eq(users.id, id));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getSessionUser();
  if (!currentUser || currentUser.role === "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const targetUser = await db.query.users.findFirst({
    where: eq(users.id, id),
  });

  if (!targetUser) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (targetUser.role === "root") {
    return NextResponse.json({ error: "Cannot delete root user" }, { status: 400 });
  }

  if (
    !isAgencyRole(currentUser.role) &&
    targetUser.companyId !== currentUser.companyId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(users).where(eq(users.id, id));

  return NextResponse.json({ success: true });
}
