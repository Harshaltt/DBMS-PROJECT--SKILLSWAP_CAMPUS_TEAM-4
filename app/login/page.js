'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import { api, ErrorBox } from '@/components/ui';

const DEMO = [
  { r: 'Admin', n: 'Dr. Meera Krishnan', e: 'admin@campus.edu' },
  { r: 'Staff', n: 'Prof. Ramesh Iyer', e: 'ramesh.iyer@campus.edu' },
  { r: 'Student', n: 'Harsh Mannan', e: 'harsh@campus.edu' },
  { r: 'Student', n: 'Chirag Arun Yadwad', e: 'chirag@campus.edu' },
];

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get('next') || '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/api/auth/login', { method: 'POST', body: { email, password } });
      router.push(next.startsWith('/') ? next : '/dashboard');
      router.refresh();
    } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="card-body" style={{ padding: 28 }}>
          <h1>Welcome back</h1>
          <p className="muted mt-8">Log in with your campus account.</p>
          <form onSubmit={submit} className="stack mt-24" style={{ gap: 14 }}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </div>
            <ErrorBox error={error} />
            <button className="btn primary lg block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
          </form>
          <div className="mt-24">
            <div className="label">Demo accounts <span className="muted" style={{ fontWeight: 400 }}>(password: Password@123)</span></div>
            <div className="demo-accounts mt-8">
              {DEMO.map((d) => (
                <button key={d.e} type="button" className="demo-acc" onClick={() => { setEmail(d.e); setPassword('Password@123'); }}>
                  <div className="r">{d.r}</div><div className="n">{d.n}</div>
                </button>
              ))}
            </div>
          </div>
          <p className="small muted mt-24" style={{ textAlign: 'center' }}>
            New here? <Link href="/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="public">
      <PublicNav />
      <Suspense fallback={null}><LoginForm /></Suspense>
    </div>
  );
}
