/**
 * Slideshow podcasts inside a cartridge (eLearning stage 2). A block holds a
 * reference to a show, { plugin: 'podcasts', type: 'episode' | 'session' |
 * 'file', id }, and never copies it. The Studio's slideshow work provides
 * src/podcasts/show/resolve.js (showFor) and player.js (mountShow); when
 * those are here, Learn uses them. Until then, and for a show that isn't
 * there, Learn plays a simple deck of its own: the episode's slides, or a
 * sample deck the length of the episode.
 *
 *   playShow(el, podcastsDoc, ref, { onEnd, onTime, reducedMotion }) → Promise<{ play, pause, destroy, show }>
 */
import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { slideAt, sampleSlides } from '../podcasts/studio/slides.js';
import { bestInk } from './checks.js';

let studio;
async function loadStudio() {
  if (studio !== undefined) return studio;
  try {
    const [r, p] = await Promise.all([import('../podcasts/show/resolve.js'), import('../podcasts/show/player.js')]);
    studio = r.showFor && p.mountShow ? { showFor: r.showFor, mountShow: p.mountShow } : null;
  } catch { studio = null; }
  return studio;
}

const titleCase = (slug) => slug.replace(/^ep_trial_/, '').split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** The show a reference points at, in the shape the Studio's resolver gives (or a stand-in). */
export function fallbackShow(podcasts, ref) {
  const ep = ref?.type === 'episode' ? podcasts?.episodes?.[ref.id] : null;
  const file = ref?.type === 'file' ? podcasts?.files?.[ref.id] : null;
  const session = ref?.type === 'session' ? podcasts?.projects?.[ref.id] ?? podcasts?.sessions?.[ref.id] : null;
  const src = ep ?? file ?? session;
  const duration = Number(src?.audio?.duration ?? src?.duration ?? 0) || 45;
  const title = src?.title ?? src?.name ?? `${titleCase(ref?.id ?? 'show')} (sample)`;
  const slides = (src?.slides?.length ? src.slides : file?.slides?.length ? file.slides : null)
    ?? sampleSlides(Math.min(duration, 60), { seed: [...String(ref?.id ?? 'x')].reduce((n, ch) => n + ch.charCodeAt(0), 0), title });
  const audioUrl = src?.audio?.url ?? null;
  return { format: 'dashi.slideshow', version: 1, id: ref?.id ?? null, title, duration: Math.min(duration, 60 * 60), audioUrl, slides, sample: !src };
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Learn's own little player: a phone-card stage, play and pause, a scrub bar and the slide words as a transcript. */
export function mountFallback(el, show, { onEnd, onTime, reducedMotion = false } = {}) {
  let t = 0;
  let playing = false;
  let timer = null;
  let last = performance.now();
  const audio = show.audioUrl ? h('audio', { src: show.audioUrl, preload: 'metadata' }) : null;
  const stage = h('div', { class: 'ln-stage', role: 'img', 'aria-live': 'polite' });
  const bar = h('input', { type: 'range', min: '0', max: String(show.duration), step: '0.1', value: '0', class: 'ln-scrub', 'aria-label': 'Where you are in the show' });
  const time = h('span', { class: 'ln-time' }, `0:00 / ${mmss(show.duration)}`);
  const btn = h('button', { type: 'button', class: 'btn btn-sm btn-primary ln-play', 'aria-label': 'Play' }, icon('play', 16), 'Play');
  let shown = null;
  const draw = () => {
    const s = slideAt(show.slides, t) ?? show.slides[0];
    if (s && s.id !== shown) {
      shown = s.id;
      const bg = s.bg?.colour ?? s.tone ?? '#3e8fa6';
      const ink = s.ink ?? bestInk(bg);
      stage.style.setProperty('--bg', bg);
      stage.style.setProperty('--ink', ink);
      stage.classList.toggle('still', reducedMotion);
      stage.replaceChildren(h('div', { class: `ln-slide k-${s.kind ?? 'point'}` },
        h('h3', {}, s.title ?? ''), s.subtitle && h('p', { class: 'ln-sub' }, s.subtitle),
        s.body && h('p', {}, s.body),
        ...(s.blocks ?? []).map((b) => (b.type === 'bullets' ? h('ul', {}, (b.items ?? []).map((x) => h('li', {}, x.replace(/<[^>]+>/g, '')))) : b.type === 'text' ? h('p', {}, String(b.html ?? '').replace(/<[^>]+>/g, '')) : null))));
      stage.setAttribute('aria-label', `Slide: ${s.title ?? ''}`);
    }
    bar.value = String(t);
    time.textContent = `${mmss(t)} / ${mmss(show.duration)}`;
    onTime?.(t);
  };
  const tick = () => {
    const now = performance.now();
    if (audio) t = audio.currentTime;
    else t = Math.min(show.duration, t + (now - last) / 1000);
    last = now;
    draw();
    if (t >= show.duration - 0.05) { pause(); onEnd?.(); }
  };
  function play() {
    if (playing) return;
    if (t >= show.duration - 0.05) t = 0;
    playing = true; last = performance.now();
    audio?.play().catch(() => {});
    timer = setInterval(tick, 100);
    btn.replaceChildren(icon('pause', 16), 'Pause'); btn.setAttribute('aria-label', 'Pause');
  }
  function pause() {
    playing = false; clearInterval(timer); audio?.pause();
    btn.replaceChildren(icon('play', 16), 'Play'); btn.setAttribute('aria-label', 'Play');
  }
  btn.addEventListener('click', () => (playing ? pause() : play()));
  bar.addEventListener('input', () => { t = Number(bar.value); if (audio) audio.currentTime = t; draw(); });
  audio?.addEventListener('ended', () => { pause(); onEnd?.(); });
  const transcript = h('details', { class: 'ln-transcript' }, h('summary', {}, 'Transcript (the words on each slide)'),
    h('ol', {}, show.slides.map((s) => h('li', {}, h('b', {}, `${mmss(s.at)} ${s.title ?? ''}`), s.body ? ` ${s.body}` : ''))));
  el.replaceChildren(h('div', { class: 'ln-show' }, stage, h('div', { class: 'ln-controls' }, btn, bar, time), show.sample ? h('p', { class: 'ln-note' }, 'A sample deck: this show isn’t in the station yet.') : null, transcript, audio));
  draw();
  return { play, pause, destroy: () => { pause(); el.replaceChildren(); }, show };
}

export async function playShow(el, podcasts, ref, opts = {}) {
  const s = await loadStudio();
  if (s) {
    try {
      const show = s.showFor(podcasts ?? {}, ref, { mediaUrl: (id) => `media/${id}` });
      if (show?.slides?.length) {
        const ctl = s.mountShow(el, show, { audioUrl: show.audioUrl, autoplay: false, onEnd: opts.onEnd, onTime: opts.onTime });
        return { ...ctl, show };
      }
    } catch { /* fall back to Learn's own player */ }
  }
  return mountFallback(el, fallbackShow(podcasts, ref), opts);
}
