"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon } from "lucide-react";
import { CallDetailSheet } from "./call-detail-sheet";
import { CompanyFilter } from "@/components/company-filter";
import type { SessionUser } from "@/lib/auth-helpers";

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

interface CallsResponse {
  data: CallRow[];
  total: number;
  page: number;
  pageSize: number;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function CallsClient({ user }: { user: SessionUser }) {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const isAgency = user.role === "root" || user.role === "admin";
  const pageSize = 15;

  const fetchCalls = useCallback(() => {
    const params = new URLSearchParams({ page: page.toString() });
    if (companyFilter) params.set("companyId", companyFilter);

    fetch(`/api/calls?${params}`)
      .then((res) => res.json())
      .then((data: CallsResponse) => {
        setCalls(data.data);
        setTotal(data.total);
      });
  }, [page, companyFilter]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
        <AlertCircleIcon className="size-4 shrink-0" />
        <span>Call recordings expire after 30 days.</span>
      </div>

      {isAgency && (
        <CompanyFilter value={companyFilter} onChange={setCompanyFilter} />
      )}

      <div className="rounded-md border">
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
            {calls.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAgency ? 6 : 5}
                  className="text-center text-muted-foreground"
                >
                  No calls found
                </TableCell>
              </TableRow>
            ) : (
              calls.map((call) => (
                <TableRow
                  key={call.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedCallId(call.id)}
                >
                  <TableCell>
                    {call.customerName ?? (
                      <span className="text-muted-foreground">Pending</span>
                    )}
                  </TableCell>
                  <TableCell>{call.customerPhone ?? "—"}</TableCell>
                  <TableCell>
                    {call.callStatus ? (
                      <Badge variant="secondary">{call.callStatus}</Badge>
                    ) : (
                      <Badge variant="outline">Partial</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatDuration(call.durationMs)}</TableCell>
                  <TableCell>
                    {call.callDate ??
                      new Date(call.createdAt).toLocaleDateString()}
                  </TableCell>
                  {isAgency && (
                    <TableCell>{call.companyName ?? "—"}</TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {calls.length} of {total} calls
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>

      <CallDetailSheet
        callId={selectedCallId}
        onClose={() => setSelectedCallId(null)}
      />
    </div>
  );
}
