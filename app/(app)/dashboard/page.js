'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import BookModal from '@/components/BookModal';
import { api, Badge, credits, Empty, ErrorBox, fmtTime, Loading, MatchBar, monthShort, parts, Stars } from '@/components/ui';

export default function Dashboard() {
  const { me } = useApp();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [booking, setBooking] = useState(null);

  const load = useCallback(() => api('/api/dashboard').then(setD).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const s = d.stats;
  const todo = [
    { n: d.todo.to_confirm, t: 'session requests to confirm', href: '/sessions' },
    { n: d.todo.to_complete, t: 'sessions to mark completed', href: '/sessions' },
    { n: d.todo.to_review, t: 'sessions waiting for your review', href: '/sessions' },
    { n: d.todo.borrow_requests, t: 'borrow requests for your items', href: '/resources?tab=requests' },
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello, {me?.full_name?.split(' ')[0] || 'there'} 👋</h1>
          <p>Here is what is happening with your skill exchanges.</p>
        </div>
        <Link href="/skills" className="btn primary">Find someone to learn from</Link>
      </div>

      <div className="grid grid-5">
        <div className="card stat"><div className="stat-label">Credit balance</div><div className="stat-value">{credits(s.credits_balance)}</div><div className="stat-sub">{credits(s.available_credits)} free after bookings</div></div>
        <div className="card stat"><div className="stat-label">Sessions taught</div><div className="stat-value">{s.taught}</div><div className="stat-sub">{s.teaching} skills offered</div></div>
        <div className="card stat"><div className="stat-label">Sessions attended</div><div className="stat-value">{s.learned}</div><div className="stat-sub">{s.learning} skills wanted</div></div>
        <div className="card stat"><div className="stat-label">Your rating</div><div className="stat-value">{s.avg_rating ? Number(s.avg_rating).toFixed(1) : '–'}</div><div className="stat-sub">{s.review_count} reviews received</div></div>
        <div className="card stat"><div className="stat-label">Perfect swaps</div><div className="stat-value">{d.swaps.length}</div><div className="stat-sub">mutual matches</div></div>
      </div>

      <div className="grid grid-4 mt-16">
        {todo.map((t) => (
          <Link key={t.t} href={t.href} className={`todo ${t.n > 0 ? 'hot' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <span className="n">{t.n}</span><span className="small">{t.t}</span>
          </Link>
        ))}
      </div>

      <div className="grid grid-3 mt-16">
        <div className="card span-2">
          <div className="card-head">
            <div><h2>Recommended for what you want to learn</h2><p>Semantic matches: your “want to learn” descriptions vs. everyone’s offers (pgvector, LATERAL k-NN)</p></div>
          </div>
          <div className="card-body flush">
            {!d.recommendations.length && <Empty>Add a skill you want to learn on <Link href="/my-skills">My skills</Link> to get recommendations.</Empty>}
            {d.recommendations.map((r) => (
              <div key={`${r.wanted_skill}-${r.user_skill_id}`} className="list-item">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 8 }}>
                    <b>{r.skill_name}</b><span className="muted">by {r.full_name}</span><Badge>{r.proficiency_level}</Badge>
                  </div>
                  <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</div>
                  <div className="row mt-8" style={{ gap: 14 }}>
                    <span className="tiny muted">for your wish: <b>{r.wanted_skill}</b></span>
                    <MatchBar value={r.similarity} />
                    <Stars value={r.avg_rating} count={r.review_count} />
                  </div>
                </div>
                <button className="btn sm" onClick={() => setBooking(r)}>Book</button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><div><h2>Perfect swaps</h2><p>They teach what you want and want what you teach</p></div></div>
          <div className="card-body flush">
            {!d.swaps.length && <Empty>No mutual matches yet.</Empty>}
            {d.swaps.map((w) => (
              <div key={`${w.partner_id}-${w.they_teach_you}-${w.you_teach_them}`} className="list-item">
                <div>
                  <b>{w.partner_name}</b> <span className="tiny muted">{w.department}</span>
                  <div className="small mt-8">They teach you <Badge tone="teal">{w.they_teach_you}</Badge></div>
                  <div className="small" style={{ marginTop: 4 }}>You teach them <Badge tone="brand">{w.you_teach_them}</Badge></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-3 mt-16">
        <div className="card span-2">
          <div className="card-head"><div><h2>Upcoming sessions</h2></div><Link href="/sessions" className="btn sm ghost">All sessions →</Link></div>
          <div className="card-body flush">
            {!d.upcoming.length && <Empty>Nothing scheduled yet.</Empty>}
            {d.upcoming.map((u) => (
              <div key={u.session_id} className="list-item">
                <div className="date-box"><div className="d">{parts(u.scheduled_time).day}</div><div className="m">{monthShort(u.scheduled_time)}</div></div>
                <div style={{ flex: 1 }}>
                  <b>{u.skill_name}</b> <span className="muted">· {u.i_am_tutor ? 'teaching' : 'learning from'} {u.counterpart}</span>
                  <div className="small muted">{fmtTime(u.scheduled_time)} · {u.duration_minutes} min · {u.location}</div>
                </div>
                <Badge>{u.status}</Badge>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><h2>Top tutors</h2><p>tutor_leaderboard_view · RANK()</p></div></div>
          <div className="card-body flush">
            {d.leaders.map((l) => (
              <div key={l.user_id} className="list-item">
                <span className="bold num" style={{ width: 22 }}>#{l.rank_position}</span>
                <div style={{ flex: 1 }}><b>{l.full_name}</b><div className="tiny muted">{l.sessions_taught} sessions taught</div></div>
                <Stars value={l.avg_rating} />
              </div>
            ))}
          </div>
        </div>
      </div>
      {booking && <BookModal listing={booking} onClose={() => setBooking(null)} onBooked={load} />}
    </>
  );
}
