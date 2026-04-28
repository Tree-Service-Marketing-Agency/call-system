"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangleIcon,
  CreditCardIcon,
  Eye,
  MoreHorizontalIcon,
  ZapIcon,
  XIcon,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { StatCard, type TrendDirection } from "@/components/dashboard/stat-card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";

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
    deltas: {
      paidCents: number | null;
      paidCount: number | null;
      failedCount: number | null;
    };
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

function formatDelta(
  delta: number | null,
): { label: string; direction: TrendDirection } | null {
  if (delta === null) return null;
  const direction: TrendDirection =
    delta > 0 ? "up" : delta < 0 ? "down" : "neutral";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return {
    label: `${sign}${Math.abs(delta).toFixed(0)}%`,
    direction,
  };
}

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

type StatusMeta = {
  label: string;
  description: string;
  variant: BadgeVariant;
};

const companyStatusMeta: Record<string, StatusMeta> = {
  idle: {
    label: "Idle",
    description:
      "Company is up to date. No pending charges and balance has not reached the threshold.",
    variant: "success",
  },
  charging: {
    label: "Charging",
    description:
      "A charge is currently being processed in Stripe for this company.",
    variant: "secondary",
  },
  payment_pending: {
    label: "Payment pending",
    description:
      "The last charge failed and Stripe is retrying with Smart Retries. May require updating the card.",
    variant: "warning",
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
    variant: "success",
  },
  pending: {
    label: "Pending",
    description: "Invoice issued but not yet confirmed as paid by Stripe.",
    variant: "secondary",
  },
  failed: {
    label: "Failed",
    description:
      "The charge failed. Stripe is automatically retrying with Smart Retries.",
    variant: "warning",
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

const COMPANY_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "idle", label: "Idle" },
  { value: "charging", label: "Charging" },
  { value: "payment_pending", label: "Payment pending" },
  { value: "uncollectible", label: "Uncollectible" },
];

function StatusBadge({
  status,
  meta,
}: {
  status: string;
  meta: Record<string, StatusMeta>;
}) {
  const cfg = meta[status] ?? {
    label: status,
    description: status,
    variant: "outline" as const,
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Badge variant={cfg.variant}>{cfg.label}</Badge>}
      />
      <TooltipContent side="top">{cfg.description}</TooltipContent>
    </Tooltip>
  );
}

interface ThresholdCardProps {
  thresholdCents: number;
  isRoot: boolean;
  onSaved: () => void;
}

function ThresholdCard({ thresholdCents, isRoot, onSaved }: ThresholdCardProps) {
  const initial = (thresholdCents / 100).toFixed(2);
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const dirty = value !== initial;

  async function save() {
    const cents = Math.round(Number(value) * 100);
    if (!Number.isFinite(cents) || cents < 0) return;
    setSaving(true);
    await fetch("/api/business-model", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billingThresholdCents: cents }),
    });
    setSaving(false);
    onSaved();
  }

  async function runCron() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/billing/run-cron", { method: "POST" });
      const json = await res.json();
      setRunResult(
        `${json.invoicesCreated ?? 0} invoices created, ${json.invoicesFailed ?? 0} failed, ${json.candidatesCount ?? 0} candidates.`,
      );
    } catch (err) {
      setRunResult(`Error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setRunning(false);
      setTimeout(onSaved, 500);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="border-b border-border px-5 py-4">
        <div className="text-sm font-semibold tracking-tight">
          Global settings
        </div>
        <div className="text-xs text-muted-foreground">
          Threshold-based billing for usage charges.
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="threshold">Billing threshold</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                $
              </span>
              <Input
                id="threshold"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={!isRoot}
                className="w-36 pl-6 font-mono tabular-nums"
              />
            </div>
            <span className="text-[11px] text-muted-foreground">
              Effective Stripe fee at this threshold: ~
              {effectiveFeePct(Math.round(Number(value || 0) * 100))}%
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isRoot && dirty && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setValue(initial)}
              >
                Cancel
              </Button>
            )}
            {isRoot && (
              <Button
                size="sm"
                onClick={save}
                disabled={!dirty || saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </Button>
            )}
            {isRoot && (
              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="secondary" size="sm" disabled={running}>
                      <ZapIcon data-icon="inline-start" />
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
                      This will process all eligible companies immediately, in
                      addition to the daily 05:00 UTC cron.
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
            )}
          </div>
        </div>
        {runResult && (
          <p className="mt-3 text-sm text-muted-foreground">{runResult}</p>
        )}
      </div>
    </div>
  );
}

interface Props {
  role: "root" | "admin";
}

export function AgencyBillingClient({ role }: Props) {
  const [data, setData] = useState<GlobalBillingData | null>(null);

  const [companySearch, setCompanySearch] = useState("");
  const [companyStatus, setCompanyStatus] = useState<string>("all");
  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(10);

  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(10);

  const refresh = useCallback(() => {
    fetch("/api/billing")
      .then((r) => r.json())
      .then((json: GlobalBillingData) => setData(json));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredCompanies = useMemo(() => {
    if (!data) return [];
    let rows = data.companies;
    if (companyStatus !== "all") {
      rows = rows.filter((c) => c.billingStatus === companyStatus);
    }
    if (companySearch) {
      const q = companySearch.toLowerCase();
      rows = rows.filter((c) => c.name.toLowerCase().includes(q));
    }
    return rows;
  }, [data, companySearch, companyStatus]);

  const filteredInvoices = useMemo(() => {
    if (!data) return [];
    let rows = data.invoices;
    if (paymentStatus !== "all") {
      rows = rows.filter((p) => p.status === paymentStatus);
    }
    if (paymentSearch) {
      const q = paymentSearch.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.companyName?.toLowerCase().includes(q) ||
          p.stripeInvoiceId?.toLowerCase().includes(q),
      );
    }
    return rows;
  }, [data, paymentSearch, paymentStatus]);

  const companyTotal = filteredCompanies.length;
  const companyStart = (companyPage - 1) * companyPageSize;
  const companyPageRows = filteredCompanies.slice(
    companyStart,
    companyStart + companyPageSize,
  );

  const paymentTotal = filteredInvoices.length;
  const paymentStart = (paymentPage - 1) * paymentPageSize;
  const paymentPageRows = filteredInvoices.slice(
    paymentStart,
    paymentStart + paymentPageSize,
  );

  if (!data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const noCardCount = data.companies.filter(
    (c) => !c.hasPaymentMethod && c.billingStatus !== "idle",
  ).length;
  const needsAttention = data.companies.filter(
    (c) => c.billingStatus === "uncollectible" || !c.hasPaymentMethod,
  ).length;

  const paidDelta = formatDelta(data.stats.deltas.paidCents);
  const paidCountDelta = formatDelta(data.stats.deltas.paidCount);
  const failedDelta = formatDelta(data.stats.deltas.failedCount);

  return (
    <TooltipProvider>
      <StatsGrid>
        <StatCard
          label="Charged this month"
          value={usd(data.stats.paidCentsThisMonth)}
          trend={paidDelta?.label}
          trendDirection={paidDelta?.direction}
          comparison={paidDelta ? "vs last month" : undefined}
        />
        <StatCard
          label="Invoices paid"
          value={data.stats.paidCountThisMonth.toLocaleString()}
          trend={paidCountDelta?.label}
          trendDirection={paidCountDelta?.direction}
          comparison={paidCountDelta ? "vs last month" : undefined}
        />
        <StatCard
          label="Invoices failed"
          value={data.stats.failedCountThisMonth.toLocaleString()}
          trend={failedDelta?.label}
          trendDirection={
            failedDelta
              ? failedDelta.direction === "up"
                ? "down"
                : failedDelta.direction === "down"
                  ? "up"
                  : "neutral"
              : "neutral"
          }
          comparison={failedDelta ? "vs last month" : undefined}
        />
        <StatCard
          label="Uncollectible"
          value={data.stats.uncollectibleCompanies.toLocaleString()}
        />
      </StatsGrid>

      <ThresholdCard
        thresholdCents={data.thresholdCents}
        isRoot={role === "root"}
        onSaved={refresh}
      />

      {/* Companies table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">
              Companies
            </div>
            <div className="text-xs text-muted-foreground">
              {data.companies.length.toLocaleString()} companies
              {needsAttention > 0
                ? ` · ${needsAttention} need${needsAttention === 1 ? "s" : ""} attention`
                : ""}
              {noCardCount > 0 ? ` · ${noCardCount} without card` : ""}
            </div>
          </div>
          <FilterBar
            className="w-auto"
            search={{
              value: companySearch,
              onChange: (v) => {
                setCompanySearch(v);
                setCompanyPage(1);
              },
              placeholder: "Search companies…",
            }}
            filters={
              <Select
                value={companyStatus}
                onValueChange={(v) => {
                  setCompanyStatus(v ?? "all");
                  setCompanyPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Company</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last invoice</TableHead>
              <TableHead>Card</TableHead>
              <TableHead className="w-[60px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {companyPageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No companies found
                </TableCell>
              </TableRow>
            ) : (
              companyPageRows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.name} size="sm" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="font-medium leading-tight">
                          {c.name}
                        </span>
                        {!c.hasPaymentMethod &&
                          c.billingStatus !== "idle" && (
                            <span className="flex items-center gap-1 text-[11px] text-destructive">
                              <AlertTriangleIcon className="size-2.5" />
                              No card on file
                            </span>
                          )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      c.balanceCents > 0 ? "font-medium" : ""
                    }`}
                  >
                    {usd(c.balanceCents)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={c.billingStatus}
                      meta={companyStatusMeta}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.lastInvoice ? (
                      <span>
                        {new Date(c.lastInvoice.createdAt).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" },
                        )}
                        {c.lastInvoice.amountCents != null && (
                          <span className="text-muted-foreground-2">
                            {" "}· {usd(c.lastInvoice.amountCents)}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {c.hasPaymentMethod ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-foreground">
                        <CreditCardIcon className="size-3.5 text-primary" />
                        On file
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-destructive">
                        <XIcon className="size-3.5" />
                        Missing
                      </span>
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
        <DataTablePagination
          page={companyPage}
          pageSize={companyPageSize}
          total={companyTotal}
          itemLabel="companies"
          onPageChange={setCompanyPage}
          onPageSizeChange={(size) => {
            setCompanyPageSize(size);
            setCompanyPage(1);
          }}
        />
      </div>

      {/* Global payment history */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <div className="text-sm font-semibold tracking-tight">
              Global payment history
            </div>
            <div className="text-xs text-muted-foreground">
              {data.invoices.length.toLocaleString()} payments across all
              companies
            </div>
          </div>
          <FilterBar
            className="w-auto"
            search={{
              value: paymentSearch,
              onChange: (v) => {
                setPaymentSearch(v);
                setPaymentPage(1);
              },
              placeholder: "Search payments…",
            }}
            filters={
              <Select
                value={paymentStatus}
                onValueChange={(v) => {
                  setPaymentStatus(v ?? "all");
                  setPaymentPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[140px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="uncollectible">Uncollectible</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Company</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Attempts</TableHead>
              <TableHead className="w-[60px] text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paymentPageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  No payments recorded
                </TableCell>
              </TableRow>
            ) : (
              paymentPageRows.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {new Date(inv.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>{inv.companyName ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {usd(inv.amountCents)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      status={inv.status}
                      meta={invoiceStatusMeta}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {inv.attemptCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.hostedInvoiceUrl ? (
                      <a
                        href={inv.hostedInvoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="View invoice in Stripe"
                      >
                        <Button variant="ghost" size="icon-sm">
                          <MoreHorizontalIcon />
                        </Button>
                      </a>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled
                        aria-label="No external link"
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <DataTablePagination
          page={paymentPage}
          pageSize={paymentPageSize}
          total={paymentTotal}
          itemLabel="payments"
          onPageChange={setPaymentPage}
          onPageSizeChange={(size) => {
            setPaymentPageSize(size);
            setPaymentPage(1);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
