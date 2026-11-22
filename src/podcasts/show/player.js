import { h } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { normaliseSlides, frameAt, indexAt } from './format.js';
import { Face, CARD_W, CARD_H, shrinkToFit } from './face.js';

/**
 * The slideshow player (slideshow podcasts): the audio with its slides
 * changing on cue, each arriving with its transition. No plugin chrome and
 * no routing, so the station, the studio, an episode tray and Learn can
 * all embed it.
 *
 *   Screen(el)       a phone-card screen: .show(slides, t) shows the frame at t, with transitions
 *   mountShow(el, show, { audioUrl, autoplay, onEnd, onTime, onSlide })
 *        → { play(), pause(), seek(t), destroy(), audio }
 *
 * `show` is a Show (format.js). `audioUrl` (or show.audioUrl) may be a
 * string or a promise of one (local media in the browser).
 */

/** A screen that shows the slide at time t, running each slide's transition as it arrives. */
export function Screen(el) {
  el.classList.add('sp-screen');
  const stage = h('div', { class: 'sp-stage', style: `width:${CARD_W}px;height:${CARD_H}px` });
  el.replaceChildren(stage);
  let showing = null;   // slide id on screen
  let layers = [];
  const ro = new ResizeObserver(() => fit());
  ro.observe(el);
  function fit() {
    const k = Math.min(el.clientWidth / CARD_W, el.clientHeight / CARD_H) * 0.98 || 0;
    stage.style.transform = `translate(-50%, -50%) scale(${k})`;
  }
  queueMicrotask(fit);
  function put(slide, { n, total, type = 'cut', ms = 0 }) {
    const face = slide ? Face(slide, { n, total }) : h('div', { class: 'sf sf-blank' });
    const layer = h('div', { class: 'sp-layer' }, face);
    stage.append(layer);
    requestAnimationFrame(() => slide && shrinkToFit(face));
    const old = layers;
    layers = [layer];
    if (type === 'cut' || ms <= 0) { for (const o of old) o.remove(); return; }
    layer.style.setProperty('--ms', `${ms}ms`);
    layer.classList.add('in', `t-${type}`);
    for (const o of old) { o.style.setProperty('--ms', `${ms}ms`); o.classList.add('out', `t-${type}`); layers.push(o); }
    setTimeout(() => { for (const o of old) o.remove(); layers = layers.filter((x) => x.isConnected); layer.classList.remove('in', `t-${type}`); }, ms + 40);
  }
  return {
    el,
    /** Show the frame at t. `animate` false cuts straight to it (a seek). */
    show(slides, t, { animate = true } = {}) {
      const sorted = Array.isArray(slides) && slides.__sorted ? slides : normaliseSlides(slides);
      const f = frameAt(sorted, t);
      const id = f.slide?.id ?? null;
      if (id === showing) return f;
      showing = id;
      const tr = f.slide?.transition ?? { type: 'cut', ms: 0 };
      // Only run the transition when it is arriving now (playing through), not on a jump.
      const live = animate && f.p < 1;
      put(f.slide, { n: f.index + 1, total: sorted.length, type: live ? tr.type : 'cut', ms: live ? tr.ms * (1 - f.p) : 0 });
      return f;
    },
    /** Force a redraw of the slide on screen (after an edit). */
    refresh() { showing = '\u0000'; },
    destroy() { ro.disconnect(); el.replaceChildren(); },
  };
}
/** Slides sorted once, marked so Screen.show doesn't sort them again on every frame. */
export function sortedSlides(slides) { const s = normaliseSlides(slides); Object.defineProperty(s, '__sorted', { value: true }); return s; }

const clock = (t) => { t = Math.max(0, Math.floor(t || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/** The player: a screen, the audio, and small controls under it. */
export function mountShow(el, show, { audioUrl = show.audioUrl, autoplay = false, onEnd, onTime, onSlide } = {}) {
  const slides = sortedSlides(show.slides ?? []);
  const audio = h('audio', { preload: 'metadata' });
  const screenEl = h('div', { class: 'sp-view', role: 'img', 'aria-label': show.title || 'Slideshow' });
  const playBtn = h('button', { type: 'button', class: 'sp-btn sp-play', 'aria-label': 'Play' }, icon('play', 18));
  const bar = h('input', { type: 'range', class: 'sp-bar', min: 0, max: Math.max(1, show.duration || 1), step: 0.1, value: 0, 'aria-label': 'Position' });
  const time = h('span', { class: 'sp-time' }, `0:00 / ${clock(show.duration)}`);
  const count = h('span', { class: 'sp-count' }, slides.length ? `1/${slides.length}` : '');
  const prev = h('button', { type: 'button', class: 'sp-btn', 'aria-label': 'Previous slide' }, icon('chevronLeft', 16));
  const next = h('button', { type: 'button', class: 'sp-btn', 'aria-label': 'Next slide' }, icon('chevronRight', 16));
  // The words on the slide, for screen readers and for anyone who wants to read along.
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const root = h('div', { class: 'sp' }, screenEl, h('div', { class: 'sp-controls' }, prev, playBtn, next, bar, time, count), live, audio);
  el.replaceChildren(root);
  const screen = Screen(screenEl);
  let lastIndex = -2;
  let raf = 0;
  let ended = false;

  const pos = () => audio.currentTime || 0;
  const draw = (animate = true) => {
    const t = pos();
    const f = screen.show(slides, t, { animate });
    if (f.index !== lastIndex) {
      lastIndex = f.index;
      count.textContent = slides.length ? `${Math.max(1, f.index + 1)}/${slides.length}` : '';
      if (f.slide) live.textContent = `${f.slide.title}. ${f.slide.subtitle ?? ''}`;
      onSlide?.(f.index, f.slide);
    }
    if (document.activeElement !== bar) bar.value = String(t);
    time.textContent = `${clock(t)} / ${clock(audio.duration || show.duration)}`;
    onTime?.(t);
  };
  // A player taken off the page (a tray redrawn or closed) stops its sound.
  const loop = () => { if (!root.isConnected) { audio.pause(); return; } draw(true); if (!audio.paused) raf = requestAnimationFrame(loop); };
  const setPlaying = (on) => { playBtn.replaceChildren(icon(on ? 'pause' : 'play', 18)); playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play'); root.classList.toggle('playing', on); };
  audio.addEventListener('play', () => { setPlaying(true); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });
  audio.addEventListener('pause', () => { setPlaying(false); cancelAnimationFrame(raf); draw(false); });
  audio.addEventListener('loadedmetadata', () => { bar.max = String(audio.duration || show.duration || 1); draw(false); });
  audio.addEventListener('ended', () => { setPlaying(false); if (!ended) { ended = true; onEnd?.(); } });
  playBtn.addEventListener('click', () => (audio.paused ? api.play() : api.pause()));
  bar.addEventListener('input', () => { audio.currentTime = +bar.value; draw(false); });
  const step = (d) => { const i = indexAt(slides, pos() + 0.05) + d; const s = slides[Math.max(0, Math.min(slides.length - 1, i))]; if (s) { audio.currentTime = s.at + 0.01; draw(false); } };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  root.tabIndex = 0;
  root.addEventListener('keydown', (e) => {
    if (e.target !== root) return;
    if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  const ready = Promise.resolve(audioUrl).then((u) => { if (u) audio.src = u; else root.classList.add('no-audio'); }).catch(() => root.classList.add('no-audio'));
  draw(false);
  const api = {
    audio,
    async play() { await ready; try { await audio.play(); } catch { /* the browser wants a click first */ } },
    pause() { audio.pause(); },
    seek(t) { audio.currentTime = Math.max(0, t); draw(false); },
    destroy() { cancelAnimationFrame(raf); audio.pause(); audio.removeAttribute('src'); screen.destroy(); el.replaceChildren(); },
  };
  if (autoplay) api.play();
  return api;
}
