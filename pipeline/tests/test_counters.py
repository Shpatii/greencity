import json
from datetime import date
from pathlib import Path

import pytest

from safelane import counters

OUT = Path(__file__).resolve().parents[2] / "data" / "out" / "counters.geojson"
BBOX = (9.16, 49.11, 9.26, 49.18)


def site(site_id, lon, lat, channels, name="Neckarufer"):
    return {"counter_site_id": site_id, "counter_site": name, "longitude": lon, "latitude": lat,
            "channels": channels}


def ch(day, direction, counts):
    return {"iso_timestamp": f"{day}T00:00:00+02:00", "direction": direction, "counts": counts}


def check_geojson(fc):
    assert fc["type"] == "FeatureCollection"
    for f in fc["features"]:
        assert f["type"] == "Feature"
        assert f["geometry"]["type"] == "Point"
        lon, lat = f["geometry"]["coordinates"]
        assert -180 <= lon <= 180 and -90 <= lat <= 90
        p = f["properties"]
        assert set(p) >= {"id", "name", "avg_daily_bikes", "last_date", "source", "licence"}
        assert isinstance(p["avg_daily_bikes"], int) and p["avg_daily_bikes"] >= 0
        date.fromisoformat(p["last_date"])


def test_build_uses_all_channel_window_and_bbox():
    sites = [
        site(1, 9.2146, 49.1397, [ch("2026-10-20", "ALL", 100), ch("2026-10-20", "IN", 60),
                                  ch("2026-10-20", "OUT", 40), ch("2026-10-21", "IN", 150),
                                  ch("2026-10-21", "OUT", 50), ch("2025-01-01", "ALL", 9999)]),
        site(2, 9.0254, 49.0643, [ch("2026-10-20", "ALL", 5)], name="Cleebronn"),  # outside bbox
        site(3, "9.2106", "49.1469", [ch("2026-10-20", "ALL", 30)], name="String coords"),
    ]
    fc = counters.build(sites, BBOX, date(2026, 10, 28))
    check_geojson(fc)
    by_id = {f["properties"]["id"]: f["properties"] for f in fc["features"]}
    assert set(by_id) == {"1", "3"}
    assert by_id["1"]["avg_daily_bikes"] == 150  # (100 + 200) / 2; 2025-01-01 outside the window
    assert by_id["1"]["last_date"] == "2026-10-21"


@pytest.mark.skipif(not OUT.exists(), reason="run `python run.py --counters` first")
def test_published_counters_file_is_valid_geojson():
    check_geojson(json.loads(OUT.read_text(encoding="utf-8")))
