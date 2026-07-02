import { describe, it, expect } from "vitest";
import {
  evaluateCompanyChargeEligibility,
  type ChargeIneligibilityReason,
} from "@/lib/billing/company-charge-eligibility";

// Manual company charge gate, verified through observable input → verdict only.
// Gate: billing_status 'idle' + card on file + pending count >= threshold +
// balance > 0. Same gate the cron applies; no bypass.
describe("evaluateCompanyChargeEligibility", () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof evaluateCompanyChargeEligibility>[0];
    expectedChargeable: boolean;
    expectedReason?: ChargeIneligibilityReason;
    expectedMessageIncludes?: string;
  }> = [
    {
      name: "idle + card + count >= threshold + balance > 0 → chargeable",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: true,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: 3000,
      },
      expectedChargeable: true,
    },
    {
      name: "count exactly at threshold → chargeable (boundary, >=)",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: true,
        pendingCallsCount: 25,
        thresholdCalls: 25,
        balanceCents: 2500,
      },
      expectedChargeable: true,
    },
    {
      name: "no card on file → not chargeable (no_payment_method)",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: false,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: 3000,
      },
      expectedChargeable: false,
      expectedReason: "no_payment_method",
    },
    {
      name: "count below threshold → not chargeable (below_threshold, states remaining)",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: true,
        pendingCallsCount: 20,
        thresholdCalls: 25,
        balanceCents: 2000,
      },
      expectedChargeable: false,
      expectedReason: "below_threshold",
      expectedMessageIncludes: "5 more calls",
    },
    {
      name: "one call short → below_threshold with singular copy",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: true,
        pendingCallsCount: 24,
        thresholdCalls: 25,
        balanceCents: 2400,
      },
      expectedChargeable: false,
      expectedReason: "below_threshold",
      expectedMessageIncludes: "1 more call ",
    },
    {
      name: "zero balance → not chargeable (zero_balance)",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: true,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: 0,
      },
      expectedChargeable: false,
      expectedReason: "zero_balance",
    },
    {
      name: "negative balance → not chargeable (zero_balance)",
      input: {
        billingStatus: "idle",
        hasPaymentMethod: true,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: -100,
      },
      expectedChargeable: false,
      expectedReason: "zero_balance",
    },
    {
      name: "already charging → not chargeable (charging)",
      input: {
        billingStatus: "charging",
        hasPaymentMethod: true,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: 3000,
      },
      expectedChargeable: false,
      expectedReason: "charging",
    },
    {
      name: "payment_pending → not chargeable (payment_pending)",
      input: {
        billingStatus: "payment_pending",
        hasPaymentMethod: true,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: 3000,
      },
      expectedChargeable: false,
      expectedReason: "payment_pending",
    },
    {
      name: "uncollectible → not chargeable (uncollectible)",
      input: {
        billingStatus: "uncollectible",
        hasPaymentMethod: true,
        pendingCallsCount: 30,
        thresholdCalls: 25,
        balanceCents: 3000,
      },
      expectedChargeable: false,
      expectedReason: "uncollectible",
    },
    {
      name: "status wins over other failures (charging + no card + below threshold → charging)",
      input: {
        billingStatus: "charging",
        hasPaymentMethod: false,
        pendingCallsCount: 1,
        thresholdCalls: 25,
        balanceCents: 0,
      },
      expectedChargeable: false,
      expectedReason: "charging",
    },
  ];

  for (const {
    name,
    input,
    expectedChargeable,
    expectedReason,
    expectedMessageIncludes,
  } of cases) {
    it(name, () => {
      const result = evaluateCompanyChargeEligibility(input);
      expect(result.chargeable).toBe(expectedChargeable);
      if (!result.chargeable) {
        if (expectedReason) expect(result.reason).toBe(expectedReason);
        if (expectedMessageIncludes)
          expect(result.message).toContain(expectedMessageIncludes);
      }
    });
  }
});
