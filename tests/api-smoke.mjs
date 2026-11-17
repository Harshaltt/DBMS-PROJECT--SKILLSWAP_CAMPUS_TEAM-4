// =====================================================================
// End-to-end API test: drives the running app over HTTP exactly like the
// browser does (cookies, JSON) and checks every important flow + the
// role-based access rules.
//   1. npm run db:setup      (fresh demo data)
//   2. npm run dev           (in another terminal)
//   3. npm run test:api
// NOTE: it books/completes sessions, so run `npm run db:setup` again
// afterwards to restore the pristine demo data.
// =====================================================================
const BASE = process.env.BASE_URL || 'http://localhost:3000';
let pass = 0, fail = 0;

function client() {
  let cookie = '';
  return async (path, { method = 'GET', body } = {}) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}
function check(name, cond, info = '') {
  if (cond) { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); }
  else { fail++; console.log(`  \x1b[31m✕ ${name}\x1b[0m ${info}`); }
}
const tomorrow = (h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(h, m, 0, 0);
  const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:${p(m)}`; };

const anon = client(), harsh = client(), admin = client(), staff = client(), fresh = client();

console.log('\nAuthentication & authorisation');
check('anonymous API call is refused (401)', (await anon('/api/dashboard')).status === 401);
check('wrong password is refused (401)', (await harsh('/api/auth/login', { method: 'POST', body: { email: 'harsh@campus.edu', password: 'nope' } })).status === 401);
check('student logs in', (await harsh('/api/auth/login', { method: 'POST', body: { email: 'HARSH@campus.edu', password: 'Password@123' } })).status === 200);
check('student cannot open admin analytics (403)', (await harsh('/api/admin/analytics')).status === 403);
check('student cannot run DB Lab (403)', (await harsh('/api/admin/db-lab', { method: 'POST', body: { kind: 'tests' } })).status === 403);
check('admin logs in', (await admin('/api/auth/login', { method: 'POST', body: { email: 'admin@campus.edu', password: 'Password@123' } })).status === 200);
check('staff logs in', (await staff('/api/auth/login', { method: 'POST', body: { email: 'ramesh.iyer@campus.edu', password: 'Password@123' } })).status === 200);
check('staff can view analytics', (await staff('/api/admin/analytics')).status === 200);
check('staff cannot change roles (403)', (await staff('/api/admin/users', { method: 'PATCH', body: { user_id: 5, role: 'admin' } })).status === 403);
check('staff cannot use SQL console (403)', (await staff('/api/admin/db-lab', { method: 'POST', body: { kind: 'sql', sql: 'SELECT 1' } })).status === 403);

console.log('\nRegistration - validation enforced by the database');
let r = await fresh('/api/auth/register', { method: 'POST', body: { full_name: 'Test User', email: 'not-an-email', password: 'abc12345' } });
check('invalid e-mail rejected by CHECK chk_users_email_format', r.status === 422 && r.data?.db?.constraint === 'chk_users_email_format', JSON.stringify(r.data));
r = await fresh('/api/auth/register', { method: 'POST', body: { full_name: 'Test User', email: 'test@campus.edu', password: 'short' } });
check('weak password rejected by the API', r.status === 422);
r = await fresh('/api/auth/register', { method: 'POST', body: { full_name: 'Clone', email: 'Harsh@Campus.edu', password: 'abc12345' } });
check('case-insensitive duplicate e-mail rejected by uq_users_email_lower', r.status === 409 && r.data?.db?.constraint === 'uq_users_email_lower', JSON.stringify(r.data));
const stamp = Date.now();
r = await fresh('/api/auth/register', { method: 'POST', body: { full_name: 'Nisha Rao', email: `nisha${stamp}@campus.edu`, password: 'abc12345', department: 'Design' } });
check('valid registration succeeds and logs in', r.status === 201);
r = await fresh('/api/auth/me');
check('new account starts with 20 credits (opening-grant trigger)', Number(r.data?.user?.credits_balance) === 20);

console.log('\nSemantic / hybrid search (pgvector)');
r = await harsh('/api/skills/search?q=' + encodeURIComponent('sing indian classical music') + '&mode=semantic');
check('semantic: "sing indian classical music" -> Carnatic Vocals first', r.data?.results?.[0]?.skill_name === 'Carnatic Vocals', r.data?.results?.[0]?.skill_name);
r = await harsh('/api/skills/search?q=' + encodeURIComponent('talk to people in Paris') + '&mode=hybrid');
check('hybrid: "talk to people in Paris" -> French first', r.data?.results?.[0]?.skill_name === 'French', r.data?.results?.[0]?.skill_name);
r = await harsh('/api/skills/search?q=' + encodeURIComponent('talk to people in Paris') + '&mode=keyword');
check('keyword search cannot find it (proves the vector layer adds value)', r.data?.results?.length === 0);
r = await harsh('/api/skills/search?q=pandas&mode=keyword');
check('keyword: "pandas" finds the Python listings', r.data?.results?.some((x) => x.skill_name === 'Python'));
r = await harsh('/api/skills/search?category=Music');
check('browse with category filter', r.data?.results?.length > 0 && r.data.results.every((x) => x.category_name === 'Music'));

console.log('\nBooking (stored procedure + exclusion constraints + triggers)');
const search = await harsh('/api/skills/search?q=statistics&mode=keyword');
const ishita = search.data.results.find((x) => x.full_name === 'Ishita Joshi' && x.skill_name === 'Statistics');
const before = Number((await harsh('/api/auth/me')).data.user.available_credits);
r = await harsh('/api/sessions', { method: 'POST', body: { offering_user_id: ishita.user_id, skill_id: ishita.skill_id, scheduled_time: tomorrow(9), duration_minutes: 60 } });
check('valid booking succeeds via sp_book_session', r.status === 201, JSON.stringify(r.data));
const after = Number((await harsh('/api/auth/me')).data.user.available_credits);
check('10 credits are reserved (available credits drop)', before - after === 10, `${before} -> ${after}`);
r = await admin('/api/auth/login', { method: 'POST', body: { email: 'admin@campus.edu', password: 'Password@123' } });
const fx = client();
await fx('/api/auth/login', { method: 'POST', body: { email: 'neha@campus.edu', password: 'Password@123' } });
r = await fx('/api/sessions', { method: 'POST', body: { offering_user_id: ishita.user_id, skill_id: ishita.skill_id, scheduled_time: tomorrow(9, 30), duration_minutes: 60 } });
check('overlapping booking with the same tutor rejected (EXCLUDE, 23P01)', r.status === 409 && r.data?.db?.code === '23P01', JSON.stringify(r.data));
r = await harsh('/api/sessions', { method: 'POST', body: { offering_user_id: ishita.user_id, skill_id: ishita.skill_id, scheduled_time: tomorrow(16, 15), duration_minutes: 30 } });
check('learning while you are teaching at that time is rejected (FIX 18 trigger)', r.status === 409 && /Time clash/.test(r.data?.error), JSON.stringify(r.data));
r = await harsh('/api/sessions', { method: 'POST', body: { offering_user_id: ishita.user_id, skill_id: ishita.skill_id, scheduled_time: '2024-01-01T10:00', duration_minutes: 60 } });
check('booking in the past rejected by trigger', r.status === 422 && /past/.test(r.data?.error), JSON.stringify(r.data));
r = await harsh('/api/sessions', { method: 'POST', body: { offering_user_id: ishita.user_id, skill_id: ishita.skill_id, scheduled_time: tomorrow(20), duration_minutes: 10 } });
check('10-minute session rejected by CHECK chk_session_duration_max', r.status === 422 && r.data?.db?.constraint === 'chk_session_duration_max', JSON.stringify(r.data));

console.log('\nSession lifecycle (state machine + credit settlement)');
let sessions = (await harsh('/api/sessions')).data.sessions;
const toConfirm = sessions.find((s) => s.i_am_tutor && s.status === 'pending');
check('tutor confirms a pending request', (await harsh(`/api/sessions/${toConfirm.session_id}`, { method: 'PATCH', body: { action: 'confirm' } })).status === 200);
r = await harsh(`/api/sessions/${toConfirm.session_id}`, { method: 'PATCH', body: { action: 'complete' } });
check('tutor cannot mark completed - only the paying learner (403)', r.status === 403);
const future = sessions.find((s) => !s.i_am_tutor && s.skill_name === 'Statistics' && s.status === 'pending');
const bal0 = Number((await harsh('/api/auth/me')).data.user.credits_balance);
const pastConfirmed = sessions.find((s) => !s.i_am_tutor && s.status === 'confirmed' && s.has_started);
r = await harsh(`/api/sessions/${pastConfirmed.session_id}`, { method: 'PATCH', body: { action: 'complete' } });
check('learner completes a session that took place', r.status === 200, JSON.stringify(r.data));
const bal1 = Number((await harsh('/api/auth/me')).data.user.credits_balance);
check('credits moved atomically (balance -10)', bal0 - bal1 === Number(pastConfirmed.credits_charged), `${bal0} -> ${bal1}`);
r = await harsh(`/api/sessions/${future.session_id}`, { method: 'PATCH', body: { action: 'cancel' } });
check('learner cancels own pending booking', r.status === 200);
r = await harsh(`/api/sessions/${future.session_id}`, { method: 'PATCH', body: { action: 'cancel' } });
check('cancelled -> cancelled is a no-op, not an error', r.status === 200);

console.log('\nReviews (trigger-validated)');
sessions = (await harsh('/api/sessions')).data.sessions;
const toReview = sessions.find((s) => s.status === 'completed' && !s.i_reviewed);
r = await harsh('/api/reviews', { method: 'POST', body: { session_id: toReview.session_id, rating: 5, comment: 'Great session!' } });
check('participant reviews a completed session', r.status === 201, JSON.stringify(r.data));
r = await harsh('/api/reviews', { method: 'POST', body: { session_id: toReview.session_id, rating: 4 } });
check('second review of the same session rejected (UNIQUE)', r.status === 409);
const notMine = sessions.find((s) => s.status === 'confirmed' && !s.has_started);
r = await harsh('/api/reviews', { method: 'POST', body: { session_id: notMine.session_id, rating: 5 } });
check('reviewing a session that has not happened is rejected', r.status === 422);

console.log('\nSkill listings + embeddings');
const cat = (await harsh('/api/catalog')).data.categories;
const chess = cat.flatMap((c) => c.skills).find((s) => s.skill_name === 'Chess');
r = await harsh('/api/my-skills', { method: 'POST', body: { skill_id: chess.skill_id, proficiency_level: 'beginner', description: 'Want to stop losing to my roommate at chess', is_offering: false } });
check('add wanted skill -> stored with an embedding', r.status === 201 && r.data.embedded === true, JSON.stringify(r.data));
const newId = r.data.user_skill_id;
r = await harsh('/api/my-skills', { method: 'POST', body: { skill_id: chess.skill_id, proficiency_level: 'beginner', description: 'again', is_offering: true } });
check('cannot both teach and learn the same skill (UNIQUE)', r.status === 409);
r = await harsh(`/api/my-skills/${newId}`, { method: 'PUT', body: { proficiency_level: 'intermediate', description: 'Openings and endgames for blitz' } });
check('edit -> stale vector invalidated and recomputed', r.status === 200 && r.data.embedded === true);
check('delete listing', (await harsh(`/api/my-skills/${newId}`, { method: 'DELETE' })).status === 200);

console.log('\nResource lending (transaction + exclusion)');
let reqs = (await harsh('/api/borrow')).data;
const clrs = reqs.incoming.filter((x) => x.title.startsWith('Introduction to Algorithms') && x.status === 'pending');
r = await harsh(`/api/borrow/${clrs[0].request_id}`, { method: 'PATCH', body: { action: 'approve' } });
check('approve request; overlapping pending request auto-rejected in same transaction', r.status === 200 && r.data.autoRejected === 1, JSON.stringify(r.data));
const own = (await harsh('/api/resources?mine=1')).data.resources[0];
r = await harsh('/api/borrow', { method: 'POST', body: { resource_id: own.resource_id, start_date: tomorrow(0).slice(0, 10), end_date: tomorrow(0).slice(0, 10) } });
check('borrowing your own item rejected by trigger', r.status === 422 && /own item/.test(r.data?.error), JSON.stringify(r.data));
r = await harsh('/api/resources', { method: 'POST', body: { title: 'Soldering iron kit', description: 'Temperature controlled soldering station', condition: 'good' } });
check('list a new resource', r.status === 201);
r = await harsh('/api/resources?q=' + encodeURIComponent('I need to solder components onto my PCB'));
check('semantic resource search finds it', r.data.resources.slice(0, 3).some((x) => x.title === 'Soldering iron kit'), r.data.resources.slice(0, 3).map((x) => x.title).join(', '));

console.log('\nAdmin');
const users = (await admin('/api/admin/users')).data.users;
const rohan = users.find((u) => u.email === 'rohan@campus.edu');
r = await admin('/api/admin/users', { method: 'POST', body: { user_id: rohan.user_id, amount: 5, reason: 'Smoke test' } });
check('grant bonus credits (transaction)', r.status === 200);
r = await admin('/api/admin/catalog?type=category&id=1', { method: 'DELETE' });
check('deleting a used category blocked by FK RESTRICT', r.status === 409 && r.data?.db?.code === '23503');
r = await admin('/api/admin/db-lab', { method: 'POST', body: { kind: 'sql', sql: "UPDATE users SET credits_balance = 999" } });
check('SQL console cannot write (READ ONLY transaction)', r.status >= 400 && /read-only/.test(r.data?.error), JSON.stringify(r.data));
r = await admin('/api/admin/db-lab', { method: 'POST', body: { kind: 'sql', sql: 'SELECT 1; DROP TABLE users' } });
check('SQL console blocks stacked statements', r.status >= 400);
r = await admin('/api/admin/db-lab', { method: 'POST', body: { kind: 'tests' } });
check(`DB integrity suite passes (${r.data?.results?.filter((x) => x.pass).length}/${r.data?.results?.length})`, r.data?.results?.every((x) => x.pass));
const a = (await admin('/api/admin/analytics')).data;
check('after all of the above, ledger drift is still 0', Number(a.reconciliation.drifting) === 0);
check('deactivate a user', (await admin('/api/admin/users', { method: 'PATCH', body: { user_id: rohan.user_id, is_active: false } })).status === 200);
const ro = client();
r = await ro('/api/auth/login', { method: 'POST', body: { email: 'rohan@campus.edu', password: 'Password@123' } });
check('deactivated user cannot log in', r.status === 403);
await admin('/api/admin/users', { method: 'PATCH', body: { user_id: rohan.user_id, is_active: true } });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exitCode = fail ? 1 : 0;
