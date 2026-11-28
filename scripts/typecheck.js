// Type checks Dashi's own code with TypeScript (JSDoc types, no build step).
// The code was written without a type checker, so it starts with known
// findings. This is a ratchet: each file's count is kept in
// typecheck-baseline.json, and the check fails only when a file gets worse.
// Fix some, then run `npm run typecheck -- --update` to lock in the gain.
// Vendored libraries and node_modules are not ours and are left out.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const BASELINE = new URL('../typecheck-baseline.json', import.meta.url);
let out;
try {
  out = execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'jsconfig.json', '--pretty', 'false'], { encoding: 'utf8', maxBuffer: 64 << 20 });
} catch (e) { out = e.stdout ?? ''; }

const counts = {};
const lines = out.split('\n').filter((l) => /error TS\d+/.test(l) && !/^(vendor|node_modules)\//.test(l));
for (const l of lines) { const f = l.slice(0, l.indexOf('(')); counts[f] = (counts[f] ?? 0) + 1; }
const total = lines.length;

if (process.argv.includes('--update') || !existsSync(BASELINE)) {
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify({ total, files: sorted }, null, 2) + '\n');
  console.log(`typecheck: baseline saved, ${total} known findings in ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
const worse = Object.entries(counts).filter(([f, n]) => n > (base.files[f] ?? 0));
if (worse.length) {
  console.error('typecheck: new type findings in these files:\n');
  for (const [f] of worse) for (const l of lines.filter((x) => x.startsWith(f + '('))) console.error('  ' + l);
  console.error(`\n${worse.length} file(s) got worse than typecheck-baseline.json. Fix them, or if a finding is a false alarm, add a JSDoc type.`);
  process.exit(1);
}
const better = base.total - total;
console.log(`typecheck: ${total} known findings (baseline ${base.total})${better > 0 ? `, ${better} fewer: run with --update to lock that in` : ''}. No file got worse.`);
