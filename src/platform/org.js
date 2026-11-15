/**
 * The organisation document: the org's profile and settings, its people,
 * teams and public sites. Every plugin reads it (e.g. to assign staff to
 * workplans, or to theme a public site).
 *
 * {
 *   name, description, mission,
 *   contact: { email, phone, website, address },
 *   logo,                                  data URL or null, shown on public sites
 *   theme: { palette, shape },             see themes.js
 *   plugins: { [pluginId]: false | true }, a plugin is on unless switched off; newer optional ones are off unless switched on (true)
 *   staff: {id: Staff}, teams: {id: Team}, sites: {id: Site},
 * }
 *   Staff  { name, title, roleId, teamIds: [], email, avatar, interests: [strategy node ids] }
 *   Team   { name, color }
 *   Site   { name, url, visibility: 'public' | 'unlisted' | 'private', shows,
 *            look: { hero: 'band' | 'soft' | 'plain', type: 'sans' | 'serif' } }   how its pages are dressed (Public Portal)
 *   A private site is a members-only portal (the board, funders): staff and viewers who sign in see it.
 */
export const SITE_HEROES = [
  { id: 'band', label: 'Colour band', blurb: 'A band in your main colour behind the title' },
  { id: 'soft', label: 'Soft wash', blurb: 'A light tint that fades into the page' },
  { id: 'plain', label: 'Plain', blurb: 'Just the title on the page' },
];
export const SITE_TYPES = [
  { id: 'sans', label: 'Clean sans', blurb: 'The same type as the rest of Dashi' },
  { id: 'serif', label: 'Warm serif', blurb: 'Serif headings, for a bookish feel' },
];
export const siteLook = (site) => ({ hero: 'band', type: 'sans', ...(site?.look ?? {}) });
export const ROLES = [
  { id: 'admin', label: 'Admin', can: 'Manage the org, people, roles and what is public' },
  { id: 'lead', label: 'Lead', can: 'Edit plans and dashboards for their teams' },
  { id: 'staff', label: 'Staff', can: 'Edit their workplans and tasks, use sandboxes' },
  { id: 'viewer', label: 'Viewer', can: 'Read only, e.g. board members and funders' },
];

const STAFF = [
  ['s-ed', 'Amara Okafor', 'Executive Director', 'admin', ['t-lead'], ['obj-equity', 'obj-learn']],
  ['s-ops', 'Jordan Lee', 'Director of Operations', 'lead', ['t-lead', 't-ops']],
  ['s-prog', 'Priya Sharma', 'Director of Programs', 'lead', ['t-lead', 't-prog']],
  ['s-eval', 'Mateo Rivera', 'Evaluation & Learning Lead', 'lead', ['t-mel'], ['obj-learn']],
  ['s-data', 'Hana Kim', 'Data Analyst', 'staff', ['t-mel']],
  ['s-pc1', 'Owen Tremblay', 'Program Coordinator, West', 'staff', ['t-prog']],
  ['s-pc2', 'Leila Haddad', 'Program Coordinator, East', 'staff', ['t-prog']],
  ['s-indig', 'Tanis Cardinal', 'Indigenous Partnerships Manager', 'lead', ['t-prog', 't-part'], ['obj-equity', 'obj-ecosystem']],
  ['s-part', 'Ben Murphy', 'Partnerships & Funding Manager', 'staff', ['t-part']],
  ['s-comms', 'Sofia Rossi', 'Communications Officer', 'staff', ['t-part']],
  ['s-fin', 'Grace Chen', 'Finance & Admin', 'staff', ['t-ops']],
  ['s-train', 'Noah Bergeron', 'Instructor Training Lead', 'staff', ['t-prog']],
];

const TEAMS = [
  ['t-lead', 'Leadership', '#3d63dd'],
  ['t-prog', 'Programs', '#2a9d8f'],
  ['t-mel', 'Monitoring, Evaluation & Learning', '#7a4fb5'],
  ['t-part', 'Partnerships & Communications', '#b8860b'],
  ['t-ops', 'Operations', '#59607a'],
];

const staffRecords = (rows, domain) =>
  Object.fromEntries(rows.map(([id, name, title, roleId, teamIds, interests = []]) => [id, {
    id, name, title, roleId, teamIds, interests, avatar: null,
    email: `${name.split(' ')[0].toLowerCase()}@${domain}`,
  }]));

/** A microsite still in design: unlisted, with draft pages, so the Public Portal shows something in progress. */
const YOUTH_SITE = { id: 'site-youth', name: 'Youth voices', url: 'https://example.org/youth', visibility: 'unlisted', shows: 'Stories and data chosen by the Youth data advisory circle', look: { hero: 'soft', type: 'sans' } };

export function seedOrg() {
  return migrateOrg({
    id: 'org-example',
    name: 'Example STEM Outreach Network',
    description: 'A national network of university and college STEM outreach programs, reaching youth in every province and territory.',
    mission: 'Every young person in Canada can see themselves in STEM.',
    contact: { email: 'hello@example.org', phone: '+1 613 555 0100', website: 'https://example.org', address: '100 Example Street, Ottawa, ON K1A 0A1' },
    theme: { palette: 'corporate', shape: 'rounded' },
    staff: staffRecords(STAFF, 'example.org'),
    teams: Object.fromEntries(TEAMS.map(([id, name, color]) => [id, { id, name, color }])),
    youthSite: true,
    sites: {
      'site-main': { id: 'site-main', name: 'Public website', url: 'https://example.org', visibility: 'public', shows: 'Mission, programs, annual impact dashboard', look: { hero: 'band', type: 'serif' } },
      'site-impact': { id: 'site-impact', name: 'Impact dashboard', url: 'https://example.org/impact', visibility: 'public', shows: 'Reach, participation and equity KPIs' },
      'site-youth': YOUTH_SITE,
      'site-board': { id: 'site-board', name: 'Board portal', url: 'https://example.org/board', visibility: 'private', shows: 'Strategic plan progress, board documents, finances', look: { hero: 'soft', type: 'serif' } },
    },
  });
}

/** A second, smaller example org, to show the platform switching between orgs. */
export function seedRiverbend() {
  return migrateOrg({
    id: 'org-riverbend',
    name: 'Riverbend Community Food Hub',
    description: 'A neighbourhood food hub: a community kitchen, a good food box, and a youth growing program.',
    mission: 'Good food, grown and shared by our neighbours.',
    contact: { email: 'info@riverbend.example', phone: '+1 204 555 0142', website: 'https://riverbend.example', address: '12 Mill Road, Winnipeg, MB' },
    theme: { palette: 'garden', shape: 'flat' },
    plugins: { podcasts: false },
    staff: staffRecords([
      ['r-lead', 'Maya Desjardins', 'Coordinator', 'admin', ['t-hub']],
      ['r-kitchen', 'Sam Okoye', 'Kitchen Lead', 'staff', ['t-hub']],
      ['r-grow', 'Ivy Chen', 'Youth Growing Program', 'staff', ['t-grow']],
      ['r-vol', 'Luis Moreno', 'Volunteer Coordinator', 'lead', ['t-hub', 't-grow']],
    ], 'riverbend.example'),
    teams: { 't-hub': { id: 't-hub', name: 'Hub', color: '#2a9d8f' }, 't-grow': { id: 't-grow', name: 'Growing', color: '#b8860b' } },
    sites: { 'site-main': { id: 'site-main', name: 'Our numbers', url: 'https://riverbend.example/numbers', visibility: 'public', shows: 'Meals shared and boxes delivered' } },
  });
}

/** A new, empty org with one admin (the person creating it). */
export function blankOrg({ id, name, adminName = 'You' }) {
  return migrateOrg({
    id,
    name,
    staff: staffRecords([['s-admin', adminName, 'Admin', 'admin', []]], 'example.org'),
    sites: { 'site-main': { id: 'site-main', name: 'Public site', url: '', visibility: 'private', shows: '' } },
  });
}

/** Fill in fields added since a document was saved. */
export function migrateOrg(org) {
  org.description ??= '';
  org.mission ??= '';
  org.contact = { email: '', phone: '', website: '', address: '', ...org.contact };
  org.logo ??= null;
  org.theme = { palette: 'corporate', shape: 'rounded', ...org.theme };
  org.plugins ??= {};
  // Radio & Podcasts became Podcasts.
  if ('radio' in org.plugins) { org.plugins.podcasts ??= org.plugins.radio; delete org.plugins.radio; }
  // Critical Media is off unless an org switches it on; the STEM example has it on.
  if (org.id === 'org-example') org.plugins['critical-media'] ??= true;
  org.staff ??= {};
  org.teams ??= {};
  org.sites ??= {};
  if (org.id === 'org-example') {
    if (org.sites['site-main'] && !org.sites['site-main'].look) org.sites['site-main'].look = { hero: 'band', type: 'serif' };
    if (org.sites['site-board'] && !org.sites['site-board'].look) org.sites['site-board'].look = { hero: 'soft', type: 'serif' };
    if (!org.youthSite) { org.sites['site-youth'] ??= { ...YOUTH_SITE }; org.youthSite = true; }
  }
  for (const s of Object.values(org.sites)) s.look = siteLook(s);
  // The STEM example's board portal grew documents and a scorecard in alpha.6.
  if (org.id === 'org-example' && org.sites['site-board'] && org.sites['site-board'].shows === 'Strategic plan progress, finances') org.sites['site-board'].shows = 'Strategic plan progress, board documents, finances';
  for (const s of Object.values(org.staff)) {
    s.teamIds ??= [];
    s.interests ??= [];
    s.avatar ??= null;
    s.email ??= '';
  }
  return org;
}

export const pluginOn = (org, id) => !org.platform?.paused?.[id] && org.plugins?.[id] !== false;
export const initials = (name = '?') => name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const staffList = (org) => Object.values(org.staff).sort((a, b) => a.name.localeCompare(b.name));
export const teamList = (org) => Object.values(org.teams).sort((a, b) => a.name.localeCompare(b.name));
export const membersOf = (org, teamId) => staffList(org).filter((s) => s.teamIds.includes(teamId));
