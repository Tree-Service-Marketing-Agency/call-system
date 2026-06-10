import { describe, it, expect } from "vitest";
import {
  resolveBillingOutcome,
  type BillingOutcome,
} from "@/lib/billing/resolve-billing-outcome";

// ADR-007 precedence, verified through observable input → outcome only.
// Precedence: disconnection not billable → no_ledger; no company → no_ledger;
// duration < threshold (strict) → void; otherwise → pending.
describe("resolveBillingOutcome", () => {
  const cases: Array<{
    name: string;
    input: Parameters<typeof resolveBillingOutcome>[0];
    expected: BillingOutcome;
  }> = [
    {
      name: "non-billable disconnection → no_ledger (even when short)",
      input: {
        disconnectionReason: "dial_no_answer",
        companyId: "co_1",
        durationMs: 1000,
        minBillableSeconds: 20,
      },
      expected: "no_ledger",
    },
    {
      name: "missing disconnection reason → no_ledger",
      input: {
        disconnectionReason: null,
        companyId: "co_1",
        durationMs: 30000,
        minBillableSeconds: 20,
      },
      expected: "no_ledger",
    },
    {
      name: "no company resolved → no_ledger (even when short)",
      input: {
        disconnectionReason: "user_hangup",
        companyId: null,
        durationMs: 1000,
        minBillableSeconds: 20,
      },
      expected: "no_ledger",
    },
    {
      name: "duration below threshold → void",
      input: {
        disconnectionReason: "user_hangup",
        companyId: "co_1",
        durationMs: 19999,
        minBillableSeconds: 20,
      },
      expected: "void",
    },
    {
      name: "duration exactly at threshold → pending (strict <)",
      input: {
        disconnectionReason: "agent_hangup",
        companyId: "co_1",
        durationMs: 20000,
        minBillableSeconds: 20,
      },
      expected: "pending",
    },
    {
      name: "duration above threshold → pending",
      input: {
        disconnectionReason: "user_hangup",
        companyId: "co_1",
        durationMs: 45000,
        minBillableSeconds: 20,
      },
      expected: "pending",
    },
    {
      name: "duration null → pending (fail-open)",
      input: {
        disconnectionReason: "user_hangup",
        companyId: "co_1",
        durationMs: null,
        minBillableSeconds: 20,
      },
      expected: "pending",
    },
    {
      name: "duration undefined → pending (fail-open)",
      input: {
        disconnectionReason: "user_hangup",
        companyId: "co_1",
        durationMs: undefined,
        minBillableSeconds: 20,
      },
      expected: "pending",
    },
    {
      name: "minBillableSeconds = 0 disables the rule → pending",
      input: {
        disconnectionReason: "user_hangup",
        companyId: "co_1",
        durationMs: 1,
        minBillableSeconds: 0,
      },
      expected: "pending",
    },
    {
      name: "combined short + non-billable disconnection → no_ledger (disconnection wins)",
      input: {
        disconnectionReason: "dial_busy",
        companyId: "co_1",
        durationMs: 500,
        minBillableSeconds: 20,
      },
      expected: "no_ledger",
    },
  ];

  for (const { name, input, expected } of cases) {
    it(name, () => {
      expect(resolveBillingOutcome(input)).toBe(expected);
    });
  }
});
