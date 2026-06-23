ALTER TABLE "text_agents" ADD COLUMN "embed_key" text;--> statement-breakpoint
UPDATE "text_agents" SET "embed_key" = replace(gen_random_uuid()::text, '-', '') WHERE "embed_key" IS NULL;--> statement-breakpoint
ALTER TABLE "text_agents" ALTER COLUMN "embed_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "text_agents" ADD CONSTRAINT "text_agents_embed_key_unique" UNIQUE("embed_key");--> statement-breakpoint
ALTER TABLE "text_agents" ADD COLUMN "allowed_origins" jsonb DEFAULT '[]'::jsonb NOT NULL;
