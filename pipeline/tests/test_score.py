import json
from pathlib import Path

import pandas as pd
import pytest

from safelane import config
from safelane.score import FACTORS, apply_scores, reason_texts
from tests.test_contract import EXAMPLE_FEATURE

CASES_PATH = Path(__file__).resolve().parents[2] / "contract" / "fixtures" / "score_cases.json"
CASES = json.loads(CASES_PATH.read_text(encoding="utf-8"))


def segment(n_points, factor=1.0, **overrides):
    props = {**EXAMPLE_FEATURE["properties"], "n_points": n_points, "missing": []}
    props.update({f"f_{k}": factor for k in FACTORS})
    props.update(overrides)
    return props


def score_one(props, **kwargs):
    return apply_scores(pd.DataFrame([props]), **kwargs).iloc[0]


def test_contract_example_scores_49_9():
    row = score_one(EXAMPLE_FEATURE["properties"])
    assert row["confidence"] == 1.0
    assert row["eligible"]
    assert row["score"] == 49.9
    assert row["rank"] == 1


def test_all_ones_with_enough_points_gives_100():
    assert score_one(segment(config.CONFIDENCE_N))["score"] == 100.0
    assert score_one(segment(config.CONFIDENCE_N + 50))["score"] == 100.0


def test_below_min_points_not_eligible():
    row = score_one(segment(config.MIN_POINTS - 1))
    assert not row["eligible"]
    assert row["score"] is None
    assert row["rank"] is None


def test_confidence_half():
    row = score_one(segment(15), confidence_n=30)
    assert row["confidence"] == 0.5
    assert row["score"] == 50.0


def test_weights_must_sum_to_one():
    with pytest.raises(ValueError):
        score_one(segment(30), weights={**config.DEFAULT_WEIGHTS, "flow": 0.2})


def test_rank_ties_by_n_points_then_id():
    df = pd.DataFrame([
        segment(40, factor=0.5, id="seg_b"),
        segment(40, factor=0.5, id="seg_a"),
        segment(60, factor=0.5, id="seg_c"),
        segment(40, factor=0.9, id="seg_d"),
        segment(2, factor=1.0, id="seg_e"),
    ])
    scored = apply_scores(df)
    ranks = dict(zip(scored["id"], scored["rank"]))
    assert ranks == {"seg_d": 1, "seg_c": 2, "seg_a": 3, "seg_b": 4, "seg_e": None}


def test_reason_texts_only_for_factors_with_data():
    props = {**EXAMPLE_FEATURE["properties"], "missing": ["surface"], "roughness_norm": None}
    texts = reason_texts(props)
    assert set(texts) == {"safety", "danger", "air", "flow"}
    assert texts["safety"] == "58% of 24 overtakes were closer than 150 cm"
    assert texts["danger"] == "3.6 close-overtake danger points per 100 m"
    assert texts["air"] == "elevated fine-dust risk (0.31 of 1)"
    assert texts["flow"] == "stop-and-go traffic (flow 0.64 of 1)"


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
def test_score_cases_fixture(case):
    row = score_one({**segment(0), **case["props"]}, weights=case["weights"], **case["meta"])
    assert bool(row["eligible"]) == case["expected"]["eligible"]
    assert row["confidence"] == case["expected"]["confidence"]
    assert row["score"] == case["expected"]["score"]


def test_fixture_has_ten_cases():
    assert len(CASES) == 10
