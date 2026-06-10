export const BILLABLE_DISCONNECTION_REASONS = [
  "user_hangup",
  "agent_hangup",
] as const;

export function isBillableDisconnection(
  disconnectionReason: string | null | undefined
): boolean {
  if (!disconnectionReason) return false;
  return (BILLABLE_DISCONNECTION_REASONS as readonly string[]).includes(
    disconnectionReason
  );
}
