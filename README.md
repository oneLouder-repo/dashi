# Dashi

**Version 0.4.0-alpha** (in progress): the learning release. Teach and Learn get a warmer look and a nicer player, and Rhizome gains a rack of set and graph modules and the critical AI visualiser. Going live moves to 0.5. Before that, **0.3.0-alpha** closed alpha 0.3, UI tinkering and enhancements, and **0.2.0-alpha** brought plugin access enforced on the server and per person. See [CHANGELOG.md](CHANGELOG.md) for what's in it, [TESTING.md](TESTING.md) for testing it, and [DEPLOY.md](DEPLOY.md) for running it.

A small, cohesive platform for nonprofits' planning, knowledge and learning work. It holds many organisations; each picks the **plugins** it uses. Open `index.html` (via `npm start`) for the dashboard, then choose a plugin:

| Plugin | Page | What it does |
| --- | --- | --- |
| Ecosystem Mapper | `mapper.html` | Map actors, agents, relationships and loops through five systems lenses (below) |
| Asset manager | `assets.html` | Everything the org has to work with (files, links, notes, maps, actors, people, library items, episodes) in collections and tags, seen through an ABCD lens as tiles, a list or an asset map; chunked uploads |
| Library | `library.html` | Literature and documents: references in APA, Chicago, MLA or Harvard, Zotero/BibTeX/RIS import and export, a PDF reader with highlights and page notes, annotated bibliographies |
| Plan | `strategy.html` | Framework → plans (nested, dated, themed) → objectives → goals → workplans → tasks, with Gantt charts and task lifetime timelines |
| Workbench | `palette.html` | Mini-tools for the data dialogue: design dashboards, keep program data current, publish to sites |
| Podcasts | `podcasts.html` | Your own podcast station: shows by season, uploaded .mp3/.wav episodes, featured shows, RSS feeds, and the station's look |
| Web | `pages.html` | Every site and portal, and what is live on each; add a property; the look (colours and shapes) of every site; pages and news articles, with live dashboard and episode embeds |
| Organisation | `org.html` | Profile, contact and logo; people (a directory, with a drawer for each person) and their roles; teams; plugins; plan and usage; domain |
| My profile | `me.html` | The signed-in person's picture, followed strategic areas, tasks, workplans, dashboards, maps and shows |
| Help | `help.html` | User guide, how the systems lenses line up, and the data model, with diagrams |
| Sample public site | `site.html?site=<id>` | What the public sees: dashboards, pages, news and the podcast station, in the org's theme |

Every plugin shares the same small framework (`src/core`), header (`src/ui/Shell.js`), data layer (`src/platform`) and UI kit ([DaisyUI](https://daisyui.com), vendored in `vendor/daisyui`, so still no build step). To add a plugin: make a page and its module, then add an entry to `src/plugins.js`; it appears on the dashboard, in the header and in Organisation → Plugins. On the hosted platform, the platform admin manages every plugin under **Platform admin → Plugins**: rename and recolour it, switch features on per plan, describe its data model, release versions and roll back, and install or update plugins from a JSON package. A plugin made there gets a page generated from its data model (`plugin.html?id=<id>`) until it has one of its own. See `src/platform/pluginRegistry.js`.

The look: the **Ripple** mark (`media/brand/`), Dashi's **Grid** section icons and **Phosphor** icons (MIT, `vendor/phosphor/LICENSE`) in `src/ui/icons.js`; themed dialogs in `src/ui/dialog.js` (never the browser's `alert`, `confirm` or `prompt`); and the **save light** in the header (`src/ui/netlight.js`), which shows every call to the server. Data autosaves to the browser for now, per organisation.

Two example organisations come built in (switch from the menu at the top left). Accounts are mocked: the menu under your picture signs you in as anyone on staff.

### Plan, quickly

- The left side is the whole strategy as a tree. Click to open, **+** to add the next level down.
- Plans, objectives, goals and workplans show a Gantt chart of the workplans beneath them. Drag a task bar to move it, drag its ends to change dates, click it to open the task. Weeks / Months / Quarters zooms.
- A task shows its lifetime as a timeline: status over time, notes, milestones and today. Changing status records itself on the timeline.
- Objectives and goals carry **measures** (name, target, unit). **Create dashboard** on an objective or goal builds an accessible dashboard from every measure on it and below, and opens it in the Workbench.
- Every task (and workplan) has a **toolbox of assets**: ecosystem-map actors, staff, outside people, other strategy items, documents, links, literature and media, picked from one pop-up. Workplans, goals, objectives and plans gather the assets used beneath them, showing which tasks use each one.
- The URL holds the selected item (`strategy.html#<id>`), so links can point straight at a task.
- **Roadmap** is a road that slides sideways: traffic lights you've passed on the left (green, amber or red by how each workplan went), red lights still ahead on the right, milestone pennants, and a road sign for each goal. Today is a pulsing beacon. Slide with the arrows, the minimap strip, the mouse wheel or the arrow keys.
- Plans, objectives and goals open on **Lanes** (plan down to task, with a condensed Gantt); workplans open on a **Board** of their tasks. The full Gantt is one click away.
- Big teams show as avatar stacks with a **people picker** (search, team filters, add a whole team).

### Plugins released in alpha.5

- **Plain Words** (on by default): reading grade, long sentences, hard words and plainer swaps, worked out in the browser.
- **AI Policy Studio**, **AI Use Register**, **Prompt Commons** and **Critical Media** are off until an org switches them on (Organisation → Plugins). Critical Media offers original media-literacy lessons, inspired by NALA's *Facts Matter* and Be Media Smart, and can suggest a lesson beside articles and charts on the org's public sites. It is on for the example STEM org.

### Podcasts and public sites, quickly

- **Listen** holds shows, each organised by season. Upload an episode as an .mp3 or .wav file (it is kept in the browser for now), give it a season, notes and people, and publish it now, on a date, or keep it as a draft.
- Toggle any show as a **featured show**, and drag the order with the arrows. The public **station page** leads with the newest episode, then the featured shows, then an archive of every show by season, with search.
- The station's **look** (player style, cover art shape, banner or split header) sits on top of the org's palette and shape, so each org can skin its station.
- **Web** lists every site and what is on it, with a diagram of what is live and in design, and is where you write pages (in the site menu) and news articles. A line like `[[dashboard:dash-equity]]` or `[[episode:ep-sv-3]]` embeds live content.
- On a public site, links change the page without reloading, so the player keeps playing as visitors move around.

### Workbench and public sites, quickly

- **Dashboards**: start from an objective or goal, or blank. Each widget (headline number, line, monthly columns, work progress, text) has controls beneath it in the editor. Set visibility to Public and choose a site to publish.
- **Play** steps a dashboard month by month through its data, in the editor and on public sites.
- **Program data**: edit the monthly values behind each measure. Public sites open in another tab update as you type.
- **Publishing**: everything that can go on a site (dashboards, stories, calculators, feedback forms), with a site picker and a Showing switch. Members-only sites show a sign-in message to visitors.
- **From your strategy**: road, goal lights, next milestones and work progress widgets show where the plan stands, live from Plan.
- **Feedback forms**: short anonymous questions under a site's dashboards or on its front page; answers come back to the Workbench.
- **Funder reports**: pick a funder, a period and what they fund, and get a first draft from your measures, workplans and stories to edit, print or keep in the Library.

### Board portal, quickly

- Open it from **Web → Members only → Board portal** (its page has a live preview and an Open the portal button), or `site.html?site=site-board`. Only signed-in members see it.
- Governance guides, minutes and finance summaries are Library documents tagged `board` plus `governance`, `minutes` or `finance`. Tag a document and it appears; edit it in the Library.
- The home page shows the **Board scorecard** dashboard (edit it in the Workbench) and a short feedback form for the board.

---

## Ecosystem Mapper

A playful board for mapping a change ecosystem: actors and agents, the connections and groups between them, and the feedback and learning loops that run through it, drawn over a swappable "systems lens". Five lenses ship: Micro / Meso / Macro, the Water of Systems Change, NPC's Spheres of Systems Change, Meadows' Twelve Leverage Points and the Theory of System Change.

Plain ES modules, HTML, CSS and SVG. No framework, no bundler, no dependencies. See [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

### Run it

```
npm start        # the platform, with the example orgs: http://example.localhost:5173
npm test         # unit and server tests
```

`npm start` runs the platform server (Node 22.13+, no dependencies): sign-in, each org on its own subdomain, documents and uploads saved on the server, and public sites that only ever receive published content. [DEPLOY.md](DEPLOY.md) covers testing it locally as any user, settings, and hosting. The pages still run without the server, too, on any static host: they then keep everything in the browser, as the prototype does.

### Using the board

| Do this | How |
| --- | --- |
| Add actors | Press **A** (or click **Actor**), then click the board as many times as you like, typing a name after each. Press **A** again, click the tool again, or **Esc** to stop. Double-clicking the board also adds one |
| Actor or agent | Select it and use the **Actor / Agent** switch in the side panel |
| Rename an actor | Double-click it, or use the panel on the right |
| Move an actor | Drag it. Its region (ring or band) follows where you drop it |
| Select several | Drag a box on empty board, or shift-click. Drag any selected actor to move them all |
| Connect actors | Press **C**, then drag from actor to actor, as many times as you like. **C** again or **Esc** to stop |
| Group | Select several actors, then **Ctrl/⌘ + G** or the button in the side panel. Drag a group's tab to move it |
| Re-dock a connector | Select it, drag one of its round ends onto another actor (or onto empty board to leave it floating) |
| Pan | Scroll, hold **Space** and drag, middle-drag, or the **Pan** tool (**H**) |
| Zoom | Ctrl or ⌘ + scroll; **F** or **Fit** fits the whole lens |
| Delete | Select, then Delete or Backspace |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z |
| Switch lens | The **Lens** menu in the top bar |

Maps autosave to the browser. **Example** reloads the shared test map (28 actors, 33 relationships, 3 groups; see `src/seed.js`). **Export** downloads the map as JSON and **Open…** loads one back.

### Layout

```
src/
  core/         Stage, DisplayObject, Sprite, EventDispatcher, Store, ops
  display/      ActorView, ConnectorView, LensView, MapView (store → display list)
  tools/        one file per tool + the registry
  ui/           top bar, toolbar, inspector, layers panel, inline label editor
  lenses/       one JSON file per lens + the registry
  persistence/  local storage and JSON file import/export
  mapper.js     wires the mapper together
  platform/     org and strategy data models, example data, storage (shared by all tools)
  strategy/     the Plan tool: tree, detail, Gantt, timeline
  pages/        the dashboard and org overview
  toolbox.js    the list of tools
test/           node:test tests for the stores, ops, lenses and strategy model
```

### Adding a board tool

Copy `src/tools/PanTool.js`, change `id`, `label`, `icon` and `key`, fill in the handlers you need, then register it in `src/main.js`:

```js
ctx.tools.register(MyTool);
```

Handlers get a stage event (`worldX`, `worldY`, `view`, `handle`, `shiftKey`, …) and the shared `ctx` (`stage`, `store`, `ops`, `mapView`, `tools`, `ui`, `actions`). Change map data only through `ctx.store.apply(ctx.ops.something(...))` so it can be undone and, later, shared live.

### Adding a lens

Add a JSON file to `src/lenses/` (copy `micro-meso-macro.json`) and list its name in `LENS_FILES` in `src/lenses/index.js`. A lens picks a `layout`: `rings` (concentric circles), `triangle` (inverted triangle), `bands` (horizontal tiers) or `grid` (bands with named columns). A new layout is a geometry entry in `src/lenses/index.js` plus a renderer in `src/display/LensView.js`.

Every region gives a `depth` range on one shared scale, 0 (explicit, structural, collective) to 1 (implicit, personal, mental models). Actors are stored as `place: { depth, spread }`, not x/y, and each lens projects that place onto its own shape. That is what makes an actor in the Micro ring land in Transformative change, Mindset or paradigm, and so on when you switch lens. Tune a lens's `depth` ranges to change how it lines up with the others.

Actor categories and connector types are shared by all lenses, in `src/lenses/taxonomy.json`. Lenses never change map data; actors whose category a lens doesn't define show as "unmapped" until recategorised.

### Icons

Tool and panel icons are monochrome line drawings in `src/ui/icons.js`. A tool's `icon` can name one of them or be raw SVG path data on a 24×24 grid.

### Making things move

Any display object can listen for `enterFrame`, AS3-style:

```js
view.addEventListener('enterFrame', (e) => {
  view.alpha = 0.8 + 0.2 * Math.sin(e.time / 300);
});
```

Selected actors use this for their breathing outline (`ActorView.js`).

### Status

Working now: actors and agents, groups, sticky tools with custom cursors, marquee and multi-select with group moves, connectors with docking and re-docking, connector types, layers (show, hide, lock, assign), five lenses on a shared depth scale with live switching and region highlighting while dragging, undo and redo, autosave, JSON export and import.

Not yet: per-lens position overrides, accounts and folders, free-text notes, the Node server and live multi-user editing.
