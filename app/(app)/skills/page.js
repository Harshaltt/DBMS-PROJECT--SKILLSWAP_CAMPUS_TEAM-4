'use client';
import { useCallback, useEffect, useState } from 'react';
import BookModal from '@/components/BookModal';
import { api, Avatar, Badge, Empty, ErrorBox, Loading, MatchBar, Stars } from '@/components/ui';
import { LEVELS } from '@/lib/constants';

const MODES = [
  { id: 'hybrid', label: 'Hybrid', hint: 'meaning + keywords (Reciprocal Rank Fusion)' },
  { id: 'semantic', label: 'Semantic', hint: 'meaning only (pgvector cosine k-NN)' },
  { id: 'keyword', label: 'Keyword', hint: 'exact words only (PostgreSQL full-text search)' },
];
const EXAMPLES = ['I want to learn how to make websites', 'help with regression for my thesis', 'sing indian classical music',
  'talk to people in Paris', 'nervous about my viva presentation', 'fix my robot circuit board'];

export default function FindSkills() {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('hybrid');
  const [category, setCategory] = useState('');
  const [level, setLevel] = useState('');
  const [minRating, setMinRating] = useState('0');
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(null);

  useEffect(() => { api('/api/catalog').then((r) => setCats(r.categories)).catch(() => {}); }, []);

  const search = useCallback(async (override = {}) => {
    const params = new URLSearchParams({ q: override.q ?? q, mode: override.mode ?? mode, category, level, minRating });
    setLoading(true); setError(null);
    try { setData(await api('/api/skills/search?' + params)); } catch (e) { setError(e); }
    setLoading(false);
  }, [q, mode, category, level, minRating]);

  useEffect(() => { search(); }, [category, level, minRating]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e) => { e.preventDefault(); search(); };
  const tryExample = (ex) => { setQ(ex); search({ q: ex }); };
  const switchMode = (m) => { setMode(m); if (q) search({ mode: m }); };

  return (
    <>
      <div className="page-head">
        <div><h1>Find skills</h1><p>Describe what you want to learn in your own words — the search understands meaning.</p></div>
      </div>

      <div className="card card-pad">
        <form onSubmit={submit} className="search-bar">
          <input className="input search-input" value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder="e.g. I need help analysing data for my project" />
          <button className="btn primary lg">Search</button>
        </form>
        <div className="row wrap mt-16" style={{ gap: 14 }}>
          <div className="segmented" role="tablist">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={mode === m.id ? 'on' : ''} onClick={() => switchMode(m.id)} title={m.hint}>{m.label}</button>
            ))}
          </div>
          <span className="small muted">{MODES.find((m) => m.id === mode).hint}</span>
        </div>
        <div className="row wrap mt-16" style={{ gap: 10 }}>
          <select className="select" style={{ width: 200 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.category_id}>{c.category_name}</option>)}
          </select>
          <select className="select" style={{ width: 170 }} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Any level</option>
            {LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
          <select className="select" style={{ width: 170 }} value={minRating} onChange={(e) => setMinRating(e.target.value)}>
            <option value="0">Any rating</option>
            <option value="3">3★ and up</option>
            <option value="4">4★ and up</option>
            <option value="4.5">4.5★ and up</option>
          </select>
        </div>
        <div className="row wrap mt-16" style={{ gap: 6 }}>
          <span className="small muted">Try:</span>
          {EXAMPLES.map((ex) => <button key={ex} type="button" className="btn sm" onClick={() => tryExample(ex)}>{ex}</button>)}
        </div>
      </div>

      {data?.meta && (
        <p className="small muted mt-16">
          {data.results.length} result{data.results.length === 1 ? '' : 's'} · <span className="chip">{data.meta.used}</span> · {data.meta.ms} ms
        </p>
      )}
      {data?.meta?.note && <div className="alert info mt-8">{data.meta.note}</div>}
      <div className="mt-8"><ErrorBox error={error} /></div>
      {loading && !data && <Loading label="Searching…" />}

      {data && !data.results.length && <div className="card mt-8"><Empty>No tutors match. Try different words or the Semantic mode.</Empty></div>}
      <div className="grid grid-3 mt-8" style={{ opacity: loading ? 0.6 : 1 }}>
        {data?.results.map((r) => (
          <div key={r.user_skill_id} className="card listing">
            <div className="listing-top">
              <div>
                <h3>{r.skill_name}</h3>
                <div className="tiny muted">{r.category_name}</div>
              </div>
              <Badge>{r.proficiency_level}</Badge>
            </div>
            <div className="row">
              <Avatar name={r.full_name} />
              <div><div className="bold small">{r.full_name}{r.is_mine && <span className="muted"> (you)</span>}</div><div className="tiny muted">{r.department}</div></div>
            </div>
            <p className="listing-desc">{r.description}</p>
            {data.meta.mode !== 'browse' && data.meta.mode !== 'keyword' && (
              <div className="row wrap" style={{ gap: 10 }}>
                <MatchBar value={r.similarity} label="meaning match" />
                {data.meta.mode === 'hybrid' && (
                  <span className="tiny muted">semantic #{r.semantic_rank ?? '–'} · keyword #{r.keyword_rank ?? '–'}</span>
                )}
              </div>
            )}
            {data.meta.mode === 'keyword' && <span className="tiny muted">ts_rank {Number(r.similarity).toFixed(3)}</span>}
            <div className="listing-foot">
              <Stars value={r.avg_rating} count={r.review_count} />
              <button className="btn primary sm" disabled={r.is_mine} onClick={() => setBooking(r)}>{r.is_mine ? 'Your listing' : 'Book session'}</button>
            </div>
          </div>
        ))}
      </div>
      {booking && <BookModal listing={booking} onClose={() => setBooking(null)} />}
    </>
  );
}
