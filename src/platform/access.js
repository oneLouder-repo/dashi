/**
 * Who may use which plugin, and what that means for each document.
 *
 * One set of rules, used by the server (which enforces them on every
 * document read and write) and by the browser (which hides what a person
 * can't use, so menus and links never lead somewhere closed). Pure: no
 * imports, no storage, so both sides share it as is.
 *
 * A plugin is usable when, in order:
 *   1. the platform has it installed (not paused, not a draft),
 *   2. the org's plan includes it and the platform admin hasn't paused it for the org,
 *   3. the org has it switched on (org.plugins),
 *   4. its parent plugin is usable (sub-plugins live inside a parent),
 *   5. the person's role has it (org.pluginRoles[pid][role] !== false),
 *   6. unless the person has their own override (org.pluginPeople[pid][staffId] = true | false).
 * Core plugins (Organisation, Help) are always usable.
 *
 * Plugin shape here: { id, core, parent, defaultOff, platformOff, owns: [doc names], reads: [doc names] }.
 * A doc name in owns/reads may end in "/*" to cover a family (map/*).
 */

const matches = (pattern, name) => (pattern.endsWith('/*') ? name.startsWith(pattern.slice(0, -1)) : pattern === name);

/** Has the org itself chosen this plugin? Most are on until switched off; a defaultOff one is off until switched on. */
export const chosenBy = (org, p) => (p.defaultOff ? org?.plugins?.[p.id] === true : org?.plugins?.[p.id] !== false);

/** Steps 1 to 4: is the plugin on for the org as a whole? */
export function orgHas(plugins, org, id, seen = new Set()) {
  const p = plugins.find((x) => x.id === id);
  if (!p) return false;
  if (p.core) return true;
  if (p.platformOff || org?.platform?.paused?.[id] || !chosenBy(org, p)) return false;
  if (p.parent && !seen.has(p.parent)) return orgHas(plugins, org, p.parent, new Set([...seen, id]));
  return true;
}

/** Steps 5 and 6 for one plugin, ignoring its parent. A person's own override wins over their role. */
export function personHas(org, id, { role = null, staffId = null } = {}) {
  const own = staffId ? org?.pluginPeople?.[id]?.[staffId] : undefined;
  if (own === true || own === false) return own;
  if (!role) return true;
  return org?.pluginRoles?.[id]?.[role] !== false;
}

/** Can this person use this plugin? `who` = { role, staffId }; with no role (local, signed out) only the org's switches count. */
export function canUse(plugins, org, id, who = {}) {
  const p = plugins.find((x) => x.id === id);
  if (!p) return false;
  if (p.core) return true;
  if (!orgHas(plugins, org, id)) return false;
  if (!personHas(org, id, who)) return false;
  return !p.parent || canUse(plugins, org, p.parent, who);
}

/** Every plugin this person can use. */
export const usable = (plugins, org, who = {}) => plugins.filter((p) => canUse(plugins, org, p.id, who));

/** The plugin that owns a document, or null when none claims it (then members keep full access, as before 0.2). */
export function ownerOf(plugins, name) {
  for (const p of plugins) if ((p.owns ?? []).some((x) => matches(x, name))) return p;
  const m = /^plugin\/([\w-]+)$/.exec(name);
  return m ? plugins.find((p) => p.id === m[1]) ?? null : null;
}

/**
 * What a person may do with one document:
 *   'write'   they can use the plugin that owns it (and their role may edit)
 *   'read'    they can use a plugin that reads it, or own it with a read-only role
 *   'public'  neither: they see only what a visitor to the public site would
 * `canEdit` is false for read-only roles (board, guest, viewer).
 */
export function docMode(plugins, org, name, who = {}, { canEdit = true } = {}) {
  const owner = ownerOf(plugins, name);
  if (!owner || owner.core) return canEdit ? 'write' : 'read';
  if (canUse(plugins, org, owner.id, who)) return canEdit ? 'write' : 'read';
  const reader = plugins.some((p) => (p.reads ?? []).some((x) => matches(x, name)) && canUse(plugins, org, p.id, who));
  return reader ? 'read' : 'public';
}

/** The plugins under a parent (its sub-plugins), in order. */
export const childrenOf = (plugins, id) => plugins.filter((p) => p.parent === id);
