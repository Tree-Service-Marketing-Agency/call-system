"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  webhook1Received: boolean;
  webhook2Received: boolean;
  ledgerStatus: LedgerStatus | null;
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
  if (!status) return <Badge variant="outline">Partial</Badge>;
  const lower = status.toLowerCase();
  if (lower === "completed" || lower === "ended" || lower === "successful")
    return <Badge variant="success">{status}</Badge>;
  if (lower === "failed" || lower === "error")
    return <Badge variant="destructive">{status}</Badge>;
  if (lower === "pending" || lower === "in_progress")
    return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

export function CallsClient({ user }: { user: SessionUser }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialPage = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const initialCompanyId = searchParams.get("companyId") ?? "";
  const initialBilling = parseBilling(searchParams.get("billing"));
  const initialSearch = searchParams.get("q") ?? "";

  const [calls, setCalls] = useState<CallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [search, setSearch] = useState(initialSearch);
  const [companyId, setCompanyId] = useState<string>(initialCompanyId);
  const [billing, setBilling] = useState<BillingFilter | null>(initialBilling);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);

  const isAgency = user.role === "root" || user.role === "admin";
  const pageSize = 15;
  const isFirstSyncRef = useRef(true);

  const fetchCalls = useCallback(
    (qs: URLSearchParams) => {
      fetch(`/api/calls?${qs.toString()}`)
        .then((res) => res.json())
        .then((data: CallsResponse) => {
          setCalls(data.data);
          setTotal(data.total);
        });
    },
    [],
  );

  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (page !== 1) params.set("page", page.toString());
    if (companyId) params.set("companyId", companyId);
    if (billing) params.set("billing", billing);
    if (search) params.set("q", search);
    return params;
  }, [page, companyId, billing, search]);

  useEffect(() => {
    const params = buildQueryString();

    if (isFirstSyncRef.current) {
      isFirstSyncRef.current = false;
      const fetchParams = new URLSearchParams(params);
      fetchParams.set("page", page.toString());
      fetchCalls(fetchParams);
      return;
    }

    const handle = setTimeout(() => {
      const next = params.toString();
      const url = next ? `${pathname}?${next}` : pathname;
      router.replace(url, { scroll: false });

      const fetchParams = new URLSearchParams(params);
      fetchParams.set("page", page.toString());
      fetchCalls(fetchParams);
    }, FILTER_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [buildQueryString, fetchCalls, page, pathname, router]);

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

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="All inbound calls across your customers' agents."
      />

      <PageBody>
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
              {isAgency && (
                <CompanyFilter
                  value={companyId}
                  onChange={(v) => {
                    setCompanyId(v === "all" ? "" : v);
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
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
                {isAgency && <TableHead>Company</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCalls.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAgency ? 7 : 6}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No calls found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCalls.map((call) => {
                  const { date, time } = formatDate(call);
                  const billingState = deriveBillingState({
                    webhook2Received: call.webhook2Received,
                    ledgerStatus: call.ledgerStatus,
                  });
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
                      <TableCell className="tabular-nums">
                        {formatDuration(call.durationMs)}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {date}
                        {time && (
                          <span className="text-muted-foreground-2"> · {time}</span>
                        )}
                      </TableCell>
                      {isAgency && (
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
          onMutated={() => {
            const fetchParams = buildQueryString();
            fetchParams.set("page", page.toString());
            fetchCalls(fetchParams);
          }}
        />
      </PageBody>
    </>
  );
}
