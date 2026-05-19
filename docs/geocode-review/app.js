// RAM Impact Map — Geocode Review Dashboard
//
// DATA PATH CONFIGURATION
// -----------------------
// GitHub Pages must be configured to serve from the repository root
// (Settings → Pages → Source: Deploy from branch → folder: / (root)).
// If your Pages source is the docs/ folder instead, change DATA_BASE
// to an absolute URL such as:
//   "https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/main"
const DATA_BASE = "../..";
const REVIEW_CSV_URL   = `${DATA_BASE}/output/geocode_review.csv`;
const BUILD_STATS_URL  = `${DATA_BASE}/output/build_stats.json`;

// Adjust these to match your actual GitHub repository.
const GITHUB_REPO       = "ITDeptAdmin/ImpactMap";
const GITHUB_ACTIONS_URL = `https://github.com/${GITHUB_REPO}/actions`;
const GITHUB_PRS_URL     = `https://github.com/${GITHUB_REPO}/pulls`;

// ── CSV parser (handles quoted fields and embedded newlines) ──────────────

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const row = [];
    while (i < n) {
      if (text[i] === '"') {
        // quoted field
        let val = "";
        i++; // skip opening quote
        while (i < n) {
          if (text[i] === '"') {
            if (text[i + 1] === '"') { val += '"'; i += 2; }
            else { i++; break; } // closing quote
          } else {
            val += text[i++];
          }
        }
        row.push(val);
      } else {
        // unquoted field — read until comma or line ending
        let val = "";
        while (i < n && text[i] !== "," && text[i] !== "\n" && text[i] !== "\r") {
          val += text[i++];
        }
        row.push(val);
      }
      if (i < n && text[i] === ",") { i++; continue; }
      break; // end of row
    }
    // consume line ending
    if (i < n && text[i] === "\r") i++;
    if (i < n && text[i] === "\n") i++;

    if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
      rows.push(row);
    }
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

// ── Fetch helpers ─────────────────────────────────────────────────────────

async function fetchText(url) {
  const resp = await fetch(url + "?_=" + Date.now()); // bust cache
  if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${url}`);
  return resp.text();
}

async function fetchJSON(url) {
  const resp = await fetch(url + "?_=" + Date.now());
  if (!resp.ok) throw new Error(`HTTP ${resp.status} loading ${url}`);
  return resp.json();
}

// ── Rendering ─────────────────────────────────────────────────────────────

function confidenceBadge(conf) {
  if (!conf) return "";
  const cls = conf === "low" ? "tag-low" : conf === "medium" ? "tag-medium" : "tag-high";
  return `<span class="${cls}">${esc(conf)}</span>`;
}

function mapsLink(lat, lon) {
  if (!lat || !lon) return "";
  const url = `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lon)}`;
  return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="btn-secondary"
            style="padding:3px 8px;font-size:0.75rem;display:inline-block;">📍 Map</a>`;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasSuggestion(row) {
  return !!(row.suggested_latitude && row.suggested_longitude);
}

function renderStats(rows, buildStats) {
  const withSuggestion = rows.filter(hasSuggestion).length;
  const withoutSuggestion = rows.length - withSuggestion;

  const items = [
    { label: "Rows needing review", value: rows.length },
    { label: "With suggested coords", value: withSuggestion },
    { label: "No suggestion yet",   value: withoutSuggestion },
    { label: "Features in map",     value: buildStats ? (buildStats.features ?? "—") : "—" },
  ];

  return items.map(({ label, value }) => `
    <div class="stat-card">
      <div class="stat-label">${esc(label)}</div>
      <div class="stat-value">${esc(String(value))}</div>
    </div>`).join("");
}

function renderToolbar(rows) {
  const withSug = rows.filter(hasSuggestion);
  const allNums = withSug.map(r => r.row).filter(Boolean).join(", ");

  return `
    <button class="btn-copy" onclick="copyText(${JSON.stringify(allNums)}, this)"
            title="Copy all row numbers that have suggested coordinates">
      📋 Copy all suggestion row numbers
    </button>
    <a class="btn-secondary" href="${esc(GITHUB_PRS_URL)}" target="_blank" rel="noopener noreferrer">
      🔀 Open Pull Requests
    </a>
    <a class="btn-secondary" href="${esc(GITHUB_ACTIONS_URL)}" target="_blank" rel="noopener noreferrer">
      ⚙️ Open GitHub Actions
    </a>
    <button class="btn-secondary" onclick="location.reload()">🔄 Refresh</button>`;
}

function renderTable(rows) {
  if (rows.length === 0) {
    return `<div class="empty-state">
      <div class="big">✅</div>
      <strong>No rows need geocode review.</strong><br>
      All coordinates are filled or no review rows were generated on the last build.
    </div>`;
  }

  const header = `
    <thead><tr>
      <th>Row</th>
      <th>Event</th>
      <th>Expedition</th>
      <th>Year</th>
      <th>Address</th>
      <th>City / State / Country</th>
      <th>Reason</th>
      <th>Sug. Lat</th>
      <th>Sug. Lon</th>
      <th>Confidence</th>
      <th>Suggested Address</th>
      <th>Source</th>
      <th>Map</th>
      <th></th>
    </tr></thead>`;

  const bodyRows = rows.map(r => {
    const location = [r.city, r.state || r.non_us_state, r.country]
      .filter(Boolean).join(", ");
    const sug = hasSuggestion(r);
    const noSug = `<span class="no-suggestion">—</span>`;

    return `<tr>
      <td><strong>${esc(r.row)}</strong></td>
      <td>${esc(r.event)}</td>
      <td>${esc(r.expedition)}</td>
      <td>${esc(r.year)}</td>
      <td class="address-cell">${esc(r.address)}</td>
      <td>${esc(location)}</td>
      <td class="reason-cell">${esc(r.reason)}</td>
      <td>${sug ? esc(r.suggested_latitude) : noSug}</td>
      <td>${sug ? esc(r.suggested_longitude) : noSug}</td>
      <td>${sug ? confidenceBadge(r.suggested_confidence) : noSug}</td>
      <td class="address-cell">${sug ? esc(r.suggested_address) : noSug}</td>
      <td style="font-size:0.75rem;color:#666">${sug ? esc(r.suggested_source) : noSug}</td>
      <td>${mapsLink(r.suggested_latitude, r.suggested_longitude)}</td>
      <td>
        ${sug
          ? `<button class="btn-copy" style="padding:3px 8px;font-size:0.75rem"
               onclick="copyText(${JSON.stringify(r.row)}, this)"
               title="Copy row number">📋 ${esc(r.row)}</button>`
          : ""}
      </td>
    </tr>`;
  }).join("");

  return `<div class="table-wrap"><table>${header}<tbody>${bodyRows}</tbody></table></div>`;
}

// ── Copy helper ───────────────────────────────────────────────────────────

async function copyText(text, btn) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "✅ Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1800);
  } catch {
    prompt("Copy this text:", text);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function init() {
  const statusEl  = document.getElementById("status-msg");
  const statsEl   = document.getElementById("stats-bar");
  const toolbarEl = document.getElementById("toolbar");
  const tableEl   = document.getElementById("review-table");
  const tsEl      = document.getElementById("last-updated");

  try {
    const [csvText, buildStats] = await Promise.allSettled([
      fetchText(REVIEW_CSV_URL),
      fetchJSON(BUILD_STATS_URL),
    ]);

    if (csvText.status === "rejected") {
      throw new Error("Could not load geocode_review.csv — " + csvText.reason);
    }

    const rows = csvToObjects(csvText.value);
    const stats = buildStats.status === "fulfilled" ? buildStats.value : null;

    statusEl.style.display = "none";
    statsEl.innerHTML  = renderStats(rows, stats);
    toolbarEl.innerHTML = renderToolbar(rows);
    tableEl.innerHTML  = renderTable(rows);

    if (stats) {
      tsEl.textContent = `Last build: ${stats.features ?? "?"} features · ${rows.length} row(s) pending review`;
    }
  } catch (err) {
    statusEl.className = "error-msg";
    statusEl.textContent = "Error loading data: " + err.message;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", init);
