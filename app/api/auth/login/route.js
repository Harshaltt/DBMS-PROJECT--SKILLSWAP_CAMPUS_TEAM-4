import bcrypt from 'bcryptjs';
import { route, json, readBody } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query } from '@/lib/db.mjs';
import { createSessionToken, setSessionCookie } from '@/lib/auth';

// POST /api/auth/login
export const POST = route(async ({ req }) => {
  const { email, password } = await readBody(req);
  const { rows } = await query(
    `SELECT user_id, full_name, email, role, password_hash, is_active
       FROM users WHERE lower(email) = lower($1)`, // served by uq_users_email_lower
    [String(email ?? '').trim()]
  );
  const user = rows[0];
  // Same message for "no such user" and "wrong password" (no user enumeration)
  if (!user || !(await bcrypt.compare(String(password ?? ''), user.password_hash))) {
    throw new ApiError(401, 'Incorrect e-mail or password.');
  }
  if (!user.is_active) throw new ApiError(403, 'This account has been deactivated by an administrator.');
  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE user_id = $1', [user.user_id]);
  await setSessionCookie(await createSessionToken(user));
  return json({ user: { user_id: user.user_id, full_name: user.full_name, role: user.role } });
}, { roles: 'public' });
