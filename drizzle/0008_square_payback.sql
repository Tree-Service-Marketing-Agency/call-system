ALTER TABLE "companies" ALTER COLUMN "notification_phones" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "notification_phones" SET DATA TYPE jsonb USING COALESCE(
  (
    SELECT jsonb_agg(jsonb_build_object('phone', p, 'note', '', 'disabled', false))
    FROM unnest("notification_phones") AS p
  ),
  '[]'::jsonb
);--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "notification_phones" SET DEFAULT '[]'::jsonb;
