# 3. Data contract

One pair of files connects the pipeline and the web app: segments.geojson plus meta.json. The pipeline writes it, the web app only reads it. Because the frontend gets ready-made 0–1 factors, it never needs to know how the raw data works.

## 3.1 File structure

```text
greencity/
├─ README.md                    # setup, operations runbook, deploy
├─ contract/
│  ├─ CONTRACT.md               # this file
│  ├─ segment.schema.json       # JSON Schema of one feature's properties
│  └─ fixtures/score_cases.json # inputs + expected scores (score.py / score.ts parity)
├─ pipeline/                    # Python 3.11
│  ├─ run.py                    # python run.py [--ingest] [--fuse] [--score] [--report] [--counters] [--publish] [--all] [--basemap]
│  ├─ safelane/
│  │  ├─ config.py              # collection names, thresholds, default weights
│  │  ├─ ingest.py, osm.py      # download + cache ATRAI and Overpass data to data/raw/
│  │  ├─ fuse.py                # one row per segment, raw metrics + f_* factors, OSM fields
│  │  ├─ score.py               # confidence, eligible, score, rank, reason_texts, measures
│  │  ├─ export.py              # write data/out/, copy to web/public/
│  │  ├─ validate.py            # check output against this contract
│  │  ├─ report.py, counters.py # PDF priority list, MobiData BW bike counters
│  │  └─ basemap.py             # self-hosted base map extract -> web/public/basemap/
│  └─ tests/
├─ data/
│  ├─ raw/                      # cached API responses (git-ignored)
│  └─ out/                      # segments.geojson, meta.json, stats.json
├─ web/                         # Next.js, TypeScript, Tailwind, maplibre-gl; static export
│  ├─ public/data/              # segments.geojson + meta.json the app loads
│  └─ src/
│     ├─ lib/types.ts           # TS mirror of this contract (3.4)
│     ├─ lib/score.ts           # same formula as score.py, for live sliders
│     ├─ content/copy.ts        # all user-facing text
│     └─ components/            # MapView, RankList, SegmentCard, WeightSliders, MethodBox, Legend
├─ qa/                          # independent checks and publish gates (qa/gates.py)
└─ .github/workflows/           # ci.yml, data-refresh.yml
```

## 3.2 Segment properties (one GeoJSON LineString feature per street segment, WGS84)

A segment is one undirected street edge: the two directions of a two-way street in road_network_heilbronn (rows (u, v, k) and (v, u, k)) are merged, and the segment keeps the id of the lower row. A measurement row that appears on both directions counts once.

| Field | Type | Meaning | Written by |
|---|---|---|---|
| id | string | Stable id, seg_000123 | fuse |
| osm_id | string \| null | OSM way id from road_network_heilbronn | fuse |
| name | string \| null | Street name | fuse |
| length_m | number | Length in metres | fuse |
| n_points | int | Max of the point counts of all matched layers | fuse |
| n_overtakes | int | Sum of the overtaking histogram | fuse |
| share_below_150 | number \| null | Share of overtakes under 150 cm (0–1) | fuse |
| pass_severity | number \| null | Mean closeness of the overtakes, 0–1 (1.2, see "Which passes count") | fuse |
| passes_excluded | "car_free" \| "stationary" \| "short" \| "few_overtakes" \| null | Why close passes and danger points do not count here (1.2); null = they count, or there are none | fuse |
| avg_overtake_cm | number \| null | Average overtaking distance | fuse |
| danger_per_100m | number \| null | Danger points per 100 m of max(length_m, danger_min_length_m) | fuse |
| mean_danger_risk | number \| null | Mean Risk Index of danger points (0–1) | fuse |
| mean_pm_risk | number \| null | Mean Risk Index of PM danger points (0–1) | fuse |
| roughness_norm | number \| null | Normalized Roughness (0–1) | fuse |
| traffic_flow | number \| null | avg_traffic_flow (0–1, 1 = free flow) | fuse |
| avg_speed_kmh | number \| null | Average cycling speed | fuse |
| f_safety f_danger f_surface f_air f_flow | number | Normalised factors 0–1 (rules below) | fuse |
| missing | string[] | Factor keys with no data | fuse |
| confidence | number | 0–1 | score |
| eligible | bool | Enough data to rank | score |
| score | number \| null | 0–100 with default weights; null if not eligible | score |
| rank | int \| null | 1 = highest priority; null if not eligible | score |
| reason_texts | object | Factor key → one sentence, only for factors with data | score |

Factor rules (missing data → factor = 0 and the key goes into `missing`):

| Factor | Formula |
|---|---|
| f_safety | (n_overtakes · pass_severity + k · city_pass_severity) / (n_overtakes + k), with k = safety_prior_k |
| f_danger | min(1, danger_per_100m / danger_p95) |
| f_surface | roughness_norm |
| f_air | mean_pm_risk |
| f_flow | 1 − traffic_flow |

$$
\text{score} = 100 \cdot c \cdot \sum_{k} w_k f_k, \qquad c = \min\left(1, \frac{n_{\text{points}}}{N}\right), \qquad \sum_k w_k = 1
$$

f_safety shrinks small samples toward the city-wide severity, so a few passes are weak evidence. A segment is eligible when n_points ≥ min_points. Rank = eligible segments by score descending; ties by n_points descending, then id. Defaults (recorded in meta.json): weights safety 0.35, danger 0.25, surface 0.15, air 0.15, flow 0.10; min_points 5; confidence_n N = 30; safety_prior_k 10; danger_min_length_m 50; severity_weights 1, 0.67, 0.33, 0, 0; stationary_speed_kmh 5; min_pass_length_m 25; min_overtakes 20.

### Which passes count (1.2)

Close passes and danger points both come from the overtaking sensor. They are only evidence where a car could overtake a riding cyclist and the sample is large enough:

1. **car_free**: overtaking lines and danger points on a segment whose first OSM way (matched by id) has a `highway` in `car_free_highways` (cycleway, footway, path, pedestrian, steps, bridleway) are dropped before aggregation, so n_overtakes is 0 there. No car overtakes a rider on such a way.
2. Otherwise, when a segment has overtakes or a non-zero danger_per_100m, they do not count if (first match wins):
   - **stationary**: avg_speed_kmh < stationary_speed_kmh. Riders were mostly standing (traffic lights, a parked bike).
   - **short**: length_m < min_pass_length_m. Shorter than GPS can reliably place a pass (junction stubs).
   - **few_overtakes**: n_overtakes < min_overtakes. Too small a sample to rank a segment on.

Where passes do not count, `safety` and `danger` go into `missing` (factor 0); the segment is still scored on the other factors and stays eligible.

pass_severity = Σ count_i · w_i / n_overtakes over the five overtaking bins (0–50, 50–100, 100–150, 150–200, > 200 cm) with w = severity_weights, so a 40 cm pass weighs three times a 140 cm one. city_pass_severity (the f_safety prior) and danger_p95 are computed over the segments whose passes count. city_share_below_150 (all remaining overtakes) is informational and not used in the score.

Example feature (invented values, for shape only):

```json
{"type": "Feature",
 "geometry": {"type": "LineString", "coordinates": [[9.2101, 49.1421], [9.2112, 49.1426]]},
 "properties": {
  "id": "seg_000123", "osm_id": "23456789", "name": "Example Street", "length_m": 84.2,
  "n_points": 41, "n_overtakes": 24, "share_below_150": 0.58, "avg_overtake_cm": 131.0,
  "danger_per_100m": 3.6, "mean_danger_risk": 0.47, "mean_pm_risk": 0.31,
  "roughness_norm": 0.22, "traffic_flow": 0.64, "avg_speed_kmh": 16.8,
  "f_safety": 0.58, "f_danger": 0.72, "f_surface": 0.22, "f_air": 0.31, "f_flow": 0.36,
  "missing": [], "confidence": 1.0, "eligible": true, "score": 49.9, "rank": 17,
  "reason_texts": {"safety": "58% of 24 overtakes were closer than 150 cm",
                   "danger": "3.6 close-overtake danger points per 100 m",
                   "air": "PM risk 0.31 (city scale 0-1)"}}}
```

## 3.2b OSM street and bike-infrastructure fields (additive, v1.1)

The pipeline joins every segment to OpenStreetMap ways (Overpass API, cached in `data/raw/osm_overpass.json`, fetched by `python -m safelane.osm` or `run.py --ingest`). These fields are **optional**: readers must work when they are absent (older data) or null (no OSM match). **They do not change the score**: confidence, eligible, score and rank are computed exactly as in 3.2.

| Field | Type | Meaning | Written by |
|---|---|---|---|
| highway | string \| null | OSM `highway` of the (first) matched way | fuse |
| maxspeed_kmh | number \| null | Speed limit; highest of the matched ways | fuse |
| lanes | int \| null | OSM `lanes`; highest of the matched ways | fuse |
| infra_class | "separated" \| "bike_street" \| "painted_lane" \| "shared_bus" \| "shared" \| "none" \| null | Bike infrastructure; least protected of the matched ways; null = no OSM match | fuse |
| infra_gap | bool | eligible AND rank ≤ 25% of n_eligible AND infra_class in {none, shared, painted_lane} | score |
| suggested_measure | string \| null | Rule-based suggestion (below) | score |

Join: every id in `osm_id` (comma-separated) that exists in the Overpass result; segments without one take the nearest way within 10 m of their midpoint (EPSG:25832).

maxspeed_kmh: numbers as km/h (`mph` converted); `DE:urban` 50, `DE:rural` 100, `DE:zone30` / `DE:zone:30` 30, `DE:zone20` 20, `DE:bicycle_road` 30, `DE:living_street` and `walk` 7; several values (`50;30`) give the highest; `none` and anything else null.

infra_class, first match wins (cycleway\* = cycleway, cycleway:left, cycleway:right, cycleway:both; `opposite_x` counts as `x`):

| Class | Rule |
|---|---|
| separated | highway=cycleway, or any cycleway\*=track, or any cycleway\*=separate (see below) |
| bike_street | bicycle_road=yes or cyclestreet=yes |
| painted_lane | any cycleway\*=lane, or cycleway:lane=advisory/exclusive (Schutzstreifen, Radfahrstreifen) |
| shared_bus | any cycleway\*=share_busway |
| shared | any cycleway\*=shared_lane |
| none | everything else |

cycleway\*=separate only says "mapped as its own way": it counts as separated when a highway=cycleway lies within 15 m of the segment midpoint and runs within 30° of the segment's direction there; otherwise none.

suggested_measure, first match wins:

| Rule | Measure |
|---|---|
| infra_class in {none, shared}, maxspeed_kmh ≥ 50, f_safety ≥ 0.3 | Protected bike lane or separated cycle track |
| infra_class = painted_lane, f_safety ≥ 0.3 | Upgrade painted lane to a physically protected lane |
| infra_class in {none, shared}, maxspeed_kmh ≤ 30 | Bicycle street (Fahrradstrasse) or traffic calming |
| f_surface ≥ 0.6 | Resurface: rough or cobbled surface |
| eligible | Check on site |
| otherwise | null |

meta.json adds `osm_fetched_at` (Overpass `timestamp_osm_base`, null without OSM data) and `attribution` ("© OpenStreetMap contributors, ODbL"). OSM data is © OpenStreetMap contributors under the ODbL; show the attribution wherever the data is shown.

## 3.3 meta.json

```json
{"version": "1.2", "source": "atrai", "generated_at": "2026-10-28T15:30:00+01:00",
 "city": "heilbronn", "n_segments": 0, "n_eligible": 0,
 "min_points": 5, "confidence_n": 30, "danger_p95": 0,
 "city_share_below_150": 0, "safety_prior_k": 10, "danger_min_length_m": 50,
 "severity_weights": [1.0, 0.67, 0.33, 0.0, 0.0],
 "car_free_highways": ["cycleway", "footway", "path", "pedestrian", "steps", "bridleway"],
 "stationary_speed_kmh": 5, "min_pass_length_m": 25, "min_overtakes": 20,
 "city_pass_severity": 0,
 "default_weights": {"safety": 0.35, "danger": 0.25, "surface": 0.15, "air": 0.15, "flow": 0.10},
 "bbox": [9.17, 49.11, 9.25, 49.17]}
```

`source` is always `"atrai"`. `bbox` is the initial map view: the 2nd–98th percentile of segment midpoints, so a few far-out rides do not zoom the map out.

`data/out/stats.json` (pipeline only, not copied to the web app) records match rates per layer, twin merges, n_points distribution, score bands and the top-10 ids, so QA can recompute every number.

## 3.4 TypeScript mirror (web/src/lib/types.ts)

```ts
export type FactorKey = 'safety' | 'danger' | 'surface' | 'air' | 'flow';
export type Weights = Record<FactorKey, number>;
export type InfraClass = 'separated' | 'bike_street' | 'painted_lane' | 'shared_bus' | 'shared' | 'none';
export type PassesExcluded = 'car_free' | 'stationary' | 'short' | 'few_overtakes';

export interface SegmentProps {
  id: string; osm_id: string | null; name: string | null; length_m: number;
  n_points: number; n_overtakes: number;
  share_below_150: number | null; avg_overtake_cm: number | null;
  danger_per_100m: number | null; mean_danger_risk: number | null;
  mean_pm_risk: number | null; roughness_norm: number | null;
  traffic_flow: number | null; avg_speed_kmh: number | null;
  f_safety: number; f_danger: number; f_surface: number; f_air: number; f_flow: number;
  missing: FactorKey[]; confidence: number; eligible: boolean;
  score: number | null; rank: number | null;
  reason_texts: Partial<Record<FactorKey, string>>;
  // Contract 1.2; absent in older data.
  pass_severity?: number | null; passes_excluded?: PassesExcluded | null;
  // Contract 3.2b (OSM); absent in older data.
  highway?: string | null; maxspeed_kmh?: number | null; lanes?: number | null;
  infra_class?: InfraClass | null; infra_gap?: boolean; suggested_measure?: string | null;
}

export interface Meta {
  version: string; source: 'atrai'; generated_at: string; city: string;
  n_segments: number; n_eligible: number; min_points: number; confidence_n: number;
  danger_p95: number; city_share_below_150: number; safety_prior_k: number;
  danger_min_length_m: number; default_weights: Weights; bbox: [number, number, number, number];
  osm_fetched_at?: string | null; attribution?: string;
  // Contract 1.2; absent in older data.
  severity_weights?: number[]; car_free_highways?: string[]; stationary_speed_kmh?: number;
  min_pass_length_m?: number; min_overtakes?: number; city_pass_severity?: number;
}
```

## 3.5 Changing the contract

- Any change to a field, a factor rule or meta.json bumps `version` in meta.json (`CONTRACT_VERSION` in `pipeline/safelane/export.py`) and adds a row to 3.7.
- Update `segment.schema.json`, `web/src/lib/types.ts` (checked by `node qa/contract_drift.mjs`) and, when the score changes, `fixtures/score_cases.json` together with `score.py` and `score.ts`.
- Additive fields are optional in the schema and in types.ts, so the web app keeps working with older data.

## 3.6 Data in git

- Commit data/out/, web/public/data/, web/public/report.pdf and web/public/basemap/; never commit data/raw/.
- The weekly data refresh (.github/workflows/data-refresh.yml) commits new data only when every gate in qa/gates.py passes.

## 3.7 Changes

| Version | Change | Why |
|---|---|---|
| 1.1 | Merge both directions of a two-way street into one segment | Twins were ranked separately (same street twice) and the twin drawn on top took map clicks (G2 audit X1, B12e) |
| 1.1 | f_safety shrunk toward city_share_below_150 with k = 10; danger_per_100m over max(length, 50 m) | 1–3 overtakes on 11–20 m junction stubs filled the top 10 (G2 audit A9) |
| 1.1 | meta: city_share_below_150, safety_prior_k, danger_min_length_m; bbox = 2–98% view extent; stats.json | Make every factor reproducible from the published files |
| 1.1 | Optional OSM fields (3.2b): highway, maxspeed_kmh, lanes, infra_class, infra_gap, suggested_measure; meta: osm_fetched_at, attribution | Show what infrastructure a priority street has and what fix it needs; additive, score unchanged |
| 1.2 | Drop overtakes and danger points on car-free OSM ways; do not count them on stationary (< 5 km/h), short (< 25 m) or thin (< 20 overtakes) segments; new field passes_excluded | 8 of the 1.1 top 10 rested on riders standing at lights, passes on paths and pedestrian zones, or junction stubs (qa/top10-check.md S1–S4) |
| 1.2 | f_safety from pass_severity (closeness-weighted histogram) instead of the share under 150 cm; danger_p95 and the prior over counted segments | 558 of 863 segments had 100% of passes under 150 cm, so the share no longer separated streets |
| 1.2 | meta: severity_weights, car_free_highways, stationary_speed_kmh, min_pass_length_m, min_overtakes, city_pass_severity | Every rule reproducible from the published files |
| 1.2 | Unnamed OSM service roads are called "Service road off X", not "Path along X" | Planners looked for a footpath at a driveway or parking aisle |
