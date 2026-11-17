'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, Avatar, credits, timeAgo } from './ui';

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { href: '/skills', label: 'Find skills', icon: '⌕' },
  { href: '/my-skills', label: 'My skills', icon: '✦' },
  { href: '/sessions', label: 'Sessions', icon: '◷' },
  { href: '/resources', label: 'Resources', icon: '▣' },
  { href: '/credits', label: 'Credits', icon: '◎' },
];
const ADMIN_NAV = [
  { href: '/admin', label: 'Analytics', icon: '▤', roles: ['admin', 'staff'] },
  { href: '/admin/users', label: 'Users', icon: '☺', roles: ['admin', 'staff'] },
  { href: '/admin/catalog', label: 'Skill catalogue', icon: '☰', roles: ['admin', 'staff'] },
  { href: '/admin/db-lab', label: 'DB Lab', icon: '⚙', roles: ['admin', 'staff'] },
];
const TITLES = {
  '/dashboard': 'Dashboard', '/skills': 'Find skills', '/my-skills': 'My skills', '/sessions': 'Sessions',
  '/resources': 'Resource sharing', '/credits': 'Credits & ledger', '/admin': 'Campus analytics',
  '/admin/users': 'User management', '/admin/catalog': 'Skill catalogue', '/admin/db-lab': 'DB Lab',
};

function Bell({ unread, onChange }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) setItems((await api('/api/notifications')).notifications);
  }
  async function markAll() {
    await api('/api/notifications', { method: 'PATCH' });
    setItems((await api('/api/notifications')).notifications);
    onChange();
  }
  async function clearRead() {
    await api('/api/notifications', { method: 'DELETE' });
    setItems((await api('/api/notifications')).notifications);
  }
  return (
    <div className="bell" ref={ref}>
      <button className="bell-btn" onClick={toggle} aria-label="Notifications">🔔</button>
      {unread > 0 && <span className="bell-count">{unread}</span>}
      {open && (
        <div className="dropdown">
          <div className="dropdown-head">
            <strong>Notifications</strong>
            <span className="row">
              <button className="btn ghost sm" onClick={markAll}>Mark all read</button>
              <button className="btn ghost sm" onClick={clearRead}>Clear read</button>
            </span>
          </div>
          {!items && <div className="empty">Loading…</div>}
          {items && !items.length && <div className="empty">You are all caught up.</div>}
          {items?.map((n) => (
            <div key={n.notification_id} className={`notif ${n.is_read ? '' : 'unread'}`}>
              <div>{n.message}</div>
              <div className="when">{timeAgo(n.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [toasts, setToasts] = useState([]);

  const refreshMe = useCallback(async () => {
    try { setMe((await api('/api/auth/me')).user); } catch { /* redirected */ }
  }, []);
  useEffect(() => { refreshMe(); }, [refreshMe, pathname]);

  const toast = useCallback((message, kind = 'success') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  const isStaff = me && ['admin', 'staff'].includes(me.role);
  const navLink = (n) => {
    const active = n.href === '/admin' ? pathname === '/admin' : pathname === n.href || pathname.startsWith(n.href + '/');
    return (
      <Link key={n.href} href={n.href} className={`nav-link ${active ? 'active' : ''}`}>
        <span className="nav-icon">{n.icon}</span>{n.label}
      </Link>
    );
  };

  return (
    <AppCtx.Provider value={{ me, refreshMe, toast }}>
      <div className="shell">
        <aside className="sidebar">
          <Link href="/dashboard" className="brand" style={{ textDecoration: 'none' }}>
            <span className="brand-mark">S</span>
            <span><div className="brand-name">SkillSwap</div><div className="brand-sub">Campus</div></span>
          </Link>
          <div className="nav-label">Exchange</div>
          {NAV.map(navLink)}
          {isStaff && <div className="nav-label">{me.role === 'admin' ? 'Administration' : 'Staff'}</div>}
          {isStaff && ADMIN_NAV.map(navLink)}
          <div className="sidebar-foot">PostgreSQL + pgvector · Next.js</div>
        </aside>
        <div className="main">
          <header className="topbar">
            <div className="topbar-title">{TITLES[pathname] || 'SkillSwap Campus'}</div>
            {me && (
              <>
                <span className="credit-pill" title="Credit balance (available after open bookings)">
                  ◎ {credits(me.credits_balance)} credits
                  {Number(me.available_credits) !== Number(me.credits_balance) && (
                    <span style={{ fontWeight: 500, opacity: 0.8 }}>· {credits(me.available_credits)} free</span>
                  )}
                </span>
                <Bell unread={Number(me.unread)} onChange={refreshMe} />
                <div className="user-chip">
                  <Avatar name={me.full_name} />
                  <div className="user-meta">
                    <div className="name">{me.full_name}</div>
                    <div className="role">{me.role}</div>
                  </div>
                </div>
                <button className="btn sm" onClick={logout}>Log out</button>
              </>
            )}
          </header>
          <main className="content">{children}</main>
        </div>
      </div>
      <div className="toast-stack">
        {toasts.map((t) => <div key={t.id} className={`alert toast ${t.kind}`}>{t.message}</div>)}
      </div>
    </AppCtx.Provider>
  );
}
