/**
 * Rhizome's helper docs (Rhizome stage 2). One source, two places: the Help
 * library carries this section (help.html#rhizome/<page>), and Rhizome's
 * About tab shows the same pages beside the work, so the quick reference and
 * the tutorials never drift apart. A platform admin's edits to the section
 * in Help reach the About tab too (it reads the help library as saved).
 */
export const RHIZOME_HELP_ID = 'rhizome';

export const RHIZOME_HELP = {
  id: RHIZOME_HELP_ID,
  title: 'Rhizome (experimental)',
  icon: 'sec-rhizome',
  blurb: 'A systems analysis toolbox: your maps, strategy, studio and assets as one set of facts, measured and read by rules that offer tips.',
  pages: [
    {
      id: 'rhizome-start',
      title: 'Switching Rhizome on',
      body: `Rhizome is off until your organisation switches it on. An admin turns it on in **Organisation → Plugins**, and chooses which roles can use it.

# The set-up checklist
Opening Rhizome for the first time shows a checklist. Each step can be run again later, from **Set-up**.

1. **Switch on.** Done when you open Rhizome with it switched on.
2. **Context profile.** Your sector, focus areas, who you serve, the words your field uses, and the themes that matter. It's filled in from what Dashi already knows, so you only need to check it. It decides which tips you see first.
3. **Read in your data.** Rhizome builds its facts from every plugin you use, works out the measures, and keeps a **baseline**, so later you can see what changed.
4. **Calibrate.** Thresholds are set from your own data. "Few links" means few *for you*: a small collective and a big foundation get different cut-offs.
5. **Pick tip packs and starter analyses.** Analyses that fit your profile are chosen for you. Change the choice in **Analyses**.
6. **First run.** The analyses run once, and the top findings show on **Home** as a welcome report.

[[shot:rhizome-setup]]

**Run set-up again** (on the Set-up page) starts from the top with a new baseline. Your profile is kept.`,
    },
    {
      id: 'rhizome-facts',
      title: 'Facts and measures',
      body: `# Facts
Rhizome reads your plugins into one shape: **things** (actors, people, assets, plans, objectives, SOAR cards, theory of change steps…) and **ties** between them (a link on a map, part of a plan, works on, feeds a goal, leads to). It only reads plugins you can open, and it never changes them.

Open **Facts** to see what came in from each plugin. Pick any thing to see everything about it, and every tie, both ways.

[[shot:rhizome-facts]]

# Measures
**Measures** works out numbers over the facts:

- **Links**: how many map links an actor has, either way.
- **Betweenness**: how often an actor sits on the shortest way between two others.
- **Single point of failure**: an actor whose loss splits its network.
- **Hub**: in the top 10% for links, for your organisation.
- **One-way flow**: resources, information or power that flow one way, with nothing coming back.
- **Zone gap**: a part of a map's lens with nobody in it, or two zones that never link.

The calibration table shows your own cut-offs.`,
    },
    {
      id: 'rhizome-analyses',
      title: 'Analyses, findings and Why?',
      body: `An **analysis** is a named set of rules, such as *Network health* or *Plan hygiene*. Open **Analyses** and pick one: its findings show straight away, ranked by score.

[[shot:rhizome-analyses]]

# A finding
Each finding has a tip in plain words, the things it's about (click one to see it in Facts), and three actions:

- **Why?** opens the rule behind it: what it looked at, each condition with the actual value, how the score was worked out, and where the tip comes from.
- **Dismiss** puts it away. It comes back only if what it rests on changes.
- **Show on map** opens the ecosystem map, for findings about actors.

# Your set
Tick analyses to add them to **your set**. **Run my set** runs them all and keeps the run, and the top findings show on Home.`,
    },
    {
      id: 'rhizome-rules',
      title: 'How a rule works',
      body: `Every rule has four parts:

- **When**: what it looks for, for example *an actor whose category is gatekeeper and whose links are at most your 25th percentile*.
- **Weigh**: a score from 0 to 1, from measures such as betweenness, so findings can be ranked. Rules in your profile's themes count a little more. On maps where links are marked *speculative*, those links count for what your profile says.
- **Say**: a tip from the tip library, filled in with names from what matched.
- **Show**: what to light up, on a map or as a list.

Rules are data, not code. The list at the bottom of **Analyses** shows every rule, and **View as data** shows exactly what Rhizome runs.

# Coming next
- **The rack** (stage 3): build your own analyses by cabling modules together, like a modular synth, with a Patchbay at the top.
- **The tip harvester**: fresh, reviewed tips from your own field.
- **The critical AI visualiser** (stage 4) and **the Claude engine** (stage 5).`,
    },
    {
      id: 'rhizome-glossary',
      title: 'Themes and sources',
      body: `Tips are filed under themes. Your context profile picks the ones that matter most to you.

- **Network weaving**: hubs, bridges, isolates and the ties between them (June Holley).
- **Leverage points**: where a small shift moves a whole system (Donella Meadows).
- **Water of systems change**: structural, relational and transformative conditions (FSG).
- **Asset-based community development**: start from what the community already has (Kretzmann and McKnight).
- **SOAR**: strengths, opportunities, aspirations, results.
- **Theory of change**: causal bets, assumptions and evidence.
- **Collective impact**: shared agendas, measures and backbone work.
- **Strategy hygiene**: an owner, a measure, a date and work behind every goal.
- **AI literacy**, **curriculum design**, **equity of access** and **program evaluation**, for education and STEM work.

Every tip names where its idea comes from. The tips are short summaries in our own words. Nothing is copied.`,
    },
  ],
};
