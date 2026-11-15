import { apaReference, apaCitation, creatorsBy, yearOf, sortKey } from './library.js';

/**
 * Citation styles for the library, beside APA 7: Chicago author-date (17th),
 * MLA 9 and Harvard (Cite Them Right). Each gives a reference as runs of
 * text ([{ t, i }], i = italic, as apaReference does) and an in-text
 * citation, with an optional page or locator:
 *
 *   STYLES.mla.reference(meta)                -> runs
 *   STYLES.chicago.citation(meta, { page })   -> "(Okafor and Lee 2021, 14)"
 *   referenceList('harvard', metas)           -> runs[] in the style's order
 *
 * Also the two formats Zotero, EndNote and Mendeley swap besides CSL JSON:
 * toBibtex(items) and toRis(items).
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MLA_MONTHS = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const dateParts = (iso) => { const m = String(iso ?? '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); return m ? { y: m[1], m: m[2] ? +m[2] : null, d: m[3] ? +m[3] : null } : null; };
const end = (s) => (/[.?!]$/.test(s) ? s : `${s}.`);
const pagesOf = (meta) => (meta.page ? String(meta.page).replace(/-+/g, '–') : '');
const doiOrUrl = (meta) => (meta.DOI ? `https://doi.org/${String(meta.DOI).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : meta.URL ?? '');
const ordinal = (n) => {
  const x = parseInt(n, 10);
  if (!x) return String(n);
  return `${x}${x % 100 >= 11 && x % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[x % 10] ?? 'th')}`;
};
const initials = (given = '') => given.split(/\s+/).filter(Boolean).map((g) => g.split('-').map((p) => `${p[0].toUpperCase()}.`).join('-')).join('');
const family = (c) => c.literal ?? c.family ?? '';
const invertedFull = (c) => (c.literal ? c.literal : [c.family, c.given].filter(Boolean).join(', '));
const forwardFull = (c) => (c.literal ? c.literal : [c.given, c.family].filter(Boolean).join(' '));
const invertedInitials = (c) => (c.literal ? c.literal : [c.family, initials(c.given)].filter(Boolean).join(', '));

function runs() {
  const r = [];
  const add = (t, i = false) => { if (!t) return; const last = r.at(-1); if (last && last.i === i) last.t += t; else r.push({ t, i }); };
  const done = () => { if (r.length) r[r.length - 1].t = r.at(-1).t.replace(/\s+$/, ''); return r; };
  return { add, done };
}
const isContained = (type) => ['article-journal', 'article-magazine', 'article-newspaper', 'chapter', 'broadcast', 'webpage', 'paper-conference'].includes(type);

/* ---------------------------------------------------------- Chicago author-date */
function chicagoNames(list) {
  if (!list.length) return '';
  if (list.length > 10) return `${list.slice(0, 7).map((c, i) => (i === 0 ? invertedFull(c) : forwardFull(c))).join(', ')}, et al.`;
  const names = list.map((c, i) => (i === 0 ? invertedFull(c) : forwardFull(c)));
  return names.length === 1 ? names[0] : names.length === 2 ? `${names[0]}, and ${names[1]}` : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
}
function chicagoReference(meta) {
  const { add, done } = runs();
  const type = meta.type ?? 'document';
  const title = (meta.title || 'Untitled').trim().replace(/[.]$/, '');
  const authors = creatorsBy(meta, 'author').concat(creatorsBy(meta, 'host'));
  const editors = creatorsBy(meta, 'editor');
  const year = yearOf(meta.issued) || 'n.d.';
  const quoted = isContained(type);
  if (authors.length) add(`${end(chicagoNames(authors))} `);
  else if (editors.length) add(`${chicagoNames(editors)}, ${editors.length > 1 ? 'eds' : 'ed'}. `);
  add(`${year}. `);
  if (quoted) add(`“${title}.” `); else { add(title, true); add('. '); }
  const d = dateParts(meta.issued);
  switch (type) {
    case 'article-journal':
      if (meta.containerTitle) {
        add(meta.containerTitle, true);
        if (meta.volume) add(` ${meta.volume}`);
        if (meta.issue) add(` (${meta.issue})`);
        add(pagesOf(meta) ? `: ${pagesOf(meta)}. ` : '. ');
      }
      break;
    case 'article-magazine':
    case 'article-newspaper':
      if (meta.containerTitle) { add(meta.containerTitle, true); add(d?.m ? `, ${MONTHS[d.m - 1]}${d.d ? ` ${d.d}` : ''}. ` : '. '); }
      break;
    case 'chapter':
      add('In ');
      add(meta.containerTitle || 'Untitled book', true);
      if (editors.length) add(`, edited by ${editors.map(forwardFull).join(' and ')}`);
      add(pagesOf(meta) ? `, ${pagesOf(meta)}. ` : '. ');
      if (meta.publisher) add(`${end([meta.publisherPlace, meta.publisher].filter(Boolean).join(': '))} `);
      break;
    case 'webpage':
      if (meta.containerTitle) add(`${end(meta.containerTitle)} `);
      if (d?.m) add(`${MONTHS[d.m - 1]}${d.d ? ` ${d.d}` : ''}, ${d.y}. `);
      break;
    case 'thesis':
      add(`${end([meta.genre || 'PhD diss.', meta.publisher].filter(Boolean).join(', '))} `);
      break;
    case 'paper-conference':
      add(`${end(['Paper presented at', [meta.event, meta.eventPlace].filter(Boolean).join(', ')].filter(Boolean).join(' '))} `);
      break;
    case 'broadcast':
      if (meta.containerTitle) { add(meta.containerTitle, true); add(meta.number ? `, episode ${meta.number}. ` : '. '); }
      if (meta.publisher) add(`${end(meta.publisher)} `);
      break;
    default:
      if (meta.edition) add(`${ordinal(meta.edition)} ed. `);
      if (meta.number && type === 'report') add(`${end(`${meta.genre || 'Report'} ${meta.number}`)} `);
      if (meta.publisher) add(`${end([meta.publisherPlace, meta.publisher].filter(Boolean).join(': '))} `);
  }
  add(doiOrUrl(meta) ? `${end(doiOrUrl(meta))}` : '');
  return done();
}
function chicagoCitation(meta, { page = '', narrative = false } = {}) {
  const a = creatorsBy(meta, 'author');
  const who = !a.length ? `“${(meta.title || 'Untitled').split(/[:.?]/)[0]}”` : a.length === 1 ? family(a[0]) : a.length === 2 ? `${family(a[0])} and ${family(a[1])}` : a.length === 3 ? `${family(a[0])}, ${family(a[1])}, and ${family(a[2])}` : `${family(a[0])} et al.`;
  const y = yearOf(meta.issued) || 'n.d.';
  const loc = page ? `, ${page}` : '';
  return narrative ? `${who} (${y}${loc})` : `(${who} ${y}${loc})`;
}

/* ---------------------------------------------------------- MLA 9 */
function mlaNames(list) {
  if (!list.length) return '';
  if (list.length === 1) return invertedFull(list[0]);
  if (list.length === 2) return `${invertedFull(list[0])}, and ${forwardFull(list[1])}`;
  return `${invertedFull(list[0])}, et al.`;
}
function mlaDate(iso) {
  const d = dateParts(iso);
  if (!d) return '';
  return [d.d, d.m ? MLA_MONTHS[d.m - 1] : null, d.y].filter(Boolean).join(' ');
}
function mlaReference(meta) {
  const { add, done } = runs();
  const type = meta.type ?? 'document';
  const title = (meta.title || 'Untitled').trim().replace(/[.]$/, '');
  const authors = creatorsBy(meta, 'author').concat(creatorsBy(meta, 'host'));
  const editors = creatorsBy(meta, 'editor');
  const quoted = isContained(type);
  if (authors.length) add(`${end(mlaNames(authors))} `);
  else if (editors.length && !quoted) add(`${mlaNames(editors)}, ${editors.length > 1 ? 'editors' : 'editor'}. `);
  if (quoted) add(`“${title}.” `); else { add(title, true); add('. '); }
  // The container, then its details, separated by commas: MLA's core elements.
  const bits = [];
  if (quoted && meta.containerTitle) bits.push({ t: meta.containerTitle, i: true });
  if (type === 'chapter' && editors.length) bits.push({ t: `edited by ${editors.map(forwardFull).join(' and ')}` });
  if (meta.edition && !quoted) bits.push({ t: `${ordinal(meta.edition)} ed.` });
  if (meta.volume) bits.push({ t: `vol. ${meta.volume}` });
  if (meta.issue) bits.push({ t: `no. ${meta.issue}` });
  if (type === 'broadcast' && meta.number) bits.push({ t: `episode ${meta.number}` });
  const publisherNeeded = !['article-journal', 'article-magazine', 'article-newspaper'].includes(type) && meta.publisher
    && !(type === 'webpage' && meta.publisher === meta.containerTitle);
  if (publisherNeeded) bits.push({ t: meta.publisher });
  const date = ['article-newspaper', 'article-magazine', 'webpage', 'broadcast'].includes(type) ? mlaDate(meta.issued) : yearOf(meta.issued);
  if (date) bits.push({ t: date });
  if (pagesOf(meta)) bits.push({ t: `${/[–,]/.test(pagesOf(meta)) ? 'pp.' : 'p.'} ${pagesOf(meta)}` });
  const link = meta.DOI ? `https://doi.org/${String(meta.DOI).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}` : meta.URL ? meta.URL.replace(/^https?:\/\//, '') : '';
  if (link) bits.push({ t: link });
  bits.forEach((b, i) => { add(b.t, !!b.i); add(i < bits.length - 1 ? ', ' : '. '); });
  if (type === 'webpage' && meta.accessed) add(`Accessed ${mlaDate(meta.accessed)}.`);
  return done();
}
function mlaCitation(meta, { page = '', narrative = false } = {}) {
  const a = creatorsBy(meta, 'author');
  const short = (meta.title || 'Untitled').split(/[:.?]/)[0].split(' ').slice(0, 4).join(' ');
  const who = !a.length ? `“${short}”` : a.length === 1 ? family(a[0]) : a.length === 2 ? `${family(a[0])} and ${family(a[1])}` : `${family(a[0])} et al.`;
  if (narrative) return page ? `${who} (${page})` : who;
  return `(${who}${page ? ` ${page}` : ''})`;
}

/* ---------------------------------------------------------- Harvard (Cite Them Right) */
function harvardNames(list) {
  const names = list.map(invertedInitials);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
function harvardReference(meta) {
  const { add, done } = runs();
  const type = meta.type ?? 'document';
  const title = (meta.title || 'Untitled').trim().replace(/[.]$/, '');
  const authors = creatorsBy(meta, 'author').concat(creatorsBy(meta, 'host'));
  const editors = creatorsBy(meta, 'editor');
  const year = yearOf(meta.issued) || 'no date';
  const quoted = isContained(type);
  if (authors.length) add(`${harvardNames(authors)} `);
  else if (editors.length) add(`${harvardNames(editors)} (${editors.length > 1 ? 'eds.' : 'ed.'}) `);
  add(`(${year}) `);
  if (quoted) add(`‘${title}’, `); else { add(title, true); add(meta.edition ? `. ${ordinal(meta.edition)} edn. ` : '. '); }
  const d = dateParts(meta.issued);
  switch (type) {
    case 'article-journal':
    case 'article-magazine':
      add(meta.containerTitle || 'Untitled journal', true);
      if (meta.volume) add(`, ${meta.volume}${meta.issue ? `(${meta.issue})` : ''}`);
      add(pagesOf(meta) ? `, pp. ${pagesOf(meta)}. ` : '. ');
      break;
    case 'article-newspaper':
      add(meta.containerTitle || 'Untitled newspaper', true);
      if (d?.m) add(`, ${d.d ? `${d.d} ` : ''}${MONTHS[d.m - 1]}`);
      add(pagesOf(meta) ? `, p. ${pagesOf(meta)}. ` : '. ');
      break;
    case 'chapter':
      add('in ');
      if (editors.length) add(`${harvardNames(editors)} (${editors.length > 1 ? 'eds.' : 'ed.'}) `);
      add(meta.containerTitle || 'Untitled book', true);
      add('. ');
      if (meta.publisher) add(`${[meta.publisherPlace, meta.publisher].filter(Boolean).join(': ')}, `);
      add(pagesOf(meta) ? `pp. ${pagesOf(meta)}. ` : '');
      break;
    case 'webpage':
      if (meta.containerTitle) add(`${meta.containerTitle}. `);
      break;
    case 'thesis':
      add(`${end([meta.genre || 'PhD thesis', meta.publisher].filter(Boolean).join('. '))} `);
      break;
    case 'broadcast':
      if (meta.containerTitle) { add(meta.containerTitle, true); add('. '); }
      add(`[${meta.medium || 'Podcast'}]. `);
      break;
    default:
      if (meta.publisher) add(`${end([meta.publisherPlace, meta.publisher].filter(Boolean).join(': '))} `);
  }
  if (doiOrUrl(meta)) {
    add(meta.DOI ? `Available at: ${doiOrUrl(meta)}` : `Available at: ${meta.URL}`);
    add(meta.accessed ? ` (Accessed: ${(() => { const a = dateParts(meta.accessed); return a ? [a.d, a.m ? MONTHS[a.m - 1] : null, a.y].filter(Boolean).join(' ') : ''; })()}).` : '.');
  }
  return done();
}
function harvardCitation(meta, { page = '', narrative = false } = {}) {
  const a = creatorsBy(meta, 'author');
  const who = !a.length ? (meta.title || 'Untitled').split(/[:.?]/)[0] : a.length === 1 ? family(a[0]) : a.length <= 3 ? `${a.slice(0, -1).map(family).join(', ')} and ${family(a.at(-1))}` : `${family(a[0])} et al.`;
  const y = yearOf(meta.issued) || 'no date';
  const loc = page ? `, p. ${page}` : '';
  return narrative ? `${who} (${y}${loc})` : `(${who}, ${y}${loc})`;
}

/* ---------------------------------------------------------- the list */
const apaWithPage = (meta, { page = '', narrative = false } = {}) => {
  const c = apaCitation(meta, { narrative });
  return page ? c.replace(/\)$/, `, p. ${page})`) : c;
};

export const STYLES = {
  apa: { id: 'apa', label: 'APA 7', long: 'APA 7th edition', reference: apaReference, citation: apaWithPage, listTitle: 'References' },
  chicago: { id: 'chicago', label: 'Chicago', long: 'Chicago author-date (17th)', reference: chicagoReference, citation: chicagoCitation, listTitle: 'References' },
  mla: { id: 'mla', label: 'MLA 9', long: 'MLA 9th edition', reference: mlaReference, citation: mlaCitation, listTitle: 'Works Cited' },
  harvard: { id: 'harvard', label: 'Harvard', long: 'Harvard (Cite Them Right)', reference: harvardReference, citation: harvardCitation, listTitle: 'Reference list' },
};
export const styleOf = (id) => STYLES[id] ?? STYLES.apa;

/** A reference list in a style: sorted by first author (or title), then year. */
export const referenceList = (style, metas) => [...metas].sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(styleOf(style).reference);

/* ---------------------------------------------------------- BibTeX and RIS out */
const BIB_OUT = { 'article-journal': 'article', 'article-magazine': 'article', 'article-newspaper': 'article', book: 'book', chapter: 'incollection', report: 'techreport', thesis: 'phdthesis', 'paper-conference': 'inproceedings', webpage: 'online', dataset: 'dataset', manuscript: 'unpublished' };
const bibEscape = (s) => String(s).replace(/([&%$#_])/g, '\\$1').replace(/[{}]/g, '');
/** A citation key like "okafor2021mapping", unique within the export. */
function citeKey(meta, used) {
  const a = creatorsBy(meta, 'author')[0];
  const base = `${(a ? family(a) : 'anon').toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '') || 'anon'}${yearOf(meta.issued) || 'nd'}${((meta.title || '').toLowerCase().normalize('NFKD').match(/[a-z]{4,}/) ?? [''])[0]}`;
  let key = base, n = 1;
  while (used.has(key)) key = `${base}${String.fromCharCode(96 + ++n)}`;
  used.add(key);
  return key;
}
export function toBibtex(items) {
  const used = new Set();
  return items.map((item) => {
    const m = item.meta ?? {};
    const people = (role) => creatorsBy(m, role).map((c) => (c.literal ? `{${bibEscape(c.literal)}}` : `${bibEscape(c.family ?? '')}, ${bibEscape(c.given ?? '')}`)).join(' and ');
    const container = { 'article-journal': 'journal', 'article-magazine': 'journal', 'article-newspaper': 'journal', chapter: 'booktitle', 'paper-conference': 'booktitle', webpage: 'organization' }[m.type] ?? null;
    const fields = [
      ['author', people('author') || people('host')], ['editor', people('editor')], ['title', m.title && `{${bibEscape(m.title)}}`],
      [container ?? 'note', container ? m.containerTitle && bibEscape(m.containerTitle) : null],
      ['year', yearOf(m.issued)], ['month', dateParts(m.issued)?.m ? String(dateParts(m.issued).m) : ''], ['volume', m.volume], ['number', m.issue || m.number],
      ['pages', m.page && String(m.page).replace(/[–-]+/g, '--')], ['edition', m.edition], [m.type === 'thesis' ? 'school' : m.type === 'report' ? 'institution' : 'publisher', m.publisher && bibEscape(m.publisher)],
      ['address', m.publisherPlace && bibEscape(m.publisherPlace)], ['series', m.collectionTitle && bibEscape(m.collectionTitle)], ['type', m.genre && bibEscape(m.genre)],
      ['doi', m.DOI], ['isbn', m.ISBN], ['issn', m.ISSN], ['url', m.URL], ['urldate', m.accessed], ['abstract', m.abstract && bibEscape(m.abstract)],
      ['keywords', [...new Set([...(m.keywords ?? []), ...(item.tags ?? [])])].map(bibEscape).join(', ')], ['langid', m.language],
    ].filter(([, v]) => v);
    return `@${BIB_OUT[m.type] ?? 'misc'}{${citeKey(m, used)},\n${fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
  }).join('\n\n') + '\n';
}

const RIS_OUT = { 'article-journal': 'JOUR', 'article-magazine': 'MGZN', 'article-newspaper': 'NEWS', book: 'BOOK', chapter: 'CHAP', report: 'RPRT', thesis: 'THES', 'paper-conference': 'CPAPER', webpage: 'ELEC', dataset: 'DATA', legislation: 'BILL', broadcast: 'SOUND', manuscript: 'UNPB' };
export function toRis(items) {
  return items.map((item) => {
    const m = item.meta ?? {};
    const lines = [['TY', RIS_OUT[m.type] ?? 'GEN']];
    const push = (tag, v) => { if (v) lines.push([tag, String(v).replace(/\s+/g, ' ').trim()]); };
    for (const c of creatorsBy(m, 'author').concat(creatorsBy(m, 'host'))) push('AU', c.literal ?? `${c.family}, ${c.given ?? ''}`.replace(/, $/, ''));
    for (const c of creatorsBy(m, 'editor')) push('ED', c.literal ?? `${c.family}, ${c.given ?? ''}`.replace(/, $/, ''));
    push('TI', m.title);
    push(m.type === 'article-journal' || m.type === 'article-magazine' ? 'JO' : 'T2', m.containerTitle);
    const d = dateParts(m.issued);
    if (d) { push('PY', d.y); push('DA', [d.y, d.m && String(d.m).padStart(2, '0'), d.d && String(d.d).padStart(2, '0')].filter(Boolean).join('/')); }
    push('VL', m.volume); push('IS', m.issue || m.number);
    const [sp, ep] = String(m.page ?? '').split(/[–-]+/);
    push('SP', sp); push('EP', ep);
    push('ET', m.edition); push('PB', m.publisher); push('CY', m.publisherPlace); push('T3', m.collectionTitle); push('M3', m.genre);
    push('DO', m.DOI); push('SN', m.ISBN || m.ISSN); push('UR', m.URL); push('Y2', m.accessed); push('AB', m.abstract); push('LA', m.language);
    for (const k of new Set([...(m.keywords ?? []), ...(item.tags ?? [])])) push('KW', k);
    lines.push(['ER', '']);
    return lines.map(([t, v]) => `${t}  - ${v}`.trimEnd()).join('\n');
  }).join('\n\n') + '\n';
}
