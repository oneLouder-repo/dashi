/**
 * Social Justice Radio (SJR): a client org that is mostly a podcast
 * station. Ten-plus years of weekly shows from StFX and CFXU 93.3 The Fox,
 * built from the archive at socialjusticeradio.onelouder.ca.
 *
 * Episodes link to the audio where it lives today (audio.url), so nothing
 * is uploaded. When SJR moves its files into Dashi, each episode's
 * audio.url gives way to an uploaded audio.mediaId.
 *
 * Air dates: taken from the file name where it has one (most seasons from
 * 9 on, and many earlier ones); otherwise counted a week at a time from the
 * nearest dated show, and the episode says so in its notes.
 */
import { migrateOrg } from '../org.js';
import { seedStrategy } from '../strategySeed.js';
import { migrateStrategy } from '../strategy.js';
import { migratePodcasts, slugify } from '../podcasts.js';
import { migratePages } from '../pages.js';
import { blankLibrary, blankMeta } from '../library.js';
import { SJR_BASE, ADA_BASE, SJR_SEASONS, RADIO_ADA } from './sjrArchive.js';

export const SJR_TODAY = '2026-11-21';
export const SJR_BANNER = 'https://socialjusticeradio.onelouder.ca/images/banner.jpg';

/**
 * SJR's palette. Provisional: the banner could not be read from here, so
 * this is a radio-red and amber set chosen to suit the station; match it to
 * the banner once it is uploaded. Keys are DaisyUI colour names.
 */
export const SJR_COLOURS = {
  primary: '#9b1d3a', 'primary-content': '#ffffff',
  secondary: '#e8a317', 'secondary-content': '#2a1a06',
  accent: '#1f7a72', 'accent-content': '#ffffff',
  neutral: '#2a2130', 'neutral-content': '#f6eff4',
  'base-100': '#fffaf4', 'base-200': '#f6ece1', 'base-300': '#eadbcc', 'base-content': '#2a2130',
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
/** Months from September belong to the first year of the academic season. */
const yearFor = (startYear, month) => (month >= 9 ? startYear : startYear + 1);

/** An air date read from a file name, or null. */
export function dateFromName(name, startYear) {
  const n = name.replace(/\.[a-z0-9]+$/i, '');
  // 03_31_2022, 09-24-2020
  let m = /(?:^|[_\s-])(\d{2})[_-](\d{2})[_-](20\d{2})/.exec(n);
  if (m && +m[1] >= 1 && +m[1] <= 12) return iso(+m[3], +m[1], +m[2]);
  // Season 9's "SE 09_04_14" and Season 5's "S05_03_29": season, then month, day
  m = /S(?:E\s?)?0?\d{1,2}_(\d{2})_(\d{2})(?!\d)/i.exec(n);
  if (m && +m[1] >= 1 && +m[1] <= 12) return iso(yearFor(startYear, +m[1]), +m[1], +m[2]);
  // Month names: "Apr 10", "March24", "FEB18", "Oct 27th", "OcTOBER 9", "Jan 12, 2023", "jan 15"
  m = /(?:^|[^a-z])(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?[\s_]*(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*-?\s*(20\d{2}))?(?!\d)/i.exec(n);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    const day = +m[2];
    if (day >= 1 && day <= 31) return iso(m[3] ? +m[3] : yearFor(startYear, month), month, day);
  }
  return null;
}

/** A readable title from an archive file name. */
export function titleFromFile(name) {
  let t = name.replace(/\.(mp3|wav|m4a)$/i, '');
  t = t.replace(/\((?:mp3|EDITED VERSON)\)/gi, '')
    .replace(/^\d+\s+(?=SJR)/, '')                                     // "4 SJR February 26 Show"
    .replace(/^S[RJ]{2}[\s_-]*/i, '')                                   // SJR / SRJ / sjr
    .replace(/^S(?:E\s?)?0?\d{1,2}[\s_-]*(?:E0?\d{1,2}|Ep\d+(?:Pt\d+)?)?[\s_-]*/i, '') // S14-E9-, SE9_, S07Ep2Pt2_
    .replace(/^S0?\d{1,2}_\d{1,2}[\s_-]+/i, '')                         // S06_9_
    .replace(/^\d{1,2}[_-]\d{2}[_-]20\d{2}[\s_-]*/, '')                // 03_31_2022_
    .replace(/^\d{2}_\d{2}[\s_-]*/, '')                                 // 04_14 (season 9), 03_29 (season 5)
    .replace(/^\d{1,2}[_-]/, '')                                        // 02_ (season 8 numbering)
    .replace(/\b(FINAL FINAL|FINAL|final|Final Copy|Final Draft 1|EDIT|WEB VER|-rev|Podcast|podcast)\b/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s*-\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[-–:,.\s]+|[-–:,.\s]+$/g, '');
  // Drop a leading date ("Apr 10 …", "FEB18 …", "Jan19 - …", "March24 …")
  t = t.replace(/^(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s?\d{1,2}(?:st|nd|rd|th)?(?:,\s*20\d{2})?\s*[-–]?\s*/i, '');
  // camelCase file names ("QueerInQuarantine", "BellLetsTalk")
  if (!/\s/.test(t) && /[a-z][A-Z]/.test(t)) t = t.replace(/([a-z])([A-Z])/g, '$1 $2');
  t = t.replace(/^[-–:,.\s]+|[-–:,.\s]+$/g, '');
  if (!t || /^\d+$/.test(t) || /^\d{2}-\d{2}-20\d{2}/.test(t)) t = 'Weekly show';
  if (t === t.toUpperCase() && /[A-Z]{4}/.test(t)) t = t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  return t[0].toUpperCase() + t.slice(1);
}

/** Hand-tidied titles for file names the rules above can't read well. */
export const SJR_TITLES = {
  'LanguageandCulture.mp3': 'Language and Culture',
  'TakeBacktheNight.mp3': 'Take Back the Night',
  'fossilfuel.mp3': 'Fossil Fuels',
  'REA-EFF.m4a': 'REA and EFF',
  'YAC-BEA.m4a': 'YAC and BEA',
  'SJR-fracking-season2.mp3': 'Fracking',
  'SJR OcTOBER 9 GENDERVIOLENCESHOW.mp3': 'Gender Violence',
  'SJR POVERTY OCT 16th FINAL.mp3': 'Poverty',
  'SJR CJ WILLIE FINAL MP3.mp3': 'CJ Willie',
  'SJR Jen Moore MP3 Nov20th.mp3': 'Jen Moore',
  'SJR NUTRITION FOOD SECURITY NOV 27.mp3': 'Nutrition and Food Security',
  'coady.mp3': 'The Coady Institute',
  '1 SJR Songs for Justice jan 15.mp3': 'Songs for Justice',
  '5 SJR Community Radio Ada Show Jan 22.mp3': 'Community Radio Ada Show',
  '2 SJR Racism on Campus Jan 29th.mp3': 'Racism on Campus',
  '4 SJR February 26 Show.mp3': 'Weekly show, February 26',
  'SJR_Sept29.mp3': 'Season opener, September 29',
  'SJR community radio - Jan 12 - 2017.mp3': 'Community Radio',
  'SJR_REA_podcast_2017.mp3': 'REA',
  'SJR_S04_BTS_Family_Violence 2.mp3': 'Breaking the Silence: Family Violence',
  'SJR_S06_1-IICRD_Feb28.mp3': 'IICRD',
  'SJR_S06_2-YAC_Feb28.mp3': 'YAC',
  'SJR_S06_3-ESRN_Mar7.mp3': 'ESRN',
  'SJR_S06_4-REA_Mar7.wav': 'REA',
  'SJR_S06_5-Student Life_Mar13.m4a': 'Student Life',
  'SJR_S06_6_Keppoch_Mar13.mp3': 'Keppoch',
  'SJR_S06_7-Social Justice Radio_Mar21.m4a': 'Social Justice Radio, March 21',
  'SJR_S06_8-Student Sexual Health_Mar21.wav': 'Student Sexual Health',
  'SJR S06_11_panel1-SJR.wav': 'Panel, part 1',
  'SJR_S06_12_panel2-SJR.wav': 'Panel, part 2',
  'SJR_S06_13_final panel DEVS 311 2019.wav': 'Final panel: DEVS 311',
  'keppochshow.mp3': 'Keppoch',
  'SJR_Nov28_SJR_StudentAdvisors.mp3': 'Student Advisors',
  'SJR_FEB27_SHUTDOWNCANADA.wav': 'Shut Down Canada',
  'RELS399_MartinStreetClip.wav': 'RELS 399: Martin Street',
  'FinalHist299Podcast.mp3': 'HIST 299',
  'SJR_S7 special podcast on Wet\'suwe\'ten and Stop Alton gas movements.mp3': 'Special: Wet’suwet’en and the Stop Alton Gas movements',
  'SJR_SE8_01_09-10-2020.mp3': 'Season 8 opener',
  'SJR_SE8_02_09-17-2020.mp3': 'Weekly show, September 17',
  'SJR_SE8_09-24-2020-2.mp3': 'Weekly show, September 24',
  'SJR_SE8_10_08_2020 -week of boye podcast.mp3': 'Week of Boye',
  'SJR_Oct22_SARS.mp3': 'End SARS',
  'SJR_SE8_11_05-finishery show.mp3': 'The Finishery',
  'SJR_March18_BTS311.mp3': 'Breaking the Silence (DEVS 311)',
  'SJR_March24_KeppochDEVS311.mp3': 'Keppoch (DEVS 311)',
  'SJR SE 09_Oct 7th.mp3': 'Weekly show, October 7',
  'SJR_SE9_02_03_2022_acadia.freedomconvoy.mp3': 'Acadia and the Freedom Convoy',
  'SJR_SE9_01_13_2022_RA Reflection.mp3': 'Radio Ada Reflection',
  'SJR_SE9_01_27_2022_BTS Mining Resistance.mp3': 'Breaking the Silence: Mining Resistance',
  'SJR_SE9_03_31_2022_Clutch Conversation_Celebrting Black Culture.mp3': 'Clutch Conversation: Celebrating Black Culture',
  'SJR - SE 09_04_14 Walking as Pedadogy Podcast.wav': 'Walking as Pedagogy',
  'SJR Episode 1 2022.mp3': 'Season 10 opener',
  'SJR - Radio Ada FINAL FINAL RA Pod - Amanor.mp3': 'Radio Ada: Amanor',
  'SJR - SRAN - Loretta and Albert Podcast (EDITED VERSON).mp3': 'SRAN: Loretta and Albert',
  'SJR - Abahlali baseMjondolo Podcast Final Copy (mp3).mp3': 'Abahlali baseMjondolo',
  'sjr-Day of the Dead.mp3': 'Day of the Dead',
  'SJR - Social. Justice Radio - DEVS 311.mp3': 'DEVS 311 show',
  'SJR - Community firdge and poverty reduction - devs 311 podcast.mp3': 'Community Fridge and Poverty Reduction (DEVS 311)',
  'SJR - Dec 1 devs 311 show .mp3': 'DEVS 311 show, December 1',
  'SJR-Migration Podcast Intro - Oct 27th-rev.mp3': 'Migration series: Introduction',
  'SJR-Migration Podcast Dec 8 - Jack Beaton SAFE.mp3': 'Migration series: Jack Beaton, SAFE',
  'SJR CLP - Zodwa and Updates.mp3': 'CLP: Zodwa, and Updates',
  'SJR Feb 2 2023.mp3': 'Weekly show, February 2',
  'SJR Paolo Freire on Love.mp3': 'Paulo Freire on Love',
  'SJR TBTN Feb 16.mp3': 'Take Back the Night',
  'SJRIWWEmbrace Equity Coady.mp3': 'International Women’s Week: Embrace Equity (Coady)',
  'SJR Migration Podcast - Federica Frazetta.mp3': 'Migration series: Federica Frazetta',
  'SJR Bonus Last Episode.mp3': 'Bonus: the last episode',
  'SJR S12 Apr 3 William Rochon SJR Podcast.mp3': 'William Rochon',
  'SJR S12 Feb 13 - Global Issues Forum Final Draft 1.mp3': 'Global Issues Forum',
  'SJR-S13-E01-DFA-precarious-employment.mp3': 'DFA: Precarious Employment',
  'SJR-S13-E2-GNSF final.mp3': 'GNSF',
  'SJR-S13-E3conflict mediationl.mp3': 'Conflict Mediation',
  'SJR-S13-E4-activist-stories.mp3': 'Activist Stories',
  'SJR-S13-E8-episode halloween.mp3': 'Halloween',
  'SJR-S13-E9-sjralbertmarshalltalk.mp3': 'Albert Marshall Talk',
  'SJR-S13-E12-DEVS 412 FINAL.mp3': 'DEVS 412',
  'SJR-S13-E13-2nd semester overview show.mp3': 'Second Semester Overview',
  'SJR-S13-E15-sjr student strike.mp3': 'Student Strike',
  'SJR-S13-E16-WEB VER feb 04.mp3': 'Weekly show, February 4',
  'SJR-S13-E18-antigonishcoalitiontoendpoverty.mp3': 'Antigonish Coalition to End Poverty',
  'SJR S13-E20-panel march 10 EDIT.mp3': 'Panel, March 10',
  'SJR-S13-E21-rally show.mp3': 'Rally Show',
  'SJR-S13-E22-Podcast devs 311-fiona_morgan.mp3': 'DEVS 311: Fiona Morgan',
  'SJR-S13-E23-wrapupshow2026 and AROYH.mp3': 'Wrap-up Show 2026, and AROYH',
  'SJR-S14-E5-tbtn rally ep.mp3': 'Take Back the Night Rally',
  'SJR-S14-E6-Treaty Day - for Radio.mp3': 'Treaty Day',
  'SJR-S14-E8-metacrisis update.mp3': 'Metacrisis Update',
  'SJR-S14-E9-AI DATA CENTER.mp3': 'AI Data Center',
};

/** Topic tags, from words in the title: a small controlled list, so the archive can be browsed by theme. */
export const SJR_TAGS = [
  ['climate justice', /climate|cop26|ipcc|fossil|fracking|alton|goldboro|enviro|clen|muskrat|hurricane|metacrisis|data center|just transition/i],
  ['migration', /migra|noii|border|newcomer/i],
  ['indigenous', /indigen|treaty|netukulimk|wet.suwe|learning lodge|aboriginal|marshall|hunter.s mountain|decoloni/i],
  ['anti-racism', /racis|whiteness|african|black|bea\b|yac|lawrence hill|rea\b|rea-|clutch/i],
  ['gender justice', /women|gender|iww|equity|sexual|tbtn|take ?back|violence|naomi/i],
  ['2SLGBTQ+', /queer|pride|trans\b|trans people|positive space|awrc/i],
  ['poverty and housing', /poverty|housing|fridge|firdge|homeless|precarious|food|nutrition|meal|harvest|farmers/i],
  ['labour and student action', /strike|rally|divest|dfa|student|shutdown|farmers protest|internships|task force/i],
  ['Ghana and Radio Ada', /ghana|radio ada|\bra\b|amanor|songor|abahlali/i],
  ['global solidarity', /ukraine|chile|sars|global|abahlali|zodwa|ebola|rajagopal|gaventa|coady/i],
  ['AI and technology', /\bai\b|data center/i],
  ['arts and music', /music|drumming|songs|book launch|freire|art/i],
  ['DEVS course', /devs|hist299|rels399|bts/i],
];
const tagsFor = (title) => SJR_TAGS.filter(([, re]) => re.test(title)).map(([tag]) => tag);
const mimetypeOf = (name) => (/\.wav$/i.test(name) ? 'audio/wav' : /\.m4a$/i.test(name) ? 'audio/mp4' : 'audio/mpeg');
const encode = (name) => encodeURIComponent(name).replace(/'/g, '%27');

const SEASON_NOTES = {
  14: 'The current season.',
  13: 'Includes the student strike and DEVS 311 and 412 shows.',
  11: 'Only one show from this season is in the archive.',
  10: 'SJR’s tenth anniversary year, with the Migration podcast series.',
  9: 'Recorded through the pandemic year, with the Migration and Borders action research series.',
  2: 'The earliest season with its own heading in the archive.',
  1: 'These shows had no season heading in the archive. They sit after Season 2, so they are filed here; check before going live.',
};

/** Every SJR episode, oldest first within each season. → { episodes, seasons } */
export function sjrEpisodes() {
  const episodes = {};
  const seasons = {};
  for (const [s, [startYear, list]] of Object.entries(SJR_SEASONS)) {
    const season = +s;
    const files = list.split('\n').map((x) => x.trim()).filter(Boolean).reverse(); // oldest first
    // Explicit episode numbers (Seasons 13 and 14) win; otherwise archive order.
    const numbered = files.map((f, i) => {
      const m = /[-_\s]E0?(\d{1,2})(?=[-_\s]|[a-z])/i.exec(f);
      return { file: f, number: m ? +m[1] : i + 1, date: dateFromName(f, startYear) };
    }).sort((a, b) => a.number - b.number);
    // Fill undated shows a week on from the one before (or from mid-September).
    let last = null;
    const firstDated = numbered.findIndex((x) => x.date);
    numbered.forEach((x, i) => {
      if (x.date) { last = x.date; return; }
      x.estimated = true;
      if (last) { x.date = addDays(last, 7); last = x.date; return; }
      const anchor = firstDated >= 0 ? addDays(numbered[firstDated].date, -7 * (firstDated - i)) : addDays(iso(startYear, 9, 12), 7 * i);
      x.date = anchor;
    });
    // Without episode numbers in the file names, number the shows by air date.
    if (season < 13) { numbered.sort((a, b) => a.date.localeCompare(b.date)); numbered.forEach((x, i) => { x.number = i + 1; }); }
    seasons[season] = { number: season, title: `Season ${season} (${startYear}–${String(startYear + 1).slice(2)})`, description: SEASON_NOTES[season] ?? '' };
    for (const x of numbered) {
      const title = SJR_TITLES[x.file] ?? titleFromFile(x.file);
      const id = `ep-sjr-s${season}-${pad(x.number)}`;
      const date = x.date > SJR_TODAY ? SJR_TODAY : x.date;
      episodes[id] = {
        id, podcastId: 'pod-sjr', season, number: x.number, title, slug: slugify(`s${season}-${x.number}-${title}`),
        description: `Social Justice Radio, Season ${season}: ${title}.`,
        notes: [`From the SJR archive. Original file: ${x.file}`, x.estimated ? 'Air date estimated from where the show sits in the archive.' : ''].filter(Boolean).join('\n\n'),
        type: /bonus/i.test(x.file) ? 'bonus' : 'full', status: 'published', publishedAt: date,
        audio: { url: SJR_BASE + encode(x.file), duration: null, mimetype: mimetypeOf(x.file), name: x.file },
        personIds: [], guests: [], tags: tagsFor(`${title} ${x.file}`),
      };
    }
  }
  return { episodes, seasons };
}

function radioAda() {
  const episodes = {};
  RADIO_ADA.forEach(([file, title], i) => {
    const id = `ep-ada-${pad(i + 1)}`;
    // First broadcast December 2010, monthly after that (dates estimated).
    const d = new Date(Date.UTC(2010, 11 + i, 9)).toISOString().slice(0, 10);
    episodes[id] = {
      id, podcastId: 'pod-radio-ada', season: 1, number: i + 1, title, slug: slugify(title),
      description: `Call and Response, the Radio Ada partnership show: ${title}.`,
      notes: `From the SJR archive. Original file: ${file}\n\nAir date estimated: the partnership first broadcast in December 2010 and went out monthly.`,
      type: 'full', status: 'published', publishedAt: d,
      audio: { url: ADA_BASE + file, duration: null, mimetype: 'audio/mpeg', name: file },
      personIds: [], guests: [], tags: ['Ghana and Radio Ada', 'global solidarity'],
    };
  });
  return episodes;
}

export function sjrPodcasts() {
  const { episodes, seasons } = sjrEpisodes();
  const owner = { name: 'Social Justice Radio Student Society', email: '' };
  return migratePodcasts({
    id: 'podcasts',
    station: {
      name: 'Social Justice Radio',
      tagline: 'Global and local social justice, every Thursday at 5 PM Atlantic on 93.3 CFXU The Fox.',
      description: 'A weekly global and local social justice radio show from the Social Justice Radio Student Society at StFX. Women’s rights, anti-racism, 2SLGBTQ+ initiatives and the links between global and local struggles, on air and in the archive since 2013.',
      siteId: 'site-main',
      cover: null,
      look: { player: 'bar', art: 'square', hero: 'masthead', archive: 'seasons', masthead: { preset: 'site', image: null, height: 'm', focus: 50 } },
    },
    podcasts: {
      'pod-sjr': {
        id: 'pod-sjr', handle: 'sjr', title: 'Social Justice Radio', category: 'Society & Culture', language: 'en', type: 'episodic', explicit: false,
        description: 'The weekly show: students, activists and community members on justice struggles from Antigonish to Accra.',
        owner, cover: null, hostIds: [], featured: true, order: 0, accent: SJR_COLOURS.primary, seasons,
        links: { website: 'https://socialjusticeradio.onelouder.ca/' },
      },
      'pod-radio-ada': {
        id: 'pod-radio-ada', handle: 'callandresponse', title: 'Call and Response: Radio Ada', category: 'Society & Culture', language: 'en', type: 'episodic', explicit: false,
        description: 'A monthly exchange with Radio Ada, the community station in Ada, Ghana. Started in 2010 and first broadcast in December that year.',
        owner, cover: null, hostIds: [], featured: true, order: 1, accent: SJR_COLOURS.accent,
        seasons: { 1: { number: 1, title: 'The partnership shows (2010–12)', description: 'Songor, livelihoods, language, education and music.' } },
        links: { website: 'https://socialjusticeradio.onelouder.ca/' },
      },
    },
    episodes: { ...episodes, ...radioAda() },
  });
}

export function sjrOrg() {
  return migrateOrg({
    id: 'org-sjr',
    name: 'Social Justice Radio',
    description: 'A weekly social justice radio show and podcast from the Social Justice Radio Student Society at St. Francis Xavier University, on 93.3 CFXU The Fox.',
    mission: 'Amplify global and local struggles for justice, in the voices of the people living them.',
    contact: { email: '', phone: '', website: 'https://socialjusticeradio.onelouder.ca/', address: 'St. Francis Xavier University, Antigonish, NS' },
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: SJR_COLOURS },
    // A station first: the planning and mapping tools stay off until SJR wants them.
    plugins: { mapper: false, 'critical-media': false },
    staff: {
      's-sjr-admin': { id: 's-sjr-admin', name: 'Station admin', title: 'Station manager', roleId: 'admin', teamIds: ['t-sjr'], interests: [], email: '', avatar: null },
      's-sjr-contact': { id: 's-sjr-contact', name: 'Natalie Krieger', title: 'Station contact (from the archive site)', roleId: 'lead', teamIds: ['t-sjr'], interests: [], email: '', avatar: null },
    },
    teams: { 't-sjr': { id: 't-sjr', name: 'Student Society', color: SJR_COLOURS.primary } },
    sites: {
      'site-main': {
        id: 'site-main', name: 'Social Justice Radio', url: 'https://sjr.dashi.example', visibility: 'public', shows: 'The station, every season and the Radio Ada shows',
        look: { template: 'harbour', masthead: { preset: 'upload', image: SJR_BANNER, height: 'l', focus: 50 }, type: 'grotesk', header: 'over' },
      },
    },
  });
}

export function sjrStrategy() {
  return migrateStrategy(seedStrategy({
    type: 'framework', title: 'Social Justice Radio',
    mission: 'Amplify global and local struggles for justice, in the voices of the people living them.',
    vision: 'Every struggle for justice in our region has a place on air, and every show stays in the archive.',
    values: 'Solidarity · Student voice · Global and local · Open archive',
    children: [{
      type: 'plan', title: 'Station plan 2026–27', start: '2026-09-01', end: '2027-08-31', theme: 'Season 15 and the archive move',
      children: [
        { type: 'objective', title: 'Keep the whole archive listenable', measures: [{ id: 'm-sjr-moved', name: 'Shows moved into Dashi', unit: 'shows', target: '206' }], children: [
          { type: 'goal', title: 'Move every show into Dashi hosting', measures: [], children: [{ type: 'workplan', title: 'Archive move', start: '2026-12-01', end: '2027-04-30', staffIds: ['s-sjr-admin'], teamIds: ['t-sjr'], children: [
            { type: 'task', title: 'Check the estimated air dates against CFXU logs', start: '2026-12-01', end: '2027-01-31', status: 'planned', assigneeIds: ['s-sjr-admin'] },
            { type: 'task', title: 'Convert the .wav and .m4a shows to .mp3', start: '2027-01-15', end: '2027-02-28', status: 'planned', assigneeIds: ['s-sjr-admin'] },
            { type: 'task', title: 'Upload the files and retire the old links', start: '2027-03-01', end: '2027-04-30', status: 'planned', assigneeIds: ['s-sjr-admin'] },
          ] }] },
        ] },
        { type: 'objective', title: 'Train the next producers', measures: [{ id: 'm-sjr-producers', name: 'New student producers', unit: 'people', target: '8' }], children: [
          { type: 'goal', title: 'A producer in every DEVS course that makes a show', measures: [], children: [] },
        ] },
        { type: 'objective', title: 'Renew Call and Response with Radio Ada', measures: [], children: [
          { type: 'goal', title: 'Two exchange shows this season', measures: [], children: [] },
        ] },
      ],
    }],
  }, 'strategy-sjr'));
}

export function sjrPages() {
  const page = (id, kind, title, publishedAt, summary, body, more = {}) => [id, { id, kind, siteId: 'site-main', title, slug: slugify(title), summary, body, cover: null, status: 'published', publishedAt, authorId: 's-sjr-admin', inNav: kind === 'page', order: 0, ...more }];
  return migratePages({ id: 'pages', pages: Object.fromEntries([
    page('pg-about', 'page', 'About', '2026-11-21', 'A weekly global and local social justice show.', 'Social Justice Radio is a weekly global and local social justice radio show, produced by the **Social Justice Radio Student Society** at StFX.\n\nWe air every **Thursday at 5 PM Atlantic** on 93.3 FM, CFXU The Fox. Our shows cover women’s rights, anti-racism, 2SLGBTQ+ initiatives and the connections between global and local struggles.\n\n## Call and Response\n\nSince 2010 we have traded shows with Radio Ada, the community station in Ada, Ghana.\n\n> We all appear courtesy of our own damn selves!', { order: 0 }),
    page('pg-listen', 'page', 'Listen', '2026-11-21', 'Every season, and the Radio Ada shows.', '[[show:pod-sjr]]\n\n[[show:pod-radio-ada]]\n\nEvery show is on [our station](site.html?site=site-main&view=station).', { order: 1 }),
    page('pg-contact', 'page', 'Contact', '2026-11-21', 'Get in touch, or come on the show.', 'Want to come on the show, or pitch a story? Write to the Social Justice Radio Student Society at StFX.\n\nListen live on [CFXU](http://www.radiocfxu.ca/listen-now/).', { order: 2 }),
  ]) });
}

export function sjrLibrary() {
  const lib = blankLibrary();
  lib.folders['f-sjr-station'] = { id: 'f-sjr-station', name: 'Station', parentId: null };
  lib.items['lk-sjr-archive'] = { id: 'lk-sjr-archive', kind: 'link', url: 'https://socialjusticeradio.onelouder.ca/', folderId: 'f-sjr-station', tags: ['archive'], createdBy: 's-sjr-admin', createdAt: Date.parse('2026-11-21T12:00:00Z'), updatedAt: Date.parse('2026-11-21T12:00:00Z'),
    meta: blankMeta({ type: 'webpage', title: 'Social Justice Radio: the original archive site', creators: [{ role: 'author', literal: 'Social Justice Radio' }], URL: 'https://socialjusticeradio.onelouder.ca/', accessed: '2026-11-21' }) };
  return lib;
}

export function sjrDocs() {
  return { org: sjrOrg(), strategy: sjrStrategy(), podcasts: sjrPodcasts(), pages: sjrPages(), library: sjrLibrary(), maps: { maps: {} }, data: { id: 'data-sjr', series: {} } };
}
