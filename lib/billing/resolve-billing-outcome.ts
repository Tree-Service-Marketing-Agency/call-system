import { isBillableDisconnection } from "@/lib/billing/rules";

/**
 * Billing decision for an incoming `call_ended` call.
 *
 * - `no_ledger`: no Ledger entry at all (Billing cell stays `—`).
 * - `void`:      Ledger entry inserted directly as `void` (badge
 *                "Marked non-billable", balance untouched).
 * - `pending`:   normal billable flow (insert `pending`, +balance).
 */
export type BillingOutcome = "no_ledger" | "void" | "pending";

export interface ResolveBillingOutcomeInput {
  disconnectionReason: string | null | undefined;
  companyId: string | null | undefined;
  durationMs: number | null | undefined;
  /** business_config.min_billable_duration_seconds. 0 disables the rule. */
  minBillableSeconds: number;
}

/**
 * Pure resolver for the ADR-007 billing precedence. No DB, no side effects.
 *
 * Precedence (fixed by ADR-007):
 *   1. disconnection_reason not billable  → `no_ledger`
 *   2. no company resolved                → `no_ledger`
 *   3. duration_ms < threshold (strict)   → `void`   (auto short-call exclusion)
 *   4. otherwise                          → `pending`
 *
 * Threshold semantics:
 *   - Strict comparison: a call of exactly `minBillableSeconds` is billable.
 *   - `durationMs` null/undefined ⇒ not filtered (fail-open: a missing
 *     duration must never cost legitimate revenue).
 *   - `minBillableSeconds === 0` ⇒ the rule never marks a call short.
 */
export function resolveBillingOutcome(
  input: ResolveBillingOutcomeInput
): BillingOutcome {
  const { disconnectionReason, companyId, durationMs, minBillableSeconds } =
    input;

  if (!isBillableDisconnection(disconnectionReason)) return "no_ledger";
  if (!companyId) return "no_ledger";

  if (
    minBillableSeconds > 0 &&
    durationMs != null &&
    durationMs < minBillableSeconds * 1000
  ) {
    return "void";
  }

  return "pending";
}
