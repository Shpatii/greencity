"""P3: MobiData BW Eco-Counter bike counters inside our bbox, as map context (not part of the score).

    python -m safelane.counters [--refresh]   ->  data/out/counters.geojson

Daily values from the "eco-counter-fahrradzahler" dataset (see qa/mobidata.md), cached in
data/raw/mobidata/. `python run.py --publish` copies the result to web/public/data/.
"""

import argparse
import gzip
import json
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import requests

from safelane.ingest import USER_AGENT

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "data" / "raw" / "mobidata"
OUT_DIR = ROOT / "data" / "out"
BASE_URL = "https://mobidata-bw.de/daten/eco-counter/v2"
WINDOW_DAYS = 365
SOURCE = "MobiData BW, Eco-Counter Fahrradzählstellen (eco-counter-fahrradzahler)"
LICENCE = "Datenlizenz Deutschland – Namensnennung – Version 2.0"


def _sources(today):
    """Daily-value files that cover the last WINDOW_DAYS: yearly, this month, and the rolling current file."""
    start = today - timedelta(days=WINDOW_DAYS)
    names = [f"fahrradzaehler_tageswerten_{y}.json.gz" for y in range(start.year, today.year + 1)]
    names.append(f"fahrradzaehler_tageswerten_{today:%Y%m}.json.gz")
    names.append("fahrradzaehler_tageswerten.json")
    return names


def _load(name, refresh):
    path = RAW_DIR / name
    if refresh or not path.exists():
        r = requests.get(f"{BASE_URL}/{name}", headers={"User-Agent": USER_AGENT}, timeout=(10, 120))
        if r.status_code == 404:
            print(f"  counters: {name} not published (404), skipped")
            return []
        r.raise_for_status()
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        path.write_bytes(r.content)
    raw = path.read_bytes()
    return json.loads(gzip.decompress(raw) if name.endswith(".gz") else raw)


def daily_totals(channels):
    """{date: bikes}: the ALL channel per day, else IN + OUT (never all three, that double counts)."""
    by_day = defaultdict(dict)
    for c in channels:
        day = c["iso_timestamp"][:10]
        by_day[day][c["direction"]] = by_day[day].get(c["direction"], 0) + (c["counts"] or 0)
    return {d: v["ALL"] if "ALL" in v else v.get("IN", 0) + v.get("OUT", 0) for d, v in by_day.items()}


def build(sites, bbox, today):
    """GeoJSON FeatureCollection of the sites inside bbox (west, south, east, north) with data in the window."""
    west, south, east, north = bbox
    start = (today - timedelta(days=WINDOW_DAYS)).isoformat()
    merged = {}
    for s in sites:
        # Some files store coordinates as strings; sites without them cannot be placed.
        try:
            s = {**s, "longitude": float(s["longitude"]), "latitude": float(s["latitude"])}
        except (TypeError, ValueError):
            continue
        if not (west <= s["longitude"] <= east and south <= s["latitude"] <= north):
            continue
        site = merged.setdefault(s["counter_site_id"], {"site": s, "days": {}})
        # Later files win on overlapping days.
        site["days"].update(daily_totals(s["channels"]))

    features = []
    for site_id, m in sorted(merged.items()):
        days = {d: v for d, v in m["days"].items() if start <= d < today.isoformat()}
        if not days:
            continue
        s = m["site"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(s["longitude"], 6), round(s["latitude"], 6)]},
            "properties": {
                "id": str(site_id),
                "name": s["counter_site"],
                "avg_daily_bikes": round(sum(days.values()) / len(days)),
                "n_days": len(days),
                "last_date": max(days),
                "source": SOURCE,
                "licence": LICENCE,
            },
        })
    return {"type": "FeatureCollection", "features": features}


def run(refresh=False, today=None):
    print("counters")
    today = today or date.today()
    meta = json.loads((OUT_DIR / "meta.json").read_text(encoding="utf-8"))
    sites = []
    for name in _sources(today):
        sites += _load(name, refresh)
    fc = build(sites, meta["bbox"], today)
    out = OUT_DIR / "counters.geojson"
    out.write_text(json.dumps(fc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for f in fc["features"]:
        p = f["properties"]
        print(f"  {p['name'][:48]:<48} {p['avg_daily_bikes']:>6}/day over {p['n_days']:>3} days, last {p['last_date']}")
    print(f"  wrote {out} ({len(fc['features'])} counters)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="MobiData BW bike counters inside meta.bbox")
    parser.add_argument("--refresh", action="store_true", help="re-download data/raw/mobidata/")
    run(refresh=parser.parse_args().refresh)
