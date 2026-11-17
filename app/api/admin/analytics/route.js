import { route, json } from '@/lib/api';
import { query } from '@/lib/db.mjs';

// GET /api/admin/analytics (staff + admin)
export const GET = route(async () => {
  const [kpi, monthly, categories, demand, leaders, recon, depts, coverage] = await Promise.all([
    query(`SELECT
        (SELECT COUNT(*) FROM users WHERE is_active)                               AS active_users,
        (SELECT COUNT(*) FROM users WHERE role = 'student')                        AS students,
        (SELECT COUNT(*) FROM user_skills WHERE is_offering)                       AS skills_offered,
        (SELECT COUNT(*) FROM user_skills WHERE NOT is_offering)                   AS skills_wanted,
        (SELECT COUNT(*) FROM sessions WHERE status = 'completed')                 AS sessions_completed,
        (SELECT COUNT(*) FROM sessions WHERE status IN ('pending','confirmed')
                                         AND scheduled_time > CURRENT_TIMESTAMP)   AS sessions_upcoming,
        (SELECT COALESCE(SUM(credits_charged), 0) FROM sessions WHERE status = 'completed') AS credits_circulated,
        (SELECT ROUND(AVG(rating), 2) FROM reviews)                                AS avg_rating,
        (SELECT COUNT(*) FROM resource_borrow_requests WHERE status = 'returned')  AS loans_completed,
        (SELECT COUNT(*) FROM resource_listings WHERE availability_status = 'borrowed') AS items_out`),
    query(`WITH months AS (
             SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                                    date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS month)
           SELECT to_char(m.month, 'Mon YYYY') AS label,
                  COUNT(s.session_id) FILTER (WHERE s.status = 'completed') AS completed,
                  COUNT(s.session_id) FILTER (WHERE s.status = 'cancelled') AS cancelled,
                  COALESCE(SUM(s.credits_charged) FILTER (WHERE s.status = 'completed'), 0) AS credits
             FROM months m
             LEFT JOIN sessions s ON date_trunc('month', s.scheduled_time) = m.month
            GROUP BY m.month ORDER BY m.month`),
    query(`SELECT c.category_name, COUNT(*) AS completed, SUM(s.credits_charged) AS credits,
                  ROUND(AVG(r.rating), 2) AS avg_rating
             FROM sessions s
             JOIN skills sk ON sk.skill_id = s.skill_id
             JOIN categories c ON c.category_id = sk.category_id
             LEFT JOIN reviews r ON r.session_id = s.session_id AND r.reviewee_id = s.offering_user_id
            WHERE s.status = 'completed'
            GROUP BY c.category_name
           HAVING COUNT(*) >= 2
            ORDER BY completed DESC`),
    query(`SELECT skill_name, category_name, tutors, learners, demand_gap
             FROM skill_demand_view WHERE learners > 0
            ORDER BY demand_gap DESC, learners DESC LIMIT 8`),
    query(`SELECT rank_position, full_name, department, sessions_taught, credits_earned, avg_rating, review_count
             FROM tutor_leaderboard_view ORDER BY rank_position, full_name LIMIT 8`),
    query(`SELECT COUNT(*) AS accounts, COUNT(*) FILTER (WHERE drift <> 0) AS drifting,
                  COALESCE(SUM(abs(drift)), 0) AS total_drift, SUM(credits_balance) AS credits_in_wallets
             FROM credit_reconciliation_view`),
    query(`SELECT COALESCE(u.department, 'Unspecified') AS department, COUNT(DISTINCT u.user_id) AS members,
                  COUNT(s.session_id) AS sessions_taught
             FROM users u
             LEFT JOIN sessions s ON s.offering_user_id = u.user_id AND s.status = 'completed'
            WHERE u.role = 'student'
            GROUP BY u.department ORDER BY sessions_taught DESC, members DESC`),
    query('SELECT * FROM embedding_coverage_view'),
  ]);
  return json({
    kpi: kpi.rows[0], monthly: monthly.rows, categories: categories.rows, demand: demand.rows,
    leaders: leaders.rows, reconciliation: recon.rows[0], departments: depts.rows, coverage: coverage.rows,
  });
}, { roles: ['admin', 'staff'] });
