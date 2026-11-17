-- =====================================================================
-- SkillSwap Campus - v3 schema migrations (ALTER / DROP)
-- Runs after 01_schema.sql. Each migration is tagged [Mn].
--
-- Real schemas evolve; they are rarely right first time. Rather than
-- editing the Week 4 DDL in place, the changes needed by the web
-- application are applied here as ALTER / DROP statements, exactly as a
-- production database would be migrated.
-- =====================================================================

-- [M1] ALTER ... ADD COLUMN: the app records each user's last login and an
-- optional short bio shown on tutor cards.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(300);

-- [M2] ALTER ... ADD CONSTRAINT: input validation enforced by the DATABASE,
-- not only by the web form. Any client (API, psql, a buggy script) is bound
-- by these rules.
ALTER TABLE users ADD CONSTRAINT chk_users_email_format
    CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
ALTER TABLE users ADD CONSTRAINT chk_users_name_not_blank
    CHECK (char_length(btrim(full_name)) >= 2);
ALTER TABLE users ADD CONSTRAINT chk_users_password_is_hash
    CHECK (password_hash LIKE '$2%' AND char_length(password_hash) = 60);
    -- ^ the column can only ever hold a bcrypt hash: a plain-text password
    --   inserted by mistake is rejected by the database itself.

ALTER TABLE resource_listings ADD CONSTRAINT chk_resource_title_not_blank
    CHECK (char_length(btrim(title)) >= 3);
ALTER TABLE reviews ADD CONSTRAINT chk_review_comment_length
    CHECK (comment IS NULL OR char_length(comment) <= 1000);
ALTER TABLE sessions ADD CONSTRAINT chk_session_duration_max
    CHECK (duration_minutes BETWEEN 15 AND 240);
ALTER TABLE sessions ADD CONSTRAINT chk_session_credits_max
    CHECK (credits_charged <= 100);
ALTER TABLE resource_borrow_requests ADD CONSTRAINT chk_borrow_max_30_days
    CHECK (end_date - start_date <= 30);

-- [M3] Case-insensitive e-mail uniqueness. The UNIQUE(email) from v2 treats
-- 'Asha@campus.edu' and 'asha@campus.edu' as different people. A unique
-- index on an EXPRESSION closes that hole.
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));

-- [M4] ALTER ... ALTER COLUMN ... SET DEFAULT
ALTER TABLE sessions ALTER COLUMN location SET DEFAULT 'Library Study Room';

-- [M5] DROP INDEX: idx_userskills_user (v2) is redundant. The UNIQUE
-- (user_id, skill_id) constraint already builds a B-tree whose LEADING
-- column is user_id, so every "skills of user X" lookup can use it. A
-- redundant index costs write time and disk for zero read benefit.
DROP INDEX IF EXISTS idx_userskills_user;

-- [M6] Composite index for the notification bell (latest unread first).
DROP INDEX IF EXISTS idx_notifications_user;
CREATE INDEX idx_notifications_user_recent
    ON notifications (user_id, created_at DESC) WHERE NOT is_read;

-- [M7] Index for "my borrow requests" and for the borrow validation trigger.
CREATE INDEX IF NOT EXISTS idx_borrow_borrower ON resource_borrow_requests (borrower_id);
