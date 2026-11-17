'use client';
import { useEffect, useState } from 'react';
import { api, Badge, credits, ErrorBox, fmtDateTime, Loading } from '@/components/ui';

export default function Credits() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/api/credits').then(setD).catch(setError); }, []);
  if (!d) return error ? <ErrorBox error={error} /> : <Loading />;
  const s = d.summary;
  const r = d.reconciliation;
  return (
    <>
      <div className="page-head">
        <div><h1>Credits & ledger</h1><p>Every credit you have ever held, with a running balance computed by a SQL window function.</p></div>
      </div>
      <div className="grid grid-5">
        <div className="card stat"><div className="stat-label">Balance</div><div className="stat-value">{credits(r.credits_balance)}</div><div className="stat-sub">{credits(s.available)} free after bookings</div></div>
        <div className="card stat"><div className="stat-label">Earned teaching</div><div className="stat-value" style={{ color: 'var(--green)' }}>+{credits(s.earned)}</div></div>
        <div className="card stat"><div className="stat-label">Spent learning</div><div className="stat-value" style={{ color: 'var(--red)' }}>−{credits(s.spent)}</div></div>
        <div className="card stat"><div className="stat-label">Bonuses</div><div className="stat-value">+{credits(s.bonus)}</div><div className="stat-sub">incl. 20 sign-up credits</div></div>
        <div className="card stat">
          <div className="stat-label">Ledger check</div>
          <div className="stat-value" style={{ fontSize: 20, color: Number(r.drift) === 0 ? 'var(--green)' : 'var(--red)' }}>
            {Number(r.drift) === 0 ? '✓ Balanced' : `Drift ${credits(r.drift)}`}
          </div>
          <div className="stat-sub">balance {credits(r.credits_balance)} = ledger {credits(r.ledger_balance)}</div>
        </div>
      </div>
      <div className="card mt-16">
        <div className="card-head"><div><h2>Transactions</h2><p>credit_transactions · SUM(amount) OVER (ORDER BY created_at)</p></div></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Date</th><th>Type</th><th>Details</th><th className="right">Amount</th><th className="right">Running balance</th></tr></thead>
            <tbody>
              {d.ledger.map((t) => (
                <tr key={t.transaction_id}>
                  <td className="nowrap">{fmtDateTime(t.created_at)}</td>
                  <td><Badge>{t.transaction_type}</Badge></td>
                  <td>{t.skill_name ? <>{t.skill_name} <span className="muted tiny">session #{t.session_id}</span></> : <span className="muted">{t.transaction_type === 'bonus' ? 'Credit grant' : '—'}</span>}</td>
                  <td className="right num bold" style={{ color: Number(t.amount) >= 0 ? 'var(--green)' : 'var(--red)' }}>{Number(t.amount) >= 0 ? '+' : ''}{credits(t.amount)}</td>
                  <td className="right num">{credits(t.running_balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
