-- =====================================================================
-- SkillSwap Campus - v3 business logic (triggers, procedures, functions,
-- views) added while building the web application.
-- Runs after 02_migrations.sql. New fixes continue the numbering of the
-- Week 4 defect audit: [FIX 15] onwards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: who is performing the current operation?
-- The API runs  SELECT set_config('app.current_user_id', <id>, true)
-- inside each transaction. Triggers read it back so they know the ACTOR
-- (e.g. to notify the *other* participant, not the person who clicked).
-- The 'true' flag makes it transaction-local: it can never leak into the
-- next request served by the same pooled connection.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_current_actor()
RETURNS INT AS $$
    SELECT NULLIF(current_setting('app.current_user_id', true), '')::INT;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Available credits = balance minus credits already promised to sessions
-- that are booked (pending / confirmed) but not yet settled.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_available_credits(p_user_id INT)
RETURNS NUMERIC AS $$
    SELECT u.credits_balance - COALESCE((
               SELECT SUM(s.credits_charged) FROM sessions s
               WHERE s.requesting_user_id = p_user_id
                 AND s.status IN ('pending','confirmed')), 0)
    FROM users u WHERE u.user_id = p_user_id;
$$ LANGUAGE sql STABLE;

-- =====================================================================
-- [FIX 15] Session state machine.
-- v2 allowed ANY status change, e.g. cancelled -> completed (which would
-- move credits for a session that never happened) or completing a session
-- before it took place. Legal transitions are now enforced in the DB:
--
--      pending ──► confirmed ──► completed
--         │            │              │
--         └──► cancelled ◄────────────┘  (completed -> cancelled = refund, FIX 8)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_session_state_machine()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'A new session must start as pending (got %)', NEW.status
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (   (OLD.status = 'pending'   AND NEW.status IN ('confirmed','cancelled'))
            OR (OLD.status = 'confirmed' AND NEW.status IN ('completed','cancelled'))
            OR (OLD.status = 'completed' AND NEW.status = 'cancelled') ) THEN
        RAISE EXCEPTION 'Illegal session status change: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status = 'completed' AND NEW.scheduled_time > CURRENT_TIMESTAMP THEN
        RAISE EXCEPTION 'Session % cannot be completed before it takes place (scheduled %)',
            NEW.session_id, to_char(NEW.scheduled_time, 'DD Mon YYYY HH24:MI')
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_state_machine ON sessions;
CREATE TRIGGER trg_session_state_machine
    BEFORE INSERT OR UPDATE OF status ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION fn_session_state_machine();

-- =====================================================================
-- [FIX 16] Over-booking. v2's sp_book_session compared the price with the
-- CURRENT balance only, so a learner with 20 credits could book four
-- 10-credit sessions and every one would pass. v3 checks AVAILABLE credits
-- (balance minus credits already committed to open bookings) and locks the
-- learner's row first, so two simultaneous bookings cannot both slip
-- through the check (classic check-then-act race).
--
-- The signature changes (location + an INOUT id so the API learns the new
-- session_id), so the v2 procedure is DROPPED rather than replaced -
-- CREATE OR REPLACE with a different signature would create an ambiguous
-- overload instead.
-- =====================================================================
DROP PROCEDURE IF EXISTS sp_book_session(INT, INT, INT, TIMESTAMP, INT, NUMERIC);

CREATE OR REPLACE PROCEDURE sp_book_session(
    p_offering_user    INT,
    p_requesting_user  INT,
    p_skill_id         INT,
    p_scheduled_time   TIMESTAMP,
    p_duration         INT,
    p_credits          NUMERIC,
    p_location         VARCHAR DEFAULT NULL,
    INOUT p_session_id INT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_available NUMERIC(10,2);
    v_active    BOOLEAN;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM user_skills us JOIN users u ON u.user_id = us.user_id
        WHERE us.user_id = p_offering_user AND us.skill_id = p_skill_id
          AND us.is_offering AND u.is_active
    ) THEN
        RAISE EXCEPTION 'User % does not offer skill % (or the account is inactive)',
            p_offering_user, p_skill_id USING ERRCODE = 'check_violation';
    END IF;

    -- Lock BOTH participants, lowest user_id first (same global order as the
    -- FIX 7 settlement trigger, so the two can never deadlock each other).
    -- This serialises concurrent bookings involving either person, which
    -- makes the available-credit check and the FIX 18 clash check race-free.
    PERFORM 1 FROM users WHERE user_id = LEAST(p_offering_user, p_requesting_user)    FOR UPDATE;
    PERFORM 1 FROM users WHERE user_id = GREATEST(p_offering_user, p_requesting_user) FOR UPDATE;

    SELECT is_active INTO v_active FROM users WHERE user_id = p_requesting_user;
    IF v_active IS NULL THEN
        RAISE EXCEPTION 'Requesting user % does not exist', p_requesting_user
            USING ERRCODE = 'foreign_key_violation';
    ELSIF NOT v_active THEN
        RAISE EXCEPTION 'Account % is deactivated', p_requesting_user
            USING ERRCODE = 'check_violation';
    END IF;

    v_available := fn_available_credits(p_requesting_user);
    IF v_available < p_credits THEN
        RAISE EXCEPTION 'Insufficient available credits: you have % free (after open bookings) but this session costs %',
            v_available, p_credits USING ERRCODE = 'check_violation';
    END IF;

    -- Past dates   -> rejected by trg_validate_session   (FIX 4)
    -- Clashes      -> rejected by the EXCLUDE constraints (FIX 5)
    INSERT INTO sessions (offering_user_id, requesting_user_id, skill_id,
                          scheduled_time, duration_minutes, credits_charged, location)
    VALUES (p_offering_user, p_requesting_user, p_skill_id,
            p_scheduled_time, p_duration, p_credits,
            COALESCE(NULLIF(btrim(p_location), ''), 'Library Study Room'))
    RETURNING session_id INTO p_session_id;
END;
$$;

-- =====================================================================
-- [FIX 18] Cross-role double booking. The two v2 EXCLUDE constraints stop
-- a tutor overlapping with themselves AS A TUTOR, and a learner AS A
-- LEARNER - but nothing stopped Harsh teaching Python 4-5 pm while also
-- attending a Guitar lesson 4-5 pm. One person cannot be in two places,
-- whatever their role. An EXCLUDE constraint cannot compare two different
-- columns, so this rule is a trigger. (Same-role clashes are still left
-- to the EXCLUDE constraints.)
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_check_cross_role_clash()
RETURNS TRIGGER AS $$
DECLARE
    v_clash  INT;
    v_period tsrange;
BEGIN
    IF NEW.status = 'cancelled' THEN
        RETURN NEW;
    END IF;
    -- stored generated columns are computed AFTER before-triggers, so the
    -- period is derived here from the same expression
    v_period := tsrange(NEW.scheduled_time,
                        NEW.scheduled_time + make_interval(mins => NEW.duration_minutes));
    SELECT s.session_id INTO v_clash
    FROM sessions s
    WHERE s.session_id <> NEW.session_id
      AND s.status <> 'cancelled'
      AND s.session_period && v_period
      AND (s.offering_user_id = NEW.requesting_user_id      -- learner is teaching then
           OR s.requesting_user_id = NEW.offering_user_id)  -- tutor is learning then
    LIMIT 1;
    IF v_clash IS NOT NULL THEN
        RAISE EXCEPTION 'Time clash: one of the two participants is already in session #% at that time', v_clash
            USING ERRCODE = 'exclusion_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_cross_role_clash ON sessions;
CREATE TRIGGER trg_check_cross_role_clash
    BEFORE INSERT OR UPDATE OF scheduled_time, duration_minutes, status ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION fn_check_cross_role_clash();

-- =====================================================================
-- [FIX 17] Borrow-request integrity. v2 let an owner "borrow" their own
-- item, accepted requests starting in the past, and allowed any status
-- jump (e.g. rejected -> returned).
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_validate_borrow()
RETURNS TRIGGER AS $$
DECLARE
    v_owner  INT;
    v_status VARCHAR(20);
BEGIN
    SELECT owner_id, availability_status INTO v_owner, v_status
    FROM resource_listings WHERE resource_id = NEW.resource_id;

    IF TG_OP = 'INSERT' THEN
        IF NEW.borrower_id = v_owner THEN
            RAISE EXCEPTION 'You cannot borrow your own item' USING ERRCODE = 'check_violation';
        END IF;
        IF v_status = 'unavailable' THEN
            RAISE EXCEPTION 'This item has been withdrawn by its owner' USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.start_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'Borrow start date % is in the past', NEW.start_date
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.status <> 'pending' THEN
            RAISE EXCEPTION 'A new borrow request must start as pending' USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF NOT (   (OLD.status = 'pending'  AND NEW.status IN ('approved','rejected'))
            OR (OLD.status = 'approved' AND NEW.status = 'returned') ) THEN
        RAISE EXCEPTION 'Illegal borrow status change: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'returned' THEN
        NEW.return_confirmed := TRUE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_borrow ON resource_borrow_requests;
CREATE TRIGGER trg_validate_borrow
    BEFORE INSERT OR UPDATE OF status ON resource_borrow_requests
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_borrow();

-- =====================================================================
-- Notification triggers: the notifications table (v2) existed but nothing
-- wrote to it. Events now generate notifications INSIDE the same
-- transaction as the change, so a notification can never exist for a
-- change that rolled back, and a committed change is never missed.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_notify_session()
RETURNS TRIGGER AS $$
DECLARE
    v_skill   TEXT;
    v_tutor   TEXT;
    v_learner TEXT;
    v_when    TEXT := to_char(NEW.scheduled_time, 'DD Mon, HH24:MI');
    v_actor   INT  := fn_current_actor();
BEGIN
    SELECT skill_name INTO v_skill   FROM skills WHERE skill_id = NEW.skill_id;
    SELECT full_name  INTO v_tutor   FROM users  WHERE user_id  = NEW.offering_user_id;
    SELECT full_name  INTO v_learner FROM users  WHERE user_id  = NEW.requesting_user_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO notifications (user_id, message, related_session_id)
        VALUES (NEW.offering_user_id,
                left(format('%s requested a %s session on %s', v_learner, v_skill, v_when), 255),
                NEW.session_id);
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO notifications (user_id, message, related_session_id)
        SELECT p.uid,
               left(format('%s session with %s on %s is now %s',
                           v_skill, p.other_name, v_when, upper(NEW.status)), 255),
               NEW.session_id
        FROM (VALUES (NEW.offering_user_id,   v_learner),
                     (NEW.requesting_user_id, v_tutor)) AS p(uid, other_name)
        WHERE v_actor IS NULL OR p.uid <> v_actor;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_session ON sessions;
CREATE TRIGGER trg_notify_session
    AFTER INSERT OR UPDATE OF status ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION fn_notify_session();

CREATE OR REPLACE FUNCTION fn_notify_borrow()
RETURNS TRIGGER AS $$
DECLARE
    v_title    TEXT;
    v_owner    INT;
    v_borrower TEXT;
BEGIN
    SELECT r.title, r.owner_id INTO v_title, v_owner
    FROM resource_listings r WHERE r.resource_id = NEW.resource_id;
    SELECT full_name INTO v_borrower FROM users WHERE user_id = NEW.borrower_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO notifications (user_id, message)
        VALUES (v_owner, left(format('%s wants to borrow "%s" (%s to %s)',
                v_borrower, v_title, NEW.start_date, NEW.end_date), 255));
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('approved','rejected') THEN
        INSERT INTO notifications (user_id, message)
        VALUES (NEW.borrower_id, left(format('Your request to borrow "%s" was %s',
                v_title, upper(NEW.status)), 255));
    ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'returned' THEN
        INSERT INTO notifications (user_id, message)
        VALUES (v_owner, left(format('"%s" has been marked as returned', v_title), 255));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_borrow ON resource_borrow_requests;
CREATE TRIGGER trg_notify_borrow
    AFTER INSERT OR UPDATE OF status ON resource_borrow_requests
    FOR EACH ROW
    EXECUTE FUNCTION fn_notify_borrow();

CREATE OR REPLACE FUNCTION fn_notify_review()
RETURNS TRIGGER AS $$
DECLARE v_reviewer TEXT;
BEGIN
    SELECT full_name INTO v_reviewer FROM users WHERE user_id = NEW.reviewer_id;
    INSERT INTO notifications (user_id, message, related_session_id)
    VALUES (NEW.reviewee_id,
            left(format('%s rated you %s/5 for session #%s', v_reviewer, NEW.rating, NEW.session_id), 255),
            NEW.session_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_review ON reviews;
CREATE TRIGGER trg_notify_review
    AFTER INSERT ON reviews
    FOR EACH ROW
    EXECUTE FUNCTION fn_notify_review();

-- =====================================================================
-- Matchmaking: "perfect swaps" - people who TEACH something you WANT and
-- WANT something you TEACH. A four-way self-join on user_skills; nobody
-- needs to spend credits because the exchange is mutual.
-- =====================================================================
CREATE OR REPLACE FUNCTION fn_perfect_swaps(p_user_id INT)
RETURNS TABLE (partner_id INT, partner_name VARCHAR, department VARCHAR,
               they_teach_you VARCHAR, you_teach_them VARCHAR) AS $$
    SELECT DISTINCT u.user_id, u.full_name, u.department, s_want.skill_name, s_offer.skill_name
    FROM user_skills my_want
    JOIN user_skills their_offer ON their_offer.skill_id = my_want.skill_id
                                AND their_offer.is_offering
    JOIN user_skills their_want  ON their_want.user_id = their_offer.user_id
                                AND NOT their_want.is_offering
    JOIN user_skills my_offer    ON my_offer.user_id  = my_want.user_id
                                AND my_offer.is_offering
                                AND my_offer.skill_id = their_want.skill_id
    JOIN users  u       ON u.user_id        = their_offer.user_id
    JOIN skills s_want  ON s_want.skill_id  = my_want.skill_id
    JOIN skills s_offer ON s_offer.skill_id = my_offer.skill_id
    WHERE my_want.user_id = p_user_id
      AND NOT my_want.is_offering
      AND u.user_id <> p_user_id
      AND u.is_active
    ORDER BY u.full_name;
$$ LANGUAGE sql STABLE;

-- =====================================================================
-- Analytical views used by the dashboard
-- =====================================================================

-- Ranked tutors. Ratings count only reviews received AS THE TUTOR of the
-- session (a learner can also be reviewed, which must not inflate this).
CREATE OR REPLACE VIEW tutor_leaderboard_view AS
SELECT u.user_id, u.full_name, u.department,
       t.sessions_taught,
       t.credits_earned,
       COALESCE(r.avg_rating, 0)    AS avg_rating,
       COALESCE(r.review_count, 0)  AS review_count,
       RANK() OVER (ORDER BY t.sessions_taught DESC, COALESCE(r.avg_rating, 0) DESC) AS rank_position
FROM users u
JOIN (SELECT offering_user_id AS uid,
             COUNT(*)             AS sessions_taught,
             SUM(credits_charged) AS credits_earned
      FROM sessions WHERE status = 'completed'
      GROUP BY offering_user_id) t ON t.uid = u.user_id
LEFT JOIN (SELECT rv.reviewee_id,
                  ROUND(AVG(rv.rating), 2) AS avg_rating,
                  COUNT(*)                 AS review_count
           FROM reviews rv
           JOIN sessions s ON s.session_id = rv.session_id
                          AND rv.reviewee_id = s.offering_user_id
           GROUP BY rv.reviewee_id) r ON r.reviewee_id = u.user_id
WHERE u.is_active;

-- Supply vs demand per skill: which skills do many students want but few teach?
CREATE OR REPLACE VIEW skill_demand_view AS
SELECT s.skill_id, s.skill_name, c.category_name,
       COUNT(us.user_skill_id) FILTER (WHERE us.is_offering)     AS tutors,
       COUNT(us.user_skill_id) FILTER (WHERE NOT us.is_offering) AS learners,
       COUNT(us.user_skill_id) FILTER (WHERE NOT us.is_offering)
     - COUNT(us.user_skill_id) FILTER (WHERE us.is_offering)     AS demand_gap
FROM skills s
JOIN categories c ON c.category_id = s.category_id
LEFT JOIN user_skills us ON us.skill_id = s.skill_id
GROUP BY s.skill_id, s.skill_name, c.category_name;
