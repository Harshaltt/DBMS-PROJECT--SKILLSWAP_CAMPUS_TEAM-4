import { route, json, readBody, intParam } from '@/lib/api';
import { ApiError } from '@/lib/errors';
import { withTransaction } from '@/lib/db.mjs';

// Who may do what. The DATABASE separately enforces which status changes
// are legal at all (trg_session_state_machine) and moves the credits
// (trg_session_completed); this layer only decides WHO may ask.
const ACTIONS = {
  confirm: { status: 'confirmed', who: 'tutor' },
  complete: { status: 'completed', who: 'learner' }, // the payer confirms it happened
  cancel: { status: 'cancelled', who: 'either' },
};

// PATCH /api/sessions/:id  { action: 'confirm' | 'complete' | 'cancel' }
export const PATCH = route(async ({ req, user, params }) => {
  const id = intParam(params.id, 'session id');
  const { action } = await readBody(req);
  const rule = ACTIONS[action];
  if (!rule) throw new ApiError(400, 'Unknown action.');

  const updated = await withTransaction(user.user_id, async (c) => {
    // lock the row so two clicks cannot race each other
    const { rows } = await c.query(
      'SELECT offering_user_id, requesting_user_id, status FROM sessions WHERE session_id = $1 FOR UPDATE', [id]);
    const s = rows[0];
    if (!s) throw new ApiError(404, 'Session not found.');
    const isTutor = s.offering_user_id === user.user_id;
    const isLearner = s.requesting_user_id === user.user_id;
    if (!isTutor && !isLearner) throw new ApiError(403, 'You are not part of this session.');
    if (rule.who === 'tutor' && !isTutor) throw new ApiError(403, 'Only the tutor can confirm a session.');
    if (rule.who === 'learner' && !isLearner) throw new ApiError(403, 'Only the learner can mark a session as completed.');
    if (action === 'cancel' && s.status === 'completed') {
      throw new ApiError(422, 'Completed sessions can only be reversed by an administrator.');
    }
    const r = await c.query(
      `UPDATE sessions SET status = $1 WHERE session_id = $2
       RETURNING session_id, status, credits_charged`, [rule.status, id]);
    return r.rows[0];
  });
  return json({ session: updated });
});
