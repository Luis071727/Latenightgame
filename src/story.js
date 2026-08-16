/**
 * The dream, telling itself.
 *
 * There is no tutorial here and there is not going to be one. Nothing in this
 * game is allowed to stop the player, wait for a button, or explain a
 * mechanic in the second person plural. What there is instead is a handful of
 * short passages that arrive low on the screen at the moment they would mean
 * something, say one true thing about where you are, and then go away.
 *
 * Every one of them does two jobs at once. It carries the framing — a wanderer
 * going through a dream picking up the pieces it has scattered — and it
 * quietly teaches the thing the player is about to need. The first-mote beat
 * is what tells you motes get put down somewhere. The first-gate beat is what
 * tells you that waking a place is what opens the way on, and that you travel
 * by walking into the light. Nobody is ever told to do anything.
 *
 * ── the rules this is written to ────────────────────────────────────────────
 *
 *   Once, ever. A beat is a thing the dream says to you the first time it is
 *   true, and never again — including across sessions, devices and months
 *   away. Persisted through the archive's milestone list, which save.js
 *   already writes, so there is no second save format to keep in step and a
 *   reset journey is taught again from the beginning exactly as it should be.
 *
 *   Never in the way. It fades in at the bottom of the frame, holds, fades
 *   out. It does not pause the world, dim it, or wait to be dismissed, and
 *   moving puts it away early — the player who already understands is never
 *   made to sit through being told.
 *
 *   Never nagging. The idle whisper is the one thing here that can speak
 *   without having been earned, so it is hedged about with every limit that
 *   seemed reasonable: only after a long stretch with no progress at all, only
 *   one at a time, never twice running with the same line, and only a few in
 *   any one visit before it gives up and lets you be. A game about not being
 *   pressured cannot have a hint system that pesters.
 *
 * All the writing lives in the two tables at the top. They are meant to be
 * rewritten without reading anything below them — nothing outside the tables
 * knows what any of the copy says.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   the copy — rewrite freely, nothing below reads it
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The beats. Keyed by id; each is one or two short lines, second person,
 * present tense. Two is the ceiling on purpose — a third line is a paragraph,
 * and a paragraph on the screen is something to be got through.
 *
 * `world:<key>` beats fire the first time that world is arrived in, and are
 * where the thread between the five places is carried.
 */
export const BEATS = {
  'first-launch': [
    'You have been here before, the way dreams are always somewhere you have been.',
    'It came apart while you were sleeping. Most of it is still lying about.',
  ],

  'first-mote': [
    'A loose piece of the dream notices you and decides to come along.',
    'It will keep to your shoulder a while, then go looking for somewhere to be set down.',
  ],

  'first-delivery': [
    'The still thing in the middle takes what you brought and stands further into the light.',
    'It has a great deal of room in it.',
  ],

  'first-awaken': [
    'Something sleeping feels you pass, and decides to be awake about it.',
    'Nothing here wakes for any reason except company.',
  ],

  'first-memory': [
    'This one has a name, and the name is yours now.',
    'Motes are the light of the place. These are the things that happened in it.',
  ],

  'first-gate-open': [
    'Out toward the edge, a ring of light has finished opening.',
    'Waking this place is what opened it. Walking into it is what carries you on.',
  ],

  'first-travel': [
    'One dream lets go and the next takes hold, gently, the way they do.',
    'Nothing you gathered was left behind. It never is.',
  ],

  'first-sanctuary': [
    'This one is yours. Everything you have carried home is standing here.',
    'So is every gap, and every gap is something still out there somewhere.',
  ],

  /* ── the five places ──────────────────────────────────────────────────── */

  'world:meadow': [
    'The dream starts the way mornings do, without ever deciding to.',
    'Whatever you left here is still out in the grass, being patient about it.',
  ],

  'world:harbor': [
    'Water remembers better than ground does, and this water has had all night.',
    'Something out there is still arriving. It has been arriving for a long time.',
  ],

  'world:grove': [
    'The light this far down has never once been to the surface, and does not miss it.',
    'Go slowly. This one gives itself up in pieces.',
  ],

  'world:garden': [
    'The last of it is out here, thrown so wide it looks like weather.',
    'The stars are in no hurry either.',
  ],

  'world:sanctuary': [
    'Nothing sleeps here and nothing is hiding.',
    'You came back, which is the only thing this place was ever for.',
  ],
};

/**
 * The idle whisper. One line each — this is a nudge, not a beat, and it is
 * speaking to someone who has been standing still not knowing what to do.
 *
 * `pick()` below chooses between them from the state of the world. The order
 * of the keys means nothing; the order of the checks in `pick()` is what
 * decides.
 */
export const WHISPERS = {
  'step-through': 'The ring is open. Walk into it whenever you feel like it.',
  'to-the-gate':  'There is a light standing out at the edge that was not there before.',
  'carry-home':   'What you are carrying would like to be set down in the middle of things.',
  'find-mote':    'Small lights drift where the ground opens out. Walk near one and it will come.',
  'wake-near':    'The tall sleeping shapes wake for anyone who passes close enough to notice.',
  'look-around':  'Something here has a name, and it is not far. Things brighten as you near them.',
  'sanctuary':    'The empty places here are the ones still out in the worlds.',
  'wander':       'There is nothing you have to do. Walking about is a whole way to spend this.',
};

/* ═══════════════════════════════════════════════════════════════════════════
   the machine
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * @param archive  for `milestone()`, which is what makes a beat once-ever
 * @param ui       for `showBeat` / `hideBeat`
 */
export function createStory({ CONFIG, archive, ui }) {
  const S = CONFIG.story;

  /* Beats wait their turn rather than talking over each other: taking the last
     mote of a delivery can wake a structure and open a gate in the same
     second, and three passages fighting for one line of the screen is exactly
     the noise this is trying not to make. */
  const queue = [];

  let showing = null;       // the id currently on screen, or null
  let held = 0;             // how long it has been up
  let gap = 0;              // enforced quiet after one goes away

  /* the whisper's book-keeping */
  let sinceProgress = 0;    // since anything at all was achieved
  let sinceWhisper = 1e9;   // since the last nudge — start ready
  let sinceArrival = 0;     // since this place was built
  let whispersHere = 0;     // ...and how many have been spent in it
  let lastWhisper = null;   // never the same line twice running

  /** queue a beat, if the dream has not already said it */
  function tell(id) {
    if (!BEATS[id]) return false;
    // `milestone` is true the first time only, and is persisted from that
    // moment — so this is the whole of "once, ever"
    if (!archive.milestone(`story:${id}`)) return false;
    queue.push(id);
    return true;
  }

  /** mark a beat as said without saying it */
  function consume(id) {
    archive.milestone(`story:${id}`);
  }

  /** anything happened that counts as getting somewhere */
  function progressed() {
    sinceProgress = 0;
  }

  /**
   * Which nudge, if any, fits where the player currently is.
   *
   * Read top to bottom: the earliest thing that is true wins, so the list is
   * in order of what would most help someone who is stuck. It only ever
   * suggests the thing they are already closest to being able to do.
   */
  function pick(s) {
    if (s.inSanctuary) return 'sanctuary';
    if (s.gateEnterable && s.gateNear) return 'step-through';
    if (s.gateEnterable) return 'to-the-gate';
    if (s.heldMotes >= S.carryHint) return 'carry-home';
    if (s.fragmentNear) return 'look-around';
    if (s.freeMotes > 0 && s.delivered === 0) return 'find-mote';
    if (s.awake === 0) return 'wake-near';
    if (s.freeMotes > 0) return 'find-mote';
    return 'wander';
  }

  /** may anything be said at this instant? */
  function canSpeak(s) {
    return s.began && !s.transitioning && !s.menuOpen;
  }

  return {
    /**
     * The title has lifted.
     *
     * On a genuinely first launch the opening beat stands in for the world's
     * own arrival line, and that line is quietly marked as said: the place you
     * wake up in is not somewhere you *arrived*, and being told about the
     * meadow's patience in the same breath as being told the dream came apart
     * is one passage too many for the first twenty seconds.
     */
    begin(worldKey) {
      if (tell('first-launch')) consume(`world:${worldKey}`);
      else tell(`world:${worldKey}`);
      progressed();
    },

    /**
     * A place has been built and the wanderer is standing in it.
     *
     * The first time home is the same shape as the first launch: the beat
     * about what the sanctuary *is* says everything its arrival line would
     * have, so the arrival line is marked said and stays out of the way.
     */
    arrive(worldKey, isHome) {
      sinceArrival = 0;
      whispersHere = 0;
      progressed();

      /* Anything still queued about *somewhere else* is now wrong. An arrival
         line exists to make walking into a place feel like a page turning, so
         one that lands after you have already left has not merely gone stale,
         it is describing the wrong room. Dropping it loses the passage for
         good, which is the right trade: it can only happen by travelling
         faster than the prose, and a gate takes minutes of waking to open. */
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].startsWith('world:') && queue[i] !== `world:${worldKey}`) {
          queue.splice(i, 1);
        }
      }

      if (isHome && tell('first-sanctuary')) {
        consume(`world:${worldKey}`);
        return;
      }
      tell(`world:${worldKey}`);
    },

    /**
     * Something happened. Every one of these resets the idle timer whether or
     * not it has a beat left to fire, so a player who is plainly getting on
     * with it is never nudged.
     */
    note(what) {
      progressed();
      switch (what) {
        case 'mote':      tell('first-mote'); break;
        case 'deliver':   tell('first-delivery'); break;
        case 'awaken':    tell('first-awaken'); break;
        case 'memory':    tell('first-memory'); break;
        case 'gate-open': tell('first-gate-open'); break;
        case 'travel':    tell('first-travel'); break;
        default: break;
      }
    },

    progressed,

    /**
     * Forget where we were in the telling. The archive's own reset has already
     * cleared which beats were said; this clears what was mid-sentence when it
     * happened, so a journey begun again is begun again cleanly.
     */
    reset() {
      queue.length = 0;
      showing = null;
      held = 0;
      gap = 0;
      lastWhisper = null;
      whispersHere = 0;
      sinceWhisper = 1e9;
      progressed();
      ui.hideBeat();
    },

    /** what is on screen, if anything — for the console */
    get saying() { return showing; },

    /**
     * @param s a reused situation object from the main loop: began,
     *   transitioning, menuOpen, moving, inSanctuary, gateEnterable, gateNear,
     *   freeMotes, heldMotes, awake, delivered, fragmentNear
     */
    update(dt, s) {
      sinceProgress += dt;
      sinceWhisper += dt;
      sinceArrival += dt;

      /* ── something is on screen ─────────────────────────────────────── */
      if (showing) {
        held += dt;
        // moving puts it away, but never before it could have been read
        const skipped = s.moving && held > S.minHoldSeconds;
        if (held > S.holdSeconds || skipped || !canSpeak(s)) {
          ui.hideBeat();
          showing = null;
          held = 0;
          gap = S.gapSeconds;
        }
        return;
      }

      if (gap > 0) { gap -= dt; return; }
      if (!canSpeak(s)) return;

      /* ── a beat is waiting ──────────────────────────────────────────── */
      if (queue.length) {
        showing = queue.shift();
        held = 0;
        ui.showBeat(BEATS[showing]);
        return;
      }

      /* ── otherwise, perhaps a whisper ───────────────────────────────────
       * Everything here is a reason not to speak. It only gets as far as the
       * last line if the player has had no progress for a good while, has not
       * just arrived, has not been nudged recently, and has not already been
       * nudged more than a couple of times in this place.
       */
      if (!S.whispers) return;
      if (sinceProgress < S.whisperAfterSeconds) return;
      if (sinceArrival < S.whisperSettleSeconds) return;
      if (sinceWhisper < S.whisperGapSeconds) return;
      if (whispersHere >= S.whispersPerVisit) return;

      let id = pick(s);
      // never the same line twice running: hearing one suggestion repeated is
      // the exact moment a gentle nudge turns into being told off
      if (id === lastWhisper) {
        if (id === 'wander') return;
        id = 'wander';
      }

      lastWhisper = id;
      sinceWhisper = 0;
      whispersHere++;
      // half the idle clock, so a whisper that goes unheeded is followed by
      // another only after a proper stretch of being left alone
      sinceProgress = S.whisperAfterSeconds * 0.5;

      showing = `whisper:${id}`;
      held = 0;
      ui.showBeat([WHISPERS[id]]);
    },
  };
}
