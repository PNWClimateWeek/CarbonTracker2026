const PNW_CITIES = ['Tacoma', 'Bend', 'Seattle', 'Portland', 'Vancouver BC', 'Bellingham'];

function matchCity(lumaCity) {
  if (!lumaCity) return null;
  const lower = lumaCity.toLowerCase();
  return PNW_CITIES.find(c => c.toLowerCase().split(' ')[0] === lower.split(' ')[0]) || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.LUMA_API_KEY) return res.status(500).json({ error: 'LUMA_API_KEY not configured' });

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
    const lumaRes = await fetch(
      `https://api.lu.ma/public/v1/event/get?event_id=${encodeURIComponent(eventId)}`,
      { headers: { 'x-luma-api-key': process.env.LUMA_API_KEY, 'accept': 'application/json' } }
    );

    if (!lumaRes.ok) {
      return res.status(lumaRes.status).json({ error: 'Luma API error', detail: await lumaRes.text() });
    }

    const { event: ev } = await lumaRes.json();

    const durationHours = (ev.start_at && ev.end_at)
      ? (new Date(ev.end_at) - new Date(ev.start_at)) / 3600000
      : null;

    return res.status(200).json({
      event_name:     ev.name || null,
      date:           ev.start_at ? ev.start_at.slice(0, 10) : null,
      city:           matchCity(ev.geo_address_info?.city),
      venue_name:     ev.geo_address_info?.description || ev.geo_address_info?.full_address || null,
      duration_hours: durationHours,
      attendees:      ev.ticket_count?.sold || ev.guest_count || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch from Luma', detail: err.message });
  }
};
