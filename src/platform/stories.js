/**
 * Story cards (alpha 0.3): a native Dashi type in the Asset manager. A story
 * card is a short, pithy piece of content that can be reused anywhere: on a
 * page of a plan document, on a public site, later on a podcast slide.
 *
 * It is an asset item of kind 'story' in the 'assets' document:
 *
 *   { id, kind: 'story', title, tags, …the usual asset fields…,
 *     story: { subtitle, body, images: [Image, Image?], form } }
 *
 * `body` is plain text with line breaks (no markup), so a card reads the same
 * on paper, on a site and in a feed. Image is { url, alt, credit, photoId? }.
 * `form` says what kind of piece it is, and how long it should be:
 *
 *   chunk      a story chunk: one pithy moment          ~80 words
 *   social     a social post: a caption and a picture   ~60 words
 *   paragraph  a paragraph: a fuller thought            ~150 words
 *   post       a blog post: a short article             ~400 words
 *
 * Pure (no DOM), so the server, seeds and tests can use it.
 */
import { uid } from '../core/ops.js';

export const STORY_FORMS = [
  { id: 'chunk', label: 'Story chunk', words: 80, hint: 'One pithy moment, a quote or a turning point' },
  { id: 'social', label: 'Social post', words: 60, hint: 'A caption and a picture, like an Instagram post' },
  { id: 'paragraph', label: 'Paragraph', words: 150, hint: 'A fuller thought, a paragraph or two' },
  { id: 'post', label: 'Blog post', words: 400, hint: 'A short article with a title and a picture or two' },
];
export const storyFormById = Object.fromEntries(STORY_FORMS.map((f) => [f.id, f]));
export const MAX_STORY_IMAGES = 2;

export const wordCount = (s) => (String(s ?? '').trim().match(/\S+/g) ?? []).length;

/** A blank story card's content. */
export const blankStory = (more = {}) => ({ subtitle: '', body: '', images: [], form: 'chunk', ...more });

/** A story card as one plain object: { assetId, title, subtitle, body, images, tags, form }. */
export function storyOf(item) {
  if (!item) return null;
  const s = item.story ?? {};
  return {
    assetId: item.id,
    title: item.title ?? '',
    subtitle: s.subtitle ?? '',
    body: s.body ?? '',
    images: (s.images ?? []).filter((i) => i?.url).slice(0, MAX_STORY_IMAGES),
    tags: [...(item.tags ?? [])],
    form: storyFormById[s.form] ? s.form : 'chunk',
    updatedAt: item.updatedAt ?? item.createdAt ?? null,
  };
}

/** Every story card in an assets document, newest first. */
export const storiesIn = (hub) => Object.values(hub?.items ?? {}).filter((i) => i.kind === 'story').map(storyOf)
  .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));

/** A new story card item (put it in hub.items yourself, or use addStory). */
export function newStoryItem({ title = '', subtitle = '', body = '', images = [], tags = [], form = 'chunk', abcd = 'cultural', sensitivity = 'internal' } = {}, by = null, id = uid('story')) {
  const at = new Date().toISOString();
  return {
    id, kind: 'story', title, description: subtitle, tags: [...tags], collectionIds: [], related: [], comments: [], meta: {}, sensitivity, abcd,
    story: { subtitle, body, images: images.slice(0, MAX_STORY_IMAGES), form },
    createdAt: at, createdBy: by, updatedAt: at, updatedBy: by,
  };
}

/** Write a story's fields onto its asset item (title, tags and the story block). */
export function applyStory(item, story, by = null) {
  item.title = story.title ?? item.title;
  item.tags = [...(story.tags ?? item.tags ?? [])];
  item.description = story.subtitle ?? '';
  item.story = { subtitle: story.subtitle ?? '', body: story.body ?? '', images: (story.images ?? []).filter((i) => i?.url).slice(0, MAX_STORY_IMAGES), form: storyFormById[story.form] ? story.form : 'chunk' };
  item.updatedAt = new Date().toISOString();
  item.updatedBy = by;
  return item;
}

/** What a story says, as one line of plain text (for search and tiles). */
export const storyText = (s) => [s?.subtitle, s?.body].filter(Boolean).join(' · ');
