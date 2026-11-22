/**
 * The report pack (Rhizome output): the reason to run a process at all.
 * One document an org can print, save as a PDF and hand round, with what
 * Rhizome found, the tips and their sources, the links to read, the data
 * behind it, and how to read it.
 *
 * buildReport(...) is pure: it gathers the sections as data, and the Report
 * tab lays them out on paper. Sections, each of which can be left out:
 *
 *   summary   at a glance: counts, change since the baseline, findings by theme, the top three
 *   findings  every finding (or the top N), grouped by theme, each with its tip, what it's about,
 *             why it was raised, where the idea comes from, and links to read more
 *   data      the network's most central actors, the calibration, the ABCD balance, the signals
 *   reading   a reading list for the themes the findings touch
 *   tips      your own tips and approved harvested tips on those themes
 *   help      how to read the report, the words it uses, and where to go next in Dashi
 *   rules     the rules that ran (an appendix)
 */
import { runAnalysis, ruleById, analysisById, describeCheck, OPS } from './rules.js';
import { SOURCES, tipById } from './tips.js';
import { SIGNALS } from './measures.js';
import { themeById, SECTORS, sinceBaseline } from './setup.js';
import { resourcesFor, harvestSourceById } from './harvestSources.js';
import { readingFor, sourceLabel } from './harvest.js';
import { factCounts, typeLabel } from './facts.js';
import { ABCD } from '../platform/assetHub.js';

export const REPORT_SECTIONS = [
  { id: 'summary', label: 'At a glance' },
  { id: 'findings', label: 'Findings and tips' },
  { id: 'data', label: 'The data behind it' },
  { id: 'reading', label: 'Reading list' },
  { id: 'tips', label: 'More tips on these themes' },
  { id: 'help', label: 'How to read this report' },
  { id: 'rules', label: 'Appendix: the rules that ran' },
];
export const defaultReportOptions = () => ({ scope: 'set', limit: 25, sections: REPORT_SECTIONS.map((s) => s.id), title: '' });

const plural = (n, word, many = `${word}s`) => `${n.toLocaleString()} ${n === 1 ? word : many}`;

/**
 * Build the report. `ctx` is the rules context ({ facts, measures, calibration,
 * profile, plugins, customRules, custom }); `doc` the Rhizome instance;
 * `opts` = { scope: 'set' | analysisId, limit, sections, title };
 * `extras` = { tipsDoc, now, orgName }.
 */
export function buildReport(ctx, doc, opts = defaultReportOptions(), { tipsDoc = null, now = new Date().toISOString(), orgName = '' } = {}) {
  const want = new Set(opts.sections ?? REPORT_SECTIONS.map((s) => s.id));
  const analyses = { ...analysisById, ...(ctx.custom ?? {}) };
  const ids = opts.scope === 'set' || !analyses[opts.scope] ? (doc.analyses ?? Object.keys(analysisById)).filter((a) => analyses[a]) : [opts.scope];
  const all = runAnalysis(ids, ctx, { dismissed: doc.dismissed ?? {} });
  const findings = all.slice(0, Math.max(1, opts.limit ?? 25));
  const ruleOf = (id) => ruleById[id] ?? ctx.customRules?.[id];
  const E = ctx.facts.entities;
  const themesHit = [...new Set(findings.map((f) => ruleOf(f.ruleId)?.theme).filter(Boolean))];
  const profile = doc.profile ?? null;

  const report = {
    meta: {
      title: opts.title?.trim() || `What Rhizome found for ${orgName || 'your organisation'}`,
      org: orgName, at: now, date: now.slice(0, 10),
      analyses: ids.map((id) => ({ id, name: analyses[id].name, blurb: analyses[id].blurb ?? '' })),
      profile: profile ? {
        sector: SECTORS.find((s) => s.id === profile.sector)?.label ?? profile.sector,
        serves: profile.serves ?? '', focus: profile.focus ?? [],
        themes: (profile.themes ?? []).map((t) => themeById[t]?.label ?? t),
      } : null,
      total: all.length, shown: findings.length, dismissed: Object.keys(doc.dismissed ?? {}).length,
      baseline: doc.baseline?.at?.slice(0, 10) ?? null,
    },
    sections: [],
  };

  if (want.has('summary')) {
    const fc = factCounts(ctx.facts);
    const delta = sinceBaseline(doc, ctx.measures);
    const byTheme = {};
    for (const f of all) { const t = ruleOf(f.ruleId)?.theme ?? 'other'; byTheme[t] = (byTheme[t] ?? 0) + 1; }
    report.sections.push({
      id: 'summary', title: 'At a glance',
      stats: [
        { label: 'things', value: fc.entities, delta: delta.entities ?? 0 },
        { label: 'ties between them', value: fc.relations },
        { label: 'actors on maps', value: ctx.measures.counts.actors },
        { label: 'map links', value: ctx.measures.counts.links, delta: delta.links ?? 0 },
        { label: 'assets', value: ctx.measures.counts.assets, delta: delta.assets ?? 0 },
        { label: 'findings', value: all.length },
      ],
      themes: Object.entries(byTheme).sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: themeById[id]?.label ?? id, count })),
      // The best finding from each rule, so "start here" shows a spread, not one rule three times.
      top: findings.filter((f, i) => findings.findIndex((x) => x.ruleId === f.ruleId) === i).slice(0, 3).map((f) => ({ title: f.title, text: f.text, score: f.score })),
    });
  }

  if (want.has('findings')) {
    const groups = [];
    for (const f of findings) {
      const rule = ruleOf(f.ruleId);
      const theme = rule?.theme ?? 'other';
      let g = groups.find((x) => x.theme === theme);
      if (!g) groups.push((g = { theme, label: themeById[theme]?.label ?? theme, blurb: themeById[theme]?.blurb ?? '', items: [] }));
      const tip = tipById[rule?.say];
      // One block per rule: its best finding in full, the rest listed under it.
      const same = g.items.find((x) => x.ruleId === f.ruleId);
      if (same) { same.also.push({ name: f.rows?.[0]?.name ?? f.title, score: f.score }); continue; }
      g.items.push({
        ruleId: f.ruleId, also: [],
        id: f.id, title: f.title, text: f.text, score: f.score, own: !!rule?.own,
        about: f.items.slice(0, 8).map((id) => ({ id, name: E[id]?.name ?? id, type: typeLabel(E[id]?.type ?? '') })), more: Math.max(0, f.items.length - 8),
        why: (f.why?.checks ?? []).map((c) => `${describeCheck(c)} (here: ${c.got ?? 'none'})`),
        looked: rule?.from?.list ? `the “${rule.from.list}” measure` : `every ${typeLabel(rule?.from?.type ?? '').toLowerCase()}`,
        source: tip ? SOURCES[tip.source] ?? null : null,
        read: resourcesFor(theme).slice(0, 2).map((s) => ({ title: s.title, author: s.author, url: s.url })),
      });
    }
    report.sections.push({ id: 'findings', title: 'Findings and tips', groups, more: all.length - findings.length });
  }

  if (want.has('data')) {
    const actors = Object.entries(ctx.measures.actors).sort((a, b) => b[1].betweenness - a[1].betweenness || b[1].degree - a[1].degree).slice(0, 12)
      .map(([id, a]) => ({ name: E[id]?.name ?? id, map: E[`map:${E[id]?.attrs.mapId}`]?.name ?? '', zone: E[id]?.attrs.zoneLabel ?? '', links: a.degree, betweenness: a.betweenness, cut: !!a.cut }));
    const cal = doc.calibration ?? ctx.calibration ?? ctx.measures.calibration;
    const abcdMax = Math.max(1, ...Object.values(ctx.measures.abcd));
    report.sections.push({
      id: 'data', title: 'The data behind it',
      actors,
      calibration: ['degree', 'betweenness'].map((k) => ({ label: k === 'degree' ? 'Links per actor' : 'Betweenness', ...(cal?.[k] ?? {}) })),
      abcd: ABCD.map((t) => ({ label: t.label, color: t.color, count: ctx.measures.abcd[t.id] ?? 0, share: (ctx.measures.abcd[t.id] ?? 0) / abcdMax })),
      signals: SIGNALS.filter((s) => !ctx.plugins || ctx.plugins.has(s.source)).map((s) => ({ label: s.label, why: s.why, count: (ctx.measures.lists[s.id] ?? []).length })),
    });
  }

  if (want.has('reading')) {
    const ids2 = [...new Set([...themesHit.flatMap((t) => resourcesFor(t).map((s) => s.id)), ...(doc.reading ?? readingFor(profile))])].slice(0, 12);
    report.sections.push({ id: 'reading', title: 'Reading list', items: ids2.map((id) => harvestSourceById[id]).filter(Boolean).map((s) => ({ title: s.title, author: s.author, year: s.year, kind: s.kind, url: s.url, idea: s.points?.[0] ?? '', theme: themeById[s.theme]?.label ?? s.theme })) });
  }

  if (want.has('tips')) {
    const own = Object.values(doc.ownTips ?? {}).filter((t) => !themesHit.length || themesHit.includes(t.theme));
    const harvested = (tipsDoc?.approved ?? []).filter((t) => t.visibility !== 'private' && (!themesHit.length || themesHit.includes(t.theme))).slice(0, 12);
    report.sections.push({ id: 'tips', title: 'More tips on these themes',
      own: own.map((t) => ({ text: t.text, theme: themeById[t.theme]?.label ?? t.theme, source: t.source || '' })),
      harvested: harvested.map((t) => ({ text: t.text, theme: themeById[t.theme]?.label ?? t.theme, source: sourceLabel(t.source) })) });
  }

  if (want.has('help')) {
    report.sections.push({ id: 'help', title: 'How to read this report',
      steps: [
        'Each finding comes from a rule: what it looked for, how it was scored, and a tip in plain words. The score (0 to 1) ranks them; it is not a grade.',
        'Thresholds such as “few links” are set from your own data, so they mean few for you, not for some other organisation.',
        'A finding is a prompt for a conversation, not a verdict. The map or plan may simply be missing something.',
        'Pick two or three findings to act on. Dismiss the ones that don’t fit in Rhizome: they come back only if what they rest on changes.',
        'Run it again after you change the map or the plan, and compare with this report.',
      ],
      words: [
        ['Single point of failure', 'An actor whose loss would split its network.'],
        ['Hub', 'An actor in your top 10% for links.'],
        ['Betweenness', 'How often an actor sits on the shortest way between two others.'],
        ['One-way flow', 'Resources, information or power that flow one way, with nothing coming back.'],
        ['Zone gap', 'A part of a map’s lens with nobody in it, or zones that never link.'],
        ['Calibration', 'Cut-offs worked out from your own data (percentiles).'],
      ],
      next: [
        ['Ecosystem', 'Fix links and actors on the map.'], ['Plan', 'Give objectives work, people and measures.'],
        ['Assets', 'Add what the community already has.'], ['Rhizome → Rack', 'Build your own rules, then run them again.'],
      ],
    });
  }

  if (want.has('rules')) {
    const ruleIds = [...new Set(ids.flatMap((a) => analyses[a].rules))];
    report.sections.push({ id: 'rules', title: 'Appendix: the rules that ran',
      rules: ruleIds.map((id) => ruleOf(id)).filter(Boolean).map((r) => ({
        name: r.name, theme: themeById[r.theme]?.label ?? r.theme, own: !!r.own,
        looks: r.from.list ? r.from.list : `every ${typeLabel(r.from.type).toLowerCase()}`,
        when: r.when.length ? r.when.map((c) => `${c.field} ${OPS[c.op]?.label ?? c.op} ${c.pct ? `your ${c.pct}` : c.value ?? ''}`.trim()).join('; ') : 'everything in it',
        found: all.filter((f) => f.ruleId === r.id).length,
      })) });
  }

  report.meta.summaryLine = `${plural(all.length, 'finding')} from ${plural(ids.length, 'analysis', 'analyses')}${findings.length < all.length ? `, the top ${findings.length} shown` : ''}.`;
  return report;
}

/** The report as plain text (Markdown), for pasting into an email or a doc. */
export function reportToMarkdown(r) {
  const out = [`# ${r.meta.title}`, '', `${r.meta.org} · ${r.meta.date} · ${r.meta.summaryLine}`, ''];
  for (const s of r.sections) {
    out.push(`## ${s.title}`, '');
    if (s.id === 'summary') { out.push(s.stats.map((x) => `- ${x.value.toLocaleString()} ${x.label}`).join('\n'), ''); s.top.forEach((t, i) => out.push(`${i + 1}. **${t.title}**: ${t.text}`)); out.push(''); }
    if (s.id === 'findings') for (const g of s.groups) { out.push(`### ${g.label}`, ''); for (const f of g.items) { out.push(`**${f.title}** (score ${f.score})`, '', f.text, ''); if (f.read.length) out.push(`Read more: ${f.read.map((x) => `[${x.title}](${x.url})`).join(', ')}`, ''); } }
    if (s.id === 'data') { out.push('| Actor | Map | Links | Betweenness |', '|---|---|---|---|', ...s.actors.map((a) => `| ${a.name}${a.cut ? ' (single point)' : ''} | ${a.map} | ${a.links} | ${a.betweenness} |`), ''); }
    if (s.id === 'reading') out.push(...s.items.map((x) => `- [${x.title}](${x.url ?? ''}), ${x.author}${x.year ? ` (${x.year})` : ''}: ${x.idea}`), '');
    if (s.id === 'tips') out.push(...[...s.own, ...s.harvested].map((t) => `- ${t.text} (${t.theme})`), '');
    if (s.id === 'help') out.push(...s.steps.map((x) => `- ${x}`), '');
    if (s.id === 'rules') out.push(...s.rules.map((x) => `- **${x.name}** (${x.theme}): ${x.looks}; when ${x.when}; ${x.found} found`), '');
  }
  return out.join('\n');
}
