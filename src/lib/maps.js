// Extracts coordinates from a Google Maps URL. Works on the URL string only,
// so no Maps API key, scraping, or extra permissions are needed.

const NUM = "-?\\d+(?:\\.\\d+)?";

function validCoords(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

function result(lat, lng, source, name) {
  lat = Number(lat);
  lng = Number(lng);
  if (!validCoords(lat, lng)) return null;
  return { lat, lng, source, name: name || null };
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

function placeName(pathname) {
  const m = pathname.match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  const name = safeDecode(m[1]).replace(/\+/g, " ").trim();
  // A "place" that is just coordinates isn't a useful name.
  return new RegExp(`^${NUM}\\s*,\\s*${NUM}$`).test(name) ? null : name || null;
}

export function isMapsUrl(urlString) {
  try {
    const url = new URL(urlString);
    return /(^|\.)google\.[a-z.]+$/i.test(url.hostname) && url.pathname.startsWith("/maps");
  } catch {
    return false;
  }
}

/**
 * Returns { lat, lng, name, source } or null.
 * source: "pin"   - the selected place (!3d/!4d), most accurate
 *         "query" - ?q=lat,lng, ?ll=lat,lng or /search/lat,lng
 *         "view"  - center of the map viewport (@lat,lng,zoom)
 */
export function parseMapsUrl(urlString) {
  if (!isMapsUrl(urlString)) return null;
  const url = new URL(urlString);
  const path = safeDecode(url.pathname);
  const name = placeName(path);

  // 1. Pin of the selected place. Use the last pair; earlier ones can describe the viewport.
  const pins = [...path.matchAll(new RegExp(`!3d(${NUM})!4d(${NUM})`, "g"))];
  if (pins.length) {
    const last = pins[pins.length - 1];
    const r = result(last[1], last[2], "pin", name);
    if (r) return r;
  }

  // 2. Explicit coordinates in the query string or path.
  const pair = new RegExp(`^\\s*(${NUM})\\s*,\\s*(${NUM})\\s*$`);
  for (const key of ["q", "query", "ll", "center"]) {
    const m = (url.searchParams.get(key) || "").match(pair);
    if (m) {
      const r = result(m[1], m[2], "query", name);
      if (r) return r;
    }
  }
  const pathPair = path.match(new RegExp(`/maps/(?:search|place)/(${NUM}),\\s*(${NUM})(?:/|$)`));
  if (pathPair) {
    const r = result(pathPair[1], pathPair[2], "query", name);
    if (r) return r;
  }

  // 3. Center of the map viewport.
  const view = path.match(new RegExp(`@(${NUM}),(${NUM})`));
  if (view) return result(view[1], view[2], "view", name);

  return null;
}
