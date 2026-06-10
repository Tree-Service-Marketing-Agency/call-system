export type BillingState = "Pending" | "Charged" | "Marked non-billable";

export type LedgerStatus = "pending" | "reserved" | "paid" | "void";

// ADR-006: billing state is purely a function of the ledger. The "Partial"
// state and the webhook2Received input were removed when call_data was
// deprecated — every Call now arrives complete via call_ended.
export function deriveBillingState(
  ledgerStatus: LedgerStatus | null
): BillingState | null {
  if (ledgerStatus === null) return null;
  if (ledgerStatus === "void") return "Marked non-billable";
  if (ledgerStatus === "paid") return "Charged";
  return "Pending";
}

export function billingStateBadgeVariant(
  state: BillingState
): "default" | "secondary" | "destructive" | "outline" | "success" | "warning" {
  switch (state) {
    case "Pending":
      return "warning";
    case "Charged":
      return "success";
    case "Marked non-billable":
      return "destructive";
  }
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}
