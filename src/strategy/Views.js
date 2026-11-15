import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Avatar } from '../ui/Shell.js';
import { childrenOf, descendants, taskSummary, strategyOps, TASK_STATUSES, statusById } from '../platform/strategy.js';
import { workplanProgress, PROGRESS_STATES } from '../platform/strategyReports.js';
import { LevelBadge, ProgressRing, AvatarStack, objectiveHue, peopleOf } from '../ui/strategyLook.js';
import { range, short, today } from './dates.js';

/**
 * Other ways to see the work under a node.
 *
 *   Lanes(ctx, node)   swimlanes: a plan's objectives (or an objective's
 *                      goals, or a goal's workplans) as lanes, with the
 *                      level below as cards along each lane
 *   Board(ctx, wp)     a workplan's tasks as a board by status (drag a card
 *                      to move it), or by person
 */
const lightDot = (state) => h('span', { class: `sw-wp-light l-${PROGRESS_STATES[state].light}`, title: PROGRESS_STATES[state].label });

export function Lanes(ctx, node) {
  const doc = ctx.store.doc;
  const now = today();
  // Which level makes the lanes: skip nested plans down to the first objectives.
  const lanesOf = (n) => {
    const kids = childrenOf(doc, n.id);
    if (n.type === 'plan' || n.type === 'framework') {
      const objectives = kids.filter((k) => k.type === 'objective');
      return [...objectives, ...kids.filter((k) => k.type === 'plan').flatMap(lanesOf)];
    }
    return kids;
  };
  const lanes = lanesOf(node);
  if (!lanes.length) return h('p', { class: 'empty' }, 'Nothing below this yet. Add the next level from the Details view.');
  return h('div', { class: 'lanes' }, lanes.map((lane) => {
    const hue = objectiveHue(doc, lane);
    const cards = childrenOf(doc, lane.id);
    const s = taskSummary(doc, lane.id);
    return h('section', { class: 'lane', style: `--hue:${hue}` },
      h('header', { class: 'lane-head' },
        LevelBadge(lane.type, { plain: true }),
        h('a', { href: `#${lane.id}`, class: 'lane-title' }, lane.title),
        h('span', { class: 'muted small' }, `${s.done}/${s.total} tasks`),
        ProgressRing(s.total ? s.done / s.total : 0, { size: 30, stroke: 3.5, color: hue })),
      h('div', { class: 'lane-cards' },
        cards.length ? cards.map((c) => LaneCard(ctx, c, hue, now)) : h('p', { class: 'muted small lane-empty' }, 'Nothing here yet.'),
        lane.type !== 'workplan' && h('button', { class: 'lane-add', title: 'Add the next level', onclick: () => ctx.addChild(lane.id, { objective: 'goal', goal: 'workplan', plan: 'objective' }[lane.type] ?? 'task') }, icon('plus', 16))));
  }));
}

function LaneCard(ctx, c, hue, now) {
  const doc = ctx.store.doc;
  if (c.type === 'task') {
    return h('a', { class: `lane-card task s-${c.status}`, href: `#${c.id}` },
      h('span', { class: 'lane-status', style: `background:${statusById[c.status]?.color}` }, statusById[c.status]?.label),
      h('strong', {}, c.title),
      h('span', { class: 'muted small' }, range(c.start, c.end)),
      AvatarStack(c.assigneeIds.map((id) => ctx.org.staff[id]), { max: 4, size: 20 }));
  }
  if (c.type === 'workplan') {
    const p = workplanProgress(doc, c.id, now);
    return h('a', { class: 'lane-card wp', href: `#${c.id}` },
      h('div', { class: 'lane-card-top' }, lightDot(p.state), h('strong', {}, c.title)),
      h('span', { class: 'muted small' }, range(c.start, c.end)),
      h('div', { class: 'lane-meter' }, h('i', { style: `width:${p.pct}%;background:${hue}` }), p.expected != null && h('b', { style: `left:${p.expected}%`, title: `Expected by today: ${p.expected}%` })),
      h('div', { class: 'lane-card-foot' }, AvatarStack(c.staffIds.map((id) => ctx.org.staff[id]), { max: 4, size: 20 }), h('span', { class: 'muted small' }, `${p.done}/${p.total}`)));
  }
  // A goal (or objective) with its workplans as rows.
  const wps = childrenOf(doc, c.id).filter((n) => n.type === 'workplan' || n.type === 'goal');
  const s = taskSummary(doc, c.id);
  return h('div', { class: 'lane-card goal' },
    h('div', { class: 'lane-card-top' }, LevelBadge(c.type, { plain: true }), h('a', { href: `#${c.id}` }, h('strong', {}, c.title))),
    h('div', { class: 'lane-meter' }, h('i', { style: `width:${s.total ? (s.done / s.total) * 100 : 0}%;background:${hue}` })),
    wps.length ? h('ul', { class: 'lane-rows' }, wps.map((w) => {
      const p = w.type === 'workplan' ? workplanProgress(doc, w.id, now) : null;
      return h('li', {}, p ? lightDot(p.state) : null, h('a', { href: `#${w.id}` }, w.title), h('span', { class: 'muted small' }, p ? `${p.done}/${p.total}` : ''));
    })) : h('p', { class: 'muted small' }, 'No workplans yet.'),
    h('div', { class: 'lane-card-foot' }, AvatarStack(peopleOf(doc, ctx.org, c), { max: 5, size: 20 }), (c.measures?.length ?? 0) > 0 && h('span', { class: 'muted small' }, `${c.measures.length} measure${c.measures.length === 1 ? '' : 's'}`)));
}

let boardBy = 'status';
export function Board(ctx, wp) {
  const { store, org } = ctx;
  const doc = store.doc;
  const tasks = descendants(doc, wp.id).filter((n) => n.type === 'task');
  const now = today();
  const card = (t) => {
    const late = t.status !== 'done' && t.end && t.end < now;
    const el = h('article', { class: `board-card s-${t.status}${t.id === ctx.selectedId ? ' on' : ''}`, draggable: 'true', 'data-id': t.id },
      h('a', { class: 'board-card-title', href: `#${t.id}` }, t.title),
      h('div', { class: 'board-card-meta' },
        h('span', { class: `small${late ? ' late' : ' muted'}` }, icon('calendar', 12), short(t.end)),
        (t.assets?.length ?? 0) > 0 && h('span', { class: 'muted small', title: `${t.assets.length} in the toolbox` }, icon('paperclip', 12), String(t.assets.length)),
        (t.events?.length ?? 0) > 0 && h('span', { class: 'muted small', title: 'Timeline entries' }, icon('history', 12), String(t.events.length)),
        h('span', { class: 'spacer' }),
        AvatarStack(t.assigneeIds.map((id) => org.staff[id]), { max: 3, size: 20 })));
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-task', t.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  };
  const dropZone = (el, status) => {
    el.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-task')) { e.preventDefault(); el.classList.add('over'); } });
    el.addEventListener('dragleave', () => el.classList.remove('over'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); el.classList.remove('over');
      const id = e.dataTransfer.getData('text/x-task');
      if (id && doc.nodes[id] && doc.nodes[id].status !== status) store.apply(strategyOps.setStatus(doc, id, status, now));
    });
    return el;
  };
  const column = (s, list) => dropZone(h('div', { class: 'board-col', style: `--c:${s.color}` },
    h('header', {}, h('span', { class: 'board-dot' }), h('strong', {}, s.label), h('span', { class: 'muted small' }, String(list.length))),
    h('div', { class: 'board-cards' }, list.length ? list.map(card) : h('p', { class: 'board-empty' }, s.id === 'blocked' ? 'Nothing blocked.' : s.id === 'done' ? 'Nothing done yet.' : 'Drop a card here.')),
    s.id === 'planned' && boardBy === 'status' && h('button', { class: 'board-add', onclick: () => ctx.addChild(wp.id, 'task') }, icon('plus', 14), 'Add a task')), s.id);

  const tools = h('div', { class: 'board-tools' },
    h('div', { class: 'join' }, [['status', 'By status'], ['person', 'By person']].map(([id, label]) =>
      h('button', { class: `btn btn-xs join-item${boardBy === id ? ' btn-active' : ''}`, onclick: () => { boardBy = id; ctx.render(); } }, label))),
    h('span', { class: 'muted small' }, 'Drag a card to another column to change its status.'));

  // How the workplan is doing, and what is due next, above the board.
  const p = workplanProgress(doc, wp.id, now);
  const open = tasks.filter((t) => t.status !== 'done' && t.end).sort((a, b) => a.end.localeCompare(b.end));
  const strip = h('div', { class: 'board-strip', style: `--hue:${objectiveHue(doc, wp)}` },
    h('span', { class: 'board-strip-state' }, lightDot(p.state), PROGRESS_STATES[p.state].label),
    h('div', { class: 'lane-meter', title: `${p.pct}% done${p.expected != null ? `, ${p.expected}% expected by today` : ''}` },
      h('i', { style: `width:${p.pct}%;background:${objectiveHue(doc, wp)}` }), p.expected != null && h('b', { style: `left:${p.expected}%` })),
    h('span', { class: 'muted small' }, `${p.pct}% done${p.expected != null ? ` · ${p.expected}% expected by now` : ''}`),
    open.length > 0 && h('div', { class: 'board-next' }, h('span', { class: 'muted' }, 'Due next:'),
      open.slice(0, 3).map((t) => h('a', { href: `#${t.id}`, class: t.end < now ? 'late' : '' }, icon('calendar', 12), `${short(t.end)} · ${t.title.length > 30 ? `${t.title.slice(0, 29)}…` : t.title}`))),
    AvatarStack((wp.staffIds ?? []).map((id) => org.staff[id]), { max: 6, size: 24 }));

  if (boardBy === 'status') {
    return h('div', { class: 'board' }, strip, tools, h('div', { class: 'board-cols' }, TASK_STATUSES.map((s) => column(s, tasks.filter((t) => t.status === s.id)))));
  }
  const people = [...new Set(tasks.flatMap((t) => t.assigneeIds))].map((id) => org.staff[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const lanes = [...people.map((p) => ({ p, list: tasks.filter((t) => t.assigneeIds.includes(p.id)) })), { p: null, list: tasks.filter((t) => !t.assigneeIds.length) }].filter((l) => l.list.length);
  return h('div', { class: 'board by-person' }, strip, tools,
    h('div', { class: 'board-grid', style: `--cols:${TASK_STATUSES.length}` },
      h('div', { class: 'board-corner' }),
      TASK_STATUSES.map((s) => h('div', { class: 'board-colhead', style: `--c:${s.color}` }, h('span', { class: 'board-dot' }), s.label)),
      lanes.flatMap(({ p, list }) => [
        h('div', { class: 'board-person' }, p ? [Avatar(p, 26), h('span', {}, h('strong', {}, p.name), p.title && h('small', {}, p.title))] : h('span', { class: 'muted' }, 'Nobody yet')),
        ...TASK_STATUSES.map((s) => dropZone(h('div', { class: 'board-cell', style: `--c:${s.color}` }, list.filter((t) => t.status === s.id).map(card)), s.id)),
      ])));
}
