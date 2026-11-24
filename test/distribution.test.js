import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kestrelBundle } from '../src/platform/clients/kestrel.js';
import { audienceOf, audienceLabel, addOffer, removeOffer, sharedWith, shelfFor, suggestedFor, setShelf, sortShelf, SHELF_FILTERS, rosterFor, courseSummary, statusOf } from '../src/learning/distribution.js';
import { withTriageTeach, withTriageLearn, TRIAGE_PACK } from '../src/learning/triage.js';
import { runChecks, canPublish } from '../src/learning/checks.js';

const { docs } = kestrelBundle();
const { org, teach, learn } = docs;
const today = '2026-11-23';
const admin = Object.values(org.staff).find((s) => s.roleId === 'admin');

test('Kestrel gets the NPO Triage pack: five published, one draft, all passing the red checks', () => {
  const pack = Object.values(teach.cartridges).filter((c) => c.series === 'NPO Triage');
  assert.equal(pack.length, 6);
  assert.equal(pack.filter((c) => c.status === 'published').length, 5);
  for (const c of pack.filter((x) => x.status === 'published')) assert.ok(canPublish(runChecks(c)), `${c.title} has red checks`);
  assert.ok(teach.packs.includes(TRIAGE_PACK));
  assert.ok(Object.keys(teach.offers).length >= 6);
});

test('the pack is added once, and a deleted course stays deleted', () => {
  const again = withTriageTeach(teach, org);
  assert.equal(again, teach);
  const { crt_adulted, ...rest } = teach.cartridges;
  assert.equal(withTriageTeach({ ...teach, cartridges: rest }, org).cartridges.crt_adulted, undefined);
  assert.equal(withTriageLearn(learn, teach, org), learn);
  // An older saved document without the pack gets it.
  const old = withTriageTeach({ cartridges: { crt_grants101: teach.cartridges.crt_grants101 }, version: 1 }, org);
  assert.ok(old.cartridges.crt_sp1 && old.cartridges.crt_grants101);
});

test('audiences: everyone leaves out guests and viewers; teams, roles and people', () => {
  const everyone = audienceOf(org, { kind: 'everyone' });
  assert.ok(everyone.every((id) => !['guest', 'viewer'].includes(org.staff[id].roleId)));
  assert.equal(audienceOf(org, { kind: 'role', id: 'board' }).length, 3);
  const t = Object.values(org.teams)[0];
  assert.ok(audienceOf(org, { kind: 'team', id: t.id }).every((id) => org.staff[id].teamIds.includes(t.id)));
  assert.deepEqual(audienceOf(org, { kind: 'person', id: admin.id }), [admin.id]);
  assert.equal(audienceLabel(org, { kind: 'role', id: 'board' }), 'Every board director');
  assert.equal(audienceLabel(org, { kind: 'team', id: t.id }), t.name);
});

test('assigned wins over offered, and the earliest date wins', () => {
  let x = addOffer(teach, { id: 'o1', cid: 'crt_board_spin', to: { kind: 'person', id: admin.id }, mode: 'offered' });
  assert.equal(sharedWith(x, org, admin.id).crt_board_spin.assigned, false);
  x = addOffer(x, { id: 'o2', cid: 'crt_board_spin', to: { kind: 'everyone' }, mode: 'assigned', due: '2027-02-01' });
  x = addOffer(x, { id: 'o3', cid: 'crt_board_spin', to: { kind: 'person', id: admin.id }, mode: 'assigned', due: '2026-12-30' });
  const s = sharedWith(x, org, admin.id).crt_board_spin;
  assert.equal(s.assigned, true);
  assert.equal(s.due, '2026-12-30');
  assert.equal(removeOffer(x, 'o3').offers.o3, undefined);
  // An offered course never carries a date.
  assert.equal(addOffer(teach, { id: 'o4', cid: 'crt_sp1', to: { kind: 'everyone' }, mode: 'offered', due: '2027-01-01' }).offers.o4.due, null);
  // Drafts aren't shared.
  const d = addOffer(teach, { id: 'o5', cid: 'crt_sp2', to: { kind: 'everyone' }, mode: 'assigned', due: '2027-01-01' });
  assert.equal(sharedWith(d, org, admin.id).crt_sp2, undefined);
});

test('the admin’s shelf: assigned, pinned, hidden, and a suggestion', () => {
  const shelf = shelfFor(teach, learn, org, admin.id, today);
  const by = Object.fromEntries(shelf.map((x) => [x.c.id, x]));
  assert.equal(by.crt_sp1.assigned, true);
  assert.equal(by.crt_sp1.due, '2026-12-12');
  assert.equal(by.crt_sp1.pinned, true);
  assert.equal(by.crt_offboard.hidden, true);
  assert.equal(by.crt_offboard.status, 'finished');
  assert.equal(sortShelf(shelf.filter((x) => !x.hidden), 'title')[0].c.id, 'crt_sp1', 'pinned comes first');
  const all = SHELF_FILTERS.find((f) => f.id === 'all');
  assert.ok(!shelf.filter(all.test).some((x) => x.hidden));
  assert.deepEqual(suggestedFor(teach, learn, org, admin.id).map((s) => s.cid), ['crt_adulted']);
  const after = setShelf(learn, admin.id, 'crt_offboard', { hidden: false });
  assert.equal(shelfFor(teach, after, org, admin.id, today).find((x) => x.c.id === 'crt_offboard').hidden, false);
});

test('an assigned course not yet started is on the shelf; overdue once the date passes', () => {
  const someone = Object.values(org.staff).find((s) => !learn.people[s.id]?.enrolments?.crt_fundraise && sharedWith(teach, org, s.id).crt_fundraise?.assigned);
  assert.ok(someone);
  const x = shelfFor(teach, learn, org, someone.id, today).find((i) => i.c.id === 'crt_fundraise');
  assert.equal(x.status, 'not-joined');
  assert.equal(shelfFor(teach, learn, org, someone.id, '2027-03-01').find((i) => i.c.id === 'crt_fundraise').overdue, true);
});

test('roster and summary add up', () => {
  for (const cid of ['crt_fundraise', 'crt_sp1', 'crt_offboard']) {
    const r = rosterFor(teach, learn, org, cid, today);
    const k = courseSummary(teach, learn, org, cid, today);
    assert.equal(k.reached, r.length);
    assert.equal(k.joined + k.notJoined, k.reached);
    assert.ok(k.finished + k.progress <= k.joined);
  }
  const k = courseSummary(teach, learn, org, 'crt_fundraise', today);
  assert.ok(k.overdue >= 1);
  assert.ok(k.finished >= 1);
  assert.equal(statusOf(teach.cartridges.crt_sp1, null), 'not-joined');
});
