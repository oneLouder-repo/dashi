/**
 * The Halcyon ocean network (d, 2026-11-28): the example for linked
 * organisations and for EoViz's ocean studio. Everything here is made up:
 * the agency, the labs, the people, the cruises and the numbers. Real places
 * (the Labrador Sea, Davis Strait, the Gulf of St. Lawrence) and real public
 * programmes (GLODAP) are named only as places and as data sources.
 *
 *   halcyon            Halcyon Ocean Observatory: a national ocean agency, the hub (Network plan).
 *                      Runs the research ship Halcyon and the national ocean data centre.
 *   labsea-carbon      Labrador Sea Carbon Lab: a senior biogeochemist who also teaches, a postdoc,
 *                      three graduate students and a technician. The EoViz studio's home.
 *   davis-moorings     Davis Strait Moorings Group
 *   float-ops          Float Operations Centre
 *   gulf-hypoxia       Gulf Hypoxia Lab
 *   arctic-gateways    Arctic Gateways Group
 *   pacific-margins    Pacific Margins Lab
 *   coastal-acid       Coastal Acidification Network (with community monitors)
 *   ocean-teaching     Ocean Teaching Commons
 *   ocean-commons      Open Ocean Carbon Commons: the global network Halcyon belongs to
 *
 * Sixty-six people in ten orgs. Halcyon is the hub of the eight Canadian
 * labs and the teaching commons, and a member of the global commons. The
 * hub and the Labrador Sea lab are seeded in every plugin; the other labs
 * have their people, a library and what they share with the network.
 *
 * Inuit and First Nations partners appear as roles and partners, never as
 * named communities: a real network adds them only on their own terms (OCAP).
 */
import { migrateOrg } from '../org.js';
import { mockDocs } from '../mockOrgs.js';
import { migratePlace } from '../../place/model.js';
import { CANADA_MAP } from '../../place/basemaps.js';
import { migrateSocial, mockPush } from '../social.js';
import { migrateMobilize, blankMobilize, migrateObject } from '../../mobilize/model.js';
import { build } from '../../learning/seed.js';
import { publish } from '../../learning/cartridge.js';
import { blankLearn, enrol } from '../../learning/records.js';
import { seedRhizome } from '../../rhizome/setup.js';
import { blankMeta } from '../library.js';

export const HALCYON_COLOURS = {
  primary: '#1f5f8b', 'primary-content': '#ffffff',
  secondary: '#0f7c8c', 'secondary-content': '#ffffff',
  accent: '#e3a33b', 'accent-content': '#1d1405',
  neutral: '#0f1b26', 'neutral-content': '#eef3f7',
  'base-100': '#ffffff', 'base-200': '#f2f5f8', 'base-300': '#dfe6ed', 'base-content': '#0f1b26',
};

/* ---------------------------------------------------------------- people */

// Made-up names, paired so that no two people share one.
const FIRST = ['Maren', 'Tobias', 'Aiyana', 'Ravi', 'Solène', 'Callum', 'Noor', 'Eitan', 'Ingrid', 'Kofi', 'Liesl', 'Mateo', 'Hana', 'Oisín', 'Priya', 'Bastien', 'Yuki', 'Dagny', 'Femi', 'Clara', 'Joaquín', 'Siobhan', 'Arjun', 'Margaux', 'Tavish', 'Leilani', 'Henrik', 'Zainab', 'Marcel', 'Ondine', 'Kenji', 'Astrid', 'Duncan'];
const LAST = ['Aalto', 'Brennan', 'Castellanos', 'Desrosiers', 'Eriksen', 'Fairweather', 'Galloway', 'Haddad', 'Iversen', 'Joncas', 'Kowalczyk', 'Lindqvist', 'MacInnes', 'Nakamura', 'Okafor', 'Pelletier', 'Quinlan', 'Rasmussen', 'Sandoval', 'Thibodeau', 'Ueda', 'Vasquez', 'Whitcombe', 'Xu', 'Ybarra', 'Zielinski', 'Arsenault', 'Boucher', 'Chiang', 'Dunphy', 'Ellingsen', 'Forsythe', 'Gauthier'];
const nameAt = (i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length) * 3) % LAST.length]}`;
const emailOf = (name, slug) => `${name.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').replace(/\s+/g, '.')}@${slug}.example`;

/**
 * The ten orgs: who they are, where, and who works there ([title, role, interests]).
 * The first person in each is its admin.
 */
export const HALCYON_ORGS = [
  { id: 'org-halcyon', slug: 'halcyon', name: 'Halcyon Ocean Observatory', plan: 'network', city: 'Halifax, NS', at: [44.65, -63.57],
    about: 'Canada’s national ocean observatory (a made-up agency): the research ship Halcyon, the national ocean data centre, and the hub of a network of member labs from the Labrador Sea to the Pacific.',
    people: [
      ['Director General', 'admin', ['ocean policy', 'networks']],
      ['Chief Scientist', 'lead', ['ocean carbon', 'deep convection']],
      ['Director, Observing Systems', 'lead', ['moorings', 'floats', 'ship time']],
      ['Manager, Ocean Data Centre', 'lead', ['open data', 'quality flags', 'GLODAP']],
      ['Chief Scientist at Sea, RV Halcyon', 'staff', ['cruise planning', 'CTD']],
      ['Carbon Programme Lead', 'lead', ['DIC', 'alkalinity', 'synthesis']],
      ['Physical Oceanographer', 'staff', ['convection', 'water masses']],
      ['Data Scientist', 'staff', ['python', 'TEOS-10', 'pipelines']],
      ['Visualisation Developer', 'staff', ['three.js', 'D3', 'creative coding']],
      ['Knowledge Mobilization Lead', 'lead', ['briefs', 'podcasts', 'policy']],
      ['Partnerships and Network Lead', 'staff', ['member labs', 'agreements']],
      ['Communications Lead', 'staff', ['social media', 'stories']],
      ['Indigenous Partnerships Advisor', 'staff', ['OCAP', 'co-production']],
      ['Marine Technician', 'staff', ['instruments', 'calibration']],
      ['Education and Outreach Officer', 'staff', ['schools', 'teaching with data']],
    ] },
  { id: 'org-labsea', slug: 'labsea-carbon', name: 'Labrador Sea Carbon Lab', plan: 'standard', city: 'St. John’s, NL', at: [47.57, -52.73],
    about: 'A university lab (made up) that follows carbon and oxygen into the deep Labrador Sea, with a senior biogeochemist who sails every spring and teaches ocean ecosystem science.',
    people: [
      ['Senior Biogeochemist and Lab Lead', 'admin', ['ocean carbon', 'GLODAP', 'creative coding', 'teaching']],
      ['Postdoctoral Fellow, carbonate chemistry', 'lead', ['alkalinity', 'pH', 'acidification']],
      ['PhD Researcher, anthropogenic carbon', 'staff', ['eMLR', 'water masses']],
      ['MSc Researcher, oxygen and convection', 'staff', ['oxygen', 'floats']],
      ['MSc Researcher, data visualisation', 'staff', ['D3', 'Processing', 'p5.js']],
      ['Lab Technician, DIC and alkalinity', 'staff', ['coulometry', 'reference materials']],
    ] },
  { id: 'org-davis', slug: 'davis-moorings', name: 'Davis Strait Moorings Group', plan: 'standard', city: 'Dartmouth, NS (field base in Iqaluit)', at: [44.67, -63.56],
    about: 'Keeps a line of moorings across Davis Strait in the water (made up), measuring what flows between Baffin Bay and the Labrador Sea.',
    people: [
      ['Lead Physical Oceanographer', 'admin', ['Arctic outflow', 'fluxes']],
      ['Mooring Engineer', 'staff', ['moorings', 'acoustic releases']],
      ['Data Analyst', 'staff', ['time series', 'sea ice']],
      ['Field Coordinator and Community Liaison', 'staff', ['field logistics', 'co-production']],
      ['Graduate Researcher', 'staff', ['freshwater flux']],
    ] },
  { id: 'org-floats', slug: 'float-ops', name: 'Float Operations Centre', plan: 'standard', city: 'Sidney, BC', at: [48.65, -123.4],
    about: 'Deploys and looks after profiling floats (made up), including biogeochemical floats with oxygen, nitrate and pH sensors.',
    people: [
      ['Programme Lead', 'admin', ['floats', 'biogeochemical sensors']],
      ['Float Engineer', 'staff', ['float hardware']],
      ['Data Quality Lead', 'lead', ['delayed-mode QC', 'oxygen calibration']],
      ['Sensor Specialist', 'staff', ['nitrate', 'pH']],
      ['Deployment Coordinator', 'staff', ['ships of opportunity']],
      ['Software Developer', 'staff', ['telemetry', 'APIs']],
    ] },
  { id: 'org-hypoxia', slug: 'gulf-hypoxia', name: 'Gulf Hypoxia Lab', plan: 'standard', city: 'Rimouski, QC', at: [48.45, -68.52],
    about: 'Studies the loss of oxygen in the deep waters of the Gulf and Estuary of St. Lawrence (made up), and what it means for fisheries.',
    people: [
      ['Lab Lead, oxygen and hypoxia', 'admin', ['hypoxia', 'fisheries']],
      ['Research Associate', 'lead', ['oxygen time series']],
      ['Postdoctoral Fellow', 'staff', ['deep water renewal']],
      ['PhD Researcher', 'staff', ['benthic habitat']],
      ['MSc Researcher', 'staff', ['Winkler titration']],
      ['Technician', 'staff', ['sensors', 'sampling']],
    ] },
  { id: 'org-arctic', slug: 'arctic-gateways', name: 'Arctic Gateways Group', plan: 'standard', city: 'Winnipeg, MB (station in the Arctic Archipelago)', at: [49.81, -97.13],
    about: 'Measures the water, ice and carbon moving through the Arctic Archipelago (made up), with northern partners.',
    people: [
      ['Group Lead', 'admin', ['sea ice', 'carbon']],
      ['Sea Ice Scientist', 'lead', ['ice cores']],
      ['Northern Research Coordinator', 'staff', ['co-production', 'logistics']],
      ['Postdoctoral Fellow', 'staff', ['freshwater']],
      ['PhD Researcher', 'staff', ['under-ice blooms']],
      ['Field Technician', 'staff', ['moorings', 'sampling']],
    ] },
  { id: 'org-pacific', slug: 'pacific-margins', name: 'Pacific Margins Lab', plan: 'standard', city: 'Nanaimo, BC', at: [49.17, -123.94],
    about: 'Follows low-oxygen, high-carbon water onto the Pacific shelf (made up), from the open ocean to the inlets.',
    people: [
      ['Lab Lead', 'admin', ['upwelling', 'oxygen minimum zone']],
      ['Research Scientist', 'lead', ['carbonate chemistry']],
      ['Physical Oceanographer', 'staff', ['shelf circulation']],
      ['Postdoctoral Fellow', 'staff', ['marine heatwaves']],
      ['PhD Researcher', 'staff', ['inlets']],
      ['MSc Researcher', 'staff', ['gliders']],
      ['Technician', 'staff', ['moorings']],
    ] },
  { id: 'org-acid', slug: 'coastal-acid', name: 'Coastal Acidification Network', plan: 'standard', city: 'Charlottetown, PE', at: [46.24, -63.13],
    about: 'A network of scientists, shellfish growers and community monitors (made up) watching acidification along the Atlantic coast.',
    people: [
      ['Network Coordinator', 'admin', ['acidification', 'networks']],
      ['Research Scientist', 'lead', ['carbonate chemistry']],
      ['Community Monitoring Coordinator', 'staff', ['community science']],
      ['Shellfish Industry Liaison', 'staff', ['aquaculture']],
      ['Data Manager', 'staff', ['open data']],
      ['Postdoctoral Fellow', 'staff', ['larval shellfish']],
      ['Graduate Researcher', 'staff', ['estuaries']],
      ['Technician', 'staff', ['pH sensors']],
    ] },
  { id: 'org-teaching', slug: 'ocean-teaching', name: 'Ocean Teaching Commons', plan: 'basic', city: 'Halifax, NS', at: [44.64, -63.6],
    about: 'Shares ocean science teaching (made up): courses, labs with real data, and help for teachers in schools and universities.',
    people: [
      ['Coordinator', 'admin', ['teaching', 'open courses']],
      ['Learning Designer', 'lead', ['course design', 'UDL']],
      ['Teaching Fellow', 'staff', ['labs with real data']],
      ['Data-for-Classrooms Developer', 'staff', ['notebooks', 'D3']],
    ] },
  { id: 'org-oocc', slug: 'ocean-commons', name: 'Open Ocean Carbon Commons', plan: 'network', city: 'A global network, coordinated online', at: null,
    about: 'A global network of ocean carbon researchers (made up), working to keep carbon data open, comparable and well cited.',
    people: [
      ['Network Chair', 'admin', ['global synthesis']],
      ['Data Synthesis Coordinator', 'lead', ['GLODAP', 'SOCAT']],
      ['Community Manager', 'staff', ['meetings', 'early-career researchers']],
    ] },
];
export const halcyonSpec = (id) => HALCYON_ORGS.find((o) => o.id === id);

/** Halcyon is the hub of the Canadian labs and the teaching commons, and a member of the global commons. */
export const HALCYON_LINKS = [
  ...HALCYON_ORGS.filter((o) => !['org-halcyon', 'org-oocc'].includes(o.id)).map((o) => ['org-halcyon', o.id]),
  ['org-oocc', 'org-halcyon'],
];

/** Names dealt across all ten orgs, in order, so each person has one. */
function staffFor(spec) {
  let start = 0;
  for (const o of HALCYON_ORGS) { if (o.id === spec.id) break; start += o.people.length; }
  const team = `t-${spec.slug}`;
  return Object.fromEntries(spec.people.map(([title, roleId, interests], i) => {
    const name = nameAt(start + i);
    const id = `h-${spec.slug}-${i + 1}`;
    return [id, { id, name, title, roleId, teamIds: [team], interests, email: emailOf(name, spec.slug), avatar: null, location: spec.city }];
  }));
}

/** What each org lets the network see. */
function shareFor(spec, lib) {
  const folder = (name) => Object.values(lib?.folders ?? {}).find((f) => f.name === name)?.id;
  const library = [folder('Cruise reports'), folder('Data citations'), folder('Shared with the network')].filter(Boolean);
  if (spec.id === 'org-halcyon') return { people: true, eco: true, mobilize: true, library };
  if (spec.id === 'org-oocc') return { people: true, eco: false, mobilize: false, library };
  return { people: true, eco: true, mobilize: spec.id === 'org-labsea', library };
}

/* ---------------------------------------------------------------- a member lab */

const ref = (id, folderId, title, creators, issued, publisher, abstract, more = {}) => ({
  id, kind: 'ref', url: more.url ?? '', folderId, tags: more.tags ?? [], createdBy: null, createdAt: Date.parse(`${issued}-06-01T12:00:00Z`), updatedAt: Date.parse(`${issued}-06-01T12:00:00Z`),
  meta: blankMeta({ type: more.type ?? 'report', title, creators: creators.map((c) => ({ role: 'author', literal: c })), issued, publisher, URL: more.url ?? '', abstract, language: 'en', keywords: more.tags ?? [] }),
});

/** A small library for a member lab: a folder it shares, one it keeps. */
function memberLibrary(spec) {
  const lib = { id: 'library', folders: {}, items: {}, bibs: {} };
  lib.folders['f-shared'] = { id: 'f-shared', name: 'Shared with the network', parentId: null };
  lib.folders['f-lab'] = { id: 'f-lab', name: 'Lab only', parentId: null };
  lib.items[`ref-${spec.slug}-1`] = ref(`ref-${spec.slug}-1`, 'f-shared', `${spec.name}: methods and data notes`, [spec.name], '2026', spec.name, `How ${spec.name} samples, calibrates and flags its data. Made-up example.`, { tags: ['methods'] });
  lib.items[`ref-${spec.slug}-2`] = ref(`ref-${spec.slug}-2`, 'f-lab', `${spec.name}: field season plan 2027`, [spec.name], '2026', spec.name, 'Kept inside the lab until the season is confirmed. Made-up example.', { tags: ['planning'] });
  return lib;
}

/** A member lab's own documents: its people, its library, and what it shares. */
export function memberDocs(spec) {
  const library = memberLibrary(spec);
  const org = migrateOrg({
    id: spec.id, name: spec.name, description: spec.about, mission: spec.about,
    contact: { email: `hello@${spec.slug}.example`, phone: '', website: `https://${spec.slug}.example`, address: spec.city },
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: HALCYON_COLOURS },
    plugins: { eoviz: true, place: true, mobilize: spec.plan !== 'basic' },
    staff: staffFor(spec),
    teams: { [`t-${spec.slug}`]: { id: `t-${spec.slug}`, name: spec.name, color: '#1f5f8b' } },
  });
  org.network = { share: shareFor(spec, library) };
  return { org, library };
}

/* ---------------------------------------------------------------- the hub's map */

const SEAS = [
  ['sea-labrador', 'Labrador Sea', [57.5, -53.5], 'Where winter convection carries carbon and oxygen into the deep ocean. Halcyon occupies the Labrador Sea line every spring.'],
  ['sea-davis', 'Davis Strait', [66.6, -58], 'The gateway between Baffin Bay and the Labrador Sea. The Davis Strait array sits across it.'],
  ['sea-baffin', 'Baffin Bay', [73, -66], 'Arctic water on its way south.'],
  ['sea-gulf', 'Gulf of St. Lawrence', [48.6, -62.2], 'Its deep waters are losing oxygen; the Gulf Hypoxia Lab follows them.'],
  ['sea-scotian', 'Scotian Shelf', [43.8, -62.5], 'The shelf off Nova Scotia, watched for acidification and warming.'],
  ['sea-pacific', 'Pacific margin', [49.2, -128.5], 'Low-oxygen, high-carbon water meets the shelf here.'],
  ['sea-archipelago', 'Arctic Archipelago', [74.5, -92], 'Channels where Arctic water, ice and carbon move east.'],
];

/** The Labrador Sea line: [station, lat, lng], from the Labrador shelf to Greenland. Approximate, for the example. */
export const LABSEA_LINE = Array.from({ length: 13 }, (_, i) => [`L${i + 1}`, Math.round((53.7 + i * 0.58) * 100) / 100, Math.round((-55.5 + i * 0.62) * 100) / 100]);
/** The Davis Strait array: [mooring, lat, lng], west to east. Approximate, for the example. */
export const DAVIS_ARRAY = [['DS-W1', 66.65, -61.2], ['DS-W2', 66.7, -60.1], ['DS-C1', 66.75, -58.8], ['DS-C2', 66.8, -57.5], ['DS-E1', 66.85, -56.2], ['DS-E2', 66.9, -55.0]];

const pointFeature = (name, lat, lng, props = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: { name, ...props } });

export function halcyonPlace() {
  const places = {};
  for (const [id, name, [lat, lng], description] of SEAS) places[id] = { id, name, kind: 'region', geo: { lat, lng }, description, tags: ['sea'] };
  for (const o of HALCYON_ORGS.filter((x) => x.at)) {
    places[`org-${o.slug}`] = { id: `org-${o.slug}`, name: o.name, kind: 'site', geo: { lat: o.at[0], lng: o.at[1] }, description: o.about, tags: [o.id === 'org-halcyon' ? 'hub' : 'member lab'] };
  }
  const data = {
    'data-members': { id: 'data-members', name: 'Member labs', colour: 'blue', on: true, source: 'geojson', addedAt: '2026-11-28', public: true, group: 'network',
      note: 'The hub and its member labs. Made-up example.',
      features: HALCYON_ORGS.filter((x) => x.at).map((o) => pointFeature(o.name, o.at[0], o.at[1], { city: o.city, role: o.id === 'org-halcyon' ? 'hub' : 'member', people: String(o.people.length) })) },
    'data-labsea-line': { id: 'data-labsea-line', name: 'Labrador Sea line', colour: 'orange', on: true, source: 'geojson', addedAt: '2026-11-28', public: true, group: 'observing',
      note: 'Stations occupied by RV Halcyon each spring. Positions approximate; made-up example.',
      features: LABSEA_LINE.map(([s, lat, lng]) => pointFeature(s, lat, lng, { platform: 'ship', cadence: 'once a year (spring)' })) },
    'data-davis-array': { id: 'data-davis-array', name: 'Davis Strait array', colour: 'teal', on: true, source: 'geojson', addedAt: '2026-11-28', public: true, group: 'observing',
      note: 'Moorings across the strait, recovered and redeployed each autumn. Positions approximate; made-up example.',
      features: DAVIS_ARRAY.map(([s, lat, lng]) => pointFeature(s, lat, lng, { platform: 'mooring', cadence: 'hourly, all year' })) },
    'data-floats': { id: 'data-floats', name: 'Floats reporting', colour: 'violet', on: false, source: 'geojson', addedAt: '2026-11-28', public: false, group: 'observing',
      note: 'Last surfacing of the network’s floats in the Labrador Sea. Made-up example.',
      features: [[56.2, -52.1], [57.9, -50.6], [58.6, -54.3], [59.4, -51.2], [55.4, -49.8], [60.3, -55.6], [57.1, -56.9], [58.1, -47.9]].map(([lat, lng], i) => pointFeature(`Float H${4900 + i}`, lat, lng, { platform: 'float', cadence: 'every 10 days' })) },
  };
  return migratePlace({
    basemap: 'drawn', drawn: CANADA_MAP,
    view: { lat: 58, lng: -80, zoom: 2.7, labelZoom: 4.6, siteZoom: 7, placeZoom: 7, regionZoom: 4.5 },
    places, pins: {}, data, publicMap: true,
    layers: { areas: { on: true }, links: { on: false }, serves: { on: false }, places: { on: true }, actors: { on: false }, assets: { on: false } },
  });
}

/* ---------------------------------------------------------------- social, mobilize, teach */

const TODAY = '2026-11-28';
const day = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/** The hub's social plan: a winter campaign around the podcast and the spring cruise. */
function halcyonSocial(docs) {
  const social = migrateSocial({ id: 'social' });
  const at = (d, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00-04:00`).toISOString();
  for (const [nw, handle, since] of [['bluesky', '@halcyon-ocean.example', '2025-02-01'], ['mastodon', '@halcyon@ocean.example', '2024-05-01'], ['linkedin', 'halcyon-ocean-observatory', '2021-03-01'], ['instagram', '@rv_halcyon', '2022-04-01'], ['youtube', '@HalcyonOcean', '2023-01-15']]) {
    social.channels[nw] = { network: nw, handle, connected: true, connectedAt: at(since), auto: false };
  }
  social.settings = { hashtags: ['OceanCarbon', 'BelowTheMixedLayer'], signoff: 'Open ocean data: halcyon.example/data', utm: true };
  const eps = Object.values(docs.podcasts?.episodes ?? {}).filter((e) => e.status === 'published').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const P = (id, kind, title, text, source, networks, status, when, campaign = '') => ({ id, kind, title, text, source, media: null, networks, perNetwork: {}, status, scheduledAt: status === 'scheduled' ? when : null, postedAt: status === 'posted' ? when : null, results: {}, createdBy: null, createdAt: when, campaign });
  const list = [];
  eps.slice(0, 4).forEach((e, i) => list.push(P(`post-h-e-${i}`, 'episode', e.title, `New on Below the Mixed Layer: “${e.title}”. ${e.description}`, { type: 'episode', id: e.id }, ['bluesky', 'mastodon', 'linkedin', 'youtube'], 'posted', at(e.publishedAt, 16), 'Below the Mixed Layer')));
  list.push(P('post-h-1', 'note', 'The Davis Strait moorings are home', 'Six moorings, a year of hourly data, and one very muddy acoustic release. The Davis Strait array is back on deck and back in the water. Example post.', null, ['bluesky', 'instagram', 'linkedin'], 'posted', at(day(TODAY, -40), 11), 'Station Log'));
  list.push(P('post-h-2', 'datacard', 'Carbon below 1,500 m', 'In strong convection winters, carbon from the air reaches below 1,500 m in the Labrador Sea within weeks. A data card from the Labrador Sea Carbon Lab. Example post.', null, ['bluesky', 'mastodon', 'linkedin'], 'scheduled', at(day(TODAY, 4), 9), 'Winter convection'));
  list.push(P('post-h-3', 'note', 'Students wanted for the spring cruise', 'Four berths for students on RV Halcyon’s spring Labrador Sea cruise. Ask your supervisor, then apply through your member lab. Example post.', null, ['instagram', 'linkedin', 'bluesky'], 'scheduled', at(day(TODAY, 12), 10), 'Spring cruise 2027'));
  list.push(P('post-h-4', 'note', 'Ocean carbon from bench to basin', 'Our open course for the network starts in January: bottle to basin in eight weeks, with real Labrador Sea data. Example post.', null, ['linkedin', 'bluesky', 'mastodon'], 'draft', at(TODAY), 'Bench to basin'));
  list.push(P('post-h-5', 'note', 'Winter convection, live', 'When the Labrador Sea convects, the floats tell us first. A thread through the winter. Example post.', null, ['bluesky', 'mastodon'], 'draft', at(TODAY), 'Winter convection'));
  for (const p of list) {
    if (p.status === 'posted') for (const nw of p.networks) p.results[nw] = mockPush(p, nw, social.channels[nw], p.postedAt);
    social.posts[p.id] = p;
  }
  return social;
}

const at = (d) => `${d}T15:00:00.000Z`;
const aud = (id, group, who, use) => ({ id, group, who, use });
const msg = (id, name, staffId = null, forIds = []) => ({ id, name, staffId, for: forIds });
const out = (id, kind, title, status, audienceIds = []) => ({ id, kind, title, status, audienceIds, note: '' });
const up = (id, d, kind, text, more = {}) => ({ id, at: at(d), kind, text, ...more });

/** Knowledge objects: for the hub, and for the Labrador Sea lab. Uptake marked “Example”. */
function mobilizeFor(spec, staff) {
  const ids = Object.keys(staff);
  const lead = ids[0];
  const objects = spec.id === 'org-halcyon' ? [
    { id: 'ko-h-convection-carbon', title: 'Strong winters send carbon deep, fast', kind: 'finding', strength: 'tested', stage: 'out', stream: 'both', ownerId: ids[1],
      message: 'In strong convection winters, carbon taken up from the air reaches below 1,500 m in the Labrador Sea within weeks, and stays there for decades.',
      audiences: [aud('a1', 'policy', 'Federal ocean and climate policy staff', 'Count the Labrador Sea in national carbon accounting'), aud('a2', 'researchers', 'Modellers in the global commons', 'Test their models against the winter record'), aud('a3', 'media', 'Science reporters', 'Explain the ocean as a carbon sink people can picture')],
      messengers: [msg('m1', 'The Chief Scientist', ids[1], ['a1']), msg('m2', 'The Labrador Sea Carbon Lab', null, ['a2']), msg('m3', 'Below the Mixed Layer', null, ['a3'])],
      outputs: [out('o1', 'brief', 'Carbon below the mixed layer, in one page', 'out', ['a1']), out('o2', 'episode', 'Why the winter matters (Below the Mixed Layer)', 'out', ['a3']), out('o3', 'paper', 'Synthesis paper with the global commons', 'drafting', ['a2'])],
      effect: { hoped: 'The Labrador Sea is named in national carbon reporting; models use the winter record.', signs: 'Citations in policy documents; requests for the data from modelling groups.' },
      uptake: [up('u1', '2026-10-02', 'count', 'Brief downloads from the data centre', { n: 340, outputId: 'o1' }), up('u2', '2026-11-03', 'story', 'Example: a policy analyst used the brief’s figure in a briefing note.', { outputId: 'o1' })],
      nextReview: '2027-01-15', evidence: { sources: [], from: 'Labrador Sea line, 1994–2026 (made-up record for the example)', notes: '' },
      consent: { share: 'open', holders: 'Halcyon and the Labrador Sea Carbon Lab', terms: 'Cite the data set', ocap: false, signedOff: null }, tags: ['ocean carbon', 'convection'] },
    { id: 'ko-h-open-flags', title: 'Flag it, cite it, share it', kind: 'practice', strength: 'established', stage: 'ready', stream: 'practice', ownerId: ids[3],
      message: 'Every data set the network shares carries its quality flags and its citation, so anyone can trust it and credit the people who measured it.',
      audiences: [aud('a1', 'members', 'Member labs', 'Submit cruise data with flags and a citation'), aud('a2', 'researchers', 'Students using network data', 'Keep only good data, and cite it')],
      messengers: [msg('m1', 'The Ocean Data Centre', ids[3], ['a1', 'a2'])],
      outputs: [out('o1', 'module', 'A unit in Ocean carbon from bench to basin', 'drafting', ['a2']), out('o2', 'session', 'Data clinic at the network gathering', 'idea', ['a1'])],
      effect: { hoped: 'Fewer data sets reach the centre without flags.', signs: 'Share of submissions with flags and citations.' },
      nextReview: '2027-02-01', evidence: { sources: [], from: 'Data centre practice', notes: '' },
      consent: { share: 'partners', holders: 'Halcyon', terms: '', ocap: false, signedOff: null }, tags: ['open data'] },
    { id: 'ko-h-northern-knowledge', title: 'Ice and water through northern eyes', kind: 'question', strength: 'emerging', stage: 'draft', stream: 'practice', ownerId: ids[12],
      message: 'How do northern partners’ observations of ice and water sit beside the moorings, on their terms?',
      consent: { share: 'held', holders: 'Northern partner communities', terms: 'Shared only as and when the holders decide', ocap: true, signedOff: null }, tags: ['co-production', 'OCAP'] },
  ] : [
    { id: 'ko-l-anthro-carbon', title: 'Anthropogenic carbon in the deep Labrador Sea', kind: 'finding', strength: 'tested', stage: 'out', stream: 'academic', ownerId: lead,
      message: 'Anthropogenic carbon in Labrador Sea Water has risen steadily since the 1990s, faster after strong convection winters.',
      audiences: [aud('a1', 'researchers', 'Ocean carbon researchers', 'Compare with their basins'), aud('a2', 'educators', 'Ocean science instructors', 'Teach with the section')],
      messengers: [msg('m1', 'The lab lead', lead, ['a1', 'a2']), msg('m2', 'The PhD researcher', ids[2], ['a1'])],
      outputs: [out('o1', 'paper', 'Paper for a carbon journal', 'drafting', ['a1']), out('o2', 'poster', 'Poster for the ocean sciences meeting', 'out', ['a1']), out('o3', 'module', 'Week 6 of Ocean carbon from bench to basin', 'out', ['a2'])],
      effect: { hoped: 'Other labs compare their basins; students learn from the section.', signs: 'Requests for the data; course reflections that use the section.' },
      uptake: [up('u1', '2026-11-10', 'story', 'Example: a student in the course rebuilt the section in p5.js and showed it to their class.', { outputId: 'o3' })],
      nextReview: '2027-03-01', evidence: { sources: [], from: 'GLODAP-style bottle data, Labrador Sea (mock data for the example)', notes: '' },
      consent: { share: 'partners', holders: 'Labrador Sea Carbon Lab', terms: '', ocap: false, signedOff: null }, tags: ['ocean carbon'] },
    { id: 'ko-l-draw-the-ocean', title: 'Draw the ocean before you model it', kind: 'practice', strength: 'emerging', stage: 'ready', stream: 'both', ownerId: lead,
      message: 'Students who sketch a section by hand, then in code, read real ocean data with more confidence than those who start with the finished figure.',
      audiences: [aud('a1', 'educators', 'University instructors', 'Add a sketch-then-code lab'), aud('a2', 'members', 'The Ocean Teaching Commons', 'Share the lab across the network')],
      messengers: [msg('m1', 'The lab lead', lead, ['a1', 'a2']), msg('m2', 'The MSc researcher in data visualisation', ids[4], ['a1'])],
      outputs: [out('o1', 'module', 'A sketchbook lab for the course', 'out', ['a1']), out('o2', 'episode', 'Carbon you can draw (Below the Mixed Layer)', 'drafting', ['a2'])],
      effect: { hoped: 'Other instructors run the lab.', signs: 'Instructors who ask for the lab; student reflections.' },
      nextReview: '2027-02-15', evidence: { sources: [], from: 'Two years of teaching (made up)', notes: '' },
      consent: { share: 'open', holders: 'Labrador Sea Carbon Lab', terms: '', ocap: false, signedOff: null }, tags: ['teaching', 'visualisation'] },
  ];
  const doc = blankMobilize();
  doc.settings = { reviewEvery: 90, lead, note: 'A made-up starting set for the Halcyon network example. Anything marked “Example” shows how the loop works.' };
  for (const o of objects) doc.objects[o.id] = migrateObject({ createdAt: at('2026-11-20'), updatedAt: at('2026-11-28'), ...o });
  return migrateMobilize(doc);
}

const TRACKS = [['content', 'Learning content'], ['live', 'Live sessions'], ['assess', 'Practice and assessment'], ['support', 'Dialogue and care']];

/** The Labrador Sea lab's open course for the network: eight weeks, real (mock) Labrador Sea data. */
export function benchToBasin(by) {
  const id = 'crt_bench_basin';
  const b = (n) => `blk_bb_${n}`;
  return publish(build(
    { id, title: 'Ocean carbon from bench to basin', subtitle: 'From one bottle of seawater to the carbon of a whole sea', kind: 'course', by,
      summary: 'Eight weeks for students across the Halcyon network: how a bottle is drawn and measured, how its numbers are checked and flagged, and how thousands of bottles become a picture of carbon moving into the deep Labrador Sea. Every week uses real-shaped data and ends with something you draw.',
      span: { pre: 7, length: 56, post: 14 }, run: { start: '2027-01-11', tz: 'America/St_Johns' }, hoursPerWeek: 4,
      competencies: [
        { id: 'cmp_bottle', name: 'Measuring the carbonate system', framework: 'Halcyon ocean skills (made up)', level: 'foundation' },
        { id: 'cmp_flags', name: 'Quality control and citation', framework: 'Halcyon ocean skills (made up)', level: 'foundation' },
        { id: 'cmp_section', name: 'Reading and drawing a section', framework: 'Halcyon ocean skills (made up)', level: 'intermediate' },
      ],
      credential: { name: 'Bench to Basin (Halcyon network)', rule: 'required-done' } },
    TRACKS,
    [
      ['support', 'discussion', -7, 'Introduce yourself, and your water', { id: b('intro'), body: 'Your name, your lab, and the body of water you know best.' , required: false }],
      ['content', 'lesson', 0, 'One bottle', { id: b('bottle'), length: 5, body: 'A Niskin bottle closes at 2,000 m. What is in it, and what can we measure before it changes?', competencies: ['cmp_bottle'] }],
      ['live', 'live', 2, 'Kick-off: a cruise in an hour', { id: b('kickoff'), at: '13:00', minutes: 60, settings: { url: 'https://meet.example/bench-basin', host: 'Lab lead' } }],
      ['content', 'lesson', 7, 'DIC, alkalinity and pH', { id: b('carbonate'), length: 6, body: 'The carbonate system in three measurements, and why two are enough.', competencies: ['cmp_bottle'] }],
      ['assess', 'quiz', 9, 'Check yourself: the carbonate system', { id: b('quiz1'), settings: { questions: [
        { q: 'How many carbonate system variables do you need to calculate the rest?', options: ['One', 'Two', 'Four'], answer: 1 },
        { q: 'What does a WOCE flag of 2 mean?', options: ['Not measured', 'Acceptable', 'Bad'], answer: 1 },
      ] } }],
      ['content', 'lesson', 14, 'Flags and citations', { id: b('flags'), length: 4, body: 'Keep the good, mark the doubtful, cite the people who measured it.', competencies: ['cmp_flags'] }],
      ['content', 'reading', 21, 'From bottles to a section', { id: b('section'), body: 'Distance along the line, depth down the page, a variable in colour.', competencies: ['cmp_section'] }],
      ['assess', 'assignment', 28, 'Sketch a section, then code it', { id: b('sketch'), length: 7, body: 'Draw the Labrador Sea oxygen section by hand, then in the EoViz sketchbook or p5.js. Hand in both.', settings: { handIn: 'doc', formats: ['doc'] }, competencies: ['cmp_section'] }],
      ['content', 'lesson', 35, 'Winter convection', { id: b('convection'), length: 5, body: 'How a cold winter mixes the sea to 2,000 m, and what it carries down.' }],
      ['content', 'lesson', 42, 'Anthropogenic carbon', { id: b('anthro'), length: 6, body: 'Separating the carbon we added from the carbon that was always there.' }],
      ['live', 'live', 44, 'Studio session: the sea in 3D', { id: b('studio'), at: '13:00', minutes: 75, settings: { url: 'https://meet.example/bench-basin-studio' } }],
      ['support', 'reflection', 49, 'What did the data change in how you see the sea?', { id: b('reflect') }],
      ['assess', 'milestone', 55, 'Bench to basin', { id: b('done') }],
    ],
    [[-7, 'Doors open', 'learners', 'email'], [0, 'Week 1 opens', 'learners', 'email'], [28, 'Halfway: check who has gone quiet', 'teachers']],
  ), by);
}

/* ---------------------------------------------------------------- the hub and the lab, in full */

/** Rename the generated people to the org's own (keeping their ids), and the library's authors with them. */
function reshapePeople(docs, spec) {
  const mine = Object.values(staffFor(spec));
  const before = Object.values(docs.org.staff);
  const renamed = {};
  before.forEach((s, i) => {
    const p = mine[i];
    if (!p) return;
    renamed[s.name] = p.name;
    Object.assign(s, { name: p.name, title: p.title, roleId: p.roleId, interests: p.interests, email: p.email, location: p.location });
  });
  for (const it of Object.values(docs.library?.items ?? {})) {
    for (const c of it.meta?.creators ?? []) {
      const full = [c.given, c.family].filter(Boolean).join(' ');
      if (renamed[full]) { const [given, ...rest] = renamed[full].split(' '); c.given = given; c.family = rest.join(' '); }
    }
  }
}

/** The hub or the Labrador Sea lab: the shared generator for the bulk, then shaped into the network. */
export function halcyonBundle(id) {
  const spec = halcyonSpec(id);
  const hub = id === 'org-halcyon';
  const { docs, files } = mockDocs({
    id, slug: spec.slug, name: spec.name, plan: spec.plan === 'network' ? 'custom' : spec.plan, sector: 'ocean',
    people: spec.people.length, maps: hub ? 2 : 1, plans: hub ? 2 : 1, shows: hub ? 2 : 0, dashboards: hub ? 3 : 2,
    color: '#1f5f8b', motif: 'wave', palette: 'corporate', shape: 'rounded', domain: `${spec.slug}.example`, address: spec.city,
  });
  reshapePeople(docs, spec);
  const org = docs.org;
  Object.assign(org, {
    description: spec.about, mission: hub ? 'Watch the ocean around Canada closely and openly, and put what we learn in the hands of the people who need it.' : 'Follow carbon and oxygen into the deep Labrador Sea, and teach the next generation to see it.',
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: HALCYON_COLOURS },
    plugins: { ...(org.plugins ?? {}), podcasts: hub, graph: true, rhizome: true, place: true, eoviz: true, social: true, mobilize: true, teach: true, learn: true },
  });
  if (!hub) delete org.plugins.podcasts;
  if (docs.library) {
    const fid = 'f-network';
    docs.library.folders[fid] = { id: fid, name: 'Shared with the network', parentId: null };
    const lib = docs.library;
    const add = (r) => { lib.items[r.id] = r; };
    // GLODAP is a real, open data product: cited here as the source the example's mock data imitates.
    add(ref('ref-glodap', fid, 'GLODAPv2: Global Ocean Data Analysis Project, version 2 (data product)', ['GLODAP'], '2023', 'GLODAP', 'An open, quality-controlled synthesis of interior ocean carbon and related bottle data, released under CC BY 4.0. The example’s Labrador Sea data is mock data shaped like it.', { url: 'https://www.glodap.info', type: 'dataset', tags: ['GLODAP', 'open data'] }));
    add(ref(`ref-${spec.slug}-cruise`, fid, hub ? 'Cruise report HAL-2026-04: Labrador Sea line (example)' : 'Lab methods: DIC, alkalinity and oxygen (example)', [spec.name], '2026', spec.name, 'A made-up example document.', { tags: ['methods'] }));
  }
  org.network = { share: shareFor(spec, docs.library) };
  if (hub) {
    docs.place = halcyonPlace();
    docs.social = halcyonSocial(docs);
    docs.rhizome = seedRhizome(docs);
  }
  docs.mobilize = mobilizeFor(spec, org.staff);
  if (!hub) {
    const lead = Object.keys(org.staff)[0];
    const course = benchToBasin(lead);
    docs.teach = { cartridges: { [course.id]: course }, version: 1 };
    let learn = blankLearn();
    for (const s of Object.values(org.staff).slice(1)) learn = enrol(learn, s.id, course, '2027-01-04T14:00:00.000Z');
    docs.learn = learn;
  }
  return { docs, files };
}

/** Any Halcyon org's documents. */
export function halcyonDocs(id) {
  return id === 'org-halcyon' || id === 'org-labsea' ? halcyonBundle(id).docs : memberDocs(halcyonSpec(id));
}

/** The client-org entries for the ten orgs. */
export const HALCYON_CLIENTS = HALCYON_ORGS.map((o) => ({
  id: o.id, slug: o.slug, name: o.name, plan: o.plan, docs: () => halcyonDocs(o.id),
  ...(o.id === 'org-halcyon' || o.id === 'org-labsea' ? { bundle: () => halcyonBundle(o.id) } : {}),
}));
