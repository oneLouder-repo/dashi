/**
 * Linked organisations (alpha 0.5): the links between a hub org and its
 * member orgs, and what each org lets its network see. The filters that
 * decide what travels are pure, in src/platform/network.js.
 *
 *   GET    /api/network                    my links, the orgs in my network, my sharing choices
 *   POST   /api/network/invite             { slug, as: 'member' | 'hub' }  admin; the plan must include linked orgs
 *   POST   /api/network/links/<id>/accept  admin of the invited org
 *   DELETE /api/network/links/<id>         admin of either org: decline, cancel or end
 *   POST   /api/network/share              { people, eco, mobilize, library: [folderIds] }  admin
 *   GET    /api/network/shared?kind=…      what my network shares of one kind (people, eco, library, mobilize)
 *
 * Nothing crosses between orgs unless the org that holds it has switched
 * that kind on, and a member only sees a kind whose plugin they can use at
 * home. Every change goes in the audit log.
 */
import { HttpError, json, readJson } from './http.js';
import { networkOf, sharedFor, shareKind, shareOf } from '../src/platform/network.js';

export const NETWORK_SCHEMA = [
  `CREATE TABLE org_links (
     id TEXT PRIMARY KEY,
     hub_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
     member_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
     status TEXT NOT NULL DEFAULT 'pending', invited_by TEXT NOT NULL,
     created_by TEXT, created_at TEXT NOT NULL, accepted_by TEXT, accepted_at TEXT, ended_at TEXT);
   CREATE INDEX org_links_hub ON org_links (hub_id);
   CREATE INDEX org_links_member ON org_links (member_id);`,
];

/** The doc each kind reads, besides the org doc. */
const KIND_DOC = { people: null, eco: 'eco', library: 'library', mobilize: 'mobilize' };

const linkOf = (r) => ({ id: r.id, hubId: r.hub_id, memberId: r.member_id, status: r.status, invitedBy: r.invited_by, createdAt: r.created_at, acceptedAt: r.accepted_at });

/** Every live (pending or active) link, as networkOf wants them. */
export function liveLinks(q) {
  return q("SELECT * FROM org_links WHERE status IN ('pending', 'active')").all().map(linkOf);
}

/** Link two orgs straight away (the client seeds use this; people go through invite and accept). */
export function linkOrgs(q, now, newId, hubId, memberId) {
  const had = q("SELECT id FROM org_links WHERE hub_id = ? AND member_id = ? AND status IN ('pending', 'active')").get(hubId, memberId);
  if (had) { q("UPDATE org_links SET status = 'active', accepted_at = COALESCE(accepted_at, ?) WHERE id = ?").run(now(), had.id); return had.id; }
  const id = newId('lnk');
  q("INSERT INTO org_links (id, hub_id, member_id, status, invited_by, created_at, accepted_at) VALUES (?, ?, ?, 'active', 'hub', ?, ?)").run(id, hubId, memberId, now(), now());
  return id;
}

/**
 * @param {{ q: (sql: string) => any, now: () => string, newId: (p: string) => string,
 *   orgById: (id: string) => any, orgBySlug: (slug: string) => any, readDoc: (orgId: string, name: string) => any,
 *   writeDoc: (orgId: string, name: string, doc: any, userId?: string | null) => number,
 *   mayLink: (org: any) => boolean, mayUse: (a: any, pluginId: string) => boolean,
 *   audit: (a: any, action: string, target?: any, detail?: any, req?: any) => void,
 *   announce?: (orgId: string, name: string, by: any) => void }} deps
 */
export function networkRoutes({ q, now, newId, orgById, orgBySlug, readDoc, writeDoc, mayLink, mayUse, audit, announce = () => {} }) {
  const card = (id, role) => { const o = orgById(id); return o ? { id: o.id, name: o.name, slug: o.slug, role } : null; };
  const needAdmin = (a) => { if (!a.canAdmin) throw new HttpError(403, 'Only your organisation’s admins can change its network'); };

  async function handle(req, res, a, path) {
    if (!path.startsWith('/api/network')) return false;
    if (!a.org || !a.member) throw new HttpError(401, 'Sign in to your organisation first');
    const method = req.method;
    const me = a.org.id;
    let m;

    if (path === '/api/network' && method === 'GET') {
      const mine = q('SELECT * FROM org_links WHERE (hub_id = ? OR member_id = ?) AND status != ?').all(me, me, 'ended').map(linkOf);
      const net = networkOf(me, liveLinks(q));
      const orgs = [...net].map(([id, role]) => card(id, role)).filter(Boolean);
      const other = (l) => (l.hubId === me ? card(l.memberId, 'member') : card(l.hubId, 'hub'));
      return json(res, 200, {
        allowed: !!mayLink(a.org),
        share: shareOf(readDoc(me, 'org')),
        links: mine.map((l) => ({ ...l, other: other(l), waitingOnUs: l.status === 'pending' && ((l.invitedBy === 'hub') === (l.memberId === me)) })),
        orgs,
      });
    }

    if (path === '/api/network/invite' && method === 'POST') {
      needAdmin(a);
      if (!mayLink(a.org)) throw new HttpError(402, 'Linking organisations comes with the Network plan. Ask us about it.');
      const body = await readJson(req, 2_000);
      const as = body?.as === 'hub' ? 'hub' : 'member';
      const other = orgBySlug(String(body?.slug ?? '').trim().toLowerCase().replace(/\..*$/, ''));
      if (!other || other.status !== 'active') throw new HttpError(404, 'No organisation has that address');
      if (other.id === me) throw new HttpError(400, 'That is your own organisation');
      // 'as' is what the other org would be: invite them as a member, or ask them to be our hub.
      const hubId = as === 'member' ? me : other.id;
      const memberId = as === 'member' ? other.id : me;
      if (q("SELECT 1 FROM org_links WHERE ((hub_id = ? AND member_id = ?) OR (hub_id = ? AND member_id = ?)) AND status IN ('pending', 'active')").get(hubId, memberId, memberId, hubId)) {
        throw new HttpError(409, 'You are already linked with that organisation, or an invitation is waiting');
      }
      const id = newId('lnk');
      q("INSERT INTO org_links (id, hub_id, member_id, status, invited_by, created_by, created_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)")
        .run(id, hubId, memberId, as === 'member' ? 'hub' : 'member', a.user?.id ?? null, now());
      audit(a, 'network.invite', other.slug, { link: id, as }, req);
      announce(other.id, 'network', null);
      return json(res, 200, linkOf(q('SELECT * FROM org_links WHERE id = ?').get(id)));
    }

    if ((m = path.match(/^\/api\/network\/links\/([\w-]+)(\/accept)?$/))) {
      needAdmin(a);
      const row = q('SELECT * FROM org_links WHERE id = ?').get(m[1]);
      if (!row || (row.hub_id !== me && row.member_id !== me) || row.status === 'ended') throw new HttpError(404, 'No such link');
      const l = linkOf(row);
      const otherId = l.hubId === me ? l.memberId : l.hubId;
      if (m[2] && method === 'POST') {
        const invitedSide = l.invitedBy === 'hub' ? l.memberId : l.hubId;
        if (l.status !== 'pending' || invitedSide !== me) throw new HttpError(409, 'There is nothing for you to accept here');
        q("UPDATE org_links SET status = 'active', accepted_by = ?, accepted_at = ? WHERE id = ?").run(a.user?.id ?? null, now(), l.id);
        audit(a, 'network.accept', orgById(otherId)?.slug ?? otherId, { link: l.id }, req);
        announce(otherId, 'network', null);
        return json(res, 200, linkOf(q('SELECT * FROM org_links WHERE id = ?').get(l.id)));
      }
      if (!m[2] && method === 'DELETE') {
        q("UPDATE org_links SET status = 'ended', ended_at = ? WHERE id = ?").run(now(), l.id);
        audit(a, l.status === 'pending' ? 'network.decline' : 'network.end', orgById(otherId)?.slug ?? otherId, { link: l.id }, req);
        announce(otherId, 'network', null);
        return json(res, 200, { ok: true });
      }
    }

    if (path === '/api/network/share' && method === 'POST') {
      needAdmin(a);
      const body = await readJson(req, 20_000);
      const org = readDoc(me, 'org') ?? {};
      const lib = readDoc(me, 'library');
      const folders = new Set(Object.keys(lib?.folders ?? {}));
      const share = {
        people: body?.people === true, eco: body?.eco === true, mobilize: body?.mobilize === true,
        library: (Array.isArray(body?.library) ? body.library : []).filter((x) => typeof x === 'string' && folders.has(x)).slice(0, 200),
      };
      writeDoc(me, 'org', { ...org, network: { ...(org.network ?? {}), share } }, a.user?.id ?? null);
      audit(a, 'network.share', null, share, req);
      announce(me, 'org', a.user?.id ?? null);
      return json(res, 200, { share });
    }

    if (path === '/api/network/shared' && method === 'GET') {
      const kind = new URL(req.url, 'http://x').searchParams.get('kind') ?? '';
      const k = shareKind(kind);
      if (!k) throw new HttpError(400, 'Unknown kind');
      // A kind whose plugin you can't use at home stays closed from the network too.
      if (k.plugin && !mayUse(a, k.plugin)) throw new HttpError(403, 'Your organisation doesn’t use that plugin');
      const net = networkOf(me, liveLinks(q).filter((l) => l.status === 'active'));
      const out = [];
      for (const [id, role] of net) {
        const o = orgById(id);
        if (!o || o.status !== 'active') continue;
        const docs = { org: readDoc(id, 'org') };
        if (KIND_DOC[kind]) docs[KIND_DOC[kind]] = readDoc(id, KIND_DOC[kind]);
        const data = sharedFor(kind, docs);
        if (data) out.push({ org: { id: o.id, name: o.name, slug: o.slug, role }, data });
      }
      return json(res, 200, { kind, orgs: out });
    }

    return false;
  }
  return { handle };
}
