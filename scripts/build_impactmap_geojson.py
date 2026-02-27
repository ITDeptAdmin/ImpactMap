# build_impactmap_geojson.py
# Converts CSV into GeoJSON for Impact Map on website
# NOTE: Keeps cents for "Total Value of Care" (float), so totals match the spreadsheet.

import csv
import json
import os
import sys

# Default locations (used if you don't pass CLI args)
INPUT_CANDIDATES = [
    "data/Master_Clinic_ImpactMap.csv",
    "Master_Clinic_ImpactMap.csv",
]

DEFAULT_OUTPUT_FILE = "output/ImpactMap_Dataset.geojson"

# If your CSV has different header spelling/case, add aliases here:
HEADER_ALIASES = {
    "latitude": ["Latitude", "Lat", "LAT", "lat", "latitude"],
    "longitude": ["Longitude", "Longitutde", "Long", "Lng", "LON", "lon", "lng", "longitude"],
}

def find_input_file():
    for name in INPUT_CANDIDATES:
        if os.path.exists(name):
            return name
    return None

def pick_header(row_fieldnames, aliases):
    """Return the actual header name that exists in the CSV."""
    for a in aliases:
        if a in row_fieldnames:
            return a
    return None

def to_float(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "":
        return None
    s = s.replace(",", "").replace("$", "")
    try:
        return float(s)
    except Exception:
        return None

def to_int(val):
    if val is None:
        return None
    s = str(val).strip()
    if s == "":
        return None
    s = s.replace(",", "").replace("$", "")
    try:
        return int(float(s))
    except Exception:
        return None

def to_number_if_possible(key, val):
    """
    Convert common numeric columns to numbers when possible.
    - "Total Value of Care" stays a float (keeps cents).
    - Most count fields become int.
    Everything else stays as string (trimmed) or None if blank.
    """
    if val is None:
        return None
    s = str(val).strip()
    if s == "":
        return None

    # Keep cents for Value of Care
    if key == "Total Value of Care":
        f = to_float(s)
        return f if f is not None else s

    numeric_int_cols = {
        "Event #", "Expedition #", "Year", "ZipCode",
        "Total Volunteers", "Total Patients",
        "Animals Served", "Extractions", "Fillings", "Cleanings",
        "Glasses", "Eye Exams", "Medical Exams", "Women's Health",
    }

    if key in numeric_int_cols:
        n = to_int(s)
        return n if n is not None else s

    return s

def main():
    # Usage:
    #   python scripts/build_impactmap_geojson.py
    #   python scripts/build_impactmap_geojson.py data/Master_Clinic_ImpactMap.csv output/ImpactMap_Dataset.geojson

    # Input path (optional arg1)
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        in_file = sys.argv[1].strip()
    else:
        in_file = find_input_file()

    # Output path (optional arg2)
    if len(sys.argv) >= 3 and sys.argv[2].strip():
        out_file = sys.argv[2].strip()
    else:
        out_file = DEFAULT_OUTPUT_FILE

    if not in_file or not os.path.exists(in_file):
        print("ERROR: Could not find input CSV.")
        print("Looked for:")
        for n in INPUT_CANDIDATES:
            print(f" - {n}")
        print("Or pass a path like:")
        print("  python scripts/build_impactmap_geojson.py data/Master_Clinic_ImpactMap.csv output/ImpactMap_Dataset.geojson")
        sys.exit(1)

    with open(in_file, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("ERROR: CSV appears to have no headers.")
            sys.exit(1)

        lat_key = pick_header(reader.fieldnames, HEADER_ALIASES["latitude"])
        lon_key = pick_header(reader.fieldnames, HEADER_ALIASES["longitude"])

        if not lat_key or not lon_key:
            print("ERROR: Could not find Latitude/Longitude columns.")
            print("Found headers:", reader.fieldnames)
            sys.exit(1)

        features = []
        skipped = 0

        for i, row in enumerate(reader, start=1):
            lat = to_float(row.get(lat_key))
            lon = to_float(row.get(lon_key))

            if lat is None or lon is None:
                skipped += 1
                # Keep logs short in Actions; uncomment if you want details:
                # print(f"SKIPPED row {i}: lat={row.get(lat_key)!r} lon={row.get(lon_key)!r}")
                continue

            # Build properties (everything except lat/lon)
            props = {}
            for k, v in row.items():
                if k in (lat_key, lon_key):
                    continue
                props[k] = to_number_if_possible(k, v)

            # Helpful stable id if available
            event_id = row.get("Event #") or row.get("Event#") or row.get("Event")
            expedition_id = row.get("Expedition #") or row.get("Expedition#") or row.get("Expedition")
            props["_row"] = i
            if event_id:
                props["_event_id"] = str(event_id).strip()
            if expedition_id:
                props["_expedition_id"] = str(expedition_id).strip()

            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [lon, lat]},
                "properties": props
            })

    geojson = {"type": "FeatureCollection", "features": features}

    # Ensure output folder exists
    out_dir = os.path.dirname(out_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(out_file, "w", encoding="utf-8") as out:
        json.dump(geojson, out, ensure_ascii=False)

    print(f"OK: Wrote {out_file}")
    print(f"Features: {len(features)}  Skipped (missing lat/lon): {skipped}")

if __name__ == "__main__":
    main()
