import { h } from '../ui/dom.js';
import { col } from '../core/collections.js';
import { uiForm, uiAlert } from '../ui/dialog.js';
import { toast } from '../ui/toast.js';
import { childrenOf, rootOf } from '../platform/strategy.js';
import { exportPlans, readPlanFile, importPlans, planFileName, downloadPlanFile } from '../platform/planFile.js';

/**
 * The buttons for plan files (platform/planFile.js), shared by Plan and the
 * Planning Studio:
 *
 *   savePlanFile({ strategy, studio, org, current })   asks which plans, then downloads the file
 *   openPlanFile({ strategy, org, apply })             picks a file; apply({ nodes, studio, planIds, notes }) adds it
 *   addPlansOp(result)                                  the one undoable strategy op that adds the nodes
 */
export async function savePlanFile({ strategy, studio, org, current = null }) {
  const root = rootOf(strategy);
  const plans = root ? childrenOf(strategy, root.id).filter((n) => n.type === 'plan') : [];
  if (!plans.length) { await uiAlert('There are no plans to save yet.'); return; }
  let chosen = plans.map((p) => p.id);
  if (plans.length > 1) {
    const values = await uiForm({
      title: 'Save a plan file',
      message: 'A .dashi-plan.json file keeps the plan, everything under it and its Planning Studio work. Open it in any Dashi organisation to add the plan there.',
      ok: 'Save file',
      fields: plans.map((p) => ({ name: p.id, label: p.title, type: 'checkbox', value: current ? p.id === current : true })),
      validate: (v) => { if (!Object.values(v).some(Boolean)) throw new Error('Pick at least one plan.'); },
    });
    if (!values) return;
    chosen = plans.filter((p) => values[p.id]).map((p) => p.id);
  }
  const file = exportPlans(strategy, studio, chosen, { org });
  const one = chosen.length === 1 ? strategy.nodes[chosen[0]].title : `${org?.name ?? 'our'} plans`;
  downloadPlanFile(file, planFileName(one));
  toast(chosen.length === 1 ? `Saved “${one}”` : `Saved ${chosen.length} plans`);
}

export function openPlanFile({ strategy, org, apply }) {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    try {
      const file = readPlanFile(await f.text());
      const result = importPlans(file, strategy, { orgId: org?.id ?? null });
      apply(result);
      const names = result.planIds.map((id) => result.nodes.find((n) => n.id === id)?.title).filter(Boolean);
      const what = names.length === 1 ? `“${names[0]}”` : `${names.length} plans`;
      if (result.notes.length) await uiAlert(result.notes.join(' '), { title: `Added ${what}` });
      else toast(`Added ${what}`);
    } catch (e) {
      await uiAlert(e.message, { title: 'Couldn’t open that file', kind: 'error' });
    }
  });
  document.body.append(input);
  input.click();
}

export const addPlansOp = (result) => col.batch(result.nodes.map((n) => col.add('nodes', n)));

/** Studio items from a file, added into a studio document in place. */
export function addStudioItems(studio, result) {
  for (const [k, items] of Object.entries(result.studio)) {
    studio[k] ??= {};
    Object.assign(studio[k], items);
  }
  return studio;
}
