/**
 * The plugin registry: every plugin the platform knows, described by a
 * manifest the platform admin can edit, version and ship (Platform admin →
 * Plugins). Shared by the server (which stores and enforces it) and the
 * pages (which draw the header, dashboard and settings from it).
 *
 *   Manifest {
 *     id, name, short, version ('1.2.0'), status: 'installed' | 'disabled' | 'draft',
 *     builtIn (ships with Dashi; can be reset, not removed), core (always on),
 *     category, blurb, href, author, homepage,
 *     look: { tone ('#3e8fa6'), icon (an icon name), accent ('soft' | 'solid') },
 *     features: [{ id, label, description, enabled, plans: { free, basic, standard, custom } }],
 *     dataModel: { docs: [{ name, label, description, collections: [{ id, label, fields: [{ id, label, type, required, options }] }] }] },
 *     plans: { free, basic, standard, custom }   (installed plugins only; built-ins follow Platform admin → Plans)
 *     changelog: [{ version, date, notes, by }],
 *   }
 *
 * The stored registry keeps only what differs from the built-in defaults,
 * plus whole manifests for plugins installed from a package, and a few
 * earlier versions of each (history) so an update can be rolled back.
 */
import { BUILT_IN_PLUGINS } from '../plugins.js';

export const STATUSES = [
  { id: 'installed', label: 'Installed', hint: 'Available to organisations (as their plan allows).' },
  { id: 'disabled', label: 'Switched off', hint: 'Hidden everywhere. Content is kept.' },
  { id: 'draft', label: 'In development', hint: 'Only you see it, in the designer and its preview.' },
];
export const CATEGORIES = ['Mapping', 'Planning', 'Data', 'Media', 'Knowledge', 'Learning', 'Publishing', 'AI', 'Platform', 'Other'];
export const FIELD_TYPES = [
  { id: 'text', label: 'Text' },
  { id: 'longtext', label: 'Long text' },
  { id: 'number', label: 'Number' },
  { id: 'date', label: 'Date' },
  { id: 'boolean', label: 'Yes / no' },
  { id: 'select', label: 'Choice' },
  { id: 'person', label: 'Person (staff)' },
  { id: 'reference', label: 'Link to a record' },
  { id: 'url', label: 'Web address' },
  { id: 'list', label: 'List' },
];
export const TIERS = ['free', 'basic', 'standard', 'custom'];
const ALL_TIERS = { free: true, basic: true, standard: true, custom: true };

const f = (id, label, type = 'text', extra = {}) => ({ id, label, type, ...extra });
const feat = (id, label, description, extra = {}) => ({ id, label, description, enabled: true, plans: { ...ALL_TIERS }, ...extra });

/** What each built-in plugin offers and keeps, as the starting manifest. */
const BUILT_IN = {
  mapper: {
    category: 'Mapping',
    // Alpha 0.3 PR 17: renamed Ecosystem and versioned as a plugin of its own.
    version: '1.1.0',
    changelog: [
      { version: '1.1.0', date: '2026-11-22', notes: 'Renamed Ecosystem (was Ecosystem Mapper). Clicking a sticky opens the inspector with its details, even when the inspector was folded away.', by: 'Dashi' },
      { version: '1.0.0', date: '2026-11-15', notes: 'Ships with Dashi.', by: 'Dashi' },
    ],
    features: [
      feat('lenses', 'Systems lenses', 'Five lenses under the map: Micro/Meso/Macro, Water of Systems Change, Spheres, Leverage Points, Theory of System Change.'),
      feat('dataviz', 'Data view', 'Size and colour actors by their connections; focus on one actor’s network.'),
      feat('groups', 'Groups and layers', 'Cluster actors, and show, hide or lock layers.'),
      feat('members', 'Map members', 'Share a map with named colleagues.'),
      feat('exchange', 'Export and import', 'Maps as JSON files.'),
    ],
    dataModel: { docs: [
      { name: 'maps', label: 'Map index', description: 'Which maps exist and who can open them.', collections: [
        { id: 'maps', label: 'Maps', fields: [f('title', 'Title', 'text', { required: true }), f('ownerId', 'Owner', 'person'), f('memberIds', 'Members', 'list'), f('lensId', 'Lens', 'select')] }] },
      { name: 'map/<id>', label: 'One map', description: 'The board itself.', collections: [
        { id: 'actors', label: 'Actors and agents', fields: [f('label', 'Name', 'text', { required: true }), f('kind', 'Actor or agent', 'select', { options: ['actor', 'agent'] }), f('category', 'Category', 'select'), f('place', 'Place on the lens', 'list')] },
        { id: 'connectors', label: 'Connectors', fields: [f('from', 'From', 'reference'), f('to', 'To', 'reference'), f('type', 'Type', 'select', { options: ['relationship', 'feedback', 'learning'] }), f('strength', 'Strength', 'number')] },
        { id: 'groups', label: 'Groups', fields: [f('label', 'Name'), f('memberIds', 'Actors', 'list')] }] }] },
  },
  assets: {
    category: 'Knowledge',
    features: [
      feat('collections', 'Collections', 'Folders that nest, with drag and drop from anywhere on the page.'),
      feat('uploads', 'Large uploads', 'Files of any size the plan allows, sent in resumable 8 MB chunks.'),
      feat('abcd', 'ABCD lens', 'Sort assets as individuals, associations, institutions, physical, economic and cultural.'),
      feat('assetMap', 'Asset map', 'Assets as a map in the ABCD wedges: drag to sort, see what links to what.'),
      feat('dashiSources', 'Everything in Dashi', 'Maps, actors, people, library items and episodes, live, without copies.'),
      feat('comments', 'Notes and comments', 'Talk about an asset where it lives.'),
    ],
    dataModel: { docs: [{ name: 'assets', label: 'Assets', description: 'Files, links and notes, plus tags and collections for things elsewhere in Dashi.', collections: [
      { id: 'items', label: 'Assets', fields: [f('kind', 'Kind', 'select', { required: true, options: ['file', 'link', 'note', 'ref'] }), f('title', 'Title', 'text'), f('description', 'Description', 'longtext'), f('abcd', 'ABCD type', 'select', { options: ['individual', 'association', 'institution', 'physical', 'economic', 'cultural'] }), f('sensitivity', 'Sensitivity', 'select', { options: ['public', 'internal', 'restricted'] }), f('tags', 'Tags', 'list'), f('collectionIds', 'Collections', 'list'), f('file', 'File', 'reference'), f('url', 'Web address', 'url'), f('ref', 'Thing in Dashi', 'reference')] },
      { id: 'collections', label: 'Collections', fields: [f('name', 'Name', 'text', { required: true }), f('color', 'Colour'), f('parentId', 'Inside', 'reference'), f('description', 'Description', 'longtext')] }] }] },
  },
  strategy: {
    category: 'Planning',
    features: [
      feat('gantt', 'Gantt charts', 'Workplans under any plan, objective or goal, with draggable task bars.'),
      feat('timelines', 'Task timelines', 'Each task’s status over time, notes and milestones.'),
      feat('measures', 'Measures', 'Targets on objectives and goals, feeding dashboards.'),
      feat('assets', 'Task toolboxes', 'Actors, people, documents and media attached to work.'),
      feat('reports', 'Reports', 'Progress reports and the plan document.', { plans: { free: false, basic: true, standard: true, custom: true } }),
    ],
    dataModel: { docs: [{ name: 'strategy', label: 'Strategy', description: 'The whole tree, framework to task.', collections: [
      { id: 'nodes', label: 'Strategy items', fields: [f('type', 'Level', 'select', { required: true, options: ['framework', 'plan', 'objective', 'goal', 'workplan', 'task'] }), f('title', 'Title', 'text', { required: true }), f('parentId', 'Parent', 'reference'), f('start', 'Start', 'date'), f('end', 'End', 'date'), f('status', 'Status', 'select'), f('assigneeIds', 'Assignees', 'list'), f('measures', 'Measures', 'list')] }] }] },
  },
  studio: {
    category: 'Planning',
    features: [
      feat('soar', 'SOAR whiteboard', 'Strengths, opportunities, aspirations and results, with dot voting.'),
      feat('results', 'Results framework', 'Outcomes and indicators for the plan.'),
      feat('assemble', 'Assembly canvas', 'Wire ideas into objectives and goals, and send them to Strategy.'),
    ],
    dataModel: { docs: [{ name: 'studio', label: 'Planning studio', collections: [
      { id: 'plans', label: 'Plans in the studio', fields: [f('title', 'Title', 'text', { required: true }), f('context', 'Context', 'longtext'), f('teamIds', 'Team', 'list')] },
      { id: 'cards', label: 'SOAR cards', fields: [f('quadrant', 'Quadrant', 'select', { options: ['strengths', 'opportunities', 'aspirations', 'results'] }), f('text', 'Text', 'longtext'), f('dots', 'Dots', 'number')] },
      { id: 'results', label: 'Results', fields: [f('title', 'Result'), f('indicator', 'Indicator')] }] }] },
  },
  palette: {
    category: 'Data',
    features: [
      feat('dashboards', 'Dashboard designer', 'Widgets from strategy measures, with play-through.'),
      feat('programData', 'Program data', 'A spreadsheet of monthly values, with calculated measures.'),
      feat('calculators', 'Impact calculators', 'What a gift does, for public sites.'),
      feat('stories', 'Data stories', 'Step-by-step stories with audio.'),
      feat('postcards', 'Data postcards', 'One chart, one sentence, to share.'),
    ],
    dataModel: { docs: [
      { name: 'dashboards', label: 'Dashboards', collections: [
        { id: 'dashboards', label: 'Dashboards', fields: [f('title', 'Title', 'text', { required: true }), f('visibility', 'Visibility', 'select', { options: ['private', 'public'] }), f('siteId', 'Site', 'reference'), f('widgets', 'Widgets', 'list')] },
        { id: 'calculators', label: 'Calculators', fields: [f('title', 'Title'), f('budget', 'Budget', 'number')] },
        { id: 'stories', label: 'Stories', fields: [f('title', 'Title'), f('steps', 'Steps', 'list')] }] },
      { name: 'data', label: 'Program data', collections: [
        { id: 'series', label: 'Data series', fields: [f('measureId', 'Measure', 'reference'), f('values', 'Monthly values', 'list'), f('formula', 'Formula')] }] }] },
  },
  podcasts: {
    category: 'Media',
    features: [
      feat('seasons', 'Shows and seasons', 'Episodes organised by season.'),
      feat('uploads', 'Audio uploads', '.mp3 and .wav, sent in chunks.'),
      feat('rss', 'RSS feeds', 'For podcast apps.'),
      feat('station', 'Station page', 'A public station skinned to the org’s look.'),
    ],
    dataModel: { docs: [{ name: 'podcasts', label: 'Listen', collections: [
      { id: 'podcasts', label: 'Shows', fields: [f('title', 'Title', 'text', { required: true }), f('category', 'Category'), f('featured', 'Featured', 'boolean'), f('hostIds', 'Hosts', 'list')] },
      { id: 'episodes', label: 'Episodes', fields: [f('podcastId', 'Series', 'reference', { required: true }), f('title', 'Title', 'text', { required: true }), f('season', 'Season', 'number'), f('status', 'Status', 'select', { options: ['draft', 'scheduled', 'published'] }), f('publishAt', 'Publish on', 'date'), f('mediaId', 'Audio', 'reference')] }] }] },
  },
  library: {
    category: 'Knowledge',
    features: [
      feat('files', 'Files and references', 'Uploads with full citation metadata.'),
      feat('docs', 'Dashi docs', 'Write here; export to Word or PDF.'),
      feat('bibliographies', 'Annotated bibliographies', 'Groups of sources with annotations.', { plans: { free: false, basic: false, standard: true, custom: true } }),
      feat('weekly', 'Weekly briefs', 'Policy, state of play and recommendations, each week.', { plans: { free: false, basic: false, standard: true, custom: true } }),
      feat('lexicon', 'Lexicon', 'Shared terms and facets.'),
    ],
    dataModel: { docs: [{ name: 'library', label: 'Library', collections: [
      { id: 'items', label: 'Documents', fields: [f('kind', 'Kind', 'select', { options: ['file', 'doc', 'link', 'gdoc', 'ref'] }), f('meta', 'Citation (CSL)', 'list'), f('folderId', 'Folder', 'reference'), f('tags', 'Tags', 'list')] },
      { id: 'folders', label: 'Folders', fields: [f('name', 'Name', 'text', { required: true })] },
      { id: 'bibs', label: 'Bibliographies', fields: [f('title', 'Title', 'text', { required: true }), f('description', 'Description'), f('entries', 'Entries', 'list')] }] }] },
  },
  graph: {
    category: 'Knowledge',
    features: [
      feat('explore', 'Graph search', 'Type a name and its network unfolds; ask for the way from one thing to another.'),
      feat('insights', 'Insights', 'Most connected, bridges, clusters and islands.'),
      feat('ontology', 'Ontology manager', 'Which vocabularies describe your assets (schema.org, FOAF, SKOS, PROV, ABCD).'),
      feat('exports', 'Linked data exports', 'Turtle, JSON-LD and N-Triples.'),
      feat('apiKeys', 'Read-only API keys', 'Let another tool read the graph.', { plans: { free: false, basic: false, standard: true, custom: true } }),
    ],
    dataModel: { docs: [{ name: 'graph', label: 'Graph settings', collections: [
      { id: 'vocabs', label: 'Vocabularies in use', fields: [f('prefix', 'Prefix'), f('on', 'On', 'boolean')] },
      { id: 'abcdClasses', label: 'ABCD classes', fields: [f('type', 'ABCD type'), f('class', 'Class')] }] }] },
  },
  rhizome: {
    category: 'Knowledge',
    version: '0.3.0',
    features: [
      feat('facts', 'Fact layer', 'Maps, assets, strategy, the studio and people as one set of facts.'),
      feat('measures', 'Measures', 'Hubs, single points of failure, isolates, one-way flows, zone gaps, hollow objectives and more, calibrated to the org.'),
      feat('setup', 'Switch-on set-up', 'A context profile, a baseline and calibration, run once when the plugin is switched on.'),
      feat('rules', 'Rules and canned analyses', 'Rules as data, tips with their sources, findings with Why?.'),
      feat('rack', 'The rack', 'Twin racks of cabled modules (sources, filters, weigh, gates, voice, screens, engines); patches become your own rules.'),
      feat('tips', 'Tip harvester', 'A source registry, offline and polite online harvests, a review queue, and your own public or private tips.'),
    ],
    dataModel: { docs: [{ name: 'rhizome', label: 'Rhizome instance', collections: [
      { id: 'profile', label: 'Context profile', fields: [f('sector', 'Sector'), f('focus', 'Focus', 'list'), f('serves', 'Who we serve', 'longtext'), f('themes', 'Themes', 'list')] },
      { id: 'snapshots', label: 'Snapshots', fields: [f('at', 'When', 'date'), f('entities', 'Entities', 'number'), f('relations', 'Relations', 'number')] }] }] },
    changelog: [
      { version: '0.3.0', date: '2026-11-22', notes: 'Stage 3: the rack. Twin racks, a 1950s look, live screens and meters, a Patchbay, engine slots, and patches that become your own rules.', by: 'Dashi' },
      { version: '0.2.0', date: '2026-11-22', notes: 'Stage 2 and the tip harvester: the rules engine, tip library, canned analyses with Why?, the About tab, Tips with a review queue, and locations ready for Place.', by: 'Dashi' },
      { version: '0.1.0', date: '2026-11-22', notes: 'Stage 1: the fact layer, measures with calibration, and the switch-on set-up run. Rules, the patcher and the engines come next.', by: 'Dashi' },
    ],
  },
  teach: {
    category: 'Learning',
    version: '0.1.0',
    features: [
      feat('timeline', 'Cartridge timeline', 'Tracks of blocks on a timeline of course days, with pre-start, in session and post-end phases.'),
      feat('blocks', 'Block palette', 'Lessons, slideshow podcasts, live sessions, office hours, whiteboards, quizzes, assignments, reflections, feedback and comms.'),
      feat('checks', 'Accessibility and UDL checks', 'Alt text, transcripts, contrast, time limits, weekly load, many ways in, presence and kind dates, live as you work.'),
    ],
    dataModel: { docs: [{ name: 'teach', label: 'Cartridges', collections: [
      { id: 'cartridges', label: 'Cartridges', fields: [f('title', 'Title', 'text', { required: true }), f('kind', 'Kind'), f('status', 'Status', 'select', { options: ['draft', 'published', 'archived'] }), f('tracks', 'Tracks', 'list'), f('blocks', 'Blocks', 'list')] }] }] },
    changelog: [{ version: '0.1.0', date: '2026-11-22', notes: 'eLearning stage 1: the cartridge timeline, block palette and drawer, checks, and three Kestrel cartridges.', by: 'Dashi' }],
  },
  learn: {
    category: 'Learning',
    version: '0.1.0',
    features: [
      feat('home', 'My learning', 'What’s next, what’s due, and progress without leaderboards.'),
      feat('player', 'Player', 'A course week by week, with slideshow podcasts, quizzes and reflections.'),
      feat('settings', 'Learner settings', 'Text size, dyslexia-friendly font, less motion, captions.'),
    ],
    dataModel: { docs: [{ name: 'learn', label: 'Learner records', collections: [
      { id: 'people', label: 'Learners', fields: [f('enrolments', 'Enrolments', 'list'), f('settings', 'Settings', 'list')] }] }] },
    changelog: [{ version: '0.1.0', date: '2026-11-22', notes: 'eLearning stage 2: My learning, the player, learner settings and the learner’s own record.', by: 'Dashi' }],
  },
  place: {
    category: 'Knowledge',
    version: '0.1.0',
    features: [
      feat('places', 'Places', 'Communities, neighbourhoods, sites, landmarks and regions, with outlines.'),
      feat('pins', 'Pins', 'Actors, assets and stories tied to a place or an exact spot, and the places each one serves.'),
      feat('layers', 'Layers', 'Place outlines, links between actors, who serves where, places, actors and assets, each switched on or off.'),
      feat('basemaps', 'Base maps', 'A street map (OpenStreetMap), your own drawn map that works offline, or none.'),
    ],
    dataModel: { docs: [{ name: 'place', label: 'Places and pins', collections: [
      { id: 'places', label: 'Places', fields: [f('name', 'Name', 'text', { required: true }), f('kind', 'Kind', 'select', { options: ['community', 'neighbourhood', 'site', 'landmark', 'region'] }), f('geo', 'Point', 'text'), f('area', 'Outline', 'text'), f('within', 'Inside', 'reference'), f('description', 'Description', 'longtext'), f('tags', 'Tags', 'list')] },
      { id: 'pins', label: 'Pins', fields: [f('placeId', 'Place', 'reference'), f('lat', 'Latitude', 'number'), f('lng', 'Longitude', 'number'), f('serves', 'Serves', 'list'), f('note', 'Note', 'longtext')] }] }] },
    changelog: [{ version: '0.1.0', date: '2026-11-22', notes: 'Stage 1: places, pins, layers and base maps, with Kestrel Bay drawn as a made-up bay.', by: 'Dashi' }],
  },
  pages: {
    category: 'Publishing',
    features: [
      feat('pages', 'Information pages', 'In each site’s menu.'),
      feat('articles', 'News articles', 'Dated, with covers.'),
      feat('embeds', 'Live embeds', 'Dashboards and episodes inside a page.'),
    ],
    dataModel: { docs: [{ name: 'pages', label: 'Pages and news', collections: [
      { id: 'pages', label: 'Pages and articles', fields: [f('kind', 'Kind', 'select', { options: ['page', 'article'] }), f('title', 'Title', 'text', { required: true }), f('slug', 'Address'), f('siteId', 'Site', 'reference'), f('status', 'Status', 'select', { options: ['draft', 'published'] }), f('body', 'Body', 'longtext')] }] }] },
  },
  social: {
    category: 'Publishing',
    features: [
      feat('compose', 'Create once', 'Posts from episodes, blog posts, data cards and dashboards, with pictures made for you.'),
      feat('networks', 'Every network', 'Instagram, Facebook, TikTok, YouTube, LinkedIn, Bluesky and Mastodon, each with its own words and limits.'),
      feat('schedule', 'Queue and calendar', 'Drafts, scheduled posts and a month view.'),
      feat('insights', 'Insights', 'Reach by network and kind of post (pretend numbers in this alpha).'),
    ],
    dataModel: { docs: [{ name: 'social', label: 'Social media', collections: [
      { id: 'posts', label: 'Posts', fields: [f('kind', 'Kind', 'select', { options: ['episode', 'article', 'datacard', 'dashboard', 'note'] }), f('title', 'Name', 'text'), f('text', 'Text', 'longtext'), f('networks', 'Networks', 'list'), f('status', 'Status', 'select', { options: ['draft', 'scheduled', 'posted', 'failed'] }), f('scheduledAt', 'Goes out', 'date')] },
      { id: 'channels', label: 'Channels', fields: [f('network', 'Network'), f('handle', 'Handle'), f('connected', 'Connected', 'boolean')] }] }] },
  },
  org: {
    category: 'Platform',
    features: [feat('people', 'People and teams', 'Staff, roles and teams.'), feat('sites', 'Public sites', 'Sites and their look, in Web.'), feat('domains', 'Own domains', 'yourorg.org', { plans: { free: false, basic: false, standard: false, custom: true } })],
    dataModel: { docs: [{ name: 'org', label: 'Organisation', collections: [
      { id: 'staff', label: 'Staff', fields: [f('name', 'Name', 'text', { required: true }), f('email', 'Email'), f('roleId', 'Role', 'select'), f('title', 'Title'), f('teamIds', 'Teams', 'list')] },
      { id: 'teams', label: 'Teams', fields: [f('name', 'Name', 'text', { required: true }), f('color', 'Colour')] },
      { id: 'sites', label: 'Sites', fields: [f('name', 'Name', 'text', { required: true }), f('visibility', 'Visibility', 'select', { options: ['public', 'private'] })] }] }] },
  },
  help: {
    category: 'Platform',
    features: [feat('guides', 'Guides', 'The user guide, editable by the platform admin.'), feat('diagrams', 'Diagrams', 'How the lenses and the data model line up.')],
    dataModel: { docs: [{ name: 'help (platform)', label: 'Help library', collections: [{ id: 'sections', label: 'Sections', fields: [f('title', 'Title'), f('pages', 'Pages', 'list')] }] }] },
  },
};

/**
 * Plugins in development that ship with Dashi as drafts, so the platform
 * admin can open them in the designer, shape them and release them. Each
 * starts on the generated records page (plugin.html) until it has its own.
 * Removing one from the designer keeps it removed (stored.dismissed).
 */
const draft = (m) => ({
  version: '0.1.0', status: 'draft', builtIn: false, core: false, author: 'Dashi', homepage: '', href: `plugin.html?id=${m.id}`,
  plans: { ...ALL_TIERS }, changelog: [{ version: '0.1.0', date: '2026-11-15', notes: 'Scaffolded in alpha.3: data model and features roughed in.', by: 'Dashi' }],
  ...m,
});
/**
 * A first release of a scaffold (alpha.5): installed, with its own tool view
 * on plugin.html (src/pluginViews/), and off for each org until it switches
 * it on, unless `defaultOff: false`.
 */
const release = (m, notes) => draft({
  version: '1.0.0', status: 'installed', defaultOff: true, released: true,
  changelog: [
    { version: '1.0.0', date: '2026-11-15', notes, by: 'Dashi' },
    { version: '0.1.0', date: '2026-11-15', notes: 'Scaffolded in alpha.3: data model and features roughed in.', by: 'Dashi' },
  ],
  ...m,
});
export const SCAFFOLDS = [
  release({
    id: 'ai-policy', parent: 'ai', name: 'AI Policy Studio', short: 'AI policy', category: 'AI',
    blurb: 'Frame your organisation’s AI policy together: the principles you hold, which uses are fine, careful or off-limits, what data never goes in, and when you’ll look again.',
    look: { tone: '#5a54c4', icon: 'scales', accent: 'soft' },
    features: [
      feat('principles', 'Principles', 'Start from values (care, consent, Indigenous data sovereignty, accessibility) and write what each means here.'),
      feat('useRules', 'Use-case traffic lights', 'Green, amber and red uses, with the safeguards each needs.'),
      feat('dataRules', 'Data rules', 'What may never go into an AI tool: personal, health, community-held or restricted data.'),
      feat('plainPolicy', 'Plain-language policy', 'Assemble the policy as a Dashi doc for the library, in plain words.'),
      feat('acknowledge', 'Staff acknowledgement', 'Each person reads and signs the current version.', { plans: { free: false, basic: true, standard: true, custom: true } }),
      feat('reviews', 'Review cycle', 'A date to look again, with what changed and why.'),
    ],
    dataModel: { docs: [{ name: 'plugin/ai-policy', label: 'AI policy', description: 'Principles, use rules and reviews.', collections: [
      { id: 'principles', label: 'Principles', fields: [f('title', 'Principle', 'text', { required: true }), f('statement', 'What it means here', 'longtext'), f('why', 'Why it matters to us', 'longtext')] },
      { id: 'rules', label: 'Use rules', fields: [f('useCase', 'Use case', 'text', { required: true }), f('light', 'Light', 'select', { required: true, options: ['Green: go ahead', 'Amber: with care', 'Red: not here'] }), f('dataAllowed', 'Data that may go in', 'list'), f('safeguards', 'Safeguards', 'longtext'), f('owner', 'Who decides', 'person')] },
      { id: 'reviews', label: 'Reviews', fields: [f('date', 'Date', 'date', { required: true }), f('by', 'Led by', 'person'), f('changes', 'What changed', 'longtext'), f('next', 'Next review', 'date')] }] }] },
  }, 'First release: principles, a traffic-light board of uses, data rules, and the policy assembled in plain words.'),
  release({
    id: 'ai-register', parent: 'ai', name: 'AI Use Register', short: 'AI register', category: 'AI',
    blurb: 'A simple, honest record of the AI tools your team uses: what for, what goes in, what it costs, and how risky it is, so nobody has to guess.',
    look: { tone: '#c0562f', icon: 'robot', accent: 'soft' },
    features: [
      feat('tools', 'Tool list', 'Every AI tool in use, free or paid, with who approved it.'),
      feat('uses', 'Use log', 'Quick entries: team, purpose, the kind of data, and a risk level.'),
      feat('risk', 'Risk view', 'Uses by risk and data sensitivity, linked to the AI policy’s rules.'),
      feat('costs', 'Costs', 'What each tool costs, and free options that would do.', { plans: { free: false, basic: true, standard: true, custom: true } }),
      feat('report', 'Board report', 'A one-page summary of AI use for the board.', { plans: { free: false, basic: false, standard: true, custom: true } }),
    ],
    dataModel: { docs: [{ name: 'plugin/ai-register', label: 'AI use register', description: 'Tools and how they are used.', collections: [
      { id: 'tools', label: 'AI tools', fields: [f('name', 'Tool', 'text', { required: true }), f('vendor', 'Made by'), f('url', 'Web address', 'url'), f('cost', 'Cost a month', 'number'), f('free', 'Free to use', 'boolean'), f('dataHome', 'Where data goes', 'select', { options: ['Stays on our devices', 'Canada', 'United States', 'Elsewhere', 'Not sure'] }), f('status', 'Status', 'select', { options: ['Approved', 'Trial', 'Not approved'] })] },
      { id: 'uses', label: 'Uses', fields: [f('tool', 'Tool', 'text', { required: true }), f('purpose', 'What for', 'longtext'), f('team', 'Team'), f('data', 'Kind of data', 'select', { options: ['Public', 'Internal', 'Personal', 'Restricted'] }), f('risk', 'Risk', 'select', { options: ['Low', 'Medium', 'High'] }), f('person', 'Who', 'person'), f('date', 'When', 'date')] }] }] },
  }, 'First release: the tool list, a quick use log, and a risk view with a one-page summary for the board.'),
  release({
    id: 'prompt-commons', parent: 'ai', name: 'Prompt Commons', short: 'Prompts', category: 'AI',
    blurb: 'Your team’s shared recipes for free and accessible AI tools: prompts that work, examples of good output, and the care each one needs.',
    look: { tone: '#2f8a5b', icon: 'chats', accent: 'soft' },
    features: [
      feat('recipes', 'Prompt recipes', 'A prompt, the task it’s for, the tool it was tested in, and an example.'),
      feat('ratings', 'Tried and rated', 'Colleagues mark what worked for them, and say how they changed it.'),
      feat('freeTools', 'Free tool guide', 'Accessible, no-cost tools, including ones that run on your own computer.'),
      feat('safeUse', 'Safe-use notes', 'Each recipe says what data it’s fine with, from the AI policy.'),
    ],
    dataModel: { docs: [{ name: 'plugin/prompt-commons', label: 'Prompt commons', description: 'Shared prompt recipes.', collections: [
      { id: 'prompts', label: 'Recipes', fields: [f('title', 'Name', 'text', { required: true }), f('task', 'Task', 'select', { options: ['Summarise', 'Draft', 'Plain language', 'Translate', 'Brainstorm', 'Analyse data', 'Other'] }), f('prompt', 'Prompt', 'longtext', { required: true }), f('tool', 'Tested in'), f('example', 'Example output', 'longtext'), f('tested', 'Tested by the team', 'boolean'), f('dataOk', 'Fine with', 'select', { options: ['Public data only', 'Internal data', 'No data: general use'] })] },
      { id: 'tools', label: 'Free tools', fields: [f('name', 'Tool', 'text', { required: true }), f('url', 'Web address', 'url'), f('offline', 'Runs on your own computer', 'boolean'), f('goodFor', 'Good for', 'longtext')] }] }] },
  }, 'First release: recipe cards to copy, tried-and-rated marks, starter recipes and a free tool guide.'),
  release({
    id: 'plain-words', parent: 'ai', defaultOff: false, name: 'Plain Words', short: 'Plain words', category: 'AI',
    blurb: 'An accessibility kit for everything you publish: reading-level checks, plain-language rewrites, alt text and captions, using tools that are free and work in the browser.',
    look: { tone: '#2f6fb5', icon: 'textAa', accent: 'soft' },
    features: [
      feat('readability', 'Reading level', 'Check a passage’s reading level and long sentences, right in the browser.'),
      feat('rewrite', 'Plain-language rewrite', 'Side-by-side before and after, with an optional AI helper.', { plans: { free: false, basic: true, standard: true, custom: true } }),
      feat('altText', 'Alt text helper', 'Draft and review alt text for images in the Asset manager.'),
      feat('captions', 'Captions checklist', 'For podcast episodes and video.'),
    ],
    dataModel: { docs: [{ name: 'plugin/plain-words', label: 'Plain words', description: 'Checks and rewrites.', collections: [
      { id: 'checks', label: 'Checks', fields: [f('title', 'What it is', 'text', { required: true }), f('before', 'Original', 'longtext', { required: true }), f('after', 'Plain version', 'longtext'), f('grade', 'Reading grade', 'number'), f('status', 'Status', 'select', { options: ['To do', 'Rewritten', 'Checked by a reader'] })] },
      { id: 'alt', label: 'Alt text', fields: [f('image', 'Image', 'reference'), f('alt', 'Alt text', 'longtext', { required: true }), f('reviewed', 'Reviewed', 'boolean')] }] }] },
  }, 'First release: a reading-level checker that runs in the browser, plain-word suggestions, and saved checks. On by default.'),
  release({
    id: 'critical-media', name: 'Critical Media', short: 'Media smart', category: 'Knowledge',
    blurb: 'Lessons in reading the media with a critical eye, after NALA’s Facts Matter, and short Stop, Think, Check prompts beside your public news and charts.',
    look: { tone: '#b0472f', icon: 'news', accent: 'soft' },
    features: [
      feat('lessons', 'Ten lessons', 'Hour-long lessons for a group, from “what counts as media?” to “respect, connect, act”, each with a STEM twist.'),
      feat('toolkit', 'Toolkit cards', 'Stop, Think, Check; six questions; tracing a claim. Print them or keep them by the phone.'),
      feat('sitePrompts', 'Prompts on public sites', 'A lesson suggested beside news articles and charts on your public sites.'),
      feat('corner', 'Media smart corner', 'A page on your public site with the lessons and cards.'),
      feat('sessions', 'Sessions log', 'When you ran a lesson, with whom, and what you learned.'),
    ],
    dataModel: { docs: [{ name: 'plugin/critical-media', label: 'Critical media', description: 'Your own lessons, the sessions you ran, and where prompts show.', collections: [
      { id: 'lessons', label: 'Our own lessons', fields: [f('title', 'Title', 'text', { required: true }), f('minutes', 'Minutes', 'number'), f('aims', 'Aims', 'list'), f('warmUp', 'Warm-up', 'longtext'), f('activity', 'Activity', 'longtext'), f('takeAway', 'Take away', 'longtext')] },
      { id: 'sessions', label: 'Sessions run', fields: [f('lesson', 'Lesson', 'text', { required: true }), f('date', 'Date', 'date'), f('group', 'Group'), f('people', 'People there', 'number'), f('facilitator', 'Facilitator', 'person'), f('notes', 'What we learned', 'longtext')] }] }] },
  }, 'First release: ten original lessons after NALA’s Facts Matter, toolkit cards, prompts beside public news and charts, and a sessions log.'),
];

/** The manifest a built-in plugin starts from. */
export function builtInManifest(p) {
  const extra = BUILT_IN[p.id] ?? { category: 'Other', features: [], dataModel: { docs: [] } };
  return {
    id: p.id, name: p.name, short: p.short ?? p.name, version: extra.version ?? '1.0.0', status: 'installed',
    builtIn: true, core: !!p.core, category: extra.category, blurb: p.blurb, href: p.href, author: 'Dashi', homepage: '',
    look: { tone: p.tone, icon: p.icon, accent: 'soft' },
    features: structuredClone(extra.features), dataModel: structuredClone(extra.dataModel),
    plans: null,
    changelog: structuredClone(extra.changelog ?? [{ version: '1.0.0', date: '2026-11-15', notes: 'Ships with Dashi.', by: 'Dashi' }]),
  };
}

// The built-in plugins as they first shipped (PLUGINS is changed in place by applyRegistry).
const ORIGINAL = BUILT_IN_PLUGINS;
export const builtInIds = () => ORIGINAL.map((p) => p.id);
export const defaultManifest = (id) => {
  const p = ORIGINAL.find((x) => x.id === id);
  return p ? builtInManifest(p) : null;
};

/** A blank manifest for a plugin started in the designer. */
export function blankManifest({ id, name }) {
  return {
    id, name, short: name.split(/\s+/)[0], version: '0.1.0', status: 'draft', builtIn: false, core: false,
    category: 'Other', blurb: '', href: `plugin.html?id=${id}`, author: '', homepage: '',
    look: { tone: '#56657f', icon: 'sec-plugins', accent: 'soft' },
    features: [feat('records', 'Records', 'Keep a list of records, as set out under Data model.')],
    dataModel: { docs: [{ name: `plugin/${id}`, label: name, description: '', collections: [{ id: 'items', label: 'Items', fields: [f('title', 'Title', 'text', { required: true }), f('notes', 'Notes', 'longtext')] }] }] },
    plans: { ...ALL_TIERS },
    changelog: [],
  };
}

/* ---------------------------------------------------------------- versions */

export const parseVersion = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
  return m ? m.slice(1).map(Number) : null;
};
export function compareVersions(a, b) {
  const x = parseVersion(a) ?? [0, 0, 0];
  const y = parseVersion(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}
export function bumpVersion(v, part = 'patch') {
  const [M, m, p] = parseVersion(v) ?? [0, 1, 0];
  return part === 'major' ? `${M + 1}.0.0` : part === 'minor' ? `${M}.${m + 1}.0` : `${M}.${m}.${p + 1}`;
}

/* ---------------------------------------------------------------- checking */

const ID = /^[a-z][a-z0-9-]{1,39}$/;
const RESERVED = new Set(['home', 'me', 'platform', 'login', 'site', 'api', 'auth', 'media', 'vendor', 'src']);

/** What is wrong with a manifest, as sentences (empty when it is fine). */
export function manifestProblems(m, { installing = false } = {}) {
  const out = [];
  if (!m || typeof m !== 'object') return ['That isn’t a plugin manifest (expected a JSON object).'];
  if (!ID.test(m.id ?? '')) out.push('The id must be 2–40 lowercase letters, digits or dashes, starting with a letter.');
  if (installing && RESERVED.has(m.id)) out.push(`“${m.id}” is reserved.`);
  if (!String(m.name ?? '').trim()) out.push('Give the plugin a name.');
  if (!parseVersion(m.version)) out.push('The version must look like 1.0.0.');
  if (m.status && !STATUSES.some((s) => s.id === m.status)) out.push('Unknown status.');
  if (m.look?.tone && !/^#[0-9a-f]{6}$/i.test(m.look.tone)) out.push('The tone must be a colour like #3e8fa6.');
  if (m.features && !Array.isArray(m.features)) out.push('Features must be a list.');
  for (const x of m.features ?? []) if (!ID.test(x.id ?? '') && !/^[a-zA-Z][\w-]{0,39}$/.test(x.id ?? '')) out.push(`Feature “${x.label ?? x.id}” needs an id.`);
  const featIds = (m.features ?? []).map((x) => x.id);
  if (new Set(featIds).size !== featIds.length) out.push('Two features share an id.');
  for (const d of m.dataModel?.docs ?? []) {
    if (!String(d.name ?? '').trim()) out.push('Every document in the data model needs a name.');
    for (const c of d.collections ?? []) {
      if (!/^[a-zA-Z][\w-]{0,39}$/.test(c.id ?? '')) out.push(`Collection “${c.label ?? '?'}” needs an id (letters, digits, dashes).`);
      const ids = (c.fields ?? []).map((x) => x.id);
      if (new Set(ids).size !== ids.length) out.push(`Two fields in “${c.label ?? c.id}” share an id.`);
      for (const x of c.fields ?? []) {
        if (!/^[a-zA-Z][\w-]{0,39}$/.test(x.id ?? '')) out.push(`A field in “${c.label ?? c.id}” needs an id.`);
        if (!FIELD_TYPES.some((t) => t.id === x.type)) out.push(`Field “${x.label ?? x.id}” has an unknown type.`);
      }
    }
  }
  if (JSON.stringify(m).length > 200_000) out.push('The manifest is too big (200 KB at most).');
  return out;
}

/** A manifest with only the fields Dashi knows, so packages can't smuggle anything else in. */
export function cleanManifest(m) {
  const str = (v, n = 200) => String(v ?? '').slice(0, n);
  const tiers = (p) => (p && typeof p === 'object' ? Object.fromEntries(TIERS.map((t) => [t, p[t] !== false])) : null);
  return {
    id: str(m.id, 40), name: str(m.name, 80), short: str(m.short || m.name, 24), version: str(m.version, 20),
    status: STATUSES.some((s) => s.id === m.status) ? m.status : 'draft',
    builtIn: !!m.builtIn, core: !!m.core, defaultOff: !m.builtIn && !!m.defaultOff, category: CATEGORIES.includes(m.category) ? m.category : 'Other',
    blurb: str(m.blurb, 600), href: m.builtIn ? str(m.href, 80) : `plugin.html?id=${str(m.id, 40)}`, author: str(m.author, 80), homepage: /^https:\/\//.test(m.homepage ?? '') ? str(m.homepage, 300) : '',
    look: { tone: /^#[0-9a-f]{6}$/i.test(m.look?.tone ?? '') ? m.look.tone : '#56657f', icon: str(m.look?.icon || 'sec-plugins', 40), accent: m.look?.accent === 'solid' ? 'solid' : 'soft' },
    features: (Array.isArray(m.features) ? m.features : []).slice(0, 60).map((x) => ({ id: str(x.id, 40), label: str(x.label, 80), description: str(x.description, 400), enabled: x.enabled !== false, plans: tiers(x.plans) ?? { ...ALL_TIERS } })),
    dataModel: { docs: (m.dataModel?.docs ?? []).slice(0, 20).map((d) => ({
      name: str(d.name, 64), label: str(d.label, 80), description: str(d.description, 400),
      collections: (d.collections ?? []).slice(0, 30).map((c) => ({
        id: str(c.id, 40), label: str(c.label, 80),
        fields: (c.fields ?? []).slice(0, 60).map((x) => ({ id: str(x.id, 40), label: str(x.label, 80), type: FIELD_TYPES.some((t) => t.id === x.type) ? x.type : 'text', required: !!x.required, options: Array.isArray(x.options) ? x.options.slice(0, 40).map((o) => str(o, 60)) : undefined })),
      })),
    })) },
    plans: m.builtIn ? null : tiers(m.plans) ?? { ...ALL_TIERS },
    changelog: (Array.isArray(m.changelog) ? m.changelog : []).slice(0, 100).map((c) => ({ version: str(c.version, 20), date: str(c.date, 10), notes: str(c.notes, 2000), by: str(c.by, 80) })),
  };
}

/* ---------------------------------------------------------------- the registry */

/**
 * The full registry from what is stored: built-ins (with the admin's
 * changes) then installed plugins. stored = { plugins: { id: manifest }, history: { id: [manifest...] } }.
 */
/** Built-in plugins Dashi has renamed: a stored copy still carrying an old name takes the new one. */
// Alpha 0.4: one-word names. Strategy & Work became Plan, Public Portal became Web, Podcasts became Listen.
const RENAMED = { pages: ['Public Portal', 'Web views', 'Sites & Pages'], assets: ['Asset manager'], mapper: ['Ecosystem Mapper', 'Mapper'], strategy: ['Strategy & Work', 'Strategy'], podcasts: ['Podcasts', 'Radio & Podcasts'] };

/** The AI tools that sit inside the AI plugin (alpha 0.4). */
export const AI_TOOLS = ['ai-policy', 'ai-register', 'prompt-commons', 'plain-words'];

export function mergeRegistry(stored = {}) {
  const plugins = {};
  for (const p of ORIGINAL) {
    let mine = stored.plugins?.[p.id];
    if (mine && RENAMED[p.id]?.includes(mine.name)) { mine = { ...mine }; delete mine.name; delete mine.short; delete mine.blurb; }
    const base = builtInManifest(p);
    // A new Dashi release of a built-in plugin brings its version and changelog with it.
    if (mine && compareVersions(mine.version ?? '1.0.0', base.version) < 0) mine = { ...mine, version: base.version, changelog: [...base.changelog.filter((c) => compareVersions(c.version, mine.version ?? '1.0.0') > 0), ...(mine.changelog ?? [])] };
    plugins[p.id] = mine ? { ...base, ...mine, builtIn: true, core: !!p.core, id: p.id, href: p.href } : base;
    // A built-in plugin that ships switched off keeps that, so an org's switching it on is a real choice.
    if (p.defaultOff) plugins[p.id].defaultOff = true;
  }
  for (const [id, m] of Object.entries(stored.plugins ?? {})) if (!plugins[id]) plugins[id] = { ...m, builtIn: false, core: false };
  for (const sc of SCAFFOLDS) {
    if ((stored.dismissed ?? []).includes(sc.id)) continue;
    // A stored copy of an older Dashi draft gives way to the released version.
    const mine = plugins[sc.id];
    if (!mine || (sc.released && mine.author === 'Dashi' && compareVersions(mine.version, sc.version) < 0)) plugins[sc.id] = structuredClone(sc);
  }
  // Alpha 0.4: the AI tools live inside the AI plugin. A stored copy from before keeps its own settings and joins it, unless the admin gave it another home.
  for (const id of AI_TOOLS) if (plugins[id] && !plugins[id].parent) plugins[id].parent = 'ai';
  return { plugins, history: stored.history ?? {} };
}

/** What pages need to know (the session carries it): the look, status and switches of each plugin. */
export function registryView(registry, { includeDrafts = false } = {}) {
  return Object.fromEntries(Object.values(registry.plugins)
    .filter((m) => includeDrafts || m.status !== 'draft')
    .map((m) => [m.id, {
      id: m.id, name: m.name, short: m.short, blurb: m.blurb, version: m.version, status: m.status, builtIn: m.builtIn, core: m.core,
      category: m.category, href: m.href, tone: m.look?.tone, icon: m.look?.icon, defaultOff: !!m.defaultOff, parent: m.parent ?? null,
      features: Object.fromEntries((m.features ?? []).map((x) => [x.id, x.enabled !== false])),
      featurePlans: Object.fromEntries((m.features ?? []).map((x) => [x.id, x.plans ?? ALL_TIERS])),
      featureList: (m.features ?? []).map((x) => ({ id: x.id, label: x.label, description: x.description })),
      plans: m.plans, dataModel: m.builtIn ? undefined : m.dataModel,
    }]));
}

/** Plugins an org's plan leaves out, beyond the built-ins (Platform admin → Plans covers those). */
export function pausedByRegistry(registry, tier) {
  const out = {};
  for (const m of Object.values(registry.plugins)) {
    if (m.core) continue;
    if (m.status !== 'installed') out[m.id] = true;
    else if (!m.builtIn && m.plans && m.plans[tier] === false) out[m.id] = true;
  }
  return out;
}

/** A package: the manifest plus where it came from, ready to save as a .json file. */
export const packageOf = (m) => ({ dashiPlugin: 1, exportedAt: new Date().toISOString(), manifest: m });
/** The manifest inside a package (or a bare manifest). */
export const manifestFromPackage = (x) => (x && x.dashiPlugin && x.manifest ? x.manifest : x);
