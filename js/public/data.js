/* Loading and cleaning location data for the public site.
   Order of preference: live Google Sheet -> saved copy in the repo -> error.
   Add ?demo=1 to the page URL to preview with sample data (no backend needed). */
import { CONFIG } from "../config.js";
import { milesBetween } from "../util.js";

const split = v => (Array.isArray(v) ? v : String(v ?? "").split(",")).map(s => String(s).trim()).filter(Boolean);
const num = v => (v === null || v === undefined || v === "" ? NaN : Number(v));

export function bandFor(miles) {
  return CONFIG.distanceBands.find(b => miles <= b.maxMiles) || CONFIG.distanceBands[CONFIG.distanceBands.length - 1];
}

/** Turns one raw row from the backend into the shape the page uses; null if unusable. */
export function normalize(row, idx) {
  const lat = num(row.lat), lng = num(row.lng);
  const name = String(row.name ?? "").trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const types = split(row.types);
  const miles = milesBetween(CONFIG.home, { lat, lng });
  return {
    id: String(row.id || `row-${idx}`),
    name,
    town: String(row.town ?? "").trim(),
    state: String(row.state ?? "").trim() || CONFIG.defaultState,
    lat, lng,
    programs: split(row.programs),
    types,
    primaryType: String(row.primaryType ?? "").trim() || types[0] || "Day Trip",
    amenities: split(row.amenities),
    desc: String(row.description ?? "").trim() || "No description provided yet.",
    address: String(row.address ?? "").trim(),
    phone: String(row.phone ?? "").trim(),
    email: String(row.email ?? "").trim(),
    website: String(row.website ?? "").trim(),
    lastUpdated: row.lastUpdated || "",
    miles,
    band: bandFor(miles).id
  };
}

async function getJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = timeoutMs ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const clean = rows => rows.map(normalize).filter(Boolean);

/** Returns { locations, source: "live" | "snapshot" | "demo", generated? }. Throws if nothing works. */
export async function loadLocations() {
  if (new URLSearchParams(location.search).has("demo")) {
    return { locations: clean((await getJson("data/demo-locations.json")).locations), source: "demo" };
  }
  try {
    const body = await getJson(`${CONFIG.gasUrl}?action=locations`, CONFIG.liveTimeoutMs);
    if (!body.ok) throw new Error(body.error || "The server returned an error.");
    const locations = clean(body.locations || []);
    if (!locations.length) throw new Error("The sheet returned no usable rows.");
    return { locations, source: "live" };
  } catch (err) {
    console.warn("Live data failed, trying the saved copy:", err);
  }
  const snap = await getJson(CONFIG.snapshotUrl);
  const locations = clean(snap.locations || []);
  if (!locations.length) throw new Error("No locations available.");
  return { locations, source: "snapshot", generated: snap.generated };
}
