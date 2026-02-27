# Mapbox Dataset Builder (CSV → GeoJSON)

This folder contains a Python script that converts the clinic CSV into the GeoJSON file used by the Mapbox site.

Output file created:
- **MapBox Dataset.geojson**

---

## 1️⃣) Folder Contents

Put these files in the same folder (example folder name: `Impact MapBox 4 Website`):

- `build_mapbox_geojson.py`
- `master clinic mapbox file.csv`  *(the updated data file)*
- `README.md` *(this file)*

✅ The CSV filename must be **exactly**:
- `master clinic mapbox file.csv`

---

## 2️⃣) One-Time Setup: Install Python (Windows)

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

---

## 3️⃣) Update the Data (Monthly / As Needed)

1. Open `master clinic mapbox file.csv` in Excel
2. Update values
3. Save the file (keep it as CSV)

> If Excel shows a popup about conversions (leading zeros), choose:
> **Don’t Convert** (recommended)

---

## 4️⃣) Open a Terminal *Inside the Folder*

### Option A (fastest)
1. Open the folder in File Explorer
2. Click the address bar (where the folder path shows)
3. Type:cmd
4. Press **Enter**
5. A Command Prompt opens already inside that folder

### Option B (Shift + Right Click)
1. Open the folder in File Explorer
2. Hold **Shift**
3. Right-click inside the folder (blank area)
4. Choose:
- **Open in Terminal** OR **Open PowerShell window here**

---

## 5️⃣) Run the Script

In the terminal, run:python build_mapbox_geojson.py


If successful, you will see something like:
OK: Wrote MapBox Dataset.geojson
Features: 1700 Skipped (missing lat/lon): 2


The file **MapBox Dataset.geojson** will appear in the folder.

---

## 6️⃣) If It Says “SKIPPED row …”

The script will skip rows where **Latitude or Longitude is missing or not a valid number**.
If you see lines like: SKIPPED row 123: lat='' lon='' event='...' city='...'


Go to that row in the CSV and fix Latitude/Longitude.

---

## 7️⃣) Upload to GitHub

1. Open the GitHub repo
2. Replace the existing file:
   - `MapBox Dataset.geojson`
3. Commit the change

That’s it — the Mapbox page will reflect the updated dataset once GitHub is updated.

---

## Troubleshooting

### “python is not recognized”
Python is not in PATH.
Fix: reinstall Python and check **Add Python to PATH**.

### “Could not find input CSV”
Make sure the CSV is named exactly:
- `master clinic mapbox file.csv`

### “Could not find Latitude/Longitude columns”
The CSV headers must include:
- `Latitude`
- `Longitutde` *(yes, the CSV currently uses this spelling)*

If the header changes later, the script may need an update.





