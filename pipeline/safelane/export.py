"""P1: write data/out/, copy to web/public/data/."""

import json
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from safelane import config

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "data" / "out"
WEB_DIR = ROOT / "web" / "public" / "data"
OUT_FILES = ("segments.geojson", "meta.json")
COORD_DECIMALS = 6


def _coords(line):
    """Rounded coordinates without consecutive duplicates (at least two points)."""
    pts = [[round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)] for x, y in line.coords]
    out = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
    return out if len(out) >= 2 else [pts[0], pts[-1]]


def _write_json(path, obj):
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def write(geometry, rows, danger_p95):
    """Write data/out/segments.geojson (EPSG:4326) + meta.json; geometry is a GeoSeries aligned with rows."""
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    wgs = geometry.to_crs("EPSG:4326")
    features = [
        {"type": "Feature", "geometry": {"type": "LineString", "coordinates": _coords(g)}, "properties": p}
        for g, p in zip(wgs, rows)
    ]
    _write_json(OUT_DIR / "segments.geojson", {"type": "FeatureCollection", "features": features})

    meta = {
        "version": "1.0",
        "source": "atrai",
        "generated_at": datetime.now(ZoneInfo("Europe/Berlin")).isoformat(timespec="seconds"),
        "city": "heilbronn",
        "n_segments": len(rows),
        "n_eligible": sum(p["eligible"] for p in rows),
        "min_points": config.MIN_POINTS,
        "confidence_n": config.CONFIDENCE_N,
        "danger_p95": danger_p95,
        "default_weights": config.DEFAULT_WEIGHTS,
        "bbox": [round(float(v), 5) for v in wgs.total_bounds],
    }
    _write_json(OUT_DIR / "meta.json", meta)
    print(f"Wrote {OUT_DIR / 'segments.geojson'} ({len(rows)} segments) and meta.json")


def run():
    print("export")
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    for name in OUT_FILES:
        src = OUT_DIR / name
        if not src.exists():
            raise FileNotFoundError(f"{src} missing; run `python run.py --fuse` first")
        shutil.copy2(src, WEB_DIR / name)
        print(f"  copied {name} -> {WEB_DIR}")
