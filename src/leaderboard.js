/**
 * Comparing journeys, without a backend.
 *
 * Two services behind one interface. `profileService` turns the archive into
 * the small public shape another wanderer would see; `leaderboardService`
 * answers questions about how a journey sits among others. The local
 * implementation is the only one that exists today: it stores the player's own
 * profile and returns boards built from a handful of fixed example wanderers,
 * so the screen is honest about being a local thing rather than pretending to
 * be a live one.
 *
 * When a backend does arrive, it implements the same two methods and nothing
 * else in the game changes. Which is the point of writing it this way now
 * rather than building a server nobody has asked for yet.
 *
 * The boards deliberately do not rank by time played. Every category here is
 * about *what you found*, which is a thing you can be finished with — hours
 * played is not, and a board that rewards it would quietly turn a bedtime
 * game into a job.
 */

export const CATEGORIES = [
  { id: 'complete', name: 'Most Complete', of: (s) => s.completion,
    format: (v) => `${Math.round(v * 100)}%`,
    note: 'How much of everything has been found.' },
  { id: 'curious', name: 'Most Curious', of: (s) => s.discoveries,
    format: (v) => `${v}`,
    note: 'Distinct memories kept.' },
  { id: 'mastery', name: 'World Mastery', of: (s) => s.mastery,
    format: (v) => `${Math.round(v * 100)}%`,
    note: 'How well the worlds are known, across all of them.' },
  { id: 'rare', name: 'Rare Finds', of: (s) => s.rare,
    format: (v) => `${v}`,
    note: 'The things almost nobody walks past.' },
];

/**
 * A few other wanderers, so a board is never a list of one.
 *
 * These are examples, not real people, and the UI says so. They exist to show
 * what the categories mean and to give a new player a sense of the shape of
 * the thing — never to imply someone is ahead of you.
 */
const EXAMPLES = [
  { name: 'a wanderer who came before',
    summary: { completion: 0.34, discoveries: 11, mastery: 0.30, rare: 3 } },
  { name: 'someone who liked the grove',
    summary: { completion: 0.53, discoveries: 17, mastery: 0.48, rare: 5 } },
  { name: 'the one who kept going',
    summary: { completion: 0.78, discoveries: 25, mastery: 0.71, rare: 9 } },
];

export function createProfileService({ archive }) {
  return {
    /**
     * The small public shape of this wanderer.
     *
     * The title is resolved rather than handed over as a bare id: it is the
     * one thing on a profile that was *earned*, and the screen that compares
     * journeys ought to be able to show it as the badge it is rather than as
     * a slug nobody outside this file can read.
     */
    async me() {
      const s = archive.summary();
      const worn = archive.badge('title', archive.equipped('title'));
      return {
        name: archive.data.profile.name || 'a quiet wanderer',
        title: worn ? {
          id: worn.id, name: worn.name, emblem: worn.emblem,
          weight: worn.weight, note: worn.note,
        } : null,
        cloak: archive.equipped('cloak'),
        companion: archive.equipped('companion'),
        summary: s,
        local: true,
      };
    },

    setName(name) {
      archive.data.profile.name = String(name || '').slice(0, 24);
      archive.flush();
    },
  };
}

export function createLeaderboardService({ archive }) {
  return {
    /** true when these numbers are only ever local */
    get local() { return true; },

    /**
     * One board. Returns entries sorted by the category, with the player
     * marked — and never a rank presented as a loss. There is no position
     * number in the shape on purpose.
     */
    async board(categoryId) {
      const cat = CATEGORIES.find((c) => c.id === categoryId) || CATEGORIES[0];
      const mine = archive.summary();

      const entries = [
        ...EXAMPLES.map((e) => ({
          name: e.name, value: cat.of(e.summary), me: false, example: true,
        })),
        { name: 'you', value: cat.of(mine), me: true, example: false },
      ];
      entries.sort((a, b) => b.value - a.value);

      return {
        category: cat,
        entries: entries.map((e) => ({ ...e, display: cat.format(e.value) })),
        local: true,
      };
    },

    async all() {
      return Promise.all(CATEGORIES.map((c) => this.board(c.id)));
    },
  };
}
