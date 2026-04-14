import "dotenv/config";
import bcryptjs from "bcryptjs";
import { db } from "../../lib/db";
import { runBillingChargeForCompany } from "../../lib/billing/charge-cron";
import { insertCallChargeLedgerEntry } from "../../lib/billing/ledger";
import { calls, companies, companyAgents, users } from "../../lib/db/schema";

type Options = {
  calls: number;
  namePrefix: string;
  priceCents?: number;
  withStripe: boolean;
  runBilling: boolean;
  stripeCustomerId?: string;
  stripePaymentMethodId?: string;
};

function usage() {
  console.log(`Usage:
  npx tsx scripts/dev/seed-billing-scenario.ts [options]

Options:
  --calls <n>                    Number of billable calls to create (default: 10)
  --name <prefix>                Company name prefix (default: "Billing Seed")
  --price <cents>                Override price per call in cents
  --with-stripe                  Store Stripe customer/payment method IDs on the company
  --stripe-customer-id <id>      Stripe customer ID to use with --with-stripe
                                 Defaults to SEED_STRIPE_CUSTOMER_ID if present
  --stripe-payment-method-id <id>
                                 Stripe payment method ID to use with --with-stripe
                                 Defaults to SEED_STRIPE_PAYMENT_METHOD_ID if present
  --run-billing                  Run the billing charge flow for the seeded company
  --help                         Show this message

Examples:
  npx tsx scripts/dev/seed-billing-scenario.ts
  npx tsx scripts/dev/seed-billing-scenario.ts --calls 12 --price 250
  npx tsx scripts/dev/seed-billing-scenario.ts --with-stripe \\
    --stripe-customer-id cus_123 --stripe-payment-method-id pm_123 --run-billing`);
}

function readFlag(args: string[], name: string): string | undefined {
  const exact = `--${name}`;
  const eqPrefix = `${exact}=`;
  const eqArg = args.find((arg) => arg.startsWith(eqPrefix));
  if (eqArg) return eqArg.slice(eqPrefix.length);

  const index = args.indexOf(exact);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function parseOptions(argv: string[]): Options {
  if (hasFlag(argv, "help")) {
    usage();
    process.exit(0);
  }

  const callCountRaw = readFlag(argv, "calls");
  const priceRaw = readFlag(argv, "price");
  const namePrefix = readFlag(argv, "name") ?? "Billing Seed";
  const withStripe = hasFlag(argv, "with-stripe");
  const runBilling = hasFlag(argv, "run-billing");
  const stripeCustomerId =
    readFlag(argv, "stripe-customer-id") ?? process.env.SEED_STRIPE_CUSTOMER_ID;
  const stripePaymentMethodId =
    readFlag(argv, "stripe-payment-method-id") ??
    process.env.SEED_STRIPE_PAYMENT_METHOD_ID;

  const calls = callCountRaw ? Number(callCountRaw) : 10;
  if (!Number.isInteger(calls) || calls <= 0) {
    throw new Error("--calls must be a positive integer");
  }

  const priceCents =
    priceRaw === undefined || priceRaw === ""
      ? undefined
      : Number(priceRaw);
  if (
    priceCents !== undefined &&
    (!Number.isInteger(priceCents) || priceCents <= 0)
  ) {
    throw new Error("--price must be a positive integer amount in cents");
  }

  if (runBilling && !withStripe) {
    throw new Error("--run-billing requires --with-stripe");
  }

  if (
    withStripe &&
    (!stripeCustomerId || !stripePaymentMethodId)
  ) {
    throw new Error(
      "--with-stripe requires --stripe-customer-id and --stripe-payment-method-id"
    );
  }

  if (runBilling && !process.env.STRIPE_SECRET_KEY) {
    throw new Error("--run-billing requires STRIPE_SECRET_KEY in the environment");
  }

  return {
    calls,
    namePrefix,
    priceCents,
    withStripe,
    runBilling,
    stripeCustomerId,
    stripePaymentMethodId,
  };
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

function buildScenarioName(prefix: string): string {
  const now = new Date();
  return `${prefix} ${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const hashedPassword = await bcryptjs.hash("admin123", 10);

  const config = await db.query.businessConfig.findFirst();
  const thresholdCents = config?.billingThresholdCents ?? 5000;
  const configuredPriceCents = config?.pricePerCallCents ?? 100;
  const minimumPriceForThreshold = Math.ceil(thresholdCents / options.calls);
  const priceCents =
    options.priceCents ??
    (options.runBilling
      ? Math.max(configuredPriceCents, minimumPriceForThreshold)
      : configuredPriceCents);
  const companyName = buildScenarioName(options.namePrefix);
  const agentId = `agent_seed_${crypto.randomUUID().slice(0, 12)}`;
  const adminEmail = `staff-admin+${crypto.randomUUID().slice(0, 8)}@test.com`;
  const createdCallIds: Array<{ rowId: string; callId: string }> = [];
  const totalCents = priceCents * options.calls;

  const result = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        name: companyName,
        stripeCustomerId: options.withStripe ? options.stripeCustomerId! : null,
        stripePaymentMethodId: options.withStripe
          ? options.stripePaymentMethodId!
          : null,
        billingStatus: "idle",
        currentBalanceCents: totalCents,
        billingUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: companies.id, name: companies.name });

    await tx.insert(companyAgents).values({
      companyId: company.id,
      agentId,
    });

    const [staffAdmin] = await tx
      .insert(users)
      .values({
        email: adminEmail,
        password: hashedPassword,
        role: "staff_admin",
        companyId: company.id,
        isActive: true,
      })
      .returning({ id: users.id, email: users.email });

    for (let index = 0; index < options.calls; index++) {
      const startedAt = new Date(Date.now() - (options.calls - index) * 60_000);
      const durationMs = 45_000 + index * 1_000;
      const endedAt = new Date(startedAt.getTime() + durationMs);
      const callId = `call_seed_${crypto.randomUUID().replace(/-/g, "")}`;

      const insertedCall = await tx
        .insert(calls)
        .values({
          callId,
          agentId,
          companyId: company.id,
          customerName: `Test Customer ${index + 1}`,
          customerPhone: `+1555000${pad(index + 1)}${pad(index + 11)}`,
          customerCity: "Mexico City",
          customerZipcode: "01000",
          customerAddress: `${100 + index} Billing Ave`,
          service: "Seeded billing scenario",
          summary: "Synthetic billable call for invoice testing",
          callDate: startedAt.toISOString(),
          event: "seeded_call",
          retellEvent: "call_ended",
          callStatus: "ended",
          disconnectionReason: "user_hangup",
          startTimestamp: startedAt.getTime(),
          endTimestamp: endedAt.getTime(),
          durationMs,
          audioUrl: `https://example.test/audio/${callId}.mp3`,
          retellCost: JSON.stringify({ total_cost: "0.01", currency: "usd" }),
          billingPriceCents: priceCents,
          billingCountedAt: endedAt,
          webhook1Received: true,
          webhook2Received: true,
          createdAt: startedAt,
          updatedAt: endedAt,
        })
        .returning({ id: calls.id, callId: calls.callId });

      await insertCallChargeLedgerEntry(tx, {
        companyId: company.id,
        callId,
        callRowId: insertedCall[0].id,
        amountCents: priceCents,
      });

      createdCallIds.push({
        rowId: insertedCall[0].id,
        callId: insertedCall[0].callId,
      });
    }

    return { company, staffAdmin };
  });

  let chargeResult: Awaited<ReturnType<typeof runBillingChargeForCompany>> | null =
    null;
  if (options.runBilling) {
    chargeResult = await runBillingChargeForCompany({
      companyId: result.company.id,
      runId: crypto.randomUUID(),
      triggeredBy: "manual",
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId: result.company.id,
        companyName: result.company.name,
        agentId,
        staffAdminUserId: result.staffAdmin.id,
        staffAdminEmail: result.staffAdmin.email,
        staffAdminPassword: "admin123",
        priceCents,
        thresholdCents,
        callCount: options.calls,
        totalCents,
        stripeAttached: options.withStripe,
        callRowIds: createdCallIds.map((call) => call.rowId),
        callIds: createdCallIds.map((call) => call.callId),
        billingRun: chargeResult
          ? {
              ok: chargeResult.ok,
              invoiceId: chargeResult.invoiceId ?? null,
            }
          : null,
      },
      null,
      2
    )
  );

  if (!options.withStripe) {
    console.log(
      "Seed completed without Stripe IDs. The company is ready for local DB inspection, but billing charge runs will skip it until you attach real Stripe IDs."
    );
  }
}

main().catch((error) => {
  console.error(
    "[seed-billing-scenario] failed",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
