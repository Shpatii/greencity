"""P3: fake data, same contract.

Writes web/public/data/segments.geojson and web/public/data/meta.json following
contract/CONTRACT.md (sections 3.2 and 3.3), then validates every feature's
properties against contract/segment.schema.json.

    python mock/make_mock.py
"""
import json
import math
import statistics
import sys
from datetime import datetime
from pathlib import Path
from random import Random

from jsonschema import Draft202012Validator
from pyproj import Transformer
from shapely.geometry import LineString

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "public" / "data"
SCHEMA_PATH = ROOT / "contract" / "segment.schema.json"

SEED = 42
N_SEGMENTS = 320
BBOX = [9.17, 49.11, 9.25, 49.17]  # lon_min, lat_min, lon_max, lat_max
MARGIN_DEG = 0.005  # keep start points away from the bbox edge (> 300 m)
LENGTH_RANGE_M = (50.0, 300.0)
MISSING_SHARE = 0.10

# Same defaults as pipeline/safelane/config.py and CONTRACT.md section 3.2.
DEFAULT_WEIGHTS = {"safety": 0.35, "danger": 0.25, "surface": 0.15, "air": 0.15, "flow": 0.10}
MIN_POINTS = 5
CONFIDENCE_N = 30
METRIC_CRS = "EPSG:25832"

FACTORS = list(DEFAULT_WEIGHTS)
# Raw metrics that feed each factor; nulled together when the factor is missing.
FACTOR_METRICS = {
    "safety": ["share_below_150", "avg_overtake_cm"],
    "danger": ["danger_per_100m", "mean_danger_risk"],
    "surface": ["roughness_norm"],
    "air": ["mean_pm_risk"],
    "flow": ["traffic_flow"],
}

TO_METRIC = Transformer.from_crs("EPSG:4326", METRIC_CRS, always_xy=True)
TO_WGS84 = Transformer.from_crs(METRIC_CRS, "EPSG:4326", always_xy=True)


def clamp(x, lo, hi):
    return max(lo, min(hi, x))


def length_m(coords):
    """Length of a WGS84 coordinate list, measured in EPSG:25832."""
    return LineString([TO_METRIC.transform(lon, lat) for lon, lat in coords]).length


def in_bbox(coords):
    return all(BBOX[0] <= lon <= BBOX[2] and BBOX[1] <= lat <= BBOX[3] for lon, lat in coords)


def make_geometry(rng):
    """LineString of 2-4 points, 50-300 m long, inside BBOX."""
    while True:
        lon = rng.uniform(BBOX[0] + MARGIN_DEG, BBOX[2] - MARGIN_DEG)
        lat = rng.uniform(BBOX[1] + MARGIN_DEG, BBOX[3] - MARGIN_DEG)
        n_vertices = rng.randint(2, 4)
        total = rng.uniform(LENGTH_RANGE_M[0] + 5, LENGTH_RANGE_M[1] - 5)
        splits = [rng.uniform(0.5, 1.5) for _ in range(n_vertices - 1)]
        heading = rng.uniform(0, 2 * math.pi)

        x, y = TO_METRIC.transform(lon, lat)
        coords = [(round(lon, 6), round(lat, 6))]
        for s in splits:
            leg = total * s / sum(splits)
            heading += rng.gauss(0, 0.35)  # gentle bends, like a real street
            x += leg * math.cos(heading)
            y += leg * math.sin(heading)
            lon_i, lat_i = TO_WGS84.transform(x, y)
            coords.append((round(lon_i, 6), round(lat_i, 6)))

        length = length_m(coords)
        if in_bbox(coords) and LENGTH_RANGE_M[0] <= length <= LENGTH_RANGE_M[1]:
            return [list(c) for c in coords], round(length, 1)


def make_raw(rng, i):
    """Raw metrics for one random segment. A latent 'stress' level correlates them."""
    coords, length = make_geometry(rng)
    stress = rng.random()

    n_points = int(80 * rng.random() ** 1.5)  # skewed: many sparse segments
    n_overtakes = round(n_points * rng.uniform(0.3, 0.9))

    avg_overtake_cm = clamp(rng.gauss(200 - 90 * stress, 15), 90.0, 220.0)
    share_target = clamp(0.8 * (220 - avg_overtake_cm) / 130 + rng.gauss(0, 0.05), 0, 0.8)
    if n_overtakes:
        below = min(round(share_target * n_overtakes), math.floor(0.8 * n_overtakes))
        share_below_150 = round(below / n_overtakes, 3)
    else:
        share_below_150 = None

    roughness_norm = round(rng.betavariate(2, 4), 2)
    traffic_flow = round(clamp(rng.gauss(0.9 - 0.5 * stress, 0.1), 0.3, 1.0), 2)
    raw = {
        "id": f"seg_{i:06d}",
        "osm_id": str(rng.randint(10_000_000, 999_999_999)),
        "name": f"Mockstrasse {i}",
        "length_m": length,
        "n_points": n_points,
        "n_overtakes": n_overtakes,
        "share_below_150": share_below_150,
        "avg_overtake_cm": round(avg_overtake_cm, 1) if n_overtakes else None,
        "danger_per_100m": round(min(10.0, rng.expovariate(1 / (0.5 + 4 * stress))), 2),
        "mean_danger_risk": round(clamp(rng.gauss(0.25 + 0.5 * stress, 0.1), 0, 1), 2),
        "mean_pm_risk": round(clamp(rng.gauss(0.2 + 0.4 * stress, 0.12), 0, 1), 2),
        "roughness_norm": roughness_norm,
        "traffic_flow": traffic_flow,
        "avg_speed_kmh": round(
            clamp(rng.gauss(22 - 6 * roughness_norm - 4 * (1 - traffic_flow), 2), 10.0, 25.0), 1
        ),
    }

    if rng.random() < MISSING_SHARE:
        for key in rng.sample(FACTORS, rng.randint(1, 2)):
            for metric in FACTOR_METRICS[key]:
                raw[metric] = None
    return coords, raw


def edge_cases():
    """seg_999998: every factor 1 with n_points 80. seg_999999: every factor 0."""
    worst = {
        "id": "seg_999998", "osm_id": "999999998", "name": "Mockstrasse 999998",
        "n_points": 80, "n_overtakes": 40, "share_below_150": 1.0, "avg_overtake_cm": 85.0,
        "danger_per_100m": 15.0,  # above any random value, so >= P95 -> f_danger 1
        "mean_danger_risk": 1.0, "mean_pm_risk": 1.0, "roughness_norm": 1.0,
        "traffic_flow": 0.0, "avg_speed_kmh": 10.0,
    }
    best = {
        "id": "seg_999999", "osm_id": "999999999", "name": "Mockstrasse 999999",
        "n_points": 30, "n_overtakes": 20, "share_below_150": 0.0, "avg_overtake_cm": 210.0,
        "danger_per_100m": 0.0, "mean_danger_risk": 0.0, "mean_pm_risk": 0.0,
        "roughness_norm": 0.0, "traffic_flow": 1.0, "avg_speed_kmh": 24.0,
    }
    out = []
    for raw, coords in [
        (worst, [[9.2185, 49.1427], [9.2196, 49.1433], [9.2208, 49.1436]]),
        (best, [[9.2050, 49.1300], [9.2065, 49.1302]]),
    ]:
        raw = {**raw, "length_m": round(length_m(coords), 1)}
        out.append((coords, raw))
    return out


def p95(values):
    """95th percentile with linear interpolation (same as numpy's default)."""
    return statistics.quantiles(values, n=100, method="inclusive")[94]


def add_factors(raw, danger_p95):
    """Factor rules from CONTRACT.md 3.2; missing data -> factor 0 and key in 'missing'."""
    formulas = {
        "safety": lambda r: r["share_below_150"],
        "danger": lambda r: min(1.0, r["danger_per_100m"] / danger_p95) if danger_p95 > 0 else 0.0,
        "surface": lambda r: r["roughness_norm"],
        "air": lambda r: r["mean_pm_risk"],
        "flow": lambda r: 1 - r["traffic_flow"],
    }
    drivers = {"safety": "share_below_150", "danger": "danger_per_100m", "surface": "roughness_norm",
               "air": "mean_pm_risk", "flow": "traffic_flow"}
    missing = []
    for key in FACTORS:
        if raw[drivers[key]] is None:
            raw[f"f_{key}"] = 0.0
            missing.append(key)
        else:
            raw[f"f_{key}"] = round(formulas[key](raw), 3)
    raw["missing"] = missing


def reason_texts(props):
    texts = {}
    if "safety" not in props["missing"]:
        texts["safety"] = (f"{round(props['share_below_150'] * 100)}% of {props['n_overtakes']} "
                           f"overtakes were closer than 150 cm")
    if "danger" not in props["missing"]:
        texts["danger"] = f"{props['danger_per_100m']:.1f} close-overtake danger points per 100 m"
    if "surface" not in props["missing"]:
        texts["surface"] = f"Surface roughness {props['roughness_norm']:.2f} (city scale 0-1)"
    if "air" not in props["missing"]:
        texts["air"] = f"PM risk {props['mean_pm_risk']:.2f} (city scale 0-1)"
    if "flow" not in props["missing"]:
        texts["flow"] = f"Traffic flows at {round(props['traffic_flow'] * 100)}% of free-flow speed"
    return texts


def add_scores(props):
    """confidence, eligible, score, reason_texts (rank is set over all segments)."""
    c = min(1.0, props["n_points"] / CONFIDENCE_N)
    props["confidence"] = round(c, 3)
    props["eligible"] = props["n_points"] >= MIN_POINTS
    weighted = sum(DEFAULT_WEIGHTS[k] * props[f"f_{k}"] for k in FACTORS)
    props["score"] = round(100 * c * weighted, 1) if props["eligible"] else None
    props["rank"] = None
    props["reason_texts"] = reason_texts(props)


def add_ranks(all_props):
    """Eligible by score descending; ties by n_points descending, then id."""
    eligible = sorted((p for p in all_props if p["eligible"]),
                      key=lambda p: (-p["score"], -p["n_points"], p["id"]))
    for rank, props in enumerate(eligible, start=1):
        props["rank"] = rank
    return len(eligible)


def write_geojson(path, features):
    # One feature per line keeps git diffs readable.
    lines = ",\n".join(json.dumps(f, ensure_ascii=False) for f in features)
    path.write_text('{"type": "FeatureCollection", "features": [\n' + lines + "\n]}\n")


def main():
    rng = Random(SEED)
    rows = [make_raw(rng, i) for i in range(1, N_SEGMENTS + 1)] + edge_cases()

    danger_p95 = round(p95([r["danger_per_100m"] for _, r in rows if r["danger_per_100m"] is not None]), 2)
    for _, raw in rows:
        add_factors(raw, danger_p95)
        add_scores(raw)
    n_eligible = add_ranks([raw for _, raw in rows])

    features = [{"type": "Feature",
                 "geometry": {"type": "LineString", "coordinates": coords},
                 "properties": raw} for coords, raw in rows]
    meta = {
        "version": "1.0",
        "source": "mock",
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "city": "heilbronn",
        "n_segments": len(features),
        "n_eligible": n_eligible,
        "min_points": MIN_POINTS,
        "confidence_n": CONFIDENCE_N,
        "danger_p95": danger_p95,
        "default_weights": DEFAULT_WEIGHTS,
        "bbox": BBOX,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_geojson(OUT_DIR / "segments.geojson", features)
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
    print(f"Wrote {len(features)} segments ({n_eligible} eligible, danger_p95 {danger_p95}) to {OUT_DIR}")

    validator = Draft202012Validator(json.loads(SCHEMA_PATH.read_text()))
    for feature in features:
        error = next(validator.iter_errors(feature["properties"]), None)
        if error is not None:
            path = "/".join(str(p) for p in error.absolute_path) or "(root)"
            print(f"INVALID {feature['properties']['id']} at {path}: {error.message}")
            sys.exit(1)
    print(f"OK: {len(features)} features valid")


if __name__ == "__main__":
    main()
