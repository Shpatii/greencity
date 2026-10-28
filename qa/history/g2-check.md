**G2 PASSED on branch `g2-fixes`**: P0 × 0, P1 × 0, P2 × 0 open. 2 WARN accepted (A4 extent, A9 data pattern). The checks need `g2-fixes` merged into `main` to hold there (C14).

| Run | Commit | Result |
|---|---|---|
| 1st audit, 2026-10-27 15:39 | `main` `f38a9e3` | **G2 FAILED**: P0 × 1, P1 × 5, P2 × 7 |
| Re-audit after fixes, 2026-10-27 16:20 | `g2-fixes` (5 commits on top of `main` + merges of `p1-data`, `p3-qa`) | All checks PASS except 2 accepted WARNs; C14 pending a push |

Environment: macOS, Python 3.11.15 (fresh venv), Node 22.22.0. Raw data comes from the cached `data/raw/`; `--refresh` was not run.
`bash qa/run_audit.sh` re-runs everything in about 70 s. Logs go to `qa/logs/` (git-ignored) and screenshots to `qa/screens/`.

## Results after the fixes

| # | Check | 1st audit | Now | Evidence (re-audit) | Severity | What fixed it |
|---|---|---|---|---|---|---|
| A1 | Clean venv, `run.py --all` | PASS | PASS | `exit=0 runtime=14s`; `pytest`: 43 passed | – | – |
| A2 | `validate --mode full` | PASS | PASS | `6642 features, 5106 eligible` / `OK`, now also with `--expect-source atrai` | – | – |
| A3 | source atrai; copies identical | PASS | PASS | Both meta files `"source": "atrai"`; sha256 segments `2c2a97f3…` = `2c2a97f3…`, meta `119e319d…` = `119e319d…` | – | – |
| A4 | Geometry + size | FAIL | WARN | 6642 LineStrings, 0 invalid, 0 swaps, 0 duplicate ids. **4.84 MiB** (gzip 569 KB). WARN only because a few real rides reach lon 9.048, west of the nominal 9.1. That is correct data, not a swap. | – | Compact JSON, 5-dp coordinates with a fallback for very short lines, twin merge |
| A5 | Independent factor recheck | PASS | PASS | 30 segments: max \|diff\| after rounding 0 for share, f_safety, traffic_flow, f_flow, danger_per_100m, f_danger. 0 `missing` violations in 6642. The recheck re-implements the twin merge and the 1.1 rules itself. | – | – |
| A6 | Recompute confidence/eligible/score/rank | PASS | PASS | 0/0/0/0 mismatches; ranks exactly 1..5106; 4563 ties resolved by the tie rule | – | – |
| A7 | Match + coverage | PASS | PASS | Overtaking 1388/1388 = 100%; n_eligible 5106; median n_points 16 | – | – |
| A8 | `stats.json` recomputed | FAIL | PASS | `19/19 stats match`. Twin and per-layer match counts need raw data; overtaking matched is cross-checked with A5. | – | `export.py` and `score.py` write `data/out/stats.json` |
| A9 | `qa/top10-check.md` verdicts | FAIL | WARN | Verdicts for 10/10; 2 OK, 8 SUSPICIOUS. The remaining pattern is in the data: riders stand at about 1–3 km/h at lights, and 558 of 863 segments report 100% close passes. See `qa/top10-check.md`. | – | Twin merge + shrinkage moved the top 10 from 1–4 overtakes to 15–202. The speed filter is a team decision (simulated, not applied). |
| B10 | ci, build, lint, test, parity test | FAIL | PASS | build/lint/tsc exit 0; jest **36 passed**, including `score.test.ts` over `contract/fixtures/score_cases.json` | – | Parity test ported from `p3-qa` to jest |
| B11 | Real-data parity vs `score.ts` | FAIL | PASS | `scoreSegment: 6642 features … match 100.00%`; `rankSegments: … mismatches 0` | – | `score.ts` ported from `p3-qa` |
| B12a | Load, canvas ≤ 5 s, no console errors | PASS | PASS | Canvas after 1141 ms, 0 console errors | – | – |
| B12b | No MOCK DATA badge | PASS | PASS | Not visible | – | – |
| B12c | 10 rows, row 1 = rank 1 | PASS | PASS | `[1 \| Path along Pfaffenstraße \| 76.1 \| 1273]` = `seg_032464` | – | – |
| B12d | Row 1 → card | PASS | PASS | Score 76.1, confidence 100%, 1273 measurements, 3 reasons | – | – |
| B12e | Click rank-1 line → its card | FAIL | PASS | Midpoint click opens `Path along Pfaffenstraße 76.1` on the first try | – | Twin merge; `line-sort-key` by score; click picks the top-score hit |
| B12f | Legend + "How we score" | PASS | PASS | Both present; panel opens | – | – |
| B12g | 375×812 / 1920×1080 layout | PASS | PASS | No page scroll at 1920×1080; on mobile the list (743) is below the map (487) | – | – |
| B12h | Weight sliders (new) | – | PASS | 5 sliders, no placeholder. Fine dust at 80% moves row 1 to `Kolpingstraße 51.9`; Reset restores `Pfaffenstraße 76.1` (`12h_sliders_air80.png`). | – | `WeightSliders` + `rescore` |
| B13 | types.ts ↔ schema | PASS | PASS | SegmentProps 25 = 25; Meta 14 = meta.json 14 | – | – |
| C14a | All work merged | FAIL | PASS on `g2-fixes` | `origin/p1-data` and `origin/p3-qa`: 0 commits not in `g2-fixes`. `p3-qa` was recorded with `-s ours` (stale rewrite); only its `score.ts` and test were taken. | P0 until pushed | Push `g2-fixes` and merge it into `main` |
| C14b | data/raw not committed | PASS | PASS | `git ls-files data/raw` → 0 | – | – |
| C14c | No .env / secrets | PASS | PASS | No `.env*` in history; secret grep finds no hits | – | – |
| C14d | Data committed on main | FAIL (P0) | PASS on `g2-fixes` | Committed `web/public/data/meta.json` has `"source": "atrai"`, 5106 eligible. `origin/main` still ships mock data until the merge. | P0 until merged | Same as C14a |
| C14e | Working-tree hygiene | WARN | PASS | `.idea/` and `qa/logs/` ignored; stray root `package-lock.json` removed | – | – |
| X1 | Duplicate geometry | FAIL | PASS | 5 groups / 10 features (0.2%, different OSM keys); 0 in the top 10 (was 1211 groups / 30.9%) | – | Twin merge in `fuse.py` |
| X3 | Score range vs legend, initial view | WARN | PASS (bands by design) | `meta.bbox` = 2–98% view extent `[9.164, 49.113, 9.258, 49.181]`. The "Very high 80–100" band is still empty (max 76.1): reaching it needs every factor near its maximum. That is left as an absolute scale; P4 can decide on breaks. | – | `export._view_bbox` |
| X4 | `npm audit` (prod) | WARN | PASS (accepted) | postcss advisories fixed (override). 1 critical left in `next` 14.2.35, the newest 14.x. All its advisories hit the Next server (Image Optimizer, RSC, rewrites), and this app is a static export with no Next server. | – | `overrides` in `web/package.json`; Next 16 deferred until after the hackathon |
| X5 | Validator strength | WARN | PASS | Old `main` data now fails: `no eligible segments` and `meta.source = 'mock', expected 'atrai'` | – | `validate.py` |

## Contract 1.1 (method change agreed for this fix)

- One segment per undirected street edge; a measurement repeated on both directions counts once.
- `f_safety = (n_below + k·city_share) / (n_overtakes + k)`, with k = 10 and city_share = 0.807.
- `danger_per_100m` is computed over max(length, 50 m).
- New meta fields: `city_share_below_150`, `safety_prior_k`, `danger_min_length_m`; `bbox` is now the view extent.
- The score formula, `score.ts` and `score_cases.json` are unchanged.
- Recorded in `contract/CONTRACT.md` §3.7, with the version bumped to 1.1. CONTRACT 3.6 asks for a 2-minute team agreement: tell P2, P3 and P4.

## Re-run

```bash
bash qa/run_audit.sh                # everything; SKIP_NPM_CI=1 keeps web/node_modules
```

Step by step, from the repo root:

```bash
python3.11 -m venv /tmp/safelane-qa-venv && /tmp/safelane-qa-venv/bin/pip install -r pipeline/requirements.txt
(cd pipeline && time /tmp/safelane-qa-venv/bin/python run.py --all)
(cd pipeline && /tmp/safelane-qa-venv/bin/python -m safelane.validate ../data/out --mode full --expect-source atrai)
(cd pipeline && /tmp/safelane-qa-venv/bin/python -m pytest -q tests)
shasum -a 256 data/out/{segments.geojson,meta.json} web/public/data/{segments.geojson,meta.json}
/tmp/safelane-qa-venv/bin/python qa/recheck_factors.py      # A5, A7
python3 qa/check_data.py                                     # A3 A4 A6 A7 A8 A9
python3 qa/duplicate_geoms.py                                # X1
(cd web && npm ci && npm run build && npm run lint && npm run type-check && npm test)
node qa/parity_real.mjs                                      # B11
node qa/contract_drift.mjs                                   # B13
(cd qa && npm install && npx playwright install chromium)
python3 -m http.server 4173 -d web/out & node qa/e2e.mjs --url http://localhost:4173; kill %1
git fetch --all; for b in $(git branch -r | grep -v HEAD); do echo "$b $(git rev-list --count origin/main..$b)"; done
```
