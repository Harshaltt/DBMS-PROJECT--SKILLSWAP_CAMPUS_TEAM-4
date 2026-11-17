import { route, json } from '@/lib/api';
import { query } from '@/lib/db.mjs';

// GET /api/credits -> my ledger with a running balance (window function)
export const GET = route(async ({ user }) => {
  const [ledger, recon, summary] = await Promise.all([
    query(
      `SELECT ct.transaction_id, ct.created_at, ct.amount, ct.transaction_type, ct.session_id,
              sk.skill_name,
              SUM(ct.amount) OVER (ORDER BY ct.created_at, ct.transaction_id) AS running_balance
         FROM credit_transactions ct
         LEFT JOIN sessions s ON s.session_id = ct.session_id
         LEFT JOIN skills sk  ON sk.skill_id = s.skill_id
        WHERE ct.user_id = $1
        ORDER BY ct.created_at DESC, ct.transaction_id DESC`, [user.user_id]),
    query(`SELECT credits_balance, ledger_balance, drift FROM credit_reconciliation_view WHERE user_id = $1`, [user.user_id]),
    query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'earned'), 0) AS earned,
              COALESCE(-SUM(amount) FILTER (WHERE transaction_type = 'spent'), 0) AS spent,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'bonus'), 0)  AS bonus,
              COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'refund'), 0) AS refunds,
              fn_available_credits($1) AS available
         FROM credit_transactions WHERE user_id = $1`, [user.user_id]),
  ]);
  return json({ ledger: ledger.rows, reconciliation: recon.rows[0], summary: summary.rows[0] });
});
