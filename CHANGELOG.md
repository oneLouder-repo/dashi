# Changelog

Dashi uses version numbers like `0.2.0-alpha` (before 0.2, `0.1.0-alpha.1` and so on). Each point version (0.2, 0.3…) is one major platform feature; 0.2.1-alpha, 0.2.2-alpha… are fixes and polish from testing. While the first number is 0, anything can change between versions. "alpha" means not yet feature complete and still likely to have bugs, but versioned, hosted and ready for invited testers. The version shows on the **alpha** badge in the header and at `/version`.

## 0.2.0-alpha (2026-11-21): plugins that own their data, screens and designer

From 0.2 on, each alpha point version (0.2, 0.3…) is one major platform feature, and its sub-versions (0.2.1, 0.2.2…) are bug hunts and polish from live testing. 0.2 landed over several pull requests, newest first below.

### Planning that starts from the plan, sunbursts and one layout for every plugin (PR 9 and 10)

**Strategic planning, Actua first**

- **Actua starts fresh on each new PR** while we test creating plans: its Strategy & Work and Planning Studio go back to the seeded versions once per release mark (`CLIENT_RESET`), with a backup of what was there first in the data folder’s `backups/`.
- **The Planning Studio is filled in from the plan**: Actua's SOAR board, Assemble canvas (the assembled plan, with SOAR cards wired into the goals and objectives they feed) and Results are seeded from its strategy. The theory of change starts blank, like an organisation that has a plan but no theory yet.
- **Theory layers.** The theory of change has a layers strip: **From the plan** (what the plan already says, brought in with one click), **New thinking**, and any layers you name. Show or hide each one, and pick where new boxes go. An empty theory now says when the plan is already in place and offers to bring it in.
- **Send to plan, as drafts.** A tray previews what the theory would make: lasting changes become objectives, early changes goals, what you do workplans, what it produces tasks (Planned), each under what it leads to; the change you seek fills an empty vision. Assumptions and signposts go in the notes. Sending again updates the same drafts.
- **Drafts in Strategy & Work**: marked in the outline, with **Accept**, **Discard** and **Accept all** above the item. Reports and the roadmap leave drafts out until they're accepted.
- **Results, reworked**: grouped by objective, with what each comes from (plan, objective, goal, workplan or a single task), baseline to target, how often and whether it uses live data. Edit one in a tray.

**The roadmap and two sunbursts**

- **The roadmap is shorter and duskier**, with less sky and grass. Strategic objectives get **green signposts** (O1, O2…, like freeway signs), goals keep their white signs, and workplans stay traffic lights.
- **The asset map opens as a zoomable sunburst** (all assets, then the ABCD types, then collections, then assets), sized by count or by links. Click to zoom, the centre to step out, an asset to open it. **Arrange** keeps the wedge map from PR 4.
- **The Strategy & Work overview has the whole framework as a sunburst**, from plans to tasks, coloured by objective, with each workplan's traffic light as its outline and drafts striped. Click a task to see it in a tray.
- **Sunburst touch-ups**: labels are cut to fit their ring, with a floating tooltip for the whole name; every ring is equally bold (no paler veil as you dig in, and labels switch to white on strong colours); opening an asset keeps the sunburst where it is, with an **Arrange … by hand** button when you're inside one type.
- **Arrange** uses the sunburst's bold colours, and opening a wedge bursts it outward before its assets pop in one after another (and the same back to all six).
- **The framework sunburst has a details panel** where the legend was: what's in the middle, or whatever you point at, with its task progress, traffic light and path; click a task to keep it there, and open it from the panel.
- D3 v7.9.0 is vendored in `vendor/d3/` and loads only when a sunburst is shown; `src/ui/Sunburst.js` is shared.

**One layout for every plugin**

- **The mapper's panel sits beside the board**, outside the canvas, where every other plugin has its sidebar, so switching plugins no longer shifts the screen.
- **The mapper's top bar is styled like the page ribbon**, with the same hover colours and a **Works with** section. **Share** replaces File, Connect and People.
- **The ribbon no longer has a help button** (help is the **?** in the top bar), and in pages whose column pads itself, like the Public Portal, it now runs edge to edge at the top, at the same height and place as everywhere else.
- Help: a new section, **New in 0.2: planning and maps**, with screenshots.

### A steadier screen (PR 8)

- **The sidebar doesn't move under you.** Every item is the same height, with or without a line of explanation; the label and that line each stay on one line (the full text shows on hover); the open item is no longer bolder, so words don't re-wrap when you click.
- **The sidebar keeps its place.** Clicking far down a long list (a tag in Assets, say) opens the next page with the sidebar where it was. Redraws used to lose the place too: the old code set the scroll before the new sidebar was on the page.
- **The plugin bar shows every plugin's full name**, and switching never changes the bar's size.
- **A ribbon at the top of every plugin page**, like the mapper's top bar: the trail on the left, and on the right the plugins this one works with (only those you can open) and its help. It's there on a plugin's home page too, so pages no longer jump up and down as you move between them. Pages can add their own tools to it (`setRibbon`).
- **The top bar is quieter**: search, help and your profile. Dark mode and its switch are paused (everything is light for now). The server-call light is a bare green or red light beside the logo, for the platform admin only; click it for the recent calls. The "confirm your email" ribbon is paused until Dashi goes live.
- **The mapper's panel**: tools are a list, the same kind of row as the layers below, with their shortcut key. Drag a section by its grip to reorder the panel, and drag the panel's edge to resize it. Both are remembered.
- **Fixed**: text marked to sit on its own line (a workplan's path in Workplan completion, and about 25 other places) was floating over the rows below, because the Planning Studio's canvas blocks shared its class name.

### Help tutorials and the 0.2.0-alpha release (PR 6)

- **New in alpha 0.2**, a new Help section at the top: step-by-step guides with screenshots for plugin access, your own colours, live edit, the Podcast Studio, the asset map and the form designer, plus where things moved. It reaches servers whose help was already edited, too.
- Help pages can show screenshots with `[[shot:<id>]]` (files in `media/help/`, captions in `HELP_SHOTS`), and the help editor has an **Insert a screenshot** menu.
- Known limits now mention the studio's WAV-only export.
- The version is now **0.2.0-alpha**. Fixes and polish from testing will be 0.2.1-alpha, 0.2.2-alpha and so on.

### Asset map and form designer (PR 4)

**The asset map, calmer and hands-on** (Assets → Map):

- **Click a wedge to drill in.** Each of the six ABCD types opens on its own, its assets laid out in tidy rows with their links drawn as soft curves. "All six" goes back.
- **Less crowded.** The overview shows each wedge's name, count and its three most-linked assets, then "+ N more". No more clusters of dots.
- **A clear way to add.** Every wedge has a + button, and the focused view has "Add …", for the name, what they bring and an optional link.
- **Grab and link, like a mini mapper.** Drag from an asset's ring to another asset to link them (drag again to unlink). Drag an asset onto another type's chip, or into another wedge, to re-sort it. Positions are remembered.

**Feedback forms, designed on the form itself** (Public Portal → Feedback forms → Design the form):

- **WYSIWYG**: the designer shows the form exactly as visitors see it, in the site's own colours. Click any words (title, intro, questions, hints, the button) to change them.
- **Add questions** from the palette: click to add after the selected one, or drag into place. Drag the grip to rearrange; duplicate or remove from each question's tools.
- **New kinds of answer**: 0 to 10 scale with words at each end, pick several, and headings between questions, alongside stars, yes or no, pick one, and short or long words.
- **Required questions** ("Needs an answer") and optional hints.
- **Three layouts**: a card, plain on the page, or one question at a time with a progress bar.
- **Try it** fills the form as a visitor would, without sending anything. The answers view adds bars for scales and "pick several".
- Built as a dedicated, bespoke engine (`src/site/feedbackForm.js`) rather than a third-party form service, so answers stay anonymous and in Dashi. The public site and the designer render the very same form.

### Podcast Studio (PR 5)

A multitrack editor inside Podcasts (Podcasts → Studio), for making an episode from start to finish in the browser.

- **Sessions from templates**: Interview, Solo show, Panel, Radio hour or Blank, each with voice, music and effects tracks. Sessions are kept in the podcasts document (`projects`), never public.
- **Record** on the selected track from the microphone, hearing the rest of the session as you go, with a live level meter. Takes are saved as WAV, like episode audio.
- **Import** .mp3 and .wav files (button, or drop them on a track). Bring in a station episode's audio for trailers and "previously on…" clips.
- **Arrange and edit**: drag clips between tracks with snapping, trim either edge, split at the playhead (S) or by double-clicking, duplicate, and delete. Drag fade handles or use Quick fades. Set clip volume in dB.
- **Take out a stretch of time** across every track and close the gap (drag across the ruler, then Delete). Insert silence at the playhead.
- **The toolbox**: Normalise, Tighten pauses (shortens every pause longer than half a second and keeps all tracks in step), and Trim the quiet ends.
- **Mixing**: mute, solo, volume and pan per track. Music tracks duck under voices automatically. A gentle limiter keeps the mix from clipping.
- **Chapters** from markers (M), named and moved in the Chapters tab.
- **Sound pads**: a sound board of jingles, stings and beds. Tap to play (keys 1 to 9), or insert at the playhead.
- **Undo and redo** for every edit, plus keyboard shortcuts for the rest (listed in the Shortcuts tab).
- **Out**: download the mix as WAV, or **send it to the station** as a draft episode with its chapters (or update the episode it became). WAV only for now; MP3 needs an encoder we haven't added yet.
- The server's permissions policy now lets Dashi's own pages use the microphone (`microphone=(self)`). Camera, location and payment stay off.

### Palette builder, the station's own colours, live edit (PR 3)

- **Palette builder** in Public Portal → Look and feel → Colours and shape. Start from any palette, then adjust any colour (main, second, accent, dark, page, text) with a colour picker, hex code, shade strip and hue, strength and lightness sliders. The preview follows while a slider moves. Each colour's text stays readable on its own, the builder shows the contrast ratio (AA/AAA), and "fix the text colours" repairs unreadable pairs. An adjusted palette remembers where it started ("Emerald, adjusted", with "Back to Emerald").
- **Brand palettes**: save an adjusted palette by name (`org.palettes`) and pick it again on any site or on the podcast station.
- **The podcast station's own colours**, in Podcasts → Public station: "Same as the site" or a palette of its own (`station.look.theme`), kept inside Podcasts. Station, series and episode pages wear it; the shape still follows the site.
- **Live edit on public pages**: signed-in staff who can write pages get an "Edit this page" switch in the site's staff bar. The title and each block (paragraph, heading, list, quote, embed) are edited where they stand; drag or use the arrows to move a block, + to add one, and the bin to remove it. Saves as you go. "Edit on the page" in the Portal page editor opens it straight away.
- The block editor (`src/designer/BlockEditor.js`) and palette builder (`src/ui/PaletteBuilder.js`) are shared engines; each plugin makes its own instance and saves to its own document.

### Plugin access, enforced everywhere (PR 1)

- **The server now enforces plugin access.** Every document belongs to a plugin (Podcasts owns `podcasts`, Strategy & Work owns `strategy` and `plandocs`, and so on). Someone who can't use a plugin gets only what a visitor to the public site would see of its documents, and can't save them. Before, this was only hidden in the menus.
- **One rule, in order:** the platform, the org's plan, the org's switch, the parent plugin, the person's role, then the person themselves. The same code runs on the server and in the browser (`src/platform/access.js`).
- **Switch a plugin off (or on) for one person**, whatever their role: Organisation → Plugins, open a plugin, "For one person".
- **Sub-plugins.** A plugin can live inside a parent and only works when the parent does. Planning Studio is now inside Strategy & Work; Organisation → Plugins shows the tree.
- **No more links into closed plugins.** Every link to another plugin goes through one check, and a menu item or link to a plugin you can't use is simply not drawn (in SJR, Public Portal no longer offers Dashboards, Feedback forms or the Plan designer when those plugins are off). A test fails the build if a page hard-codes another plugin's address. Opening a closed plugin directly says why, kindly: switched off for the organisation, for your role, or for you.

### One place for each major interaction (PR 2)

- **Planning Studio is inside Strategy & Work.** The Studio's pages carry the Strategy & Work header, colour and side list (Overview, Framework, Roadmap, Plan designer), and Strategy & Work lists every plan's Studio a click away. Nothing moved in your data.
- **The Data Workbench is inside the Public Portal.** The Portal's side list has every data tool (Dashboards, Program data, Data stories, Impact calculator, Data postcards, Feedback forms, Funder reports), and the Workbench's pages show the Portal's header and its Overview and Look and feel. The **Podcast publishing** and **Publishing** mini-tools are gone: Podcasts publishes episodes itself, and each site chooses what it shows in the Portal. The Workbench's link to the roadmap only shows for people who have Strategy & Work.
- **The Library is inside Assets** (the Asset manager is now just **Assets**). Assets lists the Library's documents, bibliographies and tags; the Library's pages show Assets' header and a way back to all assets and the asset map.
- Dashboard tiles carry their sub-plugins as chips, the header shows only top-level plugins, breadcrumbs start at the parent, and the platform admin's plugin manager says which plugin each lives inside and which documents it owns.

### Domain

- **Change your Dashi address** (Organisation → Domain, and Platform admin): the field checks as you type whether the address is free and well formed (one word, letters and numbers, a dash between words, not case sensitive, unique across every org). The old address sends people on to the new one for 30 days. Your Dashi address keeps working as a mirror of your own domain.
- Fixed: Domain showed "falsefalse" on plans without custom domains.

### Light and dark

- A light/dark switch in the header, remembered per person in each browser. Until you choose, Dashi follows your device. Public sites keep their own look.

## Unreleased (alpha.10 fixes, podcasts with the episode first, and the Planning Studio)

### Planning Studio: one plan level, an easier way in, and a theory of change

- **Plans no longer sit inside plans.** The framework is the root (one per organisation) and plans sit side by side under it, each holding objectives. In the example, the 2026–2030 framework holds a Year 1 plan (running now) and a Year 2 plan (up next) as siblings; plans can overlap, as an old plan winds down while a new one starts. Any older plan inside a plan folds the same way when it opens: its objectives move up, its milestones and notes join the plan around it, and the dashboards, plan documents and Studio work that pointed at it follow along.
- **The side list stays in the Studio.** Every plan is listed, and under the open plan sit its tools in the order a planning season runs: SOAR board, Assemble, Theory of change, Results. A plan opens where you last left it ("Pick up in Assemble"). Strategy & Work and the Plan designer sit apart at the bottom under "Elsewhere in Dashi", so it's clear they open another plugin.
- Plan cards and the side list say where each plan sits in time (Running now, Up next, Finished), and a card names any plan running alongside it. The roadmap and dashboard roads can show "All plans, end to end", and the example's board scorecard road spans the whole framework.
- On the front page each plan card has a row of its tools and a "Continue" button back to where you were. The SOAR board has Board, Strengths, Opportunities and Aspirations views in one switch.
- **Theory of change**, a new planning tool. The plan reads left to right in five columns: what we do, what it produces, early changes, lasting changes, and the change we seek. "Lay it out from the plan" puts the workplans, goals, objectives and the framework's vision in place, linked the way the plan nests them. Pick a box to say where it leads, and for each "so that":
  - the assumption behind it
  - how sure you are (untested, some evidence, tested)
  - the evidence, from anything the asset chooser finds
  - a signpost: the plan measure you'll watch, and what would make you change course

  A readiness strip counts how many links have each of these. "Read as pathways" writes one pathway per lasting change, ready to copy into a plan document, a proposal or a board pack.

### Podcasts: the episode first

- **Episodes are home.** Podcasts opens on every episode: what's coming up and drafts, then what's out, narrowed by series, state or a word. Your station sits alongside at the top, with ways to its details and its public page.
- **Add an episode from anywhere**: the button on every page, or drop an .mp3 or .wav on the "Add an episode" card. It opens a tray from the side in four steps: the audio; what it is (series, season, title, summary, art, tags); who is in it; and when it goes out (publish now, schedule, or save as a draft). Episode notes, chapters, the transcript, the type and links into Dashi wait under "More details". You can start a new series right from the form.
- **Choosing who is in an episode**: the people so far as chips, the series' hosts marked and ready to add with one click, and a box that finds anyone on staff as you type (arrow keys and Enter work). People heard most on the series come first. Type a name that isn't on staff to add them as a guest; guests are named on the episode's public page too.
- **No more jumps.** An episode, its edit form and a series' settings all open in trays over the page you're on, and closing one puts you back where you were. Links from search, the dashboard and the palette open the right tray.
- **Series, not shows.** A podcast's collections are called series, so "your show was great last night" never means two things. The sidebar has Episodes, Station and Public station, then your series. "Show notes" are now "Episode notes" in the studio.
- **Station** holds the station's name, art and line-up of series (star to feature, arrows to reorder), beside a glimpse of the public station.
- On a phone, Podcasts' side list sits above the page, and side trays across the app use the whole width.

### Fixes from alpha.10

- **Links on Look and feel no longer stall.** Each site preview on the page held its own live-update connection to the server open, and browsers allow only six at a time, so following a link had to wait for one to free up. Previews now get their updates from the page around them, and pages let go of their connection when you leave.
- **Breadcrumbs line up** with the page on Podcasts (show settings, Public station), Organisation and everywhere else, instead of sitting in the corner.
- **Seasons in show settings** are a shelf of cards: each season's number, name and blurb (typed in place), its episodes' art, how many are out and when it ran, and a link to its episodes. The newest is marked current, and a dashed card starts the next season.
- **Public station designer**: the player and cover art choices are little pictures of each style, and the preview shows the player, so a change is easy to see.

## 0.1.0-alpha.10 (plugins by role, a podcast station you can design, site templates with masthead banners, and a funder report designer)

### Plugins by role

- **Organisation → Plugins** is a grid: every plugin down the side, every role across the top. Untick a box and that role stops seeing that plugin in their bar, so leaders can have a different set of tools from staff, the board or guests. Core plugins stay on for everyone.
- Two quick presets: "Same tools for everyone" and "Reading tools for the board and guests".
- Someone who follows a link to a plugin their role doesn't have gets a friendly page saying so, with a way back. (What a person can change is still decided by their role on the server.)

### Podcasts

- **Public station** has its own page in the sidebar, with the station on the right as a laptop or a phone, following every change without reloading. Pick its site, its masthead banner (the site's own, one of eight, your own picture, or none) and height, the top of the page, how the archive is laid out, the player, the art, and which shows lead and in what order.
- The overview shows a small picture of the public station and a "Design the station" button, in place of the old look settings at the bottom of the page.
- A show's episodes: the current season is open and marked, and past seasons fold away under "Past seasons".
- On the public station: the name sits over a wide banner with the latest episode lifted over its edge, and the archive is a row of shows, then season tabs, then the episodes. It can also be by month or a cover grid, and the search looks across everything.

### Public sites

- **Five templates**: Harbour (a full-width banner), Commons (split), Journal (a centred nameplate), Field (a warm paper with a rounded banner card) and Signal (a deep colour band).
- **Masthead banners** across the top of every site, drawn in your colours (ripples, hills at dawn, canopy, river, contours, confluence, tide, prairie), or your own picture with a focus slider, in three heights. Inner pages wear a slim strip of it.
- New type choices (including a grotesk and a rounded face) and three headers: light, solid, or see-through over the banner.
- The top-left "Our sites" menu lists each site with what it shows, and marks the one you're on.

### Public Portal

- **Look and feel** is a designer: templates shown as real renders of your own site, the banner, type and header for each site, and the colours and shapes shared by all of them, with the live site on the right as a laptop or a phone.
- **Every preview has a Desktop / Phone switch**, remembered across the app. The phone frame is redrawn: the page is laid out at a real phone width, sits centred, and nothing pokes out past the frame's corners.

### Data Workbench

- **Funder reports** work like the plan designer: the report as the funder will get it (a cover page, then the report) fills the canvas, and the panel on the right has two tabs. **Write** edits it section by section: rename, move, hide (the words are kept) or delete a section, or edit it all as Markdown. **Design** picks a template (Modern, Bold or Editorial), colours, type and the cover page. Print and PDF use the designed pages.
- **Board dashboard** template, beside Strategy scorecard: a short welcome, the headline numbers, how they moved together, the goal lights, what's coming up, the road, and "What we ask of the board". It goes on the board portal when there is one.

### Everywhere

- A **breadcrumb trail** at the top of every plugin page (Podcasts / STEM Voices / Settings), hidden on a plugin's own home where the big header already says it.
- New Library icon (three books on a shelf, one in the plugin's colour) and a colour dot on the Public Portal icon.
- **One look for every app screen**, set down in `.interface-design/system.md` and `interface.css`: warm paper for the page, white sheets for the work, ink for text, and each plugin's colour used only where it means something. The plugin bar is quiet, sidebars sit on the page, and cards, tables, fields and buttons share one set of edges, corners and states.
- **Keyboard friendly**: a "Skip to content" link, and a clear ring around whatever has focus, everywhere.

## 0.1.0-alpha.9 (a rethought Organisation page, the look of your sites in the Public Portal, and two new roles)

### Organisation

- **People** is a directory: find someone by name, title or email, filter by role or team, and click a person to change their details, role and teams in a side drawer. Links to a person (from search, say) open their drawer.
- **Teams** has its own page: a card for each team with its people and leads, and a drawer to rename it, pick its colour, and add or take out people.
- **Plan** looks like the pricing page and the control centre: your plan up top, a tile for each thing you use (with how full it is), the plugins and features you have, and the other plans as cards, each with "Ask to move".
- Two new roles: **Board director** and **Guest** (for advisors, funders and partners). Both read everything and change nothing, like Viewer, and the server enforces it.
- The list of other organisations on the platform is gone from here: that is the platform admin's business. Public sites and their look moved to the Public Portal.

### Public Portal

- **Look and feel** (in the sidebar, under Overview): the colour palette and shapes every site and portal uses, with a sample, and each site's hero and type at a glance.
- **Add property** on the overview's web properties panel: pick a site, page, news article, dashboard, feedback form, data story, calculator, plan or the station, and which site it goes on.
- Remove a site from its own page.

### Elsewhere

- **Platform admin**: an organisation's own limits open in a side drawer, showing each of the plan's values beside it, instead of a long list unfolding inside the table. The left menu keeps its scroll position when you click a section, and the page stays put when you switch something on or off.
- **Mapper**: zoom out, zoom level (click for 100%) and zoom in on the toolbar, beside Fit, for anyone without pinch or a scroll wheel.
- **Library**: the left panel no longer has a doubled edge.

## 0.1.0-alpha.8 (the platform control centre: data, email, payments, security and legal in one place)

### Control centre (Platform admin)

- **Health**: version, uptime, memory, disk, database size, sign-ins, backups, off-site copies and the last day's errors, with the recent error list.
- **Data**: storage per organisation, a full export of any organisation, daily snapshots, and whether Litestream is copying the database off-site, with the restore steps.
- **Email**: whether mail can be sent, a test message, the sending domain's SPF (or Postmark's Return-Path), DKIM and DMARC read live from DNS with the exact record to add, and editable invitation, reset, verification and failed-payment emails.
- **Payments**: Stripe by its secret key in Fly secrets (never shown), prices that include HST, Stripe Tax or one fixed rate, the business number on receipts, a trial, creating the prices in Stripe, a setup check, and every organisation's billing with free accounts.
- **Security**: two-step sign-in, required for platform admins on a live server; every signed-in session, signing any out; resetting someone's two-step; the security audit.
- **Activity**: every change made in the platform admin, kept a year.
- **Legal**: terms, privacy policy, accessibility statement, data processing agreement and a new security page, written to Canadian practice (PIPEDA, CASL, AODA) for a lawyer to review; each change is a new version, and people are asked to accept new terms.
- **Maintenance banner** on every page, set from Health.

### For everyone

- Two-step sign-in with an authenticator app, from your own account.
- Email addresses are confirmed with a link; organisations' admins can pay by card, monthly or yearly, and manage the card and receipts in Stripe's billing portal.
- Signing up asks you to accept the terms and privacy policy; the public site has the legal pages in its footer, and prices say they include HST.

### Running it

- The Docker image includes Litestream, which copies the database off-site within a second when `BUCKET_NAME` is set, and restores it on a new volume.
- `/.well-known/security.txt` names the security contact and the disclosure policy, with an expiry a year ahead.
- Dependabot watches the Docker base image.
- DEPLOY.md links three step-by-step guides: deploying on Fly.io; data, email and payments; security and uptime.

## 0.1.0-alpha.7 (polish: Public Portal site pages, a rethought Workbench, even plugin headers)

### Public Portal

- **Every site has its own page** in the portal: the real front page in a live, scaled preview (desktop or phone), its settings (who can see it, address, a one-line description), everything on it grouped by kind with live or in-design chips, and buttons to add a page, article, dashboard, feedback form or story.
- The web properties map now opens a site's page in the portal, instead of sending unlisted sites to Organisation settings.
- **Your sites, as visitors see them** is now a grid of cards with a live preview of each front page, replacing the hand-drawn thumbnails that broke.
- The sidebar lists every site (and the members-only ones apart), with **New site**.
- Site look (hero and type) sits under the preview, so you see the change at once.

### Data Workbench

- **Dashboards** opens on three ways to start (from an objective or goal, a strategy scorecard, or blank), then groups dashboards by who they are for: on public sites, for the board and members, and staff only. Each card shows a small picture of its layout, and can be copied.
- **Strategy scorecard** template for any org: the road, up to four headline numbers, the goal lights of the plan running today, what is coming up and the tasks.
- **Publishing** lists everything that can go on a site (dashboards, data stories, impact calculators, feedback forms) with a site picker and a Showing switch, filters for showing and not showing, and a count per site that opens the site in the Public Portal.
- **Podcast publishing** has a drag-and-drop upload card, numbers at a glance, and episode lists with cover art and dates.

### Look and feel

- Every plugin header sits the same way; the Asset manager's icon no longer hangs over the panel edge, the Organisation header has room to breathe, and plugin tabs (Critical Media) are spaced.
- Public site footers use a deep tint of the org's colour instead of black.
- Headline numbers keep their unit on one line.

## 0.1.0-alpha.6 (Public Portal, a board portal, a slicker roadmap, feedback forms and funder reports)

### Public Portal (was Web views)

- **One entry point** for everything the org shows the world: sites, dashboards, the strategic plan, the podcast station, data stories, calculators, pages, news, feedback forms and Media smart. Members-only sites (the board portal) sit in their own section.
- **What's live, at a glance**: a clickable diagram of every site and what is on it. Solid green pills are live, dashed amber pills are in design, and each pill opens where that piece is made.
- **A look per site**: pick a hero (colour band, soft wash or plain) and type (sans or serif) for each site; the thumbnail shows it.
- Older copies that still call the plugin "Web views" or "Sites & Pages" pick up the new name; a name the org chose itself is kept.

### Warmer public sites

- A sticky, softly blurred header with pill navigation, a hero with the mission and clear buttons, a strip of headline numbers lifted over it, tinted full-width bands, and dashboards in cards. Serif headings are an option. The footer carries the org and its other sites.
- Markdown tables now render on pages and documents.
- The STEM example gains a draft **Youth voices** site (unlisted) with two draft pages.

### Board portal

- The STEM example's **Board portal** is a members-only site: staff and board members who sign in see it; anyone else gets a friendly sign-in panel and a link to the public site.
- **Home**: a welcome, quick links (latest minutes, latest finance summary, the handbook), the **Board scorecard** dashboard, and cards for governance, minutes and finance.
- **Governance guides, minutes archive and finance summaries** come from the Library: any document tagged `board` plus `governance`, `minutes` or `finance` shows up. Minutes are grouped by year and searchable; each document has newer and older links, Print or save as PDF, and Edit in the Library.
- The example library now holds by-laws, a board handbook, the conflict of interest policy, committee terms of reference, the reserves policy, two finance summaries and six sets of minutes. Older copies get them once.

### Roadmap

- **Slicker road**: a soft sky and ground, a date ruler along the top, a subtle road with the travelled stretch darker, glowing lights, milestone pennants below the road, white goal signs and a chequered finish line.
- **Today** is a pulsing beacon with a dashed line and a dated chip, in place of the car.
- **Scrolling is obvious**: fading edges with round arrow buttons, a minimap strip below the road with a draggable window, the mouse wheel and arrow, Page, Home and End keys all slide the road, and a hint line says so.

### Data Workbench

- **Strategy in dashboards**: four new widgets, *The road so far* (a compact roadmap), *Goal lights* (a light per workplan, goal by goal), *Next milestones* and *Work progress*, under "From your strategy" in the designer. Each has a table view.
- **Board scorecard**: a private example dashboard on the board portal built from them, plus four headline measures.
- **Feedback forms** (new): a few short questions (1 to 5 rating, yes or no, pick one, or in their words) under every dashboard on a site or at the bottom of its front page. Answers are anonymous and come back to the Workbench, summed up question by question. Visitors can answer but never read the answers. A members-only form can sit on the board portal.
- **Funder reports** (new): pick a funder, a period, the objectives and goals they fund, the measures and the data stories, and Dashi writes a first draft: in brief, a table of the numbers, the work and its milestones, stories, what is next, and thanks. Edit the Markdown beside a live preview, then print it as a PDF, save it to the Library, or mark it as sent.
- The Workbench overview counts feedback answers and reports, and shows your plan's road.

### Under the hood

- `POST /api/feedback` stores answers with a rate limit and a honeypot field; a form only takes answers if it is public on a public site, or the sender is a member.
- Visitors never receive the library, the feedback answers, funder reports or anything on a members-only site; a private site goes out only as its name and look.

## 0.1.0-alpha.5 (strategy and work, Planning Studio, plan designer, five plugins)

### Strategy & Work

- **Landing page**: calmer, with a road thumbnail of the current plan (traffic lights passed and ahead) in place of the dense nested boxes.
- **Narrower tree** on the left: titles wrap to two lines, the path to the selected item is bold, and the selected row has a bar instead of a filled box.
- **Roadmap as a sliding road**: lights you have passed sit on the left in green, amber or red; red lights for work still ahead run out to the right. Milestones are flags, goals are road signs with their dates, and labels no longer overlap. Pick the plan, zoom by year, quarter or month, and slide with the arrows or Today.
- **New views**: plans, objectives and goals open on **Lanes** (swimlanes from plan down to task, with a condensed Gantt that clicks through to the full Gantt). Workplans open on a **Board** of their tasks by status, topped by a strip showing progress against expected, what's due next and who is on it.
- **Big teams**: staff show as avatar stacks, and a people picker (search, team filters, "add the whole team") replaces long lists and dropdowns, here and on Studio planning teams.
- **Toolbox links fixed**: a PDF opens the document itself (uploaded files open in a new tab), a staff member opens their asset card, and an outside person opens the Asset manager searched for them, with "Give them a card here" if they have none yet.
- **Example data remade**: a five-year master plan with Year 1 and Year 2 plans, plan and goal milestones, and finished, behind and missed workplans so the road shows every colour. The Partner check-in guide is now a real PDF.

### Planning Studio

- Opens on **Framework and plans**: mission, vision and values to edit in place, then each plan as a card (nested under its parent) with progress, time, objectives in their colours, SOAR counts, the team and buttons for SOAR, Work and Design.
- Strategy and the Studio share one look for framework elements (level badges, progress rings, objective colours), and link to each other both ways ("Plan it with your team").
- The **plan designer** now lives in the Studio.

### Plan designer

- **Text toolbar**: select text in the plan to get bold, italic, underline, strike, colour and highlight, size, links, headings, lists, quotes, alignment and clear formatting. Formatting is kept and shows on published plans.
- **16 palettes** plus the org's own and DaisyUI's, as swatches, and custom main, second, third and paper colours.
- **Type**: eight heading and body fonts and three text sizes.
- **Backgrounds**: plain, tint, gradient, dots, grid, lines, corner, waves, or an image, with a strength slider.
- **Cover layouts**: template, full bleed, split, band and type only.

### Plugins

- First releases (1.0.0) of **Plain Words**, **AI Policy Studio**, **AI Use Register** and **Prompt Commons**, each with a working page of its own (records stay available as tables underneath).
- Only **Plain Words** is on by default. The others are off until an org switches them on; the platform admin sets this per plugin ("On unless the org switches it off").
- New **Critical Media** plugin: ten original lessons for adult and youth groups, built on the approach of NALA's *Facts Matter* resource and Be Media Smart (credited on every page), plus the Stop, Think, Check toolkit. When an org switches it on, its public sites get a **Media smart** page and, beside articles and dashboards, a short tip pointing to a matching lesson. It is on for the example STEM org.

## 0.1.0-alpha.4 (header and search, org home, asset thumbnails, Library front page, Podcasts studio)

### Header and search

- **Calmer header**: the Dashi logo comes first and stays put, then the organisation's name. Search, the saved light, help and your profile sit on the right. The organisation logo spot is gone.
- **Plugin bar** below: one icon per plugin with a tooltip. The plugin you're in shows its name.
- **Profile menu**: your details, profile, organisation settings and sign out. Superadmins switch organisations (or open Platform admin) from here.
- **Saved light**: the light sits on the right of a fixed-width button, so "Saving…" and "Saved" no longer make the header jump.
- **Search everything** (Ctrl/⌘ K): one box searches titles, raw text, tags, map actors and connectors, strategy, library items (abstracts, bodies and PDF notes), assets, people, podcast shows and episodes (notes, transcripts and chapters), and pages. Results drop down by place, and "See all results" opens a full results page with a filter for each place. Narrow a search with `tag:north`, `#north` or `in:maps`. Opening an actor result opens its map with the actor selected.

### Org home page

- A real front page: a greeting and the mission, quick actions in each plugin's colour (map the ecosystem, add a task, add a reading, upload assets, new episode), **What needs you** (your tasks, then the team's tasks due soon), **What's moving** (maps, readings, assets, episodes), strategy progress, a miniature of your latest map, the team, your reading tags and your sites. Your plugins follow, and each plugin tile lights up in its own colour on hover.

### Asset manager

- Uses the same folding sidebar as every other plugin.
- **Smaller tiles by default**, with small, medium and large sizes next to the view switcher.
- **Thumbnails everywhere**: miniature renders of ecosystem maps, the first page of PDFs, text snippets from Dashi docs, notes and readings, sticky notes for actors and agents, show art for episodes, and calm stand-in nature scenes (hills, mountains, water, forest, fields, stones, dunes, leaves, ripples) in the ABCD colour for everything else. Stand-ins are drawn by Dashi as SVG from each asset's key: no image library to fetch or license, and the same asset always gets the same picture.

### Library

- Opens on an **Add a reading** bar: folded by default, but first on the page and clearly marked.
- Tags moved into a narrow panel on the right, so the document list comes first.

### Podcasts, reimagined

- **Cover art everywhere**: every show and episode without art of its own gets generated art (a nature scene in the show's colour, with its title). Pick the colour, or upload your own art for a show or a single episode.
- **Station**: shows as cover cards (star to feature, arrows to order), what's coming up and recently published, the public page, and how it looks.
- **Shows**: a header with the cover, hosts and actions, then episodes by season with filters (season, published, scheduled, drafts) and search. Pick an episode and its details open on the right: play, status, people, chapters (click to play from there), tags, show notes, transcript, and **Related in Dashi** (maps and readings it talks about, never shown publicly). Publish now or move to drafts in one click.
- **Editing** in the same panel: drop in the audio, then title, summary, season and type, status and date, art, people, tags, chapters, notes, transcript and related items.
- **Settings** tab per show: art and colour, details, hosts, seasons, and where else to listen (Apple Podcasts, Spotify, YouTube, website).
- **All episodes**: every episode of every show in one list.
- **Public pages**: art on every episode, chapters, transcripts, tags, listen-on buttons and a share button.
- Episodes appear in org search and in the Asset manager with their art.

## 0.1.0-alpha.3 (mapper rework, Asset manager, literature Library, AI plugin drafts)

### Ecosystem Mapper

- **Sticky notes**: actors and agents are now notes with a name and a short description (the agent keeps its notched corner). Longer details live in the details panel. Text is larger, and when you zoom out far the notes show just a big name, so maps read on a 13" laptop.
- **Stronger zones**: the lens regions have deeper tints, darker outlines and labels. Clicking a layer pulses its objects for longer (about three seconds), and connectors and groups on the layer glow too.
- **Hover cards**: rest the pointer on an actor, agent, connector or group for a moment and a card shows its name, description, what it links to, its zone, layer and groups. Turn them off in View.
- **One panel** down the left with folding sections: Tools, Layers, Inspector (open by default, edit name, description and details in place) and Maps. Tuck it into a slim rail with `\`. The board has a light dotted grid.
- **Top toolbar** reorganised: name and map type, undo and redo, Fit and Tidy, then **View** (panel sections, side, fold, grid, hover cards, zoom), **File** (new, open, save a copy, export PNG, map details), **Connect** (use the map or an actor in Strategy workplans and tasks, file it in the Asset manager, copy it to the Library), **People** (who can see and edit the map) and Help.
- **Tidy keeps your layout**: tidying arranges the map for the current map type only, and remembers that arrangement per type. Your own placement is never overwritten, so switching map types keeps every detail; "Back to my layout" undoes a tidy. Linear and planar lenses no longer collapse onto one line.
- The board no longer flashes at a large size when the mapper opens.

### Asset manager (new, on every plan)

- One place for everything the organisation has to work with: uploaded files, links, notes, and (live, from the rest of Dashi) ecosystem maps, actors and agents, people, library items and podcast episodes.
- **ABCD lens** (asset-based community development): individuals, associations, institutions, physical, economic and cultural assets. Maps and people are sorted with a sensible first guess you can change.
- **Tiles, list and an asset map**: the map shows the six ABCD wedges around your organisation; drag an asset into a wedge to sort it, and lines show related assets and actors linked on their map.
- **Collections** (nested) and **tags**; drag cards onto a collection or an ABCD type in the sidebar, or choose several and tag or file them together. Search understands `tag:`, `type:` and `abcd:`.
- **Details**: preview (images, PDFs, audio, video), description, metadata (creator, date, source, licence, place, language, alt text), sensitivity (public, internal, restricted), related assets, comments and an activity feed.
- **Uploads** go up in resumable chunks, two at a time, with a progress tray; drop files anywhere on the page. The server checks each file's first bytes and refuses web pages, scripts and SVG.

### Library, now for literature

- **Citation styles**: APA 7, Chicago author-date (17th), MLA 9 and Harvard (Cite Them Right), for item references, in-text citations and bibliography reference lists (and their PDF, Word and other exports). The choice is remembered.
- **Zotero and reference managers**: import CSL JSON, BibTeX or RIS; export any folder, view or bibliography as CSL JSON, BibTeX or RIS.
- **PDF reader** (pdf.js, vendored in `vendor/pdfjs`): read a PDF in the library, select text to highlight it in four colours or note it, add notes to a page, jump between notes and pages, copy a quote with its citation, export notes as Markdown, or add them to the source's annotation in a bibliography.

### New plugins, drafted in the designer

Four plugins are roughed in as drafts (status "in development") in **Platform admin → Plugins**, with features and data models to shape over the next revisions:

- **AI Policy Studio**: frame the organisation's AI policy together (principles, which uses are fine, careful or off-limits, data that never goes in, review dates).
- **AI Use Register**: an honest record of the AI tools the team uses, what for, what goes in, the cost and the risk.
- **Prompt Commons**: shared recipes for free and accessible AI tools, with examples and the care each one needs.
- **Plain Words**: an accessibility kit for what you publish (reading level, plain-language rewrites, alt text, captions) with free, in-browser tools.

### Also

- The sales site's hero shows the ripple rings without the plugin icons.

## 0.1.0-alpha.2 (new look and plugin management)

### New look

- **Ripple**, Dashi's new mark: three rings that touch at one point, like a drop landing in broth (and the micro, meso and macro rings of the Mapper). It is in the header, the sign-in pages, the platform console, the sales site and the browser tab (`media/brand/`). The name is set lowercase, `dashi`.
- **Section icons** in Dashi's own "Grid" style: circles, squares and straight lines with one accent piece in each plugin's colour, for Home, Mapper, Strategy, Studio, Data, Podcasts, Library, Web views, Organisation, Help and Plugins (`src/ui/icons.js`).
- **Phosphor icons** (regular weight, MIT, vendored as path data in `src/ui/phosphor.js`) for everything else: buttons, menus, tools.
- **Sales site**: a new hero built from the ripple, with the plugins sitting on its rings; the feature cards no longer leave a ragged last row.

### Saving you can see

- A **save light** in every header: green when everything is on the server, amber while saving or loading (or when a change is about to be saved), red when a save failed or the server can't be reached, grey when the page keeps work in this browser. It counts every call to the server, wherever it is made. Click it for the last few calls, with timings. Leaving while a save is still on its way asks first.

### Dashi dialogs everywhere

- Every `alert()`, `confirm()` and `prompt()` (about 75 of them: New map, new docs, folders, shows, plans, deletes, password resets…) is now a themed Dashi dialog (`src/ui/dialog.js`): `uiAlert`, `uiConfirm`, `uiPrompt`, `uiForm` and `uiPanel`. Risky actions get a red button. Adding a web page or Google Doc to the Library, and renaming a bibliography, are now one form instead of two prompts.

### Plugins: a registry, a designer, packages

- **Platform admin → Plugins** lists every plugin with its version, status, features, data model and how many organisations use it.
- **The plugin designer** (`#plugins/<id>`): name and description, category and status (installed, switched off, in development); look and feel (tone, icon from Dashi's and Phosphor's sets, soft or solid tile) with a live preview of the header and dashboard card; features (switch on or off, and choose which plans get each one); the data model (documents, collections, fields and their types); versions (release a fix, feature or major version with notes; roll back to any of the last ten); and the package (export as JSON, update from a file, reset a built-in plugin, uninstall an added one).
- **New plugin** starts a draft with one list of records. Released, it shows in every organisation's header and dashboard, with a page generated from its data model where staff add and edit records (`plugin.html?id=<id>`), kept in the org's own documents.
- **Install or update** takes a package exported from any Dashi server. A package only ever carries a manifest (never code), is checked, and unknown fields are dropped. Updating needs a newer version; the old one is kept for rollback.
- Switching a plugin off, or leaving an added plugin out of a plan, pauses it for every organisation at once. Pages can ask `featureOn(plugin, feature, tier)`.

### Platform admin

- **Manage organisations**: the Plan menu no longer draws its arrow over the plan name. Each organisation's plugins are one row of icons in the registry's order (on, paused, switched off by the org, or not in its plan), with a count, a legend, and one click to switch.
- **Organisation → Plugins** shows each plugin's category, version and features, with a lock on features the org's plan leaves out.

### My profile and work

- Rebuilt: a header with your picture, greeting, title, pronouns, contact details and teams, and a row of numbers (open, overdue, due in two weeks, workplans, maps, dashboards).
- **Edit profile** opens one form: name, pronouns, title, email (locked if your admin manages it), phone, where you work, and a short bio.
- Tasks are grouped into Overdue, Next two weeks, Later and Done. Workplans show progress bars. The side column holds About me, the areas you follow (chosen in a dialog), your maps, dashboards and shows. The two columns no longer push each other down.

### Fixed

- A server test assumed scheduled podcast episodes are always in the future; it now checks against today's date.

## 0.1.0-alpha.1 (first tester release)

The first version meant for people other than its makers. It brings together everything built so far (pull requests #1 to #8) and the fixes and additions below (#9).

### What was already there (#1 to #8)

- **Ecosystem Mapper**: actors, agents, connectors and loops through five systems lenses; many maps per org; dockable tool panels.
- **Strategy & Work**: plans, objectives, goals, workplans and tasks, with Gantt charts, task timelines, measures and toolboxes of assets.
- **Workbench**: dashboard designer, program data, publishing to sites.
- **Podcasts**, **Sites & Pages** and public sites in each org's theme.
- **Library**: documents, folders, annotated bibliographies, lexicons and weekly reading logs.
- **Organisation**, **My profile** and **Help**.
- **Platform server**: many orgs on subdomains, sign-in (password, Google, Facebook, Microsoft), roles, hosted data with live updates, uploads, backups, a security audit, custom domains.

### Fixed

- Staff could not save their own profile (the server refused the whole org document). They can now change their own name, title, picture, interests, bio, pronouns and phone, and nothing else.
- **My profile** broke for someone signed in who isn't on an org's staff list, and could show the admin's profile instead. They now get a clear "you're not a member here" page.
- Two people saving the same document could silently overwrite each other's work. The server now refuses a save made from an out-of-date copy, and the page offers to reload.
- The test sign-in listed every person in one long list. It's now grouped by org and role, with a search box.
- The header added its listeners again on every redraw.
- Mapper: the **Panels** menu could open underneath the panels.

### Added

- **Feedback button** on every page: report a problem, ask a question or suggest an idea. It can include technical details (page, browser, recent errors), and shows exactly what is sent.
- **Support tickets**: **Help → Support** lists your tickets and their replies. **Platform admin → Support** is the queue for the platform admin, with status, priority, replies and internal notes. Email notices when mail is set up.
- **Testing Dashi (alpha)** section in Help: welcome, what to try, how to report, known limits, and what happens to your data.
- **Password reset** and **invitations** by email (Postmark or Resend). Organisation → People shows when each person last signed in, with an Invite or "Send sign-in link" button.
- **Staging mode** (`STAGING=true`): test sign-in and example orgs on a hosted server, a "test server" banner, and an optional access code for the whole site.
- **Version badge** and `/version`.
- Mapper **Panels** menu: dock each panel left or right or float it, reorder, gather, fold and unfold all, tidy, reset. Floating panels come to the front when used. Quick tooltips across the Mapper.
- Library **Add a reading**: upload a file, paste a link or pick a Dashi document, then annotate, tag and file it in a bibliography, all in one form on the library's home page.
- Library **tags**: a tag cloud, a page per tag, rename and merge tags everywhere, and tag suggestions from the bibliography's lexicon. A "What we're reading about" cloud on the dashboard.
- Weekly **briefs** laid out by STEEPLE, micro/meso/macro, the Water of Systems Change, themes or any lexicon facet, with gaps shown. Recommendations, resources and a 500-word state of play counter.
- **Ecosystem maps as assets**: pick a whole map as an asset, keep a map as a file in the library (**To library** in the Mapper), and open a library map file in the Mapper.

### Known limits

See **Help → Testing Dashi (alpha) → Known limits**. In short: no payments yet, no two-factor sign-in, two people editing the same document at once get a reload prompt rather than live co-editing, and one server holds everything.
