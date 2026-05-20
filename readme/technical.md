# Technical Reference – RAM Impact Map

This document explains the architecture, data pipeline, and operational details for developers and technical staff.

---

# Architecture Overview

**Public Map (WordPress site):**

```
WordPress Plugin (JS + PHP)
↓
Loads GeoJSON from GitHub Raw CDN
↓
Mapbox GL JS renders map
↓
GTM captures events
↓
GA4 stores engagement data
```

**Impact Map Update Center (GitHub Pages, staff-facing):**

```
Static HTML/JS dashboard (docs/geocode-review/)
↓
Reads review CSV + build stats from GitHub Raw CDN
↓
Calls GitHub REST API (unauthenticated, read-only)
↓
Displays row status badges + action buttons
↓
Staff actions go through GitHub Pull Requests (Suggested Fixes)
```

The Update Center is fully read-only from the browser. All data changes happen through GitHub Pull Requests that require write access.

---

# Data Pipeline

```
Staff uploads Master_Clinic_ImpactMap.csv
↓
build-impactmap.yml triggers
↓
build_impactmap_geojson.py runs:
  - Matches missing coordinates from existing CSV rows
  - Uses Mapbox geocoding when needed (with validation)
  - Writes output/ImpactMap_Dataset.geojson
  - Writes output/geocode_review.csv
  - Writes output/build_stats.json
  - Appends to logs/update_log.csv
↓
create-geocode-review-pr.yml triggers
↓
create_row_prs.py runs:
  - For each review row with a suggested coordinate:
    - Creates branch geocode-suggestion/row-{N}
    - Runs apply_geocode_suggestions.py --review-row N
    - Opens Pull Request ("Suggested Fix")
↓
Staff opens Update Center dashboard
↓
Dashboard shows row status (Ready / Rejected / Pending / Approved)
↓
Staff approves (merges PR) → build-impactmap.yml re-triggers
↓
Map rebuilds with approved coordinates
↓
Row disappears from Review Queue
```

---

# Important Configuration Location

File: `ram-impact-map.php`

Contains:
- Mapbox display token
- `geojsonUrl`
- Dataset version

The critical line is the GeoJSON URL.

If the repo name or branch changes, this must be updated.

---

# Scripts

## `scripts/build_impactmap_geojson.py`

Main build script, run by `build-impactmap.yml`.

- Reads `data/Master_Clinic_ImpactMap.csv`
- Matches missing coordinates from existing rows first
- Uses Mapbox geocoding only when no match exists
- Enforces U.S. address validation before auto-approving Mapbox results (confidence + feature type + street number check)
- Never overwrites existing coordinates
- Writes GeoJSON, review CSV, build stats, audit log

## `scripts/apply_geocode_suggestions.py`

Applies one suggested coordinate to the CSV and rebuilds.

- Accepts `--review-row N` (required, single-row mode)
- Validates the target row still has blank lat/lon before writing
- Re-runs `build_impactmap_geojson.py` after applying
- Appends to `logs/geocode_approval_suggestions.csv`
- Always exits 0 (non-fatal)

## `scripts/create_row_prs.py`

Creates one Pull Request per review row that has suggested coordinates.

- Reads `output/geocode_review.csv`
- Skips rows already having an open PR or existing remote branch (`geocode-suggestion/row-{N}`)
- Creates each branch from the base branch tip
- Calls `apply_geocode_suggestions.py` to apply the suggestion
- Commits staged changes and pushes
- Opens PR with title: `Approve geocode suggestion — Row {N} — Event {E}`
- Writes a GitHub step summary

`geocode-suggestion/row-{N}` branches are temporary. They should be deleted after the PR is merged or closed. GitHub can delete them automatically: **Settings → General → Pull Requests → Automatically delete head branches**. Deleting these branches does not affect `main`, `staging`, the CSV, or map data.

---

# GitHub Actions Workflows

## `build-impactmap.yml`

**Triggers:**
- Push to `main` or `staging` when CSV or data files change
- `workflow_dispatch` (manual)

**Requirements:**
- `MAPBOX_GEOCODING_TOKEN` secret
- Workflow permissions: **Read and write**
- Loop prevention: bot auto-commits do not re-trigger this workflow

## `create-geocode-review-pr.yml`

**Triggers:**
- `workflow_run`: after `Build Impact Map GeoJSON` completes successfully on non-bot commits
- `workflow_dispatch` (manual fallback)

**Requirements:**
- Workflow permissions: **Read and write**
- Repository setting: **Allow GitHub Actions to create and approve pull requests** — must be enabled
- `MAPBOX_GEOCODING_TOKEN` secret

Does not auto-merge. Uses only `GITHUB_TOKEN`. Creates one PR per review row.

---

# GitHub Pages Dashboard

## Required Setup

GitHub Pages must serve from the **repository root** (not `docs/`):

```
Repository → Settings → Pages → Source → Deploy from branch
Branch: main (or staging)    Folder: / (root)
```

If Pages is configured to serve from `docs/` instead, change `DATA_BASE` in `docs/geocode-review/app.js` to the raw.githubusercontent.com URL.

## Dashboard URL

```
https://itdeptadmin.github.io/ImpactMap/docs/geocode-review/
```

## Data files (relative paths from the dashboard page)

```
../../output/geocode_review.csv
../../output/build_stats.json
../../data/Master_Clinic_ImpactMap.csv
../../output/ImpactMap_Dataset.geojson
```

## GitHub API usage

The dashboard fetches PR statuses from the GitHub REST API (unauthenticated):

```
GET https://api.github.com/repos/ITDeptAdmin/ImpactMap/pulls?state=all&per_page=100
```

- Public repo — no token required in the browser
- Up to 3 pages fetched per load (~300 PRs max)
- Unauthenticated rate limit: 60 requests/hour per IP
- Graceful degradation: API failures show "Status Unavailable" per card; dashboard does not break

---

# Review Statuses

Each review card displays one of these statuses, determined by the PR state for branch `geocode-suggestion/row-{N}`:

| Status | Meaning |
|---|---|
| **Ready to Review** | Open PR exists — staff should verify location and approve or reject |
| **Approved — Waiting for Rebuild** | PR merged — map rebuilds automatically |
| **Rejected — Needs Manual Fix** | PR closed without merging — staff must fix CSV and re-upload |
| **Suggested Fix Not Created Yet** | Suggested coordinates exist but no PR yet |
| **Status Unavailable** | GitHub API call failed — check GitHub directly |

When multiple PRs exist for the same row, priority is: open > merged > closed.

---

# JavaScript Responsibilities

## `ram-impact-map.js` (public map, WordPress plugin)

- Map initialization
- Filter logic
- Sidebar rendering
- Search
- Cluster handling
- Zoom behavior
- GA4 tracking events

## `docs/geocode-review/app.js` (Update Center dashboard)

- Fetches `geocode_review.csv` and `build_stats.json`
- Renders review cards with status badges and action buttons
- Fetches PR statuses from GitHub REST API
- Filter pills and search
- Copy Search Text / Copy Coordinates helpers
- Graceful error handling for API and data failures

---

# Data Requirements

GeoJSON must contain:

```json
"type": "FeatureCollection"
"features": [...]
```

Each feature must contain:
- `geometry.type = "Point"`
- `coordinates [lng, lat]`
- Required properties: `city`, `state`, `country`, `expedition`, etc.

If geometry is invalid, it will not render on the map.

---

# Mapbox Geocoding Rules

Enforced in `build_impactmap_geojson.py`:

1. **Existing coordinates are never overwritten.**
2. **Existing CSV rows are matched first** before calling Mapbox.
3. **Mapbox is called only when no match exists** and the row has a usable address.
4. **U.S. auto-approval requires explicit confidence** (`exact`, `high`, or `medium`). Missing or low confidence → row goes to review.
5. **U.S. feature type must be address-level.** Broad results (`place`, `region`, `country`) are not auto-approved.
6. **U.S. street number must match.** If the source address has a street number that is absent from the Mapbox result, the row goes to review.
7. **Philippines rows** use a place-level geocode with `country=PH` restriction and bounding box validation.
8. **Weak/uncertain results go to review with a suggestion.** The suggestion is shown in the Update Center but not applied until a human approves.

---

# Map Behavior Notes

- Desktop: full interactive map initialization
- Mobile: list layout (map not initialized)
- Filters auto-zoom to selected region
- Cluster click expands zoom
- Marker click syncs with sidebar

---

# Performance Notes

- Dataset size ~1MB
- Loads from GitHub raw CDN
- If dataset exceeds ~5MB, performance may degrade
- Update Center dashboard is static HTML/JS with no server-side load

---

# Production and Staging Branch URLs

## GeoJSON URLs

Production (main branch):
```
https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/main/output/ImpactMap_Dataset.geojson
```

Staging branch:
```
https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/staging/output/ImpactMap_Dataset.geojson
```

## Branches

**`main`** — Production. The live RAM website uses GeoJSON from this branch. Do not test experimental changes directly on `main`.

**`staging`** — Testing. Use for CSV changes, workflow updates, geocoding behavior, and new map data before merging to `main`.
