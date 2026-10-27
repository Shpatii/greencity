// QA B11: cross-language parity on REAL data.
//
//   node qa/parity_real.mjs
//
// Transpiles web/src/lib/score.ts with the TypeScript compiler from web/node_modules,
// imports it, and scores every feature in web/public/data/segments.geojson with the
// default weights from meta.json, comparing against the stored score and rank.
//
// If score.ts exports no scoring function, the check FAILs. A reference JS port of the
// contract formula (same evaluation order as score.py) is then run as well, to show
// whether a straightforward TS port WOULD reach 100% parity. That part is informational.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(ROOT, 'web', 'package.json'));
const ts = require('typescript');

const FACTORS = ['safety', 'danger', 'surface', 'air', 'flow'];
const geo = JSON.parse(readFileSync(join(ROOT, 'web/public/data/segments.geojson'), 'utf8'));
const meta = JSON.parse(readFileSync(join(ROOT, 'web/public/data/meta.json'), 'utf8'));
const props = geo.features.map((f) => f.properties);

// 1. Import the real score.ts
const src = readFileSync(join(ROOT, 'web/src/lib/score.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const tmp = join(mkdtempSync(join(tmpdir(), 'qa-score-')), 'score.mjs');
writeFileSync(tmp, js);
const mod = await import(pathToFileURL(tmp).href);
const exported = Object.keys(mod);
console.log(`score.ts: ${src.split('\n').length} lines, exports: [${exported.join(', ')}]`);

function compare(label, scoreFn) {
  let scoreBad = 0, rankBad = 0, eligBad = 0;
  const scored = props.map((p) => {
    const r = scoreFn(p);
    if (r.eligible !== p.eligible) eligBad++;
    if ((r.eligible ? r.score : null) !== p.score) scoreBad++;
    return { id: p.id, n: p.n_points, eligible: r.eligible, score: r.score };
  });
  const order = scored.filter((s) => s.eligible)
    .sort((a, b) => b.score - a.score || b.n - a.n || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rank = new Map(order.map((s, i) => [s.id, i + 1]));
  for (const p of props) if ((rank.get(p.id) ?? null) !== p.rank) rankBad++;
  const n = props.length;
  console.log(`${label}: ${n} features; eligible mismatches ${eligBad}, score mismatches ${scoreBad}, `
    + `rank mismatches ${rankBad}; match ${(100 * (n - Math.max(scoreBad, rankBad)) / n).toFixed(2)}%`);
  return scoreBad === 0 && rankBad === 0 && eligBad === 0;
}

// 2. Real score.ts: scoreSegment per feature, plus its own rankSegments over all features
let realOk = false;
if (typeof mod.scoreSegment !== 'function' || typeof mod.rankSegments !== 'function') {
  console.log(`RESULT B11: FAIL - web/src/lib/score.ts does not export scoreSegment + rankSegments (exports: [${exported}])`);
} else {
  realOk = compare('score.ts:scoreSegment', (p) => mod.scoreSegment(p, meta.default_weights, meta));
  const ranked = new Map(mod.rankSegments(geo.features, meta.default_weights, meta).map((r) => [r.id, r]));
  const rankBad = props.filter((p) => ranked.get(p.id).rank !== p.rank || ranked.get(p.id).score !== p.score).length;
  console.log(`score.ts:rankSegments: ${props.length} features; score/rank mismatches ${rankBad}`);
  realOk &&= rankBad === 0;
  console.log(`RESULT B11: ${realOk ? 'PASS' : 'FAIL'} - score.ts vs stored score+rank on ${props.length} real features`);
}

// 3. Informational: reference port of the contract formula
const refOk = compare('reference JS port (informational)', (p) => {
  let weighted = 0;
  for (const k of FACTORS) weighted = weighted + meta.default_weights[k] * p[`f_${k}`];
  const c = Math.min(1, p.n_points / meta.confidence_n);
  const score = Math.floor(100 * c * weighted * 10 + 0.5 + 1e-6) / 10;
  return { eligible: p.n_points >= meta.min_points, score };
});
console.log(`reference port parity: ${refOk ? '100%' : 'NOT 100%'}`);
process.exit(realOk ? 0 : 1);
