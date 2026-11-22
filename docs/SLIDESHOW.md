# Slideshow podcasts

A slideshow podcast is a podcast's audio with a deck of phone-card slides timed to it, like a short film. People make one in **Podcasts → Studio** (the *Slideshow podcast* template, or any session with slides), and it plays on episodes, on the station and inside Learn cartridges.

Code:

| File | What it is |
| --- | --- |
| `src/podcasts/show/format.js` | The data shape, edits, timing, budget and accessibility checks. Pure, no DOM. |
| `src/podcasts/show/face.js` | A slide as a phone card (one renderer for the editor, thumbnails, the player). |
| `src/podcasts/show/player.js` | `Screen` (frames with transitions) and `mountShow`, the embeddable player. |
| `src/podcasts/show/resolve.js` | `showFor(doc, ref)`: find a show by episode, audio file or studio session. |
| `src/podcasts/show/trials.js` | The ten Kestrel Bay trial shows (words, look, timing). |
| `src/podcasts/studio/Movie.js` | The studio's slideshow view: filmstrip, stage, inspector. |
| `server/trialShows.js` | Seeds the trial shows on `npm run clients`, making voice and music. |
| `show.css` | Card and player styles. Any page that shows a slideshow links it. |

## The shape (`dashi.slideshow`, version 1)

```js
Show  { format: 'dashi.slideshow', version: 1, id, title, duration, audioUrl, audio, slides: [Slide] }

Slide {
  id, at,                // seconds into the audio; shows until the next slide's `at`
  kind,                  // 'title' | 'point' | 'story' | 'data' | 'quote' | 'name' (a layout)
  title, subtitle,       // plain text
  blocks: [Block],       // the body, top to bottom
  tone,                  // accent colour (hex), from the colour wheel by default
  bg: { colour, image, overlay },   // card colour; optional picture URL; 0–1 shade over a full picture
  banner,                // true: the picture is a banner across the top; false: it fills the card
  ink,                   // text colour, or null to suit the background
  transition: { type, ms },  // how it arrives: 'cut' | 'fade' | 'slide' | 'push' | 'zoom' | 'wipe'
  notes,                 // the words said under it: the transcript
}

Block
  { id, type: 'text',    html }                        // b, i, u, links, line breaks only (sanitiseInline)
  { id, type: 'bullets', items: [html], ordered }
  { id, type: 'image',   src, alt, caption }
  { id, type: 'card',    card: { kind: 'stat' | 'progress' | 'quote' | 'callout', label, value, note } }
```

A card holds about 300 words, two pictures and eight blocks (`LIMITS`). `normaliseSlide()` upgrades the alpha 0.3 PR 17 slides (`{ id, at, title, body, kind, tone }`): the body becomes a text block and the tone the card colour.

Where slides live: `project.slides` (a studio session), `file.slides` (an audio file), `episode.slides` (an episode; *Send to the station* copies the session's slides onto the episode).

## Using it from another plugin

Hold a reference, never a copy:

```js
const ref = { plugin: 'podcasts', type: 'episode', id: 'ep_trial_grant-tips' };
const show = showFor(podcastsDoc, ref, { mediaUrl });          // mediaUrl from platform/media.js
const player = mountShow(el, show, { audioUrl: show.audioUrl, onEnd: () => complete(), onTime });
// player.play(), .pause(), .seek(t), .destroy()
```

Link `show.css` on the page. The player stops itself when it is taken off the page, honours reduced motion (transitions become fades), and reads each slide's title to screen readers as it changes.

## The trial shows (Kestrel Bay)

`npm run clients` adds ten shows to Kestrel Bay, in a new series **Kestrel in a Minute**: nine of about 30 to 45 seconds and one of about five minutes (*Our year, 2026*). Each is an audio file with its slides, a studio session (voice and music on their own tracks) and a published episode. Ids are stable: `ep_trial_<slug>`, `proj_trial_<slug>`, `aud_trial_<slug>`.

Slugs: `vital-signs`, `youth-panel`, `river-walk`, `food-hub`, `welcome-week`, `grant-tips`, `winter-coats`, `oral-history`, `board-101`, `year-in-review`.

The voice is made on your computer with the first speech tool it finds: macOS `say`, `espeak-ng` / `espeak`, or ffmpeg with flite. With none, the shows are music only and slides keep their timing from a reading speed. `TRIAL_VOICE=none` skips the voice. Delete `data-clients/` to make them again.

## What comes next (the plan)

1. **Clip manager.** The filmstrip grows into a clip bin: slides, then other clip kinds on the same slide track, each with `kind` (`slide` now; `youtube`, `asset`, `quiz` later). Clips can be saved to a reusable library and dropped into any show.
2. **YouTube clips that pause the podcast.** A clip `{ kind: 'youtube', at, videoId, start, end }` stops the audio at `at`, plays the public clip (YouTube IFrame API, `youtube-nocookie.com`), and resumes the audio when it ends. The timeline shows it as a gap of its own length; the player's clock counts both. Needs `frame-src` for youtube-nocookie in the CSP.
3. **Any asset in a slide.** Story cards first (asset kind `story`, src/platform/stories.js, from the Plan designer work): a story card drops onto a slide as its title, subtitle, words and pictures. Then a block `{ type: 'asset', ref: { plugin, type, id } }` shows an Assets card (a story card, a document, a map) using that plugin's own renderer, respecting the viewer's plugin access.
4. **Supplement pack.** *Download the pack* bundles the mix (MP3), the slides as a PDF (one card per page), the transcript, chapter list, the assets referenced, and a `show.json` in this format, as one zip.
5. **xAPI and Moodle.** Each play sends xAPI statements (`launched`, `progressed` with slide id and time, `completed` at the end) to an LRS through the server, and the show packages as a **cmi5** course (an AU wrapping the player plus `show.json`) for Moodle's cmi5 plugin. `xapiActivity()` in `format.js` already gives the activity definition. Learn cartridges reuse the same statements.
6. **Captions.** Slide notes become a WebVTT track on the audio, timed per slide; later, word-level timing from the speech tool.
