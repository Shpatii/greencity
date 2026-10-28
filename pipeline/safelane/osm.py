"""OpenStreetMap street and bike-infrastructure tags per segment (CONTRACT.md 3.2b).

    python -m safelane.osm [--refresh]    # fetch data/raw/osm_overpass.json (prints the query)

fuse.py joins the cached ways to the segments; nothing here touches the score.
"""

import argparse
import json
import math
import time
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests
from requests.adapters import HTTPAdapter
from shapely.geometry import LineString, box
from urllib3.util.retry import Retry

from safelane import config

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
CACHE = RAW_DIR / "osm_overpass.json"
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
TIMEOUT_S = 180
RETRIES = 2
BUFFER_M = 200
ATTRIBUTION = "© OpenStreetMap contributors, ODbL"

EXCLUDED_HIGHWAYS = ("motorway", "motorway_link", "trunk_link", "proposed", "construction", "steps")
TAGS = ("highway", "name", "maxspeed", "lanes", "oneway", "surface", "cycleway", "cycleway:left",
        "cycleway:right", "cycleway:both", "cycleway:lane", "bicycle", "bicycle_road", "cyclestreet",
        "segregated")
CYCLEWAY_KEYS = ("cycleway", "cycleway:left", "cycleway:right", "cycleway:both")
# Least to most protection; joining several ways keeps the least protected (worst case).
INFRA_CLASSES = ("none", "shared", "shared_bus", "painted_lane", "bike_street", "separated")

ID_MATCH_TAG, DISTANCE_MATCH_TAG = "id", "distance"
NEAREST_M = 10  # fallback join: segment midpoint -> nearest way
SEPARATE_M = 15  # cycleway*=separate needs a highway=cycleway this close ...
SEPARATE_MAX_ANGLE = 30  # ... and this parallel (degrees)
BEARING_HALF_M = 10  # local direction: points this far either side along the line

class OverpassError(RuntimeError):
    """Overpass gave no usable response and there is nothing cached to fall back on."""


# Implicit German limits; Fahrradstraße and Spielstraße added beyond the brief (same meaning in law).
MAXSPEED_ZONES = {
    "de:urban": 50, "de:rural": 100, "de:zone30": 30, "de:zone:30": 30, "de:zone20": 20,
    "de:zone:20": 20, "de:bicycle_road": 30, "de:living_street": 7, "walk": 7,
}


def query(south, west, north, east):
    """Overpass QL for every way with a highway tag except EXCLUDED_HIGHWAYS (highway=cycleway included)."""
    excluded = "|".join(EXCLUDED_HIGHWAYS)
    return (
        f"[out:json][timeout:{TIMEOUT_S}];\n"
        f'way["highway"]["highway"!~"^({excluded})$"]({south:.5f},{west:.5f},{north:.5f},{east:.5f});\n'
        "out tags geom;"
    )


def buffered_bbox(bounds, buffer_m=BUFFER_M):
    """(west, south, east, north) in WGS84, grown by buffer_m -> (south, west, north, east) for Overpass."""
    grown = gpd.GeoSeries([box(*bounds)], crs="EPSG:4326").to_crs(config.METRIC_CRS).buffer(buffer_m)
    west, south, east, north = grown.to_crs("EPSG:4326").total_bounds
    return south, west, north, east


def _session():
    s = requests.Session()
    s.headers["User-Agent"] = config.USER_AGENT
    retry = Retry(total=RETRIES, backoff_factor=5, status_forcelist=(429, 500, 502, 503, 504),
                  allowed_methods=("POST",))
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def fetch(bounds, refresh=False):
    """Overpass response for bounds (+ BUFFER_M), cached in data/raw/osm_overpass.json."""
    if CACHE.exists() and not refresh:
        print(f"  osm: cached {CACHE.name}")
        return json.loads(CACHE.read_text(encoding="utf-8"))
    q = query(*buffered_bbox(bounds))
    print("  osm: Overpass query (paste into https://overpass-turbo.eu to test):\n")
    print(q + "\n")
    start = time.monotonic()
    r = _session().post(OVERPASS_URL, data={"data": q}, timeout=(10, TIMEOUT_S + 30))
    r.raise_for_status()
    payload = r.json()
    # Overpass reports query timeouts as HTTP 200 with a remark and no (or partial) elements.
    remark = payload.get("remark") or ""
    if "error" in remark.lower() or not payload.get("elements"):
        raise OverpassError(f"no usable data from Overpass: {remark or 'no elements'}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CACHE.with_suffix(".json.part")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(CACHE)
    print(f"  osm: {len(payload.get('elements', []))} ways in {time.monotonic() - start:.0f} s -> {CACHE}")
    return payload


def load_cached():
    """Cached Overpass response, or None when it has not been fetched yet."""
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else None


# --- Tag parsing -----------------------------------------------------------------------------

def parse_maxspeed(value):
    """'50' -> 50, 'DE:urban' -> 50, 'DE:zone30' -> 30, 'walk' -> 7, '30 mph' -> 48; 'none'/unknown -> None.

    Several values ('50;30', conditional limits split by ';') -> the highest.
    """
    if value is None:
        return None
    speeds = []
    for part in str(value).split(";"):
        part = part.strip().lower()
        if part in MAXSPEED_ZONES:
            speeds.append(MAXSPEED_ZONES[part])
            continue
        number, _, unit = part.partition(" ")
        try:
            v = float(number)
        except ValueError:
            continue
        if unit in ("", "km/h", "kmh"):
            speeds.append(v)
        elif unit == "mph":
            speeds.append(round(v * 1.609344))
    if not speeds:
        return None
    top = max(speeds)
    return int(top) if float(top).is_integer() else top


def parse_lanes(value):
    """'2' -> 2, '2;3' -> 3; anything else -> None."""
    if value is None:
        return None
    nums = [int(p) for p in str(value).split(";") if p.strip().isdigit()]
    return max(nums) if nums else None


def _cycleway_values(tags):
    """Values of cycleway, cycleway:left/right/both; deprecated opposite_* counts as the plain value."""
    return {str(tags[k]).removeprefix("opposite_") for k in CYCLEWAY_KEYS if tags.get(k)}


def classify(tags):
    """infra_class from OSM tags; first match wins (CONTRACT.md 3.2b)."""
    values = _cycleway_values(tags)
    if tags.get("highway") == "cycleway" or "track" in values or "separate" in values:
        return "separated"
    if tags.get("bicycle_road") == "yes" or tags.get("cyclestreet") == "yes":
        return "bike_street"
    # cycleway:lane=advisory/exclusive (Schutzstreifen/Radfahrstreifen) also describes a painted lane.
    if "lane" in values or tags.get("cycleway:lane") in ("advisory", "exclusive"):
        return "painted_lane"
    if "share_busway" in values:
        return "shared_bus"
    if "shared_lane" in values:
        return "shared"
    return "none"


def separate_only(tags):
    """True when the way is 'separated' only because cycleway*=separate (a parallel way must confirm it)."""
    values = _cycleway_values(tags)
    return "separate" in values and tags.get("highway") != "cycleway" and "track" not in values


def ways_frame(payload):
    """Overpass JSON -> GeoDataFrame (METRIC_CRS) of ways with parsed fields, indexed by osm_id string."""
    rows = []
    for el in payload.get("elements", []):
        geom = el.get("geometry") or []
        if el.get("type") != "way" or len(geom) < 2:
            continue
        tags = el.get("tags", {})
        rows.append({
            "osm_id": str(el["id"]),
            "highway": tags.get("highway"),
            "maxspeed_kmh": parse_maxspeed(tags.get("maxspeed")),
            "lanes": parse_lanes(tags.get("lanes")),
            "infra_class": classify(tags),
            "separate_only": separate_only(tags),
            "geometry": LineString([(p["lon"], p["lat"]) for p in geom]),
        })
    cols = ["osm_id", "highway", "maxspeed_kmh", "lanes", "infra_class", "separate_only", "geometry"]
    gdf = gpd.GeoDataFrame(rows, columns=cols, geometry="geometry", crs="EPSG:4326").to_crs(config.METRIC_CRS)
    return gdf.drop_duplicates("osm_id").set_index("osm_id")


# --- Join to segments -------------------------------------------------------------------------

def _bearing(line, at, half=BEARING_HALF_M):
    """Direction (0-180 degrees, undirected) of line around the point nearest to `at`."""
    d = line.project(at)
    a, b = line.interpolate(max(d - half, 0)), line.interpolate(min(d + half, line.length))
    return math.degrees(math.atan2(b.y - a.y, b.x - a.x)) % 180


def _angle_diff(a, b):
    d = abs(a - b) % 180
    return min(d, 180 - d)


def has_parallel_cycleway(segment, cycleways):
    """A highway=cycleway within SEPARATE_M of the segment midpoint, within SEPARATE_MAX_ANGLE of its direction."""
    mid = segment.interpolate(0.5, normalized=True)
    seg_dir = _bearing(segment, mid)
    for i in cycleways.sindex.query(mid.buffer(SEPARATE_M), predicate="intersects"):
        cw = cycleways.geometry.iloc[i]
        if cw.distance(mid) <= SEPARATE_M and _angle_diff(seg_dir, _bearing(cw, mid)) < SEPARATE_MAX_ANGLE:
            return True
    return False


def _worst(classes):
    return min(classes, key=INFRA_CLASSES.index)


def _max(values):
    values = [v for v in values if v is not None and not pd.isna(v)]
    return max(values) if values else None


def join(geometry, osm_ids, ways):
    """OSM fields per segment.

    geometry: GeoSeries in METRIC_CRS; osm_ids: matching Series of "id" or "id1,id2" strings (or None).
    Returns (DataFrame[highway, maxspeed_kmh, lanes, infra_class, osm_match] on the same index, report dict).
    Several ways (ids, or one nearest way): least protected class, highest maxspeed and lanes,
    highway of the first way.
    """
    ids = osm_ids.map(lambda v: [i.strip() for i in str(v).split(",") if i.strip() in ways.index]
                      if v is not None and not pd.isna(v) else [])
    match = pd.Series(None, index=geometry.index, dtype=object)
    match[ids.map(bool)] = ID_MATCH_TAG

    todo = ~ids.map(bool)
    if todo.any():
        mids = gpd.GeoDataFrame(geometry=geometry[todo].interpolate(0.5, normalized=True), crs=geometry.crs)
        hit = gpd.sjoin_nearest(mids, ways[["geometry"]].reset_index(), max_distance=NEAREST_M)
        hit = hit[~hit.index.duplicated()]
        for i, way_id in hit["osm_id"].items():
            ids[i] = [way_id]
            match[i] = DISTANCE_MATCH_TAG

    cycleways = ways[ways["highway"] == "cycleway"]
    rows = []
    for i, way_ids in ids.items():
        if not way_ids:
            rows.append({"highway": None, "maxspeed_kmh": None, "lanes": None, "infra_class": None})
            continue
        w = ways.loc[way_ids]
        classes = list(w["infra_class"])
        if w["separate_only"].any():
            parallel = has_parallel_cycleway(geometry[i], cycleways)
            classes = [("separated" if parallel else "none") if s else c
                       for c, s in zip(classes, w["separate_only"])]
        rows.append({
            "highway": w["highway"].iloc[0],
            "maxspeed_kmh": _max(w["maxspeed_kmh"]),
            "lanes": _max(w["lanes"]),
            "infra_class": _worst(classes),
        })
    out = pd.DataFrame(rows, index=geometry.index)
    out["osm_match"] = match

    n = len(out)
    report = {
        "segments": n,
        "by_id": int((match == ID_MATCH_TAG).sum()),
        "by_distance": int((match == DISTANCE_MATCH_TAG).sum()),
        "unmatched": int(match.isna().sum()),
        "infra_class": {c: int((out["infra_class"] == c).sum()) for c in INFRA_CLASSES},
    }
    return out, report


def print_report(report):
    n = report["segments"] or 1
    print(f"\nOSM join: {report['segments']} segments")
    for key in ("by_id", "by_distance", "unmatched"):
        print(f"  {key:<12} {report[key]:>6} {100 * report[key] / n:>5.1f}%")
    print("  infra_class:")
    for c, count in report["infra_class"].items():
        print(f"    {c:<13} {count:>6}")


# --- Measures (after score.apply_scores: infra_gap needs rank) ---------------------------------

GAP_CLASSES = ("none", "shared", "painted_lane")
GAP_TOP_SHARE = 0.25  # infra_gap: rank within the top 25% of eligible segments
MEASURES = {
    "protected": "Protected bike lane or separated cycle track",
    "upgrade": "Upgrade painted lane to a physically protected lane",
    "calming": "Bicycle street (Fahrradstrasse) or traffic calming",
    "resurface": "Resurface: rough or cobbled surface",
    "check": "Check on site",
}


def suggested_measure(p):
    """Rule-based measure for one segment's properties; first match wins (CONTRACT.md 3.2b)."""
    infra, speed = p.get("infra_class"), p.get("maxspeed_kmh")
    if infra in ("none", "shared") and speed is not None and speed >= 50 and p["f_safety"] >= 0.3:
        return MEASURES["protected"]
    if infra == "painted_lane" and p["f_safety"] >= 0.3:
        return MEASURES["upgrade"]
    if infra in ("none", "shared") and speed is not None and speed <= 30:
        return MEASURES["calming"]
    if p["f_surface"] >= 0.6:
        return MEASURES["resurface"]
    if p["eligible"]:
        return MEASURES["check"]
    return None


def add_measures(records):
    """Set infra_gap and suggested_measure on scored property dicts (in place); returns the gap count.

    Skipped for data without OSM fields (fuse output before contract 3.2b).
    """
    if not records or "infra_class" not in records[0]:
        return 0
    cutoff = GAP_TOP_SHARE * sum(1 for p in records if p["eligible"])
    for p in records:
        # Columns with nulls come back from pandas as float: 2.0 -> 2.
        for key in ("lanes", "maxspeed_kmh"):
            if isinstance(p.get(key), float) and p[key].is_integer():
                p[key] = int(p[key])
        p["infra_gap"] = bool(p["eligible"] and p["rank"] is not None and p["rank"] <= cutoff
                              and p.get("infra_class") in GAP_CLASSES)
        p["suggested_measure"] = suggested_measure(p)
    return sum(p["infra_gap"] for p in records)


def print_top(records, n=10):
    """infra_gap count and the top n by rank with their OSM fields and measure."""
    if not records or "infra_class" not in records[0]:
        return
    print(f"\ninfra_gap segments: {sum(p['infra_gap'] for p in records)}")
    top = sorted((p for p in records if p["rank"] is not None), key=lambda p: p["rank"])[:n]
    print(f"{'rank':>4}  {'name':<34} {'infra_class':<13} {'maxspeed':>8}  suggested_measure")
    for p in top:
        speed = "-" if p["maxspeed_kmh"] is None else p["maxspeed_kmh"]
        print(f"{p['rank']:>4}  {(p['name'] or '-')[:34]:<34} {str(p['infra_class']):<13} {speed:>8}  "
              f"{p['suggested_measure']}")


def osm_timestamp(payload):
    """OSM data state of the Overpass response (osm3s.timestamp_osm_base), or None."""
    return (payload or {}).get("osm3s", {}).get("timestamp_osm_base")


def run(refresh=False, allow_missing=False):
    """Fetch (or reuse) the cache for the road network extent.

    A failed request falls back to the existing cache. Without a cache it raises, unless
    allow_missing (offline development): then fuse publishes the OSM fields as null.
    """
    print("osm")
    road = gpd.read_file(RAW_DIR / f"{config.COLLECTIONS['road_network']}.geojson")
    # The full network extent, not meta.bbox (that is the 2-98% view, CONTRACT 3.3).
    try:
        fetch(tuple(road.to_crs("EPSG:4326").total_bounds), refresh=refresh)
    except (requests.RequestException, OverpassError) as e:
        if CACHE.exists():
            print(f"  WARNING: Overpass request failed ({e}); reusing cached {CACHE.name}")
        elif allow_missing:
            print(f"  WARNING: Overpass request failed ({e}); OSM fields will be null")
        else:
            raise OverpassError(f"Overpass request failed and there is no cached {CACHE.name}: {e}") from e


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch OSM ways for the segments (Overpass)")
    parser.add_argument("--refresh", action="store_true", help="re-download even if cached")
    run(refresh=parser.parse_args().refresh)
