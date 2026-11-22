/**
 * Polite fetching for the tip harvester: it reads each site's robots.txt and
 * keeps out of what it disallows, waits between requests to the same site,
 * gives up after a timeout, and stops reading past a size cap. It says who it
 * is in its User-Agent and only ever asks for pages listed in the registry.
 */
export const HARVESTER_AGENT = 'DashiTipHarvester/0.1 (tip refresh for a nonprofit planning tool; registry pages only)';

/** The Disallow rules for our agent (or *) from a robots.txt. */
export function robotsRules(txt, agent = 'DashiTipHarvester') {
  const groups = [];
  let cur = null;
  for (const raw of String(txt ?? '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    const key = k.toLowerCase();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(v.toLowerCase());
    } else if (cur && (key === 'disallow' || key === 'allow')) cur.rules.push({ allow: key === 'allow', path: v });
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)));
  return (mine ?? groups.find((g) => g.agents.includes('*')))?.rules ?? [];
}

/** May we fetch this path? The longest matching rule wins; an empty Disallow allows everything. */
export function robotsAllow(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue;
    const pat = new RegExp(`^${r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
    if (pat.test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return !best || best.allow;
}

/**
 * A fetcher that remembers robots.txt per site and spaces out requests.
 * Returns { ok, status, text?, reason? } and never throws.
 */
export function politeFetcher({ gapMs = 5000, timeoutMs = 15000, maxBytes = 2 * 1048576, fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  const robots = new Map();
  const last = new Map();
  const get = async (url) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': HARVESTER_AGENT, accept: 'text/html,text/plain;q=0.9' }, signal: ac.signal, redirect: 'follow' });
      if (!res.ok) return { ok: false, status: res.status, reason: `the site said ${res.status}` };
      const type = res.headers.get('content-type') ?? '';
      if (type && !/text\/(html|plain)|xhtml/.test(type)) return { ok: false, status: res.status, reason: `not a web page (${type.split(';')[0]})` };
      const reader = res.body?.getReader?.();
      if (!reader) return { ok: true, status: res.status, text: (await res.text()).slice(0, maxBytes) };
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        chunks.push(value);
        if (size >= maxBytes) { await reader.cancel(); break; }
      }
      return { ok: true, status: res.status, text: new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes)) };
    } catch (err) {
      return { ok: false, status: 0, reason: err.name === 'AbortError' ? 'timed out' : err.message };
    } finally { clearTimeout(t); }
  };
  const wait = async (host) => {
    const since = now() - (last.get(host) ?? -Infinity);
    if (since < gapMs) await sleep(gapMs - since);
    last.set(host, now());
  };
  return async function politeFetch(url) {
    let u;
    try { u = new URL(url); } catch { return { ok: false, status: 0, reason: 'not a web address' }; }
    if (!/^https?:$/.test(u.protocol)) return { ok: false, status: 0, reason: 'not a web address' };
    if (!robots.has(u.host)) {
      await wait(u.host);
      const r = await get(`${u.protocol}//${u.host}/robots.txt`);
      robots.set(u.host, r.ok ? robotsRules(r.text) : []);
    }
    if (!robotsAllow(robots.get(u.host), u.pathname + u.search)) return { ok: false, status: 0, reason: 'robots.txt asks us not to' };
    await wait(u.host);
    return get(url);
  };
}
