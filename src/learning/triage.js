/**
 * The NPO Triage series (alpha 0.4): short, self-directed courses for
 * non-profit staff and boards, from the NPO planning doc. Each is two or
 * three weeks, self-paced, about an hour or two a week: a slideshow or
 * lesson to start, a reading, a self-check, a reflection, and one small
 * thing to make for your own organisation.
 *
 * Kestrel Bay gets the pack with some of it assigned (to teams, to the board,
 * to one person) and some offered, and a spread of progress across staff, so
 * Learn's course list and Teach's Learners view have something to show.
 */
import { publish } from './cartridge.js';
import { build } from './seed.js';
import { enrol, markDone, saveNote } from './records.js';
import { addOffer, setShelf } from './distribution.js';

export const TRIAGE_PACK = 'npo-triage-1';
const SELF = [['content', 'Learning content'], ['assess', 'Practice'], ['support', 'Reflection and care']];
const show = (slug) => ({ plugin: 'podcasts', type: 'episode', id: `ep_trial_${slug}` });
const FW = 'NPO Triage';

function triage(by, { id, title, subtitle, summary, weeks, hours = 2, competencies = [], credential = null, cover = null }, blocks, { draft = false } = {}) {
  const c = build(
    { id, title, subtitle, summary, kind: 'self', pacing: 'self', by, series: 'NPO Triage',
      span: { pre: 0, length: weeks * 7, post: 7 }, run: { start: '2026-09-01', tz: 'America/Halifax' }, hoursPerWeek: hours,
      competencies: competencies.map(([cid, name]) => ({ id: cid, name, framework: FW, level: 'foundation' })),
      ...(credential ? { credential: { name: credential, rule: 'required-done' } } : {}), ...(cover ? { cover: { tone: cover } } : {}) },
    SELF, blocks,
  );
  return draft ? c : publish(c, by);
}

export function stratPlanning1(by) {
  const b = (k) => `blk_sp1_${k}`;
  return triage(by, { id: 'crt_sp1', title: 'Strategic Planning 1: Where are we now?', subtitle: 'Strategic planning 101, a SOAR and a situational analysis', weeks: 3,
    summary: 'The first of three short courses on strategic planning. What a strategic plan is (and isn’t), how to look honestly at where you are with a SOAR, and how to read the world around you before you choose where to go.',
    competencies: [['cmp_sp_why', 'Purpose of strategic planning'], ['cmp_sp_soar', 'Strengths-based analysis (SOAR)'], ['cmp_sp_env', 'Reading the environment']], credential: 'Strategic Planning 1' }, [
    ['content', 'lesson', 0, 'What a strategic plan is for', { id: b('why'), body: 'A strategic plan is a shared promise about **where you’re going and what you’ll stop doing** to get there. It is not a list of everything you do. Good plans are short, owned by the people who carry them out, and revisited often.', competencies: ['cmp_sp_why'] }],
    ['content', 'slideshow', 1, 'Strategy in a minute', { id: b('minute'), ref: show('strategy-minute'), alts: ['transcript'] }],
    ['assess', 'quiz', 3, 'Check yourself: plan or to-do list?', { id: b('quiz'), settings: { questions: [
      { q: 'Which of these belongs in a strategic plan?', options: ['Renew the photocopier lease', 'Shift half our grants to multi-year funding by 2028', 'Answer every email within a day'], answer: 1 },
      { q: 'Who should own a strategic plan?', options: ['The consultant who wrote it', 'The board alone', 'The people who will carry it out, with the board'], answer: 2 },
    ] } }],
    ['content', 'reading', 7, 'SOAR: Strengths, Opportunities, Aspirations, Results', { id: b('soar'), body: 'SOAR grows out of appreciative inquiry. Instead of starting with weaknesses and threats, it asks what you do best, what the world is opening up, what you hope for, and how you’ll know you got there.', competencies: ['cmp_sp_soar'] }],
    ['assess', 'assignment', 8, 'Draft your organisation’s SOAR', { id: b('soar-doc'), length: 5, body: 'Fill in a one-page SOAR for your own organisation or team as a Dashi doc. Two or three points in each box is plenty.', settings: { handIn: 'doc', formats: ['doc'] }, competencies: ['cmp_sp_soar'] }],
    ['content', 'lesson', 14, 'Reading the world around you', { id: b('env'), body: 'A situational analysis looks outward: who else works on this, what is changing in funding, policy and the community, and what your ecosystem map already tells you.', competencies: ['cmp_sp_env'] }],
    ['support', 'reflection', 16, 'What surprised you?', { id: b('reflect'), body: 'Looking at your SOAR and the world around you, what surprised you? What do you want to bring to the planning table?' }],
    ['support', 'checkin', 19, 'How was that?', { id: b('check') }],
  ]);
}

export function stratPlanning2(by) {
  const b = (k) => `blk_sp2_${k}`;
  return triage(by, { id: 'crt_sp2', title: 'Strategic Planning 2: Forming the plan', subtitle: 'From a SOAR to goals, objectives and a theory of change', weeks: 3,
    summary: 'Turn what you learned in part 1 into a plan people can carry: a few goals, clear objectives, and the story of how your work leads to change.',
    competencies: [['cmp_sp_goals', 'Setting goals and objectives'], ['cmp_sp_toc', 'Theory of change']] }, [
    ['content', 'lesson', 0, 'From aspirations to goals', { id: b('goals'), body: 'Your SOAR’s aspirations become three to five goals. Each goal gets two or three objectives you can measure.', competencies: ['cmp_sp_goals'] }],
    ['content', 'reading', 4, 'A theory of change on one page', { id: b('toc'), body: 'If we do this, then that will happen, because of this. Write it down, and test each “because”.', competencies: ['cmp_sp_toc'] }],
    ['assess', 'assignment', 8, 'Sketch your plan in Dashi Plan', { id: b('sketch'), length: 7, body: 'Open Plan and sketch your goals and objectives under your organisation’s framework.', settings: { handIn: 'doc' } }],
    ['support', 'reflection', 15, 'What will you stop doing?', { id: b('stop') }],
  ], { draft: true });
}

export function boardSpinUp(by) {
  const b = (k) => `blk_bsu_${k}`;
  return triage(by, { id: 'crt_board_spin', title: 'Board Spin-up', subtitle: 'Forming or refreshing a board that works', weeks: 2, cover: '#2c4fa3',
    summary: 'For new boards and boards starting over: what a board is for, the roles around the table, a first-year calendar, and the policies to put in place early.',
    competencies: [['cmp_b_roles', 'Board roles and duties'], ['cmp_b_cal', 'Board calendar and cycle']], credential: 'Board Spin-up' }, [
    ['content', 'slideshow', 0, 'Board 101 in a minute', { id: b('101'), ref: show('board-101'), alts: ['transcript', 'captions'] }],
    ['content', 'lesson', 1, 'Who sits at the table', { id: b('roles'), body: 'The chair, the treasurer, the secretary and the executive director each hold a different piece of the work. A good board knows which is which, and where governance stops and management starts.', competencies: ['cmp_b_roles'] }],
    ['assess', 'quiz', 3, 'Check yourself: governance or management?', { id: b('quiz'), settings: { questions: [
      { q: 'Choosing the new office printer is…', options: ['Governance', 'Management'], answer: 1 },
      { q: 'Approving the annual budget is…', options: ['Governance', 'Management'], answer: 0 },
    ] } }],
    ['content', 'resource', 7, 'A first-year board calendar', { id: b('cal'), body: 'A template for twelve months of board meetings: budget, audit, ED review, strategy retreat, AGM.', competencies: ['cmp_b_cal'] }],
    ['support', 'reflection', 9, 'What does your board need first?', { id: b('reflect') }],
    ['support', 'checkin', 12, 'How are you finding it?', { id: b('check') }],
  ]);
}

export function fundraisingFoundations(by) {
  const b = (k) => `blk_ff_${k}`;
  return triage(by, { id: 'crt_fundraise', title: 'Fundraising Foundations', subtitle: 'Grants, donors and the case for support', weeks: 3, cover: '#e07a3f',
    summary: 'The basics every non-profit person should know: where money comes from, writing a case for support, stewarding donors with care, and reporting back to funders on time.',
    competencies: [['cmp_f_case', 'Case for support'], ['cmp_f_steward', 'Donor stewardship'], ['cmp_f_report', 'Reporting to funders']], credential: 'Fundraising Foundations' }, [
    ['content', 'slideshow', 0, 'Grant tips in a minute', { id: b('tips'), ref: show('grant-tips'), alts: ['transcript'] }],
    ['content', 'lesson', 1, 'Where the money comes from', { id: b('mix'), body: 'Individual gifts, grants, earned income and events: a healthy mix means no single funder can sink you.' }],
    ['content', 'reading', 6, 'Writing a case for support', { id: b('case'), body: 'Why us, why now, why you: a case for support answers the donor’s questions before they ask them.', competencies: ['cmp_f_case'] }],
    ['assess', 'assignment', 8, 'A one-page case for support', { id: b('case-doc'), length: 6, body: 'Write a one-page case for support for one programme.', settings: { handIn: 'doc' }, competencies: ['cmp_f_case'] }],
    ['content', 'lesson', 14, 'Stewardship: thanking well', { id: b('steward'), body: 'Thank within 48 hours, report back on what the gift did, and ask how they’d like to hear from you.', competencies: ['cmp_f_steward'] }],
    ['content', 'lesson', 16, 'Reporting to funders on time', { id: b('report'), body: 'Dashi’s report track counts back six weeks from each due date. This lesson walks through the on-ramp.', competencies: ['cmp_f_report'] }],
    ['assess', 'quiz', 18, 'Check yourself: stewardship', { id: b('quiz'), settings: { questions: [{ q: 'How soon should a thank-you go out?', options: ['Within 48 hours', 'At year end', 'With the tax receipt only'], answer: 0 }] } }],
    ['support', 'reflection', 19, 'One thing to try this month', { id: b('reflect') }],
  ]);
}

export function closingWell(by) {
  const b = (k) => `blk_cw_${k}`;
  return triage(by, { id: 'crt_offboard', title: 'Closing a Project Well', subtitle: 'Off-boarding projects, partners and people with care', weeks: 2, hours: 1, cover: '#3f8f5a',
    summary: 'Every project ends. A short course on ending well: telling partners early, handing over what lasts, saying thank you, and writing down what you learned.',
    competencies: [['cmp_o_hand', 'Handover and closure']] }, [
    ['content', 'lesson', 0, 'Endings are part of the work', { id: b('why'), body: 'A project that ends well leaves trust behind it. One that just stops leaves confusion.' }],
    ['content', 'resource', 2, 'A closing checklist', { id: b('list'), body: 'Partners told, files handed over, final report sent, staff thanked, lessons written down.', competencies: ['cmp_o_hand'] }],
    ['support', 'reflection', 5, 'A project you closed, or didn’t', { id: b('reflect') }],
    ['assess', 'milestone', 9, 'Your closing plan', { id: b('plan') }],
  ]);
}

export function adultEducation(by) {
  const b = (k) => `blk_ae_${k}`;
  return triage(by, { id: 'crt_adulted', title: 'Adult Education for Community Work', subtitle: 'How adults learn, and how to run a workshop that respects it', weeks: 3, cover: '#7a4fb5',
    summary: 'For anyone who runs workshops, info sessions or volunteer training: what we know about how adults learn, designing for different people, and running a session that leaves room for the room.',
    competencies: [['cmp_a_how', 'How adults learn'], ['cmp_a_design', 'Inclusive session design']], credential: 'Community Educator (foundation)' }, [
    ['content', 'lesson', 0, 'How adults learn', { id: b('how'), body: 'Adults bring experience, want to know why, and learn best from problems they actually have. Knowles called it andragogy; Freire called it education as the practice of freedom.', competencies: ['cmp_a_how'] }],
    ['content', 'reading', 3, 'Designing for everyone', { id: b('udl'), body: 'Universal Design for Learning: more than one way in, more than one way to show what you know.', competencies: ['cmp_a_design'] }],
    ['assess', 'quiz', 5, 'Check yourself: UDL', { id: b('quiz'), settings: { questions: [{ q: 'A workshop offers slides, a handout and a story. That’s…', options: ['Too much', 'Multiple means of representation', 'Showing off'], answer: 1 }] } }],
    ['assess', 'assignment', 9, 'Plan a 60-minute session', { id: b('plan'), length: 7, body: 'Plan one hour of a real session you’ll run: opening, one activity, close.', settings: { handIn: 'doc' }, competencies: ['cmp_a_design'] }],
    ['support', 'discussion', 14, 'Share a trick that works', { id: b('trick'), required: false, body: 'What’s one thing you do that helps a room of adults learn?' }],
    ['support', 'reflection', 18, 'What will you change?', { id: b('reflect') }],
  ]);
}

/** The pack's cartridges, for Teach. */
export const triageCartridges = (by) => [stratPlanning1(by), stratPlanning2(by), boardSpinUp(by), fundraisingFoundations(by), closingWell(by), adultEducation(by)];

/** Who Kestrel shared the pack with (dates kept near the seed's "now", late November 2026). */
export function triageOffers(teach, org, by) {
  const team = (name) => Object.values(org?.teams ?? {}).find((t) => t.name === name)?.id;
  const admin = Object.values(org?.staff ?? {}).find((s) => s.roleId === 'admin');
  let x = teach;
  const add = (cid, to, mode, due, note, at) => { if (to.id !== undefined || to.kind === 'everyone') x = addOffer(x, { id: `off_${cid}_${to.kind}_${to.id ?? 'all'}`, cid, to, mode, due, note, by, at }); };
  add('crt_fundraise', { kind: 'team', id: team('Donors and Development') }, 'assigned', '2026-12-18', 'Before the year-end campaign, please.', '2026-11-02T14:00:00.000Z');
  add('crt_fundraise', { kind: 'team', id: team('Grants and Community') }, 'assigned', '2026-12-04', 'Ahead of the provincial report.', '2026-10-26T14:00:00.000Z');
  add('crt_board_spin', { kind: 'role', id: 'board' }, 'assigned', '2027-01-15', 'For the board refresh in January.', '2026-11-12T14:00:00.000Z');
  add('crt_sp1', { kind: 'role', id: 'lead' }, 'assigned', '2027-01-31', 'Before the strategy retreat.', '2026-11-16T14:00:00.000Z');
  add('crt_adulted', { kind: 'team', id: team('Learning and Data') }, 'offered', null, '', '2026-11-05T14:00:00.000Z');
  add('crt_adulted', { kind: 'team', id: team('Grants and Community') }, 'offered', null, 'Handy for the info sessions.', '2026-11-05T14:00:00.000Z');
  const newer = Object.values(org?.staff ?? {}).find((s) => s.roleId === 'staff' && !(s.teamIds ?? []).includes(team('Grants and Community')) && !(s.teamIds ?? []).includes(team('Donors and Development')));
  if (newer) add('crt_fundraise', { kind: 'person', id: newer.id }, 'assigned', '2026-11-20', 'You’re joining the campaign team: this is a good start.', '2026-10-30T14:00:00.000Z');
  add('crt_offboard', { kind: 'everyone' }, 'offered', null, '', '2026-11-18T14:00:00.000Z');
  if (admin) add('crt_sp1', { kind: 'person', id: admin.id }, 'assigned', '2026-12-12', 'You’re leading the retreat.', '2026-11-16T14:00:00.000Z');
  return x;
}

/** A spread of progress, so the lists have some life: a few finished, many part-way, some not started. */
export function triageLearners(learn, teach, org) {
  const staff = Object.values(org?.staff ?? {}).filter((s) => !['guest', 'viewer'].includes(s.roleId));
  const admin = staff.find((s) => s.roleId === 'admin');
  const c = (id) => teach.cartridges?.[id];
  let x = learn;
  const blocks = (cart) => Object.values(cart.blocks).filter((bk) => bk.required).sort((a, b) => a.start - b.start);
  const go = (sid, cid, joined, share, note = null) => {
    const cart = c(cid);
    if (!cart || x.people?.[sid]?.enrolments?.[cid]) return;
    x = enrol(x, sid, cart, `${joined}T14:00:00.000Z`);
    const list = blocks(cart);
    const k = Math.round(list.length * share);
    list.slice(0, k).forEach((bk, i) => { x = markDone(x, sid, cid, bk.id, true, new Date(Date.parse(`${joined}T15:00:00Z`) + (i + 1) * 864e5).toISOString()); });
    if (note) x = saveNote(x, sid, cid, note[0], note[1]);
  };
  // Every share, by staff index, so it's the same on every run.
  const shares = [0, 0.15, 0.35, 0.5, 0.7, 1, 0.25, 0, 1, 0.6];
  const pick = (list, i) => list[i % list.length];
  staff.forEach((s, i) => {
    const teams = s.teamIds ?? [];
    const teamName = (id) => org.teams?.[id]?.name;
    if (teams.some((t) => ['Donors and Development', 'Grants and Community'].includes(teamName(t))) && i % 4 !== 3) go(s.id, 'crt_fundraise', '2026-11-03', pick(shares, i + 3));
    if (s.roleId === 'lead' && i % 3 !== 0) go(s.id, 'crt_sp1', '2026-11-17', pick(shares, i));
    if (s.roleId === 'board' && i % 2 === 0) go(s.id, 'crt_board_spin', '2026-11-13', pick(shares, i + 1));
    if (teams.some((t) => teamName(t) === 'Learning and Data') && i % 2 === 1) go(s.id, 'crt_adulted', '2026-11-08', pick(shares, i + 5));
    if (i % 7 === 2) go(s.id, 'crt_offboard', '2026-11-19', pick(shares, i + 2));
  });
  if (admin) {
    go(admin.id, 'crt_sp1', '2026-11-17', 0.5, ['blk_sp1_reflect', 'Our strengths are trust and reach; the thing I keep coming back to is how few grantees we hear from after the money goes out.']);
    go(admin.id, 'crt_offboard', '2026-11-19', 1);
    go(admin.id, 'crt_fundraise', '2026-11-03', 0.25);
    x = setShelf(x, admin.id, 'crt_sp1', { pinned: true });
    x = setShelf(x, admin.id, 'crt_offboard', { hidden: true });
  }
  return x;
}

/** Add the pack to a Teach document once (it remembers, so a deleted course stays deleted). */
export function withTriageTeach(teach, org) {
  if ((teach.packs ?? []).includes(TRIAGE_PACK)) return teach;
  const by = Object.values(org?.staff ?? {}).find((s) => s.roleId === 'admin')?.id ?? null;
  let x = { ...teach, cartridges: { ...(teach.cartridges ?? {}) }, offers: { ...(teach.offers ?? {}) }, packs: [...(teach.packs ?? []), TRIAGE_PACK] };
  for (const c of triageCartridges(by)) x.cartridges[c.id] ??= c;
  return triageOffers(x, org, by);
}
export function withTriageLearn(learn, teach, org) {
  if ((learn.packs ?? []).includes(TRIAGE_PACK)) return learn;
  return { ...triageLearners(learn, teach, org), packs: [...(learn.packs ?? []), TRIAGE_PACK] };
}
