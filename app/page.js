import Link from 'next/link';
import PublicNav from '@/components/PublicNav';

const FEATURES = [
  { ico: '🧠', t: 'Semantic matching', d: 'Search by meaning, not keywords. “Make websites” finds the React tutor; “Paris” finds French lessons. Powered by pgvector.' },
  { ico: '◎', t: 'Campus credit economy', d: 'Teach to earn credits, spend them to learn. Every transfer is settled atomically by a database trigger and reconciled against a ledger.' },
  { ico: '🗓', t: 'Clash-free scheduling', d: 'No double bookings and no past dates: overlapping sessions are rejected by PostgreSQL exclusion constraints.' },
  { ico: '▣', t: 'Lend & borrow', d: 'Calculators, kits, textbooks and cameras sitting idle can be lent to peers, with overlap-proof loan periods.' },
];

export default function Landing() {
  return (
    <div className="public">
      <PublicNav />
      <section className="hero">
        <div>
          <span className="badge brand">DBMS Level 3 mini project · PostgreSQL + pgvector + Next.js</span>
          <h1 style={{ marginTop: 16 }}>Teach what you know.<br /><em>Learn what you don’t.</em></h1>
          <p className="lead">
            SkillSwap Campus connects students who can teach a skill with students who want to learn it,
            books credit-based sessions between them, and lets them lend and borrow the things sitting idle in their rooms.
          </p>
          <div className="row mt-24 wrap">
            <Link href="/login" className="btn primary lg">Log in to the demo</Link>
            <Link href="/register" className="btn lg">Create an account</Link>
          </div>
        </div>
        <div className="card hero-panel">
          <div className="small muted bold">SEMANTIC SEARCH</div>
          <div className="input mt-8" style={{ display: 'flex', alignItems: 'center' }}>sing indian classical music</div>
          <div className="mini-result"><span><b>Carnatic Vocals</b> · Diya Patel</span><span className="badge teal">63% match</span></div>
          <div className="mini-result"><span><b>Kannada</b> · Diya Patel</span><span className="badge gray">30% match</span></div>
          <p className="small muted mt-16">
            No keyword in the query appears in the listing — the match comes from 384-dimensional
            sentence embeddings compared by cosine distance inside PostgreSQL.
          </p>
        </div>
      </section>
      <section className="features">
        {FEATURES.map((f) => (
          <div key={f.t} className="card feature">
            <div className="ico">{f.ico}</div>
            <h3>{f.t}</h3>
            <p>{f.d}</p>
          </div>
        ))}
      </section>
      <footer className="muted small" style={{ textAlign: 'center', paddingBottom: 32 }}>
        Harsh Mannan (PES2UG24CS183) · Chirag Arun Yadwad (PES2UG24CS136) · PES University
      </footer>
    </div>
  );
}
