/**
 * Real posting for the Social Media Integrator (d, 2026-11-27: "a first actual
 * build"). The networks that let an organisation post with its own
 * credentials, without an app review first:
 *
 *   bluesky    a handle and an app password (Settings → App passwords), through the AT Protocol
 *   mastodon   the server's address and an access token (Preferences → Development → New application, scope write:statuses write:media)
 *   webhook    a URL that gets each post as JSON: Zapier, Make, Buffer, IFTTT or your own server
 *
 * Instagram, Facebook, LinkedIn, TikTok and YouTube need an approved app on
 * each network's developer platform; they stay in practice mode until then.
 *
 * Credentials never go into an org document: they are kept here, sealed with
 * AES-256-GCM under a server key (SOCIAL_SECRET_KEY, or a key file made once
 * in the data folder). Each post goes to each network at most once
 * (social_pushes), so the page and the scheduler can't post twice.
 *
 *   GET    /api/social/accounts            the org's live accounts (never the secrets)
 *   POST   /api/social/accounts/<network>  connect: checks the credentials with the network first
 *   DELETE /api/social/accounts/<network>  forget them
 *   POST   /api/social/accounts/<network>/check    check the credentials still work (posts nothing public;
 *                                                  a webhook gets a { event: 'dashi.social.ping' })
 *   POST   /api/social/accounts/<network>/options  { visibility } for Mastodon: public, unlisted or private
 *   POST   /api/social/push                { network, postId, text, title?, link?, image?: { dataUrl, alt } }
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash, createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { HttpError, json, readJson } from './http.js';

export const SOCIAL_SCHEMA = [
  `CREATE TABLE social_accounts (
     org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, network TEXT NOT NULL, handle TEXT NOT NULL,
     secret TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, last_used_at TEXT, last_error TEXT,
     PRIMARY KEY (org_id, network));
   CREATE TABLE social_pushes (
     org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE, post_id TEXT NOT NULL, network TEXT NOT NULL,
     permalink TEXT, remote_id TEXT, at TEXT NOT NULL, PRIMARY KEY (org_id, post_id, network));`,
];

export const LIVE_NETWORKS = ['bluesky', 'mastodon', 'webhook'];
const clip = (s, n) => String(s ?? '').replace(/\u0000/g, '').trim().slice(0, n);
/** Mastodon's post visibility: public, unlisted (public but kept off timelines), or private (followers only). */
export const VISIBILITIES = ['public', 'unlisted', 'private'];
const visibilityOf = (v) => (VISIBILITIES.includes(v) ? v : 'public');
/** Characters as people count them (an emoji is one), which is how Bluesky counts its 300. */
export const graphemes = (s) => { try { return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(String(s ?? ''))].length; } catch { return [...String(s ?? '')].length; } };

/* ---------------------------------------------------------------- sealing */

export function sealer(dataDir, envKey = process.env.SOCIAL_SECRET_KEY) {
  let key;
  if (envKey) key = createHash('sha256').update(envKey).digest();
  else {
    const file = join(dataDir, 'social.key');
    if (!existsSync(file)) { writeFileSync(file, randomBytes(32)); try { chmodSync(file, 0o600); } catch { /* not here */ } }
    key = readFileSync(file);
  }
  return {
    seal(obj) {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
    },
    open(str) {
      const buf = Buffer.from(str, 'base64');
      const d = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8'));
    },
  };
}

/* ---------------------------------------------------------------- safe addresses */

const PRIVATE = [/^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^::1$/, /^f[cd]/i, /^fe80/i, /^::$/, /^::ffff:(127|10|192\.168|169\.254)\./i];
/**
 * An address the server may send to: https (http only when local addresses
 * are allowed, for testing), and not a private or loopback address, so an
 * org can't point the server at its own network.
 */
export async function safeUrl(raw, { allowLocal = false, resolve = lookup } = {}) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new HttpError(400, 'That isn’t a web address'); }
  if (u.protocol !== 'https:' && !(allowLocal && u.protocol === 'http:')) throw new HttpError(400, 'The address must start with https://');
  if (u.username || u.password) throw new HttpError(400, 'Leave the user name and password out of the address');
  if (!allowLocal) {
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const ips = isIP(host) ? [host] : (await resolve(host, { all: true }).catch(() => { throw new HttpError(400, `Couldn’t find ${host}`); })).map((x) => x.address);
    if (host === 'localhost' || ips.some((ip) => PRIVATE.some((re) => re.test(ip)))) throw new HttpError(400, 'That address is on a private network');
  }
  return u;
}

/* ---------------------------------------------------------------- text helpers */

/** Links and hashtags in a Bluesky post, with UTF-8 byte offsets as the AT Protocol wants. */
export function blueskyFacets(text) {
  const enc = new TextEncoder();
  const byteAt = (i) => enc.encode(text.slice(0, i)).length;
  const out = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g)) {
    out.push({ index: { byteStart: byteAt(m.index), byteEnd: byteAt(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,64})/gu)) {
    const start = m.index + m[1].length;
    out.push({ index: { byteStart: byteAt(start), byteEnd: byteAt(start + 1 + m[2].length) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }] });
  }
  return out;
}
export const firstLink = (text) => String(text ?? '').match(/https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/)?.[0] ?? null;

/** A picture sent from the page: a PNG or JPEG data URL, at most 950 KB (Bluesky's limit is about 1 MB). */
export function pictureOf(image) {
  const m = String(image?.dataUrl ?? '').match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 950_000) throw new HttpError(413, 'The picture is too big to post (over 950 KB)');
  return { type: m[1], bytes, alt: clip(image.alt, 1000) };
}

/* ---------------------------------------------------------------- the networks */

async function call(fetchImpl, url, { method = 'GET', headers = {}, body, what }) {
  let res;
  try { res = await fetchImpl(url, { method, headers, body, signal: AbortSignal.timeout(20_000) }); } catch (e) { throw new HttpError(502, `${what}: couldn’t reach it (${e.cause?.code ?? e.message})`); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw new HttpError(res.status === 401 || res.status === 403 ? 400 : 502, `${what}: ${data?.message ?? data?.error_description ?? data?.error ?? `it said ${res.status}`}`);
  return data ?? {};
}

export const NETWORK_CLIENTS = {
  bluesky: {
    label: 'Bluesky',
    async connect(body, { fetchImpl, check }) {
      const identifier = clip(body.identifier ?? body.handle, 200).replace(/^@/, '');
      const password = clip(body.password, 200);
      const service = (await check(body.service || 'https://bsky.social')).origin;
      if (!identifier || !password) throw new HttpError(400, 'Give the handle and an app password');
      const s = await call(fetchImpl, `${service}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier, password }), what: 'Bluesky' });
      return { handle: `@${s.handle ?? identifier}`, secret: { identifier, password, service } };
    },
    async check(secret, { fetchImpl }) {
      const s = await call(fetchImpl, `${secret.service}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: secret.identifier, password: secret.password }), what: 'Bluesky' });
      return { handle: `@${s.handle ?? secret.identifier}` };
    },
    async push(secret, post, { fetchImpl }) {
      const what = 'Bluesky';
      const n = graphemes(post.text);
      if (n > 300) throw new HttpError(400, `Bluesky: the post is ${n} characters, and Bluesky takes 300. Shorten it on the Bluesky tab.`);
      const s = await call(fetchImpl, `${secret.service}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: secret.identifier, password: secret.password }), what });
      const auth = { authorization: `Bearer ${s.accessJwt}` };
      const record = { $type: 'app.bsky.feed.post', text: post.text, createdAt: new Date().toISOString(), langs: ['en'] };
      const facets = blueskyFacets(post.text);
      if (facets.length) record.facets = facets;
      const pic = pictureOf(post.image);
      if (pic) {
        const up = await call(fetchImpl, `${secret.service}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'content-type': pic.type }, body: pic.bytes, what });
        record.embed = { $type: 'app.bsky.embed.images', images: [{ image: up.blob, alt: pic.alt }] };
      } else if (post.link) {
        record.embed = { $type: 'app.bsky.embed.external', external: { uri: post.link, title: clip(post.title, 300) || post.link, description: clip(post.text, 300) } };
      }
      const r = await call(fetchImpl, `${secret.service}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }), what });
      const rkey = String(r.uri ?? '').split('/').pop();
      return { permalink: `https://bsky.app/profile/${s.handle}/post/${rkey}`, remoteId: r.uri };
    },
  },
  mastodon: {
    label: 'Mastodon',
    async connect(body, { fetchImpl, check }) {
      const raw = clip(body.instance, 300);
      const instance = (await check(/^https?:\/\//.test(raw) ? raw : `https://${raw}`)).origin;
      const token = clip(body.token, 500);
      if (!token) throw new HttpError(400, 'Give the access token');
      const me = await call(fetchImpl, `${instance}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${token}` }, what: 'Mastodon' });
      return { handle: `@${me.acct ?? me.username}@${new URL(instance).host}`, secret: { instance, token, visibility: visibilityOf(body.visibility) } };
    },
    async check(secret, { fetchImpl }) {
      const me = await call(fetchImpl, `${secret.instance}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${secret.token}` }, what: 'Mastodon' });
      return { handle: `@${me.acct ?? me.username}@${new URL(secret.instance).host}` };
    },
    async push(secret, post, { fetchImpl }) {
      const what = 'Mastodon';
      const auth = { authorization: `Bearer ${secret.token}` };
      const mediaIds = [];
      const pic = pictureOf(post.image);
      if (pic) {
        const form = new FormData();
        form.append('file', new Blob([pic.bytes], { type: pic.type }), pic.type === 'image/png' ? 'post.png' : 'post.jpg');
        if (pic.alt) form.append('description', pic.alt);
        const m = await call(fetchImpl, `${secret.instance}/api/v2/media`, { method: 'POST', headers: auth, body: form, what });
        mediaIds.push(m.id);
      }
      const r = await call(fetchImpl, `${secret.instance}/api/v1/statuses`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', 'idempotency-key': post.idempotencyKey }, body: JSON.stringify({ status: post.text, media_ids: mediaIds, visibility: visibilityOf(secret.visibility) }), what });
      return { permalink: r.url ?? null, remoteId: r.id ?? null };
    },
  },
  webhook: {
    label: 'Webhook',
    async connect(body, { check }) {
      const u = await check(body.url);
      const signingSecret = clip(body.signingSecret, 200);
      return { handle: u.host, secret: { url: u.href, signingSecret } };
    },
    async check(secret, { fetchImpl, check }) {
      await check(secret.url);
      const payload = JSON.stringify({ event: 'dashi.social.ping', sentAt: new Date().toISOString() });
      const headers = { 'content-type': 'application/json', 'user-agent': 'Dashi-Social/1.0' };
      if (secret.signingSecret) headers['x-dashi-signature'] = `sha256=${createHmac('sha256', secret.signingSecret).update(payload).digest('hex')}`;
      await call(fetchImpl, secret.url, { method: 'POST', headers, body: payload, what: 'The webhook' });
      return { handle: new URL(secret.url).host };
    },
    async push(secret, post, { fetchImpl, check }) {
      await check(secret.url);
      const payload = JSON.stringify({ event: 'dashi.social.post', postId: post.postId, title: post.title || null, text: post.text, link: post.link, image: post.image?.dataUrl ? { dataUrl: post.image.dataUrl, alt: post.image.alt ?? '' } : null, sentAt: new Date().toISOString() });
      const headers = { 'content-type': 'application/json', 'user-agent': 'Dashi-Social/1.0', 'idempotency-key': post.idempotencyKey };
      if (secret.signingSecret) headers['x-dashi-signature'] = `sha256=${createHmac('sha256', secret.signingSecret).update(payload).digest('hex')}`;
      const r = await call(fetchImpl, secret.url, { method: 'POST', headers, body: payload, what: 'The webhook' });
      return { permalink: r.url ?? r.permalink ?? null, remoteId: r.id ?? null };
    },
  },
};

/* ---------------------------------------------------------------- routes and the scheduler */

/**
 * mayPost(a) says whether a person may post for their org (they can write the
 * social document). fetchImpl and allowLocal are for tests.
 */
export function socialRoutes({ q, now, dataDir, mayPost, fetchImpl = fetch, allowLocal = false, envKey }) {
  const box = sealer(dataDir, envKey);
  const check = (raw) => safeUrl(raw, { allowLocal });
  const ctx = { fetchImpl, check };
  const account = (orgId, network) => q('SELECT * FROM social_accounts WHERE org_id = ? AND network = ?').get(orgId, network);

  /** Post one thing to one network, once. */
  async function pushOne(orgId, network, post) {
    const done = q('SELECT permalink, remote_id, at FROM social_pushes WHERE org_id = ? AND post_id = ? AND network = ?').get(orgId, post.postId, network);
    if (done) return { permalink: done.permalink, remoteId: done.remote_id, at: done.at, already: true };
    const acc = account(orgId, network);
    if (!acc) throw new HttpError(400, `${NETWORK_CLIENTS[network]?.label ?? network} isn’t connected`);
    const text = clip(post.text, 10_000);
    if (!text && !post.image) throw new HttpError(400, 'The post is empty');
    const full = { ...post, text, link: post.link ?? firstLink(text), idempotencyKey: `${post.postId}:${network}` };
    try {
      const r = await NETWORK_CLIENTS[network].push(box.open(acc.secret), full, ctx);
      const at = now();
      q('INSERT OR IGNORE INTO social_pushes (org_id, post_id, network, permalink, remote_id, at) VALUES (?, ?, ?, ?, ?, ?)').run(orgId, post.postId, network, r.permalink, r.remoteId ? String(r.remoteId) : null, at);
      q('UPDATE social_accounts SET last_used_at = ?, last_error = NULL WHERE org_id = ? AND network = ?').run(at, orgId, network);
      return { ...r, at };
    } catch (e) {
      q('UPDATE social_accounts SET last_error = ? WHERE org_id = ? AND network = ?').run(clip(e.message, 300), orgId, network);
      throw e;
    }
  }

  async function handle(req, res, a, path) {
    if (!path.startsWith('/api/social/')) return false;
    if (!a.org || !a.member) throw new HttpError(401, 'Sign in to your organisation first');
    const method = req.method;
    let m;
    if (path === '/api/social/accounts' && method === 'GET') {
      const rows = q('SELECT network, handle, created_at, last_used_at, last_error FROM social_accounts WHERE org_id = ?').all(a.org.id);
      const optionsOf = (r) => { if (r.network !== 'mastodon') return {}; try { return { visibility: visibilityOf(box.open(r.secret).visibility) }; } catch { return {}; } };
      const full = q('SELECT network, secret FROM social_accounts WHERE org_id = ?').all(a.org.id);
      const opts = Object.fromEntries(full.map((r) => [r.network, optionsOf(r)]));
      return json(res, 200, { live: LIVE_NETWORKS, visibilities: VISIBILITIES, accounts: rows.map((r) => ({ network: r.network, handle: r.handle, connectedAt: r.created_at, lastUsedAt: r.last_used_at, lastError: r.last_error, ...opts[r.network] })) });
    }
    if (!mayPost(a)) throw new HttpError(403, 'You can look at the Social Media Integrator, but not post for your organisation');
    if ((m = path.match(/^\/api\/social\/accounts\/(\w+)\/(check|options)$/)) && method === 'POST') {
      const [, network, what] = m;
      const acc = LIVE_NETWORKS.includes(network) ? account(a.org.id, network) : null;
      if (!acc) throw new HttpError(404, `${NETWORK_CLIENTS[network]?.label ?? 'That network'} isn’t connected`);
      const secret = box.open(acc.secret);
      if (what === 'options') {
        const body = await readJson(req, 2_000);
        if (network !== 'mastodon') throw new HttpError(400, 'Only Mastodon has options here');
        secret.visibility = visibilityOf(body?.visibility);
        q('UPDATE social_accounts SET secret = ? WHERE org_id = ? AND network = ?').run(box.seal(secret), a.org.id, network);
        return json(res, 200, { network, visibility: secret.visibility });
      }
      try {
        const r = await NETWORK_CLIENTS[network].check(secret, ctx);
        q('UPDATE social_accounts SET handle = ?, last_error = NULL WHERE org_id = ? AND network = ?').run(r.handle ?? acc.handle, a.org.id, network);
        return json(res, 200, { network, ok: true, handle: r.handle ?? acc.handle, checkedAt: now() });
      } catch (e) {
        q('UPDATE social_accounts SET last_error = ? WHERE org_id = ? AND network = ?').run(clip(e.message, 300), a.org.id, network);
        throw e;
      }
    }
    if ((m = path.match(/^\/api\/social\/accounts\/(\w+)$/))) {
      const network = m[1];
      if (!LIVE_NETWORKS.includes(network)) throw new HttpError(404, 'That network can’t be connected for real yet');
      if (method === 'DELETE') {
        q('DELETE FROM social_accounts WHERE org_id = ? AND network = ?').run(a.org.id, network);
        return json(res, 200, { ok: true });
      }
      if (method === 'POST') {
        const body = await readJson(req, 10_000);
        const { handle, secret } = await NETWORK_CLIENTS[network].connect(body ?? {}, ctx);
        q(`INSERT INTO social_accounts (org_id, network, handle, secret, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (org_id, network) DO UPDATE SET handle = excluded.handle, secret = excluded.secret, created_at = excluded.created_at, created_by = excluded.created_by, last_error = NULL`)
          .run(a.org.id, network, handle, box.seal(secret), now(), a.user?.email ?? null);
        return json(res, 201, { network, handle, connectedAt: now() });
      }
    }
    if (path === '/api/social/push' && method === 'POST') {
      const body = await readJson(req, 2_000_000);
      const network = String(body?.network ?? '');
      if (!LIVE_NETWORKS.includes(network)) throw new HttpError(400, 'Not a network Dashi posts to yet');
      const postId = clip(body?.postId, 80);
      if (!postId) throw new HttpError(400, 'Which post?');
      const r = await pushOne(a.org.id, network, { postId, text: body.text, title: clip(body.title, 300), link: body.link ? (await check(body.link)).href : null, image: body.image ?? null });
      return json(res, 200, r);
    }
    throw new HttpError(404, 'Not here');
  }

  /**
   * Scheduled posts go out on time even with nobody on the page: once a
   * minute, each org with a live account gets its due posts sent to its live
   * networks (text and link; pictures go when posted from the page).
   */
  async function sweep({ readDoc, writeDoc, textFor, nowDate = new Date() }) {
    const orgs = q('SELECT DISTINCT org_id FROM social_accounts').all().map((r) => r.org_id);
    for (const orgId of orgs) {
      const doc = readDoc(orgId, 'social');
      if (!doc?.posts) continue;
      const live = new Set(q('SELECT network FROM social_accounts WHERE org_id = ?').all(orgId).map((r) => r.network));
      let changed = false;
      for (const p of Object.values(doc.posts)) {
        if (p.status !== 'scheduled' || !p.scheduledAt || new Date(p.scheduledAt) > nowDate) continue;
        const nets = (p.networks ?? []).filter((n) => live.has(n));
        if (!nets.length) continue;
        p.results ??= {};
        const failed = [];
        for (const n of nets) {
          try {
            const r = await pushOne(orgId, n, { postId: p.id, text: textFor(p, n, doc.settings ?? {}), title: p.title });
            p.results[n] = { permalink: r.permalink, at: r.at, live: true };
          } catch (e) { failed.push(n); p.results[n] = { error: clip(e.message, 300), at: now(), live: true }; }
        }
        // The page sends any practice networks the next time someone opens it.
        const rest = (p.networks ?? []).filter((n) => !live.has(n));
        if (!rest.length) { p.status = failed.length === nets.length ? 'failed' : 'posted'; p.postedAt = now(); p.failed = failed; }
        changed = true;
      }
      if (changed) writeDoc(orgId, 'social', doc);
    }
  }

  return { handle, pushOne, sweep, sealer: box };
}
