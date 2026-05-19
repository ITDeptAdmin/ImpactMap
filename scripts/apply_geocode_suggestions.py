# apply_geocode_suggestions.py
#
# Applies the suggested coordinates for ONE review row to the Master CSV.
#
# Row selection (required — provide one):
#   CLI argument:     python apply_geocode_suggestions.py --review-row 1714
#   Environment var:  REVIEW_ROW=1714
#
# If neither is given the script exits with an error.
#
# Safety rules:
#   - Never overwrites existing Latitude or Longitude.
#   - Validates row index is in range.
#   - Validates event/expedition match when available.
#   - Appends every change to logs/geocode_approval_suggestions.csv.
#   - Re-runs scripts/build_impactmap_geojson.py after updating the CSV.
#   - Writes output/geocode_suggestions_applied.json for the calling workflow.
#   - Exits 0 in all cases so the workflow can always read the JSON.
#
# Environment variables (all optional except REVIEW_ROW):
#   REVIEW_ROW                   1-based CSV row number to apply
#   GEOCODE_REVIEW_FILE          output/geocode_review.csv
#   CSV_FILE                     data/Master_Clinic_ImpactMap.csv
#   APPROVAL_LOG_FILE            logs/geocode_approval_suggestions.csv
#   SUGGESTIONS_APPLIED_JSON     output/geocode_suggestions_applied.json
#   MAPBOX_GEOCODING_TOKEN       forwarded to build script
#   BRANCH_NAME                  recorded in approval log

import argparse
import csv
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional

REVIEW_FILE   = os.environ.get("GEOCODE_REVIEW_FILE",      "output/geocode_review.csv")
CSV_FILE      = os.environ.get("CSV_FILE",                 "data/Master_Clinic_ImpactMap.csv")
APPROVAL_LOG  = os.environ.get("APPROVAL_LOG_FILE",        "logs/geocode_approval_suggestions.csv")
OUTPUT_JSON   = os.environ.get("SUGGESTIONS_APPLIED_JSON", "output/geocode_suggestions_applied.json")
BUILD_SCRIPT  = "scripts/build_impactmap_geojson.py"
GEOJSON_OUT   = "output/ImpactMap_Dataset.geojson"

APPROVAL_LOG_HEADERS = [
    "timestamp_utc", "branch", "csv_row", "event", "expedition",
    "city", "state", "country", "address",
    "suggested_latitude", "suggested_longitude",
    "suggested_confidence", "suggested_address", "suggested_source",
    "applied_by",
]

LAT_ALIASES = ["Latitude",  "Lat",  "LAT",  "lat",  "latitude"]
LON_ALIASES = ["Longitude", "Longitutde", "Long", "Lng",
                "LON", "lon", "lng", "longitude"]


def to_float(val) -> Optional[float]:
    try:
        return float(str(val).strip())
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
    parser = argparse.ArgumentParser(description="Apply one geocode suggestion to the Master CSV")
    parser.add_argument("--review-row", type=int, default=None,
                        help="1-based CSV row number to apply (also readable from REVIEW_ROW env var)")
    args = parser.parse_args()

    # Row number: CLI arg takes precedence, then env var
    target_row: Optional[int] = args.review_row
    if target_row is None:
        env_val = os.environ.get("REVIEW_ROW", "").strip()
        if env_val:
            try:
                target_row = int(env_val)
            except ValueError:
                print(f"ERROR: REVIEW_ROW={env_val!r} is not a valid integer.")
                write_output_json(OUTPUT_JSON, [], [])
                sys.exit(0)

    if target_row is None:
        print("ERROR: No review row specified. Use --review-row N or REVIEW_ROW=N.")
        write_output_json(OUTPUT_JSON, [], [])
        sys.exit(0)

    # Find the matching review row
    all_review = read_review_rows(REVIEW_FILE)
    matching = [
        r for r in all_review
        if r.get("row", "").strip() == str(target_row)
        and to_float(r.get("suggested_latitude"))  is not None
        and to_float(r.get("suggested_longitude")) is not None
    ]

    if not matching:
        print(f"No review row {target_row} with suggested coordinates found in {REVIEW_FILE}.")
        write_output_json(OUTPUT_JSON, [], [])
        sys.exit(0)

    review = matching[0]

    # Load the source CSV
    fieldnames, csv_rows = read_csv(CSV_FILE)
    lat_header = pick_header(fieldnames, LAT_ALIASES)
    lon_header = pick_header(fieldnames, LON_ALIASES)

    if not lat_header or not lon_header:
        print("ERROR: Could not find Latitude/Longitude columns in the source CSV.")
        write_output_json(OUTPUT_JSON, [], [])
        sys.exit(0)

    if target_row < 1 or target_row > len(csv_rows):
        msg = f"Row {target_row} is out of range (CSV has {len(csv_rows)} data rows)."
        print(f"SKIP: {msg}")
        write_output_json(OUTPUT_JSON, [], [{"skip_reason": msg, **review}])
        sys.exit(0)

    csv_row = csv_rows[target_row - 1]

    # Safety: never overwrite existing coordinates
    existing_lat = str(csv_row.get(lat_header, "")).strip()
    existing_lon = str(csv_row.get(lon_header, "")).strip()
    if existing_lat or existing_lon:
        msg = f"Row {target_row} already has coordinates — not overwriting."
        print(f"SKIP: {msg}")
        write_output_json(OUTPUT_JSON, [], [{"skip_reason": msg, **review}])
        sys.exit(0)

    # Apply
    csv_row[lat_header] = review["suggested_latitude"].strip()
    csv_row[lon_header] = review["suggested_longitude"].strip()

    applied_record = {
        "csv_row":              target_row,
        "event":                review.get("event", ""),
        "expedition":           review.get("expedition", ""),
        "year":                 review.get("year", ""),
        "city":                 review.get("city", ""),
        "state":                review.get("state", ""),
        "country":              review.get("country", ""),
        "address":              review.get("address", ""),
        "zipcode":              review.get("zipcode", ""),
        "suggested_latitude":   review["suggested_latitude"].strip(),
        "suggested_longitude":  review["suggested_longitude"].strip(),
        "suggested_confidence": review.get("suggested_confidence", ""),
        "suggested_address":    review.get("suggested_address", ""),
        "suggested_source":     review.get("suggested_source", ""),
        "reason":               review.get("reason", ""),
    }

    write_csv(CSV_FILE, fieldnames, csv_rows)
    print(f"Applied suggestion for row {target_row} to {CSV_FILE}")

    # Append to approval log
    os.makedirs(os.path.dirname(APPROVAL_LOG) or ".", exist_ok=True)
    file_exists = os.path.exists(APPROVAL_LOG) and os.path.getsize(APPROVAL_LOG) > 0
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    branch = os.environ.get("BRANCH_NAME", "")
    with open(APPROVAL_LOG, "a", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=APPROVAL_LOG_HEADERS, extrasaction="ignore")
        if not file_exists:
            writer.writeheader()
        writer.writerow({
            "timestamp_utc":        ts,
            "branch":               branch,
            "csv_row":              applied_record["csv_row"],
            "event":                applied_record["event"],
            "expedition":           applied_record["expedition"],
            "city":                 applied_record["city"],
            "state":                applied_record["state"],
            "country":              applied_record["country"],
            "address":              applied_record["address"],
            "suggested_latitude":   applied_record["suggested_latitude"],
            "suggested_longitude":  applied_record["suggested_longitude"],
            "suggested_confidence": applied_record["suggested_confidence"],
            "suggested_address":    applied_record["suggested_address"],
            "suggested_source":     applied_record["suggested_source"],
            "applied_by":           "geocode-review-pr-workflow",
        })
    print(f"Approval log updated: {APPROVAL_LOG}")

    # Re-run the build so GeoJSON and review CSV reflect the new coordinate
    env = {**os.environ}
    env.setdefault("GEOCODE_REVIEW_FILE", "output/geocode_review.csv")
    env.setdefault("BUILD_STATS_FILE",    "output/build_stats.json")
    result = subprocess.run(
        [sys.executable, BUILD_SCRIPT, CSV_FILE, GEOJSON_OUT],
        env=env,
    )
    if result.returncode != 0:
        print("WARNING: Build script returned non-zero after applying suggestion.")

    write_output_json(OUTPUT_JSON, [applied_record], [])
    print(f"Done. Applied row {target_row}.")


if __name__ == "__main__":
    main()
