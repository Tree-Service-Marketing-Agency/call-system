"use client";

import { useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { CalendarIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  costMicroUsd?: number;
}

interface ChatConversation {
  id: string;
  source: "widget" | "playground";
  status: "pending" | "sent";
  createdAt: string;
  lastInteractionAt: string | null;
}

interface ChatDetail {
  showCost: boolean;
  conversation: ChatConversation;
  messages: ChatMessage[];
}

function formatUsd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(4)}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sourceBadge(source: "widget" | "playground") {
  return source === "widget" ? (
    <Badge variant="success">Cliente</Badge>
  ) : (
    <Badge variant="secondary">Playground</Badge>
  );
}

function statusBadge(status: "pending" | "sent") {
  return status === "sent" ? (
    <Badge variant="success">Enviado</Badge>
  ) : (
    <Badge variant="secondary">Pendiente</Badge>
  );
}

export function ChatDetailSheet({
  companyId,
  conversationId,
  onClose,
}: {
  companyId: string;
  conversationId: string | null;
  onClose: () => void;
}) {
  // displayId trails conversationId by ~150ms when closing so the close
  // animation doesn't flash "Loading…" — the previous content stays visible
  // while the sheet slides out.
  const [displayId, setDisplayId] = useState<string | null>(conversationId);
  const [prevId, setPrevId] = useState<string | null>(conversationId);

  if (conversationId !== prevId) {
    setPrevId(conversationId);
    if (conversationId) setDisplayId(conversationId);
  }

  function handleOpenChange(open: boolean) {
    if (open) return;
    onClose();
    const closingId = displayId;
    setTimeout(() => {
      setDisplayId((curr) => (curr === closingId ? null : curr));
    }, 150);
  }

  return (
    <Sheet open={!!conversationId} onOpenChange={handleOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 bg-card p-0 sm:max-w-[560px]">
        <SheetTitle className="sr-only">Detalle del chat</SheetTitle>
        <SheetDescription className="sr-only">
          Detalle del chat
        </SheetDescription>
        {displayId ? (
          <ChatDetailContent
            key={displayId}
            companyId={companyId}
            conversationId={displayId}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Cargando…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChatDetailContent({
  companyId,
  conversationId,
}: {
  companyId: string;
  conversationId: string;
}) {
  const [detail, setDetail] = useState<ChatDetail | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    fetch(`/api/companies/${companyId}/chats/${conversationId}`)
      .then((res) => res.json())
      .then((data: ChatDetail) => {
        if (!cancelled) setDetail(data);
      });
    return () => {
      cancelled = true;
    };
  });

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Cargando…
      </div>
    );
  }

  const { conversation, messages, showCost } = detail;

  return (
    <>
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border px-6 pt-5 pb-4 pr-9">
        <div className="text-[15px] font-semibold tracking-tight text-foreground">
          Conversación
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {sourceBadge(conversation.source)}
          {statusBadge(conversation.status)}
          <Badge
            variant="secondary"
            className="font-normal text-muted-foreground"
          >
            <CalendarIcon />
            {formatDateTime(conversation.createdAt)}
          </Badge>
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Sin mensajes.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-1",
                    isUser ? "items-end" : "items-start",
                  )}
                >
                  <div
                    className={cn(
                      "flex max-w-[85%] flex-col gap-1 rounded-[15px] px-[15px] py-[11px] text-sm",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-card text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-wider",
                        isUser
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {isUser ? "Cliente" : "Asistente"}
                    </span>
                    <p className="whitespace-pre-wrap break-words leading-snug">
                      {message.content}
                    </p>
                  </div>
                  {showCost &&
                    message.role === "assistant" &&
                    message.costMicroUsd !== undefined && (
                      <span className="text-[11px] text-muted-foreground">
                        {formatUsd(message.costMicroUsd)}
                        {message.model && ` · ${message.model}`}
                        {message.promptTokens !== undefined &&
                          message.completionTokens !== undefined &&
                          ` · ${message.promptTokens}+${message.completionTokens} tok`}
                      </span>
                    )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
