import copy
import json

from safelane import config, report
from tests.test_contract import EXAMPLE_FEATURE

N_SEGMENTS = 25


def write_inputs(out_dir, stats=True):
    features = []
    for i in range(N_SEGMENTS):
        f = copy.deepcopy(EXAMPLE_FEATURE)
        f["properties"].update({"id": f"seg_{i:06d}", "rank": i + 1, "score": 80.0 - i,
                                "name": "Bärenstraße" if i == 0 else f"Street {i}"})
        features.append(f)
    (out_dir / "segments.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    meta = {"city": "heilbronn", "generated_at": "2026-10-27T15:30:00+01:00", "n_segments": N_SEGMENTS,
            "min_points": config.MIN_POINTS, "confidence_n": config.CONFIDENCE_N,
            "default_weights": config.DEFAULT_WEIGHTS}
    (out_dir / "meta.json").write_text(json.dumps(meta), encoding="utf-8")
    if stats:
        (out_dir / "stats.json").write_text(
            json.dumps({"n_segments": N_SEGMENTS, "n_eligible": N_SEGMENTS, "n_with_overtakes": 3}))


def test_report_pdf_is_created(tmp_path):
    write_inputs(tmp_path)
    path = report.build(tmp_path)
    assert path == tmp_path / "report.pdf"
    assert path.read_bytes().startswith(b"%PDF")
    assert path.stat().st_size > 5 * 1024


def test_report_without_stats(tmp_path):
    write_inputs(tmp_path, stats=False)
    assert report.build(tmp_path).stat().st_size > 5 * 1024


def test_main_reason_is_largest_contribution():
    p = EXAMPLE_FEATURE["properties"]
    # Defaults: safety 0.35 x 0.58 = 0.203 beats danger 0.25 x 0.72 = 0.18.
    assert report.main_reason(p, config.DEFAULT_WEIGHTS) == p["reason_texts"]["safety"]
    air_heavy = {"safety": 0.05, "danger": 0.05, "surface": 0.05, "air": 0.8, "flow": 0.05}
    assert report.main_reason(p, air_heavy) == p["reason_texts"]["air"]


def test_source_line_skips_stats_from_other_data():
    meta = {"city": "heilbronn", "generated_at": "2026-10-27T15:30:00+01:00", "n_segments": 10}
    assert "7,850" not in report.source_line(meta, {"n_segments": 7850, "n_eligible": 1})
    assert "10 street segments" in report.source_line(meta, {"n_segments": 10})
