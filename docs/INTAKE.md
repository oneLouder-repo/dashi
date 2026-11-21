# Client intake: from sign-up to a filled-in Dashi

The client test platform (`npm run clients`, see `src/platform/clients/`) was built by hand for two orgs: Social Justice Radio and Strategic AI at Actua. Both followed the same steps, which is the shape of an intake script a new client could run from their own Dashi.

## The steps

1. **Gather sources.** A website, an archive page, reports, a draft plan. For SJR, one archive page listing every show. For Actua, its public pages and reports, government programs (CanCode), partner resources (Apple, MIT RAISE, Amii) and the Tamarack mapping report.
2. **Profile and look.** Name, mission, contact, site. Colours go in `org.theme = { palette: 'custom', base, colors }` (DaisyUI colour names); a banner can be a link (`masthead.preset: 'upload'` with an image URL) until it is uploaded.
3. **Framework and plans.** One framework per org; plans side by side under it, never nested. Use the client's words; mark placeholder targets "TBC".
4. **Ecosystem map.** Actors placed on a lens by tier (`place.depth`), categorised (ally, resource, problem, gatekeeper, community, other). Every link carries `meta.basis: 'documented' | 'speculative'` and `meta.source`; speculative links go on their own layer so they can be hidden.
5. **Library and bibliography.** Links and references with full metadata (CSL-style), folders by theme, Dashi docs for summaries and drafts, an annotated bibliography whose lexicon uses the same words as the tags.
6. **Tags.** One controlled list (`ACTUA_TAGS`, `SJR_TAGS`) used everywhere, so search, bibliography groups and filters agree. The test checks no item uses a tag outside the list.
7. **Podcasts (when there's audio).** Series → seasons → episodes. Link the audio where it already lives (`audio.url`); upload later replaces it with `audio.mediaId`. Dates from file names where present, estimated otherwise, and the episode says which.

## Making it a script

- **Inputs:** a short form (name, website, sector, plan) plus any links or files the client drops in.
- **Readers:** one small reader per source type: an archive page of audio files (SJR), a report PDF (text out, then headings and findings), a list of partner sites. Each returns plain records, never documents.
- **Builders:** pure functions from records to Dashi documents, like `sjrDocs()` and `actuaDocs()` today. They can be tested without a server.
- **Review before writing:** show the client what will be created, with speculative items flagged, and let them untick things. Nothing is written until they say yes.
- **Where AI helps:** turning prose (a report, a strategy page) into candidate objectives, actors and relationships, and drafting annotations. Its output is always marked speculative until a person confirms it.
- **Where it doesn't:** facts with numbers, dates and money come from the source text or are left "TBC".

Lean first version: the archive reader (any page listing audio files) and the profile and colours step. Those two would have done most of SJR on their own.
