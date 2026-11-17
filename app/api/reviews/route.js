import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query, withTransaction } from '@/lib/db.mjs';

// POST /api/reviews { session_id, rating, comment }
// The reviewee is derived on the server (the other participant). Whether
// the session is completed and the reviewer took part is checked by the
// trg_validate_review trigger in the database.
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  const sessionId = intParam(b.session_id, 'session');
  const { rows } = await query(
    `SELECT CASE WHEN offering_user_id = $2 THEN requesting_user_id ELSE offering_user_id END AS reviewee
       FROM sessions WHERE session_id = $1`, [sessionId, user.user_id]);
  if (!rows[0]) throw new ApiError(404, 'Session not found.');
  const review = await withTransaction(user.user_id, async (c) => {
    const r = await c.query(
      `INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating, comment)
       VALUES ($1, $2, $3, $4, NULLIF(btrim($5), '')) RETURNING review_id`,
      [sessionId, user.user_id, rows[0].reviewee, Number(b.rating), b.comment || '']);
    return r.rows[0];
  });
  return json(review, 201);
});
