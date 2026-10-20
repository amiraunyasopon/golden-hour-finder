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

let location = null; // { lat, lng, name, source, tz, message }
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
    if (!navigator.geolocation) {
      const error = new Error("Location isn't available in this browser.");
      error.code = "unavailable";
      return reject(error);
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          name: null,
          source: "device",
        }),
      (error) => {
        const message =
          error.code === GeolocationPositionError.PERMISSION_DENIED
            ? "Location permission was denied. Allow access or open a place in Google Maps."
            : "Couldn't determine your location. Check your connection or open a place in Google Maps.";
        const locationError = new Error(message);
        locationError.code = error.code === GeolocationPositionError.PERMISSION_DENIED ? "denied" : "unavailable";
        reject(locationError);
      },
      { timeout: 8000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const address = data.address || {};
    const city = address.city || address.town || address.village || address.municipality || address.suburb;
    const region = address["ISO3166-2-lvl4"]?.replace(/^US-/, "") || address.country_code?.toUpperCase();
    return city ? { name: region ? `${city}, ${region}` : city, source: "OpenStreetMap" } : null;
  } catch {
    return null;
  }
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

function isTomorrow(date, now, timeZone) {
    const formatter = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone,
    });
    const parts = (value) => {
      const values = Object.fromEntries(formatter.formatToParts(value).map((part) => [part.type, part.value]));
      return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
    };
    return parts(date) - parts(now) === 24 * 60 * 60 * 1000;
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
    const when = formatTime(n.start, tz);
    detail.textContent = isTomorrow(n.start, now, tz)
      ? `Starts tomorrow at ${when} (in ${formatDuration(n.start - now)})`
      : `Starts in ${formatDuration(n.start - now)} (${when})`;
  } else if (status.nextSun) {
    title.textContent = `Next: ${status.nextSun.label}`;
    const when = formatTime(status.nextSun.time, tz);
    detail.textContent = isTomorrow(status.nextSun.time, now, tz)
      ? `Tomorrow, ${when} (in ${formatDuration(status.nextSun.time - now)})`
      : `In ${formatDuration(status.nextSun.time - now)} (${when})`;
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
  for (const [when, direction] of [[times.sunrise, "sunrise"], [times.sunset, "sunset"]]) {
    if (!when) continue;
    const tick = el("div", `sun-tick ${direction}`);
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
    range && rows.push({ label, kind, group: label.startsWith("Morning") ? "Morning" : "Evening", sort: range.start, end: range.end, text: `${formatTime(range.start, tz)} – ${formatTime(range.end, tz)}` });
  const addPoint = (label, when) =>
    when && rows.push({ label, kind: "sun", group: label === "Sunrise" ? "Morning" : "Evening", sort: when, end: when, text: formatTime(when, tz) });

  addRange("Morning blue hour", "blue", times.morningBlue);
  addRange("Morning golden hour", "golden", times.morningGolden);
  addPoint("Sunrise", times.sunrise);
  addRange("Evening golden hour", "golden", times.eveningGolden);
  addPoint("Sunset", times.sunset);
  addRange("Evening blue hour", "blue", times.eveningBlue);
  rows.sort((a, b) => a.sort - b.sort);

  const list = $("times");
  list.replaceChildren();
  for (const group of ["Morning", "Evening"]) {
    const groupRows = rows.filter((row) => row.group === group);
    if (groupRows.length === 0) continue;
    list.append(el("li", "group-title", group));
    for (const row of groupRows) {
      const li = el("li", now && row.end < now ? "past" : "");
      li.append(el("span", `dot ${row.kind}`), el("span", "name", row.label), el("span", "when", row.text));
      list.append(li);
    }
  }
  list.hidden = rows.length === 0;
}

function render() {
  if (!location) return;
  const now = new Date();
  const { lat, lng, tz } = location;
  const selectedDate = getSelectedDate(now, tz, selectedDayOffset);

  $("place").textContent = location.name || "Selected location";
  $("meta").textContent = location.message || "";
  $("meta").hidden = !location.message;
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
    const place = await reverseGeocode(loc.lat, loc.lng);
    loc.name = place?.name;
    if (!place) {
      loc.name = "Your location";
      loc.message = "Place name unavailable offline.";
    } else {
      loc.message = "Place name from OpenStreetMap.";
    }
    await save(loc);
    setLocation(loc);
  } catch (err) {
    $("place").textContent = err.code === "denied" ? "Location permission denied" : "Location unavailable";
    $("meta").textContent = err.message;
    $("meta").hidden = false;
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
  $("place").textContent = "Finding your location…";
  $("meta").textContent = "Allow location access to find nearby light times.";
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
