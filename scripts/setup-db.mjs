// =====================================================================
//  npm run db:setup
//  1. creates the database if it does not exist
//  2. runs db/01..04 *.sql  (DDL, ALTER/DROP migrations, logic, vector layer)
//  3. seeds demo data
//  4. computes embeddings for every listing (pgvector)
// Safe to re-run: it rebuilds everything from scratch.
// =====================================================================
import './load-env.mjs';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { seed } from './seed.mjs';
import { embedAllMissing } from '../lib/embeddings.mjs';

const SQL_FILES = ['01_schema.sql', '02_migrations.sql', '03_features.sql', '04_vector.sql'];
const TZ = (process.env.APP_TIMEZONE || 'Asia/Kolkata').replace(/'/g, '');

async function connect(url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`SET TIME ZONE '${TZ}'`);
  client.on('notice', () => {}); // silence "does not exist, skipping" notices
  return client;
}

async function ensureDatabase(url) {
  try {
    const c = await connect(url);
    return c;
  } catch (err) {
    if (err.code !== '3D000') throw err; // 3D000 = database does not exist
    const u = new URL(url);
    const dbName = decodeURIComponent(u.pathname.slice(1));
    u.pathname = '/postgres';
    const admin = await connect(u.toString());
    console.log(`• creating database "${dbName}"`);
    await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
    await admin.end();
    return connect(url);
  }
}

const t0 = Date.now();
let client;
try {
  client = await ensureDatabase(process.env.DATABASE_URL);
  const { rows } = await client.query('SELECT version()');
  console.log(`• connected: ${rows[0].version.split(',')[0]}`);

  for (const f of SQL_FILES) {
    const sql = fs.readFileSync(path.join(process.cwd(), 'db', f), 'utf8');
    await client.query(sql);
    console.log(`• ran db/${f}`);
  }

  console.log('• seeding demo data ...');
  await seed(client, (m) => console.log(m));

  console.log('• computing embeddings (all-MiniLM-L6-v2, 384-d) ...');
  await embedAllMissing(client, (m) => console.log(m));

  const counts = await client.query(`
    SELECT (SELECT COUNT(*) FROM users)                AS users,
           (SELECT COUNT(*) FROM user_skills)          AS listings,
           (SELECT COUNT(*) FROM sessions)             AS sessions,
           (SELECT COUNT(*) FROM reviews)              AS reviews,
           (SELECT COUNT(*) FROM credit_transactions)  AS ledger_rows,
           (SELECT COUNT(*) FROM skill_embeddings)     AS skill_vectors,
           (SELECT COUNT(*) FROM resource_embeddings)  AS resource_vectors,
           (SELECT COUNT(*) FROM credit_reconciliation_view WHERE drift <> 0) AS drifting_accounts`);
  console.table(counts.rows);
  console.log(`\n✔ Database ready in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  console.log('  Log in with  admin@campus.edu / Password@123  (or harsh@campus.edu, chirag@campus.edu)\n');
} catch (err) {
  console.error('\n✖ Setup failed:', err.message);
  if (err.where) console.error('  where:', err.where);
  if (/permission denied to create extension/.test(err.message)) {
    console.error('  → Your DB user may not create extensions. Connect once as a superuser (e.g. postgres) and run:');
    console.error('      CREATE EXTENSION IF NOT EXISTS vector;  CREATE EXTENSION IF NOT EXISTS btree_gist;');
    const dbName = decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1));
    console.error(`    in the "${dbName}" database, or put a superuser in DATABASE_URL.`);
  } else if (/extension "vector"/.test(err.message) || /vector.control/.test(err.message)) {
    console.error('  → pgvector is not installed in this PostgreSQL. Use the Docker option or Neon (see README).');
  }
  process.exitCode = 1;
} finally {
  if (client) await client.end();
}
