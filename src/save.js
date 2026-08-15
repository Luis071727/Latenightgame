/**
 * Remembering the journey.
 *
 * Two records in localStorage, kept separate because they change for different
 * reasons: `settings` is what the player asked for and only changes when they
 * touch the settings panel; `journey` is where they are and what they have
 * woken, and changes constantly while they play.
 *
 * Everything here is best-effort. localStorage can be absent (private
 * browsing), full, or disabled, and none of that may break the scene — a
 * wander that forgets itself is still a wander.
 */

const SETTINGS_KEY = 'soft-worlds:settings';
const JOURNEY_KEY = 'soft-worlds:journey';
const ARCHIVE_KEY = 'soft-worlds:archive';

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* full or unavailable — carry on without remembering */ }
}

function erase(key) {
  try { localStorage.removeItem(key); } catch { /* likewise */ }
}

/** What the settings panel edits, with the defaults a first visit gets. */
export const DEFAULT_SETTINGS = {
  muted: false,
  musicVolume: 1,          // 0..1, scales the drone and the awakening layers
  ambienceVolume: 1,       // 0..1, scales the noise wash
  reducedMotion: null,     // null = follow the OS preference; true/false = chosen
  quality: 'auto',         // 'auto' | 'low' | 'medium' | 'high'
  pace: 'wander',          // 'stroll' | 'wander' | 'drift'
};

export function loadSettings() {
  const saved = read(SETTINGS_KEY);
  const out = { ...DEFAULT_SETTINGS };
  if (saved && typeof saved === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in saved) out[key] = saved[key];
    }
  }
  return out;
}

export function saveSettings(settings) {
  write(SETTINGS_KEY, settings);
}

/**
 * The journey: which world, what has been woken there, and how full the
 * monument is. Structure indices are stable across visits because the scatter
 * is seeded — and stable across quality tiers too, because every tier accepts
 * the same structures in the same order and only stops sooner. An index past
 * the current tier's count is simply ignored on restore.
 */
export function loadJourney() {
  const saved = read(JOURNEY_KEY);
  if (!saved || typeof saved !== 'object') return null;
  return {
    world: Number.isInteger(saved.world) ? saved.world : 0,
    delivered: Number.isFinite(saved.delivered) ? saved.delivered : 0,
    awakened: Array.isArray(saved.awakened)
      ? saved.awakened.filter(Number.isInteger)
      : [],
  };
}

export function saveJourney(journey) {
  write(JOURNEY_KEY, {
    world: journey.world,
    delivered: journey.delivered,
    awakened: [...journey.awakened],
  });
}

export function eraseJourney() {
  erase(JOURNEY_KEY);
}

/* ═══════════════════════════════════════════════════════════════════════════
   the archive
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Everything the player keeps between visits: discoveries, mastery, unlocks,
 * what they are wearing. `archive.js` owns the shape and the migration; this
 * only knows how to get it in and out.
 *
 * The old journey record is read as a fallback so that a player who last
 * played before any of this existed is handed forward rather than started
 * over — `migrate` in archive.js recognises that shape by its missing version.
 */
export function loadArchive() {
  return read(ARCHIVE_KEY);
}

/**
 * The pre-archive journey record, if one is still lying about.
 *
 * Read separately from the archive rather than as a fallback for it, because
 * the archive is written eagerly the moment the game starts: fall back only
 * when the archive is missing and a single unlucky load — a refresh at the
 * wrong moment, a crash — could leave a real player's progress stranded
 * behind an empty archive that now exists. `migrate` merges this in whenever
 * it has not already been merged, and records that it did.
 */
export function loadLegacyJourney() {
  return read(JOURNEY_KEY);
}

export function saveArchive(archive) {
  write(ARCHIVE_KEY, archive);
}

export function eraseArchive() {
  erase(ARCHIVE_KEY);
  erase(JOURNEY_KEY);      // ...including the record it was migrated from
}
