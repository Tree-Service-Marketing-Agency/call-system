-- ADR-003: Convert calls.retell_cost from text (JSON) to numeric (USD dollars).
--
-- Drizzle auto-generated `ALTER TYPE ... USING retell_cost::numeric` here,
-- which fails because the existing column stores JSON.stringify of Retell's
-- call_cost object — not castable to numeric. Replaced with a rename + add
-- pattern. The legacy column preserves data for the one-shot backfill
-- (scripts/backfill-retell-cost.ts), which extracts combined_cost (cents)
-- and writes the converted dollar value to the new column. After the
-- backfill is verified, drop the legacy column.

ALTER TABLE "calls" RENAME COLUMN "retell_cost" TO "retell_cost_legacy";--> statement-breakpoint
ALTER TABLE "calls" ADD COLUMN "retell_cost" numeric(10, 6);
