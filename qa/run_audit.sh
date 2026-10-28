#!/usr/bin/env bash
# Re-run the whole QA audit from the repo root:  bash qa/run_audit.sh   (CI runs the same checks)
# Logs go to qa/logs/, screenshots to qa/screens/. Needs python3.11, node >= 20.9, network
# (pip, npm, Playwright browser, map tiles). Port 4173 must be free.
# SKIP_NPM_CI=1 keeps web/node_modules (e.g. while a `next dev` server is running).
set -u
cd "$(dirname "$0")/.."
ROOT=$PWD
L=qa/logs; mkdir -p $L qa/screens
VENV=${VENV:-/tmp/safelane-qa-venv}
PORT=${PORT:-4173}

# A1 clean venv + pipeline
rm -rf "$VENV" && python3.11 -m venv "$VENV"
"$VENV/bin/pip" install -q -r pipeline/requirements.txt > $L/a1_pip.log 2>&1
( cd pipeline && S=$(date +%s)
  env -i HOME="$HOME" PATH=/usr/bin:/bin "$VENV/bin/python" run.py --all > ../$L/a1_run_all.log 2>&1
  echo "exit=$? runtime=$(( $(date +%s) - S ))s" | tee -a ../$L/a1_run_all.log )

# A2 contract validator (+ pipeline unit tests)
( cd pipeline && "$VENV/bin/python" -m safelane.validate ../data/out/segments.geojson --mode full --expect-source atrai; echo "exit=$?" ) | tee $L/a2_validate.log
( cd pipeline && "$VENV/bin/python" -m pytest -q tests ) | tail -1

# A3 sha256 of both copies
shasum -a 256 data/out/segments.geojson web/public/data/segments.geojson data/out/meta.json web/public/data/meta.json | tee $L/a3_sha.log

# A5 + A7 independent factor recheck (no safelane import)
"$VENV/bin/python" qa/recheck_factors.py | tee $L/a5_recheck_factors.log

# A3 A4 A6 A7 A8 A9 data checks + duplicate geometries
python3 qa/check_data.py | tee $L/a_check_data.log
python3 qa/duplicate_geoms.py | tee $L/x_duplicate_geoms.log

# B10 web build / lint / types / tests
( cd web && if [ -z "${SKIP_NPM_CI:-}" ]; then npm ci > ../$L/b10_npm_ci.log 2>&1; echo "npm ci exit=$?"; fi
  npm run build > ../$L/b10_build.log 2>&1; echo "build exit=$?"
  npm run lint > ../$L/b10_lint.log 2>&1; echo "lint exit=$?"
  npm run type-check > ../$L/b10_tsc.log 2>&1; echo "tsc exit=$?"
  npm test > ../$L/b10_test.log 2>&1; echo "test exit=$?" )
grep -l "score_cases" -r web/src || echo "no web test reads contract/fixtures/score_cases.json"
( cd web && npm audit --omit=dev 2>&1 | tail -4 )

# B11 parity on real data, B13 contract drift
node qa/parity_real.mjs | tee $L/b11_parity_real.log
node qa/contract_drift.mjs | tee $L/b13_contract_drift.log

# B12 browser checks against the static export
( cd qa && npm install --silent && npx playwright install chromium > /dev/null )
node web/scripts/serve.mjs web/out "$PORT" > $L/b12_server.log 2>&1 &
SERVER=$!; sleep 2
node qa/e2e.mjs --url "http://localhost:$PORT" | tee $L/b12_e2e.log
kill $SERVER

# C14 repo hygiene
git fetch --all -q
for b in $(git branch -r | grep -v HEAD); do echo "$b not in main: $(git rev-list --count origin/main..$b)"; git log --oneline origin/main..$b | head -5; done | tee $L/c14_branches.log
git ls-files data/raw | wc -l
git log --all --name-only --pretty=format: | grep -iE '(^|/)\.env' | sort -u
git grep -nIE '(api[_-]?key|secret|token|password|bearer|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})' -- . ':!*.geojson' ':!*package-lock.json'
for f in data/out/meta.json web/public/data/meta.json; do echo "origin/main:$f"; git show origin/main:$f | grep -E '"source"|n_eligible'; done
git status --short
