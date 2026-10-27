"""P1: download + cache to data/raw/."""

import ast
import json
import time
from collections import Counter
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from safelane import config

RAW_DIR = Path(__file__).resolve().parents[2] / "data" / "raw"
USER_AGENT = "safelane-hn-hackathon"
TIMEOUT = (10, 60)  # connect, read (seconds)
FULL_LOAD_MAX_S = 60  # limit=0 slower than this -> fall back to paging
PAGE_SIZE = 1000
CAMPAIGN = "heilbronn"


def _session(retries):
    s = requests.Session()
    s.headers["User-Agent"] = USER_AGENT
    retry = Retry(
        total=retries,
        backoff_factor=1,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s


def _get_json(session, path, params=None, max_seconds=None):
    """GET {ATRAI_BASE}{path} as JSON; with max_seconds, abort if the whole body takes longer."""
    start = time.monotonic()
    with session.get(f"{config.ATRAI_BASE}{path}", params=params, timeout=TIMEOUT, stream=True) as r:
        r.raise_for_status()
        chunks = []
        for chunk in r.iter_content(chunk_size=1 << 16):
            chunks.append(chunk)
            if max_seconds and time.monotonic() - start > max_seconds:
                raise TimeoutError(f"{path} took more than {max_seconds} s")
    return json.loads(b"".join(chunks))


def _features(payload, path):
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        raise ValueError(f"{path}: expected a GeoJSON FeatureCollection")
    return payload["features"]


def _download_collection(name, retrying, single_shot):
    """Return (features, mode). Try limit=0 once, then page with limit=PAGE_SIZE."""
    path = f"/collections/{name}/items"
    try:
        payload = _get_json(single_shot, path, {"limit": 0}, max_seconds=FULL_LOAD_MAX_S)
        return _features(payload, path), "limit=0"
    except (requests.RequestException, TimeoutError, ValueError) as e:
        print(f"  {name}: limit=0 failed ({e}); paging by {PAGE_SIZE}")

    features, offset = [], 0
    while True:
        page = _features(_get_json(retrying, path, {"limit": PAGE_SIZE, "offset": offset}), path)
        features.extend(page)
        offset += len(page)
        if len(page) < PAGE_SIZE:
            return features, "paged"


def _write_json(path, obj):
    tmp = path.with_suffix(path.suffix + ".part")
    tmp.write_text(json.dumps(obj, ensure_ascii=False))
    tmp.replace(path)


def _parsed_type(value):
    """Type name a string parses to as JSON or a Python literal, else None."""
    for parse in (json.loads, ast.literal_eval):
        try:
            return type(parse(value)).__name__
        except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
            continue
    return None


def _looks_structured(value):
    """True for strings like "[1, 2]", "{'a': 1}", "(1, 2, 0)" or "0, 4, 7, 0, 0"."""
    return isinstance(value, str) and _parsed_type(value) in ("list", "tuple", "dict", "set")


def _cell(value, limit=120):
    text = json.dumps(value, ensure_ascii=False)
    if len(text) > limit:
        text = text[:limit] + "…"
    return text.replace("|", "\\|")


def _inspect_section(name, features):
    geom = Counter((f.get("geometry") or {}).get("type") for f in features)
    keys, non_null, ranges = {}, Counter(), {}
    for f in features:
        for k, v in (f.get("properties") or {}).items():
            keys.setdefault(k, None)
            if v is not None:
                non_null[k] += 1
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                lo, hi = ranges.get(k, (v, v))
                ranges[k] = (min(lo, v), max(hi, v))
    first = (features[0].get("properties") or {}) if features else {}

    lines = [
        f"## {name}",
        "",
        f"- Features: {len(features)}",
        f"- Geometry: {', '.join(f'{t} ({n})' for t, n in geom.most_common()) or 'none'}",
        f"- Property keys: {len(keys)}",
        "",
        "| Key | Non-null | Numeric min–max | First feature type | First feature value |",
        "|---|---|---|---|---|",
    ]
    for k in keys:
        v = first.get(k)
        span = f"{ranges[k][0]:g} – {ranges[k][1]:g}" if k in ranges else ""
        lines.append(f"| `{k}` | {non_null[k]} | {span} | {type(v).__name__} | {_cell(v)} |")

    structured = [k for k in keys if _looks_structured(first.get(k))]
    if structured:
        lines += ["", "List/dict-like strings in the first feature:", ""]
        for k in structured:
            v = first[k]
            lines += [
                f"- `{k}`: Python type `{type(v).__name__}`, parses as `{_parsed_type(v)}`, raw string:",
                "",
                "  ```text",
                f"  {v}",
                "  ```",
            ]
    return lines, geom, len(keys)


def run(refresh=False):
    print("ingest")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    retrying, single_shot = _session(retries=3), _session(retries=0)

    rows, sections = [], []
    for key, name in config.COLLECTIONS.items():
        out = RAW_DIR / f"{name}.geojson"
        start = time.monotonic()
        if out.exists() and not refresh:
            features, mode = _features(json.loads(out.read_text()), str(out)), "cached"
        else:
            features, mode = _download_collection(name, retrying, single_shot)
            _write_json(out, {"type": "FeatureCollection", "features": features})
        lines, geom, n_keys = _inspect_section(name, features)
        sections += lines + [""]
        rows.append((key, name, len(features), "/".join(t or "None" for t in geom), n_keys, mode, time.monotonic() - start))

    campaign_out = RAW_DIR / f"campaign_{CAMPAIGN}.json"
    if refresh or not campaign_out.exists():
        _write_json(campaign_out, _get_json(retrying, f"/campaigns/{CAMPAIGN}"))
        campaign_mode = "downloaded"
    else:
        campaign_mode = "cached"

    inspect = RAW_DIR / "INSPECT.md"
    header = [
        "# Raw data inspection",
        "",
        f"Generated by `pipeline/safelane/ingest.py` from {config.ATRAI_BASE}. "
        "Property keys are shown exactly as the API returns them.",
        "",
    ]
    inspect.write_text("\n".join(header + sections))

    print(f"\n{'key':<13} {'collection':<31} {'features':>8}  {'geometry':<16} {'keys':>4}  {'source':<8} {'s':>5}")
    for key, name, n, geom, n_keys, mode, secs in rows:
        print(f"{key:<13} {name:<31} {n:>8}  {geom:<16} {n_keys:>4}  {mode:<8} {secs:>5.1f}")
    print(f"\ncampaign_{CAMPAIGN}.json: {campaign_mode}")
    print(f"Wrote {inspect}")
