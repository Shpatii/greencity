"""P1: one row per segment, raw metrics + f_* factors."""

import ast
import math
from pathlib import Path

import geopandas as gpd
import pandas as pd

from safelane import config, export

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


def factors(m, danger_p95):
    """CONTRACT 3.2 factor rules: ({f_key: 0-1}, [keys with no data])."""
    dp, flow = m["danger_per_100m"], m["traffic_flow"]
    raw = {
        "safety": m["share_below_150"],
        "danger": None if dp is None else (min(1.0, dp / danger_p95) if danger_p95 else 0.0),
        "surface": m["roughness_norm"],
        "air": m["mean_pm_risk"],
        "flow": None if flow is None else 1 - flow,
    }
    missing = [k for k in FACTORS if raw[k] is None]
    return {f"f_{k}": 0.0 if v is None else float(v) for k, v in raw.items()}, missing


def _load(key):
    return gpd.read_file(RAW_DIR / f"{config.COLLECTIONS[key]}.geojson").to_crs(config.METRIC_CRS)


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


def path_name(street):
    return f"Path along {street}"


def _fill_names(names, base):
    """Unnamed segments (OSM footways, cycleways) take the nearest named street within NAME_FALLBACK_M."""
    named = names.notna()
    todo = ~named
    if not todo.any() or not named.any():
        return names
    hit = _nearest(base.geometry[todo], base[named], config.NAME_FALLBACK_M)
    return names.where(named, hit.map(names).map(path_name))


def _wavg(df, col, weight):
    d = df.dropna(subset=[col])
    w = d[weight].clip(lower=1)
    return (d[col] * w).groupby(d["seg"]).sum() / w.groupby(d["seg"]).sum()


def _round(v, nd):
    return None if v is None or pd.isna(v) else round(float(v), nd)


def _str(v):
    # pandas string columns turn None into NaN
    return None if v is None or pd.isna(v) else str(v)


def build(base_name="road_network"):
    """Return (base GeoDataFrame, metrics DataFrame on the base index, match report rows)."""
    base_key, road_col = BASES[base_name]
    base = _load(base_key).reset_index(drop=True)
    base["road"] = base.index if road_col is None else base[road_col].astype(int)

    m = pd.DataFrame(index=base.index)
    m["id"] = [f"seg_{i:06d}" for i in base.index]
    m["osm_id"] = base["osmid"].map(lambda v: ",".join(str(x) for x in parse_list(v)) or None)
    names = base["name"].map(lambda v: next((str(x) for x in parse_list(v)), None)).astype(object)
    m["name"] = _fill_names(names, base)
    m["length_m"] = base.length

    report, lines = [], {}
    for key, (col, _) in LINE_LAYERS.items():
        g = _load(key)
        g["seg"] = _match_lines(g, base, col)
        report.append((key, len(g), int(g["seg"].notna().sum())))
        lines[key] = g.dropna(subset=["seg"]).astype({"seg": int})

    o = lines["overtaking"]
    bins = pd.DataFrame(o["Overtaking Distance Counts"].map(parse_histogram).tolist(), index=o.index)
    bins = bins.groupby(o["seg"]).sum()
    total = bins.sum(axis=1)
    m["n_overtakes"] = total.reindex(m.index, fill_value=0).astype(int)
    m["share_below_150"] = bins.iloc[:, :N_BELOW_150].sum(axis=1) / total.where(total > 0)
    m["avg_overtake_cm"] = _wavg(o, "Average Overtaking Distance cm", "Number of Points")
    m["roughness_norm"] = (_wavg(lines["roughness"], "Normalized Roughness", "Number of Boxes") / 100).clip(0, 1)
    m["traffic_flow"] = _wavg(lines["traffic_flow"], "avg_traffic_flow", "points_in_segment")
    m["avg_speed_kmh"] = _wavg(lines["speed"], "avg_speed[km/h]", "points_in_segment")

    counts = [lines[k].groupby("seg")[f].sum() for k, f in POINT_COUNT_FIELDS.items()]
    m["n_points"] = pd.concat(counts, axis=1).max(axis=1).reindex(m.index, fill_value=0).astype(int)

    points = {}
    for key, col in POINT_LAYERS.items():
        g = _load(key)
        seg = _nearest(g.geometry, base, config.MATCH_DISTANCE_M)
        report.append((key, len(g), len(seg)))
        points[key] = g.loc[seg.index, col].groupby(seg).agg(["size", "mean"])

    # Danger points come from the overtaking sensor: no points on a segment it measured
    # means 0 danger, no points on a segment it never measured means unknown.
    n_danger = points["danger"]["size"].reindex(m.index, fill_value=0)
    measured = n_danger.gt(0) | m.index.isin(o["seg"])
    m["danger_per_100m"] = (n_danger / m["length_m"] * 100).where(measured)
    m["mean_danger_risk"] = points["danger"]["mean"]
    m["mean_pm_risk"] = points["danger_pm"]["mean"]
    return base, m, report


def to_features(m):
    """Contract properties per row (rounded; factors computed from the rounded metrics) and danger_p95."""
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
            "avg_overtake_cm": _round(r.avg_overtake_cm, 1),
            "danger_per_100m": _round(r.danger_per_100m, 3),
            "mean_danger_risk": _round(r.mean_danger_risk, 4),
            "mean_pm_risk": _round(r.mean_pm_risk, 4),
            "roughness_norm": _round(r.roughness_norm, 4),
            "traffic_flow": _round(r.traffic_flow, 4),
            "avg_speed_kmh": _round(r.avg_speed_kmh, 2),
        })
    positive = [p["danger_per_100m"] for p in rows if p["danger_per_100m"]]
    danger_p95 = round(float(pd.Series(positive).quantile(0.95)), 3) if positive else 0.0
    for p in rows:
        f, missing = factors(p, danger_p95)
        p.update({k: round(v, 4) for k, v in f.items()})
        p.update({"missing": missing, "confidence": 0.0, "eligible": False,
                  "score": None, "rank": None, "reason_texts": {}})
    return rows, danger_p95


def _print_reports(m, kept, report):
    print(f"\n{'layer':<13} {'features':>8} {'matched':>8} {'%':>6}")
    for key, n, matched in report:
        print(f"{key:<13} {n:>8} {matched:>8} {100 * matched / n if n else 0:>5.1f}%")
    n = m["n_points"]
    print(f"\nsegments: {len(m)} in base, {kept} kept (n_points >= 1)")
    for t in (1, 5, 10, 30):
        print(f"  n_points >= {t:<2}: {int((n >= t).sum())}")
    print(f"  median n_points (kept): {n[n >= 1].median():g}")


def run(base="road_network"):
    print(f"fuse (base: {base})")
    base_gdf, m, report = build(base)
    keep = m["n_points"] >= 1
    rows, danger_p95 = to_features(m[keep])
    _print_reports(m, len(rows), report)

    overtaking = next(r for r in report if r[0] == "overtaking")
    if base == "road_network" and overtaking[2] < 0.5 * overtaking[1]:
        print("\nWARNING: < 50% of overtaking lines matched; try `python run.py --fuse --base bumpy_roads`")
    print(f"danger_p95: {danger_p95}")
    export.write(base_gdf.geometry[keep], rows, danger_p95)
