ALTER TABLE "business_config" DROP COLUMN "billing_threshold_cents";--> statement-breakpoint
ALTER TABLE "business_config" ADD COLUMN "billing_threshold_calls" integer DEFAULT 25 NOT NULL;
