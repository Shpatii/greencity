"""python run.py [--ingest] [--fuse] [--score] [--report] [--counters] [--publish] [--all] [--basemap]"""

import argparse

import requests

from safelane import basemap, counters, export, fuse, ingest, osm, report, score


def main():
    parser = argparse.ArgumentParser(description="SafeLane HN pipeline")
    parser.add_argument("--ingest", action="store_true", help="download + cache to data/raw/ (ATRAI + OSM Overpass)")
    parser.add_argument("--fuse", action="store_true", help="one row per segment, raw metrics + f_* factors")
    parser.add_argument("--score", action="store_true", help="confidence, eligible, score, rank, reason_texts")
    parser.add_argument("--report", action="store_true", help="PDF priority list -> data/out/report.pdf")
    parser.add_argument("--counters", action="store_true",
                        help="MobiData BW bike counters in the bbox -> data/out/counters.geojson")
    parser.add_argument("--publish", action="store_true",
                        help="copy data/out/ to web/public/data/, report.pdf to web/public/")
    parser.add_argument("--all", action="store_true", help="run every step in order")
    parser.add_argument("--basemap", action="store_true",
                        help="self-hosted base map -> web/public/basemap/ (not part of --all; a few times a year)")
    parser.add_argument("--refresh", action="store_true", help="re-download data/raw/ even if cached")
    parser.add_argument("--base", choices=sorted(fuse.BASES), default="road_network",
                        help="base geometry for --fuse (bumpy_roads = fallback)")
    parser.add_argument("--allow-missing-osm", action="store_true",
                        help="offline development only: publish null OSM fields instead of failing")
    args = parser.parse_args()

    if not (args.ingest or args.fuse or args.score or args.report or args.counters or args.publish or args.all
            or args.basemap):
        parser.print_help()
        return

    if args.all or args.ingest:
        ingest.run(refresh=args.refresh)
        osm.run(refresh=args.refresh, allow_missing=args.allow_missing_osm)
    if args.all or args.fuse:
        fuse.run(base=args.base, allow_missing_osm=args.allow_missing_osm)
    if args.all or args.score:
        score.run()
    if args.all or args.report:
        report.run()
    if args.all or args.counters:
        try:
            counters.run(refresh=args.refresh)
        except requests.RequestException as e:
            # Context layer only: keep publishing the segments without it.
            print(f"  WARNING: MobiData request failed ({e}); counters.geojson not updated")
    if args.all or args.publish:
        export.run()
    if args.basemap:
        basemap.run()


if __name__ == "__main__":
    main()
