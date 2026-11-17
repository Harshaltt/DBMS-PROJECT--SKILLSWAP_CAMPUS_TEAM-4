import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query, withTransaction } from '@/lib/db.mjs';

// GET /api/admin/users (staff can view, admin can change)
export const GET = route(async () => {
  const { rows } = await query(
    `SELECT u.user_id, u.full_name, u.email, u.role, u.department, u.credits_balance, u.is_active,
            u.created_at, u.last_login_at,
            COUNT(DISTINCT us.user_skill_id) FILTER (WHERE us.is_offering) AS offers,
            (SELECT COUNT(*) FROM sessions s WHERE s.offering_user_id = u.user_id AND s.status = 'completed') AS taught,
            (SELECT COUNT(*) FROM sessions s WHERE s.requesting_user_id = u.user_id AND s.status = 'completed') AS learned,
            rc.drift
       FROM users u
       LEFT JOIN user_skills us ON us.user_id = u.user_id
       JOIN credit_reconciliation_view rc ON rc.user_id = u.user_id
      GROUP BY u.user_id, rc.drift
      ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, u.full_name`);
  return json({ users: rows });
}, { roles: ['admin', 'staff'] });

// PATCH /api/admin/users { user_id, role?, is_active? }  (admin only)
export const PATCH = route(async ({ req, user }) => {
  const b = await readBody(req);
  const id = intParam(b.user_id, 'user');
  if (id === user.user_id) throw new ApiError(422, 'You cannot change your own role or status.');
  const { rows } = await query(
    `UPDATE users
        SET role      = COALESCE($2, role),
            is_active = COALESCE($3, is_active)
      WHERE user_id = $1
      RETURNING user_id, role, is_active`,
    [id, b.role ?? null, typeof b.is_active === 'boolean' ? b.is_active : null]);
  if (!rows[0]) throw new ApiError(404, 'User not found.');
  return json(rows[0]);
}, { roles: ['admin'] });

// POST /api/admin/users { user_id, amount, reason } -> grant bonus credits (admin only)
// Two writes that must stay consistent -> one TRANSACTION. If the ledger
// insert failed after the balance update, ROLLBACK undoes the balance too,
// so credit_reconciliation_view never shows drift.
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  const id = intParam(b.user_id, 'user');
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100) {
    throw new ApiError(422, 'Bonus must be between 1 and 100 credits.');
  }
  const result = await withTransaction(user.user_id, async (c) => {
    const upd = await c.query(
      'UPDATE users SET credits_balance = credits_balance + $2 WHERE user_id = $1 RETURNING full_name, credits_balance',
      [id, amount]);
    if (!upd.rows[0]) throw new ApiError(404, 'User not found.');
    await c.query(`INSERT INTO credit_transactions (user_id, amount, transaction_type) VALUES ($1, $2, 'bonus')`, [id, amount]);
    await c.query('INSERT INTO notifications (user_id, message) VALUES ($1, $2)',
      [id, `You received ${amount} bonus credits${b.reason ? ': ' + String(b.reason).slice(0, 150) : ''}`]);
    return upd.rows[0];
  });
  return json(result);
}, { roles: ['admin'] });
