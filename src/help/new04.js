/**
 * Help for alpha 0.4: where things are now, and a short tutorial for each
 * new feature from the last 0.4 batch. Its own file so library.js stays
 * readable; the library puts it at the top (HELP_ADDED 'new-in-0-4').
 */
export const NEW_04_HELP = {
  id: 'new-in-0-4',
  title: 'New in alpha 0.4',
  icon: 'spark',
  blurb: 'Tutorials for what 0.4 brings: real social posting, plan files, map links that land on an actor, tag suggestions, linking things into Teach, the new audio step in Listen, and searching help.',
  pages: [
    {
      id: 'whats-new-0-4',
      title: 'What’s new, and where things are',
      body: `Alpha 0.4 brings learning, place and a much bigger Rhizome, plus many small fixes from your testing. Each guide in this section takes a few minutes.

# Where things are
- **Social media** is inside **Web**. Use **Social media** on Web's ribbon, or the **Create a post** card on the dashboard. It's experimental, so switch it on first in **Organisation → Plugins** (it sits under Web).
- **Graph** is a tab of **Rhizome**, not a plugin of its own.
- **AI** is its own plugin: AI policy, the AI register, Prompt Commons and Plain Words.
- Plugins have one-word names: **Plan**, **Ecosystem**, **Assets**, **Listen**, **Web**, **Rhizome**, **Teach**, **Learn**, **Place** and **AI**.

# Small things that changed
- **Your own plugin order.** In **Organisation → Plugins**, the arrows beside each plugin move it up or down the plugin bar.
- **Two-step sign-in with a QR code.** Scan it with your authenticator app instead of typing the key.
- **Search finds help.** The search box at the top also looks through these help pages. See [Searching Dashi and its help](#new-in-0-4/searching).
- **First-run pages.** An empty plugin now says what it's for and gives you the first three steps.
- **Teach** calls streams **Packs** now. Nothing in your cartridges changes.

# Experimental plugins
Teach, Learn, Place, Rhizome, Social and AI are marked **experimental**. They work, but they may change more than the rest. They start switched off on a new organisation.`,
    },
    {
      id: 'social-posting',
      title: 'Post to social media for real',
      body: `Social makes posts from what you already have (episodes, blog posts, data and dashboards), fits them to each network and sends them out.

# Before you start
1. Switch Social on in **Organisation → Plugins** (under Web).
2. Open **Web**, then **Social media** on the ribbon.

# Connect a network
Open **Channels**. Networks come in two groups:
- **Post for real**: Bluesky, Mastodon and webhooks. Dashi posts with your own account.
- **Practice for now**: Instagram, Facebook, TikTok, YouTube and LinkedIn. Each needs an approved app before Dashi can post, so for now you can practise the whole flow and nothing leaves Dashi.

To connect:
- **Bluesky**: your handle and an **app password**, never your main password. Make one in Bluesky under Settings → Privacy and security → App passwords.
- **Mastodon**: your server (like mastodon.social) and an **access token**. Make one under Preferences → Development → New application, with permission to write statuses and media.
- **Webhook**: an address from Zapier, Make, Buffer or your own server. Add a signing secret if the other end checks signatures.

Dashi checks the details with the network as you connect. Passwords and tokens stay on the server, sealed, and are never in your organisation's documents.

On a live channel's card:
- **Check connection** signs in again without posting anything (a webhook gets a small ping instead).
- **Who sees posts** (Mastodon only): Public, Unlisted (public but kept off timelines), or Followers only. Unlisted is a good setting for your first tries.

The first time, Channels shows a short **Trying it live** checklist.

# Make a post
1. Open **Create a post** and pick what it's about: an episode, a blog post, a figure from your data, or a dashboard.
2. Tick the networks. **How it looks** shows a preview for each one, and the counter shows each network's length limit. Use a network's tab to give it its own wording.
3. Choose **Save draft**, **Schedule** with a date and time, or **Push now**.

# What happens next
- **Push now** first asks you to confirm, naming each account it will post to, then posts to the live networks straight away. Picture cards are turned into JPEGs first. The **Posted** list links to each live post.
- **Scheduled** posts go out on time, even when nobody has Dashi open. Live networks get the words and link; use **Push now** to send the picture as well.
- A network that didn't take the post shows **Try again** in the Posted list.
- A post goes to each network **at most once**, so a second press or a page reload won't post it twice.

# Tips
- Start with a webhook into your own email or Slack to see exactly what's sent.
- A token that stops working shows on **Channels**. Connect again with a new one.`,
    },
    {
      id: 'plan-files',
      title: 'Save and open plan files',
      body: `A **plan file** (\`.dashi-plan.json\`) holds one or more plans: their objectives, goals, workplans and tasks, plus their Planning Studio work (SOAR cards, results, the assemble board and the theory of change). Use it to back up a plan, share a starter plan with another organisation, or try a big change on a copy.

# Save a plan file
1. Open **Plan** (the Overview or Framework page), or **Framework and plans** in the Planning Studio.
2. Press **Save plan file**.
3. With more than one plan, tick the plans you want, then save.

# Open a plan file
1. Press **Open plan file** and pick the file.
2. The plans are added straight away, and a note says which ones.

Opening a file **always adds**: the plans come in as new plans beside the ones you have, and nothing you have is changed. A plan whose name is taken gets "(imported)" after its name. If your organisation has no framework yet, one is made from the file.

# From another organisation
People from the other organisation are left out (teams, owners and votes), and so are links into its maps, staff and library. Web links and media stay. A note says what was left out, so you can assign your own people.`,
    },
    {
      id: 'map-links',
      title: 'Links that open the map at an actor',
      body: `A link to an actor (from Assets, Teach, Place, a Rhizome finding, or search) now opens the ecosystem map **at that actor**.

# What you see
1. The map opens close on the actor, so you know at once which one it is.
2. After a moment it slowly zooms out to show the actors around it.
3. For a few seconds the actor pulses and the rest of the map dims.
4. The actor stays selected, with its details in the inspector.

Click or scroll the board to stop the zoom and the dimming at any time. If your device is set to reduce motion, the map skips the zoom.

# Share a link to an actor
Select the actor and copy the address from your browser. It ends in \`#<map>/<actor>\`. Anyone in your organisation who opens it lands on the same actor. It works for links and groups too.`,
    },
    {
      id: 'tag-suggestions',
      title: 'Tag suggestions',
      body: `Under the tag fields in **Assets**, the **Library**, **Listen** episodes and audio files, a row of **Suggested** chips offers tags. Click a chip to add it.

# Where suggestions come from
Best first:
1. **Tags you already use** on things that read alike. Rare shared words count for more.
2. **Tags the text names** outright.
3. **About 35 community-sector themes** (food, housing, youth, climate and so on), found through their cue words. If you already have your own tag for a theme, Dashi suggests yours: "hunger … pantry" suggests your existing **food** tag, not a new one.

# Good to know
- It works in your browser. Nothing is sent to an AI service.
- The more you tag, the better it gets, because your own tags count most.
- It only suggests. Nothing is tagged until you click.`,
    },
    {
      id: 'teach-linking',
      title: 'Link your things into a Teach block',
      body: `A block in Teach can link to things your organisation already has: slideshows and episodes, assets, documents, ecosystem maps, and parts of your plan.

# Link items
1. In **Teach**, click a block to open it.
2. Under **Linked to this block**, press **Link items**.
3. Search or browse the groups and press **Link** beside each thing you want, then **Done**.
4. Use the arrows to reorder them, or the ✕ to unlink one.

Each link keeps its title, so it still shows if the item is later removed.

# Swap a show
On a slideshow or episode block, **Link a different one…** swaps the show without rebuilding the block.

# See it as a learner
The cartridge bar has a **Preview** tab: the learner's view, week by week. Click a card to open that block. Linked items show under **Also in this block**. **Open in Learn** opens the real course.`,
    },
    {
      id: 'listen-audio',
      title: 'Audio for an episode, step by step',
      body: `The episode tray in **Listen** starts with **The audio**, so the sound comes first.

# The audio step
Pick one:
- **Edit in the Studio**: open this episode's session, or start one.
- **New session**: a blank Studio session from a template.
- **Upload a new file**: an MP3 or WAV from your computer.
- **Link to an audio file**: an address where the audio already lives.

# In the Studio
The Studio's side menu shows your **four latest sessions**, so you can get back to the one you were working on.

# Audio files
Click an audio file to open its tray: details, tags (with suggestions), **Save a copy**, **Edit in studio** and **Delete**.`,
    },
    {
      id: 'searching',
      title: 'Searching Dashi and its help',
      body: `The search box at the top of every page (or **Ctrl K**, **⌘K** on a Mac) finds things across your organisation and in these help pages.

# Two kinds of results
- **Your organisation**: maps and actors, Plan, Library, Assets, people, Listen and Web pages. Only what you're allowed to see, and only from plugins that are on.
- **Help**: guides and tutorials, always at the bottom of the list.

Help results are a separate list. Help pages are never added to your organisation's data, map or graph, and your data is never mixed into help.

# Narrow it down
- \`tag:north\` finds things tagged *north*.
- \`in:maps\` (or people, strategy, library, assets, podcasts, pages) looks in one place.
- \`in:help\` looks only in help.

# All results
Press **Enter**, or **See all results**, for the full page. Chips across the top filter by place, including **Help**.`,
    },
  ],
};
