// Accessibility check: opens Dashi's main pages in a headless browser and runs
// axe-core (the WCAG 2.1 A/AA rules) on each. Starts its own server on a fresh,
// throwaway data folder with the example orgs, so it never touches your data.
//
//   npm run a11y              check, fail on anything new since the baseline
//   npm run a11y -- --update  save the current findings as the baseline
//
// Like the type check, this is a ratchet: known findings are kept in
// a11y-baseline.json (page → rule → count), and the run fails only when a page
// gets a new kind of problem or more of one. Needs Playwright with Chromium
// (`npx playwright install chromium`).
/* global window, document */ // used inside page.evaluate, which runs in the browser
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite'; // (Node 22 calls it experimental)

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASELINE = new URL('../a11y-baseline.json', import.meta.url);
const PORT = Number(process.env.A11Y_PORT || 5199);
const ORG = `http://example.localhost:${PORT}/`;

// Visitors (not signed in), then staff pages in the example org.
const PUBLIC = ['index.html', 'login.html', 'signup.html', 'pricing.html', 'about.html', 'site.html'];
const STAFF = ['home.html', 'mapper.html', 'org.html', 'pages.html', 'podcasts.html', 'place.html', 'rhizome.html',
  'plandoc.html', 'library.html', 'assets.html', 'learn.html', 'social.html', 'search.html', 'help.html', 'me.html'];

const dir = mkdtempSync(join(tmpdir(), 'dashi-a11y-'));
const srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.js'], {
  env: { ...process.env, DATA_DIR: dir, PORT: String(PORT), NODE_ENV: 'development', SEED_EXAMPLES: 'true' }, stdio: ['ignore', 'ignore', 'inherit'],
});
const stop = () => { srv.kill(); rmSync(dir, { recursive: true, force: true }); };

async function main() {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/version`)).ok) break; } catch {}
    if (i > 120) throw new Error('the server did not start');
    await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const found = {};
  const check = async (page, url) => {
    await page.goto(ORG + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.addScriptTag({ content: AXE });
    const res = await page.evaluate(() => window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }));
    found[url] = Object.fromEntries(res.violations.map((v) => [v.id, v.nodes.length]));
    const n = res.violations.reduce((s, v) => s + v.nodes.length, 0);
    console.log(`${n ? '•' : '✓'} ${url}${n ? `  ${res.violations.map((v) => `${v.id} ×${v.nodes.length}`).join(', ')}` : ''}`);
    if (process.env.A11Y_DUMP) for (const v of res.violations) for (const n of v.nodes) console.log('   ', v.id, n.target.join(' '), (n.any[0]?.message ?? n.failureSummary ?? '').slice(0, 160).replace(/\n/g, ' '));
    return res.violations;
  };
  const details = {};
  const visitor = await (await browser.newContext({ viewport: { width: 1360, height: 900 }, bypassCSP: true })).newPage();
  for (const u of PUBLIC) details[u] = await check(visitor, u);

  const db = new DatabaseSync(join(dir, 'toolbox.db'), { readOnly: true });
  const user = db.prepare(`SELECT u.id FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.org_id = 'org-example' AND m.role = 'admin' LIMIT 1`).get();
  db.close();
  const staff = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, bypassCSP: true })).newPage();
  await staff.goto(ORG + 'login.html');
  await staff.evaluate(async (id) => {
    const opts = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(body) });
    await fetch('/api/auth/dev', opts({ userId: id }));
    await fetch('/api/legal/accept', opts({}));
  }, user.id);
  for (const u of STAFF) details[u] = await check(staff, u);
  await browser.close();

  if (process.argv.includes('--update') || !existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(found, null, 2) + '\n');
    console.log('\na11y: baseline saved.');
    return 0;
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const worse = [];
  for (const [url, rules] of Object.entries(found)) for (const [rule, n] of Object.entries(rules)) if (n > (base[url]?.[rule] ?? 0)) worse.push([url, rule]);
  if (!worse.length) { console.log('\na11y: no page got worse than a11y-baseline.json.'); return 0; }
  console.error('\na11y: new accessibility problems:\n');
  for (const [url, rule] of worse) {
    const v = details[url].find((x) => x.id === rule);
    console.error(`  ${url}: ${v.help} (${v.impact}) ${v.helpUrl}`);
    for (const node of v.nodes.slice(0, 5)) console.error(`      ${node.target.join(' ')}`);
  }
  return 1;
}

main().then((code) => { stop(); process.exit(code); }, (e) => { console.error(e); stop(); process.exit(1); });
