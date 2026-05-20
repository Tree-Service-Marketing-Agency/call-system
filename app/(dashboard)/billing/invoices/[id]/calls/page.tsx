import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageBody } from "@/components/layout/page-body";
import { CallsClient } from "@/app/(dashboard)/calls/calls-client";
import { getInvoiceWithAggregates } from "@/lib/billing/invoice-calls";
import { isAgencyRole, type SessionUser } from "@/lib/auth-helpers";

type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

const INVOICE_STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  paid: { label: "Paid", variant: "success" },
  pending: { label: "Pending", variant: "secondary" },
  failed: { label: "Failed", variant: "warning" },
  uncollectible: { label: "Uncollectible", variant: "destructive" },
};

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function InvoiceCallsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const user = session.user as SessionUser;
  // Staff (read-only) is locked out of /billing — same rule applies here.
  if (user.role === "staff") redirect("/calls");

  const { id } = await params;
  const invoice = await getInvoiceWithAggregates(id);
  if (!invoice) notFound();

  // creation_failed never produced ledger entries; the dropdown hides this
  // entry point and a direct hit should look identical to a missing invoice.
  if (invoice.status === "creation_failed") notFound();

  // staff_admin can only see invoices for their own company.
  if (!isAgencyRole(user.role) && invoice.companyId !== user.companyId) {
    notFound();
  }

  const isAgency = isAgencyRole(user.role);
  const statusBadge =
    INVOICE_STATUS_BADGE[invoice.status] ?? {
      label: invoice.status,
      variant: "outline" as const,
    };

  const titleSuffix = invoice.stripeInvoiceId ?? invoice.id.slice(0, 8);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-border px-7 pt-6 pb-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/billing">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back to Billing"
              className="-ml-1"
            >
              <ArrowLeftIcon />
            </Button>
          </Link>
          <Link href="/billing" className="hover:text-foreground">
            Billing
          </Link>
          <span>/</span>
          <span className="text-foreground">Calls in invoice</span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Calls in invoice {titleSuffix}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {isAgency && invoice.companyName && (
                <span className="text-foreground">{invoice.companyName}</span>
              )}
              <span className="tabular-nums">{usd(invoice.amountCents)}</span>
              <span>
                {invoice.callsCount}{" "}
                {invoice.callsCount === 1 ? "call" : "calls"}
              </span>
              <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
            </div>
            {invoice.stripeInvoiceId && (
              <span className="font-mono text-[11px] text-muted-foreground-2">
                {invoice.stripeInvoiceId}
              </span>
            )}
          </div>
        </div>
      </div>

      <PageBody>
        <CallsClient
          user={user}
          invoiceId={invoice.id}
          showHeader={false}
          footerTotals={{
            realCostUsd: isAgency ? invoice.sumRetellCostUsd : null,
            priceCents: invoice.sumBillingPriceCents,
          }}
        />
      </PageBody>
    </>
  );
}
