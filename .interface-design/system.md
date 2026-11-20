# Dashi app interface: design system

Applies to the staff app screens: dashboard, Ecosystem Mapper, plugins, Organisation, Platform admin. Not to the public pages (home, pricing, about, contact, sign-up), which follow the taste skill, and not to public sites (site.html), which wear each org's own theme.

The tokens and component rules live in `interface.css`, loaded last on every app page. Change values there, then record the decision here.

## Direction

**Who:** the director or a staff member of a small nonprofit, between programme work and a board meeting, often on a laptop, sometimes on a phone. They come in to do one thing (check what needs them, update the map, add a reading) and leave.

**Feel:** a steward's field notebook. Warm paper, white sheets, ink. Calm and unhurried, never loud. Friendly but not cute.

**Domain:** ecosystems, watersheds, ripples, loops (feedback and learning), stewardship, field notes, the community hall.

**Colour world:** recycled paper, river stone, ink, moss, clay, and each plugin's own tone as a coloured tab in the notebook.

**Signature: the ripple ring.** Dashi's mark is concentric rings, so a ring with a gap of paper is how the app says "here":
1. Keyboard focus (`--ripple`) on every link, button and tab.
2. The open plugin's tile in the header bar.
3. The plugin icon in a page header.
4. The current page in a sidebar (a dot with a soft ring).
5. The save light in the header (green dot, soft ring).

**Defaults we rejected:**
- Rainbow icon tiles for every plugin → quiet ink icons; the tone appears on hover and on the open plugin.
- A white sidebar panel beside a white content panel → the sidebar sits on the paper, the work sits on a sheet.
- Shadowed cards inside shadowed panels → borders-only inside a sheet.
- Section labels in the accent colour → small capitals in ink; colour only means identity, action or status.

## Depth

**Borders-only inside a sheet.** Hairlines in warm, low-opacity ink (`--rule`, `--rule-soft`, `--rule-strong`).
Only things that float over the page cast a shadow:
- `--lift-sheet`: the main sheet, the active plugin tab, the current sidebar item.
- `--lift-float`: menus, popovers, dock panels, the selection bar, drawers, dialogs, the Feedback button.

## Tokens

### Surfaces
```
--paper  #f3f1ec   the page
--sheet  #fffefc   where the work sits
--well   #f8f6f2   inset: fields, search, hovered rows
```
Fields are a shade darker than the sheet (inset) and turn to `--sheet` on focus.

### Ink (four levels)
```
--ink-1  #22252b   titles, values
--ink-2  #4d515a   body copy
--ink-3  #757982   labels, metadata, section labels
--ink-4  #a4a7ad   placeholders, disabled
```

### Accent
One accent per page: the open plugin's tone (`plugins.js` → `--color-primary`, set by the header). Semantic colours (success, warning, error, info) stay as they are in theme.css.

### Spacing
Base 4px. Sheet gutter 16px (8px on phones). Card padding 16 to 20px. Gaps 16 / 24 between groups.

### Radius
```
--r-control  8px    buttons, fields, chips
--r-card    12px    cards, menus, dock panels
--r-sheet   16px    the main sheet, dialogs
```

### Type
Nunito (self-hosted in vendor/fonts). Hierarchy from weight and ink before size.
- Page title 28px / 800 / ink-1 / -0.02em, `text-wrap: balance`
- Section title 18px / 750 / ink-1
- Card title 15px / 750 / ink-1
- Body 14.5px / 400 / ink-2
- Section label 11px / 750 / ink-3 / uppercase / 0.08em
- Meta 12 to 12.5px / ink-3
- Numbers: `tabular-nums` in tables, badges, counts, stats.

### Motion
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`. 150ms for hover and colour, 100ms for press (`scale(0.97)`). Never `transition: all`. `prefers-reduced-motion` drops movement.

## Patterns

### Plugin bar (header, second row)
- 36px tall links, 10px radius; icons 18px in ink-3.
- Hover: icon takes the plugin tone on a 12% tint.
- Open plugin: sheet chip with `--lift-sheet`, icon filled with the tone inside a ripple ring, name in 700 ink-1.

### Sidebar item
- 7px 10px padding, 10px radius, ink-2; hover is a 5% ink wash.
- Current: sheet chip with `--lift-sheet`, 700 ink-1, icon in the tone, a 6px tone dot with a soft ring on the right (hidden when the item has a badge or the sidebar is folded).

### Button
- Default: sheet fill, `--rule-strong` edge, ink-1 text; hover fills with `--well`.
- Primary: plugin tone with a 1px tone shadow.
- All: 8px radius, 650 weight, `scale(0.97)` on press, ripple on keyboard focus.

### Field
- `--well` fill, `--rule-strong` edge, 8px radius. Focus: sheet fill, tone edge, 3px 16% tone halo.

### Card
- Sheet fill, 1px `--rule`, 12px radius, no shadow. Linked cards: edge warms to 35% tone on hover.

### Table / list
- Header 11px / 750 / ink-3 uppercase. Rows divided by `--rule-soft`; hover fills with `--well`.

## Accessibility baseline (Vercel Web Interface Guidelines)
- A "Skip to content" link is the first Tab stop on every app page (`Shell.js`).
- Every interactive element shows the ripple on `:focus-visible`; nothing drops its outline without a replacement.
- Icon-only buttons carry `aria-label` (Menu falls back to its title).
- Avatars and logos carry width and height.
- `<meta name="theme-color">` matches the paper.
- Drawers and dialogs use `overscroll-behavior: contain`.
- Copy stays in sentence case on purpose (the house style), not Title Case.

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Borders-only inside sheets | Panels already float on paper; shadows on cards inside them doubled the layering and added weight without meaning. | 2026-11-20 |
| Sidebar on paper, not a sheet | Navigation serves content. Two white panels side by side read as peers. | 2026-11-20 |
| Ink plugin icons, tone on hover/open | Ten tinted tiles were a rainbow; one coloured tile now says where you are. | 2026-11-20 |
| Section labels in ink-3, not accent | Colour is for identity, action and status; labels are structure. | 2026-11-20 |
| Keep Nunito | Already the brand face; its warmth fits small nonprofits. Hierarchy now comes from weight and ink. | 2026-11-20 |
| New layer in `interface.css` | Reviewable and reversible on its own; older stylesheets untouched. | 2026-11-20 |
| Designers share one shape: controls left, live preview right | Look and feel, the public station and funder reports all put choices in stacked `lk-box` sheets beside a sticky preview, so one learned layout carries over. | 2026-11-20 |
| Previews tell, never reload | Iframe previews get the changed doc by `postMessage` (`dashi:org`, `dashi:podcasts`); controls redraw, the preview keeps its place. | 2026-11-20 |
| Desktop / Phone is one remembered choice | `ui/DevicePreview.js`: choosing phone once shows phones everywhere; the phone lays the page out at 390px and clips to its own rounded screen. | 2026-11-20 |
| Breadcrumbs from the sidebar | `ui/crumbs.js`: plugin, then the sidebar's open item, then what the page adds; hidden on a plugin home. | 2026-11-20 |
| Every plugin icon carries one colour element | Library gets an accent book, Public Portal an accent dot, in line with the other icons. | 2026-11-20 |

