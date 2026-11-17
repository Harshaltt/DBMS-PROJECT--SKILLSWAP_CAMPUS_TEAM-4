// =====================================================================
// Local sentence embeddings for the vector database layer.
// Model : all-MiniLM-L6-v2 (Xenova ONNX build, 8-bit quantised, 384 dims)
// Where : vendored in ./models, loaded fully OFFLINE through Transformers.js
// Output: mean-pooled, L2-normalised Float32 vectors -> stored in pgvector
// =====================================================================
import path from 'node:path';

export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMS = 384;

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.localModelPath = path.join(process.cwd(), 'models') + path.sep;
      env.allowRemoteModels = process.env.ALLOW_REMOTE_MODELS === 'true';
      env.allowLocalModels = true;
      return pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' });
    })().catch((err) => {
      extractorPromise = null; // allow a retry on the next call
      throw err;
    });
  }
  return extractorPromise;
}

/** Embed an array of strings -> array of number[384] (unit length). */
export async function embedMany(texts) {
  if (!texts.length) return [];
  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

export async function embedOne(text) {
  const [v] = await embedMany([text]);
  return v;
}

/** pgvector text literal: '[0.1,0.2,...]' */
export function toPgVector(v) {
  return '[' + v.map((x) => Number(x).toFixed(6)).join(',') + ']';
}

/** The exact text that represents a skill listing in vector space. */
export function skillSourceText({ skill_name, category_name, proficiency_level, description }) {
  return `${skill_name} (${category_name}), ${proficiency_level} level: ${description || ''}`.trim();
}

/** The exact text that represents a resource listing in vector space. */
export function resourceSourceText({ title, category_name, description }) {
  return `${title} (${category_name || 'General'}): ${description || ''}`.trim();
}

/** (Re)compute and store the embedding of one skill listing. */
export async function upsertSkillEmbedding(db, userSkillId) {
  const { rows } = await db.query(
    `SELECT s.skill_name, c.category_name, us.proficiency_level, us.description
       FROM user_skills us
       JOIN skills s     ON s.skill_id = us.skill_id
       JOIN categories c ON c.category_id = s.category_id
      WHERE us.user_skill_id = $1`,
    [userSkillId]
  );
  if (!rows.length) return false;
  const text = skillSourceText(rows[0]);
  const vec = await embedOne(text);
  await db.query(
    `INSERT INTO skill_embeddings (user_skill_id, embedding, source_text, model_name)
     VALUES ($1, $2::vector, $3, $4)
     ON CONFLICT (user_skill_id) DO UPDATE
        SET embedding = EXCLUDED.embedding, source_text = EXCLUDED.source_text,
            model_name = EXCLUDED.model_name, embedded_at = CURRENT_TIMESTAMP`,
    [userSkillId, toPgVector(vec), text, EMBEDDING_MODEL]
  );
  return true;
}

/** (Re)compute and store the embedding of one resource listing. */
export async function upsertResourceEmbedding(db, resourceId) {
  const { rows } = await db.query(
    `SELECT r.title, r.description, c.category_name
       FROM resource_listings r
       LEFT JOIN categories c ON c.category_id = r.category_id
      WHERE r.resource_id = $1`,
    [resourceId]
  );
  if (!rows.length) return false;
  const text = resourceSourceText(rows[0]);
  const vec = await embedOne(text);
  await db.query(
    `INSERT INTO resource_embeddings (resource_id, embedding, source_text, model_name)
     VALUES ($1, $2::vector, $3, $4)
     ON CONFLICT (resource_id) DO UPDATE
        SET embedding = EXCLUDED.embedding, source_text = EXCLUDED.source_text,
            model_name = EXCLUDED.model_name, embedded_at = CURRENT_TIMESTAMP`,
    [resourceId, toPgVector(vec), text, EMBEDDING_MODEL]
  );
  return true;
}

/** Back-fill every row that has no embedding yet (used by setup + npm run db:embed). */
export async function embedAllMissing(db, log = () => {}) {
  const skills = await db.query(
    `SELECT us.user_skill_id, s.skill_name, c.category_name, us.proficiency_level, us.description
       FROM user_skills us
       JOIN skills s     ON s.skill_id = us.skill_id
       JOIN categories c ON c.category_id = s.category_id
      WHERE NOT EXISTS (SELECT 1 FROM skill_embeddings e WHERE e.user_skill_id = us.user_skill_id)
      ORDER BY us.user_skill_id`
  );
  const resources = await db.query(
    `SELECT r.resource_id, r.title, r.description, c.category_name
       FROM resource_listings r
       LEFT JOIN categories c ON c.category_id = r.category_id
      WHERE NOT EXISTS (SELECT 1 FROM resource_embeddings e WHERE e.resource_id = r.resource_id)
      ORDER BY r.resource_id`
  );
  const BATCH = 16;
  for (let i = 0; i < skills.rows.length; i += BATCH) {
    const batch = skills.rows.slice(i, i + BATCH);
    const texts = batch.map(skillSourceText);
    const vecs = await embedMany(texts);
    for (let j = 0; j < batch.length; j++) {
      await db.query(
        `INSERT INTO skill_embeddings (user_skill_id, embedding, source_text, model_name)
         VALUES ($1, $2::vector, $3, $4) ON CONFLICT (user_skill_id) DO NOTHING`,
        [batch[j].user_skill_id, toPgVector(vecs[j]), texts[j], EMBEDDING_MODEL]
      );
    }
  }
  for (let i = 0; i < resources.rows.length; i += BATCH) {
    const batch = resources.rows.slice(i, i + BATCH);
    const texts = batch.map(resourceSourceText);
    const vecs = await embedMany(texts);
    for (let j = 0; j < batch.length; j++) {
      await db.query(
        `INSERT INTO resource_embeddings (resource_id, embedding, source_text, model_name)
         VALUES ($1, $2::vector, $3, $4) ON CONFLICT (resource_id) DO NOTHING`,
        [batch[j].resource_id, toPgVector(vecs[j]), texts[j], EMBEDDING_MODEL]
      );
    }
  }
  log(`  embedded ${skills.rows.length} skill listings and ${resources.rows.length} resource listings`);
  return { skills: skills.rows.length, resources: resources.rows.length };
}
