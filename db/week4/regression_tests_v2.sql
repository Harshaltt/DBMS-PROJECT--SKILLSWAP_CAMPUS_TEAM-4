\set ON_ERROR_STOP off
INSERT INTO categories (category_name) VALUES ('Programming'),('Music');
INSERT INTO skills (skill_name, category_id) VALUES ('Python',1),('Guitar',2);
INSERT INTO users (full_name,email,password_hash,credits_balance) VALUES
 ('Arjun','arjun@x.com','h1',20),('Bhavna','bhavna@x.com','h2',20),
 ('Chetan','chetan@x.com','h3',5),('Divya','divya@x.com','h4',20);
INSERT INTO user_skills (user_id,skill_id,is_offering,description) VALUES
 (1,1,TRUE,'I teach Python for data analysis, pandas and plotting'),
 (2,2,TRUE,'Acoustic guitar lessons, chords and fingerpicking');

CALL sp_book_session(1,2,1,'2026-09-01 10:00',60,10);
UPDATE sessions SET status='completed' WHERE session_id=1;

\echo '=== BUG A (self-review) - expect REJECT ==='
INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating) VALUES (1,1,1,5);

\echo '=== BUG B (stranger review) - expect REJECT ==='
INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating) VALUES (1,4,1,1);

\echo '=== BUG C (review a pending session) - expect REJECT ==='
CALL sp_book_session(1,2,1,'2026-09-05 10:00',60,10);
INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating) VALUES (2,2,1,5);

\echo '=== BUG D (book in the past) - expect REJECT ==='
CALL sp_book_session(1,2,1,'2020-01-01 10:00',60,10);

\echo '=== BUG E (double-book same tutor, overlapping slot) - expect REJECT ==='
CALL sp_book_session(1,2,1,'2026-10-01 10:00',60,10);
CALL sp_book_session(1,4,1,'2026-10-01 10:30',60,10);

\echo '=== BUG F (book beyond affordable credits) - expect REJECT ==='
INSERT INTO user_skills (user_id,skill_id,is_offering,description) VALUES (2,1,TRUE,'python basics');
CALL sp_book_session(2,3,1,'2026-11-01 10:00',60,50);

\echo '=== VALID review still works - expect SUCCESS ==='
INSERT INTO reviews (session_id,reviewer_id,reviewee_id,rating,comment) VALUES (1,2,1,5,'Very clear');
SELECT review_id, reviewer_id, reviewee_id, rating FROM reviews;

\echo '=== FIX 8: cancelling a completed session refunds credits ==='
SELECT full_name, credits_balance FROM users WHERE user_id IN (1,2) ORDER BY user_id;
UPDATE sessions SET status='cancelled' WHERE session_id=1;
SELECT full_name, credits_balance FROM users WHERE user_id IN (1,2) ORDER BY user_id;

\echo '=== FIX 12b: ledger reconciliation shows zero drift ==='
SELECT full_name, credits_balance, ledger_balance, drift FROM credit_reconciliation_view ORDER BY user_id;

\echo '=== FIX 13: full-text skill search ==='
SELECT * FROM fn_search_skills('pandas data analysis');

\echo '=== FIX 12a: view now exposes user_id and ratings ==='
SELECT user_id, full_name, skill_name, avg_rating, review_count FROM available_skills_view ORDER BY user_id;
