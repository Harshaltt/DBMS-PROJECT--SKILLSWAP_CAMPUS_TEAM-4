import { route, json } from '@/lib/api';
import { query } from '@/lib/db.mjs';

// GET /api/catalog -> categories with their skills (for dropdowns)
export const GET = route(async () => {
  const { rows } = await query(
    `SELECT c.category_id, c.category_name,
            COALESCE(json_agg(json_build_object('skill_id', s.skill_id, 'skill_name', s.skill_name)
                     ORDER BY s.skill_name) FILTER (WHERE s.skill_id IS NOT NULL), '[]') AS skills
       FROM categories c
       LEFT JOIN skills s ON s.category_id = c.category_id
      GROUP BY c.category_id, c.category_name
      ORDER BY c.category_name`
  );
  return json({ categories: rows });
});
