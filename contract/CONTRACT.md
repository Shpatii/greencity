# 3. Data contract

One file connects everyone: segments.geojson plus meta.json. The pipeline writes it, the web app only reads it. Because the frontend gets ready-made 0–1 factors, it never needs to know how the raw data works.

## 3.1 File structure

```text
safelane-hn/
├─ README.md
├─ contract/
│  ├─ CONTRACT.md               # this section, pasted in
│  ├─ segment.schema.json       # JSON Schema of one feature's properties
│  └─ fixtures/score_cases.json # P3: inputs + expected scores (parity test)
├─ pipeline/                    # Python 3.11
│  ├─ requirements.txt          # geopandas shapely pyproj requests pandas jsonschema pytest reportlab
│  ├─ run.py                    # python run.py [--ingest] [--fuse] [--score] [--publish] [--all]
│  ├─ safelane/
│  │  ├─ config.py              # collection names, thresholds, default weights
│  │  ├─ ingest.py              # P1: download + cache to data/raw/
│  │  ├─ fuse.py                # P1: one row per segment, raw metrics + f_* factors
│  │  ├─ score.py               # P3: confidence, eligible, score, rank, reason_texts
│  │  ├─ export.py              # P1: write data/out/, copy to web/public/data/
│  │  ├─ validate.py            # P3: check output against the contract
│  │  └─ report.py              # P3: PDF priority list (phase 3)
│  └─ tests/
├─ data/
│  ├─ raw/                      # cached API responses (git-ignored)
│  └─ out/                      # segments.geojson, meta.json, stats.json
├─ web/                         # Next.js 14, TypeScript, Tailwind, maplibre-gl
│  ├─ public/data/              # segments.geojson + meta.json the app loads
│  └─ src/
│     ├─ app/page.tsx
│     ├─ lib/types.ts           # TS mirror of the contract (below)
│     ├─ lib/score.ts           # same formula as score.py, for live sliders
│     ├─ lib/loadData.ts
│     ├─ content/copy.ts        # P4: all user-facing text
│     └─ components/  MapView, RankList, SegmentCard, WeightSliders, MethodBox, Legend
└─ pitch/                       # P4: demo script, slide outline
```

## 3.2 Segment properties (one GeoJSON LineString feature per street segment, WGS84)

A segment is one undirected street edge: the two directions of a two-way street in road_network_heilbronn (rows (u, v, k) and (v, u, k)) are merged, and the segment keeps the id of the lower row. A measurement row that appears on both directions counts once.

| Field | Type | Meaning | Written by |
|---|---|---|---|
| id | string | Stable id, seg_000123 | P1 |
| osm_id | string \| null | OSM way id from road_network_heilbronn | P1 |
| name | string \| null | Street name | P1 |
| length_m | number | Length in metres | P1 |
| n_points | int | Max of the point counts of all matched layers | P1 |
| n_overtakes | int | Sum of the overtaking histogram | P1 |
| share_below_150 | number \| null | Share of overtakes under 150 cm (0–1) | P1 |
| avg_overtake_cm | number \| null | Average overtaking distance | P1 |
| danger_per_100m | number \| null | Danger points per 100 m of max(length_m, danger_min_length_m) | P1 |
| mean_danger_risk | number \| null | Mean Risk Index of danger points (0–1) | P1 |
| mean_pm_risk | number \| null | Mean Risk Index of PM danger points (0–1) | P1 |
| roughness_norm | number \| null | Normalized Roughness (0–1) | P1 |
| traffic_flow | number \| null | avg_traffic_flow (0–1, 1 = free flow) | P1 |
| avg_speed_kmh | number \| null | Average cycling speed | P1 |
| f_safety f_danger f_surface f_air f_flow | number | Normalised factors 0–1 (rules below) | P1 |
| missing | string[] | Factor keys with no data | P1 |
| confidence | number | 0–1 | P3 |
| eligible | bool | Enough data to rank | P3 |
| score | number \| null | 0–100 with default weights; null if not eligible | P3 |
| rank | int \| null | 1 = highest priority; null if not eligible | P3 |
| reason_texts | object | Factor key → one sentence, only for factors with data | P3 |

Factor rules (missing data → factor = 0 and the key goes into `missing`):

| Factor | Formula |
|---|---|
| f_safety | (n_below + k · city_share) / (n_overtakes + k), with n_below = round(share_below_150 · n_overtakes), k = safety_prior_k, city_share = city_share_below_150 |
| f_danger | min(1, danger_per_100m / P95 of danger_per_100m) |
| f_surface | roughness_norm |
| f_air | mean_pm_risk |
| f_flow | 1 − traffic_flow |

$$
\text{score} = 100 \cdot c \cdot \sum_{k} w_k f_k, \qquad c = \min\left(1, \frac{n_{\text{points}}}{N}\right), \qquad \sum_k w_k = 1
$$

f_safety shrinks small samples toward the city-wide share: one close pass out of one overtake is weak evidence, so it no longer gives f_safety = 1. city_share_below_150 is the share of all overtakes under 150 cm, over all segments. A segment is eligible when n_points ≥ min_points. Rank = eligible segments by score descending; ties by n_points descending, then id. Defaults (P1 may tune once on Tuesday night, then record in meta.json): weights safety 0.35, danger 0.25, surface 0.15, air 0.15, flow 0.10; min_points 5; confidence_n N = 30; safety_prior_k 10; danger_min_length_m 50.

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
| highway | string \| null | OSM `highway` of the (first) matched way | P1 fuse |
| maxspeed_kmh | number \| null | Speed limit; highest of the matched ways | P1 fuse |
| lanes | int \| null | OSM `lanes`; highest of the matched ways | P1 fuse |
| infra_class | "separated" \| "bike_street" \| "painted_lane" \| "shared_bus" \| "shared" \| "none" \| null | Bike infrastructure; least protected of the matched ways; null = no OSM match | P1 fuse |
| infra_gap | bool | eligible AND rank ≤ 25% of n_eligible AND infra_class in {none, shared, painted_lane} | P3 score |
| suggested_measure | string \| null | Rule-based suggestion (below) | P3 score |

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
{"version": "1.1", "source": "atrai", "generated_at": "2026-10-27T15:30:00+01:00",
 "city": "heilbronn", "n_segments": 0, "n_eligible": 0,
 "min_points": 5, "confidence_n": 30, "danger_p95": 0,
 "city_share_below_150": 0, "safety_prior_k": 10, "danger_min_length_m": 50,
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
}
```

## 3.5 Interfaces between people

| ID | What | Producer → consumer | File | Ready by |
|---|---|---|---|---|
| I1 | Contract | P1 → all | contract/, web/src/lib/types.ts | Tue 15:30 |
| I2 | Mock data | P3 → P2, P4 | web/public/data/* with source: "mock" | Tue 15:30 |
| I3 | Real factors (no scores) | P1 → P3 | data/out/segments.geojson | Tue 22:00 |
| I4 | Scored real data | P3 → P2 | run.py --publish copies to web/public/data/ | Wed 11:00 |
| I5 | Score parity fixture | P3 → P2 | contract/fixtures/score_cases.json | Wed 11:00 |
| I6 | Copy + colours | P4 → P2 | web/src/content/copy.ts, Tailwind theme | Wed 10:00 |

## 3.6 Git rules

- One branch per person: p1-data, p2-web, p3-qa, p4-design. Merge to main by pull request at each gate.
- Commit data/out/ and web/public/data/; never commit data/raw/.
- Changing the contract after 15:30 needs a 2-minute team agreement and a version bump in meta.json.

## 3.7 Changes

| Version | Change | Why |
|---|---|---|
| 1.1 | Merge both directions of a two-way street into one segment | Twins were ranked separately (same street twice) and the twin drawn on top took map clicks (G2 audit X1, B12e) |
| 1.1 | f_safety shrunk toward city_share_below_150 with k = 10; danger_per_100m over max(length, 50 m) | 1–3 overtakes on 11–20 m junction stubs filled the top 10 (G2 audit A9) |
| 1.1 | meta: city_share_below_150, safety_prior_k, danger_min_length_m; bbox = 2–98% view extent; stats.json | Make every factor reproducible from the published files |
| 1.1 | Optional OSM fields (3.2b): highway, maxspeed_kmh, lanes, infra_class, infra_gap, suggested_measure; meta: osm_fetched_at, attribution | Show what infrastructure a priority street has and what fix it needs; additive, score unchanged |
