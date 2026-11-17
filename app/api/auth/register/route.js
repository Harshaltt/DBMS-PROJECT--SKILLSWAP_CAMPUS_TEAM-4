import bcrypt from 'bcryptjs';
import { route, json, readBody } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query } from '@/lib/db.mjs';
import { createSessionToken, setSessionCookie } from '@/lib/auth';

// POST /api/auth/register  -> INSERT a new student account
export const POST = route(async ({ req }) => {
  const { full_name, email, password, department } = await readBody(req);
  // The password is the one field the database can never validate (it only
  // ever sees the hash), so its policy is checked here.
  if (typeof password !== 'string' || password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(422, 'Password must be at least 8 characters and contain a letter and a number.');
  }
  const hash = await bcrypt.hash(password, 10); // salted, cost factor 10
  // Name / e-mail format / duplicate e-mail are validated by DB constraints.
  const { rows } = await query(
    `INSERT INTO users (full_name, email, password_hash, department, last_login_at)
     VALUES ($1, $2, $3, NULLIF(btrim($4), ''), CURRENT_TIMESTAMP)
     RETURNING user_id, full_name, email, role`,
    [String(full_name ?? '').trim(), String(email ?? '').trim(), hash, department ?? '']
  );
  await setSessionCookie(await createSessionToken(rows[0]));
  return json({ user: rows[0] }, 201);
}, { roles: 'public' });
