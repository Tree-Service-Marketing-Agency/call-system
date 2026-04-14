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
  if (user.role === "admin" || user.role === "root") {
    try {
      const body = (await request.clone().json()) as { companyId?: string };
      if (body?.companyId) targetCompanyId = body.companyId;
    } catch {
      // ignore
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
  if (!company || !company.stripeCustomerId) {
    return NextResponse.json(
      { error: "Company has no Stripe customer yet" },
      { status: 400 }
    );
  }

  const origin =
    request.headers.get("origin") ?? process.env.AUTH_URL ?? "http://localhost:3000";

  const session = await stripe.billingPortal.sessions.create({
    customer: company.stripeCustomerId,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
