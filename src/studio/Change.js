import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openAssetChooser } from '../ui/AssetChooser.js';
import { assetTile } from '../strategy/Assets.js';
import { LevelBadge } from '../ui/strategyLook.js';
import { measureIndex } from '../platform/strategy.js';
import { col } from '../core/collections.js';
import { TOC_LANES, TOC_CONFIDENCE, laneIndex, ofPlan, tocFromPlan, tocReadiness, tocStory, tocMarkdown } from '../platform/studio.js';
import { uiConfirm } from '../ui/dialog.js';

/**
 * Theory of change: the plan read as "so that" pathways, left to right,
 * from what we do to the change we seek. Pick a box to say where it leads,
 * and for each link the assumption behind it, how sure we are, the
 * evidence (anything the asset chooser finds: readings, map actors, data,
 * documents) and a signpost: the number we watch and what would make us
 * change course. "Read as pathways" writes it out for a plan document,
 * a funder or the board. The box you picked stays picked as the page
 * redraws; nothing here sends you to another page.
 */
const picked = {};       // planId → item id
const mode = {};         // planId → 'board' | 'story'

export function Change(ctx, plan) {
  const doc = ctx.doc;
  const items = ofPlan(doc, 'toc', plan.id);
  const links = ofPlan(doc, 'tocLinks', plan.id).filter((l) => doc.toc[l.from] && doc.toc[l.to]);
  const sel = doc.toc[picked[plan.id]]?.planId === plan.id ? doc.toc[picked[plan.id]] : null;
  const pick = (id) => { picked[plan.id] = id; ctx.render(); };
  const ready = tocReadiness(doc, plan.id);
  const story = mode[plan.id] === 'story';
  const layOut = () => {
    const ops = tocFromPlan(doc, ctx.strategy.doc, plan.id);
    if (ops.length) ctx.store.apply(col.batch(ops));
  };

  const head = h('div', { class: 'toc-head' },
    h('div', { class: 'toc-intro' },
      h('h2', {}, 'Theory of change'),
      h('p', { class: 'muted' }, 'How the work leads to the change you seek, one "so that" at a time. Name the assumption behind each link, the evidence for it, and the number that would tell you to change course.')),
    h('div', { class: 'toc-actions' },
      h('div', { class: 'device-toggle xs', role: 'radiogroup', 'aria-label': 'View' },
        [['board', 'Board'], ['story', 'Read as pathways']].map(([id, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((story ? 'story' : 'board') === id), class: (story ? 'story' : 'board') === id ? 'on' : '', onclick: () => { mode[plan.id] = id; ctx.render(); } }, label))),
      h('button', { class: 'btn btn-sm', onclick: layOut, title: 'Add the plan’s workplans, goals and objectives that are not here yet' }, icon('swap', 14), items.length ? 'Bring in what’s new in the plan' : 'Lay it out from the plan')));

  const meter = items.length > 0 && h('ul', { class: 'toc-ready', 'aria-label': 'How ready the theory is' },
    [[ready.links, 'links', null], [ready.assumed, 'with an assumption', ready.links], [ready.evidenced, 'with evidence', ready.links], [ready.signposts, 'with a signpost', ready.links], [ready.tested, 'tested', ready.links]]
      .map(([k, label, of]) => h('li', {}, h('strong', {}, String(k)), h('span', {}, label), of != null && h('i', { style: `--f:${of ? k / of : 0}` }))),
    ready.lanesEmpty.length > 0 && h('li', { class: 'toc-ready-note' }, icon('info', 13), `Nothing yet in ${ready.lanesEmpty.join(', ').toLowerCase()}`),
    ready.loose > 0 && h('li', { class: 'toc-ready-note' }, icon('info', 13), `${ready.loose} not linked to anything`));

  if (!items.length) {
    return h('div', { class: 'toc' }, head,
      h('div', { class: 'toc-empty' },
        icon('spark', 28),
        h('strong', {}, 'Start from the plan, or from a blank board'),
        h('span', { class: 'muted' }, 'Laying it out from the plan puts its workplans, goals and objectives in place, linked the way the plan nests them, with the framework’s vision as the change you seek. Then add what each piece produces and why you believe it works.'),
        h('div', { class: 'toc-empty-actions' },
          h('button', { class: 'btn btn-sm btn-primary', onclick: layOut }, 'Lay it out from the plan'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { mode[plan.id] = 'board'; addItem(ctx, plan, 'activity', 'What we do'); } }, 'Start blank'))));
  }

  if (story) return h('div', { class: 'toc' }, head, meter, Story(ctx, plan));

  const touching = new Set(sel ? [sel.id, ...links.filter((l) => l.from === sel.id || l.to === sel.id).flatMap((l) => [l.from, l.to])] : []);
  const board = h('div', { class: 'toc-board' },
    TOC_LANES.map((lane) => {
      const inLane = items.filter((x) => x.lane === lane.id).sort((a, b) => a.order - b.order);
      const input = h('input', { class: 'input input-xs toc-add-input', name: `toc-add-${lane.id}`, placeholder: `+ Add to ${lane.label.toLowerCase()}`, 'aria-label': `Add to ${lane.label}` });
      return h('section', { class: `toc-lane lane-${lane.id}`, 'aria-label': lane.label },
        h('header', {}, h('strong', {}, lane.label), h('small', {}, lane.hint)),
        h('div', { class: 'toc-cards' }, inLane.map((x) => {
          const node = x.strategyId && ctx.strategy.doc.nodes[x.strategyId];
          const outN = links.filter((l) => l.from === x.id).length;
          const inN = links.filter((l) => l.to === x.id).length;
          const flags = links.filter((l) => l.from === x.id);
          return h('button', {
            type: 'button', class: `toc-card${sel?.id === x.id ? ' on' : ''}${sel && !touching.has(x.id) ? ' dim' : ''}`, 'data-toc': x.id,
            'aria-pressed': String(sel?.id === x.id), onclick: () => pick(sel?.id === x.id ? null : x.id),
          },
          node && node.type !== 'framework' && LevelBadge(node.type, { plain: true }),
          h('span', { class: 'toc-card-title' }, x.title),
          (inN || outN) ? h('small', { class: 'toc-card-meta' }, [inN && `${inN} in`, outN && `${outN} out`].filter(Boolean).join(' · '),
            flags.some((l) => l.signpost?.measureId) && h('span', { class: 'toc-flag', title: 'Has a signpost' }, icon('chart', 11)),
            flags.some((l) => l.evidence?.length) && h('span', { class: 'toc-flag', title: 'Has evidence' }, icon('book', 11))) : h('small', { class: 'toc-card-meta muted' }, 'Not linked yet'));
        })),
        h('form', { class: 'toc-add', onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) addItem(ctx, plan, lane.id, input.value.trim()); } }, input));
    }));
  const stage = h('div', { class: 'toc-stage' }, board);
  stage.prepend(svgEl());
  const draw = () => drawWires(stage, links, sel);
  requestAnimationFrame(draw);
  new ResizeObserver(() => draw()).observe(board);

  return h('div', { class: `toc${sel ? ' has-pick' : ''}` }, head, meter,
    h('div', { class: 'toc-split' }, stage, sel ? Panel(ctx, plan, sel, links, pick) : h('aside', { class: 'toc-panel toc-panel-hint' },
      icon('connect', 22), h('strong', {}, 'Pick a box'), h('span', { class: 'muted small' }, 'See where it leads, and say why you believe each step will happen: the assumption, the evidence, and the number you will watch.'))));
}

function addItem(ctx, plan, lane, title) {
  const order = ofPlan(ctx.doc, 'toc', plan.id).filter((x) => x.lane === lane).length;
  const op = ctx.add('toc', { planId: plan.id, lane, title, strategyId: null, order });
  picked[plan.id] = op?.id ?? picked[plan.id];
  ctx.render();
}

const NS = 'http://www.w3.org/2000/svg';
const svgEl = () => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'toc-wires'); s.setAttribute('aria-hidden', 'true'); return s; };

/** The "so that" arrows, drawn between the boxes after they are laid out. */
function drawWires(stage, links, sel) {
  const svg = stage.querySelector('svg.toc-wires');
  if (!svg || !stage.isConnected) return;
  const box = stage.getBoundingClientRect();
  svg.setAttribute('width', stage.scrollWidth);
  svg.setAttribute('height', stage.scrollHeight);
  const at = (id) => stage.querySelector(`[data-toc="${CSS.escape(id)}"]`)?.getBoundingClientRect();
  svg.replaceChildren(...links.map((l) => {
    const a = at(l.from), b = at(l.to);
    if (!a || !b) return null;
    const x1 = a.right - box.left + stage.scrollLeft, y1 = a.top + a.height / 2 - box.top + stage.scrollTop;
    const x2 = b.left - box.left + stage.scrollLeft - 4, y2 = b.top + b.height / 2 - box.top + stage.scrollTop;
    const dx = Math.max(24, (x2 - x1) / 2);
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
    const on = sel && (l.from === sel.id || l.to === sel.id);
    p.setAttribute('class', `toc-wire c-${l.confidence ?? 'untested'}${on ? ' on' : ''}${sel && !on ? ' dim' : ''}`);
    p.setAttribute('marker-end', 'url(#toc-arrow)');
    return p;
  }).filter(Boolean));
  const defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<marker id="toc-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" fill="currentColor"/></marker>';
  svg.prepend(defs);
}

/** The picked box: its words, where it leads and why, and where it comes from. */
function Panel(ctx, plan, x, links, pick) {
  const doc = ctx.doc;
  const outs = links.filter((l) => l.from === x.id);
  const ins = links.filter((l) => l.to === x.id);
  const later = ofPlan(doc, 'toc', plan.id).filter((y) => laneIndex(y.lane) > laneIndex(x.lane) && !outs.some((l) => l.to === y.id));
  const measures = Object.values(measureIndex(ctx.strategy.doc));
  const node = x.strategyId && ctx.strategy.doc.nodes[x.strategyId];
  const setLink = (l, patch) => ctx.put('tocLinks', l.id, patch);

  return h('aside', { class: 'toc-panel', 'aria-label': 'The picked box' },
    h('div', { class: 'toc-panel-top' },
      h('select', { class: 'select select-xs', name: `toc-lane-${x.id}`, 'aria-label': 'Column', onchange: (e) => ctx.put('toc', x.id, { lane: e.target.value }) }, options(TOC_LANES.map((l) => ({ id: l.id, label: l.label })), x.lane)),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost btn-xs btn-square', 'aria-label': 'Close', title: 'Close', onclick: () => pick(null) }, icon('close', 14))),
    h('textarea', { class: 'toc-title-input', name: `toc-title-${x.id}`, rows: 2, 'aria-label': 'What it says', onchange: (e) => ctx.put('toc', x.id, { title: e.target.value.trim() || x.title }) }, x.title),
    node && h('p', { class: 'muted small toc-from-plan' }, LevelBadge(node.type, { plain: true }), node.type === 'framework' ? 'The framework’s vision' : `From the plan: ${node.title}`),

    x.lane !== 'impact' && h('section', { class: 'toc-block' },
      h('h3', {}, 'So that…'),
      !outs.length && h('p', { class: 'muted small' }, 'Where does this lead? Link it to something in a later column.'),
      outs.map((l) => {
        const to = doc.toc[l.to];
        const m = l.signpost?.measureId;
        return h('div', { class: `toc-link c-${l.confidence ?? 'untested'}` },
          h('div', { class: 'toc-link-head' },
            h('span', { class: 'toc-arrow' }, icon('chevronRight', 13)),
            h('button', { class: 'toc-link-to', onclick: () => pick(to.id) }, to.title),
            h('button', { class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Unlink ${to.title}`, title: 'Remove this link', onclick: async () => { if (await uiConfirm('Remove this link and what it says?')) ctx.remove('tocLinks', l.id); } }, icon('close', 12))),
          h('label', { class: 'toc-field' }, h('span', {}, 'Because we believe'),
            h('textarea', { class: 'textarea textarea-sm', name: `toc-as-${l.id}`, rows: 2, placeholder: 'The assumption that makes this step happen', onchange: (e) => setLink(l, { assumption: e.target.value }) }, l.assumption ?? '')),
          h('div', { class: 'toc-field' }, h('span', {}, 'How sure are we?'),
            h('div', { class: 'toc-conf', role: 'radiogroup', 'aria-label': 'How sure are we' }, TOC_CONFIDENCE.map((c) =>
              h('button', { type: 'button', role: 'radio', title: c.blurb, 'aria-checked': String((l.confidence ?? 'untested') === c.id), class: `c-${c.id}${(l.confidence ?? 'untested') === c.id ? ' on' : ''}`, onclick: () => setLink(l, { confidence: c.id }) }, c.label)))),
          h('div', { class: 'toc-field' }, h('span', {}, 'Evidence'),
            h('div', { class: 'toc-evidence' },
              h('ul', { class: 'asset-tiles' }, (l.evidence ?? []).map((a) => assetTile(a, ctx.docs, { remove: () => setLink(l, { evidence: (doc.tocLinks[l.id]?.evidence ?? []).filter((y) => y.id !== a.id) }) }))),
              h('button', { class: 'btn btn-xs', onclick: () => openAssetChooser({
                docs: ctx.docs, node: { title: to.title }, current: () => ctx.doc.tocLinks[l.id]?.evidence ?? [],
                onPick: (asset) => setLink(l, { evidence: [...(ctx.doc.tocLinks[l.id]?.evidence ?? []), asset] }),
              }) }, icon('plus', 12), 'Link evidence'))),
          h('div', { class: 'toc-field' }, h('span', {}, 'Signpost: the number we watch'),
            h('select', { class: 'select select-xs', name: `toc-m-${l.id}`, 'aria-label': 'Measure to watch', onchange: (e) => setLink(l, { signpost: e.target.value ? { measureId: e.target.value, note: l.signpost?.note ?? '' } : null }) },
              h('option', { value: '' }, measures.length ? 'None yet' : 'No measures in the plan yet'), options(measures.map((mm) => ({ id: mm.id, label: `${mm.name}${mm.target ? ` (target ${mm.target}${mm.unit ? ` ${mm.unit}` : ''})` : ''}` })), m)),
            m && h('input', { class: 'input input-xs', name: `toc-sn-${l.id}`, value: l.signpost?.note ?? '', placeholder: 'We would rethink this step if…', onchange: (e) => setLink(l, { signpost: { measureId: m, note: e.target.value } }) })));
      }),
      later.length > 0 && h('select', { class: 'select select-xs toc-link-add', name: `toc-link-${x.id}`, 'aria-label': 'Link it to', onchange: (e) => { if (e.target.value) ctx.add('tocLinks', { planId: plan.id, from: x.id, to: e.target.value, assumption: '', confidence: 'untested', evidence: [], signpost: null }); } },
        h('option', { value: '' }, '+ Leads to…'),
        TOC_LANES.filter((ln) => later.some((y) => y.lane === ln.id)).map((ln) => h('optgroup', { label: ln.label }, later.filter((y) => y.lane === ln.id).map((y) => h('option', { value: y.id }, y.title)))))),

    ins.length > 0 && h('section', { class: 'toc-block' },
      h('h3', {}, 'Comes from'),
      h('ul', { class: 'toc-ins' }, ins.map((l) => h('li', {}, h('button', { class: 'toc-link-to', onclick: () => pick(l.from) }, doc.toc[l.from].title))))),

    h('div', { class: 'toc-panel-foot' },
      h('button', { class: 'btn btn-ghost btn-xs text-error', onclick: async () => {
        if (!await uiConfirm(`Remove “${x.title}” and its links from the theory of change?${x.strategyId ? ' The plan itself is not changed.' : ''}`, { danger: true, ok: 'Remove' })) return;
        picked[plan.id] = null;
        ctx.remove('tocLinks', [...outs, ...ins].map((l) => l.id));
        ctx.remove('toc', x.id);
      } }, icon('trash', 13), 'Remove from the board')));
}

/** The theory written out as pathways, ready to copy into a plan document. */
function Story(ctx, plan) {
  const story = tocStory(ctx.doc, plan.id);
  const copy = h('button', { class: 'btn btn-sm', onclick: async () => {
    try { await navigator.clipboard.writeText(tocMarkdown(story)); copy.textContent = 'Copied'; setTimeout(() => { copy.replaceChildren(icon('doc', 14), 'Copy as text'); }, 1600); } catch { copy.textContent = 'Could not copy'; }
  } }, icon('doc', 14), 'Copy as text');
  return h('div', { class: 'toc-story' },
    h('div', { class: 'toc-story-bar' }, h('span', { class: 'muted small' }, 'One pathway for each lasting change. Paste it into a plan document, a funding proposal or a board pack.'), h('span', { class: 'spacer' }), copy),
    story.length ? story.map((p) => h('article', { class: 'toc-path' }, h('h3', {}, p.title), h('dl', {}, p.lines.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]))))
      : h('p', { class: 'muted' }, 'Add something to “Lasting changes” and link to it to see the pathways here.'));
}

