const { getPool } = require("../lib/db");

module.exports = async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const pool = getPool();

  if (req.method === "GET") {
    return getEvents(req, res, pool);
  }
  if (req.method === "POST") {
    return createEvent(req, res, pool);
  }
  if (req.method === "DELETE") {
    return deleteEvent(req, res, pool);
  }

  return res.status(405).json({ error: "Method not allowed" });
};

async function getEvents(req, res, pool) {
  const { city, limit = 100, offset = 0, since } = req.query;

  let whereClauses = [];
  let params = [];
  let i = 1;

  if (city) {
    whereClauses.push(`city = $${i++}`);
    params.push(city);
  }
  if (since) {
    whereClauses.push(`created_at >= $${i++}`);
    params.push(since);
  }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const { rows } = await pool.query(
    `SELECT * FROM events ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
    [...params, parseInt(limit), parseInt(offset)]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM events ${where}`,
    params
  );

  return res.status(200).json({
    events: rows,
    total: parseInt(countResult.rows[0].count),
  });
}

async function createEvent(req, res, pool) {
  const d = req.body;

  if (!d || !d.event_name || d.total_attendees == null) {
    return res.status(400).json({ error: "event_name and total_attendees are required" });
  }
  if (d.total_co2e_kg == null || d.per_attendee_co2e_kg == null) {
    return res.status(400).json({ error: "total_co2e_kg and per_attendee_co2e_kg are required" });
  }

  const { rows } = await pool.query(
    `INSERT INTO events (
      event_name, event_date, city, organizer, total_attendees, venue_name, event_type,
      travel_walk_bike_pct, travel_transit_pct, travel_ev_carpool_pct,
      travel_gas_car_pct, travel_ridehail_pct, travel_flight_pct,
      local_distance_km, flight_distance_km,
      duration_hours, venue_size_sqft, energy_source,
      catering_provided, food_type, portions, sourcing, packaging,
      landfill_bags, recycling_bags, compost_bags,
      landfill_kg_override, recycling_kg_override, compost_kg_override,
      pages_printed, swag_type, signage_category,
      total_co2e_kg, per_attendee_co2e_kg,
      travel_co2_kg, energy_co2_kg, catering_co2_kg, waste_co2_kg, materials_co2_kg,
      rating, what_worked_well, what_to_improve,
      submitter_name, submitter_email
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,
      $8,$9,$10,$11,$12,$13,$14,$15,
      $16,$17,$18,
      $19,$20,$21,$22,$23,
      $24,$25,$26,$27,$28,$29,
      $30,$31,$32,
      $33,$34,$35,$36,$37,$38,$39,
      $40,$41,$42,
      $43,$44
    ) RETURNING *`,
    [
      d.event_name, d.event_date || null, d.city || null, d.organizer || null,
      parseInt(d.total_attendees), d.venue_name || null, d.event_type || null,
      d.travel_walk_bike_pct ?? null, d.travel_transit_pct ?? null,
      d.travel_ev_carpool_pct ?? null, d.travel_gas_car_pct ?? null,
      d.travel_ridehail_pct ?? null, d.travel_flight_pct ?? null,
      d.local_distance_km ?? null, d.flight_distance_km ?? null,
      d.duration_hours ?? null, d.venue_size_sqft ?? null, d.energy_source || null,
      d.catering_provided ?? null, d.food_type || null,
      d.portions ?? null, d.sourcing || null, d.packaging || null,
      d.landfill_bags ?? null, d.recycling_bags ?? null, d.compost_bags ?? null,
      d.landfill_kg_override ?? null, d.recycling_kg_override ?? null, d.compost_kg_override ?? null,
      d.pages_printed ?? null, d.swag_type || null, d.signage_category || null,
      parseFloat(d.total_co2e_kg), parseFloat(d.per_attendee_co2e_kg),
      d.travel_co2_kg ?? null, d.energy_co2_kg ?? null, d.catering_co2_kg ?? null,
      d.waste_co2_kg ?? null, d.materials_co2_kg ?? null,
      d.rating || null, d.what_worked_well || null, d.what_to_improve || null,
      d.submitter_name || null, d.submitter_email || null,
    ]
  );

  return res.status(201).json({ event: rows[0] });
}

async function deleteEvent(req, res, pool) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "id is required" });

  const { rowCount } = await pool.query("DELETE FROM events WHERE id = $1", [id]);
  if (rowCount === 0) return res.status(404).json({ error: "Event not found" });

  return res.status(200).json({ deleted: id });
}
