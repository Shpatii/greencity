import json
from pathlib import Path

from jsonschema import Draft202012Validator

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "contract" / "segment.schema.json"

# Example feature from CONTRACT.md section 3.2 (invented values, for shape only).
EXAMPLE_FEATURE = {
    "type": "Feature",
    "geometry": {"type": "LineString", "coordinates": [[9.2101, 49.1421], [9.2112, 49.1426]]},
    "properties": {
        "id": "seg_000123", "osm_id": "23456789", "name": "Example Street", "length_m": 84.2,
        "n_points": 41, "n_overtakes": 24, "share_below_150": 0.58, "avg_overtake_cm": 131.0,
        "danger_per_100m": 3.6, "mean_danger_risk": 0.47, "mean_pm_risk": 0.31,
        "roughness_norm": 0.22, "traffic_flow": 0.64, "avg_speed_kmh": 16.8,
        "f_safety": 0.58, "f_danger": 0.72, "f_surface": 0.22, "f_air": 0.31, "f_flow": 0.36,
        "missing": [], "confidence": 1.0, "eligible": True, "score": 49.9, "rank": 17,
        "reason_texts": {"safety": "58% of 24 overtakes were closer than 150 cm",
                         "danger": "3.6 close-overtake danger points per 100 m",
                         "air": "PM risk 0.31 (city scale 0-1)"},
    },
}


def test_example_feature_matches_schema():
    schema = json.loads(SCHEMA_PATH.read_text())
    Draft202012Validator.check_schema(schema)
    Draft202012Validator(schema).validate(EXAMPLE_FEATURE["properties"])
