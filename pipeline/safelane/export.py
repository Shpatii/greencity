"""P1/P4: write data/out/, compress and copy to web/public/data/."""

import csv
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from safelane import config
from safelane.score import FACTORS

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "out"
WEB_DIR = ROOT / "web" / "public" / "data"

COORD_DECIMALS_OUT = 6
COORD_DECIMALS_PUB = 5
MAX_PUBLISH_MB = 5.0
SIMPLIFY_TOL_M = 2.0


# ── helpers ────────────────────────────────────────────────────────────────────

def _write_geojson(path, features):
    lines = ",\n".join(json.dumps(f, ensure_ascii=False) for f in features)
    Path(path).write_text(
        '{"type": "FeatureCollection", "features": [\n' + lines + "\n]}\n",
        encoding="utf-8",
    )


def _round_coords(coords, decimals):
    """Round [lon, lat] pairs and remove consecutive duplicates (keeps ≥2 pts)."""
    rounded = [(round(c[0], decimals), round(c[1], decimals)) for c in coords]
    deduped = [rounded[0]]
    for pt in rounded[1:]:
        if pt != deduped[-1]:
            deduped.append(pt)
    if len(deduped) < 2:
        deduped = rounded[:2] if len(rounded) >= 2 else rounded + [rounded[0]]
    return deduped


def _top_reason(props, weights=config.DEFAULT_WEIGHTS):
    """Return the reason_texts sentence for the factor with the highest w × f contribution."""
    reason_texts = props.get("reason_texts") or {}
    candidates = [k for k in FACTORS if k in reason_texts]
    if not candidates:
        return None
    best = max(candidates, key=lambda k: weights.get(k, 0) * (props.get(f"f_{k}") or 0))
    return reason_texts[best]


def _write_ranking_csv(path, features, weights=config.DEFAULT_WEIGHTS):
    eligible = sorted(
        (f["properties"] for f in features if f["properties"].get("eligible")),
        key=lambda p: (p.get("rank") or 9999),
    )
    fieldnames = [
        "rank", "id", "name", "score", "confidence", "n_points",
        "share_below_150", "f_safety", "f_danger", "f_surface", "f_air", "f_flow",
        "top_reason",
    ]
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for p in eligible:
            writer.writerow({
                "rank": p.get("rank"),
                "id": p.get("id"),
                "name": p.get("name") or "",
                "score": p.get("score"),
                "confidence": p.get("confidence"),
                "n_points": p.get("n_points"),
                "share_below_150": p.get("share_below_150"),
                "f_safety": p.get("f_safety"),
                "f_danger": p.get("f_danger"),
                "f_surface": p.get("f_surface"),
                "f_air": p.get("f_air"),
                "f_flow": p.get("f_flow"),
                "top_reason": _top_reason(p, weights),
            })
    return eligible


def _compute_stats(features, out_dir):
    props_list = [f.get("properties") or {} for f in features]
    eligible = [p for p in props_list if p.get("eligible") is True]

    total_overtakes = sum(p.get("n_overtakes") or 0 for p in props_list)

    weighted_num = sum(
        (p["share_below_150"]) * (p.get("n_overtakes") or 0)
        for p in props_list
        if p.get("share_below_150") is not None
    )
    weighted_den = sum(
        p.get("n_overtakes") or 0
        for p in props_list
        if p.get("share_below_150") is not None
    )
    citywide = round(weighted_num / weighted_den, 3) if weighted_den > 0 else None

    n_dangerous_eligible = sum(
        1 for p in eligible if (p.get("share_below_150") or 0) > 0.5
    )

    campaign = None
    campaign_path = Path(out_dir).parent / "raw" / "campaign_heilbronn.json"
    if campaign_path.exists():
        try:
            campaign = json.loads(campaign_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    stats = {
        "n_segments": len(props_list),
        "n_eligible": len(eligible),
        "total_overtakes": total_overtakes,
        "citywide_share_below_150": citywide,
        "n_dangerous_eligible": n_dangerous_eligible,
    }
    if campaign is not None:
        stats["campaign"] = campaign
    return stats


def _simplify_geo(geo):
    """Simplify linestrings at 2 m tolerance in EPSG:25832, return to EPSG:4326."""
    import geopandas as gpd
    from shapely.geometry import mapping, shape

    geoms = [shape(f["geometry"]) for f in geo["features"]]
    gdf = gpd.GeoDataFrame(geometry=geoms, crs="EPSG:4326")
    gdf = gdf.to_crs("EPSG:25832")
    gdf["geometry"] = gdf["geometry"].simplify(SIMPLIFY_TOL_M, preserve_topology=True)
    gdf = gdf.to_crs("EPSG:4326")

    out = dict(geo)
    out["features"] = []
    for feat, geom in zip(geo["features"], gdf.geometry):
        new_feat = dict(feat)
        coords = list(mapping(geom)["coordinates"])
        new_feat["geometry"] = {
            "type": "LineString",
            "coordinates": _round_coords(coords, COORD_DECIMALS_PUB),
        }
        out["features"].append(new_feat)
    return out


def _compress_geojson(src, dst):
    """Round coords to 5dp, simplify if still >5 MB. Write dst. Return byte size."""
    geo = json.loads(Path(src).read_text(encoding="utf-8"))

    for f in geo["features"]:
        f["geometry"]["coordinates"] = _round_coords(
            f["geometry"]["coordinates"], COORD_DECIMALS_PUB
        )

    def _serialise(g):
        lines = ",\n".join(json.dumps(f, ensure_ascii=False) for f in g["features"])
        return '{"type": "FeatureCollection", "features": [\n' + lines + "\n]}\n"

    text = _serialise(geo)
    size = len(text.encode("utf-8"))

    if size > MAX_PUBLISH_MB * 1024 * 1024:
        print(f"  compress: {size / 1e6:.1f} MB > {MAX_PUBLISH_MB} MB, simplifying…")
        geo = _simplify_geo(geo)
        text = _serialise(geo)
        size = len(text.encode("utf-8"))

    Path(dst).write_text(text, encoding="utf-8")
    return size


def _print_summary(features, eligible_sorted, stats):
    top = eligible_sorted[0]["properties"] if eligible_sorted else None
    cs = stats.get("citywide_share_below_150")
    print("\n" + "─" * 52)
    print("  SafeLane HN — pipeline summary")
    print("─" * 52)
    print(f"  Segments total   : {stats['n_segments']}")
    print(f"  Eligible         : {stats['n_eligible']}")
    print(f"  Total overtakes  : {stats['total_overtakes']}")
    if cs is not None:
        print(f"  Citywide <150 cm : {cs:.1%}")
    print(f"  Dangerous elig.  : {stats['n_dangerous_eligible']} (share_below_150 > 50%)")
    if top:
        print(f"  #1 street        : {top.get('name') or top.get('id')}"
              f"  (score {top.get('score')}, rank {top.get('rank')})")
    print("─" * 52)


# ── public API ─────────────────────────────────────────────────────────────────

def write(geometry, rows, danger_p95, out_dir=OUT_DIR):
    """Write data/out/segments.geojson + meta.json from fuse output.

    geometry : iterable of shapely LineString geometries (EPSG:4326)
    rows     : list of property dicts (raw metrics + f_* factors, one per segment)
    danger_p95: float — 95th-percentile of danger_per_100m across all segments
    """
    from shapely.geometry import mapping

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    features = []
    all_lons, all_lats = [], []
    for geom, props in zip(geometry, rows):
        raw_coords = list(mapping(geom)["coordinates"])
        coords = _round_coords(raw_coords, COORD_DECIMALS_OUT)
        all_lons.extend(c[0] for c in coords)
        all_lats.extend(c[1] for c in coords)
        features.append({
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": coords},
            "properties": props,
        })

    seg_path = out_dir / "segments.geojson"
    _write_geojson(seg_path, features)

    bbox = [round(min(all_lons), 4), round(min(all_lats), 4),
            round(max(all_lons), 4), round(max(all_lats), 4)]

    meta = {
        "version": "1.0",
        "source": "atrai",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "city": "heilbronn",
        "n_segments": len(features),
        "n_eligible": None,
        "min_points": config.MIN_POINTS,
        "confidence_n": config.CONFIDENCE_N,
        "danger_p95": round(float(danger_p95), 2) if danger_p95 is not None else None,
        "default_weights": config.DEFAULT_WEIGHTS,
        "bbox": bbox,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(f"export.write: {len(features)} segments -> {seg_path}")


def run(out_dir=OUT_DIR):
    """Read scored segments.geojson; write ranking.csv + stats.json; print summary."""
    out_dir = Path(out_dir)
    seg_path = out_dir / "segments.geojson"

    geo = json.loads(seg_path.read_text(encoding="utf-8"))
    features = geo["features"]

    ranking_path = out_dir / "ranking.csv"
    eligible_sorted_props = _write_ranking_csv(ranking_path, features)
    eligible_sorted = sorted(
        (f for f in features if f["properties"].get("eligible")),
        key=lambda f: f["properties"].get("rank") or 9999,
    )

    stats = _compute_stats(features, out_dir)
    stats_path = out_dir / "stats.json"
    stats_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")

    _print_summary(features, eligible_sorted, stats)
    print(f"export: ranking.csv ({len(eligible_sorted_props)} rows),"
          f" stats.json -> {out_dir}")


def publish(out_dir=OUT_DIR, web_dir=WEB_DIR):
    """Compress GeoJSON to ≤5 MB and copy output files to web/public/data/."""
    out_dir = Path(out_dir)
    web_dir = Path(web_dir)
    web_dir.mkdir(parents=True, exist_ok=True)

    size = _compress_geojson(out_dir / "segments.geojson", web_dir / "segments.geojson")
    print(f"publish: segments.geojson {size / 1e6:.2f} MB -> {web_dir / 'segments.geojson'}")

    shutil.copy2(out_dir / "meta.json", web_dir / "meta.json")
    print(f"publish: meta.json -> {web_dir / 'meta.json'}")
