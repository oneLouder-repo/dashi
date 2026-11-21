import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * The header's light/dark switch. The choice is saved per person in this
 * browser; mode-boot.js applies it before each page draws. Until someone
 * chooses, Dashi follows the device (and keeps following it live).
 */
const KEY = 'dashi.mode';
const saved = () => { try { const m = localStorage.getItem(KEY); return m === 'light' || m === 'dark' ? m : null; } catch { return null; } };
const device = () => (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
export const currentMode = () => saved() ?? device();
export function setMode(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* private window: just for now */ }
  document.documentElement.setAttribute('data-mode', mode);
  document.dispatchEvent(new CustomEvent('dashi:mode', { detail: { mode } }));
}
let following = false;
export function ModeToggle() {
  const btn = h('button', { type: 'button', class: 'shell-icon shell-mode' });
  const draw = () => {
    const dark = currentMode() === 'dark';
    btn.replaceChildren(icon(dark ? 'sun' : 'moon', 19));
    btn.setAttribute('aria-label', dark ? 'Switch to light' : 'Switch to dark');
    btn.dataset.tip = dark ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-pressed', String(dark));
  };
  btn.addEventListener('click', () => { setMode(currentMode() === 'dark' ? 'light' : 'dark'); draw(); });
  document.addEventListener('dashi:mode', draw);
  if (!following) {
    following = true;
    globalThis.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (saved()) return;
      document.documentElement.setAttribute('data-mode', device());
      document.dispatchEvent(new CustomEvent('dashi:mode', { detail: { mode: device() } }));
    });
  }
  draw();
  return btn;
}
