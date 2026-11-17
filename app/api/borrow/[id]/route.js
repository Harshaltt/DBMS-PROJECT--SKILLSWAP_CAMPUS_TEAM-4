import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { withTransaction } from '@/lib/db.mjs';

// PATCH /api/borrow/:id { action: 'approve' | 'reject' | 'return' }
//
// APPROVE is a multi-statement TRANSACTION:
//   1. lock the item row (SELECT ... FOR UPDATE) so two approvals can't interleave
//   2. approve this request  (the EXCLUDE constraint rejects overlapping loans)
//   3. auto-reject every other PENDING request whose dates overlap
// Either all three happen or none do.
export const PATCH = route(async ({ req, user, params }) => {
  const id = intParam(params.id, 'request id');
  const { action } = await readBody(req);
  if (!['approve', 'reject', 'return'].includes(action)) throw new ApiError(400, 'Unknown action.');

  const result = await withTransaction(user.user_id, async (c) => {
    const { rows } = await c.query(
      `SELECT b.request_id, b.resource_id, b.borrower_id, b.status, b.start_date, b.end_date, r.owner_id
         FROM resource_borrow_requests b
         JOIN resource_listings r ON r.resource_id = b.resource_id
        WHERE b.request_id = $1
          FOR UPDATE OF r`, [id]);
    const reqRow = rows[0];
    if (!reqRow) throw new ApiError(404, 'Request not found.');
    const isOwner = reqRow.owner_id === user.user_id;
    if (action !== 'return' && !isOwner) throw new ApiError(403, 'Only the owner can approve or reject.');
    if (action === 'return' && !isOwner && reqRow.borrower_id !== user.user_id) {
      throw new ApiError(403, 'You are not part of this loan.');
    }
    const status = { approve: 'approved', reject: 'rejected', return: 'returned' }[action];
    await c.query('UPDATE resource_borrow_requests SET status = $1 WHERE request_id = $2', [status, id]);

    let autoRejected = 0;
    if (action === 'approve') {
      const r = await c.query(
        `UPDATE resource_borrow_requests SET status = 'rejected'
          WHERE resource_id = $1 AND request_id <> $2 AND status = 'pending'
            AND daterange(start_date, end_date, '[]') && daterange($3::date, $4::date, '[]')`,
        [reqRow.resource_id, id, reqRow.start_date, reqRow.end_date]);
      autoRejected = r.rowCount;
    }
    return { status, autoRejected };
  });
  return json(result);
});
