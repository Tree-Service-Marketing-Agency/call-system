"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarIcon,
  ClockIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PlayIcon,
  SettingsIcon,
  SquareIcon,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  webhook1Received: boolean;
  webhook2Received: boolean;
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

function isAudioExpired(createdAt: string): boolean {
  const created = new Date(createdAt);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return created < thirtyDaysAgo;
}

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatDateTimeFull(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function statusBadge(status: string | null) {
  if (!status) return <Badge variant="outline">Partial</Badge>;
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

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function formatSpeed(rate: number): string {
  return rate === 1 ? "Normal" : `${rate}x`;
}

function InlineAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = playbackRate;
  }, [playbackRate]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      void audio.play();
      setIsPlaying(true);
    }
  }

  function seekFromPointer(clientX: number) {
    const track = trackRef.current;
    const audio = audioRef.current;
    if (!track || !audio || !Number.isFinite(duration) || duration <= 0) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - rect.left) / rect.width),
    );
    const next = ratio * duration;
    audio.currentTime = next;
    setCurrentTime(next);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    wasPlayingRef.current = !audio.paused;
    if (wasPlayingRef.current) audio.pause();
    setIsScrubbing(true);
    seekFromPointer(e.clientX);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbing) return;
    seekFromPointer(e.clientX);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!isScrubbing) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsScrubbing(false);
    const audio = audioRef.current;
    if (audio && wasPlayingRef.current) {
      void audio.play();
      setIsPlaying(true);
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-3.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          if (!isScrubbing) setCurrentTime(e.currentTarget.currentTime);
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />
      <Button
        type="button"
        size="icon"
        variant="default"
        className="size-10 rounded-full"
        onClick={toggle}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <SquareIcon /> : <PlayIcon />}
      </Button>
      <div className="flex flex-1 flex-col gap-1.5">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={duration || 0}
          aria-valuenow={currentTime}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={(e) => {
            const audio = audioRef.current;
            if (!audio || duration <= 0) return;
            const step = e.shiftKey ? 10 : 5;
            if (e.key === "ArrowRight") {
              e.preventDefault();
              const next = Math.min(duration, audio.currentTime + step);
              audio.currentTime = next;
              setCurrentTime(next);
            } else if (e.key === "ArrowLeft") {
              e.preventDefault();
              const next = Math.max(0, audio.currentTime - step);
              audio.currentTime = next;
              setCurrentTime(next);
            }
          }}
          className={cn(
            "group relative flex h-4 cursor-pointer items-center touch-none select-none",
            "focus-visible:outline-none",
            duration <= 0 && "pointer-events-none opacity-60",
          )}
        >
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={cn(
                "absolute inset-y-0 left-0 bg-primary",
                !isScrubbing && "transition-[width] duration-100",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className={cn(
              "absolute size-3 -translate-x-1/2 rounded-full bg-primary shadow ring-2 ring-background",
              "opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
              isScrubbing && "opacity-100",
            )}
            style={{ left: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <div className="flex items-center gap-1">
            <span>{formatTime(duration)}</span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Playback speed ${formatSpeed(playbackRate)}`}
                    className="size-6 text-muted-foreground hover:text-foreground"
                  >
                    <SettingsIcon />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="min-w-[7rem]">
                <DropdownMenuRadioGroup
                  value={String(playbackRate)}
                  onValueChange={(value) => setPlaybackRate(Number(value))}
                >
                  {PLAYBACK_SPEEDS.map((speed) => (
                    <DropdownMenuRadioItem
                      key={speed}
                      value={String(speed)}
                      className="font-sans"
                    >
                      {formatSpeed(speed)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
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
  const [call, setCall] = useState<CallDetail | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/calls/${callId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setCall(data);
      });
    return () => {
      cancelled = true;
    };
  }, [callId]);

  // Reset content when sheet closes (avoids the previous record flashing on
  // next open).
  useEffect(() => {
    if (!callId && call) {
      const t = setTimeout(() => {
        setCall(null);
        setError(null);
      }, 150);
      return () => clearTimeout(t);
    }
  }, [callId, call]);

  async function mutateBilling(action: "void" | "restore") {
    if (!callId) return;
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

  return (
    <Sheet open={!!callId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        className="flex w-full flex-col gap-0 bg-card p-0 sm:max-w-[560px]"
      >
        <SheetTitle className="sr-only">Call details</SheetTitle>
        <SheetDescription className="sr-only">
          {call?.callId ?? "Call details"}
        </SheetDescription>

        {!call ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : (
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
              <div className="font-mono text-[11px] text-muted-foreground-2">
                {call.callId}
              </div>
            </div>

            {/* Audio */}
            {call.audioUrl ? (
              audioAvailable ? (
                <InlineAudioPlayer src={call.audioUrl} />
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
        )}
      </SheetContent>
    </Sheet>
  );
}
