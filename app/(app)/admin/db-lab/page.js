'use client';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/AppShell';
import { api, ErrorBox, Loading } from '@/components/ui';

function ResultTable({ result }) {
  if (!result) return null;
  const isPlan = result.columns.length === 1 && result.columns[0] === 'QUERY PLAN';
  if (isPlan) return <pre className="sql plan mt-16">{result.rows.map((r) => r['QUERY PLAN']).join('\n')}</pre>;
  return (
    <div className="mt-16">
      <div className="small muted">{result.rowCount} row{result.rowCount === 1 ? '' : 's'} · {result.ms} ms · read-only transaction</div>
      <div className="table-wrap card mt-8" style={{ maxHeight: 380, overflow: 'auto' }}>
        <table className="table compact">
          <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{result.rows.map((r, i) => (
            <tr key={i}>{result.columns.map((c) => <td key={c} className="small">{r[c] === null ? <span className="muted">NULL</span> : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c])}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function DbLab() {
  const { me } = useApp();
  const [cat, setCat] = useState(null);
  const [tests, setTests] = useState(null);
  const [testing, setTesting] = useState(false);
  const [sel, setSel] = useState(null);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [sql, setSql] = useState("SELECT full_name, role, credits_balance\nFROM users\nORDER BY credits_balance DESC\nLIMIT 5");
  const [consoleResult, setConsoleResult] = useState(null);
  const [error, setError] = useState(null);
  const [consoleError, setConsoleError] = useState(null);

  useEffect(() => { api('/api/admin/db-lab').then((r) => { setCat(r); setSel(r.queries[0]); }).catch(setError); }, []);

  async function runTests() {
    setTesting(true); setError(null);
    try { setTests(await api('/api/admin/db-lab', { method: 'POST', body: { kind: 'tests' } })); } catch (e) { setError(e); }
    setTesting(false);
  }
  async function runQuery(q) {
    setSel(q); setResult(null); setRunning(true); setError(null);
    try { setResult(await api('/api/admin/db-lab', { method: 'POST', body: { kind: 'query', id: q.id } })); } catch (e) { setError(e); }
    setRunning(false);
  }
  async function runConsole() {
    setConsoleError(null); setConsoleResult(null);
    try { setConsoleResult(await api('/api/admin/db-lab', { method: 'POST', body: { kind: 'sql', sql } })); } catch (e) { setConsoleError(e); }
  }

  if (!cat) return error ? <ErrorBox error={error} /> : <Loading />;
  const passed = tests?.results.filter((r) => r.pass).length;
  let lastGroup = '';

  return (
    <>
      <div className="page-head">
        <div><h1>DB Lab</h1><p>Run the integrity test suite and the project’s important queries live against PostgreSQL.</p></div>
      </div>
      <ErrorBox error={error} />

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Integrity test suite</h2>
            <p>{cat.tests.length} tests. Each attacks the database inside one transaction that is rolled back — nothing is changed.</p>
          </div>
          <button className="btn primary" onClick={runTests} disabled={testing}>{testing ? 'Running…' : '▶ Run all tests'}</button>
        </div>
        {tests && (
          <div className={`alert ${passed === tests.results.length ? 'success' : 'error'}`} style={{ margin: '14px 20px 0' }}>
            <b>{passed}/{tests.results.length} passed</b> in {tests.ms} ms · every change rolled back
          </div>
        )}
        <div className="table-wrap mt-8">
          <table className="table compact">
            <thead><tr><th style={{ width: 40 }}>#</th><th>Test</th><th>Expected</th><th>Result</th><th>Database response</th></tr></thead>
            <tbody>
              {(tests?.results || cat.tests).map((t) => {
                const header = t.group !== lastGroup ? (lastGroup = t.group) : null;
                return [
                  header && <tr key={'g' + t.group}><td colSpan={5} className="bold small" style={{ background: 'var(--surface-2)' }}>{t.group}</td></tr>,
                  <tr key={t.id}>
                    <td className="bold">{t.id}</td>
                    <td>{t.name}<div className="tiny muted" style={{ fontFamily: 'var(--mono)' }}>{t.sql}</div></td>
                    <td><span className={`badge ${t.expect === 'reject' ? 'red' : 'green'}`}>{t.expect}</span></td>
                    <td>{t.outcome ? (t.pass ? <span className="badge green">✓ pass</span> : <span className="badge red">✕ fail</span>) : <span className="muted small">—</span>}</td>
                    <td className="small" style={{ maxWidth: 420 }}>{t.message || <span className="muted">not run yet</span>}</td>
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="lab-grid mt-16">
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-head"><h2>Important queries</h2></div>
          <div>
            {cat.queries.map((q) => (
              <button key={q.id} onClick={() => runQuery(q)} className="list-item"
                style={{ width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid var(--line)', background: sel?.id === q.id ? 'var(--brand-soft)' : 'transparent', cursor: 'pointer', display: 'block' }}>
                <div className="small bold">{q.title}</div>
                <div className="tiny muted">{q.concepts.join(' · ')}</div>
              </button>
            ))}
          </div>
        </div>
        {sel && (
          <div className="card card-pad" style={{ alignSelf: 'start', minWidth: 0 }}>
            <div className="row between wrap">
              <div><h2>{sel.title}</h2><div className="row wrap mt-8" style={{ gap: 6 }}>{sel.concepts.map((c) => <span key={c} className="badge brand plain">{c}</span>)}</div></div>
              <button className="btn primary" onClick={() => runQuery(sel)} disabled={running}>{running ? 'Running…' : '▶ Run'}</button>
            </div>
            {sel.note && <div className="alert info mt-16">{sel.note}</div>}
            <pre className="sql mt-16">{(sel.pre || []).map((p) => p + ';\n').join('')}{sel.sql}</pre>
            <ResultTable result={result} />
          </div>
        )}
      </div>

      {me?.role === 'admin' && (
        <div className="card mt-16">
          <div className="card-head"><div><h2>SQL console</h2><p>Admin only. Runs one statement in a READ ONLY transaction with a 5 s timeout — writes are impossible.</p></div>
            <button className="btn primary" onClick={runConsole}>▶ Run</button></div>
          <div className="card-body">
            <textarea className="textarea" style={{ fontFamily: 'var(--mono)', fontSize: 13, minHeight: 120 }} value={sql} onChange={(e) => setSql(e.target.value)}
              onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runConsole(); }} />
            <div className="tiny muted mt-8">Ctrl/⌘ + Enter to run</div>
            <div className="mt-8"><ErrorBox error={consoleError} /></div>
            <ResultTable result={consoleResult} />
          </div>
        </div>
      )}
    </>
  );
}
