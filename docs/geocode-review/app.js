// RAM Impact Map — Control Center Dashboard
// ==========================================
//
// !! REPO-SPECIFIC VALUES TO UPDATE !!
// ------------------------------------
// 1. GITHUB_REPO  — set to your actual "owner/repo" string
// 2. GITHUB_BRANCH — branch that holds the live source files
// 3. DATA_BASE    — change to raw.githubusercontent.com URL if Pages
//                   serves from docs/ instead of repo root
//
// GitHub Pages must serve from the REPO ROOT for relative paths to work:
//   Settings → Pages → Source: Deploy from branch → Folder: / (root)
// If serving from docs/, change DATA_BASE to:
//   "https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/main"

// ── CONFIG ────────────────────────────────────────────────────────────────
const DATA_BASE    = "../..";
const GITHUB_REPO   = "ITDeptAdmin/ImpactMap";   // !! update this !!
const GITHUB_BRANCH = "staging";                  // !! update if needed !!

const REVIEW_CSV_URL    = `${DATA_BASE}/output/geocode_review.csv`;
const BUILD_STATS_URL   = `${DATA_BASE}/output/build_stats.json`;
const CSV_DOWNLOAD_URL  = `${DATA_BASE}/data/Master_Clinic_ImpactMap.csv`;
const GEO_DOWNLOAD_URL  = `${DATA_BASE}/output/ImpactMap_Dataset.geojson`;

const GITHUB_BASE        = `https://github.com/${GITHUB_REPO}`;
const GITHUB_ACTIONS_URL = `${GITHUB_BASE}/actions`;
const GITHUB_PRS_URL     = `${GITHUB_BASE}/pulls`;
const GITHUB_CSV_URL     = `${GITHUB_BASE}/blob/${GITHUB_BRANCH}/data/Master_Clinic_ImpactMap.csv`;
const GITHUB_UPLOAD_URL  = `${GITHUB_BASE}/upload/${GITHUB_BRANCH}/data`;

// ── STATE ─────────────────────────────────────────────────────────────────
let ALL_ROWS      = [];
let currentFilter = "all";
let searchQuery   = "";

// ── CSV PARSER ────────────────────────────────────────────────────────────
// Handles RFC 4180 CSV including quoted fields with embedded newlines.
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row = [];
    while (i < n) {
      if (text[i] === '"') {
        let val = "";
        i++;
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { val += '"'; i += 2; }
            else { i++; break; }
          } else { val += text[i++]; }
        }
        row.push(val);
      } else {
        let val = "";
        while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          val += text[i++];
        }
        row.push(val);
      }
      if (i < n && text[i] === ",") { i++; continue; }
      break;
    }
    if (i < n && text[i] === "\r") i++;
    if (i < n && text[i] === "\n") i++;
    if (row.length > 1 || (row.length === 1 && row[0] !== "")) rows.push(row);
  }
  return rows;
}

function csvToObjects(text) {
  const rows = parseCSV(text);
  if (rows.length < 1) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || "").trim(); });
    return obj;
  });
}

// ── FETCH ─────────────────────────────────────────────────────────────────
async function fetchText(url) {
  const r = await fetch(url + "?_=" + Date.now()); // cache-bust
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  return r.text();
}

async function fetchJSONWithMeta(url) {
  const r = await fetch(url + "?_=" + Date.now());
  if (!r.ok) throw new Error(`HTTP ${r.status} — ${url}`);
  const lastModified = r.headers.get("Last-Modified") || "";
  const data = await r.json();
  return { data, lastModified };
}

// ── HELPERS ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function hasSuggestion(row) {
  return !!(row.suggested_latitude && row.suggested_longitude);
}

function fmtNum(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString();
}

function fmtDate(httpDateStr) {
  if (!httpDateStr) return "";
  try {
    return new Date(httpDateStr).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return ""; }
}

async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.innerHTML;
    btn.innerHTML = "✅ Copied!";
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  } catch {
    prompt("Copy this text:", text);
  }
}

// ── STATUS INDICATOR ──────────────────────────────────────────────────────
function setStatus(cls, label) {
  const dot  = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (dot)  { dot.className = "status-dot " + cls; }
  if (text) { text.textContent = label; }
}

// ── STATS GRID ────────────────────────────────────────────────────────────
function renderStats(rows, stats) {
  const pending     = rows.length;
  const withSug     = rows.filter(hasSuggestion).length;
  const noSug       = pending - withSug;
  const features    = stats?.features ?? null;
  const autoFilled  = stats?.coordinate_rows_updated ?? null;
  const stillMiss   = stats?.skipped_missing_latlon ?? null;

  const cards = [
    { icon: "🗺", label: "Locations on Map",       value: fmtNum(features),   cls: "hi" },
    { icon: pending === 0 ? "✅" : "⚠️",
      label: "Pending Review",                      value: fmtNum(pending),    cls: pending === 0 ? "ok" : "warn" },
    { icon: "📍", label: "Has Coordinates Suggested", value: fmtNum(withSug), cls: withSug > 0 ? "warn" : "" },
    { icon: "❓", label: "No Suggestion Yet",       value: fmtNum(noSug),      cls: "" },
    { icon: "⚡", label: "Auto-Filled This Build",  value: fmtNum(autoFilled), cls: "" },
    { icon: "🚫", label: "Still Missing Coords",   value: fmtNum(stillMiss),  cls: stillMiss > 0 ? "warn" : "" },
  ];

  return cards.map(({ icon, label, value, cls }) => `
    <div class="stat-card ${cls}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`).join("");
}

// ── FILE ACTIONS ──────────────────────────────────────────────────────────
function renderFileActions() {
  const items = [
    { href: CSV_DOWNLOAD_URL, icon: "⬇", label: "Master CSV",             dl: "Master_Clinic_ImpactMap.csv" },
    { href: GEO_DOWNLOAD_URL, icon: "⬇", label: "Map GeoJSON",            dl: "ImpactMap_Dataset.geojson" },
    { href: `${DATA_BASE}/output/geocode_review.csv`, icon: "⬇", label: "Geocode Review CSV", dl: "geocode_review.csv" },
    { href: `${DATA_BASE}/output/build_stats.json`,   icon: "⬇", label: "Build Stats JSON",   dl: "build_stats.json" },
  ];
  return items.map(a => `
    <a href="${esc(a.href)}" class="action-link" download="${esc(a.dl)}">
      <span class="action-icon">${a.icon}</span>
      <span>${esc(a.label)}</span>
    </a>`).join("");
}

// ── GITHUB LINKS ──────────────────────────────────────────────────────────
function renderGithubLinks() {
  const items = [
    { href: GITHUB_UPLOAD_URL, icon: "⬆", label: "Upload Updated CSV",   primary: true },
    { href: GITHUB_CSV_URL,    icon: "📄", label: "View CSV on GitHub" },
    { href: GITHUB_PRS_URL,    icon: "🔀", label: "Open Pull Requests" },
    { href: GITHUB_ACTIONS_URL,icon: "⚙", label: "Open GitHub Actions" },
  ];
  return items.map(a => `
    <a href="${esc(a.href)}" class="action-link${a.primary ? " primary" : ""}"
       target="_blank" rel="noopener noreferrer">
      <span class="action-icon">${a.icon}</span>
      <span>${esc(a.label)}</span>
    </a>`).join("");
}

// ── CONFIDENCE BADGE ──────────────────────────────────────────────────────
function confidenceBadge(conf) {
  if (!conf) return "";
  const cls = ["low", "medium", "high", "exact"].includes(conf) ? conf : "unknown";
  return `<span class="badge ${cls}">${esc(conf)}</span>`;
}

// ── REVIEW CARD ───────────────────────────────────────────────────────────
function renderCard(r) {
  const sug      = hasSuggestion(r);
  const location = [r.city, r.state || r.non_us_state, r.country].filter(Boolean).join(", ");
  const coords   = sug ? `${r.suggested_latitude}, ${r.suggested_longitude}` : "";
  const mapsUrl  = sug
    ? `https://www.google.com/maps?q=${encodeURIComponent(r.suggested_latitude)},${encodeURIComponent(r.suggested_longitude)}`
    : "";

  const sugBlock = sug ? `
    <div class="sug-block">
      <div class="sug-hdr">
        📍 Suggested Coordinates
        ${confidenceBadge(r.suggested_confidence)}
        <span class="sug-source">${esc(r.suggested_source)}</span>
      </div>
      <div class="sug-addr">${esc(r.suggested_address)}</div>
      <div class="sug-coords">${esc(coords)}</div>
      <div class="sug-actions">
        <a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer"
           class="btn btn-maps">📍 Open in Google Maps</a>
        <button class="btn btn-sm-copy"
                onclick="copyText(${JSON.stringify(r.row)}, this)"
                title="Copy CSV row number">📋 Copy row #${esc(r.row)}</button>
        <button class="btn btn-sm-copy"
                onclick="copyText(${JSON.stringify(coords)}, this)"
                title="Copy suggested coordinates">📋 Copy coords</button>
      </div>
    </div>` : "";

  return `
    <div class="review-card ${sug ? "has-sug" : "no-sug"}">
      <div class="card-hdr">
        <span class="row-chip ${sug ? "sug" : ""}">ROW ${esc(r.row)}</span>
        <span class="card-event">Event&nbsp;${esc(r.event)} · Exp.&nbsp;${esc(r.expedition)}</span>
        <span class="card-location">${esc(location) || "<em>No location</em>"}</span>
        <span class="card-year">${esc(r.year)}</span>
      </div>
      <div class="card-body">
        <div>
          <div class="field-label">Original Address</div>
          <div class="field-value">${
            r.address
              ? esc(r.address)
              : '<span class="no-addr">No street address on record</span>'
          }</div>
        </div>
        <div>
          <div class="field-label">Why Not Auto-Filled</div>
          <div class="field-reason">${esc(r.reason)}</div>
        </div>
        ${sugBlock}
      </div>
    </div>`;
}

// ── FILTER + SEARCH ───────────────────────────────────────────────────────
function applyFiltersAndSearch() {
  const listEl    = document.getElementById("review-list");
  const countEl   = document.getElementById("filter-count");
  const copyAllEl = document.getElementById("copy-all-btn");

  let visible = ALL_ROWS;

  if (currentFilter === "with-suggestion") {
    visible = visible.filter(hasSuggestion);
  } else if (currentFilter === "no-suggestion") {
    visible = visible.filter(r => !hasSuggestion(r));
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    visible = visible.filter(r =>
      [r.city, r.address, r.event, r.expedition, r.state,
       r.non_us_state, r.country, r.suggested_address]
        .some(f => (f || "").toLowerCase().includes(q))
    );
  }

  // ── Empty: no rows at all ──
  if (ALL_ROWS.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-title">All locations are mapped!</div>
        <p class="empty-sub">No rows need geocode review right now.
          The build workflow updates this page automatically after each
          upload — check back after the next CSV update.</p>
      </div>`;
    countEl.style.display = "none";
    copyAllEl.style.display = "none";
    return;
  }

  // ── Empty: filter returned nothing ──
  if (visible.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state neutral">
        <div class="empty-icon">🔍</div>
        <div class="empty-title" style="color:var(--text-muted)">No rows match your filter</div>
        <p class="empty-sub">Try a different filter option or clear the search box.</p>
      </div>`;
    countEl.style.display = "none";
    copyAllEl.style.display = "none";
    return;
  }

  // ── Render cards ──
  listEl.innerHTML = `<div class="review-list">${visible.map(renderCard).join("")}</div>`;

  // Filter count line
  if (visible.length !== ALL_ROWS.length) {
    countEl.textContent = `Showing ${visible.length} of ${ALL_ROWS.length} row${ALL_ROWS.length !== 1 ? "s" : ""}`;
    countEl.style.display = "block";
  } else {
    countEl.style.display = "none";
  }

  // Copy-all button (only when suggestion rows are visible)
  const sugVisible = visible.filter(hasSuggestion);
  if (sugVisible.length > 0) {
    const nums = sugVisible.map(r => r.row).filter(Boolean).join(", ");
    copyAllEl.style.display = "inline-flex";
    copyAllEl.onclick = e => copyText(nums, e.currentTarget);
    copyAllEl.textContent = `📋 Copy row numbers (${sugVisible.length})`;
  } else {
    copyAllEl.style.display = "none";
  }
}

// ── FILTER WIRING ─────────────────────────────────────────────────────────
function initFilters() {
  document.querySelectorAll(".filter-pills .pill").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-pills .pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      applyFiltersAndSearch();
    });
  });

  const searchEl = document.getElementById("search-input");
  if (searchEl) {
    searchEl.addEventListener("input", () => {
      searchQuery = searchEl.value.trim();
      applyFiltersAndSearch();
    });
  }
}

// ── QUEUE BADGE ───────────────────────────────────────────────────────────
function setQueueBadge(n) {
  const el = document.getElementById("queue-badge");
  if (!el) return;
  el.textContent = n;
  el.className = "queue-badge " + (n === 0 ? "zero" : "some");
}

// ── FOOTER ────────────────────────────────────────────────────────────────
function renderFooter(stats, lastModified) {
  const el = document.getElementById("footer-build");
  if (!el) return;
  const parts = [];
  if (stats?.features != null) parts.push(`${fmtNum(stats.features)} features`);
  if (lastModified)            parts.push(`Built ${fmtDate(lastModified)}`);
  el.textContent = parts.join(" · ");
}

// ── MAIN ──────────────────────────────────────────────────────────────────
async function init() {
  const loadingEl   = document.getElementById("loading-msg");
  const dashboardEl = document.getElementById("dashboard");

  try {
    const [csvResult, statsResult] = await Promise.allSettled([
      fetchText(REVIEW_CSV_URL),
      fetchJSONWithMeta(BUILD_STATS_URL),
    ]);

    if (csvResult.status === "rejected") {
      throw new Error(
        "Could not load geocode_review.csv.\n" + csvResult.reason +
        "\n\nMake sure GitHub Pages is configured to serve from the " +
        "repository root (not the docs/ folder). See the comment at the " +
        "bottom of index.html for setup instructions."
      );
    }

    ALL_ROWS = csvToObjects(csvResult.value);
    const stats        = statsResult.status === "fulfilled" ? statsResult.value.data         : null;
    const lastModified = statsResult.status === "fulfilled" ? statsResult.value.lastModified : "";

    // ── Populate sections ──
    document.getElementById("stats-grid").innerHTML   = renderStats(ALL_ROWS, stats);
    document.getElementById("file-actions").innerHTML = renderFileActions();
    document.getElementById("github-links").innerHTML = renderGithubLinks();

    // Build meta line
    const metaEl = document.getElementById("build-meta");
    if (metaEl && lastModified) {
      metaEl.textContent = `Last build: ${fmtDate(lastModified)}`;
    }

    // Status + badge + footer
    const n = ALL_ROWS.length;
    setStatus(n === 0 ? "ok" : "warn", n === 0 ? "All clear" : `${n} row${n !== 1 ? "s" : ""} pending`);
    setQueueBadge(n);
    renderFooter(stats, lastModified);

    // Show dashboard
    loadingEl.style.display  = "none";
    dashboardEl.style.display = "block";

    // Filters and initial render
    initFilters();
    applyFiltersAndSearch();

  } catch (err) {
    loadingEl.innerHTML = `
      <div class="error-state">
        <strong>Could not load dashboard data.</strong>
        <span style="white-space:pre-wrap">${esc(err.message)}</span>
      </div>`;
    setStatus("err", "Error loading data");
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", init);
