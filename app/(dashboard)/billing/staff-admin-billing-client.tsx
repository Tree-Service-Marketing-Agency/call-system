"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreditCardIcon } from "lucide-react";
import { CardSetupForm } from "@/components/billing/card-setup-form";

interface InvoiceRow {
  id: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  status: string;
  attemptCount: number;
  hostedInvoiceUrl: string | null;
  entryCount: number;
  createdAt: string;
  paidAt: string | null;
  failedAt: string | null;
}

interface PaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface BillingData {
  scope: "company";
  companyId?: string;
  companyName?: string;
  balanceCents: number;
  thresholdCents: number;
  billingStatus: "idle" | "charging" | "payment_pending" | "uncollectible";
  hasStripeCustomer?: boolean;
  paymentMethod: PaymentMethod | null;
  invoices: InvoiceRow[];
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function statusBadge(status: BillingData["billingStatus"]) {
  switch (status) {
    case "idle":
      return (
        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          Up to date
        </Badge>
      );
    case "charging":
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Processing charge
        </Badge>
      );
    case "payment_pending":
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
          Payment pending
        </Badge>
      );
    case "uncollectible":
      return <Badge variant="destructive">Requires attention</Badge>;
  }
}

function invoiceStatusBadge(status: string) {
  const map: Record<string, { label: string; className?: string; variant?: "destructive" | "secondary" | "outline" }> =
    {
      paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
      pending: { label: "Pending", className: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
      failed: { label: "Failed", className: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
      uncollectible: { label: "Uncollectible", variant: "destructive" },
      creation_failed: { label: "Error", variant: "destructive" },
    };
  const cfg = map[status] ?? { label: status };
  return (
    <Badge className={cfg.className} variant={cfg.variant}>
      {cfg.label}
    </Badge>
  );
}

export function StaffAdminBillingClient() {
  const [data, setData] = useState<BillingData | null>(null);
  const [showCardDialog, setShowCardDialog] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/billing")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function openPortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/billing/customer-portal", {
        method: "POST",
      });
      const json = await res.json();
      if (json.url) {
        window.open(json.url, "_blank");
      }
    } finally {
      setOpeningPortal(false);
    }
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const pct = Math.min(
    100,
    Math.round((data.balanceCents / Math.max(1, data.thresholdCents)) * 100)
  );
  const barColor =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Current balance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-3xl font-bold">{usd(data.balanceCents)}</p>
            <p className="text-xs text-muted-foreground">
              of {usd(data.thresholdCents)} (global threshold)
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Your next charge will be processed automatically when your
              balance reaches the threshold.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Payment method
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.paymentMethod ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <CreditCardIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium uppercase">
                    {data.paymentMethod.brand}
                  </span>
                  <span className="text-muted-foreground">
                    •••• {data.paymentMethod.last4}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Expires {String(data.paymentMethod.expMonth).padStart(2, "0")}/
                  {String(data.paymentMethod.expYear).slice(-2)}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openPortal}
                  disabled={openingPortal}
                >
                  {openingPortal ? "Opening…" : "Update card"}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3">
                <CreditCardIcon className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No payment method
                </p>
                <Button onClick={() => setShowCardDialog(true)}>
                  Add card
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {statusBadge(data.billingStatus)}
            {data.billingStatus === "payment_pending" && (
              <button
                className="text-left text-sm text-blue-600 underline"
                onClick={openPortal}
              >
                Update card
              </button>
            )}
            {data.billingStatus === "uncollectible" && (
              <p className="text-xs text-muted-foreground">
                Contact support to bring the account current.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead># Calls</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    No charges recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                data.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{usd(inv.amountCents)}</TableCell>
                    <TableCell>{invoiceStatusBadge(inv.status)}</TableCell>
                    <TableCell>{inv.entryCount}</TableCell>
                    <TableCell className="text-right">
                      {inv.hostedInvoiceUrl ? (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline"
                        >
                          View invoice
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showCardDialog} onOpenChange={setShowCardDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add payment method</DialogTitle>
          </DialogHeader>
          <CardSetupForm
            onSuccess={() => {
              setShowCardDialog(false);
              refresh();
            }}
            onCancel={() => setShowCardDialog(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
