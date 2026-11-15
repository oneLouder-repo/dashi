import { applyCollectionOp } from '../core/collections.js';
import { strategyOps } from './strategy.js';

/**
 * Example strategy for the example org (staff and team ids match org.js).
 * A master plan holding a dated Year 1 plan (three objectives, goals,
 * workplans and thirty-odd tasks around November 2026, some workplans
 * already finished) and a Year 2 plan that is still ahead. Plans and goals
 * carry milestones for the roadmap.
 */
const T = (title, start, end, status, assigneeIds, events = [], assets = []) => ({ type: 'task', title, start, end, status, assigneeIds, events, assets });
const asset = (id, kind, label, more = {}) => ({ id, kind, label, ...more });

const TREE = {
  type: 'framework',
  title: 'Strategic framework',
  mission: 'Every young person in Canada can see themselves in STEM.',
  vision: 'A national STEM ecosystem that bends to serve youth, especially those furthest from opportunity.',
  values: 'Equity · Curiosity · Reciprocity · Learning in public',
  notes: 'Built on the ecosystem mapping sessions (Micro / Meso / Macro).',
  children: [
    {
      type: 'plan',
      title: 'Strategic Plan 2026–2030: From pipelines to systems',
      start: '2026-04-01',
      end: '2030-03-31',
      theme: 'Systems change',
      children: [
        {
          type: 'plan',
          title: 'Year 1 plan: Foundations',
          start: '2026-04-01',
          end: '2027-03-31',
          theme: 'Foundations',
          milestones: [
            { id: 'ms-y1-board', date: '2026-06-18', title: 'Board approves the Year 1 plan' },
            { id: 'ms-y1-midyear', date: '2026-10-08', title: 'Mid-year check-in with funders' },
            { id: 'ms-y1-review', date: '2027-03-12', title: 'Year 1 learning review' },
          ],
          children: [
            {
              type: 'objective',
              id: 'obj-equity',
              title: 'Deepen equity and inclusion in every program',
              measures: [
                { id: 'm-reach', name: 'Youth reached', target: '500000', unit: 'youth / yr' },
                { id: 'm-equity', name: 'Youth from equity-deserving groups', target: '60', unit: '%' },
              ],
              children: [
                {
                  type: 'goal',
                  title: 'Instructors are trained in culturally responsive practice',
                  measures: [{ id: 'm-trained', name: 'Instructors trained in culturally responsive practice', target: '1000', unit: 'people' }],
                  milestones: [{ id: 'ms-g-pilot', date: '2027-01-06', title: 'New modules go to pilot' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Training needs scan',
                      start: '2026-04-15',
                      end: '2026-07-31',
                      staffIds: ['s-train', 's-eval'],
                      teamIds: ['t-prog'],
                      children: [
                        T('Survey instructors on training needs', '2026-04-15', '2026-05-31', 'done', ['s-train', 's-eval']),
                        T('Focus groups in three regions', '2026-05-15', '2026-06-30', 'done', ['s-train']),
                        T('Needs scan summary', '2026-07-01', '2026-07-31', 'done', ['s-eval']),
                      ],
                    },
                    {
                      type: 'workplan',
                      title: 'Instructor training refresh',
                      start: '2026-09-01',
                      end: '2027-02-28',
                      staffIds: ['s-train', 's-prog', 's-indig'],
                      teamIds: ['t-prog'],
                      children: [
                        T('Review current training modules', '2026-09-01', '2026-09-30', 'done', ['s-train'], [
                          { id: 'e1', date: '2026-09-01', kind: 'status', text: 'active' },
                          { id: 'e2', date: '2026-09-18', kind: 'note', text: 'Gaps found in land-based learning content' },
                          { id: 'e3', date: '2026-09-29', kind: 'status', text: 'done' },
                        ]),
                        T('Co-design sessions with Indigenous partners', '2026-10-01', '2026-11-30', 'active', ['s-indig', 's-train'], [
                          { id: 'e4', date: '2026-10-01', kind: 'status', text: 'active' },
                          { id: 'e5', date: '2026-10-15', kind: 'milestone', text: 'First session held in Treaty 6' },
                        ], [
                          asset('as1', 'actor', 'Indigenous communities', { mapId: 'map-ecosystem', ref: 'actor-indig-comm' }),
                          asset('as2', 'actor', 'Indigenous governments & organisations', { mapId: 'map-ecosystem', ref: 'actor-indig-gov' }),
                          asset('as3', 'staff', 'Tanis Cardinal', { ref: 's-indig' }),
                          asset('as4', 'literature', 'Battiste, M. (2013). Decolonizing Education: Nourishing the Learning Spirit. Purich.', { year: '2013' }),
                          asset('as5', 'person', 'Elder advisor (name withheld)', { detail: 'Treaty 6 knowledge keeper' }),
                        ]),
                        T('Draft new modules', '2026-11-01', '2026-12-20', 'planned', ['s-train']),
                        T('Pilot with three network members', '2027-01-06', '2027-02-14', 'planned', ['s-train', 's-pc1', 's-pc2']),
                        T('Evaluate pilot and revise', '2027-02-01', '2027-02-28', 'planned', ['s-eval', 's-train']),
                      ],
                    },
                  ],
                },
                {
                  type: 'goal',
                  title: 'Programs reach more girls and gender-diverse youth',
                  measures: [{ id: 'm-girls', name: 'Girls & gender-diverse participants', target: '50', unit: '%' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Spring pilot clubs',
                      start: '2026-04-01',
                      end: '2026-08-15',
                      staffIds: ['s-pc1', 's-pc2'],
                      teamIds: ['t-prog'],
                      children: [
                        T('Recruit pilot sites', '2026-04-01', '2026-05-15', 'done', ['s-pc1']),
                        T('Run six pilot clubs', '2026-05-15', '2026-07-31', 'done', ['s-pc1', 's-pc2']),
                        T('Pilot participant survey', '2026-07-15', '2026-08-15', 'active', ['s-pc2', 's-data']),
                      ],
                    },
                    {
                      type: 'workplan',
                      title: 'Girls in STEM outreach',
                      start: '2026-09-15',
                      end: '2027-03-31',
                      staffIds: ['s-pc1', 's-pc2', 's-comms'],
                      teamIds: ['t-prog', 't-part'],
                      children: [
                        T('Map current reach by region', '2026-09-15', '2026-10-15', 'done', ['s-data']),
                        T('Recruit role models and mentors', '2026-10-01', '2026-12-15', 'active', ['s-pc1', 's-pc2']),
                        T('Launch winter club series', '2027-01-10', '2027-03-20', 'planned', ['s-pc1', 's-pc2']),
                        T('Story campaign with participants', '2026-11-15', '2027-02-15', 'blocked', ['s-comms'], [
                          { id: 'e6', date: '2026-11-15', kind: 'status', text: 'active' },
                          { id: 'e7', date: '2026-10-20', kind: 'note', text: 'Waiting on consent process update' },
                        ]),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'objective',
              id: 'obj-ecosystem',
              title: 'Strengthen the ecosystem we steward',
              measures: [{ id: 'm-partners', name: 'Active partnerships', target: '120', unit: 'orgs' }],
              children: [
                {
                  type: 'goal',
                  title: 'Map and tend our change ecosystem',
                  measures: [{ id: 'm-checkins', name: 'Partner check-ins completed', target: '80', unit: 'conversations' }],
                  milestones: [{ id: 'ms-g-map', date: '2026-10-10', title: 'Ecosystem map shared with staff' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Partner survey',
                      start: '2026-05-01',
                      end: '2026-07-15',
                      staffIds: ['s-part', 's-data'],
                      teamIds: ['t-part'],
                      children: [
                        T('Design the partner survey', '2026-05-01', '2026-05-31', 'done', ['s-part', 's-data']),
                        T('Field the survey', '2026-06-01', '2026-07-15', 'done', ['s-part']),
                      ],
                    },
                    {
                      type: 'workplan',
                      title: 'Ecosystem mapping and partner check-ins',
                      start: '2026-08-15',
                      end: '2027-01-31',
                      staffIds: ['s-ed', 's-part', 's-indig'],
                      teamIds: ['t-lead', 't-part'],
                      children: [
                        T('Ecosystem mapping workshop', '2026-08-15', '2026-08-30', 'done', ['s-ed', 's-eval']),
                        T('Publish ecosystem map internally', '2026-09-01', '2026-10-10', 'done', ['s-eval']),
                        T('Partner check-in conversations', '2026-10-01', '2026-12-31', 'active', ['s-part', 's-indig'], [], [
                          asset('as6', 'actor', 'University & college partners', { mapId: 'map-ecosystem', ref: 'actor-universities' }),
                          asset('as7', 'actor', 'Community organisations', { mapId: 'map-ecosystem', ref: 'actor-community-orgs' }),
                          asset('as8', 'actor', 'Industry volunteers & mentors', { mapId: 'map-ecosystem', ref: 'actor-mentors' }),
                          asset('as9', 'document', 'Partner check-in guide.pdf', { detail: 'PDF · 3 KB', url: 'media/docs/partner-check-in-guide.pdf' }),
                        ]),
                        T('Refresh map with partner feedback', '2027-01-05', '2027-01-31', 'planned', ['s-eval', 's-part']),
                      ],
                    },
                  ],
                },
                {
                  type: 'goal',
                  title: 'Advocate for STEM equity in federal policy',
                  measures: [{ id: 'm-meetings', name: 'Policy meetings held', target: '40', unit: 'meetings' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Pre-budget advocacy',
                      start: '2026-07-01',
                      end: '2027-02-28',
                      staffIds: ['s-ed', 's-part', 's-comms'],
                      teamIds: ['t-lead'],
                      children: [
                        T('Pre-budget submission', '2026-07-01', '2026-08-01', 'done', ['s-ed', 's-part']),
                        T('Hill meetings', '2026-10-20', '2026-11-30', 'active', ['s-ed']),
                        T('Policy brief on systems change', '2026-11-01', '2027-01-15', 'planned', ['s-eval', 's-comms'], [], [
                          asset('as10', 'literature', 'Meadows, D. (1999). Leverage Points: Places to Intervene in a System. Sustainability Institute.', { year: '1999' }),
                          asset('as11', 'literature', 'Kania, J., Kramer, M., & Senge, P. (2018). The Water of Systems Change. FSG.', { year: '2018', url: 'https://www.fsg.org/resource/water_of_systems_change/' }),
                          asset('as12', 'link', 'Pipelines to Systems discussion paper', { url: 'https://actua.ca/wp-content/uploads/2026/07/Science-Report-Pipelines-to-Systems-Actua.pdf' }),
                          asset('as13', 'actor', 'National STEM policy network', { mapId: 'map-ecosystem', ref: 'actor-policy-net' }),
                        ]),
                        T('Coalition sign-on letter', '2027-01-15', '2027-02-28', 'planned', ['s-part']),
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'objective',
              id: 'obj-learn',
              title: 'Learn in public with shared data',
              measures: [{ id: 'm-views', name: 'Public dashboard views', target: '600', unit: 'views / month' }],
              children: [
                {
                  type: 'goal',
                  title: 'One MEL framework across all programs',
                  measures: [{ id: 'm-reporting', name: 'Programs reporting core indicators', target: '100', unit: '%' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Youth data advisory circle',
                      start: '2026-06-15',
                      end: '2026-10-31',
                      staffIds: ['s-eval', 's-indig'],
                      teamIds: ['t-mel'],
                      children: [
                        T('Invite youth advisors', '2026-06-15', '2026-08-31', 'blocked', ['s-eval'], [
                          { id: 'e8', date: '2026-08-20', kind: 'note', text: 'Honoraria policy needs board sign-off first' },
                        ]),
                        T('First advisory circle', '2026-09-15', '2026-10-31', 'planned', ['s-eval', 's-indig']),
                      ],
                    },
                    {
                      type: 'workplan',
                      title: 'MEL framework and dashboards',
                      start: '2026-06-01',
                      end: '2027-03-31',
                      staffIds: ['s-eval', 's-data', 's-ops'],
                      teamIds: ['t-mel'],
                      children: [
                        T('Agree core indicators', '2026-06-01', '2026-07-15', 'done', ['s-eval']),
                        T('Data sharing agreements', '2026-07-15', '2026-10-31', 'active', ['s-ops', 's-indig']),
                        T('Build internal dashboard', '2026-09-01', '2026-12-15', 'active', ['s-data'], [], [
                          asset('as14', 'media', 'Dashboard walkthrough (video)', { url: 'https://example.org/media/walkthrough.mp4', detail: 'Video' }),
                        ]),
                        T('Public impact dashboard', '2027-01-05', '2027-03-15', 'planned', ['s-data', 's-comms']),
                        T('Annual learning review', '2027-03-01', '2027-03-31', 'planned', ['s-eval', 's-ed']),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'plan',
          title: 'Year 2 plan: Growth',
          start: '2027-04-01',
          end: '2028-03-31',
          theme: 'Growth',
          milestones: [{ id: 'ms-y2-midplan', date: '2028-03-20', title: 'Mid-plan review with the network' }],
          children: [
            {
              type: 'objective',
              id: 'obj-scale',
              title: 'Grow what works, with partners',
              measures: [{ id: 'm-sites', name: 'Community sites running the new model', target: '40', unit: 'sites' }],
              children: [
                {
                  type: 'goal',
                  title: 'New training reaches every member',
                  measures: [{ id: 'm-members', name: 'Members using the new modules', target: '100', unit: '%' }],
                  children: [
                    {
                      type: 'workplan',
                      title: 'National training roll-out',
                      start: '2027-04-01',
                      end: '2027-12-15',
                      staffIds: ['s-train', 's-prog'],
                      teamIds: ['t-prog'],
                      children: [
                        T('Train-the-trainer cohort', '2027-04-15', '2027-06-30', 'planned', ['s-train']),
                        T('Regional roll-out', '2027-07-01', '2027-12-15', 'planned', ['s-train', 's-pc1', 's-pc2']),
                      ],
                    },
                  ],
                },
                {
                  type: 'goal',
                  title: 'Community sites co-run clubs',
                  measures: [],
                  children: [
                    {
                      type: 'workplan',
                      title: 'Community co-delivery pilots',
                      start: '2027-05-01',
                      end: '2028-02-28',
                      staffIds: ['s-part', 's-indig'],
                      teamIds: ['t-part'],
                      children: [
                        T('Choose pilot communities', '2027-05-01', '2027-07-31', 'planned', ['s-part', 's-indig']),
                        T('Co-delivery agreements', '2027-08-01', '2027-10-31', 'planned', ['s-ops', 's-part']),
                        T('Clubs run with community leads', '2027-11-01', '2028-02-28', 'planned', ['s-indig']),
                      ],
                    },
                    {
                      type: 'workplan',
                      title: 'Open dashboard for partners',
                      start: '2027-06-01',
                      end: '2027-11-30',
                      staffIds: ['s-data'],
                      teamIds: ['t-mel'],
                      children: [
                        T('Partner data views', '2027-06-01', '2027-11-30', 'planned', ['s-data']),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export function seedStrategy(tree = TREE, id = 'strategy-example') {
  const doc = { id, nodes: {} };
  const add = (spec, parentId = null) => {
    const { children = [], ...data } = spec;
    const op = strategyOps.addNode(doc, { ...data, parentId });
    applyCollectionOp(doc, op);
    for (const child of children) add(child, op.id);
  };
  add(tree);
  return doc;
}

/** The smaller second example org. */
export const seedRiverbendStrategy = () => seedStrategy({
  type: 'framework',
  title: 'Riverbend framework',
  mission: 'Good food, grown and shared by our neighbours.',
  vision: 'A neighbourhood where nobody eats alone or goes without.',
  values: 'Dignity · Neighbourliness · Growing together',
  children: [{
    type: 'plan', title: 'Plan 2026–2027', start: '2026-04-01', end: '2027-03-31', theme: 'Growing the hub',
    children: [{
      type: 'objective', id: 'obj-meals', title: 'Share more good meals',
      measures: [{ id: 'm-meals', name: 'Meals shared', target: '4000', unit: 'meals / month' }],
      children: [{
        type: 'goal', title: 'Good food boxes reach every block',
        measures: [{ id: 'm-boxes', name: 'Good food boxes delivered', target: '300', unit: 'boxes / month' }],
        children: [{
          type: 'workplan', title: 'Box delivery routes', start: '2026-09-01', end: '2027-01-31', staffIds: ['r-vol'], teamIds: ['t-hub'],
          children: [
            T('Recruit block captains', '2026-09-01', '2026-10-15', 'done', ['r-vol']),
            T('Map routes with block captains', '2026-10-01', '2026-11-15', 'active', ['r-vol', 'r-lead']),
            T('Winter delivery plan', '2026-11-15', '2027-01-15', 'planned', ['r-kitchen']),
          ],
        }],
      }],
    }],
  }],
}, 'strategy-riverbend');

/** A new org starts with just a framework. */
export const blankStrategy = (orgName = 'Our') => seedStrategy({ type: 'framework', title: `${orgName} framework` }, 'strategy');
