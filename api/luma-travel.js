// Luma Travel Emissions
// Fetches per-attendee zip + mode from Luma registration answers, calculates travel CO2e
// using actual haversine distances from attendee zip → event location.
//
// TODO: verify actual field names in Luma guest response with a live API key + real event.
// Known registration questions (matched by label substring):
//   "What is your current residential zip code?"
//   "What is your primary mode of transport to the Pacific Northwest region for Climate Week?"
//   "What is your primary mode of transport to and from this event?"

const { distanceKm } = require('../lib/geo');

const LOCAL_DIST_DEFAULT_KM = 8; // fallback if attendee zip → event distance seems wrong for local

const LONG_MODE_EF = {
  'n/a (local)': 0,
  'bus':         0.044,
  'train':       null, // region-dependent
  'car':         0.191,
  'flight':      0.255,
};

const LOCAL_MODE_EF = {
  'walk/bike': 0,
  'transit':   null, // region-dependent
  'car':       0.191,
};

function getRegion(zip) {
  if (!zip) return 'national';
  const z = zip.trim().toUpperCase();
  if (/^V/.test(z))      return 'bc';
  if (/^[A-Z]/.test(z)) return 'canada';
  const pre = parseInt(z.replace(/\D/g,'').substring(0, 3), 10);
  if ((pre >= 980 && pre <= 994) || (pre >= 970 && pre <= 979)) return 'pnw';
  return 'national';
}

function getTrainEF(region) {
  return (region === 'bc' || region === 'canada') ? 0.20 : 0.071;
}

function getTransitEF(region) {
  return region === 'bc' ? 0.008 : 0.062;
}

function getLongEF(mode, region) {
  const ef = LONG_MODE_EF[mode];
  if (ef === null) return getTrainEF(region);
  return ef ?? null;
}

function getLocalEF(mode, region) {
  const ef = LOCAL_MODE_EF[mode];
  if (ef === null) return getTransitEF(region);
  return ef ?? null;
}

// Extract a registration answer by matching a substring of the question label.
// TODO: confirm Luma field structure. Expected shape:
//   guest.registration_answers = [{ label: "...", answer: "..." }, ...]
// May also be: guest.answers, nested under event_ticket.registration_answers, etc.
function getAnswer(registrationAnswers, labelSubstring) {
  if (!Array.isArray(registrationAnswers)) return null;
  const match = registrationAnswers.find(a =>
    (a.label || a.question || '').toLowerCase().includes(labelSubstring.toLowerCase())
  );
  // TODO: confirm answer field name — may be `answer`, `response`, `value`
  return match ? (match.answer || match.response || match.value || null) : null;
}

async function fetchAllGuests(eventId, apiKey) {
  const guests = [];
  let cursor = null;
  let page = 0;

  do {
    const url = new URL('https://api.lu.ma/public/v1/event/get-guests');
    url.searchParams.set('event_id', eventId);
    if (cursor) url.searchParams.set('pagination_cursor', cursor);

    const res = await fetch(url.toString(), {
      headers: { 'x-luma-api-key': apiKey, 'accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`Luma guests API error ${res.status}: ${await res.text()}`);

    const data = await res.json();
    // TODO: confirm top-level shape — may be data.entries, data.guests, data.data, etc.
    const entries = data.entries || data.guests || data.data || [];
    for (const entry of entries) {
      // TODO: confirm guest path — may be entry.guest, entry, etc.
      guests.push(entry.guest || entry);
    }

    cursor = data.has_more ? (data.next_cursor || data.pagination?.next_cursor || null) : null;
    page++;
    if (page > 50) break; // safety cap ~5,000 attendees
  } while (cursor);

  return guests;
}

async function fetchEventCoords(eventId, apiKey) {
  const res = await fetch(
    `https://api.lu.ma/public/v1/event/get?event_id=${encodeURIComponent(eventId)}`,
    { headers: { 'x-luma-api-key': apiKey, 'accept': 'application/json' } }
  );
  if (!res.ok) return null;
  const { event: ev } = await res.json();
  const geo = ev?.geo_address_info || {};
  // TODO: confirm lat/lon field names in Luma geo_address_info
  const lat = parseFloat(geo.latitude  || geo.lat || geo.lat_lng?.lat);
  const lon = parseFloat(geo.longitude || geo.lng || geo.lat_lng?.lng);
  return (isFinite(lat) && isFinite(lon)) ? { lat, lon } : null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.LUMA_API_KEY) return res.status(500).json({ error: 'LUMA_API_KEY not configured' });

  const { event_id, url } = req.query;
  let eventId = event_id;
  if (!eventId && url) {
    try { eventId = new URL(url).pathname.replace(/^\//, '').split('/')[0]; }
    catch { return res.status(400).json({ error: 'Invalid URL' }); }
  }
  if (!eventId) return res.status(400).json({ error: 'Provide ?event_id= or ?url=' });

  try {
    const [guests, eventCoords] = await Promise.all([
      fetchAllGuests(eventId, process.env.LUMA_API_KEY),
      fetchEventCoords(eventId, process.env.LUMA_API_KEY),
    ]);

    let totalLongCO2 = 0;
    let totalLocalCO2 = 0;
    let totalLongDist = 0;
    let totalLocalDist = 0;
    let longDistCount = 0;
    let localDistCount = 0;

    const modeCounts  = { long: {}, local: {} };
    const regionCounts = {};
    const regionDistances = {}; // region → [distances] for avg by region
    let parsed = 0, skipped = 0;

    for (const guest of guests) {
      // TODO: confirm where registration answers live on the guest object
      const answers  = guest.registration_answers || guest.answers || [];
      const zip      = getAnswer(answers, 'residential zip code');
      const longMode = (getAnswer(answers, 'mode of transport to the Pacific Northwest') || '').toLowerCase().trim();
      const localMode= (getAnswer(answers, 'mode of transport to and from this event')  || '').toLowerCase().trim();

      if (!longMode && !localMode) { skipped++; continue; }

      const region  = getRegion(zip);
      const longEF  = getLongEF(longMode, region);
      const localEF = getLocalEF(localMode, region);

      // Distance: use haversine from attendee zip → event, fallback to defaults
      const longDist = (eventCoords && zip)
        ? (distanceKm(zip, eventCoords.lat, eventCoords.lon) ?? 300)
        : 300;
      const localDist = LOCAL_DIST_DEFAULT_KM;

      if (longEF !== null) {
        totalLongCO2 += longDist * 2 * longEF;
        totalLongDist += longDist;
        longDistCount++;
      }
      if (localEF !== null) {
        totalLocalCO2 += localDist * 2 * localEF;
        totalLocalDist += localDist;
        localDistCount++;
      }

      modeCounts.long[longMode]   = (modeCounts.long[longMode]   || 0) + 1;
      modeCounts.local[localMode] = (modeCounts.local[localMode] || 0) + 1;
      regionCounts[region]        = (regionCounts[region]        || 0) + 1;

      if (!regionDistances[region]) regionDistances[region] = [];
      if (longDist) regionDistances[region].push(longDist);

      parsed++;
    }

    // Average distance per region
    const avgDistByRegion = {};
    for (const [region, dists] of Object.entries(regionDistances)) {
      avgDistByRegion[region] = Math.round(dists.reduce((a, b) => a + b, 0) / dists.length);
    }

    return res.status(200).json({
      event_id,
      event_coords:          eventCoords,
      total_guests_fetched:  guests.length,
      guests_parsed:         parsed,
      guests_skipped:        skipped,
      avg_long_dist_km:      longDistCount  ? Math.round(totalLongDist  / longDistCount)  : null,
      avg_local_dist_km:     localDistCount ? Math.round(totalLocalDist / localDistCount) : null,
      avg_dist_by_region_km: avgDistByRegion,
      travel_co2_kg: {
        long_distance: Math.round(totalLongCO2  * 100) / 100,
        local:         Math.round(totalLocalCO2 * 100) / 100,
        total:         Math.round((totalLongCO2 + totalLocalCO2) * 100) / 100,
      },
      mode_breakdown:   modeCounts,
      region_breakdown: regionCounts,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to process Luma guests', detail: err.message });
  }
};
