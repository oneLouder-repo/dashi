/**
 * The example STEM org's library: the documents a board portal needs.
 * Governance guides, a minutes archive and finance summaries, all Dashi
 * docs (Markdown in `body`) tagged `board` plus a kind: `governance`,
 * `minutes` or `finance`. The board site (site.html?site=site-board) reads
 * these tags; staff manage them in the Library like any other document.
 */
import { blankLibrary, blankMeta, migrateLibrary } from './library.js';

const ORG = 'Example STEM Outreach Network';
const doc = (id, title, issued, tags, body, { folderId = null, author = 'Grace Chen', type = 'document', createdBy = 's-fin', abstract = '' } = {}) => ({
  id, kind: 'doc', folderId, tags, body, createdBy, createdAt: Date.parse(`${issued}T15:00:00Z`), updatedAt: Date.parse(`${issued}T15:00:00Z`),
  meta: blankMeta({ type, title, creators: [{ role: 'author', literal: author }], issued, publisher: ORG, abstract, keywords: tags }),
});

const minutes = (id, date, present, items, decisions) => doc(id, `Board meeting minutes, ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`, date, ['board', 'minutes'],
  `**Present:** ${present}

**Regrets:** none recorded.

## Items

${items.map((it, i) => `${i + 1}. ${it}`).join('\n')}

## Decisions

${decisions.map((d) => `- ${d}`).join('\n')}

## Next meeting

Set by the Chair; the secretary circulates the date and the pack two weeks before.

_Approved as a true record at the following meeting._`, { author: 'Board secretary', createdBy: 's-ed', abstract: items[0] });

export function seedLibrary() {
  const lib = blankLibrary();
  lib.folders['folder-board'] = { id: 'folder-board', name: 'Board', parentId: null };
  lib.folders['folder-gov'] = { id: 'folder-gov', name: 'Governance', parentId: 'folder-board' };
  lib.folders['folder-minutes'] = { id: 'folder-minutes', name: 'Minutes', parentId: 'folder-board' };
  lib.folders['folder-finance'] = { id: 'folder-finance', name: 'Finance', parentId: 'folder-board' };
  const items = [
    doc('lib-bylaws', 'By-laws', '2024-06-12', ['board', 'governance'],
      `These by-laws set out how the Network is governed, under the Canada Not-for-profit Corporations Act.

## 1. Members

Member organisations are university and college outreach programs that sign the membership agreement and pay the annual fee. Each member has one vote at the annual general meeting.

## 2. The board

- Between nine and thirteen directors, elected by the members for three-year terms, renewable once.
- At least one director from each region, and at least two directors who identify as Indigenous.
- The board meets at least four times a year. Half the directors make a quorum.

## 3. Officers

The board elects a Chair, a Vice-Chair, a Secretary and a Treasurer from among the directors each year after the annual general meeting.

## 4. Committees

Standing committees: Finance and Audit, Governance and Nominations, and Equity and Programs. Each has terms of reference approved by the board.

## 5. Conflicts of interest

A director with an interest in a matter before the board declares it, is recorded in the minutes, and does not vote. See the conflict of interest policy.

## 6. Amendments

Members may amend these by-laws by a two-thirds vote at a general meeting, with thirty days' notice.`, { author: 'Governance and Nominations Committee', type: 'legislation', createdBy: 's-ed', abstract: 'How the Network is governed: members, the board, officers, committees and conflicts of interest.' }),
    doc('lib-handbook', 'Board handbook', '2026-04-20', ['board', 'governance'],
      `Welcome to the board. This handbook gathers what a director needs in the first year.

## What the board does

The board governs; staff manage. The board sets direction through the strategic plan, hires and supports the Executive Director, approves the budget, watches the risks, and reports to the members.

## The year at a glance

- **June:** annual general meeting, elections, audited statements.
- **September:** strategic review against the roadmap.
- **December:** budget for the next year.
- **March:** Executive Director review and board self-assessment.

## Before each meeting

Read the pack: the dashboard, the finance summary, and the papers marked for decision. Questions ahead of time go to the Chair or the Executive Director.

## Where things are

- Minutes, policies and finance summaries live on this board portal.
- Progress on the strategic plan is live on the dashboard and the roadmap.
- The staff team's public reporting is on the public website and the impact dashboard.

## Expectations

Attend meetings, prepare, declare conflicts, keep confidences, speak with one voice once a decision is made, and bring your networks to the work.`, { author: 'Amara Okafor', createdBy: 's-ed', abstract: 'What a director needs in their first year: the board’s role, the annual cycle, and where things are.' }),
    doc('lib-coi', 'Conflict of interest policy', '2024-06-12', ['board', 'governance'],
      `## Purpose

Directors, officers and staff act in the interests of the Network, not their own or their employer's.

## Declaring

Every director completes a declaration each year and updates it when anything changes. At a meeting, a director declares any interest in an item before it is discussed.

## What happens next

The declaration is minuted. The director leaves the room for the discussion and the vote, unless the board decides the interest is immaterial.

## Member institutions

Most directors work for member institutions. Working for a member is not by itself a conflict; a decision that benefits one member over others is.

## Gifts and hospitality

Nothing above a modest value from a supplier, a funder or a partner, and everything above it is declared to the Secretary.`, { author: 'Governance and Nominations Committee', type: 'legislation', createdBy: 's-ed', abstract: 'How directors declare and manage conflicts of interest.' }),
    doc('lib-committees', 'Committee terms of reference', '2025-09-18', ['board', 'governance'],
      `## Finance and Audit

Reviews the quarterly finance summary, the annual budget, the audit and the reserves policy. Meets quarterly. Chaired by the Treasurer.

## Governance and Nominations

Keeps the by-laws and policies current, runs the board's self-assessment, and recruits directors with the skills and the regional and community representation the board needs. Meets three times a year.

## Equity and Programs

Advises on program direction, reviews the equity measures on the dashboard, and hears from the Youth data advisory circle twice a year. Meets quarterly.

Each committee reports in writing to the next board meeting.`, { author: 'Governance and Nominations Committee', createdBy: 's-ed', abstract: 'What each standing committee does and how often it meets.' }),
    doc('lib-reserves', 'Reserves and investment policy', '2025-12-04', ['board', 'governance', 'finance'],
      `The Network keeps an operating reserve of between three and six months of core costs.

- Reserves are held in insured deposits and short-term government bonds.
- Drawing on reserves below three months needs a board decision and a plan to rebuild them within two years.
- The Treasurer reports the reserve position in every quarterly finance summary.`, { author: 'Finance and Audit Committee', type: 'legislation', abstract: 'How much the Network keeps in reserve and where it is held.' }),
    doc('lib-fin-2026q2', 'Finance summary, Q2 2026 (July to September)', '2026-10-20', ['board', 'finance'],
      `## Headlines

- Revenue to date **$6.9M** against a budget of $6.8M (101%).
- Spending to date **$6.2M** against $6.5M (95%): instructor training started later than planned.
- Operating reserve: **4.1 months** of core costs.

## Revenue

| Source | Budget | To date |
| --- | --- | --- |
| Federal grants | $4.2M | $4.3M |
| Provincial and foundation grants | $1.8M | $1.7M |
| Member fees | $0.6M | $0.6M |
| Donations and other | $0.2M | $0.3M |

## Watch list

- The federal agreement renews in March 2027; the pre-budget advocacy workplan is on the roadmap.
- Training spending will catch up in Q3 as the refreshed instructor training runs.`, { abstract: 'Revenue, spending and reserves for the second quarter of the 2026 fiscal year.' }),
    doc('lib-fin-2026q1', 'Finance summary, Q1 2026 (April to June)', '2026-07-21', ['board', 'finance'],
      `## Headlines

- Revenue to date **$3.3M** against a budget of $3.4M (97%).
- Spending to date **$3.0M** against $3.2M (94%).
- Operating reserve: **4.0 months** of core costs.

## Notes

Member fees came in on time from 41 of 43 members. The spring pilot clubs cost less than planned because two sites shared a coordinator.`, { abstract: 'Revenue, spending and reserves for the first quarter of the 2026 fiscal year.' }),
    minutes('lib-min-2026-09', '2026-09-17', 'Eleven directors, the Executive Director, the Director of Operations (minutes).',
      ['Strategic review against the roadmap: four workplans passed, two behind. The Youth data advisory circle has not started; staff will restart it with a new partner in January.',
        'Finance summary Q1 2026 received.', 'Equity and Programs Committee report: the equity measure passed 50% for the first time.', 'Federal renewal: advocacy plan approved.'],
      ['The strategic review was received.', 'The advocacy plan for the federal renewal was approved.', 'The Chair will write to the three members whose fees are outstanding.']),
    minutes('lib-min-2026-06', '2026-06-18', 'Twelve directors, the Executive Director, the Director of Operations (minutes), the auditor for item 2.',
      ['Annual general meeting business: audited statements for 2025–26 presented by the auditor.', 'Year 1 plan: Foundations, approved for board sign-off with two amendments to the training goal.', 'Election of officers.', 'Board self-assessment results.'],
      ['The audited statements were approved and will go to the members.', 'The Year 1 plan was approved.', 'Officers were re-elected for one year.']),
    minutes('lib-min-2026-03', '2026-03-19', 'Ten directors, the Executive Director, the Director of Operations (minutes).',
      ['Executive Director review (in camera).', 'Draft Year 1 plan presented by staff; discussion of the ecosystem goal.', 'Spring pilot clubs: progress and early numbers.', 'Reserves policy: first report under the new policy.'],
      ['The Executive Director review was completed.', 'Staff will bring the Year 1 plan back in June with the board’s comments on the ecosystem goal.']),
    minutes('lib-min-2025-12', '2025-12-04', 'Eleven directors, the Executive Director, the Director of Operations (minutes).',
      ['Budget 2026–27 presented by the Treasurer.', 'Reserves and investment policy for approval.', 'Strategic Plan 2026–2030 launch: communications plan.', 'Committee reports.'],
      ['The budget for 2026–27 was approved.', 'The reserves and investment policy was approved.']),
    minutes('lib-min-2025-09', '2025-09-18', 'Twelve directors, the Executive Director, the Director of Operations (minutes).',
      ['Strategic Plan 2026–2030: From pipelines to systems, final draft for approval.', 'Committee terms of reference for approval.', 'Finance summary Q1 2025.'],
      ['The Strategic Plan 2026–2030 was approved.', 'The committee terms of reference were approved.']),
    minutes('lib-min-2025-06', '2025-06-19', 'Eleven directors, the Executive Director, the Director of Operations (minutes).',
      ['Annual general meeting business and audited statements for 2024–25.', 'Strategic planning: results of the member consultation.', 'Election of officers.'],
      ['The audited statements were approved.', 'Staff will draft the 2026–2030 plan for September.']),
  ];
  lib.boardDocs = true;
  for (const it of items) {
    it.folderId = it.tags.includes('minutes') ? 'folder-minutes' : it.tags.includes('governance') ? 'folder-gov' : 'folder-finance';
    lib.items[it.id] = it;
  }
  return migrateLibrary(lib);
}

/**
 * Older copies of the STEM example have a library without the board's
 * documents: add the ones that are missing, once. Returns true if it changed.
 */
export function addBoardDocs(lib, orgId) {
  if (orgId !== 'org-example' || lib.boardDocs) return false;
  const seed = seedLibrary();
  for (const [id, f] of Object.entries(seed.folders)) lib.folders[id] ??= f;
  for (const [id, it] of Object.entries(seed.items)) lib.items[id] ??= it;
  lib.boardDocs = true;
  return true;
}
