/**
 * Place's helper docs (Place stage 1), the pattern Rhizome started: one
 * source, two places. The Help library carries this section
 * (help.html#place/<page>), and Place's About tab shows the same pages
 * beside the map, so the quick reference and the tutorials never drift.
 */
export const PLACE_HELP_ID = 'place';

export const PLACE_HELP = {
  id: PLACE_HELP_ID,
  title: 'Place (experimental)',
  icon: 'sec-place',
  blurb: 'Your work on a real map, for place-based development: the places you work in, and the actors, assets and stories tied to them.',
  pages: [
    {
      id: 'place-start',
      title: 'Place and place-based development',
      body: `**Place-based development** starts from a place and the people in it, not from a programme. You ask what's already here, who's tied to whom, who serves where, and where the gaps are. Then you build on what the place already has.

Place puts your Dashi work on a real map so you can ask those questions:

- **Places**: the communities, neighbourhoods, sites, landmarks and regions you work in. A place can have an outline, and it can sit inside another place (Wharf Street is in Kestrel Harbour, which is in Kestrel Bay).
- **Pins**: an actor from your ecosystem maps, an asset, a story or a document, tied to a place. A pin can also mark an exact spot, and list the places it **serves**.
- **Layers**: what the map shows. Switch each one on or off in the side nav.

# Switching Place on
Place is off until your organisation switches it on. An admin turns it on in **Organisation → Plugins**, and chooses which roles can use it. Place only shows things from plugins you can open, and it never changes them: a pin lives in Place, not in the thing it points at.`,
    },
    {
      id: 'place-map',
      title: 'The map, layers and base maps',
      body: `# Moving around
Drag to move, scroll or pinch to zoom, and right-drag (or two fingers) to tilt and turn. **Fit everything** brings every place back into view.

[[shot:place-map]]

# Layers
The side nav lists the layers. Click one to switch it on or off.

- **Place outlines**: communities, neighbourhoods and regions with an outline.
- **Links**: ties between pinned actors, taken from your ecosystem maps. A dashed line is a speculative link. A thicker line means the same tie is on more than one map.
- **Who serves where**: a line from an actor to each place it serves.
- **Places**: a label for each place, with how many things are there.
- **Actors** and **Assets**: a dot for each thing with its own spot. Things pinned to a place without their own spot are listed in the place's tray instead.

# Base maps
- **Street map**: OpenStreetMap. It needs the internet.
- **Drawn map**: your organisation's own drawn coast, rivers and roads. It works offline. Kestrel Bay has one, because the bay is made up.
- **No base map**: just your places and links on a plain ground.`,
    },
    {
      id: 'place-pins',
      title: 'Places and pins',
      body: `# Add a place
Click **Add place**, then click the map where it is. The tray opens on the new place. Give it a name and a kind, say which place it sits inside, and describe it.

# Open a place
Click a place's label. Its tray shows what's **here** (things pinned to it or to a place inside it), who **serves** it from elsewhere, and the places inside it. Click any thing to open its pin.

[[shot:place-tray]]

# Pin a thing
In a place's tray, click **Pin a thing here**, search for an actor, asset, story or document, and pick it. To give it its own spot, open its pin and click **Set its spot on the map**, then click the map.

# Who serves where
In a pin's tray, tick the places it **serves**. A food bank in Birch Cove might serve Gannet Point and Millbrook too. Switch on the **Who serves where** layer to see those lines.

# Coming next
Place profiles, and Rhizome's findings on the map.`,
    },
    {
      id: 'place-data',
      title: 'Data layers and drawing',
      body: `Bring your own data onto the map, or draw routes, boundaries and spots of your own.

# Bring in a file
1. In Place's side nav, under **Data layers**, press **Bring in a file**.
2. Pick a **CSV** with latitude and longitude columns (Dashi finds them by their headings, like *lat* and *lng*), or a **GeoJSON** file.
3. The file becomes a layer, drawn under your places and pins in its own colour. Rows without a usable position are skipped, and a note says how many.

A layer holds up to 5,000 features. GeoJSON can have points, lines and areas, including their Multi- forms.

# Use a layer
- **Click a feature** to open its tray: its details and, for a line, its length.
- **Click the layer's name** in the side nav to rename it, change its colour, hide or show it, export it as GeoJSON, or remove it.

# Draw
1. Pick **Point**, **Line** or **Area** from the drawing tools over the map.
2. Click the map to add each corner.
3. **Double-click**, press **Enter**, or press **Finish** to end the shape. **Backspace** takes back the last corner, and **Esc** stops.
4. Give it a name and a note in its tray.

Everything you draw goes into the **Your drawings** layer.`,
    },
  ],
};
