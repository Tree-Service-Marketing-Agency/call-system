import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export type UserRole = "root" | "admin" | "staff_admin" | "staff";

export interface SessionUser {
  id: string;
  role: UserRole;
  companyId: string | null;
  email?: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as SessionUser;
}

export function isAgencyRole(role: UserRole): boolean {
  return role === "root" || role === "admin";
}

export type RequireRoleResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

/**
 * Validates that the current session has one of the allowed roles. Returns
 * either the session user (ok) or a NextResponse the route handler should
 * return immediately (401 unauthenticated, 403 wrong role).
 */
export async function requireRole(
  ...roles: UserRole[]
): Promise<RequireRoleResult> {
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!roles.includes(user.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, user };
}
