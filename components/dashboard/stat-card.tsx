import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TrendDirection = "up" | "down" | "neutral";

interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  trend?: React.ReactNode;
  trendDirection?: TrendDirection;
  comparison?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  trend,
  trendDirection = "neutral",
  comparison,
  className,
}: StatCardProps) {
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex min-h-[132px] flex-col gap-3 px-6 py-5",
        className,
      )}
    >
      <div className="text-[11px] font-medium uppercase leading-none tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-auto text-3xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {(trend || comparison) && (
        <div className="flex items-center gap-1.5 text-xs leading-none">
          {trend && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                trendDirection === "up" && "text-[rgb(14,89,40)] dark:text-[rgb(167,220,192)]",
                trendDirection === "down" && "text-destructive",
                trendDirection === "neutral" && "text-muted-foreground",
              )}
            >
              {trendDirection === "up" && <ArrowUpIcon className="size-3" />}
              {trendDirection === "down" && <ArrowDownIcon className="size-3" />}
              {trend}
            </span>
          )}
          {comparison && (
            <span className="text-muted-foreground-2">{comparison}</span>
          )}
        </div>
      )}
    </div>
  );
}
