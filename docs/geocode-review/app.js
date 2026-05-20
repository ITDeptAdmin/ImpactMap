// RAM Impact Map — Update Center Dashboard
// =========================================
//
// !! REPO-SPECIFIC VALUES TO UPDATE !!
// ------------------------------------
// 1. GITHUB_REPO   — set to your actual "owner/repo" string
// 2. GITHUB_BRANCH — branch that holds the live source files
// 3. DATA_BASE     — change to raw.githubusercontent.com URL if Pages
//                    serves from docs/ instead of repo root
//
// GitHub Pages must serve from the REPO ROOT for relative paths to work:
//   Settings → Pages → Source: Deploy from branch → Folder: / (root)
// If serving from docs/, change DATA_BASE to:
//   "https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/main"

// ── CONFIG ────────────────────────────────────────────────────────────────
const DATA_BASE    = "../..";
const GITHUB_REPO   = "ITDeptAdmin/ImpactMap";
const GITHUB_BRANCH = "staging";

const REVIEW_CSV_URL   = `${DATA_BASE}/output/geocode_review.csv`;
const BUILD_STATS_URL  = `${DATA_BASE}/output/build_stats.json`;
const CSV_DOWNLOAD_URL = `${DATA_BASE}/data/Master_Clinic_ImpactMap.csv`;
const GEO_DOWNLOAD_URL = `${DATA_BASE}/output/ImpactMap_Dataset.geojson`;

const GITHUB_BASE        = `https://github.com/${GITHUB_REPO}`;
const GITHUB_API_BASE    = `https://api.github.com/repos/${GITHUB_REPO}`;
const GITHUB_ACTIONS_URL = `${GITHUB_BASE}/actions`;
const GITHUB_PRS_URL     = `${GITHUB_BASE}/pulls`;
const GITHUB_CSV_URL     = `${GITHUB_BASE}/blob/${GITHUB_BRANCH}/data/Master_Clinic_ImpactMap.csv`;
const GITHUB_UPLOAD_URL  = `${GITHUB_BASE}/upload/${GITHUB_BRANCH}/data`;

// Search URL for open geocode review PRs
const REVIEW_PRS_SEARCH_URL = `${GITHUB_BASE}/pulls?q=is%3Aopen+is%3Apr+geocode+suggestion`;

// Status labels and icons for row PR status badges
const STATUS_LABELS = {
  ready:    "Ready to Review",
  approved: "Approved — Waiting for Rebuild",
  rejected: "Rejected — Needs Manual Fix",
  pending:  "Suggested Fix Not Created Yet",
  unknown:  "Status Unavailable",
  loading:  "Checking status…",
};
const STATUS_ICONS = {
  ready:    "🔵",
  approved: "✅",
  rejected: "🔴",
  pending:  "⏳",
  unknown:  "❓",
  loading:  "⏳",
};

// Priority for resolving multiple PRs targeting the same row
const STATUS_PRIORITY = { ready: 3, approved: 2, rejected: 1, pending: 0 };

// ── STATE ─────────────────────────────────────────────────────────────────
let ALL_ROWS         = [];
let currentFilter    = "all";
let searchQuery      = "";
let PR_STATUS_MAP    = {};   // row string → {status, prUrl, prNumber}
let prStatusesLoaded = false;

// ── CSV PARSER ────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const row = [];
    while (i < n) {
      if (text[i] === '"') {
        let val = ""; i++;
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
  const r = await fetch(url + "?_=" + Date.now());
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

function copySearchText(btn) {
  copyText(btn.dataset.searchText, btn);
}

// ── STATUS INDICATOR ──────────────────────────────────────────────────────
function setStatus(cls, label) {
  const dot  = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  if (dot)  dot.className = "status-dot " + cls;
  if (text) text.textContent = label;
}

// ── PR STATUS FETCHER ─────────────────────────────────────────────────────
// Fetches all geocode-suggestion PRs from GitHub (unauthenticated, public repo).
// Builds PR_STATUS_MAP[rowNum] = {status, prUrl, prNumber}.
// Gracefully degrades — never throws; on failure, cards show "Status Unavailable".
async function fetchPRStatuses() {
  try {
    let allPRs = [];
    for (let page = 1; page <= 3; page++) {
      const url = `${GITHUB_API_BASE}/pulls?state=all&per_page=100&page=${page}`;
      const r = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
      if (!r.ok) {
        if (r.status === 403 || r.status === 429) {
          console.warn("GitHub API rate limit reached — row statuses unavailable");
        } else {
          console.warn(`GitHub API error ${r.status} — row statuses unavailable`);
        }
        break;
      }
      const data = await r.json();
      if (!Array.isArray(data)) break;
      allPRs = allPRs.concat(data);
      if (data.length < 100) break;
    }

    PR_STATUS_MAP = {};
    for (const pr of allPRs) {
      const branch = pr.head && pr.head.ref ? pr.head.ref : "";
      const m = branch.match(/^geocode-suggestion\/row-(\d+)$/);
      if (!m) continue;
      const rowNum = m[1];

      const newStatus = pr.state === "open"
        ? "ready"
        : (pr.merged_at ? "approved" : "rejected");

      const existing = PR_STATUS_MAP[rowNum];
      if (!existing ||
          (STATUS_PRIORITY[newStatus] || 0) > (STATUS_PRIORITY[existing.status] || 0)) {
        PR_STATUS_MAP[rowNum] = {
          status:   newStatus,
          prUrl:    pr.html_url,
          prNumber: pr.number,
        };
      }
    }
  } catch (e) {
    console.warn("Could not load PR statuses:", e);
  }
  // Mark loaded regardless of success so cards stop showing "Checking status…"
  prStatusesLoaded = true;
}

// Returns the status object for a given review row.
function rowStatus(r) {
  if (!hasSuggestion(r))  return { status: "no-suggestion", prInfo: null };
  if (!prStatusesLoaded)  return { status: "loading",       prInfo: null };
  const info = PR_STATUS_MAP[String(r.row)];
  if (!info)              return { status: "pending",       prInfo: null };
  return { status: info.status, prInfo: info };
}

// ── MAIN STATS (3 primary cards) ──────────────────────────────────────────
function renderMainStats(rows, stats, lastModified) {
  const pending  = rows.length;
  const features = stats?.features ?? null;
  const builtAt  = fmtDate(lastModified);

  const cards = [
    {
      icon: "🗺",
      label: "Locations on Map",
      value: fmtNum(features),
      cls: "hi",
    },
    {
      icon: pending === 0 ? "✅" : "⚠️",
      label: "Pending Review",
      value: fmtNum(pending),
      cls: pending === 0 ? "ok" : "warn",
    },
    {
      icon: "🕒",
      label: "Last Build",
      value: builtAt || "—",
      cls: "",
      small: true,
    },
  ];

  return cards.map(({ icon, label, value, cls, small }) => `
    <div class="stat-card ${cls}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value${small ? " stat-value-sm" : ""}">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`).join("");
}

// ── ADVANCED STATS (4 detail cards) ───────────────────────────────────────
function renderAdvancedStats(rows, stats) {
  const pending    = rows.length;
  const withSug    = rows.filter(hasSuggestion).length;
  const noSug      = pending - withSug;
  const autoFilled = stats?.coordinate_rows_updated ?? null;
  const stillMiss  = stats?.skipped_missing_latlon  ?? null;

  const cards = [
    { icon: "📍", label: "Has Suggestion",        value: fmtNum(withSug),    cls: withSug > 0 ? "warn" : "" },
    { icon: "❓", label: "No Suggestion Yet",      value: fmtNum(noSug),      cls: "" },
    { icon: "⚡", label: "Auto-Filled This Build", value: fmtNum(autoFilled), cls: "" },
    { icon: "🚫", label: "Still Missing Coords",  value: fmtNum(stillMiss),  cls: stillMiss > 0 ? "warn" : "" },
  ];

  return cards.map(({ icon, label, value, cls }) => `
    <div class="stat-card ${cls}">
      <div class="stat-icon">${icon}</div>
      <div class="stat-value">${esc(value)}</div>
      <div class="stat-label">${esc(label)}</div>
    </div>`).join("");
}

// ── PRIMARY ACTIONS ───────────────────────────────────────────────────────
function renderPrimaryActions(rows) {
  const pending = rows.length;
  const withSug = rows.filter(hasSuggestion).length;

  let html = `
    <div class="primary-btns">
      <a href="${esc(CSV_DOWNLOAD_URL)}"
         class="primary-btn primary-btn-download"
         download="Master_Clinic_ImpactMap.csv">
        <span class="primary-btn-icon">⬇</span>
        <div>
          <div class="primary-btn-label">Download Current CSV</div>
          <div class="primary-btn-sub">Master_Clinic_ImpactMap.csv</div>
        </div>
      </a>
      <a href="${esc(GITHUB_UPLOAD_URL)}"
         class="primary-btn primary-btn-upload"
         target="_blank" rel="noopener noreferrer">
        <span class="primary-btn-icon">⬆</span>
        <div>
          <div class="primary-btn-label">Upload Updated CSV</div>
          <div class="primary-btn-sub">Opens GitHub file upload</div>
        </div>
      </a>`;

  if (pending > 0) {
    const count = withSug > 0
      ? `${withSug} suggestion${withSug !== 1 ? "s" : ""}`
      : `${pending} pending`;
    html += `
      <a href="${esc(REVIEW_PRS_SEARCH_URL)}"
         class="primary-btn primary-btn-prs"
         target="_blank" rel="noopener noreferrer">
        <span class="primary-btn-icon">🔀</span>
        <div>
          <div class="primary-btn-label">Review Suggested Fixes (${esc(count)})</div>
          <div class="primary-btn-sub">Open Suggested Fixes on GitHub</div>
        </div>
      </a>`;
  }

  html += `</div>`;
  return html;
}

// ── ADVANCED ACTIONS (technical links) ────────────────────────────────────
function renderAdvancedActions() {
  const items = [
    { href: GEO_DOWNLOAD_URL,                             icon: "⬇", label: "Download Map GeoJSON",       dl: "ImpactMap_Dataset.geojson" },
    { href: `${DATA_BASE}/output/geocode_review.csv`,     icon: "⬇", label: "Download Geocode Review CSV", dl: "geocode_review.csv" },
    { href: `${DATA_BASE}/output/build_stats.json`,       icon: "⬇", label: "Download Build Stats JSON",   dl: "build_stats.json" },
    { href: GITHUB_CSV_URL,    icon: "📄", label: "View CSV on GitHub",     target: true },
    { href: GITHUB_PRS_URL,    icon: "🔀", label: "All Suggested Fixes",   target: true },
    { href: GITHUB_ACTIONS_URL,icon: "⚙", label: "Map Update Logs",        target: true },
  ];
  return items.map(a => {
    const dl     = a.dl     ? `download="${esc(a.dl)}"` : "";
    const target = a.target ? `target="_blank" rel="noopener noreferrer"` : "";
    return `
      <a href="${esc(a.href)}" class="action-link" ${dl} ${target}>
        <span class="action-icon">${a.icon}</span>
        <span>${esc(a.label)}</span>
      </a>`;
  }).join("");
}

// ── CONFIDENCE BADGE ──────────────────────────────────────────────────────
function confidenceBadge(conf) {
  if (!conf) return "";
  const cls = ["low", "medium", "high", "exact"].includes(conf) ? conf : "unknown";
  return `<span class="badge ${cls}">${esc(conf)}</span>`;
}

// ── PR SEARCH URL for a specific row ──────────────────────────────────────
// Quoted phrases match the exact PR title format:
//   "Approve geocode suggestion — Row 1821 — Event 1820"
// Using two quoted fragments is more reliable than encoding the em dash.
function rowPrSearchUrl(rowNum) {
  const q = encodeURIComponent(`"Approve geocode suggestion" "Row ${rowNum}"`);
  return `${GITHUB_BASE}/pulls?q=is%3Aopen+is%3Apr+${q}`;
}

// ── CSV EDIT URL ───────────────────────────────────────────────────────────
function csvEditUrl() {
  return `${GITHUB_BASE}/edit/${GITHUB_BRANCH}/data/Master_Clinic_ImpactMap.csv`;
}

// ── BUILD SEARCH TEXT ─────────────────────────────────────────────────────
// Returns a raw CSV-fragment that can be found with Ctrl+F in the GitHub CSV
// editor (which shows the raw file). event,expedition are consecutive columns,
// so "1820,1819" will match exactly one row.
function buildSearchText(r) {
  const ev  = (r.event      || "").trim();
  const exp = (r.expedition || "").trim();
  if (ev && exp) return `${ev},${exp}`;
  if (ev)        return `${ev},`;
  if (exp)       return `,${exp},`;
  const addr = (r.address || "").trim();
  const zip  = (r.zipcode  || "").trim();
  const city = (r.city     || "").trim();
  const ctry = (r.country  || "").trim();
  return addr || zip || city || ctry || String(r.row || "");
}

// ── REVIEW CARD ───────────────────────────────────────────────────────────
function renderCard(r) {
  const sug        = hasSuggestion(r);
  const { status, prInfo } = rowStatus(r);
  const location   = [r.city, r.state || r.non_us_state, r.country].filter(Boolean).join(", ");
  const coords     = sug ? `${r.suggested_latitude}, ${r.suggested_longitude}` : "";
  const mapsUrl    = sug
    ? `https://www.google.com/maps?q=${encodeURIComponent(r.suggested_latitude)},${encodeURIComponent(r.suggested_longitude)}`
    : "";

  const csvLineNum = r.row ? Number(r.row) + 1 : "";
  const csvRowUrl  = `${GITHUB_CSV_URL}#L${csvLineNum}`;

  // Status badge (only for rows that have a suggestion)
  const statusBadgeHtml = sug ? `
    <span class="status-badge ${esc(status)}" title="${esc(STATUS_LABELS[status] || status)}">
      ${STATUS_ICONS[status] || "❓"} ${esc(STATUS_LABELS[status] || status)}
    </span>` : "";

  // Suggestion / no-suggestion block
  let sugBlock;
  if (sug) {
    // Choose the best PR link — direct if we have it, search fallback otherwise
    const reviewUrl  = prInfo ? prInfo.prUrl : rowPrSearchUrl(r.row);
    const reviewTitle = prInfo
      ? `Opens the Suggested Fix directly on GitHub`
      : `Searches GitHub for the Suggested Fix for this row`;

    // Per-status action buttons and helper text
    let actionBtnsHtml = "";
    let helperHtml = "";

    if (status === "approved") {
      // PR merged — no action needed, map will rebuild
      helperHtml = `
        <div class="sug-note sug-note-approved">
          ✅ This row was approved and the map is waiting to rebuild. It will disappear from this queue after the next build. No action needed.
        </div>`;
    } else if (status === "rejected") {
      actionBtnsHtml = `
        <div class="sug-actions">
          <a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer"
             class="btn btn-maps">1. Check Map Location</a>
          <a href="${esc(reviewUrl)}" target="_blank" rel="noopener noreferrer"
             class="btn btn-pr-rejected" title="${esc(reviewTitle)}">
            📋 View Rejected Fix
          </a>
          <button class="btn btn-sm-copy"
                  onclick="copyText(${JSON.stringify(coords)}, this)"
                  title="Copy suggested coordinates">📋 Copy Coordinates</button>
        </div>`;
      helperHtml = `
        <div class="sug-note sug-note-rejected">
          🔴 This Suggested Fix was rejected. Next step: fix this row in the CSV, then upload the CSV again.
        </div>`;
    } else if (status === "pending") {
      actionBtnsHtml = `
        <div class="sug-actions">
          <a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer"
             class="btn btn-maps">1. Check Map Location</a>
          <a href="${esc(GITHUB_ACTIONS_URL)}" target="_blank" rel="noopener noreferrer"
             class="btn btn-pr-link" title="Open GitHub Actions to run Create Review Fixes">
            ⚙ GitHub Actions
          </a>
          <button class="btn btn-sm-copy"
                  onclick="copyText(${JSON.stringify(coords)}, this)"
                  title="Copy suggested coordinates">📋 Copy Coordinates</button>
        </div>`;
      helperHtml = `
        <div class="sug-note sug-note-pending">
          ⏳ No Suggested Fix has been created yet. Run <strong>Create Review Fixes</strong> from
          <a href="${esc(GITHUB_ACTIONS_URL)}" target="_blank" rel="noopener noreferrer">GitHub Actions</a>,
          or wait a few minutes for the system to finish automatically.
        </div>`;
    } else {
      // ready, loading, unknown — show full action buttons
      actionBtnsHtml = `
        <div class="sug-actions">
          <a href="${esc(mapsUrl)}" target="_blank" rel="noopener noreferrer"
             class="btn btn-maps">1. Check Map Location</a>
          <a href="${esc(reviewUrl)}" target="_blank" rel="noopener noreferrer"
             class="btn btn-pr-link" title="${esc(reviewTitle)}">
            🔍 2. Review Suggested Fix
          </a>
          <button class="btn btn-sm-copy"
                  onclick="copyText(${JSON.stringify(coords)}, this)"
                  title="Copy suggested coordinates">📋 Copy Coordinates</button>
        </div>`;
      if (status === "ready") {
        helperHtml = `
          <div class="sug-note sug-note-ready">
            🔵 If the map location looks correct, open the Suggested Fix and approve it.
            If it looks wrong, reject it and manually fix the CSV.
            <span class="gh-hint">(On GitHub: green <strong>Merge pull request</strong> to approve,
            or <strong>Close pull request</strong> to reject)</span>
          </div>`;
      } else if (status === "loading") {
        helperHtml = `
          <div class="sug-note sug-note-pending">
            ⏳ Checking Suggested Fix status…
          </div>`;
      } else {
        // unknown
        helperHtml = `
          <div class="sug-note sug-note-pending">
            ❓ Status unavailable.
            <a href="${esc(rowPrSearchUrl(r.row))}" target="_blank" rel="noopener noreferrer">Search GitHub</a>
            for the Suggested Fix directly.
          </div>`;
      }
    }

    sugBlock = `
      <div class="sug-block sug-status-${esc(status)}">
        <div class="sug-hdr">
          📍 Suggested Coordinates
          ${confidenceBadge(r.suggested_confidence)}
          <span class="sug-source">${esc(r.suggested_source)}</span>
        </div>
        <div class="sug-addr">${esc(r.suggested_address)}</div>
        <div class="sug-coords">${esc(coords)}</div>
        ${actionBtnsHtml}
        ${helperHtml}
      </div>`;
  } else {
    sugBlock = `
      <div class="sug-block no-sug-block">
        <div class="sug-hdr">❓ No Suggestion Available</div>
        <p class="no-sug-text">The system could not find a confident location for this row.
          Fix the CSV by adding a better street address or by entering the Latitude and Longitude directly.</p>
      </div>`;
  }

  // Build a raw CSV-fragment for Ctrl+F in the GitHub CSV editor.
  // event,expedition (e.g. "1820,1819") appears as consecutive columns in the raw CSV.
  const searchText = buildSearchText(r);

  // CSV action buttons — always shown on every card
  const csvActions = `
    <div class="csv-actions-block">
      <div class="field-label">CSV Actions</div>
      <div class="csv-btns">
        <a href="${esc(csvRowUrl)}" target="_blank" rel="noopener noreferrer"
           class="btn btn-csv" title="View CSV file on GitHub near line ${csvLineNum}">
          📄 View CSV Row
        </a>
        <button class="btn btn-csv"
                data-search-text="${esc(searchText)}"
                onclick="copySearchText(this)"
                title="Copies raw CSV text like 1820,1819 so you can press Ctrl+F in the CSV editor">
          🔍 Copy Search Text
        </button>
        <a href="${esc(csvEditUrl())}" target="_blank" rel="noopener noreferrer"
           class="btn btn-csv" title="Open the CSV file in the GitHub editor">
          ✏️ Edit CSV File
        </a>
      </div>
      <p class="csv-help-note">Use <strong>View CSV Row</strong> to see the exact row.
        Use <strong>Copy Search Text</strong>, then <strong>Edit CSV File</strong> and press
        <strong>Ctrl+F</strong> — the copied text matches the raw CSV so the row is easy to find.</p>
    </div>`;

  const cardClass = sug ? `status-${status}` : "status-no-suggestion";

  return `
    <div class="review-card ${cardClass}">
      <div class="card-hdr">
        <span class="row-chip ${sug ? "sug" : ""}">ROW ${esc(r.row)}</span>
        <span class="card-event">Event&nbsp;${esc(r.event)} · Exp.&nbsp;${esc(r.expedition)}</span>
        <span class="card-location">${esc(location) || "<em>No location</em>"}</span>
        <span class="card-year">${esc(r.year)}</span>
        ${statusBadgeHtml}
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
        ${csvActions}
      </div>
    </div>`;
}

// ── FILTER + SEARCH ───────────────────────────────────────────────────────
function applyFiltersAndSearch() {
  const listEl      = document.getElementById("review-list");
  const countEl     = document.getElementById("filter-count");
  const prsBtnEl    = document.getElementById("review-prs-btn");
  const queueNoteEl = document.getElementById("queue-pr-note");

  let visible = ALL_ROWS;

  if (currentFilter === "ready") {
    visible = visible.filter(r => rowStatus(r).status === "ready");
  } else if (currentFilter === "rejected") {
    visible = visible.filter(r => rowStatus(r).status === "rejected");
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
    if (prsBtnEl)    prsBtnEl.style.display    = "none";
    if (queueNoteEl) queueNoteEl.style.display = "none";
    return;
  }

  // Show workflow hint whenever there are review rows
  if (queueNoteEl) queueNoteEl.style.display = "block";

  if (visible.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state neutral">
        <div class="empty-icon">🔍</div>
        <div class="empty-title" style="color:var(--text-muted)">No rows match your filter</div>
        <p class="empty-sub">Try a different filter or clear the search box.</p>
      </div>`;
    countEl.style.display = "none";
    return;
  }

  listEl.innerHTML = `<div class="review-list">${visible.map(renderCard).join("")}</div>`;

  if (visible.length !== ALL_ROWS.length) {
    countEl.textContent  = `Showing ${visible.length} of ${ALL_ROWS.length} row${ALL_ROWS.length !== 1 ? "s" : ""}`;
    countEl.style.display = "block";
  } else {
    countEl.style.display = "none";
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
  if (lastModified)             parts.push(`Built ${fmtDate(lastModified)}`);
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

    // Main stats
    document.getElementById("main-stats-grid").innerHTML =
      renderMainStats(ALL_ROWS, stats, lastModified);

    // Advanced stats
    document.getElementById("advanced-stats-grid").innerHTML =
      renderAdvancedStats(ALL_ROWS, stats);

    // Primary actions
    document.getElementById("primary-actions").innerHTML =
      renderPrimaryActions(ALL_ROWS);

    // Advanced actions
    document.getElementById("advanced-actions").innerHTML =
      renderAdvancedActions();

    // Build meta line
    const metaEl = document.getElementById("build-meta");
    if (metaEl && lastModified) {
      metaEl.textContent = `Last build: ${fmtDate(lastModified)}`;
    }

    // Status + badge
    const n = ALL_ROWS.length;
    setStatus(n === 0 ? "ok" : "warn", n === 0 ? "All clear" : `${n} row${n !== 1 ? "s" : ""} pending`);
    setQueueBadge(n);

    // "Review Pending Suggestions" button in queue header
    const prsBtnEl = document.getElementById("review-prs-btn");
    if (prsBtnEl && n > 0) {
      prsBtnEl.href = REVIEW_PRS_SEARCH_URL;
      prsBtnEl.style.display = "inline-flex";
    }

    // Wire Actions link inside the queue note
    const actionsLinkEl = document.getElementById("actions-link-inline");
    if (actionsLinkEl) actionsLinkEl.href = GITHUB_ACTIONS_URL;

    renderFooter(stats, lastModified);

    loadingEl.style.display   = "none";
    dashboardEl.style.display = "block";

    initFilters();
    applyFiltersAndSearch();

    // Fetch PR statuses in background; re-render cards when done.
    // Only needed if there are rows with suggestions.
    if (ALL_ROWS.some(hasSuggestion)) {
      fetchPRStatuses().then(() => applyFiltersAndSearch());
    }

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
