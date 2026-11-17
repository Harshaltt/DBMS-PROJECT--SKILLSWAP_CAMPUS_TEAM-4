import { route, json, readBody, intParam } from '@/lib/api';
import { query, withTransaction } from '@/lib/db.mjs';

const SELECT = `
  SELECT b.request_id, b.resource_id, b.start_date, b.end_date, b.status, b.request_date,
         b.return_confirmed, r.title, r.availability_status,
         o.full_name AS owner_name, br.full_name AS borrower_name, br.department AS borrower_department
    FROM resource_borrow_requests b
    JOIN resource_listings r ON r.resource_id = b.resource_id
    JOIN users o  ON o.user_id  = r.owner_id
    JOIN users br ON br.user_id = b.borrower_id`;

// GET /api/borrow -> { outgoing: my requests, incoming: requests for my items }
export const GET = route(async ({ user }) => {
  const order = `ORDER BY (b.status = 'pending') DESC, b.start_date DESC`;
  const [outgoing, incoming] = await Promise.all([
    query(`${SELECT} WHERE b.borrower_id = $1 ${order}`, [user.user_id]),
    query(`${SELECT} WHERE r.owner_id = $1 ${order}`, [user.user_id]),
  ]);
  return json({ outgoing: outgoing.rows, incoming: incoming.rows });
});

// POST /api/borrow { resource_id, start_date, end_date }
// Own-item, past-date and 30-day rules are enforced by the database.
export const POST = route(async ({ req, user }) => {
  const b = await readBody(req);
  const resourceId = intParam(b.resource_id, 'item');
  const r = await withTransaction(user.user_id, (c) => c.query(
    `INSERT INTO resource_borrow_requests (resource_id, borrower_id, start_date, end_date)
     VALUES ($1, $2, $3::date, $4::date) RETURNING request_id`,
    [resourceId, user.user_id, b.start_date || null, b.end_date || null]));
  return json(r.rows[0], 201);
});
