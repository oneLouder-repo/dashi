import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canUse, docMode, ownerOf, usable } from '../src/platform/access.js';

const P = [
  { id: 'org', core: true, owns: ['org'] },
  { id: 'strategy', owns: ['strategy', 'plandocs'], reads: ['maps'] },
  { id: 'studio', parent: 'strategy', owns: ['studio'], reads: ['strategy'] },
  { id: 'pages', owns: ['pages'], reads: ['dashboards'] },
  { id: 'palette', owns: ['dashboards'], reads: ['strategy'] },
  { id: 'podcasts', owns: ['podcasts'] },
  { id: 'mapper', owns: ['maps', 'map/*'] },
  { id: 'extra', defaultOff: true, owns: [] },
];

test('the order of switches: platform, plan, org, parent, role, person', () => {
  const org = { plugins: {}, platform: { paused: {} } };
  assert.ok(canUse(P, org, 'podcasts'));
  assert.ok(!canUse(P, org, 'extra'), 'an optional plugin is off until chosen');
  assert.ok(canUse(P, { plugins: { extra: true } }, 'extra'));
  assert.ok(!canUse(P, { platform: { paused: { podcasts: true } } }, 'podcasts'), 'paused by the platform or the plan');
  assert.ok(!canUse([{ ...P[5], platformOff: true }], {}, 'podcasts'), 'not installed on the platform');
  assert.ok(!canUse(P, { plugins: { strategy: false } }, 'studio'), 'a sub-plugin needs its parent');
  const roles = { pluginRoles: { podcasts: { staff: false } } };
  assert.ok(!canUse(P, roles, 'podcasts', { role: 'staff' }));
  assert.ok(canUse(P, roles, 'podcasts', { role: 'lead' }));
  assert.ok(canUse(P, { ...roles, pluginPeople: { podcasts: { s1: true } } }, 'podcasts', { role: 'staff', staffId: 's1' }), 'a person’s own switch wins');
  assert.ok(!canUse(P, { pluginPeople: { podcasts: { s1: false } } }, 'podcasts', { role: 'admin', staffId: 's1' }));
  assert.ok(!canUse(P, { plugins: { podcasts: false }, pluginPeople: { podcasts: { s1: true } } }, 'podcasts', { staffId: 's1' }), 'but not over the org');
  assert.ok(canUse(P, { plugins: { org: false } }, 'org'), 'core is always there');
  assert.deepEqual(usable(P, { plugins: { strategy: false } }).map((p) => p.id), ['org', 'pages', 'palette', 'podcasts', 'mapper']);
});

test('each document follows its plugin', () => {
  assert.equal(ownerOf(P, 'map/abc').id, 'mapper');
  assert.equal(ownerOf(P, 'plugin/extra').id, 'extra');
  assert.equal(ownerOf(P, 'something-else'), null);
  const sjr = { plugins: { strategy: false, palette: false, mapper: false } };
  assert.equal(docMode(P, sjr, 'podcasts'), 'write');
  assert.equal(docMode(P, sjr, 'strategy'), 'public', 'nobody reads strategy here');
  assert.equal(docMode(P, sjr, 'dashboards'), 'read', 'the portal reads dashboards');
  assert.equal(docMode(P, sjr, 'org'), 'write');
  assert.equal(docMode(P, sjr, 'podcasts', {}, { canEdit: false }), 'read', 'read-only roles read');
  assert.equal(docMode(P, sjr, 'unknown'), 'write', 'unclaimed documents behave as before');
});
