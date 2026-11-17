-- =====================================================================
-- Project: SkillSwap Campus - Peer-to-Peer Skill Exchange & Resource
--          Sharing Platform with Semantic Skill Matching
-- Week 4 DBMS Lab - DDL Statements (PostgreSQL)   ** VERSION 2 **
--
-- v2 corrects seven defects found by adversarial testing of v1.
-- Each fix is tagged [FIX n] at the point of change.
-- =====================================================================

-- btree_gist lets GiST exclusion constraints combine equality on a plain
-- integer column with range overlap - needed by [FIX 5] and [FIX 10].
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- (v3) the two vector tables from 04_vector.sql are dropped too, so that
-- `npm run db:setup` can always rebuild the database from a clean slate.
DROP TABLE IF EXISTS skill_embeddings, resource_embeddings CASCADE;
DROP VIEW IF EXISTS tutor_leaderboard_view, skill_demand_view CASCADE;
DROP TABLE IF EXISTS notifications, resource_borrow_requests, resource_listings,
    credit_transactions, reviews, sessions, user_skills, skills, categories, users CASCADE;

-- 1. CATEGORIES ---------------------------------------------------------
CREATE TABLE categories (
    category_id     SERIAL PRIMARY KEY,
    category_name   VARCHAR(100) NOT NULL UNIQUE
);

-- 2. USERS ----------------------------------------------------------------
CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    full_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(20)  NOT NULL DEFAULT 'student'
                        CHECK (role IN ('student','staff','admin')),
    department      VARCHAR(100),
    credits_balance NUMERIC(10,2) NOT NULL DEFAULT 20.00 CHECK (credits_balance >= 0),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. SKILLS -----------------------------------------------------------------
CREATE TABLE skills (
    skill_id        SERIAL PRIMARY KEY,
    skill_name      VARCHAR(100) NOT NULL,
    category_id     INT NOT NULL REFERENCES categories(category_id) ON DELETE RESTRICT,
    UNIQUE (skill_name, category_id)
);

-- 4. USER_SKILLS (offered / wanted skills per user) ---------------------
CREATE TABLE user_skills (
    user_skill_id     SERIAL PRIMARY KEY,
    user_id           INT NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
    skill_id          INT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    proficiency_level VARCHAR(20) NOT NULL DEFAULT 'beginner'
                        CHECK (proficiency_level IN ('beginner','intermediate','advanced','expert')),
    description       TEXT,
    is_offering       BOOLEAN NOT NULL DEFAULT TRUE,
    -- [FIX 11] v1 used UNIQUE(user_id, skill_id, is_offering), which let the same
    -- user simultaneously offer AND request the same skill - a contradictory state
    -- that would make them their own best match. Dropping is_offering from the key
    -- allows only one stance per user per skill.
    UNIQUE (user_id, skill_id),
    -- [FIX 13] tsvector over the free-text blurb, powering keyword search today and
    -- acting as the fallback ranker for the vector/semantic layer later.
    search_vector     tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(description,''))) STORED
);

-- 5. SESSIONS (a booked skill-exchange session) --------------------------
CREATE TABLE sessions (
    session_id          SERIAL PRIMARY KEY,
    offering_user_id    INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    requesting_user_id  INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    skill_id            INT NOT NULL REFERENCES skills(skill_id) ON DELETE RESTRICT,
    scheduled_time      TIMESTAMP NOT NULL,
    duration_minutes    INT NOT NULL CHECK (duration_minutes > 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','completed','cancelled')),
    credits_charged     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
    location            VARCHAR(150),
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (offering_user_id <> requesting_user_id),

    -- [FIX 5] Generated half-open interval for the session, used by the exclusion
    -- constraints below. make_interval() and tsrange() are both IMMUTABLE, so this
    -- is legal in a STORED generated column.
    session_period      tsrange GENERATED ALWAYS AS (
                            tsrange(scheduled_time,
                                    scheduled_time + make_interval(mins => duration_minutes))
                        ) STORED,

    -- [FIX 5] A tutor cannot hold two live sessions that overlap in time; likewise
    -- a learner cannot attend two at once. Enforced in the database, so no amount of
    -- concurrent API traffic can slip a double booking through.
    EXCLUDE USING gist (offering_user_id   WITH =, session_period WITH &&)
        WHERE (status <> 'cancelled'),
    EXCLUDE USING gist (requesting_user_id WITH =, session_period WITH &&)
        WHERE (status <> 'cancelled')
);

-- 6. REVIEWS ---------------------------------------------------------------
CREATE TABLE reviews (
    review_id    SERIAL PRIMARY KEY,
    session_id   INT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    reviewer_id  INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    reviewee_id  INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    rating       SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (session_id, reviewer_id),
    -- [FIX 1] v1 happily accepted a user reviewing themselves to inflate their rating.
    CHECK (reviewer_id <> reviewee_id)
);

-- 7. CREDIT_TRANSACTIONS ---------------------------------------------------
CREATE TABLE credit_transactions (
    transaction_id   SERIAL PRIMARY KEY,
    user_id          INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    -- [FIX 12] v1 left this FK with the implicit NO ACTION rule while its sibling
    -- tables cascaded, so deleting a session was blocked by its own audit rows.
    session_id       INT REFERENCES sessions(session_id) ON DELETE SET NULL,
    amount           NUMERIC(10,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('earned','spent','bonus','refund')),
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. RESOURCE_LISTINGS ------------------------------------------------------
CREATE TABLE resource_listings (
    resource_id          SERIAL PRIMARY KEY,
    owner_id             INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    title                VARCHAR(150) NOT NULL,
    description          TEXT,
    category_id          INT REFERENCES categories(category_id) ON DELETE SET NULL,
    condition            VARCHAR(20) CHECK (condition IN ('new','good','fair','worn')),
    availability_status  VARCHAR(20) NOT NULL DEFAULT 'available'
                        CHECK (availability_status IN ('available','borrowed','unavailable')),
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. RESOURCE_BORROW_REQUESTS ------------------------------------------------
CREATE TABLE resource_borrow_requests (
    request_id        SERIAL PRIMARY KEY,
    resource_id       INT NOT NULL REFERENCES resource_listings(resource_id) ON DELETE CASCADE,
    borrower_id       INT NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    request_date      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    start_date        DATE NOT NULL,
    end_date          DATE NOT NULL,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','returned')),
    return_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (end_date >= start_date),

    -- [FIX 10] One physical object cannot be lent to two people over overlapping
    -- dates. v1 had no such rule, so the same textbook could be approved twice.
    borrow_period     daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[]')) STORED,
    EXCLUDE USING gist (resource_id WITH =, borrow_period WITH &&)
        WHERE (status = 'approved')
);

-- 10. NOTIFICATIONS -----------------------------------------------------------
CREATE TABLE notifications (
    notification_id     SERIAL PRIMARY KEY,
    user_id             INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    message             VARCHAR(255) NOT NULL,
    related_session_id  INT REFERENCES sessions(session_id) ON DELETE CASCADE,
    is_read             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================================
-- INDEXES (Advanced feature #1: Indexing)
-- =====================================================================
CREATE INDEX idx_userskills_user       ON user_skills(user_id);
CREATE INDEX idx_userskills_skill      ON user_skills(skill_id);
-- [FIX 11a] The hot matchmaking query is "who is offering skill X" - a partial
-- composite index serves it far better than the two single-column indexes alone.
CREATE INDEX idx_userskills_offering   ON user_skills(skill_id, proficiency_level)
                                        WHERE is_offering;
-- [FIX 13] GIN index backing full-text search over skill blurbs.
CREATE INDEX idx_userskills_search     ON user_skills USING GIN (search_vector);

CREATE INDEX idx_sessions_offering     ON sessions(offering_user_id);
CREATE INDEX idx_sessions_requesting   ON sessions(requesting_user_id);
CREATE INDEX idx_sessions_status       ON sessions(status);
-- [FIX 11b] Upcoming-sessions and calendar views filter on time; v1 had no index
-- for this and fell back to a sequential scan.
CREATE INDEX idx_sessions_schedule     ON sessions(scheduled_time)
                                        WHERE status IN ('pending','confirmed');

-- [FIX 11c] Every profile page averages a user's received ratings. v1 indexed
-- neither review column, so each profile load scanned the whole reviews table.
CREATE INDEX idx_reviews_reviewee      ON reviews(reviewee_id);
CREATE INDEX idx_credit_tx_user        ON credit_transactions(user_id, created_at);

CREATE INDEX idx_resource_owner        ON resource_listings(owner_id);
CREATE INDEX idx_resource_status       ON resource_listings(availability_status);
CREATE INDEX idx_borrow_resource       ON resource_borrow_requests(resource_id);
CREATE INDEX idx_notifications_user    ON notifications(user_id) WHERE NOT is_read;

-- =====================================================================
-- VIEWS (Advanced feature #2: Views)
-- =====================================================================

-- [FIX 12a] v1's version omitted user_id, so the web app could render a tutor's
-- name but had no key to link to their profile or book them. It also exposed no
-- reputation data, forcing a second round trip per row.
CREATE VIEW available_skills_view AS
SELECT us.user_skill_id, u.user_id, u.full_name, u.department,
       s.skill_id, s.skill_name, c.category_name,
       us.proficiency_level, us.description,
       COALESCE(r.avg_rating, 0)   AS avg_rating,
       COALESCE(r.review_count, 0) AS review_count
FROM user_skills us
JOIN users u      ON u.user_id     = us.user_id
JOIN skills s     ON s.skill_id    = us.skill_id
JOIN categories c ON c.category_id = s.category_id
LEFT JOIN (
    SELECT reviewee_id, ROUND(AVG(rating), 2) AS avg_rating, COUNT(*) AS review_count
    FROM reviews GROUP BY reviewee_id
) r ON r.reviewee_id = u.user_id
WHERE us.is_offering AND u.is_active;

-- [FIX 12b] New reconciliation view. credits_balance is a denormalised running
-- total; this exposes any drift between it and the transaction ledger so the
-- discrepancy is detectable rather than silent.
-- [FIX 14] An earlier draft assumed every account opens at 20.00 credits and
-- hardcoded that constant here. Any user granted a different opening balance was
-- then reported as drifting when the ledger was in fact correct. The opening
-- grant is now recorded as a real ledger row (see fn_record_opening_grant), so
-- the view derives the balance purely from the ledger with no magic number.
CREATE VIEW credit_reconciliation_view AS
SELECT u.user_id, u.full_name, u.credits_balance,
       COALESCE(SUM(ct.amount), 0) AS ledger_balance,
       u.credits_balance - COALESCE(SUM(ct.amount), 0) AS drift
FROM users u
LEFT JOIN credit_transactions ct ON ct.user_id = u.user_id
GROUP BY u.user_id, u.full_name, u.credits_balance;

-- =====================================================================
-- TRIGGERS (Advanced feature #3: Triggers)
-- =====================================================================

-- [FIX 4] v1 allowed sessions to be booked in the past. A CHECK constraint cannot
-- reference now() (not IMMUTABLE), so this must be a trigger.
CREATE OR REPLACE FUNCTION fn_validate_session()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.scheduled_time < CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Cannot book a session in the past (requested %)', NEW.scheduled_time
            USING ERRCODE = 'check_violation';
    END IF;

    -- [FIX 6a] The price of a completed session is history; freezing it stops the
    -- ledger being retro-edited after the credits have already moved.
    IF TG_OP = 'UPDATE' AND OLD.status = 'completed'
       AND NEW.credits_charged <> OLD.credits_charged THEN
        RAISE EXCEPTION 'credits_charged cannot be modified after completion'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_session
BEFORE INSERT OR UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION fn_validate_session();

-- [FIX 14] Record the opening credit grant as a real ledger entry, so that
-- SUM(credit_transactions.amount) is a complete account of every credit a user
-- has ever held. Without this the ledger silently omits the signup grant and any
-- reconciliation check has to guess at the starting figure.
CREATE OR REPLACE FUNCTION fn_record_opening_grant()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.credits_balance > 0 THEN
        INSERT INTO credit_transactions (user_id, amount, transaction_type)
        VALUES (NEW.user_id, NEW.credits_balance, 'bonus');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_record_opening_grant
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION fn_record_opening_grant();

-- [FIX 2 + FIX 3] v1 let anyone review any session, including strangers who never
-- attended, and let reviews be filed against sessions that had not happened yet.
CREATE OR REPLACE FUNCTION fn_validate_review()
RETURNS TRIGGER AS $$
DECLARE
    v_offering INT; v_requesting INT; v_status VARCHAR(20); v_counterparty INT;
BEGIN
    SELECT offering_user_id, requesting_user_id, status
      INTO v_offering, v_requesting, v_status
    FROM sessions WHERE session_id = NEW.session_id;

    IF v_status <> 'completed' THEN
        RAISE EXCEPTION 'Cannot review session % - status is %, expected completed',
            NEW.session_id, v_status USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.reviewer_id NOT IN (v_offering, v_requesting) THEN
        RAISE EXCEPTION 'User % did not participate in session %',
            NEW.reviewer_id, NEW.session_id USING ERRCODE = 'check_violation';
    END IF;

    -- The reviewee must be the *other* participant, not an unrelated third party.
    -- (The counterparty is resolved into a variable first: writing
    --  "IF x <> CASE ... END THEN" makes END ambiguous to the plpgsql parser.)
    v_counterparty := CASE WHEN NEW.reviewer_id = v_offering
                           THEN v_requesting ELSE v_offering END;

    IF NEW.reviewee_id <> v_counterparty THEN
        RAISE EXCEPTION 'Reviewee % is not the counterparty in session %',
            NEW.reviewee_id, NEW.session_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_review
BEFORE INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION fn_validate_review();

-- ---------------------------------------------------------------------
-- Credit settlement trigger
-- [FIX 7] DEADLOCK. v1 issued two separate UPDATE statements against users,
--   debiting the requester then crediting the offerer. Two sessions completing
--   concurrently with mirrored participants (A teaches B / B teaches A) grabbed
--   the two row locks in opposite orders and deadlocked - reproduced under test.
--   v2 takes both locks up front in a deterministic user_id order, then settles
--   both sides in ONE statement, so a consistent global lock order is guaranteed.
-- [FIX 6b] v1 let the balance go negative and relied on the CHECK constraint to
--   abort, surfacing an opaque constraint error. v2 checks first and explains.
-- [FIX 8]  v1 had no reversal path: cancelling an already-completed session left
--   the credits transferred permanently. v2 refunds symmetrically.
-- [FIX 9]  v1 wrote two zero-value ledger rows for every free session.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_apply_session_credits()
RETURNS TRIGGER AS $$
DECLARE
    v_balance NUMERIC(10,2);
    v_sign    INT;
BEGIN
    IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
        v_sign := 1;      -- settle: requester pays, offerer earns
    ELSIF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
        v_sign := -1;     -- reverse a previously settled session
    ELSE
        RETURN NEW;
    END IF;

    IF NEW.credits_charged = 0 THEN
        RETURN NEW;       -- [FIX 9] free session: nothing to settle, no ledger noise
    END IF;

    -- [FIX 7] Deterministic lock acquisition order kills the deadlock.
    -- NOTE: "SELECT ... ORDER BY user_id FOR UPDATE" does NOT work here. Postgres
    -- locks rows as it scans them, before the sort node applies, so the ORDER BY
    -- guarantees nothing about acquisition order. Locking the lower user_id in its
    -- own statement and then the higher one is the only way to force a consistent
    -- global ordering, which is what makes a lock-order inversion impossible.
    PERFORM 1 FROM users
      WHERE user_id = LEAST(NEW.offering_user_id, NEW.requesting_user_id)
        FOR NO KEY UPDATE;
    PERFORM 1 FROM users
      WHERE user_id = GREATEST(NEW.offering_user_id, NEW.requesting_user_id)
        FOR NO KEY UPDATE;

    -- [FIX 6b] Verify the paying side can actually afford it, with a clear message.
    SELECT credits_balance INTO v_balance FROM users
     WHERE user_id = CASE WHEN v_sign = 1 THEN NEW.requesting_user_id
                          ELSE NEW.offering_user_id END;

    IF v_balance < NEW.credits_charged THEN
        RAISE EXCEPTION
            'Insufficient credits: balance % is less than the % required for session %',
            v_balance, NEW.credits_charged, NEW.session_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- [FIX 7] Single statement settles both sides; no interleaving window.
    UPDATE users
       SET credits_balance = credits_balance
           + CASE WHEN user_id = NEW.offering_user_id
                  THEN  v_sign * NEW.credits_charged
                  ELSE -v_sign * NEW.credits_charged END
     WHERE user_id IN (NEW.offering_user_id, NEW.requesting_user_id);

    INSERT INTO credit_transactions (user_id, session_id, amount, transaction_type)
    VALUES (NEW.requesting_user_id, NEW.session_id, -v_sign * NEW.credits_charged,
            CASE WHEN v_sign = 1 THEN 'spent'  ELSE 'refund' END),
           (NEW.offering_user_id,   NEW.session_id,  v_sign * NEW.credits_charged,
            CASE WHEN v_sign = 1 THEN 'earned' ELSE 'refund' END);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_session_completed
AFTER UPDATE ON sessions
FOR EACH ROW
EXECUTE FUNCTION fn_apply_session_credits();

-- [FIX 10a] Keep resource_listings.availability_status in step with reality.
-- In v1 this column was set once at insert and never maintained, so it drifted
-- out of sync the moment anything was borrowed.
CREATE OR REPLACE FUNCTION fn_sync_resource_availability()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'approved' THEN
        UPDATE resource_listings SET availability_status = 'borrowed'
         WHERE resource_id = NEW.resource_id;
    ELSIF NEW.status = 'returned' THEN
        UPDATE resource_listings SET availability_status = 'available'
         WHERE resource_id = NEW.resource_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_resource_availability
AFTER INSERT OR UPDATE OF status ON resource_borrow_requests
FOR EACH ROW
EXECUTE FUNCTION fn_sync_resource_availability();

-- =====================================================================
-- STORED PROCEDURE (Advanced feature #4: Stored procedures + Transactions)
-- Books a session after validating the offer, the schedule and affordability.
-- [FIX 6c] v1 only checked that the skill was offered; a learner could book a
-- session they could never pay for and only discover it at completion time.
-- =====================================================================
CREATE OR REPLACE PROCEDURE sp_book_session(
    p_offering_user   INT,
    p_requesting_user INT,
    p_skill_id        INT,
    p_scheduled_time  TIMESTAMP,
    p_duration        INT,
    p_credits         NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_balance NUMERIC(10,2);
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM user_skills
         WHERE user_id = p_offering_user AND skill_id = p_skill_id AND is_offering
    ) THEN
        RAISE EXCEPTION 'User % does not offer skill %', p_offering_user, p_skill_id;
    END IF;

    SELECT credits_balance INTO v_balance FROM users WHERE user_id = p_requesting_user;
    IF v_balance IS NULL THEN
        RAISE EXCEPTION 'Requesting user % does not exist', p_requesting_user;
    END IF;

    -- [FIX 6c] Fail fast at booking time rather than at settlement time.
    IF v_balance < p_credits THEN
        RAISE EXCEPTION
            'User % has only % credits but the session costs %',
            p_requesting_user, v_balance, p_credits;
    END IF;

    -- The EXCLUDE constraints on sessions reject clashes for either participant,
    -- and the fn_validate_session trigger rejects past-dated bookings.
    INSERT INTO sessions (offering_user_id, requesting_user_id, skill_id,
                          scheduled_time, duration_minutes, credits_charged)
    VALUES (p_offering_user, p_requesting_user, p_skill_id,
            p_scheduled_time, p_duration, p_credits);
END;
$$;

-- =====================================================================
-- FUNCTION (Advanced feature #5: Full-text search)
-- [FIX 13] Ranked keyword search over skill blurbs - the SQL-side counterpart
-- of the semantic matching the vector database will provide.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_search_skills(p_query TEXT)
RETURNS TABLE (user_id INT, full_name VARCHAR, skill_name VARCHAR,
               proficiency_level VARCHAR, relevance REAL)
AS $$
    SELECT u.user_id, u.full_name, s.skill_name, us.proficiency_level,
           ts_rank(us.search_vector, plainto_tsquery('english', p_query)) AS relevance
    FROM user_skills us
    JOIN users  u ON u.user_id  = us.user_id
    JOIN skills s ON s.skill_id = us.skill_id
    WHERE us.is_offering
      AND us.search_vector @@ plainto_tsquery('english', p_query)
    ORDER BY relevance DESC
    LIMIT 10;
$$ LANGUAGE sql STABLE;
