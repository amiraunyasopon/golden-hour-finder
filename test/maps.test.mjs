import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMapsUrl, isMapsUrl } from "../src/lib/maps.js";

test("uses the place pin over the viewport center", () => {
  const url =
    "https://www.google.com/maps/place/Griffith+Observatory/@34.1184,-118.3004,17z/data=!3m1!4b1!4m6!3m5!1s0x80c2b8:0x1!8m2!3d34.1184!4d-118.3004!16zm";
  const r = parseMapsUrl(url);
  assert.equal(r.source, "pin");
  assert.equal(r.lat, 34.1184);
  assert.equal(r.lng, -118.3004);
  assert.equal(r.name, "Griffith Observatory");
});

test("falls back to the map viewport center", () => {
  const r = parseMapsUrl("https://www.google.com/maps/@34.0522,-118.2437,12z");
  assert.deepEqual(r, { lat: 34.0522, lng: -118.2437, source: "view", name: null });
});

test("reads ?q=lat,lng and ?ll=", () => {
  assert.equal(parseMapsUrl("https://www.google.com/maps?q=34.1184,-118.3004").source, "query");
  assert.equal(parseMapsUrl("https://maps.google.com/maps?ll=40.7,-74.0").lat, 40.7);
});

test("handles southern and western hemispheres and other TLDs", () => {
  const r = parseMapsUrl("https://www.google.co.uk/maps/@-33.8688,151.2093,14z");
  assert.equal(r.lat, -33.8688);
  assert.equal(r.lng, 151.2093);
});

test("ignores non-Maps pages and bad coordinates", () => {
  assert.equal(parseMapsUrl("https://example.com/maps/@34.1,-118.3,12z"), null);
  assert.equal(parseMapsUrl("https://www.google.com/search?q=sunset"), null);
  assert.equal(parseMapsUrl("https://www.google.com/maps/@134.1,-118.3,12z"), null);
  assert.equal(parseMapsUrl("not a url"), null);
  assert.equal(isMapsUrl("chrome://extensions"), false);
});
