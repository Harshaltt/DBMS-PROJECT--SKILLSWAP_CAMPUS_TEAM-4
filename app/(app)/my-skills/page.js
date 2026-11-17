'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api, Badge, Empty, ErrorBox, Loading, Modal, timeAgo } from '@/components/ui';
import { LEVELS } from '@/lib/constants';

function SkillForm({ cats, initial, onSave, onCancel, editing }) {
  const [f, setF] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true); setError(null);
    try { await onSave(f); } catch (e) { setError(e); setBusy(false); }
  }
  return (
    <Modal
      title={editing ? `Edit ${initial.skill_name}` : 'Add a skill'}
      subtitle="Your description is turned into a 384-dimensional embedding so others can find you by meaning."
      onClose={onCancel}
      footer={<><button className="btn" onClick={onCancel}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving & embedding…' : 'Save'}</button></>}
    >
      <div className="form-grid">
        {!editing && (
          <>
            <div className="field full">
              <label>I want to…</label>
              <div className="segmented">
                <button type="button" className={f.is_offering ? 'on' : ''} onClick={() => setF({ ...f, is_offering: true })}>Teach this skill</button>
                <button type="button" className={!f.is_offering ? 'on' : ''} onClick={() => setF({ ...f, is_offering: false })}>Learn this skill</button>
              </div>
            </div>
            <div className="field full">
              <label>Skill</label>
              <select className="select" value={f.skill_id} onChange={set('skill_id')}>
                <option value="">Choose a skill…</option>
                {cats.map((c) => (
                  <optgroup key={c.category_id} label={c.category_name}>
                    {c.skills.map((s) => <option key={s.skill_id} value={s.skill_id}>{s.skill_name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          </>
        )}
        <div className="field full">
          <label>{f.is_offering ? 'Your level' : 'Your current level'}</label>
          <select className="select" value={f.proficiency_level} onChange={set('proficiency_level')}>
            {LEVELS.map((l) => <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
        </div>
        <div className="field full">
          <label>{f.is_offering ? 'What can you teach?' : 'What do you want to learn, and why?'}</label>
          <textarea className="textarea" value={f.description} onChange={set('description')}
            placeholder={f.is_offering ? 'e.g. Python for data analysis: pandas, plotting, automating lab work…' : 'e.g. I need to analyse experiment data for my thesis…'} />
        </div>
      </div>
      <div className="mt-16"><ErrorBox error={error} /></div>
    </Modal>
  );
}

function SkillList({ title, items, onEdit, onDelete, empty }) {
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2><span className="badge gray">{items.length}</span></div>
      <div className="card-body flush">
        {!items.length && <Empty>{empty}</Empty>}
        {items.map((s) => (
          <div key={s.user_skill_id} className="list-item" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                <b>{s.skill_name}</b><span className="tiny muted">{s.category_name}</span><Badge>{s.proficiency_level}</Badge>
              </div>
              <p className="small" style={{ marginTop: 4, color: 'var(--ink-2)' }}>{s.description || <i className="muted">No description</i>}</p>
              <div className="row mt-8" style={{ gap: 8 }}>
                {s.has_embedding
                  ? <span className="badge teal" title={`embedded ${timeAgo(s.embedded_at)}`}>● vector stored</span>
                  : <span className="badge amber">no vector yet</span>}
                {s.completed_sessions > 0 && <span className="tiny muted">{s.completed_sessions} completed session{s.completed_sessions > 1 ? 's' : ''}</span>}
              </div>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => onEdit(s)}>Edit</button>
              <button className="btn sm danger" onClick={() => onDelete(s)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MySkills() {
  const { toast } = useApp();
  const [skills, setSkills] = useState(null);
  const [cats, setCats] = useState([]);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => api('/api/my-skills').then((r) => setSkills(r.skills)).catch(setError), []);
  useEffect(() => { load(); api('/api/catalog').then((r) => setCats(r.categories)); }, [load]);

  async function save(f) {
    if (form.editing) {
      await api(`/api/my-skills/${form.initial.user_skill_id}`, { method: 'PUT', body: f });
      toast('Updated — old embedding invalidated by trigger and re-computed.');
    } else {
      const r = await api('/api/my-skills', { method: 'POST', body: f });
      toast(r.embedded ? 'Skill added and embedded into the vector index.' : 'Skill added (embedding unavailable).');
    }
    setForm(null); load();
  }
  async function del(s) {
    if (!confirm(`Remove ${s.skill_name} from your profile?`)) return;
    try { await api(`/api/my-skills/${s.user_skill_id}`, { method: 'DELETE' }); toast('Listing deleted (its vector was removed by ON DELETE CASCADE).'); load(); }
    catch (e) { setError(e); }
  }

  if (!skills) return error ? <ErrorBox error={error} /> : <Loading />;
  const teach = skills.filter((s) => s.is_offering);
  const learn = skills.filter((s) => !s.is_offering);

  return (
    <>
      <div className="page-head">
        <div><h1>My skills</h1><p>What you can teach and what you want to learn. Wanted skills drive your recommendations.</p></div>
        <button className="btn primary" onClick={() => setForm({ initial: { is_offering: true, skill_id: '', proficiency_level: 'intermediate', description: '' } })}>+ Add a skill</button>
      </div>
      <ErrorBox error={error} />
      <div className="grid grid-2">
        <SkillList title="I can teach" items={teach} empty="Add something you are good at — every hour you teach earns 10 credits."
          onEdit={(s) => setForm({ editing: true, initial: s })} onDelete={del} />
        <SkillList title="I want to learn" items={learn} empty="Add something you want to learn to get semantic recommendations."
          onEdit={(s) => setForm({ editing: true, initial: s })} onDelete={del} />
      </div>
      {form && <SkillForm cats={cats} editing={form.editing} initial={form.initial} onSave={save} onCancel={() => setForm(null)} />}
    </>
  );
}
