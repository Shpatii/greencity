"""P3 data QA: check the 10 highest-ranked segments against the raw data.

For each top-10 segment, find the raw danger points within MATCH_DISTANCE_M (20 m)
and the overtaking line it matched to, then write

    qa/top10-check.md    one section per segment, with a blank "Verdict:" line
    qa/top10.geojson     segments + nearby raw points + matched lines, for kepler.gl

    python pipeline/qa_top10.py [--segments ...] [--danger ...] [--overtaking ...] [--out-dir ...]

The matched overtaking line is the raw overtaking feature with the longest stretch
inside the segment's 20 m buffer (point data: the nearest feature within 20 m).
"""
import argparse
import math
import sys
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from safelane import config  # noqa: E402

RAW_DIR = ROOT / "data" / "raw"
DEFAULT_SEGMENTS = ROOT / "data" / "out" / "segments.geojson"
DEFAULT_DANGER = RAW_DIR / f"{config.COLLECTIONS['danger']}.geojson"
DEFAULT_OVERTAKING = RAW_DIR / f"{config.COLLECTIONS['overtaking']}.geojson"
DEFAULT_OUT_DIR = ROOT / "qa"
TOP_N = 10
# Property names tried in order when --risk-field is not given.
RISK_FIELDS = ("Risk Index", "risk_index", "RiskIndex", "risk")
SEGMENT_FIELDS = ["id", "name", "rank", "score", "n_points", "share_below_150", "n_overtakes",
                  "danger_per_100m", "mean_danger_risk"]


def read_metric(path):
    return gpd.read_file(path).set_crs(4326, allow_override=False).to_crs(config.METRIC_CRS)


def find_risk_field(gdf, field):
    if field:
        if field not in gdf.columns:
            raise SystemExit(f"--risk-field {field!r} not in danger columns {list(gdf.columns)}")
        return field
    for name in RISK_FIELDS:
        if name in gdf.columns:
            return name
    raise SystemExit(f"no Risk Index column (tried {RISK_FIELDS}) in {list(gdf.columns)}; "
                     f"pass --risk-field")


def top_segments(segments):
    ranked = segments[segments["rank"].notna()].copy()
    ranked["rank"] = ranked["rank"].astype(int)
    return ranked.sort_values("rank").head(TOP_N)


def nearby_points(segment, danger, risk_field):
    buffer = segment.geometry.buffer(config.MATCH_DISTANCE_M)
    near = danger[danger.intersects(buffer)].copy()
    near["distance_m"] = near.distance(segment.geometry)
    near["risk_index"] = pd.to_numeric(near[risk_field], errors="coerce")
    return near.sort_values("distance_m")


def matched_overtaking(segment, overtaking):
    """Raw overtaking row with the longest overlap with the 20 m buffer, or None."""
    if overtaking is None:
        return None
    buffer = segment.geometry.buffer(config.MATCH_DISTANCE_M)
    cand = overtaking[overtaking.intersects(buffer)].copy()
    if cand.empty:
        return None
    cand["overlap_m"] = cand.intersection(buffer).length
    cand["distance_m"] = cand.distance(segment.geometry)
    cand = cand.sort_values(["overlap_m", "distance_m"], ascending=[False, True])
    return cand.iloc[0]


def fmt(value, spec=""):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return "n/a"
    return format(value, spec)


def section(seg, near, line):
    name = seg["name"] if isinstance(seg["name"], str) and seg["name"] else None
    risks = near["risk_index"].dropna()
    mean_risk = float(risks.mean()) if len(risks) else None
    if line is None:
        line_text = "none within 20 m"
    else:
        line_text = (f"raw row {line.name}, overlap {line['overlap_m']:.0f} m, "
                     f"distance {line['distance_m']:.1f} m")
    return "\n".join([
        f"## {seg['rank']}. {seg['id']} {name or '(no name)'}",
        "",
        f"- id: {seg['id']}",
        f"- name: {name or 'n/a'}",
        f"- score: {fmt(seg['score'], '.1f')}",
        f"- n_points: {int(seg['n_points'])}",
        f"- share_below_150: {fmt(seg['share_below_150'], '.2f')}",
        f"- raw danger points within {config.MATCH_DISTANCE_M} m: {len(near)}",
        f"- mean raw Risk Index: {fmt(mean_risk, '.3f')}"
        + (f" ({len(risks)} of {len(near)} points have a value)" if len(risks) != len(near) else ""),
        f"- matched overtaking line: {line_text}",
        "",
        "Verdict:",
        "",
    ])


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--segments", type=Path, default=DEFAULT_SEGMENTS)
    parser.add_argument("--danger", type=Path, default=DEFAULT_DANGER)
    parser.add_argument("--overtaking", type=Path, default=DEFAULT_OVERTAKING)
    parser.add_argument("--risk-field", help=f"danger point Risk Index property (default: first of {RISK_FIELDS})")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    args = parser.parse_args()

    segments = read_metric(args.segments)
    danger = read_metric(args.danger)
    risk_field = find_risk_field(danger, args.risk_field)
    if args.overtaking.exists():
        overtaking = read_metric(args.overtaking)
    else:
        print(f"warning: {args.overtaking} not found, skipping overtaking match")
        overtaking = None

    top = top_segments(segments)
    if top.empty:
        raise SystemExit(f"no ranked segments in {args.segments}; run the scoring step first")

    sections, layers = [], []
    for _, seg in top.iterrows():
        near = nearby_points(seg, danger, risk_field)
        line = matched_overtaking(seg, overtaking)
        sections.append(section(seg, near, line))

        layers.append(gpd.GeoDataFrame(
            [{**{f: seg[f] for f in SEGMENT_FIELDS}, "layer": "segment", "segment_id": seg["id"],
              "geometry": seg.geometry}], crs=segments.crs))
        if not near.empty:
            layers.append(gpd.GeoDataFrame({
                "layer": "danger_point", "segment_id": seg["id"], "rank": seg["rank"],
                "raw_row": near.index, "risk_index": near["risk_index"].values,
                "distance_m": near["distance_m"].round(1).values,
            }, geometry=near.geometry.values, crs=danger.crs))
        if line is not None:
            layers.append(gpd.GeoDataFrame(
                [{"layer": "overtaking_line", "segment_id": seg["id"], "rank": seg["rank"],
                  "raw_row": line.name, "overlap_m": round(float(line["overlap_m"]), 1),
                  "distance_m": round(float(line["distance_m"]), 1), "geometry": line.geometry}],
                crs=overtaking.crs))

    args.out_dir.mkdir(parents=True, exist_ok=True)
    md_path = args.out_dir / "top10-check.md"
    header = [
        "# Top 10 segment check",
        "",
        f"Segments: `{args.segments.name}`. Raw danger points: `{args.danger.name}` "
        f"(Risk Index field `{risk_field}`). Search radius {config.MATCH_DISTANCE_M} m "
        f"in {config.METRIC_CRS}.",
        "",
        "Fill in each Verdict: ok / suspicious / wrong, plus a short reason.",
        "",
    ]
    md_path.write_text("\n".join(header + sections), encoding="utf-8")

    geo_path = args.out_dir / "top10.geojson"
    out = pd.concat([layer.to_crs(4326) for layer in layers], ignore_index=True)
    gpd.GeoDataFrame(out, geometry="geometry", crs=4326).to_file(geo_path, driver="GeoJSON")

    n_points = sum(1 for layer in layers if layer["layer"].iloc[0] == "danger_point")
    print(f"qa_top10: {len(top)} segments ({n_points} with nearby danger points) -> {md_path}, {geo_path}")


if __name__ == "__main__":
    main()
