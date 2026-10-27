"""python run.py [--ingest] [--fuse] [--score] [--publish] [--all]"""

import argparse

from safelane import export, fuse, ingest, score


def main():
    parser = argparse.ArgumentParser(description="SafeLane HN pipeline")
    parser.add_argument("--ingest", action="store_true", help="download + cache to data/raw/")
    parser.add_argument("--fuse", action="store_true", help="one row per segment, raw metrics + f_* factors")
    parser.add_argument("--score", action="store_true", help="confidence, eligible, score, rank, reason_texts")
    parser.add_argument("--publish", action="store_true", help="write data/out/, copy to web/public/data/")
    parser.add_argument("--all", action="store_true", help="run every step in order")
    args = parser.parse_args()

    if not (args.ingest or args.fuse or args.score or args.publish or args.all):
        parser.print_help()
        return

    if args.all or args.ingest:
        ingest.run()
    if args.all or args.fuse:
        fuse.run()
    if args.all or args.score:
        score.run()
    if args.all or args.publish:
        export.run()


if __name__ == "__main__":
    main()
