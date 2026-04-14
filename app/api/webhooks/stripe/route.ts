import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import {
  companies,
  invoices,
  stripeWebhookEvents,
} from "@/lib/db/schema";
import { stripe, assertStripeConfigured } from "@/lib/stripe";
import { markLedgerPaid, linkCallsToInvoice } from "@/lib/billing/ledger";
import {
  notifyPaymentFailed,
  notifyUncollectible,
} from "@/lib/notifications/billing";

async function alreadyProcessed(eventId: string, type: string): Promise<boolean> {
  const inserted = await db
    .insert(stripeWebhookEvents)
    .values({ id: eventId, type })
    .onConflictDoNothing({ target: stripeWebhookEvents.id })
    .returning({ id: stripeWebhookEvents.id });
  return inserted.length === 0;
}

async function findCompanyByCustomer(
  stripeCustomerId: string
): Promise<typeof companies.$inferSelect | null> {
  const c = await db.query.companies.findFirst({
    where: eq(companies.stripeCustomerId, stripeCustomerId),
  });
  return c ?? null;
}

async function findLocalInvoiceByStripeId(stripeInvoiceId: string) {
  return db.query.invoices.findFirst({
    where: eq(invoices.stripeInvoiceId, stripeInvoiceId),
  });
}

async function buildPortalUrl(stripeCustomerId: string): Promise<string | null> {
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.AUTH_URL ?? ""}/billing`,
    });
    return session.url;
  } catch {
    return null;
  }
}

async function handleSetupIntentSucceeded(event: Stripe.Event) {
  const intent = event.data.object as Stripe.SetupIntent;
  const customerId =
    typeof intent.customer === "string" ? intent.customer : intent.customer?.id;
  const paymentMethodId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method?.id;
  if (!customerId || !paymentMethodId) return;

  const company = await findCompanyByCustomer(customerId);
  if (!company) return;

  // Set as the default payment method on the Stripe customer so future
  // invoices auto-collect from it.
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  } catch (err) {
    console.warn(
      "[stripe-webhook] customers.update default_payment_method failed",
      err instanceof Error ? err.message : err
    );
  }

  // Copy cardholder contact info from PM billing_details to the Customer so
  // the Stripe Dashboard shows who registered the card. Preserve any
  // historical customer.email so we don't clobber a prior contact.
  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    const bd = pm.billing_details;
    const incomingEmail = bd?.email?.trim() || null;
    const incomingName = bd?.name?.trim() || null;

    if (incomingEmail || incomingName) {
      const existing = await stripe.customers.retrieve(customerId);
      if (existing.deleted) throw new Error("customer deleted");

      const updates: Stripe.CustomerUpdateParams = {};
      if (incomingEmail && !existing.email) {
        updates.email = incomingEmail;
      }
      if (
        incomingName &&
        existing.metadata?.contact_name !== incomingName
      ) {
        updates.metadata = {
          ...existing.metadata,
          contact_name: incomingName,
        };
      }
      if (Object.keys(updates).length) {
        await stripe.customers.update(customerId, updates);
      }
    }
  } catch (err) {
    console.warn(
      "[stripe-webhook] copy billing_details to customer failed",
      err instanceof Error ? err.message : err
    );
  }

  await db
    .update(companies)
    .set({
      stripePaymentMethodId: paymentMethodId,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, company.id));

  console.log(
    "[stripe-webhook] setup_intent.succeeded",
    JSON.stringify({ company_id: company.id, payment_method_id: paymentMethodId })
  );
}

async function handleInvoicePaid(event: Stripe.Event) {
  const stripeInvoice = event.data.object as Stripe.Invoice;
  if (!stripeInvoice.id) return;

  const local = await findLocalInvoiceByStripeId(stripeInvoice.id);
  if (!local) {
    console.warn(
      "[stripe-webhook] invoice.paid for unknown local invoice",
      stripeInvoice.id
    );
    return;
  }

  const amountPaid = stripeInvoice.amount_paid ?? local.amountCents;

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({ status: "paid", paidAt: new Date() })
      .where(eq(invoices.id, local.id));

    const { callRowIds } = await markLedgerPaid(tx, local.id);
    await linkCallsToInvoice(tx, callRowIds, local.id);

    await tx
      .update(companies)
      .set({
        currentBalanceCents: sql`${companies.currentBalanceCents} - ${amountPaid}`,
        billingStatus: "idle",
        billingUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, local.companyId));
  });

  console.log(
    "[stripe-webhook] invoice.paid",
    JSON.stringify({
      invoice_id: local.id,
      stripe_invoice_id: stripeInvoice.id,
      amount_paid: amountPaid,
    })
  );
}

async function handleInvoicePaymentFailed(event: Stripe.Event) {
  const stripeInvoice = event.data.object as Stripe.Invoice;
  if (!stripeInvoice.id) return;

  const local = await findLocalInvoiceByStripeId(stripeInvoice.id);
  if (!local) return;

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, local.companyId),
  });
  if (!company) return;

  const attemptCount = stripeInvoice.attempt_count ?? 0;
  const nextAttemptAt = stripeInvoice.next_payment_attempt
    ? new Date(stripeInvoice.next_payment_attempt * 1000)
    : null;

  await db
    .update(invoices)
    .set({
      status: "failed",
      attemptCount,
      nextAttemptAt,
      failedAt: new Date(),
    })
    .where(eq(invoices.id, local.id));

  await db
    .update(companies)
    .set({
      billingStatus: "payment_pending",
      billingUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, local.companyId));

  const portalUrl = company.stripeCustomerId
    ? await buildPortalUrl(company.stripeCustomerId)
    : null;

  notifyPaymentFailed({
    companyId: company.id,
    companyName: company.name,
    invoiceId: local.id,
    stripeInvoiceId: stripeInvoice.id,
    amountCents: local.amountCents,
    attemptCount,
    nextAttemptAtIso: nextAttemptAt?.toISOString() ?? null,
    customerPortalUrl: portalUrl,
  });
}

async function handleInvoiceUncollectible(event: Stripe.Event) {
  const stripeInvoice = event.data.object as Stripe.Invoice;
  if (!stripeInvoice.id) return;

  const local = await findLocalInvoiceByStripeId(stripeInvoice.id);
  if (!local) return;

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, local.companyId),
  });
  if (!company) return;

  await db
    .update(invoices)
    .set({ status: "uncollectible" })
    .where(eq(invoices.id, local.id));

  await db
    .update(companies)
    .set({
      billingStatus: "uncollectible",
      billingUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(companies.id, local.companyId));

  const portalUrl = company.stripeCustomerId
    ? await buildPortalUrl(company.stripeCustomerId)
    : null;

  notifyUncollectible({
    companyId: company.id,
    companyName: company.name,
    invoiceId: local.id,
    stripeInvoiceId: stripeInvoice.id,
    amountCents: local.amountCents,
    totalAttempts: stripeInvoice.attempt_count ?? 0,
    customerPortalUrl: portalUrl,
  });
}

async function handlePaymentMethodDetached(event: Stripe.Event) {
  const pm = event.data.object as Stripe.PaymentMethod;
  const customerId =
    typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  if (!customerId) return;

  const company = await findCompanyByCustomer(customerId);
  if (!company) return;

  // Tolerate detach during charging — don't abort the in-flight invoice. If
  // Stripe fails to charge, invoice.payment_failed will fire and the normal
  // recovery flow takes over.
  await db
    .update(companies)
    .set({
      stripePaymentMethodId: null,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, company.id));

  console.log(
    "[stripe-webhook] payment_method.detached",
    JSON.stringify({
      company_id: company.id,
      billing_status: company.billingStatus,
    })
  );
}

export async function POST(request: Request) {
  assertStripeConfigured();

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.warn(
      "[stripe-webhook] signature verification failed",
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const isDuplicate = await alreadyProcessed(event.id, event.type);
  if (isDuplicate) {
    console.log(
      "[stripe-webhook] duplicate event ignored",
      JSON.stringify({ event_id: event.id, type: event.type })
    );
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "setup_intent.succeeded":
        await handleSetupIntentSucceeded(event);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event);
        break;
      case "invoice.marked_uncollectible":
        await handleInvoiceUncollectible(event);
        break;
      case "payment_method.detached":
        await handlePaymentMethodDetached(event);
        break;
      default:
        // Acknowledge but ignore unknown event types.
        break;
    }
  } catch (err) {
    console.error(
      "[stripe-webhook] handler error",
      JSON.stringify({
        event_id: event.id,
        type: event.type,
        error: err instanceof Error ? err.message : String(err),
      })
    );
    // Re-throw so Stripe retries; we already inserted the dedup row, so we
    // need to remove it to allow the retry to land.
    await db
      .delete(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.id, event.id));
    return NextResponse.json(
      { error: "Handler error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
