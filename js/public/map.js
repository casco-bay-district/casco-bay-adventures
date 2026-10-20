/* The Leaflet map: tiles, pins, clustering, and moving the view around. */
import { CONFIG } from "../config.js";
import { getTypeMeta } from "../taxonomy.js";
import { escapeHtml, placeLabel } from "../util.js";

const mapEl = document.getElementById("map");
const map = L.map("map", { zoomControl: true }).setView([CONFIG.home.lat, CONFIG.home.lng], CONFIG.home.zoom);

// Esri "Light Gray Canvas": free, no API key, and its muted tone suits the palette.
// To change the basemap, replace the two tile URLs below.
const tiles = L.tileLayer("https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, and the GIS community',
  maxZoom: 16
}).addTo(map);
L.tileLayer("https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16, pane: "shadowPane" }).addTo(map);

// If tiles never load, show a note instead of an unexplained blank map.
let tilesLoaded = false;
tiles.on("load", () => { tilesLoaded = true; mapEl.classList.remove("tiles-unavailable"); });
tiles.on("tileerror", () => { if (!tilesLoaded) mapEl.classList.add("tiles-unavailable"); });
setTimeout(() => { if (!tilesLoaded) mapEl.classList.add("tiles-unavailable"); }, 4000);

const markers = new Map(); // location id -> Leaflet marker
const cluster = L.markerClusterGroup({ maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false }).addTo(map);

function makeIcon(type, active) {
  const meta = getTypeMeta(type);
  return L.divIcon({
    className: "",
    html: `<div class="marker-pin${active ? " active" : ""}" style="background:${meta.color}"><span>${meta.icon}</span></div>`,
    iconSize: active ? [40, 40] : [32, 32],
    iconAnchor: active ? [20, 40] : [16, 32],
    popupAnchor: [0, -30]
  });
}

export function buildMarkers(locations, onSelect) {
  cluster.clearLayers();
  markers.clear();
  locations.forEach(loc => {
    const m = L.marker([loc.lat, loc.lng], { icon: makeIcon(loc.primaryType, false), title: loc.name });
    m.bindPopup(`<div class="popup-title">${escapeHtml(loc.name)}</div><div>${escapeHtml(placeLabel(loc))}</div>`);
    m.on("click", () => onSelect(loc.id, true));
    markers.set(loc.id, m);
  });
}

/** Shows only the pins whose ids are in the set (all filtered results, not just the current list page). */
export function showOnly(ids) {
  markers.forEach((m, id) => {
    const want = ids.has(id);
    if (want && !cluster.hasLayer(m)) cluster.addLayer(m);
    if (!want && cluster.hasLayer(m)) cluster.removeLayer(m);
  });
}

export function highlight(prevLoc, loc) {
  if (prevLoc && markers.has(prevLoc.id)) markers.get(prevLoc.id).setIcon(makeIcon(prevLoc.primaryType, false));
  if (loc && markers.has(loc.id)) markers.get(loc.id).setIcon(makeIcon(loc.primaryType, true));
}

/** Pans/zooms to a location (de-clustering it first) and opens its popup. */
export function focus(loc) {
  const m = markers.get(loc.id);
  if (!m) return;
  cluster.zoomToShowLayer(m, () => {
    if (map.getZoom() < 12) {
      map.once("moveend", () => m.openPopup());
      map.setView([loc.lat, loc.lng], 12, { animate: true });
    } else {
      m.openPopup();
    }
  });
}

// A fit requested while the map is hidden (phone, other tab) waits until it is visible.
let pendingFit = null;
const visible = () => mapEl.offsetWidth > 0 && mapEl.offsetHeight > 0;

export function fitTo(locs) {
  if (!locs.length) return;
  if (!visible()) { pendingFit = locs; return; }
  pendingFit = null;
  map.fitBounds(L.latLngBounds(locs.map(l => [l.lat, l.lng])), { padding: [48, 48], maxZoom: 11 });
}

export function resetView() {
  pendingFit = null;
  map.setView([CONFIG.home.lat, CONFIG.home.lng], CONFIG.home.zoom);
}

export function refreshSize() {
  map.invalidateSize();
  if (pendingFit) fitTo(pendingFit);
}

export function buildLegend(legendEl, types) {
  legendEl.innerHTML = "<strong>Pin key</strong>" + types.map(t =>
    `<div class="legend-row"><span class="legend-dot" style="background:${getTypeMeta(t).color}"></span>${escapeHtml(t)}</div>`
  ).join("");
}
