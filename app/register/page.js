'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PublicNav from '@/components/PublicNav';
import { api, ErrorBox } from '@/components/ui';

const DEPARTMENTS = ['Computer Science', 'Computer Science (AI & ML)', 'Electronics & Communication',
  'Electrical & Electronics', 'Mechanical', 'Biotechnology', 'Design', 'Management'];

export default function RegisterPage() {
  const router = useRouter();
  const [f, setF] = useState({ full_name: '', email: '', department: DEPARTMENTS[0], password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/api/auth/register', { method: 'POST', body: f });
      router.push('/my-skills');
    } catch (err) { setError(err); setBusy(false); }
  }

  return (
    <div className="public">
      <PublicNav />
      <div className="auth-wrap">
        <div className="card auth-card">
          <div className="card-body" style={{ padding: 28 }}>
            <h1>Join SkillSwap</h1>
            <p className="muted mt-8">You start with <b>20 free credits</b> — enough for two hours of tutoring.</p>
            {/* Deliberately light client-side checks: name, e-mail format and
                uniqueness are validated by PostgreSQL constraints. */}
            <form onSubmit={submit} className="stack mt-24" style={{ gap: 14 }} noValidate>
              <div className="field"><label>Full name</label><input className="input" value={f.full_name} onChange={set('full_name')} /></div>
              <div className="field"><label>Campus e-mail</label><input className="input" inputMode="email" value={f.email} onChange={set('email')} placeholder="you@campus.edu" /></div>
              <div className="field">
                <label>Department</label>
                <select className="select" value={f.department} onChange={set('department')}>
                  {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" className="input" value={f.password} onChange={set('password')} autoComplete="new-password" />
                <span className="hint">At least 8 characters with a letter and a number. Stored only as a bcrypt hash.</span>
              </div>
              <ErrorBox error={error} />
              <button className="btn primary lg block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
            </form>
            <p className="small muted mt-24" style={{ textAlign: 'center' }}>Already have an account? <Link href="/login">Log in</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}
