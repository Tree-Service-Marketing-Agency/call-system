export type BillingState =
  | "Pending"
  | "Charged"
  | "Marked non-billable"
  | "Not billable"
  | "Partial";

export type LedgerStatus = "pending" | "reserved" | "paid" | "void";

export function deriveBillingState(input: {
  webhook2Received: boolean;
  ledgerStatus: LedgerStatus | null;
}): BillingState {
  if (!input.webhook2Received) return "Partial";
  if (input.ledgerStatus === null) return "Not billable";
  if (input.ledgerStatus === "void") return "Marked non-billable";
  if (input.ledgerStatus === "paid") return "Charged";
  return "Pending";
}

export function billingStateBadgeVariant(
  state: BillingState
): "default" | "secondary" | "destructive" | "outline" {
  switch (state) {
    case "Pending":
      return "secondary";
    case "Charged":
      return "default";
    case "Marked non-billable":
      return "destructive";
    case "Not billable":
    case "Partial":
      return "outline";
  }
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
