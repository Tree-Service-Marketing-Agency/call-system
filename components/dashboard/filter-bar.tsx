"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FilterBarProps extends React.ComponentProps<"div"> {
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}

export function FilterBar({
  search,
  filters,
  actions,
  className,
  children,
  ...props
}: FilterBarProps) {
  return (
    <div
      data-slot="filter-bar"
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    >
      {search && (
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground-2" />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Search…"}
            className="h-8 pl-8 text-sm"
          />
        </div>
      )}
      {filters && <div className="flex items-center gap-2">{filters}</div>}
      {children}
      {actions && (
        <div className="ml-auto flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
