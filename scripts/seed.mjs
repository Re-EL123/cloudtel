#!/usr/bin/env node
/**
 * Apply database/seeds/*.sql in order. Development only - never point at production.
 * Usage: DATABASE_URL=postgres://... node scripts/seed.mjs [file.sql]
 */
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedsDir = path.join(root, "database/seeds");

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("seed: DATABASE_URL is required");
  process.exit(1);
}
if (/prod/i.test(databaseUrl) || process.env.ALLOW_PRODUCTION_SEED !== "yes") {
  if (process.env.NODE_ENV === "production") {
    console.error("seed: refusing to seed a production database");
    process.exit(1);
  }
}

const only = process.argv[2];
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

try {
  let files = (await readdir(seedsDir)).filter((f) => f.endsWith(".sql")).sort();
  if (only) files = files.filter((f) => f === only);
  if (files.length === 0) {
    console.error("seed: no matching seed files");
    process.exit(1);
  }
  for (const file of files) {
    if (!only && file !== "development.sql" && process.env.INCLUDE_ALL_SEEDS !== "yes") {
      console.log(`skip      ${file} (set INCLUDE_ALL_SEEDS=yes to run non-development seeds)`);
      continue;
    }
    const sql = await readFile(path.join(seedsDir, file), "utf8");
    console.log(`run       ${file}`);
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`seed ${file} failed: ${err.message}`);
    }
  }
  console.log("seed: complete");
} finally {
  await client.end();
}
