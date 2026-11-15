import { Sprite } from '../core/Sprite.js';

/**
 * One actor on the board, drawn as a sticky note in its lens category's
 * colour: the name in bold, a short description under it, and the category
 * along the bottom. Agents keep a dark outline and a solid corner notch,
 * so they read apart from actors at a glance. The dock box at the top-left
 * corner is where you drag from to draw a connector.
 *
 *   signal(times)   ping a few times, e.g. when its zone or layer is clicked
 *   pulsing = true  keep pinging (data viz focus)
 */
const SIGNAL_MS = 1100;
const NAME_PX = 18;
const DESC_PX = 13;
// Zoomed far out (see `.far` in theme.css), a note shows just its name, big enough to read.
const FAR_PX = 25;

export class ActorView extends Sprite {
  interactive = true;
  kind = 'actor';
  #selected = false;

  constructor(id) {
    super();
    this.id = id;
    this.node.classList.add('actor');
    this.ping = this.draw('rect', { class: 'actor-ping' });
    this.box = this.draw('rect', { class: 'actor-note' });
    this.fold = this.draw('path', { class: 'actor-fold' });
    this.mark = this.draw('path', { class: 'agent-mark' });
    this.text = this.draw('text', { class: 'actor-label' });
    this.desc = this.draw('text', { class: 'actor-desc' });
    this.badge = this.draw('text', { class: 'actor-badge' });
    this.farText = this.draw('text', { class: 'actor-far' });
    this.dock = this.draw('rect', { class: 'actor-dock', width: 16, height: 16, rx: 3, 'data-dock': '' });
    this.dock.append(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'title'), { textContent: 'Drag to connect' }));
  }

  update(actor, lens) {
    this.moveTo(actor.x, actor.y);
    const { w, h } = actor;
    for (const [k, v] of Object.entries({ x: -w / 2, y: -h / 2, width: w, height: h, rx: 4 })) this.box.setAttribute(k, v);

    const category = lens.categoryById[actor.category];
    const agent = actor.kind === 'agent';
    this.node.classList.toggle('unmapped', !category);
    this.node.classList.toggle('agent', agent);
    // A sticky's lifted corner, bottom right.
    this.fold.setAttribute('d', `M ${w / 2} ${h / 2 - 14} L ${w / 2 - 14} ${h / 2} L ${w / 2 - 14} ${h / 2 - 10} Q ${w / 2 - 14} ${h / 2 - 14} ${w / 2 - 10} ${h / 2 - 14} Z`);
    // Agents carry a solid notch in the top-right corner, a mark for agency.
    this.mark.setAttribute('d', agent ? `M ${w / 2} ${-h / 2 + 4} v 16 L ${w / 2 - 20} ${-h / 2} h 16 q 4 0 4 4 Z` : '');
    this.dock.setAttribute('x', -w / 2 - 6);
    this.dock.setAttribute('y', -h / 2 - 6);
    for (const [k, v] of Object.entries({ x: -w / 2, y: -h / 2, width: w, height: h, rx: 6 })) this.ping.setAttribute(k, v);
    this.size = { w, h };
    this.box.style.fill = category?.color ?? '';
    this.fold.style.fill = category?.color ?? '';

    const left = -w / 2 + 12;
    const description = String(actor.meta?.description ?? '').trim();
    const nameLines = wrap(actor.label || 'Untitled', Math.max(6, Math.floor((w - 28) / (NAME_PX * 0.56))), description ? 2 : 3);
    const nameTop = -h / 2 + 12 + NAME_PX;
    this.#lines(this.text, nameLines, left, nameTop, NAME_PX + 3);
    const descTop = nameTop + nameLines.length * (NAME_PX + 3) + 1;
    const room = Math.max(0, Math.floor((h / 2 - 24 - descTop) / (DESC_PX + 3.5)) + 1);
    this.#lines(this.desc, description ? wrap(description, Math.floor((w - 24) / (DESC_PX * 0.52)), room) : [], left, descTop, DESC_PX + 3.5);
    // As big as fits: a long word shrinks the type rather than being cut.
    const longest = Math.max(...String(actor.label || 'Untitled').split(/\s+/).map((x) => x.length));
    const px = Math.max(17, Math.min(FAR_PX, (w - 22) / (Math.max(longest, 6) * 0.6)));
    const far = wrap(actor.label || 'Untitled', Math.max(5, Math.floor((w - 22) / (px * 0.58))), 3);
    this.farText.style.fontSize = `${px}px`;
    this.#lines(this.farText, far, left - 2, -((far.length - 1) * (px + 2)) / 2 + px * 0.36, px + 2);
    this.badge.setAttribute('x', left);
    this.badge.setAttribute('y', h / 2 - 9);
    const categoryLabel = category ? category.label : `unmapped: ${actor.category}`;
    this.badge.textContent = agent ? `Agent · ${categoryLabel}` : categoryLabel;
  }

  #lines(el, lines, x, top, lineHeight) {
    el.replaceChildren();
    lines.forEach((line, i) => {
      const t = this.draw('tspan', { x, y: top + i * lineHeight });
      t.textContent = line;
      el.append(t);
    });
  }

  get selected() { return this.#selected; }
  set selected(v) {
    if (v === this.#selected) return;
    this.#selected = v;
    this.node.classList.toggle('selected', v);
    if (v) this.addEventListener('enterFrame', this.#pulse);
    else {
      this.removeEventListener('enterFrame', this.#pulse);
      this.box.style.strokeOpacity = '';
    }
  }

  /** Ping a few times: rings spread out from the note and fade. */
  signal(times = 3) {
    this.#signalStart = null;
    this.#signalsLeft = times;
    this.node.classList.add('signalling');
    this.addEventListener('enterFrame', this.#signal);
  }

  get pulsing() { return this.#pulsing; }
  set pulsing(v) {
    this.#pulsing = v;
    this.node.classList.toggle('focus', v);
    if (v) this.signal(1);
  }

  #pulsing = false;
  #signalStart = null;
  #signalsLeft = 0;
  #signal = (e) => {
    this.#signalStart ??= e.time;
    const t = (e.time - this.#signalStart) / SIGNAL_MS;
    if (t >= 1) {
      this.ping.style.opacity = 0;
      if (this.#pulsing || --this.#signalsLeft > 0) { this.#signalStart = e.time; return; }
      this.node.classList.remove('signalling');
      this.removeEventListener('enterFrame', this.#signal);
      return;
    }
    const grow = 4 + t * 26;
    const { w, h } = this.size ?? { w: 176, h: 108 };
    for (const [k, v] of Object.entries({ x: -w / 2 - grow, y: -h / 2 - grow, width: w + grow * 2, height: h + grow * 2, rx: 6 + grow })) this.ping.setAttribute(k, v);
    this.ping.style.opacity = (1 - t) * 0.95;
  };

  // A gentle breathing outline while selected.
  #pulse = (e) => {
    this.box.style.strokeOpacity = 0.55 + 0.45 * Math.sin(e.time / 260);
  };
}

/** Wrap text onto at most `max` lines of about `maxChars`, ending with … when it runs over. */
export function wrap(text, maxChars, max = 2) {
  if (max <= 0) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [''];
  for (const word of words) {
    const line = lines.at(-1);
    if (!line) lines[lines.length - 1] = word;
    else if ((line + ' ' + word).length <= maxChars) lines[lines.length - 1] = `${line} ${word}`;
    else lines.push(word);
  }
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = `${lines.slice(max - 1).join(' ')}`;
    return kept.map((l, i) => (i === max - 1 || l.length > maxChars ? (l.length > maxChars ? `${l.slice(0, maxChars - 1).trimEnd()}…` : l) : l));
  }
  return lines.map((l) => (l.length > maxChars ? `${l.slice(0, maxChars - 1)}…` : l));
}
