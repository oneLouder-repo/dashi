/**
 * Collab, mocked (eLearning stage 1). Collab will be Dashi's whiteboard
 * plugin; a cartridge can already hold whiteboard sessions. This file is
 * the API the real plugin must meet, answered here with pretend data so a
 * whiteboard block can be placed, opened and played today.
 *
 * The real plugin's server routes (planned):
 *   POST /api/collab/boards { title, template, cartridgeId, blockId } → Board
 *   GET  /api/collab/boards/:id                                      → Board
 *   POST /api/collab/boards/:id/sessions { start, minutes, facilitator } → Session
 *   GET  /api/collab/boards/:id/export?as=png|json                   → snapshot
 *   event 'collab:session-ended' { boardId, sessionId, attended: [staffIds] }
 *
 *   Board { id, title, template, status: 'ready' | 'live' | 'ended', url, participants, snapshot }
 */
export const COLLAB_MOCK = true;

export const TEMPLATES = [
  { id: 'blank', label: 'Blank board' },
  { id: 'soar', label: 'SOAR (strengths, opportunities, aspirations, results)' },
  { id: 'affinity', label: 'Affinity map (sticky notes in groups)' },
  { id: 'journey', label: 'Journey map' },
  { id: 'fishbowl', label: 'Fishbowl questions' },
];
export const templateLabel = (id) => TEMPLATES.find((t) => t.id === id)?.label ?? 'Blank board';

const hash = (s) => [...String(s)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Make a board for a block (pretend): the same block always gets the same board. */
export function createBoard({ title = 'Whiteboard', template = 'blank', cartridgeId = '', blockId = '' } = {}) {
  const id = `brd_mock_${(hash(`${cartridgeId}:${blockId}`) % 1e6).toString(36)}`;
  return getBoard(id, { title, template });
}

/** A board's summary (pretend): a few sticky notes for the snapshot. */
export function getBoard(id, { title = 'Whiteboard', template = 'affinity' } = {}) {
  const n = hash(id);
  const notes = ['Youth programs', 'Food security', 'Seniors at home', 'Arts in the bay', 'Housing', 'Climate and coast', 'Newcomers', 'North Shore'];
  return {
    id, title, template, status: 'ready', mock: true,
    url: `#collab/${id}`,
    participants: 3 + (n % 9),
    snapshot: { notes: notes.filter((_, i) => (n >> i) & 1).slice(0, 6).concat(notes.slice(0, 2)).slice(0, 6) },
  };
}
