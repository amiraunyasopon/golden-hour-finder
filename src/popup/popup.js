import { parseMapsUrl } from "../lib/maps.js";
import { getStatus, getLightTimes } from "../lib/sun.js";
import {
  resolveTimeZone,
  formatTime,
  formatDuration,
  formatCoords,
  dayFraction,
} from "../lib/format.js";

const $ = (id) => document.getElementById(id);
const hasChrome = typeof chrome !== "undefined" && chrome.storage;

let location = null; // { lat, lng, name, source, tz }
let timer = null;

// ---------- location ----------

async function activeTabUrl() {
  try {
    if (typeof chrome === "undefined" || !chrome.tabs) return null;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url ?? null;
  } catch {
    return null;
  }
}

async function loadSaved() {
  try {
    if (!hasChrome) return null;
    const { location: saved } = await chrome.storage.local.get("location");
    return saved ?? null;
  } catch {
    return null;
  }
}

async function save(loc) {
  try {
    if (hasChrome) await chrome.storage.local.set({ location: loc });
  } catch {
    /* storage is a convenience; ignore failures */
  }
}

function deviceLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Location isn't available in this browser."));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          name: "Your location",
          source: "device",
        }),
      () => reject(new Error("Couldn't get your location. Open a place in Google Maps, or allow location access.")),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

function setLocation(loc) {
  location = { ...loc, tz: resolveTimeZone(loc.lat, loc.lng) };
  showError("");
  render();
  clearInterval(timer);
  timer = setInterval(render, 30 * 1000);
}

// ---------- rendering ----------

const SOURCE_LABELS = {
  pin: "From Google Maps",
  view: "Map view",
  query: "From Google Maps",
  device: "Device location",
};

function showError(message) {
  const el = $("error");
  el.textContent = message;
  el.hidden = !message;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderStatus(status, now, tz) {
  const box = $("status");
  const title = $("status-title");
  const detail = $("status-detail");
  box.hidden = false;
  box.className = "status";

  if (status.current) {
    const c = status.current;
    box.classList.add(c.kind);
    title.textContent = `${c.label} now`;
    detail.textContent = `Ends in ${formatDuration(c.end - now)} (${formatTime(c.end, tz)})`;
  } else if (status.next) {
    const n = status.next;
    box.classList.add(n.kind);
    title.textContent = `Next: ${n.label}`;
    detail.textContent = `Starts in ${formatDuration(n.start - now)} (${formatTime(n.start, tz)})`;
  } else if (status.nextSun) {
    title.textContent = `Next: ${status.nextSun.label}`;
    detail.textContent = `In ${formatDuration(status.nextSun.time - now)} (${formatTime(status.nextSun.time, tz)})`;
  } else {
    title.textContent = "No sunrise or sunset today";
    detail.textContent = "The sun stays above or below the horizon at this latitude.";
  }
}

function renderTimeline(times, now, tz) {
  const line = $("timeline");
  line.replaceChildren();
  const segments = [
    [times.morningBlue, "blue"],
    [times.morningGolden, "golden"],
    [times.eveningGolden, "golden"],
    [times.eveningBlue, "blue"],
  ];
  for (const [range, kind] of segments) {
    if (!range) continue;
    const left = dayFraction(range.start, tz);
    const right = dayFraction(range.end, tz);
    if (right <= left) continue;
    const seg = el("div", `seg ${kind}`);
    seg.style.left = `${left * 100}%`;
    seg.style.width = `${(right - left) * 100}%`;
    line.append(seg);
  }
  for (const when of [times.sunrise, times.sunset]) {
    if (!when) continue;
    const tick = el("div", "sun-tick");
    tick.style.left = `${dayFraction(when, tz) * 100}%`;
    line.append(tick);
  }
  const marker = el("div", "now");
  marker.style.left = `${dayFraction(now, tz) * 100}%`;
  line.append(marker);
  $("timeline-wrap").hidden = false;
}

function renderRows(times, now, tz) {
  const rows = [];
  const addRange = (label, kind, range) =>
    range && rows.push({ label, kind, sort: range.start, end: range.end, text: `${formatTime(range.start, tz)} – ${formatTime(range.end, tz)}` });
  const addPoint = (label, when) =>
    when && rows.push({ label, kind: "sun", sort: when, end: when, text: formatTime(when, tz) });

  addRange("Morning blue hour", "blue", times.morningBlue);
  addRange("Morning golden hour", "golden", times.morningGolden);
  addPoint("Sunrise", times.sunrise);
  addRange("Evening golden hour", "golden", times.eveningGolden);
  addPoint("Sunset", times.sunset);
  addRange("Evening blue hour", "blue", times.eveningBlue);
  rows.sort((a, b) => a.sort - b.sort);

  const list = $("times");
  list.replaceChildren();
  for (const row of rows) {
    const li = el("li", row.end < now ? "past" : "");
    li.append(el("span", `dot ${row.kind}`), el("span", "name", row.label), el("span", "when", row.text));
    list.append(li);
  }
  list.hidden = rows.length === 0;
}

function render() {
  if (!location) return;
  const now = new Date();
  const { lat, lng, tz } = location;

  $("place").textContent = location.name || "Selected location";
  $("meta").textContent = `${formatCoords(lat, lng)} · ${tz}`;
  const badge = $("source");
  badge.textContent = SOURCE_LABELS[location.source] || "";
  badge.hidden = !badge.textContent;

  const times = getLightTimes(lat, lng, now);
  renderStatus(getStatus(lat, lng, now), now, tz);
  renderTimeline(times, now, tz);
  renderRows(times, now, tz);
}

// ---------- startup and events ----------

async function useDevice() {
  try {
    const loc = await deviceLocation();
    await save(loc);
    setLocation(loc);
  } catch (err) {
    showError(err.message);
  }
}

async function init() {
  // 1. A Google Maps tab wins: that's the place the person is looking at.
  const fromMaps = parseMapsUrl((await activeTabUrl()) || "");
  if (fromMaps) {
    setLocation(fromMaps);
    return;
  }
  // 2. Otherwise the last location they chose.
  const saved = await loadSaved();
  if (saved) {
    setLocation(saved);
    return;
  }
  // 3. Otherwise ask the browser.
  $("meta").textContent = "Finding your location…";
  await useDevice();
}

init();
