-- =====================================================================
-- SkillSwap Campus - important queries (also runnable live on the DB Lab page)
-- Generated from lib/showcase.mjs. Each one runs as-is in psql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Q1. Upcoming sessions with tutor, learner, skill and category
--     concepts: INNER JOIN x4, WHERE, ORDER BY, to_char
-- ---------------------------------------------------------------------
SELECT s.session_id,
       to_char(s.scheduled_time, 'DD Mon HH24:MI') AS "when",
       sk.skill_name, c.category_name,
       t.full_name AS tutor, l.full_name AS learner,
       s.status, s.credits_charged
FROM sessions s
JOIN skills     sk ON sk.skill_id   = s.skill_id
JOIN categories c  ON c.category_id = sk.category_id
JOIN users      t  ON t.user_id     = s.offering_user_id
JOIN users      l  ON l.user_id     = s.requesting_user_id
WHERE s.status IN ('pending', 'confirmed')
  AND s.scheduled_time > CURRENT_TIMESTAMP
ORDER BY s.scheduled_time;

-- ---------------------------------------------------------------------
-- Q2. Busiest categories (only those with 3+ completed sessions)
--     concepts: GROUP BY, HAVING, COUNT / SUM / AVG, LEFT JOIN
-- ---------------------------------------------------------------------
SELECT c.category_name,
       COUNT(*)                     AS completed_sessions,
       SUM(s.credits_charged)       AS credits_exchanged,
       ROUND(AVG(s.duration_minutes)) AS avg_minutes,
       ROUND(AVG(r.rating), 2)      AS avg_tutor_rating
FROM sessions s
JOIN skills sk     ON sk.skill_id   = s.skill_id
JOIN categories c  ON c.category_id = sk.category_id
LEFT JOIN reviews r ON r.session_id  = s.session_id
                   AND r.reviewee_id = s.offering_user_id
WHERE s.status = 'completed'
GROUP BY c.category_name
HAVING COUNT(*) >= 3
ORDER BY completed_sessions DESC;

-- ---------------------------------------------------------------------
-- Q3. Users rated above the campus average
--     concepts: Scalar subquery, HAVING, AVG
-- ---------------------------------------------------------------------
SELECT u.full_name, u.department,
       ROUND(AVG(r.rating), 2) AS avg_rating,
       COUNT(*)                AS reviews
FROM reviews r
JOIN users u ON u.user_id = r.reviewee_id
GROUP BY u.user_id, u.full_name, u.department
HAVING AVG(r.rating) > (SELECT AVG(rating) FROM reviews)
   AND COUNT(*) >= 2
ORDER BY avg_rating DESC, reviews DESC;

-- ---------------------------------------------------------------------
-- Q4. Members who want to learn but have never completed a session (outreach list)
--     concepts: NOT EXISTS (correlated subquery), string_agg, GROUP BY
-- ---------------------------------------------------------------------
SELECT u.full_name, u.department,
       string_agg(sk.skill_name, ', ' ORDER BY sk.skill_name) AS wants_to_learn
FROM users u
JOIN user_skills us ON us.user_id = u.user_id AND NOT us.is_offering
JOIN skills sk      ON sk.skill_id = us.skill_id
WHERE NOT EXISTS (SELECT 1 FROM sessions s
                  WHERE s.requesting_user_id = u.user_id
                    AND s.status = 'completed')
GROUP BY u.user_id, u.full_name, u.department
ORDER BY u.full_name;

-- ---------------------------------------------------------------------
-- Q5. Harsh's credit ledger with a running balance
--     concepts: Window function SUM() OVER, LEFT JOIN
-- ---------------------------------------------------------------------
SELECT to_char(ct.created_at, 'DD Mon YYYY') AS date,
       ct.transaction_type,
       sk.skill_name,
       ct.amount,
       SUM(ct.amount) OVER (ORDER BY ct.created_at, ct.transaction_id) AS running_balance
FROM credit_transactions ct
LEFT JOIN sessions s ON s.session_id = ct.session_id
LEFT JOIN skills sk  ON sk.skill_id  = s.skill_id
WHERE ct.user_id = (SELECT user_id FROM users WHERE email = 'harsh@campus.edu')
ORDER BY ct.created_at, ct.transaction_id;

-- ---------------------------------------------------------------------
-- Q6. Tutor leaderboard
--     concepts: VIEW, RANK() OVER, derived tables
-- ---------------------------------------------------------------------
SELECT rank_position, full_name, department, sessions_taught,
       credits_earned, avg_rating, review_count
FROM tutor_leaderboard_view
ORDER BY rank_position
LIMIT 10;

-- ---------------------------------------------------------------------
-- Q7. Monthly activity and cancellation rate
--     concepts: CTE (WITH), date_trunc, COUNT FILTER, NULLIF
-- ---------------------------------------------------------------------
WITH monthly AS (
  SELECT date_trunc('month', scheduled_time) AS month,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
         SUM(credits_charged) FILTER (WHERE status = 'completed') AS credits
  FROM sessions
  GROUP BY 1
)
SELECT to_char(month, 'Mon YYYY') AS month, completed, cancelled,
       COALESCE(credits, 0) AS credits_moved,
       ROUND(100.0 * cancelled / NULLIF(completed + cancelled, 0), 1) AS cancel_rate_pct
FROM monthly
ORDER BY monthly.month;

-- ---------------------------------------------------------------------
-- Q8. Skill supply vs demand (where we need more tutors)
--     concepts: VIEW, LEFT JOIN, aggregate FILTER
-- ---------------------------------------------------------------------
SELECT skill_name, category_name, tutors, learners, demand_gap
FROM skill_demand_view
WHERE learners > 0
ORDER BY demand_gap DESC, skill_name;

-- ---------------------------------------------------------------------
-- Q9. Perfect skill swaps for Harsh
--     concepts: Self-join x4, SQL function
-- ---------------------------------------------------------------------
SELECT * FROM fn_perfect_swaps((SELECT user_id FROM users WHERE email = 'harsh@campus.edu'));

-- ---------------------------------------------------------------------
-- Q10. Full-text keyword search
--     concepts: tsvector / tsquery, GIN index, ts_rank
-- ---------------------------------------------------------------------
SELECT * FROM fn_search_skills('data analysis with pandas');

-- ---------------------------------------------------------------------
-- Q11. Vector "more like this": listings nearest to Ishita's Statistics tutoring
--     concepts: pgvector, cosine distance <=>, k-NN
-- ---------------------------------------------------------------------
SELECT v.full_name, v.skill_name,
       ROUND((1 - (e.embedding <=> q.embedding))::numeric, 3) AS cosine_similarity
FROM skill_embeddings q
JOIN skill_embeddings e      ON e.user_skill_id <> q.user_skill_id
JOIN available_skills_view v ON v.user_skill_id = e.user_skill_id
WHERE q.user_skill_id = (SELECT us.user_skill_id
                         FROM user_skills us
                         JOIN skills s USING (skill_id)
                         JOIN users  u USING (user_id)
                         WHERE u.email = 'ishita@campus.edu' AND s.skill_name = 'Statistics')
ORDER BY e.embedding <=> q.embedding
LIMIT 5;

-- ---------------------------------------------------------------------
-- Q12. Semantic tutor recommendations for Priya
--     concepts: LATERAL join, pgvector k-NN per row
-- ---------------------------------------------------------------------
SELECT r.wanted_skill, v.skill_name AS matched_listing, v.full_name AS tutor, r.similarity
FROM fn_recommend_tutors((SELECT user_id FROM users WHERE email = 'priya@campus.edu')) r
JOIN available_skills_view v USING (user_skill_id)
ORDER BY r.similarity DESC;

-- ---------------------------------------------------------------------
-- Q13. Ledger reconciliation (does every balance match its ledger?)
--     concepts: VIEW, LEFT JOIN + GROUP BY
-- ---------------------------------------------------------------------
SELECT full_name, credits_balance, ledger_balance, drift
FROM credit_reconciliation_view
ORDER BY abs(drift) DESC, full_name;

-- ---------------------------------------------------------------------
-- Q14. Index proof: partial index on upcoming sessions
--     concepts: EXPLAIN ANALYZE, partial index
--     note: The demo tables are tiny, so the planner would normally just scan them; enable_seqscan = off shows the plan the index enables at scale.
-- ---------------------------------------------------------------------
BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF)
SELECT session_id, scheduled_time
FROM sessions
WHERE status IN ('pending', 'confirmed')
  AND scheduled_time > CURRENT_TIMESTAMP
ORDER BY scheduled_time;
ROLLBACK;

-- ---------------------------------------------------------------------
-- Q15. Index proof: HNSW vector index for nearest-neighbour search
--     concepts: EXPLAIN, HNSW, vector_cosine_ops
-- ---------------------------------------------------------------------
BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN (COSTS OFF)
SELECT user_skill_id
FROM skill_embeddings
ORDER BY embedding <=> (SELECT embedding FROM skill_embeddings LIMIT 1)
LIMIT 5;
ROLLBACK;

-- ---------------------------------------------------------------------
-- Q16. Index proof: GIN index for full-text search
--     concepts: EXPLAIN, GIN
-- ---------------------------------------------------------------------
BEGIN;
SET LOCAL enable_seqscan = off;
EXPLAIN (COSTS OFF)
SELECT user_skill_id
FROM user_skills
WHERE search_vector @@ plainto_tsquery('english', 'guitar chords');
ROLLBACK;

-- ---------------------------------------------------------------------
-- Q17. What is implemented in the database (system catalogue)
--     concepts: UNION ALL, information_schema, pg_catalog
-- ---------------------------------------------------------------------
SELECT 'tables' AS object, COUNT(*) AS how_many
  FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
UNION ALL SELECT 'views', COUNT(*)
  FROM information_schema.views WHERE table_schema = 'public'
UNION ALL SELECT 'indexes', COUNT(*)
  FROM pg_indexes WHERE schemaname = 'public'
UNION ALL SELECT 'triggers', COUNT(*)
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
UNION ALL SELECT 'CHECK constraints', COUNT(*)
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'c'
UNION ALL SELECT 'EXCLUDE constraints', COUNT(*)
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'x'
UNION ALL SELECT 'foreign keys', COUNT(*)
  FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'
UNION ALL SELECT 'functions + procedures', COUNT(*)
  FROM pg_proc WHERE pronamespace = 'public'::regnamespace
   AND (proname LIKE 'fn\_%' OR proname LIKE 'sp\_%');

-- ---------------------------------------------------------------------
-- Q18. Every trigger and when it fires
--     concepts: information_schema.triggers, string_agg
-- ---------------------------------------------------------------------
SELECT event_object_table AS "table", trigger_name, action_timing AS timing,
       string_agg(event_manipulation, ' / ' ORDER BY event_manipulation) AS events
FROM information_schema.triggers
WHERE trigger_schema = 'public'
GROUP BY event_object_table, trigger_name, action_timing
ORDER BY 1, 2;
