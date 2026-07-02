# PNW Climate Week — CO2 Calculator · Project Documentation

**Live URL:** https://pnwcw-sustainabilitytracker.vercel.app  
**GitHub:** https://github.com/PNWClimateWeek/CarbonTracker2026  
**Vercel account:** vancouver-9844s-projects  
**Contact:** hello@pnwclimateweek.org  
**Last updated:** July 2026

---

## 1. Purpose

A web-based carbon footprint calculator for community event organizers in the Pacific Northwest. Organizers submit event details after their event; the tool calculates CO2e emissions across five categories (travel, energy, catering, waste, printed materials) and stores results in a shared database. A password-protected internal dashboard aggregates submissions for PNW Climate Week team review.

Individual event emissions are not shared publicly — results are aggregated across all submissions and reported at the Climate Week level only.

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
| Attendee travel | Luma API (`/public/v1/event/get-guests`) |
| Distance calc | Bundled zip/postal centroid lookup + haversine (no external API) |
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
│   ├── luma-travel.js      # Per-attendee travel emissions from Luma guests
│   └── migrate.js          # One-time DB schema migration
├── lib/
│   ├── db.js               # PostgreSQL pool + schema SQL
│   └── geo.js              # Haversine distance + zip/postal → coordinates lookup
├── vercel.json             # Vercel routing + CORS headers
└── package.json            # Dependencies: pg
```

---

## 4. Environment Variables

Set in Vercel dashboard (Production + Preview + Development).

| Variable | Purpose | Status |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | Set |
| `DASHBOARD_SECRET` | Key for `/api/dashboard-data` (`pnwcw2026`) | Set |
| `MIGRATION_SECRET` | Bearer token for POST `/api/migrate` | Set |
| `LUMA_API_KEY` | Luma API key for event prefill and attendee travel | Set July 2026 |

**LUMA_API_KEY note:** This key is scoped to the PNW Climate Week org calendar (`cal-2fOrFiMnHYEI0bL`). It can access events created under that calendar. Personal calendar events (e.g. organizer's own Luma account) return a 403 — `luma-import.js` falls back to page scraping automatically in that case.

---

## 5. API Endpoints

### `GET /api/events`
Returns stored events. Query params: `city`, `limit`, `offset`, `since`.

### `POST /api/events`
Saves a new event submission. Required fields: `event_name`, `total_attendees`, `total_co2e_kg`, `per_attendee_co2e_kg`. Also accepts `luma_event_id` for linking to Luma attendee data.

### `DELETE /api/events?id=<uuid>`
Deletes an event by ID.

### `GET /api/dashboard-data?key=<DASHBOARD_SECRET>`
Returns aggregated summary, by-city breakdown, rating distribution, and full event list including Luma distance fields. Used by `dashboard.html`.

### `GET /api/stats?since=<ISO date>`
Returns weekly summary stats (event count, attendees, CO2 totals, category breakdown, top cities, rating distribution). Defaults to current Monday.

### `GET /api/luma-import?url=<luma-url>` or `?id=<event-id>`
Fetches event details and returns prefill data: event name, date, city, host/organizer, venue, duration, attendees, postal code. Uses API if `LUMA_API_KEY` is set and has access; falls back to page scraping (`__NEXT_DATA__` → JSON-LD → Open Graph) for personal calendar events or when key is absent.

### `GET /api/luma-travel?event_id=<id>` or `?url=<luma-url>`
Fetches all attendees from Luma, reads each person's zip code and travel mode from registration answers, calculates actual haversine distance from their zip to the event location, and returns total travel CO2e, average distances, mode breakdown, and region breakdown.

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
| `travel_local_pct` | NUMERIC | Long-distance: local/N/A |
| `travel_bus_pct` | NUMERIC | Long-distance: bus |
| `travel_train_pct` | NUMERIC | Long-distance: train |
| `travel_car_long_pct` | NUMERIC | Long-distance: car |
| `travel_flight_pct` | NUMERIC | Long-distance: flight |
| `local_distance_km` | NUMERIC | Default 8 km (hardcoded) |
| `long_distance_km` | NUMERIC | Default 300 km (hardcoded) |
| `flight_distance_km` | NUMERIC | Default 500 km (hardcoded) |
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
| `luma_event_id` | TEXT | Stored on import; links event to Luma attendee data |
| `avg_long_dist_km` | NUMERIC | Populated by luma-travel — avg haversine distance per attendee |
| `avg_local_dist_km` | NUMERIC | Populated by luma-travel — avg local trip distance |
| `attendee_regions` | TEXT | JSON object — region breakdown from luma-travel |
| `created_at` | TIMESTAMPTZ | Auto-set to NOW() |

Indexes: `idx_events_created_at`, `idx_events_city`

---

## 7. Emission Factors & Methodology

All CO2e calculations are performed client-side in `index.html` before submission. EFs adjust by attendee zip/postal code: Canadian postal codes (any letter prefix) use VIA Rail for train; BC postal codes (V-prefix) also use TransLink for local transit. US zips use EPA national averages.

All trips assumed **round-trip** (distance × 2).

### Travel — EFs

| Mode | EF | Unit | Source |
|---|---|---|---|
| Bus (long distance, USA) | 0.044 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 (USA) |
| Car (USA) | 0.191 | kg CO2e / vehicle-km (solo occupancy assumed) | EPA GHG Emission Factors Hub 2025 — Passenger Car (USA) |
| Flight (international) | 0.255 | kg CO2e / km / person | DEFRA 2023 (UK) |
| Train — USA national avg | 0.071 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 — Inter-City Rail (USA) |
| Train — Canada (VIA Rail through Rockies) | 0.20 | kg CO2e / km / person | VIA Rail long-distance diesel, elevated due to low occupancy (Canada) |
| Local transit — USA avg | 0.062 | kg CO2e / km / person | EPA 2025 avg: Bus 0.044, Commuter Rail 0.083, Transit Rail 0.058 (USA) |
| Local transit — BC, Canada | 0.008 | kg CO2e / km / person | TransLink Climate Action per-trip data (2023) + renewable diesel transition (2024), converted at 8 km avg trip (Canada) |

### Travel — Regional Logic

| Zip / postal | Train EF | Local transit EF |
|---|---|---|
| BC, Canada (V-prefix) | 0.20 VIA Rail | 0.008 TransLink |
| Other Canada (any letter prefix) | 0.20 VIA Rail | 0.062 EPA avg |
| US PNW or national | 0.071 EPA Inter-City Rail | 0.062 EPA avg |
| Blank | 0.071 (default) | 0.062 (default) |

### Travel — Distance Calculation

**Form submission (aggregate):** Fixed defaults — long-distance 300 km, local 8 km, flight 500 km.

**Luma attendee pull (`/api/luma-travel`):** Per-attendee haversine distance from their residential zip centroid to the event location. Uses `lib/geo.js` — bundled US state centroids (zip prefix → lat/lon) and Canadian province centroids (postal letter → lat/lon). No external geocoding API required.

### Energy

| Source | EF | Unit | Source |
|---|---|---|---|
| WA/OR grid (NWPP, USA) | 0.288 | kg CO2e / kWh | EPA eGRID 2024 (USA) |
| BC grid / BC Hydro (Canada) | 0.018 | kg CO2e / kWh | Environment and Climate Change Canada / OBPS 2026 (Canada) |
| Diesel generator (USA) | 0.74 | kg CO2e / kWh | EPA GHG Emission Factors Hub 2025 — distillate fuel oil #2 ÷ ~30% generator efficiency (USA) |

Venue load assumed at **2 W/sq ft** (ASHRAE 90.1).  
Formula: `energy_co2 = venue_size_sqft × 2W × duration_hours / 1000 × grid_ef`

### Catering

| Type | EF | Unit | Source |
|---|---|---|---|
| Rescue / surplus food | 0.1 | kg CO2e / meal | Transport & handling only — production emissions attributed to original supply chain per consequential accounting |
| Vegan | 0.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Vegetarian | 1.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Mixed | 2.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Meat-heavy | 5.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |

Sourcing and packaging fields removed — no defensible per-meal EF adders exist in published literature.

Formula: `catering_co2 = portions × food_ef`

### Waste

Bag weight assumed: **12 kg/bag** (EPA WARM v16 default, USA)

| Stream | EF | Unit | Source |
|---|---|---|---|
| Landfill | 0.639 | kg CO2e / kg waste | EPA WARM v16 — Mixed MSW (USA) |
| Recycling | 0.099 | kg CO2e / kg waste | EPA WARM v16 — Mixed Recyclables (USA) |
| Compost | −0.18 | kg CO2e / kg waste | EPA WARM v16 — Mixed Organics (composted), net negative: process emissions minus carbon sequestration in finished compost (USA) |

Formula: `waste_co2 = (landfill_bags × 12 × 0.639) + (recycling_bags × 12 × 0.099) + (compost_bags × 12 × 0.143)`

### Materials

Only printed pages have an emission factor. Swag and signage are collected for records but have no published per-unit EF.

| Item | EF | Unit | Source |
|---|---|---|---|
| Pages printed | 0.005 | kg CO2e / page | GHG Protocol (2023, international) |

---

## 8. Luma Integration

### Confirmed API field names (verified July 2026 against live API)

| Field | Confirmed value |
|---|---|
| Event endpoint param | `?id=` (not `?event_id=`) |
| Event geo field | `geo_address_json` (API) / `geo_address_info` (page scrape) — both handled |
| Event coordinates | `event.coordinate.latitude` / `event.coordinate.longitude` |
| Guests top-level | `data.entries` |
| Guest answers | `entry.registration_answers` (array of `{label, answer, value}`) |
| Answer field | `match.answer ?? match.value` |
| Question field | `a.label` |
| Pagination cursor | `data.next_cursor` |
| NEXT_DATA path (page scrape) | `props.pageProps.initialData.data.event` |
| Hosts (page scrape) | `props.pageProps.initialData.data.hosts` |

### Event prefill (`/api/luma-import`)

Paste a Luma event URL → auto-fills: event name, date, city, host/organizer, venue, duration, attendees, postal code.

**Access logic:**
1. If `LUMA_API_KEY` is set and event is in org calendar → uses API
2. If API returns 403 (personal calendar event) → falls back to page scraping
3. If no API key → page scraping only

**Obfuscated events:** Luma hides the full address for some events until registration. In this case venue and postal code will be blank — city still populates. No fallback or default postal is applied.

**Import behaviour:** All importable fields (name, date, host, venue, attendees, duration, zip) are always cleared and reset on each new import. City is only updated if Luma returns one — dropdown does not reset to default if city is unavailable.

### Attendee travel (`/api/luma-travel`)

Requires these three registration questions on the Luma event (matched by label substring):
1. **"What is your current residential zip code?"** — free response
2. **"What is your primary mode of transport to the Pacific Northwest region for Climate Week?"** — N/A (local), Bus, Train, Car, Flight
3. **"What is your primary mode of transport to and from this event?"** — Walk/Bike, Transit, Car

These questions are confirmed present on PNW Climate Week events. Fetches all guests (paginated), calculates haversine distance per attendee from their zip centroid to the event location, returns:
- Total travel CO2e (long-distance + local)
- Average long-distance and local distances
- Average distance by region (BC, Canada, PNW, national)
- Mode breakdown and region breakdown

**Status:** Code complete and field names confirmed. End-to-end test with a live event that has actual attendee zip/travel responses still needed.

---

## 9. Frontend Features (index.html)

- **Luma prefill:** Paste event URL → auto-fills event details, host/organizer, stores Luma event ID; clears all fields on each new import
- **Mandatory fields:** Name, email, event name, date, city, host/organizer, zip/postal, attendees, both travel sections (must each total 100%), energy duration + venue size, catering portions (if catering = yes), pages printed
- **Live CO2 estimate:** Recalculates on every input change, displayed before submission
- **Travel validation:** Long-distance and local mode percentages must each sum to 100%; blocked at submission if not
- **Regional EFs:** Train and transit EFs adjust automatically based on event zip/postal code
- **Regional energy defaults:** Auto-sets BC Hydro grid factor when city = Vancouver BC
- **Inline user guide:** Short contextual notes in every section explaining what to enter and why
- **SDG tagging:** Multi-select chips for UN Sustainable Development Goals
- **Sustainable event partners:** Dynamic rows (partner name + category) — feeds PNW sustainability provider database
- **Sustainability initiatives, wins, areas to improve:** Free-text reflection fields
- **Swag & products:** What was given away; whether products were sold and what
- **Ratings:** Self-assessed (Exemplary → Needs improvement)
- **Feedback link:** hello@pnwclimateweek.org in header and footer

---

## 10. Dashboard (dashboard.html)

**Password:** `pnwcw2026` (client-side gate + `DASHBOARD_SECRET` on API)  
Stored in `sessionStorage` — no re-entry needed on refresh.

**Shows:**
- Summary stats: event count, total attendees, total CO2e, avg per person
- CO2e breakdown by category (bar chart)
- By-city table
- Ratings distribution
- **Travel distance by event** — for events linked to Luma, shows avg long-distance and local distances and attendee region breakdown; "Pull from Luma" button fetches live data on demand
- Full event table with export to CSV
- ⚠️ Flagged events (Below average / Needs improvement ratings)

---

## 11. Deployment

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

## 12. Open Items

- **Luma travel end-to-end test:** `luma-travel.js` field names are confirmed at code level but have not been tested against a live event with actual attendee zip/travel answers. Needs one real event with responses to validate the full pipeline.
- **User guide page:** Inline notes are live on the form. A dedicated `/guide.html` (linked from the page) is planned for when fuller documentation is needed.
- **Catering EFs:** Poore & Nemecek (2018) figures are per-kg-of-food adapted to per-meal — not a directly published per-meal figure. Acceptable for current use; flag if methodology is ever formally published.
- **Distance defaults:** Form submission uses hardcoded 300 km / 8 km / 500 km defaults. Per-attendee actual distances only available via `/api/luma-travel`.
