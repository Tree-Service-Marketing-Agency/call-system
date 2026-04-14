import { NextRequest, NextResponse } from "next/server";
import { eq, sql, desc, and } from "drizzle-orm";
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

  const monthlyStats = await db
    .select({
      paidCents: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN ${invoices.amountCents} ELSE 0 END), 0)`.as(
        "paid_cents"
      ),
      paidCount: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'paid')`.as(
        "paid_count"
      ),
      failedCount: sql<number>`COUNT(*) FILTER (WHERE ${invoices.status} = 'failed')`.as(
        "failed_count"
      ),
    })
    .from(invoices)
    .where(and(sql`${invoices.createdAt} >= ${startOfMonth}`));

  const uncollectibleResult = await db
    .select({
      count: sql<number>`COUNT(*)`.as("count"),
    })
    .from(companies)
    .where(eq(companies.billingStatus, "uncollectible"));

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
      paidCentsThisMonth: Number(monthlyStats[0]?.paidCents ?? 0),
      paidCountThisMonth: Number(monthlyStats[0]?.paidCount ?? 0),
      failedCountThisMonth: Number(monthlyStats[0]?.failedCount ?? 0),
      uncollectibleCompanies: Number(uncollectibleResult[0]?.count ?? 0),
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
