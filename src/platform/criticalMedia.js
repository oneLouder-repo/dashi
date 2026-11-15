/**
 * Critical Media: lessons in reading the media with a critical eye, for
 * staff, volunteers and the people an org works with, and short prompts
 * shown beside an org's public news and charts when it switches them on.
 *
 * The lessons are original, written for Dashi. Their shape follows the ten
 * sessions of NALA's "Facts Matter: a guide to building critical media
 * literacy in today's world" (Tony Daly and Helen Ryan, 80:20 Educating and
 * Acting for a Better World, with NALA, 2021), and they use Media Literacy
 * Ireland's "Stop, Think, Check". NALA's guide allows parts to be used for
 * education only; nothing here is copied from it. Read the guide itself:
 * CREDIT.url.
 *
 * Doc 'plugin/critical-media': {
 *   id, settings: { onArticles, onDashboards, corner, siteIds: [] (empty: every public site), hidden: { lessonId: true } },
 *   collections: { lessons: { [id]: own lesson }, sessions: { [id]: a lesson run with a group } }
 * }
 */
export const PLUGIN_ID = 'critical-media';
export const DOC = `plugin/${PLUGIN_ID}`;

export const CREDIT = {
  title: 'Facts Matter: a guide to building critical media literacy in today’s world',
  by: 'Tony Daly and Helen Ryan (80:20 Educating and Acting for a Better World), with NALA, 2021',
  url: 'https://www.nala.ie/publications/facts-matter-a-guide-to-building-critical-media-literacy-in-todays-world/',
  also: { title: 'Be Media Smart: Stop, Think, Check', by: 'Media Literacy Ireland', url: 'https://www.bemediasmart.ie/' },
  note: 'Our lessons are original. They follow the shape of NALA’s ten sessions and use Stop, Think, Check. NALA’s guide is free to read, and its own activities are richer than ours: use it.',
};

/** The habit at the centre of it all. */
export const STOP_THINK_CHECK = [
  { id: 'stop', label: 'Stop', text: 'Before you like, share or believe it, pause. Strong feelings are a signal to slow down.' },
  { id: 'think', label: 'Think', text: 'Who made this, and why? What do they want me to feel or do? What is missing?' },
  { id: 'check', label: 'Check', text: 'Find the original. Look for the same story from a source you trust. Check the date and the place.' },
];

/** Six questions to ask of anything you read, watch or hear. */
export const SIX_QUESTIONS = [
  { q: 'Who', text: 'Who made it? Who paid for it? Whose voices are in it, and whose are not?' },
  { q: 'What', text: 'What is it claiming? Is it news, opinion, an advert, or a joke?' },
  { q: 'Where', text: 'Where did it first appear? Where are the people and events in it?' },
  { q: 'When', text: 'When was it made? Is an old story or photo being passed off as new?' },
  { q: 'How', text: 'How is it made to grab you: the headline, the picture, the music, the numbers?' },
  { q: 'Why', text: 'Why was it made? To inform, to persuade, to sell, or to make you angry?' },
];

/** Tracing a claim back to where it started. */
export const TRACE = [
  { id: 'source', label: 'Source', text: 'Who first said it? A person, an organisation, an account with a history?' },
  { id: 'origin', label: 'Origin', text: 'Is this the original, or a screenshot of a screenshot? Search for the first copy.' },
  { id: 'date', label: 'Date', text: 'When was it first posted? Old news resurfaces in new crises.' },
  { id: 'place', label: 'Place', text: 'Does the place in the picture match the place in the caption?' },
  { id: 'motive', label: 'Motive', text: 'What does the person sharing it gain? Clicks, money, votes, attention?' },
];

const L = (n, id, title, minutes, builds, aims, warmUp, activity, talk, takeAway, stem, tags) => ({ n, id, title, minutes, builds, aims, warmUp, activity, talk, takeAway, stem, tags });

/** Ten lessons, about an hour each, for a group with a facilitator. */
export const LESSONS = [
  L(1, 'cm-media', 'What counts as media?', 60, 'Session 1: Definitions',
    ['Agree what we mean by media, news, information and misinformation', 'See that we all make media as well as use it'],
    'Everyone names one thing they read, watched or heard yesterday. Write each on a sticky note.',
    'Sort the notes into piles the group invents (news, adverts, friends, entertainment…). Then add three words to a shared glossary: misinformation (wrong, shared by mistake), disinformation (wrong, shared on purpose), and malinformation (true, shared to harm).',
    ['Which pile was hardest to sort? Why?', 'When did you last make media yourself: a post, a photo, a voice note?'],
    'Media is everything that carries a message to us. We are all makers now.',
    'Add a pile for science: a news story about a study, a chart on social media, a video from a lab.',
    ['basics', 'news']),
  L(2, 'cm-day', 'My media day', 60, 'Session 2: My digital world',
    ['Notice how much media fills a day, and where it comes from', 'Spot the moments we choose and the moments the feed chooses for us'],
    'Draw a clock face. Mark when you first and last looked at a screen.',
    'Each person draws their media day as a timeline: what, where, how long, and who chose it (me, a friend, an app). Pairs compare and mark the moments an app chose for them.',
    ['Were you surprised by anything?', 'What does an app gain when you keep scrolling?'],
    'Feeds are designed. Knowing that is the first step to choosing.',
    'How do science and tech stories reach you: from a teacher, a creator, a headline?',
    ['habits', 'social']),
  L(3, 'cm-values', 'What I value, what I share', 60, 'Session 3: Values matter',
    ['Link what we share to what we care about', 'See how a message can be built to press on our values'],
    'Pick three values from a list (fairness, family, freedom, safety, honesty…) and put them in order.',
    'Look at four posts that press on different values. For each: which value is it pulling on, and does it tell the whole story? Then write a post about something you care about that is fair to people who disagree.',
    ['Have you shared something because it felt right before you checked it?', 'How can we disagree well online?'],
    'The messages that move us most are the ones to check most carefully.',
    'Science can be presented to press on fear or hope. Compare two headlines about the same study.',
    ['values', 'social']),
  L(4, 'cm-news', 'What makes the news?', 60, 'Session 4: What’s in the news?',
    ['See that news is a set of choices', 'Ask who and what gets left out'],
    'Show three front pages from the same day. What is the top story on each?',
    'In small groups, be an editor: from a pile of twelve story cards, choose five for tonight’s news and put them in order. Compare choices between groups, and notice the stories nobody chose.',
    ['Whose stories were left out?', 'Where would you go for news about your own community?'],
    'Every news report is a choice about what matters. We can ask who made the choice.',
    'Which science stories make the news, and which never do? Who decides what counts as a breakthrough?',
    ['news', 'community']),
  L(5, 'cm-made', 'Behind the scenes: how a story is made', 60, 'Session 5: How’s it made',
    ['Follow a story from event to screen', 'Know the difference between reporting, opinion and sponsored content'],
    'Watch a 60-second news clip with the sound off. What do you think it is about?',
    'Map the journey of one story: event, reporter, sources, editor, headline writer, platform, you. At each step, ask what could change. Then sort six pieces into news, opinion and paid-for.',
    ['What changed when the sound came back on?', 'How can you tell when something is paid for?'],
    'Stories are made by people, through steps. Each step is a place to ask questions.',
    'A study becomes a press release becomes a headline. Trace one back to the paper.',
    ['news', 'making']),
  L(6, 'cm-tricks', 'Tricks of the trade: headlines, pictures and numbers', 60, 'Session 6: Breaking down tactics and techniques',
    ['Name the tricks used to grab attention', 'Read a chart for what it shows and what it hides'],
    'Read three headlines aloud. Which one makes you want to click? Why?',
    'Spot the trick in eight examples: the shocking headline, the cropped photo, the scary music, the chart with a squashed axis, the big number with no context, the quote taken out of a longer sentence. Fix one example so it is fair.',
    ['Which trick have you fallen for?', 'What does a fair chart look like?'],
    'Feelings, pictures and numbers can all be bent. Look for the axis, the source and the missing context.',
    'Charts mislead too. Redraw a misleading chart from a real dataset with a fair axis.',
    ['charts', 'data', 'headlines']),
  L(7, 'cm-pause', 'Press pause before you share', 60, 'Session 7: Press pause',
    ['Practise Stop, Think, Check until it is a habit', 'Feel the pull to share fast, and slow it down'],
    'A quick game: hands up as fast as you can when you see something you would share.',
    'Work through five posts with Stop, Think, Check. For each, decide: share, don’t share, or check first. Then write your own “pause card” to keep by your phone.',
    ['What made you want to share fast?', 'What will you do differently this week?'],
    'Stop. Think. Check. A few seconds can stop a falsehood with you.',
    'Viral science “facts” are a good place to practise: a miracle cure, a scary statistic.',
    ['habits', 'sharing']),
  L(8, 'cm-facts', 'Check it out: tracing a claim', 60, 'Session 8: Get the facts',
    ['Use simple tools to find where a claim or picture came from', 'Know where to find good fact-checks'],
    'Show a dramatic photo with a caption. True or false? Vote.',
    'In pairs, trace two claims with five checks: source, origin, date, place and motive. Use a reverse image search and a fact-checking site. Report back: what did you find, and how sure are you?',
    ['Which check was most useful?', 'What do you do when you can’t be sure?'],
    'You don’t need to be an expert to check. You need a few habits and a few good places to look.',
    'Find the original study behind a science claim. Does it say what the post says?',
    ['facts', 'checking', 'data']),
  L(9, 'cm-bias', 'Six questions, and my own blind spots', 60, 'Session 9: Thinking smart and checking bias',
    ['Ask the six questions of anything we read', 'Notice our own bias, as well as other people’s'],
    'Quick quiz: three statements. Which do you agree with before you know who said them?',
    'Use the six questions (who, what, where, when, how, why) on two pieces about the same topic from different sides. Then each person writes down one thing they believe that they have never checked.',
    ['Did knowing who said it change your mind?', 'How do we step out of our own bubble?'],
    'Everyone has blind spots. Thinking smart means checking the things we want to be true, too.',
    'Scientists check their own bias with methods like blind trials. What could we borrow?',
    ['bias', 'thinking']),
  L(10, 'cm-act', 'Respect, connect, act', 60, 'Session 10: Respect, Connect, Act',
    ['See how hateful messages can grow from small things', 'Plan one thing we can do, online and off'],
    'What does a good online community feel like? Words on the wall.',
    'Look at a ladder from jokes and stereotypes up to harm, and talk about where to step in. Then plan one action: a kind reply, a report, a fact shared well, or a conversation with someone close.',
    ['When is it hard to step in?', 'Who helps you check things?'],
    'We can make the media around us better: by checking, by sharing well, and by standing up for each other.',
    'Make a short, fair, well-sourced post about something you learned in STEM, and share it.',
    ['community', 'action']),
];

export const lessonById = Object.fromEntries(LESSONS.map((l) => [l.id, l]));

export const blankSettings = () => ({ onArticles: true, onDashboards: true, corner: true, siteIds: [], hidden: {} });
export const blankCritical = () => ({ id: DOC, settings: blankSettings(), collections: { lessons: {}, sessions: {} } });
export function migrateCritical(doc) {
  doc ??= blankCritical();
  doc.settings = { ...blankSettings(), ...doc.settings };
  doc.collections ??= {};
  doc.collections.lessons ??= {};
  doc.collections.sessions ??= {};
  return doc;
}

/** Is Critical Media on for this org? Off unless switched on; the STEM example org has it on. */
export const criticalOn = (org) => !org?.platform?.paused?.[PLUGIN_ID] && (org?.plugins?.[PLUGIN_ID] ?? org?.id === 'org-example') === true;

/** Does a site show the prompts? */
export const onSiteFor = (settings, siteId) => !settings.siteIds?.length || settings.siteIds.includes(siteId);

/** Lessons an org shows: the built-in ones it hasn't hidden, then its own. */
export const lessonsOf = (doc) => [...LESSONS.filter((l) => !doc?.settings?.hidden?.[l.id]), ...Object.values(doc?.collections?.lessons ?? {}).map((l, i) => ({ n: LESSONS.length + i + 1, tags: [], talk: [], aims: [], ...l, own: true }))];

/**
 * The lesson to suggest beside a piece of public content: one whose tags its
 * words touch (numbers and charts → reading charts; policy and elections →
 * the news), otherwise the pause-before-you-share lesson.
 */
export function suggestFor(text = '', lessons = LESSONS) {
  const t = String(text).toLowerCase();
  const rules = [
    [/\d\s?%|\b(percent|per cent|charts?|graphs?|data|statistics?|surveys?|numbers?)\b/, ['charts', 'data']],
    [/\b(study|research|scientist|science|evidence|report)\b/, ['facts', 'checking']],
    [/\b(policy|government|election|minister|budget|federal|parliament)\b/, ['news']],
    [/\b(community|partners?|together|volunteer)\b/, ['community']],
    [/\b(video|photo|picture|image|post|share|social|online)\b/, ['sharing', 'social']],
  ];
  for (const [re, tags] of rules) {
    if (!re.test(t)) continue;
    const hit = lessons.find((l) => (l.tags ?? []).some((x) => tags.includes(x)));
    if (hit) return hit;
  }
  return lessons.find((l) => l.id === 'cm-pause') ?? lessons[0] ?? null;
}

/** A lesson as plain text, for printing or copying into a doc. */
export function lessonText(l) {
  return [
    `${l.title} (${l.minutes} minutes)`,
    l.builds && `Builds on NALA’s Facts Matter, ${l.builds}`,
    '',
    'Aims', ...(l.aims ?? []).map((a) => `- ${a}`),
    '',
    'Warm-up', l.warmUp,
    '',
    'Activity', l.activity,
    '',
    'Talk about it', ...(l.talk ?? []).map((q) => `- ${q}`),
    '',
    'Take away', l.takeAway,
    l.stem && ['', 'With STEM learners', l.stem],
  ].flat().filter((x) => x != null && x !== false).join('\n');
}
