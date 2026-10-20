/* =========================================================
   CATEGORIES — program levels, adventure types, amenities.
   The order here is the order of the checkboxes. Anything a
   volunteer adds on the admin page that isn't listed still
   works; it just appears after these, alphabetically.
   Both the public site and the admin page read this file.
   ========================================================= */
import { hashStr } from "./util.js";

export const PROGRAM_ORDER = ["Cub Scouts", "Scouts BSA", "Venturing", "Sea Scouting", "Exploring"];
export const TYPE_ORDER = ["Hiking", "Biking", "Skiing", "Snowshoeing", "Boating", "Swimming", "Fishing", "Camping", "Overnighter/Lock-in", "Day Trip"];
export const AMENITY_ORDER = ["Cabins", "Flush Toilets", "Showers", "Electricity", "Cell Phone Service", "Running Water", "Pit Latrines", "Pavilion or Shelter", "Tent Platforms"];

// Map-pin icon and color for each adventure type.
export const TYPE_META = {
  "Hiking":              { icon: "🥾", color: "#7FA98E" },
  "Biking":              { icon: "🚵", color: "#C98A5E" },
  "Skiing":              { icon: "⛷️", color: "#7C93B8" },
  "Snowshoeing":         { icon: "❄️", color: "#8FB0C4" },
  "Boating":             { icon: "⛵", color: "#5B84A6" },
  "Swimming":            { icon: "🏊", color: "#4E9BA6" },
  "Fishing":             { icon: "🎣", color: "#6B8F71" },
  "Camping":             { icon: "⛺", color: "#3E6259" },
  "Overnighter/Lock-in": { icon: "🏠", color: "#8C7AA6" },
  "Day Trip":            { icon: "🎒", color: "#D6A24C" }
};

// New types get a compass and a color picked from this list (same type -> same color every time).
const FALLBACK_PALETTE = ["#7FA98E", "#5B84A6", "#C98A5E", "#8C7AA6", "#4E9BA6", "#B98470", "#6B8F71", "#9FB08C"];

export function getTypeMeta(type) {
  return TYPE_META[type] || { icon: "🧭", color: FALLBACK_PALETTE[hashStr(type || "?") % FALLBACK_PALETTE.length] };
}
