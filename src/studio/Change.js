import { h, options } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { openAssetChooser } from '../ui/AssetChooser.js';
import { assetTile } from '../strategy/Assets.js';
import { LevelBadge } from '../ui/strategyLook.js';
import { measureIndex } from '../platform/strategy.js';
import { col } from '../core/collections.js';
import { TOC_LANES, TOC_CONFIDENCE, TOC_TO_LEVEL, laneIndex, ofPlan, tocFromPlan, tocToPlan, tocReadiness, tocStory, tocMarkdown, layersOf, layerOf } from '../platform/studio.js';
import { Drawer } from '../ui/drawer.js';
import { linkTo } from '../plugins.js';
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
const hidden = {};       // planId → Set of hidden layer ids
const active = {};       // planId → the layer new boxes go on

export function Change(ctx, plan) {
  const doc = ctx.doc;
  const all = ofPlan(doc, 'toc', plan.id);
  const off = hidden[plan.id] ??= new Set();
  const layers = layersOf(doc, plan.id);
  const hueOf = Object.fromEntries(layers.map((l) => [l.id, l.hue]));
  const items = all.filter((x) => !off.has(layerOf(x)));
  const showing = new Set(items.map((x) => x.id));
  const links = ofPlan(doc, 'tocLinks', plan.id).filter((l) => showing.has(l.from) && showing.has(l.to));
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
      ctx.flash?.until > Date.now() && h('span', { class: 'badge badge-success badge-soft', role: 'status' }, ctx.flash.text),
      h('div', { class: 'device-toggle xs', role: 'radiogroup', 'aria-label': 'View' },
        [['board', 'Board'], ['story', 'Read as pathways']].map(([id, label]) => h('button', { type: 'button', role: 'radio', 'aria-checked': String((story ? 'story' : 'board') === id), class: (story ? 'story' : 'board') === id ? 'on' : '', onclick: () => { mode[plan.id] = id; ctx.render(); } }, label))),
      h('button', { class: 'btn btn-sm', onclick: layOut, title: 'Add the plan’s workplans, goals and objectives that are not here yet' }, icon('swap', 14), all.length ? 'Bring in what’s new in the plan' : 'Lay it out from the plan'),
      all.length > 0 && h('button', { class: 'btn btn-sm btn-primary', onclick: () => openSend(ctx, plan), title: 'Make draft objectives, goals, workplans and tasks from this theory' }, icon('upload', 14), 'Send to plan')));

  const meter = items.length > 0 && h('ul', { class: 'toc-ready', 'aria-label': 'How ready the theory is' },
    [[ready.links, 'links', null], [ready.assumed, 'with an assumption', ready.links], [ready.evidenced, 'with evidence', ready.links], [ready.signposts, 'with a signpost', ready.links], [ready.tested, 'tested', ready.links]]
      .map(([k, label, of]) => h('li', {}, h('strong', {}, String(k)), h('span', {}, label), of != null && h('i', { style: `--f:${of ? k / of : 0}` }))),
    ready.lanesEmpty.length > 0 && h('li', { class: 'toc-ready-note' }, icon('info', 13), `Nothing yet in ${ready.lanesEmpty.join(', ').toLowerCase()}`),
    ready.loose > 0 && h('li', { class: 'toc-ready-note' }, icon('info', 13), `${ready.loose} not linked to anything`));

  if (!all.length) {
    const nPlan = ctx.strategy.doc ? Object.values(ctx.strategy.doc.nodes).filter((n) => ['objective', 'goal', 'workplan'].includes(n.type) && isIn(ctx.strategy.doc, n, plan.id)).length : 0;
    return h('div', { class: 'toc' }, head,
      h('div', { class: 'toc-empty' },
        icon('spark', 28),
        h('strong', {}, nPlan ? 'Your plan is in place, but it has no theory of change yet' : 'Start from the plan, or from a blank board'),
        h('span', { class: 'muted' }, nPlan
          ? `“${plan.title}” already has ${nPlan} objectives, goals and workplans. Bring them in as the “From the plan” layer to read the plan as a theory of change, then add new thinking on its own layer and send it back to the plan as drafts.`
          : 'Laying it out from the plan puts its workplans, goals and objectives in place, linked the way the plan nests them, with the framework’s vision as the change you seek. Then add what each piece produces and why you believe it works.'),
        h('div', { class: 'toc-empty-actions' },
          h('button', { class: 'btn btn-sm btn-primary', onclick: layOut }, nPlan ? 'Bring in the plan as a layer' : 'Lay it out from the plan'),
          h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { mode[plan.id] = 'board'; active[plan.id] = 'new'; addItem(ctx, plan, 'long', 'A lasting change we seek'); } }, 'Start with new thinking'))));
  }

  const layerBar = Layers(ctx, plan, all, layers);
  if (story) return h('div', { class: 'toc' }, head, meter, layerBar, Story(ctx, plan));

  const touching = new Set(sel ? [sel.id, ...links.filter((l) => l.from === sel.id || l.to === sel.id).flatMap((l) => [l.from, l.to])] : []);
  const board = h('div', { class: 'toc-board' },
    TOC_LANES.map((lane) => {
      const inLane = items.filter((x) => x.lane === lane.id).sort((a, b) => a.order - b.order);
      const input = h('input', { class: 'input input-xs toc-add-input', name: `toc-add-${lane.id}`, placeholder: `+ Add to ${lane.label.toLowerCase()}`, 'aria-label': `Add to ${lane.label}` });
      return h('section', { class: `toc-lane lane-${lane.id}`, 'aria-label': lane.label },
        h('header', {}, h('strong', {}, lane.label), h('small', {}, lane.hint)),
        h('div', { class: 'toc-cards' }, inLane.map((x) => {
          const node = x.strategyId && ctx.strategy.doc.nodes[x.strategyId];
          const lay = layerOf(x);
          const outN = links.filter((l) => l.from === x.id).length;
          const inN = links.filter((l) => l.to === x.id).length;
          const flags = links.filter((l) => l.from === x.id);
          return h('button', {
            type: 'button', class: `toc-card${sel?.id === x.id ? ' on' : ''}${sel && !touching.has(x.id) ? ' dim' : ''}${node?.draft ? ' is-draft' : ''}`, 'data-toc': x.id, 'data-layer': lay, style: `--lh:${hueOf[lay] ?? 222}`,
            'aria-pressed': String(sel?.id === x.id), onclick: () => pick(sel?.id === x.id ? null : x.id),
          },
          node && node.type !== 'framework' && LevelBadge(node.type, { plain: true }),
          node?.draft && h('span', { class: 'toc-draft' }, 'Draft in plan'),
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

  return h('div', { class: `toc${sel ? ' has-pick' : ''}` }, head, meter, layerBar,
    h('div', { class: 'toc-split' }, stage, sel ? Panel(ctx, plan, sel, links, pick) : h('aside', { class: 'toc-panel toc-panel-hint' },
      icon('connect', 22), h('strong', {}, 'Pick a box'), h('span', { class: 'muted small' }, 'See where it leads, and say why you believe each step will happen: the assumption, the evidence, and the number you will watch.'))));
}

function addItem(ctx, plan, lane, title) {
  const order = ofPlan(ctx.doc, 'toc', plan.id).filter((x) => x.lane === lane).length;
  const layer = active[plan.id] && active[plan.id] !== 'plan' ? active[plan.id] : 'new';
  hidden[plan.id]?.delete(layer);
  const op = ctx.add('toc', { planId: plan.id, lane, title, strategyId: null, order, layer });
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


const isIn = (sdoc, n, planId) => { for (let p = n; p; p = sdoc.nodes[p.parentId]) if (p.id === planId) return true; return false; };

/**
 * Theory layers: a strip above the board. Each layer has a colour, a count,
 * an eye to hide it, and can be the one new boxes go on. "From the plan"
 * is what the plan already says; new layers hold the team's own thinking,
 * which can run in parallel to the plan and be sent to it as drafts.
 */
function Layers(ctx, plan, all, layers) {
  const off = hidden[plan.id];
  const cur = active[plan.id] && layers.some((l) => l.id === active[plan.id]) ? active[plan.id] : 'new';
  const count = (id) => all.filter((x) => layerOf(x) === id).length;
  const addLayer = () => {
    const own = ctx.doc.plans[plan.id]?.tocLayers ?? [];
    const n = layers.length - 1;
    const id = `layer-${Date.now().toString(36)}`;
    const hues = [150, 280, 350, 190, 60];
    ctx.savePlan(plan.id, { tocLayers: [...own, { id, name: `Layer ${n + 1}`, hue: hues[(n - 1) % hues.length] }] });
    active[plan.id] = id;
  };
  const rename = (l, name) => {
    const own = ctx.doc.plans[plan.id]?.tocLayers ?? [];
    const next = own.some((x) => x.id === l.id) ? own.map((x) => (x.id === l.id ? { ...x, name } : x)) : [...own, { id: l.id, name, hue: l.hue }];
    ctx.savePlan(plan.id, { tocLayers: next });
  };
  return h('div', { class: 'toc-layers', role: 'group', 'aria-label': 'Theory layers' },
    h('span', { class: 'toc-layers-label' }, icon('rows', 13), 'Theory layers'),
    layers.map((l) => {
      const shown = !off.has(l.id);
      return h('div', { class: `toc-layer${cur === l.id && l.id !== 'plan' ? ' on' : ''}${shown ? '' : ' off'}`, style: `--lh:${l.hue}` },
        h('button', { type: 'button', class: 'toc-layer-eye', 'aria-pressed': String(shown), title: shown ? `Hide ${l.name}` : `Show ${l.name}`, 'aria-label': shown ? `Hide ${l.name}` : `Show ${l.name}`,
          onclick: () => { if (shown) off.add(l.id); else off.delete(l.id); ctx.render(); } }, icon(shown ? 'eye' : 'eyeOff', 13)),
        h('i', { class: 'toc-layer-dot' }),
        l.id === 'plan' ? h('span', { class: 'toc-layer-name', title: 'What the plan already says, laid out as a theory' }, l.name)
          : h('input', { class: 'toc-layer-name', name: `layer-${l.id}`, value: l.name, size: Math.max(6, l.name.length), 'aria-label': 'Layer name', onfocus: () => { active[plan.id] = l.id; }, onchange: (e) => rename(l, e.target.value.trim() || l.name) }),
        h('small', {}, String(count(l.id))),
        l.id !== 'plan' && h('button', { type: 'button', class: 'toc-layer-use', 'aria-pressed': String(cur === l.id), title: 'New boxes go on this layer', onclick: () => { active[plan.id] = l.id; ctx.render(); } }, cur === l.id ? 'Adding here' : 'Add here'));
    }),
    h('button', { type: 'button', class: 'btn btn-ghost btn-xs', onclick: addLayer }, icon('plus', 12), 'Layer'));
}

const LEVEL_WORD = { objective: 'Objective', goal: 'Goal', workplan: 'Workplan', task: 'Task', framework: 'Vision' };

/**
 * Send to plan: a tray that shows what the theory would make in Strategy &
 * Work, as drafts, before anything changes. Pick which layers to send.
 */
function openSend(ctx, plan) {
  const layers = layersOf(ctx.doc, plan.id);
  const all = ofPlan(ctx.doc, 'toc', plan.id);
  const pick = new Set(layers.filter((l) => l.id !== 'plan' && all.some((x) => layerOf(x) === l.id)).map((l) => l.id));
  if (!pick.size) layers.forEach((l) => pick.add(l.id));
  let d;
  const body = () => {
    const out = tocToPlan(ctx.doc, ctx.strategy.doc, plan.id, { layers: [...pick] });
    const fresh = out.preview.filter((p) => p.action === 'new').length;
    const upd = out.preview.filter((p) => p.action === 'update').length;
    return h('div', { class: 'toc-send' },
      h('p', { class: 'muted small' }, 'Each lasting change becomes an objective, each early change a goal, what you do a workplan and what it produces a task. They arrive in Strategy & Work as drafts, so the team can accept or discard each one. Drafts stay out of reports until accepted. Assumptions and signposts go in their notes.'),
      h('fieldset', { class: 'toc-send-layers' }, h('legend', {}, 'Send these layers'),
        layers.map((l) => h('label', { style: `--lh:${l.hue}` },
          h('input', { type: 'checkbox', name: `send-${l.id}`, checked: pick.has(l.id), onchange: (e) => { if (e.target.checked) pick.add(l.id); else pick.delete(l.id); d.setBody(body()); } }),
          h('i', { class: 'toc-layer-dot' }), l.name, h('small', { class: 'muted' }, ` ${all.filter((x) => layerOf(x) === l.id).length}`)))),
      out.preview.length
        ? h('ol', { class: 'toc-send-list' }, out.preview.map((p) => h('li', { class: `lvl-${p.type}` },
          h('span', { class: `toc-send-kind k-${p.type}` }, LEVEL_WORD[p.type]),
          h('span', { class: 'toc-send-title' }, h('strong', {}, p.title), p.parentTitle && h('small', { class: 'muted' }, ` under ${p.parentTitle}`)),
          h('span', { class: `badge badge-xs ${p.action === 'new' ? 'badge-primary' : 'badge-ghost'}` }, p.action === 'new' ? 'New draft' : p.action === 'vision' ? 'Fills the vision' : 'Updates draft'))))
        : h('p', { class: 'toc-send-none' }, 'Nothing new to send from these layers. Boxes that came from the plan are already in it.'),
      out.loose.length > 0 && h('p', { class: 'muted small toc-send-loose' }, icon('info', 13), `${out.loose.length} not sent yet because they don’t lead to anything in the plan: ${out.loose.join('; ')}. Link them to an early or lasting change first.`),
      h('p', { class: 'small' }, `${fresh} new, ${upd} updated.`));
  };
  const send = () => {
    const out = tocToPlan(ctx.doc, ctx.strategy.doc, plan.id, { layers: [...pick] });
    if (!out.strategyOps.length) { d.close(); return; }
    ctx.strategy.apply(col.batch(out.strategyOps));
    if (out.studioOps.length) ctx.store.apply(col.batch(out.studioOps));
    ctx.flash = { text: `Sent to the plan as drafts: ${out.preview.length}.`, until: Date.now() + 10000 };
    d.close();
    ctx.render();
  };
  d = Drawer({ title: 'Send to plan', sub: `Drafts in “${plan.title}”`, body: body(), wide: true,
    actions: [linkTo('strategy', `#${plan.id}`) && h('a', { class: 'btn btn-ghost btn-sm', href: linkTo('strategy', `#${plan.id}`) }, 'Open the plan'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn-ghost btn-sm', onclick: () => d.close() }, 'Cancel'), h('button', { class: 'btn btn-primary btn-sm', onclick: send }, icon('upload', 14), 'Send as drafts')] });
}
