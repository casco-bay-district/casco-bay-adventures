/* Entry point for the public site: loads data, then wires the pieces together. */
import { CONFIG } from "../config.js";
import { escapeHtml, formatDate } from "../util.js";
import { loadLocations } from "./data.js";
import { state, resetState, getFiltered, buildFilterUI, typeOptions } from "./filters.js";
import * as mapView from "./map.js";
import * as view from "./view.js";

let LOCATIONS = [];
const $ = id => document.getElementById(id);

function render() {
  const filtered = getFiltered(LOCATIONS);
  view.renderList(filtered, state, selectLocation);
  mapView.showOnly(new Set(filtered.map(l => l.id)));
  return filtered;
}

function selectLocation(id, pan) {
  const loc = LOCATIONS.find(l => l.id === id);
  if (!loc) return;
  const prev = LOCATIONS.find(l => l.id === state.selectedId);
  state.selectedId = id;
  mapView.highlight(prev, loc);
  if (pan) mapView.focus(loc);
  view.showDetail(loc);
  if (view.isMobile()) goMobile("map");
}

function goMobile(name) {
  view.setMobileView(name);
  if (name === "map") setTimeout(mapView.refreshSize, 150);
}

/** A filter checkbox changed. Changing Distance also moves the map so far-away pins are in view. */
function onFilterChange(key) {
  const filtered = render();
  if (key !== "bands") return;
  if (state.bands.length) mapView.fitTo(filtered);
  else mapView.resetView();
}

function wireControls() {
  document.querySelectorAll(".filter-group-head").forEach(btn => btn.addEventListener("click", () => {
    const group = btn.parentElement;
    group.classList.toggle("collapsed");
    btn.setAttribute("aria-expanded", String(!group.classList.contains("collapsed")));
  }));

  $("searchInput").addEventListener("input", e => {
    state.search = e.target.value.trim().toLowerCase();
    state.page = 1;
    render();
  });

  $("resetBtn").addEventListener("click", () => {
    resetState();
    document.querySelectorAll(".filter-options input[type=checkbox]").forEach(cb => (cb.checked = false));
    $("searchInput").value = "";
    render();
    mapView.resetView();
  });

  $("pagerPrev").addEventListener("click", () => { state.page--; render(); $("resultsList").scrollTop = 0; });
  $("pagerNext").addEventListener("click", () => { state.page++; render(); $("resultsList").scrollTop = 0; });

  $("backBtn").addEventListener("click", () => {
    view.hideDetail();
    render();
    if (view.isMobile()) goMobile("list");
  });

  document.querySelectorAll(".mobile-tabs button").forEach(b => b.addEventListener("click", () => goMobile(b.dataset.view)));
  window.addEventListener("resize", () => mapView.refreshSize());
}

async function init() {
  wireControls();

  let result;
  try {
    result = await loadLocations();
  } catch (err) {
    console.error(err);
    view.showError("We couldn't load the locations right now. Please try again later or contact the district.");
    $("resultPill").textContent = "— adventures";
    return;
  }

  LOCATIONS = result.locations;
  view.setSourcePill(result.source);
  if (result.source === "snapshot") {
    const when = formatDate(result.generated);
    view.setBanner(`Showing a saved copy${when ? ` from ${escapeHtml(when)}` : ""} — the live sheet couldn't be reached, so very recent changes may be missing.`);
  } else if (result.source === "demo") {
    view.setBanner("Demo data for previewing the site — not real locations.");
  }

  buildFilterUI(LOCATIONS, onFilterChange);
  mapView.buildMarkers(LOCATIONS, selectLocation);
  mapView.buildLegend($("legend"), typeOptions(LOCATIONS));
  render();
  setTimeout(mapView.refreshSize, 150);
}

init();
