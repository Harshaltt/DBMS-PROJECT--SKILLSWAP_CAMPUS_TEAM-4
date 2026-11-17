import { route, json, readBody } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { getPool } from '@/lib/db.mjs';
import { showcaseQueries } from '@/lib/showcase.mjs';
import { runIntegrityTests, integrityTests } from '@/lib/integrityTests.mjs';

// GET /api/admin/db-lab -> catalogue of showcase queries and tests
export const GET = route(async () => {
  return json({
    queries: showcaseQueries.map(({ id, title, concepts, sql, pre, note }) => ({ id, title, concepts, sql, pre, note })),
    tests: integrityTests.map(({ id, group, name, expect, sql }) => ({ id, group, name, expect, sql })),
  });
}, { roles: ['admin', 'staff'] });

async function runReadOnly(statements, sql) {
  const client = await getPool().connect();
  const started = Date.now();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '5s'");
    for (const s of statements) await client.query(s);
    // extended protocol => exactly ONE statement can be executed
    const res = await client.query({ text: sql, queryMode: 'extended' });
    return {
      columns: res.fields.map((f) => f.name),
      rows: res.rows.slice(0, 200),
      rowCount: res.rowCount ?? res.rows.length,
      ms: Date.now() - started,
    };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

// POST /api/admin/db-lab
//   { kind: 'query', id }  -> run a showcase query
//   { kind: 'tests' }      -> run the integrity suite (always rolled back)
//   { kind: 'sql', sql }   -> admin-only read-only SQL console
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  if (b.kind === 'tests') {
    const client = await getPool().connect();
    try {
      const started = Date.now();
      const results = await runIntegrityTests(client);
      return json({ results, ms: Date.now() - started });
    } finally {
      client.release();
    }
  }
  if (b.kind === 'query') {
    const q = showcaseQueries.find((x) => x.id === b.id);
    if (!q) throw new ApiError(404, 'Unknown query.');
    return json(await runReadOnly(q.pre || [], q.sql));
  }
  if (b.kind === 'sql') {
    if (user.role !== 'admin') throw new ApiError(403, 'The SQL console is for administrators only.');
    const sql = String(b.sql ?? '').trim().replace(/;\s*$/, '');
    if (!sql) throw new ApiError(400, 'Type a query first.');
    return json(await runReadOnly([], sql));
  }
  throw new ApiError(400, 'Unknown request.');
}, { roles: ['admin', 'staff'] });
