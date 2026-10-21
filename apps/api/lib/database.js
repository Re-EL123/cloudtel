/**
 * PostgreSQL access for serverless functions.
 * The pool is cached on globalThis so warm invocations reuse connections.
 * Never rely on module-level data for application state (spec §15.2).
 */
import pg from "pg";

const { Pool } = pg;

const POOL_KEY = Symbol.for("cloudtel.pg.pool");

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }
  return new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX || 3),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: process.env.PG_SSL === "disable" ? false : { rejectUnauthorized: false },
    application_name: "cloudtel-api",
  });
}

export function getDb() {
  const store = globalThis[POOL_KEY] || (globalThis[POOL_KEY] = {});
  if (!store.pool) store.pool = createPool();
  return store.pool;
}

export async function query(text, params) {
  return getDb().query(text, params);
}

/** Run work inside a transaction; rolls back on any thrown error. */
export async function withTransaction(fn) {
  const db = getDb();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection already broken */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Liveness probe helper used by the health endpoint. */
export async function pingDb() {
  const started = Date.now();
  await query("SELECT 1");
  return { ok: true, latencyMs: Date.now() - started };
}
