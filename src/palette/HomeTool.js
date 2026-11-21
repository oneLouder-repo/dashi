import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { PluginHeader } from '../ui/PluginHeader.js';
import { measureIndex } from '../platform/strategy.js';
import { dataMonths } from '../platform/data.js';
import { published } from '../platform/podcasts.js';
import { monthLabel, today } from '../strategy/dates.js';
import { RoadSvg, currentPlan } from '../strategy/Road.js';
import { loadDoc } from '../platform/storage.js';
import { migrateFeedback } from '../platform/feedback.js';
import { linkTo } from '../plugins.js';

/** The Workbench's front page: what is here, and a way into each mini-tool. */
export function HomeTool(ctx) {
  const dashes = Object.values(ctx.dashboards.doc.dashboards);
  const measures = Object.keys(measureIndex(ctx.strategy));
  const months = dataMonths(ctx.data.doc);
  const pods = ctx.podcasts?.doc;
  const waiting = pods ? Object.values(pods.episodes).filter((e) => !published(e, today())).length : 0;
  const answers = Object.keys(migrateFeedback(loadDoc('feedback')).responses).length;
  const reports = Object.values(ctx.dashboards.doc.reports ?? {});
  const plan = currentPlan(ctx.strategy);
  const master = plan;
  const road = master ? RoadSvg(ctx.strategy, master.id, { compact: true, links: false }) : null;
  const usesStrategy = Object.values(ctx.dashboards.doc.dashboards).filter((d) => d.widgets.some((w) => ['road', 'lights', 'milestones', 'progress'].includes(w.type)));
  const stat = (label, value, hint) => h('div', { class: 'stat-tile' }, h('span', {}, label), h('strong', {}, value), hint && h('small', {}, hint));

  return h('div', {},
    PluginHeader('palette', {
      blurb: 'Tools for showing, exploring and playing with your data, and for bringing staff, partners and the public into the conversation about it.',
      actions: h('button', { class: 'btn btn-sm btn-primary', onclick: () => ctx.create() }, icon('plus', 14), 'New dashboard'),
    }),
    h('div', { class: 'stat-tiles' },
      stat('Dashboards', dashes.length, `${dashes.filter((d) => d.visibility === 'public' && d.siteId).length} on a public site`),
      stat('Measures', measures.length, 'from Strategy & Work'),
      stat('Latest data', months.length ? monthLabel(months.at(-1)) : 'None yet', `${months.length} months recorded`),
      stat('Feedback', answers, `answers to ${Object.keys(ctx.dashboards.doc.forms ?? {}).length} forms`),
      stat('Funder reports', reports.length, `${reports.filter((r) => r.status === 'sent').length} sent`),
      pods && stat('Episodes waiting', waiting, waiting ? 'drafts and scheduled' : 'nothing waiting')),
    road && h('section', { class: 'wb-strategic card' },
      h('div', {},
        h('h2', {}, 'Your strategy, in public'),
        h('p', {}, 'The roadmap, the goals’ traffic lights and the next milestones can sit on any dashboard, next to your measures, for the board or for the public. Open a dashboard and add them from “From your strategy”.'),
        h('p', { class: 'muted small' }, usesStrategy.length ? `In use on ${usesStrategy.map((d) => d.title).join(', ')}.` : 'Not on a dashboard yet.'),
        h('div', { class: 'stat-line' },
          h('a', { class: 'btn btn-sm btn-primary', href: `#${usesStrategy[0]?.id ?? 'dashboards'}` }, icon('chart', 14), usesStrategy.length ? `Open ${usesStrategy[0].title}` : 'Pick a dashboard'),
          h('a', { class: 'btn btn-sm btn-ghost', href: linkTo('strategy', '#roadmap') }, 'The full roadmap'))),
      h('div', { class: 'wb-road' }, road.el)),
    h('h2', {}, 'Mini-tools'),
    h('div', { class: 'cards' }, ctx.tools.filter((t) => t.id !== 'home').map((t) =>
      h('a', { class: 'card tool-card', href: `#${t.id}` },
        h('h3', {}, icon(t.icon, 22), t.name),
        h('p', {}, t.about ?? t.blurb),
        t.isNew && h('div', { class: 'stat-line' }, h('span', { class: 'badge badge-sm badge-primary' }, 'New'))))),
    ctx.coming.length > 0 && h('h2', {}, 'Ideas in the works'),
    ctx.coming.length > 0 && h('ul', { class: 'idea-list' }, ctx.coming.map((t) => h('li', {}, h('strong', {}, t.name), ' ', h('span', { class: 'muted' }, t.blurb)))));
}
