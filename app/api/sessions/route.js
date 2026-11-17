import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query, withTransaction } from '@/lib/db.mjs';
import { CREDITS_PER_HOUR, priceFor } from '@/lib/constants';

// GET /api/sessions -> every session I teach or attend
export const GET = route(async ({ user }) => {
  const { rows } = await query(
    `SELECT s.session_id, s.scheduled_time, s.duration_minutes, s.status, s.credits_charged,
            s.location, s.created_at, sk.skill_name, c.category_name,
            (s.offering_user_id = $1) AS i_am_tutor,
            CASE WHEN s.offering_user_id = $1 THEN l.full_name ELSE t.full_name END AS counterpart,
            CASE WHEN s.offering_user_id = $1 THEN l.user_id   ELSE t.user_id   END AS counterpart_id,
            (s.scheduled_time <= CURRENT_TIMESTAMP) AS has_started,
            EXISTS (SELECT 1 FROM reviews r WHERE r.session_id = s.session_id AND r.reviewer_id = $1) AS i_reviewed,
            (SELECT r.rating FROM reviews r WHERE r.session_id = s.session_id AND r.reviewee_id = $1) AS rating_received
       FROM sessions s
       JOIN skills sk    ON sk.skill_id = s.skill_id
       JOIN categories c ON c.category_id = sk.category_id
       JOIN users t      ON t.user_id = s.offering_user_id
       JOIN users l      ON l.user_id = s.requesting_user_id
      WHERE $1 IN (s.offering_user_id, s.requesting_user_id)
      ORDER BY s.scheduled_time DESC`,
    [user.user_id]
  );
  return json({ sessions: rows, creditsPerHour: CREDITS_PER_HOUR });
});

// POST /api/sessions -> book through the stored procedure (inside a transaction)
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  const tutorId = intParam(b.offering_user_id, 'tutor');
  const skillId = intParam(b.skill_id, 'skill');
  const duration = Number(b.duration_minutes);
  if (!Number.isInteger(duration)) throw new ApiError(400, 'Invalid duration.');
  if (!b.scheduled_time || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(b.scheduled_time)) {
    throw new ApiError(400, 'Please choose a date and time.');
  }
  const credits = priceFor(duration); // price is set by the server, not the client
  const sessionId = await withTransaction(user.user_id, async (c) => {
    const { rows } = await c.query(
      'CALL sp_book_session($1, $2, $3, $4::timestamp, $5, $6, $7, NULL)',
      [tutorId, user.user_id, skillId, b.scheduled_time, duration, credits, b.location || null]
    );
    return rows[0].p_session_id;
  });
  return json({ session_id: sessionId, credits }, 201);
});
