/**
 * Placeholder notification layer. Emits structured JSON logs that a future
 * NotificationService (email/Slack/in-app) can replace without callers having
 * to change. The shapes match PRD section 18.
 */

type Severity = "info" | "warning" | "critical";

export function formatUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function notifyRoot(payload: {
  event: string;
  severity: Severity;
  [key: string]: unknown;
}) {
  console.log("[BILLING_NOTIFY:ROOT]", JSON.stringify(payload));
}

export function notifyStaffAdmin(payload: {
  event: string;
  severity: Severity;
  recipient_company_id: string;
  [key: string]: unknown;
}) {
  console.log("[BILLING_NOTIFY:STAFF_ADMIN]", JSON.stringify(payload));
}

export function notifyPaymentFailed(args: {
  companyId: string;
  companyName: string;
  invoiceId: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  attemptCount: number;
  nextAttemptAtIso: string | null;
  customerPortalUrl: string | null;
}) {
  const amountUsd = formatUsd(args.amountCents);

  notifyRoot({
    event: "payment_failed",
    severity: "warning",
    company_id: args.companyId,
    company_name: args.companyName,
    invoice_id: args.invoiceId,
    stripe_invoice_id: args.stripeInvoiceId,
    amount_usd: amountUsd,
    attempt_count: args.attemptCount,
    next_attempt_at_iso: args.nextAttemptAtIso,
    message: `Cobro fallido para ${args.companyName}. Intento ${args.attemptCount}.`,
  });

  notifyStaffAdmin({
    event: "payment_failed",
    severity: "warning",
    recipient_company_id: args.companyId,
    amount_usd: amountUsd,
    customer_portal_url: args.customerPortalUrl,
    message:
      "Tu cobro falló. Actualiza tu tarjeta para evitar interrupciones.",
  });
}

export function notifyUncollectible(args: {
  companyId: string;
  companyName: string;
  invoiceId: string;
  stripeInvoiceId: string | null;
  amountCents: number;
  totalAttempts: number;
  customerPortalUrl: string | null;
}) {
  const amountUsd = formatUsd(args.amountCents);

  notifyRoot({
    event: "uncollectible",
    severity: "critical",
    company_id: args.companyId,
    company_name: args.companyName,
    invoice_id: args.invoiceId,
    stripe_invoice_id: args.stripeInvoiceId,
    amount_usd: amountUsd,
    total_attempts: args.totalAttempts,
    message: `Invoice incobrable tras todos los reintentos. Acción manual requerida para ${args.companyName}.`,
  });

  notifyStaffAdmin({
    event: "uncollectible",
    severity: "critical",
    recipient_company_id: args.companyId,
    amount_usd: amountUsd,
    customer_portal_url: args.customerPortalUrl,
    message:
      "No pudimos cobrar tu factura tras varios intentos. Contacta a soporte para regularizar.",
  });
}

export function notifyNoPaymentMethod(args: {
  companyId: string;
  companyName: string;
  balanceCents: number;
  thresholdCents: number;
}) {
  const balanceUsd = formatUsd(args.balanceCents);
  const thresholdUsd = formatUsd(args.thresholdCents);

  notifyRoot({
    event: "no_payment_method",
    severity: "info",
    company_id: args.companyId,
    company_name: args.companyName,
    balance_usd: balanceUsd,
    threshold_usd: thresholdUsd,
    message: `${args.companyName} cruzó el umbral pero no tiene tarjeta guardada.`,
  });

  notifyStaffAdmin({
    event: "no_payment_method",
    severity: "warning",
    recipient_company_id: args.companyId,
    balance_usd: balanceUsd,
    threshold_usd: thresholdUsd,
    setup_url: "/billing",
    message:
      "Tu compañía tiene un balance pendiente de cobro pero no tienes método de pago guardado. Agrega una tarjeta para evitar interrupciones.",
  });
}
