# make all = rebuild data, run every test, build the static site (web/out/).
# Python targets need the venv: python3.11 -m venv pipeline/.venv (see README "Rebuild from scratch").

PY := .venv/bin/python

.PHONY: all data gates test web basemap

all: data test web

# Ingest (cached in data/raw/), fuse, score, report, publish to web/public/.
# Fresh download: make data REFRESH=1
data:
	cd pipeline && $(PY) -m pip install -q -r requirements.txt
	cd pipeline && $(PY) run.py --all $(if $(REFRESH),--refresh)

# The publish gates of the weekly data refresh (qa/gates.py), after `make data`.
gates:
	pipeline/$(PY) qa/gates.py

# Web tests run with Jest (web/package.json "test").
test:
	cd pipeline && $(PY) -m pytest -q
	cd web && npm ci && npm test

web:
	cd web && npm ci && npm run build

# Self-hosted base map -> web/public/basemap/ (a few times a year; not part of `all`).
basemap:
	cd pipeline && $(PY) run.py --basemap
