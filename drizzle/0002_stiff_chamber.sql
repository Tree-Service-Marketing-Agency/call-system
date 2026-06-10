ALTER TYPE "public"."ledger_status" ADD VALUE 'void';--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "billing_ledger" ADD CONSTRAINT "billing_ledger_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;