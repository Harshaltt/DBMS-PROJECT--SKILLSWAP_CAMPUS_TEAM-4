// =====================================================================
// Seeds realistic demo data. Business rules are NOT bypassed: bookings go
// through sp_book_session, status changes go through the state-machine
// trigger, credits move only via the settlement trigger, reviews pass the
// review-validation trigger. The only trigger switched off (briefly, inside
// this script) is the "no past dates" check, because history by
// definition happened in the past.
// =====================================================================
import bcrypt from 'bcryptjs';
import * as D from './seed-data.mjs';

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seed(db, log = console.log) {
  const rand = mulberry32(42);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // ---------- catalogue --------------------------------------------------
  const catId = {};
  for (const name of D.categories) {
    const { rows } = await db.query(
      'INSERT INTO categories (category_name) VALUES ($1) RETURNING category_id', [name]);
    catId[name] = rows[0].category_id;
  }
  const skillId = {};
  for (const [name, cat] of D.skills) {
    const { rows } = await db.query(
      'INSERT INTO skills (skill_name, category_id) VALUES ($1, $2) RETURNING skill_id', [name, catId[cat]]);
    skillId[name] = rows[0].skill_id;
  }

  // ---------- users (bcrypt-hashed passwords) ----------------------------
  const uid = {};
  const roleOf = {};
  for (const [key, name, email, role, dept, bio] of D.users) {
    const hash = await bcrypt.hash(D.DEMO_PASSWORD, 10);
    const { rows } = await db.query(
      `INSERT INTO users (full_name, email, password_hash, role, department, bio)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id`,
      [name, email, hash, role, dept, bio]);
    uid[key] = rows[0].user_id;
    roleOf[key] = role;
  }
  await db.query(`UPDATE users SET created_at = CURRENT_TIMESTAMP - INTERVAL '160 days'`);
  await db.query(`UPDATE credit_transactions SET created_at = CURRENT_TIMESTAMP - INTERVAL '160 days'`);

  // ---------- skills offered / wanted ------------------------------------
  const offers = []; // {tutorKey, skill}
  const wants = {}; // skill -> [userKey]
  for (const [key, skill, level, offering, desc] of D.userSkills) {
    await db.query(
      `INSERT INTO user_skills (user_id, skill_id, proficiency_level, is_offering, description)
       VALUES ($1, $2, $3, $4, $5)`,
      [uid[key], skillId[skill], level, offering, desc]);
    if (offering) offers.push({ tutorKey: key, skill });
    else (wants[skill] ||= []).push(key);
  }

  // ---------- historical sessions ----------------------------------------
  const balance = {};
  for (const k of Object.keys(uid)) balance[k] = 20;
  const students = D.users.filter((u) => u[3] === 'student').map((u) => u[0]);

  await db.query('ALTER TABLE sessions DISABLE TRIGGER trg_validate_session');

  async function book(tutorKey, learnerKey, skill, whenSql, duration, location) {
    const credits = Math.round(duration / 6);
    const { rows } = await db.query(
      `CALL sp_book_session($1, $2, $3, (${whenSql})::timestamp, $4, $5, $6, NULL)`,
      [uid[tutorKey], uid[learnerKey], skillId[skill], duration, credits, location]);
    return { id: rows[0].p_session_id, credits };
  }
  const setStatus = (id, status) => db.query('UPDATE sessions SET status = $1 WHERE session_id = $2', [status, id]);

  async function review(sessionId, reviewerKey, revieweeKey, rating, whenSql) {
    const comment = pick(D.reviewComments[rating]);
    await db.query(
      `INSERT INTO reviews (session_id, reviewer_id, reviewee_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, (${whenSql})::timestamp)`,
      [sessionId, uid[reviewerKey], uid[revieweeKey], rating, comment]);
  }

  async function backdate(sessionId) {
    await db.query(
      `UPDATE sessions SET created_at = scheduled_time - INTERVAL '3 days' WHERE session_id = $1`, [sessionId]);
    await db.query(
      `UPDATE credit_transactions ct
          SET created_at = s.scheduled_time + make_interval(mins => s.duration_minutes)
         FROM sessions s WHERE s.session_id = ct.session_id AND ct.session_id = $1`, [sessionId]);
    await db.query(
      `UPDATE notifications n SET created_at = s.scheduled_time - INTERVAL '3 days'
         FROM sessions s WHERE s.session_id = n.related_session_id AND n.related_session_id = $1`, [sessionId]);
  }

  const locations = ['Library Study Room', 'CSE Lab 3', 'Cafeteria', 'Online (Google Meet)', 'Music Room', 'Seminar Hall B', 'Hostel Common Room'];
  const durations = [30, 45, 60, 60, 60, 90, 120];
  const ratings = [5, 5, 5, 5, 4, 4, 4, 3, 2];
  const hours = [10, 11, 14, 15, 16, 17, 18];
  const N = 46;
  const reserve = { harsh: 25, chirag: 15, neha: 12, ananya: 18, rohan: 12, priya: 12,
                    aditya: 12, karthik: 18, tanvi: 12, farhan: 12 };
  let completed = 0, cancelled = 0;

  for (let i = 0; i < N; i++) {
    const offer = pick(offers);
    // prefer a learner who actually wants this skill, else any other student
    const candidates = (wants[offer.skill] || []).concat(students).filter((k) => k !== offer.tutorKey);
    const duration = pick(durations);
    const credits = Math.round(duration / 6);
    // keep enough credits back for the scripted demo bookings further down
    const canPay = (k) => balance[k] - credits >= (reserve[k] || 0);
    const learner = candidates.find((k) => canPay(k) && rand() < 0.6) || candidates.find(canPay);
    if (!learner) continue;
    const dayOffset = 132 - Math.floor(i * 2.7); // unique day per session -> no clashes
    const when = `date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '${dayOffset} days' + INTERVAL '${pick(hours)} hours'`;
    const s = await book(offer.tutorKey, learner, offer.skill, when, duration, pick(locations));
    const r = rand();
    if (r < 0.86) {
      await setStatus(s.id, 'confirmed');
      await setStatus(s.id, 'completed'); // settlement trigger moves the credits
      balance[learner] -= credits; balance[offer.tutorKey] += credits;
      completed++;
      const reviewAt = `(SELECT scheduled_time + INTERVAL '1 day' FROM sessions WHERE session_id = ${s.id})`;
      if (rand() < 0.88) await review(s.id, learner, offer.tutorKey, pick(ratings), reviewAt);
      if (rand() < 0.35) await review(s.id, offer.tutorKey, learner, pick([5, 5, 4]), reviewAt);
    } else {
      if (rand() < 0.5) await setStatus(s.id, 'confirmed');
      await setStatus(s.id, 'cancelled');
      cancelled++;
    }
    await backdate(s.id);
  }

  // ---- demo-specific history ----
  // (a) completed but NOT yet reviewed: Harsh can leave a review live
  {
    const s = await book('ananya', 'harsh', 'Japanese', `date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '5 days' + INTERVAL '16 hours'`, 60, 'Library Study Room');
    await setStatus(s.id, 'confirmed'); await setStatus(s.id, 'completed'); await backdate(s.id);
  }
  // (b) took place but awaiting "mark completed" -> live credit settlement demo
  {
    const s = await book('rohan', 'harsh', 'Guitar', `date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '2 days' + INTERVAL '17 hours'`, 60, 'Music Room');
    await setStatus(s.id, 'confirmed'); await backdate(s.id);
    const t = await book('karthik', 'chirag', 'Public Speaking', `date_trunc('day', CURRENT_TIMESTAMP) - INTERVAL '1 day' + INTERVAL '15 hours'`, 60, 'Seminar Hall B');
    await setStatus(t.id, 'confirmed'); await backdate(t.id);
  }

  await db.query('ALTER TABLE sessions ENABLE TRIGGER trg_validate_session');

  // ---------- resources + borrow history ---------------------------------
  const resId = {};
  for (const [owner, title, desc, cat, cond] of D.resources) {
    const { rows } = await db.query(
      `INSERT INTO resource_listings (owner_id, title, description, category_id, condition, created_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP - INTERVAL '120 days') RETURNING resource_id`,
      [uid[owner], title, desc, catId[cat], cond]);
    resId[title] = { id: rows[0].resource_id, owner };
  }

  await db.query('ALTER TABLE resource_borrow_requests DISABLE TRIGGER trg_validate_borrow');
  const resTitles = Object.keys(resId);
  async function borrow(title, borrowerKey, startOffset, days) {
    const { rows } = await db.query(
      `INSERT INTO resource_borrow_requests (resource_id, borrower_id, start_date, end_date, request_date)
       VALUES ($1, $2, CURRENT_DATE + $3::int, CURRENT_DATE + $3::int + $4::int,
               CURRENT_TIMESTAMP + make_interval(days => $3::int - 2))
       RETURNING request_id`,
      [resId[title].id, uid[borrowerKey], startOffset, days]);
    return rows[0].request_id;
  }
  const setBorrow = (id, status) => db.query('UPDATE resource_borrow_requests SET status = $1 WHERE request_id = $2', [status, id]);
  // history is inserted with the date check off; transitions run with it on
  const history = [];
  for (let i = 0; i < 18; i++) {
    const title = resTitles[i % resTitles.length];
    const owner = resId[title].owner;
    const borrower = pick(students.filter((k) => k !== owner));
    const start = -110 + i * 5;
    history.push(await borrow(title, borrower, start, 3 + (i % 5)));
  }
  // currently out on loan: Harsh's calculator with Priya
  const current = await borrow('Casio fx-991ES Plus Calculator', 'priya', -2, 7);
  await db.query('ALTER TABLE resource_borrow_requests ENABLE TRIGGER trg_validate_borrow');
  for (const [i, id] of history.entries()) {
    if (i % 6 === 5) { await setBorrow(id, 'rejected'); continue; }
    await setBorrow(id, 'approved');
    await setBorrow(id, 'returned');
  }
  await setBorrow(current, 'approved');

  // mark all history notifications as read; everything after this is "new"
  await db.query('UPDATE notifications SET is_read = TRUE');
  await db.query(`UPDATE notifications SET created_at = LEAST(created_at, CURRENT_TIMESTAMP - INTERVAL '3 days') WHERE related_session_id IS NULL`);

  // ---------- upcoming bookings (normal path, triggers fully on) ---------
  async function liveBook(tutor, learner, skill, dayOffset, hour, duration, location) {
    await db.query('BEGIN');
    await db.query("SELECT set_config('app.current_user_id', $1, true)", [String(uid[learner])]);
    const s = await book(tutor, learner, skill,
      `date_trunc('day', CURRENT_TIMESTAMP) + INTERVAL '${dayOffset} days' + INTERVAL '${hour} hours'`, duration, location);
    await db.query('COMMIT');
    return s.id;
  }
  async function liveConfirm(id, tutor) {
    await db.query('BEGIN');
    await db.query("SELECT set_config('app.current_user_id', $1, true)", [String(uid[tutor])]);
    await setStatus(id, 'confirmed');
    await db.query('COMMIT');
  }
  await liveBook('harsh', 'neha', 'Python', 1, 16, 60, 'CSE Lab 3');                 // Harsh to confirm
  await liveConfirm(await liveBook('harsh', 'ananya', 'Web Development', 3, 11, 90, 'Library Study Room'), 'harsh');
  await liveBook('harsh', 'rohan', 'Python', 4, 17, 60, 'Hostel Common Room');
  await liveBook('ishita', 'priya', 'Statistics', 2, 14, 60, 'Online (Google Meet)');
  await liveConfirm(await liveBook('chirag', 'aditya', 'Machine Learning', 2, 10, 60, 'CSE Lab 3'), 'chirag');
  await liveBook('chirag', 'karthik', 'SQL & Databases', 5, 15, 90, 'Library Study Room');
  await liveBook('sneha', 'tanvi', 'UI/UX Design', 3, 15, 60, 'Design Studio');
  await liveConfirm(await liveBook('rohan', 'farhan', 'Guitar', 6, 18, 60, 'Music Room'), 'rohan');

  // pending borrow requests (Harsh approves one live -> the overlapping one is auto-rejected)
  await borrow('Introduction to Algorithms (CLRS), 3rd Ed.', 'neha', 1, 7);
  await borrow('Introduction to Algorithms (CLRS), 3rd Ed.', 'ananya', 3, 5);
  await borrow('Raspberry Pi 4 (4 GB) Kit', 'aditya', 2, 10);
  await borrow('Canon EOS 1500D DSLR', 'harsh', 4, 3);

  // ---------- admin action: a bonus grant, done as one transaction --------
  await db.query('BEGIN');
  await db.query('UPDATE users SET credits_balance = credits_balance + 15 WHERE user_id = $1', [uid.rohan]);
  await db.query(`INSERT INTO credit_transactions (user_id, amount, transaction_type, created_at)
                  VALUES ($1, 15, 'bonus', CURRENT_TIMESTAMP - INTERVAL '20 days')`, [uid.rohan]);
  await db.query('COMMIT');

  await db.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP - make_interval(hours => (user_id * 7) % 90)`);

  log(`  seeded ${D.users.length} users, ${D.skills.length} skills, ${D.userSkills.length} skill listings,`);
  log(`  ${completed} completed + ${cancelled} cancelled historical sessions, ${D.resources.length} resources`);
  return { uid };
}
