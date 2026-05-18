# Updating the RAM Impact Map Data

This guide explains how to safely update the RAM Impact Map data.

You do **not** need programming experience.

You do **not** need Python.

You do **not** need command prompt.

GitHub will rebuild the map automatically.

---

# Quick Version

1. Download the latest CSV.
2. Update it in Excel.
3. Upload it back to GitHub.
4. Use this commit message:

   `Update: Your Name - Short note`

5. Wait for the green checkmark.
6. Check the map.

---

# Step 1: Go to GitHub

Visit:

https://github.com/ITDeptAdmin/ImpactMap

Click into the `/data` folder.

---

# Step 2: Download the Latest CSV

Download:

`Master_Clinic_ImpactMap.csv`

Important: Always download the latest file before editing.

Do not use an old copy saved on your computer because the system may have automatically filled in new Latitude and Longitude values since your last download.

---

# Step 3: Edit the CSV in Excel

Open the CSV in Excel.

Make your updates.

You can:

- Add new clinics
- Correct city/state/country information
- Add or correct addresses
- Update patient totals
- Update volunteer totals
- Update value of care
- Update service totals

Do **not** change the column headers.

If you do not know Latitude or Longitude, leave those cells blank.

The system will try to fill them automatically.

---

# Step 4: Upload the Updated CSV

Go back to the `/data` folder in GitHub.

Click:

`Add file` → `Upload files`

Upload:

`Master_Clinic_ImpactMap.csv`

If GitHub says the file already exists, that is okay. You are replacing the old version.

---

# Step 5: Add the Commit Message

Before clicking **Commit changes**, enter a message like this:

`Update: Your Name - Short note about what changed`

Examples:

- `Update: Cody - Added 2026 clinic data`
- `Update: Jane - Corrected Tennessee patient totals`
- `Update: Sarah - Updated clinic addresses`

This is important because multiple staff may use the same GitHub login.

The name in this message is how we track who updated the map.

Then click:

`Commit changes`

---

# Step 6: Wait for GitHub to Rebuild the Map

After you commit the CSV, GitHub will automatically:

- Check the CSV
- Fill missing Latitude and Longitude when possible
- Use existing matching locations first
- Use Mapbox geocoding when needed
- Create a review file for rows it cannot safely fix
- Rebuild the map file
- Update the audit log

This usually takes less than a minute.

---

# Step 7: Check the Green Checkmark

After committing the CSV:

1. Click the **Actions** tab at the top of the repository.
2. Click the latest workflow run named:

   `Build Impact Map GeoJSON`

3. Confirm it has a green checkmark.

If it is green, the map data rebuilt successfully.

If it is red, click the failed run to see the error message.

---

# Step 8: Check for Rows Needing Review

After the build finishes, check this file:

`/output/geocode_review.csv`

If the file only has headers or is empty, there is nothing to review.

If there are rows listed, those rows need someone to check the address or Latitude/Longitude.

Common reasons a row appears in the review file:

- Missing address
- Missing Latitude and Longitude
- Only Latitude is filled
- Only Longitude is filled
- The address could not be safely geocoded

If you fix the row in the CSV, upload the CSV again and GitHub will rerun the build.

---

# Step 9: Verify the Map

Visit the Impact Map page.

Production map:

https://www.ramusa.org/our-impact/

Check that:

- The map loads.
- Search works.
- Filters work.
- Points appear correctly.
- New or updated locations look correct.

---

# How Latitude and Longitude Work

The map needs Latitude and Longitude to place clinics correctly.

You do not have to manually find coordinates every time.

When the CSV is uploaded, the system follows these rules:

## If Latitude and Longitude already exist

The system leaves them alone.

It does not overwrite existing coordinates.

## If Latitude and Longitude are blank

The system first tries to find a matching location already in the CSV.

It checks things like:

- Address
- Zipcode
- City
- State
- Country
- County/Parish

If it finds a match, it copies the existing coordinates.

## If no match is found

If the row has a usable address, the system uses Mapbox to find the Latitude and Longitude.

Then it writes those coordinates back into the CSV automatically.

## If it cannot safely find coordinates

It does not guess.

It adds the row to:

`/output/geocode_review.csv`

---

# Update Log

The system keeps an update log here:

`/logs/update_log.csv`

This log records:

- When the map was updated
- Who updated it based on the commit message
- What note was entered
- How many map points were built
- How many coordinates were filled automatically
- How many rows need review

This is why the commit message is important.

Always use:

`Update: Your Name - Short note`

---

# Files You Should Know

## File staff updates

`/data/Master_Clinic_ImpactMap.csv`

This is the main file staff should edit.

## File the website uses

`/output/ImpactMap_Dataset.geojson`

This is generated automatically.

Do not edit this by hand.

## File for geocoding problems

`/output/geocode_review.csv`

Check this after updates.

## File for update history

`/logs/update_log.csv`

This tracks who updated the map and when.

---

# If Something Breaks

Most common issues:

- CSV column headers were changed
- CSV file was saved in the wrong format
- Required location fields are missing
- Latitude/Longitude columns were renamed or deleted
- GitHub Actions failed
- Website cache needs to be cleared

If the GitHub Action fails:

1. Go to the **Actions** tab.
2. Open the failed workflow run.
3. Read the error message.
4. Contact the website/development team if you are unsure.

---

# Emergency Rollback

If a bad update was uploaded:

1. Go to the GitHub repository.
2. Click **Commits**.
3. Find the last good update.
4. Revert to the previous working version.

Because this system is file-based, the map can usually be restored quickly.
