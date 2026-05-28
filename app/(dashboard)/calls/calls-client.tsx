"use client";

import { useCallback, useState, useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyFilter } from "@/components/company-filter";
import { CallDetailSheet } from "./call-detail-sheet";
import type { SessionUser } from "@/lib/auth-helpers";
import { formatUsPhone } from "@/lib/phone";
import {
  billingStateBadgeVariant,
  deriveBillingState,
  formatCents,
  type LedgerStatus,
} from "@/lib/billing/state";

type BillingFilter = "pending" | "charged" | "non-billable";

interface CallRow {
  id: string;
  callId: string;
  customerName: string | null;
  customerPhone: string | null;
  callStatus: string | null;
  durationMs: number | null;
  callDate: string | null;
  createdAt: string;
  companyId: string | null;
  companyName: string | null;
  ledgerStatus: LedgerStatus | null;
  // ADR-003: only present for root/admin (gated server-side).
  retellCost?: string | null;
  // Only populated when scoped to an invoice (snapshot per call).
  billingPriceCents?: number | null;
}

interface CallsResponse {
  data: CallRow[];
  total: number;
  page: number;
  pageSize: number;
}

const BILLING_OPTIONS: { value: BillingFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "charged", label: "Charged" },
  { value: "non-billable", label: "Marked non-billable" },
];

const BILLING_VALUES = new Set<BillingFilter>([
  "pending",
  "charged",
  "non-billable",
]);

const FILTER_DEBOUNCE_MS = 250;

function parseBilling(raw: string | null): BillingFilter | null {
  if (!raw) return null;
  const value = raw.trim();
  return BILLING_VALUES.has(value as BillingFilter)
    ? (value as BillingFilter)
    : null;
}

function formatRetellCost(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatDate(call: CallRow): { date: string; time: string } {
  const source = call.callDate ?? call.createdAt;
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) {
    return { date: call.callDate ?? "—", time: "" };
  }
  return {
    date: d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    time: d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const lower = status.toLowerCase();
  if (lower === "completed" || lower === "ended" || lower === "successful")
    return <Badge variant="success">{status}</Badge>;
  if (lower === "failed" || lower === "error")
    return <Badge variant="destructive">{status}</Badge>;
  if (lower === "pending" || lower === "in_progress")
    return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

interface CallsClientProps {
  user: SessionUser;
  /**
   * When set, scopes the calls list to a single company. Hides the
   * CompanyFilter and stops syncing companyId to the URL — the route already
   * implies which company we're looking at.
   */
  companyId?: string;
  /**
   * When set, scopes the calls list to a single invoice (via
   * `billing_ledger.invoiceId`). Hides the Company and Billing filters and
   * columns, adds a Price column, and renders the totals footer from
   * `footerTotals`.
   */
  invoiceId?: string;
  /**
   * Totals shown under the table when `invoiceId` is set. `realCostUsd` is
   * null for company users (ADR-003); it must be passed explicitly so the
   * footer is computed once on the server.
   */
  footerTotals?: {
    realCostUsd: number | null;
    priceCents: number;
  };
  /**
   * Render the page header. Off when embedded inside another page (e.g. the
   * company detail tabs), where the parent already owns the header.
   */
  showHeader?: boolean;
}

export function CallsClient({
  user,
  companyId: scopedCompanyId,
  invoiceId,
  footerTotals,
  showHeader = true,
}: CallsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isScoped = Boolean(scopedCompanyId);
  const isInvoiceScope = Boolean(invoiceId);

  const initialPage = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const initialBilling = parseBilling(searchParams.get("billing"));
  const initialSearch = searchParams.get("q") ?? "";
  const initialFilterCompanyId = searchParams.get("companyId") ?? "";

  const [calls, setCalls] = useState<CallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [filterCompanyId, setFilterCompanyId] = useState<string>(
    initialFilterCompanyId,
  );
  const [billing, setBilling] = useState<BillingFilter | null>(initialBilling);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const companyId = isScoped ? (scopedCompanyId as string) : filterCompanyId;

  const isAgency = user.role === "root" || user.role === "admin";
  const showCompanyColumn = isAgency && !isScoped && !isInvoiceScope;
  // ADR-003: Real Cost (Retell) is agency-only.
  const showRealCostColumn = isAgency;
  // In invoice scope, every row shares the same derived billing state, so the
  // Billing column is dropped and the per-call Price column is added instead.
  const showBillingColumn = !isInvoiceScope;
  const showPriceColumn = isInvoiceScope;
  const pageSize = 15;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCalls = useCallback(
    (filters: {
      page: number;
      search: string;
      billing: BillingFilter | null;
      companyId: string;
    }) => {
      const params = new URLSearchParams();
      params.set("page", filters.page.toString());
      if (invoiceId) params.set("invoiceId", invoiceId);
      if (filters.companyId && !isInvoiceScope)
        params.set("companyId", filters.companyId);
      if (filters.billing && !isInvoiceScope)
        params.set("billing", filters.billing);
      if (filters.search) params.set("q", filters.search);
      fetch(`/api/calls?${params.toString()}`)
        .then((res) => res.json())
        .then((data: CallsResponse) => {
          setCalls(data.data);
          setTotal(data.total);
        });
    },
    [invoiceId, isInvoiceScope],
  );

  const scheduleFetch = useCallback(
    (filters: {
      page: number;
      search: string;
      billing: BillingFilter | null;
      companyId: string;
    }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const urlParams = new URLSearchParams(searchParams.toString());
        if (filters.page !== 1) urlParams.set("page", filters.page.toString());
        else urlParams.delete("page");
        if (!isScoped && !isInvoiceScope && filters.companyId)
          urlParams.set("companyId", filters.companyId);
        else if (!isScoped && !isInvoiceScope) urlParams.delete("companyId");
        if (filters.billing && !isInvoiceScope)
          urlParams.set("billing", filters.billing);
        else urlParams.delete("billing");
        if (filters.search) urlParams.set("q", filters.search);
        else urlParams.delete("q");
        const next = urlParams.toString();
        const url = next ? `${pathname}?${next}` : pathname;
        router.replace(url, { scroll: false });
        fetchCalls(filters);
      }, FILTER_DEBOUNCE_MS);
    },
    [searchParams, isScoped, isInvoiceScope, pathname, router, fetchCalls],
  );

  useMountEffect(() => {
    fetchCalls({ page, search, billing, companyId });
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  });

  const filteredCalls = search
    ? calls.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.customerName?.toLowerCase().includes(q) ?? false) ||
          (c.customerPhone?.toLowerCase().includes(q) ?? false) ||
          (!isInvoiceScope &&
            (c.companyName?.toLowerCase().includes(q) ?? false))
        );
      })
    : calls;

  const colSpan =
    4 + // Customer, Phone, Status, Date
    (showBillingColumn ? 1 : 0) +
    (showPriceColumn ? 1 : 0) +
    (showRealCostColumn ? 1 : 0) +
    1 + // Duration
    (showCompanyColumn ? 1 : 0);

  const body = (
    <>
        <FilterBar
          search={{
            value: search,
            onChange: (v) => {
              setSearch(v);
              setPage(1);
              scheduleFetch({
                page: 1,
                search: v,
                billing,
                companyId,
              });
            },
            placeholder: isInvoiceScope
              ? "Search by name or phone…"
              : "Search by name, phone or company…",
          }}
          filters={
            isInvoiceScope ? null : (
              <>
                {isAgency && !isScoped && (
                  <CompanyFilter
                    value={filterCompanyId}
                    onChange={(v) => {
                      const nextCompanyId = v === "all" ? "" : v;
                      setFilterCompanyId(nextCompanyId);
                      setPage(1);
                      scheduleFetch({
                        page: 1,
                        search,
                        billing,
                        companyId: nextCompanyId,
                      });
                    }}
                  />
                )}
                <Select
                  value={billing ?? "all"}
                  onValueChange={(v) => {
                    const next = v as string | null;
                    const nextBilling =
                      !next || next === "all" ? null : (next as BillingFilter);
                    setBilling(nextBilling);
                    setPage(1);
                    scheduleFetch({
                      page: 1,
                      search,
                      billing: nextBilling,
                      companyId,
                    });
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="All billing states" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="all">All billing states</SelectItem>
                      {BILLING_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </>
            )
          }
        />

        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <AlertCircleIcon className="size-3.5 shrink-0" />
          <span>Call recordings expire after 30 days.</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                {showBillingColumn && <TableHead>Billing</TableHead>}
                {showPriceColumn && (
                  <TableHead className="text-right">Price</TableHead>
                )}
                {showRealCostColumn && (
                  <TableHead className="text-right">Real Cost</TableHead>
                )}
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
                {showCompanyColumn && <TableHead>Company</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCalls.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No calls found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCalls.map((call) => {
                  const { date, time } = formatDate(call);
                  const billingState = deriveBillingState(call.ledgerStatus);
                  return (
                    <TableRow
                      key={call.id}
                      data-state={
                        selectedCallId === call.id ? "selected" : undefined
                      }
                      className="cursor-pointer"
                      onClick={() => setSelectedCallId(call.id)}
                    >
                      <TableCell className="font-medium">
                        {call.customerName ?? (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[12.5px] text-muted-foreground">
                        {call.customerPhone ? formatUsPhone(call.customerPhone) : "—"}
                      </TableCell>
                      <TableCell>{statusBadge(call.callStatus)}</TableCell>
                      {showBillingColumn && (
                        <TableCell>
                          {billingState ? (
                            <Badge variant={billingStateBadgeVariant(billingState)}>
                              {billingState}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      {showPriceColumn && (
                        <TableCell className="text-right tabular-nums">
                          {formatCents(call.billingPriceCents)}
                        </TableCell>
                      )}
                      {showRealCostColumn && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatRetellCost(call.retellCost)}
                        </TableCell>
                      )}
                      <TableCell className="tabular-nums">
                        {formatDuration(call.durationMs)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {date}
                        {time && (
                          <span className="text-muted-foreground-2"> · {time}</span>
                        )}
                      </TableCell>
                      {showCompanyColumn && (
                        <TableCell>{call.companyName ?? "—"}</TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
            {showPriceColumn && footerTotals && (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-right text-muted-foreground">
                    Total
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCents(footerTotals.priceCents)}
                  </TableCell>
                  {showRealCostColumn && (
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {footerTotals.realCostUsd !== null
                        ? `$${footerTotals.realCostUsd.toFixed(2)}`
                        : "—"}
                    </TableCell>
                  )}
                  <TableCell />
                  <TableCell />
                </TableRow>
              </TableFooter>
            )}
          </Table>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            itemLabel="calls"
            onPageChange={(p) => {
              setPage(p);
              scheduleFetch({ page: p, search, billing, companyId });
            }}
          />
        </div>

        <CallDetailSheet
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
          onMutated={() =>
            fetchCalls({ page, search, billing, companyId })
          }
        />
    </>
  );

  if (!showHeader) {
    return body;
  }

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="All inbound calls across your customers' agents."
      />
      <PageBody>{body}</PageBody>
    </>
  );
}
