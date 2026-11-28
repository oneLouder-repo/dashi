// Real posting for the Social Media Integrator: sealing, safe addresses, the three networks, once-only, the scheduler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, now } from '../server/db.js';
import { socialRoutes, sealer, safeUrl, blueskyFacets, firstLink, NETWORK_CLIENTS } from '../server/social.js';
import { textFor } from '../src/platform/social.js';

const PNG = `data:image/png;base64,${Buffer.from('fakepng').toString('base64')}`;

/** A stand-in for Bluesky, Mastodon and a webhook, recording what it was sent. */
function fakeNetworks() {
  const sent = [];
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = async (url, opts = {}) => {
    const u = new URL(url);
    const body = typeof opts.body === 'string' ? JSON.parse(opts.body) : opts.body;
    sent.push({ url: u.href, method: opts.method ?? 'GET', body, headers: opts.headers });
    if (u.pathname.endsWith('createSession')) return body.password === 'app-pass' ? reply(200, { accessJwt: 'jwt', did: 'did:plc:abc', handle: 'kestrel.bsky.social' }) : reply(401, { message: 'Invalid identifier or password' });
    if (u.pathname.endsWith('uploadBlob')) return reply(200, { blob: { $type: 'blob', ref: { $link: 'bafy' }, mimeType: 'image/png', size: 7 } });
    if (u.pathname.endsWith('createRecord')) return reply(200, { uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz', cid: 'c' });
    if (u.pathname === '/api/v1/accounts/verify_credentials') return opts.headers.authorization === 'Bearer tok' ? reply(200, { acct: 'kestrel', username: 'kestrel' }) : reply(401, { error: 'The access token is invalid' });
    if (u.pathname === '/api/v2/media') return reply(200, { id: 'm1' });
    if (u.pathname === '/api/v1/statuses') return reply(200, { id: 's1', url: `${u.origin}/@kestrel/s1` });
    if (u.pathname === '/hook') return reply(200, { url: 'https://hooks.example/p/1' });
    return reply(404, { error: 'no' });
  };
  return { sent, fetchImpl };
}

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'social-test-'));
  const db = openDb(dir);
  const q = (sql) => db.prepare(sql);
  q("INSERT INTO orgs (id, slug, name, plan, status, created_at) VALUES ('org-k', 'k', 'Kestrel', 'custom', 'active', ?)").run(now());
  const nets = fakeNetworks();
  const routes = socialRoutes({ q, now, dataDir: dir, mayPost: () => true, fetchImpl: nets.fetchImpl, allowLocal: false, envKey: 'test-key' });
  // The checks of addresses would look names up; the fake hosts are public.
  return { db, q, dir, routes, ...nets, done: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
const ctxFor = (s) => ({ fetchImpl: s.fetchImpl, check: (raw) => safeUrl(raw, { resolve: async () => [{ address: '93.184.216.34' }] }) });
async function connect(s, network, body) {
  const r = await NETWORK_CLIENTS[network].connect(body, ctxFor(s));
  s.q('INSERT INTO social_accounts (org_id, network, handle, secret, created_at) VALUES (?, ?, ?, ?, ?)').run('org-k', network, r.handle, sealer(s.dir, 'test-key').seal(r.secret), now());
  return r;
}

test('sealed secrets open again, and not under another key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'seal-'));
  const a = sealer(dir, 'one');
  const box = a.seal({ token: 'abc' });
  assert.ok(!box.includes('abc'));
  assert.deepEqual(a.open(box), { token: 'abc' });
  assert.throws(() => sealer(dir, 'two').open(box));
  const file = sealer(dir, '');
  assert.deepEqual(file.open(file.seal({ x: 1 })), { x: 1 }, 'a key file is made when no key is set');
  rmSync(dir, { recursive: true, force: true });
});

test('safeUrl wants https and refuses private addresses', async () => {
  const pub = async () => [{ address: '93.184.216.34' }];
  assert.equal((await safeUrl('https://mastodon.social', { resolve: pub })).host, 'mastodon.social');
  await assert.rejects(safeUrl('http://mastodon.social', { resolve: pub }), /https/);
  await assert.rejects(safeUrl('https://box.lan', { resolve: async () => [{ address: '192.168.1.4' }] }), /private/);
  await assert.rejects(safeUrl('https://127.0.0.1/hook'), /private/);
  await assert.rejects(safeUrl('https://user:pw@hooks.example', { resolve: pub }), /user name/);
  assert.equal((await safeUrl('http://localhost:9000/hook', { allowLocal: true })).port, '9000');
});

test('Bluesky facets use byte offsets, for links and hashtags', () => {
  const text = 'Café night 🎉 https://kestrel.example/a #Bay';
  const f = blueskyFacets(text);
  const bytes = new TextEncoder().encode(text);
  const slice = (x) => new TextDecoder().decode(bytes.slice(x.index.byteStart, x.index.byteEnd));
  assert.equal(slice(f[0]), 'https://kestrel.example/a');
  assert.equal(slice(f[1]), '#Bay');
  assert.equal(firstLink('Read it: https://x.example/post. Thanks'), 'https://x.example/post');
});

test('connecting checks the credentials with the network', async () => {
  const s = setup();
  await assert.rejects(NETWORK_CLIENTS.bluesky.connect({ identifier: 'kestrel.bsky.social', password: 'wrong' }, ctxFor(s)), /Invalid identifier/);
  const b = await NETWORK_CLIENTS.bluesky.connect({ identifier: '@kestrel.bsky.social', password: 'app-pass' }, ctxFor(s));
  assert.equal(b.handle, '@kestrel.bsky.social');
  const m = await NETWORK_CLIENTS.mastodon.connect({ instance: 'mastodon.example', token: 'tok' }, ctxFor(s));
  assert.equal(m.handle, '@kestrel@mastodon.example');
  await assert.rejects(NETWORK_CLIENTS.mastodon.connect({ instance: 'mastodon.example', token: 'bad' }, ctxFor(s)), /invalid/);
  s.done();
});

test('a push goes to each network once, with pictures and links', async () => {
  const s = setup();
  const routes = socialRoutes({ q: s.q, now, dataDir: s.dir, mayPost: () => true, fetchImpl: s.fetchImpl, envKey: 'test-key' });
  await connect(s, 'bluesky', { identifier: 'kestrel.bsky.social', password: 'app-pass' });
  await connect(s, 'mastodon', { instance: 'https://mastodon.example', token: 'tok' });
  const bs = await routes.pushOne('org-k', 'bluesky', { postId: 'p1', text: 'Vital Signs is out https://kestrel.example/vs #KestrelBay', image: { dataUrl: PNG, alt: 'A chart' } });
  assert.equal(bs.permalink, 'https://bsky.app/profile/kestrel.bsky.social/post/3kxyz');
  const rec = s.sent.find((x) => x.url.endsWith('createRecord')).body.record;
  assert.equal(rec.embed.$type, 'app.bsky.embed.images');
  assert.equal(rec.embed.images[0].alt, 'A chart');
  assert.equal(rec.facets.length, 2);
  const again = await routes.pushOne('org-k', 'bluesky', { postId: 'p1', text: 'changed' });
  assert.equal(again.already, true);
  assert.equal(s.sent.filter((x) => x.url.endsWith('createRecord')).length, 1, 'never posted twice');
  const ma = await routes.pushOne('org-k', 'mastodon', { postId: 'p1', text: 'Hello', image: { dataUrl: PNG, alt: '' } });
  assert.equal(ma.permalink, 'https://mastodon.example/@kestrel/s1');
  assert.deepEqual(s.sent.find((x) => x.url.endsWith('/api/v1/statuses')).body.media_ids, ['m1']);
  await assert.rejects(routes.pushOne('org-k', 'webhook', { postId: 'p1', text: 'x' }), /isn’t connected/);
  s.done();
});

test('the scheduler sends due posts to live networks and leaves practice ones for the page', async () => {
  const s = setup();
  const routes = socialRoutes({ q: s.q, now, dataDir: s.dir, mayPost: () => true, fetchImpl: s.fetchImpl, envKey: 'test-key' });
  await connect(s, 'mastodon', { instance: 'https://mastodon.example', token: 'tok' });
  const docs = { social: { posts: {
    a: { id: 'a', title: 'A', text: 'Due now', networks: ['mastodon'], status: 'scheduled', scheduledAt: '2026-01-01T10:00:00Z', results: {} },
    b: { id: 'b', title: 'B', text: 'Later', networks: ['mastodon'], status: 'scheduled', scheduledAt: '2099-01-01T10:00:00Z', results: {} },
    c: { id: 'c', title: 'C', text: 'Both', networks: ['mastodon', 'instagram'], status: 'scheduled', scheduledAt: '2026-01-01T10:00:00Z', results: {} },
  }, settings: { hashtags: ['bay'] } } };
  let writes = 0;
  await routes.sweep({ readDoc: (o, n) => docs[n], writeDoc: (o, n, d) => { docs[n] = d; writes++; }, textFor });
  const p = docs.social.posts;
  assert.equal(p.a.status, 'posted');
  assert.equal(p.a.results.mastodon.permalink, 'https://mastodon.example/@kestrel/s1');
  assert.equal(s.sent.find((x) => x.url.endsWith('/statuses')).body.status, 'Due now\n\n#bay');
  assert.equal(p.b.status, 'scheduled');
  assert.equal(p.c.status, 'scheduled', 'Instagram is still to go, from the page');
  assert.ok(p.c.results.mastodon.permalink);
  assert.equal(writes, 1);
  s.done();
});

test('checking a connection posts nothing public; Mastodon visibility and Bluesky length are kept to', async () => {
  const s = setup();
  try {
    const ctx = ctxFor(s);
    const bs = await NETWORK_CLIENTS.bluesky.connect({ identifier: 'kestrel.bsky.social', password: 'app-pass' }, ctx);
    assert.equal((await NETWORK_CLIENTS.bluesky.check(bs.secret, ctx)).handle, '@kestrel.bsky.social');
    assert.ok(!s.sent.some((x) => x.url.endsWith('createRecord')), 'a check makes no post');
    await assert.rejects(NETWORK_CLIENTS.bluesky.push(bs.secret, { text: 'x'.repeat(301) }, ctx), /301 characters/);
    assert.ok((await NETWORK_CLIENTS.bluesky.push(bs.secret, { text: '👋🏽'.repeat(300) }, ctx)).permalink, 'an emoji counts as one');

    const ma = await NETWORK_CLIENTS.mastodon.connect({ instance: 'mastodon.example', token: 'tok', visibility: 'unlisted' }, ctx);
    assert.equal(ma.secret.visibility, 'unlisted');
    await NETWORK_CLIENTS.mastodon.push(ma.secret, { text: 'Hello', idempotencyKey: 'p:m' }, ctx);
    assert.equal(s.sent.find((x) => x.url.endsWith('/api/v1/statuses')).body.visibility, 'unlisted');
    const odd = await NETWORK_CLIENTS.mastodon.connect({ instance: 'mastodon.example', token: 'tok', visibility: 'everyone!' }, ctx);
    assert.equal(odd.secret.visibility, 'public', 'an unknown visibility falls back to public');
    await assert.rejects(NETWORK_CLIENTS.mastodon.check({ ...ma.secret, token: 'bad' }, ctx), /invalid/);

    const wh = await NETWORK_CLIENTS.webhook.connect({ url: 'https://hooks.example/hook', signingSecret: 'sh' }, ctx);
    await NETWORK_CLIENTS.webhook.check(wh.secret, ctx);
    const ping = s.sent.filter((x) => x.url === 'https://hooks.example/hook').pop();
    assert.equal(ping.body.event, 'dashi.social.ping');
    assert.match(ping.headers['x-dashi-signature'], /^sha256=/);
  } finally { s.done(); }
});

test('an org whose plan has no live posting can practise, but nothing is sent and the scheduler skips it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'social-plan-'));
  const db = openDb(dir);
  const q = (sql) => db.prepare(sql);
  try {
    q("INSERT INTO orgs (id, slug, name, plan, status, created_at) VALUES ('org-k', 'k', 'Kestrel', 'basic', 'active', ?)").run(now());
    const nets = fakeNetworks();
    const routes = socialRoutes({ q, now, dataDir: dir, mayPost: () => true, mayGoLive: () => false, fetchImpl: nets.fetchImpl, envKey: 'test-key' });
    await connect({ q, dir, fetchImpl: nets.fetchImpl }, 'mastodon', { instance: 'mastodon.example', token: 'tok' });
    const before = nets.sent.length;
    const docs = { social: { posts: { a: { id: 'a', title: 'A', text: 'Due', networks: ['mastodon'], status: 'scheduled', scheduledAt: '2020-01-01T00:00:00Z', results: {} } } } };
    await routes.sweep({ readDoc: (o, n) => docs[n], writeDoc: () => {}, textFor });
    assert.equal(docs.social.posts.a.status, 'scheduled', 'left for when the plan allows it');
    assert.equal(nets.sent.length, before, 'nothing reached the network');
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
