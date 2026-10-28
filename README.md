# SafeLane HN

Cycling-safety priority map for Heilbronn, Germany. Volunteers rode with senseBox:bike sensors that recorded how close cars passed, near misses, road roughness, fine dust and stop-and-go traffic. SafeLane HN turns those rides into a ranked list of street sections for the city to look at first, each with the reasons behind its rank, its bike infrastructure and a suggested measure.

- **Pipeline** (`pipeline/`, Python 3.11): downloads the ATRAI senseBox:bike data and OpenStreetMap, matches everything to street sections, scores and ranks them, and publishes static files.
- **Web app** (`web/`, Next.js static export): map, top-10 list, street cards, live weight sliders, CSV and PDF export, and an `/embed` view. No server code; every file, including the base map, is served from the site itself.
- **Data contract** (`contract/CONTRACT.md`): the format between the two, with the scoring method and its changelog.
- **Automation** (`.github/workflows/`): CI on every push and pull request, and a weekly data refresh that publishes only when every quality gate passes.

## Prerequisites

- **Node.js 20.9 or newer** and npm (`web/package.json` `engines`).
- **Python 3.11** for the pipeline and its tests.
- **Internet access** to install dependencies and, on the first pipeline run, to download the source data.

Run the commands below from the repository root. On Windows use PowerShell and `npm.cmd`, `py -3.11` and `.\.venv\Scripts\python.exe` in place of `npm`, `python3.11` and `.venv/bin/python`.

## Start the app

The processed data is committed in `web/public/data/`, so the app runs without the pipeline.

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Press **Ctrl+C** to stop.

## Run the data pipeline

```bash
cd pipeline
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py --all
.venv/bin/python -m pytest
```

`--all` runs these stages in order:

| Stage | Flag | Result |
| --- | --- | --- |
| Ingest | `--ingest` | Downloads the ATRAI datasets and the OpenStreetMap ways (Overpass API) to `data/raw/`, or reuses cached files. Fails when Overpass is down and nothing is cached. |
| Fuse | `--fuse` | Matches the data to street sections, applies the method rules, writes `data/out/segments.geojson`, `meta.json` and `stats.json`. |
| Score | `--score` | Scores and ranks the sections; adds infrastructure gaps and suggested measures. |
| Report | `--report` | Writes the printable top-20 list to `data/out/report.pdf`. |
| Counters | `--counters` | MobiData BW bike counters in the map area → `data/out/counters.geojson` (context only). |
| Publish | `--publish` | Copies the outputs to `web/public/data/` and `report.pdf` to `web/public/`. |

Single stages: replace `--all` with flags such as `--fuse --score --publish`. `--refresh` re-downloads `data/raw/` instead of using the cache. `--allow-missing-osm` lets the pipeline run offline without OpenStreetMap data, for development only: such data fails validation and must not be published.

`--basemap` (not part of `--all`) rebuilds the self-hosted base map, see [Refresh the base map](#refresh-the-base-map).

## The scoring method in short

Each eligible section (at least 5 measurements) gets a score from 0 to 100: five factors weighted 35 / 25 / 15 / 15 / 10 (close passes, near misses, rough surface, fine dust, stop-and-go), times a confidence that reaches 1 at 30 measurements. Close passes and near misses only count where they are reliable evidence: not on car-free paths or pedestrian zones, not where riders were standing (under 5 km/h), not on sections shorter than 25 m, and not with fewer than 20 recorded overtakes. The street card says when and why passes did not count. The full rules are in `contract/CONTRACT.md` 3.2; every threshold is recorded in `meta.json`.

## Checks

| What | Command (repo root) |
| --- | --- |
| Pipeline unit tests | `cd pipeline && .venv/bin/python -m pytest` |
| Published data matches the contract | `cd pipeline && .venv/bin/python -m safelane.validate ../web/public/data --mode full --expect-source atrai` |
| Data checks A3–A9 (writes `qa/top10-check.md`) | `pipeline/.venv/bin/python qa/check_data.py` |
| Factors recomputed independently from `data/raw/` | `pipeline/.venv/bin/python qa/recheck_factors.py` |
| Web lint, types, unit tests | `cd web && npm run lint && npm run type-check && npm test` |
| `score.ts` parity on the real data, types vs contract | `node qa/parity_real.mjs && node qa/contract_drift.mjs` |
| Browser checks incl. accessibility (axe) | see below |

Browser checks run against the production build:

```bash
(cd qa && npm ci && npx playwright install chromium)
(cd web && npm run build && npm start)     # serves web/out/ on :3000; keep it running
node qa/e2e.mjs --url http://localhost:3000
```

CI (`.github/workflows/ci.yml`) runs all of these on every pull request and push to `main`.

## Build and preview the static site

```bash
cd web
npm run build      # static site in web/out/
npm start          # node scripts/serve.mjs out 3000
```

Use `npm start`, not `python -m http.server`: the base map is read with HTTP range requests, which Python's server does not support, and `scripts/serve.mjs` also sends the production security headers from `vercel.json`.

Known issue: on **Windows**, Next.js 16.4.3 writes the router's prefetch files to nested folders (`map/__next.map/__PAGE__.txt` instead of `map/__next.map.__PAGE__.txt`), so local previews log a few 404s for prefetches. Navigation still works, and builds on Linux (Vercel, CI) are not affected.

## Operations runbook

### Weekly data refresh

`.github/workflows/data-refresh.yml` runs every Monday at 04:17 UTC and on demand (GitHub → Actions → Data refresh → Run workflow). It:

1. Runs `python run.py --all --refresh` with a fresh download. The last good Overpass response is kept in the Actions cache and reused when Overpass is down.
2. Runs the gates in `qa/gates.py`:
   - **G1 contract**: `safelane.validate --mode full`, including at least 90% OpenStreetMap coverage.
   - **G2 recheck**: `qa/recheck_factors.py` recomputes the factors independently from the raw data.
   - **G3 data**: `qa/check_data.py` has no FAIL; A9 needs at least 8 of the top 10 to pass the plausibility rules S1–S4.
   - **G4 drift**: the number of ranked sections changed by at most 20% against the published data.
3. Commits `data/out/`, `web/public/data/`, `web/public/report.pdf` and `qa/top10-check.md` as `data: refresh YYYY-MM-DD` when the data changed. Vercel deploys that push.

If any gate fails, the job fails, GitHub emails the repository owners, and the published data stays as it was. The job summary shows the gate results and the current top 10.

**When the job fails**, open the failed run and find the first `FAIL`:

| Failure | Likely cause | What to do |
| --- | --- | --- |
| Pipeline step, ATRAI or Overpass error | API down or rate limited | Run the workflow again later. |
| G1, OSM coverage or `osm_fetched_at` | Overpass returned partial data | Run again; check the Overpass status. |
| G2 or G3 A6/A8 mismatch | Code and data disagree | A bug: reproduce locally (below) before publishing anything. |
| G3 A9 | The top 10 now rests on weak evidence | Read `qa/top10-check.md` in the job summary; a method change may be needed (contract 3.5). |
| G4 drift | ATRAI added or removed a lot of data | Reproduce locally, compare `stats.json`; if the change is real, commit the data by hand after review. |

Reproduce a run locally: `cd pipeline && .venv/bin/python run.py --all --refresh && cd .. && pipeline/.venv/bin/python qa/gates.py`.

### Refresh the base map

The map background is a PMTiles extract of the [Protomaps](https://protomaps.com) OpenStreetMap build, plus its fonts and sprites, in `web/public/basemap/`. Refresh it a few times a year:

```bash
cd pipeline && .venv/bin/python run.py --basemap
```

It reads only the needed tiles of the latest daily build with HTTP range requests (about 1,100 tiles, 16 MB), then commit `web/public/basemap/`.

### Change the method

Follow `contract/CONTRACT.md` 3.5: bump the contract version, add a changelog row, and keep the schema, `types.ts`, `score.py`, `score.ts` and the parity fixture in step. CI fails when they drift apart.

## Deploy

The site is a static export (`output: 'export'`, `trailingSlash: true` in `web/next.config.mjs`). Vercel builds it from `web/` on every push: `main` is production, other branches and pull requests get preview URLs. The data is not rebuilt on Vercel; it comes from the committed files.

`web/vercel.json` sets:

- security headers on every page: a Content Security Policy that only allows the site itself, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and HSTS;
- a CSP that lets `/embed` be framed by other sites;
- no caching of `/data/*`, so new data shows right after a deploy.

Set `NEXT_PUBLIC_SITE_URL` (for example `https://safelane.example.org`) in the Vercel project when using a custom domain, so link previews use the right image URL. On Vercel's own domain this is automatic.

Any other static host works if it serves `index.html` for directory paths and supports HTTP range requests; copy the headers from `vercel.json`.

### Before going public

- [ ] Fill in the operator details in `web/src/content/legal.ts` (imprint and privacy page); until then both pages show placeholders. Have the texts checked by whoever is legally responsible.
- [ ] Connect the custom domain in Vercel and set `NEXT_PUBLIC_SITE_URL`.
- [ ] Replace `frame-ancestors *` for `/embed` in `web/vercel.json` with the Green City Dashboard origin.
- [ ] If a public body operates the site, add an accessibility statement (BITV 2.0).
- [ ] Push `.github/workflows/` and run the data refresh once by hand.

## Embed in the Green City Dashboard

`/embed` shows the map, the legend and the top 5 streets with the published scores, without the header, sliders or method box. It fills the whole iframe (side panel on the right, or below the map when the iframe is narrower than 640 px; best from about 900 px wide) and links to the full map in a new tab.

```html
<iframe
  src="https://YOUR-DOMAIN/embed/"
  title="SafeLane HN: cycling safety priority map for Heilbronn"
  style="width: 100%; height: 600px; border: 0;"
  loading="lazy"
></iframe>
```

A height of at least 480 px keeps both the map and the list readable.

## Rebuild from scratch

```bash
git clone https://github.com/Shpatii/greencity.git
cd greencity

cd pipeline
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py --all
cd ..

cd web
npm ci
npm run build
```

The same steps are in the `Makefile` (macOS/Linux, after creating `pipeline/.venv`):

| Target | Does |
| --- | --- |
| `make data` | Installs pipeline requirements, runs `run.py --all`. `make data REFRESH=1` re-downloads `data/raw/`. |
| `make gates` | The publish gates of the weekly refresh (`qa/gates.py`). |
| `make test` | `pytest` in `pipeline/`, Jest in `web/`. |
| `make web` | `npm ci` and `npm run build` in `web/`. |
| `make basemap` | Rebuilds the self-hosted base map. |
| `make all` | `data`, then `test`, then `web`. |

## Data sources and licences

- Bike sensor rides: ATRAI senseBox:bike, Heilbronn campaign ([api.atrai.bike](https://api.atrai.bike)).
- Streets, bike infrastructure and base map: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright); base map tiles built by Protomaps.
- Bike counters: MobiData BW, Eco-Counter, Datenlizenz Deutschland – Namensnennung – Version 2.0.
