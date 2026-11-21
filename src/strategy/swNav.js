import { h } from '../ui/dom.js';
import { linkTo } from '../plugins.js';
import { plansOf, ofPlan } from '../platform/studio.js';

/**
 * The one left panel of Strategy & Work (0.2), the same on every page of it
 * (strategy.html, studio.html, plandoc.html), laid out like the mapper's
 * tool panel: sections of tools that fold, always in the same order, so
 * nothing appears or moves as you go.
 *
 *   Tools             Overview, Framework, Strategic data, Workplan completion, Roadmap, Plan designer
 *   Planning Studio   a plan picker, then that plan's tools: home, SOAR, Assemble, Theory of change, Results
 *   …                 whatever the page adds (the theory's layers, the plan documents)
 *
 *   swSections({ page: 'strategy'|'studio'|'plandoc', tab, planId, strategy, studio, extra })
 */
export const SW_TOOLS = [
  { id: 'overview', label: 'Overview', icon: 'home', sub: 'Plans, objectives, the sunburst' },
  { id: 'framework', label: 'Framework', icon: 'strategy', sub: 'The outline: goals to tasks' },
  { id: 'data', label: 'Strategic data', icon: 'chart', sub: 'Measures and their numbers' },
  { id: 'completion', label: 'Workplan completion', icon: 'timeline', sub: 'Traffic lights and tasks done' },
  { id: 'roadmap', label: 'Roadmap', icon: 'mapTrifold', sub: 'The road ahead, signposted' },
];
export const STUDIO_TOOLS = [
  { id: 'home', label: 'Plan home', icon: 'home', count: null, sub: 'Dates, context and team' },
  { id: 'soar', label: 'SOAR board', icon: 'workbench', count: 'cards', sub: 'Strengths to results' },
  { id: 'assemble', label: 'Assemble', icon: 'connect', count: 'blocks', sub: 'Patch ideas into the plan' },
  { id: 'change', label: 'Theory of change', icon: 'flow', count: 'toc', sub: 'Why it works, as layers' },
  { id: 'results', label: 'Results', icon: 'chart', count: 'results', sub: 'Outcomes and indicators' },
];

const PLAN_KEY = 'dashi.sw.plan';
/** The plan the studio tools are for: the open one, else the one picked last, else the first. */
export function studioPlan(strategy, planId = null) {
  const plans = plansOf(strategy);
  if (planId && plans.some((p) => p.id === planId)) { try { localStorage.setItem(PLAN_KEY, planId); } catch { /* private window */ } return planId; }
  let last = null;
  try { last = localStorage.getItem(PLAN_KEY); } catch { /* private window */ }
  return plans.find((p) => p.id === last)?.id ?? plans[0]?.id ?? null;
}

export function swSections({ page, tab = null, planId = null, strategy, studio = null, extra = [], onNewPlan = null }) {
  const here = (p) => page === p;
  const toStrategy = (route) => (here('strategy') ? route : linkTo('strategy', route));
  const toStudio = (route) => (here('studio') ? route : linkTo('studio', route));
  const plans = plansOf(strategy);
  const pid = studioPlan(strategy, planId);
  const studioTab = here('studio') ? tab : null;
  const tools = [
    ...SW_TOOLS.map((t) => ({
      label: t.label, sub: t.sub, icon: t.icon,
      href: toStrategy(t.id === 'framework' && planId ? `#${planId}` : `#${t.id}`),
      on: here('strategy') && tab === t.id,
    })),
    { label: 'Plan designer', sub: 'Pages to print or publish', icon: 'brush', href: linkTo('plandoc'), on: here('plandoc') },
  ];
  const tabHref = (t) => (pid ? toStudio(`#${pid}${t === 'home' ? '' : `/${t}`}`) : toStudio('#framework'));
  const picker = plans.length > 0 && typeof document !== 'undefined' && h('select', {
    class: 'select select-sm sw-plan-pick', 'aria-label': 'The plan these tools are for', title: 'The plan these tools are for',
    onchange: (e) => {
      if (e.target.value === '+') { e.target.value = pid ?? ''; onNewPlan?.(); return; }
      studioPlan(strategy, e.target.value);
      const t = studioTab && studioTab !== 'framework' ? studioTab : 'home';
      location.href = here('studio') ? `#${e.target.value}${t === 'home' ? '' : `/${t}`}` : linkTo('studio', `#${e.target.value}`);
    },
  }, plans.map((p) => h('option', { value: p.id, selected: p.id === pid }, p.title)), onNewPlan && h('option', { value: '+' }, '+ New plan…'));
  const studioItems = [
    { label: 'Framework and plans', sub: 'Mission, vision, every plan', icon: 'strategy', href: toStudio('#framework'), on: studioTab === 'framework' },
    ...STUDIO_TOOLS.map((t) => ({
      label: t.label, sub: t.sub, icon: t.icon, href: tabHref(t.id),
      on: !!pid && pid === planId && (studioTab === t.id || (t.id === 'soar' && ['s', 'o', 'a'].includes(studioTab))),
      badge: studio && pid && t.count ? String(ofPlan(studio, t.count, pid).length || '') || null : null,
      disabled: !pid && t.id !== 'home',
      className: 'side-tool',
    })),
  ];
  return [
    { title: 'Tools', fold: 'sw-tools', className: 'sw-section', items: tools },
    { title: 'Planning Studio', fold: 'sw-studio', className: 'sw-section', head: picker || null, items: studioItems,
      action: onNewPlan && !plans.length ? { label: 'New plan', onclick: onNewPlan } : null },
    ...extra,
  ];
}
