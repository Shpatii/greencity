"""P1: write data/out/, copy to web/public/data/."""

import json
import shutil
import statistics
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from safelane import config

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "out"
WEB_DIR = ROOT / "web" / "public" / "data"
OUT_FILES = ("segments.geojson", "meta.json")
COORD_DECIMALS = 5  # ~1 m; keeps segments.geojson under 5 MB
CONTRACT_VERSION = "1.1"
VIEW_QUANTILES = (0.02, 0.98)  # meta.bbox: initial map view, ignores far-out rides


def _coords(line, decimals=COORD_DECIMALS):
    """Rounded coordinates without consecutive duplicates (at least two distinct points).

    A line shorter than the rounding step gets more decimals instead of collapsing to one point.
    """
    pts = [[round(x, decimals), round(y, decimals)] for x, y in line.coords]
    out = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    if len(out) >= 2:
        return out
    return _coords(line, decimals + 1) if decimals < 8 else [pts[0], pts[-1]]


def _write_json(path, obj, indent=None):
    text = json.dumps(obj, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _view_bbox(wgs):
    """[west, south, east, north] of the VIEW_QUANTILES of segment midpoints."""
    mid = wgs.to_crs(config.METRIC_CRS).interpolate(0.5, normalized=True).to_crs("EPSG:4326")
    lo, hi = VIEW_QUANTILES
    return [round(float(v), 5) for v in (mid.x.quantile(lo), mid.y.quantile(lo), mid.x.quantile(hi), mid.y.quantile(hi))]


def write(geometry, rows, danger_p95, city_share, stats):
    """Write data/out/segments.geojson (EPSG:4326), meta.json and stats.json; geometry is aligned with rows."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wgs = geometry.to_crs("EPSG:4326")
    features = [
        {"type": "Feature", "geometry": {"type": "LineString", "coordinates": _coords(g)}, "properties": p}
        for g, p in zip(wgs, rows)
    ]
    _write_json(OUT_DIR / "segments.geojson", {"type": "FeatureCollection", "features": features})

    generated_at = datetime.now(ZoneInfo("Europe/Berlin")).isoformat(timespec="seconds")
    meta = {
        "version": CONTRACT_VERSION,
        "source": "atrai",
        "generated_at": generated_at,
        "city": "heilbronn",
        "n_segments": len(rows),
        "n_eligible": sum(p["eligible"] for p in rows),
        "min_points": config.MIN_POINTS,
        "confidence_n": config.CONFIDENCE_N,
        "danger_p95": danger_p95,
        "city_share_below_150": city_share,
        "safety_prior_k": config.SAFETY_PRIOR_K,
        "danger_min_length_m": config.DANGER_MIN_LENGTH_M,
        "default_weights": config.DEFAULT_WEIGHTS,
        "bbox": _view_bbox(wgs),
    }
    _write_json(OUT_DIR / "meta.json", meta, indent=2)

    n_points = [p["n_points"] for p in rows]
    stats = {
        "generated_at": generated_at,
        **stats,
        "n_segments": len(rows),
        "n_points": {"median": statistics.median(n_points) if n_points else 0,
                     **{f"ge_{t}": sum(n >= t for n in n_points) for t in (1, 5, 10, 30)}},
        "n_with_overtakes": sum(p["n_overtakes"] > 0 for p in rows),
        "danger_p95": danger_p95,
        "city_share_below_150": city_share,
    }
    _write_json(OUT_DIR / "stats.json", stats, indent=2)
    print(f"Wrote {OUT_DIR / 'segments.geojson'} ({len(rows)} segments), meta.json and stats.json")


def run():
    print("export")
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    for name in OUT_FILES:
        src = OUT_DIR / name
        if not src.exists():
            raise FileNotFoundError(f"{src} missing; run `python run.py --fuse` first")
        shutil.copy2(src, WEB_DIR / name)
        print(f"  copied {name} -> {WEB_DIR}")
