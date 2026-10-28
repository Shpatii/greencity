"""Publish gates for a fresh pipeline run (.github/workflows/data-refresh.yml).

    python qa/gates.py [--baseline REF]

Run from the repo root after `python run.py --all --refresh`. Every gate must pass before the
new data is committed; otherwise the job fails and the published data stays as it is.

  G1 contract   safelane.validate --mode full --expect-source atrai (includes OSM coverage)
  G2 recheck    qa/recheck_factors.py: factors recomputed independently from data/raw/
  G3 data       qa/check_data.py: no FAIL (A9 = at least 8 of the top 10 OK under S1-S4)
  G4 drift      n_eligible within +-MAX_ELIGIBLE_DRIFT of the published data at --baseline

Then reports whether any published output differs from the baseline. On GitHub
Actions it writes `changed=true|false` to $GITHUB_OUTPUT. Exit code 1 when a gate fails.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PUBLISHED = "web/public/data"
MAX_ELIGIBLE_DRIFT = 0.2
PUBLISHED_FILES = (
    f"{PUBLISHED}/segments.geojson",
    f"{PUBLISHED}/meta.json",
    f"{PUBLISHED}/counters.geojson",
    "web/public/report.pdf",
)


def run(label, cmd, cwd=ROOT):
    print(f"\n== {label}: {' '.join(cmd)}", flush=True)
    code = subprocess.run(cmd, cwd=cwd).returncode
    print(f"== {label}: {'PASS' if code == 0 else f'FAIL (exit {code})'}", flush=True)
    return code == 0


def at_baseline(ref, path):
    """File content at git ref, or None when it does not exist there."""
    out = subprocess.run(["git", "show", f"{ref}:{path}"], cwd=ROOT, capture_output=True)
    return out.stdout if out.returncode == 0 else None


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--baseline", default="HEAD", help="git ref of the published data (default HEAD)")
    args = ap.parse_args(argv)
    py = sys.executable

    ok = run("G1 contract", [py, "-m", "safelane.validate", f"../{PUBLISHED}", "--mode", "full",
                             "--expect-source", "atrai"], cwd=ROOT / "pipeline")
    ok &= run("G2 recheck", [py, "qa/recheck_factors.py"])
    ok &= run("G3 data", [py, "qa/check_data.py"])

    meta = json.loads((ROOT / PUBLISHED / "meta.json").read_text(encoding="utf-8"))
    old_meta = at_baseline(args.baseline, f"{PUBLISHED}/meta.json")
    print("\n== G4 drift")
    if old_meta is None:
        print(f"no published meta.json at {args.baseline}; skipped")
    else:
        old, new = json.loads(old_meta)["n_eligible"], meta["n_eligible"]
        drift = abs(new - old) / old if old else 1.0
        g4 = drift <= MAX_ELIGIBLE_DRIFT
        print(f"n_eligible {old} -> {new} ({drift:+.1%} of {MAX_ELIGIBLE_DRIFT:.0%} allowed): "
              f"{'PASS' if g4 else 'FAIL'}")
        ok &= g4

    changed_files = []
    for path in PUBLISHED_FILES:
        current = ROOT / path
        content = current.read_bytes() if current.exists() else None
        if at_baseline(args.baseline, path) != content:
            changed_files.append(path)
    changed = bool(changed_files)
    print(f"\nPublished outputs {'changed' if changed else 'unchanged'} since {args.baseline}")
    for path in changed_files:
        print(f"  {path}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
            f.write(f"changed={'true' if changed and ok else 'false'}\n")

    print(f"\nGATES: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
