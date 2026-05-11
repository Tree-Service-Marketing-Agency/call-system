/**
 * One-shot backfill for ADR-003.
 *
 * Reads the legacy `calls.retell_cost_legacy` column (text JSON containing
 * Retell's full call_cost object with `combined_cost` in cents), extracts
 * combined_cost, converts cents -> USD dollars, and writes the result to the
 * new `calls.retell_cost` numeric column.
 *
 * Idempotent: rows where `retell_cost` is already set are skipped.
 * Safe: rows with missing/invalid JSON or no `combined_cost` are logged and
 * left as NULL.
 *
 * After this script completes successfully, drop the legacy column manually:
 *   psql $DATABASE_URL -c 'ALTER TABLE calls DROP COLUMN retell_cost_legacy;'
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/backfill-retell-cost.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../lib/db";

type LegacyRow = {
  id: string;
  retell_cost_legacy: string | null;
  [key: string]: unknown;
};

async function main() {
  const result = await db.execute<LegacyRow>(sql`
    SELECT id, retell_cost_legacy
      FROM calls
     WHERE retell_cost_legacy IS NOT NULL
       AND retell_cost IS NULL
  `);

  const rows = (result as unknown as { rows: LegacyRow[] }).rows ?? [];

  console.log(`[backfill-retell-cost] candidates: ${rows.length}`);

  let updated = 0;
  let skippedInvalid = 0;
  let skippedNoCost = 0;

  for (const row of rows) {
    if (!row.retell_cost_legacy) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(row.retell_cost_legacy);
    } catch {
      console.warn(`  ! invalid JSON in row ${row.id}, skipping`);
      skippedInvalid++;
      continue;
    }

    const combinedCost =
      parsed && typeof parsed === "object" && "combined_cost" in parsed
        ? (parsed as { combined_cost: unknown }).combined_cost
        : undefined;

    if (typeof combinedCost !== "number" || !Number.isFinite(combinedCost)) {
      console.warn(`  - no combined_cost in row ${row.id}, skipping`);
      skippedNoCost++;
      continue;
    }

    // combined_cost is in cents per Retell; new column is dollars.
    const dollars = combinedCost / 100;

    await db.execute(sql`
      UPDATE calls
         SET retell_cost = ${dollars.toString()}
       WHERE id = ${row.id}
    `);
    updated++;
  }

  console.log(`[backfill-retell-cost] updated:           ${updated}`);
  console.log(`[backfill-retell-cost] skipped (invalid): ${skippedInvalid}`);
  console.log(`[backfill-retell-cost] skipped (no cost): ${skippedNoCost}`);
  console.log(`[backfill-retell-cost] done`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
