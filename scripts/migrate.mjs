#!/usr/bin/env node
/**
 * Apply database/migrations/*.sql in order, tracking applied versions.
 * Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs [--dry-run]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "database/migrations");
const dryRun = process.argv.includes("--dry-run");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("migrate: DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version)
  );
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

  let ran = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (applied.has(version)) {
      console.log(`skip      ${version}`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    if (dryRun) {
      console.log(`would run ${version}`);
      continue;
    }
    console.log(`run       ${version}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      ran += 1;
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${version} failed: ${err.message}`);
    }
  }
  console.log(dryRun ? "migrate: dry run complete" : `migrate: ${ran} migration(s) applied`);
} finally {
  await client.end();
}
