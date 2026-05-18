const { getPool } = require("../lib/db");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { since } = req.query;
  const pool = getPool();

  // Default to current week (Monday–Sunday)
  const weekStart = since || getWeekStart();

  const [totals, breakdown, topCities, ratings] = await Promise.all([
    pool.query(
      `SELECT
        COUNT(*)::int                          AS event_count,
        COALESCE(SUM(total_attendees), 0)::int AS total_attendees,
        COALESCE(AVG(per_attendee_co2e_kg), 0) AS avg_per_attendee_co2e_kg,
        COALESCE(SUM(total_co2e_kg), 0)        AS total_co2e_kg
       FROM events
       WHERE created_at >= $1`,
      [weekStart]
    ),
    pool.query(
      `SELECT
        COALESCE(AVG(travel_co2_kg),    0) AS avg_travel_co2_kg,
        COALESCE(AVG(energy_co2_kg),    0) AS avg_energy_co2_kg,
        COALESCE(AVG(catering_co2_kg),  0) AS avg_catering_co2_kg,
        COALESCE(AVG(waste_co2_kg),     0) AS avg_waste_co2_kg,
        COALESCE(AVG(materials_co2_kg), 0) AS avg_materials_co2_kg
       FROM events
       WHERE created_at >= $1`,
      [weekStart]
    ),
    pool.query(
      `SELECT city, COUNT(*)::int AS event_count, SUM(total_attendees)::int AS total_attendees
       FROM events
       WHERE created_at >= $1 AND city IS NOT NULL
       GROUP BY city
       ORDER BY event_count DESC
       LIMIT 10`,
      [weekStart]
    ),
    pool.query(
      `SELECT rating, COUNT(*)::int AS count
       FROM events
       WHERE created_at >= $1 AND rating IS NOT NULL
       GROUP BY rating`,
      [weekStart]
    ),
  ]);

  return res.status(200).json({
    week_start: weekStart,
    summary: {
      event_count: totals.rows[0].event_count,
      total_attendees: totals.rows[0].total_attendees,
      avg_per_attendee_co2e_kg: round(totals.rows[0].avg_per_attendee_co2e_kg),
      total_co2e_kg: round(totals.rows[0].total_co2e_kg),
    },
    avg_category_breakdown: {
      travel: round(breakdown.rows[0].avg_travel_co2_kg),
      energy: round(breakdown.rows[0].avg_energy_co2_kg),
      catering: round(breakdown.rows[0].avg_catering_co2_kg),
      waste: round(breakdown.rows[0].avg_waste_co2_kg),
      materials: round(breakdown.rows[0].avg_materials_co2_kg),
    },
    cities: topCities.rows,
    rating_distribution: ratings.rows,
  });
};

function getWeekStart() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? 6 : day - 1; // shift so Monday = 0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

function round(n) {
  return Math.round(parseFloat(n) * 100) / 100;
}
