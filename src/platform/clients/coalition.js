/**
 * Shared Ground: the example Place project (d, 2026-11-27). A made-up,
 * nation-wide coalition with a hub org: Shared Ground Canada, in Winnipeg,
 * backs six regional hubs and about forty local tables in real Canadian
 * places, working in four networks. The places are real; the coalition, its
 * tables, people and numbers are made up. No real organisation is named as a
 * member, and no First Nation is shown as one: a real coalition adds Nations
 * only as they choose, on their own terms (OCAP).
 *
 * It shows what Place does for a coalition: a drawn map of Canada, regions,
 * the hub, a data layer per network, a public members site around the map
 * (Web), a page per local table, and join and "Is this right?" forms.
 */
import { migrateOrg } from '../org.js';
import { migratePlace } from '../../place/model.js';
import { CANADA_MAP } from '../../place/basemaps.js';
import { migratePages } from '../pages.js';

/** The coalition's four networks; each is a data layer on the map. */
export const COALITION_NETWORKS = [
  { id: 'food', name: 'Food Security', colour: 'green', about: 'Tables that grow, share and plan food together: community gardens, food hubs, school meals and the policies behind them.' },
  { id: 'housing', name: 'Homes for All', colour: 'blue', about: 'Tables working with tenants, builders and councils on homes people can afford, and on keeping people housed.' },
  { id: 'climate', name: 'Climate Ready', colour: 'teal', about: 'Tables getting ready for floods, fire, heat and storms, neighbour by neighbour, and cutting emissions where they live.' },
  { id: 'rural', name: 'Rural and Northern Futures', colour: 'orange', about: 'Small towns and northern communities sharing what works when the nearest city is hours away.' },
];

const P = { NL: 'Newfoundland and Labrador', PE: 'Prince Edward Island', NS: 'Nova Scotia', NB: 'New Brunswick', QC: 'Quebec', ON: 'Ontario', MB: 'Manitoba', SK: 'Saskatchewan', AB: 'Alberta', BC: 'British Columbia', YT: 'Yukon', NT: 'Northwest Territories', NU: 'Nunavut' };

/** The six regions, each with its regional hub city: [id, name, provinces, hub community, label point]. */
const REGIONS = [
  ['pacific', 'Pacific', ['BC'], 'vancouver', [53.5, -124.5]],
  ['prairies', 'Prairies', ['AB', 'SK', 'MB'], 'saskatoon', [53.8, -106.5]],
  ['north', 'North', ['YT', 'NT', 'NU'], 'yellowknife', [64.5, -118]],
  ['ontario', 'Ontario', ['ON'], 'sudbury', [50.5, -86]],
  ['quebec', 'Québec', ['QC'], 'quebec-city', [52.5, -72]],
  ['atlantic', 'Atlantic', ['NB', 'NS', 'PE', 'NL'], 'moncton', [48.6, -60.5]],
];

/** Local tables: [id, place name, province, lat, lng, networks, year joined]. */
const TABLES = [
  ['st-johns', 'St. John’s', 'NL', 47.56, -52.71, ['food', 'climate'], 2021],
  ['corner-brook', 'Corner Brook', 'NL', 48.95, -57.95, ['rural'], 2023],
  ['halifax', 'Halifax', 'NS', 44.65, -63.57, ['housing', 'climate'], 2019],
  ['new-glasgow', 'New Glasgow', 'NS', 45.59, -62.65, ['food', 'rural'], 2022],
  ['sydney', 'Sydney', 'NS', 46.14, -60.19, ['housing', 'rural'], 2024],
  ['charlottetown', 'Charlottetown', 'PE', 46.24, -63.13, ['food'], 2020],
  ['fredericton', 'Fredericton', 'NB', 45.96, -66.64, ['climate'], 2021],
  ['moncton', 'Moncton', 'NB', 46.09, -64.78, ['housing', 'food'], 2018],
  ['caraquet', 'Caraquet', 'NB', 47.79, -64.94, ['rural', 'climate'], 2023],
  ['quebec-city', 'Québec', 'QC', 46.81, -71.21, ['housing', 'climate'], 2018],
  ['montreal', 'Montréal', 'QC', 45.5, -73.57, ['housing', 'food', 'climate'], 2018],
  ['laval', 'Laval', 'QC', 45.57, -73.69, ['food'], 2022],
  ['sherbrooke', 'Sherbrooke', 'QC', 45.4, -71.89, ['climate'], 2021],
  ['rimouski', 'Rimouski', 'QC', 48.45, -68.52, ['rural', 'food'], 2024],
  ['gatineau', 'Gatineau', 'QC', 45.48, -75.7, ['housing'], 2020],
  ['ottawa', 'Ottawa', 'ON', 45.42, -75.69, ['housing', 'climate'], 2019],
  ['kingston', 'Kingston', 'ON', 44.23, -76.49, ['food'], 2021],
  ['toronto', 'Toronto', 'ON', 43.65, -79.38, ['housing', 'food', 'climate'], 2018],
  ['hamilton', 'Hamilton', 'ON', 43.26, -79.87, ['housing'], 2020],
  ['kitchener', 'Kitchener', 'ON', 43.45, -80.49, ['food', 'climate'], 2019],
  ['london', 'London', 'ON', 42.98, -81.25, ['housing', 'climate'], 2020],
  ['windsor', 'Windsor', 'ON', 42.31, -83.04, ['food'], 2023],
  ['collingwood', 'Collingwood', 'ON', 44.5, -80.22, ['climate', 'rural'], 2022],
  ['sudbury', 'Sudbury', 'ON', 46.49, -80.99, ['rural', 'housing'], 2019],
  ['thunder-bay', 'Thunder Bay', 'ON', 48.38, -89.25, ['rural', 'food'], 2020],
  ['kenora', 'Kenora', 'ON', 49.77, -94.49, ['rural'], 2025],
  ['winnipeg', 'Winnipeg', 'MB', 49.9, -97.14, ['housing', 'food'], 2018],
  ['brandon', 'Brandon', 'MB', 49.85, -99.95, ['rural', 'food'], 2022],
  ['thompson', 'Thompson', 'MB', 55.74, -97.86, ['rural'], 2024],
  ['regina', 'Regina', 'SK', 50.45, -104.61, ['climate', 'food'], 2021],
  ['saskatoon', 'Saskatoon', 'SK', 52.13, -106.67, ['housing', 'food'], 2019],
  ['prince-albert', 'Prince Albert', 'SK', 53.2, -105.75, ['rural'], 2023],
  ['calgary', 'Calgary', 'AB', 51.05, -114.07, ['housing', 'climate'], 2019],
  ['edmonton', 'Edmonton', 'AB', 53.55, -113.49, ['housing', 'food'], 2018],
  ['lethbridge', 'Lethbridge', 'AB', 49.69, -112.84, ['climate', 'rural'], 2022],
  ['grande-prairie', 'Grande Prairie', 'AB', 55.17, -118.8, ['rural'], 2024],
  ['vancouver', 'Vancouver', 'BC', 49.28, -123.12, ['housing', 'climate'], 2018],
  ['victoria', 'Victoria', 'BC', 48.43, -123.37, ['housing', 'food'], 2020],
  ['kelowna', 'Kelowna', 'BC', 49.89, -119.5, ['climate'], 2021],
  ['nelson', 'Nelson', 'BC', 49.49, -117.29, ['climate', 'rural'], 2022],
  ['prince-george', 'Prince George', 'BC', 53.92, -122.75, ['rural', 'food'], 2023],
  ['whitehorse', 'Whitehorse', 'YT', 60.72, -135.06, ['rural', 'climate'], 2021],
  ['yellowknife', 'Yellowknife', 'NT', 62.45, -114.37, ['rural', 'food'], 2020],
  ['iqaluit', 'Iqaluit', 'NU', 63.75, -68.52, ['food', 'housing'], 2025],
];

const WHAT = {
  food: 'a food table (gardens, a food hub, school meals)',
  housing: 'a housing roundtable with tenants and the council',
  climate: 'a climate-ready group (heat, floods, fire)',
  rural: 'a rural and northern circle',
};

export const COALITION_COLOURS = {
  primary: '#2f6b3a', 'primary-content': '#ffffff',
  secondary: '#1f7a8c', 'secondary-content': '#ffffff',
  accent: '#e3a33b', 'accent-content': '#2b1a05',
  neutral: '#1d2b22', 'neutral-content': '#eef4ef',
  'base-100': '#ffffff', 'base-200': '#f3f6f2', 'base-300': '#e1e8df', 'base-content': '#1d2b22',
};

/* ---------------------------------------------------------------- the members site (Web) */
export const COALITION_SITE = {
  id: 'site-members', name: 'Shared Ground', url: 'https://sharedground.example', visibility: 'public',
  shows: 'The coalition on one map, a page for every local table, and how to join',
  home: { kind: 'page', slug: 'home' },
  look: { template: 'harbour', masthead: { preset: 'canopy', image: null, height: 'm', focus: 50 }, type: 'sans', header: 'over' },
};

export function coalitionOrg() {
  return migrateOrg({
    id: 'org-coalition',
    name: 'Shared Ground Canada',
    description: 'The hub of the Shared Ground coalition: six regional hubs and more than forty local tables across Canada, working on food, homes, climate and rural futures. A made-up example for Place.',
    mission: 'Local tables across Canada, learning from each other and acting together on what their communities need.',
    contact: { email: '', phone: '', website: 'https://sharedground.example', address: 'Winnipeg, MB' },
    theme: { palette: 'custom', base: 'light', shape: 'rounded', colors: COALITION_COLOURS },
    plugins: { place: true, rhizome: true, graph: true, podcasts: false },
    staff: {
      'c-director': { id: 'c-director', name: 'Rosa Delorme', title: 'Executive director, the hub', roleId: 'admin', teamIds: ['t-hub'], interests: [], email: '', avatar: null },
      'c-networks': { id: 'c-networks', name: 'Sam Okonkwo', title: 'Networks lead', roleId: 'lead', teamIds: ['t-hub'], interests: [], email: '', avatar: null },
      'c-regions': { id: 'c-regions', name: 'Élise Tremblay', title: 'Regional hubs coordinator', roleId: 'staff', teamIds: ['t-hub'], interests: [], email: '', avatar: null },
      'c-learning': { id: 'c-learning', name: 'Jordan Pike', title: 'Learning and evaluation', roleId: 'staff', teamIds: ['t-hub'], interests: [], email: '', avatar: null },
    },
    teams: { 't-hub': { id: 't-hub', name: 'The hub', color: '#2f6b3a' } },
    sites: { [COALITION_SITE.id]: COALITION_SITE },
  });
}

const r2 = (v) => Math.round(v * 100) / 100;
const regionOf = (prov) => REGIONS.find(([, , provs]) => provs.includes(prov));

/** The map: regions, the hub, every local table as a community, a data layer per network and one for the regional hubs. */
export function coalitionPlace() {
  const places = {};
  for (const [id, name, provs, hub] of REGIONS) {
    const at = REGIONS.find((r) => r[0] === id)[4];
    places[`region-${id}`] = { id: `region-${id}`, name, kind: 'region', geo: { lat: at[0], lng: at[1] }, description: `The ${name} region (${provs.map((p) => P[p]).join(', ')}). Its regional hub is in ${TABLES.find((t) => t[0] === hub)[1]}.`, tags: ['region'] };
  }
  const hubs = new Set(REGIONS.map((r) => r[3]));
  for (const [id, name, prov, lat, lng, nets, year] of TABLES) {
    const region = regionOf(prov);
    places[id] = {
      id, name, kind: 'community', geo: { lat, lng }, within: `region-${region[0]}`,
      description: `Shared Ground ${name} joined in ${year}: ${nets.map((n) => WHAT[n]).join('; ')}.${hubs.has(id) ? ` It is the ${region[1]} regional hub.` : ''}`,
      tags: nets.map((n) => COALITION_NETWORKS.find((x) => x.id === n).name.toLowerCase()),
    };
  }
  places.hub = { id: 'hub', name: 'Shared Ground Canada (the hub)', kind: 'landmark', geo: { lat: 49.9, lng: -97.14 }, within: 'region-prairies', description: 'The coalition’s hub in Winnipeg: a small team that backs the regional hubs, runs the networks, and keeps the map.', tags: ['hub'] };

  const feature = (t, props) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [r2(t[4]), r2(t[3])] }, properties: { name: t[1], province: P[t[2]], ...props } });
  const data = {};
  for (const n of COALITION_NETWORKS) {
    const id = `data-${n.id}`;
    const members = TABLES.filter((t) => t[5].includes(n.id));
    data[id] = {
      id, name: n.name, colour: n.colour, on: true, source: 'geojson', addedAt: '2026-11-27', public: true, group: n.id,
      note: `${members.length} local tables in ${n.name}. Made-up example data.`,
      features: members.map((t) => feature(t, { organisations: `Shared Ground ${t[1]}: ${WHAT[n.id]}`, joined: String(t[6]), basis: `member since ${t[6]}`, region: regionOf(t[2])[1] })),
    };
  }
  data['data-regional-hubs'] = {
    id: 'data-regional-hubs', name: 'Regional hubs', colour: 'violet', on: true, source: 'geojson', addedAt: '2026-11-27', public: true, group: 'hubs',
    note: 'The six regional hubs: each backs the tables in its region.',
    features: REGIONS.map(([, name, , hub]) => feature(TABLES.find((t) => t[0] === hub), { organisations: `Shared Ground ${name} regional hub`, basis: 'regional hub', region: name })),
  };
  return migratePlace({
    basemap: 'drawn',
    drawn: CANADA_MAP,
    view: { lat: 57, lng: -96, zoom: 2.8, labelZoom: 4.6, siteZoom: 7, placeZoom: 7, regionZoom: 4.5 },
    places, pins: {}, data,
    // The members site shows the map: places and the public layers, never pins.
    publicMap: true,
    layers: { areas: { on: true }, links: { on: false }, serves: { on: false }, places: { on: true }, actors: { on: false }, assets: { on: false } },
  });
}

const SITE_AT = '2026-11-27';
const sitePage = (id, title, summary, body, more = {}) => [id, {
  id, kind: 'page', siteId: COALITION_SITE.id, title, slug: more.slug ?? title.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, ''), summary, body, cover: null,
  status: 'published', publishedAt: SITE_AT, authorId: null, inNav: true, order: 0, ...more,
}];

export function coalitionPages() {
  const page = (slug) => `?site=${COALITION_SITE.id}&page=${slug}`;
  const count = (id) => TABLES.filter((t) => t[5].includes(id)).length;
  const netPage = (n, i) => sitePage(`pg-c-${n.id}`, n.name, n.about, `${n.about}

[[map:${n.id}]]

${count(n.id)} local tables are in ${n.name}. Each one is a page: click its dot, or find it in the list under the map.`, { order: 1 + i, slug: n.id });
  return migratePages({ id: 'pages', pages: Object.fromEntries([
    sitePage('pg-c-home', 'Shared Ground', 'Local tables across Canada, acting together.', `## Find your table, find your peers

Shared Ground is a coalition of ${TABLES.length} local tables, six regional hubs and one small hub in Winnipeg. Each table works on what its community needs, and learns from tables doing the same thing elsewhere. Click a dot to see a table’s networks and its page; the colours are the networks it’s in.

[[map:place]]

## The networks

${COALITION_NETWORKS.map((n) => `- **[${n.name}](${page(n.id)})**: ${n.about} ${count(n.id)} tables.`).join('\n')}

## Regional hubs

Six regional hubs (${REGIONS.map((r) => r[1]).join(', ')}) back the tables near them. [See them on the map](${page('regional-hubs')}).

## Start a table

No table near you yet? [Tell us](${page('join')}), and your regional hub will be in touch.`, { slug: 'home', inNav: false, order: -1 }),
    sitePage('pg-c-map', 'The map', 'Every local table, by network.', `Each dot is a local table; its colours are the networks it’s in. Click one for its page.

[[map:place]]

Tables show here; people never do, unless they choose to.`, { order: 0 }),
    ...COALITION_NETWORKS.map(netPage),
    sitePage('pg-c-hubs', 'Regional hubs', 'Six hubs that back the tables near them.', `Each region has a hub: a table that hosts gatherings, shares what works, and helps new tables start.

[[map:hubs]]`, { order: 6, slug: 'regional-hubs', inNav: false }),
    sitePage('pg-c-join', 'Join or start a table', 'Join a network, start a table, or put your listing right.', `A minute, and your regional hub will be in touch. Only the coalition sees what you send.

[[form:form-c-join]]`, { order: 7, slug: 'join' }),
  ]) });
}

const q = (id, kind, text, more = {}) => ({ id, kind, text, options: [], required: false, help: '', ...more });
/** The join form (on the Join page) and "Is this right?" (on every community page). */
export function coalitionForms() {
  return {
    'form-c-join': {
      id: 'form-c-join', title: 'Join or start a table', intro: 'Tell us where you are and what you’d like to work on.',
      thanks: 'Thank you. Your regional hub will be in touch within two weeks.', visibility: 'public', siteId: COALITION_SITE.id, place: 'join', createdAt: SITE_AT,
      style: { layout: 'card', button: 'Send' },
      questions: [
        q('q-why', 'choice', 'What would you like to do?', { required: true, options: ['Join a network', 'Start a table', 'Correct our listing', 'Something else'] }),
        q('q-community', 'text', 'Your community', { required: true, placeholder: 'Town, city or region' }),
        q('q-org', 'text', 'Your group, if you have one'),
        q('q-nets', 'multi', 'Which networks?', { options: COALITION_NETWORKS.map((n) => n.name) }),
        q('q-more', 'long', 'Anything else we should know?'),
        q('q-email', 'text', 'Email, so we can reply', { help: 'Only the coalition sees this. It never shows on the site.' }),
      ],
    },
    'form-c-check': {
      id: 'form-c-check', title: 'Is this right?', intro: 'Help keep the map true: tell us if anything on this page is wrong or missing.',
      thanks: 'Thank you. We’ll check and update the page.', visibility: 'public', siteId: COALITION_SITE.id, place: 'community', createdAt: SITE_AT,
      style: { layout: 'plain', button: 'Send' },
      questions: [q('q-right', 'yesno', 'Is this page right?'), q('q-fix', 'long', 'What should change?')],
    },
  };
}

export function coalitionDocs() {
  return {
    org: coalitionOrg(), place: coalitionPlace(), pages: coalitionPages(),
    dashboards: { id: 'dashboards', dashboards: {}, calculators: {}, stories: {}, forms: coalitionForms(), reports: {}, grants: {} },
  };
}
