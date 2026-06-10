CREATE TABLE "retell_numbers" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"phone_number" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retell_numbers" ADD CONSTRAINT "retell_numbers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "retell_numbers_agent_id_idx" ON "retell_numbers" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retell_numbers_phone_number_idx" ON "retell_numbers" USING btree ("phone_number");