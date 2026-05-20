# Updating the RAM Impact Map Data

This guide explains how to safely update the RAM Impact Map data.

You do **not** need programming experience.

You do **not** need Python.

You do **not** need command prompt.

GitHub and the Impact Map Update Center handle everything automatically.

---

# Impact Map Update Center

The Impact Map Update Center is your starting point for routine map updates.

**Dashboard URL:**

```
https://itdeptadmin.github.io/ImpactMap/docs/geocode-review/
```

Bookmark this page.

The dashboard shows:

- How many locations are on the map
- Whether any rows need review
- When the map was last rebuilt
- Action buttons for downloading, uploading, and reviewing

---

# Quick Version

1. Download the latest CSV from the Update Center.
2. Edit the CSV in Excel.
3. Upload the updated CSV.
4. Use commit message: `Update: Your Name - Short note`
5. Wait a few minutes.
6. Refresh the Update Center.
7. If the Review Queue shows zero, you are done.
8. If the Review Queue has rows, follow the Review Queue steps below.

---

# Step 1: Download the Latest CSV

Open the Impact Map Update Center and click:

**Download Current CSV**

Important: Always download the latest file before editing.

Do not use an old copy saved on your computer. The system may have automatically filled in new Latitude and Longitude values since your last download, and uploading an old copy would remove those updates.

---

# Step 2: Edit the CSV in Excel

Open the downloaded file in Excel.

You can:

- Add new clinics
- Correct city, state, or country information
- Add or correct street addresses
- Update patient totals
- Update volunteer totals
- Update value of care
- Update service totals

**Do not change the column headers.** Column names are used by the build script. Changing them will break the build.

If you do not know Latitude or Longitude, leave those cells blank. The system will try to fill them automatically.

---

# Step 3: Upload the Updated CSV

In the Impact Map Update Center, click:

**Upload Updated CSV**

This opens the GitHub file upload page. You will need to be logged in with a GitHub account that has write access to this repository.

Upload:

`Master_Clinic_ImpactMap.csv`

If GitHub says the file already exists, that is okay — you are replacing the old version.

---

# Step 4: Add the Commit Message

Before clicking **Commit changes**, enter a message like this:

`Update: Your Name - Short note about what changed`

Examples:

- `Update: Cody - Added 2026 clinic data`
- `Update: Jane - Corrected Tennessee patient totals`
- `Update: Sarah - Updated clinic addresses`

This is important because multiple staff may use the same GitHub login. The name in the commit message is how we track who updated the map.

Then click:

**Commit changes**

---

# Step 5: Wait for the Map to Rebuild

After committing the CSV, GitHub automatically:

- Checks the CSV
- Fills missing Latitude and Longitude when possible
- Uses existing matching locations first
- Uses Mapbox geocoding when needed
- Builds Suggested Fixes for rows it cannot safely fill automatically
- Rebuilds the map file
- Updates the audit log

This usually takes a few minutes.

---

# Step 6: Refresh the Update Center

Open or refresh the Impact Map Update Center.

Check the **Map Status** section:

- **Review Queue = 0** → No action needed. All locations are on the map.
- **Review Queue > 0** → Some rows need review. Continue to the next step.

You do not need to check the Actions tab or any CSV files directly. The Update Center shows everything you need.

---

# Step 7: Review Queue — If Rows Are Listed

If rows appear in the Review Queue, the system could not automatically fill in coordinates for those rows with enough confidence. A human needs to verify the suggestion before it is added to the map.

## If the row has a Suggested Fix

The system found a likely location. The row badge will say **Ready to Review**.

1. Click **1. Check Map Location** on the review card. Google Maps will open with a pin at the suggested location.
2. Confirm the pin is in the right place.
3. Click **2. Review Suggested Fix**. GitHub will open.
4. If the location looks correct, click the green **Merge pull request** button.
5. Click **Confirm merge**.
6. If GitHub shows a **Delete branch** button, click it to clean up the temporary branch. This is safe — it only removes the temporary Suggested Fix branch, not the map data or the `main`/`staging` branch.
7. Wait a few minutes, then refresh the Update Center. The row should disappear from the Review Queue.

**If the location looks wrong:**

1. Click **2. Review Suggested Fix**. GitHub will open.
2. Scroll down and click **Close pull request**. Do not merge it.
3. If GitHub shows a **Delete branch** button, click it to clean up the temporary branch.
4. The row stays in the Review Queue with a **Rejected** badge.
5. Fix the CSV by correcting the address or entering the correct Latitude and Longitude directly.
6. Upload the updated CSV. The system will retry.

## If the row has no suggestion

The system could not find a location at all. Fix the CSV manually:

1. Click **View CSV Row** to see the exact row in the file.
2. Or use **Copy Search Text**, then **Edit CSV File**, and press **Ctrl+F** to find it quickly.
3. Correct the address or enter the correct Latitude and Longitude directly.
4. Upload the updated CSV.

---

# What Happens When You Approve or Reject

## When you approve a Suggested Fix

The suggested coordinates are saved to the CSV and the map rebuilds automatically. The row disappears from the Review Queue on the next build.

## When you reject a Suggested Fix

Nothing changes on the map. The Suggested Fix is closed and the row stays in the Review Queue until the CSV is manually corrected and re-uploaded.

## About Suggested Fix branches

Each Suggested Fix uses a temporary GitHub branch named like `geocode-suggestion/row-1821`. These branches exist only to hold the suggested coordinate change while it waits for review.

After approving or rejecting, you can delete the temporary branch when GitHub shows the **Delete branch** button. Deleting it does not affect the map, the CSV, or the `main` or `staging` branches.

To have GitHub delete these branches automatically after each merge, go to:
**Repository → Settings → General → Pull Requests → Automatically delete head branches**

---

# About geocode_review.csv

The file `/output/geocode_review.csv` still exists in the repository. It is the raw data file that powers the Review Queue in the Update Center.

Normal staff do not need to open this file directly. The Update Center shows the same information in a staff-friendly format with status badges, map links, and action buttons.

If you are troubleshooting or need raw data, you can download it from the **Advanced / Troubleshooting** section of the Update Center.

---

# Update Log

The system keeps an update log here:

`/logs/update_log.csv`

This records:

- When the map was updated
- Who updated it (based on the commit message)
- What note was entered
- How many map points were built
- How many coordinates were filled automatically
- How many rows needed review

Always use:

`Update: Your Name - Short note`

---

# What Not To Do

- **Do not rename the CSV file.** The file must stay named `Master_Clinic_ImpactMap.csv`.
- **Do not change column headers.** Column names are used by the build script. Changing them will break the build.
- **Do not delete the Latitude or Longitude columns.**
- **Do not use an old CSV copy saved on your computer.** Always download the latest version first.
- **Do not approve a Suggested Fix unless the map pin looks correct.** Always verify the Google Maps pin before approving.
- **Do not enter coordinates in any format other than decimal degrees.** Example: `36.1627, −86.7816`

---

# If Something Breaks

Most common issues:

- CSV column headers were changed
- CSV file was saved in the wrong format
- Required location fields are missing
- Latitude/Longitude columns were renamed or deleted
- GitHub Actions failed
- Website cache needs to be cleared

If a GitHub Actions build fails:

1. Go to **github.com/ITDeptAdmin/ImpactMap** → **Actions** tab.
2. Open the failed workflow run.
3. Read the error message.
4. Contact the development team if you are unsure.

---

# Emergency Rollback

If a bad update was uploaded:

1. Go to the GitHub repository.
2. Click **Commits**.
3. Find the last good update.
4. Revert to the previous working version.

Because this system is file-based, the map can usually be restored quickly.
