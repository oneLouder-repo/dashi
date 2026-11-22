/**
 * Rhizome's tabs, shared by its own page and the Graph tab (graph.html),
 * which moved in from the asset manager in alpha 0.4. Rhizome has many
 * tabs: the everyday ones sit on the row, and Measures, Set-up and About
 * start in the More menu (ui/fitTabs.js), as do any that don't fit.
 *
 *   rhizomeTabs(page)   page = 'rhizome' | 'graph': the hrefs work from either page
 */
import { linkTo } from '../plugins.js';

export const RHIZOME_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'analyses', label: 'Analyses', icon: 'spark' },
  { id: 'rack', label: 'Rack', icon: 'connect' },
  { id: 'graph', label: 'Graph', icon: 'sec-graph', page: 'graph' },
  { id: 'report', label: 'Report', icon: 'file' },
  { id: 'facts', label: 'Facts', icon: 'sec-rhizome' },
  { id: 'tips', label: 'Tips', icon: 'book' },
  { id: 'measures', label: 'Measures', icon: 'chart', more: true },
  { id: 'setup', label: 'Set-up', icon: 'settings', more: true },
  { id: 'about', label: 'About', icon: 'help', more: true },
];

export function rhizomeTabs(page = 'rhizome') {
  return RHIZOME_TABS.map((t) => {
    // The Graph tab is its own page; it goes with the graph sub-plugin, so it is left out when that is off.
    if (t.page === 'graph') { const href = page === 'graph' ? '#explore' : linkTo('graph', '#explore'); return href && { ...t, href }; }
    return { ...t, href: page === 'rhizome' ? `#${t.id}` : linkTo('rhizome', `#${t.id}`) };
  }).filter(Boolean);
}
