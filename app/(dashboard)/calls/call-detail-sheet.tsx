"use client";

import { useEffect, useState } from "react";
import { CalendarIcon, ClockIcon, DownloadIcon, PlayIcon, SquareIcon } from "lucide-react";
import { useRef } from "react";

import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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

function InlineAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [src]);

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

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-6 py-3.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
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
        <div className="relative h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

export function CallDetailSheet({
  callId,
  onClose,
}: {
  callId: string | null;
  onClose: () => void;
}) {
  const [call, setCall] = useState<CallDetail | null>(null);

  useEffect(() => {
    if (!callId) return;
    let cancelled = false;
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
      const t = setTimeout(() => setCall(null), 150);
      return () => clearTimeout(t);
    }
  }, [callId, call]);

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

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-x-5 gap-y-5">
                <DetailField label="Customer" value={call.customerName} />
                <DetailField label="Phone" value={call.customerPhone} mono />
                <DetailField label="Address" value={call.customerAddress} />
                <DetailField label="City" value={call.customerCity} />
                <DetailField label="Zipcode" value={call.customerZipcode} mono />
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
            </div>

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
