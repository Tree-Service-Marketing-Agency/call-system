ALTER TABLE "companies" ADD COLUMN "notification_phones" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "lead_snap_webhook" text;