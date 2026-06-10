/**
 * Drizzle migration runner — surfaces errors that the `drizzle-kit migrate`
 * CLI swallows.
 *
 * Why this exists: `drizzle-kit migrate`'s spinner view (`MigrateProgress`)
 * receives the error object but its `render(status, err)` implementation
 * discards `err` entirely, then calls `process.exit(1)` before the outer
 * `console.error` ever runs. Net effect: failed migrations exit with code 1
 * and zero diagnostic output. Confirmed against drizzle-kit 0.31.10.
 *
 * This script calls the *same* migrator the CLI calls internally
 * (`migrate()` from `drizzle-orm/node-postgres/migrator`), so behaviour
 * against `__drizzle_migrations` is identical — but real errors hit stderr.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
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
    await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
    console.log("migrations applied ✔");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Migration failed:\n");
  console.error(err);
  process.exit(1);
});
