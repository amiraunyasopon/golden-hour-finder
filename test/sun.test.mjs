import { test } from "node:test";
import assert from "node:assert/strict";
import { getLightTimes, getStatus } from "../src/lib/sun.js";
import { dayFraction, formatDuration, resolveTimeZone } from "../src/lib/format.js";

const LA = { lat: 34.0522, lng: -118.2437 };
const noonLA = new Date("2026-10-19T19:00:00Z"); // 12:00 PDT
const minutes = (d, tz) => Math.round(dayFraction(d, tz) * 1440);

test("resolves the time zone from coordinates", () => {
  assert.equal(resolveTimeZone(LA.lat, LA.lng), "America/Los_Angeles");
  assert.equal(resolveTimeZone(35.6762, 139.6503), "Asia/Tokyo");
});

test("Los Angeles sunrise and sunset are plausible in mid October", () => {
  const tz = "America/Los_Angeles";
  const t = getLightTimes(LA.lat, LA.lng, noonLA);
  const rise = minutes(t.sunrise, tz);
  const set = minutes(t.sunset, tz);
  assert.ok(rise > 6 * 60 + 40 && rise < 7 * 60 + 20, `sunrise at ${rise} min`);
  assert.ok(set > 17 * 60 + 45 && set < 18 * 60 + 30, `sunset at ${set} min`);
});

test("phases are ordered through the day", () => {
  const t = getLightTimes(LA.lat, LA.lng, noonLA);
  const order = [
    t.morningBlue.start,
    t.morningBlue.end,
    t.morningGolden.end,
    t.eveningGolden.start,
    t.sunset,
    t.eveningGolden.end,
    t.eveningBlue.end,
  ];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], `index ${i}`);
  assert.equal(t.morningBlue.end.getTime(), t.morningGolden.start.getTime());
  assert.equal(t.eveningGolden.end.getTime(), t.eveningBlue.start.getTime());
  assert.ok(t.sunrise > t.morningGolden.start && t.sunrise < t.morningGolden.end);
});

test("status reports the current and next phase", () => {
  const t = getLightTimes(LA.lat, LA.lng, noonLA);
  const inEveningGolden = new Date((t.eveningGolden.start.getTime() + t.eveningGolden.end.getTime()) / 2);
  const s = getStatus(LA.lat, LA.lng, inEveningGolden);
  assert.equal(s.current.id, "eveningGolden");
  assert.equal(s.next.id, "eveningBlue" in s ? s.next.id : "eveningBlue");

  const midday = getStatus(LA.lat, LA.lng, noonLA);
  assert.equal(midday.current, null);
  assert.equal(midday.next.id, "eveningGolden");
  assert.equal(midday.nextSun.id, "sunset");
});

test("late at night the next event is tomorrow morning", () => {
  const night = new Date("2026-10-20T08:00:00Z"); // 1:00 AM PDT
  const s = getStatus(LA.lat, LA.lng, night);
  assert.equal(s.current, null);
  assert.equal(s.next.id, "morningBlue");
  assert.ok(s.next.start > night);
});

test("polar day does not throw and reports no sunset", () => {
  const svalbard = getLightTimes(78.22, 15.63, new Date("2026-06-21T12:00:00Z"));
  assert.equal(svalbard.sunset, null);
  const status = getStatus(78.22, 15.63, new Date("2026-06-21T12:00:00Z"));
  assert.equal(status.nextSun, null);
});

test("formats durations", () => {
  assert.equal(formatDuration(30_000), "<1m");
  assert.equal(formatDuration(40 * 60_000), "40m");
  assert.equal(formatDuration(95 * 60_000), "1h 35m");
  assert.equal(formatDuration(120 * 60_000), "2h");
});
