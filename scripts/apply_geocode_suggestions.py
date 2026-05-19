# apply_geocode_suggestions.py
#
# Reads output/geocode_review.csv and applies suggested coordinates to
# data/Master_Clinic_ImpactMap.csv for any row that has suggested_latitude
# and suggested_longitude set.
#
# Safety rules enforced here (build script enforces them again on re-run):
#   - Never overwrites an existing Latitude or Longitude value.
#   - Validates the row index is in range.
#   - Appends every applied change to logs/geocode_approval_suggestions.csv.
#   - Re-runs scripts/build_impactmap_geojson.py after updating the CSV.
#   - Writes output/geocode_suggestions_applied.json so the calling workflow
#     can build a PR body and decide whether to open a pull request.
#
# Environment variables (all optional — defaults shown):
#   GEOCODE_REVIEW_FILE          output/geocode_review.csv
#   CSV_FILE                     data/Master_Clinic_ImpactMap.csv
#   APPROVAL_LOG_FILE            logs/geocode_approval_suggestions.csv
#   SUGGESTIONS_APPLIED_JSON     output/geocode_suggestions_applied.json
#   GEOCODE_REVIEW_FILE_OUT      output/geocode_review.csv   (passed to build)
#   BUILD_STATS_FILE             output/build_stats.json     (passed to build)
#   MAPBOX_GEOCODING_TOKEN       forwarded to build script
#   BRANCH_NAME                  recorded in approval log

import csv
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional

REVIEW_FILE = os.environ.get("GEOCODE_REVIEW_FILE", "output/geocode_review.csv")
CSV_FILE = os.environ.get("CSV_FILE", "data/Master_Clinic_ImpactMap.csv")
APPROVAL_LOG_FILE = os.environ.get("APPROVAL_LOG_FILE", "logs/geocode_approval_suggestions.csv")
OUTPUT_JSON = os.environ.get("SUGGESTIONS_APPLIED_JSON", "output/geocode_suggestions_applied.json")
BUILD_SCRIPT = "scripts/build_impactmap_geojson.py"
GEOJSON_OUTPUT = "output/ImpactMap_Dataset.geojson"

APPROVAL_LOG_HEADERS = [
    "timestamp_utc",
    "branch",
    "csv_row",
    "event",
    "expedition",
    "city",
    "state",
    "country",
    "address",
    "suggested_latitude",
    "suggested_longitude",
    "suggested_confidence",
    "suggested_address",
    "suggested_source",
    "applied_by",
]

LAT_ALIASES = ["Latitude", "Lat", "LAT", "lat", "latitude"]
LON_ALIASES = ["Longitude", "Longitutde", "Long", "Lng", "LON", "lon", "lng", "longitude"]


def to_float(val) -> Optional[float]:
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    try:
        return float(s)
    except Exception:
        return None


def pick_header(fieldnames: List[str], aliases: List[str]) -> Optional[str]:
    for a in aliases:
        if a in fieldnames:
            return a
    lower_map = {f.strip().lower(): f for f in fieldnames}
    for a in aliases:
        found = lower_map.get(a.strip().lower())
        if found:
            return found
    return None


def read_review_rows(path: str) -> List[Dict[str, str]]:
    if not os.path.exists(path):
        return []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def read_csv(path: str):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        rows = list(reader)
    return fieldnames, rows


def write_csv(path: str, fieldnames: List[str], rows: List[Dict[str, str]]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_output_json(path: str, applied: list, skipped: list) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"applied": applied, "skipped": skipped}, f, indent=2, ensure_ascii=False)
    print(f"Suggestions JSON: {path}")


def main():
    review_rows = read_review_rows(REVIEW_FILE)

    suggestions = [
        r for r in review_rows
        if to_float(r.get("suggested_latitude")) is not None
        and to_float(r.get("suggested_longitude")) is not None
    ]

    if not suggestions:
        print("No suggested coordinates in review file. Nothing to apply.")
        write_output_json(OUTPUT_JSON, [], [])
        sys.exit(0)

    fieldnames, csv_rows = read_csv(CSV_FILE)
    lat_header = pick_header(fieldnames, LAT_ALIASES)
    lon_header = pick_header(fieldnames, LON_ALIASES)

    if not lat_header or not lon_header:
        print("ERROR: Could not find Latitude/Longitude columns in the source CSV.")
        sys.exit(1)

    applied = []
    skipped = []

    for review in suggestions:
        row_num_str = review.get("row", "").strip()
        try:
            row_num = int(row_num_str)
        except ValueError:
            skipped.append({**review, "skip_reason": f"Invalid row number: {row_num_str!r}"})
            continue

        if row_num < 1 or row_num > len(csv_rows):
            skipped.append({**review, "skip_reason": f"Row {row_num} out of range (CSV has {len(csv_rows)} data rows)"})
            continue

        csv_row = csv_rows[row_num - 1]  # row numbers in review file are 1-based

        existing_lat = str(csv_row.get(lat_header, "")).strip()
        existing_lon = str(csv_row.get(lon_header, "")).strip()

        if existing_lat or existing_lon:
            skipped.append({**review, "skip_reason": f"Row {row_num} already has coordinates — not overwriting"})
            continue

        csv_row[lat_header] = review["suggested_latitude"].strip()
        csv_row[lon_header] = review["suggested_longitude"].strip()

        applied.append({
            "csv_row": row_num,
            "event": review.get("event", ""),
            "expedition": review.get("expedition", ""),
            "year": review.get("year", ""),
            "city": review.get("city", ""),
            "state": review.get("state", ""),
            "country": review.get("country", ""),
            "address": review.get("address", ""),
            "zipcode": review.get("zipcode", ""),
            "suggested_latitude": review["suggested_latitude"].strip(),
            "suggested_longitude": review["suggested_longitude"].strip(),
            "suggested_confidence": review.get("suggested_confidence", ""),
            "suggested_address": review.get("suggested_address", ""),
            "suggested_source": review.get("suggested_source", ""),
            "reason": review.get("reason", ""),
        })

    if not applied:
        print("All suggestions skipped (rows already have coordinates or invalid indices).")
        write_output_json(OUTPUT_JSON, [], skipped)
        sys.exit(0)

    write_csv(CSV_FILE, fieldnames, csv_rows)
    print(f"Applied {len(applied)} suggestion(s) to {CSV_FILE}")

    # Append to approval log
    os.makedirs(os.path.dirname(APPROVAL_LOG_FILE) or ".", exist_ok=True)
    file_exists = os.path.exists(APPROVAL_LOG_FILE) and os.path.getsize(APPROVAL_LOG_FILE) > 0
    branch = os.environ.get("BRANCH_NAME", "")
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(APPROVAL_LOG_FILE, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=APPROVAL_LOG_HEADERS, extrasaction="ignore")
        if not file_exists:
            writer.writeheader()
        for a in applied:
            writer.writerow({
                "timestamp_utc": ts,
                "branch": branch,
                "csv_row": a["csv_row"],
                "event": a["event"],
                "expedition": a["expedition"],
                "city": a["city"],
                "state": a["state"],
                "country": a["country"],
                "address": a["address"],
                "suggested_latitude": a["suggested_latitude"],
                "suggested_longitude": a["suggested_longitude"],
                "suggested_confidence": a["suggested_confidence"],
                "suggested_address": a["suggested_address"],
                "suggested_source": a["suggested_source"],
                "applied_by": "geocode-review-pr-workflow",
            })
    print(f"Approval log updated: {APPROVAL_LOG_FILE}")

    # Re-run the build script so the GeoJSON and review file reflect the new coordinates.
    env = {**os.environ}
    env.setdefault("GEOCODE_REVIEW_FILE", "output/geocode_review.csv")
    env.setdefault("BUILD_STATS_FILE", "output/build_stats.json")
    result = subprocess.run(
        [sys.executable, BUILD_SCRIPT, CSV_FILE, GEOJSON_OUTPUT],
        env=env,
    )
    if result.returncode != 0:
        print("WARNING: Build script returned a non-zero exit code after applying suggestions.")

    write_output_json(OUTPUT_JSON, applied, skipped)
    print(f"Done. Applied: {len(applied)}, Skipped: {len(skipped)}")


if __name__ == "__main__":
    main()
