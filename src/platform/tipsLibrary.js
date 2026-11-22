import { isHosted, readKey, writeKey } from './storage.js';
import { blankTips } from '../rhizome/harvest.js';

/**
 * The tip harvester's library and review queue (Rhizome): platform-wide,
 * like the help library. On a server it is kept there and only the platform
 * admin reviews; others get the approved public tips. Locally it is kept in
 * this browser.
 */
const KEY = 'org-toolbox:v3:tips';

export async function loadTips() {
  if (isHosted()) {
    try {
      const res = await fetch('/api/tips');
      const doc = res.ok ? await res.json() : null;
      if (doc) return { ...blankTips(), ...doc };
    } catch { /* fall back to an empty library */ }
    return blankTips();
  }
  return { ...blankTips(), ...(readKey(KEY) ?? {}) };
}

export async function saveTips(doc) {
  if (!isHosted()) {
    if (!writeKey(KEY, doc)) throw new Error('This browser would not save it (storage is full or off).');
    return;
  }
  const res = await fetch('/api/tips', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-toolbox': '1' }, body: JSON.stringify(doc) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `The server said ${res.status}`);
}
