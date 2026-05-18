const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
      max: 1, // keep low for serverless (each function instance gets its own)
    });
  }
  return pool;
}

// SQL to create the events table — run once via /api/migrate
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_date DATE,
  city TEXT,
  organizer TEXT,
  total_attendees INTEGER NOT NULL,
  venue_name TEXT,
  event_type TEXT,

  travel_walk_bike_pct NUMERIC,
  travel_transit_pct NUMERIC,
  travel_ev_carpool_pct NUMERIC,
  travel_gas_car_pct NUMERIC,
  travel_ridehail_pct NUMERIC,
  travel_flight_pct NUMERIC,
  local_distance_km NUMERIC,
  flight_distance_km NUMERIC,

  duration_hours NUMERIC,
  venue_size_sqft NUMERIC,
  energy_source TEXT,

  catering_provided BOOLEAN,
  food_type TEXT,
  portions INTEGER,
  sourcing TEXT,
  packaging TEXT,

  landfill_bags INTEGER,
  recycling_bags INTEGER,
  compost_bags INTEGER,
  landfill_kg_override NUMERIC,
  recycling_kg_override NUMERIC,
  compost_kg_override NUMERIC,

  pages_printed INTEGER,
  swag_type TEXT,
  signage_category TEXT,

  total_co2e_kg NUMERIC NOT NULL,
  per_attendee_co2e_kg NUMERIC NOT NULL,
  travel_co2_kg NUMERIC,
  energy_co2_kg NUMERIC,
  catering_co2_kg NUMERIC,
  waste_co2_kg NUMERIC,
  materials_co2_kg NUMERIC,
  rating TEXT,

  what_worked_well TEXT,
  what_to_improve TEXT,

  submitter_name TEXT,
  submitter_email TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_created_at ON events (created_at);
CREATE INDEX IF NOT EXISTS idx_events_city ON events (city);

ALTER TABLE events ADD COLUMN IF NOT EXISTS submitter_name TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS submitter_email TEXT;
`;

module.exports = { getPool, SCHEMA_SQL };
