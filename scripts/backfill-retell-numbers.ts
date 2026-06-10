/**
 * Backfill `retell_numbers` from `company_agents` (PRD #41, fase 1).
 *
 * Inserts one row per existing `company_agents` row (preserving
 * `company_id` + `agent_id`), with `enabled = true`.
 *
 * `phone_number` is only assigned from `companies.retell_phone_number`
 * when the pairing is unambiguous: the company has EXACTLY 1 agent and
 * `retell_phone_number` is not null. Any ambiguity (multiple agents, or
 * no number) → phone_number stays NULL for manual fixup.
 *
 * Idempotent: `ON CONFLICT (agent_id) DO NOTHING` — safe to re-run.
 *
 * Run with: npx tsx scripts/backfill-retell-numbers.ts
 */
import "dotenv/config";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set (checked .env and the shell).");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  console.log("connected ✔");

  try {
    // `retell_numbers.id` is a text PK whose default lives in the app
    // layer ($defaultFn), not in the DB — generate it here.
    const insertRes = await client.query(
      `INSERT INTO retell_numbers (id, company_id, agent_id, phone_number, enabled)
       SELECT
         gen_random_uuid()::text,
         ca.company_id,
         ca.agent_id,
         CASE
           WHEN cnt.agent_count = 1 THEN c.retell_phone_number
           ELSE NULL
         END,
         true
       FROM company_agents ca
       JOIN companies c ON c.id = ca.company_id
       JOIN (
         SELECT company_id, COUNT(*) AS agent_count
         FROM company_agents
         GROUP BY company_id
       ) cnt ON cnt.company_id = ca.company_id
       ON CONFLICT (agent_id) DO NOTHING`
    );
    console.log(`inserted ${insertRes.rowCount} row(s) ✔`);

    // ── Verification counts ─────────────────────────────────────
    const totals = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(phone_number)::int AS with_phone,
         (COUNT(*) - COUNT(phone_number))::int AS without_phone
       FROM retell_numbers`
    );
    const { total, with_phone, without_phone } = totals.rows[0];
    console.log("\n── retell_numbers verification ──");
    console.log(`total rows:        ${total}`);
    console.log(`rows with phone:   ${with_phone}`);
    console.log(`rows without phone: ${without_phone}`);

    const missing = await client.query(
      `SELECT c.name, ARRAY_AGG(rn.agent_id ORDER BY rn.agent_id) AS agent_ids
       FROM retell_numbers rn
       JOIN companies c ON c.id = rn.company_id
       WHERE rn.phone_number IS NULL
       GROUP BY c.name
       ORDER BY c.name`
    );
    if (missing.rows.length === 0) {
      console.log("\nNo rows missing phone_number ✔");
    } else {
      console.log("\nCompanies with rows missing phone_number (manual fixup):");
      for (const row of missing.rows) {
        console.log(`  - ${row.name}: ${row.agent_ids.join(", ")}`);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Backfill failed:\n");
  console.error(err);
  process.exit(1);
});
