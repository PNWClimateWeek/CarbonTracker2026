# PNW Climate Week — CO2 Calculator · Project Documentation

**Live URL:** https://pnwcw-sustainabilitytracker.vercel.app  
**GitHub:** https://github.com/PNWClimateWeek/CarbonTracker2026  
**Vercel account:** vancouver-9844s-projects  
**Contact:** hello@pnwclimateweek.org  
**Last updated:** June 2026

---

## 1. Purpose

A web-based carbon footprint calculator for community event organizers in the Pacific Northwest. Organizers submit event details after their event; the tool calculates CO2e emissions across five categories (travel, energy, catering, waste, materials) and stores results in a shared database. A password-protected internal dashboard aggregates submissions for PNW Climate Week team review.

**Target cities:** Seattle, Portland, Tacoma, Bellingham, Bend, Vancouver BC

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML/CSS/JS (no framework) |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Neon PostgreSQL (serverless) |
| Deployment | Vercel (auto-deploy on push to `main`) |
| Event import | Luma API (`/public/v1/event/get`) |
| Hosting repo | GitHub — PNWClimateWeek/CarbonTracker2026 |

---

## 3. File Structure

```
betaone/
├── public/
│   ├── index.html          # Main calculator form (user-facing)
│   └── dashboard.html      # Internal team dashboard (password-gated)
├── api/
│   ├── events.js           # GET / POST / DELETE events
│   ├── dashboard-data.js   # Aggregated dashboard data
│   ├── stats.js            # Weekly stats summary
│   ├── luma-import.js      # Luma event prefill
│   └── migrate.js          # One-time DB schema migration
├── lib/
│   └── db.js               # PostgreSQL pool + schema SQL
├── vercel.json             # Vercel routing + CORS headers
└── package.json            # Dependencies: pg
```

---

## 4. Environment Variables

Set in Vercel dashboard under Project → Settings → Environment Variables.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `DASHBOARD_SECRET` | Key for `/api/dashboard-data` (`pnwcw2026`) |
| `MIGRATION_SECRET` | Bearer token for POST `/api/migrate` |
| `LUMA_API_KEY` | Luma API key for event prefill |

---

## 5. API Endpoints

### `GET /api/events`
Returns stored events. Query params: `city`, `limit`, `offset`, `since`.

### `POST /api/events`
Saves a new event submission. Required fields: `event_name`, `total_attendees`, `total_co2e_kg`, `per_attendee_co2e_kg`.

### `DELETE /api/events?id=<uuid>`
Deletes an event by ID.

### `GET /api/dashboard-data?key=<DASHBOARD_SECRET>`
Returns aggregated summary, by-city breakdown, rating distribution, and full event list. Used by `dashboard.html`.

### `GET /api/stats?since=<ISO date>`
Returns weekly summary stats (event count, attendees, CO2 totals, category breakdown, top cities, rating distribution). Defaults to current Monday.

### `GET /api/luma-import?url=<luma-url>` or `?id=<event-id>`
Fetches event details from Luma API and returns prefill data: event name, date, city, venue, duration, attendees, postal code.

### `POST /api/migrate` _(Bearer token required)_
Applies the database schema (idempotent — uses `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ADD COLUMN IF NOT EXISTS`).

---

## 6. Database Schema

Table: `events` (Neon PostgreSQL)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `event_name` | TEXT | Required |
| `event_date` | DATE | |
| `city` | TEXT | One of the 6 PNW cities |
| `organizer` | TEXT | |
| `total_attendees` | INTEGER | Required |
| `venue_name` | TEXT | |
| `event_type` | TEXT | |
| `travel_walk_bike_pct` | NUMERIC | Local travel mode splits |
| `travel_transit_pct` | NUMERIC | |
| `travel_car_local_pct` | NUMERIC | |
| `travel_local_pct` | NUMERIC | Long-distance: local travel |
| `travel_bus_pct` | NUMERIC | Long-distance: bus |
| `travel_train_pct` | NUMERIC | Long-distance: train |
| `travel_car_long_pct` | NUMERIC | Long-distance: car |
| `travel_flight_pct` | NUMERIC | Long-distance: flight |
| `local_distance_km` | NUMERIC | Avg km to venue (local) |
| `long_distance_km` | NUMERIC | Avg km travelled (long-distance) |
| `flight_distance_km` | NUMERIC | Avg flight distance |
| `duration_hours` | NUMERIC | Event duration |
| `venue_size_sqft` | NUMERIC | |
| `energy_source` | TEXT | Grid EF value used |
| `catering_provided` | BOOLEAN | |
| `food_type` | TEXT | vegan / vegetarian / mixed / meat-heavy |
| `portions` | INTEGER | Number of meals served |
| `sourcing` | TEXT | local / mixed / conventional |
| `packaging` | TEXT | reusable / mixed / single-use |
| `landfill_bags` | INTEGER | |
| `recycling_bags` | INTEGER | |
| `compost_bags` | INTEGER | |
| `landfill_kg_override` | NUMERIC | Manual weight override |
| `recycling_kg_override` | NUMERIC | |
| `compost_kg_override` | NUMERIC | |
| `pages_printed` | INTEGER | |
| `swag_type` | TEXT | |
| `signage_category` | TEXT | |
| `total_co2e_kg` | NUMERIC | Required — computed by frontend |
| `per_attendee_co2e_kg` | NUMERIC | Required — computed by frontend |
| `travel_co2_kg` | NUMERIC | Category breakdown |
| `energy_co2_kg` | NUMERIC | |
| `catering_co2_kg` | NUMERIC | |
| `waste_co2_kg` | NUMERIC | |
| `materials_co2_kg` | NUMERIC | |
| `rating` | TEXT | Exemplary / Good effort / Average / Below average / Needs improvement |
| `what_worked_well` | TEXT | |
| `what_to_improve` | TEXT | |
| `submitter_name` | TEXT | |
| `submitter_email` | TEXT | |
| `sustainability_initiatives` | TEXT | |
| `sdgs` | TEXT | JSON array of SDG numbers |
| `event_partners` | TEXT | JSON array of {name, category} |
| `swag_description` | TEXT | |
| `products_sold` | TEXT | |
| `created_at` | TIMESTAMPTZ | Auto-set to NOW() |

Indexes: `idx_events_created_at`, `idx_events_city`

---

## 7. Emission Factors & Methodology

All CO2e calculations are performed client-side in `index.html` before submission.

### Travel

| Mode | EF | Unit | Source |
|---|---|---|---|
| Bus (long distance, USA) | 0.044 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 |
| Car (USA) | 0.191 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 — Passenger Car |
| Flight (international) | 0.255 | kg CO2e / km / person | DEFRA 2023 (UK) |
| Train — USA national avg | 0.071 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 — Inter-City Rail |
| Train — BC, Canada (VIA Rail through Rockies) | 0.20 | kg CO2e / km / person | VIA Rail long-distance diesel service; elevated due to low occupancy on Canadian routes |
| Local transit (USA avg) | 0.062 | kg CO2e / km / person | EPA 2025 avg of: Bus 0.044, Commuter Rail 0.083, Transit Rail 0.058 |
| Local transit — BC, Canada | 0.008 | kg CO2e / km / person | Derived from TransLink Climate Action per-trip emissions data (2023) and renewable diesel transition figures (2024), converted to per-km using estimated 8 km avg trip distance |

**Regional logic:** Train uses BC-specific factor when event postal code starts with `V` (BC Canada); USA national average otherwise. Local transit uses USA national average for all regions.

All trips are assumed **round-trip** (distance × 2).

### Energy

| Source | EF | Unit | Source |
|---|---|---|---|
| WA/OR grid (NWPP, USA) | 0.288 | kg CO2e / kWh | EPA eGRID 2024 |
| BC grid / BC Hydro (Canada) | 0.018 | kg CO2e / kWh | Environment and Climate Change Canada / OBPS 2026 |
| Diesel generator (USA) | 0.200 | kg CO2e / kWh | EPA GHG Emission Factors Hub 2025 |

Venue load assumed at **2 W/sq ft** (ASHRAE 90.1 typical assembly occupancy).  
Formula: `energy_co2 = venue_size_sqft × 2W × duration_hours / 1000 × grid_ef`

### Catering

| Type | EF | Unit | Source |
|---|---|---|---|
| Vegan | 0.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Vegetarian | 1.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Mixed | 2.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Meat-heavy | 5.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |

Formula: `catering_co2 = portions × food_ef`

### Waste

Bag weight assumed: **12 kg/bag** (EPA WARM v16 default, USA)

| Stream | EF | Unit | Source |
|---|---|---|---|
| Landfill | 0.639 | kg CO2e / kg waste | EPA WARM v16 — Mixed MSW (USA) |
| Recycling | 0.099 | kg CO2e / kg waste | EPA WARM v16 — Mixed Recyclables (USA) |
| Compost | 0.143 | kg CO2e / kg waste | EPA WARM v16 — Mixed Organics (USA) |

Formula: `waste_co2 = (landfill_bags × 12 × 0.639) + (recycling_bags × 12 × 0.099) + (compost_bags × 12 × 0.143)`  
Weight overrides accepted if organizer has scale measurements.

### Materials

| Item | EF | Unit | Source |
|---|---|---|---|
| Pages printed | 0.005 | kg CO2e / page | GHG Protocol (2023, international) |

---

## 8. Frontend Features (index.html)

- **Luma prefill:** Paste a Luma event URL → auto-fills event name, date, city, venue, duration, attendees, postal code
- **Live CO2 estimate:** Recalculates on every input change, displayed before submission
- **Travel validation:** Long-distance and local mode percentages must each sum to 100%
- **Regional energy defaults:** Auto-sets BC Hydro grid factor when city = Vancouver BC
- **SDG tagging:** Multi-select chips for UN Sustainable Development Goals
- **Event partners:** Dynamic rows — partner name + category (Waste, Energy, Catering, Transportation, Other)
- **Sustainability initiatives, wins, areas to improve:** Free-text reflection fields
- **Swag & products:** What was given away as swag; whether products were sold and what
- **Ratings:** Self-assessed (Exemplary → Needs improvement)
- **Feedback link:** hello@pnwclimateweek.org in header and footer

---

## 9. Dashboard (dashboard.html)

**Password:** `pnwcw2026` (client-side gate + `DASHBOARD_SECRET` on API)  
Stored in `sessionStorage` so re-entry not required on refresh.

**Shows:**
- Summary stats: event count, total attendees, total CO2e, avg per person
- CO2e breakdown by category (bar chart)
- By-city table
- Ratings distribution
- Full event table with export to CSV
- ⚠️ Flagged events (Below average / Needs improvement ratings)

---

## 10. Deployment

Auto-deploys to Vercel on every push to `main` branch of `PNWClimateWeek/CarbonTracker2026`.

**To run locally:**
```bash
npm install
vercel dev
```

**To apply DB schema (first time or after schema changes):**
```bash
curl -X POST https://pnwcw-sustainabilitytracker.vercel.app/api/migrate \
  -H "Authorization: Bearer <MIGRATION_SECRET>"
```

---

## 11. Known Issues / Open Items

- **BC train EF (0.032):** Derived from BC Hydro grid intensity applied to electric rail — not a directly published per-passenger-km rail figure. Should be replaced with a VIA Rail Canada or TransLink published figure when available.
- **Luma postal code:** Pulled from `geo_address_info.postal_code / .zip_code / .zip` or regex on `full_address`. Falls back to manual entry. Cannot confirm exact Luma field name without live API key.
- **Attendee ZIP for transit EFs:** Currently uses event location zip as proxy. Proper implementation would use `GET /public/v1/event/get-guests` to pull individual attendee ZIP answers from Luma registration questions and compute a weighted regional average. Requires API key to test field names.
- **Catering EFs:** Poore & Nemecek (2018) figures are per-kg-of-food, adapted to per-meal — not a direct per-meal published figure.
