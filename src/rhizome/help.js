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
      id: 'rhizome-how',
      title: 'How Rhizome thinks',
      body: `Rhizome answers questions about your work by following connections. This page explains what happens between the moment you open it and the moment a tip appears, how a question is built out of modules, what each module does, and where this sits next to modern AI.

# What is happening
1. **Reading.** Rhizome reads each plugin you can open and writes down what it finds as **things** and **ties**. An actor on your ecosystem map is a thing. The link between two actors is a tie. A plan, an objective under it, the measure on that objective and the person who owns it are things too, tied by *part of*, *measured by* and *owned by*.
2. **A graph.** All the things and ties together form a **graph**: dots and lines. This is the "fact layer". Nothing is guessed at this stage. Every fact points back to the plugin it came from.
3. **Measuring.** Network science gives numbers for each dot: how many ties it has, how often it sits between others, whether removing it would split the network. Rhizome works these out, then **calibrates** them: it finds your own 25th, 50th and 75th percentiles, so "few links" means few *for you*.
4. **Asking.** A rule (or a patch in the rack) is a question put to the graph. It picks some things, keeps the ones that meet conditions, scores them and says something about them.
5. **Answering.** Each answer is a **finding**: a tip from the tip library, with names filled in, a score from 0 to 1, and a trail that shows every step it passed.

Everything runs in your browser. The same facts and the same question always give the same answer.

# How a graph question is formed
In plain words, most questions about a network have the same shape:

*Which* things, *that* meet these conditions, *ranked by* what, *and so* what?

The rack builds that sentence out of modules, left to right:

- **Which things** is a source: **Facts** (every actor, every objective…) or **Measure** (a list worked out already, such as isolates or hubs).
- **That meet these conditions** is one or more **Filters**. Two streams can be joined with a **Gate**: AND, OR, NOT.
- **Ranked by** is **Weigh**: a starting score plus a share of a measure.
- **And so what** is **Say**: the tip that turns rows into words.

Here is one question built three ways.

**"Which of our partners are barely connected but sit between groups?"**

1. **Facts** set to *actor*.
2. **Filter**: links is at most your 25th percentile.
3. **Filter**: betweenness is at least your 75th percentile.
4. **Weigh**: start at 0.5, add 0.4 of betweenness.
5. **Say**: the *gatekeeper you barely touch* tip.

Read the patch out loud and it is the question: actors, with few links, that sit between others, ranked by how much they sit between, told as a gatekeeper tip.

**"Which objectives have no measure, or nobody on them?"**

1. **Facts** set to *objective*, cabled into two Filters.
2. One Filter: measures equals 0. The other: people on it equals 0.
3. A **Gate** set to OR joins them.
4. **Say**: the *objective with no measure* tip.

**"Who is one step away from our hubs but not tied to them yet?"**

1. **Measure** set to *hubs*.
2. **Neighbours**, one hop, taking the **ring** output (only the new things).
3. **Gate** set to NOT, with the hubs into B, so the hubs themselves drop out.
4. **Scope**, to see who is left.

# The modules, one by one

**Patchbay** (routing). A strip of jacks at the top. What goes in a jack comes out of the jack below it. Use it to send one source to several places, so a long cable doesn't cross the whole rack. *Example: Facts (actors) into jack 1, then jack 1 out to both a Filter and a Venn.*

**Facts** (source). Every thing of one type: actors, people, plans, objectives, assets, SOAR cards, theory of change steps. The orange tubes count the rows. *Example: Facts set to asset gives every asset in your library and on your plans.*

**Measure** (source). A list Rhizome already worked out: isolates, hubs, bridges, one-way flows, hollow objectives, unstaffed workplans, unused assets, untested theory of change links. *Example: Measure set to bridges gives the actors whose loss would split a network.*

**Filter** (shaper). Lets through the rows that meet one condition; the rest go out of **reject**, so you can follow both. A number can be compared with a fixed value or with your own percentile. *Example: links ≤ p25 keeps your least connected quarter. Cable the reject output to a second Say to say something about the others.*

**Weigh** (shaper). Gives each row a score: a base, plus a share of one measure. Scores rank the findings and decide what reaches Home. *Example: base 0.4, plus 0.5 of betweenness, puts the strongest brokers first.*

**Gate** (logic). Joins two streams. **AND** keeps what is in both, **OR** what is in either, **NOT** what is in A but not in B. *Example: hubs AND bridges gives the actors you lean on most.*

**Complement** (sets). Everything of the same type that is *not* coming in. *Example: actors on any plan, into Complement, gives the actors no plan mentions.*

**Neighbours** (graphs). Walks out along ties, one to three hops. **Ring** gives only the new things it reaches; **ball** gives those plus what came in. *Example: one funder, two hops, ring: who your funder's partners work with.*

**Triads** (graphs). Looks at each thing's pairs of neighbours. **Closed**: the neighbours know each other, a tight circle. **Open**: they don't, so the thing is a broker. *Example: actors through Triads, open output, gives the people holding separate groups together.*

**Prism** (graphs). Splits what comes in by community, the three biggest clusters to three outputs. *Example: actors through Prism, each output to a Spectrum, to compare how connected each cluster is.*

**Say** (voice). Turns rows into findings in the words of a tip. **Group** makes one finding for the whole set instead of one per row. *Example: the isolates tip, grouped: "Five actors have no links yet: …"*

**Scope** (display). A screen that shows what is flowing in, a line per row. **Read** opens every line in full in a tray, with search and Copy as text.

**Teleprinter** (display). Prints every answer in full on a paper roll: the finding, its score, the things it names, and the trail of checks it passed (✓ for a filter met, ⚖ for a weight added). **Tear off** opens the roll in a tray to read, search or copy.

**VU meter** (display). A needle for how many rows flow through, and their top score. It passes everything on, so it can sit in the middle of a chain.

**Plotter** (display). Draws what comes in as a little network on paper, with the ties between the rows.

**Spectrum** (display). Bars for one number across the rows, so you can see the spread at a glance. *Example: links across your actors shows whether a few hubs hold everything.*

**Venn** (display). Three circles and the counts in every overlap. Out gives what is in all the circles you patched.

**AI visualiser** (engine). A small, see-through inference engine. Ask it a question, or switch it to **Read the rack's statements** and it walks through how a language model would handle one of your findings: tokens, meaning, retrieval, attention, reasoning and answer. In statements mode the rack's own steps (Filter, Weigh, Say) show in the reasoning chain, so you can compare how the rule got there with how an AI would. It mocks the process; it doesn't call a model.

**Claude engine** (engine, stage 5). Will send a question and the relevant facts to Claude through the server, with your organisation's own key and cost caps, and bring findings back into the rack.

**Open slot** (engine). Room for another engine later. Every engine plugs in the same way: facts and a question in, findings out.

# Rack 2.0 and the neuro-symbolic tools
**Classic / Rack 2.0**, on the strip above the rack, switches between the twin 1950s racks and Rack 2.0. Both show the same patch, so you can flip back and forth any time. Your choice is remembered.

Rack 2.0 is one wide rack, built in rows. The side nav starts folded, to give the rack the room. Each kind of module wears a different late-90s look, as a real studio rack would: warm white samplers, slate blue sound modules, charcoal grooveboxes, graphite workstations, and pale grey drum machines for the neuro-symbolic tools. They all carry the Dashi badge. The tools sit in three panels you can drag, fold and dock, like Dashi's other editors:

- **Modules**: everything you can add to the rack.
- **Neuro-symbolic**: ask in plain words and **Translate to a patch**, or **Wire the loop after Say**, which adds a Narrator, a Verifier and a Teleprinter after your Say.
- **Inspector**: click a module's name to see its settings, what flows in and out, and, for a tool, the prompt it would send.

The neuro-symbolic tools are Claude tools. For now they are **mocked**: they run in your browser and send nothing. Each one has **Prompt**, to show exactly what it would send, and an estimate of the tokens and cost.

- **Translator** (words to rules): ask a question and it proposes a patch, shown step by step with how sure it is and any words it had no meaning for. The rack runs the proposal on your facts. **Unfold** puts the modules in the rack, cabled up, so you can check them and turn a knob before you trust it.
- **Concept lens** (words to rules): ranks what comes in by meaning, not by ties. Things whose words sit close to a concept, such as *food security*, go out of **near**. This stands in for the embeddings a language model would use.
- **Narrator** (rules to words): turns findings into a short summary for the board, the team or the public. Each sentence cites the findings it rests on, as [1], [2]. Turn **imagination** up and it starts to make things up, just as a real model can.
- **Verifier** (rules check words): checks each sentence against your facts. A name or tie the facts don't have sends it out of **flag**, with the reason. Put a Narrator into it, turn imagination up, and watch it catch the made-up partner.
- **Critic** (words check rules): reads the whole patch like a reviewer: a Say with no Weigh, a filter that lets nothing through, a gate with one input.

# Is this machine learning?
Not quite, and it's worth being plain about. Rhizome is **symbolic**: it works with named things, explicit ties and written rules, the way network analysts and expert systems do. The only part that learns from your data is **calibration**, which sets cut-offs from your own numbers. That is why every finding can show its Why?: nothing is hidden inside a model.

Modern AI, such as Claude, is **neural**: it learned patterns in language from a very large amount of text. It is very good at understanding a question as you would ask it, and at writing a clear answer. It is weaker at counting, at knowing what is in *your* data, and at showing exactly why it said what it said.

The two fit together well. Researchers call this **neuro-symbolic** AI, and one popular form is **GraphRAG**: retrieval from a knowledge graph to ground a language model.

# How Rhizome connects to modern AI
These are the ways we plan to bring them together, starting with the Claude engine:

1. **Question in, patch out.** You ask in plain words: *"Who should we introduce to the Harbour Trust?"* Claude turns it into a patch (Facts, Neighbours, Gate, Weigh, Say) and shows it in the rack before anything runs. You can read it, change a knob, then run it. The answer comes from your facts, not from the model's memory.
2. **Facts in, words out.** The rack does the counting and the rules. Claude gets only the findings and the facts behind them, and writes a summary for a board report or a conversation. Every sentence can link back to a finding and its trail, the same way the visualiser links its phrases.
3. **Checking each other.** The rack can check Claude: if an answer names an actor the facts don't have, or a tie that isn't there, the answer is flagged. Claude can check the rack: it can point out a tip that reads oddly for your context, or a rule whose wording doesn't fit your field.
4. **Tips that grow.** The tip harvester's review queue can use Claude to draft tips in plain words from trusted sources. A person still approves every one.

The **AI visualiser** is the bridge for now. Put your rack's statements into it and you can see, step by step, what an AI would do with them: which words it would understand, which facts it would reach for, where its attention would go, and where the critical lens says it could go wrong.`,
    },
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
