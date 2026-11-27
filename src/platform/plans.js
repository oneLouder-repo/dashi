/**
 * Plans (tiers): what each org gets. Alpha 0.4 tiers from the pricing report
 * (d, 2026-11-27): Seed (free), Community, Organization, Network, and Custom
 * for bespoke setups. Plan ids stay as they were (free, basic, standard) so
 * existing orgs keep their plan; only the names, prices and contents moved.
 *
 * The values here are the starting point. The platform admin changes them
 * for every org on a tier (Platform admin → Plans, stored as the platform
 * document "plans"), and can give a Custom org limits of its own (the
 * org's `limits` column). The server works out an org's plan from those
 * three layers and puts it on the org document as `platform.plan`, so
 * every page can read it; the server is what enforces it.
 *
 *   Plan { id, label, tagline, price: { monthly, yearly, usdMonthly, usdYearly, note },
 *          plugins: { [pluginId]: bool }, limits: { [field]: number | null (no limit) },
 *          features: { socialLogin, customDomain, bibliographies, branding, liveSocial, linkedOrgs } }
 *
 * Prices are Canadian dollars with tax included (see server/billing.js);
 * usdMonthly / usdYearly are the US prices, near parity.
 */
export const PLAN_IDS = ['free', 'basic', 'standard', 'network', 'custom'];

/** The grassroots rate: off Community and Organization for small organisations, self-declared. */
export const GRASSROOTS = { percent: 30, plans: ['basic', 'standard'], budgetCad: 250000, budgetUsd: 200000 };
/** Alpha testers: the first year at half price (d, 2026-11-27). The platform admin marks the org; checkout applies it. */
export const ALPHA_SUPPORTER = { percent: 50, months: 12 };

/** The limits, in the order the admin and the sales page show them. */
export const LIMITS = [
  { id: 'users', label: 'People who can sign in', short: 'people' },
  { id: 'maps', label: 'Ecosystem maps', short: 'maps' },
  { id: 'frameworks', label: 'Strategic frameworks', short: 'frameworks' },
  { id: 'plans', label: 'Strategic plans', short: 'plans' },
  { id: 'dashboards', label: 'Dashboards', short: 'dashboards' },
  { id: 'sites', label: 'Public sites', short: 'sites' },
  { id: 'shows', label: 'Podcast series', short: 'series' },
  { id: 'documents', label: 'Documents in the library', short: 'documents' },
  { id: 'storageMb', label: 'Storage', short: 'storage', unit: 'MB' },
  { id: 'uploadMb', label: 'Largest audio file', short: 'per file', unit: 'MB' },
  { id: 'aiTokensK', label: 'AI each month (thousand tokens)', short: 'AI tokens', unit: 'K' },
];

export const FEATURES = [
  { id: 'liveSocial', label: 'Post to Bluesky, Mastodon and webhooks for real' },
  { id: 'socialLogin', label: 'Sign in with Google, Facebook or Microsoft' },
  { id: 'customDomain', label: 'Your own domain (yourorg.org)' },
  { id: 'bibliographies', label: 'Annotated bibliographies and weekly briefs' },
  { id: 'branding', label: 'No “Made with Dashi” on public sites' },
  { id: 'linkedOrgs', label: 'Linked organisations: a funder and its grantees' },
];

/** Plugins a plan can include. Organisation and Help are always there. */
export const PLAN_PLUGINS = ['mapper', 'assets', 'strategy', 'studio', 'palette', 'podcasts', 'pages', 'library', 'social', 'rhizome', 'place', 'teach', 'learn', 'ai'];

const ALL = Object.fromEntries(PLAN_PLUGINS.map((id) => [id, true]));
export const DEFAULT_PLANS = {
  free: {
    id: 'free', label: 'Seed', tagline: 'For volunteer groups trying Dashi: a plan, a map, your assets and a public site.',
    price: { monthly: 0, yearly: 0, usdMonthly: 0, usdYearly: 0, note: 'Free for good' },
    plugins: { ...ALL, studio: false, podcasts: false, library: false, social: false, rhizome: false, place: false, teach: false, learn: false, ai: false },
    limits: { users: 3, maps: 1, frameworks: 1, plans: 1, dashboards: 1, sites: 1, shows: 0, documents: 50, storageMb: 1024, uploadMb: 10, aiTokensK: 0 },
    features: { liveSocial: false, socialLogin: false, customDomain: false, bibliographies: false, branding: false, linkedOrgs: false },
  },
  basic: {
    id: 'basic', label: 'Community', tagline: 'For small nonprofits: ten people, with podcasts, Place, the Library and Rhizome.',
    price: { monthly: 39, yearly: 390, usdMonthly: 29, usdYearly: 290, note: 'a month' },
    // Teach and Learn sit in Organization and up (d, 2026-11-27).
    plugins: { ...ALL, teach: false, learn: false, ai: false },
    limits: { users: 10, maps: 3, frameworks: 1, plans: 3, dashboards: 5, sites: 1, shows: 2, documents: 1000, storageMb: 10240, uploadMb: 100, aiTokensK: 0 },
    features: { liveSocial: false, socialLogin: true, customDomain: true, bibliographies: true, branding: false, linkedOrgs: false },
  },
  standard: {
    id: 'standard', label: 'Organization', tagline: 'For staffed nonprofits: thirty people, AI included, Teach and Learn, and live social posting.',
    price: { monthly: 119, yearly: 1190, usdMonthly: 89, usdYearly: 890, note: 'a month' },
    plugins: { ...ALL },
    limits: { users: 30, maps: 10, frameworks: 2, plans: 6, dashboards: 20, sites: 3, shows: 5, documents: 10000, storageMb: 51200, uploadMb: 250, aiTokensK: 1800 },
    features: { liveSocial: true, socialLogin: true, customDomain: true, bibliographies: true, branding: true, linkedOrgs: false },
  },
  network: {
    id: 'network', label: 'Network', tagline: 'For foundations, coalitions and networks: unlimited people, linked organisations and Lyceum.',
    price: { monthly: 349, yearly: 3490, usdMonthly: 259, usdYearly: 2590, note: 'a month' },
    plugins: { ...ALL },
    limits: { users: null, maps: null, frameworks: null, plans: null, dashboards: null, sites: 10, shows: null, documents: null, storageMb: 204800, uploadMb: 700, aiTokensK: 6000 },
    features: { liveSocial: true, socialLogin: true, customDomain: true, bibliographies: true, branding: true, linkedOrgs: true },
  },
  custom: {
    id: 'custom', label: 'Custom', tagline: 'A setup shaped around your organisation or network, with its own limits and support.',
    price: { monthly: null, yearly: null, usdMonthly: null, usdYearly: null, note: 'Let’s talk' },
    plugins: { ...ALL },
    limits: { users: null, maps: null, frameworks: null, plans: null, dashboards: null, sites: null, shows: null, documents: null, storageMb: 512000, uploadMb: 700, aiTokensK: null },
    features: { liveSocial: true, socialLogin: true, customDomain: true, bibliographies: true, branding: true, linkedOrgs: true },
  },
};

/** A price after the grassroots rate, rounded to the cent. */
export const grassrootsPrice = (amount) => (amount == null ? null : Math.round(amount * (100 - GRASSROOTS.percent)) / 100);

const merge = (base, over) => {
  const out = structuredClone(base);
  for (const part of ['plugins', 'limits', 'features', 'price']) if (over?.[part]) Object.assign(out[part], over[part]);
  for (const k of ['label', 'tagline']) if (over?.[k]) out[k] = over[k];
  return out;
};

/** Every plan, with the platform admin's changes. */
export const allPlans = (overrides = {}) => Object.fromEntries(PLAN_IDS.map((id) => [id, merge(DEFAULT_PLANS[id], overrides[id])]));

/** One org's plan: its tier, the admin's changes to the tier, then the org's own limits. */
export function planFor(tier, overrides = {}, orgLimits = {}) {
  const id = PLAN_IDS.includes(tier) ? tier : 'free';
  return { ...merge(merge(DEFAULT_PLANS[id], overrides[id]), orgLimits), id };
}

/** How much of each limit a set of org documents uses. */
export function usageOf(docs) {
  const nodes = Object.values(docs.strategy?.nodes ?? {});
  return {
    users: Object.values(docs.org?.staff ?? {}).filter((s) => /@/.test(s.email ?? '')).length,
    maps: Object.keys(docs.maps?.maps ?? {}).length,
    frameworks: nodes.filter((n) => n.type === 'framework').length,
    plans: nodes.filter((n) => n.type === 'plan').length,
    dashboards: Object.keys(docs.dashboards?.dashboards ?? {}).length,
    sites: Object.keys(docs.org?.sites ?? {}).length,
    shows: Object.keys(docs.podcasts?.podcasts ?? {}).length,
    documents: Object.keys(docs.library?.items ?? {}).length,
  };
}

/** Which document holds each counted thing. */
export const COUNTED_IN = { org: ['users', 'sites'], maps: ['maps'], strategy: ['frameworks', 'plans'], dashboards: ['dashboards'], podcasts: ['shows'], library: ['documents'] };

/**
 * Whether saving `next` in place of `prev` would go past the plan. Things
 * already over the limit (after a downgrade) can stay; only new ones are
 * refused. Returns a sentence saying why, or null.
 */
export function overLimit(plan, name, prev, next) {
  for (const field of COUNTED_IN[name] ?? []) {
    const max = plan.limits[field];
    if (max == null) continue;
    const before = usageOf({ [name]: prev })[field];
    const after = usageOf({ [name]: next })[field];
    if (after > max && after > before) return limitText(plan, field);
  }
  return null;
}

export function limitText(plan, field) {
  const l = LIMITS.find((x) => x.id === field);
  const max = plan.limits[field];
  const what = max === 0 ? `doesn’t include ${l.label.toLowerCase()}` : `includes ${amount(max, l)} ${max === 1 ? l.label.toLowerCase().replace(/s$/, '') : l.label.toLowerCase()}`;
  return `The ${plan.label} plan ${what}. Ask your platform admin about a larger plan.`;
}

/** "5", "1 GB", "No limit". */
export function amount(v, l) {
  if (v == null) return 'No limit';
  if (l?.unit === 'MB') return v >= 1024 ? `${+(v / 1024).toFixed(1)} GB` : `${v} MB`;
  if (l?.unit === 'K') return v >= 1000 ? `${+(v / 1000).toFixed(1)} million` : `${v} thousand`;
  return String(v);
}

/** Whether the org's plan lets it add one more of `field`, given how many it has (for buttons). */
export function canAdd(org, field, count) {
  const max = org.platform?.plan?.limits?.[field];
  return max == null || count < max;
}

/** The tax inside a price that includes it, to the cent: $113 with 13% HST holds $13.00. */
export const taxInsideOf = (amount, rate) => (Math.round((amount * rate / (100 + rate)) * 100) / 100).toFixed(2);
