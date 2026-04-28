import * as React from "react";

import { cn } from "@/lib/utils";

export function StatsGrid({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const items = React.Children.toArray(children);

  return (
    <div
      data-slot="stats-grid"
      className={cn(
        "grid grid-cols-1 overflow-hidden rounded-xl border border-border bg-card shadow-xs sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
      {...props}
    >
      {items.map((child, i) => (
        <div
          key={i}
          className={cn(
            "border-border",
            i < items.length - 1 && "lg:border-r",
            // bottom borders for the responsive wrap
            i < items.length - 2 && "max-lg:border-b sm:max-lg:[&:nth-last-child(-n+2)]:border-b-0",
            i % 2 === 0 && "sm:max-lg:border-r",
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
