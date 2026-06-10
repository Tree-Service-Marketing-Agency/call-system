"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DataTablePaginationProps {
  page: number;
  pageSize: number;
  total: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
  /**
   * When provided, renders a "Rows per page" selector and emits the chosen
   * value. Pass an empty array to opt out (default sizes are 10/25/50/100).
   */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  className?: string;
  /** Show first/last and page-of-pages indicator. Defaults to true. */
  rich?: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function DataTablePagination({
  page,
  pageSize,
  total,
  itemLabel = "items",
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  className,
  rich = true,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const showPageSizeSelector =
    rich && Boolean(onPageSizeChange) && pageSizeOptions.length > 0;

  return (
    <div
      data-slot="data-table-pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3 text-[12.5px] text-muted-foreground",
        className,
      )}
    >
      <span>
        Showing{" "}
        <strong className="font-medium text-foreground tabular-nums">
          {start.toLocaleString()}–{end.toLocaleString()}
        </strong>{" "}
        of{" "}
        <strong className="font-medium text-foreground tabular-nums">
          {total.toLocaleString()}
        </strong>{" "}
        {itemLabel}
      </span>
      <div className="flex items-center gap-3">
        {showPageSizeSelector && (
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange?.(Number(v))}
            >
              <SelectTrigger className="h-7 w-[68px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((opt) => (
                  <SelectItem key={opt} value={String(opt)}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {rich && (
          <span className="tabular-nums">
            Page{" "}
            <strong className="font-medium text-foreground">{page}</strong> of{" "}
            {totalPages.toLocaleString()}
          </span>
        )}
        <div className="flex items-center gap-1">
          {rich && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="First page"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
            >
              <ChevronsLeftIcon />
            </Button>
          )}
          <Button
            variant="outline"
            size={rich ? "icon-sm" : "sm"}
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeftIcon data-icon={rich ? undefined : "inline-start"} />
            {!rich && "Previous"}
          </Button>
          <Button
            variant="outline"
            size={rich ? "icon-sm" : "sm"}
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            {!rich && "Next"}
            <ChevronRightIcon data-icon={rich ? undefined : "inline-end"} />
          </Button>
          {rich && (
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Last page"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
            >
              <ChevronsRightIcon />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
