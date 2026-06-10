ALTER TABLE "companies" ALTER COLUMN "notification_phones" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "notification_phones_new" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "companies" SET "notification_phones_new" = COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('phone', p, 'note', '', 'disabled', false))
    FROM unnest("notification_phones") AS p
  ),
  '[]'::jsonb
);--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "notification_phones";--> statement-breakpoint
ALTER TABLE "companies" RENAME COLUMN "notification_phones_new" TO "notification_phones";
