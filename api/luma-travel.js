// Luma Travel Emissions — skeleton
// Pulls per-attendee zip + mode answers from Luma registration, calculates travel CO2e
//
// TODO: verify actual field names in Luma guest response with a live API key + real event.
// Known registration questions (matched by label substring):
//   "What is your current residential zip code?"
//   "What is your primary mode of transport to the Pacific Northwest region for Climate Week?"
//   "What is your primary mode of transport to and from this event?"

const LONG_DIST_DEFAULT_KM = 300;
const LOCAL_DIST_DEFAULT_KM = 8;

const LONG_MODE_LABELS = {
  'n/a (local)': 0,
  'bus':         0.044,
  'train':       null, // region-dependent — see getTrainEF()
  'car':         0.191,
  'flight':      0.255,
};

const LOCAL_MODE_LABELS = {
  'walk/bike': 0,
  'transit':   null, // region-dependent — see getTransitEF()
  'car':       0.191,
};

function getRegion(zip) {
  if (!zip) return 'national';
  const z = zip.trim().toUpperCase();
  if (/^V/.test(z))      return 'bc';
  if (/^[A-Z]/.test(z)) return 'canada';
  const pre = parseInt(z.substring(0, 3), 10);
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
  const ef = LONG_MODE_LABELS[mode];
  if (ef === null) return getTrainEF(region);
  return ef ?? null;
}

function getLocalEF(mode, region) {
  const ef = LOCAL_MODE_LABELS[mode];
  if (ef === null) return getTransitEF(region);
  return ef ?? null;
}

// Extract a registration answer by matching a substring of the question label.
// TODO: confirm Luma's field structure. Expected shape (to verify):
//   guest.registration_answers = [{ label: "...", answer: "..." }, ...]
// May also be: guest.answers, or nested under event_ticket.registration_answers, etc.
function getAnswer(registrationAnswers, labelSubstring) {
  if (!Array.isArray(registrationAnswers)) return null;
  const match = registrationAnswers.find(a =>
    (a.label || a.question || '').toLowerCase().includes(labelSubstring.toLowerCase())
  );
  // TODO: confirm the answer field name — may be `answer`, `response`, `value`
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

    if (!res.ok) throw new Error(`Luma API error ${res.status}: ${await res.text()}`);

    const data = await res.json();

    // TODO: confirm top-level shape — may be data.entries, data.guests, data.data, etc.
    const entries = data.entries || data.guests || data.data || [];
    for (const entry of entries) {
      // TODO: confirm guest object path — may be entry.guest, entry, etc.
      guests.push(entry.guest || entry);
    }

    cursor = data.has_more ? (data.next_cursor || data.pagination?.next_cursor || null) : null;
    page++;
    if (page > 50) break; // safety cap at 50 pages (~5,000 attendees)
  } while (cursor);

  return guests;
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
    const guests = await fetchAllGuests(eventId, process.env.LUMA_API_KEY);

    let totalLongCO2 = 0;
    let totalLocalCO2 = 0;
    const modeCounts = { long: {}, local: {} };
    const regionCounts = {};
    let parsed = 0;
    let skipped = 0;

    for (const guest of guests) {
      // TODO: confirm where registration answers live on the guest object
      const answers = guest.registration_answers || guest.answers || [];

      const zip      = getAnswer(answers, 'residential zip code');
      const longMode = (getAnswer(answers, 'mode of transport to the Pacific Northwest') || '').toLowerCase().trim();
      const localMode= (getAnswer(answers, 'mode of transport to and from this event') || '').toLowerCase().trim();

      if (!longMode && !localMode) { skipped++; continue; }

      const region   = getRegion(zip);
      const longEF   = getLongEF(longMode, region);
      const localEF  = getLocalEF(localMode, region);

      if (longEF  !== null) totalLongCO2  += LONG_DIST_DEFAULT_KM  * 2 * longEF;
      if (localEF !== null) totalLocalCO2 += LOCAL_DIST_DEFAULT_KM * 2 * localEF;

      modeCounts.long[longMode]   = (modeCounts.long[longMode]   || 0) + 1;
      modeCounts.local[localMode] = (modeCounts.local[localMode] || 0) + 1;
      regionCounts[region]        = (regionCounts[region]        || 0) + 1;
      parsed++;
    }

    return res.status(200).json({
      event_id:              eventId,
      total_guests_fetched:  guests.length,
      guests_parsed:         parsed,
      guests_skipped:        skipped,
      long_dist_default_km:  LONG_DIST_DEFAULT_KM,
      local_dist_default_km: LOCAL_DIST_DEFAULT_KM,
      travel_co2_kg: {
        long_distance: Math.round(totalLongCO2  * 100) / 100,
        local:         Math.round(totalLocalCO2 * 100) / 100,
        total:         Math.round((totalLongCO2 + totalLocalCO2) * 100) / 100,
      },
      mode_breakdown: modeCounts,
      region_breakdown: regionCounts,
    });

  } catch (err) {
    return res.status(500).json({ error: 'Failed to process Luma guests', detail: err.message });
  }
};
