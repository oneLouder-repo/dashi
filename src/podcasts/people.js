import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { Avatar } from '../ui/Shell.js';

/**
 * Who is in an episode: the people chosen so far as chips, a box to find
 * anyone on staff by name (arrow keys and Enter work), and a way to credit a
 * guest from outside the org by typing their name. The series' hosts sit
 * ready as one-click suggestions, and the people heard most often on the
 * series come first in the list.
 *
 *   const pp = PeoplePicker({ staff, ids, guests, hostIds, often, onChange });
 *   pp.el;  pp.value();  // { ids, guests }
 *   pp.setHosts(hostIds, often, { replace });   // when the series changes
 */
let seq = 0;
export function PeoplePicker({ staff, ids = [], guests = [], hostIds = [], often = [], onChange = () => {} }) {
  const uid = `pp-${++seq}`;
  const byId = Object.fromEntries(staff.map((s) => [s.id, s]));
  const st = { ids: ids.filter((id) => byId[id]), guests: [...guests], hostIds, often, active: 0, open: false };
  const changed = () => onChange({ ids: [...st.ids], guests: [...st.guests] });

  const chips = h('ul', { class: 'pp-chips', 'aria-label': 'In this episode' });
  const input = h('input', {
    class: 'pp-input', type: 'text', name: 'ep-person', autocomplete: 'off', placeholder: 'Add someone: type a name',
    role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': `${uid}-list`,
  });
  const menu = h('ul', { class: 'pp-menu', id: `${uid}-list`, role: 'listbox', hidden: true });
  const quick = h('div', { class: 'pp-quick' });
  const box = h('div', { class: 'pp-box' }, icon('search', 14), input);

  const isHost = (id) => st.hostIds.includes(id);
  const rank = (s) => (isHost(s.id) ? 0 : st.often.includes(s.id) ? 1 : 2);
  function results() {
    const q = input.value.trim().toLowerCase();
    const list = staff.filter((s) => !st.ids.includes(s.id))
      .filter((s) => !q || `${s.name} ${s.title ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((s) => ({ kind: 'staff', s }));
    const typed = input.value.trim();
    const known = typed && (staff.some((s) => s.name.toLowerCase() === typed.toLowerCase()) || st.guests.some((g) => g.toLowerCase() === typed.toLowerCase()));
    if (typed && !known) list.push({ kind: 'guest', name: typed });
    return list;
  }

  function pick(item) {
    if (item.kind === 'staff') st.ids.push(item.s.id);
    else st.guests.push(item.name.replace(/\s+/g, ' '));
    input.value = '';
    st.active = 0;
    draw();
    changed();
    input.focus();
  }
  const removeId = (id) => { st.ids = st.ids.filter((x) => x !== id); draw(); changed(); };
  const removeGuest = (name) => { st.guests = st.guests.filter((x) => x !== name); draw(); changed(); };

  function drawMenu() {
    const list = results();
    st.active = Math.min(st.active, Math.max(0, list.length - 1));
    menu.hidden = !st.open || !list.length;
    input.setAttribute('aria-expanded', String(!menu.hidden));
    menu.replaceChildren(...list.map((item, i) => {
      const id = `${uid}-opt-${i}`;
      const on = i === st.active;
      const li = item.kind === 'staff'
        ? h('li', { id, role: 'option', class: `pp-opt${on ? ' on' : ''}`, 'aria-selected': String(on) },
          Avatar(item.s, 24), h('span', { class: 'pp-opt-text' }, h('strong', {}, item.s.name), item.s.title && h('small', {}, item.s.title)),
          isHost(item.s.id) ? h('span', { class: 'pp-tag' }, 'Host') : st.often.includes(item.s.id) ? h('span', { class: 'pp-tag soft' }, 'Often on') : null)
        : h('li', { id, role: 'option', class: `pp-opt pp-opt-guest${on ? ' on' : ''}`, 'aria-selected': String(on) },
          h('span', { class: 'pp-plus' }, icon('plus', 14)), h('span', { class: 'pp-opt-text' }, h('strong', {}, `Add “${item.name}” as a guest`), h('small', {}, 'Someone from outside your organisation')));
      li.addEventListener('mousedown', (ev) => { ev.preventDefault(); pick(item); });
      li.addEventListener('mousemove', () => { if (st.active !== i) { st.active = i; drawMenu(); } });
      return li;
    }));
    if (!menu.hidden) input.setAttribute('aria-activedescendant', `${uid}-opt-${st.active}`); else input.removeAttribute('aria-activedescendant');
  }

  function draw() {
    chips.replaceChildren(
      ...st.ids.map((id) => h('li', { class: 'pp-chip' }, Avatar(byId[id], 22), h('span', {}, byId[id].name),
        isHost(id) && h('span', { class: 'pp-tag' }, 'Host'),
        h('button', { type: 'button', 'aria-label': `Take ${byId[id].name} off this episode`, onclick: () => removeId(id) }, icon('close', 12)))),
      ...st.guests.map((g) => h('li', { class: 'pp-chip guest' }, Avatar({ name: g }, 22), h('span', {}, g), h('span', { class: 'pp-tag soft' }, 'Guest'),
        h('button', { type: 'button', 'aria-label': `Take ${g} off this episode`, onclick: () => removeGuest(g) }, icon('close', 12)))));
    chips.hidden = !st.ids.length && !st.guests.length;
    const missing = st.hostIds.filter((id) => byId[id] && !st.ids.includes(id));
    quick.replaceChildren(...(missing.length ? [h('small', {}, 'Series hosts'), ...missing.map((id) => h('button', { type: 'button', class: 'pp-suggest', onclick: () => pick({ kind: 'staff', s: byId[id] }) }, icon('plus', 12), Avatar(byId[id], 18), byId[id].name))] : []));
    quick.hidden = !missing.length;
    drawMenu();
  }

  input.addEventListener('focus', () => { st.open = true; drawMenu(); });
  input.addEventListener('blur', () => { st.open = false; drawMenu(); });
  input.addEventListener('input', () => { st.open = true; st.active = 0; drawMenu(); });
  input.addEventListener('keydown', (ev) => {
    const list = results();
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      st.open = true;
      if (list.length) st.active = (st.active + (ev.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      drawMenu();
      menu.querySelector('.pp-opt.on')?.scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (st.open && list[st.active]) pick(list[st.active]);
    } else if (ev.key === 'Escape' && (input.value || !menu.hidden)) {
      ev.preventDefault();
      ev.stopPropagation();
      input.value = '';
      st.open = false;
      drawMenu();
    } else if (ev.key === 'Backspace' && !input.value) {
      if (st.guests.length) removeGuest(st.guests.at(-1));
      else if (st.ids.length) removeId(st.ids.at(-1));
    }
  });

  draw();
  return {
    el: h('div', { class: 'pp' }, chips, h('div', { class: 'pp-add' }, box, menu), quick),
    value: () => ({ ids: [...st.ids], guests: [...st.guests] }),
    setHosts(next, often = [], { replace = false } = {}) {
      if (replace) st.ids = next.filter((id) => byId[id]);
      st.hostIds = next;
      st.often = often;
      draw();
    },
  };
}
