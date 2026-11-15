/**
 * Funder reports: a draft report for a funder and a period, written from
 * the strategy, the program data, the workplans and the data stories, as
 * Markdown the team then edits. Reports live in the dashboards document
 * (collection `reports`) next to the dashboards they draw on.
 *
 * Report { id, title, funder, from, to (YYYY-MM-DD), nodeIds: [objective or goal ids],
 *          measureIds, storyIds, body (markdown, editable), status: 'draft' | 'sent',
 *          createdAt, updatedAt }
 *
 * Pure functions, so tests and the server can run them.
 */
import { descendants, measuresUnder, rootOf, childrenOf } from './strategy.js';
import { valueAt, seriesOf } from './data.js';
import { workplanProgress } from './strategyReports.js';
import { monthLabel, short } from '../strategy/dates.js';

const fmt = (v, unit = '') => {
  if (v == null) return '—';
  if (unit.startsWith('%')) return `${(+v).toFixed(v % 1 ? 1 : 0)}%`;
  return Number(v).toLocaleString('en-CA');
};
const unitText = (unit = '') => (unit.startsWith('%') ? '' : ` ${unit}`.replace(/\s*\/\s*(yr|y|mo|month)$/, (m) => m));
const monthOf = (d) => `${d.slice(0, 7)}-01`;

/** The period's dates as words: "April to September 2026". */
const longMonth = (d) => new Date(`${d.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const longDate = (d) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
export function periodLabel(from, to) {
  if (!from || !to) return monthLabel(from || to || '');
  const a = longMonth(from), b = longMonth(to);
  if (a === b) return a;
  return a.slice(-4) === b.slice(-4) ? `${a.slice(0, -5)} to ${b}` : `${a} to ${b}`;
}

/** What each measure did over the period: value at the start, at the end, and the change. */
export function measureMovements(strategy, data, measureIds, from, to) {
  const all = Object.fromEntries(measuresUnder(strategy, rootOf(strategy)?.id).map((m) => [m.id, m]));
  return measureIds.map((id) => all[id]).filter(Boolean).map((m) => {
    const series = seriesOf(m.id, data);
    const start = valueAt(series, monthOf(from));
    const end = valueAt(series, to);
    const target = Number(m.target);
    const change = start && end && start.value ? Math.round(((end.value - start.value) / Math.abs(start.value)) * 100) : null;
    return { measure: m, start, end, change, target: Number.isFinite(target) && target > 0 ? target : null, ofTarget: end && Number.isFinite(target) && target > 0 ? Math.round((end.value / target) * 100) : null };
  });
}

/** Workplans under the chosen objectives and goals that ran during the period, with how they went. */
export function workDuring(strategy, nodeIds, from, to, today = to) {
  const seen = new Set();
  const out = [];
  for (const id of nodeIds) {
    for (const n of [strategy.nodes[id], ...descendants(strategy, id)]) {
      if (!n || n.type !== 'workplan' || seen.has(n.id)) continue;
      if (!n.start || !n.end || n.end < from || n.start > to) continue;
      seen.add(n.id);
      const p = workplanProgress(strategy, n.id, today);
      const milestones = [...(n.milestones ?? []), ...descendants(strategy, n.id).flatMap((t) => (t.events ?? []).filter((e) => e.kind === 'milestone').map((e) => ({ date: e.date, title: e.text })))]
        .filter((m) => m.date >= from && m.date <= to).sort((a, b) => a.date.localeCompare(b.date));
      out.push({ node: n, progress: p, ended: n.end <= to, milestones });
    }
  }
  return out.sort((a, b) => a.node.end.localeCompare(b.node.end));
}

/** The whole draft, as Markdown. */
export function draftReport({ strategy, data, dashboards, org }, { funder, from, to, nodeIds = [], measureIds = [], storyIds = [], today = to }) {
  const period = periodLabel(from, to);
  const moves = measureMovements(strategy, data, measureIds, from, to);
  const work = workDuring(strategy, nodeIds, from, to, today);
  const nodes = nodeIds.map((id) => strategy.nodes[id]).filter(Boolean);
  const stories = storyIds.map((id) => dashboards?.stories?.[id]).filter(Boolean);
  const plan = rootOf(strategy);
  const lines = [];
  lines.push(`# Report to ${funder || 'our funder'}: ${period}`, '', `_${org?.name ?? 'Our organisation'} · prepared ${longDate(today)}_`, '');
  lines.push('## In brief', '');
  const headline = moves.filter((m) => m.end);
  if (headline.length) {
    const best = [...headline].sort((a, b) => (b.change ?? -999) - (a.change ?? -999))[0];
    lines.push(`Over ${period} we worked toward ${nodes.length ? nodes.map((n) => `**${n.title.toLowerCase().replace(/\.$/, '')}**`).join(nodes.length > 2 ? ', ' : ' and ') : `our strategic plan, _${plan?.title ?? ''}_`}. ${best.change != null ? `The biggest movement was in ${best.measure.name.toLowerCase()}: ${fmt(best.start?.value, best.measure.unit)} to ${fmt(best.end.value, best.measure.unit)}${unitText(best.measure.unit)}, ${best.change >= 0 ? 'up' : 'down'} ${Math.abs(best.change)}%.` : ''}`, '');
  } else lines.push(`Over ${period} we worked toward ${nodes.map((n) => n.title).join('; ') || (plan?.title ?? 'our plan')}.`, '');
  const done = work.filter((w) => w.progress.state === 'complete');
  const behind = work.filter((w) => w.progress.state === 'behind' || (w.ended && w.progress.state !== 'complete'));
  if (work.length) lines.push(`${work.length} workplan${work.length === 1 ? '' : 's'} ran in the period: ${done.length} finished, ${behind.length} ${behind.length === 1 ? 'is' : 'are'} behind, and the rest are on track.`, '');
  if (moves.length) {
    lines.push('## The numbers', '', '| Measure | Start of period | End of period | Change | Target |', '| --- | --- | --- | --- | --- |');
    for (const m of moves) lines.push(`| ${m.measure.name} | ${fmt(m.start?.value, m.measure.unit)} | ${fmt(m.end?.value, m.measure.unit)} | ${m.change == null ? '—' : `${m.change >= 0 ? '+' : ''}${m.change}%`} | ${m.target ? `${fmt(m.target, m.measure.unit)}${m.ofTarget ? ` (${m.ofTarget}% there)` : ''}` : '—'} |`);
    lines.push('', 'Figures are from our program data as reported by member programs. Every public chart has a table view.', '');
  }
  if (work.length) {
    lines.push('## The work', '');
    for (const w of work) {
      const p = w.progress;
      const state = p.state === 'complete' ? 'finished' : p.state === 'behind' ? 'behind' : p.state === 'on-track' ? 'on track' : p.state === 'not-started' ? 'not started yet' : 'without tasks yet';
      lines.push(`### ${w.node.title}`, '', `${short(w.node.start)} to ${short(w.node.end)}. ${p.total ? `${p.done} of ${p.total} tasks done (${p.pct}%)` : 'No tasks logged'}; ${state}.${w.node.notes ? ` ${w.node.notes}` : ''}`);
      if (w.milestones.length) lines.push('', ...w.milestones.map((m) => `- Milestone, ${short(m.date)}: ${m.title}`));
      lines.push('');
    }
  }
  if (stories.length) {
    lines.push('## Stories from the data', '');
    for (const s of stories) {
      lines.push(`### ${s.title}`, '', s.summary || '', '');
      for (const st of s.steps ?? []) lines.push(`**${st.heading}** ${st.text}`, '');
    }
  }
  lines.push('## What is next', '', `The next period's workplans are on our roadmap. ${behind.length ? `We are watching ${behind.map((w) => w.node.title.toLowerCase()).join(' and ')}.` : ''}`, '');
  lines.push('## Thank you', '', `Your support made this work possible. Questions to ${org?.contact?.email || 'our team'}.`, '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export const blankReport = ({ funder = '', from, to, nodeIds = [], measureIds = [], storyIds = [] } = {}) => ({
  title: `${funder || 'Funder'} report, ${periodLabel(from, to)}`, funder, from, to, nodeIds, measureIds, storyIds, body: '', status: 'draft',
  createdAt: new Date().toISOString().slice(0, 10), updatedAt: new Date().toISOString().slice(0, 10),
});

/** Funders named so far, for a quick pick. */
export const fundersOf = (reports) => [...new Set(Object.values(reports ?? {}).map((r) => r.funder).filter(Boolean))].sort();

/** Objectives and goals with measures or work under them: what a report can be about. */
export const reportableNodes = (strategy) => Object.values(strategy.nodes).filter((n) => (n.type === 'objective' || n.type === 'goal') && (measuresUnder(strategy, n.id).length || childrenOf(strategy, n.id).length));
