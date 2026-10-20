/* Talking to the outside world: the Apps Script backend and OpenStreetMap address search. */
import { CONFIG } from "../config.js";

const TOKEN_KEY = "cba_admin_token";
export const token = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: t => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY)
};

export async function callBackend(payload) {
  const res = await fetch(CONFIG.gasUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // keeps this a "simple" request, so no CORS preflight against Apps Script
    body: JSON.stringify(payload)
  });
  return res.json();
}

/** Free OpenStreetMap search. Returns [{ name, town, state, lat, lng, address }]. */
export async function searchAddress(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&namedetails=1&limit=5" +
    `&countrycodes=${encodeURIComponent(CONFIG.searchCountries)}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!res.ok) throw new Error("Search request failed.");
  return (await res.json()).map(r => {
    const a = r.address || {};
    const iso = a["ISO3166-2-lvl4"] || "";               // e.g. "US-MA" or "CA-ON"
    return {
      name: (r.namedetails && r.namedetails.name) || r.name || r.display_name.split(",")[0],
      town: a.town || a.city || a.village || a.hamlet || a.township || a.county || "",
      state: iso.includes("-") ? iso.split("-")[1] : (a.state || ""),
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      address: r.display_name
    };
  });
}
