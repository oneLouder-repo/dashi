/**
 * Ten trial slideshow podcasts for Kestrel Bay (the made-up test org), to
 * play with and to test the studio's slideshow view, the player and Learn
 * cartridges: nine short ones (30 to 45 seconds) and one of about five
 * minutes. Each slide carries the words said under it (`say`), which the
 * server turns into a voice track when it can (server/trialShows.js), and
 * which become the slide's notes (the transcript).
 *
 * Pure data and functions (no DOM, no audio), so the tests can check them.
 *
 *   TRIAL_SHOWS     [{ slug, title, blurb, slides: [draft] }]
 *   trialIds(slug)  { episode, session, file, voice, music }  the stable ids every seed uses
 *   planTiming(show, durations)   when each slide (and its words) starts, and the show's end
 *   timeSlides(show, durations)   real slides, timed to the voice
 */
import { WHEEL, INK } from '../../ui/wheel.js';
import { photoUrl, photoById } from '../../platform/photos.js';
import { normaliseSlide } from './format.js';

const hex = (id) => WHEEL.find((w) => w.id === id).hex;
const photo = (id) => photoUrl(photoById[id]);

/* ------------------------------------------------------------ a tiny way to write slides */
let n = 0;
const bid = () => `b${++n}`;
const text = (html) => ({ id: bid(), type: 'text', html });
const list = (items, ordered = false) => ({ id: bid(), type: 'bullets', items, ordered });
const stat = (value, label, note = '') => ({ id: bid(), type: 'card', card: { kind: 'stat', value, label, note } });
const prog = (value, label, note = '') => ({ id: bid(), type: 'card', card: { kind: 'progress', value, label, note } });
const callout = (value, label = '', note = '') => ({ id: bid(), type: 'card', card: { kind: 'callout', value, label, note } });
const img = (photoId, alt, caption = '') => ({ id: bid(), type: 'image', src: photo(photoId), alt, caption });

/**
 * One slide: kind, title, subtitle, blocks, the words said, and its look:
 *   look = { bg: colour, pic: photo id, full: true (picture fills the card), shade, tone, ink, tr: transition }
 */
const S = (kind, title, subtitle, blocks, say, look = {}) => ({ kind, title, subtitle, blocks, say, look });

const THEMES = {
  sea: { tone: hex('teal'), bg: '#ffffff' },
  sun: { tone: hex('orange'), bg: '#fff8ec' },
  leaf: { tone: hex('green'), bg: '#ffffff' },
  dusk: { tone: hex('violet'), bg: '#f6f1fd' },
  night: { tone: hex('yellow'), bg: INK, ink: '#ffffff' },
  coral: { tone: hex('red'), bg: '#ffffff' },
  sky: { tone: hex('blue'), bg: '#f2f5fb' },
};

export const TRIAL_SHOWS = [
  {
    slug: 'vital-signs', title: 'Vital Signs in a minute', theme: 'sea', blurb: 'What 1,200 neighbours told us about life in the bay, in forty seconds.',
    slides: [
      S('title', 'Vital Signs 2026', 'Kestrel Bay, in a minute', [], 'This is Vital Signs, Kestrel Bay, in a minute.', { pic: 'john-lee-omne', full: true, shade: 0.45, tr: 'fade' }),
      S('data', 'We asked, you answered', '', [stat('1,200', 'neighbours took the survey', 'One in nine adults in the bay')], 'Twelve hundred of you answered our survey this year. That is one in nine adults.', { tr: 'push' }),
      S('point', 'What you love', '', [list(['The water and the woods', 'Neighbours who show up', 'Small schools'])], 'You love the water and the woods, neighbours who show up, and our small schools.', { tr: 'slide' }),
      S('data', 'What worries you', '', [prog('64%', 'say rent is hard to manage'), prog('41%', 'worry about getting to the hospital')], 'But sixty four percent say rent is hard to manage, and four in ten worry about getting to the hospital.', { tr: 'fade' }),
      S('point', 'What we will do', 'Grants open in March', [text('Housing and transport are now <b>first in line</b> for our community grants.')], 'So housing and transport are now first in line for our community grants. Applications open in March.', { tr: 'zoom' }),
    ],
  },
  {
    slug: 'youth-panel', title: 'Twelve young people, one big table', theme: 'sun', blurb: 'Our youth grant panel, and what it taught us.',
    slides: [
      S('title', 'Youth at the grant table', '', [], 'Twelve young people. Sixty thousand dollars. One big table.', { pic: 'artem-kniaz-bc7z', full: true, shade: 0.4, tr: 'fade' }),
      S('data', 'The panel', 'Aged 15 to 24', [stat('8', 'projects funded'), stat('$60,000', 'granted')], 'Our youth panel, aged fifteen to twenty four, funded eight projects this round.', { tr: 'push' }),
      S('story', 'From a skate park to a support line', '', [img('kate-trysh-rkmc', 'A busy street festival with young people', 'Night market, funded in round one'), text('They visited five projects and argued, kindly, about all of them.')], 'From a skate park build to a peer support line. They visited five projects, and argued, kindly, about all of them.', { tr: 'slide' }),
      S('point', 'What they taught us', '', [list(['Ask fewer questions', 'Pay people for their time', 'Say yes faster'], true)], 'What did they teach us? Ask fewer questions. Pay people for their time. And say yes faster.', { tr: 'wipe' }),
      S('quote', 'We trusted them, and they were right.', 'Board chair', [], 'As our board chair put it: we trusted them, and they were right.', { tr: 'fade' }),
    ],
  },
  {
    slug: 'river-walk', title: 'The river walk, reopened', theme: 'leaf', blurb: 'A trail, a bridge and three hundred volunteer hours.',
    slides: [
      S('title', 'The river walk is open', '', [], 'The river walk is open again.', { pic: 'nicole-gaffney-j9vx', full: true, shade: 0.35, tr: 'fade' }),
      S('story', 'Two years closed', '', [img('zhang-qc-jka5', 'Trail signs in a forest'), text('A storm took out the footbridge in 2024. The trail sat closed for two years.')], 'A storm took out the footbridge in twenty twenty four, and the trail sat closed for two years.', { tr: 'slide' }),
      S('data', 'Built by neighbours', '', [stat('300', 'volunteer hours'), stat('$18,500', 'from the Green Fund')], 'Neighbours put in three hundred volunteer hours, with eighteen thousand five hundred dollars from our Green Fund.', { tr: 'push' }),
      S('point', 'Open to everyone', '', [list(['Wide, level path', 'Benches every 400 metres', 'Signs in English, French and Mi’kmaw'])], 'The new path is wide and level, with benches every four hundred metres, and signs in three languages.', { tr: 'fade' }),
      S('point', 'Come for a walk', 'Saturday at 10', [text('Meet at the old mill. <a href="https://kestrelbay.example/riverwalk">Map and details</a>.')], 'Come for a walk this Saturday at ten. Meet us at the old mill.', { tr: 'zoom' }),
    ],
  },
  {
    slug: 'food-hub', title: 'The food bank that grows food', theme: 'leaf', blurb: 'From hampers to a garden, a kitchen and a market.',
    slides: [
      S('title', 'The food bank that grows food', '', [], 'This is the story of the food bank that grows food.', { pic: 'alba-calbeto-dufb', full: true, shade: 0.45, tr: 'fade' }),
      S('data', 'Visits, up again', '', [stat('2,340', 'visits last year', 'Up 18% on the year before')], 'Visits went up again last year, to two thousand three hundred and forty.', { tr: 'push' }),
      S('story', 'So they planted', '', [text('A quarter-acre garden behind the hall now grows <b>two tonnes</b> of vegetables a year.')], 'So they planted. A quarter acre garden behind the hall now grows two tonnes of vegetables a year.', { pic: 'artem-kniaz-bc7z', tr: 'slide' }),
      S('point', 'More than hampers', '', [list(['A teaching kitchen', 'A pay-what-you-can market', 'Seeds to take home'])], 'Now there is a teaching kitchen, a pay what you can market, and seeds to take home.', { tr: 'fade' }),
      S('quote', 'Nobody asks why you are here. They ask what you want to cook.', 'A market regular', [], 'One regular told us: nobody asks why you are here. They ask what you want to cook.', { tr: 'fade' }),
    ],
  },
  {
    slug: 'welcome-week', title: 'Welcome week for newcomers', theme: 'dusk', blurb: 'Seven days, forty hosts, and a lot of chowder.',
    slides: [
      S('title', 'Welcome to the bay', 'Welcome week, 2026', [], 'Welcome to the bay. This is welcome week.', { pic: 'national-asian-culture-center-wc46', full: true, shade: 0.5, tr: 'fade' }),
      S('data', 'New neighbours', '', [stat('140', 'newcomers arrived this year'), stat('40', 'volunteer hosts')], 'A hundred and forty newcomers arrived in the bay this year. Forty volunteer hosts met them.', { tr: 'push' }),
      S('point', 'Seven days', '', [list(['A tour by boat', 'A kitchen party', 'Bank, clinic and school visits', 'A chowder supper'])], 'Seven days: a tour by boat, a kitchen party, visits to the bank, the clinic and the school, and a chowder supper.', { tr: 'slide' }),
      S('quote', 'By Friday I knew twenty names.', 'Fatima, arrived in May', [], 'Fatima arrived in May. She says: by Friday, I knew twenty names.', { tr: 'fade' }),
      S('point', 'Be a host', '', [text('Hosts give two hours a week for a month. <b>Sign up by April 30.</b>')], 'Hosts give two hours a week for a month. Sign up by April thirtieth.', { tr: 'zoom' }),
    ],
  },
  {
    slug: 'grant-tips', title: 'Five tips for your grant application', theme: 'sky', blurb: 'What our grants team wishes every applicant knew.',
    slides: [
      S('title', 'Five grant tips', 'From our grants team', [], 'Five tips for your grant application, from our grants team.', { bg: hex('blue'), ink: '#ffffff', tone: hex('yellow'), tr: 'fade' }),
      S('point', '1. Call us first', '', [text('A ten-minute call saves you hours. We can tell you if it fits.')], 'One. Call us first. A ten minute call can save you hours.', { tr: 'push' }),
      S('point', '2. Say who it helps', '', [text('Name the people, the place and the change, in plain words.')], 'Two. Say who it helps. Name the people, the place and the change, in plain words.', { tr: 'push' }),
      S('point', '3 to 5', '', [list(['Keep the budget simple', 'Ask for what it really costs, core costs too', 'Tell us how you will know it worked'], true)], 'Three, keep the budget simple. Four, ask for what it really costs, core costs too. Five, tell us how you will know it worked.', { tr: 'slide' }),
      S('point', 'Deadline: March 31', '', [callout('Office hours every Tuesday, 2 to 4', 'Drop in or call')], 'The deadline is March thirty first. Office hours are every Tuesday, two to four.', { tr: 'zoom' }),
    ],
  },
  {
    slug: 'winter-coats', title: 'Winter coats, warm hands', theme: 'night', blurb: 'The coat drive, by the numbers.',
    slides: [
      S('title', 'Warm coats for the bay', 'The winter drive', [], 'Warm coats for everyone in the bay. This is the winter drive.', { tr: 'fade' }),
      S('data', 'Coats in, coats out', '', [stat('612', 'coats given out'), prog('85%', 'of our goal of 720')], 'Six hundred and twelve coats have gone out so far. That is eighty five percent of our goal.', { tr: 'push' }),
      S('point', 'Still needed', '', [list(['Children’s sizes 6 to 12', 'Boots, all sizes', 'Warm mittens'])], 'We still need children’s coats in sizes six to twelve, boots in every size, and warm mittens.', { tr: 'slide' }),
      S('point', 'Drop-off', 'Until December 20', [text('The library, the credit union and the fire hall all have bins.')], 'Drop them at the library, the credit union, or the fire hall, until December twentieth.', { tr: 'wipe' }),
      S('quote', 'Thank you, Kestrel Bay.', '', [], 'Thank you, Kestrel Bay.', { tr: 'fade' }),
    ],
  },
  {
    slug: 'oral-history', title: 'Voices of the wharf', theme: 'coral', blurb: 'An oral history project, a minute at a time.',
    slides: [
      S('title', 'Voices of the wharf', 'An oral history project', [], 'Voices of the wharf. An oral history project.', { pic: 'andrzej-pokrzywiec-i1gm', full: true, shade: 0.45, tr: 'fade' }),
      S('story', 'Thirty-one stories', '', [img('jordy-munoz-uzx7', 'An old clock tower in town'), text('Students recorded thirty-one elders about the wharf, the plant and the boats.')], 'High school students recorded thirty one elders, talking about the wharf, the fish plant and the boats.', { tr: 'slide' }),
      S('name', 'Mary MacIsaac', 'Packed fish at the plant, 1961 to 1994', [], 'Mary MacIsaac packed fish at the plant for thirty three years.', { pic: 'rafael-peier-9dn1', full: true, shade: 0.2, tr: 'fade' }),
      S('quote', 'We sang the whole shift. You had to, or you’d freeze.', 'Mary MacIsaac', [], 'She told us: we sang the whole shift. You had to, or you would freeze.', { tr: 'fade' }),
      S('point', 'Hear them all', '', [text('Every story is in the library, with a transcript. Listen on <b>Kestrel Bay Radio</b>.')], 'Every story is in the library, with a transcript, on Kestrel Bay Radio.', { tr: 'zoom' }),
    ],
  },
  {
    slug: 'board-101', title: 'Board 101: what a board does', theme: 'sky', blurb: 'A short start for new board members.',
    slides: [
      S('title', 'Board 101', 'What a board does', [], 'Board one oh one. What a board does.', { bg: hex('teal'), ink: '#ffffff', tone: hex('yellow'), tr: 'fade' }),
      S('point', 'Three jobs', '', [list(['Set the direction', 'Look after the money', 'Hire and support the director'], true)], 'A board has three jobs: set the direction, look after the money, and hire and support the director.', { tr: 'push' }),
      S('point', 'Not the fourth job', '', [callout('Running the day to day', 'That is the staff’s job')], 'What it does not do is run the day to day. That is the staff’s job.', { tr: 'slide' }),
      S('data', 'Your time', '', [stat('6', 'meetings a year'), stat('2', 'hours to read before each')], 'Expect six meetings a year, and two hours of reading before each one.', { tr: 'push' }),
      S('point', 'Ask anything', '', [text('No question is too small. Your chair is <b>Noor Haddad</b>.')], 'And ask anything. No question is too small.', { tr: 'zoom' }),
    ],
  },
  {
    slug: 'year-in-review', title: 'Our year, 2026', theme: 'sea', long: true, blurb: 'Five minutes on everything the bay did together this year.',
    slides: [
      S('title', 'Our year, 2026', 'Kestrel Bay Community Foundation', [], 'Hello, and welcome. This is our year, twenty twenty six, from the Kestrel Bay Community Foundation. It was a big one. In the next five minutes, we will walk through what you made happen, the people behind it, and what we plan to do next. So pour a cup of tea, and let\'s begin.', { pic: 'john-lee-omne', full: true, shade: 0.45, tr: 'fade' }),
      S('point', 'In five minutes', '', [list(['Giving', 'Grants', 'People', 'Places', 'What comes next'], true)], 'Here is the plan. We will cover five things: giving, grants, people, places, and finally, what comes next. Each part is short, and every number you will hear comes from our own records, which are open to anyone who asks.', { tr: 'push' }),
      S('title', 'Giving', 'Part one', [], 'Part one. Giving. Without your gifts, nothing else in this story happens.', { bg: hex('teal'), ink: '#ffffff', tone: hex('yellow'), tr: 'wipe' }),
      S('data', 'You gave', '', [stat('$1.42M', 'given by 2,180 donors'), prog('109%', 'of our goal')], 'This year, two thousand one hundred and eighty of you gave to the foundation. Together, you gave one point four two million dollars. That is a hundred and nine percent of our goal, and the first time we have passed it since the foundation began.', { tr: 'push' }),
      S('data', 'Small gifts add up', '', [stat('71%', 'of gifts were under $100')], 'Here is the part we love most. Seventy one percent of those gifts were under a hundred dollars. Ten dollars a month, twenty five at the bake sale, the jar at the hardware store. Small gifts add up, and they add up to most of what we do.', { tr: 'fade' }),
      S('story', 'A legacy gift', '', [text('Ruth and Alan Chisholm left a gift that will fund the youth panel <b>forever</b>.')], 'And one gift will last forever. Ruth and Alan Chisholm, who ran the hardware store for forty years, left a legacy gift in their will. It will fund our youth grant panel every year, for as long as there is a foundation. Thank you, Ruth and Alan.', { pic: 'nicole-gaffney-j9vx', tr: 'slide' }),
      S('title', 'Grants', 'Part two', [], 'Part two. Grants. This is where your gifts go back to work in the community.', { bg: hex('orange'), ink: INK, tone: INK, tr: 'wipe' }),
      S('data', 'Back to the community', '', [stat('$980,000', 'granted'), stat('64', 'organisations')], 'This year we granted nine hundred and eighty thousand dollars, to sixty four organisations. Some are big, like the food hub. Some are a few neighbours with a good idea and a folding table.', { tr: 'push' }),
      S('point', 'Where it went', '', [prog('34%', 'housing'), prog('22%', 'food'), prog('18%', 'youth')], 'So where did it go? About a third went to housing, from repairs for seniors to the new tenant association. Twenty two percent went to food. And eighteen percent went to young people, much of it decided by young people themselves.', { tr: 'fade' }),
      S('story', 'Core costs, at last', '', [text('For the first time, <b>half our grants</b> paid for core costs: rent, wages and the lights.')], 'And here is a change we are proud of. For the first time, half of our grants paid for core costs. That means rent, wages, and keeping the lights on. Not just new projects, but the everyday work that keeps good groups alive.', { tr: 'slide' }),
      S('quote', 'It is the first grant that let us plan more than a month ahead.', 'Bay Bus coordinator', [], 'The Bay Bus coordinator put it best. She said: it is the first grant that let us plan more than a month ahead. That is what core funding does. It turns survival into planning.', { tr: 'fade' }),
      S('title', 'People', 'Part three', [], 'Part three. People. A foundation is really just a lot of people, pulling in the same direction.', { bg: hex('violet'), ink: '#ffffff', tone: hex('mint'), tr: 'wipe' }),
      S('data', 'Volunteers', '', [stat('412', 'volunteers'), stat('9,800', 'hours given')], 'This year, four hundred and twelve volunteers gave nine thousand eight hundred hours. They read grant applications, drove the Bay Bus, sorted coats, staffed the warming centres, and baked an unreasonable number of pies.', { tr: 'push' }),
      S('story', 'The youth panel', '', [img('artem-kniaz-bc7z', 'Young people gathered in a meadow'), text('Twelve panellists funded eight projects, and changed how we decide.')], 'Our youth panel, twelve young people aged fifteen to twenty four, funded eight projects. They visited every one, asked hard questions, and changed how the whole foundation makes decisions. We now ask fewer questions, and we say yes faster.', { tr: 'slide' }),
      S('story', 'New neighbours', '', [text('Forty hosts welcomed <b>140 newcomers</b> in welcome week.')], 'And during welcome week, forty volunteer hosts welcomed a hundred and forty newcomers to the bay, with a boat tour, a kitchen party, and a very large pot of chowder.', { pic: 'national-asian-culture-center-wc46', tr: 'slide' }),
      S('title', 'Places', 'Part four', [], 'Part four. Places. The places we share are where community actually happens.', { bg: hex('green'), ink: '#ffffff', tone: hex('yellow'), tr: 'wipe' }),
      S('story', 'The river walk', '', [text('Reopened in June after two years, built with <b>300 volunteer hours</b>.')], 'The river walk reopened in June, after two years closed by a storm. Neighbours rebuilt it with three hundred volunteer hours. It is now wide and level, with benches, and signs in three languages.', { pic: 'zhang-qc-jka5', tr: 'slide' }),
      S('story', 'The Cove Road hall', '', [text('A new roof, a ramp to the front door, and a full calendar again.')], 'The Cove Road hall got a new roof, and a ramp to the front door, so everyone can get in. Its calendar is full again, with dances, meetings, and a Tuesday night fiddle group.', { pic: 'alba-calbeto-dufb', tr: 'slide' }),
      S('data', 'Warm in winter', '', [stat('612', 'coats given out'), stat('3', 'warming centres')], 'And when the cold came, six hundred and twelve warm coats went out to families across the bay, and three warming centres stayed open all winter long.', { tr: 'push' }),
      S('title', 'What comes next', 'Part five', [], 'Part five. What comes next.', { bg: INK, ink: '#ffffff', tone: hex('yellow'), tr: 'wipe' }),
      S('point', 'Next year', '', [list(['Housing and transport first', 'A second youth panel', 'Vital Signs, every two years'])], 'Next year, housing and transport come first, because that is what you told us in Vital Signs. A second youth panel will join the first. And Vital Signs itself will now happen every two years, so we can act on it in between.', { tr: 'fade' }),
      S('point', 'Get involved', '', [list(['Give monthly', 'Host a newcomer', 'Join a grant panel']), text('<a href="https://kestrelbay.example/give">kestrelbay.example</a>')], 'There are lots of ways to be part of it. You can give monthly, even a small amount. You can host a newcomer during welcome week. Or you can join one of our grant panels. Everything you need is on our website.', { tr: 'zoom' }),
      S('title', 'Thank you', 'From all of us at Kestrel Bay', [], 'From all of us at the Kestrel Bay Community Foundation, thank you. Thank you for giving, for showing up, and for looking after each other. See you next year.', { pic: 'john-lee-omne', full: true, shade: 0.5, tr: 'fade' }),
    ],
  },
];

/** The ids a trial show uses everywhere (stable, so other plugins can point at them). */
export const trialIds = (slug) => ({ episode: `ep_trial_${slug}`, session: `proj_trial_${slug}`, file: `aud_trial_${slug}`, voice: `aud_trial_${slug}_voice`, music: `aud_trial_${slug}_music` });

/** About how long the words take to say, in seconds, when there is no voice to measure. */
export const sayLength = (say) => Math.max(2.5, String(say).trim().split(/\s+/).length / 2.6);

/** How long a show should run: short ones 32 to 44 seconds, the long one about five minutes. */
export const targetFor = (show) => (show.long ? { min: 295, max: 330 } : { min: 32, max: 44 });

/**
 * When each slide's words start, and when the show ends. `durations` are how
 * long each slide's words take (measured from the voice, or guessed). The
 * music leads in (`lead`), each slide pauses after its words (`gap`), and a
 * tail lets the music finish. A show that would come in under its minimum
 * gets longer pauses, so the slides linger rather than the show running short.
 */
export function planTiming(show, durations, { lead = 1.2, gap = 0.6, tail = 2.5 } = {}) {
  const { min } = targetFor(show);
  const n = durations.length;
  const natural = lead + durations.reduce((a, b) => a + b, 0) + gap * n + tail;
  const pause = natural < min ? gap + (min - natural) / n : gap;
  const starts = [];
  let t = lead;
  for (let i = 0; i < n; i++) { starts.push(i === 0 ? 0 : t); t += durations[i] + pause; }
  // The voice for slide i starts at lead (slide 0) or at its slide's start.
  const voiceAt = starts.map((s, i) => (i === 0 ? lead : s));
  return { starts, voiceAt, pause, end: t + tail };
}

/** The show's slides, timed by planTiming. */
export function timeSlides(show, durations, opts) {
  const theme = THEMES[show.theme] ?? THEMES.sea;
  const { starts } = planTiming(show, durations, opts);
  return show.slides.map((d, i) => {
    const look = d.look ?? {};
    const pic = look.pic ? photo(look.pic) : null;
    return normaliseSlide({
      id: `sld_trial_${show.slug}_${i + 1}`,
      at: Math.round(starts[i] * 10) / 10,
      kind: d.kind,
      title: d.title,
      subtitle: d.subtitle,
      blocks: d.blocks.map((b, j) => ({ ...b, id: `blk_trial_${show.slug}_${i + 1}_${j + 1}` })),
      tone: look.tone ?? theme.tone,
      bg: { colour: look.bg ?? theme.bg, image: pic, overlay: look.full ? look.shade ?? 0.4 : 0 },
      banner: !look.full,
      ink: look.ink ?? (look.bg ? null : theme.ink ?? null),
      transition: { type: look.tr ?? 'fade' },
      notes: d.say,
    }, i);
  });
}
