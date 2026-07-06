const PNW_CITIES = ['Tacoma', 'Bend', 'Seattle', 'Portland', 'Vancouver BC', 'Vancouver WA', 'Bellingham'];

function matchCity(geo) {
  const city = (geo.city || '').toLowerCase().trim();
  if (!city) return null;

  // Vancouver needs state/country disambiguation
  if (city === 'vancouver') {
    const region  = (geo.region || geo.state || geo.province || '').toLowerCase();
    const country = (geo.country || '').toLowerCase();
    if (region.includes('british columbia') || region === 'bc' || country.includes('canada')) return 'Vancouver BC';
    if (region.includes('washington') || region === 'wa' || country.includes('united states')) return 'Vancouver WA';
    return null; // can't distinguish — leave blank
  }

  return PNW_CITIES.find(c => c.toLowerCase().split(' ')[0] === city.split(' ')[0]) || null;
}

function extractPostal(geo) {
  if (!geo) return null;
  return geo.postal_code || geo.zip_code || geo.zip ||
    (geo.full_address || '').match(/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5}(-\d{4})?)\b/i)?.[0] || null;
}

function formatEvent(ev, hosts, guestCount) {
  const geo = ev.geo_address_json || ev.geo_address_info || {};
  const durationHours = (ev.start_at && ev.end_at)
    ? (new Date(ev.end_at) - new Date(ev.start_at)) / 3600000
    : null;
  const organizer = Array.isArray(hosts) && hosts.length
    ? hosts.map(h => h.name).filter(Boolean).join(', ')
    : null;
  return {
    event_name:     ev.name || null,
    date:           ev.start_at ? ev.start_at.slice(0, 10) : null,
    city:           matchCity(geo),
    venue_name:     geo.full_address || geo.description || null,
    duration_hours: durationHours,
    attendees:      ev.ticket_count?.sold || ev.guest_count || guestCount || null,
    postal_code:    extractPostal(geo),
    organizer,
    luma_event_id:  ev.api_id || ev.id || null,
  };
}

// Fetch via Luma public API (requires API key)
async function fetchViaAPI(eventId, apiKey) {
  const res = await fetch(
    `https://api.lu.ma/public/v1/event/get?id=${encodeURIComponent(eventId)}`,
    { headers: { 'x-luma-api-key': apiKey, 'accept': 'application/json' } }
  );
  if (!res.ok) throw new Error(`Luma API ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return formatEvent(body.event, body.hosts, body.event?.guest_count || body.guest_count);
}

// Fetch by scraping the public Luma page (no API key needed)
// Parses __NEXT_DATA__ (Next.js page props) or JSON-LD as fallback
async function fetchViaPage(eventId) {
  const res = await fetch(`https://lu.ma/${eventId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PNWClimateWeek-CarbonTracker/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`Luma page ${res.status}`);
  const html = await res.text();

  // 1. Try __NEXT_DATA__ — contains full event object matching API structure
  const nextMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (nextMatch) {
    try {
      const data = JSON.parse(nextMatch[1]);
      // Luma puts event under several possible paths
      const pageData = data?.props?.pageProps?.initialData?.data;
      const ev = pageData?.event
        || data?.props?.pageProps?.event
        || data?.props?.pageProps?.initialData?.event
        || data?.props?.pageProps?.data?.event;
      if (ev?.name) return formatEvent(ev, pageData?.hosts, pageData?.guest_count || pageData?.ticket_count);
    } catch (e) {}
  }

  // 2. Try JSON-LD structured data
  const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const m of ldMatches) {
    try {
      const ld = JSON.parse(m[1]);
      const ev = ld['@type'] === 'Event' ? ld : (Array.isArray(ld) ? ld.find(x => x['@type'] === 'Event') : null);
      if (!ev) continue;
      const loc = ev.location || {};
      const addr = loc.address || {};
      return {
        event_name:     ev.name || null,
        date:           ev.startDate ? ev.startDate.slice(0, 10) : null,
        city:           matchCity({ city: addr.addressLocality || loc.name, region: addr.addressRegion, country: addr.addressCountry }),
        venue_name:     loc.name || null,
        duration_hours: (ev.startDate && ev.endDate)
          ? (new Date(ev.endDate) - new Date(ev.startDate)) / 3600000
          : null,
        attendees:      null,
        postal_code:    addr.postalCode || null,
        organizer:      null,
      };
    } catch (e) {}
  }

  // 3. Open Graph fallback — name and date only
  const ogTitle = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] || null;
  const dtMatch = html.match(/(\d{4}-\d{2}-\d{2})/);
  if (ogTitle) {
    return {
      event_name:     ogTitle.replace(' | Luma', '').trim(),
      date:           dtMatch?.[1] || null,
      city:           null,
      venue_name:     null,
      duration_hours: null,
      attendees:      null,
      postal_code:    null,
      organizer:      null,
    };
  }

  throw new Error('Could not extract event data from page');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { url, id } = req.query;
  if (!url && !id) return res.status(400).json({ error: 'Provide ?url= or ?id=' });

  let eventId = id;
  if (!eventId && url) {
    try {
      eventId = new URL(url).pathname.replace(/^\//, '').split('/')[0];
    } catch {
      return res.status(400).json({ error: 'Invalid URL' });
    }
  }

  try {
    let data;
    if (process.env.LUMA_API_KEY) {
      try {
        data = await fetchViaAPI(eventId, process.env.LUMA_API_KEY);
      } catch {
        // API key exists but event is inaccessible (e.g. personal calendar) — fall back to scraping
        data = await fetchViaPage(eventId);
      }
    } else {
      data = await fetchViaPage(eventId);
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch event from Luma', detail: err.message });
  }
};
