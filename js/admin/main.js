/* Admin page: sign in, add a location, browse and edit existing ones.
   Every save goes through the Apps Script backend, which checks the session and validates again. */
import { CONFIG } from "../config.js";
import { PROGRAM_ORDER, TYPE_ORDER, AMENITY_ORDER } from "../taxonomy.js";
import { escapeHtml } from "../util.js";
import { callBackend, searchAddress, token } from "./api.js";

const $ = id => document.getElementById(id);
const FORM_TEXT = { fName: "name", fTown: "town", fState: "state", fAddress: "address", fPhone: "phone", fEmail: "email", fWebsite: "website", fDesc: "description" };

/* ---------------- screens + sign-in ---------------- */
function showApp() {
  $("loginScreen").style.display = "none";
  $("app").style.display = "block";
  $("logoutBtn").style.display = "inline-block";
  setTimeout(() => map.invalidateSize(), 100);
}
function showLogin() {
  $("loginScreen").style.display = "flex";
  $("app").style.display = "none";
  $("logoutBtn").style.display = "none";
}

/** Backend call that adds the session token and sends the user back to sign-in if it expired. */
async function api(action, fields = {}) {
  const result = await callBackend({ action, token: token.get(), ...fields });
  if (!result.ok && /session/i.test(result.error || "")) { token.clear(); showLogin(); }
  return result;
}

$("nameInput").value = localStorage.getItem("cba_admin_name") || "";
$("loginBtn").addEventListener("click", async () => {
  const passcode = $("passcodeInput").value.trim();
  const name = $("nameInput").value.trim();
  $("loginError").classList.remove("visible");
  if (!passcode) return;
  $("loginBtn").disabled = true; $("loginBtn").textContent = "Checking...";
  try {
    const result = await callBackend({ action: "login", passcode, name });
    if (result.ok) {
      token.set(result.token);
      localStorage.setItem("cba_admin_name", name);
      $("passcodeInput").value = "";
      showApp();
    } else {
      $("loginError").textContent = result.error || "Incorrect passphrase.";
      $("loginError").classList.add("visible");
    }
  } catch (err) {
    $("loginError").textContent = "Couldn't reach the server. Check your connection, and CONFIG.gasUrl in js/config.js.";
    $("loginError").classList.add("visible");
  }
  $("loginBtn").disabled = false; $("loginBtn").textContent = "Sign in";
});
$("passcodeInput").addEventListener("keydown", e => { if (e.key === "Enter") $("loginBtn").click(); });
$("logoutBtn").addEventListener("click", () => { token.clear(); setView("add"); showLogin(); });

/* ---------------- map + pin ---------------- */
const map = L.map("map").setView([CONFIG.home.lat, CONFIG.home.lng], CONFIG.home.zoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
const marker = L.marker([CONFIG.home.lat, CONFIG.home.lng], { draggable: true }).addTo(map);

function setPin(lat, lng, pan) {
  marker.setLatLng([lat, lng]);
  if (pan) map.setView([lat, lng], Math.max(map.getZoom(), 13));
  $("fLat").value = lat.toFixed(6);
  $("fLng").value = lng.toFixed(6);
}
marker.on("dragend", () => { const p = marker.getLatLng(); setPin(p.lat, p.lng, false); });
map.on("click", e => setPin(e.latlng.lat, e.latlng.lng, false));
["fLat", "fLng"].forEach(id => $(id).addEventListener("change", () => {
  const lat = parseFloat($("fLat").value), lng = parseFloat($("fLng").value);
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) marker.setLatLng([lat, lng]);
}));

/* ---------------- address search ---------------- */
async function runSearch() {
  const q = $("searchInput").value.trim();
  if (!q) return;
  const out = $("searchResults");
  $("searchBtn").disabled = true; $("searchBtn").textContent = "Searching...";
  out.innerHTML = "";
  try {
    const results = await searchAddress(q);
    if (!results.length) out.innerHTML = `<div class="search-note">No matches — try a different search or enter the location manually.</div>`;
    results.forEach(r => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-result";
      btn.innerHTML = `<b>${escapeHtml(r.name)}</b><br>${escapeHtml(r.address)}`;
      btn.addEventListener("click", () => {
        $("fName").value = r.name; $("fTown").value = r.town; $("fState").value = r.state || CONFIG.defaultState;
        $("fAddress").value = r.address;
        setPin(r.lat, r.lng, true);
        out.innerHTML = ""; $("searchInput").value = "";
      });
      out.appendChild(btn);
    });
  } catch (err) {
    out.innerHTML = `<div class="search-note">Search failed — try again in a moment, or enter the location manually.</div>`;
  }
  $("searchBtn").disabled = false; $("searchBtn").textContent = "Search";
}
$("searchBtn").addEventListener("click", runSearch);
$("searchInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } });

/* ---------------- checkbox groups ---------------- */
const GRIDS = { program: ["programGrid", PROGRAM_ORDER], type: ["typeGrid", TYPE_ORDER], amenity: ["amenityGrid", AMENITY_ORDER] };

function addCheckbox(grid, value, checked) {
  const label = document.createElement("label");
  label.className = "checkbox-opt";
  label.innerHTML = `<input type="checkbox" value="${escapeHtml(value)}"${checked ? " checked" : ""}> ${escapeHtml(value)}`;
  grid.appendChild(label);
}
Object.values(GRIDS).forEach(([gridId, list]) => list.forEach(v => addCheckbox($(gridId), v, false)));

document.querySelectorAll(".add-other button").forEach(btn => btn.addEventListener("click", () => {
  const input = $(btn.dataset.group + "Other");
  const val = input.value.trim();
  if (!val) return;
  addCheckbox($(GRIDS[btn.dataset.group][0]), val, true);
  input.value = "";
  if (btn.dataset.group === "type") refreshPrimaryTypeOptions();
}));

const getChecked = gridId => Array.from(document.querySelectorAll(`#${gridId} input:checked`)).map(i => i.value);
$("typeGrid").addEventListener("change", refreshPrimaryTypeOptions);

function setCheckedValues(gridId, csv) {
  const grid = $(gridId);
  const boxes = Array.from(grid.querySelectorAll("input[type=checkbox]"));
  boxes.forEach(cb => (cb.checked = false));
  splitCsv(csv).forEach(v => {
    const existing = boxes.find(cb => cb.value === v);
    if (existing) existing.checked = true; else addCheckbox(grid, v, true);
  });
}

function refreshPrimaryTypeOptions() {
  const checked = getChecked("typeGrid");
  const sel = $("fPrimaryType");
  const current = sel.value;
  sel.innerHTML = "";
  if (!checked.length) { sel.innerHTML = `<option value="">Check an Adventure Type first</option>`; return; }
  checked.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
  sel.value = checked.includes(current) ? current : checked[0];
}

const splitCsv = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);

/* ---------------- views: add | browseList | editItem ---------------- */
const viewState = { view: "add", id: null, expectedUpdated: "", locations: null };

function setView(view) {
  viewState.view = view;
  if (view !== "editItem") { viewState.id = null; viewState.expectedUpdated = ""; }
  document.querySelectorAll(".mode-tab").forEach(b => {
    const isAdd = b.dataset.mode === "add";
    b.classList.toggle("active", (view === "add") === isAdd);
  });
  const browsing = view === "browseList";
  $("browseSection").style.display = browsing ? "block" : "none";
  $("addressSearchSection").style.display = browsing ? "none" : "block";
  $("detailsWrap").style.display = browsing ? "none" : "block";
  $("saveRow").style.display = browsing ? "none" : "flex";
  $("saveBtn").textContent = view === "editItem" ? "Save changes" : "Save location";
  $("clearBtn").style.display = view === "add" ? "inline-block" : "none";
  $("cancelEditBtn").style.display = view === "editItem" ? "inline-block" : "none";
  $("deleteBtn").style.display = view === "editItem" ? "inline-block" : "none";
  if (view !== "editItem") clearForm();
  $("statusMsg").className = "status-msg";
}

document.querySelectorAll(".mode-tab").forEach(btn => btn.addEventListener("click", () => {
  if (btn.dataset.mode === "add") setView("add");
  else { setView("browseList"); loadLocations(); }
}));
$("cancelEditBtn").addEventListener("click", () => { setView("browseList"); renderBrowseList(); });

/* ---------------- browse + edit ---------------- */
async function loadLocations() {
  const list = $("browseList");
  list.innerHTML = `<div class="search-note">Loading...</div>`;
  try {
    const result = await api("listLocations");
    if (result.ok) {
      viewState.locations = result.locations.sort((a, b) => a.name.localeCompare(b.name));
      renderBrowseList();
    } else {
      list.innerHTML = `<div class="search-note">${escapeHtml(result.error || "Could not load locations.")}</div>`;
    }
  } catch (err) {
    list.innerHTML = `<div class="search-note">Could not reach the server.</div>`;
  }
}

function renderBrowseList() {
  const filter = $("browseFilter").value.trim().toLowerCase();
  const list = $("browseList");
  const shown = (viewState.locations || []).filter(l => !filter || `${l.name} ${l.town} ${l.state}`.toLowerCase().includes(filter));
  list.innerHTML = shown.length ? "" : `<div class="search-note">No locations match.</div>`;
  shown.forEach(loc => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "search-result";
    const noPin = loc.lat === null || loc.lng === null;
    btn.innerHTML = `<b>${escapeHtml(loc.name)}</b><br>${escapeHtml([loc.town, loc.state || CONFIG.defaultState].filter(Boolean).join(", "))}${noPin ? " · <b>needs a map pin</b>" : ""}`;
    btn.addEventListener("click", () => {
      setView("editItem");
      viewState.id = loc.id;
      viewState.expectedUpdated = loc.lastUpdated || "";
      populateForm(loc);
    });
    list.appendChild(btn);
  });
}
$("browseFilter").addEventListener("input", renderBrowseList);

function populateForm(loc) {
  Object.entries(FORM_TEXT).forEach(([field, key]) => ($(field).value = loc[key] || ""));
  $("fState").value = loc.state || CONFIG.defaultState;
  const hint = $("lastUpdatedHint");
  const d = loc.lastUpdated ? new Date(loc.lastUpdated) : null;
  hint.textContent = d && !isNaN(d) ? `Last updated ${d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })} at ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "";
  hint.style.display = hint.textContent ? "block" : "none";
  setCheckedValues("programGrid", loc.programs);
  setCheckedValues("typeGrid", loc.types);
  setCheckedValues("amenityGrid", loc.amenities);
  refreshPrimaryTypeOptions();
  const sel = $("fPrimaryType");
  if (loc.primaryType) {
    if (!Array.from(sel.options).some(o => o.value === loc.primaryType)) sel.add(new Option(loc.primaryType, loc.primaryType));
    sel.value = loc.primaryType;
  }
  if (loc.lat !== null && loc.lng !== null) setPin(Number(loc.lat), Number(loc.lng), true);
  else { $("fLat").value = ""; $("fLng").value = ""; }
}

$("deleteBtn").addEventListener("click", async () => {
  if (!viewState.id) return;
  const name = $("fName").value || "this location";
  if (!confirm(`Remove "${name}" from the directory?\n\nIt is hidden, not erased — the site maintainer can restore it.`)) return;
  const btn = $("deleteBtn");
  btn.disabled = true; btn.textContent = "Removing...";
  try {
    const result = await api("deleteLocation", { id: viewState.id, expectedUpdated: viewState.expectedUpdated });
    if (result.ok) { setView("browseList"); loadLocations(); showStatus(`Removed "${name}".`, true); }
    else showStatus(result.error || "Could not remove this location.", false);
  } catch (err) {
    showStatus("Could not reach the server.", false);
  }
  btn.disabled = false; btn.textContent = "Remove location";
});

/* ---------------- save ---------------- */
function showStatus(msg, ok) {
  $("statusMsg").textContent = msg;
  $("statusMsg").className = "status-msg " + (ok ? "ok" : "err");
}

function clearForm() {
  Object.keys(FORM_TEXT).forEach(id => ($(id).value = ""));
  $("fState").value = CONFIG.defaultState;
  $("lastUpdatedHint").style.display = "none";
  document.querySelectorAll(".checkbox-grid input[type=checkbox]").forEach(cb => (cb.checked = false));
  refreshPrimaryTypeOptions();
  $("statusMsg").className = "status-msg";
}
$("clearBtn").addEventListener("click", clearForm);

const normalizeWebsite = v => (!v ? "" : /^https?:\/\//i.test(v) ? v : `https://${v}`);
$("fWebsite").addEventListener("blur", e => { e.target.value = normalizeWebsite(e.target.value.trim()); });

/** Looks for the same name + town among the already-loaded list (fetching it once if needed). */
async function findDuplicate(name, town) {
  if (!viewState.locations) {
    try { const r = await api("listLocations"); if (r.ok) viewState.locations = r.locations; } catch (err) { return null; }
  }
  const n = name.toLowerCase(), t = town.toLowerCase();
  return (viewState.locations || []).find(l => l.name.trim().toLowerCase() === n && l.town.trim().toLowerCase() === t) || null;
}

$("saveBtn").addEventListener("click", async () => {
  const data = {
    name: $("fName").value.trim(), town: $("fTown").value.trim(), state: $("fState").value.trim(),
    address: $("fAddress").value.trim(), phone: $("fPhone").value.trim(), email: $("fEmail").value.trim(),
    website: normalizeWebsite($("fWebsite").value.trim()), description: $("fDesc").value.trim(),
    lat: parseFloat($("fLat").value), lng: parseFloat($("fLng").value),
    programs: getChecked("programGrid").join(", "), types: getChecked("typeGrid").join(", "),
    amenities: getChecked("amenityGrid").join(", "), primaryType: $("fPrimaryType").value
  };
  if (!data.name || !data.town || Number.isNaN(data.lat) || Number.isNaN(data.lng)) {
    showStatus("Location Name, Town, and a map pin (Latitude/Longitude) are required.", false);
    return;
  }
  const isEdit = viewState.view === "editItem";
  if (!isEdit) {
    const dup = await findDuplicate(data.name, data.town);
    if (dup && !confirm(`A location named "${dup.name}" in ${dup.town} already exists. Save this one anyway?`)) return;
  }

  const btn = $("saveBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    const result = isEdit
      ? await api("updateLocation", { id: viewState.id, expectedUpdated: viewState.expectedUpdated, data })
      : await api("addLocation", { data });
    if (result.ok) {
      viewState.locations = null; // list is stale now; reload next time it's needed
      if (isEdit) { setView("browseList"); loadLocations(); } else clearForm();
      showStatus(isEdit ? `Saved changes to "${data.name}".` : `Saved "${data.name}" to the directory.`, true); // after setView/clearForm, which reset the message
    } else {
      showStatus(result.error || "Something went wrong saving this location.", false);
    }
  } catch (err) {
    showStatus("Couldn't reach the server — check your connection and try again.", false);
  }
  btn.disabled = false; btn.textContent = isEdit ? "Save changes" : "Save location";
});

/* ---------------- start ---------------- */
clearForm();
if (token.get()) showApp(); else showLogin();
