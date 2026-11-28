import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLIENT_ORGS } from '../src/platform/clients/index.js';
import { sjrPodcasts, dateFromName, titleFromFile } from '../src/platform/clients/sjr.js';
import { SJR_SEASONS, RADIO_ADA } from '../src/platform/clients/sjrArchive.js';
import { actuaDocs, ACTUA_TAGS } from '../src/platform/clients/actua.js';
import { fmtDuration } from '../src/site/station.js';

test('the client orgs, each on its own subdomain', () => {
  assert.deepEqual(CLIENT_ORGS.map((o) => o.slug).slice(0, 5), ['sjr', 'actua-ai', 'kestrel', 'coalition', 'halcyon']);
  for (const o of CLIENT_ORGS) {
    const docs = o.docs();
    assert.equal(docs.org.id, o.id);
    assert.ok(docs.org.staff);
    // The coalition is a Place example: no plan is made up for it.
    if (o.id === 'org-coalition') { assert.ok(docs.place && !docs.strategy); continue; }
    // The Halcyon member labs are small: people, a library and what they share.
    if (!docs.strategy && o.id.startsWith('org-') && docs.org.network) continue;
    assert.ok(docs.strategy);
    // One framework per org, and plans sit under it, never inside another plan.
    const nodes = Object.values(docs.strategy.nodes);
    assert.equal(nodes.filter((n) => n.type === 'framework').length, 1);
    for (const p of nodes.filter((n) => n.type === 'plan')) assert.equal(docs.strategy.nodes[p.parentId].type, 'framework');
  }
});

test('SJR: every archive file becomes an episode that links to its audio', () => {
  const doc = sjrPodcasts();
  const files = Object.values(SJR_SEASONS).reduce((n, [, list]) => n + list.trim().split('\n').length, 0);
  const eps = Object.values(doc.episodes);
  assert.equal(eps.length, files + RADIO_ADA.length);
  assert.equal(new Set(eps.map((e) => e.audio.url)).size, eps.length, 'no two episodes share a file');
  for (const e of eps) {
    assert.match(e.audio.url, /^https:\/\/socialjusticeradio\.onelouder\.ca\/shows\//);
    assert.doesNotMatch(e.audio.url, /[\s']/);
    assert.ok(!e.audio.mediaId, 'linked, not uploaded');
    assert.match(e.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(e.publishedAt <= '2026-11-21');
    assert.ok(e.title && !/\.mp3|\.wav|\.m4a/i.test(e.title));
    assert.ok(doc.podcasts[e.podcastId].seasons[e.season]);
  }
  // Episode numbers are unique within each season.
  const keys = eps.map((e) => `${e.podcastId}/${e.season}/${e.number}`);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(doc.episodes['ep-sjr-s14-09'].title, 'AI Data Center');
});

test('SJR air dates come from the file name where it has one', () => {
  assert.equal(dateFromName('SJR_SE9_03_31_2022_Clutch Conversation.mp3', 2021), '2022-03-31');
  assert.equal(dateFromName('SJR S12 Apr 10 Sexual Violence Prevention Week.mp3', 2024), '2025-04-10');
  assert.equal(dateFromName('SJR_Oct22_SARS.mp3', 2020), '2020-10-22');
  assert.equal(dateFromName('SJR_S05_03_29_YAC.wav', 2017), '2018-03-29');
  assert.equal(dateFromName('SJR Jan 12, 2023 - Reseed.mp3', 2022), '2023-01-12');
  assert.equal(dateFromName('coady.mp3', 2014), null);
  assert.equal(titleFromFile('SJR-S13-E7-Senator Kim Pate talk.mp3'), 'Senator Kim Pate talk');
});

test('Actua: map links say whether they are documented or speculative', () => {
  const docs = actuaDocs();
  const map = docs['map/map-actua-ai'];
  const conns = Object.values(map.connectors);
  assert.ok(conns.length > 20);
  for (const c of conns) {
    assert.ok(['documented', 'speculative'].includes(c.meta.basis));
    assert.ok(map.actors[c.from.actorId] && map.actors[c.to.actorId]);
    if (c.meta.basis === 'speculative') assert.equal(c.layerId, 'layer-speculative');
  }
  // CanCode and Apple are on the map and in the library.
  const labels = Object.values(map.actors).map((a) => a.label).join(' ');
  assert.match(labels, /CanCode/);
  assert.match(labels, /Apple/);
  const tags = new Set(Object.values(docs.library.items).flatMap((i) => i.tags));
  assert.ok(tags.has('cancode') && tags.has('apple'));
  // Every tag comes from the controlled list.
  const allowed = new Set(Object.values(ACTUA_TAGS).flat());
  for (const t of tags) assert.ok(allowed.has(t), `unknown tag ${t}`);
  // Every bibliography entry is a library item.
  for (const b of Object.values(docs.library.bibs)) for (const id of b.itemIds) assert.ok(docs.library.items[id], id);
});

test('an episode with linked audio shows no made-up length', () => {
  assert.equal(fmtDuration(null), '');
  assert.equal(fmtDuration(undefined), '');
  assert.equal(fmtDuration(65), '1:05');
  assert.equal(fmtDuration(3723), '1:02:03');
});

test('the Halcyon network: ten made-up orgs, 66 people, linked to a hub that shares on purpose', async () => {
  const { HALCYON_ORGS, HALCYON_LINKS, halcyonDocs } = await import('../src/platform/clients/halcyon.js');
  const { networkOf, sharedFor } = await import('../src/platform/network.js');
  assert.equal(HALCYON_ORGS.length, 10);
  const docs = Object.fromEntries(HALCYON_ORGS.map((o) => [o.id, halcyonDocs(o.id)]));
  const names = Object.values(docs).flatMap((d) => Object.values(d.org.staff).map((s) => s.name));
  assert.equal(names.length, 66);
  assert.equal(new Set(names).size, 66, 'no two people share a name');
  const links = HALCYON_LINKS.map(([hubId, memberId]) => ({ hubId, memberId, status: 'active' }));
  const net = networkOf('org-labsea', links);
  assert.equal(net.get('org-halcyon'), 'hub');
  assert.equal(net.get('org-davis'), 'sibling');
  assert.ok(!net.has('org-oocc'), 'the global commons is the hub’s network, not each lab’s');
  // The hub and the Labrador Sea lab are in every plugin.
  for (const id of ['org-halcyon', 'org-labsea']) for (const name of ['strategy', 'library', 'mobilize', 'pages']) assert.ok(docs[id][name], `${id} has ${name}`);
  assert.ok(docs['org-halcyon'].place && docs['org-halcyon'].social && docs['org-halcyon'].podcasts);
  assert.ok(docs['org-labsea'].teach.cartridges.crt_bench_basin);
  // What travels: people without emails; held knowledge never.
  const people = sharedFor('people', { org: docs['org-halcyon'].org });
  assert.ok(people.length === 15 && people.every((p) => !('email' in p)));
  const mob = sharedFor('mobilize', { org: docs['org-halcyon'].org, mobilize: docs['org-halcyon'].mobilize });
  assert.ok(!mob.objects['ko-h-northern-knowledge'], 'held, OCAP knowledge stays home');
  assert.ok(mob.objects['ko-h-convection-carbon']);
});
