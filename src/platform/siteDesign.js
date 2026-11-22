/**
 * How a public site is designed (Web → Look and feel): a template
 * (the composition of every page), a masthead banner across the top, and
 * the type. Colours and shapes come from the org's theme (themes.js), so
 * every template wears the org's own palette.
 *
 * site.look = {
 *   template: 'harbour' | 'commons' | 'journal' | 'field' | 'signal',
 *   masthead: { preset: <MASTHEADS id> | 'upload' | 'none', image: dataUrl | null, height: 's' | 'm' | 'l', focus: 0..100 },
 *   type: 'sans' | 'serif' | 'rounded' | 'grotesk',
 *   header: 'light' | 'solid' | 'over',          (harbour: over the banner by default)
 *   hero,                                         older sites: band | soft | plain, read as a template
 * }
 * Pure data, so the server and tests can read it.
 */
export const TEMPLATES = [
  { id: 'harbour', label: 'Harbour', blurb: 'A full-width banner with your mission set over it, then calm white sections.', hero: 'masthead' },
  { id: 'commons', label: 'Commons', blurb: 'A colour band with the banner beside your words. Friendly and familiar.', hero: 'band' },
  { id: 'journal', label: 'Journal', blurb: 'A centred nameplate, fine rules and serif headings, like a community paper.', hero: 'plain' },
  { id: 'field', label: 'Field notes', blurb: 'Warm paper, a rounded banner card and soft tints. Unhurried.', hero: 'soft' },
  { id: 'signal', label: 'Signal', blurb: 'Deep colour, big numbers and bold type. For reports that need to land.', hero: 'band' },
];
export const templateById = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

/** Banners drawn in the org's own colours (src/site/mastheads.js), plus your own picture. */
export const MASTHEADS = [
  { id: 'ripples', label: 'Ripples', blurb: 'Rings spreading on still water' },
  { id: 'hills', label: 'Hills at dawn', blurb: 'Layered hills under a low sun' },
  { id: 'canopy', label: 'Canopy', blurb: 'A forest edge against the sky' },
  { id: 'river', label: 'River', blurb: 'A river winding through fields, from above' },
  { id: 'contours', label: 'Contours', blurb: 'Topographic lines, like a trail map' },
  { id: 'confluence', label: 'Confluence', blurb: 'People and groups, joined up' },
  { id: 'tide', label: 'Tide', blurb: 'Long waves rolling in' },
  { id: 'prairie', label: 'Prairie', blurb: 'Fields to the horizon, a wide sky' },
];
export const MASTHEAD_HEIGHTS = [{ id: 's', label: 'Slim' }, { id: 'm', label: 'Medium' }, { id: 'l', label: 'Tall' }];

export const SITE_FONTS = [
  { id: 'sans', label: 'Clean sans', blurb: 'Plain and modern' },
  { id: 'serif', label: 'Warm serif', blurb: 'Bookish headings' },
  { id: 'rounded', label: 'Friendly', blurb: 'Soft, rounded letters' },
  { id: 'grotesk', label: 'Bold grotesk', blurb: 'Tight, confident headings' },
];
export const HEADERS = [
  { id: 'light', label: 'Light', blurb: 'White bar, coloured links' },
  { id: 'solid', label: 'Solid', blurb: 'A bar in your main colour' },
  { id: 'over', label: 'Over the banner', blurb: 'See-through, on top of the banner' },
];

const LEGACY = { band: 'commons', soft: 'field', plain: 'journal' };

/** A site's design, with defaults filled in (older sites only had hero and type). */
export function siteDesign(site) {
  const look = site?.look ?? {};
  const template = templateById[look.template] ? look.template : LEGACY[look.hero] ?? 'harbour';
  const masthead = { preset: template === 'journal' ? 'contours' : 'ripples', image: null, height: template === 'harbour' ? 'l' : 'm', focus: 50, ...(look.masthead ?? {}) };
  if (masthead.preset === 'upload' && !masthead.image) masthead.preset = 'ripples';
  const type = SITE_FONTS.some((f) => f.id === look.type) ? look.type : template === 'journal' ? 'serif' : 'sans';
  const header = HEADERS.some((x) => x.id === look.header) ? look.header : template === 'harbour' ? 'over' : template === 'signal' ? 'solid' : 'light';
  return { template, masthead, type, header, hero: templateById[template].hero };
}
