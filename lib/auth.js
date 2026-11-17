// =====================================================================
// Authentication: bcrypt password hashes + signed JWT in an httpOnly cookie.
// The token only proves WHO you are; the user's role and active flag are
// re-read from the database on every API call, so a deactivated or
// demoted user loses access immediately.
// =====================================================================
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { query } from './db.mjs';

export const SESSION_COOKIE = 'ss_session';
const MAX_AGE = 8 * 60 * 60; // 8 hours

function secretKey() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET is missing or shorter than 32 characters (set it in .env.local)');
  }
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user) {
  return new SignJWT({ role: user.role, name: user.full_name })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.user_id))
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secretKey());
}

export async function setSessionCookie(token) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, // JavaScript in the page can never read the token (XSS)
    sameSite: 'lax', // not sent on cross-site POSTs (CSRF)
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

/** Current user from the cookie, re-validated against the database (or null). */
export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey()));
  } catch {
    return null;
  }
  const { rows } = await query(
    `SELECT user_id, full_name, email, role, department, bio, credits_balance, is_active
       FROM users WHERE user_id = $1`,
    [Number(payload.sub)]
  );
  const user = rows[0];
  if (!user || !user.is_active) return null;
  return user;
}
