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
| Ingest | `--ingest` | Downloads source datasets to `data/raw/`, or reuses cached files. |
| Fuse | `--fuse` | Combines datasets into segments and writes `data/out/segments.geojson` and `data/out/meta.json`. |
| Score | `--score` | Updates segment scores, rankings, and metadata in `data/out/`. |
| Publish | `--publish` | Copies both output files into `web/public/data/` for the frontend. |

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
