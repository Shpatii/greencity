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
Checks 20 random eligible segments + the top 10:
  share_below_150 = (bins 0-50 + 50-100 + 100-150) / total
  f_safety        = (n_below + k * city_share) / (n_overtakes + k)   (k, city_share from meta)
  f_flow          = 1 - traffic_flow   (weighted by points_in_segment, min weight 1)
  danger_per_100m = danger points * 100 / max(length, danger_min_length_m)
  f_danger        = min(1, danger_per_100m / danger_p95)
and, for ALL features, that every key in `missing` has factor 0.

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


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--json", default=str(ROOT / "qa" / "logs" / "a5_factors.json"))
    args = ap.parse_args(argv)

    meta = json.loads((OUT / "meta.json").read_text())
    feats = json.loads((OUT / "segments.geojson").read_text())["features"]
    props = {f["properties"]["id"]: f["properties"] for f in feats}

    base = load("road_network_heilbronn").reset_index(drop=True)
    canon = undirected(base)
    length = base.length.clip(lower=meta["danger_min_length_m"])
    k, city_share = meta["safety_prior_k"], meta["city_share_below_150"]

    # overtaking
    ov = load("overtaking_distance_heilbronn")
    ov["seg"], ov_by_index = match_lines(ov, base, "id")
    ov_matched = int(ov["seg"].notna().sum())
    ovm = merge(ov, canon, ["Overtaking Distance Counts", "Average Overtaking Distance cm", "Number of Points"])
    bins = pd.DataFrame(ovm["Overtaking Distance Counts"].map(hist).tolist(), index=ovm.index)
    bins = bins.groupby(ovm["seg"]).sum()
    tot = bins.sum(axis=1)
    share = (bins[[0, 1, 2]].sum(axis=1) / tot.where(tot > 0))

    # traffic flow
    tf = load("traffic_flow_heilbronn")
    tf["seg"], _ = match_lines(tf, base, "road_segment")
    tfm = merge(tf, canon, ["avg_traffic_flow", "points_in_segment"]).dropna(subset=["avg_traffic_flow"])
    w = tfm["points_in_segment"].clip(lower=1)
    flow = (tfm["avg_traffic_flow"] * w).groupby(tfm["seg"]).sum() / w.groupby(tfm["seg"]).sum()

    # danger points
    dz = load("danger_zones_heilbronn")
    hit = gpd.sjoin_nearest(dz[["geometry"]], base[["geometry"]], max_distance=POINT_MATCH_M)
    hit = hit[~hit.index.duplicated()]
    n_danger = hit["index_right"].map(canon).value_counts()
    p95 = meta["danger_p95"]

    eligible_ids = sorted(i for i, p in props.items() if p["eligible"])
    top10 = [p["id"] for p in sorted((p for p in props.values() if p["rank"]), key=lambda p: p["rank"])[:10]]
    rng = random.Random(args.seed)
    sample = rng.sample([i for i in eligible_ids if i not in top10], 20) + top10

    fields = ("share_below_150", "f_safety", "traffic_flow", "f_flow", "danger_per_100m", "f_danger")
    diffs = {f: {"raw": 0.0, "rounded": 0.0, "worst_id": None} for f in fields}
    null_mismatch = []
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

        cmp("share_below_150", sid, s, p["share_below_150"], 4)
        n_ovt = int(tot.get(i, 0))
        f_saf = None if s is None else (round(round(s, 4) * n_ovt) + k * city_share) / (n_ovt + k)
        cmp("f_safety", sid, f_saf, p["f_safety"] if s is not None else None, 4)
        cmp("traffic_flow", sid, tfv, p["traffic_flow"], 4)
        # factor rule applied to the stored (rounded) metric, as the contract defines f from the metric
        cmp("f_flow", sid, None if tfv is None else 1 - round(tfv, 4),
            p["f_flow"] if tfv is not None else None, 4)
        cmp("danger_per_100m", sid, dpm, p["danger_per_100m"], 3)
        cmp("f_danger", sid, None if dpm is None else min(1.0, round(dpm, 3) / p95),
            p["f_danger"] if dpm is not None else None, 4)
        rows.append({"id": sid, "rank": p["rank"], "share_mine": s, "share_stored": p["share_below_150"],
                     "flow_mine": tfv, "flow_stored": p["traffic_flow"],
                     "dpm_mine": dpm, "dpm_stored": p["danger_per_100m"]})

    missing_bad = [(p["id"], k, p[f"f_{k}"]) for p in props.values() for k in p["missing"] if p[f"f_{k}"] != 0]
    drivers = {"safety": "share_below_150", "danger": "danger_per_100m", "surface": "roughness_norm",
               "air": "mean_pm_risk", "flow": "traffic_flow"}
    missing_inconsistent = [(p["id"], k) for p in props.values() for k, col in drivers.items()
                            if (p[col] is None) != (k in p["missing"])]

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
    ok &= not null_mismatch and not missing_bad and not missing_inconsistent

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
