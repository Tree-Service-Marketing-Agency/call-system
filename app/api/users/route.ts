import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";

function generatePassword(length = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (user.role === "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let data;
  if (isAgencyRole(user.role)) {
    data = await db.query.users.findMany({
      columns: { password: false },
    });
  } else {
    // staff_admin can only see users of their company
    data = await db.query.users.findMany({
      where: eq(users.companyId, user.companyId!),
      columns: { password: false },
    });
  }

  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const currentUser = await getSessionUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (currentUser.role === "staff") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { email, role, companyId, password: customPassword } = body;

  if (!email || !role) {
    return NextResponse.json({ error: "email and role are required" }, { status: 400 });
  }

  // Validate role assignment
  if (role === "root" || role === "admin") {
    return NextResponse.json(
      { error: "Cannot create root or admin users" },
      { status: 400 }
    );
  }

  // staff_admin can only create users in their own company
  const targetCompanyId = currentUser.role === "staff_admin"
    ? currentUser.companyId
    : companyId;

  if (!targetCompanyId) {
    return NextResponse.json(
      { error: "companyId is required" },
      { status: 400 }
    );
  }

  const plainPassword = customPassword || generatePassword();
  const hashedPassword = await bcryptjs.hash(plainPassword, 10);

  const [newUser] = await db
    .insert(users)
    .values({
      email,
      password: hashedPassword,
      role,
      companyId: targetCompanyId,
      isActive: true,
    })
    .returning({
      id: users.id,
      email: users.email,
      role: users.role,
      companyId: users.companyId,
      isActive: users.isActive,
    });

  return NextResponse.json(
    { ...newUser, generatedPassword: plainPassword },
    { status: 201 }
  );
}
