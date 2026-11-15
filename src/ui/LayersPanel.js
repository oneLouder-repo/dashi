import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * Lists layers: pick the active one (new items go there), rename, show or
 * hide, lock. Choosing a layer, or its pulse button, makes everything on
 * it pulse for a few seconds so you can see what's there.
 */
export function LayersPanel(el, ctx) {
  const { store, ops, ui } = ctx;

  function render() {
    if (el.contains(document.activeElement) && document.activeElement.type === 'text') return;
    const { layers } = store.map;
    if (!layers.some((l) => l.id === ui.activeLayerId)) ui.activeLayerId = layers[0]?.id;

    // The heading and Add button are the sidebar section's.
    el.replaceChildren(
      h('ul', { class: 'layers' },
        [...layers].reverse().map((layer) =>
          h('li', { class: layer.id === ui.activeLayerId ? 'active' : '' },
            h('input', { type: 'radio', name: 'active-layer', title: 'New items go here', checked: layer.id === ui.activeLayerId,
              onchange: () => { ui.activeLayerId = layer.id; render(); ctx.mapView.signalLayer(layer.id); } }),
            h('input', { type: 'text', value: layer.name, 'aria-label': 'Layer name',
              onchange: (e) => store.apply(ops.updateLayer(layer.id, { name: e.target.value })) }),
            h('button', { class: 'icon-button', title: 'Pulse what’s on this layer', 'aria-label': `Pulse ${layer.name}`,
              onclick: () => ctx.mapView.signalLayer(layer.id) }, icon('target', 16)),
            h('button', { class: `icon-button${layer.visible ? '' : ' off'}`, title: layer.visible ? 'Hide' : 'Show',
              onclick: () => store.apply(ops.updateLayer(layer.id, { visible: !layer.visible })) }, icon(layer.visible ? 'eye' : 'eyeOff', 16)),
            h('button', { class: `icon-button${layer.locked ? '' : ' off'}`, title: layer.locked ? 'Unlock' : 'Lock',
              onclick: () => store.apply(ops.updateLayer(layer.id, { locked: !layer.locked })) }, icon(layer.locked ? 'lock' : 'unlock', 16)),
          ),
        ),
      ),
    );
  }

  store.addEventListener('change', render);
  render();
}
