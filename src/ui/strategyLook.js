import { h } from './dom.js';
import { snap } from './wheel.js';
import { icon } from './icons.js';
import { Avatar } from './Shell.js';
import { staffList, teamList } from '../platform/org.js';
import { rootOf, childrenOf, descendants, ancestors } from '../platform/strategy.js';

/**
 * One look for strategy, shared by Plan and the Planning Studio,
 * so a framework, plan, objective, goal, workplan or task reads the same in
 * both: the same icon, the same level colour, the same objective hue.
 *
 *   LevelBadge('goal')                      a small coloured badge: ○ Goal
 *   objectiveHue(doc, node)                 the hue of the objective a node sits under
 *   ProgressRing(0.4, { size: 34 })         a ring with the share done
 *   AvatarStack(staff, { max: 5 })          overlapping avatars, "+12" for the rest
 *   PeoplePicker({ org, selected, onChange })  compact: a stack and a searchable popover
 */
export const LEVELS = {
  framework: { label: 'Framework', long: 'Strategic framework', icon: 'compass', color: '#3a4256' },
  plan: { label: 'Plan', long: 'Strategic plan', icon: 'mapTrifold', color: '#7b2fe8' },
  objective: { label: 'Objective', long: 'Strategic objective', icon: 'target', color: '#b05bd8' },
  goal: { label: 'Goal', long: 'Goal', icon: 'flag', color: '#1f8a6b' },
  workplan: { label: 'Workplan', long: 'Workplan', icon: 'timeline', color: '#ef7f2d' },
  task: { label: 'Task', long: 'Task', icon: 'checklist', color: '#56657f' },
};

/** Hues for objectives, in order (checked side by side for colour vision differences). Past eight, grey. */
// Alpha 0.3: from the colour wheel, spaced so neighbours stand apart.
export const OBJECTIVE_HUES = ['#2c4fa3', '#ef7f2d', '#4da65c', '#f7c744', '#c77deb', '#3e8fa6', '#7b2fe8', '#c8432f'];
export const OTHER_HUE = '#8a90a0';

export function LevelBadge(type, { long = false, plain = false } = {}) {
  const l = LEVELS[type] ?? LEVELS.task;
  return h('span', { class: `level-badge${plain ? ' plain' : ''}`, style: `--lv:${l.color}` }, icon(l.icon, 13), long ? l.long : l.label);
}
export const levelIcon = (type, size = 16) => h('span', { class: 'level-ico', style: `--lv:${(LEVELS[type] ?? LEVELS.task).color}` }, icon((LEVELS[type] ?? LEVELS.task).icon, size));

/** Objectives in framework order, each with its hue (its own colour if set). */
export function objectiveOrder(doc) {
  const out = [];
  const walk = (id) => { for (const c of childrenOf(doc, id)) { if (c.type === 'objective') out.push(c); else if (c.type === 'plan' || c.type === 'framework') walk(c.id); } };
  const root = rootOf(doc);
  if (root) walk(root.id);
  return out.map((o, i) => ({ node: o, hue: (o.color && snap(o.color)) || OBJECTIVE_HUES[i] || OTHER_HUE }));
}
export function objectiveHue(doc, node) {
  if (!node) return OTHER_HUE;
  const obj = node.type === 'objective' ? node : ancestors(doc, node.id).find((a) => a.type === 'objective');
  if (!obj) return LEVELS[node.type]?.color ?? OTHER_HUE;
  return objectiveOrder(doc).find((o) => o.node.id === obj.id)?.hue ?? OTHER_HUE;
}

/** A ring showing a share (0–1), with the percentage inside. */
export function ProgressRing(frac, { size = 34, color = 'var(--color-primary)', label = null, stroke = 4 } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(Math.max(0, Math.min(1, frac || 0)) * 100);
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${size} ${size}`); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('class', 'ring');
  s.setAttribute('role', 'img'); s.setAttribute('aria-label', label ?? `${pct}% done`);
  s.innerHTML = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-opacity="0.12" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * pct) / 100} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-size="${Math.round(size * 0.3)}" font-weight="700" fill="currentColor">${pct}<tspan font-size="${Math.round(size * 0.17)}" font-weight="600" dx="1">%</tspan></text>`;
  return s;
}

/** Overlapping avatars; past `max`, a "+n" chip. */
export function AvatarStack(people, { max = 5, size = 24, onClick = null } = {}) {
  const list = people.filter(Boolean);
  const shown = list.slice(0, max);
  const el = h(onClick ? 'button' : 'span', { class: 'avatar-stack', type: onClick ? 'button' : null, onclick: onClick, title: list.map((p) => p.name).join(', ') || 'Nobody yet' },
    shown.map((p) => h('span', { class: 'avatar-stack-item' }, Avatar(p, size))),
    list.length > max && h('span', { class: 'avatar-more', style: `height:${size}px;min-width:${size}px` }, `+${list.length - max}`),
    !list.length && h('span', { class: 'avatar-none muted small' }, 'Nobody yet'));
  return el;
}

/**
 * Pick people without a wall of checkboxes: who is on it shows as a stack
 * (or chips when few), and "Add people" opens a popover with search,
 * team filters and "add the whole team".
 */
export function PeoplePicker({ org, selected, onChange, label = 'People', teams = true, chips = 8 }) {
  const staff = staffList(org);
  const on = new Set(selected);
  const chosen = staff.filter((s) => on.has(s.id));
  let pop = null;
  const close = () => { pop?.remove(); pop = null; document.removeEventListener('pointerdown', outside, true); };
  const outside = (e) => { if (pop && !pop.contains(e.target) && !wrap.contains(e.target)) close(); };
  const open = () => {
    if (pop) return close();
    let q = '';
    let team = null;
    const list = h('div', { class: 'pp-list', role: 'listbox', 'aria-multiselectable': 'true' });
    const draw = () => {
      const rows = staff.filter((s) => (!team || s.teamIds?.includes(team)) && (!q || `${s.name} ${s.title ?? ''}`.toLowerCase().includes(q)));
      list.replaceChildren(...(rows.length ? rows.map((s) => h('label', { class: `pp-row${on.has(s.id) ? ' on' : ''}` },
        h('input', { type: 'checkbox', class: 'checkbox checkbox-xs', checked: on.has(s.id), onchange: (e) => { e.target.checked ? on.add(s.id) : on.delete(s.id); onChange([...on]); } }),
        Avatar(s, 22), h('span', {}, h('strong', {}, s.name), s.title && h('small', {}, s.title)))) : [h('p', { class: 'muted small pp-empty' }, 'Nobody matches.')]));
    };
    const search = h('input', { class: 'input input-sm', type: 'search', placeholder: `Find a person (${staff.length})`, 'aria-label': 'Find a person', oninput: (e) => { q = e.target.value.trim().toLowerCase(); draw(); } });
    const teamRow = teams && teamList(org).length > 0 && h('div', { class: 'pp-teams' },
      h('button', { type: 'button', class: 'pp-team on', onclick: (e) => { team = null; mark(e.currentTarget); draw(); } }, 'Everyone'),
      teamList(org).map((t) => h('button', { type: 'button', class: 'pp-team', style: `--c:${t.color ?? '#999'}`, onclick: (e) => { team = t.id; mark(e.currentTarget); draw(); } }, t.name)));
    const mark = (btn) => { teamRow?.querySelectorAll('.pp-team').forEach((b) => b.classList.toggle('on', b === btn)); addTeam.hidden = !team; };
    const addTeam = h('button', { type: 'button', class: 'btn btn-xs', hidden: true, onclick: () => { staff.filter((s) => s.teamIds?.includes(team)).forEach((s) => on.add(s.id)); onChange([...on]); draw(); } }, 'Add the whole team');
    pop = h('div', { class: 'pp-pop', role: 'dialog', 'aria-label': `Choose ${label.toLowerCase()}` }, search, teamRow, list,
      h('div', { class: 'pp-foot' }, addTeam, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-xs btn-primary', onclick: close }, 'Done')));
    draw();
    wrap.append(pop);
    document.addEventListener('pointerdown', outside, true);
    requestAnimationFrame(() => search.focus());
  };
  const remove = (id) => { on.delete(id); onChange([...on]); };
  const wrap = h('div', { class: 'people-picker' },
    chosen.length <= chips
      ? h('div', { class: 'pp-chips' }, chosen.map((s) => h('span', { class: 'pp-chip' }, Avatar(s, 20), s.name, h('button', { type: 'button', 'aria-label': `Remove ${s.name}`, onclick: () => remove(s.id) }, '×'))))
      : h('div', { class: 'pp-summary' }, AvatarStack(chosen, { max: 8, size: 26, onClick: open }), h('span', { class: 'muted small' }, `${chosen.length} people`)),
    h('button', { type: 'button', class: 'btn btn-xs pp-add', onclick: open }, icon('plus', 13), chosen.length ? 'Change' : `Add ${label.toLowerCase()}`));
  return wrap;
}

/** A node's people: workplan staff, task assignees, or everyone below. */
export function peopleOf(doc, org, node) {
  const ids = new Set(node.type === 'task' ? node.assigneeIds : node.type === 'workplan' ? node.staffIds : descendants(doc, node.id).flatMap((n) => n.assigneeIds ?? n.staffIds ?? []));
  return [...ids].map((id) => org.staff[id]).filter(Boolean);
}
