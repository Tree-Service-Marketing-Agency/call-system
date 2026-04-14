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

  let targetCompanyId: string | null = user.companyId;

  // Agency roles can pass a companyId to set up payment for any company.
  if (user.role === "admin" || user.role === "root") {
    try {
      const body = (await request.clone().json()) as { companyId?: string };
      if (body?.companyId) targetCompanyId = body.companyId;
    } catch {
      // ignore parse errors when no body
    }
  }

  if (!targetCompanyId) {
    return NextResponse.json(
      { error: "No company in scope" },
      { status: 400 }
    );
  }

  assertStripeConfigured();

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, targetCompanyId),
  });
  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  let customerId = company.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        name: company.name,
        metadata: { company_id: company.id },
      },
      {
        idempotencyKey: `company:${company.id}:customer`,
      }
    );
    customerId = customer.id;
    await db
      .update(companies)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(companies.id, company.id));
  }

  const existing = await stripe.setupIntents.list({
    customer: customerId,
    limit: 10,
  });
  const reusable = existing.data.find(
    (si) =>
      si.status === "requires_payment_method" ||
      si.status === "requires_confirmation"
  );

  const intent =
    reusable ??
    (await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { company_id: company.id },
    }));

  const isOwnCompany = user.companyId === targetCompanyId;
  const prefillEmail = isOwnCompany ? (user.email ?? null) : null;

  return NextResponse.json({
    clientSecret: intent.client_secret,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    prefillEmail,
  });
}
