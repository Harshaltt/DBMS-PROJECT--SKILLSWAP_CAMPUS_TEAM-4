'use client';
import { useEffect, useState } from 'react';
import { api, credits, ErrorBox, Loading, Stars } from '@/components/ui';

function MonthlyChart({ rows }) {
  const max = Math.max(1, ...rows.map((r) => Number(r.completed)));
  return (
    <>
      <div className="bars" role="img" aria-label="Completed sessions per month">
        {rows.map((r) => (
          <div key={r.label} className="bar-col">
            <span className="bar-tip">{r.label}: {r.completed} completed · {r.cancelled} cancelled · {credits(r.credits)} credits</span>
            {Number(r.completed) > 0 && <span className="bar-val">{r.completed}</span>}
            <div className="bar" style={{ height: `${(Number(r.completed) / max) * 82}%` }} />
          </div>
        ))}
      </div>
      <div className="bar-labels">{rows.map((r) => <span key={r.label}>{r.label.split(' ')[0]}</span>)}</div>
    </>
  );
}

export default function Analytics() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api('/api/admin/analytics').then(setD).catch(setError); }, []);
  if (!d) return error ? <ErrorBox error={error} /> : <Loading />;
  const k = d.kpi;
  const maxCat = Math.max(1, ...d.categories.map((c) => Number(c.completed)));
  const rec = d.reconciliation;

  return (
    <>
      <div className="page-head">
        <div><h1>Campus analytics</h1><p>Live aggregates over the whole platform (GROUP BY, HAVING, views, window functions).</p></div>
      </div>
      <div className="grid grid-5">
        <div className="card stat"><div className="stat-label">Active users</div><div className="stat-value">{k.active_users}</div><div className="stat-sub">{k.students} students</div></div>
        <div className="card stat"><div className="stat-label">Skill listings</div><div className="stat-value">{k.skills_offered}</div><div className="stat-sub">offered · {k.skills_wanted} wanted</div></div>
        <div className="card stat"><div className="stat-label">Sessions completed</div><div className="stat-value">{k.sessions_completed}</div><div className="stat-sub">{k.sessions_upcoming} upcoming</div></div>
        <div className="card stat"><div className="stat-label">Credits circulated</div><div className="stat-value">{credits(k.credits_circulated)}</div><div className="stat-sub">avg rating {k.avg_rating}</div></div>
        <div className="card stat"><div className="stat-label">Item loans</div><div className="stat-value">{k.loans_completed}</div><div className="stat-sub">{k.items_out} items out now</div></div>
      </div>

      <div className="grid grid-3 mt-16">
        <div className="card span-2">
          <div className="card-head"><div><h2>Completed sessions per month</h2><p>Last 6 months · generate_series + LEFT JOIN so empty months still show</p></div></div>
          <div className="card-body"><MonthlyChart rows={d.monthly} /></div>
          <details className="card-body" style={{ borderTop: '1px solid var(--line)' }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>Show as table</summary>
            <div className="table-wrap"><table className="table compact mt-8"><thead><tr><th>Month</th><th className="right">Completed</th><th className="right">Cancelled</th><th className="right">Credits</th></tr></thead>
              <tbody>{d.monthly.map((m) => <tr key={m.label}><td>{m.label}</td><td className="right num">{m.completed}</td><td className="right num">{m.cancelled}</td><td className="right num">{credits(m.credits)}</td></tr>)}</tbody></table></div>
          </details>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Ledger integrity</h2><p>credit_reconciliation_view</p></div></div>
          <div className="card-body">
            <div className="stat-value" style={{ color: Number(rec.drifting) === 0 ? 'var(--green)' : 'var(--red)', fontSize: 22 }}>
              {Number(rec.drifting) === 0 ? '✓ All accounts balanced' : `⚠ ${rec.drifting} accounts drifting`}
            </div>
            <p className="small muted mt-8">{rec.accounts} wallets checked. Every balance equals the sum of its ledger rows (total drift {credits(rec.total_drift)}).</p>
            <p className="small muted mt-8">{credits(rec.credits_in_wallets)} credits currently held across campus.</p>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '14px 0' }} />
            <div className="label">Vector index coverage</div>
            {d.coverage.map((c) => (
              <div key={c.entity} className="row between small mt-8"><span>{c.entity}</span><span className="num">{c.embedded_rows} / {c.total_rows} embedded</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-2 mt-16">
        <div className="card">
          <div className="card-head"><div><h2>Busiest categories</h2><p>GROUP BY category HAVING COUNT(*) ≥ 2</p></div></div>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Category</th><th>Completed</th><th className="right">Credits</th><th className="right">Avg rating</th></tr></thead>
            <tbody>{d.categories.map((c) => (
              <tr key={c.category_name}>
                <td>{c.category_name}</td>
                <td><div className="row"><div className="hbar" style={{ width: 90 }}><span style={{ width: `${(c.completed / maxCat) * 100}%` }} /></div><span className="num small">{c.completed}</span></div></td>
                <td className="right num">{credits(c.credits)}</td>
                <td className="right">{c.avg_rating ?? '–'}</td>
              </tr>))}
            </tbody>
          </table></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Where we need tutors</h2><p>skill_demand_view · learners minus tutors</p></div></div>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Skill</th><th className="right">Want</th><th className="right">Teach</th><th className="right">Gap</th></tr></thead>
            <tbody>{d.demand.map((s) => (
              <tr key={s.skill_name}><td>{s.skill_name} <span className="tiny muted">{s.category_name}</span></td>
                <td className="right num">{s.learners}</td><td className="right num">{s.tutors}</td>
                <td className="right num bold" style={{ color: s.demand_gap > 0 ? 'var(--amber)' : 'var(--muted)' }}>{s.demand_gap > 0 ? `+${s.demand_gap}` : s.demand_gap}</td></tr>))}
            </tbody>
          </table></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Tutor leaderboard</h2><p>RANK() OVER (ORDER BY sessions_taught DESC, avg_rating DESC)</p></div></div>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>#</th><th>Tutor</th><th className="right">Sessions</th><th className="right">Earned</th><th>Rating</th></tr></thead>
            <tbody>{d.leaders.map((l) => (
              <tr key={l.full_name}><td className="bold">{l.rank_position}</td><td>{l.full_name}<div className="tiny muted">{l.department}</div></td>
                <td className="right num">{l.sessions_taught}</td><td className="right num">{credits(l.credits_earned)}</td><td><Stars value={l.avg_rating} count={l.review_count} /></td></tr>))}
            </tbody>
          </table></div>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Departments</h2><p>Student members and sessions taught</p></div></div>
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>Department</th><th className="right">Members</th><th className="right">Sessions taught</th></tr></thead>
            <tbody>{d.departments.map((x) => (
              <tr key={x.department}><td>{x.department}</td><td className="right num">{x.members}</td><td className="right num">{x.sessions_taught}</td></tr>))}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
