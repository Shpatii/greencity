**G2 FAILED**: P0 × 1, P1 × 5, P2 × 7

Audit of `safelane-hn` at `main` = `f38a9e3` (equal to `origin/main`), run on 2026-10-27, 15:39–16:05 CET, macOS, Python 3.11.15, Node 22.22.0.
The working tree had uncommitted, regenerated `data/out/*` and `web/public/data/*` (backed up before the run). Checks A1–B13 run on the working tree **after** `python run.py --all`. C14 checks what is committed and pushed.
No file in `pipeline/` or `web/src/` was changed. Raw logs are in `qa/logs/` and screenshots are in `qa/screens/`.

## Results

| # | Check | Result | Evidence | Severity | Suggested fix (not applied) |
|---|---|---|---|---|---|
| A1 | Clean venv, `pip install`, `run.py --all` | PASS | Fresh venv (python3.11), `env -i … python run.py --all` → `exit=0 runtime=13s` (`qa/logs/a1_run_all.log`). Ingest used the **cached** `data/raw/` (`source: cached` for all 7 layers); a `--refresh` download was not tested. Output segments byte-identical to the pre-run copy; only `generated_at` changed. `pytest pipeline/tests`: 34 passed. | – | Before the demo, run `--all --refresh` once to prove the download path still works. |
| A2 | `safelane.validate … --mode full` | PASS | `../data/out/segments.geojson (full): 7850 features, 5625 eligible` / `OK` (`a2_validate.log`) | – | – (see X5) |
| A3 | source = atrai; both copies identical | PASS | `"source": "atrai"` in both meta.json files. sha256 segments `9bb7ce82…92b3` = `9bb7ce82…92b3`; meta `8474fbab…ad87` = `8474fbab…ad87` (`a3_sha.log`). **Only true for the working tree**; see C14d. | – | – |
| A4 | Geometry sanity + size | FAIL | 7850 LineStrings, 0 invalid, 0 lat/lon swaps, 0 duplicate ids. Extent lon 9.0480–9.3015, lat 49.0938–49.2096 (west of the nominal 9.1, but correctly ordered, so not a swap). **Size 6,586,717 B = 6.28 MiB > 5 MiB** (gzip 718 KB). | P2 | Round coords to 5 dp and drop the twin direction (X1) in `export.py`; serve gzipped. |
| A5 | `qa/recheck_factors.py`: independent factors (20 random eligible, seed 42, + top 10) | PASS | Max \|diff\| after the pipeline's documented rounding: share_below_150 0, f_safety 0, traffic_flow 0, f_flow 0, danger_per_100m 0, f_danger 0. Unrounded diffs ≤ 4.8e-4 (rounding only). 0 null mismatches. Keys in `missing` with factor ≠ 0: 0 of 7850. `missing` vs null driver: 0 inconsistencies. | – | – |
| A6 | Recompute confidence, eligible, score, rank (all features) | PASS | `check_data.py`: confidence/eligible/score/rank mismatches 0/0/0/0 over 7850 features. Stored ranks exactly 1..5625. 5088 adjacent score ties, all resolved by (score desc, n_points desc, id asc). meta.n_eligible 5625 = file. | – | – |
| A7 | Match + coverage | PASS | Overtaking lines matched 1388/1388 = **100.0%** (all by index join + ≤10 m midpoint check). Danger points 5192/7095 = 73.2%; PM points 120210/183030 = 65.7%. n_eligible **5625** (≥ 50). Median n_points 13 (all), 24 (eligible). | – | – |
| A8 | Recompute `data/out/stats.json` | FAIL | `data/out/stats.json does not exist`. Nothing in `pipeline/`, `web/src/`, README or the contract writes or reads it, so there was nothing to compare. | P2 | Add a `stats.json` writer to `export.py` (counts, match %, medians, p95) or drop it from the G2 checklist. |
| A9 | `qa/top10-check.md` with verdicts | FAIL | `qa/top10-check.md does not exist`. The audit's own top-10 profile flags **10 of 10** (list below). In the top 100, 51 segments have < 5 overtakes and 44 are unnamed. 4684 of 5625 eligible segments have **0 overtakes**. | P1 | P3 writes the top-10 verdicts. Base confidence on overtake count, not traffic-flow points (see below). |
| B10 | `npm ci`, build, lint, test (vitest parity) | FAIL | `npm ci` exit 0 · `npm run build` exit 0, `✓ Compiled successfully`, types checked · `npm run lint` `✔ No ESLint warnings or errors` · `tsc --noEmit` exit 0 · `npm test` (jest) `Tests: 16 passed`. **But there is no vitest and no web test that reads `contract/fixtures/score_cases.json`.** Only `pipeline/tests/test_score.py` uses it. A `web/src/lib/score.test.ts` + `vitest.config.ts` exists only on the unmerged `origin/p3-qa`. | P2 | Merge the score parity test from `p3-qa` (port it to jest or add vitest). |
| B11 | `qa/parity_real.mjs`: real data vs `score.ts` | FAIL | `score.ts: 3 lines, exports: []` → `web/src/lib/score.ts exports no score function (file is a stub: "export {};")`. Informational: a reference JS port of the contract formula matches 7850/7850 scores and ranks (100%), so a direct port will reach parity. Visible effect: the sidebar shows a literal **"WeightSliders"** placeholder box (screenshot `12d_row1_card.png`). | P1 | Merge the `score.ts` implementation from `origin/p3-qa` and wire up `WeightSliders`, or hide the placeholder for the demo. |
| B12a | Loads, canvas ≤ 5 s, no console errors | PASS | Production export (`web/out`, `python -m http.server 4173`): canvas visible after 1032 ms; console errors 0 (`12a_desktop_loaded.png`). | – | – |
| B12b | No "MOCK DATA" badge | PASS | `"Mock data" badge visible: false` | – | – |
| B12c | Top-10 list has 10 rows; row 1 = rank 1 | PASS | 10 rows; row 1 `[1 \| Unnamed street \| 77.7 \| 525]` = data rank 1 `seg_028022` (score 77.7, n_points 525). Rows have no id attribute, so the match uses rank + score + n_points + name. | – | – |
| B12d | Row 1 → card with score, confidence, n_points, ≥ 1 reason | PASS | Card shows `77.7 Priority score · Confidence 100% · Measurements 525 · Overtakes 1` and 3 reasons (`12d_row1_card.png`). | – | – |
| B12e | Clicking the rank-1 line opens its card | FAIL | Clicks at 50/35/65% along `seg_028022` all open **`Unnamed street 58.6`** (= `seg_028146`, rank 87). Cause: the two segments have identical geometry (both directions of one OSM edge), and the twin is later in the file, so it is drawn on top and wins the hit test (`12e_map_click_card.png`, X1). | P1 | Fix X1. Until then, sort features so higher scores draw last, or pick the max-score hit in the click handler. |
| B12f | Legend + "How we score" present | PASS | Heading "Safety priority" visible; button "How we score" visible; region "How the score works" opens (`12f_method_open.png`). | – | – |
| B12g | 375×812 list below map; 1920×1080 no page scroll | PASS | Desktop: scrollHeight 1080 = innerHeight, map 0–1080, list 221–663, method 801–845 (no card open). With a card open, the sidebar scrolls internally and "How we score" drops below its fold (`12d_row1_card.png`). Mobile: list top 743 ≥ map bottom 487, no horizontal overflow (`12g_mobile_375x812*.png`). | – | – |
| B13 | Contract drift `types.ts` ↔ schema | PASS | SegmentProps 25 vs schema.properties 25 and schema.required 25: no differences. Meta 11 vs meta.json 11: no differences (`b13_contract_drift.log`). | – | – |
| C14a | All work merged into main | FAIL | `origin/p1-data` is 2 ahead: `37e3d8e Name unnamed paths after the nearest street; publish scored real data`. `origin/p3-qa` is 1 ahead: `d15e033 Implement P4 frontend map + P3 pipeline export` (contains `score.ts` 84 lines, `score.test.ts`, `vitest.config.ts`). `p2-web` and `p4-design`: 0. | P1 | Open PRs for `p1-data` and `p3-qa`, resolve conflicts, merge. |
| C14b | `data/raw/` not committed | PASS | `git ls-files data/raw` → 0; no commit in any branch touches `data/raw/*`; `.gitignore` has `data/raw/`. | – | – |
| C14c | No .env / keys / tokens | PASS | No `.env*` path in any commit on any branch. `git grep` for api_key/secret/token/password/bearer/AKIA/ghp_/sk-: no hits. History grep for added key patterns: no hits. | – | – |
| C14d | Committed data on `origin/main` | FAIL | `origin/main:web/public/data/meta.json` → `"source": "mock"`, 322 segments. `origin/main:data/out/meta.json` → `"n_eligible": 0` (unscored). A fresh clone shows the **MOCK DATA badge** and mock streets. The audited real data exists only as uncommitted changes in this working tree. | **P0** | Run `python run.py --all` and commit `data/out/` + `web/public/data/` (or merge `p1-data`) before the demo. |
| C14e | Working-tree hygiene | WARN | Untracked `.idea/` and a stray root `package-lock.json` (empty `"packages": {}`). | P2 | Add `.idea/` to `.gitignore`; delete the root `package-lock.json`. |
| X1 | Duplicate geometry (both directions of an edge) | FAIL | `qa/duplicate_geoms.py`: **1211 twin groups, 2422 features (30.9%)**. All 10 top-10 segments have a twin, and 5 of them are hidden under it on the map. Twins disagree strongly: rank 2 `seg_032464` scores 77.5 but its twin `seg_032467` scores 36.7. 568 groups have both twins ranked, so the same street appears twice in the ranking. | P1 | In `fuse.py`, merge u→v / v→u edges into one segment (sum histograms and counts) before scoring. |
| X3 | Score range vs legend | WARN | Max score 77.7; 0 segments ≥ 80, so the "Very high 80–100" band is never used. The bbox includes outliers out to lon 9.048, so the first view on mobile is zoomed out to Bad Rappenau. | P2 | Recheck the band breaks after X1/A9; clip the initial view to the city bbox. |
| X4 | `npm audit` (production deps) | WARN | `2 vulnerabilities (1 high, 1 critical)` in `next` / nested `postcss`. The fix needs `next@16` (breaking). The static export limits real exposure. | P2 | Note for after the hackathon; not a demo blocker. |
| X5 | Validator strength | WARN | `safelane.validate --mode full` reports `OK` on `origin/main:data/out` (**0 eligible**) and on the mock web data. It cannot catch C14d. | P2 | Fail full mode when n_eligible = 0; add `--expect-source atrai`. |

### Top 10 (current data): all flagged as suspicious

| Rank | id | Name | length m | n_points | n_overtakes | score | Flags |
|---|---|---|---|---|---|---|---|
| 1 | seg_028022 | – | 52.1 | 525 | 1 | 77.7 | f_safety = 1.0 from 1 overtake; unnamed; flow ≈ 0 (junction or traffic light); hidden under twin seg_028146 (58.6) |
| 2 | seg_032464 | – | 66.9 | 1273 | 16 | 77.5 | unnamed; flow ≈ 0; twin seg_032467 scores 36.7 |
| 3 | seg_012803 | – | 19.7 | 732 | 1 | 77.5 | 1 overtake; 19.7 m stub; unnamed; flow ≈ 0 |
| 4 | seg_029536 | – | 15.5 | 88 | 3 | 77.4 | 3 overtakes; 15.5 m stub; unnamed |
| 5 | seg_016934 | – | 102.7 | 172 | 14 | 77.0 | unnamed; twin seg_001923 scores 31.9 |
| 6 | seg_008491 | – | 15.9 | 671 | 1 | 76.8 | 1 overtake; stub; unnamed; flow ≈ 0; hidden under twin |
| 7 | seg_033609 | – | 11.5 | 285 | 13 | 76.7 | 11.5 m stub; unnamed; flow ≈ 0; twin seg_033606 scores 26.3 |
| 8 | seg_024532 | Stielerstraße | 50.5 | 258 | 2 | 76.6 | 2 overtakes; hidden under twin |
| 9 | seg_021303 | – | 93.5 | 55 | 25 | 76.6 | unnamed; flow ≈ 0; twin seg_021301 scores 51.2 |
| 10 | seg_020211 | – | 77.7 | 151 | 4 | 76.4 | 4 overtakes; unnamed; hidden under twin |

Root cause: `n_points` is the maximum of the overtaking, traffic-flow and speed point counts. Traffic-flow points pile up where riders stand still, at junctions and lights, so those stubs reach confidence 1.0 even with a single overtake. One close pass then gives f_safety = 1.0, and a short length inflates danger_per_100m to the p95 cap. The top 10 are therefore short, unnamed junction stubs judged on 1–25 overtakes. The scores are computed correctly (A5/A6 pass), but the ranking will not survive a question from the jury.

## Re-run the audit

Everything is in one script, `bash qa/run_audit.sh`, which writes `qa/logs/*` and `qa/screens/*`. Step by step, from the repo root:

```bash
# A1
python3.11 -m venv /tmp/safelane-qa-venv
/tmp/safelane-qa-venv/bin/pip install -r pipeline/requirements.txt
(cd pipeline && time /tmp/safelane-qa-venv/bin/python run.py --all)
# A2
(cd pipeline && /tmp/safelane-qa-venv/bin/python -m safelane.validate ../data/out/segments.geojson --mode full)
# A3
shasum -a 256 data/out/{segments.geojson,meta.json} web/public/data/{segments.geojson,meta.json}
# A5, A7 (independent, no safelane import)
/tmp/safelane-qa-venv/bin/python qa/recheck_factors.py
# A3, A4, A6, A7, A8, A9 + X1
python3 qa/check_data.py
python3 qa/duplicate_geoms.py
# B10
(cd web && npm ci && npm run build && npm run lint && npm run type-check && npm test)
# B11, B13
node qa/parity_real.mjs
node qa/contract_drift.mjs
# B12 (port 3000 may be taken by a dev server, so use 4173)
(cd qa && npm install && npx playwright install chromium)
python3 -m http.server 4173 -d web/out &
node qa/e2e.mjs --url http://localhost:4173
kill %1
# C14
git fetch --all
for b in $(git branch -r | grep -v HEAD); do echo "$b $(git rev-list --count origin/main..$b)"; done
git ls-files data/raw | wc -l
git log --all --name-only --pretty=format: | grep -iE '(^|/)\.env' | sort -u
git grep -nIE '(api[_-]?key|secret|token|password|bearer|AKIA|ghp_|sk-)' -- . ':!*.geojson' ':!*package-lock.json'
git show origin/main:web/public/data/meta.json | grep source
```

Files added under `qa/`: `recheck_factors.py`, `check_data.py`, `duplicate_geoms.py`, `parity_real.mjs`, `contract_drift.mjs`, `e2e.mjs`, `package.json` (Playwright 1.56.1), `run_audit.sh`, `g2-check.md`, `logs/`, `screens/`.
