"""python run.py [--ingest] [--fuse] [--score] [--export] [--publish] [--all]

--all order:  ingest (cached) -> fuse -> score -> export -> validate --mode full -> publish
              Aborts before publish if validation finds any problem.
"""

import argparse
import sys

from safelane import export, fuse, ingest, score
from safelane import validate as _val_mod


def _validate_or_die():
    """Run full validation against data/out/; sys.exit(1) and do NOT publish on any error."""
    features, errors = _val_mod.validate(export.OUT_DIR, mode="full")
    n_eligible = sum(1 for f in features if (f.get("properties") or {}).get("eligible") is True)
    print(f"\nvalidate (full): {len(features)} segments, {n_eligible} eligible")
    if errors:
        for e in errors[:20]:
            print(f"  FAIL  {e}")
        if len(errors) > 20:
            print(f"  … and {len(errors) - 20} more")
        sys.exit(f"\nFAILED: {len(errors)} problem(s) — data NOT published")
    print("validate: OK")


def main():
    parser = argparse.ArgumentParser(
        description="SafeLane HN pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python run.py --all              # full pipeline, ingest uses cache\n"
            "  python run.py --all --refresh    # force re-download\n"
            "  python run.py --score --export   # re-score + write CSV/stats\n"
            "  python run.py --publish          # validate + compress + copy to web\n"
        ),
    )
    parser.add_argument("--ingest",  action="store_true", help="download + cache to data/raw/")
    parser.add_argument("--fuse",    action="store_true", help="per-segment metrics + f_* factors")
    parser.add_argument("--score",   action="store_true", help="confidence, eligible, score, rank")
    parser.add_argument("--export",  action="store_true", help="write ranking.csv and stats.json")
    parser.add_argument("--publish", action="store_true",
                        help="validate → compress GeoJSON to ≤5 MB → copy to web/public/data/")
    parser.add_argument("--all",     action="store_true", help="run every step in order")
    parser.add_argument("--refresh", action="store_true",
                        help="re-download data/raw/ even if cached (only effective with --ingest)")
    parser.add_argument("--base", choices=sorted(fuse.BASES), default="road_network",
                        help="base geometry for --fuse (default: road_network)")
    args = parser.parse_args()

    if not any([args.ingest, args.fuse, args.score, args.export, args.publish, args.all]):
        parser.print_help()
        return

    # ── 1. Ingest ──────────────────────────────────────────────────────────
    if args.all or args.ingest:
        # --all always uses cache; explicit --ingest respects --refresh
        ingest.run(refresh=args.refresh if args.ingest else False)

    # ── 2. Fuse ────────────────────────────────────────────────────────────
    if args.all or args.fuse:
        fuse.run(base=args.base)

    # ── 3. Score ───────────────────────────────────────────────────────────
    if args.all or args.score:
        score.run()

    # ── 4. Export: ranking.csv + stats.json ────────────────────────────────
    if args.all or args.export:
        export.run()

    # ── 5. Validate → 6. Publish ───────────────────────────────────────────
    if args.all or args.publish:
        _validate_or_die()
        export.publish()


if __name__ == "__main__":
    main()
