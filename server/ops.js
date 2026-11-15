/**
 * The control centre's checks: how the server is doing, whether email can
 * be delivered from the sending domain, whether the off-site database copies
 * (Litestream) are running, and the last server errors.
 */
import { promises as dnsp } from 'node:dns';
import { statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { listBackups } from './backup.js';

const started = Date.now();
const KEEP_ERRORS = 200;

/** Keep a server error for the admin to see (the newest 200). */
export function recordError(db, err, req) {
  try {
    db.prepare('INSERT INTO error_log (at, method, path, message, stack) VALUES (?, ?, ?, ?, ?)').run(
      new Date().toISOString(), req?.method ?? null, String(req?.url ?? '').split('?')[0].slice(0, 300), String(err?.message ?? err).slice(0, 1000), String(err?.stack ?? '').slice(0, 4000));
    db.prepare('DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?').run(KEEP_ERRORS);
  } catch { /* the log must never break a response */ }
}

/** The domain email is sent from: "Dashi <hello@dashi.app>" → dashi.app. */
export const mailDomain = (from = config.mail.from) => String(from).match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? null;

/** DKIM selectors to look for, by provider. Postmark's selector has a date in it, so it is checked by its key's shape. */
const DKIM = { resend: ['resend'], postmark: [], other: ['google', 'selector1', 'k1', 'default'] };

/**
 * Whether the sending domain is set up so mail lands in inboxes: SPF (who
 * may send for it), DKIM (a signature on each message) and DMARC (what to do
 * with mail that fails). Read straight from public DNS.
 */
export async function checkMailDns(domain, { provider = config.mail.provider, resolver = dnsp, selector = '' } = {}) {
  if (!domain || domain === 'localhost') return { domain, checks: [], note: 'Set MAIL_FROM to an address at your own domain.' };
  const txt = async (name) => {
    try { return (await resolver.resolveTxt(name)).map((r) => r.join('')); } catch { return []; }
  };
  // Resend puts its SPF on a send. subdomain; Postmark needs none (its Return-Path CNAME covers it).
  const spfHost = provider === 'resend' ? `send.${domain}` : domain;
  const [root, dmarc] = await Promise.all([txt(spfHost), txt(`_dmarc.${domain}`)]);
  const spf = root.find((r) => /^v=spf1/i.test(r));
  const returnPath = provider === 'postmark' && resolver.resolveCname
    ? (await resolver.resolveCname(`pm-bounces.${domain}`).catch(() => [])).some((c) => /mtasv\.net\.?$/i.test(c)) : null;
  const wantInclude = provider === 'resend' ? 'amazonses.com' : null;
  const selectors = [...new Set([selector, ...(DKIM[provider] ?? []), ...DKIM.other].filter(Boolean))];
  let dkim = null;
  for (const s of selectors) {
    const r = (await txt(`${s}._domainkey.${domain}`)).find((x) => /k=rsa|p=/i.test(x));
    if (r) { dkim = s; break; }
  }
  const policy = dmarc.find((r) => /^v=DMARC1/i.test(r));
  const p = policy?.match(/;\s*p=(\w+)/i)?.[1]?.toLowerCase();
  return {
    domain,
    checks: [
      provider === 'postmark'
        ? { id: 'spf', label: 'Return-Path', ok: !!returnPath, value: returnPath ? `pm-bounces.${domain}` : null,
            fix: returnPath ? null : `Add a CNAME record: pm-bounces.${domain} → pm.mtasv.net (Postmark's sender page shows it). It stands in for SPF.` }
        : { id: 'spf', label: 'SPF', ok: !!spf && (!wantInclude || spf.includes(wantInclude)), value: spf ?? null,
            fix: spf ? (wantInclude && !spf.includes(wantInclude) ? `Add include:${wantInclude} to the SPF record at ${spfHost}.` : null) : `Add a TXT record at ${spfHost}: v=spf1 ${wantInclude ? `include:${wantInclude} ` : ''}~all` },
      { id: 'dkim', label: 'DKIM', ok: !!dkim, value: dkim ? `${dkim}._domainkey` : null,
        fix: dkim ? null : provider === 'postmark' ? 'Postmark gives you a TXT record named like 20251115123456pm._domainkey; add it, then type its selector here to check it.' : 'Add the DKIM record your email provider shows for this domain.' },
      { id: 'dmarc', label: 'DMARC', ok: !!policy, value: policy ?? null, warn: p === 'none',
        fix: policy ? (p === 'none' ? 'Fine to start. After a few weeks of clean reports, change p=none to p=quarantine.' : null) : `Add a TXT record at _dmarc.${domain}: v=DMARC1; p=none; rua=mailto:dmarc@${domain}` },
    ],
  };
}

/** Whether Litestream is copying the database off-site, from its metrics page. */
export async function litestreamStatus({ fetcher = fetch } = {}) {
  const l = config.litestream;
  if (!l.bucket) return { configured: false, running: false };
  try {
    const r = await fetcher(l.metrics, { signal: AbortSignal.timeout(2000) });
    const text = await r.text();
    const num = (name) => {
      const line = text.split('\n').find((x) => x.startsWith(name) && !x.startsWith('#'));
      return line ? Number(line.trim().split(/\s+/).pop()) : null;
    };
    return { configured: true, running: r.ok, bucket: l.bucket, syncs: num('litestream_sync_count'), errors: num('litestream_sync_error_count'), walBytes: num('litestream_wal_size') };
  } catch {
    return { configured: true, running: false, bucket: l.bucket };
  }
}

const fileSize = (p) => { try { return statSync(p).size; } catch { return 0; } };

/** One look at the server: uptime, memory, disk, database, backups and errors. */
export function serverHealth(db) {
  const dbFile = join(config.dataDir, 'toolbox.db');
  let disk = null;
  try {
    const s = statfsSync(config.dataDir);
    disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch { /* not on this system */ }
  const mem = process.memoryUsage();
  const backups = listBackups();
  const since = new Date(Date.now() - 864e5).toISOString();
  return {
    version: config.version,
    node: process.version,
    startedAt: new Date(started).toISOString(),
    uptimeSec: Math.round((Date.now() - started) / 1000),
    memory: { rss: mem.rss, heap: mem.heapUsed },
    disk,
    database: { size: fileSize(dbFile) + fileSize(`${dbFile}-wal`), orgs: db.prepare('SELECT COUNT(*) AS n FROM orgs').get().n, users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n, sessions: db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires_at > ?').get(Date.now()).n },
    backups: { count: backups.length, latest: backups[0] ?? null, keepDays: config.backupDays },
    errors: { day: db.prepare('SELECT COUNT(*) AS n FROM error_log WHERE at > ?').get(since).n, latest: db.prepare('SELECT at, message FROM error_log ORDER BY id DESC LIMIT 1').get() ?? null },
    production: config.production,
    staging: config.staging,
  };
}
