// QA B13: field names in web/src/lib/types.ts (SegmentProps) vs contract/segment.schema.json,
// plus Meta vs the meta.json the pipeline writes.
//
//   node qa/contract_drift.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const types = readFileSync(join(ROOT, 'web/src/lib/types.ts'), 'utf8');
const schema = JSON.parse(readFileSync(join(ROOT, 'contract/segment.schema.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(ROOT, 'data/out/meta.json'), 'utf8'));

// All fields, or only the required ones (no `?`; optional ones are contract 3.2b additions).
function fields(name, requiredOnly = false) {
  const body = types.match(new RegExp(`interface ${name} \\{([\\s\\S]*?)\\n\\}`))[1];
  return [...body.matchAll(/(\w+)(\??)\s*:/g)].filter((m) => !requiredOnly || !m[2]).map((m) => m[1]);
}
const diff = (a, b) => a.filter((x) => !b.includes(x));

let ok = true;
for (const [label, ts, other] of [
  ['SegmentProps vs schema.properties', fields('SegmentProps'), Object.keys(schema.properties)],
  ['SegmentProps (required) vs schema.required', fields('SegmentProps', true), schema.required],
  ['Meta vs data/out/meta.json', fields('Meta'), Object.keys(meta)],
]) {
  const onlyTs = diff(ts, other), onlyOther = diff(other, ts);
  ok &&= !onlyTs.length && !onlyOther.length;
  console.log(`${label}: ${ts.length} vs ${other.length}; only in types.ts [${onlyTs}], only in other [${onlyOther}]`);
}
console.log(`RESULT B13: ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
