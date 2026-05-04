"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
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
import { AudioPlayer } from "@/components/ui/audio-player";
import { ExternalLinkIcon } from "lucide-react";
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
  createdAt: string;
  webhook1Received: boolean;
  webhook2Received: boolean;
  companyName: string | null;
  billing: {
    state: BillingState;
    ledgerStatus: LedgerStatus | null;
    amountCents: number | null;
    invoiceUrl: string | null;
    voidedAt: string | null;
    voidedByEmail: string | null;
    canVoid: boolean;
    canRestore: boolean;
  };
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
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
    if (!callId) {
      setCall(null);
      setError(null);
      return;
    }
    fetch(`/api/calls/${callId}`)
      .then((res) => res.json())
      .then(setCall);
  }, [callId]);

  async function mutate(action: "void" | "restore") {
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
        r.json()
      );
      setCall(refreshed);
      onMutated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={!!callId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Call Details</SheetTitle>
          <SheetDescription>{call?.callId ?? "Loading..."}</SheetDescription>
        </SheetHeader>
        {call && (
          <Tabs defaultValue="call" className="px-4">
            <TabsList>
              <TabsTrigger value="call">Call</TabsTrigger>
              <TabsTrigger value="billing">Billing</TabsTrigger>
            </TabsList>

            <TabsContent value="call">
              <div className="flex flex-col gap-4 pt-4">
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
                <DetailRow
                  label="Duration"
                  value={formatDuration(call.durationMs)}
                />
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
            </TabsContent>

            <TabsContent value="billing">
              <div className="flex flex-col gap-4 pt-4">
                <DetailRow
                  label="Status"
                  value={
                    <Badge
                      variant={billingStateBadgeVariant(call.billing.state)}
                    >
                      {call.billing.state}
                    </Badge>
                  }
                />
                <DetailRow
                  label="Amount"
                  value={formatCents(call.billing.amountCents)}
                />
                {call.billing.state === "Charged" &&
                  call.billing.invoiceUrl && (
                    <DetailRow
                      label="Invoice"
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
                    <DetailRow
                      label="Voided by"
                      value={call.billing.voidedByEmail ?? "—"}
                    />
                    <DetailRow
                      label="Voided at"
                      value={formatDateTime(call.billing.voidedAt)}
                    />
                  </>
                )}

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

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
                          This call won&apos;t be charged on the next billing
                          run. {formatCents(call.billing.amountCents)} will be
                          removed from {call.companyName ?? "the company"}
                          &apos;s pending balance. You can restore it later if
                          needed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => mutate("void")}
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
                          {call.companyName ?? "the company"}&apos;s pending
                          balance ({formatCents(call.billing.amountCents)}) and
                          included in the next billing run.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => mutate("restore")}>
                          Restore as billable
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}
