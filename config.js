/* =========================================================
   SITE SETTINGS — the file most people will ever need to edit.
   Plain values only; no logic. (Dropdown options and map icons
   live in taxonomy.js.)
   ========================================================= */
export const CONFIG = {
  // The Apps Script web app that reads/writes the Google Sheet.
  // Stays the same as long as you redeploy with "Manage deployments -> New version".
  gasUrl: "https://script.google.com/macros/s/AKfycbxEXC5Ct-euFa3x6Gzs6QigsTSOgFZIBfr1vcy8B8M4OUo3B2P6tYRRYZRePtUjscYk/exec",

  // Saved copy of the data, refreshed automatically by .github/workflows/snapshot.yml.
  // The site shows it if the live Sheet can't be reached.
  snapshotUrl: "data/locations.snapshot.json",
  liveTimeoutMs: 8000,

  // Rows saved before the State column existed are treated as this state.
  defaultState: "ME",

  // "Home" for the distance filter and the starting map view (central Cumberland County).
  home: { lat: 43.80, lng: -70.38, zoom: 10 },

  // Distance filter. Distance is measured in straight-line miles from `home`.
  // Edit the labels or cut-offs freely; keep the last band at Infinity.
  distanceBands: [
    { id: "local",    label: "Local (within 40 mi)",             maxMiles: 40 },
    { id: "regional", label: "Regional (within 300 mi)",         maxMiles: 300 },
    { id: "far",      label: "Far / High Adventure (300+ mi)",   maxMiles: Infinity }
  ],

  pageSize: 20,

  // Admin address search (OpenStreetMap Nominatim): comma-separated country codes.
  searchCountries: "us,ca"
};
