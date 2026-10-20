/**
 * =========================================================
 * CASCO BAY ADVENTURES — BACKEND (Google Apps Script) · v2
 * =========================================================
 * The only code that touches the spreadsheet. The Sheet ID and the
 * real passcode never leave Google's servers.
 *
 * WHAT CHANGED IN v2 (vs. the original):
 *   - Rows are found by a permanent ID, not by row number, so sorting or
 *     deleting in the Sheet can no longer make an edit hit the wrong row.
 *   - Edits/deletes are rejected if someone else changed the row first.
 *   - "Delete" is a soft delete (Status = deleted); nothing is lost.
 *   - Every write is recorded in a "Change Log" tab, with the volunteer's name.
 *   - Login attempts are throttled; missing secrets make the server refuse
 *     to run instead of signing tokens with an empty key.
 *   - All input is validated on the server (the browser checks are only courtesy).
 *   - Column positions come from the header row, not hard-coded letters.
 *   - The public read is cached for 5 minutes and skips rows with bad coordinates.
 *
 * SETUP (full version lives in the repo README):
 *   1. Open the directory Sheet -> Extensions -> Apps Script, paste this file.
 *   2. Project Settings -> Script Properties:
 *        SHEET_TAB       tab with the data, e.g.  Form Responses 1
 *        ADMIN_PASSCODE  shared passphrase, 12+ characters
 *        SESSION_SECRET  long random string, 20+ characters
 *        (changing SESSION_SECRET signs everyone out — use it as the "kick everyone" switch)
 *   3. Select the function checkSetup in the editor and click Run. It adds the
 *      ID and Status columns, gives every existing row an ID, and lists problems.
 *   4. Deploy -> Manage deployments -> pencil -> New version -> Deploy.
 *      Do NOT create a brand-new deployment each time: that changes the URL.
 *
 * WHO CAN SEE THE SECRETS: anyone with Editor access to the Sheet can open
 * this script and read Script Properties. Keep the Sheet's editor list short.
 * =========================================================
 */

const CONFIG = {
  DEFAULT_TAB: 'Form Responses 1',
  LOG_TAB: 'Change Log',
  SESSION_HOURS: 8,
  MAX_LOGIN_FAILS: 5,          // across everyone — Apps Script can't see IP addresses
  LOCKOUT_SECONDS: 900,        // 15 minutes
  PUBLIC_CACHE_SECONDS: 300,   // hand-edits in the Sheet show up within 5 minutes
  // Sanity box, NOT a service-area limit: North America, Hawaii, Alaska and the
  // Caribbean (high adventure bases, New England lock-ins, Sea Scout cruising).
  // It exists to catch typos: a missing minus sign on the longitude, or latitude
  // and longitude swapped, both land outside it. For a trip beyond this box,
  // widen these numbers.
  BOUNDS: { minLat: 15, maxLat: 72, minLng: -180, maxLng: -50 }
};

const CACHE_KEY = 'public_locations_v2';

/* One place that knows the sheet's columns. `header` is matched against row 1
 * ignoring case, spaces and punctuation. Missing optional columns are added. */
const FIELDS = [
  { key: 'timestamp',   header: 'Timestamp',                           kind: 'system' },
  { key: 'name',        header: 'Location Name',                       kind: 'text',  max: 120,  required: true },
  { key: 'town',        header: 'Town',                                kind: 'text',  max: 80,   required: true },
  { key: 'state',       header: 'State',                               kind: 'text',  max: 40 },
  { key: 'lat',         header: 'Latitude',                            kind: 'coord', required: true },
  { key: 'lng',         header: 'Longitude',                           kind: 'coord', required: true },
  { key: 'description', header: 'Description',                         kind: 'text',  max: 2000 },
  { key: 'programs',    header: 'Program Level',                       kind: 'text',  max: 500 },
  { key: 'types',       header: 'Adventure Type',                      kind: 'text',  max: 500 },
  { key: 'amenities',   header: 'Amenities',                           kind: 'text',  max: 500 },
  { key: 'primaryType', header: 'Primary adventure type for map icon', kind: 'text',  max: 80 },
  { key: 'address',     header: 'Address',                             kind: 'text',  max: 250 },
  { key: 'phone',       header: 'Phone',                               kind: 'text',  max: 40 },
  { key: 'email',       header: 'Email',                               kind: 'email', max: 120 },
  { key: 'website',     header: 'Website',                             kind: 'url',   max: 300 },
  { key: 'lastUpdated', header: 'Last Updated',                        kind: 'system' },
  { key: 'id',          header: 'ID',                                  kind: 'system' },
  { key: 'status',      header: 'Status',                              kind: 'system' }
];
const EDITABLE = FIELDS.filter(function (f) { return f.kind !== 'system'; });
const FIELD_BY_KEY = {};
FIELDS.forEach(function (f) { FIELD_BY_KEY[f.key] = f; });

const CONFLICT_MSG = 'Someone else changed this location after you opened it. Go back, reload the list, and try again.';

/* =========================================================
   ENTRY POINTS
   ========================================================= */

const ADMIN_ACTIONS = {
  listLocations: listLocations_,
  addLocation: addLocation_,
  updateLocation: updateLocation_,
  deleteLocation: deleteLocation_
};

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action === 'locations') return publicLocations_();
    fail_('Unknown request. The public data is available at ?action=locations');
  } catch (err) {
    return errorResponse_(err);
  }
}

function doPost(e) {
  try {
    let body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (x) {
      fail_('Malformed request.');
    }
    const action = body && body.action;
    if (action === 'login') return json_(login_(body));

    const handler = ADMIN_ACTIONS[action];
    if (!handler) fail_('Unknown action.');
    const user = checkToken_(body.token);
    return json_(handler(body, user));
  } catch (err) {
    return errorResponse_(err);
  }
}

/* =========================================================
   PUBLIC READ (no login) — only whitelisted fields leave the Sheet
   ========================================================= */

function publicLocations_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return text_(hit);

  const s = sheet_();
  const sc = schema_(s);
  const locations = [];
  readRows_(s, sc).forEach(function (r) {
    if (isDeleted_(sc, r.v)) return;
    const loc = toLocation_(sc, r.v);
    if (!loc.name || !validCoords_(loc.lat, loc.lng)) return; // blank/broken rows never reach the map
    locations.push(loc);
  });

  const out = JSON.stringify({ ok: true, locations: locations });
  try { cache.put(CACHE_KEY, out, CONFIG.PUBLIC_CACHE_SECONDS); } catch (x) { /* too big to cache — fine */ }
  return text_(out);
}

/* =========================================================
   ADMIN ACTIONS (all require a valid session token)
   ========================================================= */

function listLocations_(body, user) {
  return withLock_(function () {
    const s = sheet_();
    const sc = ensureSchema_(s);
    backfillIds_(s, sc);
    const locations = [];
    readRows_(s, sc).forEach(function (r) {
      if (isDeleted_(sc, r.v)) return;
      const loc = toLocation_(sc, r.v);
      if (loc.name) locations.push(loc); // includes rows with bad coordinates so volunteers can fix them
    });
    return { ok: true, locations: locations };
  });
}

function addLocation_(body, user) {
  const d = clean_(body.data);
  return withLock_(function () {
    const s = sheet_();
    const sc = ensureSchema_(s);
    const id = Utilities.getUuid();
    const now = new Date();
    const row = new Array(sc.lastCol).fill('');
    row[sc.cols.timestamp - 1] = now;
    row[sc.cols.lastUpdated - 1] = now;
    row[sc.cols.id - 1] = id;
    EDITABLE.forEach(function (f) { row[sc.cols[f.key] - 1] = cell_(d[f.key]); });
    s.appendRow(row);
    log_(user, 'add', id, d.name, '');
    clearCache_();
    return { ok: true, id: id };
  });
}

function updateLocation_(body, user) {
  const d = clean_(body.data);
  const expected = requireExpected_(body);
  return withLock_(function () {
    const s = sheet_();
    const sc = ensureSchema_(s);
    const rowNum = findById_(s, sc, body.id);
    const current = s.getRange(rowNum, 1, 1, sc.lastCol).getValues()[0];
    if (iso_(get_(sc, current, 'lastUpdated')) !== expected) fail_(CONFLICT_MSG);

    const changes = [];
    EDITABLE.forEach(function (f) {
      const before = get_(sc, current, f.key);
      const beforeStr = before == null ? '' : String(before);
      const after = d[f.key];
      if (beforeStr === String(after)) return;
      changes.push(f.header + ': ' + beforeStr.slice(0, 80) + ' -> ' + String(after).slice(0, 80));
      s.getRange(rowNum, sc.cols[f.key]).setValue(cell_(after)); // cell by cell: never clobbers extra columns/formulas
    });
    if (!changes.length) return { ok: true, unchanged: true };

    s.getRange(rowNum, sc.cols.lastUpdated).setValue(new Date());
    log_(user, 'update', body.id, d.name, changes.join('; '));
    clearCache_();
    return { ok: true };
  });
}

function deleteLocation_(body, user) {
  const expected = requireExpected_(body);
  return withLock_(function () {
    const s = sheet_();
    const sc = ensureSchema_(s);
    const rowNum = findById_(s, sc, body.id);
    const current = s.getRange(rowNum, 1, 1, sc.lastCol).getValues()[0];
    if (iso_(get_(sc, current, 'lastUpdated')) !== expected) fail_(CONFLICT_MSG);

    s.getRange(rowNum, sc.cols.status).setValue('deleted');
    s.getRange(rowNum, sc.cols.lastUpdated).setValue(new Date());
    log_(user, 'delete', body.id, String(get_(sc, current, 'name')),
      'Restore by clearing the Status cell in row ' + rowNum + ' of the data tab.');
    clearCache_();
    return { ok: true };
  });
}

/* =========================================================
   LOGIN + SESSION TOKENS
   Token = expiry | volunteer name | HMAC signature. Stateless, so it cannot be
   revoked one at a time; rotating SESSION_SECRET signs everyone out.
   ========================================================= */

function login_(body) {
  const passcode = getProp_('ADMIN_PASSCODE');
  if (!passcode) fail_('Server not configured yet — ADMIN_PASSCODE is missing in Script Properties.');
  secret_(); // refuse to run without a signing secret

  const cache = CacheService.getScriptCache();
  if (Number(cache.get('loginFails') || 0) >= CONFIG.MAX_LOGIN_FAILS) {
    fail_('Too many incorrect attempts. Please wait 15 minutes and try again.');
  }
  if (safeEqual_(String(body.passcode || ''), passcode)) {
    cache.remove('loginFails');
    return { ok: true, token: makeToken_(cleanName_(body.name)) };
  }
  withLock_(function () {
    const n = Number(cache.get('loginFails') || 0) + 1;
    cache.put('loginFails', String(n), CONFIG.LOCKOUT_SECONDS);
  });
  Utilities.sleep(1000); // slows down guessing
  fail_('Incorrect passcode.');
}

function secret_() {
  const v = getProp_('SESSION_SECRET');
  if (!v || v.length < 20) fail_('Server not configured — SESSION_SECRET is missing or too short in Script Properties.');
  return v;
}

function sign_(payload) {
  const raw = Utilities.computeHmacSha256Signature(payload, secret_());
  return raw.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}

function makeToken_(name) {
  const payload = (Date.now() + CONFIG.SESSION_HOURS * 3600 * 1000) + '|' + encodeURIComponent(name);
  return payload + '|' + sign_(payload);
}

/** Returns the volunteer's name, or throws the standard "session expired" error. */
function checkToken_(token) {
  const parts = typeof token === 'string' ? token.split('|') : [];
  const ok = parts.length === 3 &&
    safeEqual_(sign_(parts[0] + '|' + parts[1]), parts[2]) &&
    Date.now() < Number(parts[0]);
  if (!ok) fail_('Your session has expired — please log in again.');
  return decodeURIComponent(parts[1]);
}

function cleanName_(n) {
  return String(n == null ? '' : n).trim().slice(0, 60) || 'volunteer';
}

function safeEqual_(a, b) {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* =========================================================
   VALIDATION
   ========================================================= */

function clean_(d) {
  d = d || {};
  const out = {};
  EDITABLE.forEach(function (f) {
    if (f.kind === 'coord') {
      const n = coord_(d[f.key]);
      if (!isFinite(n)) fail_(f.header + ' must be a number.');
      out[f.key] = n;
      return;
    }
    const v = String(d[f.key] == null ? '' : d[f.key]).trim();
    if (f.required && !v) fail_(f.header + ' is required.');
    if (v.length > f.max) fail_(f.header + ' is too long (limit ' + f.max + ' characters).');
    if (f.kind === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail_('That email address does not look valid.');
    if (f.kind === 'url' && v && !/^https?:\/\/\S+$/i.test(v)) fail_('Website must start with http:// or https://');
    out[f.key] = v;
  });
  if (!validCoords_(out.lat, out.lng)) {
    fail_('Those coordinates look wrong. In North America the longitude is negative (e.g. -70.25), and latitude comes first. Check for a missing minus sign or swapped values. (Trip outside North America? Ask the site maintainer to widen BOUNDS in Code.gs.)');
  }
  return out;
}

/** Number('') is 0, which would put blank coordinates at 0,0 — so blanks are NaN here. */
function coord_(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return isFinite(n) ? n : NaN;
}

function validCoords_(lat, lng) {
  const b = CONFIG.BOUNDS;
  return typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng) &&
    lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

/** Stops text that starts with = + - @ from being treated as a spreadsheet formula. */
function cell_(v) {
  return (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
}

function requireExpected_(body) {
  if (typeof body.expectedUpdated !== 'string') {
    fail_('Your admin page is out of date — please reload it and try again.');
  }
  return body.expectedUpdated;
}

/* =========================================================
   SHEET HELPERS
   ========================================================= */

function getProp_(name) {
  return PropertiesService.getScriptProperties().getProperty(name);
}

function sheet_() {
  const tab = getProp_('SHEET_TAB') || CONFIG.DEFAULT_TAB;
  const s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if (!s) fail_("Server not configured — SHEET_TAB doesn't match any tab name.");
  return s;
}

function norm_(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Read-only: which column (1-based) holds each field. */
function schema_(s) {
  const lastCol = Math.max(s.getLastColumn(), 1);
  const headers = s.getRange(1, 1, 1, lastCol).getValues()[0].map(norm_);
  const cols = {};
  FIELDS.forEach(function (f) {
    const i = headers.indexOf(norm_(f.header));
    if (i !== -1) cols[f.key] = i + 1;
  });
  return { cols: cols, lastCol: lastCol };
}

/** Like schema_, but adds any missing columns (ID, Status, ...) to the right. */
function ensureSchema_(s) {
  const sc = schema_(s);
  ['name', 'town', 'lat', 'lng'].forEach(function (k) {
    if (!sc.cols[k]) fail_('The sheet is missing the "' + FIELD_BY_KEY[k].header + '" column in row 1.');
  });
  let added = false;
  FIELDS.forEach(function (f) {
    if (!sc.cols[f.key]) {
      s.getRange(1, s.getLastColumn() + 1).setValue(f.header);
      added = true;
    }
  });
  if (!added) return sc;
  SpreadsheetApp.flush();
  return schema_(s);
}

function readRows_(s, sc) {
  const lastRow = s.getLastRow();
  if (lastRow < 2) return [];
  return s.getRange(2, 1, lastRow - 1, sc.lastCol).getValues().map(function (v, i) {
    return { row: i + 2, v: v };
  });
}

function get_(sc, v, key) {
  const c = sc.cols[key];
  return c ? v[c - 1] : '';
}

function isDeleted_(sc, v) {
  return String(get_(sc, v, 'status')).toLowerCase() === 'deleted';
}

function iso_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  return v == null ? '' : String(v);
}

function toLocation_(sc, v) {
  const g = function (k) { return get_(sc, v, k); };
  const str = function (k) { return String(g(k) == null ? '' : g(k)); };
  const lat = coord_(g('lat')), lng = coord_(g('lng'));
  return {
    id: str('id'),
    name: str('name'),
    town: str('town'),
    state: str('state'),
    lat: isFinite(lat) ? lat : null,
    lng: isFinite(lng) ? lng : null,
    description: str('description'),
    programs: str('programs'),
    types: str('types'),
    amenities: str('amenities'),
    primaryType: str('primaryType'),
    address: str('address'),
    phone: str('phone'),
    email: str('email'),
    website: str('website'),
    lastUpdated: iso_(g('lastUpdated'))
  };
}

function findById_(s, sc, id) {
  id = String(id || '');
  const notFound = 'That location could not be found — try refreshing the list.';
  const last = s.getLastRow();
  if (!id || last < 2) fail_(notFound);
  const ids = s.getRange(2, sc.cols.id, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      const rowNum = i + 2;
      if (String(s.getRange(rowNum, sc.cols.status).getValue()).toLowerCase() === 'deleted') fail_(notFound);
      return rowNum;
    }
  }
  fail_(notFound);
}

/** Gives every named row without an ID a permanent one (rows added by the old Form, older rows). */
function backfillIds_(s, sc) {
  const last = s.getLastRow();
  if (last < 2) return;
  const names = s.getRange(2, sc.cols.name, last - 1, 1).getValues();
  const range = s.getRange(2, sc.cols.id, last - 1, 1);
  const ids = range.getValues();
  let changed = false;
  ids.forEach(function (r, i) {
    if (!r[0] && names[i][0]) { r[0] = Utilities.getUuid(); changed = true; }
  });
  if (changed) range.setValues(ids);
}

/* =========================================================
   LOCKING, CACHE, LOGGING, RESPONSES
   ========================================================= */

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (x) {
    fail_('The sheet is busy — please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function clearCache_() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

/** Never lets a logging problem block a save. */
function log_(user, action, id, name, details) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let t = ss.getSheetByName(CONFIG.LOG_TAB);
    if (!t) {
      t = ss.insertSheet(CONFIG.LOG_TAB);
      t.appendRow(['Time', 'Volunteer', 'Action', 'Location ID', 'Location', 'Details']);
      t.setFrozenRows(1);
    }
    t.appendRow([new Date(), cell_(user), action, id, cell_(String(name || '')), cell_(String(details || '').slice(0, 1000))]);
  } catch (err) {
    console.error('Change log failed: ' + err);
  }
}

function fail_(msg) {
  const e = new Error(msg);
  e.isUserError = true;
  throw e;
}

function errorResponse_(err) {
  if (err && err.isUserError) return json_({ ok: false, error: err.message });
  console.error(err && err.stack ? err.stack : err);
  return json_({ ok: false, error: 'Unexpected server error — please try again, or tell the site maintainer.' });
}

function json_(obj) {
  return text_(JSON.stringify(obj));
}

function text_(str) {
  return ContentService.createTextOutput(str).setMimeType(ContentService.MimeType.JSON);
}

/* =========================================================
   MAINTENANCE — run from the editor (select the function, click Run)
   ========================================================= */

function checkSetup() {
  const notes = [];
  if ((getProp_('ADMIN_PASSCODE') || '').length < 12) notes.push('ADMIN_PASSCODE is missing or shorter than 12 characters — use a passphrase.');
  if ((getProp_('SESSION_SECRET') || '').length < 20) notes.push('SESSION_SECRET is missing or shorter than 20 characters.');
  withLock_(function () {
    const s = sheet_();
    const sc = ensureSchema_(s);
    backfillIds_(s, sc);
    readRows_(s, sc).forEach(function (r) {
      if (isDeleted_(sc, r.v)) return;
      const loc = toLocation_(sc, r.v);
      if (!loc.name) return;
      if (!validCoords_(loc.lat, loc.lng)) notes.push('Row ' + r.row + ' (' + loc.name + '): missing or out-of-range coordinates — hidden from the public map until fixed.');
      if (!loc.town) notes.push('Row ' + r.row + ' (' + loc.name + '): no town.');
    });
  });
  Logger.log(notes.length ? notes.join('\n') : 'Setup looks good.');
}
