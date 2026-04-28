import { NextRequest, NextResponse } from "next/server";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies, invoices, businessConfig } from "@/lib/db/schema";
import { getSessionUser, isAgencyRole } from "@/lib/auth-helpers";
import { stripe } from "@/lib/stripe";

interface PaymentMethodSummary {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

async function loadPaymentMethod(
  customerId: string | null,
  paymentMethodId: string | null
): Promise<PaymentMethodSummary | null> {
  if (!customerId || !paymentMethodId) return null;
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm.card) return null;
    return {
      brand: pm.card.brand,
      last4: pm.card.last4,
      expMonth: pm.card.exp_month,
      expYear: pm.card.exp_year,
    };
  } catch {
    return null;
  }
}

async function loadInvoices(companyId: string, limit = 50) {
  return db
    .select({
      id: invoices.id,
      stripeInvoiceId: invoices.stripeInvoiceId,
      amountCents: invoices.amountCents,
      status: invoices.status,
      attemptCount: invoices.attemptCount,
      hostedInvoiceUrl: invoices.hostedInvoiceUrl,
      entryCount: invoices.entryCount,
      createdAt: invoices.createdAt,
      paidAt: invoices.paidAt,
      failedAt: invoices.failedAt,
    })
    .from(invoices)
    .where(eq(invoices.companyId, companyId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

async function loadGlobalInvoices(limit = 100) {
  return db
    .select({
      id: invoices.id,
      companyId: invoices.companyId,
      companyName: companies.name,
      stripeInvoiceId: invoices.stripeInvoiceId,
      amountCents: invoices.amountCents,
      status: invoices.status,
      attemptCount: invoices.attemptCount,
      hostedInvoiceUrl: invoices.hostedInvoiceUrl,
      createdAt: invoices.createdAt,
      paidAt: invoices.paidAt,
      failedAt: invoices.failedAt,
    })
    .from(invoices)
    .leftJoin(companies, eq(invoices.companyId, companies.id))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await db.query.businessConfig.findFirst();
  const thresholdCents = config?.billingThresholdCents ?? 5000;

  if (!isAgencyRole(user.role)) {
    // staff_admin / staff: their own company only.
    if (!user.companyId) {
      return NextResponse.json({
        scope: "company",
        balanceCents: 0,
        thresholdCents,
        billingStatus: "idle",
        paymentMethod: null,
        invoices: [],
      });
    }

    if (user.role !== "staff_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, user.companyId),
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const [paymentMethod, invoiceRows] = await Promise.all([
      loadPaymentMethod(company.stripeCustomerId, company.stripePaymentMethodId),
      loadInvoices(company.id),
    ]);

    return NextResponse.json({
      scope: "company",
      companyId: company.id,
      companyName: company.name,
      balanceCents: company.currentBalanceCents,
      thresholdCents,
      billingStatus: company.billingStatus,
      hasStripeCustomer: !!company.stripeCustomerId,
      paymentMethod,
      invoices: invoiceRows,
    });
  }

  // admin / root.
  const { searchParams } = request.nextUrl;
  const companyIdParam = searchParams.get("companyId");

  if (companyIdParam) {
    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyIdParam),
    });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }
    const [paymentMethod, invoiceRows] = await Promise.all([
      loadPaymentMethod(company.stripeCustomerId, company.stripePaymentMethodId),
      loadInvoices(company.id),
    ]);

    return NextResponse.json({
      scope: "company",
      companyId: company.id,
      companyName: company.name,
      balanceCents: company.currentBalanceCents,
      thresholdCents,
      billingStatus: company.billingStatus,
      hasStripeCustomer: !!company.stripeCustomerId,
      paymentMethod,
      invoices: invoiceRows,
    });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [aggregates] = await db
    .select({
      paidCents: sql<number>`COALESCE(SUM(${invoices.amountCents}) filter (where ${invoices.status} = 'paid' and ${invoices.createdAt} >= ${startOfMonth}), 0)::bigint`,
      paidCount: sql<number>`(count(*) filter (where ${invoices.status} = 'paid' and ${invoices.createdAt} >= ${startOfMonth}))::int`,
      failedCount: sql<number>`(count(*) filter (where ${invoices.status} = 'failed' and ${invoices.createdAt} >= ${startOfMonth}))::int`,
      prevPaidCents: sql<number>`COALESCE(SUM(${invoices.amountCents}) filter (where ${invoices.status} = 'paid' and ${invoices.createdAt} >= ${startOfPrevMonth} and ${invoices.createdAt} < ${startOfMonth}), 0)::bigint`,
      prevPaidCount: sql<number>`(count(*) filter (where ${invoices.status} = 'paid' and ${invoices.createdAt} >= ${startOfPrevMonth} and ${invoices.createdAt} < ${startOfMonth}))::int`,
      prevFailedCount: sql<number>`(count(*) filter (where ${invoices.status} = 'failed' and ${invoices.createdAt} >= ${startOfPrevMonth} and ${invoices.createdAt} < ${startOfMonth}))::int`,
    })
    .from(invoices);

  const uncollectibleResult = await db
    .select({
      count: sql<number>`(count(*))::int`,
    })
    .from(companies)
    .where(eq(companies.billingStatus, "uncollectible"));

  function pctChange(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / previous) * 100;
  }

  const paidCentsThisMonth = Number(aggregates?.paidCents ?? 0);
  const paidCountThisMonth = Number(aggregates?.paidCount ?? 0);
  const failedCountThisMonth = Number(aggregates?.failedCount ?? 0);
  const prevPaidCents = Number(aggregates?.prevPaidCents ?? 0);
  const prevPaidCount = Number(aggregates?.prevPaidCount ?? 0);
  const prevFailedCount = Number(aggregates?.prevFailedCount ?? 0);
  const uncollectibleCompanies = Number(uncollectibleResult[0]?.count ?? 0);

  const companyRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      balanceCents: companies.currentBalanceCents,
      billingStatus: companies.billingStatus,
      stripeCustomerId: companies.stripeCustomerId,
      stripePaymentMethodId: companies.stripePaymentMethodId,
      lastInvoiceCreatedAt: sql<Date | null>`(
        SELECT created_at FROM invoices i WHERE i.company_id = ${companies.id} ORDER BY created_at DESC LIMIT 1
      )`.as("last_invoice_created_at"),
      lastInvoiceAmountCents: sql<number | null>`(
        SELECT amount_cents FROM invoices i WHERE i.company_id = ${companies.id} ORDER BY created_at DESC LIMIT 1
      )`.as("last_invoice_amount_cents"),
      lastInvoiceStatus: sql<string | null>`(
        SELECT status FROM invoices i WHERE i.company_id = ${companies.id} ORDER BY created_at DESC LIMIT 1
      )`.as("last_invoice_status"),
    })
    .from(companies)
    .orderBy(desc(companies.currentBalanceCents));

  const invoiceRows = await loadGlobalInvoices(100);

  return NextResponse.json({
    scope: "global",
    thresholdCents,
    pricePerCallCents: config?.pricePerCallCents ?? 100,
    stats: {
      paidCentsThisMonth,
      paidCountThisMonth,
      failedCountThisMonth,
      uncollectibleCompanies,
      deltas: {
        paidCents: pctChange(paidCentsThisMonth, prevPaidCents),
        paidCount: pctChange(paidCountThisMonth, prevPaidCount),
        failedCount: pctChange(failedCountThisMonth, prevFailedCount),
      },
    },
    companies: companyRows.map((c) => ({
      id: c.id,
      name: c.name,
      balanceCents: c.balanceCents,
      billingStatus: c.billingStatus,
      hasPaymentMethod: !!c.stripePaymentMethodId,
      lastInvoice: c.lastInvoiceCreatedAt
        ? {
            createdAt: c.lastInvoiceCreatedAt,
            amountCents: c.lastInvoiceAmountCents,
            status: c.lastInvoiceStatus,
          }
        : null,
    })),
    invoices: invoiceRows,
  });
}
