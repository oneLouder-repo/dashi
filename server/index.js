/**
 * Start the platform: open (or create) the database, make sure the
 * platform admin exists, add the example orgs on a fresh install, and
 * listen. See DEPLOY.md for running it on a host.
 */
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { config, urlFor, orgHost } from './config.js';
import { openDb } from './db.js';
import { createApp, hashPassword } from './app.js';
import { exampleDocs } from '../src/platform/seeds.js';
import { MOCK_ORGS, mockDocs, mockFiles } from '../src/platform/mockOrgs.js';
import { seedPlanDocs } from '../src/platform/plandocs.js';
import { CLIENT_ORGS, CLIENT_RESET } from '../src/platform/clients/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scheduleBackups } from './backup.js';
import { importPodBeam } from './podBeam.js';
import { seedTrialShows } from './trialShows.js';
import { fileURLToPath } from 'node:url';

export async function start({ port = config.port, quiet = false, resolver } = {}) {
  const db = openDb(config.dataDir);
  const app = createApp(db, { resolver });
  const log = quiet ? () => {} : (...a) => console.log(...a);

  // The platform admin: you.
  const admin = app.ensureUser({ email: config.superAdmin.email, name: config.superAdmin.name, isSuper: true });
  if (config.superAdmin.password) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(config.superAdmin.password), admin.id);
  } else if (!admin.password_hash && !config.devLogin) {
    // No way in yet: make a password and show it once.
    const pw = randomBytes(12).toString('base64url');
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(pw), admin.id);
    log(`\nPlatform admin: ${config.superAdmin.email}\nPassword (shown once, change it with SUPER_ADMIN_PASSWORD): ${pw}\n`);
  }

  // The test platform, to try everything out. A database from an earlier
  // version gets the test orgs it doesn't have yet; nothing already there changes.
  if (config.seedExamples) {
    const added = config.testPlatform === 'clients' ? await seedClientPlatform(db, app) : await seedTestPlatform(db, app);
    if (added.length) log(`Added test organisations: ${added.join(', ')}.`);
  }
  // SJR's real audio files, from media/podBeam/ (loose files or the SJR site's zips).
  if (config.testPlatform === 'clients') {
    try {
      const said = importPodBeam(db, { dir: fileURLToPath(new URL('../media/podBeam', import.meta.url)), orgId: 'org-sjr', dataDir: config.dataDir, log });
      if (said) log(said);
    } catch (err) { log(`podBeam: ${err.message}`); }
    // Ten slideshow podcasts for Kestrel Bay, with a voice and music made here.
    try {
      const said = seedTrialShows(db, { orgId: 'org-kestrel', dataDir: config.dataDir, log });
      if (said) log(said);
    } catch (err) { log(`Trial shows: ${err.message}`); }
  }

  // A database snapshot now if there's none from today, then daily.
  const backups = scheduleBackups(db, log);

  // /healthz answers the host's health checks without touching sessions (and before a test server's access code).
  const server = createServer((req, res) => {
    if (req.url === '/healthz') {
      try { db.prepare('SELECT 1').get(); res.writeHead(200, { 'content-type': 'text/plain' }).end('ok'); } catch { res.writeHead(503).end('database unavailable'); }
      return;
    }
    // /version: which build is running, for testers' reports and deploy checks.
    if (req.url === '/version') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(JSON.stringify({ version: config.version, staging: config.staging }));
      return;
    }
    // Caddy (deploy/Caddyfile) asks before getting a certificate for an address: is it ours?
    if (req.url.startsWith('/tls-ask?')) {
      const domain = new URL(req.url, 'http://x').searchParams.get('domain') ?? '';
      res.writeHead(app.knownHost(domain.toLowerCase()) ? 200 : 404).end();
      return;
    }
    app.handle(req, res);
  });
  // Hosts stop the app with SIGTERM when deploying: finish what's in flight, close the database cleanly.
  const stop = (signal) => {
    log(`\n${signal}: stopping.`);
    clearInterval(backups);
    server.close(() => { try { db.close(); } catch { /* closed */ } process.exit(0); });
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  if (!quiet) for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => stop(sig));
  await new Promise((resolve) => server.listen(port, resolve));
  const actual = server.address().port;
  if (!quiet) {
    const orgs = db.prepare('SELECT slug, name FROM orgs ORDER BY name').all();
    log(`\nDashi is running.\n  Platform:      ${urlFor()}`);
    for (const o of orgs) log(`  ${o.name.padEnd(34).slice(0, 34)} ${urlFor(orgHost(o.slug))}`);
    log(config.devLogin ? '\nDev sign-in is on: the sign-in page lets you be anyone.' : '');
  }
  return { server, db, app, port: actual };
}

/**
 * The client test platform: just the client orgs (src/platform/clients),
 * each on its own subdomain. An org already there is left alone.
 */
async function seedClientPlatform(db, app) {
  const added = [];
  for (const spec of CLIENT_ORGS) {
    if (db.prepare('SELECT 1 FROM orgs WHERE id = ? OR slug = ?').get(spec.id, spec.slug)) continue;
    // A client with generated library files (Kestrel Bay) gives a bundle: its documents and the files to write.
    const { docs, files = [] } = spec.bundle ? spec.bundle() : { docs: spec.docs() };
    const made = files.length ? await mockFiles(files, spec.name) : [];
    if (made.length) fitSizes(docs.library, made);
    app.createOrg({ id: spec.id, slug: spec.slug, name: spec.name, plan: spec.plan, docs });
    if (made.length) writeMediaFiles(db, spec.id, made);
    added.push(spec.name);
  }
  added.push(...resetClientDocs(db, app));
  return added;
}

/**
 * A fresh start for testing: when CLIENT_RESET's mark is new, put its
 * documents back to their seeded versions (and empty its `clear` collections), saving the old ones first in
 * <data>/backups/. The mark is kept in platform_docs, so it happens once.
 */
export function resetClientDocs(db, app, reset = CLIENT_RESET) {
  const done = [];
  const row = db.prepare("SELECT json FROM platform_docs WHERE name = 'clients-reset'").get();
  if (JSON.parse(row?.json ?? 'null')?.mark === reset.mark) return done;
  const stamp = new Date().toISOString();
  for (const [orgId, names] of Object.entries(reset.docs)) {
    const spec = CLIENT_ORGS.find((o) => o.id === orgId);
    if (!spec || !db.prepare('SELECT 1 FROM orgs WHERE id = ?').get(orgId)) continue;
    const fresh = spec.docs();
    const dir = join(config.dataDir, 'backups');
    mkdirSync(dir, { recursive: true });
    for (const name of names) {
      const old = db.prepare('SELECT json FROM docs WHERE org_id = ? AND name = ?').get(orgId, name);
      if (old) writeFileSync(join(dir, `${orgId}-${name}-before-${reset.mark}-${stamp.replace(/[:.]/g, '-')}.json`), old.json);
      // A document the client doesn't seed (its plan documents, say) is cleared, so the pages start it again from the fresh plan.
      if (fresh[name]) app.writeDoc(orgId, name, fresh[name]);
      else db.prepare('DELETE FROM docs WHERE org_id = ? AND name = ?').run(orgId, name);
    }
    done.push(`${spec.name} (fresh ${names.join(' and ')} for ${reset.mark})`);
  }
  for (const [orgId, byDoc] of Object.entries(reset.clear ?? {})) {
    if (!db.prepare('SELECT 1 FROM orgs WHERE id = ?').get(orgId)) continue;
    const dir = join(config.dataDir, 'backups');
    for (const [name, collections] of Object.entries(byDoc)) {
      const old = db.prepare('SELECT json FROM docs WHERE org_id = ? AND name = ?').get(orgId, name);
      if (!old) continue;
      const doc = JSON.parse(old.json);
      if (!collections.some((c) => Object.keys(doc[c] ?? {}).length)) continue;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${orgId}-${name}-before-${reset.mark}-${stamp.replace(/[:.]/g, '-')}.json`), old.json);
      for (const c of collections) doc[c] = {};
      app.writeDoc(orgId, name, doc);
      done.push(`${orgId} (empty ${collections.join(' and ')} in ${name} for ${reset.mark})`);
    }
  }
  db.prepare('INSERT INTO platform_docs (name, json, updated_at, updated_by) VALUES (?, ?, ?, NULL) ON CONFLICT(name) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at')
    .run('clients-reset', JSON.stringify({ mark: reset.mark, at: stamp }), stamp);
  return done;
}

/** Write generated library files to the org's media folder and the media table. */
function writeMediaFiles(db, orgId, made, stamp = new Date().toISOString()) {
  const dir = join(config.dataDir, 'media', orgId);
  mkdirSync(dir, { recursive: true });
  for (const f of made) {
    writeFileSync(join(dir, f.mediaId), f.bytes);
    db.prepare('INSERT OR IGNORE INTO media (id, org_id, filename, mimetype, size, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)').run(f.mediaId, orgId, f.name, f.mimetype, f.bytes.length, stamp, null);
  }
}

/** Make the library's file sizes and types match the generated files. */
function fitSizes(library, made) {
  const sizes = Object.fromEntries(made.map((f) => [f.mediaId, f]));
  for (const it of Object.values(library?.items ?? {})) {
    const f = it.file && sizes[it.file.mediaId];
    if (f) Object.assign(it.file, { size: f.bytes.length, type: f.mimetype.split(';')[0] });
  }
}

/**
 * A fresh database gets the test platform (src/platform/mockOrgs.js): six
 * example orgs on all four plans, with their documents, library files and,
 * for one, a custom domain waiting for its DNS records.
 */
async function seedTestPlatform(db, app) {
  const stamp = new Date().toISOString();
  const added = [];
  const writeFiles = (orgId, made) => writeMediaFiles(db, orgId, made, stamp);
  for (const spec of MOCK_ORGS) {
    const existing = db.prepare('SELECT id FROM orgs WHERE id = ? OR slug = ?').get(spec.id, spec.slug);
    if (existing) {
      // A test org from before plan documents: give it its first one.
      if (existing.id === spec.id && !db.prepare("SELECT 1 FROM docs WHERE org_id = ? AND name = 'plandocs'").get(spec.id)) {
        const read = (name) => JSON.parse(db.prepare('SELECT json FROM docs WHERE org_id = ? AND name = ?').get(spec.id, name)?.json ?? 'null');
        const strategy = read('strategy');
        if (strategy) { app.writeDoc(spec.id, 'plandocs', seedPlanDocs(strategy, read('data'), read('org'))); added.push(`${spec.name} (plan document)`); }
      }
      // A test org from before the library: give it the test documents.
      const lib = db.prepare("SELECT json FROM docs WHERE org_id = ? AND name = 'library'").get(spec.id);
      if (existing.id !== spec.id || Object.keys(JSON.parse(lib?.json ?? '{}').items ?? {}).length) continue;
      const { docs, files } = mockDocs(spec, spec.existing ? exampleDocs(spec.id) : null);
      const made = await mockFiles(files, spec.name);
      fitSizes(docs.library, made);
      app.writeDoc(spec.id, 'library', docs.library);
      writeFiles(spec.id, made);
      added.push(`${spec.name} (documents)`);
      continue;
    }
    added.push(spec.name);
    const { docs, files, domain } = mockDocs(spec, spec.existing ? exampleDocs(spec.id) : null);
    const made = await mockFiles(files, spec.name);
    fitSizes(docs.library, made);
    app.createOrg({ id: spec.id, slug: spec.slug, name: spec.name, plan: spec.plan, docs });
    writeFiles(spec.id, made);
    if (domain) {
      db.prepare('INSERT OR IGNORE INTO domains (host, org_id, status, token, is_primary, created_at) VALUES (?, ?, ?, ?, 1, ?)').run(domain, spec.id, 'pending', randomBytes(12).toString('hex'), Date.now());
    }
  }
  return added;
}
