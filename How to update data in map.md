# Updating the RAM Impact Map Data

This guide explains how to safely update the map data.

You do NOT need programming experience.

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

# Step 3: Generate the Map File

Double click:

/scripts/build_impactmap_geojson.py

OR

Open Command Prompt in the folder and run:

python scripts\build_impactmap_geojson.py

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
- Revert to previous GitHub commit
- Confirm GeoJSON URL works in browser
