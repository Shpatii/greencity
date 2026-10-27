import pytest

from safelane.fuse import factors, parse_histogram, parse_list, path_name, share_below_150


def metrics(**overrides):
    m = {"share_below_150": 0.5, "danger_per_100m": 2.0, "roughness_norm": 0.2,
         "mean_pm_risk": 0.3, "traffic_flow": 0.6}
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


def test_f_flow_is_one_minus_traffic_flow():
    f, _ = factors(metrics(traffic_flow=0.64), danger_p95=4.0)
    assert f["f_flow"] == pytest.approx(0.36)


def test_factor_rules():
    f, missing = factors(metrics(), danger_p95=4.0)
    assert f == pytest.approx({"f_safety": 0.5, "f_danger": 0.5, "f_surface": 0.2, "f_air": 0.3, "f_flow": 0.4})
    assert missing == []


def test_f_danger_capped_at_one():
    f, _ = factors(metrics(danger_per_100m=10.0), danger_p95=4.0)
    assert f["f_danger"] == 1.0


def test_missing_metrics_give_zero_factor_and_missing_key():
    f, missing = factors(metrics(share_below_150=None, traffic_flow=None, danger_per_100m=None), danger_p95=4.0)
    assert missing == ["safety", "danger", "flow"]
    assert f["f_safety"] == f["f_danger"] == f["f_flow"] == 0.0
    assert f["f_surface"] == 0.2


def test_zero_metric_is_not_missing():
    f, missing = factors(metrics(danger_per_100m=0.0, traffic_flow=1.0), danger_p95=4.0)
    assert missing == []
    assert f["f_danger"] == 0.0 and f["f_flow"] == 0.0


def test_list_name_takes_first_street():
    assert parse_list("['Saarlandstraße', 'Peter-Bruckmann-Brücke']")[0] == "Saarlandstraße"
    assert parse_list("Theodor-Heuss-Straße") == ["Theodor-Heuss-Straße"]


def test_path_name():
    assert path_name("Austraße") == "Path along Austraße"
