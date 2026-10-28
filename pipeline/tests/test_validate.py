from safelane.validate import check_osm


def features(*infra_classes):
    return [{"properties": {"infra_class": c}} for c in infra_classes]


META = {"osm_fetched_at": "2026-10-28T16:00:00Z"}


def test_check_osm_passes_with_full_coverage():
    assert check_osm(features("none", "separated", "painted_lane"), META) == []


def test_check_osm_fails_without_fetch_timestamp():
    errors = check_osm(features("none"), {"osm_fetched_at": None})
    assert len(errors) == 1 and "osm_fetched_at" in errors[0]


def test_check_osm_fails_below_min_coverage():
    errors = check_osm(features("none", None, None, None), META, min_coverage=0.9)
    assert len(errors) == 1 and "25.0%" in errors[0]


def test_check_osm_null_fields_everywhere_is_the_failed_overpass_case():
    errors = check_osm(features(None, None), {"osm_fetched_at": None})
    assert len(errors) == 2


def test_excluded_passes_must_be_missing():
    from safelane.validate import check_features
    props = {"id": "seg_000001", "passes_excluded": "stationary", "missing": ["danger"],
             **{f"f_{k}": 0.0 for k in ("safety", "danger", "surface", "air", "flow")}}
    errors = check_features([{"geometry": {"type": "LineString"}, "properties": props}], "factors-only")
    assert any("passes_excluded = 'stationary'" in e for e in errors)
