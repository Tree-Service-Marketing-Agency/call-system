import { sql, eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  companies,
  invoices,
  businessConfig,
  billingLedger,
} from "@/lib/db/schema";
import { stripe, assertStripeConfigured } from "@/lib/stripe";
import {
  reservePendingLedgerForInvoice,
  releaseReservedLedger,
} from "@/lib/billing/ledger";
import { notifyNoPaymentMethod } from "@/lib/notifications/billing";

const NO_PAYMENT_METHOD_THROTTLE_DAYS = 7;

export interface ChargeRunResult {
  runId: string;
  triggeredBy: "cron" | "manual";
  recoveredCount: number;
  candidatesCount: number;
  invoicesCreated: number;
  invoicesFailed: number;
  skippedNoPaymentMethod: number;
  skippedPaymentPending: number;
  skippedUncollectible: number;
}

/**
 * Frees up companies stuck in `charging` for over an hour, but only when no
 * pending invoice with a real Stripe ID exists for them — that case means the
 * invoice did make it to Stripe and we are just waiting on the result webhook.
 */
async function recoverStuckCharging(runId: string): Promise<number> {
  const updated = await db.execute(sql`
    UPDATE companies
    SET billing_status = 'idle', billing_updated_at = now()
    WHERE billing_status = 'charging'
      AND billing_updated_at < now() - interval '1 hour'
      AND NOT EXISTS (
        SELECT 1 FROM invoices
        WHERE invoices.company_id = companies.id
          AND invoices.status = 'pending'
          AND invoices.stripe_invoice_id IS NOT NULL
      )
    RETURNING id
  `);
  const count = (updated as unknown as { rows?: unknown[] }).rows?.length ?? 0;
  if (count > 0) {
    console.log(
      `[billing-cron] recovered ${count} stuck-charging companies`,
      JSON.stringify({ run_id: runId })
    );
  }
  return count;
}

async function logSkippedCompanies(
  runId: string,
  thresholdCalls: number
): Promise<{
  noPaymentMethod: number;
  paymentPending: number;
  uncollectible: number;
}> {
  // No payment method but pending call count crossed the threshold.
  const noPm = await db.execute(sql`
    SELECT c.id, c.name, c.current_balance_cents AS balance,
           c.last_no_payment_warning_at AS last_warn,
           COUNT(bl.id)::int AS pending_count
    FROM companies c
    LEFT JOIN billing_ledger bl
      ON bl.company_id = c.id AND bl.status = 'pending'
    WHERE c.stripe_payment_method_id IS NULL
    GROUP BY c.id
    HAVING COUNT(bl.id) >= ${thresholdCalls}
  `);
  const noPmRows = (
    noPm as unknown as {
      rows: Array<{
        id: string;
        name: string;
        balance: number;
        last_warn: Date | null;
        pending_count: number;
      }>;
    }
  ).rows;

  const now = Date.now();
  for (const c of noPmRows) {
    const lastWarnTs = c.last_warn ? new Date(c.last_warn).getTime() : 0;
    const ageDays = (now - lastWarnTs) / (1000 * 60 * 60 * 24);
    if (!c.last_warn || ageDays >= NO_PAYMENT_METHOD_THROTTLE_DAYS) {
      notifyNoPaymentMethod({
        companyId: c.id,
        companyName: c.name,
        balanceCents: c.balance,
        pendingCallsCount: c.pending_count,
        thresholdCalls,
      });
      await db
        .update(companies)
        .set({ lastNoPaymentWarningAt: new Date() })
        .where(eq(companies.id, c.id));
    }
  }

  const pending = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.billingStatus, "payment_pending"));
  for (const c of pending) {
    console.log(
      "[billing-cron] skip payment_pending",
      JSON.stringify({ run_id: runId, company_id: c.id, company_name: c.name })
    );
  }

  const uncollectible = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.billingStatus, "uncollectible"));
  for (const c of uncollectible) {
    console.log(
      "[billing-cron] skip uncollectible",
      JSON.stringify({ run_id: runId, company_id: c.id, company_name: c.name })
    );
  }

  return {
    noPaymentMethod: noPmRows.length,
    paymentPending: pending.length,
    uncollectible: uncollectible.length,
  };
}

interface ChargeAttemptResult {
  ok: boolean;
  invoiceId?: string;
}

/**
 * Reserves the company's pending ledger inside a transaction, creates a local
 * invoice row in `pending`, flips the company to `charging`, then — outside
 * the transaction — calls the Stripe API to create the remote invoice. If the
 * Stripe call fails, performs the financial rollback (ledger back to pending,
 * invoice to creation_failed, company to idle).
 */
async function chargeOneCompany(
  runId: string,
  companyId: string
): Promise<ChargeAttemptResult> {
  const result = await db.transaction(async (tx) => {
    const lockedRows = await tx.execute(sql`
      SELECT id, name, stripe_customer_id, stripe_payment_method_id,
             current_balance_cents, billing_status
      FROM companies
      WHERE id = ${companyId}
      FOR UPDATE
    `);
    const lockedRowsArr = (
      lockedRows as unknown as {
        rows: Array<{
          id: string;
          name: string;
          stripe_customer_id: string | null;
          stripe_payment_method_id: string | null;
          current_balance_cents: number;
          billing_status: string;
        }>;
      }
    ).rows;
    const company = lockedRowsArr[0];
    if (!company) return null;

    const config = await tx.query.businessConfig.findFirst();
    const thresholdCalls = config?.billingThresholdCalls ?? 25;

    if (
      company.billing_status !== "idle" ||
      !company.stripe_payment_method_id ||
      !company.stripe_customer_id
    ) {
      return null;
    }

    const pendingTotal = await tx
      .select({
        sum: sql<number>`COALESCE(SUM(${billingLedger.amountCents}), 0)`.as(
          "sum"
        ),
        cnt: sql<number>`COUNT(*)`.as("cnt"),
      })
      .from(billingLedger)
      .where(
        and(
          eq(billingLedger.companyId, companyId),
          eq(billingLedger.status, "pending")
        )
      );
    const totalCents = Number(pendingTotal[0]?.sum ?? 0);
    const entryCount = Number(pendingTotal[0]?.cnt ?? 0);
    // Re-check the trigger inside the transaction: a void racing with candidate
    // selection could have dropped the count below the threshold.
    if (entryCount < thresholdCalls || totalCents <= 0) return null;

    const [invoice] = await tx
      .insert(invoices)
      .values({
        companyId,
        amountCents: totalCents,
        status: "pending",
        entryCount,
      })
      .returning({ id: invoices.id });

    await reservePendingLedgerForInvoice(tx, {
      companyId,
      invoiceId: invoice.id,
    });

    await tx
      .update(companies)
      .set({
        billingStatus: "charging",
        billingUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, companyId));

    return {
      invoiceId: invoice.id,
      stripeCustomerId: company.stripe_customer_id,
      stripePaymentMethodId: company.stripe_payment_method_id,
      amountCents: totalCents,
      entryCount,
      companyName: company.name,
    };
  });

  if (!result) return { ok: false };

  // Outside the DB transaction: hit the Stripe API.
  try {
    assertStripeConfigured();

    const stripeInvoice = await stripe.invoices.create(
      {
        customer: result.stripeCustomerId,
        auto_advance: true,
        collection_method: "charge_automatically",
        default_payment_method: result.stripePaymentMethodId,
        description: `Call service (${result.entryCount} calls)`,
        metadata: {
          local_invoice_id: result.invoiceId,
          local_company_name: result.companyName,
        },
      },
      { idempotencyKey: `invoice-${result.invoiceId}` }
    );

    await stripe.invoiceItems.create(
      {
        customer: result.stripeCustomerId,
        invoice: stripeInvoice.id,
        amount: result.amountCents,
        currency: "usd",
        description: `Call service — ${result.entryCount} call${
          result.entryCount === 1 ? "" : "s"
        }`,
        metadata: {
          local_invoice_id: result.invoiceId,
        },
      },
      { idempotencyKey: `invoice-item-${result.invoiceId}` }
    );

    await db
      .update(invoices)
      .set({
        stripeInvoiceId: stripeInvoice.id,
        hostedInvoiceUrl: stripeInvoice.hosted_invoice_url ?? null,
      })
      .where(eq(invoices.id, result.invoiceId));

    console.log(
      "[billing-cron] invoice created",
      JSON.stringify({
        run_id: runId,
        company_id: companyId,
        invoice_id: result.invoiceId,
        stripe_invoice_id: stripeInvoice.id,
        amount_cents: result.amountCents,
      })
    );
    return { ok: true, invoiceId: result.invoiceId };
  } catch (error) {
    console.error(
      "[billing-cron] stripe invoice creation failed",
      JSON.stringify({
        run_id: runId,
        company_id: companyId,
        invoice_id: result.invoiceId,
        error: error instanceof Error ? error.message : String(error),
      })
    );

    await db.transaction(async (tx) => {
      await releaseReservedLedger(tx, result.invoiceId);
      await tx
        .update(invoices)
        .set({ status: "creation_failed" })
        .where(eq(invoices.id, result.invoiceId));
      await tx
        .update(companies)
        .set({
          billingStatus: "idle",
          billingUpdatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companies.id, companyId));
    });

    return { ok: false };
  }
}

export async function runBillingChargeForCompany(args: {
  runId: string;
  triggeredBy: "cron" | "manual";
  companyId: string;
}): Promise<ChargeAttemptResult> {
  const { runId, triggeredBy, companyId } = args;

  console.log(
    "[billing-cron] single-company run start",
    JSON.stringify({ run_id: runId, triggered_by: triggeredBy, company_id: companyId })
  );

  const result = await chargeOneCompany(runId, companyId);

  console.log(
    "[billing-cron] single-company run end",
    JSON.stringify({
      run_id: runId,
      triggered_by: triggeredBy,
      company_id: companyId,
      ok: result.ok,
      invoice_id: result.invoiceId ?? null,
    })
  );

  return result;
}

export async function runBillingChargeRun(args: {
  runId: string;
  triggeredBy: "cron" | "manual";
}): Promise<ChargeRunResult> {
  const { runId, triggeredBy } = args;

  console.log(
    "[billing-cron] run start",
    JSON.stringify({ run_id: runId, triggered_by: triggeredBy })
  );

  const recoveredCount = await recoverStuckCharging(runId);

  const config = await db.query.businessConfig.findFirst();
  const thresholdCalls = config?.billingThresholdCalls ?? 25;

  // Candidate selection. Pick companies with >= thresholdCalls ledger entries
  // in `pending`. The GROUP BY / HAVING lives inside a subquery because
  // PostgreSQL forbids combining FOR UPDATE with aggregation. The outer
  // SELECT projects plain rows so SKIP LOCKED is legal — chargeOneCompany
  // re-locks each row in its own transaction and re-checks the count there.
  const candidatesResult = await db.execute(sql`
    SELECT id FROM companies
    WHERE billing_status = 'idle'
      AND stripe_payment_method_id IS NOT NULL
      AND id IN (
        SELECT company_id
        FROM billing_ledger
        WHERE status = 'pending'
        GROUP BY company_id
        HAVING COUNT(*) >= ${thresholdCalls}
      )
    FOR UPDATE SKIP LOCKED
  `);
  const candidates = (
    candidatesResult as unknown as { rows: Array<{ id: string }> }
  ).rows.map((r) => r.id);

  let invoicesCreated = 0;
  let invoicesFailed = 0;

  for (const companyId of candidates) {
    const r = await chargeOneCompany(runId, companyId);
    if (r.ok) invoicesCreated++;
    else invoicesFailed++;
  }

  const skipped = await logSkippedCompanies(runId, thresholdCalls);

  const result: ChargeRunResult = {
    runId,
    triggeredBy,
    recoveredCount,
    candidatesCount: candidates.length,
    invoicesCreated,
    invoicesFailed,
    skippedNoPaymentMethod: skipped.noPaymentMethod,
    skippedPaymentPending: skipped.paymentPending,
    skippedUncollectible: skipped.uncollectible,
  };

  console.log("[billing-cron] run end", JSON.stringify(result));
  return result;
}

export { recoverStuckCharging };
