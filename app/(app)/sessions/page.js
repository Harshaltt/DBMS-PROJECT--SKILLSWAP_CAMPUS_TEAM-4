'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api, Badge, credits, Empty, ErrorBox, fmtDateTime, Loading, Modal } from '@/components/ui';

function ReviewModal({ session, onClose, onDone }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError(null);
    try { await api('/api/reviews', { method: 'POST', body: { session_id: session.session_id, rating, comment } }); onDone(); }
    catch (e) { setError(e); setBusy(false); }
  }
  return (
    <Modal title={`Review ${session.counterpart}`} subtitle={`${session.skill_name} · ${fmtDateTime(session.scheduled_time)}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>Submit review</button></>}>
      <div className="field">
        <label>Rating</label>
        <div className="row" style={{ gap: 4 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className="btn ghost" style={{ fontSize: 24, color: n <= rating ? '#d98e04' : '#d5d9e2', padding: '0 4px' }}
              onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>
          ))}
        </div>
      </div>
      <div className="field mt-16">
        <label>Comment (optional)</label>
        <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="What was helpful?" />
      </div>
      <div className="mt-16"><ErrorBox error={error} /></div>
    </Modal>
  );
}

export default function Sessions() {
  const { toast, refreshMe } = useApp();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('action');
  const [error, setError] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => api('/api/sessions').then(setData).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  async function act(s, action) {
    if (action === 'cancel' && !confirm('Cancel this session?')) return;
    setBusyId(s.session_id); setError(null);
    try {
      const r = await api(`/api/sessions/${s.session_id}`, { method: 'PATCH', body: { action } });
      const msg = {
        confirm: 'Session confirmed — the learner has been notified.',
        complete: `Completed! ${credits(r.session.credits_charged)} credits moved from you to ${s.counterpart} (settlement trigger).`,
        cancel: 'Session cancelled.',
      }[action];
      toast(msg);
      await load(); refreshMe();
    } catch (e) { setError(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    setBusyId(null);
  }

  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  const all = data.sessions;
  const needsAction = (s) =>
    (s.i_am_tutor && s.status === 'pending') ||
    (!s.i_am_tutor && s.status === 'confirmed' && s.has_started) ||
    (s.status === 'completed' && !s.i_reviewed);
  const groups = {
    action: all.filter(needsAction),
    upcoming: all.filter((s) => ['pending', 'confirmed'].includes(s.status) && !s.has_started).reverse(),
    history: all.filter((s) => ['completed', 'cancelled'].includes(s.status) || s.has_started),
  };
  const list = groups[tab];

  return (
    <>
      <div className="page-head">
        <div><h1>Sessions</h1><p>Tutors confirm requests; learners mark sessions completed, which moves the credits.</p></div>
      </div>
      <div className="tabs">
        {[['action', 'Needs action'], ['upcoming', 'Upcoming'], ['history', 'History']].map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}<span className="count">{groups[k].length}</span></button>
        ))}
      </div>
      <ErrorBox error={error} />
      <div className="card mt-8">
        <div className="table-wrap">
          {!list.length ? <Empty>Nothing here.</Empty> : (
            <table className="table">
              <thead><tr><th>When</th><th>Skill</th><th>Role</th><th>With</th><th className="right">Credits</th><th>Status</th><th className="right">Actions</th></tr></thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.session_id}>
                    <td className="nowrap">{fmtDateTime(s.scheduled_time)}<div className="tiny muted">{s.duration_minutes} min · {s.location}</div></td>
                    <td><b>{s.skill_name}</b><div className="tiny muted">#{s.session_id} · {s.category_name}</div></td>
                    <td><Badge tone={s.i_am_tutor ? 'teal' : 'brand'}>{s.i_am_tutor ? 'Teaching' : 'Learning'}</Badge></td>
                    <td>{s.counterpart}</td>
                    <td className="right num">{s.i_am_tutor ? '+' : '−'}{credits(s.credits_charged)}</td>
                    <td><Badge>{s.status}</Badge>{s.rating_received && <div className="tiny muted">rated you {s.rating_received}★</div>}</td>
                    <td className="right">
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        {s.i_am_tutor && s.status === 'pending' && <button className="btn sm primary" disabled={busyId === s.session_id} onClick={() => act(s, 'confirm')}>Confirm</button>}
                        {!s.i_am_tutor && s.status === 'confirmed' && (
                          <button className="btn sm teal" disabled={busyId === s.session_id} onClick={() => act(s, 'complete')}
                            title={s.has_started ? 'Pay the tutor and close the session' : 'The database will refuse this until the session has taken place'}>
                            Mark completed
                          </button>
                        )}
                        {['pending', 'confirmed'].includes(s.status) && <button className="btn sm danger" disabled={busyId === s.session_id} onClick={() => act(s, 'cancel')}>Cancel</button>}
                        {s.status === 'completed' && !s.i_reviewed && <button className="btn sm" onClick={() => setReviewing(s)}>Review</button>}
                        {s.status === 'completed' && s.i_reviewed && <span className="tiny muted">reviewed ✓</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {reviewing && <ReviewModal session={reviewing} onClose={() => setReviewing(null)}
        onDone={() => { setReviewing(null); toast('Thanks! Review saved.'); load(); }} />}
    </>
  );
}
