'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api, ErrorBox, Loading } from '@/components/ui';

export default function Catalog() {
  const { me, toast } = useApp();
  const [cats, setCats] = useState(null);
  const [error, setError] = useState(null);
  const [newCat, setNewCat] = useState('');
  const [newSkill, setNewSkill] = useState({});
  const isAdmin = me?.role === 'admin';

  const load = useCallback(() => api('/api/admin/catalog').then((r) => setCats(r.categories)).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  async function run(fn, msg) {
    setError(null);
    try { await fn(); toast(msg); load(); } catch (e) { setError(e); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }
  const addCat = () => run(() => api('/api/admin/catalog', { method: 'POST', body: { type: 'category', name: newCat } }).then(() => setNewCat('')), 'Category added.');
  const addSkill = (c) => run(() => api('/api/admin/catalog', { method: 'POST', body: { type: 'skill', name: newSkill[c.category_id] || '', category_id: c.category_id } })
    .then(() => setNewSkill({ ...newSkill, [c.category_id]: '' })), 'Skill added.');
  const del = (type, id, name) => confirm(`Delete ${type} “${name}”?`) &&
    run(() => api(`/api/admin/catalog?type=${type}&id=${id}`, { method: 'DELETE' }), `${type} deleted.`);

  if (!cats) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <div className="page-head">
        <div><h1>Skill catalogue</h1><p>Deletes are governed by foreign keys: anything with history is protected by <span className="chip">ON DELETE RESTRICT</span>.</p></div>
        {isAdmin && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); addCat(); }}>
            <input className="input" style={{ width: 220 }} placeholder="New category" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button className="btn primary">Add category</button>
          </form>
        )}
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-3 mt-8">
        {cats.map((c) => (
          <div key={c.category_id} className="card">
            <div className="card-head">
              <div><h3>{c.category_name}</h3><p>{c.skills.length} skills · {c.resources} resources</p></div>
              {isAdmin && <button className="btn sm ghost" title="Delete category" onClick={() => del('category', c.category_id, c.category_name)}>✕</button>}
            </div>
            <div className="card-body" style={{ padding: '8px 20px 14px' }}>
              {c.skills.map((s) => (
                <div key={s.skill_id} className="row between small" style={{ padding: '5px 0' }}>
                  <span>{s.skill_name}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="tiny muted">{s.listings} listings · {s.sessions} sessions</span>
                    {isAdmin && <button className="btn sm ghost" style={{ height: 24, padding: '0 6px' }} onClick={() => del('skill', s.skill_id, s.skill_name)}>✕</button>}
                  </span>
                </div>
              ))}
              {isAdmin && (
                <form className="row mt-8" onSubmit={(e) => { e.preventDefault(); addSkill(c); }}>
                  <input className="input" style={{ height: 32 }} placeholder="Add skill" value={newSkill[c.category_id] || ''}
                    onChange={(e) => setNewSkill({ ...newSkill, [c.category_id]: e.target.value })} />
                  <button className="btn sm">Add</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
