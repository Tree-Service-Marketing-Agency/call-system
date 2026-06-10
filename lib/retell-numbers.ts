// Pure domain logic for Retell numbers (PRD #41). No I/O — safe to use
// from both API routes and (future) UI.

import type { UserRole } from "@/lib/auth-helpers";

export type RetellStatus = "active" | "partial" | "inactive" | "none";

/**
 * Aggregates a company's per-number `enabled` flags into a single status:
 * all true → active; mixed → partial; all false → inactive; no rows → none.
 */
export function deriveRetellStatus(enabledFlags: boolean[]): RetellStatus {
  if (enabledFlags.length === 0) return "none";
  const enabledCount = enabledFlags.filter(Boolean).length;
  if (enabledCount === enabledFlags.length) return "active";
  if (enabledCount > 0) return "partial";
  return "inactive";
}

export type ToggleEligibility =
  | { allowed: true }
  | { allowed: false; reason: "no_phone" | "not_root" };

/**
 * A Retell number can only be toggled live when it has a phone number
 * (legacy rows may not) and the actor is root.
 */
export function canToggleRetellNumber({
  phoneNumber,
  role,
}: {
  phoneNumber: string | null | undefined;
  role: UserRole;
}): ToggleEligibility {
  if (!phoneNumber || phoneNumber.trim().length === 0) {
    return { allowed: false, reason: "no_phone" };
  }
  if (role !== "root") {
    return { allowed: false, reason: "not_root" };
  }
  return { allowed: true };
}
