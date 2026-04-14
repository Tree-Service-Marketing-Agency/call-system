"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface CallRow {
  id: string;
  service: string | null;
  callStatus: string | null;
  durationMs: number | null;
  callDate: string | null;
  createdAt: string;
  summary: string | null;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function CustomerCallsExpanded({ phone }: { phone: string }) {
  const [callsList, setCallsList] = useState<CallRow[]>([]);

  useEffect(() => {
    fetch(`/api/customers/${encodeURIComponent(phone)}/calls`)
      .then((res) => res.json())
      .then((data) => setCallsList(data.data ?? []));
  }, [phone]);

  return (
    <div className="p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Summary</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {callsList.map((call) => (
            <TableRow key={call.id}>
              <TableCell>{call.service ?? "—"}</TableCell>
              <TableCell>
                {call.callStatus ? (
                  <Badge variant="secondary">{call.callStatus}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{formatDuration(call.durationMs)}</TableCell>
              <TableCell>
                {call.callDate ?? new Date(call.createdAt).toLocaleDateString()}
              </TableCell>
              <TableCell className="max-w-xs truncate">
                {call.summary ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
