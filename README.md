# Call System

Next.js app for managing Retell call ingestion, per-company billing, and Stripe invoicing.

## Getting Started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Environment variables are read from `.env`. For scripts that run outside of Next.js, use Node's native `--env-file` flag (requires Node >= 20.6):

```bash
npx tsx --env-file=.env <script>
```

## Scripts

### App

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Next.js dev server on `localhost:3000`. |
| `npm run build` | Build the production bundle. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint over the repo. |

### Database (Drizzle)

All of these read `DATABASE_URL` from `.env`.

| Command | What it does |
| --- | --- |
| `npm run db:generate` | Generate SQL migration files from the Drizzle schema diff. |
| `npm run db:migrate` | Apply pending migrations to the target database. |
| `npm run db:push` | Push the current schema directly (no migration files — dev only). |
| `npm run db:studio` | Open Drizzle Studio to browse the DB in a web UI. |
| `npm run db:seed` | Insert the base `root@callsystem.com` user and a default `business_config` row (`pricePerCallCents=100`, `billingThresholdCents=5000`). Run once on a fresh database. |

Example:

```bash
npm run db:migrate
npm run db:seed
```

### Billing test helpers (`scripts/dev/`)

These scripts live outside the Next.js runtime. Run them with `npx tsx --env-file=.env`.

#### `seed-billing-scenario.ts`

Creates an **entire test scenario from scratch**: a new company, a staff-admin user, a fake agent, N billable calls, and matching ledger entries. Useful for testing the full billing flow end-to-end on a clean database.

| Flag | Description |
| --- | --- |
| `--calls <n>` | Number of calls to create (default: 10). |
| `--name <prefix>` | Prefix for the generated company name (default: `"Billing Seed"`). |
| `--price <cents>` | Override price per call in cents. Defaults to `business_config.pricePerCallCents`; when `--run-billing` is set, raises to at least the threshold. |
| `--with-stripe` | Attach Stripe customer + payment method IDs to the new company. |
| `--stripe-customer-id <id>` | Stripe customer ID (required with `--with-stripe`, defaults to `SEED_STRIPE_CUSTOMER_ID`). |
| `--stripe-payment-method-id <id>` | Stripe payment method ID (required with `--with-stripe`, defaults to `SEED_STRIPE_PAYMENT_METHOD_ID`). |
| `--run-billing` | After seeding, run `runBillingChargeForCompany` for the new company. Requires `--with-stripe` and `STRIPE_SECRET_KEY`. |

There are two convenience npm aliases:

- `npm run billing:seed-scenario` — bare seed, no Stripe.
- `npm run billing:seed-and-run` — `--with-stripe --run-billing` (expects `SEED_STRIPE_CUSTOMER_ID`, `SEED_STRIPE_PAYMENT_METHOD_ID`, and `STRIPE_SECRET_KEY` in env).

Examples:

```bash
npm run billing:seed-scenario -- --calls 12 --price 250

npx tsx --env-file=.env scripts/dev/seed-billing-scenario.ts \
  --with-stripe \
  --stripe-customer-id cus_123 \
  --stripe-payment-method-id pm_123 \
  --run-billing
```

#### `seed-calls-for-company.ts`

Appends N mock calls to an **existing** company — does not create new companies. Useful for quickly pushing an existing company's balance past the threshold so you can test a charge run.

It reuses the first agent already linked to the company in `company_agents`, reads the per-call price from `business_config.pricePerCallCents`, inserts the calls + ledger entries inside one transaction, and bumps `companies.current_balance_cents` by `calls * price`. It does **not** trigger the billing charge — run the cron afterwards via the "Run billing now" button in `/billing` (as root or agency) or `POST /api/billing/run-cron`.

| Flag | Description |
| --- | --- |
| `--company-id <id>` | Existing company ID (required). |
| `--calls <n>` | Number of mock calls to create (required, positive integer). |

Example:

```bash
npx tsx --env-file=.env scripts/dev/seed-calls-for-company.ts \
  --company-id adeab777-a5c3-4a62-bf41-6ad3e9659ce4 \
  --calls 30
```

The script prints JSON with the new balance, threshold, whether the balance crosses the threshold, and the IDs of the created calls. If the company is missing Stripe IDs or the new balance stays below the threshold, it prints a warning at the end.
