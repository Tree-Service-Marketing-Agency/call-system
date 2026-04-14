"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onSuccess: () => void;
  onCancel: () => void;
}

interface InnerFormProps extends Props {
  initialEmail?: string;
}

function InnerForm({ onSuccess, onCancel, initialEmail }: InnerFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cardholderName, setCardholderName] = useState("");
  const [cardholderEmail, setCardholderEmail] = useState(initialEmail ?? "");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
  }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!stripe || !elements) return;

    const name = cardholderName.trim();
    const email = cardholderEmail.trim();
    const errs: { name?: string; email?: string } = {};
    if (name.length < 2) errs.name = "Enter the cardholder's full name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      redirect: "if_required",
      confirmParams: {
        payment_method_data: {
          billing_details: { name, email },
        },
      },
    });

    if (result.error) {
      setSubmitting(false);
      setError(result.error.message ?? "Payment setup failed");
      return;
    }

    const setupIntentId = result.setupIntent?.id;
    if (!setupIntentId) {
      setSubmitting(false);
      setError("Missing setup intent reference");
      return;
    }

    try {
      const resp = await fetch("/api/billing/attach-payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setSubmitting(false);
        setError(data?.error ?? "Failed to attach payment method");
        return;
      }
    } catch (err) {
      setSubmitting(false);
      setError(
        err instanceof Error ? err.message : "Failed to attach payment method"
      );
      return;
    }

    setSubmitting(false);
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cardholder-name">Cardholder name</Label>
        <Input
          id="cardholder-name"
          type="text"
          autoComplete="cc-name"
          placeholder="Full name on card"
          value={cardholderName}
          onChange={(e) => setCardholderName(e.target.value)}
          aria-invalid={fieldErrors.name ? true : undefined}
          disabled={submitting}
        />
        {fieldErrors.name && (
          <p className="text-sm text-red-600">{fieldErrors.name}</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cardholder-email">Email for receipts</Label>
        <Input
          id="cardholder-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={cardholderEmail}
          onChange={(e) => setCardholderEmail(e.target.value)}
          aria-invalid={fieldErrors.email ? true : undefined}
          disabled={submitting}
        />
        {fieldErrors.email && (
          <p className="text-sm text-red-600">{fieldErrors.email}</p>
        )}
      </div>
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!stripe || submitting}>
          {submitting ? "Saving..." : "Save card"}
        </Button>
      </div>
    </form>
  );
}

export function CardSetupForm({ onSuccess, onCancel }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [prefillEmail, setPrefillEmail] = useState<string | undefined>(
    undefined
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const didFetch = useRef(false);

  useEffect(() => {
    if (didFetch.current) return;
    didFetch.current = true;
    fetch("/api/billing/setup-intent", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error ?? "Failed to start setup");
        }
        return res.json();
      })
      .then((data) => {
        setClientSecret(data.clientSecret);
        setPublishableKey(data.publishableKey);
        setPrefillEmail(data.prefillEmail ?? undefined);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  if (loadError) {
    return <p className="text-sm text-red-600">{loadError}</p>;
  }

  if (!clientSecret || !stripePromise) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{ clientSecret, appearance: { theme: "stripe" } }}
    >
      <InnerForm
        onSuccess={onSuccess}
        onCancel={onCancel}
        initialEmail={prefillEmail}
      />
    </Elements>
  );
}
