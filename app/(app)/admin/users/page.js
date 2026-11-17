'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api, Badge, credits, ErrorBox, Loading, Modal, timeAgo } from '@/components/ui';

function GrantModal({ user, onClose, onDone }) {
  const [amount, setAmount] = useState(10);
  const [reason, setReason] = useState('Top tutor of the month');
  const [error, setError] = useState(null);
  async function submit() {
    setError(null);
    try { await api('/api/admin/users', { method: 'POST', body: { user_id: user.user_id, amount: Number(amount), reason } }); onDone(); }
    catch (e) { setError(e); }
  }
  return (
    <Modal title={`Grant bonus credits to ${user.full_name}`} subtitle="Balance update + ledger row + notification, all in one transaction." onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={submit}>Grant</button></>}>
      <div className="form-grid">
        <div className="field"><label>Credits</label><input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="field"><label>Reason</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      </div>
      <div className="mt-16"><ErrorBox error={error} /></div>
    </Modal>
  );
}

export default function Users() {
  const { me, toast } = useApp();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [grant, setGrant] = useState(null);
  const [filter, setFilter] = useState('');
  const isAdmin = me?.role === 'admin';

  const load = useCallback(() => api('/api/admin/users').then((r) => setUsers(r.users)).catch(setError), []);
  useEffect(() => { load(); }, [load]);

  async function update(u, patch) {
    setError(null);
    try { await api('/api/admin/users', { method: 'PATCH', body: { user_id: u.user_id, ...patch } }); toast('User updated.'); load(); }
    catch (e) { setError(e); }
  }

  if (!users) return error ? <ErrorBox error={error} /> : <Loading />;
  const shown = users.filter((u) => !filter || (u.full_name + u.email + (u.department || '')).toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <div><h1>User management</h1><p>{isAdmin ? 'Change roles, deactivate accounts (soft delete) and grant credits.' : 'Read-only for staff — only administrators can make changes.'}</p></div>
        <input className="input" style={{ width: 260 }} placeholder="Filter by name, e-mail, department" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ErrorBox error={error} />
      <div className="card mt-8">
        <div className="table-wrap"><table className="table">
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th className="right">Credits</th><th className="right">Taught / learned</th><th>Ledger</th><th>Last login</th><th>Status</th>{isAdmin && <th className="right">Actions</th>}</tr></thead>
          <tbody>{shown.map((u) => (
            <tr key={u.user_id} style={{ opacity: u.is_active ? 1 : 0.55 }}>
              <td><b>{u.full_name}</b><div className="tiny muted">{u.email}</div></td>
              <td>
                {isAdmin && u.user_id !== me.user_id ? (
                  <select className="select" style={{ height: 30, width: 110 }} value={u.role} onChange={(e) => update(u, { role: e.target.value })}>
                    <option>student</option><option>staff</option><option>admin</option>
                  </select>
                ) : <Badge>{u.role}</Badge>}
              </td>
              <td className="small">{u.department}</td>
              <td className="right num">{credits(u.credits_balance)}</td>
              <td className="right num">{u.taught} / {u.learned}</td>
              <td>{Number(u.drift) === 0 ? <span className="badge green">✓ ok</span> : <span className="badge red">drift {u.drift}</span>}</td>
              <td className="small muted nowrap">{u.last_login_at ? timeAgo(u.last_login_at) : 'never'}</td>
              <td>{u.is_active ? <Badge tone="green">active</Badge> : <Badge tone="gray">inactive</Badge>}</td>
              {isAdmin && (
                <td className="right"><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn sm" onClick={() => setGrant(u)}>+ Credits</button>
                  {u.user_id !== me.user_id && (
                    <button className={`btn sm ${u.is_active ? 'danger' : ''}`} onClick={() => update(u, { is_active: !u.is_active })}>{u.is_active ? 'Deactivate' : 'Reactivate'}</button>
                  )}
                </div></td>
              )}
            </tr>))}
          </tbody>
        </table></div>
      </div>
      {grant && <GrantModal user={grant} onClose={() => setGrant(null)} onDone={() => { setGrant(null); toast('Credits granted.'); load(); }} />}
    </>
  );
}
