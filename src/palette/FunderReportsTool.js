import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { measuresUnder, NODE_TYPES } from '../platform/strategy.js';
import { draftReport, blankReport, fundersOf, reportableNodes, periodLabel, measureMovements, workDuring, REPORT_TEMPLATES, reportDesign, reportSections, joinSections, designedMarkdown } from '../platform/funderReports.js';
import { DOC_PALETTES, FONTS } from '../platform/plandocs.js';
import { Logo } from '../ui/Shell.js';
import { loadLibrary, saveDoc } from '../platform/docs.js';
import { blankMeta } from '../platform/library.js';
import { Markdown } from '../ui/markdown.js';
import { uiConfirm, uiAlert } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { short, today } from '../strategy/dates.js';
import { ReportTrack } from './ReportTrack.js';

/**
 * Funder reports mini-tool: pick a funder, a period and what the money
 * went to, and get a draft report written from your strategy, program
 * data, workplans and data stories. Edit it here, print it as a PDF, or
 * save it to the Library. "Redraft" writes it again from the latest data.
 */
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const monthEnd = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

export function FunderReportsTool(ctx) {
  const { dashboards: store } = ctx;
  const reports = Object.values(store.doc.reports ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const head = h('div', { class: 'fb-tool-head' },
    h('div', {}, h('h1', {}, 'Funder reports'),
      h('p', { class: 'lede' }, 'Pick a funder, a period and the work they fund. Dashi writes a first draft from your measures, workplans, milestones and data stories, ready for you to edit, print as a PDF or keep in the Library.')),
    reports.length > 0 && ctx.reportId !== 'new' && h('button', { class: 'btn btn-sm btn-primary', onclick: () => { ctx.reportId = 'new'; ctx.render(); } }, icon('plus', 14), 'New report'));
  if (!reports.length || ctx.reportId === 'new') return h('div', { class: 'fr-tool' }, head, ReportTrack(ctx), NewReport(ctx, reports));
  const r = reports.find((x) => x.id === ctx.reportId) ?? reports[0];
  ctx.reportId = r.id;
  return h('div', { class: 'fr-tool' }, head, ReportTrack(ctx),
    h('div', { class: 'fb-forms' }, reports.map((x) => h('button', { class: `fb-form-card${x.id === r.id ? ' on' : ''}`, onclick: () => { ctx.reportId = x.id; ctx.render(); } },
      h('strong', {}, x.title), h('small', {}, `${x.funder || 'No funder'} · ${periodLabel(x.from, x.to)}`), h('span', { class: `badge badge-sm ${x.status === 'sent' ? 'badge-success' : 'badge-ghost'}` }, x.status === 'sent' ? 'Sent' : 'Draft')))),
    Report(ctx, r));
}

/** Choose what the report covers. */
function NewReport(ctx, reports) {
  const { strategy, dashboards: store } = ctx;
  const nodes = reportableNodes(strategy);
  const stories = Object.values(store.doc.stories ?? {});
  const now = today();
  const pick = ctx.reportPick ??= { funder: fundersOf(reports)[0] ?? '', from: `${+now.slice(0, 4) - (+now.slice(5, 7) < 4 ? 1 : 0)}-04`, to: now.slice(0, 7), nodeIds: nodes.filter((n) => n.type === 'objective').slice(0, 1).map((n) => n.id), storyIds: stories.slice(0, 1).map((s) => s.id), measureIds: null };
  const measures = [...new Map(pick.nodeIds.flatMap((id) => measuresUnder(strategy, id)).map((m) => [m.id, m])).values()];
  const chosenMeasures = pick.measureIds ?? measures.map((m) => m.id);
  const from = monthStart(`${pick.from}-01`), to = monthEnd(pick.to);
  const moves = measureMovements(strategy, ctx.data.doc, chosenMeasures, from, to);
  const work = workDuring(strategy, pick.nodeIds, from, to, now);
  const redraw = () => ctx.render();
  const toggle = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const create = () => {
    if (!pick.nodeIds.length) { uiAlert('Pick at least one objective or goal the funder supports.'); return; }
    const base = blankReport({ funder: pick.funder.trim(), from, to, nodeIds: pick.nodeIds, measureIds: chosenMeasures, storyIds: pick.storyIds });
    base.body = draftReport({ strategy, data: ctx.data.doc, dashboards: store.doc, org: ctx.org }, { ...base, today: now });
    const op = store.apply(col.add('reports', base));
    ctx.reportId = op.id;
    ctx.reportPick = null;
    ctx.render();
  };
  return h('section', { class: 'fr-new card' },
    h('div', { class: 'fr-steps' },
      h('div', { class: 'fr-step' }, h('span', { class: 'fr-n' }, '1'), h('div', {},
        h('h3', {}, 'Who is it for, and for when?'),
        h('div', { class: 'fr-row' },
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'Funder'),
            h('input', { class: 'input input-sm', name: 'fr-funder', list: 'fr-funders', value: pick.funder, placeholder: 'e.g. The Northern Foundation', oninput: (e) => { pick.funder = e.target.value; } }),
            h('datalist', { id: 'fr-funders' }, fundersOf(reports).map((f) => h('option', { value: f })))),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'From'), h('input', { class: 'input input-sm', type: 'month', name: 'fr-from', value: pick.from, onchange: (e) => { pick.from = e.target.value || pick.from; redraw(); } })),
          h('label', { class: 'fieldset' }, h('span', { class: 'fieldset-legend' }, 'To'), h('input', { class: 'input input-sm', type: 'month', name: 'fr-to', value: pick.to, onchange: (e) => { pick.to = e.target.value || pick.to; redraw(); } }))),
        h('p', { class: 'muted small' }, periodLabel(from, to)))),
      h('div', { class: 'fr-step' }, h('span', { class: 'fr-n' }, '2'), h('div', {},
        h('h3', {}, 'What do they fund?'),
        h('div', { class: 'fr-nodes' }, nodes.map((n) => h('label', { class: `fr-node ${n.type}` },
          h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: pick.nodeIds.includes(n.id), onchange: () => { pick.nodeIds = toggle(pick.nodeIds, n.id); pick.measureIds = null; redraw(); } }),
          h('span', { class: 'fr-glyph' }, NODE_TYPES[n.type].glyph), n.title))))),
      h('div', { class: 'fr-step' }, h('span', { class: 'fr-n' }, '3'), h('div', {},
        h('h3', {}, 'Which numbers and stories?'),
        measures.length ? h('div', { class: 'fr-nodes' }, measures.map((m) => h('label', { class: 'fr-node' },
          h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: chosenMeasures.includes(m.id), onchange: () => { pick.measureIds = toggle(chosenMeasures, m.id); redraw(); } }), m.name))) : h('p', { class: 'muted small' }, 'No measures under what you picked.'),
        stories.length > 0 && h('div', { class: 'fr-nodes' }, stories.map((s) => h('label', { class: 'fr-node' },
          h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: pick.storyIds.includes(s.id), onchange: () => { pick.storyIds = toggle(pick.storyIds, s.id); } }), icon('story', 14), s.title)))))),
    h('aside', { class: 'fr-preview' },
      h('h3', {}, 'The draft will say'),
      h('ul', {},
        h('li', {}, h('strong', {}, String(moves.filter((m) => m.end).length)), ' measures with data, ', moves.filter((m) => m.change > 0).length, ' up over the period'),
        h('li', {}, h('strong', {}, String(work.length)), ' workplans in the period, ', work.filter((w) => w.progress.state === 'complete').length, ' finished'),
        h('li', {}, h('strong', {}, String(work.reduce((t, w) => t + w.milestones.length, 0))), ' milestones reached or due'),
        h('li', {}, h('strong', {}, String(pick.storyIds.length)), ' data stories')),
      h('button', { class: 'btn btn-primary w-full', onclick: create }, icon('sparkle', 15), 'Write the draft'),
      reports.length > 0 && h('button', { class: 'btn btn-ghost btn-sm w-full', onclick: () => { ctx.reportId = null; ctx.render(); } }, 'Cancel')));
}

/**
 * One report, designed like a plan: the pages as the funder will get them
 * fill the canvas, and the panel on the right has two tabs. Write edits the
 * report section by section (hide one, move it, rename it), or all at once
 * as Markdown. Design picks a template, colours, type and a cover page.
 * Print and PDF use the designed pages.
 */
function Report(ctx, r) {
  const { dashboards: store } = ctx;
  const save = (patch) => store.apply(col.update('reports', r.id, { ...patch, updatedAt: today() }));
  const d = reportDesign(r);
  const setDesign = (patch) => save({ design: { ...d, ...patch } });
  const parts = reportSections(r.body);
  const hidden = new Set(r.hidden ?? []);
  const canvas = h('div', { class: 'frd-canvas', 'data-keep-scroll': 'fr-canvas' });
  const drawPages = (live) => canvas.replaceChildren(ReportPages(ctx, live));
  drawPages(r);

  // Typing redraws the pages at once and saves a moment later.
  let timer;
  const typed = (body) => { drawPages({ ...r, body }); clearTimeout(timer); timer = setTimeout(() => save({ body }), 450); };
  const setParts = (fn, extra = {}) => { const p = reportSections(r.body); fn(p); save({ body: joinSections(p), ...extra }); };

  const redraft = async () => {
    if (!await uiConfirm('Write the draft again from the latest data? Your edits to the words will be replaced (you can undo).')) return;
    save({ body: draftReport({ strategy: ctx.strategy, data: ctx.data.doc, dashboards: store.doc, org: ctx.org }, { ...r, today: today() }) });
  };
  const printIt = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${r.title.replace(/</g, '&lt;')}</title><link rel="stylesheet" href="${new URL('app.css', location.href)}"><style>body{background:#fff;margin:0}.frd-pages{gap:0!important;padding:0!important}.frd-sheet{box-shadow:none!important;margin:0 auto!important;break-after:page}@page{margin:0}</style></head><body></body></html>`);
    w.document.body.append(w.document.importNode(ReportPages(ctx, r), true));
    w.document.close();
    setTimeout(() => w.print(), 500);
  };
  const toLibrary = () => {
    const lib = loadLibrary();
    const id = r.libraryId && lib.items[r.libraryId] ? r.libraryId : uid('doc');
    lib.items[id] = { ...(lib.items[id] ?? { createdAt: Date.now(), folderId: null }), id, kind: 'doc', body: joinSections({ ...parts, sections: parts.sections.filter((x) => !hidden.has(x.heading)) }), tags: ['funder report', ...(r.funder ? [r.funder.toLowerCase()] : [])], updatedAt: Date.now(),
      meta: blankMeta({ type: 'report', genre: 'Funder report', title: r.title, creators: [{ role: 'author', literal: ctx.org.name }], issued: today(), publisher: ctx.org.name }) };
    saveDoc('library', lib);
    save({ libraryId: id });
    toast(r.libraryId ? 'Updated in the Library' : 'Saved to the Library');
  };

  const tab = ctx.reportTab ?? 'write';
  const tabs = h('div', { class: 'frd-tabs', role: 'tablist' },
    [['write', 'Write', 'pencil'], ['design', 'Design', 'palette']].map(([id, label, ic]) =>
      h('button', { role: 'tab', 'aria-selected': String(tab === id), class: tab === id ? 'on' : '', onclick: () => { ctx.reportTab = id; ctx.render(); } }, icon(ic, 14), label)));

  const panel = h('aside', { class: 'frd-panel', 'aria-label': tab === 'write' ? 'Write the report' : 'Design the report', 'data-keep-scroll': 'fr-panel' },
    tabs, tab === 'write' ? WritePanel() : DesignPanel());

  function WritePanel() {
    const rows = (text) => Math.max(3, Math.min(14, text.split('\n').length + 1));
    const live = () => {
      const p = reportSections(r.body);
      p.intro = panel.querySelector('[name="fr-intro"]')?.value ?? p.intro;
      p.sections.forEach((x, i) => { const t = panel.querySelector(`[name="fr-s-${i}"]`); if (t) x.text = t.value; });
      return joinSections(p);
    };
    return h('div', { class: 'frd-write' },
      h('label', { class: 'frd-field' }, h('span', { class: 'frd-label' }, 'Opening line'),
        h('textarea', { class: 'textarea textarea-sm', name: 'fr-intro', rows: rows(parts.intro), oninput: () => typed(live()) }, parts.intro)),
      h('div', { class: 'frd-label frd-label-row' }, h('span', {}, `Sections · ${parts.sections.length - hidden.size} of ${parts.sections.length} in the report`)),
      h('ol', { class: 'frd-sections' }, parts.sections.map((sec, i) => {
        const off = hidden.has(sec.heading);
        return h('li', { class: `frd-sec${off ? ' off' : ''}` },
          h('div', { class: 'frd-sec-head' },
            h('button', { class: 'frd-icon', title: off ? 'Put it back in the report' : 'Leave it out of the report (the words are kept)', 'aria-pressed': String(!off), 'aria-label': off ? `Show ${sec.heading}` : `Hide ${sec.heading}`,
              onclick: () => save({ hidden: off ? [...hidden].filter((x) => x !== sec.heading) : [...hidden, sec.heading] }) }, icon(off ? 'eyeOff' : 'eye', 14)),
            h('input', { class: 'frd-sec-title', name: `fr-h-${i}`, value: sec.heading, 'aria-label': 'Section heading',
              onchange: (e) => { const name = e.target.value.trim() || sec.heading; setParts((p) => { p.sections[i].heading = name; }, off ? { hidden: [...hidden].map((x) => (x === sec.heading ? name : x)) } : {}); } }),
            h('button', { class: 'frd-icon', disabled: i === 0, 'aria-label': `Move ${sec.heading} up`, onclick: () => setParts((p) => { [p.sections[i - 1], p.sections[i]] = [p.sections[i], p.sections[i - 1]]; }) }, icon('chevronUp', 14)),
            h('button', { class: 'frd-icon', disabled: i === parts.sections.length - 1, 'aria-label': `Move ${sec.heading} down`, onclick: () => setParts((p) => { [p.sections[i + 1], p.sections[i]] = [p.sections[i], p.sections[i + 1]]; }) }, icon('chevronDown', 14)),
            h('button', { class: 'frd-icon', 'aria-label': `Delete ${sec.heading}`, title: 'Delete the section (you can undo)', onclick: async () => { if (await uiConfirm(`Delete the section “${sec.heading}” and its words? You can undo.`)) setParts((p) => { p.sections.splice(i, 1); }); } }, icon('trash', 13))),
          !off && h('textarea', { class: 'textarea textarea-sm frd-sec-text', name: `fr-s-${i}`, rows: rows(sec.text), spellcheck: true, oninput: () => typed(live()) }, sec.text));
      })),
      h('button', { class: 'btn btn-sm btn-ghost frd-add', onclick: () => setParts((p) => { p.sections.push({ heading: 'New section', text: '' }); }) }, icon('plus', 14), 'Add a section'),
      h('details', { class: 'frd-raw', open: ctx.reportRaw || null, ontoggle: (e) => { ctx.reportRaw = e.target.open; } },
        h('summary', {}, 'Edit it all as Markdown'),
        h('textarea', { class: 'textarea fr-body', name: 'fr-body', spellcheck: true, oninput: (e) => typed(e.target.value) }, r.body),
        h('p', { class: 'muted small' }, '## Section · ### Heading · **bold** · - list · | tables | like | this |')));
  }

  function DesignPanel() {
    const pal = (id) => DOC_PALETTES.find((p) => p.id === id) ?? DOC_PALETTES[0];
    const cur = pal(d.palette);
    return h('div', { class: 'frd-design', style: `--fr-c1:${cur.c[0]};--fr-c2:${cur.c[1]};--fr-c3:${cur.c[2]};--fr-paper:${cur.paper}` },
      h('div', { class: 'frd-label' }, 'Template'),
      h('div', { class: 'frd-tpls', role: 'radiogroup', 'aria-label': 'Template' }, REPORT_TEMPLATES.map((t) =>
        h('button', { role: 'radio', 'aria-checked': String(d.template === t.id), class: `frd-tpl${d.template === t.id ? ' on' : ''}`, title: t.blurb, onclick: () => setDesign({ template: t.id }) },
          h('span', { class: `frd-tsketch t-${t.id}`, 'aria-hidden': 'true' }, h('i'), h('b'), h('u'), h('u')), h('strong', {}, t.label)))),
      h('div', { class: 'frd-label' }, 'Colours'),
      h('div', { class: 'frd-pals', role: 'radiogroup', 'aria-label': 'Colours' }, DOC_PALETTES.map((p) =>
        h('button', { role: 'radio', 'aria-checked': String(d.palette === p.id), class: `frd-pal${d.palette === p.id ? ' on' : ''}`, onclick: () => setDesign({ palette: p.id }) },
          h('span', { class: 'frd-pal-dots', style: `background:${p.paper}` }, p.c.map((c) => h('i', { style: `background:${c}` }))), h('small', {}, p.label)))),
      h('div', { class: 'frd-label' }, 'Type'),
      h('div', { class: 'frd-fonts', role: 'radiogroup', 'aria-label': 'Type' }, FONTS.map((f) =>
        h('button', { role: 'radio', 'aria-checked': String(d.font === f.id), class: `frd-font${d.font === f.id ? ' on' : ''}`, onclick: () => setDesign({ font: f.id }) },
          h('span', { style: `font-family:${f.stack}` }, 'Aa'), h('small', {}, f.label)))),
      h('label', { class: 'frd-toggle' },
        h('input', { type: 'checkbox', class: 'toggle toggle-sm', checked: d.cover, onchange: (e) => setDesign({ cover: e.target.checked }) }),
        h('span', {}, h('strong', {}, 'Cover page'), h('small', {}, 'Your logo, the title, the funder and the period'))));
  }

  return h('section', { class: 'fr-report card' },
    h('header', { class: 'fr-report-head' },
      h('div', { class: 'fr-title' },
        h('input', { class: 'title-input', name: 'fr-title', value: r.title, 'aria-label': 'Title', onchange: (e) => save({ title: e.target.value || r.title }) }),
        h('span', { class: 'muted small' }, `${r.funder || 'No funder'} · ${periodLabel(r.from, r.to)} · updated ${short(r.updatedAt)}${r.status === 'sent' ? ` · sent ${short(r.sentAt ?? r.updatedAt)}` : ''}`)),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: redraft, title: 'Write it again from the latest data' }, icon('refresh', 14), 'Redraft'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { navigator.clipboard?.writeText(designedMarkdown(r)); toast('Copied as Markdown'); } }, icon('copy', 14), 'Copy'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: printIt }, icon('download', 14), 'Print or PDF'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: toLibrary }, icon('books', 14), r.libraryId ? 'Update in Library' : 'Save to Library'),
      r.status === 'sent'
        ? h('button', { class: 'btn btn-sm', onclick: () => save({ status: 'draft' }) }, 'Back to draft')
        : h('button', { class: 'btn btn-sm btn-primary', onclick: () => save({ status: 'sent', sentAt: today() }) }, icon('check', 14), 'Mark as sent'),
      h('button', { class: 'btn btn-sm btn-ghost btn-square', 'aria-label': 'Delete report', onclick: async () => { if (await uiConfirm(`Delete “${r.title}”? You can undo.`)) { store.apply(col.remove('reports', r.id)); ctx.reportId = null; ctx.render(); } } }, icon('trash', 14))),
    h('div', { class: 'frd' }, canvas, panel));
}

const longDay = (d) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** The report as the funder gets it: a cover page, then the report, in its template, colours and type. */
export function ReportPages(ctx, r) {
  const d = reportDesign(r);
  const pal = DOC_PALETTES.find((p) => p.id === d.palette) ?? DOC_PALETTES[0];
  const font = FONTS.find((f) => f.id === d.font) ?? FONTS[0];
  const parts = reportSections(r.body);
  const style = `--fr-c1:${pal.c[0]};--fr-c2:${pal.c[1]};--fr-c3:${pal.c[2]};--fr-paper:${pal.paper};--fr-ink:${pal.ink};--fr-font:${font.stack}`;
  const cover = d.cover && h('div', { class: 'frd-sheet frd-cover' },
    h('span', { class: 'frd-cover-art', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('div', { class: 'frd-cover-org' }, Logo(ctx.org, 40), h('strong', {}, ctx.org.name)),
    h('div', { class: 'frd-cover-words' },
      h('p', { class: 'frd-kicker' }, r.funder ? `A report to ${r.funder}` : 'A report to our funder'),
      h('h1', {}, parts.title || r.title),
      h('p', { class: 'frd-period' }, periodLabel(r.from, r.to))),
    h('p', { class: 'frd-cover-foot' }, `Prepared ${longDay(r.updatedAt || today())}`, ctx.org.contact?.email && ` · ${ctx.org.contact.email}`));
  return h('div', { class: `frd-pages frd-${d.template}`, style },
    cover,
    h('article', { class: 'frd-sheet frd-body' },
      h('header', { class: 'frd-running' }, h('span', {}, ctx.org.name), h('span', {}, periodLabel(r.from, r.to))),
      Markdown(designedMarkdown(r))));
}
