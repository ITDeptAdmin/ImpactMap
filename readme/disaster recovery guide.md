# Disaster Recovery and Troubleshooting

---

# Public Map Issues

## Map is completely blank

1. Clear cache in CloudFlare and SiteGround.
2. Test the GeoJSON URL directly in the browser.
3. Open DevTools → Console for errors.
4. Check:
   - 404 errors (file missing or wrong URL)
   - CORS errors
   - Invalid Mapbox token
5. Revert to the last working commit in GitHub if needed.

## Mapbox tiles fail

Check the Mapbox display token in `ram-impact-map.php`.
Confirm the token has correct URL restrictions in the Mapbox dashboard.

## Filters stop working

Check the JavaScript console for syntax errors in `ram-impact-map.js`.

## Map not showing new data after a CSV upload

1. Confirm the CSV was uploaded to `/data/Master_Clinic_ImpactMap.csv`.
2. Go to the **Actions** tab and confirm the `Build Impact Map GeoJSON` workflow ran and passed.
3. Confirm `/output/ImpactMap_Dataset.geojson` was updated (check the timestamp in GitHub).
4. Confirm the WordPress plugin is using the correct branch URL.
5. Clear CloudFlare and SiteGround cache.

## A clinic is missing from the map

1. Does the row exist in the CSV?
2. Does it have Latitude and Longitude?
3. Is it listed in the Review Queue on the Update Center dashboard?
4. Did the workflow skip it because coordinates were missing or invalid?

## Coordinates are wrong

1. Was the row matched from an existing location in the CSV?
2. Was the row geocoded by Mapbox?
3. Is the address complete and correct?
4. Manually correct Latitude and Longitude in the CSV and re-upload. The workflow will not overwrite manual corrections.

---

# Build Failures

## Build failed (red checkmark in Actions)

Common causes:

- CSV headers were changed or renamed
- Latitude/Longitude columns were removed or renamed
- CSV formatting was broken (extra commas, encoding issues)
- `MAPBOX_GEOCODING_TOKEN` secret is missing or expired
- GitHub Actions permissions issue
- Invalid data in the CSV (e.g. text in a numeric field)

Steps to diagnose:

1. Go to **github.com/ITDeptAdmin/ImpactMap** → **Actions** tab.
2. Open the failed workflow run.
3. Click on the failing step to read the error message.
4. Fix the CSV or configuration issue and re-commit.

## Build loops (running indefinitely)

The workflow has loop-prevention: auto-commits by `github-actions[bot]` do not re-trigger the build. If you see repeated builds, check that the commit actor check is functioning correctly in `build-impactmap.yml`.

---

# Update Center Dashboard Issues

## Dashboard not loading

1. Check that GitHub Pages is enabled and deployed:
   - Repository → **Settings** → **Pages** → confirm branch and folder.
   - Pages must be set to serve from the **repository root** (`/`), not `docs/`.
2. Confirm `docs/geocode-review/index.html`, `app.js`, and `style.css` exist on the published branch.
3. Open the browser developer console for JavaScript errors.
4. Confirm the data files exist at the expected relative paths:
   - `../../output/geocode_review.csv`
   - `../../output/build_stats.json`

## Dashboard shows rows but Suggested Fix status says "Status Unavailable"

The dashboard fetches PR statuses from the GitHub REST API (unauthenticated). Possible causes:

- GitHub API rate limit hit (60 requests/hour per IP, unauthenticated).
- Temporary GitHub API outage.

The dashboard degrades gracefully — cards still show all suggestion data and action buttons. Staff can still use the PR search URL to find Suggested Fixes manually.

## Dashboard says rows need review

1. Open the Review Queue in the Update Center.
2. For rows with a Suggested Fix (blue "Ready to Review" badge): verify the map location and approve or reject.
3. For rows marked "Rejected" (orange): fix the CSV and re-upload.
4. For rows with no suggestion: fix the CSV address or enter Latitude/Longitude manually.

---

# Suggested Fix (Pull Request) Issues

## Suggested Fixes not being created after build

1. Go to the **Actions** tab and check that `Create Geocode Review PRs` ran after the build.
2. If it did not run automatically, trigger it manually: **Actions → Create Geocode Review PRs → Run workflow**.
3. Check GitHub Actions repository permissions:
   - Repository → **Settings** → **Actions** → **General**
   - **Workflow permissions** must be set to **Read and write permissions**
   - **Allow GitHub Actions to create and approve pull requests** must be **checked**
4. Confirm the row has `suggested_latitude` and `suggested_longitude` populated in `output/geocode_review.csv` — rows with no suggestion do not get a PR.

## Suggested Fix was created but is not visible in the Review Queue status

1. Go to the **Pull Requests** tab on GitHub.
2. Search for the row number: e.g., `"Row 1821"`.
3. Check if a branch named `geocode-suggestion/row-1821` exists under **Branches**.
4. If a PR exists but the dashboard shows "Not Created Yet", the dashboard may be cached — refresh and wait for the GitHub API fetch to complete.

## Merged a Suggested Fix but the row is still in the Review Queue

The map needs to rebuild after a merge. A merge triggers `build-impactmap.yml` automatically. Wait a few minutes, then refresh the Update Center. The row should disappear after the next build.

## Accidentally merged a wrong Suggested Fix

1. The incorrect coordinates are now in the CSV.
2. Open the CSV, find the row, correct the Latitude and Longitude manually.
3. Upload the corrected CSV with a commit message noting the correction.
4. The build will run and the map will update.

---

# Emergency Rollback

## Revert a bad CSV upload

1. Go to **github.com/ITDeptAdmin/ImpactMap** → **Commits**.
2. Find the last known-good commit.
3. Click `...` → **Revert** (or use the GitHub UI to restore a previous file version).
4. The revert triggers a new build automatically.
5. Confirm the dashboard and map return to normal.

## Revert a bad Suggested Fix merge

Same process — revert the merge commit, re-run the build, confirm the row returns to the Review Queue.

## Full system reset checklist

1. Revert the bad commit(s) in GitHub.
2. Confirm `Build Impact Map GeoJSON` runs and passes.
3. Confirm `/output/ImpactMap_Dataset.geojson` is updated.
4. Confirm the Review Queue in the Update Center reflects the correct state.
5. Clear CloudFlare and SiteGround cache.
6. Test the live map at `https://www.ramusa.org/our-impact/`.

---

# GitHub Actions Permissions (Required)

If workflows fail with permission errors:

1. Go to: Repository → **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select: **Read and write permissions**
3. Check: **Allow GitHub Actions to create and approve pull requests**
4. Click **Save**

These permissions are required for the build workflow to commit generated files and for the PR creation workflow to open Suggested Fixes.

---

# Mapbox Token Issues

## MAPBOX_GEOCODING_TOKEN missing or expired

1. Generate a new token in the Mapbox dashboard with geocoding scopes.
2. Go to: Repository → **Settings** → **Secrets and variables** → **Actions**
3. Update `MAPBOX_GEOCODING_TOKEN` with the new token.
4. Re-run the failed build.

The geocoding token is used only by GitHub Actions. It is never exposed in browser-facing code.

## Public display token (in WordPress plugin)

If the map stops rendering Mapbox tiles, check the token in `ram-impact-map.php`.
Confirm it has the correct URL restrictions in the Mapbox dashboard:

- `https://ramusa.org/*`
- `https://www.ramusa.org/*`
- `https://staging12.ramusa.org/*`
