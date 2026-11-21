/**
 * Dashi's photo library (alpha 0.3): royalty-free photos from Unsplash that
 * d chose, resized for the web and kept in media/photos/nature/. They are
 * a further option for default thumbnails in the Asset manager, and for
 * banner (masthead) and background pictures in every public property
 * designer: sites, the podcast station and the Plan designer.
 *
 *   PHOTOS                 [{ id, title, group, by, unsplash, tone, w, h }]
 *   photoUrl(p)            the wide picture (1600 px), photoThumb(p) a 480 × 300 crop
 *   photoFor(seed)         a photo picked by a seed, the same one every time
 *   photoOrNull(seed)      a photo for about half of all seeds, else null (stand-ins keep the other half)
 *   photoCredit(p)         "Photo: Name on Unsplash"
 *
 * The Unsplash licence lets anyone use the photos freely, with no credit
 * required; Dashi still shows the photographer where it can.
 */
export const PHOTO_GROUPS = [
  { id: 'nature', label: 'Nature' },
  { id: 'community', label: 'Community' },
  { id: 'abstract', label: 'Abstract' },
];
export const PHOTOS = [
  { id: 'alba-calbeto-dufb', title: 'Market stall', group: 'community', by: 'Alba Calbeto', unsplash: 'dufbtRSDycE', tone: '#7c735f', w: 1600, h: 1067 },
  { id: 'andrzej-pokrzywiec-i1gm', title: 'Autumn canal', group: 'nature', by: 'Andrzej Pokrzywiec', unsplash: 'i1gmjozst4s', tone: '#794d14', w: 1600, h: 1063 },
  { id: 'artem-kniaz-bc7z', title: 'Meadow gathering', group: 'community', by: 'Artem Kniaz', unsplash: 'bC7zaV3j7S4', tone: '#6d6b50', w: 1600, h: 1067 },
  { id: 'john-lee-omne', title: 'Mountain lake', group: 'nature', by: 'John Lee', unsplash: 'oMneOBYhJxY', tone: '#4f7e90', w: 1600, h: 1145 },
  { id: 'jordy-munoz-q_7_', title: 'Duck on still water', group: 'nature', by: 'Jordy Munoz', unsplash: 'Q_7_AXHNBkg', tone: '#e4e4e4', w: 1600, h: 900 },
  { id: 'jordy-munoz-uzx7', title: 'Statue and clock tower', group: 'community', by: 'Jordy Munoz', unsplash: 'uzX7eSBHD94', tone: '#8e8d8a', w: 1600, h: 900 },
  { id: 'kate-trysh-rkmc', title: 'Street festival', group: 'community', by: 'Kate Trysh', unsplash: 'RkMcHK9bpqc', tone: '#70766a', w: 1600, h: 1067 },
  { id: 'leftfield-corn-3bja', title: 'Glass spiral', group: 'abstract', by: 'Leftfield Corn', unsplash: '3BjagSP2-4s', tone: '#c6b8c1', w: 1600, h: 900 },
  { id: 'martin-sanchez-7zys', title: 'Colour grid', group: 'abstract', by: 'Martin Sanchez', unsplash: '7ZysQurP1Dg', tone: '#73909c', w: 1600, h: 1188 },
  { id: 'national-asian-culture-center-wc46', title: 'Culture centre', group: 'community', by: 'National Asian Culture Center', unsplash: 'wc46HqHa1l0', tone: '#71736e', w: 1600, h: 747 },
  { id: 'nicole-gaffney-j9vx', title: 'Misty forest', group: 'nature', by: 'Nicole Gaffney', unsplash: 'j9vxVCDW4bQ', tone: '#adafa4', w: 1600, h: 735 },
  { id: 'nigel-hoare-q67-', title: 'Loops on black', group: 'abstract', by: 'Nigel Hoare', unsplash: 'Q67-toSGcwc', tone: '#090808', w: 1600, h: 909 },
  { id: 'nigel-hoare-s5m9', title: 'Pop pattern', group: 'abstract', by: 'Nigel Hoare', unsplash: 'S5m9Cvxf6rg', tone: '#a363a3', w: 1600, h: 900 },
  { id: 'nigel-hoare-v-ux', title: 'Shapes on black', group: 'abstract', by: 'Nigel Hoare', unsplash: 'V-uxb6Rws84', tone: '#847873', w: 1600, h: 900 },
  { id: 'nigel-hoare-tgyz', title: 'Black and white waves', group: 'abstract', by: 'Nigel Hoare', unsplash: 'tGYzpEIjb2w', tone: '#6b6b6b', w: 1600, h: 900 },
  { id: 'rafael-peier-9dn1', title: 'Alpine lake', group: 'nature', by: 'Rafael Peier', unsplash: '9dn1AoztQZU', tone: '#577070', w: 1600, h: 452 },
  { id: 'zhang-qc-jka5', title: 'Forest signs', group: 'nature', by: 'Zhang QC', unsplash: 'JkA5jNnKl1g', tone: '#737a76', w: 1600, h: 1200 },
];
export const photoById = Object.fromEntries(PHOTOS.map((p) => [p.id, p]));
export const photoUrl = (p) => `/media/photos/nature/${p.id}.jpg`;
export const photoThumb = (p) => `/media/photos/nature/${p.id}-thumb.jpg`;
export const photoCredit = (p) => `Photo: ${p.by} on Unsplash`;
export const photoLink = (p) => `https://unsplash.com/photos/${p.unsplash}`;

function hash(s) {
  let x = 2166136261;
  for (const c of String(s)) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
/** The photo a seed gets, the same one every time. */
export const photoFor = (seed) => PHOTOS[hash(`photo:${seed}`) % PHOTOS.length];
/** About half of all seeds get a photo; the rest keep their drawn stand-in, for variety. */
export const photoOrNull = (seed) => (hash(`half:${seed}`) % 2 === 0 ? photoFor(seed) : null);
/** A photo as a masthead: the upload preset, with the photo's address and credit. */
export const photoMasthead = (p) => ({ preset: 'upload', image: photoUrl(p), photoId: p.id, credit: photoCredit(p) });
