"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Eye, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CompanyRow {
  id: string;
  name: string;
  balanceCents: number;
  billingStatus: string;
  hasPaymentMethod: boolean;
  lastInvoice: {
    createdAt: string;
    amountCents: number | null;
    status: string | null;
  } | null;
}

interface InvoiceRow {
  id: string;
  companyId: string;
  companyName: string | null;
  stripeInvoiceId: string | null;
  amountCents: number;
  status: string;
  attemptCount: number;
  hostedInvoiceUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  failedAt: string | null;
}

interface GlobalBillingData {
  scope: "global";
  thresholdCents: number;
  pricePerCallCents: number;
  stats: {
    paidCentsThisMonth: number;
    paidCountThisMonth: number;
    failedCountThisMonth: number;
    uncollectibleCompanies: number;
  };
  companies: CompanyRow[];
  invoices: InvoiceRow[];
}

function usd(cents: number | null | undefined): string {
  return `$${((cents ?? 0) / 100).toFixed(2)}`;
}

function effectiveFeePct(thresholdCents: number): string {
  if (thresholdCents <= 0) return "—";
  const thresholdUsd = thresholdCents / 100;
  const cardFee = thresholdUsd * 0.029 + 0.3;
  const invoicingFee = Math.min(2, thresholdUsd * 0.004);
  const total = cardFee + invoicingFee;
  return ((total / thresholdUsd) * 100).toFixed(1);
}

type StatusMeta = {
  label: string;
  description: string;
  className?: string;
  variant?: "destructive" | "secondary" | "outline";
};

const companyStatusMeta: Record<string, StatusMeta> = {
  idle: {
    label: "Idle",
    description:
      "Company is up to date. No pending charges and balance has not reached the threshold.",
    className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  },
  charging: {
    label: "Charging",
    description:
      "A charge is currently being processed in Stripe for this company.",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  payment_pending: {
    label: "Payment pending",
    description:
      "The last charge failed and Stripe is retrying with Smart Retries. May require updating the card.",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  uncollectible: {
    label: "Uncollectible",
    description:
      "Stripe exhausted all retries without success. Manual intervention is required to bring the account current.",
    variant: "destructive",
  },
};

const invoiceStatusMeta: Record<string, StatusMeta> = {
  paid: {
    label: "Paid",
    description: "Invoice was charged successfully in Stripe.",
    className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100",
  },
  pending: {
    label: "Pending",
    description: "Invoice issued but not yet confirmed as paid by Stripe.",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  },
  failed: {
    label: "Failed",
    description:
      "The charge failed. Stripe is automatically retrying with Smart Retries.",
    className: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  },
  uncollectible: {
    label: "Uncollectible",
    description:
      "Stripe retries were exhausted. The invoice was marked as uncollectible.",
    variant: "destructive",
  },
  creation_failed: {
    label: "Creation failed",
    description:
      "Could not create the invoice in Stripe. Review the logs and re-run the billing process.",
    variant: "destructive",
  },
};

function StatusBadge({
  status,
  meta,
}: {
  status: string;
  meta: Record<string, StatusMeta>;
}) {
  const cfg = meta[status] ?? { label: status, description: status };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge className={cfg.className} variant={cfg.variant}>
            {cfg.label}
          </Badge>
        }
      />
      <TooltipContent side="top">{cfg.description}</TooltipContent>
    </Tooltip>
  );
}

interface Props {
  role: "root" | "admin";
}

export function AgencyBillingClient({ role }: Props) {
  const [data, setData] = useState<GlobalBillingData | null>(null);
  const [thresholdInput, setThresholdInput] = useState("");
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/billing")
      .then((r) => r.json())
      .then((json: GlobalBillingData) => {
        setData(json);
        setThresholdInput((json.thresholdCents / 100).toFixed(2));
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function saveThreshold() {
    const cents = Math.round(Number(thresholdInput) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    setSavingThreshold(true);
    await fetch("/api/business-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingThresholdCents: cents }),
    });
    setSavingThreshold(false);
    refresh();
  }

  async function runCron() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/billing/run-cron", { method: "POST" });
      const json = await res.json();
      setRunResult(
        `Processed: ${json.invoicesCreated ?? 0} invoices created, ${
          json.invoicesFailed ?? 0
        } failed, ${json.candidatesCount ?? 0} candidates.`
      );
    } catch (err) {
      setRunResult(
        `Error: ${err instanceof Error ? err.message : "unknown"}`
      );
    } finally {
      setRunning(false);
      setTimeout(refresh, 500);
    }
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <TooltipProvider>
    <div className="flex flex-col gap-6">
      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Charged this month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {usd(data.stats.paidCentsThisMonth)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Invoices paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data.stats.paidCountThisMonth}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Invoices failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data.stats.failedCountThisMonth}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Uncollectible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data.stats.uncollectibleCompanies}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Root config panel */}
      {role === "root" && (
        <Card>
          <CardHeader>
            <CardTitle>Global settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="flex flex-col gap-2">
                <Label htmlFor="threshold">Billing threshold ($)</Label>
                <Input
                  id="threshold"
                  type="number"
                  step="0.01"
                  min="0"
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  Effective Stripe fee at this threshold: ~
                  {effectiveFeePct(
                    Math.round(Number(thresholdInput || 0) * 100)
                  )}
                  %
                </p>
              </div>
              <div className="flex gap-2">
                <Button onClick={saveThreshold} disabled={savingThreshold}>
                  {savingThreshold ? "Saving…" : "Save"}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button variant="outline" disabled={running}>
                        {running ? "Running…" : "Run billing now"}
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Run the billing process now?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This will process all eligible companies immediately,
                        in addition to the daily 05:00 UTC cron.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={runCron}>
                        Run
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {runResult && (
              <p className="mt-3 text-sm text-muted-foreground">{runResult}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Companies table */}
      <Card>
        <CardHeader>
          <CardTitle>Companies</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last invoice</TableHead>
                <TableHead>Card</TableHead>
                <TableHead className="w-[80px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.companies.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No companies registered
                  </TableCell>
                </TableRow>
              ) : (
                data.companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{usd(c.balanceCents)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={c.billingStatus}
                        meta={companyStatusMeta}
                      />
                    </TableCell>
                    <TableCell>
                      {c.lastInvoice ? (
                        <span className="text-sm">
                          {new Date(c.lastInvoice.createdAt).toLocaleDateString()}{" "}
                          · {usd(c.lastInvoice.amountCents)} ·{" "}
                          {c.lastInvoice.status}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.hasPaymentMethod ? (
                        <Check className="size-4 text-emerald-600" aria-label="Card on file" />
                      ) : (
                        <X className="size-4 text-red-600" aria-label="No card" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/companies/${c.id}`}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View ${c.name}`}
                        >
                          <Eye />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Global invoice history */}
      <Card>
        <CardHeader>
          <CardTitle>Global payment history</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground"
                  >
                    No payments recorded
                  </TableCell>
                </TableRow>
              ) : (
                data.invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      {new Date(inv.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{inv.companyName ?? "—"}</TableCell>
                    <TableCell>{usd(inv.amountCents)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={inv.status}
                        meta={invoiceStatusMeta}
                      />
                    </TableCell>
                    <TableCell>{inv.attemptCount}</TableCell>
                    <TableCell className="text-right">
                      {inv.hostedInvoiceUrl ? (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 underline"
                        >
                          View
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
    </div>
    </TooltipProvider>
  );
}
