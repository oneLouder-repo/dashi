/**
 * The plugins: the tools an org can switch on for its dashboard. A plugin
 * is a page (an .html file) plus its modules. To add one, make the page,
 * then add an entry here; it shows up on the dashboard, in the header and
 * in Organisation settings, where an org can switch it off.
 *
 * `short` is its label in the header, beside its icon.
 * `tone` is the plugin's own colour: its icon in the header, and the
 * buttons, links and highlights on its pages.
 * `core: true` plugins can't be switched off.
 * `stats(docs)` returns a short line for the dashboard card from the
 * loaded documents (see platform/docs.js loadAll).
 * `owns` are the documents only this plugin changes; `reads` the ones it
 * may read but never change. The server enforces both (platform/access.js):
 * someone who can't use a plugin never gets its documents beyond what the
 * public site shows. `parent` makes a sub-plugin: it lives inside its
 * parent and is only usable when the parent is.
 */
import { chosenBy, orgHas, canUse, usable } from './platform/access.js';

const count = (o) => Object.keys(o ?? {}).length;

/** The built-in plugins' tones before the alpha 0.3 colour wheel. */
const LEGACY_TONES = new Set(['#13897a', '#0f7f9c', '#3d63dd', '#7a4cc4', '#c25a14', '#c03a64', '#7a5a2f', '#2f6f8f', '#3a8a3f']);

export const PLUGINS = [
  {
    id: 'mapper',
    owns: ['maps', 'map/*'],
    reads: ['library'],
    short: 'Ecosystem',
    tone: '#3e8fa6',
    name: 'Ecosystem',
    href: 'mapper.html',
    icon: 'sec-mapper',
    blurb: 'Map the actors, agents, relationships and feedback loops in your change ecosystem, through five systems lenses.',
    stats: ({ maps, mapContents }) => {
      const actors = Object.values(mapContents ?? {}).reduce((n, m) => n + count(m.actors), 0);
      return `${count(maps?.maps)} maps · ${actors} actors`;
    },
  },
  {
    id: 'assets',
    owns: ['assets'],
    reads: ['maps', 'map/*', 'library', 'strategy', 'dashboards'],
    short: 'Assets',
    tone: '#2c4fa3',
    name: 'Assets',
    href: 'assets.html',
    icon: 'sec-assets',
    blurb: 'Everything your organisation has to work with, in one place: files, maps, people, stories and places, filed in collections, tagged, and seen through an asset-based (ABCD) lens.',
    stats: ({ assets }) => {
      const items = Object.values(assets?.items ?? {});
      return `${items.filter((i) => i.kind !== 'ref').length} files, links and notes · ${Object.keys(assets?.collections ?? {}).length} collections`;
    },
  },
  {
    id: 'strategy',
    owns: ['strategy', 'plandocs'],
    reads: ['maps', 'map/*', 'data', 'dashboards', 'library', 'assets'],
    short: 'Strategy',
    tone: '#7b2fe8',
    name: 'Strategy & Work',
    href: 'strategy.html',
    icon: 'sec-strategy',
    blurb: 'From mission and vision to plans, objectives, goals, workplans and tasks, with Gantt charts and task timelines.',
    stats: ({ strategy }) => {
      const nodes = Object.values(strategy.nodes);
      const open = nodes.filter((n) => n.type === 'task' && n.status !== 'done').length;
      return `${nodes.filter((n) => n.type === 'plan').length} plans · ${nodes.filter((n) => n.type === 'workplan').length} workplans · ${open} open tasks`;
    },
  },
  {
    id: 'studio',
    parent: 'strategy',
    owns: ['studio'],
    reads: ['strategy', 'plandocs', 'maps', 'map/*', 'library'],
    short: 'Studio',
    tone: '#b05bd8',
    name: 'Planning Studio',
    href: 'studio.html',
    icon: 'sec-studio',
    blurb: 'Facilitate strategic planning online: a shared SOAR whiteboard, a canvas for wiring ideas into objectives and goals, a theory of change with its assumptions and evidence, and a results framework.',
    stats: ({ studio }) => `${Object.keys(studio?.plans ?? {}).length} plans in the studio · ${Object.keys(studio?.cards ?? {}).length} SOAR cards`,
  },
  {
    id: 'palette',
    parent: 'pages',
    owns: ['dashboards', 'data', 'feedback'],
    reads: ['strategy', 'plandocs', 'library'],
    short: 'Data',
    tone: '#ef7f2d',
    name: 'Data Workbench',
    href: 'palette.html',
    icon: 'sec-data',
    blurb: 'Mini-tools for bringing others into the data dialogue: design dashboards from your strategy, keep program data current, and publish to public sites.',
    stats: ({ dashboards }) => {
      const list = Object.values(dashboards?.dashboards ?? {});
      return `${list.length} dashboards · ${list.filter((d) => d.visibility === 'public' && d.siteId).length} published`;
    },
  },
  {
    id: 'podcasts',
    owns: ['podcasts'],
    reads: [],
    short: 'Podcasts',
    tone: '#c8432f',
    name: 'Podcasts',
    href: 'podcasts.html',
    icon: 'sec-podcasts',
    blurb: 'Your own podcast station: shows organised by season, uploaded .mp3 or .wav episodes, featured shows, RSS feeds, and a public station page skinned to your look.',
    stats: ({ podcasts }) => {
      const shows = Object.values(podcasts?.podcasts ?? {});
      return `${shows.length} shows · ${shows.filter((s) => s.featured).length} featured · ${Object.values(podcasts?.episodes ?? {}).filter((e) => e.status === 'published').length} episodes`;
    },
  },
  {
    id: 'library',
    parent: 'assets',
    owns: ['library'],
    reads: ['maps', 'map/*', 'strategy', 'plandocs', 'data'],
    short: 'Library',
    tone: '#e35a2c',
    name: 'Library',
    href: 'library.html',
    icon: 'sec-library',
    blurb: 'Your documents in one place: files with proper references, Dashi docs written and exported to Word or PDF, and annotated bibliographies with weekly briefs.',
    stats: ({ library }) => {
      const items = Object.values(library?.items ?? {});
      return `${items.length} documents · ${items.filter((d) => d.kind === 'doc').length} Dashi docs · ${Object.keys(library?.bibs ?? {}).length} bibliographies`;
    },
  },
  {
    id: 'graph',
    parent: 'assets',
    owns: ['graph'],
    // The same as Assets reads, so the graph never opens a door Assets keeps shut.
    reads: ['assets', 'maps', 'map/*', 'library', 'strategy', 'dashboards'],
    short: 'Graph',
    tone: '#e0705f',
    name: 'Asset Graph',
    href: 'graph.html',
    icon: 'sec-graph',
    experimental: true,
    blurb: 'Experimental: your assets, people, maps and strategy as one web of linked facts. Search it for fun, find who bridges groups, and export it as linked data.',
    stats: ({ assets }) => `${Object.keys(assets?.items ?? {}).length} assets linked in · experimental`,
  },
  {
    id: 'rhizome',
    owns: ['rhizome'],
    // It reads across the org to find links between things; it never changes another plugin's documents.
    reads: ['maps', 'map/*', 'assets', 'library', 'strategy', 'studio', 'podcasts', 'graph'],
    short: 'Rhizome',
    tone: '#5f8f3e',
    name: 'Rhizome',
    href: 'rhizome.html',
    icon: 'sec-rhizome',
    experimental: true,
    // Off until an org switches it on, which starts its set-up run.
    defaultOff: true,
    blurb: 'Experimental: a systems analysis toolbox. Reads your maps, strategy, studio and assets as one set of facts, measures the links between them, and (soon) offers tips you can build on, like a modular synth.',
    stats: ({ rhizome }) => (rhizome?.setup?.calibrate ? `Set up · baseline ${String(rhizome.baseline?.at ?? '').slice(0, 10)}` : 'Not set up yet · experimental'),
  },
  {
    id: 'pages',
    owns: ['pages'],
    reads: ['dashboards', 'data', 'plandocs', 'strategy', 'library'],
    short: 'Portal',
    tone: '#4da65c',
    name: 'Public Portal',
    href: 'pages.html',
    icon: 'sec-sites',
    blurb: 'One way in to everything you show outside: public sites, dashboards, your plan, podcasts, pages and news, plus members-only portals for your board.',
    stats: ({ pages }) => {
      const list = Object.values(pages?.pages ?? {});
      return `${list.filter((p) => p.kind === 'page').length} pages · ${list.filter((p) => p.kind === 'article').length} articles · ${list.filter((p) => p.status === 'draft').length} drafts`;
    },
  },
  {
    id: 'social',
    parent: 'pages',
    owns: ['social'],
    reads: ['pages', 'data', 'strategy', 'dashboards'],
    short: 'Social',
    tone: '#c77deb',
    name: 'Social Media Integrator',
    href: 'social.html',
    icon: 'share',
    experimental: true,
    blurb: 'Experimental: make posts from your episodes, blog posts, data and dashboards, fit them to each network, schedule them and push them to Instagram, Facebook, TikTok, YouTube and more (pretend pushes in this alpha).',
    stats: ({ social }) => { const ps = Object.values(social?.posts ?? {}); return `${ps.filter((p) => p.status === 'scheduled').length} scheduled · ${ps.filter((p) => p.status === 'posted').length} posted · experimental`; },
  },
  {
    id: 'org',
    owns: ['org'],
    reads: [],
    tone: '#56657f',
    name: 'Organisation',
    href: 'org.html',
    icon: 'sec-org',
    core: true,
    nav: false,
    blurb: 'Your profile, people and their roles, teams, plugins, plan and domain.',
    stats: ({ org }) => `${count(org.staff)} staff · ${count(org.teams)} teams · ${Object.values(org.sites).filter((s) => s.visibility === 'public').length} public sites`,
  },
  {
    id: 'help',
    tone: '#56657f',
    name: 'Help',
    href: 'help.html',
    icon: 'sec-help',
    core: true,
    nav: false,
    blurb: 'How the platform fits together, how the systems lenses line up, and the data model.',
    stats: () => 'Guides and diagrams',
  },
];

/** The built-in plugins as they ship, before the platform admin's changes (Platform admin → Plugins). */
export const BUILT_IN_PLUGINS = PLUGINS.map((p) => ({ ...p }));

/**
 * Apply the platform's plugin registry (src/platform/pluginRegistry.js,
 * sent with the session): each plugin's name, look and status as the
 * platform admin set them, plus plugins installed from a package. Changes
 * PLUGINS in place, so every page that reads it follows.
 */
let registry = {};
export function applyRegistry(view) {
  if (!view || typeof view !== 'object') return;
  registry = view;
  for (const m of Object.values(view)) {
    let p = PLUGINS.find((x) => x.id === m.id);
    if (!p) {
      if (m.builtIn) continue;
      p = { id: m.id, href: `plugin.html?id=${encodeURIComponent(m.id)}`, installed: true, stats: () => m.version ? `Version ${m.version}` : '' };
      // Installed plugins go after the built-in ones, before Organisation and Help.
      const at = PLUGINS.findIndex((x) => x.core);
      PLUGINS.splice(at < 0 ? PLUGINS.length : at, 0, p);
    }
    Object.assign(p, {
      name: m.name ?? p.name, short: m.short ?? p.short, blurb: m.blurb ?? p.blurb,
      // Tones saved before the alpha 0.3 colour wheel give way to the built-in plugin's new one.
      tone: (m.builtIn || !p.installed) && LEGACY_TONES.has(String(m.tone).toLowerCase()) ? p.tone : m.tone ?? p.tone, icon: m.icon ?? p.icon, version: m.version, category: m.category,
      platformOff: !p.core && m.status !== 'installed',
      // A built-in plugin that ships switched off (Rhizome) stays that way whatever the registry says.
      defaultOff: !!m.defaultOff || !!BUILT_IN_PLUGINS.find((b) => b.id === p.id && !p.installed)?.defaultOff,
      features: m.featureList ?? [],
      ...(p.installed ? { owns: (m.dataModel?.docs ?? []).map((d) => d.name).filter(Boolean), parent: m.parent ?? null } : {}),
    });
  }
}
/** Is a plugin's feature switched on (by the platform admin, for this org's plan)? Unknown features are on. */
export function featureOn(pluginId, featureId, tier = null) {
  const m = registry[pluginId];
  if (!m || m.features?.[featureId] == null) return true;
  if (!m.features[featureId]) return false;
  return !tier || m.featurePlans?.[featureId]?.[tier] !== false;
}

/** Paused by the platform admin (hosted only): the org can't switch it on itself. */
export const pausedForOrg = (org, id) => !!org.platform?.paused?.[id];
/**
 * Has the org chosen this plugin? Most plugins are on until switched off;
 * a `defaultOff` plugin (the newer, optional ones) is off until switched on.
 */
export const chosenByOrg = chosenBy;
/** The plugins this org has switched on for everyone (and the platform hasn't paused), parents included. */
export const orgPlugins = (org) => PLUGINS.filter((p) => orgHas(PLUGINS, org, p.id));

/**
 * Plugins by role and by person: each role's palette of tools, plus
 * per-person exceptions. `org.pluginRoles` = { [pluginId]: { [roleId]: false } };
 * `org.pluginPeople` = { [pluginId]: { [staffId]: true | false } }, which
 * wins over the role. The same rules run on the server (platform/access.js),
 * which enforces them on every document; here they decide what is shown.
 */
export const roleHas = (org, pluginId, roleId) => {
  const p = PLUGINS.find((x) => x.id === pluginId);
  if (!roleId || p?.core) return true;
  return org.pluginRoles?.[pluginId]?.[roleId] !== false;
};
/** Who the page is for: set once by the session (platform/session.js), so this file needs no import of it. */
let whoOf = () => ({ role: null, staffId: null });
export const setWhoResolver = (fn) => { whoOf = fn; };
/** Older callers give only a role. */
export const setRoleResolver = (fn) => { whoOf = (org) => ({ role: fn(org), staffId: null }); };
export const currentWho = (org) => whoOf(org) ?? {};
export const currentRole = (org) => currentWho(org).role ?? null;
/** The plugins the signed-in person sees: the org's, less any switched off for their role or for them. */
export const enabledPlugins = (org, roleId) => usable(PLUGINS, org, roleId === undefined ? currentWho(org) : { role: roleId, staffId: null });
/** Can the signed-in person use this plugin (and its parent)? */
export const canOpen = (org, id) => canUse(PLUGINS, org, id, currentWho(org));
/** Is this plugin on for the org, whoever is looking (a public site, an admin screen)? */
export const orgUses = (org, id) => orgHas(PLUGINS, org, id);

/**
 * A link into a plugin, or null when the signed-in person can't use it, so
 * a menu item or link to it is simply not drawn (an <a> with no href is
 * plain text). Every cross-plugin link goes through here; test/links.test.js
 * fails on any page that hard-codes another plugin's address. `route` is the
 * part after the page: '#look', '?id=x' or ''. The org is the open one
 * (platform/docs.js sets it as it loads); with none yet, the link is given.
 */
let linkOrg = null;
export const setLinkOrg = (org) => { linkOrg = org; };
/** Pages of a plugin beyond its main one: linkTo('plandoc') opens the Plan designer, gated on Strategy & Work. */
export const PAGES = { plandoc: { plugin: 'strategy', href: 'plandoc.html' } };
export function linkTo(id, route = '', org = linkOrg) {
  const page = PAGES[id];
  const p = PLUGINS.find((x) => x.id === (page?.plugin ?? id));
  if (!p) return null;
  if (org && !canOpen(org, p.id)) return null;
  return `${page?.href ?? p.href}${route}`;
}
/** Can the signed-in person open this plugin (the open org)? For deciding whether to show a whole menu item or card. */
export const reach = (id, org = linkOrg) => (org ? canOpen(org, id) : true);

/** Each page's colour: a plugin's tone, or Dashi's own for the dashboard and the rest. */
export const DASHI_TONE = '#d0621b';
export const toneFor = (id) => PLUGINS.find((p) => p.id === id)?.tone ?? DASHI_TONE;
/** The top-level plugin a page belongs to: a sub-plugin's parent (Data Workbench → Public Portal), else itself. */
export const topOf = (id) => { let p = PLUGINS.find((x) => x.id === id); while (p?.parent) p = PLUGINS.find((x) => x.id === p.parent) ?? null; return p?.id ?? id; };
