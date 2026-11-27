// `cond && el` and `x ? el : null` are handy when building a view, but the DOM's own append, prepend and
// replaceChildren turn null, undefined and false into the text "null" / "false" (that's where the stray
// "falsefalse" came from). Every page loads this file, so skip those values everywhere, the way h() does.
if (typeof Element !== 'undefined' && !Element.prototype.append.__dashi) {
  const keep = (c) => c != null && c !== false;
  for (const Proto of [Element.prototype, DocumentFragment.prototype]) {
    for (const name of ['append', 'prepend', 'replaceChildren']) {
      const orig = Proto[name];
      if (!orig) continue;
      const wrapped = function (...nodes) { return orig.apply(this, nodes.filter(keep)); };
      wrapped.__dashi = true;
      Proto[name] = wrapped;
    }
  }
}

/** Tiny HTML builder: h('button', { class: 'x', onclick }, 'Label'). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

export function options(items, selected) {
  return items.map(({ id, label }) => h('option', { value: id, selected: id === selected }, label));
}
