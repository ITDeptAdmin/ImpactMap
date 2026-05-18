# RAM Impact Map System

![RAM Impact Map](images/Remote_Area_Medical_Impact_Map.jpg)

Geographic visualization system used on the Remote Area Medical website to display RAM’s nationwide clinic impact.

This system converts clinic impact data stored in a CSV file into a GeoJSON dataset used by a WordPress plugin and Mapbox to render an interactive map.

The goal of this repository is to allow non-technical staff to update map data through a spreadsheet while keeping the website integration stable, automated, and easy to recover if something goes wrong.

---

# Quick Staff Instructions

## Updating the Impact Map Data

1. Download the latest CSV file from this repository:

   `/data/Master_Clinic_ImpactMap.csv`

2. Open the CSV in Excel.

3. Make your updates.

4. If you do not know the Latitude or Longitude for a new clinic, leave those cells blank.

5. Upload the updated CSV back to GitHub in the same location:

   `/data/Master_Clinic_ImpactMap.csv`

6. In the commit message, use this format:

   `Updated by: Your Name - Short note about what changed`

   Example:

   `Updated by: Jane Smith - Added 2026 clinic data and corrected patient totals`

7. Click **Commit changes**.

8. GitHub will automatically rebuild the map data.

9. Wait for the green checkmark in the **Actions** tab.

10. If there are any rows that need review, check:

   `/output/geocode_review.csv`

---

# Important Staff Rules

## Always download the latest CSV before editing

Do not reuse an old copy saved on your computer.

The automation may update the CSV by filling in missing Latitude and Longitude values. If you upload an old copy, you could accidentally remove those updates.

## Use the commit message to say who made the update

Because multiple staff may use the same GitHub login, the commit message is how we track who made the update.

Always use:

`Updated by: Your Name - Short note`

Example:

`Updated by: Cody Beeler - Added new 2026 clinic rows`

## Do not rename files

The website depends on specific file names and locations.

Do not rename:

- `/data/Master_Clinic_ImpactMap.csv`
- `/output/ImpactMap_Dataset.geojson`

If these files are renamed, the map may break.

---

# How It Works

1. A master CSV file contains all clinic impact data.
2. Staff updates the CSV.
3. GitHub Actions automatically runs the build workflow.
4. The workflow checks for missing Latitude and Longitude values.
5. The workflow fills missing coordinates when it can safely do so.
6. The workflow generates a GeoJSON file.
7. The WordPress plugin loads the GeoJSON file.
8. Mapbox renders the interactive map.
9. GTM/GA4 tracks user engagement.

There is:

- No database
- No manual Python work
- No command prompt work
- No server-side processing needed for the data build
- No local development setup required for staff updates

The system is file-based, automated, and designed to be simple and resilient.

---

# Automatic Latitude and Longitude Handling

The map needs Latitude and Longitude values to place clinic points on the map.

Staff do not have to manually find coordinates for every new clinic.

When the CSV is updated, the automation follows these rules:

## 1. Existing coordinates are kept

If a row already has Latitude and Longitude, the workflow leaves them alone.

Existing coordinates are not overwritten.

## 2. Blank coordinates are matched from existing rows first

If Latitude and Longitude are blank, the workflow first tries to find a matching location already in the CSV.

It checks location matches in this general order:

1. Address + Zipcode + City + State + Country
2. Address + City + State + Country
3. Zipcode + City + State + Country
4. City + State + Country
5. County/Parish + State + Country

If a match is found, the workflow copies the existing coordinates into the blank row.

This helps prevent the same clinic/location from getting slightly different coordinates over time.

## 3. Mapbox geocoding is used only when needed

If no existing match is found and the row has a usable address, the workflow uses Mapbox geocoding to find the coordinates.

The new Latitude and Longitude are written back into the CSV automatically.

## 4. Rows that cannot be safely geocoded go to review

If the workflow cannot safely find coordinates, it does not guess.

Instead, it leaves the coordinates blank and adds the row to:

`/output/geocode_review.csv`

Examples of rows that may need review:

- Missing address and missing coordinates
- Only Latitude is filled
- Only Longitude is filled
- Address is incomplete
- Geocoding result is uncertain

---

# Files and Folders

## `/data`

Source data used to build the map.

### `/data/Master_Clinic_ImpactMap.csv`

This is the source of truth for the Impact Map data.

Staff update this file.

---

## `/scripts`

Automation scripts.

### `/scripts/build_impactmap_geojson.py`

Python script used by GitHub Actions.

It:

- Reads the master CSV
- Fills missing coordinates when safe
- Uses Mapbox geocoding when needed
- Creates a geocode review file
- Builds the GeoJSON file used by the website

---

## `/output`

Generated files used for the website and review.

### `/output/ImpactMap_Dataset.geojson`

This is the file the website uses.

The WordPress plugin loads this file to render the map.

### `/output/geocode_review.csv`

This file lists rows that need human review.

If this file has rows in it, staff should check the listed issues and update the CSV if needed.

---

## `/logs`

Update/audit history.

### `/logs/update_log.csv`

This file records map data updates.

It can track:

- Date/time of update
- Branch
- GitHub user
- Commit message
- Name typed in the commit message
- Number of features built
- Number of coordinates matched from existing data
- Number of coordinates geocoded with Mapbox
- Number of rows needing review

Because multiple staff may use the same GitHub login, the commit message should always include:

`Updated by: Your Name - Short note`

---

## `/.github/workflows`

GitHub Actions automation.

### `/.github/workflows/build-impactmap.yml`

Runs the Impact Map build process.

When the CSV is updated, the workflow:

1. Runs the Python build script
2. Fills missing Latitude/Longitude values when safe
3. Uses Mapbox geocoding only when needed
4. Creates or updates the review file
5. Generates the GeoJSON file
6. Commits generated updates back to the repository

---

## `/readme`

Additional documentation.

Recommended docs:

- `technical.md` — technical reference for developers
- `analytics.md` — GA4/GTM events and parameters
- `disaster recovery guide.md` — what to do if something breaks
- `How to update data in map.md` — step-by-step staff update guide

---

# Automation

When `/data/Master_Clinic_ImpactMap.csv` is updated and committed, GitHub Actions automatically processes the file.

The workflow:

1. Reads the CSV
2. Checks for missing coordinates
3. Matches coordinates from existing rows when possible
4. Uses Mapbox geocoding for new addresses when needed
5. Updates the CSV with newly found coordinates
6. Builds `/output/ImpactMap_Dataset.geojson`
7. Creates or updates `/output/geocode_review.csv`
8. Updates the audit log
9. Commits generated files back to the repository

To verify a build completed successfully:

1. Go to the **Actions** tab.
2. Open the latest **Build Impact Map GeoJSON** workflow run.
3. Confirm it has a green checkmark.
4. Review the summary for:
   - Features built
   - Coordinates matched
   - Mapbox geocoded rows
   - Rows needing review

---

# Most Important Rule

The only file the website uses directly is:

`/output/ImpactMap_Dataset.geojson`

If that file is correct and accessible, the map will work.

If that file is renamed, deleted, or moved, the website map may break.

---

# Where the Map Lives

The map is rendered by a WordPress plugin using a shortcode.

Production website:

https://www.ramusa.org/our-impact/

Production GeoJSON URL:

https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/main/output/ImpactMap_Dataset.geojson

Staging GeoJSON URL:

https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/staging/output/ImpactMap_Dataset.geojson

Production should use the `main` branch.

Staging12 should use the `staging` branch.

---

# Branches

## `main`

Production branch.

The production website uses the GeoJSON file from this branch.

Do not test experimental data or workflow changes directly on `main`.

## `staging`

Testing branch.

The staging12 website should use the GeoJSON file from this branch.

Use this branch to test:

- CSV changes
- Geocoding behavior
- Workflow updates
- Review file behavior
- New map data

After staging is tested and approved, changes can be merged into `main`.

---

# Mapbox

The Impact Map uses Mapbox for map rendering.

## Public Mapbox display token

The public Mapbox display token is used by the WordPress plugin to render the map.

Public Mapbox tokens usually start with:

`pk.`

This token is safe to use in browser-based map display, but it should be restricted in the Mapbox dashboard to RAM domains.

Recommended URL restrictions:

- `https://ramusa.org/*`
- `https://www.ramusa.org/*`
- `https://staging12.ramusa.org/*`
- `https://www.staging12.ramusa.org/*`

## Mapbox geocoding token

The Mapbox geocoding token is used only by GitHub Actions.

It is stored as a GitHub Actions Secret:

`MAPBOX_GEOCODING_TOKEN`

Do not put this token in:

- WordPress
- PHP files
- JavaScript files
- The CSV
- The README

This token is used only by the backend build workflow.

---

# Troubleshooting

## The map is not showing new data

Check:

1. Was the CSV uploaded to `/data/Master_Clinic_ImpactMap.csv`?
2. Did the GitHub Action run?
3. Did the Action finish with a green checkmark?
4. Was `/output/ImpactMap_Dataset.geojson` updated?
5. Is the website loading the correct branch?
6. Was cache cleared if needed?

## A clinic is missing from the map

Check:

1. Does the row exist in the CSV?
2. Does it have Latitude and Longitude?
3. Is it listed in `/output/geocode_review.csv`?
4. Did the workflow skip it because coordinates were missing or invalid?

## Coordinates are wrong

Check:

1. Was the row matched from an existing location?
2. Was the row geocoded by Mapbox?
3. Is the address complete and correct?
4. Manually correct Latitude and Longitude in the CSV if needed.

The workflow will not overwrite existing coordinates, so manual corrections are safe.

## The build failed

Check the latest GitHub Actions run.

Common causes:

- CSV headers were changed
- Latitude/Longitude columns were renamed or removed
- CSV formatting was broken
- Mapbox geocoding token is missing
- GitHub permissions issue
- Invalid data in the CSV

## Rows need review

Open:

`/output/geocode_review.csv`

Fix the listed rows in the master CSV, then commit the CSV again.

---

# System Safety

Because this system is file-based:

- If something breaks, revert to a previous GitHub commit.
- No database corruption is possible.
- No server outage risk from this repository.
- The production website only depends on the generated GeoJSON file.
- Staging can be tested separately before production.

This is intentionally designed to be simple, automated, and resilient.
