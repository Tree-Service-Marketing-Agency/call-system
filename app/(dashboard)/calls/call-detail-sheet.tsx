"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { AudioPlayer } from "@/components/ui/audio-player";

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
  createdAt: string;
  webhook1Received: boolean;
  webhook2Received: boolean;
}

function isAudioExpired(createdAt: string): boolean {
  const created = new Date(createdAt);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return created < thirtyDaysAgo;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
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
    if (!callId) {
      setCall(null);
      return;
    }
    fetch(`/api/calls/${callId}`)
      .then((res) => res.json())
      .then(setCall);
  }, [callId]);

  return (
    <Sheet open={!!callId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Call Details</SheetTitle>
          <SheetDescription>
            {call?.callId ?? "Loading..."}
          </SheetDescription>
        </SheetHeader>
        {call && (
          <div className="flex flex-col gap-4 p-4">
            <DetailRow label="Customer" value={call.customerName} />
            <DetailRow label="Phone" value={call.customerPhone} />
            <DetailRow label="Address" value={call.customerAddress} />
            <DetailRow label="City" value={call.customerCity} />
            <DetailRow label="Zipcode" value={call.customerZipcode} />
            <DetailRow label="Service" value={call.service} />
            <DetailRow label="Summary" value={call.summary} />
            <DetailRow label="Date" value={call.callDate} />
            <DetailRow
              label="Status"
              value={
                call.callStatus ? (
                  <Badge variant="secondary">{call.callStatus}</Badge>
                ) : (
                  <Badge variant="outline">Partial</Badge>
                )
              }
            />
            <DetailRow label="Duration" value={formatDuration(call.durationMs)} />
            {call.audioUrl && (
              <DetailRow
                label="Audio"
                value={
                  isAudioExpired(call.createdAt) ? (
                    <Badge variant="destructive">Expired</Badge>
                  ) : (
                    <AudioPlayer src={call.audioUrl} />
                  )
                }
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
