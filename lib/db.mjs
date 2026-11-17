// =====================================================================
// Database access layer (node-postgres).
// - ONE connection pool per server process (re-used across hot reloads)
// - Configuration comes ONLY from environment variables (never hard-coded)
// - Every query is parameterised ($1, $2 ...) -> no SQL injection
// =====================================================================
import pg from 'pg';

const { Pool, types } = pg;

// Return NUMERIC and BIGINT (COUNT/SUM) as JS numbers, and TIMESTAMP/DATE as
// the exact text Postgres stored, so no silent time-zone shifting happens
// between the database, Node and the browser.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8
types.setTypeParser(1114, (v) => v); // timestamp without time zone
types.setTypeParser(1082, (v) => v); // date

export const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in (see README).'
    );
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: 30_000,
  });
  // "Now" in the database must mean campus local time, because session
  // times are stored as local TIMESTAMPs.
  pool.on('connect', (client) => {
    client.query(`SET TIME ZONE '${APP_TIMEZONE.replace(/'/g, '')}'`).catch(() => {});
  });
  return pool;
}

export function getPool() {
  if (!globalThis.__skillswapPool) globalThis.__skillswapPool = createPool();
  return globalThis.__skillswapPool;
}

/** Run one parameterised statement and return the pg result. */
export async function query(text, params = []) {
  return getPool().query(text, params);
}

/**
 * Run `fn(client)` inside a single database TRANSACTION.
 *   BEGIN -> (record the acting user for triggers) -> fn -> COMMIT
 * Any error anywhere -> ROLLBACK, so the database never sees half an operation.
 */
export async function withTransaction(actorId, fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    if (actorId) {
      // transaction-local setting read by fn_current_actor() in triggers
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(actorId)]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
