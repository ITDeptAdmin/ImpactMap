# RAM Impact Map System

This repository powers the **RAM Impact Map** displayed on the RAM website.
https://www.ramusa.org/our-impact/?
or where ever somone uses the shortcode.

The Impact Map shows:
- Total clinics
- Geographic coverage
- Expedition data
- Search + filter functionality
- Interactive map experience
- GA4 engagement tracking

The website loads a GeoJSON dataset from this repository to render the map.

---

# How It Works (Simple Explanation)

1. A master spreadsheet (CSV file) contains all clinic data.
2. A Python script converts that CSV into a GeoJSON dataset.
3. The GeoJSON file is uploaded to GitHub.
4. The WordPress plugin loads that file.
5. Mapbox renders the map.
6. GTM/GA4 tracks user engagement.

No database connections.
No server-side processing.
The system is file-based and stable.

---

# Folder Structure

/data  
- `Master_Clinic_ImpactMap.csv` (Source of truth and what we edit and update)

/scripts  
- `build_impactmap_geojson.py` (Converts CSV → GeoJSON)

/output  
- `ImpactMap_Dataset.geojson` (Used by website)

/readme
- `technical.md` (technical reference for developers)
- `analytics.md` (events and parameter being used so does not get deleted by accident)
- `disaster recovery guide.md` (what to do if blows up)

- How to update data in map.md
  - Walks through how to update the map step by step
  
- README.md  
  - Overview documentation (that you are currently reading)

---

# Most Important Rule

The only file the website uses is:

`output/ImpactMap_Dataset.geojson`

If that file is correct and accessible, the map will work.  If you rename it something else it will break the map on the website.

---

# Where the Map Lives

The map is rendered via a WordPress plugin using a shortcode.

The GeoJSON is loaded from:

https://raw.githubusercontent.com/ITDeptAdmin/ImpactMap/main/output/ImpactMap_Dataset.geojson

If this URL works in a browser, the map will load.

---

# Mapbox Token

The Mapbox public token is stored in:

`ram-impact-map.php`

Public tokens start with:
`pk.eyJ...`

If the map ever fails to render tiles, check the token.
