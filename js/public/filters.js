/* Filter state, the filtering rule itself, and the checkbox UI. */
import { CONFIG } from "../config.js";
import { PROGRAM_ORDER, TYPE_ORDER, AMENITY_ORDER } from "../taxonomy.js";
import { escapeHtml, orderedUnique } from "../util.js";

const fresh = () => ({ programs: [], types: [], bands: [], amenities: [], search: "", selectedId: null, page: 1 });
export const state = fresh();
export const resetState = () => Object.assign(state, fresh());

/* Rules: Program / Type / Distance match ANY checked value; Amenities must ALL match.
   Results are sorted nearest-first. */
export function getFiltered(locations) {
  return locations
    .filter(l => {
      if (state.programs.length && !l.programs.some(p => state.programs.includes(p))) return false;
      if (state.types.length && !l.types.some(t => state.types.includes(t))) return false;
      if (state.bands.length && !state.bands.includes(l.band)) return false;
      if (state.amenities.length && !state.amenities.every(a => l.amenities.includes(a))) return false;
      if (state.search && !`${l.name} ${l.town} ${l.state}`.toLowerCase().includes(state.search)) return false;
      return true;
    })
    .sort((a, b) => a.miles - b.miles);
}

export const typeOptions = locations => orderedUnique(locations.flatMap(l => l.types), TYPE_ORDER);

function buildGroup(containerId, options, stateKey, onChange) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  options.forEach(({ value, label }) => {
    const wrap = document.createElement("label");
    wrap.className = "option";
    wrap.innerHTML = `<input type="checkbox" value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span>`;
    wrap.querySelector("input").addEventListener("change", e => {
      const arr = state[stateKey];
      if (e.target.checked) arr.push(value);
      else if (arr.includes(value)) arr.splice(arr.indexOf(value), 1);
      state.page = 1;
      onChange(stateKey);
    });
    el.appendChild(wrap);
  });
}

/** Builds every filter group from whatever values the loaded data actually contains. */
export function buildFilterUI(locations, onChange) {
  const same = v => ({ value: v, label: v });
  const present = new Set(locations.map(l => l.band));
  buildGroup("opts-programs", orderedUnique(locations.flatMap(l => l.programs), PROGRAM_ORDER).map(same), "programs", onChange);
  buildGroup("opts-types", typeOptions(locations).map(same), "types", onChange);
  buildGroup("opts-bands", CONFIG.distanceBands.filter(b => present.has(b.id)).map(b => ({ value: b.id, label: b.label })), "bands", onChange);
  buildGroup("opts-amenities", orderedUnique(locations.flatMap(l => l.amenities), AMENITY_ORDER).map(same), "amenities", onChange);
  // Nothing to filter on if every location is in the same distance band.
  document.querySelector('[data-group="bands"]').hidden = present.size < 2;
}
