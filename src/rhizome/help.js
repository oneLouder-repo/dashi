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
7. **Context harvest** (optional). Picks a reading list from the tip harvester's sources that fits your themes. You'll find it in **Tips**.

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
- **Show on Place** opens the Place map, for findings about things that have a real-world location. It shows only if you can open Place.

Under each tip, **Read more** links to a source on its theme.

# Your set
Tick analyses to add them to **your set**. **Run my set** runs them all and keeps the run, and the top findings show on Home.`,
    },
    {
      id: 'rhizome-output',
      title: 'Your report pack',
      body: `Open **Report** for a report of everything Rhizome found, to print, save as a PDF, or share. It's the reason to run Rhizome at all: something to take to a team meeting or a board.

[[shot:rhizome-output]]

# What's in it
- **At a glance**: counts, change since your baseline, findings by theme, and three findings to start with.
- **Findings and tips**: grouped by theme, one block per rule. Each block has the tip in full, what it's about, why it was raised, where the idea comes from, and links to read more. Other findings from the same rule are listed under it.
- **The data behind it**: the most central actors, your calibration, assets by ABCD type, and the signals.
- **Reading list**: sources on the themes your findings touch, with links.
- **More tips**: your own tips, and approved ones from the tip library, on those themes.
- **How to read this report**: what the scores mean, the words it uses, and where to go next in Dashi.
- **Appendix**: every rule that ran, and what it found.

# Choosing what goes in
On the left, give it a title, pick where the findings come from (your set, one analysis, or your rules), how many to include, and which sections. Your choice is remembered. Findings you dismissed are left out.

# Saving it
**Save as PDF** opens your browser's print window: choose **Save as PDF** as the printer. Only the report prints, on A4, with page numbers. **Copy as text** copies it as plain text, ready for an email or a doc.`,
    },
    {
      id: 'rhizome-rules',
      title: 'How a rule works',
      body: `Every rule has four parts:

- **When**: what it looks for, for example *an actor whose category is gatekeeper and whose links are at most your 25th percentile*.
- **Weigh**: a score from 0 to 1, from measures such as betweenness, so findings can be ranked. Rules in your profile's themes count a little more. On maps where links are marked *speculative*, those links count for what your profile says.
- **Say**: a tip from the tip library, filled in with names from what matched.
- **Show**: what to light up, on a map or as a list.

Rules are data, not code. The list at the bottom of **Analyses** shows every rule, and **View as data** shows exactly what Rhizome runs. Open any rule in **the rack** to see it as modules and cables.

# Coming next
- **The Claude engine** (stage 5). Its module already sits in the rack, waiting.

# The AI visualiser
The **AI visualiser** fills a whole rack in rack B. Ask it a question about your facts and watch it work through six steps:

1. **Tokens**: the question splits into pieces, and filler words fade.
2. **Meaning**: each piece is matched to names, types, categories and measures it knows. Words it has no match for stay grey.
3. **Retrieval**: the matches light up on a little graph, and the glow spreads along ties, fading with each hop.
4. **Attention**: each fact gets a weight from closeness, links and word matches. Move the sliders and the answer changes, with the same facts.
5. **Reasoning**: the heaviest facts run past the measure rules, and each rule that fires is a step in the chain.
6. **Answer**: a short answer, with every phrase linked to the facts and rules behind it.

At each step the **critical lens** asks where it could go wrong: missing data, biased weights, words it doesn't know, and confident answers built on thin evidence. Play, pause, step back and forward, or pick a speed. Open it big in a tray to see more. It is a toy engine, not a real language model, so it can show every step.`,
    },
    {
      id: 'rhizome-rack',
      title: 'The rack',
      body: `The rack is where you build your own analyses, like patching a modular synth. It has two racks side by side, so you can turn a knob and watch the result at the same time:

- **Rack A** holds the controls: sources, shapers, logic and voice.
- **Rack B** holds the screens and the engines.

[[shot:rhizome-rack]]

# Modules
- **Patchbay**: the routing strip at the top. Whatever goes into a jack comes out of the jack below it, so one signal can feed many places.
- **Facts** and **Measure** are sources. Facts gives every thing of one type; Measure gives a list the measures worked out, such as isolates or hubs. The orange tubes count the rows.
- **Filter** lets through the rows that meet a condition. The rest go out of **reject**. A number can be compared with your own percentiles.
- **Weigh** gives each row a score from 0 to 1, so findings can be ranked.
- **Gate** joins two streams: AND (in both), OR (in either), NOT (in A but not B).
- **Say** turns rows into findings, in the words of a tip.
- **Scope** is a screen that shows what's flowing in. **VU meter** shows how much, and the top score.
- **AI visualiser**, **Claude engine** and **the open slot** are the engines. They arrive in stages 4 and 5, and you can already patch into them.

# Patching
- **Patch a cable:** drag from a jack to a jack, an output to an input. An output can feed many inputs; an input takes one cable.
- **Pull a cable out:** click it.
- **Turn a knob:** drag it up or down, or use the arrow keys. Clicking a knob with a list steps to the next choice.
- **Move a module:** hover over it for move, swap rack and remove.

# From patch to rule
A straight chain from a source, through filters and Weigh, into Say is a rule. **Add to analyses** keeps it as one of **your rules**, and it runs in Analyses beside the built-in ones. **Open a rule…** opens any built-in rule in the rack, ready to change. A patch with a Gate stays a patch for now. Each patch is **public** unless you switch it to private.`,
    },
    {
      id: 'rhizome-tips',
      title: 'Tips and the tip harvester',
      body: `Open **Tips** to see every tip Rhizome can give, by theme.

- **Library**: the built-in tip pack, tips the harvester brought in that a reviewer approved, and your own.
- **Reading list**: sources on your themes, each with a link and its key idea.
- **Your tips**: things your organisation has learned. Each one is **public** unless you switch it to private. Public tips will be offered to the shared library when it opens. A refresh never touches your own tips.

# The tip harvester
The harvester keeps the collection fresh. It works from a list of trusted sources, each filed under a theme, and it can be run again any time:

1. **Discover**: pick the sources (all of them, one theme, or one source).
2. **Fetch** (online runs only): read each page politely. It follows the site's robots.txt, pauses between requests, and never reads past a size limit.
3. **Extract and score**: keep whole sentences that sound like advice on the theme.
4. **Dedupe**: drop anything too close to a tip already in the library, already in the queue, or rejected before.
5. **Review**: everything waits in the **review queue** until a platform admin approves it or rejects it.

An offline run uses the key ideas written down for each source, so it needs no network at all. An online run also offers short **excerpts** from the pages. An excerpt can't be approved until it's rewritten in your own words.

[[shot:rhizome-tips]]

On the server, \`npm run tips:refresh\` runs it offline, and \`npm run tips:refresh -- --online\` fetches the pages too. **Distil from the registry**, in the review queue, does an offline run from the browser.`,
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
- **Place-based development**: change led by and for one place, from its own people and assets (Tamarack Institute).
- **AI literacy**, **curriculum design**, **equity of access** and **program evaluation**, for education and STEM work.

Every tip names where its idea comes from. The tips are short summaries in our own words. Nothing is copied.`,
    },
  ],
};
