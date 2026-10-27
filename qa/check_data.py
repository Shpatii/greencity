"""QA A3, A4, A6, A7, A8, A9: data checks on data/out/ and web/public/data/.

    python qa/check_data.py

Standard library only; does not import safelane. Prints one RESULT line per check.
Score formula (CONTRACT.md 3.2), own implementation:
    c     = min(1, n_points / confidence_n)
    score = 100 * c * sum_k w_k f_k, rounded half up to 1 decimal
    eligible = n_points >= min_points; rank by (score desc, n_points desc, id asc)
"""
import hashlib
import json
import math
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"
WEB = ROOT / "web" / "public" / "data"
FACTORS = ("safety", "danger", "surface", "air", "flow")
LON, LAT = (9.0, 9.4), (48.95, 49.3)  # generous; task says lon ~9.1-9.3, lat ~49.0-49.25
MAX_BYTES = 5 * 1024 * 1024
results = []


def result(check, verdict, msg):
    results.append((check, verdict))
    print(f"RESULT {check}: {verdict} - {msg}")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    meta = json.loads((OUT / "meta.json").read_text())
    web_meta = json.loads((WEB / "meta.json").read_text())
    feats = json.loads((OUT / "segments.geojson").read_text())["features"]
    P = [f["properties"] for f in feats]

    # A3
    same = {n: sha(OUT / n) == sha(WEB / n) for n in ("segments.geojson", "meta.json")}
    for n in same:
        print(f"  sha256 {n}: out={sha(OUT / n)[:16]} web={sha(WEB / n)[:16]}")
    ok = meta["source"] == "atrai" and web_meta["source"] == "atrai" and all(same.values())
    result("A3", "PASS" if ok else "FAIL",
           f"source out={meta['source']} web={web_meta['source']}, identical={same}")

    # A4
    bad_geom, swapped, out_box, ids = [], [], [], {}
    lons, lats = [], []
    for f in feats:
        g, fid = f["geometry"], f["properties"]["id"]
        ids[fid] = ids.get(fid, 0) + 1
        c = g.get("coordinates") or []
        if g.get("type") != "LineString" or len(c) < 2 or any(len(p) != 2 for p in c) \
                or any(not all(math.isfinite(v) for v in p) for p in c) or len(set(map(tuple, c))) < 2:
            bad_geom.append(fid)
            continue
        for x, y in c:
            lons.append(x), lats.append(y)
            if LAT[0] <= x <= LAT[1] and LON[0] <= y <= LON[1]:
                swapped.append(fid)
                break
            if not (LON[0] <= x <= LON[1] and LAT[0] <= y <= LAT[1]):
                out_box.append(fid)
                break
    dup = [i for i, n in ids.items() if n > 1]
    size = (OUT / "segments.geojson").stat().st_size
    print(f"  {len(feats)} features; lon {min(lons):.4f}..{max(lons):.4f}, lat {min(lats):.4f}..{max(lats):.4f}")
    print(f"  invalid geometry {len(bad_geom)} {bad_geom[:5]}; swapped {len(swapped)}; "
          f"outside box {len(out_box)} {out_box[:5]}; duplicate ids {len(dup)}")
    print(f"  file size {size} bytes = {size / 1048576:.2f} MiB (limit 5 MiB)")
    geom_ok = not bad_geom and not swapped and not out_box and not dup
    in_task_range = 9.1 <= min(lons) and max(lons) <= 9.3 and 49.0 <= min(lats) and max(lats) <= 49.25
    if not geom_ok:
        result("A4", "FAIL", "geometry/id problems (see above)")
    elif size > MAX_BYTES:
        result("A4", "FAIL", f"geometry OK, no swap, no dup ids; but size {size / 1048576:.2f} MiB > 5 MiB")
    else:
        result("A4", "PASS" if in_task_range else "WARN", "geometry OK")
    if not in_task_range:
        print(f"  note: extent exceeds the task's nominal lon 9.1-9.3 (min lon {min(lons):.4f}); "
              "not a swap, lat/lon ordering is correct")

    # A6
    w, N, m = meta["default_weights"], meta["confidence_n"], meta["min_points"]
    mism = {"confidence": [], "eligible": [], "score": [], "rank": []}
    mine = {}
    for p in P:
        c = min(1.0, p["n_points"] / N)
        weighted = 0
        for k in FACTORS:
            weighted = weighted + w[k] * p[f"f_{k}"]
        raw = 100 * c * weighted
        score = math.floor(raw * 10 + 0.5 + 1e-6) / 10
        el = p["n_points"] >= m
        mine[p["id"]] = (score if el else None, el)
        if abs(round(c, 3) - p["confidence"]) > 1e-9:
            mism["confidence"].append((p["id"], round(c, 3), p["confidence"]))
        if el != p["eligible"]:
            mism["eligible"].append((p["id"], el, p["eligible"]))
        if (score if el else None) != p["score"]:
            mism["score"].append((p["id"], score if el else None, p["score"], raw))
    order = sorted((p for p in P if mine[p["id"]][1]),
                   key=lambda p: (-mine[p["id"]][0], -p["n_points"], p["id"]))
    my_rank = {p["id"]: r for r, p in enumerate(order, 1)}
    for p in P:
        if my_rank.get(p["id"]) != p["rank"]:
            mism["rank"].append((p["id"], my_rank.get(p["id"]), p["rank"]))
    n_el = sum(1 for p in P if p["eligible"])
    stored_ranks = sorted(p["rank"] for p in P if p["rank"] is not None)
    ranks_ok = stored_ranks == list(range(1, n_el + 1))
    ties = sum(1 for a, b in zip(order, order[1:]) if mine[a["id"]][0] == mine[b["id"]][0])
    for k, v in mism.items():
        print(f"  {k}: {len(v)} mismatches {v[:3]}")
    print(f"  stored ranks exactly 1..{n_el}: {ranks_ok}; adjacent score ties resolved by tie rule: {ties}")
    print(f"  meta.n_eligible={meta['n_eligible']} file={n_el}; weights={w}, sum={sum(w.values())}")
    a6 = ranks_ok and not any(mism.values()) and meta["n_eligible"] == n_el
    result("A6", "PASS" if a6 else "FAIL", f"{len(P)} features recomputed")

    # A7 (match share comes from recheck_factors.py)
    nps = [p["n_points"] for p in P]
    med_all = statistics.median(nps)
    med_el = statistics.median(p["n_points"] for p in P if p["eligible"])
    print(f"  n_eligible {n_el}; median n_points all {med_all:g}, eligible {med_el:g}")
    result("A7", "PASS" if n_el >= 50 else "WARN", f"n_eligible {n_el}, median n_points {med_all:g}")

    # A8: recompute every number in stats.json from segments.geojson (+ recheck_factors.py for matching)
    stats_path = OUT / "stats.json"
    if not stats_path.exists():
        result("A8", "FAIL", f"{stats_path.relative_to(ROOT)} does not exist")
    else:
        st = json.loads(stats_path.read_text())
        el = [p for p in P if p["eligible"]]
        scores = sorted(p["score"] for p in el)
        positive = sorted(p["danger_per_100m"] for p in P if p["danger_per_100m"])
        pos = (len(positive) - 1) * 0.95  # linear interpolation, like pandas.quantile
        lo_i = math.floor(pos)
        p95 = positive[lo_i] + (positive[min(lo_i + 1, len(positive) - 1)] - positive[lo_i]) * (pos - lo_i)
        with_ovt = [p for p in P if p["share_below_150"] is not None]
        city = sum(round(p["share_below_150"] * p["n_overtakes"]) for p in with_ovt) / sum(p["n_overtakes"] for p in with_ovt)
        bands = {}
        for lo, hi in zip((0, 20, 40, 60, 80), (20, 40, 60, 80, 100.1)):
            bands[f"{lo}-{min(hi, 100):g}"] = sum(1 for x in scores if lo <= x < hi)
        mine_stats = {
            "n_segments": len(P),
            "n_points.median": statistics.median(nps),
            **{f"n_points.ge_{t}": sum(n >= t for n in nps) for t in (1, 5, 10, 30)},
            "n_with_overtakes": len(with_ovt),
            "danger_p95": round(p95, 3),
            "city_share_below_150": round(city, 4),
            "n_eligible": len(el),
            "score.max": max(scores),
            "score.median": statistics.median(scores),
            **{f"score.bands.{k}": v for k, v in bands.items()},
            "top10": [p["id"] for p in sorted(el, key=lambda p: p["rank"])[:10]],
        }
        a5 = ROOT / "qa" / "logs" / "a5_factors.json"
        if a5.exists():
            mine_stats["match.overtaking.matched"] = json.loads(a5.read_text())["overtaking_matched"][0]

        def get(path):
            v = st
            for part in path.split(".") if not path.startswith("score.bands.") else ["score", "bands", path[12:]]:
                v = v[part]
            return v

        diffs = [(k, v, get(k)) for k, v in mine_stats.items()
                 if not (isinstance(v, float) and abs(v - get(k)) < 1e-9) and v != get(k)]
        unchecked = ["n_base_edges", "n_twins_merged", "match.* except overtaking.matched"]
        print(f"  stats.json: {len(mine_stats)} numbers recomputed, {len(diffs)} differ {diffs[:5]}; "
              f"not recomputed here (need raw): {unchecked}")
        result("A8", "PASS" if not diffs else "FAIL", f"{len(mine_stats) - len(diffs)}/{len(mine_stats)} stats match")

    # A9: every top-10 id has a verdict row in qa/top10-check.md
    t10 = ROOT / "qa" / "top10-check.md"
    top_ids = [p["id"] for p in sorted((p for p in P if p["rank"]), key=lambda p: p["rank"])[:10]]
    if not t10.exists():
        result("A9", "FAIL", f"{t10.relative_to(ROOT)} does not exist")
    else:
        rows = [line for line in t10.read_text().splitlines() if line.startswith("|")]
        verdict = {}
        for i in top_ids:
            row = next((r for r in rows if f"`{i}`" in r or f" {i} " in r), "")
            verdict[i] = next((v for v in ("SUSPICIOUS", "OK") if v in row), None)
        missing_v = [i for i, v in verdict.items() if v is None]
        sus = [i for i, v in verdict.items() if v == "SUSPICIOUS"]
        result("A9", "FAIL" if missing_v else ("WARN" if sus else "PASS"),
               f"verdicts for {10 - len(missing_v)}/10 current top-10 ids; missing {missing_v}; suspicious {sus}")

    # Top-10 profile (evidence for A9 / data quality)
    top = sorted((p for p in P if p["rank"]), key=lambda p: p["rank"])
    print("\n  top 10 profile:")
    print(f"  {'rk':>2} {'id':<11} {'name':<16} {'len_m':>6} {'n_pts':>5} {'n_ovt':>5} {'score':>5}"
          f" {'f_saf':>5} {'f_dan':>5} {'f_flo':>5}  flags")
    for p in top[:10]:
        flags = []
        if p["n_overtakes"] < 5:
            flags.append(f"f_safety from {p['n_overtakes']} overtake(s)")
        if p["length_m"] < 25:
            flags.append("stub <25 m")
        if p["name"] is None:
            flags.append("unnamed")
        if p["f_flow"] > 0.95:
            flags.append("flow~0 (junction/light?)")
        print(f"  {p['rank']:>2} {p['id']:<11} {str(p['name'])[:16]:<16} {p['length_m']:>6} {p['n_points']:>5}"
              f" {p['n_overtakes']:>5} {p['score']:>5} {p['f_safety']:>5} {p['f_danger']:>5} {p['f_flow']:>5}  "
              + "; ".join(flags))
    el = [p for p in P if p["eligible"]]
    few = sum(1 for p in top[:100] if p["n_overtakes"] < 5)
    unnamed = sum(1 for p in top[:100] if p["name"] is None)
    print(f"  top 100: {few} with < 5 overtakes, {unnamed} unnamed; "
          f"eligible with n_overtakes == 0: {sum(1 for p in el if p['n_overtakes'] == 0)}/{len(el)}")
    return 0 if all(v != "FAIL" for _, v in results) else 1


if __name__ == "__main__":
    sys.exit(main())
