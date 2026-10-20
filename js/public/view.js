/* Everything drawn in the results column: the card list, pager, detail panel and mobile tabs. */
import { CONFIG } from "../config.js";
import { getTypeMeta } from "../taxonomy.js";
import { escapeHtml, placeLabel, distanceLabel, formatDate } from "../util.js";

const $ = id => document.getElementById(id);
const el = {
  list: $("resultsList"), head: $("resultsHead"), sub: $("resultsSub"), pill: $("resultPill"),
  pager: $("pager"), prev: $("pagerPrev"), next: $("pagerNext"), label: $("pagerLabel"),
  detail: $("detailView"), hero: $("detailHero"), body: $("detailBody"), banner: $("sourceBanner")
};

const icon = (paths, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}">${paths}</svg>`;
const ICON = {
  search: icon('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>', 1.6),
  check: icon('<polyline points="20 6 9 17 4 12"/>', 3),
  nav: icon('<polygon points="3 11 22 2 13 21 11 13 3 11"/>'),
  pin: icon('<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
  phone: icon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>'),
  mail: icon('<path d="M4 4h16v16H4z"/><path d="m22 6-10 7L2 6"/>'),
  globe: icon('<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>')
};

let detailOpen = false;
let bannerHtml = "";

export const isMobile = () => window.matchMedia("(max-width: 880px)").matches;

const badges = (list, cls, max) =>
  list.slice(0, max).map(t => `<span class="badge ${cls}">${escapeHtml(t)}</span>`).join("") +
  (list.length > max ? `<span class="badge ${cls}">+${list.length - max}</span>` : "");

/* ---------------- list + pager ---------------- */
export function renderList(filtered, state, onSelect) {
  const size = CONFIG.pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / size));
  state.page = Math.min(Math.max(state.page, 1), totalPages);
  const start = (state.page - 1) * size;

  el.pill.textContent = `${filtered.length} adventure${filtered.length !== 1 ? "s" : ""}`;
  el.sub.textContent = !filtered.length
    ? "No locations match — try loosening a filter"
    : totalPages > 1
      ? `Showing ${start + 1}–${Math.min(start + size, filtered.length)} of ${filtered.length} locations, nearest first`
      : `${filtered.length} location${filtered.length !== 1 ? "s" : ""} match, nearest first`;

  el.pager.style.display = totalPages > 1 && !detailOpen ? "flex" : "none";
  el.label.textContent = `Page ${state.page} of ${totalPages}`;
  el.prev.disabled = state.page <= 1;
  el.next.disabled = state.page >= totalPages;

  el.list.innerHTML = "";
  if (!filtered.length) {
    el.list.innerHTML = `<div class="empty-state">${ICON.search}<div>No adventures match those filters yet.<br>Try removing an amenity or two.</div></div>`;
    return;
  }
  filtered.slice(start, start + size).forEach(loc => {
    const meta = getTypeMeta(loc.primaryType);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card" + (state.selectedId === loc.id ? " active" : "");
    card.innerHTML = `
      <div class="card-top">
        <div class="card-icon" style="background:${meta.color}">${meta.icon}</div>
        <div>
          <div class="card-name">${escapeHtml(loc.name)}</div>
          <div class="card-town">${escapeHtml(placeLabel(loc))} · ${distanceLabel(loc.miles)}</div>
        </div>
      </div>
      <div class="badges">${badges(loc.programs, "program", 2)}${badges(loc.types, "type", 3)}</div>`;
    card.addEventListener("click", () => onSelect(loc.id, true));
    el.list.appendChild(card);
  });
}

export function showError(message) {
  el.sub.textContent = "Locations unavailable";
  el.list.innerHTML = `<div class="empty-state">${ICON.search}<div>${escapeHtml(message)}</div></div>`;
}

/* ---------------- source banner ---------------- */
export function setBanner(html) {
  bannerHtml = html;
  el.banner.innerHTML = html;
  el.banner.classList.toggle("visible", !!html && !detailOpen);
}

export function setSourcePill(source) {
  const pill = $("dataSourcePill");
  pill.textContent = { live: "Live: Google Sheet", snapshot: "Saved copy", demo: "Demo data" }[source];
  pill.className = "result-pill " + (source === "live" ? "live" : "demo");
}

/* ---------------- detail panel ---------------- */
export function showDetail(loc) {
  const meta = getTypeMeta(loc.primaryType);
  detailOpen = true;
  el.head.style.display = "none";
  el.banner.classList.remove("visible");
  el.list.classList.add("hidden");
  el.pager.style.display = "none";
  el.detail.classList.add("visible");

  el.hero.style.background = `linear-gradient(135deg, ${meta.color}, var(--deep-water))`;
  el.hero.textContent = meta.icon;

  const row = (svg, inner) => `<div class="contact-row">${svg}${inner}</div>`;
  const rows = [];
  if (loc.address) rows.push(row(ICON.pin, escapeHtml(loc.address)));
  if (loc.phone) rows.push(row(ICON.phone, `<a href="tel:${escapeHtml(loc.phone.replace(/[^\d+]/g, ""))}">${escapeHtml(loc.phone)}</a>`));
  if (loc.email) rows.push(row(ICON.mail, `<a href="mailto:${escapeHtml(loc.email)}">${escapeHtml(loc.email)}</a>`));
  if (loc.website) {
    const href = /^https?:\/\//i.test(loc.website) ? loc.website : `https://${loc.website}`;
    rows.push(row(ICON.globe, `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(loc.website)}</a>`));
  }

  const dest = encodeURIComponent(loc.address || `${loc.lat},${loc.lng}`);
  const updated = formatDate(loc.lastUpdated);

  el.body.innerHTML = `
    <h3>${escapeHtml(loc.name)}</h3>
    <div class="detail-town">${escapeHtml(placeLabel(loc))} · about ${distanceLabel(loc.miles)} from the district</div>
    <div class="detail-desc">${escapeHtml(loc.desc)}</div>
    <div class="detail-section"><h4>Program Level</h4><div class="badges">${badges(loc.programs, "program", 10)}</div></div>
    <div class="detail-section"><h4>Adventure Type</h4><div class="badges">${badges(loc.types, "type", 10)}</div></div>
    <div class="detail-section"><h4>Amenities</h4><div class="amenity-list">${
      loc.amenities.map(a => `<span class="amenity-chip">${ICON.check}${escapeHtml(a)}</span>`).join("")}</div></div>
    ${rows.length ? `<div class="detail-section"><h4>Contact</h4><div class="contact-list">${rows.join("")}</div></div>` : ""}
    <a class="directions-btn" href="https://www.google.com/maps/dir/?api=1&destination=${dest}" target="_blank" rel="noopener">${ICON.nav}Get directions</a>
    ${updated ? `<div class="last-updated">Last updated ${updated}</div>` : ""}`;
}

export function hideDetail() {
  detailOpen = false;
  el.head.style.display = "block";
  el.list.classList.remove("hidden");
  el.detail.classList.remove("visible");
  el.banner.classList.toggle("visible", !!bannerHtml);
}

/* ---------------- phone layout: one panel at a time ---------------- */
export function setMobileView(view) {
  document.body.classList.remove("view-filters", "view-list", "view-map");
  document.body.classList.add("view-" + view);
  document.querySelectorAll(".mobile-tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
}
