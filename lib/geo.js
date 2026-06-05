// Haversine distance + zip/postal code → approximate coordinates
// Uses state/province centroids — accurate enough for travel distance estimates

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// [min_prefix, max_prefix, lat, lon]  — US zip 3-digit prefix ranges
const US_RANGES = [
  [1,   9,   42.0, -71.8],  // MA/CT/RI/NH/ME/VT
  [10,  14,  40.7, -74.0],  // NY-Metro
  [15,  19,  40.3, -77.0],  // PA
  [20,  20,  38.9, -77.0],  // DC
  [21,  21,  39.3, -76.6],  // MD
  [22,  24,  37.4, -78.8],  // VA
  [25,  26,  38.6, -80.4],  // WV
  [27,  28,  35.5, -79.4],  // NC
  [29,  29,  33.8, -81.2],  // SC
  [30,  31,  33.2, -83.4],  // GA
  [32,  34,  27.8, -81.5],  // FL
  [35,  36,  32.8, -86.8],  // AL
  [37,  38,  35.5, -86.5],  // TN
  [39,  39,  32.5, -89.8],  // MS
  [40,  42,  37.8, -85.5],  // KY
  [43,  45,  40.4, -82.7],  // OH
  [46,  47,  39.8, -86.2],  // IN
  [48,  49,  44.3, -85.4],  // MI
  [50,  52,  42.0, -93.5],  // IA
  [53,  54,  44.5, -89.5],  // WI
  [55,  56,  46.4, -93.2],  // MN
  [57,  57,  44.4, -100.3], // SD
  [58,  58,  47.5, -100.3], // ND
  [59,  59,  46.9, -110.4], // MT
  [60,  62,  40.0, -89.2],  // IL
  [63,  65,  38.4, -92.5],  // MO
  [66,  67,  38.5, -98.4],  // KS
  [68,  69,  41.5, -99.7],  // NE
  [70,  71,  30.5, -92.1],  // LA
  [72,  72,  34.8, -92.2],  // AR
  [73,  74,  35.6, -97.5],  // OK
  [75,  79,  31.5, -99.3],  // TX
  [80,  81,  39.1, -105.4], // CO
  [82,  82,  43.0, -107.6], // WY
  [83,  83,  44.1, -114.7], // ID
  [84,  84,  39.4, -111.1], // UT
  [85,  86,  34.3, -111.8], // AZ
  [87,  88,  34.5, -106.1], // NM
  [89,  89,  38.5, -117.1], // NV
  [90,  90,  34.0, -118.2], // CA-LA
  [91,  91,  34.4, -118.6], // CA-LA suburbs
  [92,  92,  33.8, -117.2], // CA-Orange/Riverside
  [93,  93,  36.3, -119.2], // CA-Central Valley
  [94,  94,  37.8, -122.3], // CA-Bay Area
  [95,  95,  38.3, -121.8], // CA-Sacramento
  [96,  96,  40.8, -122.4], // CA-Northern
  [967, 969, 20.9, -157.0], // HI
  [97,  97,  44.0, -120.5], // OR
  [98,  98,  47.5, -120.5], // WA
  [99,  99,  64.2, -153.0], // AK
];

// Canadian province centroids by first letter of postal code
const CA_PROVINCE = {
  A: [48.5,  -55.8],  // Newfoundland
  B: [44.7,  -63.5],  // Nova Scotia
  C: [46.2,  -63.1],  // PEI
  E: [46.5,  -66.5],  // New Brunswick
  G: [46.8,  -71.2],  // Quebec
  H: [45.5,  -73.6],  // Montreal
  J: [45.6,  -72.9],  // Quebec-south
  K: [44.8,  -76.5],  // Ontario-east
  L: [44.0,  -79.6],  // Ontario-south
  M: [43.7,  -79.4],  // Toronto
  N: [43.2,  -81.2],  // Ontario-southwest
  P: [46.5,  -81.0],  // Ontario-north
  R: [49.9,  -97.1],  // Manitoba
  S: [52.9,  -106.5], // Saskatchewan
  T: [53.9,  -113.6], // Alberta
  V: [49.3,  -123.1], // BC
  X: [62.5,  -113.0], // NWT/Nunavut
  Y: [60.7,  -135.1], // Yukon
};

function getZipCoords(zip) {
  if (!zip) return null;
  const z = zip.trim().toUpperCase().replace(/\s/g, '');
  if (!z) return null;

  // Canadian postal code — starts with a letter
  if (/^[A-Z]/.test(z)) {
    const coords = CA_PROVINCE[z[0]];
    return coords ? { lat: coords[0], lon: coords[1] } : null;
  }

  // US zip — numeric
  const digits = z.replace(/\D/g, '');
  if (!digits) return null;
  const pre = parseInt(digits.substring(0, 3), 10);

  for (const [min, max, lat, lon] of US_RANGES) {
    if (pre >= min && pre <= max) return { lat, lon };
  }
  return null;
}

function distanceKm(zip, eventLat, eventLon) {
  const coords = getZipCoords(zip);
  if (!coords) return null;
  return Math.round(haversine(coords.lat, coords.lon, eventLat, eventLon));
}

module.exports = { haversine, getZipCoords, distanceKm };
