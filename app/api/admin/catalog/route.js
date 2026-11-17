import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query } from '@/lib/db.mjs';

// GET /api/admin/catalog -> categories and skills with usage counts
export const GET = route(async () => {
  const { rows } = await query(
    `SELECT c.category_id, c.category_name,
            COALESCE(json_agg(json_build_object(
                'skill_id', s.skill_id, 'skill_name', s.skill_name,
                'listings', (SELECT COUNT(*) FROM user_skills us WHERE us.skill_id = s.skill_id),
                'sessions', (SELECT COUNT(*) FROM sessions se WHERE se.skill_id = s.skill_id))
              ORDER BY s.skill_name) FILTER (WHERE s.skill_id IS NOT NULL), '[]') AS skills,
            (SELECT COUNT(*) FROM resource_listings r WHERE r.category_id = c.category_id) AS resources
       FROM categories c
       LEFT JOIN skills s ON s.category_id = c.category_id
      GROUP BY c.category_id ORDER BY c.category_name`);
  return json({ categories: rows });
}, { roles: ['admin', 'staff'] });

// POST /api/admin/catalog { type: 'category', name } | { type: 'skill', name, category_id }
export const POST = route(async ({ req }) => {
  const b = await readBody(req);
  const name = String(b.name ?? '').trim();
  if (name.length < 2) throw new ApiError(422, 'Name must be at least 2 characters.');
  if (b.type === 'category') {
    const { rows } = await query('INSERT INTO categories (category_name) VALUES ($1) RETURNING *', [name]);
    return json(rows[0], 201);
  }
  if (b.type === 'skill') {
    const { rows } = await query('INSERT INTO skills (skill_name, category_id) VALUES ($1, $2) RETURNING *',
      [name, intParam(b.category_id, 'category')]);
    return json(rows[0], 201);
  }
  throw new ApiError(400, 'type must be category or skill');
}, { roles: ['admin'] });

// DELETE /api/admin/catalog?type=skill&id=7
// Foreign keys decide what is allowed: a skill with session history is
// protected by ON DELETE RESTRICT; a category that still has skills too.
export const DELETE = route(async ({ req }) => {
  const sp = new URL(req.url).searchParams;
  const id = intParam(sp.get('id'), 'id');
  const table = { category: ['categories', 'category_id'], skill: ['skills', 'skill_id'] }[sp.get('type')];
  if (!table) throw new ApiError(400, 'type must be category or skill');
  const { rowCount } = await query(`DELETE FROM ${table[0]} WHERE ${table[1]} = $1`, [id]);
  if (!rowCount) throw new ApiError(404, 'Not found.');
  return json({ ok: true });
}, { roles: ['admin'] });
