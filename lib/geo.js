// Zip / postal code → coordinates via Zippopotam.us (free, no API key)
// US: full 5-digit zip. Canada: first 3 characters (FSA) of postal code.

async function getZipCoords(zip) {
  if (!zip) return null;
  const z = zip.trim().toUpperCase().replace(/\s/g, '');
  if (!z) return null;

  let url;
  if (/^[A-Z]/.test(z)) {
    url = `https://api.zippopotam.us/ca/${encodeURIComponent(z.substring(0, 3))}`;
  } else {
    const digits = z.replace(/\D/g, '');
    if (digits.length !== 5) return null;
    url = `https://api.zippopotam.us/us/${digits}`;
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    const lat = parseFloat(place.latitude);
    const lon = parseFloat(place.longitude);
    return (isFinite(lat) && isFinite(lon)) ? { lat, lon } : null;
  } catch {
    return null;
  }
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { haversine, getZipCoords };
