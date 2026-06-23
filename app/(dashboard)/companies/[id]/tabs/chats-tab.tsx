"use client";

import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionUser } from "@/lib/auth-helpers";
import { ChatDetailSheet } from "./chat-detail-sheet";

type ChatSource = "widget" | "playground";
type ChatStatus = "pending" | "sent";

interface ChatRow {
  id: string;
  source: ChatSource;
  status: ChatStatus;
  createdAt: string;
  lastInteractionAt: string | null;
  messageCount: number;
  preview: { role: "user" | "assistant"; content: string } | null;
  totalCostMicroUsd?: number;
}

interface ChatsResponse {
  showCost: boolean;
  data: ChatRow[];
}

type OriginFilter = "all" | "widget" | "playground";

function formatUsd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

function formatDate(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
  };
}

function sourceBadge(source: ChatSource) {
  return source === "widget" ? (
    <Badge variant="success">Cliente</Badge>
  ) : (
    <Badge variant="secondary">Playground</Badge>
  );
}

function statusBadge(status: ChatStatus) {
  return status === "sent" ? (
    <Badge variant="success">Enviado</Badge>
  ) : (
    <Badge variant="secondary">Pendiente</Badge>
  );
}

export function ChatsTab({
  companyId,
}: {
  companyId: string;
  user: SessionUser;
}) {
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [showCost, setShowCost] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    fetch(`/api/companies/${companyId}/chats`)
      .then((res) => res.json())
      .then((data: ChatsResponse) => {
        if (cancelled) return;
        setRows(data.data);
        setShowCost(data.showCost);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  });

  const counts = {
    all: rows.length,
    widget: rows.filter((r) => r.source === "widget").length,
    playground: rows.filter((r) => r.source === "playground").length,
  };

  const filteredRows =
    origin === "all" ? rows : rows.filter((r) => r.source === origin);

  const colSpan = 5 + (showCost ? 1 : 0);

  if (!loaded) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Select
          value={origin}
          onValueChange={(v) => {
            if (typeof v === "string") setOrigin(v as OriginFilter);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Todas ({counts.all})</SelectItem>
              <SelectItem value="widget">
                Cliente ({counts.widget})
              </SelectItem>
              <SelectItem value="playground">
                Playground ({counts.playground})
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Origen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Mensajes</TableHead>
              <TableHead>Vista previa</TableHead>
              {showCost && (
                <TableHead className="text-right">Costo</TableHead>
              )}
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colSpan}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  Sin chats todavía
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const { date, time } = formatDate(
                  row.lastInteractionAt ?? row.createdAt,
                );
                return (
                  <TableRow
                    key={row.id}
                    data-state={
                      selectedId === row.id ? "selected" : undefined
                    }
                    className="cursor-pointer"
                    onClick={() => setSelectedId(row.id)}
                  >
                    <TableCell>{sourceBadge(row.source)}</TableCell>
                    <TableCell>{statusBadge(row.status)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.messageCount}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate text-muted-foreground">
                      {row.preview ? (
                        <>
                          <span className="text-foreground">
                            {row.preview.role === "user"
                              ? "Cliente"
                              : "Asistente"}
                            :
                          </span>{" "}
                          {row.preview.content}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    {showCost && (
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.totalCostMicroUsd !== undefined
                          ? formatUsd(row.totalCostMicroUsd)
                          : "—"}
                      </TableCell>
                    )}
                    <TableCell className="tabular-nums text-muted-foreground">
                      {date}
                      {time && (
                        <span className="text-muted-foreground-2">
                          {" "}
                          · {time}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ChatDetailSheet
        companyId={companyId}
        conversationId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
