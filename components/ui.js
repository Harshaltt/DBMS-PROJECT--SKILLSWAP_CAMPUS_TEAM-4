'use client';
import { useEffect } from 'react';

/* ---------- API helper ---------- */
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.db = data?.db || null;
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
      window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname);
    }
    throw err;
  }
  return data;
}

/* ---------- dates (DB sends local 'YYYY-MM-DD HH:MM:SS' text; no TZ shifting) ---------- */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parts(ts) {
  if (!ts) return null;
  const [d, t = '00:00'] = String(ts).replace('T', ' ').split(' ');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return { y, m, day, hh, mm };
}
export function fmtDate(ts) {
  const p = parts(ts); if (!p) return '';
  return `${p.day} ${MONTHS[p.m - 1]} ${p.y}`;
}
export function fmtDateTime(ts) {
  const p = parts(ts); if (!p) return '';
  const h12 = ((p.hh + 11) % 12) + 1;
  return `${p.day} ${MONTHS[p.m - 1]}, ${h12}:${String(p.mm).padStart(2, '0')} ${p.hh < 12 ? 'AM' : 'PM'}`;
}
export function fmtTime(ts) {
  const p = parts(ts); if (!p) return '';
  const h12 = ((p.hh + 11) % 12) + 1;
  return `${h12}:${String(p.mm).padStart(2, '0')} ${p.hh < 12 ? 'AM' : 'PM'}`;
}
export function monthShort(ts) { const p = parts(ts); return p ? MONTHS[p.m - 1] : ''; }
export function timeAgo(ts) {
  const p = parts(ts); if (!p) return '';
  const then = new Date(p.y, p.m - 1, p.day, p.hh, p.mm).getTime();
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return fmtDate(ts);
}
export const credits = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 }));

/* ---------- small components ---------- */
export function initials(name = '') {
  return name.replace(/^(Dr|Prof|Ms|Mr)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}
export function Avatar({ name, size }) {
  return <span className={`avatar ${size === 'lg' ? 'lg' : ''}`} aria-hidden>{initials(name)}</span>;
}

const STATUS_COLOR = {
  pending: 'amber', confirmed: 'blue', completed: 'green', cancelled: 'gray',
  approved: 'green', rejected: 'red', returned: 'gray',
  available: 'green', borrowed: 'amber', unavailable: 'gray',
  earned: 'green', spent: 'red', bonus: 'brand', refund: 'blue',
  beginner: 'gray', intermediate: 'blue', advanced: 'teal', expert: 'brand',
  admin: 'brand', staff: 'teal', student: 'gray',
};
export function Badge({ children, tone }) {
  const t = tone || STATUS_COLOR[String(children).toLowerCase()] || 'gray';
  return <span className={`badge ${t}`}>{children}</span>;
}

export function Stars({ value = 0, count }) {
  const v = Math.round(Number(value) || 0);
  return (
    <span className="stars" title={`${Number(value || 0).toFixed(2)} / 5`}>
      {'★★★★★'.slice(0, v)}<span className="off">{'★★★★★'.slice(0, 5 - v)}</span>
      {count !== undefined && <span className="muted small" style={{ marginLeft: 6, letterSpacing: 0 }}>{Number(value) ? Number(value).toFixed(1) : 'new'}{count ? ` (${count})` : ''}</span>}
    </span>
  );
}

export function ErrorBox({ error }) {
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      {error.message || String(error)}
      {error.db && (
        <span className="db-tag">
          Rejected by PostgreSQL · SQLSTATE {error.db.code}{error.db.constraint ? ` · ${error.db.constraint}` : ''}
        </span>
      )}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" style={wide ? { maxWidth: 760 } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Loading({ label = 'Loading…' }) {
  return <div className="empty">{label}</div>;
}

export function MatchBar({ value, label = 'match' }) {
  if (value === null || value === undefined) return null;
  const pct = Math.max(0, Math.min(1, Number(value))) * 100;
  return (
    <span className="match" title={`cosine similarity ${Number(value).toFixed(3)}`}>
      <span className="match-bar"><span style={{ width: `${pct}%` }} /></span>
      {Math.round(pct)}% {label}
    </span>
  );
}
