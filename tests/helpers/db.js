/**
 * Integration-test database lifecycle.
 *
 * Integration and security tests only run when DATABASE_URL is set (see
 * scripts/test.sh). This helper:
 *
 *   - skips (rather than fails) the whole file when DATABASE_URL is absent,
 *   - resets transient tables between runs,
 *   - applies migrations + seeds via the existing CLI scripts,
 *   - exposes `withDb`, `resetTransient`, and the seeded fixture ids.
 *
 * Run against a throwaway database only (e.g. a CI service container):
 *   DATABASE_URL=postgres://.../cloudtel_test npm run test:integration
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDb, query } from "../../apps/api/lib/database.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export const FIXTURES = {
  org: {
    demo: "11111111-1111-4111-8111-111111111111",
    acme: "22222222-2222-4222-8222-222222222222",
  },
  user: {
    owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    admin: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    agent: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    acmeOwner: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    platform: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  },
  extension: {
    owner: "e0000000-0000-4000-8000-000000000001",
    admin: "e0000000-0000-4000-8000-000000000002",
    agent: "e0000000-0000-4000-8000-000000000003",
    acme: "e0000000-0000-4000-8000-000000000004",
  },
  email: {
    owner: "owner@demo.cloudtel.test",
    admin: "admin@demo.cloudtel.test",
    agent: "agent@demo.cloudtel.test",
    acmeOwner: "owner@acme.cloudtel.test",
    platform: "platform@cloudtel.test",
  },
  password: "CloudTel!Demo2026",
};

function runScript(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, "scripts", script), ...args], {
    cwd: repoRoot,
    env: process.env,
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`${script} failed: ${result.stderr?.toString() || result.stdout?.toString()}`);
  }
}

/** Apply numbered migrations then the development seed. Idempotent. */
export async function prepareDatabase() {
  runScript("migrate.mjs");
  process.env.INCLUDE_ALL_SEEDS = "yes";
  runScript("seed.mjs", ["development.sql"]);
}

/** Delete durable counters/sessions so rate limits don't leak between tests. */
export async function resetTransient() {
  await query("DELETE FROM rate_limit_counters");
  await query("DELETE FROM sessions");
}

/** Close the shared pool so the test process can exit cleanly. */
export async function closeDatabase() {
  if (!hasDatabase) return;
  try {
    await getDb().end();
  } catch {
    /* pool may already be closed */
  }
}
