import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { query } from '@/lib/db.mjs';

// PATCH /api/resources/:id { availability_status: 'available' | 'unavailable' }
export const PATCH = route(async ({ req, user, params }) => {
  const id = intParam(params.id, 'resource id');
  const { availability_status } = await readBody(req);
  if (!['available', 'unavailable'].includes(availability_status)) {
    throw new ApiError(400, 'Status must be available or unavailable.');
  }
  const { rows } = await query(
    `UPDATE resource_listings SET availability_status = $1
      WHERE resource_id = $2 AND owner_id = $3 AND availability_status <> 'borrowed'
      RETURNING resource_id, availability_status`,
    [availability_status, id, user.user_id]);
  if (!rows[0]) throw new ApiError(409, 'Item not found, not yours, or currently lent out.');
  return json(rows[0]);
});

// DELETE /api/resources/:id -> borrow history + embedding cascade away
export const DELETE = route(async ({ user, params }) => {
  const id = intParam(params.id, 'resource id');
  const { rowCount } = await query(
    `DELETE FROM resource_listings
      WHERE resource_id = $1 AND owner_id = $2 AND availability_status <> 'borrowed'`, [id, user.user_id]);
  if (!rowCount) throw new ApiError(409, 'Item not found, not yours, or currently lent out.');
  return json({ ok: true });
});
