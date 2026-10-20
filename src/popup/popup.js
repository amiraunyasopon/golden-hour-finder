import { parseMapsUrl } from "../lib/maps.js";
import { getStatus, getLightTimes } from "../lib/sun.js";
import {
  resolveTimeZone,
  formatTime,
  formatDate,
  formatDuration,
} from "../lib/format.js";

const $ = (id) => document.getElementById(id);
const hasChrome = typeof chrome !== "undefined" && chrome.storage;

let location = null; // { lat, lng, name, source, tz }
let timer = null;
let selectedDayOffset = 0;

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
  const name = loc.name || (loc.source === "device" ? "Your location" : "Google Maps location");
  location = { ...loc, name, tz: resolveTimeZone(loc.lat, loc.lng) };
  selectedDayOffset = 0;
  showError("");
  render();
  clearInterval(timer);
  timer = setInterval(render, 30 * 1000);
}

// ---------- rendering ----------

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

function getSelectedDate(now, tz, dayOffset) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: tz,
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") + dayOffset, 12));
}

function renderDayNavigation(date, tz) {
  const selectedDate = $("selected-date");
  selectedDate.textContent = formatDate(date, tz);
  selectedDate.dateTime = date.toISOString().slice(0, 10);
  $("previous-day").disabled = selectedDayOffset === 0;
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
  const ticks = $("timeline-ticks");
  line.replaceChildren();
  ticks.replaceChildren();
  const firstLight = times.morningBlue?.start || times.morningGolden?.start || times.sunrise;
  const lastLight = times.eveningBlue?.end || times.eveningGolden?.end || times.sunset;
  if (!firstLight || !lastLight || lastLight <= firstLight) {
    $("timeline-wrap").hidden = true;
    return;
  }
  const start = firstLight.getTime() - 60 * 60 * 1000;
  const end = lastLight.getTime() + 60 * 60 * 1000;
  const position = (date) => Math.max(0, Math.min(1, (date.getTime() - start) / (end - start)));
  const segments = [
    [times.morningBlue, "blue", "Morning blue hour"],
    [times.morningGolden, "golden", "Morning golden hour"],
    [times.eveningGolden, "golden", "Evening golden hour"],
    [times.eveningBlue, "blue", "Evening blue hour"],
  ];
  for (const [range, kind, label] of segments) {
    if (!range) continue;
    const left = position(range.start);
    const right = position(range.end);
    if (right <= left) continue;
    const alignment = left < 0.15 ? "tooltip-left" : right > 0.85 ? "tooltip-right" : "";
    const seg = el("div", `seg ${kind} ${alignment}`);
    seg.dataset.label = label;
    seg.setAttribute("aria-label", label);
    seg.style.left = `${left * 100}%`;
    seg.style.width = `${(right - left) * 100}%`;
    line.append(seg);
  }
  for (const when of [times.sunrise, times.sunset]) {
    if (!when) continue;
    const tick = el("div", "sun-tick");
    tick.style.left = `${position(when) * 100}%`;
    line.append(tick);
  }
  if (now) {
    const marker = el("div", "now");
    marker.style.left = `${position(now) * 100}%`;
    line.append(marker);
  }
  const labelTimes = [{ time: times.sunrise, className: "start" }];
  if (times.sunrise && times.sunset) {
    labelTimes.push({
      time: new Date((times.sunrise.getTime() + times.sunset.getTime()) / 2),
      className: "middle",
    });
  }
  labelTimes.push({ time: times.sunset, className: "end" });
  for (const { time, className } of labelTimes) {
    if (!time) continue;
    const label = el("span", className, formatTime(time, tz));
    label.style.left = `${position(time) * 100}%`;
    ticks.append(label);
  }
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
    const li = el("li", now && row.end < now ? "past" : "");
    li.append(el("span", `dot ${row.kind}`), el("span", "name", row.label), el("span", "when", row.text));
    list.append(li);
  }
  list.hidden = rows.length === 0;
}

function render() {
  if (!location) return;
  const now = new Date();
  const { lat, lng, tz } = location;
  const selectedDate = getSelectedDate(now, tz, selectedDayOffset);

  $("place").textContent = location.name || "Selected location";
  $("meta").textContent = "";
  $("meta").hidden = true;
  const times = getLightTimes(lat, lng, selectedDate);
  renderStatus(getStatus(lat, lng, now), now, tz);
  renderDayNavigation(selectedDate, tz);
  renderTimeline(times, selectedDayOffset === 0 ? now : null, tz);
  renderRows(times, selectedDayOffset === 0 ? now : null, tz);
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
  $("meta").hidden = false;
  await useDevice();
}

init();

$("previous-day").addEventListener("click", () => {
  if (selectedDayOffset === 0) return;
  selectedDayOffset -= 1;
  render();
});

$("next-day").addEventListener("click", () => {
  selectedDayOffset += 1;
  render();
});
