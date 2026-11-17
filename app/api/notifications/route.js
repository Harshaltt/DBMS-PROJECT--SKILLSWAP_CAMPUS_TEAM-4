import { route, json, readBody } from '@/lib/api';
import { query } from '@/lib/db.mjs';

// GET /api/notifications -> latest 25 (served by idx_notifications_user_recent for unread)
export const GET = route(async ({ user }) => {
  const { rows } = await query(
    `SELECT notification_id, message, related_session_id, is_read, created_at
       FROM notifications WHERE user_id = $1
      ORDER BY created_at DESC, notification_id DESC LIMIT 25`, [user.user_id]);
  return json({ notifications: rows, unread: rows.filter((n) => !n.is_read).length });
});

// PATCH /api/notifications -> mark all as read (UPDATE)
export const PATCH = route(async ({ user }) => {
  const r = await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [user.user_id]);
  return json({ updated: r.rowCount });
});

// DELETE /api/notifications -> clear notifications already read (DELETE)
export const DELETE = route(async ({ user }) => {
  const r = await query('DELETE FROM notifications WHERE user_id = $1 AND is_read', [user.user_id]);
  return json({ deleted: r.rowCount });
});
