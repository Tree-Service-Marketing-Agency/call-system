"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
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
import {
  billingStateBadgeVariant,
  deriveBillingState,
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
   * Render the page header. Off when embedded inside another page (e.g. the
   * company detail tabs), where the parent already owns the header.
   */
  showHeader?: boolean;
}

export function CallsClient({
  user,
  companyId: scopedCompanyId,
  showHeader = true,
}: CallsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isScoped = Boolean(scopedCompanyId);

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
  const showCompanyColumn = isAgency && !isScoped;
  // ADR-003: Real Cost (Retell) is agency-only.
  const showRealCostColumn = isAgency;
  const pageSize = 15;
  const isFirstSyncRef = useRef(true);

  const fetchCalls = (qs: URLSearchParams) => {
    fetch(`/api/calls?${qs.toString()}`)
      .then((res) => res.json())
      .then((data: CallsResponse) => {
        setCalls(data.data);
        setTotal(data.total);
      });
  };

  const buildFetchParams = () => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    if (companyId) params.set("companyId", companyId);
    if (billing) params.set("billing", billing);
    if (search) params.set("q", search);
    return params;
  };

  const buildUrlParams = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (page !== 1) params.set("page", page.toString());
    else params.delete("page");
    if (!isScoped && companyId) params.set("companyId", companyId);
    else if (!isScoped) params.delete("companyId");
    if (billing) params.set("billing", billing);
    else params.delete("billing");
    if (search) params.set("q", search);
    else params.delete("q");
    return params;
  };

  useEffect(() => {
    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      fetchCalls(buildFetchParams());
      return;
    }

    const handle = setTimeout(() => {
      const params = buildUrlParams();
      const next = params.toString();
      const url = next ? `${pathname}?${next}` : pathname;
      router.replace(url, { scroll: false });
      fetchCalls(buildFetchParams());
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, billing, companyId]);

  const filteredCalls = search
    ? calls.filter((c) => {
        const q = search.toLowerCase();
        return (
          (c.customerName?.toLowerCase().includes(q) ?? false) ||
          (c.customerPhone?.toLowerCase().includes(q) ?? false) ||
          (c.companyName?.toLowerCase().includes(q) ?? false)
        );
      })
    : calls;

  const body = (
    <>
        <FilterBar
          search={{
            value: search,
            onChange: (v) => {
              setSearch(v);
              setPage(1);
            },
            placeholder: "Search by name, phone or company…",
          }}
          filters={
            <>
              {isAgency && !isScoped && (
                <CompanyFilter
                  value={filterCompanyId}
                  onChange={(v) => {
                    setFilterCompanyId(v === "all" ? "" : v);
                    setPage(1);
                  }}
                />
              )}
              <Select
                value={billing ?? "all"}
                onValueChange={(v) => {
                  const next = v as string | null;
                  setBilling(
                    !next || next === "all" ? null : (next as BillingFilter),
                  );
                  setPage(1);
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
                <TableHead>Billing</TableHead>
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
                    colSpan={
                      6 +
                      (showCompanyColumn ? 1 : 0) +
                      (showRealCostColumn ? 1 : 0)
                    }
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
                        {call.customerPhone ?? "—"}
                      </TableCell>
                      <TableCell>{statusBadge(call.callStatus)}</TableCell>
                      <TableCell>
                        {billingState ? (
                          <Badge variant={billingStateBadgeVariant(billingState)}>
                            {billingState}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
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
          </Table>
          <DataTablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            itemLabel="calls"
            onPageChange={setPage}
          />
        </div>

        <CallDetailSheet
          callId={selectedCallId}
          onClose={() => setSelectedCallId(null)}
          onMutated={() => fetchCalls(buildFetchParams())}
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
