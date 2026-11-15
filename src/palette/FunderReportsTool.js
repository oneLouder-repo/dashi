import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { col } from '../core/collections.js';
import { uid } from '../core/ops.js';
import { measuresUnder, NODE_TYPES } from '../platform/strategy.js';
import { draftReport, blankReport, fundersOf, reportableNodes, periodLabel, measureMovements, workDuring } from '../platform/funderReports.js';
import { loadLibrary, saveDoc } from '../platform/docs.js';
import { blankMeta } from '../platform/library.js';
import { Markdown } from '../ui/markdown.js';
import { uiConfirm, uiAlert } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { short, today } from '../strategy/dates.js';

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
  if (!reports.length || ctx.reportId === 'new') return h('div', { class: 'fr-tool' }, head, NewReport(ctx, reports));
  const r = reports.find((x) => x.id === ctx.reportId) ?? reports[0];
  ctx.reportId = r.id;
  return h('div', { class: 'fr-tool' }, head,
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

/** One report: edit the words on the left, see the page on the right. */
function Report(ctx, r) {
  const { dashboards: store } = ctx;
  const save = (patch) => store.apply(col.update('reports', r.id, { ...patch, updatedAt: today() }));
  const page = h('div', { class: 'fr-page' }, Markdown(r.body));
  let timer;
  const body = h('textarea', { class: 'textarea fr-body', name: 'fr-body', spellcheck: true, oninput: () => {
    page.replaceChildren(Markdown(body.value));
    clearTimeout(timer); timer = setTimeout(() => save({ body: body.value }), 400);
  } }, r.body);
  const redraft = async () => {
    if (!await uiConfirm('Write the draft again from the latest data? Your edits to the words will be replaced (you can undo).')) return;
    save({ body: draftReport({ strategy: ctx.strategy, data: ctx.data.doc, dashboards: store.doc, org: ctx.org }, { ...r, today: today() }) });
  };
  const printIt = () => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${r.title.replace(/</g, '&lt;')}</title><link rel="stylesheet" href="${new URL('app.css', location.href)}"><style>body{background:#fff;padding:40px;font-family:Georgia,serif}.md{max-width:720px;margin:auto}</style></head><body></body></html>`);
    w.document.body.append(w.document.importNode(page.firstChild, true));
    w.document.close();
    setTimeout(() => w.print(), 400);
  };
  const toLibrary = () => {
    const lib = loadLibrary();
    const id = r.libraryId && lib.items[r.libraryId] ? r.libraryId : uid('doc');
    lib.items[id] = { ...(lib.items[id] ?? { createdAt: Date.now(), folderId: null }), id, kind: 'doc', body: r.body, tags: ['funder report', ...(r.funder ? [r.funder.toLowerCase()] : [])], updatedAt: Date.now(),
      meta: blankMeta({ type: 'report', genre: 'Funder report', title: r.title, creators: [{ role: 'author', literal: ctx.org.name }], issued: today(), publisher: ctx.org.name }) };
    saveDoc('library', lib);
    save({ libraryId: id });
    toast(r.libraryId ? 'Updated in the Library' : 'Saved to the Library');
  };
  return h('section', { class: 'fr-report card' },
    h('header', { class: 'fr-report-head' },
      h('div', { class: 'fr-title' },
        h('input', { class: 'title-input', name: 'fr-title', value: r.title, 'aria-label': 'Title', onchange: (e) => save({ title: e.target.value || r.title }) }),
        h('span', { class: 'muted small' }, `${r.funder || 'No funder'} · ${periodLabel(r.from, r.to)} · updated ${short(r.updatedAt)}${r.status === 'sent' ? ` · sent ${short(r.sentAt ?? r.updatedAt)}` : ''}`)),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: redraft, title: 'Write it again from the latest data' }, icon('refresh', 14), 'Redraft'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { navigator.clipboard?.writeText(r.body); toast('Copied as Markdown'); } }, icon('copy', 14), 'Copy'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: printIt }, icon('download', 14), 'Print or PDF'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: toLibrary }, icon('books', 14), r.libraryId ? 'Update in Library' : 'Save to Library'),
      r.status === 'sent'
        ? h('button', { class: 'btn btn-sm', onclick: () => save({ status: 'draft' }) }, 'Back to draft')
        : h('button', { class: 'btn btn-sm btn-primary', onclick: () => save({ status: 'sent', sentAt: today() }) }, icon('check', 14), 'Mark as sent'),
      h('button', { class: 'btn btn-sm btn-ghost btn-square', 'aria-label': 'Delete report', onclick: async () => { if (await uiConfirm(`Delete “${r.title}”? You can undo.`)) { store.apply(col.remove('reports', r.id)); ctx.reportId = null; ctx.render(); } } }, icon('trash', 14))),
    h('div', { class: 'fr-split' },
      h('div', { class: 'fr-write' }, h('span', { class: 'fieldset-legend' }, 'The words (Markdown)'), body,
        h('p', { class: 'muted small' }, '## Heading · **bold** · - list · | tables | like | this |')),
      h('div', { class: 'fr-page-wrap' }, h('span', { class: 'fieldset-legend' }, 'As the funder will read it'), page)));
}
