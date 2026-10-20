/* Small helpers shared by the public site and the admin page. No DOM access here. */

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

export function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/** Known values first (in the given order), then anything else alphabetically. */
export function orderedUnique(values, preferredOrder) {
  const set = new Set(values.filter(Boolean));
  const known = preferredOrder.filter(v => set.has(v));
  const extra = [...set].filter(v => !preferredOrder.includes(v)).sort((a, b) => a.localeCompare(b));
  return [...known, ...extra];
}

/** Straight-line (great-circle) distance in miles between two {lat, lng} points. */
export function milesBetween(a, b) {
  const R = 3958.8, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function distanceLabel(miles) {
  return miles < 1 ? "under 1 mi" : `${Math.round(miles).toLocaleString("en-US")} mi`;
}

/** "Peabody, MA" */
export function placeLabel(loc) {
  return [loc.town, loc.state].filter(Boolean).join(", ");
}

export function formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
