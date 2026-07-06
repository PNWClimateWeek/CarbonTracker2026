# PNW Climate Week — CO2 Calculator · Project Documentation

**Live URL:** https://pnwcw-sustainabilitytracker.vercel.app  
**GitHub:** https://github.com/PNWClimateWeek/CarbonTracker2026  
**Vercel account:** vancouver-9844s-projects  
**Contact:** hello@pnwclimateweek.org  
**Last updated:** 2026-07-02

---

## 1. Purpose

A web-based carbon footprint calculator for community event organizers in the Pacific Northwest. Organizers submit event details after their event; the tool calculates CO2e emissions across five categories (travel, energy, catering, waste, printed materials) and stores results in a shared database. A password-protected internal dashboard aggregates submissions for PNW Climate Week team review.

Individual event emissions are not shared publicly — results are aggregated across all submissions and reported at the Climate Week level only.

**Target cities:** Seattle, Portland, Tacoma, Bellingham, Bend, Vancouver BC, Vancouver WA *(Vancouver WA added 2026-07-02)*

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML/CSS/JS (no framework) |
| Backend | Vercel Serverless Functions (Node.js) |
| Database | Neon PostgreSQL (serverless) |
| File storage | Vercel Blob *(added 2026-07-02 — pending CSV upload endpoint)* |
| Deployment | Vercel (auto-deploy on push to `main`) |
| Event import | Luma API (`/public/v1/event/get`) + page scraping fallback |
| Attendee travel | Luma guest CSV upload (client-side parse) or Luma API (`/public/v1/event/get-guests`) |
| Distance calc | Zippopotam.us API (actual per-zip coordinates, no centroid table) *(updated 2026-07-02)* |
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
│   ├── luma-travel.js      # Per-attendee travel emissions from Luma guests API
│   └── migrate.js          # One-time DB schema migration
├── lib/
│   ├── db.js               # PostgreSQL pool + schema SQL
│   └── geo.js              # Haversine + zip/postal → coordinates via Zippopotam.us API
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
| `LUMA_API_KEY` | Luma API key for event prefill and attendee travel | Set 2026-07-01 |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token for CSV file storage | Blob store created 2026-07-02 — token auto-added by Vercel |

**LUMA_API_KEY note:** Scoped to PNW Climate Week org calendar (`cal-2fOrFiMnHYEI0bL`). Can access events created under that calendar. Events co-hosted (but not owned) by the org return 403 on `get-guests` — this is a Luma API limitation, not a bug. `luma-import.js` falls back to page scraping automatically for 403s on event prefill.

---

## 5. API Endpoints

### `GET /api/events`
Returns stored events. Query params: `city`, `limit`, `offset`, `since`.

### `POST /api/events`
Saves a new event submission. Required fields: `event_name`, `total_attendees`, `total_co2e_kg`, `per_attendee_co2e_kg`. Also accepts `luma_event_id` for linking to Luma attendee data.

### `DELETE /api/events?id=<uuid>`
Deletes an event by ID.

### `GET /api/dashboard-data?key=<DASHBOARD_SECRET>`
Returns aggregated summary, by-city breakdown, rating distribution, and full event list. Used by `dashboard.html`.

### `GET /api/stats?since=<ISO date>`
Returns weekly summary stats (event count, attendees, CO2 totals, category breakdown, top cities, rating distribution). Defaults to current Monday.

### `GET /api/luma-import?url=<luma-url>` or `?id=<event-id>`
Fetches event details and returns prefill data: event name, date, city, host/organizer, venue, duration, attendees, postal code. Uses API if `LUMA_API_KEY` has access; falls back to page scraping (`__NEXT_DATA__` → JSON-LD → Open Graph).

### `GET /api/luma-travel?event_id=<id>` or `?url=<luma-url>`
Fetches all attendees from Luma org-owned events, reads registration answers for zip and travel mode, calculates haversine distance via Zippopotam.us, applies PNW region override (see §8), returns total travel CO2e, distances, mode and region breakdown. Requires `LUMA_API_KEY`. Only works for events owned by the org calendar (not co-hosted events).

### `POST /api/migrate` _(Bearer token required)_
Applies the database schema (idempotent).

---

## 6. Database Schema

Table: `events` (Neon PostgreSQL)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, auto-generated |
| `event_name` | TEXT | Required |
| `event_date` | DATE | |
| `city` | TEXT | One of the 7 PNW cities |
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
| `local_distance_km` | NUMERIC | Default 8 km |
| `long_distance_km` | NUMERIC | Default 300 km (or CSV-derived avg for non-PNW attendees) |
| `flight_distance_km` | NUMERIC | Default 500 km |
| `duration_hours` | NUMERIC | Event duration |
| `venue_size_sqft` | NUMERIC | |
| `energy_source` | TEXT | Grid EF value used |
| `catering_provided` | BOOLEAN | |
| `food_type` | TEXT | vegan / vegetarian / mixed / meat-heavy |
| `portions` | INTEGER | Number of meals served |
| `sourcing` | TEXT | |
| `packaging` | TEXT | |
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
| `luma_event_id` | TEXT | Stored on import; used to link CSV uploads and luma-travel data |
| `luma_csv_url` | TEXT | *(planned 2026-07-02)* Vercel Blob URL of uploaded guest CSV |
| `avg_long_dist_km` | NUMERIC | Avg haversine distance for non-PNW attendees |
| `avg_local_dist_km` | NUMERIC | Avg local trip distance |
| `attendee_regions` | TEXT | JSON — region breakdown from luma-travel |
| `created_at` | TIMESTAMPTZ | Auto-set to NOW() |

Indexes: `idx_events_created_at`, `idx_events_city`

---

## 7. Emission Factors & Methodology

All CO2e calculations are performed client-side in `index.html` before submission. EFs adjust by attendee zip/postal code.

All trips assumed **round-trip** (distance × 2).

### Travel — EFs

| Mode | EF | Unit | Source |
|---|---|---|---|
| Bus (long distance, USA) | 0.044 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 |
| Car (USA) | 0.191 | kg CO2e / vehicle-km (solo occupancy assumed) | EPA GHG Emission Factors Hub 2025 — Passenger Car |
| Flight (international) | 0.255 | kg CO2e / km / person | DEFRA 2023 (UK) |
| Train — USA national avg | 0.071 | kg CO2e / km / person | EPA GHG Emission Factors Hub 2025 — Inter-City Rail |
| Train — Canada (VIA Rail) | 0.20 | kg CO2e / km / person | VIA Rail long-distance diesel, elevated due to low occupancy |
| Local transit — USA avg | 0.062 | kg CO2e / km / person | EPA 2025 avg: Bus 0.044, Commuter Rail 0.083, Transit Rail 0.058 |
| Local transit — BC | 0.008 | kg CO2e / km / person | TransLink Climate Action data (2023) + renewable diesel transition (2024), converted at 8 km avg trip |

### Travel — Regional Logic

| Zip / postal | Train EF | Local transit EF |
|---|---|---|
| BC, Canada (V-prefix) | 0.20 VIA Rail | 0.008 TransLink |
| Other Canada (any letter prefix) | 0.20 VIA Rail | 0.062 EPA avg |
| US PNW or national | 0.071 EPA Inter-City Rail | 0.062 EPA avg |
| Blank | 0.071 (default) | 0.062 (default) |

### Travel — Distance Calculation *(updated 2026-07-02)*

**Form submission (manual entry):** Fixed defaults — long-distance 300 km, local 8 km, flight 500 km. If a guest CSV is uploaded, the avg long-distance trip distance for non-PNW attendees replaces the 300 km default.

**CSV upload or `/api/luma-travel`:** Per-attendee actual coordinates fetched from Zippopotam.us (free API, no key required — US 5-digit zips and Canadian FSA codes supported). Haversine distance calculated from attendee zip to event zip. The old bundled centroid table (state/province level) has been removed and replaced with this API.

**PNW region override *(added 2026-07-02)*:** For the long-distance travel question ("mode of transport to the Pacific Northwest region"), attendees from BC (V-prefix postal), Washington (980–994), or Oregon (970–979) are automatically counted as local (N/A) regardless of their answer. Rationale: these attendees already live in the PNW region — their answer reflects local commute mode, not intercontinental travel. This applies in both the CSV parser and `luma-travel.js`.

### Energy

| Source | EF | Unit | Source |
|---|---|---|---|
| WA/OR grid (NWPP, USA) | 0.288 | kg CO2e / kWh | EPA eGRID 2024 |
| BC grid / BC Hydro (Canada) | 0.018 | kg CO2e / kWh | Environment and Climate Change Canada / OBPS 2026 |
| Diesel generator | 0.74 | kg CO2e / kWh | EPA GHG Emission Factors Hub 2025 — distillate fuel oil #2 ÷ ~30% generator efficiency |

Venue load assumed at **2 W/sq ft** (ASHRAE 90.1).  
Formula: `energy_co2 = venue_size_sqft × 2W × duration_hours / 1000 × grid_ef`

Auto-selects BC Hydro when city = Vancouver BC.

### Catering

| Type | EF | Unit | Source |
|---|---|---|---|
| Rescue / surplus food | 0.1 | kg CO2e / meal | Transport & handling only — production emissions attributed to original supply chain per consequential accounting |
| Vegan | 0.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Vegetarian | 1.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Mixed | 2.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |
| Meat-heavy | 5.5 | kg CO2e / meal | Poore & Nemecek (2018), *Science* |

Formula: `catering_co2 = portions × food_ef`

### Waste

Bag weight assumed: **12 kg/bag** (EPA WARM v16 default)

| Stream | EF | Unit | Source |
|---|---|---|---|
| Landfill | 0.639 | kg CO2e / kg waste | EPA WARM v16 — Mixed MSW |
| Recycling | 0.099 | kg CO2e / kg waste | EPA WARM v16 — Mixed Recyclables |
| Compost | −0.18 | kg CO2e / kg waste | EPA WARM v16 — Mixed Organics, net negative |

### Materials

| Item | EF | Unit | Source |
|---|---|---|---|
| Pages printed | 0.005 | kg CO2e / page | GHG Protocol (2023) |

---

## 8. Luma Integration

### Confirmed API field names (verified 2026-07-01 against live API)

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

Paste a Luma event URL → auto-fills: event name, date, city, host/organizer, venue, duration, attendees, postal code, Luma event ID.

**City detection *(updated 2026-07-02)*:** `matchCity()` now receives the full geo object (not just city string) and uses `region`/`country` fields to disambiguate Vancouver BC from Vancouver WA.

**Access logic:**
1. If `LUMA_API_KEY` set and event is org-owned → uses API
2. If API returns 403 (co-hosted / personal calendar event) → falls back to page scraping
3. If no API key → page scraping only

**Import behaviour:** All fields are always cleared and reset on each new import. City only updates if Luma returns one.

### Attendee travel — two paths *(updated 2026-07-02)*

#### Path A: CSV upload (recommended — works for all events)

Luma's `get-guests` API only works for events the org calendar *owns*, not co-hosted events. Since most PNW Climate Week events are co-hosted (not owned) by the org, the practical solution is CSV export.

**Organizer flow:** Luma event dashboard → Guests → Export CSV → upload in the Travel section of the calculator.

**Client-side processing:**
1. Detects columns by header substring: "residential zip", "pacific northwest", "to and from"
2. Fetches coordinates for all unique zips in parallel via Zippopotam.us
3. Applies PNW region override (see §7 Travel Distance Calculation)
4. Fills travel mode percentage fields
5. Computes avg long-distance trip km for non-PNW attendees (overrides 300 km default)

**Three registration questions required on the Luma form:**
1. "What is your current residential zip code?" — free response
2. "What is your primary mode of transport to the Pacific Northwest region for Climate Week?" — N/A (local), Bus, Train, Car, Flight
3. "What is your primary mode of transport to and from this event?" — Walk/Bike, Transit, Car

**Organizer email note (drafted 2026-07-02):**
> Travel is typically the largest share of an event's footprint. If you added these three questions to your Luma registration, you can export your guest list (Guests → Export CSV) and upload it to the calculator for actual distances rather than defaults. If not, the calculator still works with estimated defaults.

#### Path B: Luma API (`/api/luma-travel`)

Only works for events the org API key owns. Same three questions required. Same PNW region override applied server-side. Deduplicates attendee zips before geocoding (one Zippopotam.us call per unique zip, not per guest).

**Limitation:** Events co-hosted by PNW Climate Week but owned by individual organizers return 403. Path A (CSV) is the workaround.

### Vercel Blob — CSV file storage *(planned 2026-07-02)*

Blob store created and linked to project. `BLOB_READ_WRITE_TOKEN` auto-added by Vercel.

**Remaining to build:**
- Install `@vercel/blob` package
- Create `api/upload-csv.js` endpoint (receives CSV text, stores to Blob, returns URL)
- Add `luma_csv_url TEXT` column to events table via migration
- Update frontend: on event log, upload CSV to Blob and save URL with event row

---

## 9. Frontend Features (index.html)

- **Luma prefill:** Paste event URL → auto-fills all event details; clears all fields on each new import
- **CSV travel upload *(added 2026-07-02)*:** Upload Luma guest CSV in the Travel section; parses client-side, fetches real zip coordinates via Zippopotam.us, applies PNW region override, fills travel mode percentage fields, shows count of corrected responses
- **Mandatory fields:** Name, email, event name, date, city, host/organizer, zip/postal, attendees, both travel sections (must each total 100%), energy duration + venue size, catering portions (if catering = yes), pages printed
- **Live CO2 estimate:** Recalculates on every input change
- **Travel validation:** Long-distance and local mode percentages must each sum to 100%
- **Regional EFs:** Train and transit EFs adjust automatically based on event zip/postal code
- **Regional energy defaults:** Auto-sets BC Hydro when city = Vancouver BC
- **Inline user guide:** Contextual notes in every section
- **SDG tagging:** Multi-select chips for UN Sustainable Development Goals
- **Sustainable event partners:** Dynamic rows (partner name + category)
- **Sustainability initiatives, wins, areas to improve:** Free-text reflection fields
- **Swag & products:** What was given away; whether products were sold
- **Ratings:** Exemplary → Needs improvement based on kg CO2e per person

---

## 10. Dashboard (dashboard.html)

**Password:** `pnwcw2026` (client-side gate + `DASHBOARD_SECRET` on API)

**Shows:**
- Summary stats: event count, total attendees, total CO2e, avg per person
- CO2e breakdown by category (bar chart)
- By-city table
- Ratings distribution
- Travel distance by event — for events linked to Luma, shows avg distances and region breakdown; "Pull from Luma" button fetches live data on demand
- Full event table with export to CSV
- ⚠️ Flagged events (Below average / Needs improvement ratings)

---

## 11. Cities *(updated 2026-07-02)*

| City | Country | Zip/Postal range | Energy default | Transit EF |
|---|---|---|---|---|
| Seattle WA | USA | 981xx | WA/OR grid (0.288) | EPA 0.062 |
| Tacoma WA | USA | 984xx | WA/OR grid (0.288) | EPA 0.062 |
| Portland OR | USA | 972xx | WA/OR grid (0.288) | EPA 0.062 |
| Bend OR | USA | 977xx | WA/OR grid (0.288) | EPA 0.062 |
| Bellingham WA | USA | 982xx | WA/OR grid (0.288) | EPA 0.062 |
| Vancouver WA | USA | 986xx | WA/OR grid (0.288) | EPA 0.062 |
| Vancouver BC | Canada | V5x–V7x | BC Hydro (0.018) | TransLink 0.008 |

Vancouver WA added 2026-07-02. `matchCity()` disambiguates Vancouver BC vs Vancouver WA using `geo.region` / `geo.country` from Luma's geo object.

---

## 12. Deployment

Auto-deploys to Vercel on every push to `main`.

**To run locally:**
```bash
npm install
vercel dev
```

**To apply DB schema:**
```bash
curl -X POST https://pnwcw-sustainabilitytracker.vercel.app/api/migrate \
  -H "Authorization: Bearer <MIGRATION_SECRET>"
```

---

## 13. Open Items

- **Vercel Blob CSV storage:** Blob store created 2026-07-02. Still need: install `@vercel/blob`, build `api/upload-csv.js`, add `luma_csv_url` DB column, wire frontend to upload on event save.

---

## 14. Change Log

### 2026-07-02
- **Vancouver WA added** as 7th city. Dropdown, header, footer, and Luma `matchCity()` all updated. `matchCity()` now uses full geo object to distinguish Vancouver BC (British Columbia) from Vancouver WA (Washington) by region/country field.
- **Geocoding replaced:** Removed bundled US state centroid table and Canadian province centroid table from `lib/geo.js`. Now calls Zippopotam.us API (free, no key, per-zip accuracy). Canadian FSA (first 3 chars of postal code) supported.
- **CSV upload added:** Travel section now has a "Upload Luma guest CSV" file input. Parses client-side, deduplicates zips, fetches real coordinates in parallel, fills travel mode percentage fields. Shows count of responses corrected.
- **PNW region override:** Attendees from BC (V-prefix), WA (980–994), or OR (970–979) are auto-corrected to local (N/A) for the long-distance travel question, regardless of their answer. Applied in both the CSV parser and `luma-travel.js`. Rationale: these attendees live in the PNW region and did not travel to it for the event.
- **Vercel Blob store created** and linked to project. `BLOB_READ_WRITE_TOKEN` auto-added. CSV upload-to-Blob endpoint not yet built.
- **Luma API limitation documented:** `get-guests` only works for org-owned events, not co-hosted ones. CSV upload is the practical workaround for PNW Climate Week's event structure.
- **Organizer travel note drafted** for email/onboarding: explains the three Luma registration questions and CSV export process.
