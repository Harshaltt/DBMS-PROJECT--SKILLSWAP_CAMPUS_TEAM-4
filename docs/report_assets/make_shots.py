"""Renders real psql / terminal output as screenshot images for the report.
Every image is produced by actually running the command against the database.
Usage: python3 make_shots.py   (expects a freshly seeded skillswap_campus DB)"""
import os
import re
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(os.path.dirname(__file__), 'shots')
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ, PGPASSWORD='skillswap', PGTZ='Asia/Kolkata')
DB = ['-h', 'localhost', '-U', 'skillswap', '-d', 'skillswap_campus']
PROMPT = 'skillswap_campus=# '
CONT = 'skillswap_campus-# '

WRAP_COLS = int(os.environ.get('WRAP_COLS', 110))
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
MONO_B = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'
F = ImageFont.truetype(MONO, 26)
FB = ImageFont.truetype(MONO_B, 26)
FT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 24)


def psql(sql, db=None):
    """Run one psql command; return (echo, output) the way the terminal shows it."""
    args = ['psql', '-X', '-P', 'pager=off', '-v', 'ON_ERROR_STOP=0', '-v', 'SHOW_CONTEXT=never'] + (db or DB) + ['-c', sql]
    p = subprocess.run(args, capture_output=True, text=True, env=ENV)
    out = (p.stdout + p.stderr).rstrip('\n')
    # psql repeats PL/pgSQL call stacks; keep ERROR / DETAIL / HINT lines only
    out = '\n'.join(l for l in out.split('\n') if not l.startswith(('CONTEXT:', 'PL/pgSQL', 'SQL statement')))
    lines = sql.strip('\n').split('\n')
    echo = [PROMPT + lines[0]] + [CONT + l for l in lines[1:]]
    return echo, out.split('\n') if out else []


def shell(cmd, display=None, cwd=ROOT):
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, env=ENV, cwd=cwd)
    out = (p.stdout + p.stderr).rstrip('\n')
    out = re.sub(r'\x1b\[[0-9;]*m', '', out)
    return ['$ ' + (display or cmd)], out.split('\n')


def render(name, title, blocks, max_lines=None):
    """blocks: list of (echo_lines, output_lines). Draw a terminal window."""
    lines = []  # (text, kind)
    for i, (echo, out) in enumerate(blocks):
        if i:
            lines.append(('', 'out'))
        for e in echo:
            lines.append((e, 'cmd'))
        for o in out:
            lines.append((o, 'err' if o.startswith(('ERROR', 'DETAIL', 'HINT')) else
                          ('pass' if o.startswith('PASS') else 'out')))
    # hard-wrap like a terminal window
    WRAP = WRAP_COLS
    _long = [len(t) for t, k in lines if len(t) > WRAP and k != 'cmd']
    if _long:
        print(f'  [wrap] {name}: {len(_long)} output lines longer than {WRAP} (max {max(_long)})')
    wrapped = []
    for text, kind in lines:
        while len(text) > WRAP:
            wrapped.append((text[:WRAP], kind if kind != 'cmd' else 'cmdcont'))
            text = text[WRAP:]
            kind = kind if kind != 'cmd' else 'cmdcont'
        wrapped.append((text, kind))
    lines = wrapped
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines] + [('  ... (output truncated)', 'out')]
    cw, lh = F.getlength('M'), 34
    width = int(max(F.getlength(t) for t, _ in lines) + 60)
    width = max(width, 900)
    height = 56 + 24 + lh * len(lines) + 24
    img = Image.new('RGB', (width, height), '#1e1f22')
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, width, 52], fill='#2b2d31')
    for k, c in enumerate(('#ff5f57', '#febc2e', '#28c840')):
        d.ellipse([20 + k * 30, 17, 38 + k * 30, 35], fill=c)
    d.text((120, 13), title, font=FT, fill='#c9ccd3')
    y = 56 + 18
    for text, kind in lines:
        if kind == 'cmdcont':
            d.text((30, y), text, font=FB, fill='#ffffff')
        elif kind == 'cmd':
            if text.startswith(PROMPT) or text.startswith(CONT):
                pr = PROMPT if text.startswith(PROMPT) else CONT
                d.text((30, y), pr, font=FB, fill='#6ccf8e')
                d.text((30 + F.getlength(pr), y), text[len(pr):], font=FB, fill='#ffffff')
            else:
                d.text((30, y), '$ ', font=FB, fill='#6ccf8e')
                d.text((30 + F.getlength('$ '), y), text[2:], font=FB, fill='#ffffff')
        else:
            col = {'out': '#d4d7dd', 'err': '#ff7b72', 'pass': '#7ee787'}[kind]
            d.text((30, y), text, font=F, fill=col)
        y += lh
    img.save(os.path.join(OUT, name + '.png'))
    return name


def q(sql):
    return psql(sql)


def scalar(sql):
    p = subprocess.run(['psql', '-X', '-At'] + DB + ['-c', sql], capture_output=True, text=True, env=ENV)
    return p.stdout.strip()


SHOTS = []


def shot(name, title, *blocks, **kw):
    SHOTS.append(render(name, title, list(blocks), **kw))


# ------------------------------------------------------------------ ids used in the demos
HARSH = scalar("SELECT user_id FROM users WHERE email='harsh@campus.edu'")
DIYA = scalar("SELECT user_id FROM users WHERE email='diya@campus.edu'")
POOR_SESSION = scalar("""SELECT session_id FROM sessions WHERE offering_user_id=(SELECT user_id FROM users WHERE email='harsh@campus.edu')
                         AND status='pending' ORDER BY scheduled_time LIMIT 1""")
GUITAR_SESSION = scalar("""SELECT session_id FROM sessions s JOIN skills k USING (skill_id)
                           WHERE k.skill_name='Guitar' AND s.status='confirmed' AND s.scheduled_time < now() LIMIT 1""")
CARNATIC = scalar("SELECT skill_id FROM skills WHERE skill_name='Carnatic Vocals'")

# ------------------------------------------------------------------ 5. DDL
subprocess.run(['psql', '-X', '-q', '-h', 'localhost', '-U', 'skillswap', '-d', 'postgres', '-c',
                'DROP DATABASE IF EXISTS skillswap_ddl_demo', '-c', 'CREATE DATABASE skillswap_ddl_demo'],
               env=ENV, capture_output=True)
DEMO = ['-h', 'localhost', '-U', 'skillswap', '-d', 'skillswap_ddl_demo']
shot('ddl_01_create', 'Terminal — creating the schema (db/01_schema.sql)',
     shell('psql -X -h localhost -U skillswap -d skillswap_ddl_demo -f db/01_schema.sql 2>&1 | grep -v NOTICE',
           'psql -d skillswap_campus -f db/01_schema.sql'))
shot('ddl_02_migrations', 'Terminal — ALTER / DROP migrations (db/02_migrations.sql)',
     shell('psql -X -h localhost -U skillswap -d skillswap_ddl_demo -f db/02_migrations.sql 2>&1 | grep -v NOTICE',
           'psql -d skillswap_campus -f db/02_migrations.sql'))
subprocess.run(['psql', '-X', '-q', '-h', 'localhost', '-U', 'skillswap', '-d', 'postgres', '-c',
                'DROP DATABASE IF EXISTS skillswap_ddl_demo'], env=ENV, capture_output=True)
shot('ddl_03_dt', 'psql — list of tables', q(r'\dt'))
shot('ddl_04_users', 'psql — structure of USERS', q(r'\d users'))
shot('ddl_05_sessions', 'psql — structure of SESSIONS', q(r'\d sessions'))
shot('ddl_06_borrow', 'psql — structure of RESOURCE_BORROW_REQUESTS', q(r'\d resource_borrow_requests'))

# ------------------------------------------------------------------ 6. DML
HASH = scalar("SELECT password_hash FROM users WHERE email='harsh@campus.edu'")
shot('dml_01_insert', 'psql — INSERT statements',
     q("INSERT INTO categories (category_name) VALUES ('Robotics') RETURNING *;"),
     q("INSERT INTO skills (skill_name, category_id)\nVALUES ('ROS Programming', (SELECT category_id FROM categories WHERE category_name='Robotics'))\nRETURNING *;"),
     q(f"INSERT INTO users (full_name, email, password_hash, department)\nVALUES ('Meghana Rao', 'meghana@campus.edu', '{HASH[:22]}...', 'Mechanical')\nRETURNING user_id, full_name, credits_balance;".replace(f"'{HASH[:22]}...'", f"'{HASH}'")),
     q("INSERT INTO user_skills (user_id, skill_id, proficiency_level, is_offering, description)\nVALUES ((SELECT user_id FROM users WHERE email='meghana@campus.edu'),\n        (SELECT skill_id FROM skills WHERE skill_name='ROS Programming'),\n        'intermediate', TRUE, 'ROS 2 nodes, topics and simulation in Gazebo')\nRETURNING user_skill_id, proficiency_level;"),
     q("SELECT user_id, amount, transaction_type FROM credit_transactions\nWHERE user_id = (SELECT user_id FROM users WHERE email='meghana@campus.edu');"))
shot('dml_02_users', 'psql — USERS', q("SELECT user_id, full_name, email, role, left(department, 20) AS department, credits_balance\nFROM users ORDER BY user_id LIMIT 12;"))
shot('dml_03_catalogue', 'psql — CATEGORIES and SKILLS',
     q("SELECT * FROM categories ORDER BY category_id;"),
     q("SELECT skill_id, skill_name, category_id FROM skills ORDER BY skill_id LIMIT 10;"))
shot('dml_04_user_skills', 'psql — USER_SKILLS',
     q("SELECT user_skill_id, user_id, skill_id, proficiency_level, is_offering, left(description, 36) AS description\nFROM user_skills ORDER BY user_skill_id LIMIT 12;"))
shot('dml_05_sessions', 'psql — SESSIONS',
     q("SELECT session_id, offering_user_id AS tutor, requesting_user_id AS learner, skill_id,\n       scheduled_time, duration_minutes AS mins, status, credits_charged AS credits\nFROM sessions ORDER BY session_id LIMIT 12;"))
shot('dml_06_reviews_ledger', 'psql — REVIEWS and CREDIT_TRANSACTIONS',
     q("SELECT review_id, session_id, reviewer_id, reviewee_id, rating, left(comment, 40) AS comment\nFROM reviews ORDER BY review_id LIMIT 6;"),
     q("SELECT transaction_id, user_id, session_id, amount, transaction_type\nFROM credit_transactions ORDER BY transaction_id DESC LIMIT 6;"))
shot('dml_07_resources', 'psql — RESOURCE_LISTINGS and RESOURCE_BORROW_REQUESTS',
     q("SELECT resource_id, owner_id, title, condition, availability_status\nFROM resource_listings ORDER BY resource_id LIMIT 8;"),
     q("SELECT request_id, resource_id, borrower_id, start_date, end_date, status\nFROM resource_borrow_requests ORDER BY request_id DESC LIMIT 6;"))
shot('dml_08_notifications', 'psql — NOTIFICATIONS',
     q("SELECT notification_id, user_id, left(message, 62) AS message, is_read\nFROM notifications ORDER BY notification_id DESC LIMIT 8;"))

# ------------------------------------------------------------------ 7. Queries
shot('q_01_groupby', 'psql — simple query with GROUP BY, HAVING and aggregates',
     q("SELECT c.category_name,\n       COUNT(*)                 AS completed_sessions,\n       SUM(s.credits_charged)   AS credits_exchanged,\n       ROUND(AVG(s.duration_minutes)) AS avg_minutes\nFROM sessions s\nJOIN skills k     ON k.skill_id = s.skill_id\nJOIN categories c ON c.category_id = k.category_id\nWHERE s.status = 'completed'\nGROUP BY c.category_name\nHAVING COUNT(*) >= 3\nORDER BY completed_sessions DESC;"))
shot('q_02_update', 'psql — UPDATE operations',
     q(f"UPDATE users SET department = 'Computer Science (AI & ML)', bio = 'Teaches Python and web development'\nWHERE user_id = {HARSH}\nRETURNING user_id, full_name, department;"),
     q(f"UPDATE sessions SET status = 'confirmed'\nWHERE session_id = {POOR_SESSION}\nRETURNING session_id, status, scheduled_time;"),
     q(f"SELECT user_id, left(message, 60) AS message FROM notifications\nWHERE related_session_id = {POOR_SESSION} ORDER BY notification_id;"))
shot('q_03_delete', 'psql — DELETE operations',
     q(f"DELETE FROM notifications\nWHERE user_id = {HARSH} AND is_read AND created_at < now() - INTERVAL '60 days'\nRETURNING notification_id, left(message, 48) AS message;"),
     q("DELETE FROM skills WHERE skill_name = 'ROS Programming';"),
     q("DELETE FROM categories WHERE category_name = 'Music';"))
shot('q_04_correlated', 'psql — correlated queries',
     q("SELECT u.full_name,\n       (SELECT COUNT(*) FROM sessions s\n         WHERE s.offering_user_id = u.user_id AND s.status = 'completed') AS sessions_taught,\n       (SELECT ROUND(AVG(r.rating), 2) FROM reviews r\n         WHERE r.reviewee_id = u.user_id) AS avg_rating\nFROM users u\nWHERE EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.user_id AND us.is_offering)\nORDER BY sessions_taught DESC\nLIMIT 6;"),
     q("SELECT u.full_name, u.department\nFROM users u\nWHERE NOT EXISTS (SELECT 1 FROM sessions s\n                  WHERE s.requesting_user_id = u.user_id AND s.status = 'completed')\n  AND EXISTS (SELECT 1 FROM user_skills us WHERE us.user_id = u.user_id AND NOT us.is_offering);"))
shot('q_05_nested', 'psql — nested queries',
     q("SELECT full_name, department\nFROM users\nWHERE user_id IN (SELECT user_id FROM user_skills\n                  WHERE is_offering\n                    AND skill_id IN (SELECT skill_id FROM skills\n                                     WHERE category_id = (SELECT category_id FROM categories\n                                                          WHERE category_name = 'Music')));"),
     q("SELECT u.full_name, ROUND(AVG(r.rating), 2) AS avg_rating, COUNT(*) AS reviews\nFROM reviews r JOIN users u ON u.user_id = r.reviewee_id\nGROUP BY u.user_id, u.full_name\nHAVING AVG(r.rating) > (SELECT AVG(rating) FROM reviews) AND COUNT(*) >= 3\nORDER BY avg_rating DESC;"))
shot('q_06_join_window', 'psql — JOIN and window functions',
     q("SELECT rank_position, full_name, sessions_taught, credits_earned, avg_rating\nFROM tutor_leaderboard_view ORDER BY rank_position LIMIT 6;"),
     q(f"SELECT created_at::date AS date, transaction_type, amount,\n       SUM(amount) OVER (ORDER BY created_at, transaction_id) AS running_balance\nFROM credit_transactions WHERE user_id = {HARSH} ORDER BY created_at, transaction_id;"))

# ------------------------------------------------------------------ 8. Procedures, functions, triggers
shot('p_01_routines', 'psql — stored procedures and functions',
     q("SELECT p.proname AS name,\n       CASE p.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS kind,\n       left(pg_get_function_result(p.oid), 62) AS returns\nFROM pg_proc p\nWHERE p.pronamespace = 'public'::regnamespace\n  AND (p.proname LIKE 'sp\\_%' OR p.proname LIKE 'fn\\_%')\n  AND p.prorettype <> 'trigger'::regtype\nORDER BY 2 DESC, 1;"))
shot('p_02_procedure', 'psql — calling the booking procedure',
     q(f"SELECT credits_balance, fn_available_credits(user_id) AS available\nFROM users WHERE user_id = {HARSH};"),
     q(f"CALL sp_book_session({DIYA}, {HARSH}, {CARNATIC}, '2026-12-05 18:00', 60, 10, 'Music Room', NULL);"),
     q(f"CALL sp_book_session({DIYA}, {HARSH}, {CARNATIC}, '2026-12-06 18:00', 240, 40, 'Music Room', NULL);"),
     q(f"SELECT * FROM fn_perfect_swaps({HARSH});"))
shot('t_01_triggers', 'psql — triggers in the database',
     q("SELECT event_object_table AS table_name, trigger_name, action_timing AS timing,\n       string_agg(event_manipulation, ' / ') AS events\nFROM information_schema.triggers\nWHERE trigger_schema = 'public'\nGROUP BY 1, 2, 3 ORDER BY 1, 2;"))
shot('t_02_trigger_rejects', 'psql — triggers and constraints rejecting invalid data',
     q(f"CALL sp_book_session({DIYA}, {HARSH}, {CARNATIC}, '2020-01-01 10:00', 60, 10);"),
     q(f"CALL sp_book_session({DIYA}, {HARSH}, {CARNATIC}, '2026-12-05 18:30', 60, 10);"),
     q(f"UPDATE sessions SET status = 'completed' WHERE session_id = {POOR_SESSION};"),
     q("INSERT INTO users (full_name, email, password_hash)\nVALUES ('Test', 'not-an-email', 'plaintext');"))
shot('t_03_settlement', 'psql — credit settlement trigger (complete a session)',
     q(f"SELECT user_id, full_name, credits_balance FROM users\nWHERE user_id IN (SELECT offering_user_id FROM sessions WHERE session_id = {GUITAR_SESSION}\n                  UNION SELECT requesting_user_id FROM sessions WHERE session_id = {GUITAR_SESSION})\nORDER BY user_id;"),
     q(f"UPDATE sessions SET status = 'completed' WHERE session_id = {GUITAR_SESSION};"),
     q(f"SELECT user_id, full_name, credits_balance FROM users\nWHERE user_id IN (SELECT offering_user_id FROM sessions WHERE session_id = {GUITAR_SESSION}\n                  UNION SELECT requesting_user_id FROM sessions WHERE session_id = {GUITAR_SESSION})\nORDER BY user_id;"),
     q(f"SELECT user_id, amount, transaction_type FROM credit_transactions WHERE session_id = {GUITAR_SESSION};"),
     q("SELECT COUNT(*) AS accounts, SUM(abs(drift)) AS total_drift FROM credit_reconciliation_view;"))

# ------------------------------------------------------------------ 9. Vector database
shot('v_01_extension', 'psql — pgvector extension and embedding table',
     q("SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'btree_gist');"),
     q(r'\d skill_embeddings'))
shot('v_02_vectors', 'psql — stored embeddings',
     q("SELECT user_skill_id, vector_dims(embedding) AS dims,\n       round(vector_norm(embedding)::numeric, 3) AS norm,\n       left(embedding::text, 30) || '...' AS embedding,\n       left(source_text, 30) AS source_text\nFROM skill_embeddings ORDER BY user_skill_id LIMIT 6;"),
     q("SELECT * FROM embedding_coverage_view;"))
shot('v_03_knn', 'psql — k-nearest-neighbour search with the <=> (cosine distance) operator',
     q("SELECT v.full_name, v.skill_name,\n       ROUND((1 - (e.embedding <=> q.embedding))::numeric, 3) AS cosine_similarity\nFROM skill_embeddings q\nJOIN skill_embeddings e      ON e.user_skill_id <> q.user_skill_id\nJOIN available_skills_view v ON v.user_skill_id = e.user_skill_id\nWHERE q.user_skill_id = (SELECT us.user_skill_id FROM user_skills us\n                         JOIN skills s USING (skill_id) JOIN users u USING (user_id)\n                         WHERE u.email = 'ishita@campus.edu' AND s.skill_name = 'Statistics')\nORDER BY e.embedding <=> q.embedding\nLIMIT 5;"))
shot('v_04_recommend', 'psql — semantic recommendations (LATERAL k-NN per wanted skill)',
     q("SELECT r.wanted_skill, v.skill_name AS matched_listing, v.full_name AS tutor, r.similarity\nFROM fn_recommend_tutors((SELECT user_id FROM users WHERE email = 'priya@campus.edu')) r\nJOIN available_skills_view v USING (user_skill_id)\nORDER BY r.similarity DESC;"))
_set = "SET enable_seqscan = off;"
_exp = "EXPLAIN (COSTS OFF)\nSELECT user_skill_id FROM skill_embeddings\nORDER BY embedding <=> (SELECT embedding FROM skill_embeddings LIMIT 1)\nLIMIT 5;"
_p = subprocess.run(['psql', '-X', '-P', 'pager=off', '-v', 'SHOW_CONTEXT=never'] + DB + ['-c', _set, '-c', _exp], capture_output=True, text=True, env=ENV)
_o = _p.stdout.rstrip('\n').split('\n')
shot('v_05_explain', 'psql — HNSW index used for nearest-neighbour search',
     ([PROMPT + _set], [_o[0]]), ([PROMPT + _exp.split('\n')[0]] + [CONT + l for l in _exp.split('\n')[1:]], _o[1:]))
shot('v_06_search_demo', 'Terminal — semantic vs keyword search from Node.js',
     shell('node scripts/search-demo.mjs "sing indian classical music"'))

# ------------------------------------------------------------------ testing
shot('test_01_db', 'Terminal — npm run db:test', shell('node scripts/test-db.mjs', 'npm run db:test'))

print('\n'.join(SHOTS))
