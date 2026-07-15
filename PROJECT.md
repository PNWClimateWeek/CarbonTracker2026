# PNW Climate Week — CO2 Calculator · Project Documentation

**Live URL:** https://pnwcw-sustainabilitytracker.vercel.app  
**GitHub:** https://github.com/PNWClimateWeek/CarbonTracker2026  
**Vercel account:** vancouver-9844s-projects  
**Contact:** hello@pnwclimateweek.org  
**Last updated:** 2026-07-06

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
| File storage | Vercel Blob, private access *(CSV upload + authenticated download proxy live 2026-07-06)* |
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
│   ├── events.js           # GET / POST / PATCH / DELETE events
│   ├── dashboard-data.js   # Aggregated dashboard data
│   ├── stats.js            # Weekly stats summary
│   ├── luma-import.js      # Luma event prefill
│   ├── luma-travel.js      # Per-attendee travel emissions from Luma guests API
│   ├── upload-csv.js       # Stores guest CSV to Blob (private access)
│   ├── csv-download.js     # Authenticated proxy to fetch a private CSV (dashboard only)
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
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token for CSV file storage | Set — used by `upload-csv.js` and `csv-download.js`. Store is **private access**; do not switch to public — CSVs contain attendee names/emails/zips |

**LUMA_API_KEY note:** Scoped to PNW Climate Week org calendar (`cal-2fOrFiMnHYEI0bL`). Can access events created under that calendar. Events co-hosted (but not owned) by the org return 403 on `get-guests` — this is a Luma API limitation, not a bug. `luma-import.js` falls back to page scraping automatically for 403s on event prefill.

---

## 5. API Endpoints

### `GET /api/events`
Returns stored events. Query params: `city`, `limit`, `offset`, `since`.

### `POST /api/events`
Saves a new event submission. Required fields: `event_name`, `total_attendees`, `total_co2e_kg`, `per_attendee_co2e_kg`. Also accepts `luma_event_id` for linking to Luma attendee data.

### `DELETE /api/events?id=<uuid>`
Deletes an event by ID. Wired to the dashboard's Delete button *(added 2026-07-06)* — confirm-gated, hard delete, no undo.

### `PATCH /api/events?id=<uuid>`
Updates travel fields on an existing event (used by the dashboard's retroactive CSV/edit flow). Accepts travel percentage fields, `long_distance_km`, `avg_long_dist_km`, recomputed travel/total/per-attendee CO2e, and optionally `luma_csv_url`.

### `POST /api/upload-csv` *(added 2026-07-06)*
Stores a guest CSV to Vercel Blob with **private** access (matches the store's config — do not change to public; these files contain attendee PII). Body: `{filename, content, event_id}`. Returns `{url}`. Used by both the main calculator (on submit) and the dashboard's edit modal (retroactive upload).

### `GET /api/csv-download?key=<DASHBOARD_SECRET>&url=<blob-url>` *(added 2026-07-06)*
Authenticated proxy that streams a private CSV blob back to the dashboard. Necessary because private blobs aren't fetchable by direct URL from a browser — this endpoint fetches server-side (using `BLOB_READ_WRITE_TOKEN`) and pipes the content through, gated by the same `DASHBOARD_SECRET` as `dashboard-data.js`.

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
| `long_distance_km` | NUMERIC | Default 50 km *(updated 2026-07-06, was 300 km)* — or CSV-derived avg for non-PNW attendees |
| `flight_distance_km` | NUMERIC | Default 50 km *(updated 2026-07-06, was 500 km — unified with the long-distance default rather than assuming a long-haul flight when there's no actual distance data)* |
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
| `luma_csv_url` | TEXT | *(live 2026-07-06)* Private Vercel Blob URL of uploaded guest CSV — not directly fetchable; dashboard reaches it via `GET /api/csv-download` |
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

### Travel — Distance Calculation *(updated 2026-07-06)*

**Form submission (manual entry):** Fixed defaults — long-distance 50 km, local 8 km, flight 50 km *(changed 2026-07-06, was 300/8/500 km)*. Rationale: assuming a long-haul (300 km drive / 500 km flight) trip when there's no actual distance data overstates emissions for the common case; a moderate flat assumption is more defensible than guessing "far" by default. If a guest CSV is uploaded, the avg long-distance trip distance for non-PNW attendees replaces the 50 km default.

**Individual CSV responses with no resolvable zip** use the same 50 km fallback *(updated 2026-07-06, was 300 km)* — they still count toward mode % but their distance is unknown.

**CSV upload or `/api/luma-travel`:** Per-attendee actual coordinates fetched from Zippopotam.us (free API, no key required — US 5-digit zips and Canadian FSA codes supported). Haversine distance calculated from attendee zip to event zip. The old bundled centroid table (state/province level) has been removed and replaced with this API.

**PNW region override *(added 2026-07-02)*:** For the long-distance travel question ("mode of transport to the Pacific Northwest region"), attendees from BC (V-prefix postal), Washington (980–994), or Oregon (970–979) are automatically counted as local (N/A) regardless of their answer. Rationale: these attendees already live in the PNW region — their answer reflects local commute mode, not intercontinental travel. This applies in both the CSV parser and `luma-travel.js`. Mechanically this is implemented as a flat **haversine distance < 30 km** check per attendee, not a zip-prefix regex — anyone within 30 km of the venue gets the override, wherever they live.

**CSV-vs-zip fill order bug fixed *(2026-07-06)*:** `parseLumaCSV()` used to read the event zip field once, at the moment the CSV finished parsing. If the organizer uploaded the CSV before typing the event zip, every attendee's distance came back null and the local-override/per-attendee math silently no-op'd — same CSV produced different percentages depending on fill order. Parsing is now split into `processPendingCSV()`, callable independently via `reprocessCSVIfLoaded()`, which re-runs automatically when the zip (on blur) or city (on change) are edited after the CSV is already loaded.

**Percentage rounding fixed *(2026-07-06)*:** Travel mode percentages were rounded independently per field (`Math.round` on each), which could sum to 99 or 101 instead of 100. `apportionPercentages()` (largest-remainder method) now guarantees the set always sums to exactly 100. Fixed in both `index.html` and `dashboard.html`'s duplicated CSV-parsing logic.

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
5. Computes avg long-distance trip km for non-PNW attendees (overrides 50 km default)

**Three registration questions required on the Luma form:**
1. "What is your current residential zip code?" — free response
2. "What is your primary mode of transport to the Pacific Northwest region for Climate Week?" — N/A (local), Bus, Train, Car, Flight
3. "What is your primary mode of transport to and from this event?" — Walk/Bike, Transit, Car

**Organizer email note (drafted 2026-07-02):**
> Travel is typically the largest share of an event's footprint. If you added these three questions to your Luma registration, you can export your guest list (Guests → Export CSV) and upload it to the calculator for actual distances rather than defaults. If not, the calculator still works with estimated defaults.

#### Path B: Luma API (`/api/luma-travel`)

Only works for events the org API key owns. Same three questions required. Same PNW region override applied server-side. Deduplicates attendee zips before geocoding (one Zippopotam.us call per unique zip, not per guest).

**Limitation:** Events co-hosted by PNW Climate Week but owned by individual organizers return 403. Path A (CSV) is the workaround.

### Vercel Blob — CSV file storage *(live 2026-07-06)*

Blob store created and linked to project, **private access**. `BLOB_READ_WRITE_TOKEN` auto-added by Vercel.

**How it works end to end:**
1. On event submit (or retroactive edit), the guest CSV is POSTed to `api/upload-csv.js`, which stores it via `put(path, content, {access:'private', ...})` and returns the blob URL.
2. That URL is saved to `events.luma_csv_url`.
3. The dashboard's events table links to it through `GET /api/csv-download?key=<DASHBOARD_SECRET>&url=<blob-url>` — an authenticated proxy, since private blobs 403 on direct fetch from a browser.

**Bug fixed 2026-07-06:** `upload-csv.js` originally called `put()` with `access:'public'` against a store provisioned as private — every upload failed with a 500, and the frontend swallowed the error silently (`console.warn` only), so events kept saving with no CSV attached and nobody was told. Fixed by matching the store's actual access level and adding `api/csv-download.js` as the read path. The frontend now also surfaces upload failures to the submitter via toast instead of failing silently.

---

## 9. Frontend Features (index.html)

- **Luma prefill:** Paste event URL → auto-fills all event details; clears all fields on each new import
- **CSV travel upload *(added 2026-07-02)*:** Upload Luma guest CSV in the Travel section; parses client-side, fetches real zip coordinates via Zippopotam.us, applies PNW region override, fills travel mode percentage fields, shows count of corrected responses
- **Attendee headcount from CSV *(updated 2026-07-15)*:** if the CSV's `checked_in_at` column has real timestamps, total attendees = actual checked-in count. If not (blank column, or none at all — most exports are pulled before the event, so nobody's checked in yet), total attendees = **60% of total registrations**, an assumed no-show-adjusted rate, rather than the previous silent fallback to the manually-typed "Total attendees" field or a default of 1. The status message always states which case applied ("N checked in" vs. "N assumed attended (60% of M registered — no check-in data)") so it's never a silent guess. Same logic duplicated in `dashboard.html`'s edit-modal CSV re-upload.
- **Mandatory fields:** Name, email, event name, date, city, host/organizer, zip/postal, attendees, both travel sections (must each total 100%), energy duration + venue size, catering portions (if catering = yes), pages printed
- **Live CO2 estimate:** Recalculates on every input change
- **Travel validation:** Long-distance and local mode percentages must each sum to 100%
- **Regional EFs:** Train and transit EFs adjust automatically based on event zip/postal code
- **Regional energy defaults:** Auto-sets BC Hydro when city = Vancouver BC
- **Inline user guide:** Contextual notes in every section
- **Submit feedback *(reworked 2026-07-06)*:** Validation banner and post-submit toast are now fixed to top-center of the viewport rather than sitting next to the submit button at the bottom of a long form — previously, if an earlier field was invalid, the page would scroll/focus there while the actual warning message stayed off-screen at the bottom. Error toasts now stay up 9s and are click-to-dismiss (was 2.6s, no way to dismiss); success message reads "Event submitted successfully"
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
- **CSV column *(added 2026-07-06)*:** Links to each event's uploaded guest CSV via the authenticated `csv-download` proxy; shows "—" if none was uploaded
- **Delete button *(added 2026-07-06)*:** Confirm-gated hard delete per event row (`DELETE /api/events?id=`), no undo
- Edit button opens a modal to adjust travel percentages / re-upload a CSV retroactively — **bug fixed 2026-07-06:** `openEdit()` set `style.display=''` on a modal whose CSS class already declared `display:none`; clearing an inline style just falls back to the class rule, so the modal never actually appeared even though the fields populated correctly underneath. Now sets `'block'`
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

None currently outstanding. (Vercel Blob CSV storage — the last open item — shipped and was tested end-to-end 2026-07-06; see Change Log.)

---

## 14. Change Log

### 2026-07-15
- **Removed the public rating verdict from the pre-submit preview:** the rating/label system (e.g. "Needs improvement") was deliberately pulled off the public-facing form on 2026-05-22 specifically because a judgmental verdict could discourage organizers from submitting — it was meant to stay internal-dashboard-only. It quietly came back when the two-stage "Calculate → Confirm & submit" preview (`renderPreview()`) was built on 2026-07-06, without anyone deciding to re-add it. Removed again: the preview now shows only the numeric breakdown (total, per-attendee, travel, energy, catering, waste, materials) with no label, emoji, or verdict text. `getRating()` still runs and the result is still saved to the DB — the internal dashboard's badges and flagged-events view (`Below average` / `Needs improvement`) are unaffected.
- **Fixed silent zero-attendee scaling on CSV upload:** when a CSV had no usable `checked_in_at` data, the total-attendees figure used to scale per-person travel CO2e into an event total fell back to the manually-typed "Total attendees" field, and if that was also empty, defaulted to **1** — silently reporting a correctly-computed per-person average as if it were the whole event's total. Replaced with an explicit assumption: 60% of total CSV registrations, surfaced in the upload status message so it's never a silent guess ("N assumed attended (60% of M registered — no check-in data)"). Fixed in both `index.html` and `dashboard.html`'s duplicated CSV-parsing logic.

### 2026-07-06
- **Fixed CSV upload entirely broken:** `upload-csv.js` called Blob's `put()` with `access:'public'` against a store provisioned as **private** — every upload 500'd, and the frontend only `console.warn`'d, so events kept saving with no CSV attached and nobody was told. Fixed by using `access:'private'` (correct, since these CSVs carry attendee names/emails/zips) and adding `api/csv-download.js`, an authenticated proxy gated by `DASHBOARD_SECRET` so the dashboard can still read them. Tested end-to-end against production: upload → event save → dashboard read → authenticated download all confirmed working; unauthenticated download and direct blob access both confirmed rejected (401/403).
- **Fixed dashboard Edit modal not opening:** `openEdit()` set `style.display=''`, which fell back to the CSS class's `display:none` instead of showing the modal. Now sets `'block'`.
- **Added Delete button** to the dashboard events table — confirm-gated hard delete via the (pre-existing but previously unwired) `DELETE /api/events` endpoint.
- **Reworked submit feedback:** validation banner and toast moved from bottom-of-page/bottom-corner to fixed top-center, so they stay visible regardless of which field the page scrolls/focuses to. Error toasts extended from 2.6s to 9s and made click-to-dismiss. Wording changed from "Event saved" to "Event submitted successfully."
- **Fixed percentage rounding:** travel mode percentages were rounded independently per field and could sum to 99 or 101. Added `apportionPercentages()` (largest-remainder method) in both `index.html` and `dashboard.html` so the set always sums to exactly 100.
- **Fixed CSV-vs-zip fill-order bug:** uploading the Luma guest CSV before vs. after typing the event zip/city produced different results, because `parseLumaCSV()` read the zip field only once, at parse time. Split into `processPendingCSV()` + `reprocessCSVIfLoaded()`, which now re-runs the distance/local-override calculation whenever zip (on blur) or city (on change) are edited after the CSV is already loaded.
- **Changed "no distance data" assumption from 300/500 km to 50 km** — applies to both the no-CSV manual-entry defaults (long-distance and flight) and individual CSV rows with an unresolvable zip. Rationale: assuming a long-haul trip by default overstated emissions when no actual distance data exists; 50 km is a more defensible flat assumption. Updated in `index.html`, `dashboard.html`, and the organizer-facing methodology guide (`calculator-logic.html`).

### 2026-07-02
- **Vancouver WA added** as 7th city. Dropdown, header, footer, and Luma `matchCity()` all updated. `matchCity()` now uses full geo object to distinguish Vancouver BC (British Columbia) from Vancouver WA (Washington) by region/country field.
- **Geocoding replaced:** Removed bundled US state centroid table and Canadian province centroid table from `lib/geo.js`. Now calls Zippopotam.us API (free, no key, per-zip accuracy). Canadian FSA (first 3 chars of postal code) supported.
- **CSV upload added:** Travel section now has a "Upload Luma guest CSV" file input. Parses client-side, deduplicates zips, fetches real coordinates in parallel, fills travel mode percentage fields. Shows count of responses corrected.
- **PNW region override:** Attendees from BC (V-prefix), WA (980–994), or OR (970–979) are auto-corrected to local (N/A) for the long-distance travel question, regardless of their answer. Applied in both the CSV parser and `luma-travel.js`. Rationale: these attendees live in the PNW region and did not travel to it for the event.
- **Vercel Blob store created** and linked to project. `BLOB_READ_WRITE_TOKEN` auto-added. CSV upload-to-Blob endpoint not yet built.
- **Luma API limitation documented:** `get-guests` only works for org-owned events, not co-hosted ones. CSV upload is the practical workaround for PNW Climate Week's event structure.
- **Organizer travel note drafted** for email/onboarding: explains the three Luma registration questions and CSV export process.
