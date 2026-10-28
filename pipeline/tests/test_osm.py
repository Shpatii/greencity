import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import LineString

from safelane import config, osm


@pytest.mark.parametrize("value, expected", [
    ("50", 50),
    ("30", 30),
    ("DE:urban", 50),
    ("DE:zone30", 30),
    ("DE:zone:30", 30),
    ("DE:rural", 100),
    ("walk", 7),
    ("none", None),
    ("signals", None),
    (None, None),
    ("50;30", 50),
    ("30 mph", 48),
    ("70 km/h", 70),
])
def test_parse_maxspeed(value, expected):
    assert osm.parse_maxspeed(value) == expected


@pytest.mark.parametrize("value, expected", [("2", 2), ("2;3", 3), ("", None), (None, None), ("two", None)])
def test_parse_lanes(value, expected):
    assert osm.parse_lanes(value) == expected


@pytest.mark.parametrize("tags, expected", [
    ({"highway": "cycleway"}, "separated"),
    ({"highway": "primary", "cycleway": "track"}, "separated"),
    ({"highway": "primary", "cycleway:right": "track"}, "separated"),
    ({"highway": "secondary", "cycleway:both": "separate"}, "separated"),
    ({"highway": "residential", "bicycle_road": "yes"}, "bike_street"),
    ({"highway": "residential", "cyclestreet": "yes", "cycleway": "lane"}, "bike_street"),
    ({"highway": "secondary", "cycleway:left": "lane"}, "painted_lane"),
    ({"highway": "secondary", "cycleway:both": "lane", "cycleway:both:lane": "advisory"}, "painted_lane"),
    ({"highway": "tertiary", "cycleway:lane": "advisory"}, "painted_lane"),
    ({"highway": "tertiary", "cycleway": "opposite_lane"}, "painted_lane"),
    ({"highway": "primary", "cycleway:right": "share_busway"}, "shared_bus"),
    ({"highway": "residential", "cycleway": "shared_lane"}, "shared"),
    ({"highway": "primary", "cycleway:left": "lane", "cycleway:right": "track"}, "separated"),
    ({"highway": "primary", "cycleway:left": "shared_lane", "cycleway:right": "lane"}, "painted_lane"),
    ({"highway": "residential", "cycleway": "no"}, "none"),
    ({"highway": "footway", "bicycle": "designated"}, "none"),
    ({"highway": "primary"}, "none"),
])
def test_classify(tags, expected):
    assert osm.classify(tags) == expected


def test_separate_only():
    assert osm.separate_only({"highway": "primary", "cycleway:right": "separate"})
    assert not osm.separate_only({"highway": "primary", "cycleway:right": "separate", "cycleway:left": "track"})
    assert not osm.separate_only({"highway": "cycleway"})


def way(osm_id, coords, **tags):
    return {"type": "way", "id": osm_id, "tags": tags,
            "geometry": [{"lon": x, "lat": y} for x, y in coords]}


# Short east-west street near Heilbronn centre; about 0.0001 deg lat = 11 m.
STREET = [(9.2100, 49.1420), (9.2120, 49.1420)]


def segments(*coords_list):
    lines = [LineString(c) for c in coords_list]
    return gpd.GeoSeries(lines, crs="EPSG:4326").to_crs(config.METRIC_CRS)


def test_join_by_id_keeps_worst_class_and_highest_speed():
    ways = osm.ways_frame({"elements": [
        way(1, STREET, highway="primary", maxspeed="50", lanes="2", cycleway="track"),
        way(2, STREET, highway="primary", maxspeed="DE:zone30", lanes="3", cycleway="lane"),
    ]})
    out, report = osm.join(segments(STREET), pd.Series(["1,2"]), ways)
    row = out.iloc[0]
    assert row["infra_class"] == "painted_lane"
    assert row["maxspeed_kmh"] == 50
    assert row["lanes"] == 3
    assert row["highway"] == "primary"
    assert report["by_id"] == 1


def test_join_falls_back_to_nearest_within_10_m():
    near = [(x, y + 0.00005) for x, y in STREET]  # ~5.5 m north
    far = [(x, y + 0.0005) for x, y in STREET]  # ~55 m north
    ways = osm.ways_frame({"elements": [way(7, near, highway="residential", maxspeed="30")]})
    out, report = osm.join(segments(STREET, far), pd.Series(["999", None]), ways)
    assert out.iloc[0]["infra_class"] == "none"
    assert out.iloc[0]["maxspeed_kmh"] == 30
    assert pd.isna(out.iloc[1]["infra_class"])
    assert (report["by_id"], report["by_distance"], report["unmatched"]) == (0, 1, 1)


@pytest.mark.parametrize("cycleway_coords, expected", [
    ([(9.2100, 49.14209), (9.2120, 49.14209)], "separated"),  # parallel, ~10 m away
    ([(9.2110, 49.1415), (9.2110, 49.1425)], "none"),  # crossing at right angles
    ([(9.2100, 49.1424), (9.2120, 49.1424)], "none"),  # parallel but ~44 m away
])
def test_separate_needs_parallel_cycleway(cycleway_coords, expected):
    ways = osm.ways_frame({"elements": [
        way(1, STREET, highway="primary", maxspeed="50", **{"cycleway:right": "separate"}),
        way(2, cycleway_coords, highway="cycleway"),
    ]})
    out, _ = osm.join(segments(STREET), pd.Series(["1"]), ways)
    assert out.iloc[0]["infra_class"] == expected


def props(**kw):
    return {"infra_class": "none", "maxspeed_kmh": 50, "f_safety": 0.5, "f_surface": 0.1,
            "eligible": True, "rank": 1, **kw}


@pytest.mark.parametrize("kw, measure", [
    ({}, "protected"),
    ({"infra_class": "shared", "maxspeed_kmh": 70}, "protected"),
    ({"infra_class": "painted_lane"}, "upgrade"),
    ({"maxspeed_kmh": 30, "f_safety": 0.1}, "calming"),
    ({"infra_class": "separated", "f_surface": 0.7}, "resurface"),
    ({"infra_class": "separated"}, "check"),
    ({"infra_class": None, "maxspeed_kmh": None}, "check"),
    ({"infra_class": "separated", "eligible": False, "rank": None}, None),
])
def test_suggested_measure(kw, measure):
    expected = osm.MEASURES[measure] if measure else None
    assert osm.suggested_measure(props(**kw)) == expected


def test_add_measures_flags_top_quarter_without_protection():
    records = [props(rank=r, infra_class=c) for r, c in
               [(1, "none"), (2, "separated"), (3, "none"), (4, "painted_lane"), (5, "none"), (6, "none"),
                (7, "none"), (8, "none")]]
    records.append(props(eligible=False, rank=None))
    assert osm.add_measures(records) == 1  # cutoff 0.25 * 8 = 2: rank 1 only (rank 2 is separated)
    assert [p["infra_gap"] for p in records[:3]] == [True, False, False]
    assert records[0]["suggested_measure"] == osm.MEASURES["protected"]


def test_add_measures_skips_data_without_osm_fields():
    records = [{"eligible": True, "rank": 1, "f_safety": 1, "f_surface": 0}]
    assert osm.add_measures(records) == 0
    assert "infra_gap" not in records[0]


def test_query_excludes_highways_and_uses_bbox():
    q = osm.query(49.1, 9.1, 49.2, 9.3)
    assert "motorway_link" in q and "steps" in q and "(49.10000,9.10000,49.20000,9.30000)" in q
    assert q.endswith("out tags geom;")
