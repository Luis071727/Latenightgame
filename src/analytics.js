/**
 * Event tracking, with nobody on the other end.
 *
 * There is no vendor here and no network call. `track` collects events into a
 * small ring in memory and hands them to a provider only if one has been
 * installed — which nothing in the shipped game does. That keeps the shape of
 * the instrumentation available for later without shipping a tracker, without
 * a dependency, and without anything to consent to.
 *
 * What it is for, when a provider is eventually attached: knowing where people
 * stop, which worlds they actually visit, which discoveries nobody ever finds,
 * and which rewards bring anyone back. Not who they are — there is no
 * identifier here, nothing from the device, and no free text.
 */

const RING = 100;

/** the events the game emits, named once so they cannot drift apart */
export const EVENTS = {
  sessionStart: 'session_start',
  worldEntered: 'world_entered',
  structureAwakened: 'structure_awakened',
  discoveryFound: 'discovery_found',
  collectionCompleted: 'collection_completed',
  masteryReached: 'mastery_reached',
  cosmeticUnlocked: 'cosmetic_unlocked',
  cosmeticEquipped: 'cosmetic_equipped',
  gateEntered: 'gate_entered',
  archiveOpened: 'archive_opened',
  profileOpened: 'profile_opened',
};

export function createAnalytics({ enabled = false } = {}) {
  let provider = null;
  const recent = [];
  const startedAt = Date.now();

  return {
    get enabled() { return enabled && !!provider; },

    /**
     * Attach something that wants the events. Anything with a `track(name,
     * props)` will do; if none is ever attached this whole module is a ring
     * buffer nobody reads.
     */
    use(p) {
      provider = p;
      enabled = true;
    },

    /**
     * @param name one of EVENTS
     * @param props plain scalars only — no identifiers, no free text
     */
    track(name, props = {}) {
      const e = { name, props, at: Date.now() - startedAt };
      recent.push(e);
      if (recent.length > RING) recent.shift();
      if (enabled && provider) {
        try { provider.track(name, props); } catch { /* never break the game */ }
      }
    },

    /** what has been emitted this session, for checking the wiring by hand */
    get recent() { return recent.slice(); },
  };
}
