// =====================================================================
// Database integrity test suite.
// Every test runs inside ONE transaction that is ROLLED BACK at the end,
// each test isolated by a SAVEPOINT. Running it never changes real data,
// so it is safe to run live during the demo (DB Lab page or npm run db:test).
//
// expect: 'reject' -> the database MUST refuse the operation
//         'accept' -> the operation must succeed AND the asserts must hold
// =====================================================================

const FAKE_HASH = '$2a$10$' + 'x'.repeat(53); // shape of a bcrypt hash (60 chars)

async function fixtures(c) {
  const one = async (sql, p) => (await c.query(sql, p)).rows[0];
  const cat = await one(`INSERT INTO categories (category_name) VALUES ('__test_category') RETURNING category_id`);
  const skill = await one(`INSERT INTO skills (skill_name, category_id) VALUES ('__test_skill', $1) RETURNING skill_id`, [cat.category_id]);
  const mk = async (name, credits) =>
    (await one(`INSERT INTO users (full_name, email, password_hash, credits_balance)
                VALUES ($1, $2, $3, $4) RETURNING user_id`,
               [name, `${name.toLowerCase()}@test.campus.edu`, FAKE_HASH, credits])).user_id;
  const tutor = await mk('TestTutor', 20);
  const learner = await mk('TestLearner', 20);
  const stranger = await mk('TestStranger', 20);
  const poor = await mk('TestPoor', 5);
  const saver = await mk('TestSaver', 20);
  const us = await one(`INSERT INTO user_skills (user_id, skill_id, is_offering, description)
                        VALUES ($1, $2, TRUE, 'Test tutoring on integrity constraints') RETURNING user_skill_id`,
                       [tutor, skill.skill_id]);

  // A session that already happened and was completed. History is in the
  // past, so the no-past-booking trigger is switched off for this insert
  // only - and this ALTER is rolled back with everything else.
  await c.query('ALTER TABLE sessions DISABLE TRIGGER trg_validate_session');
  const done = await one(
    `INSERT INTO sessions (offering_user_id, requesting_user_id, skill_id, scheduled_time, duration_minutes, credits_charged)
     VALUES ($1, $2, $3, date_trunc('hour', CURRENT_TIMESTAMP) - INTERVAL '2 days', 60, 10) RETURNING session_id`,
    [tutor, learner, skill.skill_id]);
  await c.query('ALTER TABLE sessions ENABLE TRIGGER trg_validate_session');
  await c.query(`UPDATE sessions SET status = 'confirmed' WHERE session_id = $1`, [done.session_id]);
  await c.query(`UPDATE sessions SET status = 'completed' WHERE session_id = $1`, [done.session_id]);

  const future = await one(
    `INSERT INTO sessions (offering_user_id, requesting_user_id, skill_id, scheduled_time, duration_minutes, credits_charged)
     VALUES ($1, $2, $3, date_trunc('hour', CURRENT_TIMESTAMP) + INTERVAL '3 days', 60, 10) RETURNING session_id`,
    [tutor, learner, skill.skill_id]);

  const res = await one(`INSERT INTO resource_listings (owner_id, title, category_id) VALUES ($1, 'Test calculator', $2) RETURNING resource_id`,
                        [tutor, cat.category_id]);

  return { cat: cat.category_id, skill: skill.skill_id, tutor, learner, stranger, poor, saver,
           userSkill: us.user_skill_id, done: done.session_id, future: future.session_id, res: res.resource_id };
}

const T = (h) => `date_trunc('hour', CURRENT_TIMESTAMP) + INTERVAL '${h} hours'`;

export const integrityTests = [
  // ---------------- Week 4 regression suite (v1 bugs A-F) ----------------
  { id: 'A', group: 'Week 4 regression', expect: 'reject', name: 'User reviews themselves',
    sql: 'INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES (:done, :tutor, :tutor, 5)',
    run: (c, f) => c.query('INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES ($1,$2,$2,5)', [f.done, f.tutor]) },
  { id: 'B', group: 'Week 4 regression', expect: 'reject', name: 'Stranger reviews a session they did not attend',
    sql: 'INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES (:done, :stranger, :tutor, 1)',
    run: (c, f) => c.query('INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES ($1,$2,$3,1)', [f.done, f.stranger, f.tutor]) },
  { id: 'C', group: 'Week 4 regression', expect: 'reject', name: 'Review a session that has not happened yet',
    sql: 'INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES (:future, :learner, :tutor, 5)',
    run: (c, f) => c.query('INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES ($1,$2,$3,5)', [f.future, f.learner, f.tutor]) },
  { id: 'D', group: 'Week 4 regression', expect: 'reject', name: 'Book a session in the past',
    sql: "CALL sp_book_session(:tutor, :stranger, :skill, '2020-01-01 10:00', 60, 10)",
    run: (c, f) => c.query("CALL sp_book_session($1,$2,$3,'2020-01-01 10:00',60,10)", [f.tutor, f.stranger, f.skill]) },
  { id: 'E', group: 'Week 4 regression', expect: 'reject', name: 'Double-book the same tutor (overlapping slot)',
    sql: 'CALL sp_book_session(:tutor, :stranger, :skill, <same day as existing session + 30 min>, 60, 10)',
    run: (c, f) => c.query(`CALL sp_book_session($1,$2,$3,(${T(72)} + INTERVAL '30 minutes')::timestamp,60,10)`, [f.tutor, f.stranger, f.skill]) },
  { id: 'F', group: 'Week 4 regression', expect: 'reject', name: 'Book a session the learner cannot afford',
    sql: 'CALL sp_book_session(:tutor, :poor /*5 credits*/, :skill, <future>, 120, 20)',
    run: (c, f) => c.query(`CALL sp_book_session($1,$2,$3,(${T(150)})::timestamp,120,20)`, [f.tutor, f.poor, f.skill]) },

  // ---------------- v3 defects found while building the app ----------------
  { id: 'G', group: 'v3 business rules', expect: 'reject', name: 'Over-booking: 3rd 10-credit booking with only 20 credits (FIX 16)',
    sql: 'CALL sp_book_session(...) x3 for a learner with 20 credits; the 3rd must fail',
    run: async (c, f) => {
      await c.query(`CALL sp_book_session($1,$2,$3,(${T(200)})::timestamp,60,10)`, [f.tutor, f.saver, f.skill]);
      await c.query(`CALL sp_book_session($1,$2,$3,(${T(230)})::timestamp,60,10)`, [f.tutor, f.saver, f.skill]);
      await c.query(`CALL sp_book_session($1,$2,$3,(${T(260)})::timestamp,60,10)`, [f.tutor, f.saver, f.skill]);
    } },
  { id: 'S', group: 'v3 business rules', expect: 'reject', name: 'Same person teaching and learning at the same time (FIX 18)',
    sql: 'CALL sp_book_session(:stranger /*tutor*/, :tutor /*learner*/, ...) overlapping a slot where :tutor is already teaching',
    run: async (c, f) => {
      await c.query(`INSERT INTO user_skills (user_id, skill_id, is_offering) VALUES ($1, $2, TRUE)`, [f.stranger, f.skill]);
      await c.query(`CALL sp_book_session($1,$2,$3,(${T(72)} + INTERVAL '15 minutes')::timestamp,30,5)`, [f.stranger, f.tutor, f.skill]);
    } },
  { id: 'H', group: 'v3 business rules', expect: 'reject', name: 'Illegal status jump: cancelled -> completed (FIX 15)',
    sql: "UPDATE sessions SET status='cancelled' ...; UPDATE sessions SET status='completed' ...",
    run: async (c, f) => {
      await c.query(`UPDATE sessions SET status='cancelled' WHERE session_id=$1`, [f.future]);
      await c.query(`UPDATE sessions SET status='completed' WHERE session_id=$1`, [f.future]);
    } },
  { id: 'I', group: 'v3 business rules', expect: 'reject', name: 'Complete a session before it takes place (FIX 15)',
    sql: "UPDATE sessions SET status='confirmed' ...; UPDATE sessions SET status='completed' WHERE <future session>",
    run: async (c, f) => {
      await c.query(`UPDATE sessions SET status='confirmed' WHERE session_id=$1`, [f.future]);
      await c.query(`UPDATE sessions SET status='completed' WHERE session_id=$1`, [f.future]);
    } },
  { id: 'J', group: 'v3 business rules', expect: 'reject', name: 'Owner borrows their own item (FIX 17)',
    sql: 'INSERT INTO resource_borrow_requests (resource_id, borrower_id, ...) VALUES (:res, :tutor /*owner*/, ...)',
    run: (c, f) => c.query(`INSERT INTO resource_borrow_requests (resource_id, borrower_id, start_date, end_date)
                            VALUES ($1,$2,CURRENT_DATE+1,CURRENT_DATE+3)`, [f.res, f.tutor]) },
  { id: 'K', group: 'v3 business rules', expect: 'reject', name: 'Lend one item to two people over overlapping dates',
    sql: 'two requests for the same item, overlapping dates, both set to approved',
    run: async (c, f) => {
      const a = await c.query(`INSERT INTO resource_borrow_requests (resource_id, borrower_id, start_date, end_date)
                               VALUES ($1,$2,CURRENT_DATE+1,CURRENT_DATE+5) RETURNING request_id`, [f.res, f.learner]);
      const b = await c.query(`INSERT INTO resource_borrow_requests (resource_id, borrower_id, start_date, end_date)
                               VALUES ($1,$2,CURRENT_DATE+3,CURRENT_DATE+7) RETURNING request_id`, [f.res, f.stranger]);
      await c.query(`UPDATE resource_borrow_requests SET status='approved' WHERE request_id=$1`, [a.rows[0].request_id]);
      await c.query(`UPDATE resource_borrow_requests SET status='approved' WHERE request_id=$1`, [b.rows[0].request_id]);
    } },

  // ---------------- input validation at the database level ----------------
  { id: 'L', group: 'DB-level validation', expect: 'reject', name: 'Invalid e-mail address',
    sql: "INSERT INTO users (full_name, email, password_hash) VALUES ('Bad Email', 'not-an-email', <hash>)",
    run: (c) => c.query(`INSERT INTO users (full_name, email, password_hash) VALUES ('Bad Email','not-an-email',$1)`, [FAKE_HASH]) },
  { id: 'M', group: 'DB-level validation', expect: 'reject', name: 'Plain-text password stored instead of a hash',
    sql: "INSERT INTO users (full_name, email, password_hash) VALUES ('Lazy Dev', 'lazy@campus.edu', 'password123')",
    run: (c) => c.query(`INSERT INTO users (full_name, email, password_hash) VALUES ('Lazy Dev','lazy@test.campus.edu','password123')`) },
  { id: 'N', group: 'DB-level validation', expect: 'reject', name: 'Duplicate e-mail differing only in letter case',
    sql: "INSERT INTO users (..., email, ...) VALUES (..., 'TESTTUTOR@test.campus.edu', ...)",
    run: (c) => c.query(`INSERT INTO users (full_name, email, password_hash) VALUES ('Clone','TESTTUTOR@test.campus.edu',$1)`, [FAKE_HASH]) },
  { id: 'O', group: 'DB-level validation', expect: 'reject', name: 'Rating outside 1-5',
    sql: 'INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES (:done, :learner, :tutor, 6)',
    run: (c, f) => c.query('INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating) VALUES ($1,$2,$3,6)', [f.done, f.learner, f.tutor]) },
  { id: 'P', group: 'DB-level validation', expect: 'reject', name: 'Credit balance driven negative by a direct UPDATE',
    sql: 'UPDATE users SET credits_balance = credits_balance - 1000 WHERE user_id = :learner',
    run: (c, f) => c.query('UPDATE users SET credits_balance = credits_balance - 1000 WHERE user_id=$1', [f.learner]) },
  { id: 'Q', group: 'DB-level validation', expect: 'reject', name: 'Delete a category that skills still use (FK RESTRICT)',
    sql: 'DELETE FROM categories WHERE category_id = :cat',
    run: (c, f) => c.query('DELETE FROM categories WHERE category_id=$1', [f.cat]) },
  { id: 'R', group: 'DB-level validation', expect: 'reject', name: 'Store a non-normalised (corrupt) embedding vector',
    sql: "INSERT INTO skill_embeddings (user_skill_id, embedding, source_text) VALUES (:us, '[2,2,2,...]', 'x')",
    run: (c, f) => c.query(`INSERT INTO skill_embeddings (user_skill_id, embedding, source_text)
                            VALUES ($1, array_fill(2, ARRAY[384])::real[]::vector, 'corrupt')`, [f.userSkill]) },

  // ---------------- valid behaviour must still work ----------------
  { id: 'V1', group: 'Valid operations', expect: 'accept', name: 'Valid booking succeeds and notifies the tutor (trigger)',
    sql: 'CALL sp_book_session(...); SELECT FROM notifications WHERE user_id = :tutor',
    run: async (c, f) => {
      const r = await c.query(`CALL sp_book_session($1,$2,$3,(${T(300)})::timestamp,60,10,'Library',NULL)`, [f.tutor, f.stranger, f.skill]);
      const n = await c.query('SELECT COUNT(*)::int AS n FROM notifications WHERE related_session_id=$1 AND user_id=$2', [r.rows[0].p_session_id, f.tutor]);
      if (n.rows[0].n !== 1) throw new Error('assert: tutor was not notified');
      return `session #${r.rows[0].p_session_id} booked, tutor notified`;
    } },
  { id: 'V2', group: 'Valid operations', expect: 'accept', name: 'Completion moved credits atomically; ledger reconciles (drift = 0)',
    sql: 'SELECT credits_balance ...; SELECT drift FROM credit_reconciliation_view',
    run: async (c, f) => {
      const b = await c.query('SELECT user_id, credits_balance FROM users WHERE user_id IN ($1,$2) ORDER BY user_id', [f.tutor, f.learner]);
      const bal = Object.fromEntries(b.rows.map((r) => [r.user_id, Number(r.credits_balance)]));
      if (bal[f.tutor] !== 30 || bal[f.learner] !== 10) throw new Error(`assert: balances ${JSON.stringify(bal)}`);
      const d = await c.query('SELECT SUM(abs(drift)) AS d FROM credit_reconciliation_view WHERE user_id IN ($1,$2)', [f.tutor, f.learner]);
      if (Number(d.rows[0].d) !== 0) throw new Error('assert: ledger drift');
      return 'tutor 20->30, learner 20->10, drift 0.00';
    } },
  { id: 'V3', group: 'Valid operations', expect: 'accept', name: 'Cancelling a completed session refunds both sides (FIX 8)',
    sql: "UPDATE sessions SET status='cancelled' WHERE session_id = :done",
    run: async (c, f) => {
      await c.query(`UPDATE sessions SET status='cancelled' WHERE session_id=$1`, [f.done]);
      const b = await c.query('SELECT SUM(credits_balance) FILTER (WHERE user_id=$1) AS t, SUM(credits_balance) FILTER (WHERE user_id=$2) AS l FROM users', [f.tutor, f.learner]);
      if (Number(b.rows[0].t) !== 20 || Number(b.rows[0].l) !== 20) throw new Error('assert: refund failed');
      return 'both balances back to 20';
    } },
  { id: 'V4', group: 'Valid operations', expect: 'accept', name: 'Approving a loan marks the item as borrowed (sync trigger)',
    sql: "INSERT borrow request; UPDATE ... SET status='approved'; SELECT availability_status",
    run: async (c, f) => {
      const r = await c.query(`INSERT INTO resource_borrow_requests (resource_id, borrower_id, start_date, end_date)
                               VALUES ($1,$2,CURRENT_DATE+1,CURRENT_DATE+2) RETURNING request_id`, [f.res, f.learner]);
      await c.query(`UPDATE resource_borrow_requests SET status='approved' WHERE request_id=$1`, [r.rows[0].request_id]);
      const s = await c.query('SELECT availability_status FROM resource_listings WHERE resource_id=$1', [f.res]);
      if (s.rows[0].availability_status !== 'borrowed') throw new Error('assert: status not synced');
      return "availability_status = 'borrowed'";
    } },
  { id: 'V5', group: 'Valid operations', expect: 'accept', name: 'Editing a description invalidates its stale embedding (trigger)',
    sql: "INSERT INTO skill_embeddings ...; UPDATE user_skills SET description = ...; SELECT COUNT(*) FROM skill_embeddings",
    run: async (c, f) => {
      await c.query(`INSERT INTO skill_embeddings (user_skill_id, embedding, source_text)
                     VALUES ($1, (array_fill(0, ARRAY[383]) || ARRAY[1])::real[]::vector, 'old text')`, [f.userSkill]);
      await c.query(`UPDATE user_skills SET description='Completely new text' WHERE user_skill_id=$1`, [f.userSkill]);
      const n = await c.query('SELECT COUNT(*)::int AS n FROM skill_embeddings WHERE user_skill_id=$1', [f.userSkill]);
      if (n.rows[0].n !== 0) throw new Error('assert: stale embedding survived');
      return 'stale vector deleted';
    } },
];

/** Runs the whole suite against `client` and ALWAYS rolls back. */
export async function runIntegrityTests(client) {
  const results = [];
  await client.query('BEGIN');
  try {
    const f = await fixtures(client);
    for (const t of integrityTests) {
      await client.query('SAVEPOINT t');
      const started = Date.now();
      let outcome, message;
      try {
        const detail = await t.run(client, f);
        outcome = 'accepted';
        message = typeof detail === 'string' ? detail : 'operation succeeded';
      } catch (err) {
        if (err.code) { outcome = 'rejected'; message = err.message; }
        else { outcome = 'assert-failed'; message = err.message; }
      }
      await client.query('ROLLBACK TO SAVEPOINT t');
      const pass = (t.expect === 'reject' && outcome === 'rejected') ||
                   (t.expect === 'accept' && outcome === 'accepted');
      results.push({ id: t.id, group: t.group, name: t.name, expect: t.expect, outcome, pass,
                     message, sql: t.sql, ms: Date.now() - started });
    }
  } finally {
    await client.query('ROLLBACK'); // nothing from the suite is ever kept
  }
  return results;
}
