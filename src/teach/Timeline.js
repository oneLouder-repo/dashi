/**
 * Teach's timeline (eLearning stage 1): a DAW turned towards a calendar.
 * Track headers on the left, a ruler of real dates across the top (weeks,
 * today marked), the phases shaded behind, a load meter and a pace lane,
 * and blocks as coloured clips. Drag a clip to move it to another day or
 * track, drag its right edge to stretch it, click it to edit it. Block
 * types dropped from the palette land where they're dropped.
 *
 *   Timeline({ cartridge, issues, ppd, today, selected, picked, onChange, onOpen, onAdd, onPace, onTrack, onPick, onStream, onAddStream })
 *
 * There's always ROOM days of space before the pre-start and after the
 * post-end. Linked blocks (a stream) move together; Alt-drag moves one on its
 * own. Shift-click picks blocks to link into a new stream.
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { phases, dateOf, dayOf, shortDate, weekLoad, blockType, trackKind, moveBlock, resizeBlock, blockEnd, ROOM, streamSpan, streamBlocks, moveStream } from '../learning/cartridge.js';
import { bestInk, issuesFor } from '../learning/checks.js';

export const HEAD_WIDTH = 224;
export const ZOOMS = [{ id: 'fit', label: 'Fit', ppd: null }, { id: 'term', label: 'Term', ppd: 12 }, { id: 'month', label: 'Month', ppd: 20 }, { id: 'week', label: 'Week', ppd: 34 }, { id: 'day', label: 'Day', ppd: 56 }];
const ROW = 30;       // one row of clips
const PAD = 7;        // above and below the clips in a track
const HEAD = 224;     // the track headers' width

/** Rows for a track's blocks, so overlapping ones stack instead of hiding each other. */
function stack(blocks) {
  const ends = [];
  const rowOf = {};
  for (const b of [...blocks].sort((x, y) => x.start - y.start || y.length - x.length)) {
    let r = ends.findIndex((e) => e <= b.start);
    if (r < 0) { r = ends.length; ends.push(0); }
    ends[r] = blockEnd(b);
    rowOf[b.id] = r;
  }
  return { rowOf, rows: Math.max(1, ends.length) };
}

export function Timeline({ cartridge: c, issues = [], ppd = 20, today = new Date().toISOString().slice(0, 10), selected = null, picked = new Set(), canEdit = true, onChange, onOpen, onAdd, onPace, onTrack, onPick, onStream, onAddStream }) {
  const ph = phases(c);
  const from = ph[0].from - ROOM;
  const to = ph.at(-1).to + ROOM;
  const days = to - from;
  const width = days * ppd;
  const x = (day) => (day - from) * ppd;
  const t0 = dayOf(c.run.start, today);
  const promise = (Number(c.hoursPerWeek) || 3) * 60;

  // The ruler: weeks from day 0, the pre-start counted back.
  const ticks = [];
  for (let d = Math.ceil(from / 7) * 7; d < to; d += 7) ticks.push(d);
  const ruler = h('div', { class: 'tl-ruler', style: `width:${width}px` },
    [{ id: 'room', label: 'Room before', from, to: ph[0].from }, ...ph, { id: 'room', label: 'Room after', from: ph.at(-1).to, to }].map((p) => h('div', { class: `tl-phase-label p-${p.id}`, style: `left:${x(p.from)}px;width:${(p.to - p.from) * ppd}px` }, p.label)),
    ticks.map((d) => h('div', { class: 'tl-tick', style: `left:${x(d)}px` },
      h('b', {}, d < 0 ? `−${Math.abs(d / 7)}w` : d >= c.span.length ? `+${(d - c.span.length) / 7 + 1}w` : `Wk ${d / 7 + 1}`),
      h('span', {}, shortDate(dateOf(c.run.start, d))))),
    t0 >= from && t0 < to ? h('div', { class: 'tl-today-tag', style: `left:${x(t0) + ppd / 2}px` }, 'Today') : null);

  // The load meter: a bar per week of learner effort, against the hours promised.
  const loads = weekLoad(c);
  const meter = h('div', { class: 'tl-meter', style: `width:${width}px`, 'aria-label': 'Learner hours per week' },
    loads.map((w) => {
      if (w.week === 0) return null;
      const left = x((w.week - 1) * 7);
      if ((w.week - 1) * 7 >= to) return null;
      const pct = Math.min(1, w.minutes / (promise * 1.6));
      const level = w.minutes > promise * 1.5 ? 'hot' : w.minutes > promise * 1.15 ? 'warm' : 'ok';
      return h('div', { class: `tl-load ${level}`, style: `left:${left + 3}px;width:${7 * ppd - 6}px`, title: `Week ${w.week}: about ${Math.round(w.minutes / 6) / 10} hours (${c.hoursPerWeek} promised)` },
        h('i', { style: `width:${Math.max(2, pct * 100)}%` }), h('span', {}, `${Math.round(w.minutes / 6) / 10} h`));
    }));

  // The pace lane: notes on days.
  const pace = h('div', { class: 'tl-pace', style: `width:${width}px` },
    (c.pace ?? []).map((p) => h('button', { type: 'button', class: `tl-flag to-${p.to}`, style: `left:${x(p.day)}px`, title: `${shortDate(dateOf(c.run.start, p.day))}: ${p.text}`, onclick: () => onPace?.(p.id) },
      icon(p.send === 'email' ? 'mail' : 'flag', 12), h('span', {}, p.text))));
  if (canEdit) pace.addEventListener('dblclick', (e) => { if (e.target === pace) onPace?.(null, Math.floor(e.offsetX / ppd) + from); });

  // The streams lane: one bar per stream, from its first block to its last. Drag it to move them all.
  const streams = Object.values(c.streams ?? {});
  const streamLane = h('div', { class: 'tl-streams', style: `width:${width}px` },
    streams.map((st) => {
      const sp = streamSpan(c, st.id);
      if (!sp) return null;
      const n = streamBlocks(c, st.id).length;
      const bar = h('div', { class: 'tl-stream', 'data-sid': st.id, style: `left:${x(sp.start) + 1}px;width:${(sp.end - sp.start) * ppd - 2}px;--tone:${st.tone}`, tabindex: '0', role: 'button',
        title: `${st.name}: ${n} linked blocks. Drag to move them together; click to edit.`, 'aria-label': `Pack ${st.name}, ${n} blocks` },
      icon('link', 12), h('span', {}, st.name), h('small', {}, String(n)));
      bar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStream?.(st.id); }
        if (canEdit && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); onChange?.(moveStream(c, st.id, e.key === 'ArrowRight' ? 1 : -1), null); }
      });
      bar.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        const sx = e.clientX;
        let moved = false;
        bar.setPointerCapture(e.pointerId);
        const members = () => [bar, ...document.querySelectorAll(`.tl-clip[data-stream="${st.id}"]`)];
        const move = (ev) => {
          const dx = ev.clientX - sx;
          if (!moved && Math.abs(dx) < 4) return;
          if (!canEdit) return;
          moved = true;
          for (const el of members()) { el.classList.add('dragging'); el.style.transform = `translateX(${Math.round(dx / ppd) * ppd}px)`; }
        };
        const done = () => {
          bar.removeEventListener('pointermove', move);
          bar.removeEventListener('pointerup', up);
          bar.removeEventListener('pointercancel', cancel);
        };
        const reset = () => { for (const el of members()) { el.classList.remove('dragging'); el.style.transform = ''; } };
        const cancel = () => { done(); reset(); };
        const up = (ev) => {
          done();
          if (!moved) { onStream?.(st.id); return; }
          const dd = Math.round((ev.clientX - sx) / ppd);
          if (dd) onChange?.(moveStream(c, st.id, dd), null); else reset();
        };
        bar.addEventListener('pointermove', move);
        bar.addEventListener('pointerup', up);
        bar.addEventListener('pointercancel', cancel);
      });
      return bar;
    }));

  // The tracks.
  const lanes = c.tracks.map((t) => {
    const blocks = Object.values(c.blocks).filter((b) => b.trackId === t.id);
    const { rowOf, rows } = stack(blocks);
    const height = rows * ROW + PAD * 2;
    const lane = h('div', { class: `tl-lane${t.muted ? ' muted' : ''}`, 'data-track': t.id, style: `width:${width}px;height:${height}px;--tone:${t.tone}` });
    for (const b of blocks) lane.append(Clip(b, t, rowOf[b.id]));
    if (canEdit) {
      lane.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('text/x-dashi-block') || e.dataTransfer.types.includes('text/x-dashi-stream')) { e.preventDefault(); lane.classList.add('drop'); } });
      lane.addEventListener('dragleave', () => lane.classList.remove('drop'));
      lane.addEventListener('drop', (e) => {
        lane.classList.remove('drop');
        const r = lane.getBoundingClientRect();
        const tpl = e.dataTransfer.getData('text/x-dashi-stream');
        if (tpl) { e.preventDefault(); onAddStream?.({ tplId: tpl, start: Math.floor((e.clientX - r.left) / ppd) + from }); return; }
        const type = e.dataTransfer.getData('text/x-dashi-block');
        if (!type) return;
        e.preventDefault();
        onAdd?.({ type, trackId: t.id, start: Math.floor((e.clientX - r.left) / ppd) + from });
      });
    }
    const k = trackKind(t.kind);
    const head = h('div', { class: 'tl-head', style: `height:${height}px;--tone:${t.tone}` },
      h('span', { class: 'tl-head-bar', 'aria-hidden': 'true' }),
      h('span', { class: 'tl-head-icon' }, icon(k.icon, 15)),
      h('span', { class: 'tl-head-text' }, h('b', {}, t.name), h('small', {}, `${blocks.length} block${blocks.length === 1 ? '' : 's'}${t.muted ? ' · hidden from learners' : ''}`)),
      canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', title: t.muted ? 'Show to learners' : 'Hide from learners while you draft', 'aria-label': t.muted ? `Show ${t.name} to learners` : `Hide ${t.name} from learners`, onclick: () => onTrack?.(t.id, 'mute') }, icon(t.muted ? 'eyeOff' : 'eye', 14)),
      canEdit && h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', title: 'Track settings', 'aria-label': `Settings for ${t.name}`, onclick: () => onTrack?.(t.id, 'edit') }, icon('dots', 14)));
    return { head, lane };
  });

  function Clip(b, t, row) {
    const type = blockType(b.type);
    const mine = issuesFor(issues, b.id);
    const worst = mine.find((i) => i.level === 'block') ?? mine.find((i) => i.level === 'warn') ?? mine[0];
    const ink = bestInk(t.tone);
    const el = h('div', {
      class: `tl-clip${b.id === selected ? ' on' : ''}${b.required ? '' : ' optional'}${b.streamId ? ' linked' : ''}${picked.has(b.id) ? ' picked' : ''}`,
      style: `left:${x(b.start) + 1}px;width:${Math.max(ppd - 2, b.length * ppd - 2)}px;top:${PAD + row * ROW}px;--tone:${t.tone};--ink:${ink}${b.streamId ? `;--stream:${c.streams?.[b.streamId]?.tone ?? '#16181d'}` : ''}`,
      ...(b.streamId ? { 'data-stream': b.streamId } : {}),
      tabindex: '0', role: 'button',
      'aria-label': `${type.label}: ${b.title}, ${shortDate(dateOf(c.run.start, b.start))}${b.length > 1 ? ` to ${shortDate(dateOf(c.run.start, b.start + b.length - 1))}` : ''}${mine.length ? `, ${mine.length} to look at` : ''}`,
      title: `${type.label}: ${b.title}\n${shortDate(dateOf(c.run.start, b.start))}${b.length > 1 ? ` – ${shortDate(dateOf(c.run.start, b.start + b.length - 1))}` : ''}${b.at ? ` at ${b.at}` : ''} · ${b.minutes} min${worst ? `\n${worst.title}` : ''}`,
    }, icon(type.icon, 13), h('span', { class: 'tl-clip-title' }, b.title),
    worst && h('i', { class: `tl-dot l-${worst.level}`, 'aria-hidden': 'true' }),
    canEdit && h('span', { class: 'tl-grip', 'aria-hidden': 'true' }));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(b.id); }
      if (!canEdit) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        onChange?.(e.shiftKey ? resizeBlock(c, b.id, 'right', b.start + b.length - 1 + step) : moveBlock(c, b.id, { start: b.start + step }), b.id);
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.shiftKey && canEdit) { e.preventDefault(); onPick?.(b.id); return; }
      const grip = e.target.closest('.tl-grip');
      const together = !!b.streamId && !e.altKey && !grip;
      const members = () => (together ? [...document.querySelectorAll(`.tl-clip[data-stream="${b.streamId}"]`), ...document.querySelectorAll(`.tl-stream[data-sid="${b.streamId}"]`)] : [el]);
      const sx = e.clientX;
      const sy = e.clientY;
      // The timeline scrolls sideways under a long drag: count that in, so the block stays under the pointer.
      const scrollBox = el.closest('.tl-scroll');
      const sl0 = scrollBox?.scrollLeft ?? 0;
      const dxOf = (ev) => ev.clientX - sx + ((scrollBox?.scrollLeft ?? 0) - sl0);
      let moved = false;
      let last = e;
      let edgeTimer = null;
      el.setPointerCapture(e.pointerId);
      const paint = (ev) => {
        const dx = dxOf(ev);
        const dy = ev.clientY - sy;
        if (grip) el.style.width = `${Math.max(ppd - 2, (b.length + Math.round(dx / ppd)) * ppd - 2)}px`;
        else if (together) for (const m of members()) { m.classList.add('dragging'); m.style.transform = `translateX(${Math.round(dx / ppd) * ppd}px)`; }
        else el.style.transform = `translate(${Math.round(dx / ppd) * ppd}px, ${dy}px)`;
      };
      // Near either edge, the timeline scrolls along with the drag.
      const edge = () => {
        clearInterval(edgeTimer); edgeTimer = null;
        if (!scrollBox) return;
        const r = scrollBox.getBoundingClientRect();
        const step = last.clientX > r.right - 40 ? 12 : last.clientX < r.left + HEAD + 40 ? -12 : 0;
        if (step) edgeTimer = setInterval(() => { scrollBox.scrollLeft += step; paint(last); }, 30);
      };
      const move = (ev) => {
        last = ev;
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
        if (!canEdit) return;
        moved = true;
        el.classList.add('dragging');
        paint(ev);
        edge();
      };
      const reset = () => {
        for (const m of members()) { m.classList.remove('dragging'); m.style.transform = ''; m.style.visibility = ''; }
        el.style.width = el.dataset.w ?? el.style.width;
      };
      const finish = () => {
        clearInterval(edgeTimer);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', cancel);
      };
      // A cancelled pointer (the browser took over, a touch scroll) puts everything back as it was.
      const cancel = () => { finish(); reset(); };
      const up = (ev) => {
        finish();
        if (!moved) { onOpen?.(b.id); return; }
        const dd = Math.round(dxOf(ev) / ppd);
        if (grip) { if (dd) onChange?.(resizeBlock(c, b.id, 'right', b.start + b.length - 1 + dd), b.id); else reset(); return; }
        if (together) { if (dd) onChange?.(moveStream(c, b.streamId, dd), b.id); else reset(); return; }
        el.style.visibility = 'hidden';
        const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-track]');
        const trackId = under?.dataset.track ?? b.trackId;
        // Dropped where it started: nothing to save, just put it back (it used to stay hidden).
        if (!dd && trackId === b.trackId) { reset(); return; }
        onChange?.(moveBlock(c, b.id, { start: b.start + dd, trackId }), b.id);
      };
      el.dataset.w = el.style.width;
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', cancel);
    });
    return el;
  }

  // Behind everything: the phase bands, week lines and today.
  const bg = h('div', { class: 'tl-bg', style: `width:${width}px` },
    [{ id: 'room', from, to: ph[0].from }, ...ph, { id: 'room', from: ph.at(-1).to, to }].map((p) => h('div', { class: `tl-band p-${p.id}`, style: `left:${x(p.from)}px;width:${(p.to - p.from) * ppd}px` })),
    ticks.map((d) => h('div', { class: 'tl-week', style: `left:${x(d)}px` })),
    t0 >= from && t0 < to ? h('div', { class: 'tl-today', style: `left:${x(t0) + ppd / 2}px` }) : null);

  const body = h('div', { class: 'tl-body', style: `grid-template-columns:${HEAD}px ${width}px` },
    h('div', { class: 'tl-corner tl-sticky-top' }, h('b', {}, 'Tracks'), h('small', {}, `${c.run.start} · day 0`)),
    h('div', { class: 'tl-sticky-top tl-top' }, ruler),
    h('div', { class: 'tl-head tl-head-meta' }, icon('gauge', 14), h('span', { class: 'tl-head-text' }, h('b', {}, 'Load'), h('small', {}, `${c.hoursPerWeek} h a week promised`))),
    meter,
    h('div', { class: 'tl-head tl-head-meta' }, icon('flag', 14), h('span', { class: 'tl-head-text' }, h('b', {}, 'Pace notes'), h('small', {}, canEdit ? 'Double-click the lane to add' : `${(c.pace ?? []).length} notes`))),
    pace,
    streams.length > 0 && h('div', { class: 'tl-head tl-head-meta' }, icon('link', 14), h('span', { class: 'tl-head-text' }, h('b', {}, 'Packs'), h('small', {}, `${streams.length} · drag to move together`))),
    streams.length > 0 && streamLane,
    lanes.flatMap(({ head, lane }) => [head, lane]));
  // The bands sit behind the lanes, outside the grid, so they never push a row out of place.
  bg.style.left = `${HEAD}px`;
  body.prepend(bg);
  const scroller = h('div', { class: 'tl-scroll' }, body);
  // Open with today (or day 0) in view.
  requestAnimationFrame(() => { scroller.scrollLeft = Math.max(0, x(t0 >= from && t0 < to ? t0 : 0) - 3 * 7 * ppd / 2); });
  return scroller;
}
