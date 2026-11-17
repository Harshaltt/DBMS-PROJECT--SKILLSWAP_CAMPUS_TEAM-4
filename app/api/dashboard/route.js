import { route, json } from '@/lib/api';
import { query } from '@/lib/db.mjs';

// GET /api/dashboard -> everything the home page needs, fetched in parallel
export const GET = route(async ({ user }) => {
  const id = user.user_id;
  const [stats, upcoming, todo, swaps, recs, leaders] = await Promise.all([
    query(
      `SELECT u.credits_balance, fn_available_credits(u.user_id) AS available_credits,
              (SELECT COUNT(*) FROM sessions WHERE offering_user_id = u.user_id AND status = 'completed')   AS taught,
              (SELECT COUNT(*) FROM sessions WHERE requesting_user_id = u.user_id AND status = 'completed') AS learned,
              (SELECT ROUND(AVG(rating), 2) FROM reviews WHERE reviewee_id = u.user_id) AS avg_rating,
              (SELECT COUNT(*) FROM reviews WHERE reviewee_id = u.user_id) AS review_count,
              (SELECT COUNT(*) FROM user_skills WHERE user_id = u.user_id AND is_offering) AS teaching,
              (SELECT COUNT(*) FROM user_skills WHERE user_id = u.user_id AND NOT is_offering) AS learning
         FROM users u WHERE u.user_id = $1`, [id]),
    query(
      `SELECT s.session_id, s.scheduled_time, s.duration_minutes, s.status, s.location, sk.skill_name,
              (s.offering_user_id = $1) AS i_am_tutor,
              CASE WHEN s.offering_user_id = $1 THEN l.full_name ELSE t.full_name END AS counterpart
         FROM sessions s
         JOIN skills sk ON sk.skill_id = s.skill_id
         JOIN users t ON t.user_id = s.offering_user_id
         JOIN users l ON l.user_id = s.requesting_user_id
        WHERE $1 IN (s.offering_user_id, s.requesting_user_id)
          AND s.status IN ('pending', 'confirmed') AND s.scheduled_time > CURRENT_TIMESTAMP
        ORDER BY s.scheduled_time LIMIT 5`, [id]),
    query(
      `SELECT
         (SELECT COUNT(*) FROM sessions WHERE offering_user_id = $1 AND status = 'pending'
             AND scheduled_time > CURRENT_TIMESTAMP)                                              AS to_confirm,
         (SELECT COUNT(*) FROM sessions WHERE requesting_user_id = $1 AND status = 'confirmed'
             AND scheduled_time <= CURRENT_TIMESTAMP)                                             AS to_complete,
         (SELECT COUNT(*) FROM sessions s WHERE $1 IN (s.offering_user_id, s.requesting_user_id)
             AND s.status = 'completed'
             AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.session_id = s.session_id AND r.reviewer_id = $1)) AS to_review,
         (SELECT COUNT(*) FROM resource_borrow_requests b JOIN resource_listings r USING (resource_id)
           WHERE r.owner_id = $1 AND b.status = 'pending')                                        AS borrow_requests`, [id]),
    query('SELECT * FROM fn_perfect_swaps($1)', [id]),
    query(
      // DISTINCT ON keeps each tutor listing once (its best-matching wish)
      `SELECT * FROM (
         SELECT DISTINCT ON (v.user_skill_id)
                r.wanted_skill, r.similarity, v.user_skill_id, v.user_id, v.full_name, v.department,
                v.skill_id, v.skill_name, v.proficiency_level, v.avg_rating, v.review_count, v.description
           FROM fn_recommend_tutors($1, 3) r
           JOIN available_skills_view v ON v.user_skill_id = r.user_skill_id
          ORDER BY v.user_skill_id, r.similarity DESC) best
        ORDER BY similarity DESC
        LIMIT 6`, [id]),
    query(`SELECT user_id, full_name, department, sessions_taught, avg_rating, rank_position
             FROM tutor_leaderboard_view ORDER BY rank_position, full_name LIMIT 5`),
  ]);
  return json({
    stats: stats.rows[0], upcoming: upcoming.rows, todo: todo.rows[0],
    swaps: swaps.rows, recommendations: recs.rows, leaders: leaders.rows,
  });
});
