import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";
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

  const isPasswordReset = body.password !== undefined;
  const isSelf = targetUser.id === currentUser.id;
  const hasNonPasswordUpdate =
    body.email !== undefined ||
    body.isActive !== undefined ||
    body.role !== undefined;
  const canResetAgencyPassword =
    currentUser.role === "root" &&
    (targetUser.role === "admin" || (targetUser.role === "root" && isSelf));

  if (isPasswordReset && !canResetAgencyPassword) {
    return NextResponse.json(
      { error: "Only root can reset admin passwords or their own password" },
      { status: 403 },
    );
  }

  if (isPasswordReset && hasNonPasswordUpdate) {
    return NextResponse.json(
      { error: "Password reset cannot be combined with other updates" },
      { status: 400 },
    );
  }

  if (targetUser.role === "root" && !isPasswordReset) {
    return NextResponse.json(
      { error: "Cannot modify root user" },
      { status: 403 },
    );
  }

  if (targetUser.role === "admin" && currentUser.role !== "root") {
    return NextResponse.json(
      { error: "Only root can modify agency users" },
      { status: 403 },
    );
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
  if (isPasswordReset) {
    if (typeof body.password !== "string" || body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }

    updates.password = await bcryptjs.hash(body.password, 10);
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

  if (targetUser.role === "admin" && currentUser.role !== "root") {
    return NextResponse.json(
      { error: "Only root can delete agency users" },
      { status: 403 },
    );
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
