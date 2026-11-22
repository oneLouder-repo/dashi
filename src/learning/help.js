/**
 * Teach and Learn's helper docs (eLearning stage 1). One source, two places,
 * like Rhizome's: the Help library carries this section (help.html#learning/<page>),
 * and the About tabs in Teach and Learn show the same pages.
 */
export const LEARNING_HELP_ID = 'learning';

export const LEARNING_HELP = {
  id: LEARNING_HELP_ID,
  title: 'Teach and Learn (experimental)',
  icon: 'graduation',
  blurb: 'Make courses, workshops and professional development as cartridges in Teach; take them in Learn.',
  pages: [
    {
      id: 'learning-cartridge',
      title: 'What a cartridge is',
      body: `A **cartridge** is one unit of learning: a course, a workshop, a professional development block or an open offering. Teach is where you make them; Learn is where people take them.

# Tracks and blocks
A cartridge is laid out like a song in a music editor. **Tracks** run side by side (learning content, live sessions, practice and assessment, dialogue and care, comms) and each holds **blocks**: a lesson, a slideshow podcast, a live session, a quiz, a reflection, a feedback block.

# Days, not dates
Blocks are placed on **course days**, counted from day 0, the start. A **run** pins day 0 to a real date, so the same cartridge can run again next term. The timeline shows four phases:

1. **Pre-start**: doors open, welcome and introductions.
2. **In session**: from day 0 to the end.
3. **Post-end**: late work, feedback, credentials.
4. **Archive**: kept, read-only, for learners.

# Non-linear
Tracks run at the same time, blocks can overlap, and a block can wait **after** others, so learners can choose their own way through a week.`,
    },
    {
      id: 'learning-teach',
      title: 'Making a cartridge in Teach',
      body: `Open **Teach**, pick a cartridge or press **New cartridge**.

# The timeline
- **Drag** a block to move it to another day or track. **Drag its right edge** to make it longer.
- **Click** a block to edit it in the drawer: words, timing, effort, what it waits for, transcripts and alternatives.
- **Add a block** from the floating block palette: drag a type onto a track, or click it to add it to its usual track.
- The **load meter** under the dates shows each week's hours. It turns amber, then red, when a week asks for more than you promised.
- The **pace lane** holds pace notes: what happens when, for learners or for teachers.

# Settings
**Cartridge settings** holds the title, summary, kind, run start date, the length of each phase, the hours you promise a week, and the tracks.

# Publish
**Publish** makes a new version learners can take. Learners keep the version they started.`,
    },
    {
      id: 'learning-checks',
      title: 'The checks: accessibility and UDL',
      body: `Teach checks your cartridge as you work, like a spell checker. A dot on a block means it has something to look at.

# Needs fixing before publishing
- **Alt text** on every picture (or mark it decorative).
- **A transcript or captions** for every podcast, slideshow and video.

# Worth fixing
- **Time limits** on quizzes and exams should allow extensions.
- **Weekly load** over the hours you promised.
- **Colour contrast** of text on blocks.

# Ideas
- **Many ways in** (Universal Design for Learning): each week offers content in at least two ways: read, listen or watch.
- **Presence**: each week has a teaching, a social and a reflective block.
- **Feedback loop**: work handed in gets a feedback block within two weeks.
- **Kind dates**: nothing due in the first 48 hours, or on a public holiday.
- **Reading level**: aim for grade 8 to 10.

Each check says why it matters. None of them track learners: Teach checks the design, never the people.`,
    },
    {
      id: 'learning-learn',
      title: 'Taking a course in Learn',
      body: `**Learn** opens on **My learning**: what's next, what's due this week, and each course you're in with a quiet progress line. There are no leaderboards.

# The player
Open a course to see it week by week on the left and the open block in the middle. Slideshow podcasts play right there, with a transcript under them. Press **Mark done** when you've finished a block; quizzes and shows mark themselves.

# Your settings
In **Settings** choose the text size, a dyslexia-friendly font, less motion, and captions on or off. They follow you into every course.

# Your record
**My record** shows everything Learn keeps about you, in plain words. Your reflections and notes are yours.`,
    },
  ],
};
