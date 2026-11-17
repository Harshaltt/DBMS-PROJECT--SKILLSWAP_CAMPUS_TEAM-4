import { route, json, readBody } from '@/lib/api';
import { query, withTransaction } from '@/lib/db.mjs';
import { embedOne, toPgVector, upsertResourceEmbedding } from '@/lib/embeddings.mjs';

// GET /api/resources?q=&category=&mine=1
export const GET = route(async ({ req, user }) => {
  const sp = new URL(req.url).searchParams;
  const q = (sp.get('q') || '').trim().slice(0, 200);
  const category = sp.get('category') || null;
  const mine = sp.get('mine') === '1';

  let vector = null;
  if (q && !mine) {
    try { vector = toPgVector(await embedOne(q)); } catch (err) { console.error(err.message); }
  }
  const { rows } = await query(
    `SELECT r.resource_id, r.title, r.description, r.condition, r.availability_status, r.created_at,
            c.category_name, u.user_id AS owner_id, u.full_name AS owner_name, u.department AS owner_department,
            (r.owner_id = $1) AS is_mine,
            n.similarity,
            (SELECT COUNT(*) FROM resource_borrow_requests b
              WHERE b.resource_id = r.resource_id AND b.status = 'pending') AS pending_requests,
            (SELECT COUNT(*) FROM resource_borrow_requests b
              WHERE b.resource_id = r.resource_id AND b.status = 'returned') AS times_lent
       FROM resource_listings r
       JOIN users u ON u.user_id = r.owner_id
       LEFT JOIN categories c ON c.category_id = r.category_id
       LEFT JOIN fn_semantic_resource_search($4::vector, 50) n
              ON n.resource_id = r.resource_id
      WHERE ($2::text IS NULL OR c.category_name = $2)
        AND ($3::boolean = FALSE OR r.owner_id = $1)
        AND u.is_active
        AND ($5 = '' OR n.similarity >= 0.2
             OR r.title ILIKE '%' || $5 || '%' OR r.description ILIKE '%' || $5 || '%')
      ORDER BY n.similarity DESC NULLS LAST, (r.availability_status = 'available') DESC, r.created_at DESC`,
    [user.user_id, category, mine, vector, q]
  );
  return json({ resources: rows, semantic: Boolean(vector) });
});

// POST /api/resources -> list an item to lend (+ its embedding, same transaction)
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  const id = await withTransaction(user.user_id, async (c) => {
    const { rows } = await c.query(
      `INSERT INTO resource_listings (owner_id, title, description, category_id, condition)
       VALUES ($1, btrim($2), NULLIF(btrim($3), ''), $4, $5) RETURNING resource_id`,
      [user.user_id, b.title || '', b.description || '', b.category_id ? Number(b.category_id) : null, b.condition || 'good']);
    try { await upsertResourceEmbedding(c, rows[0].resource_id); } catch (err) { console.error(err.message); }
    return rows[0].resource_id;
  });
  return json({ resource_id: id }, 201);
});
