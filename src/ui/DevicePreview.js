import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * Previews of a public page, as a laptop or a phone, with a toggle between
 * the two. The choice is remembered for every preview in the app, so
 * switching to phone once shows phones everywhere until switched back.
 *
 *   DeviceToggle(onChange)                   the Desktop / Phone switch
 *   DevicePreview({ src, title, width })     an iframe in a browser window or a phone
 *   PhoneShell(el)                           any element, inside a phone (for live DOM previews)
 *
 * The phone is drawn as a bezel around a screen that clips its contents to
 * the screen's own rounded corners, so nothing pokes out past the frame,
 * and the page inside is laid out at a real phone width (390px) before it
 * is scaled down, so it reads exactly as on a phone.
 */
const KEY = 'dashi.preview-device';
export const deviceMode = () => { try { return localStorage.getItem(KEY) === 'phone' ? 'phone' : 'desktop'; } catch { return 'desktop'; } };
export const setDeviceMode = (m) => { try { localStorage.setItem(KEY, m); } catch { /* just for now */ } };

export function DeviceToggle(onChange, { mode = deviceMode(), size = 'sm' } = {}) {
  const pick = (m) => { setDeviceMode(m); onChange?.(m); };
  return h('div', { class: `device-toggle ${size}`, role: 'radiogroup', 'aria-label': 'Preview as' },
    [['desktop', 'Desktop', 'deviceDesktop'], ['phone', 'Phone', 'deviceMobile']].map(([m, label, ic]) =>
      h('button', { type: 'button', role: 'radio', 'aria-checked': String(mode === m), class: mode === m ? 'on' : '', onclick: () => pick(m) }, icon(ic, 14), label)));
}

const PHONE = { w: 390, h: 844, bezel: 9, status: 44 };

/**
 * An iframe preview. `width` is the room it has, in CSS pixels; it scales to
 * fit. `height` caps a desktop preview's height (as a share of its width).
 */
export function DevicePreview({ src, title, mode = deviceMode(), width = 640, aspect = 0.62, page = 1280, url = '', phoneHeight = null, interactive = false }) {
  const frame = h('iframe', { src, title, loading: 'lazy', tabindex: interactive ? null : '-1', 'aria-hidden': interactive ? null : 'true' });
  if (mode === 'phone') {
    const screenH = phoneHeight ?? PHONE.h;
    const maxW = Math.min(width, 340);
    const scale = Math.min(1, (maxW - PHONE.bezel * 2) / PHONE.w);
    const sw = Math.round(PHONE.w * scale), sh = Math.round(screenH * scale);
    // A status bar across the top, as on a real phone, so the notch never sits over the page.
    Object.assign(frame.style, { width: `${PHONE.w}px`, height: `${screenH - PHONE.status}px`, top: `${Math.round(PHONE.status * scale)}px`, transform: `scale(${scale})` });
    if (!interactive) frame.style.pointerEvents = 'none';
    return h('div', { class: 'dv dv-phone', style: `--sw:${sw}px;--sh:${sh}px;--bz:${PHONE.bezel}px;--k:${scale}` },
      h('div', { class: 'dv-phone-screen' }, h('span', { class: 'dv-status', 'aria-hidden': 'true' }, h('b', {}, '9:41'), h('i')), frame, h('span', { class: 'dv-notch', 'aria-hidden': 'true' })));
  }
  const scale = Math.min(1, width / page);
  const vw = Math.round(page * scale), vh = Math.round(page * aspect * scale);
  Object.assign(frame.style, { width: `${page}px`, height: `${Math.round(page * aspect)}px`, transform: `scale(${scale})` });
  if (!interactive) frame.style.pointerEvents = 'none';
  return h('div', { class: 'dv dv-desktop', style: `--vw:${vw}px;--vh:${vh}px` },
    h('div', { class: 'dv-bar' }, h('i'), h('i'), h('i'), url && h('span', {}, url.replace(/^https?:\/\//, ''))),
    h('div', { class: 'dv-view' }, frame));
}

/** A live DOM preview, laid out at phone width inside a phone. */
export function PhoneShell(el, { scale = 0.82, height = 720 } = {}) {
  return h('div', { class: 'dv dv-phone dv-live', style: `--sw:${Math.round(PHONE.w * scale)}px;--sh:${Math.round(height * scale)}px;--bz:${PHONE.bezel}px;--k:${scale}` },
    h('div', { class: 'dv-phone-screen' }, h('div', { class: 'dv-live-inner', style: `width:${PHONE.w}px;height:${height}px;transform:scale(${scale})` }, el), h('span', { class: 'dv-notch', 'aria-hidden': 'true' })));
}
