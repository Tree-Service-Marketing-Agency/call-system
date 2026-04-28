"use client";

import { useEffect, useState, useCallback } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import { PageBody } from "@/components/layout/page-body";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { StatCard, type TrendDirection } from "@/components/dashboard/stat-card";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";
import { CompanyFilter } from "@/components/company-filter";
import { CallDetailSheet } from "./call-detail-sheet";
import type { SessionUser } from "@/lib/auth-helpers";

type Period = "today" | "7d" | "30d" | "all";

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
}

interface CallsStats {
  total: number;
  avgDurationMs: number;
  completionRate: number;
  customers: number;
  deltas: {
    total: number | null;
    avgDurationMs: number | null;
    completionRate: number | null;
    customers: number | null;
  };
}

interface CallsResponse {
  data: CallRow[];
  total: number;
  page: number;
  pageSize: number;
  period: Period;
  stats: CallsStats;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Today",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

const PERIOD_TOTAL_LABEL: Record<Period, string> = {
  today: "Calls today",
  "7d": "Calls (last 7 days)",
  "30d": "Calls (last 30 days)",
  all: "Total calls",
};

const PERIOD_COMPARISON: Record<Period, string | null> = {
  today: "vs yesterday",
  "7d": "vs previous 7 days",
  "30d": "vs previous 30 days",
  all: null,
};

const PERIODS: Period[] = ["today", "7d", "30d", "all"];

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
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
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [stats, setStats] = useState<CallsStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<Period>("all");
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const isAgency = user.role === "root" || user.role === "admin";
  const pageSize = 15;

  const fetchCalls = useCallback(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      period,
    });
    if (companyFilter && companyFilter !== "all")
      params.set("companyId", companyFilter);

    fetch(`/api/calls?${params}`)
      .then((res) => res.json())
      .then((data: CallsResponse) => {
        setCalls(data.data);
        setTotal(data.total);
        setStats(data.stats);
      });
  }, [page, period, companyFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

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

  const totalDelta = formatDelta(stats?.deltas.total ?? null);
  const durationDelta = formatDelta(stats?.deltas.avgDurationMs ?? null);
  const completionDelta = formatDelta(stats?.deltas.completionRate ?? null);
  const customersDelta = formatDelta(stats?.deltas.customers ?? null);
  const comparisonLabel = PERIOD_COMPARISON[period];

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="All inbound calls across your customers' agents."
        actions={
          <Tabs
            value={period}
            onValueChange={(v) => {
              setPeriod(v as Period);
              setPage(1);
            }}
          >
            <TabsList>
              {PERIODS.map((p) => (
                <TabsTrigger key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <PageBody>
        <StatsGrid>
          <StatCard
            label={PERIOD_TOTAL_LABEL[period]}
            value={stats?.total.toLocaleString() ?? "—"}
            trend={totalDelta?.label}
            trendDirection={totalDelta?.direction}
            comparison={totalDelta ? comparisonLabel : undefined}
          />
          <StatCard
            label="Avg duration"
            value={formatDuration(stats?.avgDurationMs ?? 0)}
            trend={durationDelta?.label}
            trendDirection={durationDelta?.direction}
            comparison={durationDelta ? comparisonLabel : undefined}
          />
          <StatCard
            label="Completion rate"
            value={
              stats ? `${(stats.completionRate * 100).toFixed(0)}%` : "—"
            }
            trend={completionDelta?.label}
            trendDirection={completionDelta?.direction}
            comparison={completionDelta ? comparisonLabel : undefined}
          />
          <StatCard
            label="Unique customers"
            value={stats?.customers.toLocaleString() ?? "—"}
            trend={customersDelta?.label}
            trendDirection={customersDelta?.direction}
            comparison={customersDelta ? comparisonLabel : undefined}
          />
        </StatsGrid>

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
            isAgency ? (
              <CompanyFilter
                value={companyFilter}
                onChange={(v) => {
                  setCompanyFilter(v);
                  setPage(1);
                }}
              />
            ) : null
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
                <TableHead>Duration</TableHead>
                <TableHead>Date</TableHead>
                {isAgency && <TableHead>Company</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCalls.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isAgency ? 6 : 5}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No calls found
                  </TableCell>
                </TableRow>
              ) : (
                filteredCalls.map((call) => {
                  const { date, time } = formatDate(call);
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
        />
      </PageBody>
    </>
  );
}
