import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { networkOf, sharedPeople, sharedEco, sharedLibrary, sharedMobilize, sharedFor, shareOf } from '../src/platform/network.js';

/* ------------------------------------------------------------ the filters */

test('a network is hubs, members and siblings, from active links only', () => {
  const links = [
    { hubId: 'hub', memberId: 'a', status: 'active' },
    { hubId: 'hub', memberId: 'b', status: 'active' },
    { hubId: 'hub', memberId: 'c', status: 'pending' },
    { hubId: 'global', memberId: 'hub', status: 'active' },
  ];
  assert.deepEqual([...networkOf('a', links)], [['hub', 'hub'], ['b', 'sibling']]);
  assert.deepEqual([...networkOf('hub', links)], [['global', 'hub'], ['a', 'member'], ['b', 'member']]);
  assert.equal(networkOf('c', links).size, 0, 'a pending link shares nothing');
});

test('only what is meant to travel leaves an org', () => {
  const org = { staff: { s1: { id: 's1', name: 'Ana', email: 'ana@x.example', phone: '1', roleId: 'staff', teamIds: ['t'] }, g: { id: 'g', name: 'Guest', roleId: 'guest' } }, teams: { t: { name: 'Carbon' } } };
  const people = sharedPeople(org);
  assert.equal(people.length, 1);
  assert.deepEqual(people[0].teams, ['Carbon']);
  assert.ok(!('email' in people[0]) && !('phone' in people[0]));

  const eco = sharedEco({
    partners: { p1: { id: 'p1', share: 'network' }, p2: { id: 'p2', share: 'own' } },
    sites: { s1: { id: 's1', partnerId: 'p1', geo: [1, 2] }, s2: { id: 's2', partnerId: 'p1', geo: [3, 4], held: true }, s3: { id: 's3', partnerId: 'p2', geo: [5, 6] } },
    series: { x: { id: 'x', siteId: 's2' }, y: { id: 'y', siteId: 's3' } },
    files: { f: { id: 'f', partnerId: 'p1', name: 'a.csv', text: 'secret,raw' } },
  });
  assert.deepEqual(Object.keys(eco.sites), ['s1', 's2']);
  assert.equal(eco.sites.s2.geo, null, 'a held-back site never shows where it is');
  assert.deepEqual(Object.keys(eco.series), ['x']);
  assert.ok(!('text' in eco.files.f));

  const lib = sharedLibrary({ folders: { a: { id: 'a' }, b: { id: 'b', parentId: 'a' }, c: { id: 'c' } }, items: { i: { id: 'i', folderId: 'b', file: { name: 'x.pdf', size: 3, type: 'application/pdf', mediaId: 'm' } }, j: { id: 'j', folderId: 'c' } } }, ['a']);
  assert.deepEqual(Object.keys(lib.items), ['i']);
  assert.deepEqual(lib.items.i.file, { name: 'x.pdf', size: 3, type: 'application/pdf' });

  const mob = sharedMobilize({ objects: {
    o: { id: 'o', consent: { share: 'open' }, uptake: [{ kind: 'story', by: 's1' }], reviews: [] },
    p: { id: 'p', consent: { share: 'partners', ocap: true } },
    q: { id: 'q', consent: { share: 'held' } },
    r: { id: 'r', consent: { share: 'internal' } },
  } });
  assert.deepEqual(Object.keys(mob.objects), ['o']);
  assert.ok(!('by' in mob.objects.o.uptake[0]));

  assert.equal(sharedFor('people', { org }), null, 'off until switched on');
  assert.equal(sharedFor('people', { org: { ...org, network: { share: { people: true } } } }).length, 1);
  assert.deepEqual(shareOf({ network: { share: { library: ['a', 3], eco: 'yes' } } }), { people: false, eco: false, mobilize: false, library: ['a'] });
});

/* ------------------------------------------------------------- the server */

const dataDir = mkdtempSync(join(tmpdir(), 'toolbox-net-'));
Object.assign(process.env, { DATA_DIR: dataDir, DEV_LOGIN: 'true', SEED_EXAMPLES: 'true', BASE_DOMAIN: 'localhost', NODE_ENV: 'test' });
let srv;
before(async () => { srv = await (await import('../server/index.js')).start({ port: 0, quiet: true }); });
after(() => { srv.server.closeAllConnections?.(); srv.server.close(); srv.db.close(); rmSync(dataDir, { recursive: true, force: true }); });

function call(host, method, path, { body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.from(JSON.stringify(body));
    const req = request({ host: '127.0.0.1', port: srv.port, method, path, headers: {
      host, ...(cookie && { cookie }), ...(data && { 'content-type': 'application/json' }), ...(method !== 'GET' && { 'x-toolbox': '1' }),
    } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { const text = Buffer.concat(chunks).toString('utf8'); let json = null; try { json = JSON.parse(text); } catch { /* */ } resolve({ status: res.statusCode, json, headers: res.headers }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
async function signIn(email, host) {
  const user = (await call(host, 'GET', '/api/auth/options')).json.dev.find((u) => u.email === email);
  const res = await call(host, 'POST', '/api/auth/dev', { body: { userId: user.id } });
  const cookie = res.headers['set-cookie'][0].split(';')[0];
  await call(host, 'POST', '/api/legal/accept', { cookie, body: {} });
  return cookie;
}

test('orgs link by invitation, share only what they switch on, and either side can end it', async () => {
  const admin = await signIn('admin@localhost', 'localhost');
  for (const [slug, plan] of [['seahub', 'network'], ['sealab', 'standard'], ['sealone', 'free']]) {
    const r = await call('localhost', 'POST', '/api/admin/orgs', { cookie: admin, body: { name: slug, slug, plan, adminEmail: `lead@${slug}.example` } });
    assert.ok(r.status < 300, `${slug}: ${r.json?.error}`);
  }
  const HUB = 'seahub.localhost', LAB = 'sealab.localhost', LONE = 'sealone.localhost';
  const hub = await signIn('lead@seahub.example', HUB);
  const lab = await signIn('lead@sealab.example', LAB);
  const lone = await signIn('lead@sealone.example', LONE);

  // A plan without linked orgs can't invite.
  assert.equal((await call(LONE, 'POST', '/api/network/invite', { cookie: lone, body: { slug: 'seahub', as: 'hub' } })).status, 402);
  assert.equal((await call(HUB, 'POST', '/api/network/invite', { cookie: hub, body: { slug: 'nobody' } })).status, 404);

  const inv = await call(HUB, 'POST', '/api/network/invite', { cookie: hub, body: { slug: 'sealab', as: 'member' } });
  assert.equal(inv.status, 200);
  assert.equal(inv.json.status, 'pending');
  assert.equal((await call(HUB, 'POST', '/api/network/invite', { cookie: hub, body: { slug: 'sealab' } })).status, 409, 'no second invitation');
  // The inviter can't accept for the other side, and a pending link shares nothing.
  assert.equal((await call(HUB, 'POST', `/api/network/links/${inv.json.id}/accept`, { cookie: hub })).status, 409);
  const mine = (await call(LAB, 'GET', '/api/network', { cookie: lab })).json;
  assert.equal(mine.links[0].waitingOnUs, true);
  assert.equal(mine.orgs.length, 0);

  assert.equal((await call(LAB, 'POST', `/api/network/links/${inv.json.id}/accept`, { cookie: lab })).status, 200);
  assert.deepEqual((await call(LAB, 'GET', '/api/network', { cookie: lab })).json.orgs.map((o) => [o.slug, o.role]), [['seahub', 'hub']]);

  // Nothing travels until the hub switches people on.
  assert.deepEqual((await call(LAB, 'GET', '/api/network/shared?kind=people', { cookie: lab })).json.orgs, []);
  assert.equal((await call(LAB, 'POST', '/api/network/share', { cookie: lab, body: { people: true } })).status, 200);
  assert.equal((await call(HUB, 'POST', '/api/network/share', { cookie: hub, body: { people: true, library: ['not-a-folder'] } })).json.share.library.length, 0);
  const people = (await call(LAB, 'GET', '/api/network/shared?kind=people', { cookie: lab })).json.orgs;
  assert.equal(people[0].org.slug, 'seahub');
  assert.ok(people[0].data.length >= 1 && people[0].data.every((p) => !('email' in p)));
  // A kind whose plugin the member's org doesn't use stays closed.
  assert.equal((await call(LAB, 'GET', '/api/network/shared?kind=mobilize', { cookie: lab })).status, 403);
  assert.equal((await call(LAB, 'GET', '/api/network/shared?kind=nope', { cookie: lab })).status, 400);
  // Visitors get nothing.
  assert.equal((await call(LAB, 'GET', '/api/network/shared?kind=people')).status, 401);

  // Either side can end it; then nothing travels.
  assert.equal((await call(LAB, 'DELETE', `/api/network/links/${inv.json.id}`, { cookie: lab })).status, 200);
  assert.deepEqual((await call(LAB, 'GET', '/api/network/shared?kind=people', { cookie: lab })).json.orgs, []);
  assert.equal((await call(HUB, 'GET', '/api/network', { cookie: hub })).json.links.length, 0);
});
