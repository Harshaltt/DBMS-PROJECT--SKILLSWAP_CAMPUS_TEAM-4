-- =====================================================================
-- SkillSwap Campus - Vector database layer (PostgreSQL + pgvector)
--
-- WHAT is embedded   : the free text of every skill listing
--                      ("<skill> (<category>), <level>: <description>")
--                      and every resource listing ("<title> (<category>): <description>")
-- MODEL              : all-MiniLM-L6-v2 sentence-transformer (Xenova ONNX
--                      build, quantised), run locally in Node.js via
--                      Transformers.js - no API key, no data leaves campus.
-- DIMENSIONS         : 384, mean-pooled and L2-normalised
-- STORAGE            : vector(384) columns in two dedicated tables, 1:1 with
--                      the row they describe (FK + ON DELETE CASCADE)
-- METRIC             : cosine distance  (operator  <=> ),
--                      similarity = 1 - distance
-- INDEX              : HNSW (approximate nearest neighbour), vector_cosine_ops
-- RETRIEVAL          : k-NN on the query embedding, optionally fused with
--                      full-text rank by Reciprocal Rank Fusion (hybrid)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS skill_embeddings, resource_embeddings CASCADE;

-- One embedding per skill listing. Kept in its own table (not a column on
-- user_skills) so that: the relational table stays narrow; embedding
-- metadata (model, source text, timestamp) is documented next to the
-- vector; and the vector store could be moved to a dedicated vector DB
-- later without touching the relational schema.
CREATE TABLE skill_embeddings (
    user_skill_id INT PRIMARY KEY
                      REFERENCES user_skills(user_skill_id) ON DELETE CASCADE,
    embedding     vector(384)  NOT NULL,
    source_text   TEXT         NOT NULL,
    model_name    VARCHAR(100) NOT NULL DEFAULT 'Xenova/all-MiniLM-L6-v2',
    embedded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Integrity for vectors too: the model emits unit vectors. A vector that
    -- is not unit-length came from a different / broken embedding pipeline.
    CONSTRAINT chk_skill_embedding_normalised
        CHECK (abs(vector_norm(embedding) - 1) < 0.01)
);

CREATE TABLE resource_embeddings (
    resource_id   INT PRIMARY KEY
                      REFERENCES resource_listings(resource_id) ON DELETE CASCADE,
    embedding     vector(384)  NOT NULL,
    source_text   TEXT         NOT NULL,
    model_name    VARCHAR(100) NOT NULL DEFAULT 'Xenova/all-MiniLM-L6-v2',
    embedded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_resource_embedding_normalised
        CHECK (abs(vector_norm(embedding) - 1) < 0.01)
);

-- HNSW graph index: sub-linear approximate k-NN search for cosine distance.
CREATE INDEX idx_skill_embeddings_hnsw
    ON skill_embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_resource_embeddings_hnsw
    ON resource_embeddings USING hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------------
-- Staleness protection. If the text an embedding was computed from
-- changes, the old vector no longer describes the row. Rather than serve
-- a wrong match, the trigger deletes the stale vector; the API re-embeds
-- on save and `npm run db:embed` back-fills anything missing.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_invalidate_skill_embedding()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.description       IS DISTINCT FROM OLD.description
    OR NEW.skill_id          IS DISTINCT FROM OLD.skill_id
    OR NEW.proficiency_level IS DISTINCT FROM OLD.proficiency_level THEN
        DELETE FROM skill_embeddings WHERE user_skill_id = NEW.user_skill_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invalidate_skill_embedding
    AFTER UPDATE ON user_skills
    FOR EACH ROW
    EXECUTE FUNCTION fn_invalidate_skill_embedding();

CREATE OR REPLACE FUNCTION fn_invalidate_resource_embedding()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.title       IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.category_id IS DISTINCT FROM OLD.category_id THEN
        DELETE FROM resource_embeddings WHERE resource_id = NEW.resource_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invalidate_resource_embedding
    AFTER UPDATE ON resource_listings
    FOR EACH ROW
    EXECUTE FUNCTION fn_invalidate_resource_embedding();

-- ---------------------------------------------------------------------
-- Pure semantic search: k nearest offered skills to the query vector.
-- The inner ORDER BY <=> ... LIMIT is the shape the HNSW index serves.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_semantic_skill_search(p_embedding vector(384), p_limit INT DEFAULT 10)
RETURNS TABLE (user_skill_id INT, similarity NUMERIC) AS $$
    SELECT se.user_skill_id,
           ROUND((1 - (se.embedding <=> p_embedding))::numeric, 4) AS similarity
    FROM skill_embeddings se
    JOIN user_skills us ON us.user_skill_id = se.user_skill_id
    WHERE us.is_offering
    ORDER BY se.embedding <=> p_embedding
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Hybrid search = semantic k-NN  +  full-text keyword match, fused with
-- Reciprocal Rank Fusion:   score(d) = sum over lists of 1 / (k + rank(d))
-- Keyword search is precise for exact terms ("pandas"); vectors catch
-- meaning ("make websites" -> React tutor). RRF needs no score
-- normalisation because it only uses ranks.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_hybrid_skill_search(p_query TEXT,
                                                  p_embedding vector(384),
                                                  p_limit INT DEFAULT 10,
                                                  p_k INT DEFAULT 60)
RETURNS TABLE (user_skill_id INT, semantic_rank BIGINT, keyword_rank BIGINT,
               similarity NUMERIC, rrf_score NUMERIC) AS $$
    WITH sem AS (
        SELECT n.user_skill_id, n.similarity,
               ROW_NUMBER() OVER (ORDER BY n.similarity DESC) AS rnk
        FROM fn_semantic_skill_search(p_embedding, 50) n
    ),
    kw AS (
        SELECT us.user_skill_id,
               ROW_NUMBER() OVER (ORDER BY ts_rank(us.search_vector,
                                  websearch_to_tsquery('english', p_query)) DESC) AS rnk
        FROM user_skills us
        WHERE us.is_offering
          AND us.search_vector @@ websearch_to_tsquery('english', p_query)
    )
    SELECT COALESCE(sem.user_skill_id, kw.user_skill_id),
           sem.rnk, kw.rnk, sem.similarity,
           ROUND((COALESCE(1.0 / (p_k + sem.rnk), 0)
                + COALESCE(1.0 / (p_k + kw.rnk),  0))::numeric, 5) AS rrf_score
    FROM sem
    FULL OUTER JOIN kw ON kw.user_skill_id = sem.user_skill_id
    ORDER BY rrf_score DESC
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- ---------------------------------------------------------------------
-- Semantic recommendations: for each skill the user WANTS, the 3 closest
-- skills OTHER users OFFER - matched by meaning of the descriptions, not
-- by skill_id. (Someone who wants "help with regression for my thesis"
-- is matched to a Statistics tutor even though they never typed that.)
-- Uses a LATERAL join: a correlated k-NN subquery per wanted skill.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recommend_tutors(p_user_id INT, p_per_want INT DEFAULT 3)
RETURNS TABLE (wanted_skill VARCHAR, user_skill_id INT, similarity NUMERIC) AS $$
    SELECT ws.skill_name, m.user_skill_id, m.similarity
    FROM user_skills w
    JOIN skill_embeddings we ON we.user_skill_id = w.user_skill_id
    JOIN skills ws           ON ws.skill_id     = w.skill_id
    CROSS JOIN LATERAL (
        SELECT se.user_skill_id,
               ROUND((1 - (se.embedding <=> we.embedding))::numeric, 4) AS similarity
        FROM skill_embeddings se
        JOIN user_skills o ON o.user_skill_id = se.user_skill_id
        JOIN users ou      ON ou.user_id      = o.user_id
        WHERE o.is_offering AND o.user_id <> p_user_id AND ou.is_active
        ORDER BY se.embedding <=> we.embedding
        LIMIT p_per_want
    ) m
    WHERE w.user_id = p_user_id AND NOT w.is_offering
    ORDER BY m.similarity DESC;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_semantic_resource_search(p_embedding vector(384), p_limit INT DEFAULT 10)
RETURNS TABLE (resource_id INT, similarity NUMERIC) AS $$
    SELECT re.resource_id,
           ROUND((1 - (re.embedding <=> p_embedding))::numeric, 4) AS similarity
    FROM resource_embeddings re
    ORDER BY re.embedding <=> p_embedding
    LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- How much of the data is searchable semantically right now?
CREATE OR REPLACE VIEW embedding_coverage_view AS
SELECT 'skill listings' AS entity,
       (SELECT COUNT(*) FROM user_skills)      AS total_rows,
       (SELECT COUNT(*) FROM skill_embeddings) AS embedded_rows
UNION ALL
SELECT 'resource listings',
       (SELECT COUNT(*) FROM resource_listings),
       (SELECT COUNT(*) FROM resource_embeddings);
