/**
 * Kestrel Bay's story cards and a second plan document to play with (alpha
 * 0.3, Plan designer touch-up): a few short pieces in the Asset manager, and
 * a "Community update" doc set up from that starter with two of them on its
 * story page. Kestrel Bay is made up; so are these stories.
 *
 *   addKestrelStories(assets)               puts the cards in (idempotent by id)
 *   kestrelCommunityDoc(strategy, data, org, assets)   the draft doc, or null
 */
import { newStoryItem, storyOf } from '../stories.js';
import { photoById, photoUrl, photoCredit } from '../photos.js';
import { newPlanDoc, applyStarter, planSnapshot } from '../plandocs.js';

const pic = (id) => { const p = photoById[id]; return p ? { url: photoUrl(p), alt: p.title, credit: photoCredit(p), photoId: p.id } : null; };

export const KESTREL_STORIES = [
  { id: 'story-kestrel-boat', form: 'chunk', title: 'The first boat back on the bay', subtitle: 'Youth Paddle Days, week one',
    body: 'Amara had never held a paddle. By Friday she was steering the big canoe past the old cannery, calling the strokes for six younger kids. "I didn’t know the bay was ours too," she said.',
    images: ['john-lee-omne'], tags: ['youth', 'water'] },
  { id: 'story-kestrel-market', form: 'social', title: 'Saturday market, sixty stalls strong', subtitle: 'A small grant, a big turnout',
    body: 'Two years ago the Harbour Market was eleven tables. This weekend: sixty stalls, three languages on the signs and a queue for the bannock. Thank you, neighbours.',
    images: ['alba-calbeto-dufb'], tags: ['economy', 'neighbours'] },
  { id: 'story-kestrel-forest', form: 'paragraph', title: 'Listening to the forest trail', subtitle: 'Elders and students walk the Kestrel Ridge',
    body: 'Every autumn, Elders from the Bay walk the ridge trail with grade eight students. They name plants, tell the stories that go with them, and point out where the creek used to run before the road went in.\n\nThis year the students recorded the walk for the community podcast, and the land trust used their map to plan the new boardwalk, so the trail is safer and the stories stay with it.',
    images: ['nicole-gaffney-j9vx', 'zhang-qc-jka5'], tags: ['land', 'elders', 'learning'] },
  { id: 'story-kestrel-festival', form: 'post', title: 'What a street festival taught our grant committee', subtitle: 'Notes from the Neighbourhood Small Grants review',
    body: 'We funded the Water Street festival as a one-off. It turned into the best piece of community listening we did all year.\n\nOrganisers set up a "what should the foundation fund next?" board by the stage. More than four hundred sticky notes later, three themes stood out: places for teenagers after dark, help for newcomers finding work, and more shade on the waterfront.\n\nThose themes now shape the spring round of small grants. The committee also changed how it scores applications: lived experience counts as much as a polished budget. Next year we will bring the board back, and report on what changed because of it.',
    images: ['kate-trysh-rkmc'], tags: ['grants', 'listening', 'neighbours'] },
];

/** Put Kestrel's story cards into its assets document (missing ones only). */
export function addKestrelStories(assets) {
  const at = '2026-11-15T15:00:00.000Z';
  for (const s of KESTREL_STORIES) {
    if (assets.items[s.id]) continue;
    const item = newStoryItem({ ...s, images: s.images.map(pic).filter(Boolean) }, null, s.id);
    Object.assign(item, { createdAt: at, updatedAt: at, sensitivity: 'public' });
    assets.items[s.id] = item;
  }
  return assets;
}

/** A draft "Community update", built from the starter, with two story cards on its story page. */
export function kestrelCommunityDoc(strategy, data, org, assets) {
  const plan = Object.values(strategy?.nodes ?? {}).filter((n) => n.type === 'plan').sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  if (!plan || !planSnapshot(strategy, data, plan.id, org)) return null;
  const pd = newPlanDoc(plan.id, { id: 'pd-kestrel-community', palette: 'doc:boreal' });
  const p = photoById['nicole-gaffney-j9vx'];
  Object.assign(pd, applyStarter(pd, 'community', { photo: p ? { kind: 'url', url: photoUrl(p), alt: p.title, credit: photoCredit(p), license: 'Unsplash', source: 'library', photoId: p.id } : null }));
  const storyArea = Object.values(pd.areas).find((a) => a.kind === 'story');
  if (storyArea) storyArea.stories = ['story-kestrel-boat', 'story-kestrel-market'].map((id) => storyOf(assets.items[id])).filter(Boolean);
  const quote = Object.values(pd.areas).find((a) => a.kind === 'text');
  if (quote) Object.assign(pd.text, { [`area:${quote.id}:quote`]: 'I didn’t know the bay was ours too.', [`area:${quote.id}:title`]: 'Amara, 14, Youth Paddle Days', [`area:${quote.id}:body`]: '' });
  Object.assign(pd.text, { title: 'Community update 2026', subtitle: `${org?.name ?? 'Kestrel Bay'} · Autumn 2026` });
  return pd;
}
