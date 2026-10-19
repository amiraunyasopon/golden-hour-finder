import * as SunCalc from "suncalc";

// Photographers' common definitions, by sun altitude:
//   golden hour: -4° to +6°
//   blue hour:   -8° to -4°
// SunCalc already provides +6° (goldenHour / goldenHourEnd); add the other angles once.
SunCalc.addTime(-4, "angleM4", "angleE4");
SunCalc.addTime(-8, "angleM8", "angleE8");

export const PHASES = [
  { id: "morningBlue", label: "Morning blue hour", kind: "blue" },
  { id: "morningGolden", label: "Morning golden hour", kind: "golden" },
  { id: "eveningGolden", label: "Evening golden hour", kind: "golden" },
  { id: "eveningBlue", label: "Evening blue hour", kind: "blue" },
];

const isValid = (d) => d instanceof Date && !Number.isNaN(d.getTime());

function range(start, end) {
  return isValid(start) && isValid(end) && end > start ? { start, end } : null;
}

/** Light times for the solar day nearest to `date`. Any value can be null (polar day/night). */
export function getLightTimes(lat, lng, date = new Date()) {
  const t = SunCalc.getTimes(date, lat, lng);
  return {
    sunrise: isValid(t.sunrise) ? t.sunrise : null,
    sunset: isValid(t.sunset) ? t.sunset : null,
    morningBlue: range(t.angleM8, t.angleM4),
    morningGolden: range(t.angleM4, t.goldenHourEnd),
    eveningGolden: range(t.goldenHour, t.angleE4),
    eveningBlue: range(t.angleE4, t.angleE8),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where "now" sits relative to the light phases.
 * Looks at yesterday, today and tomorrow so the next event is always found,
 * even late in the evening.
 */
export function getStatus(lat, lng, now = new Date()) {
  const instances = [];
  const suns = [];
  for (const offset of [-1, 0, 1]) {
    const times = getLightTimes(lat, lng, new Date(now.getTime() + offset * DAY_MS));
    for (const phase of PHASES) {
      const r = times[phase.id];
      if (r) instances.push({ ...phase, start: r.start, end: r.end });
    }
    if (times.sunrise) suns.push({ id: "sunrise", label: "Sunrise", time: times.sunrise });
    if (times.sunset) suns.push({ id: "sunset", label: "Sunset", time: times.sunset });
  }

  instances.sort((a, b) => a.start - b.start);
  suns.sort((a, b) => a.time - b.time);

  const current = instances.find((p) => p.start <= now && now < p.end) || null;
  const next = instances.find((p) => p.start > now) || null;
  const nextSun = suns.find((s) => s.time > now) || null;

  return { today: getLightTimes(lat, lng, now), current, next, nextSun };
}
