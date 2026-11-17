// Small wrapper used by every Route Handler: authentication, role-based
// authorisation and uniform error handling in one place.
import { NextResponse } from 'next/server';
import { getSessionUser } from './auth';
import { ApiError, toErrorPayload } from './errors';

export const json = (data, status = 200) => NextResponse.json(data, { status });

/**
 * route(handler, { roles })
 *   roles: 'public'            -> no login needed
 *          undefined           -> any logged-in user
 *          ['admin', 'staff']  -> only these roles
 */
export function route(handler, { roles } = {}) {
  return async (req, ctx) => {
    try {
      let user = null;
      if (roles !== 'public') {
        user = await getSessionUser();
        if (!user) return json({ error: 'Please log in first.' }, 401);
        if (Array.isArray(roles) && !roles.includes(user.role)) {
          return json({ error: `This action requires the ${roles.join(' or ')} role.` }, 403);
        }
      }
      const params = ctx?.params ? await ctx.params : {};
      return await handler({ req, user, params });
    } catch (err) {
      const { status, body } = toErrorPayload(err);
      return json(body, status);
    }
  };
}

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'Request body must be valid JSON.');
  }
}

export function intParam(v, name) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${name}.`);
  return n;
}
