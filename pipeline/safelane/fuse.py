"""One row per segment, raw metrics + f_* factors."""

import ast
import math
from pathlib import Path

import geopandas as gpd
import pandas as pd

from safelane import config, export, osm
from safelane.json_io import read_source_json

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
FACTORS = ("safety", "danger", "surface", "air", "flow")
N_BINS = 5  # overtaking histogram: 0-50, 50-100, 100-150, 150-200, >200 cm
N_BELOW_150 = 3

# Base geometry: --base value -> (config.COLLECTIONS key, column holding the road_network
# row index; None = the row position itself).
BASES = {
    "road_network": ("road_network", None),
    "bumpy_roads": ("roughness", "id"),
}

# Line layers: column holding the road_network row index, column to weight averages by.
# Every line layer in INSPECT.md is a per-road_network-edge aggregate, so the index join
# is exact; lines whose geometry disagrees fall back to nearest-midpoint matching.
LINE_LAYERS = {
    "overtaking": ("id", "Number of Points"),
    "roughness": ("id", "Number of Boxes"),
    "traffic_flow": ("road_segment", "points_in_segment"),
    "speed": ("road_segment", "points_in_segment"),
}
# Columns that identify one measurement row of a line layer: a row repeated on both
# directions of a two-way street is the same measurement (see _merge_twins).
LINE_VALUES = {
    "overtaking": ("Overtaking Distance Counts", "Average Overtaking Distance cm", "Number of Points"),
    "roughness": ("Normalized Roughness", "Number of Boxes"),
    "traffic_flow": ("avg_traffic_flow", "points_in_segment"),
    "speed": ("avg_speed[km/h]", "points_in_segment"),
}
POINT_LAYERS = {
    "danger": "Risk Index Overtaking",
    "danger_pm": "Risk Index",
}
# n_points = max of these measurement counts on a segment.
POINT_COUNT_FIELDS = {
    "overtaking": "Number of Points",
    "traffic_flow": "points_in_segment",
    "speed": "points_in_segment",
}


def parse_list(value):
    """[1, 2] / "[1, 2]" / "1, 2" -> list; a scalar -> [scalar]; None/NaN -> []."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return []
    if isinstance(value, (list, tuple)):
        return list(value)
    text = str(value).strip()
    if not text:
        return []
    try:
        parsed = ast.literal_eval(text)
    except (ValueError, SyntaxError):
        return [text]
    return list(parsed) if isinstance(parsed, (list, tuple)) else [text]


def parse_histogram(value):
    """'0, 4, 7, 0, 0' (or a list) -> [0, 4, 7, 0, 0]; missing -> all zeros."""
    bins = [int(v) for v in parse_list(value)]
    if not bins:
        return [0] * N_BINS
    if len(bins) != N_BINS:
        raise ValueError(f"expected {N_BINS} overtaking bins, got {value!r}")
    return bins


def share_below_150(hist):
    total = sum(hist)
    return sum(hist[:N_BELOW_150]) / total if total else None


def pass_severity(hist):
    """Mean closeness of the passes, 0-1: SEVERITY_WEIGHTS per bin, so 40 cm counts more than 140 cm."""
    total = sum(hist)
    return sum(n * w for n, w in zip(hist, config.SEVERITY_WEIGHTS)) / total if total else None


def shrink(value, n, prior, k=config.SAFETY_PRIOR_K):
    """(n * value + k * prior) / (n + k): one close pass alone no longer means f_safety = 1."""
    return (n * value + k * prior) / (n + k)


def passes_excluded(m, car_free=False):
    """Why close passes and danger points on this segment do not count (CONTRACT 3.2), or None."""
    if car_free:
        return "car_free"
    if not m["n_overtakes"] and not m["danger_per_100m"]:
        return None  # nothing to exclude
    speed = m["avg_speed_kmh"]
    if speed is not None and speed < config.STATIONARY_SPEED_KMH:
        return "stationary"
    if m["length_m"] < config.MIN_PASS_LENGTH_M:
        return "short"
    if m["n_overtakes"] < config.MIN_OVERTAKES:
        return "few_overtakes"
    return None


def factors(m, danger_p95, city_severity):
    """CONTRACT 3.2 factor rules: ({f_key: 0-1}, [keys with no data])."""
    counted = m.get("passes_excluded") is None
    severity = m["pass_severity"] if counted else None
    dp = m["danger_per_100m"] if counted else None
    flow = m["traffic_flow"]
    raw = {
        "safety": None if severity is None else shrink(severity, m["n_overtakes"], city_severity),
        "danger": None if dp is None else (min(1.0, dp / danger_p95) if danger_p95 else 0.0),
        "surface": m["roughness_norm"],
        "air": m["mean_pm_risk"],
        "flow": None if flow is None else 1 - flow,
    }
    missing = [k for k in FACTORS if raw[k] is None]
    return {f"f_{k}": 0.0 if v is None else float(v) for k, v in raw.items()}, missing


def _load(key):
    path = RAW_DIR / f"{config.COLLECTIONS[key]}.geojson"
    read_source_json(path)  # Also migrate legacy caches when running --fuse alone.
    return gpd.read_file(path, encoding="utf-8").to_crs(config.METRIC_CRS)


def _nearest(geoms, base, max_distance):
    """Base row per geometry within max_distance (first one on ties)."""
    hit = gpd.sjoin_nearest(gpd.GeoDataFrame(geometry=geoms), base[["geometry"]], max_distance=max_distance)
    return hit.loc[~hit.index.duplicated(), "index_right"]


def _match_lines(layer, base, key):
    """Base row per layer row (NaN = unmatched): index join checked by midpoint distance, else nearest."""
    mid = layer.geometry.interpolate(0.5, normalized=True)
    seg = layer[key].map(pd.Series(base.index, index=base["road"])).astype(float)
    has = seg.notna()
    target = gpd.GeoSeries(base.geometry.loc[seg[has].astype(int)].values, index=seg[has].index, crs=base.crs)
    far = mid[has].distance(target) > config.LINE_MATCH_DISTANCE_M
    seg[far[far].index] = float("nan")
    todo = seg.isna()
    if todo.any():
        seg.update(_nearest(mid[todo], base, config.LINE_MATCH_DISTANCE_M).astype(float))
    return seg


def path_name(street, highway=None):
    """Name for an unnamed segment near street; a driveway or parking aisle is not a path."""
    return f"Service road off {street}" if highway == "service" else f"Path along {street}"


def _fill_names(names, base, highway):
    """Unnamed segments (OSM footways, cycleways, service roads) take the nearest named street within
    NAME_FALLBACK_M."""
    named = names.notna()
    todo = ~named
    if not todo.any() or not named.any():
        return names
    hit = _nearest(base.geometry[todo], base[named], config.NAME_FALLBACK_M)
    fallback = pd.Series([path_name(names[j], highway[i]) for i, j in hit.items()], index=hit.index, dtype=object)
    return names.where(named, fallback)


def _undirected(base):
    """Base row -> representative row (lowest index) of its undirected edge.

    road_network is a directed OSMnx graph: a two-way street is two rows (u, v, key) and
    (v, u, key) with the same geometry. Measurements on either direction belong to one street.
    """
    if "index" not in base:
        return pd.Series(base.index, index=base.index)
    edge = base["index"].map(lambda v: (lambda u, w, k: (min(u, w), max(u, w), k))(*parse_list(v)))
    return pd.Series(base.index, index=base.index).groupby(edge).transform("min")


def _merge_twins(layer, canon, value_cols):
    """Map seg to its undirected edge; a measurement row repeated on both directions counts once."""
    layer = layer.assign(seg=layer["seg"].map(canon))
    return layer.drop_duplicates(subset=["seg", *value_cols])


def _wavg(df, col, weight):
    d = df.dropna(subset=[col])
    w = d[weight].clip(lower=1)
    return (d[col] * w).groupby(d["seg"]).sum() / w.groupby(d["seg"]).sum()


def _round(v, nd):
    return None if v is None or pd.isna(v) else round(float(v), nd)


def _str(v):
    # pandas string columns turn None into NaN
    return None if v is None or pd.isna(v) else str(v)


def first_highway(osm_ids, payload):
    """OSM highway of each segment's first way found by id; None without the OSM cache or a match."""
    if payload is None:
        return pd.Series(None, index=osm_ids.index, dtype=object)
    highways = {str(el["id"]): (el.get("tags") or {}).get("highway")
                for el in payload.get("elements", []) if el.get("type") == "way"}
    return osm_ids.map(lambda v: next((highways[i] for i in str(v).split(",") if i in highways), None)
                       if v is not None else None)


def build(base_name="road_network"):
    """Return (base GeoDataFrame, metrics DataFrame on the base index, match report rows, twin count,
    car-free data dropped).

    Only representative rows of an undirected edge get data; their twins end with n_points 0.
    """
    base_key, road_col = BASES[base_name]
    base = _load(base_key).reset_index(drop=True)
    base["road"] = base.index if road_col is None else base[road_col].astype(int)
    canon = _undirected(base)
    n_twins = int((canon != canon.index).sum())

    m = pd.DataFrame(index=base.index)
    m["id"] = [f"seg_{i:06d}" for i in base.index]
    m["osm_id"] = base["osmid"].map(lambda v: ",".join(str(x) for x in parse_list(v)) or None)
    names = base["name"].map(lambda v: next((str(x) for x in parse_list(v)), None)).astype(object)
    highway = first_highway(m["osm_id"], osm.load_cached())
    m["name"] = _fill_names(names, base, highway)
    m["length_m"] = base.length

    # CONTRACT 3.2 (v1.2): no car overtakes a rider on a car-free way, so drop that sensor data.
    no_cars = highway.isin(config.CAR_FREE_HIGHWAYS)
    dropped = {}

    report, lines = [], {}
    for key, (col, _) in LINE_LAYERS.items():
        g = _load(key)
        g["seg"] = _match_lines(g, base, col)
        report.append((key, len(g), int(g["seg"].notna().sum())))
        lines[key] = _merge_twins(g.dropna(subset=["seg"]), canon, LINE_VALUES[key]).astype({"seg": int})

    m["car_free"] = no_cars
    o = lines["overtaking"]
    on_path = no_cars.loc[o["seg"]].to_numpy()
    dropped["overtaking"] = {
        "lines": int(on_path.sum()),
        "overtakes": int(o.loc[on_path, "Overtaking Distance Counts"].map(lambda v: sum(parse_histogram(v))).sum()),
    }
    o = lines["overtaking"] = o[~on_path]
    bins = pd.DataFrame(o["Overtaking Distance Counts"].map(parse_histogram).tolist(), index=o.index)
    bins = bins.groupby(o["seg"]).sum()
    total = bins.sum(axis=1)
    m["n_overtakes"] = total.reindex(m.index, fill_value=0).astype(int)
    m["share_below_150"] = bins.iloc[:, :N_BELOW_150].sum(axis=1) / total.where(total > 0)
    m["pass_severity"] = (bins * config.SEVERITY_WEIGHTS).sum(axis=1) / total.where(total > 0)
    m["avg_overtake_cm"] = _wavg(o, "Average Overtaking Distance cm", "Number of Points")
    m["roughness_norm"] = (_wavg(lines["roughness"], "Normalized Roughness", "Number of Boxes") / 100).clip(0, 1)
    m["traffic_flow"] = _wavg(lines["traffic_flow"], "avg_traffic_flow", "points_in_segment")
    m["avg_speed_kmh"] = _wavg(lines["speed"], "avg_speed[km/h]", "points_in_segment")

    counts = [lines[k].groupby("seg")[f].sum() for k, f in POINT_COUNT_FIELDS.items()]
    m["n_points"] = pd.concat(counts, axis=1).max(axis=1).reindex(m.index, fill_value=0).astype(int)

    points = {}
    for key, col in POINT_LAYERS.items():
        g = _load(key)
        seg = _nearest(g.geometry, base, config.MATCH_DISTANCE_M).map(canon)
        report.append((key, len(g), len(seg)))
        if key == "danger":  # from the overtaking sensor, like the passes; fine dust stays
            on_path = no_cars.loc[seg].to_numpy()
            dropped["danger"] = {"points": int(on_path.sum())}
            seg = seg[~on_path]
        points[key] = g.loc[seg.index, col].groupby(seg).agg(["size", "mean"])

    # Danger points come from the overtaking sensor: no points on a segment it measured
    # means 0 danger, no points on a segment it never measured means unknown.
    n_danger = points["danger"]["size"].reindex(m.index, fill_value=0)
    measured = n_danger.gt(0) | m.index.isin(o["seg"])
    # Floor the length so one point on a 12 m stub is not "80 per 100 m".
    m["danger_per_100m"] = (n_danger / m["length_m"].clip(lower=config.DANGER_MIN_LENGTH_M) * 100).where(measured)
    m["mean_danger_risk"] = points["danger"]["mean"]
    m["mean_pm_risk"] = points["danger_pm"]["mean"]
    return base, m, report, n_twins, dropped


def to_features(m):
    """Contract properties per row (rounded; factors computed from the rounded metrics), danger_p95,
    city_share, city_severity."""
    rows = []
    for r in m.itertuples():
        rows.append({
            "id": r.id,
            "osm_id": _str(r.osm_id),
            "name": _str(r.name),
            "length_m": round(float(r.length_m), 1),
            "n_points": int(r.n_points),
            "n_overtakes": int(r.n_overtakes),
            "share_below_150": _round(r.share_below_150, 4),
            "pass_severity": _round(r.pass_severity, 4),
            "avg_overtake_cm": _round(r.avg_overtake_cm, 1),
            "danger_per_100m": _round(r.danger_per_100m, 3),
            "mean_danger_risk": _round(r.mean_danger_risk, 4),
            "mean_pm_risk": _round(r.mean_pm_risk, 4),
            "roughness_norm": _round(r.roughness_norm, 4),
            "traffic_flow": _round(r.traffic_flow, 4),
            "avg_speed_kmh": _round(r.avg_speed_kmh, 2),
        })
        rows[-1]["passes_excluded"] = passes_excluded(rows[-1], car_free=bool(r.car_free))
    # f_danger and the f_safety prior are relative to the segments whose passes count.
    counted = [p for p in rows if p["passes_excluded"] is None and p["n_overtakes"]]
    positive = [p["danger_per_100m"] for p in counted if p["danger_per_100m"]]
    danger_p95 = round(float(pd.Series(positive).quantile(0.95)), 3) if positive else 0.0
    n_total = sum(p["n_overtakes"] for p in rows if p["share_below_150"] is not None)
    n_below = sum(round(p["share_below_150"] * p["n_overtakes"]) for p in rows if p["share_below_150"] is not None)
    city_share = round(n_below / n_total, 4) if n_total else 0.0
    n_counted = sum(p["n_overtakes"] for p in counted)
    city_severity = (round(sum(p["n_overtakes"] * p["pass_severity"] for p in counted) / n_counted, 4)
                     if n_counted else 0.0)
    for p in rows:
        f, missing = factors(p, danger_p95, city_severity)
        p.update({k: round(v, 4) for k, v in f.items()})
        p.update({"missing": missing, "confidence": 0.0, "eligible": False,
                  "score": None, "rank": None, "reason_texts": {}})
    return rows, danger_p95, city_share, city_severity


OSM_FIELDS = ("highway", "maxspeed_kmh", "lanes", "infra_class")


def _plain_or_none(v):
    if v is None or pd.isna(v):
        return None
    return int(v) if isinstance(v, float) and v.is_integer() else (v.item() if hasattr(v, "item") else v)


def add_osm(geometry, rows, allow_missing=False):
    """CONTRACT 3.2b: OSM fields on rows (in place) from data/raw/osm_overpass.json.

    Returns (meta additions, stats report). Without the cache it raises, unless allow_missing:
    then the fields stay null and a warning is printed.
    """
    payload = osm.load_cached()
    if payload is None:
        hint = "Run `python -m safelane.osm` (or `python run.py --ingest`) first."
        if not allow_missing:
            raise FileNotFoundError(f"data/raw/osm_overpass.json missing. {hint}")
        print(f"\nWARNING: data/raw/osm_overpass.json missing; OSM fields stay null. {hint}")
        for p in rows:
            p.update(dict.fromkeys(OSM_FIELDS))
        return {"osm_fetched_at": None, "attribution": osm.ATTRIBUTION}, None
    ways = osm.ways_frame(payload)
    ids = pd.Series([p["osm_id"] for p in rows], index=geometry.index)
    joined, report = osm.join(geometry, ids, ways)
    for p, (_, o) in zip(rows, joined.iterrows()):
        p.update({k: _plain_or_none(o[k]) for k in OSM_FIELDS})
    osm.print_report(report)
    return {"osm_fetched_at": osm.osm_timestamp(payload), "attribution": osm.ATTRIBUTION}, report


def _print_reports(m, kept, report, n_twins):
    print(f"\n{'layer':<13} {'features':>8} {'matched':>8} {'%':>6}")
    for key, n, matched in report:
        print(f"{key:<13} {n:>8} {matched:>8} {100 * matched / n if n else 0:>5.1f}%")
    n = m["n_points"]
    print(f"\nsegments: {len(m)} in base, {n_twins} twin directions merged, {kept} kept (n_points >= 1)")
    for t in (1, 5, 10, 30):
        print(f"  n_points >= {t:<2}: {int((n >= t).sum())}")
    print(f"  median n_points (kept): {n[n >= 1].median():g}")


def run(base="road_network", allow_missing_osm=False):
    print(f"fuse (base: {base})")
    base_gdf, m, report, n_twins, dropped = build(base)
    keep = m["n_points"] >= 1
    rows, danger_p95, city_share, city_severity = to_features(m[keep])
    _print_reports(m, len(rows), report, n_twins)
    # After the factors, before scoring; the score does not use these fields.
    osm_meta, osm_report = add_osm(base_gdf.geometry[keep], rows, allow_missing=allow_missing_osm)

    overtaking = next(r for r in report if r[0] == "overtaking")
    if base == "road_network" and overtaking[2] < 0.5 * overtaking[1]:
        print("\nWARNING: < 50% of overtaking lines matched; try `python run.py --fuse --base bumpy_roads`")
    excluded = {}
    for p in rows:
        if p["passes_excluded"]:
            excluded[p["passes_excluded"]] = excluded.get(p["passes_excluded"], 0) + 1
    n_counted = sum(1 for p in rows if p["passes_excluded"] is None and p["n_overtakes"])
    print(f"car-free ways: dropped {dropped['overtaking']['overtakes']} overtakes "
          f"({dropped['overtaking']['lines']} lines) and {dropped['danger']['points']} danger points")
    print(f"passes counted on {n_counted} segments; not counted: {excluded}")
    print(f"danger_p95: {danger_p95}, city_share_below_150: {city_share}, city_pass_severity: {city_severity}")
    stats = {
        "n_base_edges": len(m),
        "n_twins_merged": n_twins,
        "match": {key: {"features": n, "matched": hit, "share": round(hit / n, 4) if n else 0.0}
                  for key, n, hit in report},
        "osm": osm_report,
        "car_free_dropped": dropped,
        "passes_counted": n_counted,
        "passes_excluded": excluded,
    }
    export.write(base_gdf.geometry[keep], rows, danger_p95, city_share, stats,
                 meta_extra={**osm_meta, "city_pass_severity": city_severity})
