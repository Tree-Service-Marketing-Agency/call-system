CREATE TYPE "public"."billing_status" AS ENUM('idle', 'charging', 'payment_pending', 'uncollectible');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'failed', 'uncollectible', 'creation_failed');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('call_charge');--> statement-breakpoint
CREATE TYPE "public"."ledger_status" AS ENUM('pending', 'reserved', 'paid');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('root', 'admin', 'staff_admin', 'staff');--> statement-breakpoint
CREATE TABLE "billing_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"call_id" text NOT NULL,
	"call_row_id" text NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "ledger_status" DEFAULT 'pending' NOT NULL,
	"invoice_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_config" (
	"id" text PRIMARY KEY NOT NULL,
	"price_per_call_cents" integer DEFAULT 100 NOT NULL,
	"billing_threshold_cents" integer DEFAULT 5000 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"company_id" text,
	"customer_name" text,
	"customer_phone" text,
	"customer_address" text,
	"customer_zipcode" text,
	"customer_city" text,
	"service" text,
	"summary" text,
	"call_date" text,
	"event" text,
	"retell_event" text,
	"call_status" text,
	"disconnection_reason" text,
	"start_timestamp" bigint,
	"end_timestamp" bigint,
	"duration_ms" integer,
	"audio_url" text,
	"retell_cost" text,
	"billing_price_cents" integer,
	"billing_counted_at" timestamp,
	"invoice_id" text,
	"webhook1_received" boolean DEFAULT false NOT NULL,
	"webhook2_received" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"stripe_customer_id" text,
	"stripe_payment_method_id" text,
	"billing_status" "billing_status" DEFAULT 'idle' NOT NULL,
	"current_balance_cents" integer DEFAULT 0 NOT NULL,
	"billing_updated_at" timestamp,
	"last_no_payment_warning_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"agent_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"stripe_invoice_id" text,
	"amount_cents" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp,
	"hosted_invoice_url" text,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	"failed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"role" "user_role" NOT NULL,
	"company_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_call_row_id_calls_id_fk" FOREIGN KEY ("call_row_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_config" ADD CONSTRAINT "business_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_agents" ADD CONSTRAINT "company_agents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_ledger_call_entry_idx" ON "billing_ledger" USING btree ("call_id","entry_type");--> statement-breakpoint
CREATE INDEX "billing_ledger_company_status_created_idx" ON "billing_ledger" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "billing_ledger_invoice_id_idx" ON "billing_ledger" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_call_id_agent_id_idx" ON "calls" USING btree ("call_id","agent_id");--> statement-breakpoint
CREATE INDEX "calls_invoice_id_idx" ON "calls" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "companies_billing_status_idx" ON "companies" USING btree ("billing_status");--> statement-breakpoint
CREATE INDEX "companies_current_balance_idx" ON "companies" USING btree ("current_balance_cents");--> statement-breakpoint
CREATE UNIQUE INDEX "company_agents_agent_id_idx" ON "company_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_idx" ON "invoices" USING btree ("stripe_invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_company_status_created_idx" ON "invoices" USING btree ("company_id","status","created_at");