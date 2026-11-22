/**
 * Refresh the tip collection: run the tip harvester and put new candidates
 * in the review queue (Rhizome → Tips → Review queue). Nothing reaches the
 * library until a reviewer approves it, so it is safe to run any time.
 *
 *   npm run tips:refresh                       offline: distil from the registry's own summaries
 *   npm run tips:refresh -- --online           also fetch each registry page (politely) and offer excerpts
 *   npm run tips:refresh -- --theme ai         one theme
 *   npm run tips:refresh -- --source fsg-water one source
 *   npm run tips:refresh -- --data data-clients   the client test platform's database
 *   npm run tips:refresh -- --dry              show what it would add, change nothing
 *   npm run tips:refresh -- --fresh            fetch again even if a page was fetched in the last 30 days
 *   npm run tips:refresh -- --page fsg-water=saved.html   read a page you saved yourself (for sites that refuse robots)
 *
 * Fetched pages are cached as text in <data>/tips-cache/, so a second online
 * run doesn't ask the same sites again. The server can be running.
 */
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { politeFetcher } from './politeFetch.js';
import { HARVEST_SOURCES } from '../src/rhizome/harvestSources.js';
import { harvest, mergeHarvest, knownTexts, blankTips, htmlToText } from '../src/rhizome/harvest.js';
import { TIPS } from '../src/rhizome/tips.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
const online = flag('online');
const dry = flag('dry');
const dataDir = opt('data') ? resolve(opt('data')) : config.dataDir;
const theme = opt('theme');
const only = opt('source');

const db = openDb(dataDir);
const row = db.prepare("SELECT json FROM platform_docs WHERE name = 'tips'").get();
const doc = { ...blankTips(), ...(row ? JSON.parse(row.json) : {}) };

const texts = {};
// Pages saved by hand: --page <source id>=<file>, as many as you like.
args.forEach((x, i) => {
  if (x !== '--page') return;
  const [id, file] = String(args[i + 1] ?? '').split('=');
  if (!id || !file) return;
  const raw = readFileSync(resolve(file), 'utf8');
  texts[id] = /<\w+[^>]*>/.test(raw) ? htmlToText(raw) : raw;
  console.log(`  saved    ${id} (from ${file})`);
});
if (online) {
  const cacheDir = join(dataDir, 'tips-cache');
  mkdirSync(cacheDir, { recursive: true });
  const fetchPage = politeFetcher();
  const month = 30 * 86400000;
  for (const s of HARVEST_SOURCES.filter((x) => x.url && x.fetch && (!theme || x.theme === theme) && (!only || x.id === only))) {
    const file = join(cacheDir, `${s.id}.txt`);
    if (!flag('fresh') && existsSync(file) && Date.now() - statSync(file).mtimeMs < month) {
      texts[s.id] = readFileSync(file, 'utf8');
      console.log(`  cached   ${s.id}`);
      continue;
    }
    const r = await fetchPage(s.url);
    if (!r.ok) { console.log(`  skipped  ${s.id}: ${r.reason}`); continue; }
    texts[s.id] = htmlToText(r.text);
    writeFileSync(file, texts[s.id]);
    console.log(`  fetched  ${s.id} (${texts[s.id].length.toLocaleString()} characters)`);
  }
}

const result = harvest({ texts, known: knownTexts(doc, TIPS), rejectedIds: doc.rejected.map((r) => r.id), theme, only });
for (const l of result.log) console.log(`  ${l.source.padEnd(24)} ${l.points} from the registry, ${l.excerpts} from the page, ${l.dupes} already known`);
if (dry) {
  console.log(`\nWould offer ${result.candidates.length} candidates (dry run: nothing changed).`);
  process.exit(0);
}
const run = mergeHarvest(doc, result, { mode: online ? 'online' : 'offline', by: 'tips:refresh' });
db.prepare(`INSERT INTO platform_docs (name, json, updated_at, updated_by) VALUES ('tips', ?, ?, NULL)
  ON CONFLICT (name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`).run(JSON.stringify(doc), new Date().toISOString());
console.log(`\n${run.added} new candidates in the review queue (${doc.queue.length} waiting). Review them in Rhizome → Tips.`);
