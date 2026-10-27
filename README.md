# SafeLane HN

Cycling-safety priority map for Heilbronn. The pipeline writes `segments.geojson` + `meta.json`; the web app only reads them. See [contract/CONTRACT.md](contract/CONTRACT.md).

## Pipeline (Python 3.11)

```bash
cd pipeline
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run steps:

```bash
python run.py --all          # or any of --ingest --fuse --score --publish
pytest                       # contract tests
```

## Web (Next.js 14, TypeScript, Tailwind, maplibre-gl)

```bash
cd web
npm install
npm run dev
```

The app loads `web/public/data/segments.geojson` and `web/public/data/meta.json`.
