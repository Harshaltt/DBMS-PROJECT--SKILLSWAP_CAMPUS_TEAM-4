import Link from 'next/link';

export default function PublicNav() {
  return (
    <nav className="public-nav">
      <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
        <span className="brand-mark">S</span>
        <span><div className="brand-name">SkillSwap Campus</div><div className="brand-sub">Teach · Learn · Share</div></span>
      </Link>
      <div className="row">
        <Link href="/login" className="btn ghost">Log in</Link>
        <Link href="/register" className="btn primary">Create account</Link>
      </div>
    </nav>
  );
}
