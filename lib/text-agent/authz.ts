import { isAgencyRole, type SessionUser } from "@/lib/auth-helpers";

// Authorization matrix for the Text agent feature (PRD "agents fase 1").

// EDIT the config / USE the playground: agency (any company) or the
// staff_admin of that company. `staff` and others are excluded.
export function canManageTextAgent(
  user: SessionUser,
  companyId: string
): boolean {
  if (isAgencyRole(user.role)) return true;
  return user.role === "staff_admin" && user.companyId === companyId;
}

// VIEW the config / Chats history: agency (any company) or any company user
// (staff_admin or staff) of that company.
export function canViewCompany(
  user: SessionUser,
  companyId: string
): boolean {
  if (isAgencyRole(user.role)) return true;
  return user.companyId === companyId;
}
