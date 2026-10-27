"""P3: check output against the contract.

    python -m safelane.validate PATH [--mode factors-only|full]

PATH is a segments.geojson (or the directory holding it); meta.json is read from
the same directory in full mode. factors-only checks P1's output before scoring
(I3); full checks scored data (I2, I4). Exit code 1 on any failure.
"""
import argparse
import copy
import json
import math
import sys
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator

from safelane.score import FACTORS

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "contract" / "segment.schema.json"
SCORE_FIELDS = ("confidence", "eligible", "score", "rank", "reason_texts")
MAX_SHOWN = 20


def load_schema(mode):
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    if mode == "factors-only":
        schema = copy.deepcopy(schema)
        schema["required"] = [k for k in schema["required"] if k not in SCORE_FIELDS]
    return schema


def check_features(features, mode):
    """Per-feature checks; returns a list of error strings."""
    validator = Draft202012Validator(load_schema(mode))
    errors = []
    ids = Counter()
    for n, feature in enumerate(features):
        props = feature.get("properties") or {}
        fid = props.get("id", f"#{n}")
        ids[fid] += 1

        geom_type = (feature.get("geometry") or {}).get("type")
        if geom_type != "LineString":
            errors.append(f"{fid}: geometry is {geom_type}, expected LineString")

        for error in validator.iter_errors(props):
            path = "/".join(str(p) for p in error.absolute_path) or "(root)"
            errors.append(f"{fid}: schema at {path}: {error.message}")

        for key in FACTORS:
            value = props.get(f"f_{key}")
            # Explicit check: jsonschema lets NaN through minimum/maximum.
            if not isinstance(value, (int, float)) or math.isnan(value) or not 0 <= value <= 1:
                errors.append(f"{fid}: f_{key} = {value!r} not in [0, 1]")
        for key in props.get("missing") or []:
            if key in FACTORS and props.get(f"f_{key}") != 0:
                errors.append(f"{fid}: '{key}' in missing but f_{key} = {props.get(f'f_{key}')!r}")

        if mode == "full":
            eligible, score = props.get("eligible"), props.get("score")
            if (score is None) == bool(eligible):
                errors.append(f"{fid}: score is {score!r} but eligible is {eligible!r}")

    errors += [f"{fid}: id appears {count} times" for fid, count in ids.items() if count > 1]
    return errors


def check_ranks_and_meta(features, meta):
    errors = []
    props = [f.get("properties") or {} for f in features]
    eligible = [p for p in props if p.get("eligible") is True]
    ranks = sorted(p.get("rank") for p in eligible if isinstance(p.get("rank"), int))
    expected = list(range(1, len(eligible) + 1))
    if ranks != expected:
        errors.append(f"ranks of eligible segments are not exactly 1..{len(eligible)} "
                      f"({len(ranks)} ranked, {len(set(ranks))} distinct)")
    if meta is None:
        errors.append("meta.json not found next to segments.geojson")
        return errors
    if meta.get("n_segments") != len(props):
        errors.append(f"meta.n_segments = {meta.get('n_segments')}, file has {len(props)}")
    if meta.get("n_eligible") != len(eligible):
        errors.append(f"meta.n_eligible = {meta.get('n_eligible')}, file has {len(eligible)}")
    return errors


def validate(path, mode="full"):
    """Return (features, errors) for the segments.geojson at path."""
    path = Path(path)
    if path.is_dir():
        path = path / "segments.geojson"
    features = json.loads(path.read_text(encoding="utf-8")).get("features", [])
    errors = check_features(features, mode)
    if mode == "full":
        meta_path = path.parent / "meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else None
        errors += check_ranks_and_meta(features, meta)
    return features, errors


def main(argv=None):
    parser = argparse.ArgumentParser(description="Check segments.geojson against the contract")
    parser.add_argument("path", help="segments.geojson or the directory holding it")
    parser.add_argument("--mode", choices=["factors-only", "full"], default="full")
    args = parser.parse_args(argv)

    features, errors = validate(args.path, args.mode)
    n_eligible = sum(1 for f in features if (f.get("properties") or {}).get("eligible") is True)
    print(f"{args.path} ({args.mode}): {len(features)} features"
          + (f", {n_eligible} eligible" if args.mode == "full" else ""))
    for error in errors[:MAX_SHOWN]:
        print(f"  FAIL {error}")
    if len(errors) > MAX_SHOWN:
        print(f"  ... and {len(errors) - MAX_SHOWN} more")
    print(f"FAILED: {len(errors)} problem(s)" if errors else "OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
