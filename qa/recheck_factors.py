"""QA A5 + A7: recompute factors independently from data/raw/.

    python qa/recheck_factors.py [--seed 42] [--json qa/logs/a5_factors.json]

Does NOT import safelane (no score, no fuse). Re-implements the joins from the
contract + raw data docs:
  * overtaking / traffic_flow lines -> base segment by their index column
    (overtaking.id, traffic_flow.road_segment = road_network row), accepted when the
    line midpoint is within 10 m of that segment, else nearest segment within 10 m
  * danger points -> nearest segment within 20 m
  * contract 1.1: both directions of a two-way edge ((u, v, k) and (v, u, k) in
    road_network.index) are one segment with the lower row's id; a measurement row
    repeated on both directions counts once
  * contract 1.2: overtaking lines and danger points on a segment whose first OSM way
    (data/raw/osm_overpass.json, by id) is a car-free highway are dropped
Checks 20 random eligible segments + the top 10:
  share_below_150 = (bins 0-50 + 50-100 + 100-150) / total
  pass_severity   = sum(bins * severity_weights) / total
  avg_speed_kmh   = speed layer, weighted by points_in_segment (min weight 1)
  passes_excluded = car_free | stationary (speed) | short (length) | few_overtakes, first match
  f_safety        = (n * pass_severity + k * city_pass_severity) / (n + k), only where passes count
  f_flow          = 1 - traffic_flow   (weighted by points_in_segment, min weight 1)
  danger_per_100m = danger points * 100 / max(length, danger_min_length_m)
  f_danger        = min(1, danger_per_100m / danger_p95), only where passes count
and, for ALL features, that every key in `missing` has factor 0 and that meta.danger_p95 and
meta.city_pass_severity follow from the published segments.

Stored values are rounded (share/flow 4 dp, danger_per_100m 3 dp, factors 4 dp),
so two diffs are reported: raw (unrounded recompute vs stored) and after applying
the same documented rounding. The 1e-6 tolerance is judged on the rounded diff.
"""
import argparse
import ast
import json
import random
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "out"
CRS = "EPSG:25832"
LINE_MATCH_M = 10
POINT_MATCH_M = 20
TOL = 1e-6


def load(name):
    return gpd.read_file(RAW / f"{name}.geojson").to_crs(CRS)


def match_lines(layer, base, col):
    """Base row per layer row (NaN = unmatched)."""
    mid = layer.geometry.interpolate(0.5, normalized=True)
    seg = layer[col].astype(float).where(layer[col].astype(float).between(0, len(base) - 1))
    has = seg.notna()
    tgt = gpd.GeoSeries(base.geometry.iloc[seg[has].astype(int)].values, index=seg[has].index, crs=CRS)
    far = mid[has].distance(tgt) > LINE_MATCH_M
    seg[far[far].index] = np.nan
    n_by_index = int(seg.notna().sum())
    todo = seg.isna()
    if todo.any():
        hit = gpd.sjoin_nearest(gpd.GeoDataFrame(geometry=mid[todo]), base[["geometry"]],
                                max_distance=LINE_MATCH_M)
        hit = hit[~hit.index.duplicated()]
        seg.loc[hit.index] = hit["index_right"].astype(float)
    return seg, n_by_index


def undirected(base):
    """road_network row -> lowest row of the same undirected edge."""
    key = base["index"].map(lambda v: (lambda u, w, k: (min(u, w), max(u, w), k))(*ast.literal_eval(v)))
    return pd.Series(base.index, index=base.index).groupby(key).transform("min")


def merge(layer, canon, cols):
    layer = layer.dropna(subset=["seg"]).copy()
    layer["seg"] = layer["seg"].astype(int).map(canon)
    return layer.drop_duplicates(subset=["seg", *cols])


def hist(value):
    bins = [int(x) for x in str(value).strip("[]() ").split(",") if x.strip()]
    return bins if len(bins) == 5 else [0] * 5


def car_free_rows(base, highways):
    """road_network row -> True when its first OSM way found by id is car-free."""
    known = load_osm_highways()
    def first(v):
        ids = [str(x) for x in (ast.literal_eval(v) if str(v).startswith("[") else [v])]
        return next((known[i] for i in ids if i in known), None)
    return base["osmid"].map(first).isin(highways)


def load_osm_highways():
    payload = json.loads((RAW / "osm_overpass.json").read_text(encoding="utf-8"))
    return {str(el["id"]): (el.get("tags") or {}).get("highway")
            for el in payload.get("elements", []) if el.get("type") == "way"}


def wavg(layer, base, canon, col, weight="points_in_segment"):
    layer = layer.copy()
    layer["seg"], _ = match_lines(layer, base, "road_segment")
    m = merge(layer, canon, [col, weight]).dropna(subset=[col])
    w = m[weight].clip(lower=1)
    return (m[col] * w).groupby(m["seg"]).sum() / w.groupby(m["seg"]).sum()


def excluded(car_free, n_ovt, dpm, speed, length, meta):
    if car_free:
        return "car_free"
    if not n_ovt and not dpm:
        return None
    if speed is not None and speed < meta["stationary_speed_kmh"]:
        return "stationary"
    if length < meta["min_pass_length_m"]:
        return "short"
    if n_ovt < meta["min_overtakes"]:
        return "few_overtakes"
    return None


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--json", default=str(ROOT / "qa" / "logs" / "a5_factors.json"))
    args = ap.parse_args(argv)

    meta = json.loads((OUT / "meta.json").read_text(encoding="utf-8"))
    feats = json.loads((OUT / "segments.geojson").read_text(encoding="utf-8"))["features"]
    props = {f["properties"]["id"]: f["properties"] for f in feats}

    base = load("road_network_heilbronn").reset_index(drop=True)
    canon = undirected(base)
    seg_length = base.length
    length = seg_length.clip(lower=meta["danger_min_length_m"])
    k, city_severity = meta["safety_prior_k"], meta["city_pass_severity"]
    no_cars = car_free_rows(base, set(meta["car_free_highways"]))

    # overtaking (lines on car-free segments dropped)
    ov = load("overtaking_distance_heilbronn")
    ov["seg"], ov_by_index = match_lines(ov, base, "id")
    ov_matched = int(ov["seg"].notna().sum())
    ovm = merge(ov, canon, ["Overtaking Distance Counts", "Average Overtaking Distance cm", "Number of Points"])
    ovm = ovm[~no_cars.loc[ovm["seg"]].to_numpy()]
    bins = pd.DataFrame(ovm["Overtaking Distance Counts"].map(hist).tolist(), index=ovm.index)
    bins = bins.groupby(ovm["seg"]).sum()
    tot = bins.sum(axis=1)
    share = (bins[[0, 1, 2]].sum(axis=1) / tot.where(tot > 0))
    severity = (bins * meta["severity_weights"]).sum(axis=1) / tot.where(tot > 0)

    flow = wavg(load("traffic_flow_heilbronn"), base, canon, "avg_traffic_flow")
    speed = wavg(load("speed_map_heilbronn"), base, canon, "avg_speed[km/h]")

    # danger points (on car-free segments dropped)
    dz = load("danger_zones_heilbronn")
    hit = gpd.sjoin_nearest(dz[["geometry"]], base[["geometry"]], max_distance=POINT_MATCH_M)
    hit = hit[~hit.index.duplicated()]
    seg_of_point = hit["index_right"].map(canon)
    n_danger = seg_of_point[~no_cars.loc[seg_of_point].to_numpy()].value_counts()
    p95 = meta["danger_p95"]

    eligible_ids = sorted(i for i, p in props.items() if p["eligible"])
    top10 = [p["id"] for p in sorted((p for p in props.values() if p["rank"]), key=lambda p: p["rank"])[:10]]
    rng = random.Random(args.seed)
    sample = rng.sample([i for i in eligible_ids if i not in top10], 20) + top10

    fields = ("share_below_150", "pass_severity", "avg_speed_kmh", "f_safety", "traffic_flow", "f_flow",
              "danger_per_100m", "f_danger")
    diffs = {f: {"raw": 0.0, "rounded": 0.0, "worst_id": None} for f in fields}
    null_mismatch = []
    excluded_mismatch = []
    rows = []

    def cmp(field, sid, mine, stored, nd):
        if (mine is None) != (stored is None):
            null_mismatch.append((sid, field, mine, stored))
            return
        if mine is None:
            return
        raw = abs(mine - stored)
        rnd = abs(round(mine, nd) - stored)
        d = diffs[field]
        d["raw"] = max(d["raw"], raw)
        if rnd > d["rounded"]:
            d["rounded"], d["worst_id"] = rnd, sid

    for sid in sample:
        p = props[sid]
        i = int(sid.split("_")[1])
        s = share.get(i)
        s = None if s is None or pd.isna(s) else float(s)
        tfv = flow.get(i)
        tfv = None if tfv is None or pd.isna(tfv) else float(tfv)
        nd = int(n_danger.get(i, 0))
        measured = nd > 0 or i in set(ovm["seg"])
        dpm = nd / float(length.iloc[i]) * 100 if measured else None

        sev = severity.get(i)
        sev = None if sev is None or pd.isna(sev) else float(sev)
        spd = speed.get(i)
        spd = None if spd is None or pd.isna(spd) else float(spd)
        n_ovt = int(tot.get(i, 0))
        why = excluded(bool(no_cars.iloc[i]), n_ovt, None if dpm is None else round(dpm, 3),
                       None if spd is None else round(spd, 2), round(float(seg_length.iloc[i]), 1), meta)
        if why != p.get("passes_excluded"):
            excluded_mismatch.append((sid, why, p.get("passes_excluded")))
        counted = why is None

        cmp("share_below_150", sid, s, p["share_below_150"], 4)
        cmp("pass_severity", sid, sev, p["pass_severity"], 4)
        cmp("avg_speed_kmh", sid, spd, p["avg_speed_kmh"], 2)
        f_saf = (n_ovt * round(sev, 4) + k * city_severity) / (n_ovt + k) if counted and sev is not None else None
        cmp("f_safety", sid, f_saf, p["f_safety"] if "safety" not in p["missing"] else None, 4)
        cmp("traffic_flow", sid, tfv, p["traffic_flow"], 4)
        # factor rule applied to the stored (rounded) metric, as the contract defines f from the metric
        cmp("f_flow", sid, None if tfv is None else 1 - round(tfv, 4),
            p["f_flow"] if tfv is not None else None, 4)
        cmp("danger_per_100m", sid, dpm, p["danger_per_100m"], 3)
        cmp("f_danger", sid, min(1.0, round(dpm, 3) / p95) if counted and dpm is not None else None,
            p["f_danger"] if "danger" not in p["missing"] else None, 4)
        rows.append({"id": sid, "rank": p["rank"], "share_mine": s, "share_stored": p["share_below_150"],
                     "flow_mine": tfv, "flow_stored": p["traffic_flow"],
                     "dpm_mine": dpm, "dpm_stored": p["danger_per_100m"]})

    missing_bad = [(p["id"], k, p[f"f_{k}"]) for p in props.values() for k in p["missing"] if p[f"f_{k}"] != 0]
    drivers = {"safety": "pass_severity", "danger": "danger_per_100m", "surface": "roughness_norm",
               "air": "mean_pm_risk", "flow": "traffic_flow"}
    missing_inconsistent = [(p["id"], k) for p in props.values() for k, col in drivers.items()
                            if (p[col] is None or (k in ("safety", "danger") and bool(p["passes_excluded"])))
                            != (k in p["missing"])]

    # meta values that are derived from the published segments
    counted = [p for p in props.values() if p["passes_excluded"] is None and p["n_overtakes"]]
    positive = [p["danger_per_100m"] for p in counted if p["danger_per_100m"]]
    p95_mine = round(float(pd.Series(positive).quantile(0.95)), 3) if positive else 0.0
    n_counted = sum(p["n_overtakes"] for p in counted if p["pass_severity"] is not None)
    sev_mine = round(sum(p["n_overtakes"] * p["pass_severity"] for p in counted
                         if p["pass_severity"] is not None) / n_counted, 4) if n_counted else 0.0
    meta_bad = [(key, mine, meta[key]) for key, mine in (("danger_p95", p95_mine), ("city_pass_severity", sev_mine))
                if abs(mine - meta[key]) > TOL]

    print(f"sample: {len(sample)} segments (20 random eligible, seed {args.seed}, + top 10)")
    print(f"{'field':<17} {'max |diff| raw':>15} {'after rounding':>15}  verdict  worst")
    ok = True
    for f, d in diffs.items():
        v = "PASS" if d["rounded"] <= TOL else "FAIL"
        ok &= v == "PASS"
        print(f"{f:<17} {d['raw']:>15.3e} {d['rounded']:>15.3e}  {v:<7}  {d['worst_id']}")
    print(f"null/non-null mismatches: {len(null_mismatch)} {null_mismatch[:5]}")
    print(f"missing keys with factor != 0 (all {len(props)} features): {len(missing_bad)} {missing_bad[:5]}")
    print(f"missing vs null-driver inconsistencies: {len(missing_inconsistent)} {missing_inconsistent[:5]}")
    print(f"passes_excluded mismatches: {len(excluded_mismatch)} {excluded_mismatch[:5]}")
    print(f"meta danger_p95 / city_pass_severity recomputed: {p95_mine} / {sev_mine}; mismatches {meta_bad}")
    ok &= not null_mismatch and not missing_bad and not missing_inconsistent and not excluded_mismatch and not meta_bad

    print(f"\nA7 overtaking lines matched: {ov_matched}/{len(ov)} = {ov_matched / len(ov):.1%} "
          f"({ov_by_index} by index join + midpoint check, {ov_matched - ov_by_index} by nearest)")
    print(f"A7 danger points matched within {POINT_MATCH_M} m: {len(hit)}/{len(dz)} = {len(hit) / len(dz):.1%}")

    Path(args.json).parent.mkdir(parents=True, exist_ok=True)
    Path(args.json).write_text(json.dumps({"diffs": diffs, "null_mismatch": null_mismatch,
                                           "missing_bad": missing_bad, "rows": rows,
                                           "overtaking_matched": [ov_matched, len(ov)]}, indent=1, default=str))
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
