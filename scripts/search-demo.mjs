// node scripts/search-demo.mjs "sing indian classical music"
// Embeds the query with the same model the app uses and runs the three search
// modes side by side, straight against PostgreSQL + pgvector.
import './load-env.mjs';
import pg from 'pg';
import { embedOne, toPgVector } from '../lib/embeddings.mjs';

const q = process.argv.slice(2).join(' ') || 'sing indian classical music';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const vec = toPgVector(await embedOne(q));
console.log(`query: "${q}"  ->  384-d embedding [${vec.slice(1, 40)}...]\n`);
const show = (title, rows) => {
  console.log(title);
  if (!rows.length) console.log('   (no rows)');
  rows.forEach((r, i) => console.log(`   ${i + 1}. ${r.skill_name.padEnd(18)} ${r.full_name.padEnd(22)} ${r.score}`));
  console.log('');
};
show('KEYWORD  (search_vector @@ websearch_to_tsquery, GIN index)', (await client.query(
  `SELECT v.skill_name, v.full_name, ROUND(ts_rank(us.search_vector, websearch_to_tsquery('english',$1))::numeric,3) AS score
     FROM available_skills_view v JOIN user_skills us USING (user_skill_id)
    WHERE us.search_vector @@ websearch_to_tsquery('english',$1) ORDER BY score DESC LIMIT 3`, [q])).rows);
show('SEMANTIC (embedding <=> query, cosine similarity, HNSW index)', (await client.query(
  `SELECT v.skill_name, v.full_name, n.similarity AS score
     FROM fn_semantic_skill_search($1::vector, 3) n JOIN available_skills_view v USING (user_skill_id)
    ORDER BY n.similarity DESC`, [vec])).rows);
show('HYBRID   (fn_hybrid_skill_search, Reciprocal Rank Fusion)', (await client.query(
  `SELECT v.skill_name, v.full_name, h.rrf_score AS score
     FROM fn_hybrid_skill_search($1, $2::vector, 3) h JOIN available_skills_view v USING (user_skill_id)
    ORDER BY h.rrf_score DESC`, [q, vec])).rows);
await client.end();
