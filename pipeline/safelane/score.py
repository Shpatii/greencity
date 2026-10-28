"""Confidence, eligible, score, rank, reason_texts.

Formula (CONTRACT.md 3.2), evaluated in exactly this order so that
web/src/lib/score.ts gets bit-identical floats:

    weighted   = 0 + w_safety*f_safety + w_danger*f_danger + w_surface*f_surface
                   + w_air*f_air + w_flow*f_flow
    c          = min(1, n_points / confidence_n)
    raw        = 100 * c * weighted
    score      = floor(raw * 10 + 0.5 + 1e-6) / 10      (round half up, 1 decimal)
    confidence = round(c, 3)                            (stored; score uses unrounded c)
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

from safelane import config, osm

FACTORS = ("safety", "danger", "surface", "air", "flow")
# Raw metric that decides whether a factor has data (CONTRACT.md 3.2 factor rules).
FACTOR_DRIVERS = {
    "safety": "share_below_150",
    "danger": "danger_per_100m",
    "surface": "roughness_norm",
    "air": "mean_pm_risk",
    "flow": "traffic_flow",
}
ROUND_EPS = 1e-6
# Lower bounds of the legend bands (web/src/content/theme.ts scoreBreaks), for stats.json.
SCORE_BANDS = (0, 20, 40, 60, 80)

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "out"


def check_weights(weights):
    if set(weights) != set(FACTORS):
        raise ValueError(f"weights must have exactly the keys {FACTORS}, got {sorted(weights)}")
    if any(w < 0 for w in weights.values()):
        raise ValueError(f"weights must be non-negative, got {weights}")
    total = sum(weights.values())
    if abs(total - 1) > 1e-6:
        raise ValueError(f"weights must sum to 1 (tolerance 1e-6), got {total}")


def round_score(raw):
    """Round half up to 1 decimal; the epsilon absorbs float noise like 49.849999..."""
    return np.floor(np.asarray(raw, dtype=float) * 10 + 0.5 + ROUND_EPS) / 10


def _has_data(row, key):
    value = row.get(FACTOR_DRIVERS[key])
    return key not in row["missing"] and value is not None and not pd.isna(value)


def reason_texts(row):
    """Factor key -> one plain English sentence, only for factors with data."""
    templates = {
        "safety": lambda r: (f"{r['share_below_150']:.0%} of {int(r['n_overtakes'])} "
                             f"overtake{'' if int(r['n_overtakes']) == 1 else 's'} "
                             f"{'was' if int(r['n_overtakes']) == 1 else 'were'} closer than 150 cm"),
        "danger": lambda r: f"{r['danger_per_100m']:.1f} close-overtake danger points per 100 m",
        "surface": lambda r: f"rough surface (roughness {r['roughness_norm']:.2f} of 1)",
        "air": lambda r: f"elevated fine-dust risk ({r['mean_pm_risk']:.2f} of 1)",
        "flow": lambda r: f"stop-and-go traffic (flow {r['traffic_flow']:.2f} of 1)",
    }
    return {key: templates[key](row) for key in FACTORS if _has_data(row, key)}


def apply_scores(gdf, weights=config.DEFAULT_WEIGHTS, min_points=config.MIN_POINTS,
                 confidence_n=config.CONFIDENCE_N):
    """Return a copy of gdf with confidence, eligible, score, rank, reason_texts filled."""
    check_weights(weights)
    gdf = gdf.copy()

    weighted = 0
    for key in FACTORS:
        weighted = weighted + weights[key] * gdf[f"f_{key}"].astype(float)
    c = np.minimum(1.0, gdf["n_points"].astype(float) / confidence_n)
    eligible = gdf["n_points"] >= min_points
    scores = round_score(100 * c * weighted)

    gdf["confidence"] = np.round(c, 3)
    gdf["eligible"] = eligible.astype(bool)
    gdf["score"] = pd.Series(
        [float(s) if e else None for s, e in zip(scores, eligible)], index=gdf.index, dtype=object)

    order = sorted((i for i in gdf.index if eligible[i]),
                   key=lambda i: (-gdf.at[i, "score"], -gdf.at[i, "n_points"], gdf.at[i, "id"]))
    ranks = {i: rank for rank, i in enumerate(order, start=1)}
    gdf["rank"] = pd.Series([ranks.get(i) for i in gdf.index], index=gdf.index, dtype=object)

    gdf["reason_texts"] = pd.Series(
        [reason_texts(row) for _, row in gdf.iterrows()], index=gdf.index, dtype=object)
    return gdf


def _plain(value):
    """numpy/pandas scalar -> JSON-ready Python value (NaN -> None)."""
    if isinstance(value, (list, dict, str, bool)) or value is None:
        return value
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def props_records(df):
    """DataFrame rows -> list of property dicts with plain Python values."""
    cols = [c for c in df.columns if c != "geometry"]
    return [{c: _plain(row[c]) for c in cols} for _, row in df.iterrows()]


def write_geojson(path, features):
    # One feature per line keeps git diffs readable; compact separators keep the file small.
    lines = ",\n".join(json.dumps(f, ensure_ascii=False, separators=(",", ":")) for f in features)
    Path(path).write_text('{"type":"FeatureCollection","features":[\n' + lines + "\n]}\n",
                          encoding="utf-8")


def score_stats(scored):
    """Score part of stats.json: eligible count, score spread, legend band counts, top-10 ids."""
    el = scored[scored["eligible"]]
    scores = el["score"].astype(float)
    uppers = SCORE_BANDS[1:] + (100.1,)  # last band includes 100
    bands = {f"{lo}-{min(hi, 100):g}": int(((scores >= lo) & (scores < hi)).sum())
             for lo, hi in zip(SCORE_BANDS, uppers)}
    top = el.sort_values("rank").head(10)
    return {
        "n_eligible": int(len(el)),
        "score": {"max": float(scores.max()) if len(el) else None,
                  "median": float(scores.median()) if len(el) else None,
                  "bands": bands},
        "top10": top["id"].tolist(),
    }


def run(out_dir=OUT_DIR):
    seg_path = Path(out_dir) / "segments.geojson"
    meta_path = Path(out_dir) / "meta.json"
    features = json.loads(seg_path.read_text(encoding="utf-8"))["features"]

    df = pd.DataFrame([f["properties"] for f in features])
    scored = apply_scores(df)
    records = props_records(scored)
    # CONTRACT 3.2b: after scoring (infra_gap needs rank); does not change score or rank.
    n_gap = osm.add_measures(records)
    osm.print_top(records)
    for feature, props in zip(features, records):
        feature["properties"] = props
    write_geojson(seg_path, features)

    n_eligible = int(scored["eligible"].sum())
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta.update({
            "n_segments": len(features),
            "n_eligible": n_eligible,
            "min_points": config.MIN_POINTS,
            "confidence_n": config.CONFIDENCE_N,
            "default_weights": config.DEFAULT_WEIGHTS,
        })
        meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    else:
        print(f"warning: {meta_path} not found, n_eligible not recorded")
    stats_path = Path(out_dir) / "stats.json"
    if stats_path.exists():
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
        stats.update(score_stats(scored))
        stats_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    print(f"score: {len(features)} segments, {n_eligible} eligible, {n_gap} infra_gap -> {seg_path}")
