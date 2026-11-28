/**
 * The light markdown that page bodies, legal pages and documents use, parsed
 * into a small tree (no HTML). Kept free of other imports so any page,
 * including Dashi's own public site, can use it.
 */
export const EMBEDS = ['dashboard', 'episode', 'show', 'calculator', 'story', 'map', 'form'];

/**
 * Parse the light markdown that page bodies use into a small tree. Nothing
 * here makes HTML, so a body can never inject markup; ui/markdown.js turns
 * the tree into DOM nodes.
 *
 * Blocks:  { t: 'h', level, c } { t: 'p', c } { t: 'ul' | 'ol', items: [c] }
 *          { t: 'quote', c } { t: 'hr' } { t: 'embed', kind, id }
 *          { t: 'table', head: [c], rows: [[c]] }  (| a | b | lines; a |---| line ends the head)
 * Inline:  { t: 'text', v } { t: 'b' | 'i', c } { t: 'code', v } { t: 'a', href, c }
 */
export function parseMarkdown(src = '', { embeds = EMBEDS } = {}) {
  const blocks = [];
  let para = [];
  let list = null;
  let table = null;
  const flushTable = () => { if (table) blocks.push(table); table = null; };
  const flushPara = () => { if (para.length) blocks.push({ t: 'p', c: parseInline(para.join(' ')) }); para = []; };
  const flushList = () => { if (list) blocks.push(list); list = null; };
  const flush = () => { flushPara(); flushList(); flushTable(); };

  for (const raw of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flush(); continue; }
    if (/^\|.*\|$/.test(line)) {
      flushPara(); flushList();
      const cells = line.slice(1, -1).split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { if (table && !table.rows.length) table.head = table.pending ?? table.head; continue; }
      table ??= { t: 'table', head: null, rows: [] };
      if (!table.head && !table.rows.length && !table.pending) table.pending = cells.map(parseInline);
      else if (table.pending && !table.head) { table.rows.push(table.pending); delete table.pending; table.rows.push(cells.map(parseInline)); }
      else table.rows.push(cells.map(parseInline));
      continue;
    }
    flushTable();
    if ((m = line.match(/^\[\[(\w+):([\w-]+)\]\]$/)) && embeds.includes(m[1])) { flush(); blocks.push({ t: 'embed', kind: m[1], id: m[2] }); continue; }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flush(); blocks.push({ t: 'h', level: m[1].length + 1, c: parseInline(m[2]) }); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flush(); blocks.push({ t: 'hr' }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ t: 'quote', c: parseInline(m[1]) }); continue; }
    if ((m = line.match(/^([-*]|\d+[.)])\s+(.*)$/))) {
      flushPara();
      const t = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list?.t !== t) { flushList(); list = { t, items: [] }; }
      list.items.push(parseInline(m[2]));
      continue;
    }
    flushList();
    para.push(line);
  }
  flush();
  for (const b of blocks) if (b.t === 'table' && b.pending) { if (b.head) delete b.pending; else { b.rows.unshift(b.pending); delete b.pending; } }
  return blocks;
}

/** Links may go to the web, email, or another page of the site; nothing else (no javascript: URLs). */
export const safeHref = (href) => (/^(https?:|mailto:)/i.test(href) || /^[\w./?#=&%-]+$/.test(href) && !/^\w+:/.test(href) ? href : null);

export function parseInline(s) {
  const out = [];
  const text = (v) => { if (!v) return; const last = out.at(-1); if (last?.t === 'text') last.v += v; else out.push({ t: 'text', v }); };
  const re = /`([^`]+)`|\*\*(.+?)\*\*|(?:^|(?<=[\s(]))[_*](?![\s_*])(.+?)(?<!\s)[_*](?=$|[\s.,;:!?)])|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let i = 0;
  let m;
  while ((m = re.exec(s))) {
    text(s.slice(i, m.index));
    if (m[1] != null) out.push({ t: 'code', v: m[1] });
    else if (m[2] != null) out.push({ t: 'b', c: parseInline(m[2]) });
    else if (m[3] != null) out.push({ t: 'i', c: parseInline(m[3]) });
    else {
      const href = safeHref(m[5]);
      if (href) out.push({ t: 'a', href, c: parseInline(m[4]) });
      else text(m[4]);
    }
    i = m.index + m[0].length;
  }
  text(s.slice(i));
  return out;
}
