const { getPool } = require('../lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.query;
  if (!process.env.DASHBOARD_SECRET || key !== process.env.DASHBOARD_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const pool = getPool();

  const [summary, byCity, byRating, events] = await Promise.all([
    pool.query(`
      SELECT
        COUNT(*)::int                          AS event_count,
        COALESCE(SUM(total_attendees), 0)::int AS total_attendees,
        COALESCE(SUM(total_co2e_kg), 0)        AS total_co2e_kg,
        COALESCE(AVG(per_attendee_co2e_kg), 0) AS avg_per_attendee_co2e_kg,
        COALESCE(AVG(travel_co2_kg), 0)        AS avg_travel,
        COALESCE(AVG(energy_co2_kg), 0)        AS avg_energy,
        COALESCE(AVG(catering_co2_kg), 0)      AS avg_catering,
        COALESCE(AVG(waste_co2_kg), 0)         AS avg_waste,
        COALESCE(AVG(materials_co2_kg), 0)     AS avg_materials
      FROM events
    `),
    pool.query(`
      SELECT
        city,
        COUNT(*)::int                          AS event_count,
        COALESCE(SUM(total_attendees), 0)::int AS total_attendees,
        COALESCE(AVG(per_attendee_co2e_kg), 0) AS avg_per_attendee,
        COALESCE(SUM(total_co2e_kg), 0)        AS total_co2e_kg
      FROM events
      WHERE city IS NOT NULL
      GROUP BY city
      ORDER BY avg_per_attendee ASC
    `),
    pool.query(`
      SELECT rating, COUNT(*)::int AS count
      FROM events
      WHERE rating IS NOT NULL
      GROUP BY rating
      ORDER BY count DESC
    `),
    pool.query(`
      SELECT
        id, event_name, event_date, city, organizer, total_attendees,
        venue_name, event_type, per_attendee_co2e_kg, total_co2e_kg,
        travel_co2_kg, energy_co2_kg, catering_co2_kg, waste_co2_kg, materials_co2_kg,
        rating, submitter_name, submitter_email, what_worked_well, what_to_improve,
        sustainability_initiatives,
        luma_event_id, avg_long_dist_km, avg_local_dist_km, attendee_regions,
        luma_csv_url, created_at
      FROM events
      ORDER BY per_attendee_co2e_kg ASC
    `)
  ]);

  return res.status(200).json({
    summary: summary.rows[0],
    by_city: byCity.rows,
    by_rating: byRating.rows,
    events: events.rows,
  });
};
