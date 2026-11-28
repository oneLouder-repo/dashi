/**
 * Mobilize's helper docs (stage 1): one source, two places, like EoViz and
 * Place. Help carries this section (help.html#mobilize/<page>) and
 * Mobilize's About tab shows the same pages.
 */
export const MOBILIZE_HELP_ID = 'mobilize';

export const MOBILIZE_HELP = {
  id: MOBILIZE_HELP_ID,
  title: 'Mobilize (experimental)',
  icon: 'sec-mobilize',
  blurb: 'Knowledge mobilization: hold what your organization learns as knowledge objects, share them, listen for what comes back, and feed it into the plan.',
  pages: [
    {
      id: 'mobilize-start',
      title: 'Mobilize, knowledge mobilization',
      body: `**Mobilize** is for moving what your organization learns to the people who can use it, and learning from what they do with it.

At its centre is the **knowledge object**: one thing worth sharing. It can be a finding, a practice, a lesson learned, a resource, or an open question you want to learn about with others.

- **The five questions.** Each object answers Lavis's five questions: *what* should be shared, *to whom*, *by whom*, *how*, and *with what effect*.
- **Outputs.** One object, many outputs: a brief, posts, an episode, a talk, a paper, a course module. Each is made in the plugin that already does that job.
- **Consent first.** Whose knowledge this is, and how far it may go. Community and Indigenous knowledge is shared only on its holders' terms.
- **The loop.** Make, share, listen, review, then go round again. Reviews record what you heard and what you change.

# Switching Mobilize on
Mobilize is off until your organization switches it on, in **Organization → Plugins**. It comes with the Organization plan and up.`,
    },
    {
      id: 'mobilize-objects',
      title: 'Knowledge objects and the readiness check',
      body: `A knowledge object holds:

- **Message**: the finding in one plain sentence, and a longer summary.
- **Audiences**: who needs it, and what each would do with it.
- **Messengers**: who should carry it to each audience. Often not the person who did the work.
- **Outputs**: what will be made from it, and in which plugin.
- **Hoped-for change**: what should change, and the lightest way to notice it.
- **Evidence**: library sources, the project it came from, and how strong it is (emerging, tested, established).
- **Plan links**: the objectives, goals and workplans it serves.
- **Consent**: open, partners, internal, or held by its holders.

# Ready to share
An object moves from **Draft** to **Ready to share** only when the readiness check passes. The check covers the five questions, the evidence, consent and an owner with a review date. Each check that fails says what is missing.

# Stages
Draft → Ready to share → Out in the world → Reviewed → Revised (and round again), or Retired. A retired object keeps its history.`,
    },
    {
      id: 'mobilize-loop',
      title: 'The loop: listening and reviews',
      body: `Mobilize follows the action research cycle: **plan, act, observe, reflect**. In Mobilize these are **Make, Share, Listen, Review**.

# Listen
Log what comes back to an object:
- **Counts**: views, plays, replies, completions.
- **Stories of use**: "What did you do differently after this?"
- **Pickups and citations**: a talk accepted, a policy that quotes the brief, a partner that reuses a module.
- **Decisions**: a decision that names the object.

# Review
On its review date, the owner looks back on what was heard and decides what changes. A review is one of two kinds:
- **Single loop**: change the next output (shorter, a different messenger, a new audience).
- **Double loop**: question the plan itself. The review carries a **proposed change to the plan**, and the **Loop** page lists every proposal for whoever looks after the plan.

# Signals
An object that is out shows a signal: **Heard back** (something came in the last 90 days), **Quiet** (nothing back yet) or **Needs a look** (its review is overdue).`,
    },
    {
      id: 'mobilize-consent',
      title: 'Consent, community knowledge and OCAP',
      body: `Every object says whose knowledge it is and how far it may go:

- **Open**: anyone. Public outputs are fine.
- **Partners**: named partners and members only.
- **Internal**: your own staff only.
- **Held by its holders**: shared only as and when the holders decide.

Knowledge from First Nations, Inuit and Métis communities follows the communities' own rules. Under OCAP (ownership, control, access, possession) the communities own the knowledge and decide about it. Mark such an object **OCAP**, or set it to **Held by its holders**. It then cannot become Ready to share until the holders' sign-off is recorded. Held objects never show in the asset library.

The same care applies to youth and family data: report it only in aggregate unless people have said yes to more.`,
    },
  ],
};
