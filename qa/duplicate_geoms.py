"""QA extra: segments that share the same geometry (e.g. both directions of a two-way OSM edge).

    python qa/duplicate_geoms.py

Standard library only. Two features are duplicates when their coordinate lists are equal
or equal after reversal. On the map, the later feature is drawn on top and wins clicks.
"""
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
feats = json.loads((ROOT / "data/out/segments.geojson").read_text())["features"]
groups = defaultdict(list)
for i, f in enumerate(feats):
    c = [tuple(p) for p in f["geometry"]["coordinates"]]
    groups[min(tuple(c), tuple(reversed(c)))].append(i)
dups = [g for g in groups.values() if len(g) > 1]
in_dup = {i for g in dups for i in g}
P = [f["properties"] for f in feats]
top10 = {i for i, p in enumerate(P) if p["rank"] and p["rank"] <= 10}
print(f"{len(feats)} features, {len(dups)} duplicate-geometry groups, {len(in_dup)} features involved "
      f"({len(in_dup) / len(feats):.1%})")
print(f"top-10 segments with a geometry twin: {len(top10 & in_dup)}")
for g in dups:
    if top10 & set(g):
        print("  " + " | ".join(f"{P[i]['id']} rank={P[i]['rank']} score={P[i]['score']} n_pts={P[i]['n_points']} "
                                f"n_ovt={P[i]['n_overtakes']} drawn_on_top={i == max(g)}" for i in g))
both_ranked = [g for g in dups if all(P[i]["rank"] for i in g)]
print(f"groups where every twin is ranked (same street listed twice): {len(both_ranked)}")
print(f"top-10 segments hidden under a twin on the map: "
      f"{sum(1 for g in dups for i in g if i in top10 and i != max(g))}")
