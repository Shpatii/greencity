# SafeLane HN

Cycling-safety priority map for Heilbronn, Germany. A Python pipeline processes cycling data, and a Next.js frontend displays the results. See the [data contract](contract/CONTRACT.md) for the output format.

## Prerequisites

- **Node.js and npm:** the frontend requires Node.js 18.17 or newer, as specified in `web/package.json`.
- **Python 3.11:** needed to run the data pipeline and its tests.
- **Internet access:** needed to install dependencies and download source data on the first pipeline run.

Start the commands below from the repository root: the folder containing `pipeline/`, `web/`, and this README. Use PowerShell on Windows or Terminal on macOS.

## Start the app

Processed data is included in `web/public/data/`, so you can start the frontend before running the pipeline.

### Windows (PowerShell)

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

Using `npm.cmd` runs npm directly without requiring PowerShell script execution settings to change.

### macOS (Terminal)

```bash
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep this terminal running; press **Ctrl+C** to stop the server. If port 3000 is already in use, open the address printed in the terminal.

## Run the data pipeline

Use a separate terminal, starting from the repository root. These commands call the virtual environment's Python directly, so activation is not required on either platform.

### Windows (PowerShell)

Confirm Python 3.11 is installed, create the environment, and install dependencies:

```powershell
py -3.11 --version
cd pipeline
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Run all stages, then the test suite:

```powershell
.\.venv\Scripts\python.exe run.py --all
.\.venv\Scripts\python.exe -m pytest
```

### macOS (Terminal)

Confirm Python 3.11 is installed, create the environment, and install dependencies:

```bash
python3.11 --version
cd pipeline
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Run all stages, then the test suite:

```bash
.venv/bin/python run.py --all
.venv/bin/python -m pytest
```

### Stages and generated files

`--all` runs these stages in order:

| Stage | Flag | Result |
| --- | --- | --- |
| Ingest | `--ingest` | Downloads the ATRAI datasets and the OpenStreetMap ways (Overpass API, `data/raw/osm_overpass.json`) to `data/raw/`, or reuses cached files. |
| Fuse | `--fuse` | Combines datasets into segments and writes `data/out/segments.geojson` and `data/out/meta.json`. |
| Score | `--score` | Updates segment scores, rankings, and metadata in `data/out/`. |
| Report | `--report` | Writes the printable top-20 list to `data/out/report.pdf`. |
| Counters | `--counters` | MobiData BW bike counters inside the map area → `data/out/counters.geojson` (map context only). |
| Publish | `--publish` | Copies the output files (and `counters.geojson` if present) into `web/public/data/` and `report.pdf` into `web/public/` for the frontend. |

To run individual stages, replace `--all` in your platform's command with one or more flags, such as `--fuse --score --publish`. Ingest must have run before fusion; fusion must have run before scoring or publishing.

To download fresh source data instead of reusing the cache, use `--all --refresh`. This overwrites the cached source files and regenerates the outputs.

JSON files are written as UTF-8. Existing Windows-1252 source caches are automatically normalized with a warning; no manual encoding settings are needed.

The pipeline requirements include `tzdata` so timezone handling also works on Windows. Install the complete `pipeline/requirements.txt` on both platforms.

After publishing, refresh the browser to load the updated data.

## Build and preview the static app

Run these commands from `web/`, after installing frontend dependencies. The build writes the static site to `web/out/`.

### Windows (PowerShell)

```powershell
npm.cmd run build
py -3.11 -m http.server 3000 --directory out
```

### macOS (Terminal)

```bash
npm run build
python3.11 -m http.server 3000 --directory out
```

Open [http://localhost:3000](http://localhost:3000). Press **Ctrl+C** to stop the preview server.

## Rebuild from scratch

From a fresh clone to a built static site. On Windows, use the PowerShell equivalents from the sections above (`py -3.11`, `.\.venv\Scripts\python.exe`, `npm.cmd`).

```bash
git clone https://github.com/Shpatii/greencity.git
cd greencity

# Pipeline: Python 3.11 venv, dependencies, all stages
cd pipeline
python3.11 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py --all
cd ..

# Web app: exact dependencies from package-lock.json, static build to web/out/
cd web
npm ci
npm run build
```

`run.py --all` downloads the source datasets from the ATRAI API into `data/raw/` on the first run and reuses those cached files afterwards, so later runs work offline and give the same result. `data/raw/` is not committed. To fetch fresh data, run `.venv/bin/python run.py --all --refresh` (or delete `data/raw/`); this overwrites the cache and regenerates everything in `data/out/` and `web/public/`.

The same steps are in the `Makefile` (macOS/Linux, after creating `pipeline/.venv`):

| Target | Does |
| --- | --- |
| `make data` | Installs pipeline requirements, runs `run.py --all`. `make data REFRESH=1` re-downloads `data/raw/`. |
| `make test` | `pytest` in `pipeline/`, Jest in `web/`. |
| `make web` | `npm ci` and `npm run build` in `web/` (output in `web/out/`). |
| `make all` | `data`, then `test`, then `web`. |

## Deploy (Vercel)

The app is a static export (`output: 'export'` in `web/next.config.mjs`): no server code, only files. Vercel builds it from `web/` on every push; `main` becomes the production site and other branches and pull requests get preview URLs. `web/vercel.json` sets the install and build commands, turns off caching of `/data/*` so new data shows right after a deploy, and allows `/embed` to be framed by any site.

The data is not rebuilt on Vercel: run the pipeline locally, commit `data/out/` and `web/public/`, and push.

## Embed in the Green City Dashboard

`/embed` shows the map, the legend and the top 5 streets with the published scores, without the header, sliders or method box. It fills the whole iframe (side panel on the right, or below the map when the iframe is narrower than 640 px; best from about 900 px wide) and links to the full map in a new tab.

```html
<iframe
  src="https://YOUR-PROJECT.vercel.app/embed"
  title="SafeLane HN: cycling safety priority map for Heilbronn"
  style="width: 100%; height: 600px; border: 0;"
  loading="lazy"
></iframe>
```

Replace `YOUR-PROJECT.vercel.app` with the production domain from Vercel. A height of at least 480 px keeps both the map and the list readable.
