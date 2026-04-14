import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { companies } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth-helpers";
import { stripe, assertStripeConfigured } from "@/lib/stripe";

export async function POST(request: Request) {
  const auth = await requireRole("staff_admin", "admin", "root");
  if (!auth.ok) return auth.response;
  const { user } = auth;

  assertStripeConfigured();

  const body = (await request.json().catch(() => ({}))) as {
    setupIntentId?: string;
    companyId?: string;
  };
  const setupIntentId = body?.setupIntentId;
  if (!setupIntentId) {
    return NextResponse.json(
      { error: "setupIntentId required" },
      { status: 400 }
    );
  }

  let targetCompanyId: string | null = user.companyId;
  if (user.role === "admin" || user.role === "root") {
    if (body?.companyId) targetCompanyId = body.companyId;
  }
  if (!targetCompanyId) {
    return NextResponse.json(
      { error: "No company in scope" },
      { status: 400 }
    );
  }

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, targetCompanyId),
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const intent = await stripe.setupIntents.retrieve(setupIntentId);
  if (intent.status !== "succeeded") {
    return NextResponse.json(
      { error: `Setup intent not succeeded (${intent.status})` },
      { status: 409 }
    );
  }

  const customerId =
    typeof intent.customer === "string"
      ? intent.customer
      : intent.customer?.id;
  const paymentMethodId =
    typeof intent.payment_method === "string"
      ? intent.payment_method
      : intent.payment_method?.id;

  if (!customerId || !paymentMethodId) {
    return NextResponse.json(
      { error: "Setup intent missing customer or payment method" },
      { status: 400 }
    );
  }
  if (company.stripeCustomerId && company.stripeCustomerId !== customerId) {
    return NextResponse.json(
      { error: "Setup intent customer mismatch" },
      { status: 403 }
    );
  }

  try {
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  } catch (err) {
    console.warn(
      "[attach-payment-method] customers.update default_payment_method failed",
      err instanceof Error ? err.message : err
    );
  }

  await db
    .update(companies)
    .set({
      stripePaymentMethodId: paymentMethodId,
      stripeCustomerId: customerId,
      updatedAt: new Date(),
    })
    .where(eq(companies.id, company.id));

  return NextResponse.json({ ok: true });
}
