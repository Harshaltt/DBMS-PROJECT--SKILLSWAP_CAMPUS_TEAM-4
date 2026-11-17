// npm run db:test -> runs the integrity suite (always rolled back) and prints PASS/FAIL
import './load-env.mjs';
import pg from 'pg';
import { runIntegrityTests } from '../lib/integrityTests.mjs';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query(`SET TIME ZONE '${(process.env.APP_TIMEZONE || 'Asia/Kolkata').replace(/'/g, '')}'`);
try {
  const results = await runIntegrityTests(client);
  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n── ${group} ──`); }
    const tag = r.pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`${tag}  [${r.id}] ${r.name}`);
    console.log(`        expected ${r.expect.toUpperCase()}, got ${r.outcome.toUpperCase()}: ${r.message}`);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} tests passed (all changes rolled back).\n`);
  process.exitCode = passed === results.length ? 0 : 1;
} finally {
  await client.end();
}
