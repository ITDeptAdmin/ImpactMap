# Updating the RAM Impact Map Data

This guide explains how to safely update the map data.

You do NOT need programming experience.

---
# ✅ EASY METHOD (Recommended – Fully Automated)

You do NOT need Python.
You do NOT need command prompt.
You do NOT need to run scripts.

---

## Step 1: Go to GitHub

Visit:

https://github.com/ITDeptAdmin/ImpactMap

Click into the `/data` folder.

---

## Step 2: Upload Updated CSV

1. Click "Add file"
2. Click "Upload files"
3. Upload:

Master_Clinic_ImpactMap.csv

(If it already exists, it will replace the old version.)

4. Click "Commit changes"

---

## Step 3: Wait 10–20 Seconds

GitHub will automatically:

- Run the conversion script
- Generate new GeoJSON
- Commit updated file into `/output`

No further action required.

---

## Step 4: Verify

Visit the Impact Map page.

Confirm:

- Map loads
- Filters work
- Search works
- Points appear correctly

If everything looks correct, update was successful.

---

# 🛠 Advanced / Manual Method (Backup Only)

Only use this if GitHub automation fails.
---

# Step 1: Download Latest Files

Go to:
https://github.com/ITDeptAdmin/ImpactMap

Click "Code" → Download ZIP

Extract to your computer.

---

# Step 2: Update the Master Spreadsheet

Open:

/data/Master_Clinic_ImpactMap.csv

Edit data as needed:
- Add new clinics
- Correct cities/states
- Update totals
- Do NOT change column headers!

Save the file.

---

# Step 3.1: Got Python?

If you don't have Python installed on your computer do the following.  If you have paython already go to step 3.2

1. Download Python:
   - https://www.python.org/downloads/

2. Run the installer and **CHECK THIS BOX**:
   - ✅ **Add Python to PATH**

3. Verify Python installed:
   - Open **Command Prompt**
   - Run:
     ```
     python --version
     ```
   - You should see something like `Python 3.x.x`


# Step 3.2: Generate the Map File
Double click:

/scripts/build_impactmap_geojson.py

OR

Open Command Prompt in the folder and run python scripts by typing the following

build_impactmap_geojson.py

This creates:

/output/ImpactMap_Dataset.geojson

---

# Step 4: Upload to GitHub

Upload BOTH files:
- data/Master_Clinic_ImpactMap.csv
- output/ImpactMap_Dataset.geojson

Commit changes.

---

# Step 5: Verify on Website

1. Visit the Impact Map page (desktop).
2. Confirm:
   - Map loads
   - Filters work
   - Search works
   - Points appear
   - No console errors

If map loads and filters work, update was successful.

---

# If Something Breaks

Most common issues:

• CSV column changed
• Script error
• GeoJSON not uploaded
• GitHub URL wrong
• Cache not cleared

To rollback:

1. Go to GitHub
2. Click "Commits"
3. Revert to a previous working version

The map will immediately restore.

To rollback:
- Revert to previous GitHub commit
- Confirm GeoJSON URL works in browser
