"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLinkIcon } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DataTablePagination } from "@/components/dashboard/data-table-pagination";

interface InvoiceRow {
  id: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  status:
    | "pending"
    | "paid"
    | "failed"
    | "uncollectible"
    | "creation_failed";
  hostedInvoiceUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  failedAt: string | null;
}

interface InvoicesResponse {
  data: InvoiceRow[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

function statusBadge(status: InvoiceRow["status"]) {
  switch (status) {
    case "paid":
      return <Badge variant="success">Paid</Badge>;
    case "pending":
      return <Badge variant="warning">Pending</Badge>;
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
    case "uncollectible":
      return <Badge variant="destructive">Uncollectible</Badge>;
    case "creation_failed":
      return <Badge variant="destructive">Creation failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function BillingTab({ companyId }: { companyId: string }) {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const fetchInvoices = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("pageSize", PAGE_SIZE.toString());
    fetch(`/api/companies/${companyId}/invoices?${params.toString()}`)
      .then((res) => res.json())
      .then((data: InvoicesResponse) => {
        setInvoices(data.data ?? []);
        setTotal(data.total ?? 0);
      });
  }, [companyId, page]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Invoice</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={4}
                className="h-32 text-center text-sm text-muted-foreground"
              >
                No invoices yet
              </TableCell>
            </TableRow>
          ) : (
            invoices.map((invoice) => {
              const dateSource =
                invoice.paidAt ?? invoice.failedAt ?? invoice.createdAt;
              return (
                <TableRow key={invoice.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatDate(dateSource)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ${(invoice.amountCents / 100).toFixed(2)}
                  </TableCell>
                  <TableCell>{statusBadge(invoice.status)}</TableCell>
                  <TableCell>
                    {invoice.hostedInvoiceUrl ? (
                      <a
                        href={invoice.hostedInvoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-foreground underline-offset-4 hover:underline"
                      >
                        View
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      <DataTablePagination
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        itemLabel="invoices"
        onPageChange={setPage}
      />
    </div>
  );
}
