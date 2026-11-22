/**
 * The built-in help library: sections, each with pages written in the same
 * light markdown as site pages. The platform admin can edit it in Help;
 * their copy is kept on the server (or in this browser, locally) and
 * replaces this one. Shortcodes for diagrams:
 *
 *   [[diagram:lenses]]       how the five systems lenses line up
 *   [[diagram:lens-table]]   the same, as a table by micro / meso / macro
 *   [[diagram:data-model]]   the documents of an org and how they connect
 *   [[diagram:plugins]]      a card for each plugin
 *
 * and for screenshots, [[shot:<id>]]: media/help/<id>.jpg with the caption in HELP_SHOTS.
 */

import { RHIZOME_HELP } from '../rhizome/help.js';
import { PLACE_HELP } from '../place/help.js';

/** The screenshots tutorials can show, by id, with their captions. Files are in media/help/. */
export const HELP_SHOTS = {
  'access-closed': 'Opening a plugin you can’t use says why, and where to ask.',
  'plugins-tree': 'Organisation → Plugins: sub-plugins sit under their parent and only work when it does.',
  'access-one-person': 'Open a plugin to set it off (or on) for one person, whatever their role.',
  'domain-check': 'Organisation → Domain checks a new address as you type.',
  'portal-data': 'The Data Workbench now lives in the Public Portal, under Data.',
  'studio-in-strategy': 'The Planning Studio now lives inside Strategy & Work.',
  'library-in-assets': 'The Library now lives inside Assets.',
  'palette-builder': 'The palette builder: pick a colour, then adjust its shade, strength and lightness.',
  'station-colours': 'The podcast station can follow the site or wear colours of its own.',
  'live-edit': 'Live edit: change a public page where it stands.',
  'studio-sessions': 'Podcast Studio: start a session from a template.',
  'podcast-studio': 'The studio editor: tracks, clips with their waveforms, the transport and the toolbox.',
  'studio-pads': 'Sound pads: jingles and stings on keys 1 to 9.',
  'asset-map': 'The asset map: six wedges, each with its three most-linked assets.',
  'asset-map-focus': 'Click a wedge to focus on one kind of asset.',
  'asset-map-linking': 'Drag from an asset’s ring to another asset to link them.',
  'form-designer': 'The form designer: add questions on the left, edit words on the form, settings on the right.',
  'form-on-site': 'The same form on the public site, one question at a time.',
  'toc-layers': 'Theory layers: what the plan already says, and new thinking on a layer of its own.',
  'toc-send': 'Send to plan: a tray shows the drafts before anything changes.',
  'plan-drafts': 'A draft in Strategy & Work, with Accept and Discard.',
  'results-v2': 'Results, grouped by objective, each saying where it comes from.',
  'roadmap-dusk': 'The roadmap: green objective signposts, white goal signs and traffic lights.',
  'asset-sunburst': 'The asset map as a sunburst: types, then collections, then assets.',
  'framework-sunburst': 'The whole framework as a sunburst on the Strategy & Work overview.',
  'mapper-share': 'The mapper: its panel beside the board, and the Share menu.',
  'graph-unfold': 'Graph search: CIFAR in the middle, its network unfolding ring by ring.',
  'graph-path': 'The way from CIFAR to Apple Education, each link named.',
  'graph-insights': 'Insights: most connected, bridges, clusters, islands and the ABCD balance.',
  'graph-export': 'Export and API: Turtle, JSON-LD and N-Triples, and read-only keys.',
  'rhizome-setup': 'Rhizome’s set-up: the context profile beside the checklist.',
  'rhizome-facts': 'Facts: one actor with its measures, attributes and every tie.',
  'rhizome-analyses': 'Analyses: findings ranked by score, with Why? open on one of them.',
  'place-map': 'Place: Kestrel Bay on its drawn map, with place outlines, actors, stories and the links between them.',
  'place-tray': 'A place’s tray: what’s here, who serves it from elsewhere, and the places inside it.',
  'rhizome-tips': 'The review queue: an excerpt from the web waits to be put in your own words.',
  'rhizome-rack': 'The twin racks: controls on the left, screens and engines on the right, cabled together.',
};
export const HELP_VERSION = 7;

/**
 * Sections added since a version: a saved (edited) library that is older
 * gets them too, at the top, so new guides reach every server.
 */
export const HELP_ADDED = { alpha: 2, 'new-in-0-2': 3, 'new-in-0-2-planning': 4, 'asset-graph': 5, rhizome: 6, place: 7 };

export const HELP_SEED = {
  version: HELP_VERSION,
  sections: [
    PLACE_HELP,
    RHIZOME_HELP,
    {
      id: 'asset-graph',
      title: 'The asset graph (experimental)',
      icon: 'sec-graph',
      blurb: 'Your assets, people, maps and strategy as one web of linked facts: search it, find who bridges groups, and share it as linked data.',
      pages: [
        {
          id: 'graph-search',
          title: 'Graph search',
          body: `The asset graph lives inside **Assets** (left panel, **Asset graph**). It joins everything Dashi knows into one web: assets, people, the actors on your maps, tags, collections, and your strategy from the framework to workplans.

# Unfold a network
1. Open **Graph search** and type a name. Pick it from the suggestions, or press Enter.
2. The thing sits in the middle and its network unfolds: what links to it directly, then one step further. The panel shows what the graph knows about it (its classes and facts), with **Open** to go to it.
3. Click any dot to unfold from there instead.

[[shot:graph-unfold]]

# Find the way between two things
Type **A to B**, for example "CIFAR to Apple". The shortest way is drawn as a line, each link named, and listed step by step in the panel.

[[shot:graph-path]]

# Ask the graph
The chips ask the bigger questions: **Most connected**, **Who bridges groups**, **Clusters** and **On their own**. You can also type "people", "tags", or an ABCD type such as "cultural".`,
        },
        {
          id: 'graph-insights',
          title: 'Insights',
          body: `**Insights** gathers what the graph says about your organisation:

- **Most connected**: linked to many things, or to well linked things. This is where your knowledge pools.
- **Who bridges groups**: they sit on the shortest way between others. Lose one and two groups drift apart.
- **Clusters**: groups of things more linked to each other than to the rest.
- **On their own**: things with no links. Linking them in adds what they know to the whole.
- **ABCD balance**: how many assets of each type, and which is thinnest.

Each card has **See on the graph**.

[[shot:graph-insights]]`,
        },
        {
          id: 'graph-ontology',
          title: 'Ontology, exports and the API',
          body: `# Ontology
**Ontology** sets which shared vocabularies the graph speaks: schema.org, FOAF, SKOS, PROV, Dublin Core and ABCD. Switch one off and Dashi's own words take over. Pick the class each ABCD type becomes (Individuals as foaf:Person, say), and what goes in. The sample at the bottom shows how one asset reads as you change things.

# Export
**Export and API** downloads the graph as **Turtle**, **JSON-LD** or **N-Triples**. Restricted assets always stay out, and no one's email or phone ever goes in.

# Read-only API keys
Admins can press **New API key**. Copy the key straight away: it is shown only once. Another tool then reads the graph with:

\`GET /api/graph/export?format=turtle\` and the header \`Authorization: Bearer dk_…\`

A key only reads, and only the graph. Revoke it at any time.

[[shot:graph-export]]`,
        },
      ],
    },
    {
      id: 'new-in-0-2-planning',
      title: 'New in 0.2: planning and maps',
      icon: 'target',
      blurb: 'Theory layers and drafts sent to the plan, the reworked results, a calmer roadmap, two sunbursts and a mapper that sits like every other plugin.',
      pages: [
        {
          id: 'theory-layers',
          title: 'Theory layers, and sending a theory to the plan',
          body: `An organisation often has a plan but no theory of change. The theory of change now starts from the plan, and can grow new thinking beside it.

# Bring the plan in as a layer
1. Open **Strategy & Work → Planning Studio**, pick a plan, then **Theory of change**.
2. Press **Bring in the plan as a layer**. Its objectives, goals and workplans appear, linked the way the plan nests them, on the **From the plan** layer.

# Add new thinking
1. In the **Theory layers** strip, **New thinking** is where new boxes go ("Adding here"). Press **+ Layer** for another, and click its name to rename it.
2. Add boxes in any column and link them. Each layer has its own colour down the side of its boxes; the eye hides or shows a layer.

[[shot:toc-layers]]

# Send it to the plan as drafts
1. Press **Send to plan**. A tray shows what it would make: each lasting change becomes an objective, each early change a goal, what you do a workplan, and what it produces a task. Pick which layers to send.
2. Press **Send as drafts**. Nothing is final yet: they arrive in Strategy & Work as drafts, striped and marked **Draft**, and stay out of reports.
3. Change the theory and send again: the drafts are updated, not doubled.

[[shot:toc-send]]

# Accept or discard
In **Strategy & Work → Framework**, open a draft and press **Accept** (it keeps the drafts above it too), **Discard**, or **Accept all**.

[[shot:plan-drafts]]

The assumptions behind each link, and any signposts, go into the draft's notes.`,
        },
        {
          id: 'results-reworked',
          title: 'Results that come from anywhere in the plan',
          body: `**Results** in the Planning Studio are grouped by objective. Each says where it comes from: the plan, an objective, a goal, a workplan or a single task.

1. Press **New result**, or **Add a result here** beside an objective.
2. Click a result to open it in a tray: say what it measures, its baseline and target, how often, and where it **comes from**.
3. Ideas from the SOAR board's Results corner wait in **From the SOAR board**: click one to make it a result.

[[shot:results-v2]]`,
        },
        {
          id: 'roadmap-sunbursts',
          title: 'The roadmap and the sunbursts',
          body: `# A calmer roadmap
**Strategy & Work → Roadmap** is shorter and duskier. Below the road, **green signposts** name the strategic objectives (O1, O2…) like freeway signs, then **white signs** for goals, one light per workplan. Above the road, each workplan is a **traffic light**.

[[shot:roadmap-dusk]]

# The asset map as a sunburst
**Assets → Asset map** opens as a sunburst: all assets in the middle, then the six kinds of asset, then collections, then the assets. Click a ring to zoom in, the centre to step out, an asset to open it beside the map. Inside one type, **Arrange … by hand** opens its wedge. **Size by links** makes the best-connected assets bigger. **Arrange** is the wedge map, for sorting and linking by hand.

[[shot:asset-sunburst]]

# The whole framework as a sunburst
The **Strategy & Work overview** has the whole framework as a sunburst: plans, objectives, goals, workplans and tasks, coloured by objective. A workplan's outline is its traffic light and drafts are striped. The panel beside it shows what's in the middle, or whatever you point at, with its progress; click a task to keep it there.

[[shot:framework-sunburst]]`,
        },
        {
          id: 'mapper-like-the-rest',
          title: 'The mapper, like every other plugin',
          body: `The Ecosystem now sits like every other plugin, so moving between them no longer shifts the screen.

- **The panel is beside the board**, where other plugins have their sidebar, not on top of the map. Drag its edge to resize it, or tuck it away from **View**.
- **The top bar is styled like the ribbon** on other plugins' pages, with **Works with** links on the right.
- **Share** holds what was under File, Connect and People: who can edit the map, saving a copy or a picture, opening a map file, and using the map in Strategy & Work, Assets and the Library.
- Help on the map type is under **View → About this map type**, and in the top bar's **?**.

[[shot:mapper-share]]`,
        },
      ],
    },
    {
      id: 'new-in-0-2',
      title: 'New in alpha 0.2',
      icon: 'spark',
      blurb: 'Step-by-step guides to what 0.2 brings: plugin access, your own colours, live edit, the Podcast Studio, the asset map and the form designer.',
      pages: [
        {
          id: 'whats-new',
          title: 'What’s new, and where things moved',
          body: `Alpha 0.2 is about plugins that own their own data, screens and designers. Each guide in this section takes a few minutes.

# Where things moved
- **Planning Studio** is now inside **Strategy & Work** (it needs Strategy & Work to be on).
- **Data Workbench** (dashboards, program data, postcards, calculators, stories, feedback forms and funder reports) is now in the **Public Portal**, under **Data**.
- **Library** is now inside **Assets**.
- The separate podcast and publishing mini-tools are gone: use **Podcasts** and the **Public Portal**.

[[shot:studio-in-strategy]]

# Also new
- **A steadier screen**: every plugin's name is in the bar at the top, and the sidebar and the ribbon above each page stay the same size as you move around. The ribbon also links to the plugins this one works with; help is the **?** in the top bar.
- **Your Dashi address**: change it in **Organisation → Domain**. It's checked as you type.
- **The mapper's panel**: tools are a list like the layers. Drag a section by its grip to reorder the panel, and drag its edge to resize it.

# Version numbers
From 0.2, each point version (0.2, 0.3…) is one big platform feature. Versions like 0.2.1 and 0.2.2 are fixes and polish from what you tell us.`,
        },
        {
          id: 'plugin-access',
          title: 'Who can use which plugin',
          body: `Switched-off plugins are now closed everywhere: in the menus, in links between plugins, and on the server.

# Switch a plugin on or off
1. Open **Organisation → Plugins**.
2. Use the switch on a plugin's row for the whole organisation, and the ticks for each role.
3. Sub-plugins (like Planning Studio) sit under their parent and only work when the parent is on.

[[shot:plugins-tree]]

# For one person
1. In **Organisation → Plugins**, click the plugin's name.
2. Under **For one person**, choose someone and pick **Off for them** (or **On for them**).

[[shot:access-one-person]]

# What people see
A menu item or link to a plugin someone can't use simply isn't there. If they open one directly, Dashi tells them kindly why: switched off for the organisation, for their role, or for them.

[[shot:access-closed]]`,
        },
        {
          id: 'your-colours',
          title: 'Make your own colours',
          body: `Start from any palette and adjust it until it's exactly your shade.

1. Open **Public Portal → Look and feel**, and find **Colours and shape**.
2. Pick the palette closest to yours.
3. Click a colour (main, second, accent, dark, page or text) and adjust it: type a hex code, pick from the shade strip, or move the **hue**, **strength** and **lightness** sliders. The preview follows as you go.
4. Watch the contrast badge. **AA** or **AAA** means text is easy to read. If a pair turns red, press **fix the text colours**.
5. Happy with it? **Save as a brand palette** and give it a name, so you can use it on any site.

[[shot:palette-builder]]

An adjusted palette remembers where it started ("Emerald, adjusted"), and **Back to Emerald** undoes everything.

# The podcast station's colours
In **Podcasts → Public station**, choose **Same as the site**, or give the station a palette of its own, brand palettes included.

[[shot:station-colours]]`,
        },
        {
          id: 'live-edit',
          title: 'Edit a page where it stands',
          body: `Staff who can write pages can change them right on the public site.

1. Open your site while signed in (or press **Edit on the page** in the Public Portal page editor).
2. Turn on **Edit this page** in the staff bar at the top.
3. Click the title or any paragraph and type. Use **+** to add a block (paragraph, heading, list, quote or embed), drag or use the arrows to move one, and the bin to remove it.
4. It saves as you go. Turn the switch off to see the page as visitors do.

[[shot:live-edit]]`,
        },
        {
          id: 'podcast-studio',
          title: 'Make an episode in the Podcast Studio',
          body: `The studio is a multitrack recorder and editor, in **Podcasts → Studio**. It works best on a laptop or desktop with headphones.

# 1. Start a session
Under **Start a session**, pick a template: **Interview**, **Solo show**, **Panel**, **Radio hour** or **Blank**. Each comes with voice, music and effects tracks.

[[shot:studio-sessions]]

# 2. Record or bring in audio
- **Record**: click a track's name to select it, press the red record button (or R), and allow the microphone the first time. The rest of the session plays while you record.
- **Import**: press **Import audio**, or drop .mp3 and .wav files on a track. **From the station** brings in an episode's audio for trailers and "previously on…".

# 3. Edit
- Drag clips to move them, between tracks too. Drag a clip's edges to trim it.
- **S** splits at the playhead, **Delete** removes the selected clip, and **Ctrl+Z** undoes.
- Drag across the ruler and press **Delete** to take that stretch out of every track.
- The toolbox: **Normalise** evens out loudness, **Tighten pauses** shortens long gaps, and **Trim the quiet ends** cuts silence at the edges.

[[shot:podcast-studio]]

# 4. Chapters and sound pads
Press **M** to drop a chapter marker, and name it in the **Chapters** tab. The **Sound pads** tab is a sound board: tap a pad (or keys 1 to 9), or insert it at the playhead.

[[shot:studio-pads]]

# 5. Send it out
**Download WAV** saves the mix. **Send to the station** makes a draft episode with the audio and chapters. Finish it in Podcasts and publish when you're ready.`,
        },
        {
          id: 'asset-map',
          title: 'Use the asset map',
          body: `The asset map in **Assets → Map** shows your community's assets in six ABCD wedges: individuals, associations, institutions, physical, economic and cultural.

[[shot:asset-map]]

# Look closer
Click a wedge to see just that kind of asset, laid out in rows. **All six** goes back.

[[shot:asset-map-focus]]

# Add an asset
Press **+** on a wedge (or **Add …** in the focused view). Give it a name, what it brings, and a link if it has one.

# Link two assets
Drag from the ring around one asset onto another. A line joins them both ways. Drag again between the same two to unlink.

[[shot:asset-map-linking]]

# Re-sort an asset
In the focused view, drag an asset onto another kind's chip at the top. On the overview, drag it into another wedge. Where you put things is remembered.`,
        },
        {
          id: 'form-designer',
          title: 'Design a feedback form',
          body: `Feedback forms ask the people who read your numbers what they make of them. Answers are anonymous. Find them in **Public Portal → Feedback forms**.

1. Press **New form**. It starts with three good questions.
2. Open **Design the form**. The middle shows the form just as visitors will see it, in your site's colours.
3. **Change any words** by clicking them: the title, the intro, each question, its hint and the button.
4. **Add a question** from the left: click to add it after the selected one, or drag it into place. Kinds: 1 to 5 stars, 0 to 10 scale, yes or no, pick one, pick several, a short or longer answer, and headings.
5. **Arrange** by dragging a question's grip. Each question also has **Required**, **Duplicate** and **Remove**.
6. On the right, set the selected question's kind, options and scale words, or open **The whole form** to choose a layout (**Card**, **Plain** or **One at a time**), the thank-you message, and where it shows.
7. Press **Try it** to fill it in as a visitor would (nothing is sent), then **Show it on the site**.

[[shot:form-designer]]

[[shot:form-on-site]]

Answers come back to the **Answers** tab, with stars, scales and choices added up for you.`,
        },
      ],
    },
    {
      id: 'alpha',
      title: 'Testing Dashi (alpha)',
      icon: 'ticket',
      blurb: 'You’re one of the first people using Dashi. What to try, how to tell us what you find, and what to expect.',
      pages: [
        {
          id: 'welcome',
          title: 'Welcome, and thank you',
          body: `Dashi is in **alpha**: the main parts work, some are rough, and things will change. You're here to use it for real work and tell us where it helps, where it gets in the way, and where it breaks.

# What alpha means
- **It works, but isn't finished.** Expect a few bugs and some rough edges.
- **Your work is kept.** The database is backed up every day. If something goes wrong we can bring back yesterday's copy.
- **It changes often.** New versions arrive every week or two. The version is under the Dashi name (top left): hover on **alpha** to see it.

# The two things that help most
1. **Use it for something real**: this month's plan, an actual reading list, a map of your real partners.
2. **Tell us**, even about small things. Use **Feedback** (the round button, bottom right of every page). It takes a minute.`,
        },
        {
          id: 'what-to-try',
          title: 'What to try',
          body: `Pick what fits your role. Half an hour is plenty for a first go.

# Everyone
- [ ] Sign in, open **My profile** (the menu under your picture), and add your title and picture.
- [ ] Open the **Dashboard**. Does it tell you what you need to know?
- [ ] Find something in **Help** without asking anyone.

# If you map ecosystems
- [ ] Make a map, add ten actors, connect them, and try two different lenses.
- [ ] Use **Panels** (top right of the Mapper) to dock, float and tidy the tool panels.
- [ ] **To library** keeps the map as a file in the Library; open it again from there.

# If you plan
- [ ] In **Strategy & Work**, add an objective, a goal, a workplan and a few tasks with dates and people.
- [ ] Attach assets to a task: an actor, a whole map, a document.
- [ ] Make the plan document in the **Plan designer** and look at its web view.

# If you read and write briefs
- [ ] In **Library**, use **Add a reading** to add five sources with annotations and tags.
- [ ] Open **Tags** and see your vocabulary; rename or merge one.
- [ ] In a bibliography's **Weekly brief**, pick a layout (STEEPLE, Micro / Meso / Macro, or a lexicon facet) and draft the brief.

# If you run the org
- [ ] Add a person in **Organisation → People** and send them an invitation.
- [ ] Publish a dashboard or page to your public site, and look at it signed out.`,
        },
        {
          id: 'reporting',
          title: 'How to report a problem or idea',
          body: `Press **Feedback** at the bottom right of any page, or **Ask or report something** in Help.

# A good report
- **What you were doing**: "I was adding a connector between two actors…"
- **What you expected**, and **what happened instead**.
- **Whether it stops you working.** Tick the box and we'll look first.

# What's sent with it
With **Include technical details** ticked, the report carries the page you were on, Dashi's version, your browser and screen size, and the last few error messages on that page. It never includes the contents of your documents. Open **What's sent** in the form to see exactly what goes.

# Following up
Your reports are under **Help → Support**. Replies arrive there and by email. Reply in the same place if we ask for more, and close it when it's sorted. Only you and the Dashi team can see your tickets.`,
        },
        {
          id: 'known-limits',
          title: 'Known limits in this version',
          body: `Things we know about, so you don't need to report them (but do tell us if one gets in your way):

- **Editing the same thing at the same time.** If two people change the same plan or map at once, the second save is refused and you're asked to reload. Nothing is overwritten, but the second person's last change needs redoing. Live co-editing comes later.
- **Phones.** Dashi works on a phone for reading and small edits. The Mapper, Studio and spreadsheets want a bigger screen.
- **Payments.** Plans can't be paid for yet; testers are on the house.
- **Podcast Studio.** Exports WAV only for now (no MP3 yet). Audio linked from another website can't be opened in the studio: download it, then use **Import audio**.
- **Email.** Invitations and password links need the server's email to be set up. If one doesn't arrive, ask your admin to set your password instead.`,
        },
        {
          id: 'your-data',
          title: 'Your data during the alpha',
          body: `- Your organisation's documents are kept on Dashi's server in Toronto, Canada, and backed up daily.
- Only people on your organisation's staff list can sign in to it. Visitors see only what you publish.
- The Dashi team can see your organisation's data to fix problems, and won't use it for anything else.
- On a **test server** (it says so in a yellow bar at the top), data may be reset. Don't put anything private there.
- Want your data out, or deleted? Ask through **Feedback** and we'll do it.`,
        },
      ],
    },
    {
      id: 'ecosystem-mapping',
      title: 'Ecosystem mapping',
      icon: 'mapper',
      blurb: 'Map the actors, relationships and feedback loops in your change ecosystem.',
      pages: [
        {
          id: 'getting-started',
          title: 'Getting started with a map',
          body: `The Ecosystem holds as many maps as you need. Each has an owner and members, and its own actors, connectors, groups and layers.

# Make your first map
1. Open **Ecosystem** from the header and press **New map**.
2. Pick a lens to draw behind the map. You can switch lens at any time.
3. Click **Actor** or **Agent** to add one, or drag the button onto the board to drop it where you want. Drag an actor to change how deep it sits.
4. Drag from the small box on an actor's top-left corner to another actor to connect them. Pick the connector's type and its strength (1 to 5, drawn as thickness) on the right. Each type has its own line end.

# Tips
- Click a zone of the lens (like Meso) and the actors in it signal.
- **Tidy** (beside Fit) spaces the actors out for the lens you're on. Each stays in its zone and layer; Undo puts them back.
- Put actors into **groups** to show coalitions or sectors, give a group a description, and move it (with its connectors) to its own layer to show and hide it.
- **Data viz** (D): click an actor or connector to light up everything it's connected to for 15 seconds while the rest dims.
- A task in Strategy & Work can point at map actors as assets, so work and the ecosystem stay linked.
- Members of a map can edit it; everyone else in the organisation can view it.`,
        },
        {
          id: 'lenses',
          title: 'How the lenses line up',
          body: `The Ecosystem draws one of five systems models behind your map. They look different (rings, a triangle, bands, a grid) but they all describe the same thing: how deep a change goes. So the platform puts them on one shared scale.

**One depth scale.** Every actor stores a depth from 0 to 1. At 0 is the surface: what is explicit, structural and collective, like policies, budgets and resource flows. At 1 is the deep end: what is implicit and personal, like mindsets, beliefs and paradigms. Each lens divides that scale into its own regions. When you switch lens, an actor keeps its depth and lands in whichever region of the new lens sits at that depth.

[[diagram:lenses]]

# Micro, meso and macro as the reference
Micro / Meso / Macro has three equal tiers, so it is the easiest way to read across. The table lists, for each tier, the regions of the other lenses that sit within it (a region counts when its middle falls inside the tier).

[[diagram:lens-table]]

> Why is the deep end micro? The scale runs from explicit to implicit, not from small to large. Policy and budgets are visible and collective (macro, structural); mindsets live in people (micro, transformative). Treat the edges as soft: the original authors don't all claim these exact equivalences.`,
        },
        {
          id: 'reading-lenses',
          title: 'Reading each lens',
          body: `# Water of Systems Change
Lines up one to one. Structural change (policies, practices, resource flows) is macro; relational change (relationships, power) is meso; transformative change (mental models) is micro.

# Spheres of Systems Change
NPC groups its eight spheres as micro, meso and macro, and the platform keeps those groups: cultural and political spheres are macro; infrastructural and collective are meso; organisational, relational, behavioural and internal are micro.

# Leverage points
Meadows' twelve places to intervene run from shallow (12, numbers) to deep (1, transcending paradigms). Points 12 to 9 are macro, 8 to 5 are meso, and 4 to 1 are micro.

# Theory of System Change
Its iceberg rows run from events (macro), through patterns and structures (meso), to beliefs and mental models (micro). Its columns (adopt, adapt, expand, respond) are breadth, not depth, so switching to this lens spreads actors left to right by how far a change has spread.`,
        },
      ],
    },
    {
      id: 'podcasting',
      title: 'Podcasting',
      icon: 'mic',
      blurb: 'Run your own podcast station: shows, seasons, episodes and RSS feeds.',
      pages: [
        {
          id: 'your-station',
          title: 'Your station',
          body: `**Podcasts** gives your organisation its own station: a public page with your shows, organised by season, with a player that keeps playing as listeners move around your site.

# Set it up
1. In Podcasts, open **Station**. Give it a name, a tagline and some art.
2. Choose the **public site** the station lives on. The site must be public for listeners to find it.
3. Choose how it looks: the player, the cover art style and the top of the page. These sit on top of your organisation's colours.
4. Mark the shows to **feature**. Featured shows lead the station page, in the order you set.

If Podcasts isn't in your header, ask your platform admin to switch it on for your organisation.`,
        },
        {
          id: 'publishing-episodes',
          title: 'Publishing episodes',
          body: `Episodes are uploaded as **.mp3** or **.wav** files, up to 200 MB.

# The quick way
The Workbench has a **Podcast publishing** mini-tool: pick a show and season, choose a file, give it a title, and publish it now, schedule it, or save it as a draft. Drafts and scheduled episodes are listed there with a **Publish now** button.

# With all the details
In Podcasts, open a show and press **Add episode**. There you can also write show notes (bold, italic, lists and links work), choose the episode type (full, trailer or bonus), and credit the people in it.

# Who can hear what
- **Draft**: only staff can see it.
- **Scheduled**: goes out by itself on the date you choose.
- **Published**: on the station page, and in the show's RSS feed.

Audio stays private until the episode is published.`,
        },
        {
          id: 'rss',
          title: 'RSS feeds and podcast apps',
          body: `Each show has an RSS feed in the form podcast apps expect (RSS 2.0 with the iTunes tags). Open a show and press **RSS feed** to see or download it.

The fields follow [Castopod](https://castopod.org)'s model, so moving to a Castopod server later would not mean reshaping your data.`,
        },
      ],
    },
    {
      id: 'dashboards',
      title: 'Dashboards',
      icon: 'chart',
      blurb: 'Show your progress with dashboards built from your strategy and program data.',
      pages: [
        {
          id: 'making-a-dashboard',
          title: 'Making a dashboard',
          body: `Dashboards live in the **Data Workbench**. They are built from the measures you give objectives and goals in Strategy & Work.

1. In the Data Workbench, open **Dashboards**.
2. Pick an objective or goal under **Start from** and press **Create dashboard**. You get a widget for each of its measures. Or start blank.
3. Add, remove and reorder widgets: numbers (KPIs), lines over time, progress against targets, task progress.
4. Press **Play** to watch the year change month by month.`,
        },
        {
          id: 'program-data',
          title: 'Keeping the numbers current',
          body: `The **Program data** mini-tool in the Workbench holds the monthly value of each measure. Change a number and every dashboard and public site using it updates.

The **Strategic data** tab in Strategy & Work shows every measure's latest value against its target, so you can see where data is missing or out of date.`,
        },
        {
          id: 'sharing',
          title: 'Sharing and data postcards',
          body: `A dashboard is **private** (staff and board) until you make it **public** and pick a site for it. The Data Workbench's **Publishing** mini-tool shows what each site carries.

**Data postcards** turn one measure into a picture in your colours, with alt text, for newsletters, social posts and slides. Pick a measure, add a headline, and download the PNG.`,
        },
        {
          id: 'calculators-stories',
          title: 'Impact calculators and data stories',
          body: `An **impact calculator** is a slider for your site: "a gift of $50 means 3 more youth in a program". Give what the work costs a year and pick the measures it moves. The cost of one comes from your program data, so it stays current. Type a yearly count or a cost of its own on an outcome to override it.

A **data story** tells what the numbers mean one step at a time. Each step has a few words, a chart that changes as readers scroll, and an audio clip if you have one.

Both publish like dashboards: make one public and choose a site. Calculators show on the site's home page and stories are listed there. Put either in a page with \`[[calculator:id]]\` or \`[[story:id]]\`, or use the Insert menu in the page editor.`,
        },
      ],
    },
    {
      id: 'studio',
      title: 'Planning Studio',
      icon: 'studio',
      blurb: 'Inside Strategy & Work. Facilitate a strategic plan together: SOAR, context, results, and wiring ideas into objectives and goals.',
      pages: [
        {
          id: 'studio-flow',
          title: 'From SOAR to a plan',
          body: `The Planning Studio works on the plans in your strategic framework (the same ones as in Strategy & Work). Each plan has:

- **Plan home:** its dates, the mission and vision it serves, its operating context and its planning team.
- **SOAR board:** one big shared canvas with the four quadrants meeting in the middle. Double-click anywhere to add a sticky note, drag notes to move them (into another quadrant too), and click the dot to vote. The nearer a note is to the centre, the more it matters: its border is thickest (5px) at the centre and thins out further away. Drag the background to pan, use − and + (or Ctrl/⌘ + scroll) to zoom, and **Centre** to come back. **Rank by dots** moves the most-voted notes closest in. Everyone with the plan open sees changes as they save.
- **Strengths, Opportunities, Aspirations:** the same cards as lists, most dotted first, where you can say more and link assets with the asset chooser.
- **Results:** a grid of result cards, each with an indicator, baseline, target, source and how often it is measured. Link a Strategy & Work measure to use its live data.
- **Assemble:** drag cards, context, results and assets onto the canvas, add goals, objectives and workplans, and patch outlets into inlets: ideas and workplans into goals, goals into objectives, objectives into the plan. **Bring in the plan** lays out the plan as it already stands in Strategy & Work, so you can see and rearrange the whole thing. Renaming a block that is already in the plan renames it there too; a workplan's link opens it in Strategy & Work for dates, people and tasks. **Send to plan** makes anything new in Strategy & Work, and sending again updates rather than copies. Zoom with − and +, and **Centre** fits everything in view.`,
        },
        {
          id: 'studio-live',
          title: 'Running a live session',
          body: `Share the plan's SOAR board link with everyone in the session. Each card remembers who added it and when it last changed, so people working at the same time only overwrite each other if they change the very same card at the same moment. The **Live** chip pulses when someone else's change arrives.

Ctrl+Z (or ⌘+Z) undoes your own last change.`,
        },
      ],
    },
    {
      id: 'public-sites',
      title: 'Public sites',
      icon: 'globe',
      blurb: 'Pages, news, dashboards and your station, on sites in your own look.',
      pages: [
        {
          id: 'how-sites-work',
          title: 'How a site is put together',
          body: `An organisation can have several sites, each **public** or **private** (staff and board only). Set them up in the **Public Portal**: add a site from the overview, and pick its colours and shapes under **Look and feel**.

- **Home**: the site's public dashboards, with the latest news and the newest episode above them.
- **Menu**: pages marked "In the menu", then News and the podcast station when the site has them.
- **Look**: a colour palette and a shape, from Organisation settings. The station adds its own player and cover style.

Visitors only ever see what is published: public dashboards, published episodes and live pages. Everything else stays on the server.`,
        },
        {
          id: 'pages-and-news',
          title: 'Pages and news',
          body: `**Public Portal** (formerly Web views, and Sites & Pages before that) is where you write information pages and news articles.

# Writing
Bodies use light markdown: **bold**, _italic_, lists, links, quotes and headings that start with #.

# Live embeds
Put a line on its own like \`[[dashboard:dash-equity]]\`, \`[[episode:ep-sv-3]]\` or \`[[show:pod-stem-voices]]\` to show that item, live. The editor's **Insert** menu writes these for you.

# Publishing
A page is a draft until you publish it. Give it a future date to schedule it.`,
        },
      ],
    },
    {
      id: 'adding',
      title: 'Adding to the platform',
      icon: 'plus',
      blurb: 'How Dashi fits together, and where new plugins, lenses and tools plug in.',
      pages: [
        {
          id: 'plugins',
          title: 'The plugins',
          body: `Dashi is one platform for an organisation's planning, ecosystem mapping, data and storytelling. Each tool is a plugin; they share one set of people, one strategy and one data model, so work in one shows up in the others.

[[diagram:plugins]]

Your organisation's admin switches plugins on and off in **Organisation settings → Plugins**. Some plugins depend on your plan; the platform admin adds or pauses them.`,
        },
        {
          id: 'data-model',
          title: 'The data model',
          body: `Everything belongs to an organisation. Each organisation has a handful of documents, each a plain JSON object that one plugin owns. Plugins point at each other's things by id, never by copying.

[[diagram:data-model]]

# Every change is an operation
Plugins never edit a document directly. They send small operations (add, update, remove, move) to a store, which applies them and keeps their inverses. That gives undo and redo everywhere.`,
        },
        {
          id: 'extending',
          title: 'Extending Dashi',
          body: `- **A plugin**: make a page and its module, then add an entry to \`src/plugins.js\`. It appears on the dashboard, in the header and in Organisation → Plugins.
- **A Data Workbench mini-tool**: write a function that returns its page and add it to \`MINI_TOOLS\` in \`src/palette/main.js\`.
- **A lens**: add a JSON file to \`src/lenses/\` with regions on the 0 to 1 depth scale. It shows up in the lens diagram by itself.
- **A palette**: add a DaisyUI theme to \`src/platform/themes.js\`.
- **A help page**: platform admins can edit this library in Help. Press **Edit help**.

See \`ARCHITECTURE.md\` for where everything else plugs in.`,
        },
      ],
    },
  ],
};
