"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DollarSignIcon } from "lucide-react";

interface SidebarBillingProps {
  companyId: string;
}

interface BillingSummary {
  balanceCents: number;
  thresholdCents: number;
}

export function SidebarBilling({}: SidebarBillingProps) {
  const [data, setData] = useState<BillingSummary | null>(null);

  useEffect(() => {
    fetch("/api/billing")
      .then((res) => res.json())
      .then((d) => {
        if (typeof d.balanceCents === "number") {
          setData({
            balanceCents: d.balanceCents,
            thresholdCents: d.thresholdCents,
          });
        }
      })
      .catch(() => {});
  }, []);

  const balance = data ? `$${(data.balanceCents / 100).toFixed(2)}` : "—";
  const threshold = data ? `$${(data.thresholdCents / 100).toFixed(2)}` : "";
  const pct = data
    ? Math.min(
        100,
        Math.round((data.balanceCents / Math.max(1, data.thresholdCents)) * 100)
      )
    : 0;
  const barColor =
    pct >= 100
      ? "bg-red-500"
      : pct >= 80
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <Link href="/billing" className="block px-2 py-2 hover:opacity-80">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <DollarSignIcon className="size-4" />
        <span>Outstanding balance</span>
      </div>
      <p className="px-6 text-lg font-semibold">{balance}</p>
      {data && (
        <div className="mx-6 mt-1 flex flex-col gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">of {threshold}</span>
        </div>
      )}
    </Link>
  );
}
