"use client";

import { useState } from "react";

import { toast } from "sonner";

import { useMountEffect } from "@/hooks/use-mount-effect";
import {
  CalendarIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { isAudioExpired } from "@/lib/recording";
import { InlineAudioPlayer } from "@/components/calls/inline-audio-player";
import {
  billingStateBadgeVariant,
  formatCents,
  type BillingState,
  type LedgerStatus,
} from "@/lib/billing/state";

interface CallDetail {
  id: string;
  callId: string;
  agentId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerZipcode: string | null;
  customerCity: string | null;
  service: string | null;
  summary: string | null;
  callDate: string | null;
  callStatus: string | null;
  durationMs: number | null;
  audioUrl: string | null;
  companyId: string | null;
  companyName: string | null;
  createdAt: string;
  // ADR-003: only present for root/admin (gated server-side).
  retellCost?: string | null;
  billing: {
    state: BillingState | null;
    ledgerStatus: LedgerStatus | null;
    amountCents: number | null;
    invoiceUrl: string | null;
    voidedAt: string | null;
    voidedByEmail: string | null;
    canVoid: boolean;
    canRestore: boolean;
  };
}

const COMPLETED_STATUSES = new Set(["completed", "ended", "successful"]);
const FAILED_STATUSES = new Set(["failed", "error"]);
const PENDING_STATUSES = new Set(["pending", "in_progress"]);

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatRetellCost(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(4)}`;
}

function formatDateTimeFull(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusBadge(status: string | null) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const lower = status.toLowerCase();
  if (COMPLETED_STATUSES.has(lower))
    return <Badge variant="success">{status}</Badge>;
  if (FAILED_STATUSES.has(lower))
    return <Badge variant="destructive">{status}</Badge>;
  if (PENDING_STATUSES.has(lower))
    return <Badge variant="warning">{status}</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function formatDateTime(call: CallDetail): string {
  const source = call.callDate ?? call.createdAt;
  const d = new Date(source);
  if (Number.isNaN(d.getTime())) return source ?? "—";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DetailField({
  label,
  value,
  mono,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("flex flex-col gap-1", full && "col-span-2")}>
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-sm leading-snug",
          empty ? "text-muted-foreground-2" : "text-foreground",
          mono && "font-mono text-[12.5px]",
        )}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function CopyableId({ label, value }: { label: string; value: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error("Could not copy. Select and copy manually.");
    }
  }

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <span className="min-w-0 break-all font-mono text-muted-foreground-2">
        {value}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className="shrink-0"
      >
        <CopyIcon />
      </Button>
    </div>
  );
}

export function CallDetailSheet({
  callId,
  onClose,
  onMutated,
}: {
  callId: string | null;
  onClose: () => void;
  onMutated?: () => void;
}) {
  // displayId trails callId by ~150ms when closing so the sheet's close
  // animation doesn't flash "Loading…" — instead the previous content stays
  // visible while it slides out. Updated at render time when callId opens to
  // a new value, and via setTimeout (with closure-captured id) when it closes.
  const [displayId, setDisplayId] = useState<string | null>(callId);
  const [prevCallId, setPrevCallId] = useState<string | null>(callId);

  if (callId !== prevCallId) {
    setPrevCallId(callId);
    if (callId) setDisplayId(callId);
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
    <Sheet open={!!callId} onOpenChange={handleOpenChange}>
      <SheetContent
        className="flex w-full flex-col gap-0 bg-card p-0 sm:max-w-[560px]"
      >
        <SheetTitle className="sr-only">Call details</SheetTitle>
        <SheetDescription className="sr-only">Call details</SheetDescription>
        {displayId ? (
          <CallDetailContent
            key={displayId}
            callId={displayId}
            onMutated={onMutated}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CallDetailContent({
  callId,
  onMutated,
}: {
  callId: string;
  onMutated?: () => void;
}) {
  const [call, setCall] = useState<CallDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useMountEffect(() => {
    let cancelled = false;
    fetch(`/api/calls/${callId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCall(data);
      });
    return () => {
      cancelled = true;
    };
  });

  async function mutateBilling(action: "void" | "restore") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/calls/${callId}/billing-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Request failed (${res.status})`);
        return;
      }
      const refreshed = await fetch(`/api/calls/${callId}`).then((r) =>
        r.json(),
      );
      setCall(refreshed);
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  const customer =
    call?.customerName?.trim() ||
    (call?.customerPhone ? "Unknown caller" : "Pending");
  const audioAvailable = Boolean(
    call?.audioUrl && !isAudioExpired(call.createdAt),
  );

  if (!call) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <>
      {/* Header */}
            <div className="flex flex-col gap-3 border-b border-border px-6 pt-5 pb-4">
              <div className="flex items-start gap-3 pr-9">
                <Avatar name={customer} size="lg" />
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="text-[15px] font-semibold tracking-tight text-foreground">
                    {customer}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {call.customerPhone && (
                      <span className="font-mono">{call.customerPhone}</span>
                    )}
                    {call.customerPhone && call.companyName && (
                      <span className="text-muted-foreground-2">·</span>
                    )}
                    {call.companyName && <span>{call.companyName}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {statusBadge(call.callStatus)}
                    {call.billing.state && (
                      <Badge
                        variant={billingStateBadgeVariant(call.billing.state)}
                      >
                        {call.billing.state}
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className="font-normal text-muted-foreground"
                    >
                      <ClockIcon />
                      {formatDuration(call.durationMs)}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="font-normal text-muted-foreground"
                    >
                      <CalendarIcon />
                      {formatDateTime(call)}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <CopyableId label="Internal ID" value={call.id} />
                <CopyableId label="Retell ID" value={call.callId} />
              </div>
            </div>

            {/* Audio */}
            {call.audioUrl ? (
              audioAvailable ? (
                <InlineAudioPlayer key={call.audioUrl} src={call.audioUrl} />
              ) : (
                <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-3 text-xs text-muted-foreground">
                  <Badge variant="destructive">Expired</Badge>
                  Recording is older than 30 days and is no longer available.
                </div>
              )
            ) : null}

            {/* Tabs body */}
            <Tabs
              defaultValue="call"
              className="flex flex-1 flex-col gap-0 overflow-hidden"
            >
              <div className="border-b border-border px-6 pt-3">
                <TabsList variant="line">
                  <TabsTrigger value="call">Call</TabsTrigger>
                  <TabsTrigger value="billing">Billing</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="call"
                className="flex-1 overflow-y-auto px-6 py-5"
              >
                <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                  <DetailField label="Customer" value={call.customerName} />
                  <DetailField label="Phone" value={call.customerPhone} mono />
                  <DetailField label="Address" value={call.customerAddress} />
                  <DetailField label="City" value={call.customerCity} />
                  <DetailField
                    label="Zipcode"
                    value={call.customerZipcode}
                    mono
                  />
                  <DetailField label="Service" value={call.service} />
                  <DetailField
                    label="Date"
                    value={call.callDate ?? formatDateTime(call)}
                  />
                  <DetailField
                    label="Duration"
                    value={formatDuration(call.durationMs)}
                  />
                  <DetailField label="Summary" value={call.summary} full />
                </div>
              </TabsContent>

              <TabsContent
                value="billing"
                className="flex-1 overflow-y-auto px-6 py-5"
              >
                <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                  <DetailField
                    label="Status"
                    value={
                      call.billing.state ? (
                        <Badge
                          variant={billingStateBadgeVariant(call.billing.state)}
                        >
                          {call.billing.state}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )
                    }
                  />
                  <DetailField
                    label="Amount"
                    value={formatCents(call.billing.amountCents)}
                    mono
                  />
                  {call.retellCost !== undefined && (
                    <DetailField
                      label="Real Cost"
                      value={formatRetellCost(call.retellCost)}
                      mono
                    />
                  )}
                  {call.billing.state === "Charged" &&
                    call.billing.invoiceUrl && (
                      <DetailField
                        label="Invoice"
                        full
                        value={
                          <a
                            href={call.billing.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
                          >
                            View invoice
                            <ExternalLinkIcon className="size-3" />
                          </a>
                        }
                      />
                    )}
                  {call.billing.state === "Marked non-billable" && (
                    <>
                      <DetailField
                        label="Voided by"
                        value={call.billing.voidedByEmail}
                      />
                      <DetailField
                        label="Voided at"
                        value={formatDateTimeFull(call.billing.voidedAt)}
                      />
                    </>
                  )}
                </div>

                {error && (
                  <p
                    className="mt-4 text-sm text-destructive"
                    role="alert"
                  >
                    {error}
                  </p>
                )}

                {(call.billing.canVoid || call.billing.canRestore) && (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {call.billing.canVoid && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="destructive" disabled={pending}>
                              Mark as non-billable
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Mark this call as non-billable?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This call won&apos;t be charged on the next
                              billing run.{" "}
                              {formatCents(call.billing.amountCents)} will be
                              removed from {call.companyName ?? "the company"}
                              &apos;s pending balance. You can restore it later
                              if needed.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => mutateBilling("void")}
                            >
                              Mark as non-billable
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {call.billing.canRestore && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="outline" disabled={pending}>
                              Restore as billable
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Restore this call as billable?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This call will be added back to{" "}
                              {call.companyName ?? "the company"}&apos;s
                              pending balance (
                              {formatCents(call.billing.amountCents)}) and
                              included in the next billing run.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => mutateBilling("restore")}
                            >
                              Restore as billable
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* Footer */}
            {audioAvailable && call.audioUrl && (
              <div className="flex items-center justify-end gap-2 border-t border-border bg-card px-6 py-3">
                <Button
                  variant="secondary"
                  size="sm"
                  render={<a href={call.audioUrl} download />}
                >
                  <DownloadIcon data-icon="inline-start" />
                  Download
                </Button>
              </div>
            )}
    </>
  );
}
