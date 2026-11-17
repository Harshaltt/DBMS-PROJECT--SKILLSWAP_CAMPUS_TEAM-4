import { route, json } from '@/lib/api';
import { query } from '@/lib/db.mjs';

// GET /api/auth/me -> the logged-in user + live credit figures + unread count
export const GET = route(async ({ user }) => {
  const { rows } = await query(
    `SELECT fn_available_credits($1) AS available_credits,
            (SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND NOT is_read) AS unread`,
    [user.user_id]
  );
  return json({ user: { ...user, ...rows[0] } });
});
