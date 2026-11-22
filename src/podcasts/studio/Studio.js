import { h, options } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { uiAlert, uiConfirm, uiPrompt } from '../../ui/dialog.js';
import { putMedia } from '../../platform/media.js';
import { isAudioFile, slugify, nextNumber, seasonsOf, showsInOrder } from '../../platform/podcasts.js';
import { today } from '../../strategy/dates.js';
import * as P from './project.js';
import { rememberFile, FilesPicker } from './Files.js';
import * as S from './slides.js';
import { PluginHeader } from '../../ui/PluginHeader.js';
import { Transport, Recorder, loadBuffer, cachedBuffer, keepBuffer, sourceKey, mono, silencesOf, mixdown, playOnce, audioContext } from './audio.js';

/**
 * The Podcast Studio: record, import, arrange and edit an episode in the
 * browser, then mix it down and send it straight to the station as a
 * draft episode with its chapters.
 *
 *   #studio            sessions, and a new one from a template
 *   #studio/<id>       the editor: tracks, clips, the transport and the toolbox
 *
 * It is the Podcasts plugin's own: sessions live in the podcasts document
 * (`projects`), recordings and imports are stored media like episode audio.
 *
 * ctx = { store, col, doc(), go(hash), org }
 */

/* ================================================================== sessions */
export function StudioHome(ctx) {
  const projects = Object.values(ctx.doc().projects ?? {}).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
  const create = async (template) => {
    const name = await uiPrompt('Name the session (an episode, a trailer, a clip…)', TEMPLATE_TITLE[template] ?? 'Untitled session');
    if (!name?.trim()) return;
    const p = P.newProject({ title: name.trim(), template, podcastId: showsInOrder(ctx.doc())[0]?.id ?? null });
    ctx.store.apply(ctx.col.add('projects', p));
    ctx.go(`studio/${p.id}`);
  };
  return h('div', { class: 'pc-main st-home' },
    // The plugin's own header, with its colour (alpha 0.3 PR 17), like every other page.
    PluginHeader('podcasts', { title: 'Studio', actions: [h('a', { class: 'btn btn-sm', href: '#studio/files' }, icon('waveform', 14), 'Audio files')] }),
    h('section', { class: 'st-templates' },
      h('h2', {}, 'Start a session'),
      h('div', { class: 'st-tpl-grid' }, P.TEMPLATES.map((t) =>
        h('button', { type: 'button', class: 'st-tpl', onclick: () => create(t.id) },
          h('span', { class: 'st-tpl-lanes', 'aria-hidden': 'true' }, t.tracks.map(([, k]) => h('i', { class: `k-${k}` }))),
          h('strong', {}, t.label), h('small', {}, t.blurb))))),
    projects.length > 0 && h('section', { class: 'st-sessions' },
      h('h2', {}, 'Your sessions'),
      h('div', { class: 'st-session-list' }, projects.map((p) => {
        const len = P.projectLength(p);
        const series = ctx.doc().podcasts[p.podcastId];
        return h('a', { class: 'st-session', href: `#studio/${p.id}` },
          h('span', { class: 'st-session-mini', 'aria-hidden': 'true' }, p.tracks.slice(0, 5).map((t) => h('i', { class: `k-${t.kind}` },
            P.clipsOn(p, t.id).map((c) => h('b', { style: `left:${len ? (c.start / len) * 100 : 0}%;width:${len ? Math.max(1, (c.length / len) * 100) : 0}%` }))))),
          h('span', { class: 'st-session-text' },
            h('strong', {}, p.title),
            h('small', { class: 'muted' }, [series?.title, len ? P.clock(len, { tenths: false }) : 'Empty', `${Object.keys(p.clips).length} clips`, p.episodeId && ctx.doc().episodes[p.episodeId] ? 'Sent to the station' : null].filter(Boolean).join(' · '))));
      }))));
}
const TEMPLATE_TITLE = { interview: 'New interview', solo: 'New episode', panel: 'Panel discussion', radio: 'Radio hour', blank: 'Untitled session' };

/* ================================================================== the editor */
export function StudioEditor(ctx, projectId) {
  let project = structuredClone(ctx.doc().projects[projectId]);
  if (!project) return h('div', { class: 'pc-main' }, h('p', { class: 'empty' }, 'That session isn’t here.'), h('a', { class: 'btn btn-sm', href: '#studio' }, 'All sessions'));
  migrate(project);
  const getEpisode = (id) => ctx.doc().episodes[id];
  const transport = new Transport();
  const undo = [];
  const redo = [];
  // Pixels per second: 40, or less for a long session so it opens seen whole (alpha 0.3 PR 17).
  let pps = Math.max(0.2, Math.min(40, ((typeof innerWidth === 'number' ? innerWidth : 1400) - 560) / (P.projectLength(project) + 30)));
  let playhead = 0;
  let selected = null;           // clip id
  let track = project.tracks[0]?.id ?? null;   // the armed track
  let range = null;              // { from, to } on the timeline
  let snapOn = true;
  let recorder = null;
  let recStart = 0;
  let dock = project.slides.length ? 'slides' : 'clip';
  let saveTimer = null;
  let slidePick = null;          // the slide being edited
  let shown = undefined;         // the slide on the screen now

  /* ---------- state changes */
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => ctx.store.apply(ctx.col.update('projects', project.id, structuredClone(project))), 300); };
  const commit = (next, { keepRedo = false } = {}) => {
    if (!next || next === project) return;
    undo.push(project);
    if (undo.length > 100) undo.shift();
    if (!keepRedo) redo.length = 0;
    delete next.lastId;
    project = next;
    if (selected && !project.clips[selected]) selected = null;
    if (!project.tracks.some((t) => t.id === track)) track = project.tracks[0]?.id ?? null;
    save();
    if (transport.playing) restart();
    draw();
  };
  const doUndo = () => { if (!undo.length) return; redo.push(project); project = undo.pop(); save(); draw(); };
  const doRedo = () => { if (!redo.length) return; undo.push(project); project = redo.pop(); save(); draw(); };
  const restart = () => { const t = transport.position(); transport.play(project, t, getEpisode); };

  /* ---------- layout */
  const root = h('div', { class: 'st', tabindex: '-1' });
  const titleIn = h('input', { class: 'st-title', value: project.title, 'aria-label': 'Session name', onchange: (e) => commit({ ...structuredClone(project), title: e.target.value.trim() || project.title }) });
  const seriesSel = h('select', { class: 'select select-sm', 'aria-label': 'For which series', onchange: (e) => commit({ ...structuredClone(project), podcastId: e.target.value || null }) },
    h('option', { value: '' }, 'No series yet'), options(showsInOrder(ctx.doc()).map((s) => ({ id: s.id, label: s.title })), project.podcastId));
  const timeEl = h('output', { class: 'st-time', 'aria-live': 'off' }, '0:00.0');
  const meter = h('span', { class: 'st-meter', 'aria-hidden': 'true' }, h('i'));
  const playBtn = h('button', { type: 'button', class: 'st-tbtn st-play', title: 'Play or pause (space)', 'aria-label': 'Play', onclick: () => togglePlay() }, icon('play', 18));
  const recBtn = h('button', { type: 'button', class: 'st-tbtn st-rec', title: 'Record on the selected track (R)', 'aria-label': 'Record', onclick: () => toggleRecord() }, h('span', { class: 'st-rec-dot' }));
  const zoomIn = h('input', { type: 'range', class: 'st-zoom', min: 0.2, max: 400, step: 'any', value: pps, 'aria-label': 'Zoom', oninput: (e) => { const c = scroller.scrollLeft / pps + scroller.clientWidth / 2 / pps; pps = +e.target.value; draw(); scroller.scrollLeft = c * pps - scroller.clientWidth / 2; } });
  const fileIn = h('input', { type: 'file', accept: '.mp3,.wav,audio/*', multiple: true, class: 'sr-only', onchange: (e) => importFiles([...e.target.files], track, freeSpot(track, playhead)) });
  // Where an import goes: the playhead, or after the track's last clip if something is already there.
  const freeSpot = (trackId, at) => {
    const on = P.clipsOn(project, trackId);
    return on.some((c) => c.start <= at + 0.01 && P.clipEnd(c) > at) ? Math.max(...on.map(P.clipEnd)) : at;
  };

  // The slide showing at the playhead, small, in the transport (alpha 0.3 PR 17). Click it for the Slides tab.
  const miniScreen = h('button', { type: 'button', class: 'st-mini-screen', title: 'The slide showing now: open the Slides tab', onclick: () => { dock = 'slides'; drawDock(); } });
  const bigScreen = h('div', { class: 'st-screen', 'aria-live': 'polite' });
  const heads = h('div', { class: 'st-heads' });
  const ruler = h('div', { class: 'st-ruler' });
  const lanes = h('div', { class: 'st-lanes' });
  const playLine = h('div', { class: 'st-playhead', 'aria-hidden': 'true' });
  const rangeEl = h('div', { class: 'st-range', hidden: true });
  const canvasWrap = h('div', { class: 'st-canvas' }, ruler, lanes, rangeEl, playLine);
  const scroller = h('div', { class: 'st-scroll' }, canvasWrap);
  const dockEl = h('div', { class: 'st-dock' });
  const status = h('p', { class: 'st-status muted small', role: 'status' });
  const say = (...msg) => { status.replaceChildren(...msg.filter(Boolean)); };

  const tool = (label, ic, onclick, { key, title, cls = '' } = {}) => h('button', { type: 'button', class: `st-tool ${cls}`, title: `${title ?? label}${key ? ` (${key})` : ''}`, onclick }, icon(ic, 15), h('span', {}, label));
  const toolbar = h('div', { class: 'st-toolbar', role: 'toolbar', 'aria-label': 'Editing tools' });
  const drawToolbar = () => toolbar.replaceChildren(
    tool('Undo', 'undo', doUndo, { key: '⌘Z' }), tool('Redo', 'redo', doRedo, { key: '⇧⌘Z' }),
    h('span', { class: 'st-sep' }),
    tool('Split', 'scissors', splitHere, { key: 'S', title: 'Cut the selected clip (or every clip) at the playhead' }),
    tool('Delete', 'trash', deleteSelection, { key: '⌫', title: 'Delete the selected clip, or the selected time (closing the gap)' }),
    tool('Duplicate', 'copy', () => selected && commit(P.duplicateClip(project, selected)), { key: 'D' }),
    h('span', { class: 'st-sep' }),
    tool('Marker', 'flag', () => commit(P.addMarker(project, playhead)), { key: 'M', title: 'Add a chapter marker at the playhead' }),
    tool('Slide', 'image', () => addSlideHere(), { key: 'L', title: 'Add a slide at the playhead, on the slide track' }),
    tool('Silence', 'plus', async () => { const s = Number(await uiPrompt('Seconds of silence to insert at the playhead', '2')); if (s > 0) commit(P.insertSilence(project, playhead, s)); }, { title: 'Insert silence at the playhead, pushing everything after it along' }),
    h('span', { class: 'st-sep' }),
    h('label', { class: 'st-snap', title: 'Snap clips to each other’s edges' }, h('input', { type: 'checkbox', class: 'toggle toggle-xs', checked: snapOn, onchange: (e) => { snapOn = e.target.checked; } }), 'Snap'),
    h('span', { class: 'spacer' }),
    h('label', { class: 'st-zoom-wrap' }, icon('search', 14), zoomIn));

  root.append(
    h('header', { class: 'st-head' },
      h('a', { class: 'btn btn-sm btn-ghost btn-square', href: '#studio', title: 'All sessions', 'aria-label': 'All sessions' }, icon('chevronLeft', 16)),
      titleIn, seriesSel,
      h('span', { class: 'spacer' }),
      h('label', { class: 'btn btn-sm' }, icon('upload', 14), 'Import audio', fileIn),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => exportWav() }, icon('download', 14), 'Download WAV'),
      h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: () => toEpisode() }, icon('radio', 14), project.episodeId && getEpisode(project.episodeId) ? 'Update the episode' : 'Send to the station')),
    h('div', { class: 'st-transport' },
      h('button', { type: 'button', class: 'st-tbtn', title: 'Back to the start (Home)', 'aria-label': 'Back to the start', onclick: () => seek(0) }, icon('skipBack', 16)),
      playBtn, recBtn, timeEl, meter, toolbar, miniScreen),
    h('div', { class: 'st-body' }, heads, scroller),
    dockEl, status);

  /* ---------- drawing */
  const LANE = 76;
  const SLANE = 62;
  const x = (t) => t * pps;
  const tAt = (clientX) => Math.max(0, (clientX - canvasWrap.getBoundingClientRect().left) / pps);

  function draw() {
    const len = Math.max(P.projectLength(project) + 30, (scroller.clientWidth || 900) / pps);
    canvasWrap.style.width = `${x(len)}px`;
    drawToolbar();
    drawHeads();
    drawRuler(len);
    drawLanes();
    drawRange();
    drawDock();
    placePlayhead();
    titleIn.value = project.title;
  }

  function drawHeads() {
    heads.replaceChildren(h('div', { class: 'st-heads-top' }, h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: addTrackAsk }, icon('plus', 12), 'Track')),
      ...project.tracks.map((t, i) => h('div', { class: `st-head-row k-${t.kind}${t.id === track ? ' armed' : ''}`, style: `height:${LANE}px`, onpointerdown: (e) => {
          // Pick the track to record on; a control inside keeps its focus.
          track = t.id;
          for (const r of heads.querySelectorAll('.st-head-row')) r.classList.toggle('armed', r === e.currentTarget);
          for (const l of lanes.querySelectorAll('.st-lane')) l.classList.toggle('armed', l.dataset.track === t.id);
        } },
        h('div', { class: 'st-head-top' },
          h('input', { class: 'st-track-name', value: t.name, 'aria-label': 'Track name', onchange: (e) => commit(P.updateTrack(project, t.id, { name: e.target.value || t.name })) }),
          h('button', { type: 'button', class: `st-ms${t.muted ? ' on' : ''}`, title: 'Mute', 'aria-pressed': String(t.muted), onclick: () => commit(P.updateTrack(project, t.id, { muted: !t.muted })) }, 'M'),
          h('button', { type: 'button', class: `st-ms solo${t.solo ? ' on' : ''}`, title: 'Solo', 'aria-pressed': String(t.solo), onclick: () => commit(P.updateTrack(project, t.id, { solo: !t.solo })) }, 'S')),
        h('div', { class: 'st-head-mid' },
          h('select', { class: 'st-kind', 'aria-label': 'Kind of track', onchange: (e) => commit(P.updateTrack(project, t.id, { kind: e.target.value, duck: e.target.value === 'music' })) }, options(P.TRACK_KINDS.map((k) => ({ id: k.id, label: k.label })), t.kind)),
          h('input', { type: 'range', class: 'st-vol', min: 0, max: 2, step: 0.05, value: t.gain, title: `Volume ${Math.round(P.gainToDb(t.gain) * 10) / 10} dB`, 'aria-label': `${t.name} volume`, onchange: (e) => commit(P.updateTrack(project, t.id, { gain: +e.target.value })) }),
          h('input', { type: 'range', class: 'st-pan', min: -1, max: 1, step: 0.1, value: t.pan, title: 'Left · right', 'aria-label': `${t.name} pan`, onchange: (e) => commit(P.updateTrack(project, t.id, { pan: +e.target.value })) })),
        h('div', { class: 'st-head-bot' },
          t.kind === 'music' && h('label', { class: 'st-duck', title: 'Dip this music while voices are speaking' }, h('input', { type: 'checkbox', checked: t.duck, onchange: (e) => commit(P.updateTrack(project, t.id, { duck: e.target.checked })) }), 'Duck under voices'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'st-icon', title: 'Move up', 'aria-label': 'Move track up', disabled: i === 0, onclick: () => commit(P.moveTrack(project, t.id, -1)) }, icon('chevronUp', 12)),
          h('button', { type: 'button', class: 'st-icon', title: 'Move down', 'aria-label': 'Move track down', disabled: i === project.tracks.length - 1, onclick: () => commit(P.moveTrack(project, t.id, 1)) }, icon('chevronDown', 12)),
          h('button', { type: 'button', class: 'st-icon', title: 'Remove track', 'aria-label': 'Remove track', onclick: async () => { if (!P.clipsOn(project, t.id).length || await uiConfirm(`Remove “${t.name}” and its clips?`, { danger: true, ok: 'Remove' })) commit(P.removeTrack(project, t.id)); } }, icon('trash', 12))))),
      h('div', { class: 'st-head-row st-head-slides', style: `height:${SLANE}px` },
        h('div', { class: 'st-head-top' }, h('strong', {}, icon('image', 13), 'Slides'), h('span', { class: 'muted small' }, String(project.slides.length))),
        h('div', { class: 'st-head-bot' }, h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => addSlideHere() }, icon('plus', 12), 'At the playhead'))));
  }

  function drawRuler(len) {
    const step = P.rulerStep(pps);
    lanes.style.setProperty('--grid', `${x(step)}px`);
    const ticks = [];
    for (let t = 0; t <= len; t += step) ticks.push(h('span', { class: 'st-tick', style: `left:${x(t)}px` }, P.clock(t, { tenths: step < 1 })));
    ruler.replaceChildren(...ticks, ...project.markers.map((m) => h('button', { type: 'button', class: 'st-marker', style: `left:${x(m.at)}px`, title: `${m.title} · ${P.clock(m.at)}`, onclick: (e) => { e.stopPropagation(); seek(m.at); dock = 'chapters'; drawDock(); } }, icon('flag', 11), h('span', {}, m.title))));
  }

  function drawLanes() {
    lanes.replaceChildren(...project.tracks.map((t) => {
      const lane = h('div', { class: `st-lane k-${t.kind}${t.id === track ? ' armed' : ''}`, 'data-track': t.id, style: `height:${LANE}px` });
      for (const c of P.clipsOn(project, t.id)) lane.append(Clip(c, t));
      if (recorder && t.id === track) lane.append(h('div', { class: 'st-clip recording', style: `left:${x(recStart)}px;width:${x(recorder.elapsed())}px` }, h('span', { class: 'st-clip-name' }, 'Recording…')));
      lane.addEventListener('dragover', (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); lane.classList.add('drop'); } });
      lane.addEventListener('dragleave', () => lane.classList.remove('drop'));
      lane.addEventListener('drop', (e) => { e.preventDefault(); lane.classList.remove('drop'); importFiles([...e.dataTransfer.files], t.id, tAt(e.clientX)); });
      return lane;
    }), SlideLane());
  }

  /*
   * The slide track (alpha 0.3 PR 17): a triggered slide show along the
   * audio. Each slide is a small card from its start to the next one's.
   * Click one to jump there and edit it; drag it along to retime it.
   */
  function SlideLane() {
    const lane = h('div', { class: 'st-lane st-slide-lane', style: `height:${SLANE}px` });
    const spans = S.slideSpans(project.slides, P.projectLength(project));
    spans.forEach((sl, i) => {
      const el = h('button', { type: 'button', class: `st-slide k-${sl.kind}${sl.id === slidePick ? ' on' : ''}`, style: `left:${x(sl.at)}px;width:${Math.max(6, x(sl.until - sl.at) - 2)}px;--tone:${sl.tone}`, title: `${i + 1}. ${sl.title} · ${P.clock(sl.at, { tenths: false })}` },
        h('b', {}, String(i + 1)), h('span', {}, sl.title));
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const x0 = e.clientX, at0 = sl.at;
        let moved = false;
        el.setPointerCapture(e.pointerId);
        const move = (ev) => { const dx = ev.clientX - x0; if (Math.abs(dx) > 3) moved = true; if (moved) el.style.left = `${x(Math.max(0, at0 + dx / pps))}px`; };
        const up = (ev) => {
          el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up);
          slidePick = sl.id; dock = 'slides';
          if (moved) commit({ ...structuredClone(project), slides: S.updateSlide(project.slides, sl.id, { at: Math.max(0, at0 + (ev.clientX - x0) / pps) }) });
          else { seek(sl.at); draw(); }
        };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
      });
      lane.append(el);
    });
    if (!spans.length) lane.append(h('span', { class: 'st-slide-empty muted small' }, 'No slides yet. Press L, or Slide in the toolbar, to add one at the playhead.'));
    return lane;
  }
  function addSlideHere() {
    const at = transport.playing ? transport.position() : playhead;
    const next = S.addSlide(project.slides, at);
    slidePick = next.find((s) => !project.slides.some((o) => o.id === s.id))?.id ?? null;
    dock = 'slides';
    commit({ ...structuredClone(project), slides: next });
  }
  /** A slide as it shows on the screen: its colour, its kind, its words. */
  const SlideFace = (sl, n) => (sl ? h('div', { class: `st-face k-${sl.kind}`, style: `--tone:${sl.tone}` },
    h('small', {}, `${n}/${project.slides.length}`),
    h('strong', {}, sl.title),
    sl.body && h('p', {}, sl.body)) : h('div', { class: 'st-face empty' }, h('p', {}, project.slides.length ? 'Before the first slide' : 'No slides')));
  function updateScreen(t) {
    if (!project.slides.length) { miniScreen.hidden = true; return; }
    miniScreen.hidden = false;
    const sl = S.slideAt(project.slides, t);
    if (sl === shown) return;
    shown = sl;
    const n = sl ? [...project.slides].sort((a, b) => a.at - b.at).indexOf(sl) + 1 : 0;
    miniScreen.replaceChildren(SlideFace(sl, n));
    bigScreen.replaceChildren(SlideFace(sl, n));
    for (const el of lanes.querySelectorAll('.st-slide')) el.classList.toggle('live', el.title.startsWith(`${n}. `));
  }

  function Clip(c, t) {
    const el = h('div', { class: `st-clip k-${t.kind}${c.id === selected ? ' on' : ''}`, style: `left:${x(c.start)}px;width:${Math.max(3, x(c.length))}px`, 'data-clip': c.id, title: `${c.name} · ${P.clock(c.length)}` });
    const cv = h('canvas', { class: 'st-wave', height: LANE - 18 });
    el.append(...[
      h('span', { class: 'st-clip-name' }, c.name, c.gain !== 1 && h('small', {}, ` ${c.gain > 1 ? '+' : ''}${Math.round(P.gainToDb(c.gain) * 10) / 10} dB`)),
      cv,
      c.fadeIn > 0 && h('span', { class: 'st-fade in', style: `width:${x(c.fadeIn)}px` }),
      c.fadeOut > 0 && h('span', { class: 'st-fade out', style: `width:${x(c.fadeOut)}px` }),
      h('span', { class: 'st-edge l', 'data-act': 'trim-start', title: 'Drag to trim' }),
      h('span', { class: 'st-edge r', 'data-act': 'trim-end', title: 'Drag to trim' }),
      h('span', { class: 'st-fh l', 'data-act': 'fade-in', title: 'Drag to fade in' }),
      h('span', { class: 'st-fh r', 'data-act': 'fade-out', title: 'Drag to fade out' })].filter(Boolean));
    drawWave(cv, c, el);
    el.addEventListener('pointerdown', (e) => clipPointer(e, c));
    el.addEventListener('dblclick', (e) => { splitAtTime(c.id, tAt(e.clientX)); });
    return el;
  }

  const waveCache = new Map();
  async function drawWave(cv, c, el) {
    const width = Math.min(8000, Math.max(3, Math.round(x(c.length))));
    cv.width = width;
    let w = waveCache.get(sourceKey(c.source));
    if (!w) {
      try {
        const buf = await loadBuffer(c.source, getEpisode);
        const s = mono(buf);
        const per = 100;   // peak pairs per second
        w = { per, data: P.peaks(s, Math.max(1, Math.ceil(buf.duration * per))) };
        waveCache.set(sourceKey(c.source), w);
      } catch (err) { el.classList.add('missing'); el.title = err.message; return; }
    }
    const g = cv.getContext('2d');
    const H = cv.height;
    g.clearRect(0, 0, width, H);
    g.fillStyle = getComputedStyle(el).getPropertyValue('--wave') || '#fff';
    const total = w.data.length / 2;
    for (let px = 0; px < width; px++) {
      const t0 = c.offset + (px / width) * c.length;
      const t1 = c.offset + ((px + 1) / width) * c.length;
      let lo = 0, hi = 0;
      for (let b = Math.floor(t0 * w.per); b <= Math.min(total - 1, Math.floor(t1 * w.per)); b++) { lo = Math.min(lo, w.data[b * 2]); hi = Math.max(hi, w.data[b * 2 + 1]); }
      const amp = Math.min(1, c.gain);
      const y1 = H / 2 - hi * amp * (H / 2), y2 = H / 2 - lo * amp * (H / 2);
      g.fillRect(px, y1, 1, Math.max(1, y2 - y1));
    }
  }

  function drawRange() {
    rangeEl.hidden = !range;
    if (range) { rangeEl.style.left = `${x(range.from)}px`; rangeEl.style.width = `${x(range.to - range.from)}px`; }
  }

  function placePlayhead() {
    const t = transport.playing ? transport.position() : playhead;
    playLine.style.transform = `translateX(${x(t)}px)`;
    timeEl.textContent = P.clock(t);
    updateScreen(t);
  }

  /* ---------- the dock: clip, chapters, sound pads, episodes */
  function drawDock() {
    const c = project.clips[selected];
    const tabs = [['clip', 'Clip'], ['slides', `Slides (${project.slides.length})`], ['chapters', `Chapters (${project.markers.length})`], ['files', `Audio files (${Object.keys(ctx.doc().files ?? {}).length})`], ['pads', 'Sound pads'], ['library', 'From the station'], ['keys', 'Shortcuts']];
    const body = dock === 'slides' ? SlidesPanel() : dock === 'chapters' ? Chapters() : dock === 'files' ? FilesTab() : dock === 'pads' ? Pads() : dock === 'library' ? Library() : dock === 'keys' ? Keys() : ClipPanel(c);
    dockEl.replaceChildren(
      h('div', { class: 'st-tabs', role: 'tablist' }, tabs.map(([id, label]) => h('button', { type: 'button', role: 'tab', 'aria-selected': String(dock === id), class: dock === id ? 'on' : '', onclick: () => { dock = id; drawDock(); } }, label))),
      h('div', { class: 'st-dock-body' }, body));
  }

  function ClipPanel(c) {
    if (!c) return h('p', { class: 'muted' }, range ? `Selected ${P.clock(range.from)} to ${P.clock(range.to)} (${P.clock(range.to - range.from)}). Delete takes it out of every track and closes the gap.` : 'Click a clip to work on it. Drag across the ruler to select a stretch of time. Drop audio files onto a track to bring them in.');
    const db = Math.round(P.gainToDb(c.gain) * 10) / 10;
    const num = (label, value, min, max, step, onchange, suffix = '') => h('label', { class: 'st-field' }, h('span', {}, label),
      h('input', { type: 'range', min, max, step, value, oninput: (e) => { e.target.nextSibling.textContent = `${(+e.target.value).toFixed(1)}${suffix}`; }, onchange: (e) => onchange(+e.target.value) }), h('output', {}, `${value.toFixed(1)}${suffix}`));
    return h('div', { class: 'st-clip-panel' },
      h('div', { class: 'st-field-row' },
        h('label', { class: 'st-field' }, h('span', {}, 'Name'), h('input', { class: 'input input-xs', value: c.name, onchange: (e) => commit(P.updateClip(project, c.id, { name: e.target.value || c.name })) })),
        h('span', { class: 'muted small' }, `Starts ${P.clock(c.start)} · ${P.clock(c.length)} long`)),
      h('div', { class: 'st-field-row' },
        num('Volume', db, -24, 18, 0.5, (v) => commit(P.updateClip(project, c.id, { gain: P.dbToGain(v) })), ' dB'),
        num('Fade in', c.fadeIn, 0, Math.min(10, c.length / 2), 0.1, (v) => commit(P.updateClip(project, c.id, { fadeIn: v })), ' s'),
        num('Fade out', c.fadeOut, 0, Math.min(10, c.length / 2), 0.1, (v) => commit(P.updateClip(project, c.id, { fadeOut: v })), ' s')),
      h('div', { class: 'st-actions' },
        h('button', { type: 'button', class: 'btn btn-xs', title: 'Bring the loudest moment up (or down) to just under full', onclick: () => normalise(c) }, icon('waveform', 13), 'Normalise'),
        h('button', { type: 'button', class: 'btn btn-xs', title: 'Shorten every pause longer than half a second, keeping the other tracks in step', onclick: () => tighten(c) }, icon('scissors', 13), 'Tighten pauses'),
        h('button', { type: 'button', class: 'btn btn-xs', title: 'Trim the quiet off the start and end', onclick: () => trimQuiet(c) }, icon('arrowsIn', 13), 'Trim the quiet ends'),
        h('button', { type: 'button', class: 'btn btn-xs', onclick: () => { commit(P.updateClip(project, c.id, { fadeIn: Math.min(1, c.length / 4), fadeOut: Math.min(2, c.length / 4) })); } }, 'Quick fades'),
        h('button', { type: 'button', class: 'btn btn-xs', title: 'Keep it on the sound board, to drop in again', onclick: () => commit(P.addPad(project, { name: c.name, source: c.source, offset: c.offset, length: c.length })) }, icon('tiles', 13), 'Make a sound pad'),
        h('button', { type: 'button', class: 'btn btn-xs btn-ghost', onclick: () => commit(P.removeClips(project, [c.id])) }, icon('trash', 13), 'Delete')));
  }

  function Chapters() {
    if (!project.markers.length) return h('p', { class: 'muted' }, 'Chapter markers become the episode’s chapters, so listeners can skip to a part. Press M (or Marker) to add one at the playhead.');
    return h('ol', { class: 'st-chapters' }, project.markers.map((m) => h('li', {},
      h('button', { type: 'button', class: 'st-chap-time', onclick: () => seek(m.at) }, P.clock(m.at, { tenths: false })),
      h('input', { class: 'input input-xs', value: m.title, 'aria-label': 'Chapter title', onchange: (e) => commit(P.updateMarker(project, m.id, { title: e.target.value || m.title })) }),
      h('button', { type: 'button', class: 'btn btn-xs btn-ghost', title: 'Move it to the playhead', onclick: () => commit(P.updateMarker(project, m.id, { at: playhead })) }, 'Move here'),
      h('button', { type: 'button', class: 'st-icon', 'aria-label': 'Remove chapter', onclick: () => commit(P.removeMarker(project, m.id)) }, icon('trash', 12)))));
  }

  function Pads() {
    const padIn = h('input', { type: 'file', accept: '.mp3,.wav,audio/*', class: 'sr-only', onchange: async (e) => {
      for (const f of e.target.files) {
        const src = await storeFile(f);
        if (!src) continue;
        const b = await loadBuffer(src.source, getEpisode);
        commit(P.addPad(project, { name: src.name, source: src.source, offset: 0, length: b.duration }));
      }
    } });
    return h('div', { class: 'st-pads' },
      ...project.pads.map((d, i) => h('div', { class: 'st-pad', style: `--pad:${d.colour}` },
        h('button', { type: 'button', class: 'st-pad-hit', title: `Play ${d.name} (${i + 1})`, onclick: () => playOnce(d.source, getEpisode).catch((err) => say(err.message)) }, h('strong', {}, d.name), h('small', {}, `${i < 9 ? `${i + 1} · ` : ''}${P.clock(d.length)}`)),
        h('div', { class: 'st-pad-tools' },
          h('button', { type: 'button', title: 'Drop it on the selected track at the playhead', onclick: () => dropPad(d) }, icon('download', 12), 'Insert'),
          h('button', { type: 'button', 'aria-label': `Remove ${d.name}`, onclick: () => commit(P.removePad(project, d.id)) }, icon('close', 12))))),
      h('label', { class: 'st-pad st-pad-add' }, icon('plus', 18), h('small', {}, 'Add a jingle, sting or bed'), padIn),
      h('p', { class: 'muted small st-pads-note' }, 'Tap a pad to hear it; Insert drops it on the selected track at the playhead. Keys 1 to 9 play the first nine.'));
  }

  /** The org's audio files, a lighter chooser: hear one, add it at the playhead. */
  function FilesTab() {
    return FilesPicker(ctx, {
      onUploaded: () => drawDock(),
      onAdd: async (f) => {
        say(`Loading ${f.name}…`);
        try {
          const source = { mediaId: f.mediaId };
          const b = await loadBuffer(source, getEpisode);
          commit(P.addClip(project, { trackId: track, source, name: f.name, start: playhead, length: b.duration, sourceLength: b.duration }));
          say(`Added ${f.name} at ${P.clock(playhead)}.`);
        } catch (err) { say(err.message); }
      },
    });
  }

  function Library() {
    const eps = Object.values(ctx.doc().episodes).filter((e) => e.audio && (e.audio.url || e.audio.mediaId)).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0, 40);
    if (!eps.length) return h('p', { class: 'muted' }, 'Episodes on the station appear here, to bring their audio into this session (a clip for a trailer, a “previously on…”).');
    // Audio linked from another website can't be opened for editing here (the browser keeps other sites' files apart).
    const here = (e) => e.audio.mediaId || !/^https?:/i.test(e.audio.url) || new URL(e.audio.url).origin === location.origin;
    return h('ul', { class: 'st-lib' }, eps.map((e) => h('li', {},
      h('span', {}, h('strong', {}, e.title), h('small', { class: 'muted' }, ` ${ctx.doc().podcasts[e.podcastId]?.title ?? ''}`)),
      !here(e) ? h('small', { class: 'muted', title: e.audio.url }, 'Linked from another website: download it, then Import audio') : h('button', { type: 'button', class: 'btn btn-xs', onclick: async () => {
        say(`Loading ${e.title}…`);
        try {
          const source = { episodeId: e.id };
          const b = await loadBuffer(source, getEpisode);
          commit(P.addClip(project, { trackId: track, source, name: e.title, start: playhead, length: b.duration, sourceLength: b.duration }));
          say(`Added ${e.title} at ${P.clock(playhead)}.`);
        } catch (err) { say(err.message); }
      } }, icon('plus', 12), 'Add at the playhead'))));
  }

  /** The Slides tab: the screen as it is at the playhead, and the slide picked, to edit. */
  function SlidesPanel() {
    shown = undefined; updateScreen(transport.playing ? transport.position() : playhead);
    const sorted = [...project.slides].sort((a, b) => a.at - b.at);
    const sl = project.slides.find((s) => s.id === slidePick) ?? S.slideAt(project.slides, playhead) ?? sorted[0];
    const i = sl ? sorted.indexOf(sl) : -1;
    const set = (patch) => commit({ ...structuredClone(project), slides: S.updateSlide(project.slides, sl.id, patch) });
    const go = (d) => { const n = sorted[i + d]; if (!n) return; slidePick = n.id; seek(n.at); draw(); };
    return h('div', { class: 'st-slides-panel' },
      h('div', { class: 'st-screen-wrap' }, bigScreen, h('p', { class: 'muted small' }, 'What shows at the playhead. Play the session to watch the slides change.')),
      sl ? h('div', { class: 'st-slide-edit' },
        h('div', { class: 'st-field-row' },
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost', disabled: i <= 0, onclick: () => go(-1) }, icon('chevronLeft', 12)),
          h('strong', {}, `Slide ${i + 1} of ${sorted.length}`),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost', disabled: i >= sorted.length - 1, onclick: () => go(1) }, icon('chevronRight', 12)),
          h('span', { class: 'muted small' }, `Starts ${P.clock(sl.at)}`),
          h('button', { type: 'button', class: 'btn btn-xs', title: 'Start this slide at the playhead', onclick: () => set({ at: playhead }) }, 'Start at the playhead'),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'btn btn-xs btn-ghost text-error', 'aria-label': 'Delete this slide', onclick: () => { slidePick = null; commit({ ...structuredClone(project), slides: S.removeSlide(project.slides, sl.id) }); } }, icon('trash', 12))),
        h('div', { class: 'st-field-row' },
          h('label', { class: 'st-field grow' }, h('span', {}, 'Title'), h('input', { class: 'input input-xs', value: sl.title, onchange: (e) => set({ title: e.target.value || sl.title }) })),
          h('label', { class: 'st-field' }, h('span', {}, 'Kind'), h('select', { class: 'select select-xs', onchange: (e) => set({ kind: e.target.value }) }, options(S.SLIDE_KINDS.map((k) => ({ id: k.id, label: k.label })), sl.kind))),
          h('label', { class: 'st-field' }, h('span', {}, 'Colour'), h('input', { type: 'color', value: sl.tone, onchange: (e) => set({ tone: e.target.value }) }))),
        h('label', { class: 'st-field grow' }, h('span', {}, 'Words'), h('textarea', { class: 'textarea textarea-xs', rows: 2, onchange: (e) => set({ body: e.target.value }) }, sl.body ?? '')))
        : h('p', { class: 'muted' }, 'No slides yet. Add one at the playhead with L, or Slide in the toolbar. Each slide shows until the next one starts.'));
  }

  const Keys = () => h('dl', { class: 'st-keys' }, [
    ['Space', 'Play or pause'], ['R', 'Record on the selected track'], ['S', 'Split at the playhead'], ['⌫ / Delete', 'Delete the clip or the selected time'],
    ['D', 'Duplicate the clip'], ['M', 'Add a chapter marker'], ['L', 'Add a slide'], ['⌘Z / ⇧⌘Z', 'Undo / redo'], ['+ / −', 'Zoom'], ['← / →', 'Nudge the playhead (⇧ for 5 s)'],
    ['Home', 'Back to the start'], ['1–9', 'Play a sound pad'], ['Double-click a clip', 'Split it there'],
  ].flatMap(([k, v]) => [h('dt', {}, h('kbd', {}, k)), h('dd', {}, v)]));

  /* ---------- pointer work on the timeline */
  function clipPointer(e, c) {
    if (e.button !== 0) return;
    e.stopPropagation();
    const act = e.target.dataset.act ?? 'move';
    selected = c.id;
    track = c.trackId;
    range = null;
    if (dock !== 'clip') dock = 'clip';
    const startX = e.clientX;
    const orig = { ...c };
    let preview = project;
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    let moved = false;
    const onMove = (ev) => {
      const dt = (ev.clientX - startX) / pps;
      if (Math.abs(ev.clientX - startX) > 2) moved = true;
      if (!moved) return;
      const near = snapOn ? 8 / pps : 0;
      if (act === 'move') {
        const lane = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.st-lane');
        let s = Math.max(0, orig.start + dt);
        if (snapOn) { const a = P.snap(project, s, { near, except: c.id }); const b = P.snap(project, s + orig.length, { near, except: c.id }) - orig.length; s = Math.abs(a - s) <= Math.abs(b - s) ? a : b; }
        preview = P.moveClip(project, c.id, s, lane?.dataset.track);
      } else if (act === 'trim-start') preview = P.trimClip(project, c.id, 'start', snapOn ? P.snap(project, orig.start + dt, { near, except: c.id }) : orig.start + dt);
      else if (act === 'trim-end') preview = P.trimClip(project, c.id, 'end', snapOn ? P.snap(project, orig.start + orig.length + dt, { near, except: c.id }) : orig.start + orig.length + dt);
      else if (act === 'fade-in') preview = P.updateClip(project, c.id, { fadeIn: Math.max(0, Math.min(orig.length / 2, orig.fadeIn + dt)) });
      else if (act === 'fade-out') preview = P.updateClip(project, c.id, { fadeOut: Math.max(0, Math.min(orig.length / 2, orig.fadeOut - dt)) });
      const nc = preview.clips[c.id];
      el.style.left = `${x(nc.start)}px`;
      el.style.width = `${Math.max(3, x(nc.length))}px`;
      if (nc.trackId !== orig.trackId || el.parentElement?.dataset.track !== nc.trackId) lanes.querySelector(`[data-track="${nc.trackId}"]`)?.append(el);
      el.querySelector('.st-fade.in')?.style.setProperty('width', `${x(nc.fadeIn)}px`);
      el.querySelector('.st-fade.out')?.style.setProperty('width', `${x(nc.fadeOut)}px`);
      if (act.startsWith('fade')) { if (!el.querySelector(`.st-fade.${act === 'fade-in' ? 'in' : 'out'}`)) el.append(h('span', { class: `st-fade ${act === 'fade-in' ? 'in' : 'out'}`, style: `width:${x(act === 'fade-in' ? nc.fadeIn : nc.fadeOut)}px` })); }
    };
    const onUp = () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      if (moved) commit(preview); else draw();
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
  }

  // The ruler: click to move the playhead, drag to select time.
  ruler.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.st-marker')) return;
    const t0 = tAt(e.clientX);
    ruler.setPointerCapture(e.pointerId);
    let dragged = false;
    const move = (ev) => { const t1 = tAt(ev.clientX); if (Math.abs(t1 - t0) * pps > 3) { dragged = true; range = { from: Math.min(t0, t1), to: Math.max(t0, t1) }; selected = null; drawRange(); } };
    const up = () => { ruler.removeEventListener('pointermove', move); ruler.removeEventListener('pointerup', up); if (!dragged) { range = null; seek(t0); } draw(); };
    ruler.addEventListener('pointermove', move);
    ruler.addEventListener('pointerup', up);
  });
  // Empty lane: pick the track, move the playhead, shift-drag to select time.
  lanes.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.st-clip')) return;
    const lane = e.target.closest('.st-lane');
    if (lane) track = lane.dataset.track;
    selected = null;
    const t0 = tAt(e.clientX);
    if (!e.shiftKey) { range = null; seek(t0); draw(); return; }
    lanes.setPointerCapture(e.pointerId);
    const move = (ev) => { const t1 = tAt(ev.clientX); range = { from: Math.min(t0, t1), to: Math.max(t0, t1) }; drawRange(); };
    const up = () => { lanes.removeEventListener('pointermove', move); lanes.removeEventListener('pointerup', up); draw(); };
    lanes.addEventListener('pointermove', move);
    lanes.addEventListener('pointerup', up);
  });
  scroller.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const t = tAt(e.clientX);
    const before = e.clientX - scroller.getBoundingClientRect().left;
    pps = Math.max(4, Math.min(400, pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    zoomIn.value = pps;
    draw();
    scroller.scrollLeft = t * pps - before;
  }, { passive: false });
  heads.addEventListener('scroll', () => { scroller.scrollTop = heads.scrollTop; });
  scroller.addEventListener('scroll', () => { heads.scrollTop = scroller.scrollTop; });

  /* ---------- editing actions */
  function seek(t) {
    playhead = Math.max(0, t);
    if (transport.playing) transport.play(project, playhead, getEpisode);
    else transport.seek(playhead);
    placePlayhead();
  }
  function splitAtTime(id, t) { const { project: next, rightId } = P.splitClip(project, id, t); if (rightId) { selected = rightId; commit(next); } }
  function splitHere() {
    const at = transport.playing ? transport.position() : playhead;
    if (selected) return splitAtTime(selected, at);
    const next = P.splitAll(project, at);
    if (next !== project) commit(next);
  }
  function deleteSelection() {
    if (range) { commit(P.rippleDelete(project, range.from, range.to)); say(`Took out ${P.clock(range.to - range.from)} and closed the gap.`); range = null; draw(); return; }
    if (selected) commit(P.removeClips(project, [selected]));
  }
  async function normalise(c) {
    const b = await loadBuffer(c.source, getEpisode);
    const s = mono(b).subarray(Math.floor(c.offset * b.sampleRate), Math.floor((c.offset + c.length) * b.sampleRate));
    const g = P.normaliseGain(s, -1);
    commit(P.updateClip(project, c.id, { gain: Math.round(g * 1000) / 1000 }));
    say(`Normalised “${c.name}”: ${g >= 1 ? '+' : ''}${Math.round(P.gainToDb(g) * 10) / 10} dB.`);
  }
  async function tighten(c) {
    say('Listening for long pauses…');
    const sil = await silencesOf(c.source, getEpisode, { thresholdDb: -40, minLength: 0.7 });
    const { project: next, removed } = P.tightenPauses(project, c.id, sil, { keep: 0.5 });
    if (!removed) { say('No pauses longer than about a second in that clip.'); return; }
    commit(next);
    say(`Tightened the pauses: ${P.clock(removed)} shorter, every track kept in step. Undo brings them back.`);
  }
  async function trimQuiet(c) {
    const sil = await silencesOf(c.source, getEpisode, { thresholdDb: -45, minLength: 0.15 });
    const inClip = sil.filter((s) => s.to > c.offset && s.from < c.offset + c.length);
    let next = project;
    const head = inClip.find((s) => s.from <= c.offset + 0.01);
    if (head) next = P.trimClip(next, c.id, 'start', c.start + (head.to - c.offset) - 0.1);
    const nc = next.clips[c.id];
    const tail = inClip.find((s) => s.to >= c.offset + c.length - 0.01);
    if (tail && tail.from > nc.offset) next = P.trimClip(next, c.id, 'end', nc.start + (tail.from - nc.offset) + 0.15);
    if (next === project) { say('No quiet at either end of that clip.'); return; }
    commit(next);
    say('Trimmed the quiet off the ends.');
  }
  async function dropPad(d) {
    if (!track) return;
    try {
      const b = await loadBuffer(d.source, getEpisode);
      commit(P.addClip(project, { trackId: track, source: d.source, name: d.name, start: playhead, offset: d.offset ?? 0, length: d.length ?? b.duration, sourceLength: b.duration }));
    } catch (err) { say(err.message); }
  }
  async function addTrackAsk() {
    const kind = project.tracks.some((t) => t.kind === 'voice') ? (project.tracks.some((t) => t.kind === 'music') ? 'fx' : 'music') : 'voice';
    commit(P.addTrack(project, `${P.TRACK_KINDS.find((k) => k.id === kind).label} ${project.tracks.filter((t) => t.kind === kind).length + 1}`, kind));
  }

  /* ---------- sound in */
  async function storeFile(file) {
    if (!isAudioFile(file) && !/^audio\//.test(file.type)) { uiAlert(`${file.name} isn’t an audio file (.mp3 or .wav).`); return null; }
    say(`Saving ${file.name}…`);
    try {
      const buf = await audioContext().decodeAudioData(await file.arrayBuffer());
      const mediaId = await putMedia(file, { onProgress: (f) => say(`Saving ${file.name}… ${Math.floor(f * 100)}%`) });
      const source = { mediaId };
      keepBuffer(source, buf);
      // Every import is kept in the org's audio files, to use again in any session.
      rememberFile(ctx, { mediaId, name: file.name.replace(/\.[a-z0-9]+$/i, ''), duration: buf.duration, size: file.size, type: file.type, origin: 'import' });
      say(`${file.name} is in.`);
      return { source, buffer: buf, name: file.name.replace(/\.[a-z0-9]+$/i, '') };
    } catch (err) { say(''); uiAlert(`Couldn’t bring in ${file.name}: ${err.message}`); return null; }
  }
  async function importFiles(files, trackId, at) {
    let t = at;
    let next = project;
    for (const f of files) {
      const s = await storeFile(f);
      if (!s) continue;
      next = P.addClip(next, { trackId: trackId ?? next.tracks[0]?.id, source: s.source, name: s.name, start: t, length: s.buffer.duration, sourceLength: s.buffer.duration });
      selected = next.lastId;
      t += s.buffer.duration;
    }
    if (next !== project) commit(next);
  }

  async function toggleRecord() {
    if (recorder) return stopRecording();
    if (!track) { uiAlert('Add a track to record on first.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { uiAlert('This browser can’t record. Try Chrome, Edge, Firefox or Safari over https.'); return; }
    const r = new Recorder();
    try { await r.start(micId); } catch (err) { uiAlert(err.name === 'NotAllowedError' ? 'The browser wasn’t allowed to use the microphone. Allow it in the address bar, then try again.' : `Couldn’t start the microphone: ${err.message}`); return; }
    recorder = r;
    recStart = playhead;
    recBtn.classList.add('on');
    root.classList.add('is-recording');
    // Hear the rest of the session while recording (headphones on).
    if (Object.keys(project.clips).length) transport.play(project, playhead, getEpisode);
    say(`Recording on ${project.tracks.find((t) => t.id === track)?.name}. Press R or the red button to stop. Wear headphones so the other tracks don’t leak in.`);
    draw();
  }
  async function stopRecording() {
    const r = recorder;
    recorder = null;
    recBtn.classList.remove('on');
    root.classList.remove('is-recording');
    transport.stop();
    say('Saving the take…');
    try {
      const take = await r.stop();
      const name = `Take ${Object.values(project.clips).filter((c) => /^Take /.test(c.name)).length + 1}`;
      const file = new File([take.wav], `${slugify(project.title) || 'session'}-${slugify(name)}.wav`, { type: 'audio/wav' });
      const mediaId = await putMedia(file, { onProgress: (f) => say(`Saving the take… ${Math.floor(f * 100)}%`) });
      keepBuffer({ mediaId }, take.buffer);
      rememberFile(ctx, { mediaId, name: `${project.title} · ${name}`, duration: take.duration, size: file.size, type: 'audio/wav', origin: 'recording' });
      const next = P.addClip(project, { trackId: track, source: { mediaId }, name, start: recStart, length: take.duration, sourceLength: take.duration });
      selected = next.lastId;
      playhead = recStart + take.duration;
      commit(next);
      say(`${name} saved: ${P.clock(take.duration)}.`);
    } catch (err) { say(''); uiAlert(`The take couldn’t be saved: ${err.message}`); draw(); }
  }
  const micId = null;   // the system's default microphone

  /* ---------- sound out */
  async function togglePlay() {
    if (recorder) return stopRecording();
    if (transport.playing) { transport.stop(); playhead = transport.position(); playBtn.replaceChildren(icon('play', 18)); playBtn.setAttribute('aria-label', 'Play'); placePlayhead(); return; }
    try { await transport.play(project, playhead, getEpisode); } catch (err) { say(err.message); return; }
    playBtn.replaceChildren(icon('pause', 18));
    playBtn.setAttribute('aria-label', 'Pause');
  }
  async function exportWav() {
    try {
      const { blob } = await mixdown(project, getEpisode, { onProgress: say });
      const a = h('a', { href: URL.createObjectURL(blob), download: `${slugify(project.title) || 'session'}.wav` });
      document.body.append(a); a.click(); a.remove();
      say(`Mixed down: ${(blob.size / 1048576).toFixed(1)} MB WAV.`);
    } catch (err) { say(''); uiAlert(err.message); }
  }
  async function toEpisode() {
    const doc = ctx.doc();
    const series = doc.podcasts[project.podcastId] ?? showsInOrder(doc)[0];
    if (!series) { uiAlert('Make a series first (Podcasts → New series), then send the session to it.'); return; }
    const existing = project.episodeId && doc.episodes[project.episodeId];
    if (existing && !(await uiConfirm(`Replace the audio and chapters of “${existing.title}” with this mix?`, { ok: 'Replace' }))) return;
    try {
      const { blob, duration } = await mixdown(project, getEpisode, { onProgress: say });
      const file = new File([blob], `${slugify(project.title) || 'episode'}.wav`, { type: 'audio/wav' });
      say('Sending to the station…');
      const mediaId = await putMedia(file, { onProgress: (f) => say(`Sending to the station… ${Math.floor(f * 100)}%`) });
      const audio = { mediaId, duration: Math.round(duration), mimetype: 'audio/wav', size: file.size, name: file.name };
      const chapters = P.chaptersOf(project);
      let id = existing?.id;
      if (existing) ctx.store.apply(ctx.col.update('episodes', id, { audio, chapters }));
      else {
        const season = seasonsOf(doc, series.id).at(-1)?.number ?? 1;
        const add = ctx.col.add('episodes', {
          podcastId: series.id, season, number: nextNumber(doc, series.id, season), type: 'full', title: project.title, slug: slugify(project.title),
          description: '', notes: '', transcript: '', status: 'draft', publishedAt: today(), audio, personIds: [], guests: [], cover: null, explicit: false,
          chapters, tags: [], related: [],
        });
        id = add.id;
        ctx.store.apply(add);
      }
      project = { ...project, episodeId: id };
      save();
      say(existing ? 'The episode has the new mix. ' : 'Sent to the station as a draft episode, with its chapters. ', h('a', { href: `#episodes/${id}` }, 'Open it to add the details and publish'));
      draw();
    } catch (err) { say(''); uiAlert(err.message); }
  }

  /* ---------- keys and the clock */
  const onKey = (e) => {
    if (!root.isConnected) { removeEventListener('keydown', onKey); return; }
    if (e.target.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (mod && k.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if (mod && k.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    else if (mod) return;
    else if (k === 's' || k === 'S') splitHere();
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (k === 'd' || k === 'D') { if (selected) commit(P.duplicateClip(project, selected)); }
    else if (k === 'l' || k === 'L') addSlideHere();
    else if (k === 'm' || k === 'M') commit(P.addMarker(project, transport.playing ? transport.position() : playhead));
    else if (k === 'r' || k === 'R') toggleRecord();
    else if (k === 'Home') seek(0);
    else if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); seek((transport.playing ? transport.position() : playhead) + (k === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1)); }
    else if (k === '+' || k === '=') { pps = Math.min(400, pps * 1.3); zoomIn.value = pps; draw(); }
    else if (k === '-' || k === '_') { pps = Math.max(0.2, pps / 1.3); zoomIn.value = pps; draw(); }
    else if (/^[1-9]$/.test(k) && project.pads[+k - 1]) playOnce(project.pads[+k - 1].source, getEpisode).catch(() => {});
    else if (k === 'Escape') { selected = null; range = null; draw(); }
  };
  addEventListener('keydown', onKey);

  const tick = () => {
    if (!root.isConnected) { transport.stop(); recorder?.cancel(); return; }
    if (transport.playing) {
      const t = transport.position();
      if (t > transport.end + 0.5 && !recorder) { transport.stop(); playhead = 0; transport.seek(0); playBtn.replaceChildren(icon('play', 18)); }
      // Keep the playhead in view.
      const px = x(t);
      if (px > scroller.scrollLeft + scroller.clientWidth - 60 || px < scroller.scrollLeft) scroller.scrollLeft = px - 80;
    }
    placePlayhead();
    const lv = recorder ? recorder.level() : transport.playing ? transport.level() : 0;
    meter.firstChild.style.width = `${Math.min(100, lv * 100)}%`;
    meter.classList.toggle('hot', lv > 0.95);
    if (recorder) { const live = lanes.querySelector('.st-clip.recording'); if (live) live.style.width = `${x(recorder.elapsed())}px`; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Warm the cache, then draw (waveforms appear as each sound loads).
  queueMicrotask(() => { draw(); root.focus({ preventScroll: true }); });
  for (const c of Object.values(project.clips)) if (!cachedBuffer(c.source)) loadBuffer(c.source, getEpisode).catch(() => {});
  root.stop = () => { transport.stop(); recorder?.cancel(); };
  return root;
}

function migrate(p) {
  p.tracks ??= []; p.clips ??= {}; p.markers ??= []; p.pads ??= []; p.slides ??= [];
  for (const t of p.tracks) { t.gain ??= 1; t.pan ??= 0; t.duck ??= t.kind === 'music'; }
  for (const c of Object.values(p.clips)) { c.gain ??= 1; c.fadeIn ??= 0; c.fadeOut ??= 0; c.offset ??= 0; }
}
