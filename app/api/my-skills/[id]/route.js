import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query, withTransaction } from '@/lib/db.mjs';
import { upsertSkillEmbedding } from '@/lib/embeddings.mjs';

// PUT /api/my-skills/:id -> UPDATE; the trigger drops the stale vector, we re-embed
export const PUT = route(async ({ req, user, params }) => {
  const id = intParam(params.id, 'listing id');
  const b = await readBody(req);
  const result = await withTransaction(user.user_id, async (c) => {
    const { rowCount } = await c.query(
      `UPDATE user_skills
          SET proficiency_level = $1, description = NULLIF(btrim($2), '')
        WHERE user_skill_id = $3 AND user_id = $4`,
      [b.proficiency_level, b.description || '', id, user.user_id]
    );
    if (!rowCount) throw new ApiError(404, 'Listing not found.');
    let embedded = false;
    try {
      embedded = await upsertSkillEmbedding(c, id);
    } catch (err) {
      console.error('re-embedding failed:', err.message);
    }
    return { embedded };
  });
  return json(result);
});

// DELETE /api/my-skills/:id -> the embedding row goes with it (ON DELETE CASCADE)
export const DELETE = route(async ({ user, params }) => {
  const id = intParam(params.id, 'listing id');
  const { rowCount } = await query(
    'DELETE FROM user_skills WHERE user_skill_id = $1 AND user_id = $2', [id, user.user_id]);
  if (!rowCount) throw new ApiError(404, 'Listing not found.');
  return json({ ok: true });
});
