import tzlookup from "tz-lookup";

/** IANA time zone for a coordinate, falling back to the browser's zone. */
export function resolveTimeZone(lat, lng) {
  try {
    return tzlookup(lat, lng);
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

export function formatTime(date, timeZone) {
  return new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

export function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(date);
}

/** Fraction of the local day (0..1) that `date` falls at, in the given zone. */
export function dayFraction(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    timeZone,
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return (get("hour") * 60 + get("minute")) / 1440;
}

/** 95 minutes -> "1h 35m"; 40 minutes -> "40m"; under a minute -> "<1m". */
export function formatDuration(ms) {
  if (ms < 60000) return "<1m";
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatCoords(lat, lng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
