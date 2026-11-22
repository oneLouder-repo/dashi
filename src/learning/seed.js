/**
 * Kestrel Bay's learning (eLearning stages 1 and 2): three cartridges to try
 * Teach and Learn with, and a learner record so Learn opens part-way through
 * a course. The slideshow blocks point at the Studio's trial shows ("Kestrel
 * in a Minute", episode ids ep_trial_<slug>); until those are in, Learn plays
 * a sample deck in their place.
 *
 *   Community Grantmaking 101   a 6-week cohort course, running now (started 2026-11-09)
 *   Welcome to the Board        a 2-week self-paced module for new directors
 *   Reading Vital Signs         a 3-week open offering, starting in January (with a few
 *                               things left for the checks to find)
 */
import { blankCartridge, addBlock, makeTrack, publish, addPace } from './cartridge.js';
import { blankLearn, enrol, markDone, saveNote } from './records.js';

const show = (slug) => ({ plugin: 'podcasts', type: 'episode', id: `ep_trial_${slug}` });

function build(base, tracks, blocks, pace = []) {
  let c = { ...blankCartridge(base), ...base, tracks: tracks.map(([kind, name]) => ({ ...makeTrack(kind, name), id: `trk_${base.id}_${kind}` })) };
  for (const [kind, type, start, title, patch = {}] of blocks) {
    c = addBlock(c, { type, start, title, trackId: `trk_${base.id}_${kind}`, ...patch }).cartridge;
  }
  for (const [day, text, to = 'learners', send = 'none'] of pace) {
    c = addPace(c, day, text, to);
    c.pace.at(-1).send = send;
  }
  c.pace = c.pace.map((p, i) => ({ ...p, id: `pace_${base.id}_${i}` }));
  return c;
}

const TRACKS = [['content', 'Learning content'], ['live', 'Live sessions'], ['assess', 'Practice and assessment'], ['support', 'Dialogue and care'], ['comms', 'Comms and pace']];

export function grantmaking101(by) {
  const id = 'crt_grants101';
  const b = (n) => `blk_g_${n}`;
  return publish(build(
    { id, title: 'Community Grantmaking 101', subtitle: 'How Kestrel Bay decides what to fund, and how you can help', kind: 'course', by,
      summary: 'Six weeks for volunteers on our grants committee and anyone curious: where the money comes from, what the community asks for, how we read an application with care, and how we tell the story of what changed.',
      span: { pre: 14, length: 42, post: 14 }, run: { start: '2026-11-09', tz: 'America/Halifax' }, hoursPerWeek: 3,
      competencies: [
        { id: 'cmp_trust', name: 'Trust-based grantmaking', framework: 'Kestrel volunteer framework', level: 'foundation' },
        { id: 'cmp_review', name: 'Reading an application with care', framework: 'Kestrel volunteer framework', level: 'foundation' },
        { id: 'cmp_story', name: 'Telling the story of change', framework: 'Kestrel volunteer framework', level: 'foundation' },
      ],
      credential: { name: 'Kestrel Grantmaking Volunteer (foundation)', rule: 'required-done' } },
    TRACKS,
    [
      ['comms', 'announce', -14, 'Doors open: welcome to the course', { id: b('welcome'), body: 'Welcome! The course opens properly on **Monday 9 November**. Until then, say hello in the introductions thread and have a look around.' }],
      ['support', 'discussion', -10, 'Introduce yourself', { id: b('intro'), length: 10, body: 'Tell us your name, the part of the bay you call home, and one thing in your neighbourhood you would fund tomorrow if you could.', required: false }],
      ['support', 'checkin', -3, 'How are you arriving?', { id: b('arrive'), body: 'A quick, private check-in. There are no wrong answers.' }],
      ['content', 'slideshow', 0, 'Grant tips in a minute', { id: b('tips'), ref: show('grant-tips'), alts: ['transcript', 'captions'], body: 'A one-minute slideshow podcast to start us off.' }],
      ['content', 'lesson', 0, 'Why community grants?', { id: b('why'), length: 4, alts: ['audio'], body: 'Kestrel Bay pools gifts from hundreds of neighbours. **Grants** are how that pooled money goes back out to the people doing the work.\n\nThis week we look at where the money comes from, who decides, and why we trust local groups to know what their community needs.', settings: { images: [{ src: '/media/photos/nature/john-lee-omne-thumb.jpg', alt: 'Morning light over the harbour at Kestrel Bay' }] }, competencies: ['cmp_trust'] }],
      ['live', 'live', 3, 'Kick-off call', { id: b('kickoff'), at: '19:00', minutes: 60, settings: { url: 'https://zoom.example/j/kestrel-grants', host: 'Programme lead' } }],
      ['support', 'reflection', 3, 'A grant that mattered to you', { id: b('reflect1'), body: 'Think of a time a small amount of money made a big difference near you. What made it work?' }],
      ['assess', 'quiz', 4, 'Check yourself: the money trail', { id: b('quiz1'), settings: { questions: [
        { q: 'Where does most of Kestrel Bay’s grant money come from?', options: ['Government contracts', 'Gifts pooled from neighbours', 'A single large donor'], answer: 1 },
        { q: 'Who knows best what a neighbourhood needs?', options: ['The foundation’s staff', 'The people who live and work there', 'Outside consultants'], answer: 1 },
      ] } }],
      ['support', 'checkin', 12, 'Two weeks in: how is it going?', { id: b('check2') }],
      ['live', 'office', 8, 'Office hours', { id: b('office1'), at: '12:00', minutes: 0, settings: { url: 'https://zoom.example/j/kestrel-office', repeat: 'weekly' } }],
      ['content', 'slideshow', 7, 'Board 101 in a minute', { id: b('board'), ref: show('board-101'), alts: ['transcript'] }],
      ['content', 'lesson', 7, 'Trust-based grantmaking', { id: b('trust'), length: 5, body: 'Trust-based grantmaking shifts power towards the groups we fund: multi-year, flexible money, simple applications, and listening more than we report.', competencies: ['cmp_trust'] }],
      ['support', 'discussion', 8, 'What would trust look like here?', { id: b('disc2'), body: 'Pick one of the six trust-based practices. What would it change about how Kestrel Bay works with groups on the North Shore?' }],
      ['live', 'whiteboard', 11, 'Mapping who we fund', { id: b('board-wb'), at: '19:00', ref: { plugin: 'collab', type: 'board', id: 'brd_mock_grants' }, settings: { template: 'affinity' } }],
      ['content', 'reading', 14, 'Reading an application with care', { id: b('reading'), alts: ['audio'], body: 'A short guide to reading with care: read for strengths first, note questions rather than faults, and remember a real person wrote it.', competencies: ['cmp_review'] }],
      ['assess', 'assignment', 15, 'Review a sample application', { id: b('assign'), length: 7, body: 'Read the sample application from the Harbour Youth Collective and write a one-page review as a Dashi doc: three strengths, two questions, one thing you would fund.', settings: { handIn: 'doc', formats: ['doc', 'audio'] }, competencies: ['cmp_review'] }],
      ['live', 'office', 15, 'Office hours', { id: b('office2'), at: '12:00', minutes: 0, settings: { url: 'https://zoom.example/j/kestrel-office', repeat: 'weekly' } }],
      ['support', 'feedback', 22, 'Feedback on your review', { id: b('fb1'), body: 'Your reviewer will reply to your one-pager here, and you can tell us how the course is going.' }],
      ['assess', 'peer', 23, 'Swap reviews with a partner', { id: b('peer'), body: 'Read a partner’s review and leave two kind, useful notes.' }],
      ['content', 'slideshow', 28, 'Vital Signs in a minute', { id: b('vital'), ref: show('vital-signs'), alts: ['transcript', 'captions'] }],
      ['content', 'lesson', 28, 'Telling the story of change', { id: b('story'), length: 5, body: 'Numbers matter, and so do stories. This week: how grantees tell us what changed, in their own words, and how we share it without taking it over.', competencies: ['cmp_story'] }],
      ['live', 'live', 30, 'Story circle', { id: b('circle'), at: '19:00', minutes: 75, settings: { url: 'https://zoom.example/j/kestrel-story' } }],
      ['support', 'reflection', 32, 'What will you carry forward?', { id: b('reflect2'), body: 'Name one idea from this course you will carry into the committee room, and one question you are still holding.' }],
      ['assess', 'milestone', 35, 'Ready for the committee', { id: b('ready') }],
      ['support', 'checkin', 36, 'Last week: how are you leaving?', { id: b('check3') }],
      ['live', 'meetup', 37, 'Cohort send-off', { id: b('sendoff'), at: '19:00', settings: { url: 'https://zoom.example/j/kestrel-sendoff' } }],
      ['support', 'feedback', 41, 'Tell us how it went', { id: b('fb2'), body: 'What should we keep, change or drop for the next cohort? Your answers shape the next run.' }],
      ['comms', 'release', 0, 'Week 1 opens', { id: b('rel1') }],
      ['comms', 'release', 7, 'Week 2 opens', { id: b('rel2') }],
      ['comms', 'release', 14, 'Week 3 opens', { id: b('rel3') }],
      ['comms', 'email', 21, 'Halfway: a kind nudge', { id: b('email') }],
    ],
    [[-14, 'Doors open: welcome email goes out', 'learners', 'email'], [0, 'Course starts. Kick-off call on Wednesday evening', 'learners', 'email'], [14, 'Review assignment opens', 'learners'], [21, 'Halfway: check who has gone quiet', 'teachers'], [42, 'Course ends. Credentials go out once feedback is in', 'learners', 'email']],
  ), by);
}

export function welcomeBoard(by) {
  const id = 'crt_board';
  return publish(build(
    { id, title: 'Welcome to the Board', subtitle: 'Your first two weeks as a Kestrel Bay director', kind: 'pd', pacing: 'self', by,
      summary: 'A self-paced module for new directors: our story, your duties, how meetings run, and where to find the papers. About 90 minutes a week.',
      span: { pre: 0, length: 14, post: 7 }, run: { start: '2026-11-02', tz: 'America/Halifax' }, hoursPerWeek: 2,
      competencies: [{ id: 'cmp_gov', name: 'Board governance basics', framework: 'Kestrel volunteer framework', level: 'foundation' }],
      credential: { name: 'Kestrel Board Orientation', rule: 'required-done' } },
    [['content', 'Learning content'], ['assess', 'Practice'], ['support', 'Dialogue and care']],
    [
      ['content', 'slideshow', 0, 'Welcome week in a minute', { id: 'blk_b_welcome', ref: show('welcome-week'), alts: ['transcript', 'captions'] }],
      ['content', 'lesson', 0, 'Our story', { id: 'blk_b_story', length: 3, body: 'Kestrel Bay Community Foundation began in a church hall with twelve neighbours and a jar of coins. Today we pool gifts from across the bay.' }],
      ['content', 'slideshow', 2, 'Board 101 in a minute', { id: 'blk_b_101', ref: show('board-101'), alts: ['transcript'], competencies: ['cmp_gov'] }],
      ['content', 'reading', 3, 'Your duties as a director', { id: 'blk_b_duties', body: 'The duties of care, loyalty and obedience, in plain words, with examples from our own board.', competencies: ['cmp_gov'] }],
      ['assess', 'quiz', 5, 'Check yourself: duties', { id: 'blk_b_quiz', settings: { questions: [{ q: 'Which duty asks you to put the foundation’s interests first?', options: ['Care', 'Loyalty', 'Obedience'], answer: 1 }] } }],
      ['content', 'resource', 7, 'The board portal', { id: 'blk_b_portal', settings: { url: 'https://kestrelbay.example/board' }, body: 'Minutes, governance and finance papers live in the board portal.' }],
      ['support', 'reflection', 9, 'What do you hope to bring?', { id: 'blk_b_reflect', body: 'What experience or perspective do you hope to bring to the board?' }],
      ['support', 'checkin', 12, 'How are you finding it?', { id: 'blk_b_check' }],
    ],
  ), by);
}

/** A draft with a few things for the checks to find: no transcript, an overloaded week, a timed quiz. */
export function readingVitalSigns(by) {
  const id = 'crt_vital';
  return build(
    { id, title: 'Reading Vital Signs', subtitle: 'An open course on the bay’s community data', kind: 'open', by, visibility: 'public',
      summary: 'Three weeks, open to anyone: what Vital Signs measures, how to read a dashboard without being fooled, and how to bring your own story to the numbers.',
      span: { pre: 14, length: 21, post: 7 }, run: { start: '2027-01-11', tz: 'America/Halifax' }, hoursPerWeek: 2 },
    TRACKS,
    [
      ['comms', 'announce', -14, 'Sign-ups open', { id: 'blk_v_open' }],
      ['content', 'slideshow', 0, 'Vital Signs in a minute', { id: 'blk_v_minute', ref: show('vital-signs') }],
      ['content', 'podcast', 0, 'Our year in review', { id: 'blk_v_year', ref: show('year-in-review'), minutes: 5 }],
      ['content', 'reading', 1, 'What the numbers can and can’t tell us', { id: 'blk_v_numbers', minutes: 90, body: 'Notwithstanding the considerable methodological heterogeneity characterising community-level indicator frameworks, practitioners must nevertheless operationalise interpretive judgements regarding representativeness, longitudinal comparability and the epistemological limitations inherent in aggregated administrative datasets, particularly where marginalised populations remain systematically under-enumerated.' }],
      ['assess', 'quiz', 3, 'Spot the misleading chart', { id: 'blk_v_quiz', minutes: 30, settings: { timeLimit: 10, questions: [{ q: 'A chart’s y-axis starts at 90 instead of 0. What happens?', options: ['Nothing', 'Small changes look huge', 'It becomes more accurate'], answer: 1 }] } }],
      ['assess', 'assignment', 4, 'Find one number that surprised you', { id: 'blk_v_assign', minutes: 120, length: 3 }],
      ['live', 'live', 8, 'Data walk', { id: 'blk_v_walk', at: '18:30', settings: { url: 'https://meet.example/vital-walk' } }],
      ['content', 'lesson', 14, 'Bring your story to the numbers', { id: 'blk_v_story', body: 'Numbers start a conversation. Your story finishes it. This week, pair one Vital Signs number with something you have seen with your own eyes.' }],
      ['support', 'discussion', 15, 'Share your pairing', { id: 'blk_v_share', body: 'Post your number and your story.' }],
    ],
  );
}

/** Teach's document for Kestrel. */
export function seedTeach(org) {
  const by = Object.values(org?.staff ?? {}).find((s) => s.roleId === 'admin')?.id ?? null;
  const list = [grantmaking101(by), welcomeBoard(by), readingVitalSigns(by)];
  return { cartridges: Object.fromEntries(list.map((c) => [c.id, c])), version: 1 };
}

/** Learn's document for Kestrel: everyone on staff is in Grantmaking 101; the first admin is part-way through. */
export function seedLearn(org, teach) {
  let doc = blankLearn();
  const staff = Object.values(org?.staff ?? {});
  const g = teach.cartridges.crt_grants101;
  const w = teach.cartridges.crt_board;
  const admin = staff.find((s) => s.roleId === 'admin') ?? staff[0];
  for (const s of staff) doc = enrol(doc, s.id, g, '2026-10-28T14:00:00.000Z');
  if (admin) {
    doc = enrol(doc, admin.id, w, '2026-11-16T14:00:00.000Z');
    const done = [['blk_g_welcome', '2026-10-28'], ['blk_g_intro', '2026-10-29'], ['blk_g_arrive', '2026-11-06'], ['blk_g_tips', '2026-11-09'], ['blk_g_why', '2026-11-10'], ['blk_g_kickoff', '2026-11-11'], ['blk_g_reflect1', '2026-11-13'], ['blk_g_quiz1', '2026-11-14'], ['blk_g_board', '2026-11-16'], ['blk_g_rel1', '2026-11-09'], ['blk_g_rel2', '2026-11-16']];
    for (const [bid, d] of done) doc = markDone(doc, admin.id, g.id, bid, true, `${d}T15:00:00.000Z`);
    doc = saveNote(doc, admin.id, g.id, 'blk_g_reflect1', 'The bus-stop benches on Front Street: $800 and a weekend of volunteers, and now older folks can wait for the bus without standing in the rain. It worked because the residents’ association asked for it.');
    doc = markDone(doc, admin.id, w.id, 'blk_b_welcome', true, '2026-11-16T16:00:00.000Z');
  }
  return doc;
}
