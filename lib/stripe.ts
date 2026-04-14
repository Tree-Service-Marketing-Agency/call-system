import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;

if (!secret) {
  // We don't throw at import time so dev environments without Stripe configured
  // can still build. Any code path that actually calls Stripe will throw the
  // helpful message below.
  console.warn(
    "[stripe] STRIPE_SECRET_KEY is not set; Stripe API calls will fail until it is configured."
  );
}

export const stripe = new Stripe(secret ?? "sk_test_unset", {
  typescript: true,
  appInfo: {
    name: "call-system",
  },
});

export function assertStripeConfigured() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
}
