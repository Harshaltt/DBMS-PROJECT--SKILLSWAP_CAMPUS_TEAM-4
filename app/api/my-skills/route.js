import { route, json, readBody, intParam } from '@/lib/api';
import { query, withTransaction } from '@/lib/db.mjs';
import { upsertSkillEmbedding } from '@/lib/embeddings.mjs';

// GET /api/my-skills -> what I teach and what I want to learn
export const GET = route(async ({ user }) => {
  const { rows } = await query(
    `SELECT us.user_skill_id, us.skill_id, s.skill_name, c.category_name, us.proficiency_level,
            us.description, us.is_offering,
            (e.user_skill_id IS NOT NULL) AS has_embedding, e.embedded_at,
            (SELECT COUNT(*) FROM sessions se
              WHERE se.skill_id = us.skill_id AND se.status = 'completed'
                AND (CASE WHEN us.is_offering THEN se.offering_user_id ELSE se.requesting_user_id END) = us.user_id
            ) AS completed_sessions
       FROM user_skills us
       JOIN skills s     ON s.skill_id = us.skill_id
       JOIN categories c ON c.category_id = s.category_id
       LEFT JOIN skill_embeddings e ON e.user_skill_id = us.user_skill_id
      WHERE us.user_id = $1
      ORDER BY us.is_offering DESC, s.skill_name`,
    [user.user_id]
  );
  return json({ skills: rows });
});

// POST /api/my-skills -> INSERT listing + its embedding in ONE transaction
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  const skillId = intParam(b.skill_id, 'skill');
  const result = await withTransaction(user.user_id, async (c) => {
    const { rows } = await c.query(
      `INSERT INTO user_skills (user_id, skill_id, proficiency_level, description, is_offering)
       VALUES ($1, $2, $3, NULLIF(btrim($4), ''), $5)
       RETURNING user_skill_id`,
      [user.user_id, skillId, b.proficiency_level || 'beginner', b.description || '', b.is_offering !== false]
    );
    let embedded = false;
    try {
      embedded = await upsertSkillEmbedding(c, rows[0].user_skill_id);
    } catch (err) {
      console.error('embedding failed (listing saved without vector):', err.message);
    }
    return { user_skill_id: rows[0].user_skill_id, embedded };
  });
  return json(result, 201);
});
