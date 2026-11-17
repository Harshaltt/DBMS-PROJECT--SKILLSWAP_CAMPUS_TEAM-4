'use client';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api, Avatar, Badge, Empty, ErrorBox, fmtDate, Loading, MatchBar, Modal } from '@/components/ui';

const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

function BorrowModal({ item, onClose, onDone }) {
  const [start, setStart] = useState(plusDays(1));
  const [end, setEnd] = useState(plusDays(4));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setError(null);
    try { await api('/api/borrow', { method: 'POST', body: { resource_id: item.resource_id, start_date: start, end_date: end } }); onDone(); }
    catch (e) { setError(e); setBusy(false); }
  }
  return (
    <Modal title={`Borrow “${item.title}”`} subtitle={`Owned by ${item.owner_name}. Up to 30 days.`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>Send request</button></>}>
      <div className="form-grid">
        <div className="field"><label>From</label><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="field"><label>Until</label><input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div className="mt-16"><ErrorBox error={error} /></div>
    </Modal>
  );
}

function ListModal({ cats, onClose, onDone }) {
  const [f, setF] = useState({ title: '', description: '', category_id: '', condition: 'good' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit() {
    setBusy(true); setError(null);
    try { await api('/api/resources', { method: 'POST', body: f }); onDone(); } catch (e) { setError(e); setBusy(false); }
  }
  return (
    <Modal title="List an item to lend" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" disabled={busy} onClick={submit}>List item</button></>}>
      <div className="form-grid">
        <div className="field full"><label>Title</label><input className="input" value={f.title} onChange={set('title')} placeholder="e.g. Casio fx-991EX calculator" /></div>
        <div className="field"><label>Category</label>
          <select className="select" value={f.category_id} onChange={set('category_id')}>
            <option value="">—</option>{cats.map((c) => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
          </select>
        </div>
        <div className="field"><label>Condition</label>
          <select className="select" value={f.condition} onChange={set('condition')}>{['new', 'good', 'fair', 'worn'].map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div className="field full"><label>Description</label><textarea className="textarea" value={f.description} onChange={set('description')} /></div>
      </div>
      <div className="mt-16"><ErrorBox error={error} /></div>
    </Modal>
  );
}

export default function Resources() {
  const { toast } = useApp();
  const [tab, setTab] = useState('browse');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [items, setItems] = useState(null);
  const [mine, setMine] = useState(null);
  const [reqs, setReqs] = useState(null);
  const [cats, setCats] = useState([]);
  const [error, setError] = useState(null);
  const [borrowing, setBorrowing] = useState(null);
  const [listing, setListing] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'requests') setTab('requests');
    api('/api/catalog').then((r) => setCats(r.categories));
  }, []);

  const loadBrowse = useCallback((query = q) =>
    api(`/api/resources?${new URLSearchParams({ q: query, category })}`).then(setItems).catch(setError), [q, category]);
  const loadMine = useCallback(() => api('/api/resources?mine=1').then((r) => setMine(r.resources)).catch(setError), []);
  const loadReqs = useCallback(() => api('/api/borrow').then(setReqs).catch(setError), []);

  useEffect(() => { loadBrowse(); }, [category]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadMine(); loadReqs(); }, [loadMine, loadReqs]);

  async function reqAction(r, action) {
    setError(null);
    try {
      const res = await api(`/api/borrow/${r.request_id}`, { method: 'PATCH', body: { action } });
      toast(action === 'approve'
        ? `Approved.${res.autoRejected ? ` ${res.autoRejected} overlapping request(s) auto-rejected in the same transaction.` : ''}`
        : `Request ${res.status}.`);
      loadReqs(); loadMine(); loadBrowse();
    } catch (e) { setError(e); }
  }
  async function toggle(item) {
    setError(null);
    try {
      await api(`/api/resources/${item.resource_id}`, { method: 'PATCH',
        body: { availability_status: item.availability_status === 'available' ? 'unavailable' : 'available' } });
      loadMine();
    } catch (e) { setError(e); }
  }
  async function remove(item) {
    if (!confirm(`Delete “${item.title}”?`)) return;
    try { await api(`/api/resources/${item.resource_id}`, { method: 'DELETE' }); toast('Listing deleted.'); loadMine(); loadBrowse(); }
    catch (e) { setError(e); }
  }

  const pendingIncoming = reqs?.incoming.filter((r) => r.status === 'pending').length || 0;

  return (
    <>
      <div className="page-head">
        <div><h1>Resource sharing</h1><p>Lend what sits idle, borrow what you need. Overlapping loans are impossible by design.</p></div>
        <button className="btn primary" onClick={() => setListing(true)}>+ List an item</button>
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'browse' ? 'on' : ''}`} onClick={() => setTab('browse')}>Browse</button>
        <button className={`tab ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>My listings<span className="count">{mine?.length ?? 0}</span></button>
        <button className={`tab ${tab === 'requests' ? 'on' : ''}`} onClick={() => setTab('requests')}>Requests<span className="count">{pendingIncoming}</span></button>
      </div>
      <ErrorBox error={error} />

      {tab === 'browse' && (
        <>
          <form className="search-bar" onSubmit={(e) => { e.preventDefault(); loadBrowse(); }}>
            <input className="input search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. something to measure voltage, a book for placements…" />
            <select className="select" style={{ width: 200, height: 44 }} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>{cats.map((c) => <option key={c.category_id}>{c.category_name}</option>)}
            </select>
            <button className="btn primary lg">Search</button>
          </form>
          {items?.semantic && <p className="small muted mt-8">Ranked by meaning with <span className="chip">fn_semantic_resource_search</span> (pgvector).</p>}
          {!items ? <Loading /> : !items.resources.length ? <div className="card mt-16"><Empty>No items found.</Empty></div> : (
            <div className="grid grid-3 mt-16">
              {items.resources.map((r) => (
                <div key={r.resource_id} className="card listing">
                  <div className="listing-top">
                    <div><h3>{r.title}</h3><div className="tiny muted">{r.category_name || 'General'} · condition: {r.condition}</div></div>
                    <Badge>{r.availability_status}</Badge>
                  </div>
                  <p className="listing-desc">{r.description}</p>
                  {r.similarity !== null && <MatchBar value={r.similarity} label="meaning match" />}
                  <div className="listing-foot">
                    <div className="row"><Avatar name={r.owner_name} /><div><div className="small bold">{r.owner_name}</div><div className="tiny muted">lent {r.times_lent}×</div></div></div>
                    <button className="btn sm primary" disabled={r.is_mine || r.availability_status === 'unavailable'} onClick={() => setBorrowing(r)}>
                      {r.is_mine ? 'Yours' : 'Request'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mine' && (
        <div className="card">
          {!mine ? <Loading /> : !mine.length ? <Empty>You have not listed anything yet.</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Item</th><th>Status</th><th>Pending requests</th><th>Times lent</th><th className="right">Actions</th></tr></thead>
              <tbody>{mine.map((r) => (
                <tr key={r.resource_id}>
                  <td><b>{r.title}</b><div className="tiny muted">{r.category_name} · {r.condition}</div></td>
                  <td><Badge>{r.availability_status}</Badge></td>
                  <td className="num">{r.pending_requests}</td>
                  <td className="num">{r.times_lent}</td>
                  <td className="right"><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                    {r.availability_status !== 'borrowed' && <button className="btn sm" onClick={() => toggle(r)}>{r.availability_status === 'available' ? 'Withdraw' : 'Relist'}</button>}
                    {r.availability_status !== 'borrowed' && <button className="btn sm danger" onClick={() => remove(r)}>Delete</button>}
                  </div></td>
                </tr>))}
              </tbody>
            </table></div>
          )}
        </div>
      )}

      {tab === 'requests' && reqs && (
        <div className="grid">
          <div className="card">
            <div className="card-head"><div><h2>Requests for my items</h2><p>Approving runs a transaction that also rejects overlapping pending requests.</p></div></div>
            {!reqs.incoming.length ? <Empty>No requests yet.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Item</th><th>Borrower</th><th>Dates</th><th>Status</th><th className="right">Actions</th></tr></thead>
                <tbody>{reqs.incoming.map((r) => (
                  <tr key={r.request_id}>
                    <td><b>{r.title}</b></td>
                    <td>{r.borrower_name}<div className="tiny muted">{r.borrower_department}</div></td>
                    <td className="nowrap">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                    <td><Badge>{r.status}</Badge></td>
                    <td className="right"><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      {r.status === 'pending' && <><button className="btn sm primary" onClick={() => reqAction(r, 'approve')}>Approve</button>
                        <button className="btn sm danger" onClick={() => reqAction(r, 'reject')}>Reject</button></>}
                      {r.status === 'approved' && <button className="btn sm" onClick={() => reqAction(r, 'return')}>Mark returned</button>}
                    </div></td>
                  </tr>))}
                </tbody>
              </table></div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h2>My borrow requests</h2></div>
            {!reqs.outgoing.length ? <Empty>You have not requested anything.</Empty> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Item</th><th>Owner</th><th>Dates</th><th>Status</th><th className="right">Actions</th></tr></thead>
                <tbody>{reqs.outgoing.map((r) => (
                  <tr key={r.request_id}>
                    <td><b>{r.title}</b></td><td>{r.owner_name}</td>
                    <td className="nowrap">{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                    <td><Badge>{r.status}</Badge></td>
                    <td className="right">{r.status === 'approved' && <button className="btn sm" onClick={() => reqAction(r, 'return')}>Mark returned</button>}</td>
                  </tr>))}
                </tbody>
              </table></div>
            )}
          </div>
        </div>
      )}
      {borrowing && <BorrowModal item={borrowing} onClose={() => setBorrowing(null)} onDone={() => { setBorrowing(null); toast('Request sent — the owner has been notified.'); loadReqs(); }} />}
      {listing && <ListModal cats={cats} onClose={() => setListing(false)} onDone={() => { setListing(false); toast('Item listed and embedded for semantic search.'); loadMine(); loadBrowse(); }} />}
    </>
  );
}
