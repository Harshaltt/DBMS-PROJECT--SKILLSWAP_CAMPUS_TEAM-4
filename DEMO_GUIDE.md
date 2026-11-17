# Demo guide: SkillSwap Campus (about 12 minutes)

## Before you walk in (10 minutes earlier)

1. Start the database: `docker compose up -d` (or make sure your local Postgres / Neon is reachable).
2. **`npm run db:setup`**: resets clean demo data. The bookings are relative to "now", so do this on demo day.
3. `npm run dev`, then open http://localhost:3000. Open the pages once so they are compiled (the first load in dev mode is slow).
4. Have three things ready: the browser, a terminal in the project folder, and `docs/er_diagram_chen.pdf` (ER diagram) with `docs/relational_schema.png` (mapped schema).
5. Optional backup: `npm run db:test` in the terminal prints 24/24 PASS. Good if the projector is slow.

---

## The script

### 1. Problem and motivation (1 min) - Harsh
> "Students have skills they could teach and skills they want to learn, but no trusted way to find each other and schedule exchanges. Separately, calculators, kits and textbooks sit idle while others buy the same things. SkillSwap Campus is a skill marketplace with a credit economy plus a lending library. It is not CRUD: it has a two-sided matching problem, a closed credit economy that must never lose a credit, scheduling with hard integrity rules, and free-text data that needs semantic search."

Show the landing page (`/`).

### 2. Design: ER diagram, schema, why two paradigms (2 min) - Harsh
- Open `docs/er_diagram_chen.pdf` (Chen notation: rectangle = entity, double rectangle = weak entity, diamond = relationship, double diamond = identifying relationship, ellipse = attribute, underlined = key, dashed = derived, double line = total participation).
- 12 entities. USER is related to SESSION twice (TEACHES and ATTENDS) and to REVIEW twice (WRITES and RECEIVES). SKILL_EMBEDDING and RESOURCE_EMBEDDING are **weak entities**: they exist only for their listing, identified through the EMBEDS identifying relationship.
- Then open `docs/relational_schema.png`: every 1:N relationship became a foreign key on the N side; the weak entities use the owner's key as both PK and FK; derived attributes (`session_period`, `borrow_period`, `search_vector`) became generated columns.
- **Why SQL:** money-like credits, bookings and loans need ACID, FKs, CHECK / EXCLUDE, triggers.
- **Why vector:** descriptions are free text. "Help with regression for my thesis" must find a Statistics tutor, and keyword search can't do that. pgvector keeps vectors next to the rows, so one SQL query can combine similarity + rating + filters, and `ON DELETE CASCADE` keeps vectors consistent.

### 3. Semantic search: the "wow" moment (2 min) - Chirag
Log in as **Harsh** (button on the login page) → **Find skills**.
1. Type `sing indian classical music` → **Carnatic Vocals** comes top. None of those words are in the listing.
2. Switch to **Keyword**: nothing found. Switch back to **Semantic**/**Hybrid**: found again.
   > "Keyword = PostgreSQL full-text search with a GIN index. Semantic = 384-d MiniLM embeddings, cosine distance `<=>`, HNSW index. Hybrid fuses both rankings with Reciprocal Rank Fusion inside one SQL function, `fn_hybrid_skill_search`."
3. Try `talk to people in Paris` → French.
4. Point at the grey line under the search: it names the SQL function used and the time in ms.

### 4. Booking and integrity: the database says no (2 min) - Harsh
On the Carnatic Vocals result, click **Book session** (the default slot is tomorrow 4 PM):
1. Click **Request** → red error: *"Time clash: one of the two participants is already in session #… at that time"*.
   > "Harsh is *teaching* Neha Python tomorrow at 4. A person can't be in two places in any role. That's our FIX 18 trigger. The original two EXCLUDE constraints only covered tutor-vs-tutor and learner-vs-learner."
2. Change the time to **6 PM** → success. The toast says the tutor was notified (notification trigger).
3. Book the **same tutor** again at **6:30 PM** → *"The tutor already has a session that overlaps this time slot"* with **SQLSTATE 23P01 · sessions_offering_user_id_session_period_excl** under it.
   > "That one is a GiST exclusion constraint on a `tsrange`. No race condition can get past it."
4. Change the date to last year → *"Cannot book a session in the past"* (trigger).

### 5. Credits move atomically (1.5 min) - Harsh
**Sessions** → *Needs action*:
1. Note the credits pill at the top (48).
2. The Guitar session with Rohan has already happened → **Mark completed** → toast says 10 credits moved; the pill drops.
   > "A trigger debits the learner and credits the tutor in one statement, locking both rows in user_id order. That fixed a real deadlock we reproduced in Week 4: 14 deadlocks before the fix, 0 after."
3. **Credits** page: running balance (window function), and **"✓ Balanced"**: the reconciliation view proves balance = sum of ledger.
4. Back on Sessions → **Review** the Japanese session (trigger checks you attended and it's completed).

### 6. Transactions in resource lending (1 min) - Chirag
**Resources → Requests**: two people want the CLRS book for overlapping dates.
**Approve** Neha's → toast: *"1 overlapping request auto-rejected in the same transaction."*
> "Approve = BEGIN → lock the item row FOR UPDATE → approve → reject overlapping pending requests → COMMIT. All or nothing."

### 7. Admin, roles and the DB Lab (2.5 min) - Chirag
Log out → log in as **Admin**.
1. **Analytics**: GROUP BY/HAVING categories, leaderboard with RANK(), demand gaps, ledger integrity, vector coverage.
2. **DB Lab → Run all tests** → **24/24 pass**.
   > "Each test attacks the database (self-review, double booking, plain-text password, corrupt vector…) inside a transaction that is rolled back, so nothing changes."
3. Click a few **Important queries**: *Busiest categories* (HAVING), *Users rated above average* (subquery), *Running balance* (window), *Index proof: HNSW* (EXPLAIN shows `Index Scan using idx_skill_embeddings_hnsw`).
4. SQL console: run `UPDATE users SET credits_balance = 999` → *"cannot execute UPDATE in a read-only transaction"*.
5. **Users**: change a role, deactivate someone. Roles: a student who opens `/admin` is redirected, and the API returns 403. Staff can view but not change.

### 8. Testing and contributions (30 s) - both
- `npm run db:test` → 24/24, `npm run test:api` → 51/51.
- Each member names their own parts (see README → Team contributions).

---

## Viva questions you should be ready for

**Q: Why PostgreSQL + pgvector and not MongoDB / Pinecone?**
Our core data is relational and transactional (credits must balance; bookings must not overlap), so SQL is mandatory. The unstructured part is free-text descriptions, which need similarity search, so a vector store fits. pgvector puts vectors in the same transaction and lets us JOIN similarity with ratings/filters in one query; a separate vector DB would need syncing and could serve stale or deleted listings.

**Q: What exactly is embedded? Which model? What metric?**
The text `"<skill> (<category>), <level>: <description>"` for each skill listing and `"<title> (<category>): <description>"` for each item. Model: all-MiniLM-L6-v2 (sentence-transformers), 384 dimensions, mean-pooled and L2-normalised, run locally with Transformers.js (ONNX). Metric: cosine distance (`<=>`), similarity = 1 − distance. Index: HNSW with `vector_cosine_ops`.

**Q: How are results retrieved?**
The query text is embedded with the same model → `ORDER BY embedding <=> query LIMIT k` (k-NN) → joined with `available_skills_view` for name, rating and filters. Hybrid mode also runs a full-text search and fuses the two rank lists with RRF: score = Σ 1/(60 + rank).

**Q: What if a description changes? Isn't the vector stale?**
The trigger `trg_invalidate_skill_embedding` deletes the vector when description/skill/level changes, and the API re-embeds on save. `npm run db:embed` back-fills anything missing. Test V5 proves it.

**Q: Why HNSW and not IVFFlat?**
HNSW needs no training step (IVFFlat needs data first to build lists), gives better recall/speed, and handles inserts well. Our table grows one listing at a time.

**Q: Show me a transaction.**
`lib/db.mjs → withTransaction()`: BEGIN … COMMIT / ROLLBACK. Used for booking, approving loans (with `SELECT … FOR UPDATE`), granting credits (balance + ledger + notification). Inside the DB, the settlement trigger is atomic with the status update.

**Q: How did you solve the deadlock?**
Two sessions with mirrored participants completing simultaneously locked the two user rows in opposite orders. Fix: lock `LEAST(id)` then `GREATEST(id)` in separate statements (ORDER BY doesn't control lock order), then update both rows in one statement.

**Q: Where is validation at the database level?**
CHECK constraints (email regex, rating 1–5, balance ≥ 0, duration 15–240, ≤ 30-day loans, bcrypt-shaped hash, unit-length vectors), UNIQUE (incl. `lower(email)`), FKs with RESTRICT/CASCADE/SET NULL, EXCLUDE constraints, and triggers for cross-row rules (no past bookings, no cross-role clashes, state machine, reviewer must be a participant, can't borrow your own item). The UI shows the SQLSTATE and constraint name for every rejection.

**Q: Where did you use ALTER and DROP?**
`db/02_migrations.sql`: ADD COLUMN, ADD CONSTRAINT, SET DEFAULT, a UNIQUE expression index, DROP INDEX (the v2 `idx_userskills_user` is redundant because `UNIQUE(user_id, skill_id)` already indexes `user_id` as its leading column). `db/03_features.sql`: DROP PROCEDURE (signature change). `01_schema.sql` starts with DROP TABLE … CASCADE.

**Q: Explain a GROUP BY / HAVING query.**
"Busiest categories": completed sessions joined to skills → categories, LEFT JOIN tutor reviews, `GROUP BY category HAVING COUNT(*) >= 3`. HAVING filters groups after aggregation; WHERE filters rows before.

**Q: Normalisation?**
Tables are in 3NF: categories and skills are separated (skill → category), users' skills are a junction table (`user_skills`), and reviews/ledger reference sessions. The one deliberate denormalisation is `users.credits_balance` (a cached running total for speed). It is protected by triggers and audited by `credit_reconciliation_view`.

**Q: How do roles work?**
`users.role` ∈ {student, staff, admin} (CHECK). The JWT identifies the user; every API call re-reads role and `is_active` from the DB. `route(handler, { roles: ['admin'] })` returns 403 otherwise; `middleware.js` also redirects pages.

**Q: How are passwords and secrets protected?**
bcrypt hashes (and a CHECK that rejects non-hashes), an httpOnly cookie, all SQL parameterised, `.env.local` for DATABASE_URL/JWT_SECRET (git-ignored, never in code).

**Q: Limitations / future work?**
Real campus SSO; e-mail/push notifications; pgvector 0.8 iterative index scans for heavily filtered k-NN; a larger multilingual embedding model (Kannada/Hindi descriptions); recurring sessions; a moderation queue for staff; materialised analytics.
