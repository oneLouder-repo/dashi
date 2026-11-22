/**
 * The Report tab (Output before alpha 0.4): the report pack on paper, ready to print or save as a PDF.
 * Choose what goes in on the left; the page on the right is the document.
 * Printing hides everything but the paper (rhizome.css, @media print).
 *
 * Output(env); env = { ctx, doc, save, render, canSet, toast, org, tipsDoc }.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { buildReport, reportToMarkdown, REPORT_SECTIONS, defaultReportOptions } from './report.js';
import { analysisById } from './rules.js';

const THEME_TONE = { network: '#3e8fa6', leverage: '#7b2fe8', water: '#2c4fa3', abcd: '#ef7f2d', soar: '#4da65c', toc: '#c77deb', impact: '#e35a2c', hygiene: '#56657f', equity: '#c8432f', ai: '#2c4fa3', curriculum: '#4da65c', evaluation: '#f4a93b', place: '#3f8f6b' };
const toneOf = (label) => THEME_TONE[label] ?? '#5f8f3e';
let opts = null;

export function Output(env) {
  const { doc } = env;
  opts ??= { ...defaultReportOptions(), ...(doc.reportOptions ?? {}) };
  const c = env.ctx();
  const report = buildReport(c, doc, opts, { tipsDoc: env.tipsDoc(), orgName: env.org.name });
  const remember = () => { if (env.canSet) { doc.reportOptions = { ...opts }; env.save(); } env.render(); };
  const scopes = [['set', 'My set'], ...Object.values({ ...analysisById, ...(c.custom ?? {}) }).map((a) => [a.id, a.name])];

  const panel = h('aside', { class: 'rz-panel rp-options' },
    h('h3', {}, 'Your report pack'),
    h('p', { class: 'rz-note' }, 'Everything Rhizome found, with the tips, links and data behind it, as one document to print, save as a PDF, or share.'),
    h('label', { class: 'rz-field' }, h('span', {}, 'Title'), h('input', { class: 'input input-bordered input-sm', value: opts.title, placeholder: report.meta.title, onchange: (e) => { opts.title = e.target.value; remember(); } })),
    h('label', { class: 'rz-field' }, h('span', {}, 'Findings from'), h('select', { class: 'select select-bordered select-sm', onchange: (e) => { opts.scope = e.target.value; remember(); } }, scopes.map(([id, name]) => h('option', { value: id, selected: id === opts.scope }, name)))),
    h('label', { class: 'rz-field' }, h('span', {}, 'How many findings'), h('select', { class: 'select select-bordered select-sm', onchange: (e) => { opts.limit = Number(e.target.value); remember(); } }, [5, 10, 25, 50, 200].map((x) => h('option', { value: x, selected: x === opts.limit }, x === 200 ? 'All of them' : `The top ${x}`)))),
    h('fieldset', { class: 'rp-sections' }, h('legend', {}, 'Sections'),
      REPORT_SECTIONS.map((s) => h('label', {}, h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: opts.sections.includes(s.id), onchange: (e) => { opts.sections = e.target.checked ? REPORT_SECTIONS.map((x) => x.id).filter((id) => id === s.id || opts.sections.includes(id)) : opts.sections.filter((x) => x !== s.id); remember(); } }), s.label))),
    h('div', { class: 'rp-actions' },
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => window.print() }, icon('download', 14), 'Save as PDF'),
      h('button', { class: 'btn btn-sm btn-outline', onclick: async () => { try { await navigator.clipboard.writeText(reportToMarkdown(report)); env.toast('Copied as text: paste it into an email or a doc'); } catch { env.toast('This browser wouldn’t copy it'); } } }, icon('copy', 14), 'Copy as text')),
    h('p', { class: 'rz-note rp-tip' }, 'Save as PDF opens your browser’s print window: choose “Save as PDF” as the printer.'));

  return h('div', { class: 'rp-wrap' }, panel, h('div', { class: 'rp-desk' }, Paper(report)));
}

function Paper(r) {
  const m = r.meta;
  return h('article', { class: 'rp-paper' },
    h('header', { class: 'rp-cover' },
      h('div', { class: 'rp-brand' }, h('span', { class: 'rp-mark' }, icon('sec-rhizome', 18)), h('span', {}, 'Rhizome report'), h('em', {}, 'experimental')),
      h('h1', {}, m.title),
      h('p', { class: 'rp-sub' }, [m.org, `Prepared ${m.date}`, m.baseline ? `baseline ${m.baseline}` : null].filter(Boolean).join(' · ')),
      h('p', { class: 'rp-lede' }, m.summaryLine, m.dismissed ? ` ${m.dismissed} dismissed earlier, left out.` : ''),
      h('dl', { class: 'rp-meta' },
        h('dt', {}, 'Analyses'), h('dd', {}, m.analyses.map((a) => a.name).join(', ')),
        m.profile && [h('dt', {}, 'Tuned for'), h('dd', {}, `${m.profile.sector}${m.profile.themes.length ? `: ${m.profile.themes.join(', ')}` : ''}`)],
        m.profile?.serves ? [h('dt', {}, 'Who you serve'), h('dd', {}, m.profile.serves)] : null)),
    r.sections.map((s) => Section(s)),
    h('footer', { class: 'rp-foot' }, `Made with Rhizome in Dashi, ${m.date}. Tips are short summaries in our own words; each names where its idea comes from. Findings are prompts for a conversation, not verdicts.`));
}

function Section(s) {
  const head = h('h2', {}, s.title);
  if (s.id === 'summary') {
    return h('section', { class: 'rp-sec' }, head,
      h('div', { class: 'rp-stats' }, s.stats.map((x) => h('div', {}, h('b', {}, x.value.toLocaleString()), h('span', {}, x.label), x.delta ? h('em', {}, `${x.delta > 0 ? '+' : ''}${x.delta} since baseline`) : null))),
      s.themes.length ? h('div', { class: 'rp-themes' }, h('h3', {}, 'Findings by theme'), h('ul', {}, s.themes.map((t) => h('li', {}, h('span', {}, t.label), h('i', { style: `--w:${Math.round((100 * t.count) / s.themes[0].count)}%;--t:${toneOf(t.id)}` }), h('b', {}, t.count))))) : null,
      s.top.length ? h('div', { class: 'rp-top' }, h('h3', {}, 'Start here'), h('ol', {}, s.top.map((t) => h('li', {}, h('b', {}, t.title), h('p', {}, t.text))))) : null);
  }
  if (s.id === 'findings') {
    return h('section', { class: 'rp-sec' }, head,
      s.groups.length ? s.groups.map((g) => h('div', { class: 'rp-group', style: `--t:${toneOf(g.theme)}` },
        h('h3', {}, g.label, g.blurb ? h('small', {}, g.blurb) : null),
        g.items.map((f) => h('div', { class: 'rp-finding' },
          h('div', { class: 'rp-fhead' }, h('b', {}, f.title, f.own ? h('small', {}, ' · your rule') : null), h('span', { class: 'rp-score', title: 'Score, for ranking' }, h('i', {}, h('u', { style: `width:${Math.round(f.score * 100)}%` })), f.score.toFixed(2))),
          h('p', { class: 'rp-tiptext' }, f.text),
          f.also.length ? h('p', { class: 'rp-also' }, h('span', {}, `The same for ${f.also.length} more: `), f.also.map((x) => `${x.name} (${x.score.toFixed(2)})`).join(', ')) : null,
          f.about.length ? h('p', { class: 'rp-about' }, h('span', {}, 'About: '), f.about.map((x) => x.name).join(', '), f.more ? ` and ${f.more} more` : '') : null,
          h('p', { class: 'rp-why' }, h('span', {}, 'Why: '), `looked at ${f.looked}`, f.why.length ? `; ${f.why.join('; ')}` : '', '.'),
          f.source ? h('p', { class: 'rp-src' }, h('span', {}, 'The idea: '), f.source) : null,
          f.read.length ? h('p', { class: 'rp-read' }, h('span', {}, 'Read more: '), f.read.flatMap((x, i) => [i ? ' · ' : '', h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title), h('small', {}, ` ${x.url}`)])) : null)))) : h('p', {}, 'Nothing found this time.'),
      s.more > 0 ? h('p', { class: 'rp-note' }, `${s.more} more findings aren’t shown. Choose “All of them” to include them.`) : null);
  }
  if (s.id === 'data') {
    return h('section', { class: 'rp-sec' }, head,
      h('h3', {}, 'The most central actors'),
      h('table', { class: 'rp-table' }, h('thead', {}, h('tr', {}, ['Actor', 'Map', 'Zone', 'Links', 'Betweenness', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, s.actors.map((a) => h('tr', {}, h('td', {}, a.name), h('td', {}, a.map), h('td', {}, a.zone), h('td', {}, a.links), h('td', {}, a.betweenness), h('td', {}, a.cut ? 'single point of failure' : ''))))),
      h('div', { class: 'rp-two' },
        h('div', {}, h('h3', {}, 'Your calibration'), h('table', { class: 'rp-table' }, h('thead', {}, h('tr', {}, ['', '25%', 'median', '75%', '90%'].map((x) => h('th', {}, x)))), h('tbody', {}, s.calibration.map((c) => h('tr', {}, h('td', {}, c.label), ['p25', 'p50', 'p75', 'p90'].map((p) => h('td', {}, c[p] ?? '·'))))))),
        h('div', {}, h('h3', {}, 'Assets by ABCD type'), h('ul', { class: 'rp-bars' }, s.abcd.map((a) => h('li', {}, h('span', {}, a.label), h('i', { style: `--w:${Math.round(a.share * 100)}%;--t:${a.color}` }), h('b', {}, a.count)))))),
      h('h3', {}, 'Signals'),
      h('table', { class: 'rp-table' }, h('tbody', {}, s.signals.map((x) => h('tr', {}, h('td', {}, h('b', {}, x.count)), h('td', {}, x.label), h('td', { class: 'rp-muted' }, x.why))))));
  }
  if (s.id === 'reading') {
    return h('section', { class: 'rp-sec' }, head, h('ol', { class: 'rp-reading' }, s.items.map((x) => h('li', {},
      h('b', {}, x.url ? h('a', { href: x.url, target: '_blank', rel: 'noopener noreferrer' }, x.title) : x.title), h('small', {}, ` ${[x.author, x.year, x.kind].filter(Boolean).join(', ')} · ${x.theme}`),
      h('p', {}, x.idea), x.url ? h('small', { class: 'rp-url' }, x.url) : null))));
  }
  if (s.id === 'tips') {
    const list = (items) => h('ul', { class: 'rp-tips' }, items.map((t) => h('li', {}, t.text, h('small', {}, ` (${t.theme}${t.source ? `, after ${t.source}` : ''})`))));
    return h('section', { class: 'rp-sec' }, head,
      s.own.length ? [h('h3', {}, 'From your organisation'), list(s.own)] : null,
      s.harvested.length ? [h('h3', {}, 'From the tip library'), list(s.harvested)] : null,
      !s.own.length && !s.harvested.length ? h('p', { class: 'rp-note' }, 'No extra tips on these themes yet. Add your own in Rhizome → Tips.') : null);
  }
  if (s.id === 'help') {
    return h('section', { class: 'rp-sec' }, head,
      h('ol', { class: 'rp-steps' }, s.steps.map((x) => h('li', {}, x))),
      h('div', { class: 'rp-two' },
        h('div', {}, h('h3', {}, 'Words used'), h('dl', { class: 'rp-dl' }, s.words.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))),
        h('div', {}, h('h3', {}, 'Where to go next in Dashi'), h('dl', { class: 'rp-dl' }, s.next.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])))));
  }
  if (s.id === 'rules') {
    return h('section', { class: 'rp-sec rp-appendix' }, head,
      h('table', { class: 'rp-table' }, h('thead', {}, h('tr', {}, ['Rule', 'Theme', 'Looks at', 'When', 'Found'].map((x) => h('th', {}, x)))),
        h('tbody', {}, s.rules.map((x) => h('tr', {}, h('td', {}, x.name, x.own ? h('small', {}, ' (yours)') : null), h('td', {}, x.theme), h('td', {}, x.looks), h('td', {}, x.when), h('td', {}, x.found))))));
  }
  return null;
}
