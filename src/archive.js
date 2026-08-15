import {
  DISCOVERIES, COLLECTIONS, MASTERY_REWARDS, TITLES, COSMETICS,
  discovery, discoveriesOf, defaultCosmetic, cosmetic, title,
  monumentForm, IS_RARE, TOTAL_DISCOVERIES,
} from './discoveries.js';
import {
  loadArchive, loadLegacyJourney, saveArchive, eraseArchive,
} from './save.js';

/**
 * The Dream Archive — everything the player keeps.
 *
 * One object owns all persistent progression: what has been found, how well
 * each world is known, what has been unlocked and what is currently worn. The
 * world modules ask it questions and tell it things; nothing else writes to it.
 *
 * Two rules shape the whole thing:
 *
 *   Nothing is ever taken away. There is no decay, no streak to break, no way
 *   to lose a discovery by not coming back. A player who leaves for a month
 *   returns to precisely what they left, which is the entire emotional
 *   difference between this and a retention machine.
 *
 *   Old saves are never wiped. A journey recorded before any of this existed
 *   is migrated forward and its awakenings and deliveries are counted toward
 *   mastery, so a returning player arrives already partway rather than at zero.
 */

export const SAVE_VERSION = 2;

/* what mastery of a world is made of, and how much each part is worth */
const MASTERY_WEIGHTS = {
  awakened: 0.40,     // structures woken, against the world's own count
  found: 0.40,        // discoveries, against how many that world holds
  monument: 0.20,     // motes delivered, against a full monument
};

function emptyWorld() {
  return {
    visits: 0,
    awakened: [],       // structure indices, for restoring a visit in progress
    bestAwakened: 0,    // the most ever woken here, which mastery counts
    delivered: 0,
    found: [],          // discovery ids found in this world
  };
}

function emptyArchive() {
  return {
    v: SAVE_VERSION,
    currentWorld: 0,
    worlds: {},                     // keyed by world key
    unlocks: { cloak: [], companion: [], monument: [], title: [] },
    equipped: {
      cloak: defaultCosmetic('cloak'),
      companion: defaultCosmetic('companion'),
      title: 'wanderer',
    },
    profile: { name: '', created: Date.now() },
    milestones: [],                 // ids of one-off things that have happened
  };
}

/**
 * Bring any saved shape forward to the current one.
 *
 * v1 was `{ world, delivered, awakened[] }` with no version field at all — the
 * shape the game shipped with before there was anything to collect. Everything
 * in it is worth something under the new rules, so it is translated rather
 * than discarded: the structures they woke and the motes they delivered
 * become mastery of the world they were last in.
 */
const MIGRATED_V1 = 'migrated:v1';

/**
 * Fold a v1 record — `{ world, delivered, awakened[] }`, the shape the game
 * shipped with before there was anything to collect — into an archive.
 *
 * Merged rather than assigned, and only ever upward: if the archive already
 * knows about more progress in that world than the old record does, the old
 * record loses. That makes this safe to attempt more than once, which matters
 * because the archive is written the moment the game starts and a v1 record
 * could otherwise be stranded behind an empty archive by one badly-timed
 * refresh.
 */
function foldLegacy(out, raw, worldKeys) {
  if (!raw || typeof raw !== 'object') return out;
  if (out.milestones.includes(MIGRATED_V1)) return out;

  const index = Number.isInteger(raw.world) ? raw.world : 0;
  const key = worldKeys[((index % worldKeys.length) + worldKeys.length) % worldKeys.length];
  if (key) {
    if (!out.worlds[key]) out.worlds[key] = emptyWorld();
    const w = out.worlds[key];
    const awakened = Array.isArray(raw.awakened) ? raw.awakened.filter(Number.isInteger) : [];
    for (const i of awakened) if (!w.awakened.includes(i)) w.awakened.push(i);
    w.visits = Math.max(w.visits, 1);
    w.bestAwakened = Math.max(w.bestAwakened, awakened.length);
    w.delivered = Math.max(w.delivered, Number.isFinite(raw.delivered) ? raw.delivered : 0);
    // only steer them back to the old world if they have not been anywhere yet
    if (!out.milestones.length) out.currentWorld = index;
  }
  out.milestones.push(MIGRATED_V1);
  return out;
}

/** Bring any saved shape forward to the current one. */
export function migrate(raw, worldKeys, legacy = null) {
  let out;

  if (raw && typeof raw === 'object' && raw.v === SAVE_VERSION) {
    const base = emptyArchive();
    out = { ...base, ...raw };
    out.unlocks = { ...base.unlocks, ...(raw.unlocks || {}) };
    out.equipped = { ...base.equipped, ...(raw.equipped || {}) };
    out.profile = { ...base.profile, ...(raw.profile || {}) };
    out.worlds = raw.worlds || {};
    out.milestones = Array.isArray(raw.milestones) ? raw.milestones : [];
    out.v = SAVE_VERSION;
  } else if (raw && typeof raw === 'object' && raw.v === undefined && 'awakened' in raw) {
    // a v1 record handed straight in as the archive
    out = foldLegacy(emptyArchive(), raw, worldKeys);
    return out;
  } else {
    out = emptyArchive();
  }

  return foldLegacy(out, legacy, worldKeys);
}

/**
 * @param worlds the WORLDS array, for keys and structure counts
 * @param monumentTarget CONFIG.motes.monumentTarget, for the monument share
 */
export function createArchive({ worlds, monumentTarget }) {
  const worldKeys = worlds.map((w) => w.key);
  let data = migrate(loadArchive(), worldKeys, loadLegacyJourney());

  // listeners for things worth telling the player about
  let onUnlock = null;
  let onCollection = null;
  let onMastery = null;

  let saveTimer = null;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 1200);
  }
  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    saveArchive(data);
  }

  function worldState(key) {
    if (!data.worlds[key]) data.worlds[key] = emptyWorld();
    return data.worlds[key];
  }

  /** how many structures a world actually has, for the mastery denominator */
  function structureCount(key) {
    const w = worlds.find((x) => x.key === key);
    return w ? w.structures.count : 1;
  }

  /**
   * Mastery of one world, 0..1, and its parts. Deliberately not an XP bar:
   * every term is something the player did on purpose and can see the state
   * of in the world itself.
   */
  function mastery(key) {
    const w = worldState(key);
    const structures = Math.max(1, structureCount(key));
    const total = Math.max(1, discoveriesOf(key).length);

    const awakened = Math.min(1, w.bestAwakened / structures);
    const found = Math.min(1, w.found.length / total);
    const monument = Math.min(1, w.delivered / Math.max(1, monumentTarget));

    const value = awakened * MASTERY_WEIGHTS.awakened
                + found * MASTERY_WEIGHTS.found
                + monument * MASTERY_WEIGHTS.monument;

    return {
      value: Math.min(1, value),
      awakened: w.bestAwakened, ofStructures: structures,
      found: w.found.length, ofDiscoveries: total,
      delivered: w.delivered, ofMonument: monumentTarget,
      visits: w.visits,
    };
  }

  /** unlock something once, and say so. Returns true if it was new. */
  function unlock(type, id, why) {
    const list = data.unlocks[type];
    if (!list || list.includes(id)) return false;
    list.push(id);
    saveSoon();
    onUnlock?.({ type, id, why });
    return true;
  }

  /** check every mastery threshold for a world and grant what has been passed */
  function checkMastery(key) {
    const m = mastery(key).value;
    for (const r of MASTERY_REWARDS[key] || []) {
      if (m + 1e-6 < r.at) continue;
      const flag = `mastery:${key}:${r.at}`;
      if (data.milestones.includes(flag)) continue;
      data.milestones.push(flag);
      unlock(r.type, r.id, `${key} mastery ${Math.round(r.at * 100)}%`);
      onMastery?.({ world: key, at: r.at, reward: r });
    }
  }

  /** ...and every set, granting its reward the moment the last piece lands */
  function checkCollections() {
    for (const c of COLLECTIONS) {
      if (data.milestones.includes(`set:${c.id}`)) continue;
      const w = worldState(c.world);
      if (!c.members.every((id) => w.found.includes(id))) continue;
      data.milestones.push(`set:${c.id}`);
      unlock(c.reward.type, c.reward.id, `completed ${c.name}`);
      onCollection?.(c);
    }
  }

  /** ...and every title whose condition is a fact about the whole journey */
  function checkTitles() {
    const s = summary();
    for (const t of TITLES) {
      if (!t.earn || data.unlocks.title.includes(t.id)) continue;
      const e = t.earn;
      const got = (e.discoveries === undefined || s.discoveries >= e.discoveries)
               && (e.rare === undefined || s.rare >= e.rare)
               && (e.collections === undefined || s.collections >= e.collections)
               && (e.worldsVisited === undefined || s.worldsVisited >= e.worldsVisited);
      if (got) unlock('title', t.id, t.note);
    }
  }

  /** everything the profile and the leaderboards are computed from */
  function summary() {
    let discoveries = 0, rare = 0, worldsVisited = 0, masterySum = 0;
    for (const key of worldKeys) {
      const w = data.worlds[key];
      if (w && w.visits > 0) worldsVisited++;
      if (w) {
        discoveries += w.found.length;
        for (const id of w.found) {
          const d = discovery(id);
          if (d && IS_RARE(d.rarity)) rare++;
        }
      }
      masterySum += mastery(key).value;
    }
    const collections = COLLECTIONS.filter(
      (c) => data.milestones.includes(`set:${c.id}`)).length;

    return {
      discoveries,
      ofDiscoveries: TOTAL_DISCOVERIES,
      completion: TOTAL_DISCOVERIES ? discoveries / TOTAL_DISCOVERIES : 0,
      rare,
      collections,
      ofCollections: COLLECTIONS.length,
      worldsVisited,
      ofWorlds: worldKeys.length,
      mastery: worldKeys.length ? masterySum / worldKeys.length : 0,
      unlocked: data.unlocks.cloak.length + data.unlocks.companion.length
              + data.unlocks.title.length + data.unlocks.monument.length,
      title: data.equipped.title,
    };
  }

  return {
    get data() { return data; },
    get version() { return data.v; },

    set onUnlock(fn) { onUnlock = fn; },
    set onCollection(fn) { onCollection = fn; },
    set onMastery(fn) { onMastery = fn; },

    flush,
    summary,
    mastery,
    worldState,

    /** where the journey currently stands, for main to resume into */
    get currentWorld() { return data.currentWorld; },
    setCurrentWorld(i) {
      if (data.currentWorld === i) return;
      data.currentWorld = i;
      saveSoon();
    },

    /** arriving somewhere: count the visit, and hand back what to restore */
    arrive(key) {
      const w = worldState(key);
      w.visits++;
      saveSoon();
      checkTitles();
      return w;
    },

    /** a structure woke. `count` is how many are awake in this world now. */
    noteAwakened(key, index, count) {
      const w = worldState(key);
      if (!w.awakened.includes(index)) w.awakened.push(index);
      if (count > w.bestAwakened) w.bestAwakened = count;
      saveSoon();
      checkMastery(key);
    },

    /** motes reached the monument */
    noteDelivered(key, total) {
      const w = worldState(key);
      if (total > w.delivered) w.delivered = total;
      saveSoon();
      checkMastery(key);
    },

    /** a world was left, or reset: forget the in-progress awakening list only */
    clearVisit(key) {
      const w = worldState(key);
      w.awakened = [];
      saveSoon();
    },

    /* ── discoveries ──────────────────────────────────────────────────── */

    has(id) {
      const d = discovery(id);
      if (!d) return false;
      const w = data.worlds[d.world];
      return !!w && w.found.includes(id);
    },

    /** every id found in a world, for deciding what still needs placing */
    foundIn(key) {
      return worldState(key).found;
    },

    /**
     * Record a find. Returns the discovery record if it was new, else null —
     * so the caller only celebrates once however many times it is called.
     */
    record(id) {
      const d = discovery(id);
      if (!d) return null;
      const w = worldState(d.world);
      if (w.found.includes(id)) return null;
      w.found.push(id);
      saveSoon();
      checkMastery(d.world);
      checkCollections();
      checkTitles();
      return d;
    },

    /* ── cosmetics ────────────────────────────────────────────────────── */

    /** is this cosmetic available to wear? defaults always are */
    owns(type, id) {
      const c = type === 'title' ? title(id) : cosmetic(type, id);
      if (c?.default) return true;
      return (data.unlocks[type] || []).includes(id);
    },

    /** everything of a kind the player may currently choose between */
    owned(type) {
      const all = type === 'title' ? TITLES : (COSMETICS[type] || []);
      return all.filter((c) => c.default || (data.unlocks[type] || []).includes(c.id));
    },

    equipped(type) { return data.equipped[type]; },

    equip(type, id) {
      if (!this.owns(type, id)) return false;
      data.equipped[type] = id;
      saveSoon();
      return true;
    },

    /** the colours the equipped cloak wants, or null to leave the world's own */
    cloakColors() {
      return cosmetic('cloak', data.equipped.cloak)?.colors ?? null;
    },

    /** the colour the equipped companion wants, or null */
    companionColor() {
      return cosmetic('companion', data.equipped.companion)?.color ?? null;
    },

    /** what the monument should look like here, from this world's mastery */
    monumentForm(key) {
      return monumentForm(mastery(key).value);
    },

    unlock,

    /** a one-off thing happened; true the first time only */
    milestone(id) {
      if (data.milestones.includes(id)) return false;
      data.milestones.push(id);
      saveSoon();
      return true;
    },
    hasMilestone(id) { return data.milestones.includes(id); },

    /** begin again — everything forgotten, deliberately and on request */
    reset() {
      eraseArchive();
      data = emptyArchive();
      flush();
    },
  };
}
