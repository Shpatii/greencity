import pandas as pd
import pytest

from safelane import config, osm
from safelane.fuse import (_merge_twins, _undirected, add_osm, factors, parse_histogram, parse_list, pass_severity,
                           passes_excluded, path_name, share_below_150, shrink)


def metrics(**overrides):
    m = {"share_below_150": 0.5, "pass_severity": 0.5, "n_overtakes": 20, "danger_per_100m": 2.0,
         "roughness_norm": 0.2, "mean_pm_risk": 0.3, "traffic_flow": 0.6, "avg_speed_kmh": 15.0,
         "length_m": 80.0, "passes_excluded": None}
    m.update(overrides)
    return m


@pytest.mark.parametrize("value", ["0, 4, 7, 0, 0", "[0, 4, 7, 0, 0]", "(0, 4, 7, 0, 0)", [0, 4, 7, 0, 0]])
def test_parse_histogram_formats(value):
    assert parse_histogram(value) == [0, 4, 7, 0, 0]


@pytest.mark.parametrize("value", [None, float("nan"), ""])
def test_parse_histogram_missing_is_zeros(value):
    assert parse_histogram(value) == [0, 0, 0, 0, 0]


def test_parse_histogram_rejects_wrong_bin_count():
    with pytest.raises(ValueError):
        parse_histogram("1, 2, 3")


def test_share_below_150_hand_example():
    # 0-50: 1, 50-100: 2, 100-150: 3, 150-200: 4, >200: 10 -> 6 of 20 below 150 cm
    assert share_below_150([1, 2, 3, 4, 10]) == pytest.approx(0.3)


def test_share_below_150_no_overtakes_is_none():
    assert share_below_150([0, 0, 0, 0, 0]) is None


def test_pass_severity_weights_closer_passes_more():
    # 0-50: 1 x 1.0, 50-100: 2 x 0.67, 100-150: 3 x 0.33, rest 0 -> 3.33 / 20
    assert pass_severity([1, 2, 3, 4, 10]) == pytest.approx(3.33 / 20)
    assert pass_severity([4, 0, 0, 0, 0]) == 1.0
    assert pass_severity([0, 0, 4, 0, 0]) == pytest.approx(0.33)
    assert pass_severity([0, 0, 0, 0, 0]) is None


def test_f_flow_is_one_minus_traffic_flow():
    f, _ = factors(metrics(traffic_flow=0.64), danger_p95=4.0, city_severity=0.5)
    assert f["f_flow"] == pytest.approx(0.36)


def test_factor_rules():
    f, missing = factors(metrics(), danger_p95=4.0, city_severity=0.5)
    assert f == pytest.approx({"f_safety": 0.5, "f_danger": 0.5, "f_surface": 0.2, "f_air": 0.3, "f_flow": 0.4})
    assert missing == []


def test_f_danger_capped_at_one():
    f, _ = factors(metrics(danger_per_100m=10.0), danger_p95=4.0, city_severity=0.5)
    assert f["f_danger"] == 1.0


def test_missing_metrics_give_zero_factor_and_missing_key():
    f, missing = factors(metrics(pass_severity=None, traffic_flow=None, danger_per_100m=None), danger_p95=4.0,
                         city_severity=0.5)
    assert missing == ["safety", "danger", "flow"]
    assert f["f_safety"] == f["f_danger"] == f["f_flow"] == 0.0
    assert f["f_surface"] == 0.2


def test_zero_metric_is_not_missing():
    f, missing = factors(metrics(danger_per_100m=0.0, traffic_flow=1.0), danger_p95=4.0, city_severity=0.5)
    assert missing == []
    assert f["f_danger"] == 0.0 and f["f_flow"] == 0.0


def test_list_name_takes_first_street():
    assert parse_list("['Saarlandstraße', 'Peter-Bruckmann-Brücke']")[0] == "Saarlandstraße"
    assert parse_list("Theodor-Heuss-Straße") == ["Theodor-Heuss-Straße"]


def test_path_name():
    assert path_name("Austraße") == "Path along Austraße"
    assert path_name("Austraße", "footway") == "Path along Austraße"
    assert path_name("Austraße", "service") == "Service road off Austraße"


def test_shrink_pulls_small_samples_to_city_value():
    # one pass at severity 1: (1 + 10 * 0.4) / (1 + 10)
    assert shrink(1.0, 1, 0.4) == pytest.approx(5 / 11)
    # 20 passes at 0.75: (15 + 4) / 30
    assert shrink(0.75, 20, 0.4) == pytest.approx(19 / 30)


def test_shrink_large_sample_stays_close_to_raw():
    assert abs(shrink(0.8, 1000, 0.4) - 0.8) < 0.005


def test_f_safety_is_shrunk_pass_severity():
    f, _ = factors(metrics(pass_severity=1.0, n_overtakes=20), danger_p95=4.0, city_severity=0.4)
    assert f["f_safety"] == pytest.approx((20 + 4) / 30)


@pytest.mark.parametrize("overrides, car_free, reason", [
    ({}, False, None),
    ({}, True, "car_free"),
    ({"avg_speed_kmh": config.STATIONARY_SPEED_KMH - 0.1}, False, "stationary"),
    ({"avg_speed_kmh": None}, False, None),  # no speed data: nothing says the riders stood
    ({"length_m": config.MIN_PASS_LENGTH_M - 0.1}, False, "short"),
    ({"n_overtakes": config.MIN_OVERTAKES - 1}, False, "few_overtakes"),
    ({"n_overtakes": 0, "danger_per_100m": 3.0}, False, "few_overtakes"),  # danger points without passes
    ({"n_overtakes": 0, "danger_per_100m": None}, False, None),  # no pass data at all
    ({"n_overtakes": 0, "danger_per_100m": 0.0, "length_m": 5.0}, False, None),
])
def test_passes_excluded(overrides, car_free, reason):
    assert passes_excluded(metrics(**overrides), car_free=car_free) == reason


def test_excluded_passes_make_safety_and_danger_missing():
    f, missing = factors(metrics(passes_excluded="stationary"), danger_p95=4.0, city_severity=0.5)
    assert missing == ["safety", "danger"]
    assert f["f_safety"] == f["f_danger"] == 0.0
    assert f["f_surface"] == 0.2 and f["f_flow"] == pytest.approx(0.4)


def test_undirected_maps_both_directions_to_lowest_row():
    base = pd.DataFrame({"index": ["(1, 2, 0)", "(2, 1, 0)", "(2, 3, 0)", "(1, 2, 1)"]})
    assert _undirected(base).tolist() == [0, 0, 2, 3]


def test_merge_twins_counts_repeated_measurement_once():
    canon = pd.Series([0, 0, 2], index=[0, 1, 2])
    layer = pd.DataFrame({"seg": [0, 1, 1, 2], "v": [5, 5, 7, 5]})
    merged = _merge_twins(layer, canon, ["v"])
    assert sorted(zip(merged["seg"], merged["v"])) == [(0, 5), (0, 7), (2, 5)]


def test_export_coords_never_collapse_short_lines():
    from shapely.geometry import LineString

    from safelane.export import _coords
    assert _coords(LineString([(9.123451, 49.1), (9.123453, 49.1)])) == [[9.123451, 49.1], [9.123453, 49.1]]
    assert _coords(LineString([(9.1, 49.1), (9.2, 49.2)])) == [[9.1, 49.1], [9.2, 49.2]]


def test_add_osm_without_cache_raises(monkeypatch):
    monkeypatch.setattr(osm, "load_cached", lambda: None)
    with pytest.raises(FileNotFoundError, match="osm_overpass.json"):
        add_osm(None, [{"id": "seg_000001"}])


def test_add_osm_without_cache_allowed_publishes_null_fields(monkeypatch):
    monkeypatch.setattr(osm, "load_cached", lambda: None)
    rows = [{"id": "seg_000001"}]
    meta, report = add_osm(None, rows, allow_missing=True)
    assert meta["osm_fetched_at"] is None and report is None
    assert rows[0]["infra_class"] is None and rows[0]["highway"] is None
