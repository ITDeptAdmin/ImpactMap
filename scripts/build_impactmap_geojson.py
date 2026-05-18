# build_impactmap_geojson.py
# Converts the RAM Impact Map CSV into GeoJSON.
#
# New behavior:
# - Keeps existing Latitude/Longitude values exactly as-is.
# - Fills blank Latitude/Longitude by first matching another row in the CSV.
# - If no safe CSV match is found and an address exists, uses Mapbox permanent geocoding.
# - Writes newly found coordinates back into the same CSV.
# - Writes rows needing review to output/geocode_review.csv.
#
# Required GitHub Secret for Mapbox geocoding:
#   MAPBOX_GEOCODING_TOKEN
#
# NOTE: This script only fills blank coordinates. It never overwrites existing coordinates.

import csv
import json
import os
import sys
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

INPUT_CANDIDATES = [
    "data/Master_Clinic_ImpactMap.csv",
    "Master_Clinic_ImpactMap.csv",
]

DEFAULT_OUTPUT_FILE = "output/ImpactMap_Dataset.geojson"
DEFAULT_REVIEW_FILE = "output/geocode_review.csv"
DEFAULT_BUILD_STATS_FILE = "output/build_stats.json"

HEADER_ALIASES = {
    "latitude": ["Latitude", "Lat", "LAT", "lat", "latitude"],
    "longitude": ["Longitude", "Longitutde", "Long", "Lng", "LON", "lon", "lng", "longitude"],
    "address": ["Address", "Street Address", "Location Address"],
    "zipcode": ["Zipcode", "Zip Code", "ZIP", "Zip"],
    "city": ["City"],
    "state": ["State"],
    "non_us_state": ["NonUSState", "Non US State", "Province", "Region"],
    "county": ["County / Parish", "County/Parish", "County", "Parish"],
    "country": ["Country"],
    "event_id": ["Event #", "Event#", "Event"],
    "expedition_id": ["Expedition #", "Expedition#", "Expedition"],
    "year": ["Year"],
}

REVIEW_HEADERS = [
    "row",
    "event",
    "expedition",
    "year",
    "address",
    "city",
    "state",
    "non_us_state",
    "county_parish",
    "country",
    "zipcode",
    "reason",
]

# If Mapbox returns one of these confidence values, we accept it.
# If Mapbox does not include match_code/confidence, we still accept the first coordinate
# because some global addresses may not include the same metadata.
ACCEPTED_MAPBOX_CONFIDENCE = {"exact", "high", "medium"}


def find_input_file() -> Optional[str]:
    for name in INPUT_CANDIDATES:
        if os.path.exists(name):
            return name
    return None


def pick_header(row_fieldnames: List[str], aliases: List[str]) -> Optional[str]:
    for a in aliases:
        if a in row_fieldnames:
            return a
    return None


def to_float(val) -> Optional[float]:
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
    if val is None:
        return None
    s = str(val).strip()
    if s == "":
        return None

    if key == "Total Value of Care":
        f = to_float(s)
        return f if f is not None else s

    numeric_int_cols = {
        "Event #", "Expedition #", "Year", "ZipCode", "Zipcode",
        "Total Volunteers", "Total Patients",
        "Animals Served", "Extractions", "Fillings", "Cleanings",
        "Glasses", "Eye Exams", "Medical Exams", "Women's Health",
    }

    if key in numeric_int_cols:
        n = to_int(s)
        return n if n is not None else s

    return s


def norm(val) -> str:
    return " ".join(str(val or "").strip().lower().split())


def get(row: Dict[str, str], header_map: Dict[str, Optional[str]], key: str) -> str:
    h = header_map.get(key)
    return str(row.get(h, "") if h else "").strip()


def set_cell(row: Dict[str, str], header_map: Dict[str, Optional[str]], key: str, value: str) -> None:
    h = header_map.get(key)
    if h:
        row[h] = value


def country_for_query(country: str) -> str:
    c = norm(country)
    if c in {"", "usa", "us", "u.s.", "united states", "united states of america"}:
        return "United States"
    return country.strip()


def is_usa(country: str) -> bool:
    c = norm(country)
    return c in {"", "usa", "us", "u.s.", "united states", "united states of america"}


def region_value(row: Dict[str, str], header_map: Dict[str, Optional[str]]) -> str:
    state = get(row, header_map, "state")
    non_us_state = get(row, header_map, "non_us_state")
    return state or non_us_state


def make_match_keys(row: Dict[str, str], header_map: Dict[str, Optional[str]]) -> List[Tuple[str, str]]:
    address = norm(get(row, header_map, "address"))
    zipcode = norm(get(row, header_map, "zipcode"))
    city = norm(get(row, header_map, "city"))
    county = norm(get(row, header_map, "county"))
    region = norm(region_value(row, header_map))
    country = norm(country_for_query(get(row, header_map, "country")))

    keys = []

    if address and zipcode and city and region and country:
        keys.append(("address_zip_city_region_country", f"{address}|{zipcode}|{city}|{region}|{country}"))

    if address and city and region and country:
        keys.append(("address_city_region_country", f"{address}|{city}|{region}|{country}"))

    if zipcode and city and region and country:
        keys.append(("zip_city_region_country", f"{zipcode}|{city}|{region}|{country}"))

    if city and region and country:
        keys.append(("city_region_country", f"{city}|{region}|{country}"))

    if county and region and country:
        keys.append(("county_region_country", f"{county}|{region}|{country}"))

    return keys


def rounded_coord_pair(lat: float, lon: float) -> Tuple[float, float]:
    # Six decimals is precise enough for location reuse and avoids tiny string differences.
    return (round(lat, 6), round(lon, 6))


def build_coordinate_index(
    rows: List[Dict[str, str]],
    header_map: Dict[str, Optional[str]]
) -> Dict[Tuple[str, str], Optional[Tuple[float, float]]]:
    """
    Map match keys to coordinates.

    Value is:
      (lat, lon) if exactly one unique coordinate exists for that key
      None if the key is ambiguous and should not be used
    """
    raw_index: Dict[Tuple[str, str], set] = {}

    for row in rows:
        lat = to_float(get(row, header_map, "latitude"))
        lon = to_float(get(row, header_map, "longitude"))

        if lat is None or lon is None:
            continue

        pair = rounded_coord_pair(lat, lon)

        for key_type, key_value in make_match_keys(row, header_map):
            index_key = (key_type, key_value)
            raw_index.setdefault(index_key, set()).add(pair)

    final_index: Dict[Tuple[str, str], Optional[Tuple[float, float]]] = {}
    for key, coord_set in raw_index.items():
        if len(coord_set) == 1:
            final_index[key] = next(iter(coord_set))
        else:
            # Ambiguous: more than one coordinate exists for this place key.
            final_index[key] = None

    return final_index


def find_existing_coordinate_match(
    row: Dict[str, str],
    header_map: Dict[str, Optional[str]],
    coordinate_index: Dict[Tuple[str, str], Optional[Tuple[float, float]]]
) -> Tuple[Optional[Tuple[float, float]], Optional[str], bool]:
    """
    Returns:
      coordinate pair, match label, was_ambiguous
    """
    saw_ambiguous = False

    for key_type, key_value in make_match_keys(row, header_map):
        index_key = (key_type, key_value)
        if index_key not in coordinate_index:
            continue

        coord = coordinate_index[index_key]
        if coord is None:
            saw_ambiguous = True
            continue

        return coord, key_type, False

    return None, None, saw_ambiguous


def build_geocode_query(row: Dict[str, str], header_map: Dict[str, Optional[str]]) -> Optional[str]:
    address = get(row, header_map, "address")
    city = get(row, header_map, "city")
    region = region_value(row, header_map)
    zipcode = get(row, header_map, "zipcode")
    country = country_for_query(get(row, header_map, "country"))

    # Do not geocode if there is no actual street/address value.
    # This prevents guessing for old/historic records that only have city/state.
    if not address:
        return None

    parts = [address, city, region, zipcode, country]
    query = ", ".join([p for p in parts if str(p).strip()])
    return query or None


def mapbox_forward_geocode(query: str, token: str) -> Tuple[Optional[Tuple[float, float]], str]:
    params = {
        "q": query,
        "access_token": token,
        "limit": "1",
        "autocomplete": "false",
        "permanent": "true",
    }

    url = "https://api.mapbox.com/search/geocode/v6/forward?" + urlencode(params)

    req = Request(url, headers={"User-Agent": "RAM Impact Map GitHub Action"})
    try:
        with urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
    except HTTPError as e:
        return None, f"Mapbox HTTP error: {e.code}"
    except URLError as e:
        return None, f"Mapbox URL error: {e.reason}"
    except Exception as e:
        return None, f"Mapbox request error: {e}"

    features = data.get("features") or []
    if not features:
        return None, "Mapbox returned no results"

    feature = features[0]
    coords = (((feature.get("geometry") or {}).get("coordinates")) or [])

    if len(coords) < 2:
        return None, "Mapbox result did not include coordinates"

    lon = to_float(coords[0])
    lat = to_float(coords[1])

    if lat is None or lon is None:
        return None, "Mapbox coordinates were not numeric"

    props = feature.get("properties") or {}
    match_code = props.get("match_code") or {}
    confidence = str(match_code.get("confidence") or "").strip().lower()

    # Some Mapbox responses may not include match_code/confidence.
    # If confidence exists but is low, send to review. If no confidence exists, accept.
    if confidence and confidence not in ACCEPTED_MAPBOX_CONFIDENCE:
        return None, f"Mapbox confidence was too low: {confidence}"

    return rounded_coord_pair(lat, lon), f"Mapbox geocoded: {props.get('full_address') or props.get('name') or query}"


def make_review_row(row: Dict[str, str], header_map: Dict[str, Optional[str]], row_number: int, reason: str) -> Dict[str, str]:
    return {
        "row": str(row_number),
        "event": get(row, header_map, "event_id"),
        "expedition": get(row, header_map, "expedition_id"),
        "year": get(row, header_map, "year"),
        "address": get(row, header_map, "address"),
        "city": get(row, header_map, "city"),
        "state": get(row, header_map, "state"),
        "non_us_state": get(row, header_map, "non_us_state"),
        "county_parish": get(row, header_map, "county"),
        "country": get(row, header_map, "country"),
        "zipcode": get(row, header_map, "zipcode"),
        "reason": reason,
    }


def enrich_missing_coordinates(
    rows: List[Dict[str, str]],
    fieldnames: List[str],
    header_map: Dict[str, Optional[str]],
    review_file: str
) -> Dict[str, int]:
    token = os.environ.get("MAPBOX_GEOCODING_TOKEN", "").strip()
    coordinate_index = build_coordinate_index(rows, header_map)

    changed = 0
    matched_existing = 0
    geocoded = 0
    review_rows: List[Dict[str, str]] = []

    for idx, row in enumerate(rows, start=1):
        lat_raw = get(row, header_map, "latitude")
        lon_raw = get(row, header_map, "longitude")

        lat = to_float(lat_raw)
        lon = to_float(lon_raw)

        has_lat = lat is not None
        has_lon = lon is not None

        if has_lat and has_lon:
            continue

        if has_lat != has_lon:
            review_rows.append(make_review_row(
                row, header_map, idx,
                "Only one coordinate is filled. Latitude and Longitude must both be present."
            ))
            continue

        # Both are blank or invalid.
        coord, match_type, ambiguous = find_existing_coordinate_match(row, header_map, coordinate_index)

        if coord:
            set_cell(row, header_map, "latitude", f"{coord[0]:.6f}")
            set_cell(row, header_map, "longitude", f"{coord[1]:.6f}")
            changed += 1
            matched_existing += 1
            continue

        query = build_geocode_query(row, header_map)

        if not query:
            # Keep old records with no address from becoming a scary "error."
            review_rows.append(make_review_row(
                row, header_map, idx,
                "Missing coordinates and no street address. Left blank for manual review."
            ))
            continue

        if ambiguous:
            # Still allow Mapbox if we have a street address.
            pass

        if not token:
            review_rows.append(make_review_row(
                row, header_map, idx,
                "Missing coordinates and no MAPBOX_GEOCODING_TOKEN secret was available."
            ))
            continue

        coord, note = mapbox_forward_geocode(query, token)

        if coord:
            set_cell(row, header_map, "latitude", f"{coord[0]:.6f}")
            set_cell(row, header_map, "longitude", f"{coord[1]:.6f}")
            changed += 1
            geocoded += 1
        else:
            review_rows.append(make_review_row(row, header_map, idx, note))

    out_dir = os.path.dirname(review_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(review_file, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=REVIEW_HEADERS)
        writer.writeheader()
        writer.writerows(review_rows)

    stats = {
        "coordinate_rows_updated": changed,
        "matched_existing": matched_existing,
        "mapbox_geocoded": geocoded,
        "review_rows": len(review_rows),
    }

    print(
        "Coordinate enrichment: "
        f"changed={stats['coordinate_rows_updated']}, "
        f"matched_existing={stats['matched_existing']}, "
        f"mapbox_geocoded={stats['mapbox_geocoded']}, "
        f"review_rows={stats['review_rows']}"
    )
    print(f"Review file: {review_file}")

    return stats


def read_csv(in_file: str) -> Tuple[List[str], List[Dict[str, str]]]:
    with open(in_file, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            print("ERROR: CSV appears to have no headers.")
            sys.exit(1)

        rows = list(reader)
        return list(reader.fieldnames), rows


def write_csv(in_file: str, fieldnames: List[str], rows: List[Dict[str, str]]) -> None:
    with open(in_file, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def build_header_map(fieldnames: List[str]) -> Dict[str, Optional[str]]:
    header_map = {
        key: pick_header(fieldnames, aliases)
        for key, aliases in HEADER_ALIASES.items()
    }

    if not header_map["latitude"] or not header_map["longitude"]:
        print("ERROR: Could not find Latitude/Longitude columns.")
        print("Found headers:", fieldnames)
        sys.exit(1)

    return header_map


def build_geojson(
    rows: List[Dict[str, str]],
    fieldnames: List[str],
    header_map: Dict[str, Optional[str]],
    out_file: str
) -> Dict[str, int]:
    lat_key = header_map["latitude"]
    lon_key = header_map["longitude"]

    features = []
    skipped = 0

    for i, row in enumerate(rows, start=1):
        lat = to_float(row.get(lat_key))
        lon = to_float(row.get(lon_key))

        if lat is None or lon is None:
            skipped += 1
            continue

        props = {}
        for k, v in row.items():
            if k in (lat_key, lon_key):
                continue
            props[k] = to_number_if_possible(k, v)

        event_id = row.get(header_map.get("event_id") or "") or row.get("Event #") or row.get("Event#") or row.get("Event")
        expedition_id = row.get(header_map.get("expedition_id") or "") or row.get("Expedition #") or row.get("Expedition#") or row.get("Expedition")

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

    out_dir = os.path.dirname(out_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(out_file, "w", encoding="utf-8") as out:
        json.dump(geojson, out, ensure_ascii=False)

    stats = {"features": len(features), "skipped_missing_latlon": skipped}

    print(f"OK: Wrote {out_file}")
    print(f"Features: {stats['features']}  Skipped (missing lat/lon): {stats['skipped_missing_latlon']}")

    return stats


def write_build_stats(stats_file: str, stats: Dict[str, object]) -> None:
    out_dir = os.path.dirname(stats_file)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)

    with open(stats_file, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)

    print(f"Build stats: {stats_file}")


def main():
    if len(sys.argv) >= 2 and sys.argv[1].strip():
        in_file = sys.argv[1].strip()
    else:
        in_file = find_input_file()

    if len(sys.argv) >= 3 and sys.argv[2].strip():
        out_file = sys.argv[2].strip()
    else:
        out_file = DEFAULT_OUTPUT_FILE

    review_file = os.environ.get("GEOCODE_REVIEW_FILE", DEFAULT_REVIEW_FILE).strip() or DEFAULT_REVIEW_FILE
    stats_file = os.environ.get("BUILD_STATS_FILE", DEFAULT_BUILD_STATS_FILE).strip() or DEFAULT_BUILD_STATS_FILE

    if not in_file or not os.path.exists(in_file):
        print("ERROR: Could not find input CSV.")
        print("Looked for:")
        for n in INPUT_CANDIDATES:
            print(f" - {n}")
        print("Or pass a path like:")
        print("  python scripts/build_impactmap_geojson.py data/Master_Clinic_ImpactMap.csv output/ImpactMap_Dataset.geojson")
        sys.exit(1)

    fieldnames, rows = read_csv(in_file)
    header_map = build_header_map(fieldnames)

    enrichment_stats = enrich_missing_coordinates(rows, fieldnames, header_map, review_file)
    changed = int(enrichment_stats.get("coordinate_rows_updated", 0))

    if changed:
        write_csv(in_file, fieldnames, rows)
        print(f"OK: Updated source CSV with {changed} newly filled coordinate row(s): {in_file}")
    else:
        print("OK: No CSV coordinate updates needed.")

    geojson_stats = build_geojson(rows, fieldnames, header_map, out_file)

    build_stats = {
        **enrichment_stats,
        **geojson_stats,
        "csv": in_file,
        "geojson": out_file,
        "review_file": review_file,
    }
    write_build_stats(stats_file, build_stats)


if __name__ == "__main__":
    main()
