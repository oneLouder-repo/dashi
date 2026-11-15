# Changelog

Dashi uses version numbers like `0.1.0-alpha.1`. While the first number is 0, anything can change between versions. "alpha" means not yet feature complete and still likely to have bugs, but versioned, hosted and ready for invited testers. The version shows on the **alpha** badge in the header and at `/version`.

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
