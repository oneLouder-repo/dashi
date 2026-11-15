import { h } from './dom.js';

/**
 * The save light: a small dash-light in the header that shows every call
 * to the server as it happens.
 *
 *   amber, pulsing  Saving… / Loading… (a call is on its way)
 *   amber, steady   Unsaved changes (an autosave is about to go)
 *   green           Saved (everything has reached the server)
 *   grey            Saved in this browser (no server: the local prototype)
 *   red             Not saved / Offline (a call failed; it is retried)
 *
 * It wraps window.fetch once, so every remote call counts, wherever it is
 * made, and listens for the save events storage.js sends. Click it for the
 * last few calls (handy when testing).
 */
const state = {
  busyWrites: 0,
  busyReads: 0,
  pending: 0,
  error: null,
  lastOk: null,
  log: [],
  local: false,
};
const lights = new Set();

const isWrite = (method) => !['GET', 'HEAD', 'OPTIONS'].includes(method);
const pathOf = (url) => {
  try { return new URL(url, location.href).pathname; } catch { return String(url); }
};

function record(entry) {
  state.log.unshift(entry);
  state.log.length = Math.min(state.log.length, 12);
}

if (typeof window !== 'undefined' && !window.__dashiNetLight) {
  window.__dashiNetLight = true;
  const real = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const method = String(init.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' ? input : input.url;
    const path = pathOf(url);
    // The light watches the platform's own calls; the server's live-update stream isn't a fetch.
    const ours = !/^https?:/i.test(url) || new URL(url, location.href).origin === location.origin;
    if (!ours) return real(input, init);
    const write = isWrite(method);
    if (write) state.busyWrites += 1; else state.busyReads += 1;
    const t0 = performance.now();
    update();
    try {
      const res = await real(input, init);
      record({ method, path, status: res.status, ms: Math.round(performance.now() - t0), at: new Date() });
      if (write && res.status >= 500) state.error = `The server said ${res.status}`;
      else if (write && res.ok) { state.error = null; state.lastOk = new Date(); }
      else if (!write && res.ok && !state.error) state.lastOk ??= new Date();
      return res;
    } catch (err) {
      record({ method, path, status: 'failed', ms: Math.round(performance.now() - t0), at: new Date() });
      if (err?.name !== 'AbortError') state.error = 'The server could not be reached';
      throw err;
    } finally {
      if (write) state.busyWrites -= 1; else state.busyReads -= 1;
      update();
    }
  };
  // XMLHttpRequest (chunked uploads report progress with it) counts too.
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__dashi = { method: String(method).toUpperCase(), path: pathOf(url) };
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    const info = this.__dashi;
    if (info) {
      const write = isWrite(info.method);
      if (write) state.busyWrites += 1; else state.busyReads += 1;
      const t0 = performance.now();
      update();
      this.addEventListener('loadend', () => {
        if (write) state.busyWrites -= 1; else state.busyReads -= 1;
        record({ ...info, status: this.status || 'failed', ms: Math.round(performance.now() - t0), at: new Date() });
        if (write && this.status >= 200 && this.status < 300) { state.error = null; state.lastOk = new Date(); }
        else if (write && (this.status === 0 || this.status >= 500)) state.error = 'An upload did not reach the server';
        update();
      }, { once: true });
    }
    return send.apply(this, args);
  };
  window.addEventListener('toolbox:save-pending', () => { state.pending += 1; update(); });
  window.addEventListener('toolbox:saved', () => { state.pending = 0; state.error = null; state.lastOk = new Date(); update(); });
  window.addEventListener('toolbox:save-sent', () => { state.pending = 0; update(); });
  window.addEventListener('toolbox:save-failed', (e) => { state.pending = 0; state.error = e.detail?.why ?? 'Not saved'; update(); });
  window.addEventListener('beforeunload', (e) => {
    // Leaving while a save is still on its way: the browser asks first.
    if (state.busyWrites > 0 || state.pending > 0) { e.preventDefault(); e.returnValue = ''; }
  });
}

/** Tell the light this page keeps its data in the browser (no server). */
export function setLocalMode(on) {
  state.local = !!on;
  update();
}

function view() {
  if (state.busyWrites > 0) return { kind: 'busy', label: 'Saving…', hint: 'Sending your changes to the server.' };
  if (state.pending > 0) return { kind: 'pending', label: 'Unsaved', hint: 'Your changes are about to be saved.' };
  if (state.error) return { kind: 'error', label: /reach/.test(state.error) ? 'Offline' : 'Not saved', hint: `${state.error}. Changes are kept on this page and retried.` };
  if (state.busyReads > 0) return { kind: 'busy', label: 'Loading…', hint: 'Fetching from the server.' };
  if (state.local) return { kind: 'local', label: 'Saved here', hint: 'No server: your work is kept in this browser.' };
  return { kind: 'ok', label: 'Saved', hint: state.lastOk ? `Everything is on the server. Last saved ${state.lastOk.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'Everything is on the server.' };
}

function paint(el) {
  const v = view();
  el.dataset.kind = v.kind;
  el.querySelector('.netlight-label').textContent = v.label;
  el.title = v.hint;
  el.setAttribute('aria-label', `${v.label}. ${v.hint}`);
}

let raf = 0;
function update() {
  if (raf || typeof requestAnimationFrame === 'undefined') return;
  raf = requestAnimationFrame(() => { raf = 0; for (const el of lights) el.isConnected ? paint(el) : lights.delete(el); });
}

/** The light itself. Put one in a header; it keeps itself up to date. */
export function NetLight() {
  const log = h('div', { class: 'netlight-log', role: 'dialog', 'aria-label': 'Recent server calls', hidden: true });
  const button = h('button', { type: 'button', class: 'netlight', 'aria-live': 'polite', onclick: (e) => {
    e.stopPropagation();
    log.hidden = !log.hidden;
    if (!log.hidden) fill();
  } }, h('span', { class: 'netlight-led', 'aria-hidden': 'true' }), h('span', { class: 'netlight-label' }, 'Saved'));
  const wrap = h('span', { class: 'netlight-wrap' }, button, log);
  function fill() {
    const v = view();
    log.replaceChildren(
      h('p', { class: 'netlight-head' }, h('strong', {}, v.label), ' ', h('span', {}, v.hint)),
      state.log.length
        ? h('ul', {}, state.log.map((c) => h('li', { class: typeof c.status === 'number' && c.status < 400 ? 'ok' : 'bad' },
            h('code', {}, c.method), h('span', { class: 'p' }, c.path), h('span', { class: 's' }, String(c.status)), h('span', { class: 'ms' }, `${c.ms} ms`))))
        : h('p', { class: 'muted small' }, state.local ? 'This page saves to the browser, so there are no server calls.' : 'No server calls yet on this page.'));
  }
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) log.hidden = true; });
  lights.add(button);
  paint(button);
  return wrap;
}
