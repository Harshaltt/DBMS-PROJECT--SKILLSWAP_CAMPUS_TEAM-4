// npm run db:embed  -> embed any skill/resource listing that has no vector yet
import './load-env.mjs';
import pg from 'pg';
import { embedAllMissing } from '../lib/embeddings.mjs';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await embedAllMissing(client, (m) => console.log(m));
  const { rows } = await client.query('SELECT * FROM embedding_coverage_view');
  console.table(rows);
} finally {
  await client.end();
}
