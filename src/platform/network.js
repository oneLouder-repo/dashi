/**
 * Linked organisations (alpha 0.5, d 2026-11-28): a hub org and its member
 * orgs form a network. Each org stays separate, with its own documents and
 * people. Nothing crosses between orgs unless the org that holds it chooses
 * to share it with its network.
 *
 *   A link:     { id, hubId, memberId, status: 'pending' | 'active' | 'ended', invitedBy: 'hub' | 'member' }
 *   A network:  for an org, the orgs it is actively linked with: its hubs, its
 *               members, and its hubs' other members (siblings).
 *   Sharing:    org.network.share = { people, eco, library, mobilize } chosen
 *               by the org's admin (Organisation → Network). Each is off until
 *               switched on, and each is cut down by a filter below, so even a
 *               shared document only sends what is meant to travel.
 *
 * These are pure functions: the server uses them to answer
 * GET /api/network/shared, and the tests call the same ones.
 */

export const SHARE_KINDS = [
  { id: 'people', label: 'People directory', about: 'Names, titles, teams and interests of your people (never emails or phone numbers)', plugin: null },
  { id: 'eco', label: 'EoViz data', about: 'Sites, readings and files of partners that chose to share with the network or the public. Held-back sites never show where they are.', plugin: 'eoviz' },
  { id: 'library', label: 'Library folders', about: 'References and Dashi docs in the folders you pick (uploaded files stay here)', plugin: 'library' },
  { id: 'mobilize', label: 'Knowledge objects', about: 'Objects shared as Open or with Partners; held and internal ones never travel', plugin: 'mobilize' },
];
export const shareKind = (id) => SHARE_KINDS.find((k) => k.id === id) ?? null;

/** An org's sharing choices, with every kind off unless chosen. */
export function shareOf(orgDoc) {
  const s = orgDoc?.network?.share ?? {};
  return {
    people: s.people === true,
    eco: s.eco === true,
    mobilize: s.mobilize === true,
    library: Array.isArray(s.library) ? s.library.filter((x) => typeof x === 'string') : [],
  };
}

/** The orgs in an org's network, from its active links: hubs, members and siblings, never itself. */
export function networkOf(orgId, links) {
  const active = links.filter((l) => l.status === 'active');
  const hubs = active.filter((l) => l.memberId === orgId).map((l) => l.hubId);
  const members = active.filter((l) => l.hubId === orgId).map((l) => l.memberId);
  const siblings = active.filter((l) => hubs.includes(l.hubId)).map((l) => l.memberId);
  const out = new Map();
  for (const id of hubs) out.set(id, 'hub');
  for (const id of members) if (!out.has(id)) out.set(id, 'member');
  for (const id of siblings) if (!out.has(id)) out.set(id, 'sibling');
  out.delete(orgId);
  return out;
}

/* ---------------------------------------------------------------- filters */

/** People: a directory card each, nothing private. */
export function sharedPeople(orgDoc) {
  return Object.values(orgDoc?.staff ?? {})
    .filter((s) => s.roleId !== 'guest' && s.name)
    .map((s) => ({ id: s.id, name: s.name, title: s.title ?? '', teams: (s.teamIds ?? []).map((t) => orgDoc.teams?.[t]?.name).filter(Boolean), interests: (s.interests ?? []).slice(0, 12), location: s.location ?? '' }));
}

/**
 * EoViz: only partners that chose 'network' or 'open', their sites, series
 * and file names. A held-back site keeps its readings but loses its place.
 */
export function sharedEco(eco) {
  const partners = Object.values(eco?.partners ?? {}).filter((p) => p.share === 'network' || p.share === 'open');
  const pids = new Set(partners.map((p) => p.id));
  const sites = Object.values(eco?.sites ?? {}).filter((s) => pids.has(s.partnerId)).map((s) => (s.held ? { ...s, geo: null } : s));
  const siteIds = new Set(sites.map((s) => s.id));
  const series = Object.values(eco?.series ?? {}).filter((x) => siteIds.has(x.siteId));
  const files = Object.values(eco?.files ?? {}).filter((f) => pids.has(f.partnerId)).map(({ id, name, format, rows, at, partnerId }) => ({ id, name, format, rows, at, partnerId }));
  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  return { partners: byId(partners), sites: byId(sites), series: byId(series), files: byId(files), collections: sharedCollections(eco, pids) };
}

/** Ocean collections (cruises, tracks, moorings) of sharing partners. */
function sharedCollections(eco, pids) {
  return Object.fromEntries(Object.values(eco?.collections ?? {}).filter((c) => pids.has(c.partnerId)).map((c) => [c.id, c]));
}

/** Library: items in the chosen folders (and folders inside them); uploaded files send their details, not the file. */
export function sharedLibrary(lib, folderIds) {
  const want = new Set(folderIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of Object.values(lib?.folders ?? {})) if (f.parentId && want.has(f.parentId) && !want.has(f.id)) { want.add(f.id); grew = true; }
  }
  const folders = Object.values(lib?.folders ?? {}).filter((f) => want.has(f.id));
  const items = Object.values(lib?.items ?? {}).filter((it) => want.has(it.folderId)).map((it) => {
    const { file, ...rest } = it;
    return file ? { ...rest, file: { name: file.name, size: file.size, type: file.type } } : rest;
  });
  return { folders: Object.fromEntries(folders.map((f) => [f.id, f])), items: Object.fromEntries(items.map((i) => [i.id, i])) };
}

/** Mobilize: Open and Partners objects only; who logged each piece of uptake stays home. */
export function sharedMobilize(doc) {
  const objects = Object.values(doc?.objects ?? {}).filter((o) => ['open', 'partners'].includes(o.consent?.share) && !o.consent?.ocap)
    .map((o) => ({ ...o, uptake: (o.uptake ?? []).map(({ by: _by, ...u }) => u), reviews: (o.reviews ?? []).map(({ by: _by, ...r }) => r) }));
  return { objects: Object.fromEntries(objects.map((o) => [o.id, o])) };
}

/** What one org sends its network for a kind, or null when it doesn't share that kind. */
export function sharedFor(kind, docs) {
  const share = shareOf(docs.org);
  switch (kind) {
    case 'people': return share.people ? sharedPeople(docs.org) : null;
    case 'eco': return share.eco ? sharedEco(docs.eco) : null;
    case 'library': return share.library.length ? sharedLibrary(docs.library, share.library) : null;
    case 'mobilize': return share.mobilize ? sharedMobilize(docs.mobilize) : null;
    default: return null;
  }
}
