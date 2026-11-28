/**
 * Tamarack Institute: the "ecosystem surfer" project (alpha client, d,
 * 2026-11-27). First piece: a clickable, labelled, grouped map of Canada
 * showing Tamarack's Networks for Change, from public sources read on
 * 2026-11-27:
 *
 *   tamarackcommunity.ca/2024-annual-report                         the four networks
 *   tamarackcommunity.ca/articles/community-climate-transitions-
 *     welcomes-30-communities-to-the-network      (22 Feb 2023)    Climate Transitions, 2023 cohort
 *   tamarackcommunity.ca/articles/tamarack-welcomes-23-communities-
 *     to-the-community-climate-transitions-network (13 Feb 2024)   Climate Transitions, 2024 cohort
 *   tamarackcommunity.ca/networks-for-change/youth-futures          places in its community stories
 *   tamarackcommunity.ca/networks-for-change/ending-poverty         400+ municipalities, 90 roundtables (no public roster)
 *
 * Honesty rules, as for Actua: only Climate Transitions publishes named
 * communities, so only those are "listed"; Youth Futures places are named in
 * Tamarack's stories and marked "to confirm"; Ending Poverty and Building
 * Belonging show as networks with no public roster yet. Points sit on each
 * community's centre (precision approx). Nothing here is Tamarack's own data.
 */
import { migrateOrg } from '../org.js';
import { migratePlace } from '../../place/model.js';
import { CANADA_MAP } from '../../place/basemaps.js';
import { migratePages } from '../pages.js';

const SRC = {
  report: 'https://www.tamarackcommunity.ca/2024-annual-report',
  cct2023: 'https://www.tamarackcommunity.ca/articles/community-climate-transitions-welcomes-30-communities-to-the-network',
  cct2024: 'https://www.tamarackcommunity.ca/articles/tamarack-welcomes-23-communities-to-the-community-climate-transitions-network',
  youth: 'https://www.tamarackcommunity.ca/networks-for-change/youth-futures',
  poverty: 'https://www.tamarackcommunity.ca/networks-for-change/ending-poverty',
};

/** Tamarack's Networks for Change (2024 annual report), with what is public about each. */
export const TAMARACK_NETWORKS = [
  { id: 'climate', name: 'Climate Transitions', colour: 'green', about: 'Communities building climate action that is just and community-led. 70+ current and alumni communities; cohorts named publicly each year.', source: SRC.cct2024 },
  { id: 'youth', name: 'Youth Futures', colour: 'orange', about: 'A youth-led network of 20 communities building pathways from high school to post-secondary, training, work and leadership. The roster isn’t on the page; places below are named in its stories.', source: SRC.youth },
  { id: 'poverty', name: 'Ending Poverty', colour: 'blue', about: 'Communities Ending Poverty: more than 400 municipalities through 90 regional roundtables. No public roster: add it from Tamarack’s own list.', source: SRC.poverty },
  { id: 'belonging', name: 'Building Belonging', colour: 'violet', about: 'Tamarack’s fourth network (2024 annual report). No public roster read yet.', source: SRC.report },
];

const P = { NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island', NS: 'Nova Scotia', NB: 'New Brunswick', QC: 'Quebec', ON: 'Ontario', MB: 'Manitoba', SK: 'Saskatchewan', AB: 'Alberta', BC: 'British Columbia', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut', US: 'United States' };
/** Label points for the provinces (Natural Earth's, in vendor/geo/canada.json). */
const PROVINCE_AT = { AB: [55.17, -114.51], BC: [54.96, -124.61], MB: [54.92, -97.44], NB: [46.63, -66.39], NL: [54.27, -61.95], NS: [44.91, -63.95], NT: [64.37, -119.63], NU: [65.91, -98.6], ON: [50.46, -86.09], PE: [46.4, -63.24], QC: [53.74, -71.93], SK: [54.42, -105.9], YT: [63.63, -135.51] };

/** Communities: [id, name, province, lat, lng]. */
const COMMUNITIES = [
  ['st-johns', 'Newfoundland and Labrador (province-wide)', 'NL', 47.56, -52.71],
  ['new-glasgow', 'New Glasgow', 'NS', 45.59, -62.65],
  ['halifax', 'Halifax Regional Municipality', 'NS', 44.65, -63.57],
  ['cape-breton-northside', 'Cape Breton (Northside)', 'NS', 46.21, -60.25],
  ['north-shore-pei', 'North Shore', 'PE', 46.45, -63.2],
  ['fredericton', 'Fredericton', 'NB', 45.96, -66.64],
  ['moncton', 'Moncton', 'NB', 46.09, -64.78],
  ['peninsule-acadienne', 'Péninsule acadienne', 'NB', 47.55, -65.1],
  ['caraquet', 'Caraquet', 'NB', 47.79, -64.94],
  ['quebec-city', 'Quebec City', 'QC', 46.81, -71.21],
  ['montreal', 'Montreal', 'QC', 45.5, -73.57],
  ['lachine', 'Lachine', 'QC', 45.43, -73.68],
  ['laval', 'Laval', 'QC', 45.57, -73.69],
  ['longueuil', 'Longueuil', 'QC', 45.53, -73.52],
  ['beaconsfield', 'Beaconsfield', 'QC', 45.43, -73.86],
  ['mont-saint-hilaire', 'Mont-Saint-Hilaire', 'QC', 45.56, -73.19],
  ['gatineau', 'Gatineau', 'QC', 45.48, -75.7],
  ['cornwall', 'Stormont, Dundas and Glengarry', 'ON', 45.02, -74.73],
  ['toronto', 'Toronto', 'ON', 43.65, -79.38],
  ['durham', 'Durham Region', 'ON', 43.9, -78.94],
  ['peel', 'Peel Region', 'ON', 43.68, -79.76],
  ['cooksville', 'Cooksville (Mississauga)', 'ON', 43.58, -79.62],
  ['markham', 'Markham', 'ON', 43.86, -79.34],
  ['oakville', 'Oakville', 'ON', 43.47, -79.69],
  ['hamilton', 'Hamilton', 'ON', 43.26, -79.87],
  ['northumberland', 'Northumberland County', 'ON', 44.03, -78.05],
  ['collingwood', 'Collingwood', 'ON', 44.5, -80.22],
  ['tobermory', 'Tobermory', 'ON', 45.25, -81.66],
  ['london', 'London', 'ON', 42.98, -81.25],
  ['middlesex', 'Middlesex Centre', 'ON', 43.05, -81.4],
  ['oxford', 'Oxford County', 'ON', 43.13, -80.75],
  ['windsor-essex', 'Windsor-Essex', 'ON', 42.31, -83.04],
  ['sudbury', 'Sudbury', 'ON', 46.49, -80.99],
  ['thunder-bay', 'Thunder Bay', 'ON', 48.38, -89.25],
  ['finger-lakes', 'Genesee-Finger Lakes Region (New York)', 'US', 43.16, -77.61],
  ['winnipeg', 'Winnipeg', 'MB', 49.9, -97.14],
  ['the-pas', 'The Pas and Opaskwayak Cree Nation', 'MB', 53.83, -101.25],
  ['regina', 'Regina', 'SK', 50.45, -104.61],
  ['lethbridge', 'Lethbridge', 'AB', 49.69, -112.84],
  ['edmonton', 'Edmonton', 'AB', 53.55, -113.49],
  ['yellowhead', 'Yellowhead Tribal Council Nations', 'AB', 53.65, -114.6],
  ['west-kootenays', 'West Kootenays', 'BC', 49.49, -117.29],
  ['vancouver', 'Vancouver', 'BC', 49.28, -123.12],
  ['clayoquot', 'Clayoquot Sound Biosphere Region', 'BC', 49.15, -125.9],
  ['tahsis', 'Tahsis', 'BC', 49.92, -126.66],
  ['whitehorse', 'Yukon', 'YT', 60.72, -135.06],
  ['yellowknife', 'Yellowknife', 'NT', 62.45, -114.37],
];

/** Climate Transitions, 2023 cohort (22 Feb 2023): community → the organisations named. */
const CCT_2023 = {
  halifax: 'Community Climate Hubs Initiative (Climate Reality Project Canada); the OATHE Project; HCi3; Ecology Action Centre; Halifax Regional Municipality Council; Youth Council, the African Nova Scotia Road to Economic Prosperity; Prep Academy; Inspiring Communities',
  'north-shore-pei': 'Council of Canadians; Canadian Federation of University Women, PEI Chapter; Gulf Shore Community Health Corporation; a Member of the Provincial Legislative Assembly; CLIMAtlantic',
  'quebec-city': 'City of Quebec; Université Laval Jeunes et aînés solidaires; Institut EDS de l’Université Laval (Cohorte ClimatIC)',
  collingwood: 'Town of Collingwood; Collingwood Climate Action Team',
  london: 'Climate Action London; Middlesex London Ontario Health Team; London Health Sciences Centre',
  markham: 'Markham Public Library',
  middlesex: 'Municipality of Middlesex Centre',
  northumberland: 'Community Power Northumberland; Municipality of Port Hope (Council); Municipality of Brighton (Council); Hamilton Township’s Environmental Sustainability Committee; Port Hope Environmental Advisory Committee; Municipality of Cramahe; Town of Cobourg; Brighton’s Sustainability Advisory Committee',
  peel: 'Region of Peel',
  tobermory: 'Northern Bruce Peninsula Climate Action Committee 2022; The Meeting Place Tobermory',
  'finger-lakes': 'The Climate Solutions Accelerator of the Genesee-Finger Lakes Region',
  regina: 'Regina City Council; City of Regina',
  'west-kootenays': 'Regional District of Central Kootenay; West Kootenay Climate Hub; Neighbours United',
  vancouver: 'CityHive',
  tahsis: 'Village of Tahsis Council',
  'peninsule-acadienne': 'Municipalité des Hautes-Terres; Imaginons la Péninsule acadienne autrement (IPAA) (Cohorte ClimatIC)',
  caraquet: 'Ville de Caraquet (Cohorte ClimatIC)',
  'mont-saint-hilaire': 'Ville de Mont-Saint-Hilaire (Cohorte ClimatIC)',
  longueuil: 'Municipalité de Longueuil (Cohorte ClimatIC)',
  montreal: 'La Fondation David Suzuki (Réseau Demain le Québec); Mères au front; Équiterre; ENvironnement JEUnesse; CDC Centre-Sud; Concertation Montréal; Concertation Saint-Léonard (Cohorte ClimatIC)',
  beaconsfield: 'Municipalité de Beaconsfield (Cohorte ClimatIC)',
  gatineau: 'Ville de Gatineau (Cohorte ClimatIC)',
  'thunder-bay': 'Association des francophones du Nord-Ouest de l’Ontario (AFNOO); Coopérative Centre francophone de Thunder Bay (Cohorte ClimatIC, Francophone Ontario)',
  cornwall: 'Association des communautés francophones de l’Ontario Stormont Dundas Glengarry (AFCO) (Cohorte ClimatIC, Francophone Ontario)',
};
/** Climate Transitions, 2024 cohort (13 Feb 2024). */
const CCT_2024 = {
  'st-johns': 'Municipalities of Newfoundland and Labrador',
  'new-glasgow': 'Town of New Glasgow',
  halifax: 'Nova Scotia Public Health (province-wide)',
  fredericton: 'Fredericton Community Climate Hub; Climate Reality Project Canada',
  london: 'London Health Sciences Centre; London/Middlesex Public Health Unit; Western University; London Cycle Network; Creating Me; Run Like Clockwork',
  hamilton: 'Vital Futures; Action13',
  durham: 'Brilliant Energy Institute; City of Pickering; Climate Justice Durham; Municipality of Clarington; Ontario Tech University; Region of Durham; Town of Ajax; Township of Brock; Town of Whitby',
  toronto: 'Community Resilience to Extreme Weather (CREW); Environmental Defence (Ontario-wide)',
  'thunder-bay': 'City of Thunder Bay; EarthCare Advisory Committee of Council; Rotary Club of Thunder Bay, Port Arthur; Environment North; Northwest Climate Collaborative',
  oakville: 'Oakville Community Foundation',
  winnipeg: 'Manitoba Eco-Network; West Broadway Community Organization; West End Resource Centre; Spence Neighbourhood Association; Green Action Centre',
  'the-pas': 'University College of the North; Opaskwayak Cree Nation; The Pas Community Development Corporation; Town of The Pas',
  lethbridge: 'Environment Lethbridge; City of Lethbridge; Helen Schuler Nature Centre',
  edmonton: 'Africa Centre',
  yellowhead: 'Yellowhead Tribal Council, for Alexander First Nation, Alexis Nakota Sioux Nation, O’Chiese First Nation and Sunchild First Nation',
  clayoquot: 'Clayoquot Biosphere Trust',
  vancouver: 'Women Transforming Cities; Aboriginal Housing Management Association (BC-wide)',
  lachine: 'GRAME (Cohorte ClimatIC)',
  laval: 'Ville de Laval (Cohorte ClimatIC)',
  montreal: 'ENvironnement JEUnesse; Sustainable and Resilient Cities Collective (Cohorte ClimatIC)',
};
/** Youth Futures: places named in its community stories (to confirm with Tamarack). */
const YOUTH = ['sudbury', 'moncton', 'whitehorse', 'yellowknife', 'cooksville', 'oxford', 'clayoquot', 'windsor-essex', 'montreal', 'edmonton', 'cape-breton-northside'];

export const TAMARACK_COLOURS = {
  primary: '#2f6b3a', 'primary-content': '#ffffff',
  secondary: '#1f7a8c', 'secondary-content': '#ffffff',
  accent: '#e3a33b', 'accent-content': '#2b1a05',
  neutral: '#1d2b22', 'neutral-content': '#eef4ef',
  'base-100': '#ffffff', 'base-200': '#f3f6f2', 'base-300': '#e1e8df', 'base-content': '#1d2b22',
};

export function tamarackOrg() {
  return migrateOrg({
    id: 'org-tamarack',
    name: 'Tamarack Institute',
    description: 'The ecosystem surfer: Tamarack’s Networks for Change across Canada, on one map, to grow into funders, donors, community assets and community wealth building.',
    mission: 'Communities across Canada ending poverty, building belonging, opening youth futures and making just climate transitions, learning together.',
    contact: { email: '', phone: '', website: 'https://www.tamarackcommunity.ca/', address: 'Waterloo, ON' },
    // Approximate: a forest green with a teal and a warm accent. Check against Tamarack's brand guide.
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: TAMARACK_COLOURS },
    plugins: { place: true, rhizome: true, graph: true, podcasts: false },
    staff: {
      'a-admin': { id: 'a-admin', name: 'Workspace admin', title: 'Sets up and looks after this space', roleId: 'admin', teamIds: ['t-networks'], interests: [], email: '', avatar: null },
      'a-networks': { id: 'a-networks', name: 'Networks lead (to name)', title: 'Networks for Change', roleId: 'lead', teamIds: ['t-networks'], interests: [], email: '', avatar: null },
      'a-learning': { id: 'a-learning', name: 'Learning and evaluation (to name)', title: 'Research, learning and evaluation', roleId: 'staff', teamIds: ['t-networks'], interests: [], email: '', avatar: null },
    },
    teams: { 't-networks': { id: 't-networks', name: 'Networks for Change', color: '#2f6b3a' } },
    sites: { [TAMARACK_SITE.id]: TAMARACK_SITE },
  });
}

const r2 = (v) => Math.round(v * 100) / 100;

/** The map: provinces and communities as places, each network (and cohort) as its own data layer. */
export function tamarackPlace() {
  const byId = Object.fromEntries(COMMUNITIES.map(([id, name, prov, lat, lng]) => [id, { id, name, prov, lat, lng }]));
  const networksOf = (id) => [CCT_2023[id] && 'Climate Transitions 2023', CCT_2024[id] && 'Climate Transitions 2024', YOUTH.includes(id) && 'Youth Futures (named in stories)'].filter(Boolean);
  const places = {};
  const used = new Set(COMMUNITIES.filter(([id]) => networksOf(id).length).map(([, , prov]) => prov));
  // The Maritime provinces are too small for a country-wide label; their communities still show.
  for (const prov of used) {
    if (!PROVINCE_AT[prov] || ['PE', 'NS', 'NB'].includes(prov)) continue;
    places[`prov-${prov}`] = { id: `prov-${prov}`, name: P[prov], kind: 'region', geo: { lat: PROVINCE_AT[prov][0], lng: PROVINCE_AT[prov][1] }, description: '', tags: ['province'] };
  }
  for (const c of Object.values(byId)) {
    const nets = networksOf(c.id);
    if (!nets.length) continue;
    const lines = [CCT_2023[c.id] && `Climate Transitions, 2023 cohort: ${CCT_2023[c.id]}.`, CCT_2024[c.id] && `Climate Transitions, 2024 cohort: ${CCT_2024[c.id]}.`, YOUTH.includes(c.id) && 'Youth Futures: named in Tamarack’s community stories (to confirm).'].filter(Boolean);
    places[c.id] = { id: c.id, name: c.name, kind: 'community', geo: { lat: c.lat, lng: c.lng }, ...(places[`prov-${c.prov}`] ? { within: `prov-${c.prov}` } : {}), description: lines.join(' '), tags: nets.map((n) => n.toLowerCase()) };
  }
  places.waterloo = { id: 'waterloo', name: 'Tamarack Institute', kind: 'landmark', geo: { lat: 43.46, lng: -80.52 }, ...(places['prov-ON'] ? { within: 'prov-ON' } : {}), description: ['Tamarack’s home in Waterloo, Ontario. It runs all four Networks for Change.', ...TAMARACK_NETWORKS.map((n) => `${n.name}: ${n.about}`)].join(' '), tags: ['tamarack'] };
  const layer = (id, name, colour, entries, note, group) => ({
    id, name, colour, on: true, source: 'geojson', addedAt: '2026-11-27', note, public: true, group,
    features: entries.map(([cid, orgs, basis, source]) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r2(byId[cid].lng), r2(byId[cid].lat)] }, properties: { name: byId[cid].name, province: P[byId[cid].prov], organisations: orgs, basis, source } })),
  });
  const data = {
    'data-climate-2023': layer('data-climate-2023', 'Climate cohort 2023', 'green', Object.entries(CCT_2023).map(([id, orgs]) => [id, orgs, 'listed by Tamarack', SRC.cct2023]), 'Named in Tamarack’s announcement of 22 Feb 2023: 15 English and 15 French communities (Cohorte ClimatIC).', 'climate'),
    'data-climate-2024': layer('data-climate-2024', 'Climate cohort 2024', 'teal', Object.entries(CCT_2024).map(([id, orgs]) => [id, orgs, 'listed by Tamarack', SRC.cct2024]), 'Named in Tamarack’s announcement of 13 Feb 2024: 20 English and 4 French entries, some province-wide or national.', 'climate'),
    'data-youth-futures': layer('data-youth-futures', 'Youth Futures (stories)', 'orange', YOUTH.map((id) => [id, 'Named in a Youth Futures community story', 'to confirm', SRC.youth]), 'Youth Futures has 20 communities; its page doesn’t list them. These places are named in its stories: confirm with Tamarack.', 'youth'),
  };
  return migratePlace({
    basemap: 'drawn',
    drawn: CANADA_MAP,
    view: { lat: 55.5, lng: -96, zoom: 2.9, labelZoom: 4.6, siteZoom: 7, placeZoom: 7, regionZoom: 4.5 },
    places, pins: {}, data,
    // The members site shows the map: places and the three public layers, never pins.
    publicMap: true,
    layers: { areas: { on: true }, links: { on: false }, serves: { on: false }, places: { on: true }, actors: { on: false }, assets: { on: false } },
  });
}

/* ---------------------------------------------------------------- the members site (Web) */
/**
 * Networks for Change, the members site (alpha 0.4, plan doc "Tamarack on
 * Dashi"): a public site made in Web around the shared map. Community pages
 * come from the map's places (site.html?place=<id>); the join form and the
 * "Is this right?" form are feedback forms, so answers land in Dashi now and
 * in HubSpot once the app is connected.
 */
export const TAMARACK_SITE = {
  id: 'site-members', name: 'Networks for Change', url: 'https://members.example/tamarack', visibility: 'public',
  shows: 'Tamarack’s four networks on one map, a page for every member community, and how to join',
  home: { kind: 'page', slug: 'home' },
  look: { template: 'harbour', masthead: { preset: 'canopy', image: null, height: 'm', focus: 50 }, type: 'sans', header: 'over' },
};

const SITE_AT = '2026-11-27';
const sitePage = (id, title, summary, body, more = {}) => [id, {
  id, kind: 'page', siteId: TAMARACK_SITE.id, title, slug: more.slug ?? title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''), summary, body, cover: null,
  status: 'published', publishedAt: SITE_AT, authorId: null, inNav: true, order: 0, ...more,
}];

export function tamarackPages() {
  const net = Object.fromEntries(TAMARACK_NETWORKS.map((n) => [n.id, n]));
  const page = (id) => `?site=${TAMARACK_SITE.id}&page=${id}`;
  return migratePages({ id: 'pages', pages: Object.fromEntries([
    sitePage('pg-t-home', 'Networks for Change', 'Communities across Canada, learning together.', `## Find your community, find your peers

Tamarack’s four Networks for Change bring together councils, roundtables and community groups working on the same hard things. Click a dot to see a community’s networks and its page; the colours are the networks it’s in.

[[map:place]]

## The networks

- **[Climate Transitions](${page('climate-transitions')})**: just, community-led climate action. ${new Set([...Object.keys(CCT_2023), ...Object.keys(CCT_2024)]).size} cohort communities on the map.
- **[Youth Futures](${page('youth-futures')})**: youth-led pathways from high school to work and leadership.
- **[Ending Poverty](${page('ending-poverty')})**: more than 400 municipalities through 90 regional roundtables.
- **[Building Belonging](${page('building-belonging')})**: communities where everyone belongs.

## Is your community here?

The map shows what Tamarack has published so far. If your community is missing, or something is out of date, [tell us](${page('join')}).`, { slug: 'home', inNav: false, order: -1 }),
    sitePage('pg-t-map', 'The map', 'Every member community we can show, and where each comes from.', `Each dot is a community; its colours are the networks it’s in. Click one for its page.

[[map:place]]

## Where this comes from

- **Climate Transitions**: the communities Tamarack named when it welcomed its 2023 and 2024 cohorts.
- **Youth Futures**: places named in the network’s community stories. Still **to confirm** with Tamarack.
- **Ending Poverty** and **Building Belonging** have no public list yet. They join the map when Tamarack’s own member lists come in.

Organisations show here; people never do, unless they choose to.`, { order: 0 }),
    sitePage('pg-t-climate', 'Climate Transitions', 'Climate action that is just and community-led.', `${net.climate.about}

[[map:climate]]

Two cohorts are on the map: 2023 (green) and 2024 (teal). Communities in both show both colours.`, { order: 1, slug: 'climate-transitions' }),
    sitePage('pg-t-youth', 'Youth Futures', 'Youth-led pathways to post-secondary, training, work and leadership.', `${net.youth.about}

[[map:youth]]

These places are **to confirm**: they come from the network’s stories, not a member list.`, { order: 2, slug: 'youth-futures' }),
    sitePage('pg-t-poverty', 'Ending Poverty', 'More than 400 municipalities, 90 regional roundtables.', `${net.poverty.about}

The roundtables aren’t on the map yet: their list comes from Tamarack, and each roundtable says how it wants to be shown. [Is your roundtable a member?](${page('join')})`, { order: 3, slug: 'ending-poverty' }),
    sitePage('pg-t-belonging', 'Building Belonging', 'Communities where everyone belongs.', `${net.belonging.about}

Its members join the map when Tamarack’s list comes in. [Tell us about your community](${page('join')}).`, { order: 4, slug: 'building-belonging' }),
    sitePage('pg-t-join', 'Join or update', 'Join a network, or put your community’s listing right.', `A minute, and Tamarack’s networks team will be in touch. Only Tamarack sees what you send.

[[form:form-t-join]]`, { order: 5, slug: 'join' }),
  ]) });
}

const q = (id, kind, text, more = {}) => ({ id, kind, text, options: [], required: false, help: '', ...more });
/** The join form (on the Join page) and "Is this right?" (on every community page). */
export function tamarackForms() {
  return {
    'form-t-join': {
      id: 'form-t-join', title: 'Join or update your listing', intro: 'Tell us who you are and which network you’d like to join, or what to correct on the map.',
      thanks: 'Thank you. Tamarack’s networks team will be in touch within two weeks.', visibility: 'public', siteId: TAMARACK_SITE.id, place: 'join', createdAt: SITE_AT,
      style: { layout: 'card', button: 'Send' },
      questions: [
        q('q-why', 'choice', 'What would you like to do?', { required: true, options: ['Join a network', 'Add my community to the map', 'Correct our listing', 'Something else'] }),
        q('q-community', 'text', 'Your community', { required: true, placeholder: 'Town, city, region or First Nation' }),
        q('q-org', 'text', 'Your organisation', { placeholder: 'Council, roundtable, collaborative…' }),
        q('q-nets', 'multi', 'Which networks?', { options: TAMARACK_NETWORKS.map((n) => n.name) }),
        q('q-more', 'long', 'Anything else we should know?'),
        q('q-email', 'text', 'Email, so we can reply', { help: 'Only Tamarack sees this. It never shows on the site.' }),
      ],
    },
    'form-t-check': {
      id: 'form-t-check', title: 'Is this right?', intro: 'Help keep the map true: tell us if anything on this page is wrong or missing.',
      thanks: 'Thank you. We’ll check and update the page.', visibility: 'public', siteId: TAMARACK_SITE.id, place: 'community', createdAt: SITE_AT,
      style: { layout: 'plain', button: 'Send' },
      questions: [
        q('q-right', 'yesno', 'Is this page right?'),
        q('q-fix', 'long', 'What should change?'),
      ],
    },
  };
}

export function tamarackDocs() {
  const org = tamarackOrg();
  return {
    org, place: tamarackPlace(), pages: tamarackPages(),
    dashboards: { id: 'dashboards', dashboards: {}, calculators: {}, stories: {}, forms: tamarackForms(), reports: {}, grants: {} },
  };
}
