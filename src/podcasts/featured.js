import { h } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { EpisodeArt } from '../site/station.js';
import { FEATURED_MAX, published } from '../platform/podcasts.js';

/**
 * Featured episodes (alpha 0.3): a managed list of 3 to 7 episodes, each
 * with a short blurb the station writes, shown on the public station's
 * home as "Featured episodes". Kept as station.featuredEpisodes =
 * [{ episodeId, blurb }], in order.
 *
 *   FeaturedEpisodesBox(ctx)  the list in Listen → Design
 *   featureToggle(ctx, e)     the star in an episode's tray
 *
 * ctx = { doc(), store, col }
 */
const listOf = (doc) => doc.station.featuredEpisodes ?? [];
const save = (ctx, list) => ctx.store.apply(ctx.col.set('station', { ...ctx.doc().station, featuredEpisodes: list }));
const label = (doc, e) => `${doc.podcasts[e.podcastId]?.title ?? ''}${e.season ? ` · S${e.season}` : ''}${e.number ? ` E${e.number}` : ''} · ${e.title}`;

export function featureToggle(ctx, e) {
  const on = listOf(ctx.doc()).some((f) => f.episodeId === e.id);
  const full = !on && listOf(ctx.doc()).length >= FEATURED_MAX;
  return h('button', {
    type: 'button', class: `btn btn-sm btn-ghost pc-feature${on ? ' on' : ''}`, 'aria-pressed': String(on), disabled: full,
    title: full ? `The station already features ${FEATURED_MAX} episodes: take one off in Design first` : on ? 'Featured on the station. Click to take it off.' : 'Feature it on the station’s home',
    onclick: () => save(ctx, on ? listOf(ctx.doc()).filter((f) => f.episodeId !== e.id) : [...listOf(ctx.doc()), { episodeId: e.id, blurb: '' }]),
  }, icon('star', 14), on ? 'Featured' : 'Feature');
}

export function FeaturedEpisodesBox(ctx) {
  const { update, after = () => {} } = ctx;
  const box = h('section', { class: 'lk-box fe-box' });
  const today = new Date().toISOString().slice(0, 10);
  const set = (list) => { update(list); draw(); after(); };
  const draw = () => {
    const doc = ctx.doc();
    const list = listOf(doc).filter((f) => doc.episodes[f.episodeId]);
    const live = Object.values(doc.episodes).filter((e) => published(e, today) && doc.podcasts[e.podcastId] && !list.some((f) => f.episodeId === e.id))
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    const listId = 'fe-eps';
    const pick = h('input', { class: 'input input-sm grow', list: listId, placeholder: list.length >= FEATURED_MAX ? `Full: ${FEATURED_MAX} is the most` : 'Find an episode to feature…', disabled: list.length >= FEATURED_MAX, 'aria-label': 'Find an episode to feature',
      onchange: (e) => {
        const ep = live.find((x) => label(doc, x) === e.target.value);
        if (ep) set([...list, { episodeId: ep.id, blurb: '' }]);
      } });
    const move = (i, d) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; set(next); };
    box.replaceChildren(
      h('div', { class: 'lk-box-head' }, h('h2', {}, 'Featured episodes'),
        h('span', { class: `muted small${list.length && (list.length < 3) ? ' fe-hint' : ''}` }, `${list.length} of ${FEATURED_MAX} · three to seven read best`)),
      list.length ? h('ol', { class: 'fe-list' }, list.map((f, i) => {
        const e = doc.episodes[f.episodeId];
        const show = doc.podcasts[e.podcastId];
        const draft = !published(e, today);
        return h('li', { class: 'fe-item' },
          EpisodeArt(e, show, 48),
          h('div', { class: 'fe-text' },
            h('strong', {}, e.title),
            h('small', { class: 'muted' }, [show?.title, e.season && `S${e.season} E${e.number ?? ''}`, draft && 'not published, so hidden'].filter(Boolean).join(' · ')),
            h('textarea', { class: 'textarea textarea-sm fe-blurb', rows: 2, maxlength: 280, placeholder: e.description ? `Why listen? (or it uses the summary: “${e.description.slice(0, 60)}…”)` : 'Why listen? A line or two for the station’s home', 'aria-label': `Blurb for ${e.title}`, value: f.blurb ?? '',
              onchange: (ev) => update(list.map((x) => (x.episodeId === e.id ? { ...x, blurb: ev.target.value.trim() } : x))) })),
          h('div', { class: 'pc-order' },
            h('button', { type: 'button', disabled: i === 0, 'aria-label': `Move ${e.title} up`, onclick: () => move(i, -1) }, icon('chevronUp', 14)),
            h('button', { type: 'button', disabled: i === list.length - 1, 'aria-label': `Move ${e.title} down`, onclick: () => move(i, 1) }, icon('chevronDown', 14))),
          h('button', { type: 'button', class: 'btn btn-ghost btn-xs btn-square', 'aria-label': `Stop featuring ${e.title}`, title: 'Take it off the list', onclick: () => set(list.filter((x) => x.episodeId !== e.id)) }, icon('x', 14)));
      })) : h('p', { class: 'muted small' }, 'Pick a few episodes to lead the station’s home, each with a line on why to listen. You can also star an episode from its page.'),
      h('div', { class: 'fe-add' }, icon('plus', 14), pick,
        h('datalist', { id: listId }, live.slice(0, 400).map((e) => h('option', { value: label(doc, e) })))));
  };
  draw();
  return box;
}
