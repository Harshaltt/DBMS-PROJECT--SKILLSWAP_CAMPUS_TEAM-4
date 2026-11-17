import { route, json } from '@/lib/api';
import { query } from '@/lib/db.mjs';
import { embedOne, toPgVector } from '@/lib/embeddings.mjs';

const LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'];

// GET /api/skills/search?q=&mode=hybrid|semantic|keyword&category=&level=&minRating=
export const GET = route(async ({ req, user }) => {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') || '').trim().slice(0, 200);
  let mode = ['hybrid', 'semantic', 'keyword'].includes(sp.get('mode')) ? sp.get('mode') : 'hybrid';
  const category = sp.get('category') || null;
  const level = LEVELS.includes(sp.get('level')) ? sp.get('level') : null;
  const minRating = Number(sp.get('minRating')) || 0;

  // shared filters, applied to available_skills_view (alias v)
  const filters = (a) => `($${a}::text IS NULL OR v.category_name = $${a})
               AND ($${a + 1}::text IS NULL OR v.proficiency_level = $${a + 1})
               AND v.avg_rating >= $${a + 2}`;
  const base = [category, level, minRating];
  const started = Date.now();
  let rows, used, note = null;

  if (!q) {
    used = 'available_skills_view (browse, ordered by rating)';
    ({ rows } = await query(
      `SELECT v.*, NULL::numeric AS similarity, NULL::bigint AS semantic_rank, NULL::bigint AS keyword_rank
         FROM available_skills_view v
        WHERE ${filters(1)}
        ORDER BY v.avg_rating DESC, v.review_count DESC, v.full_name
        LIMIT 60`, base));
  } else {
    let vector = null;
    if (mode !== 'keyword') {
      try {
        vector = toPgVector(await embedOne(q));
      } catch (err) {
        console.error('embedding failed, falling back to keyword search:', err.message);
        note = 'The embedding model could not be loaded, so keyword search was used instead.';
        mode = 'keyword';
      }
    }
    if (mode === 'keyword') {
      used = 'full-text search: search_vector @@ websearch_to_tsquery (GIN index)';
      ({ rows } = await query(
        `SELECT v.*, ROUND(ts_rank(us.search_vector, websearch_to_tsquery('english', $1))::numeric, 4) AS similarity,
                NULL::bigint AS semantic_rank, NULL::bigint AS keyword_rank
           FROM available_skills_view v
           JOIN user_skills us ON us.user_skill_id = v.user_skill_id
          WHERE (us.search_vector @@ websearch_to_tsquery('english', $1) OR v.skill_name ILIKE '%' || $1 || '%')
            AND ${filters(2)}
          ORDER BY similarity DESC, v.avg_rating DESC
          LIMIT 30`, [q, ...base]));
    } else if (mode === 'semantic') {
      used = 'pgvector k-NN: fn_semantic_skill_search (cosine distance <=>, HNSW index)';
      ({ rows } = await query(
        `SELECT v.*, n.similarity, ROW_NUMBER() OVER (ORDER BY n.similarity DESC) AS semantic_rank,
                NULL::bigint AS keyword_rank
           FROM fn_semantic_skill_search($1::vector, 40) n
           JOIN available_skills_view v ON v.user_skill_id = n.user_skill_id
          WHERE n.similarity >= 0.2 AND ${filters(2)}
          ORDER BY n.similarity DESC
          LIMIT 30`, [vector, ...base]));
    } else {
      used = 'hybrid: fn_hybrid_skill_search (vector k-NN + full-text, Reciprocal Rank Fusion)';
      ({ rows } = await query(
        `SELECT v.*, h.similarity, h.semantic_rank, h.keyword_rank, h.rrf_score
           FROM fn_hybrid_skill_search($1, $2::vector, 40) h
           JOIN available_skills_view v ON v.user_skill_id = h.user_skill_id
          WHERE (h.keyword_rank IS NOT NULL OR h.similarity >= 0.2) AND ${filters(3)}
          ORDER BY h.rrf_score DESC
          LIMIT 30`, [q, vector, ...base]));
    }
  }
  return json({
    results: rows.map((r) => ({ ...r, is_mine: r.user_id === user.user_id })),
    meta: { mode: q ? mode : 'browse', used, ms: Date.now() - started, note },
  });
});
