/**
 * Single source of truth for whether a Company can be charged with a
 * **Manual company charge** (a Charge run scoped to one company).
 *
 * Pure function — no DB, no Stripe, no React. Both the UI (to paint the
 * per-row charge icon enabled/disabled + its tooltip) and the reasoning shown
 * to the operator derive from here, so the client never diverges from the gate
 * that `chargeOneCompany` re-validates server-side inside its transaction.
 *
 * The gate is exactly the cron's: `billing_status = 'idle'` + card on file +
 * Pending calls count ≥ Billing threshold + Pending balance > 0. There is no
 * bypass of the threshold.
 */

export type ChargeIneligibilityReason =
  | "charging"
  | "payment_pending"
  | "uncollectible"
  | "not_idle"
  | "no_payment_method"
  | "below_threshold"
  | "zero_balance";

export interface CompanyChargeEligibilityInput {
  /** companies.billing_status */
  billingStatus: string;
  /** whether a Stripe payment method is on file */
  hasPaymentMethod: boolean;
  /** Pending calls count (ledger entries in `pending`) */
  pendingCallsCount: number;
  /** business_config.billing_threshold_calls */
  thresholdCalls: number;
  /** Pending balance in cents (companies.current_balance_cents) */
  balanceCents: number;
}

export type CompanyChargeEligibility =
  | { chargeable: true }
  | { chargeable: false; reason: ChargeIneligibilityReason; message: string };

/**
 * Evaluates the Manual company charge gate.
 *
 * Precedence (first failing check wins the tooltip):
 *   1. billing_status must be `idle` (charging / payment_pending /
 *      uncollectible / anything else → not eligible, with a specific reason).
 *   2. card on file.
 *   3. Pending calls count ≥ Billing threshold (strict `>=`; equal is enough).
 *   4. Pending balance > 0.
 */
export function evaluateCompanyChargeEligibility(
  input: CompanyChargeEligibilityInput
): CompanyChargeEligibility {
  const {
    billingStatus,
    hasPaymentMethod,
    pendingCallsCount,
    thresholdCalls,
    balanceCents,
  } = input;

  if (billingStatus !== "idle") {
    if (billingStatus === "charging") {
      return {
        chargeable: false,
        reason: "charging",
        message: "A charge is already in progress for this company.",
      };
    }
    if (billingStatus === "payment_pending") {
      return {
        chargeable: false,
        reason: "payment_pending",
        message:
          "The last charge failed; resolve the payment issue before charging again.",
      };
    }
    if (billingStatus === "uncollectible") {
      return {
        chargeable: false,
        reason: "uncollectible",
        message: "Account is uncollectible; manual intervention is required.",
      };
    }
    return {
      chargeable: false,
      reason: "not_idle",
      message: "Company is not ready to be charged.",
    };
  }

  if (!hasPaymentMethod) {
    return {
      chargeable: false,
      reason: "no_payment_method",
      message: "No card on file.",
    };
  }

  if (pendingCallsCount < thresholdCalls) {
    const remaining = thresholdCalls - pendingCallsCount;
    return {
      chargeable: false,
      reason: "below_threshold",
      message: `${remaining} more call${
        remaining === 1 ? "" : "s"
      } needed to reach the billing threshold.`,
    };
  }

  if (balanceCents <= 0) {
    return {
      chargeable: false,
      reason: "zero_balance",
      message: "No pending balance to charge.",
    };
  }

  return { chargeable: true };
}
