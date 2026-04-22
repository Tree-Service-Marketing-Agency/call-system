import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { insertCallChargeLedgerEntry } from "../../lib/billing/ledger";
import {
  calls,
  companies,
  companyAgents,
  businessConfig,
} from "../../lib/db/schema";

type Options = {
  companyId: string;
  calls: number;
};

function usage() {
  console.log(`Usage:
  npx tsx --env-file=.env scripts/dev/seed-calls-for-company.ts --company-id <id> --calls <n>

Options:
  --company-id <id>   Existing company ID to attach seeded calls to (required)
  --calls <n>         Number of mock calls to create (required, positive int)
  --help              Show this message

Env:
  Reads DATABASE_URL from the environment. Use Node's --env-file flag
  (Node >= 20.6) or export the variable manually before running.

Notes:
  - Reuses the first agent already linked to the company in company_agents.
  - Reads price per call from business_config.price_per_call_cents.
  - Bumps companies.current_balance_cents by calls * price.
  - Does NOT run the billing charge. Trigger it afterwards via the
    /billing "Run billing now" button or POST /api/billing/run-cron.`);
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

  const companyId = readFlag(argv, "company-id");
  if (!companyId) {
    throw new Error("--company-id is required");
  }

  const callsRaw = readFlag(argv, "calls");
  if (!callsRaw) {
    throw new Error("--calls is required");
  }
  const callCount = Number(callsRaw);
  if (!Number.isInteger(callCount) || callCount <= 0) {
    throw new Error("--calls must be a positive integer");
  }

  return { companyId, calls: callCount };
}

function pad(num: number): string {
  return String(num).padStart(2, "0");
}

async function main() {
  const options = parseOptions(process.argv.slice(2));

  const company = await db.query.companies.findFirst({
    where: eq(companies.id, options.companyId),
  });
  if (!company) {
    throw new Error(`Company not found: ${options.companyId}`);
  }

  const agentLink = await db.query.companyAgents.findFirst({
    where: eq(companyAgents.companyId, options.companyId),
  });
  if (!agentLink) {
    throw new Error(
      `Company ${options.companyId} has no agents in company_agents. ` +
        `Link an agent before seeding calls.`
    );
  }
  const agentId = agentLink.agentId;

  const config = await db.query.businessConfig.findFirst();
  if (!config) {
    throw new Error(
      "business_config row is missing. Run the base seed before seeding calls."
    );
  }
  const priceCents = config.pricePerCallCents;
  const thresholdCents = config.billingThresholdCents;
  const totalCents = priceCents * options.calls;
  const newBalanceCents = company.currentBalanceCents + totalCents;
  const crossesThreshold = newBalanceCents >= thresholdCents;

  const createdCallIds: Array<{ rowId: string; callId: string }> = [];

  await db.transaction(async (tx) => {
    for (let index = 0; index < options.calls; index++) {
      const startedAt = new Date(Date.now() - (options.calls - index) * 60_000);
      const durationMs = 45_000 + index * 1_000;
      const endedAt = new Date(startedAt.getTime() + durationMs);
      const callId = `call_seed_${crypto.randomUUID().replace(/-/g, "")}`;

      const inserted = await tx
        .insert(calls)
        .values({
          callId,
          agentId,
          companyId: options.companyId,
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
        companyId: options.companyId,
        callId,
        callRowId: inserted[0].id,
        amountCents: priceCents,
      });

      createdCallIds.push({
        rowId: inserted[0].id,
        callId: inserted[0].callId,
      });
    }

    await tx
      .update(companies)
      .set({
        currentBalanceCents: sql`${companies.currentBalanceCents} + ${totalCents}`,
        billingUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(companies.id, options.companyId));
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId: options.companyId,
        companyName: company.name,
        agentId,
        callCount: options.calls,
        priceCents,
        totalAddedCents: totalCents,
        previousBalanceCents: company.currentBalanceCents,
        newBalanceCents,
        thresholdCents,
        crossesThreshold,
        callRowIds: createdCallIds.map((c) => c.rowId),
        callIds: createdCallIds.map((c) => c.callId),
      },
      null,
      2
    )
  );

  if (!crossesThreshold) {
    console.log(
      `\nWarning: new balance (${newBalanceCents}¢) is below threshold ` +
        `(${thresholdCents}¢). The charge cron will skip this company until ` +
        `the balance crosses the threshold.`
    );
  }
  if (!company.stripeCustomerId || !company.stripePaymentMethodId) {
    console.log(
      "\nWarning: company is missing Stripe IDs. Attach a Stripe customer + " +
        "payment method before running the billing cron."
    );
  }
}

main().catch((error) => {
  console.error(
    "[seed-calls-for-company] failed",
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
