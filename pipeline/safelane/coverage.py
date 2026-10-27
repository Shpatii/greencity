"""P3: how much data do segments have? Helps pick min_points and confidence_n.

    python -m safelane.coverage PATH

PATH is a segments.geojson (or the directory holding it). Prints a histogram of
n_points and suggests:
  min_points   = largest candidate that still leaves at least 80% of the
                 segments with any data (n_points > 0) eligible
  confidence_n = median n_points among segments with n_points >= min_points
"""
import argparse
import json
import statistics
from pathlib import Path

from safelane import config

BINS = [(0, 0), (1, 4), (5, 9), (10, 19), (20, 29), (30, 49), (50, 99), (100, None)]
MIN_POINTS_CANDIDATES = (3, 5, 8, 10, 15, 20)
BAR_WIDTH = 40
KEEP_SHARE = 0.8


def load_n_points(path):
    path = Path(path)
    if path.is_dir():
        path = path / "segments.geojson"
    features = json.loads(path.read_text(encoding="utf-8"))["features"]
    return [int(f["properties"]["n_points"]) for f in features]


def histogram(n_points):
    counts = [sum(1 for n in n_points if lo <= n and (hi is None or n <= hi)) for lo, hi in BINS]
    peak = max(counts) or 1
    lines = []
    for (lo, hi), count in zip(BINS, counts):
        label = f"{lo}+" if hi is None else (str(lo) if lo == hi else f"{lo}-{hi}")
        bar = "#" * round(BAR_WIDTH * count / peak)
        lines.append(f"  {label:>7} | {count:5d} {bar}")
    return lines


def suggest(n_points):
    """Return (min_points, confidence_n, table of (candidate, n_eligible))."""
    with_data = [n for n in n_points if n > 0]
    table = [(m, sum(1 for n in n_points if n >= m)) for m in MIN_POINTS_CANDIDATES]
    ok = [m for m, n_eligible in table if n_eligible >= KEEP_SHARE * len(with_data)]
    min_points = max(ok) if ok else MIN_POINTS_CANDIDATES[0]
    above = [n for n in n_points if n >= min_points]
    confidence_n = round(statistics.median(above)) if above else config.CONFIDENCE_N
    return min_points, confidence_n, table


def main(argv=None):
    parser = argparse.ArgumentParser(description="n_points histogram + threshold suggestions")
    parser.add_argument("path", help="segments.geojson or the directory holding it")
    args = parser.parse_args(argv)

    n_points = load_n_points(args.path)
    if not n_points:
        print(f"{args.path}: no features")
        return 1
    print(f"{args.path}: {len(n_points)} segments, n_points median "
          f"{statistics.median(n_points):g}, max {max(n_points)}")
    print("\n".join(histogram(n_points)))

    min_points, confidence_n, table = suggest(n_points)
    print("\n  min_points -> eligible segments")
    for m, n_eligible in table:
        print(f"  {m:>10} -> {n_eligible:5d} ({n_eligible / len(n_points):.0%})")
    print(f"\nSuggested: min_points {min_points}, confidence_n {confidence_n} "
          f"(current config: {config.MIN_POINTS}, {config.CONFIDENCE_N})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
