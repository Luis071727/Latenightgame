/**
 * What there is to find, and what finding it earns.
 *
 * All data, no behaviour. `archive.js` owns what the player has actually found;
 * `fragments.js` puts these in the ground; `journal.js` displays them. Adding a
 * fifth world means adding an entry here and one in worlds.js, and nothing else.
 *
 * The governing rule is *few and memorable*. Eight discoveries a world, each
 * with a name and a line of its own, beats five hundred identical pickups —
 * the player should come away remembering the strange flower behind the fog,
 * not that they collected item #384. Nothing here respawns: a memory is found
 * once and then it is yours, so there is nothing to farm.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   rarity
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * How special a thing is, and how much louder it is allowed to be about it.
 * `glow` and `size` feed the fragment shader directly. Even `mythic` stays
 * inside the game's voice: brighter and slower, never a slot machine.
 */
export const RARITY = {
  common:   { key: 'common',   label: 'common',   glow: 0.85, size: 0.46, chime: 0 },
  uncommon: { key: 'uncommon', label: 'uncommon', glow: 1.00, size: 0.52, chime: 1 },
  rare:     { key: 'rare',     label: 'rare',     glow: 1.25, size: 0.60, chime: 2 },
  dream:    { key: 'dream',    label: 'dream',    glow: 1.50, size: 0.70, chime: 3 },
  mythic:   { key: 'mythic',   label: 'mythic',   glow: 1.80, size: 0.82, chime: 4 },
};

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'dream', 'mythic'];

/** rare and above is what counts as a "rare find" anywhere it is totalled */
export const IS_RARE = (r) => RARITY_ORDER.indexOf(r) >= 2;

/* ═══════════════════════════════════════════════════════════════════════════
   where a thing hides
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Placement kinds. Each is a band of the island rather than a coordinate, so
 * the exact spot still comes from the world's own seed and a player who has
 * found a thing in one world cannot look it up in the next.
 *
 *   wander     anywhere in the walkable middle
 *   grove      close to a structure, wherever the scatter happened to put one
 *   monument   in the plaza, near the middle
 *   rim        out toward the edge, where the ground starts to climb
 *   fog        past the rim, where you have to walk into the white to see it
 *   water      near the waterline, for the worlds that have any
 *   gate       in the gate's clearing
 */
export const PLACE = {
  wander: 'wander',
  grove: 'grove',
  monument: 'monument',
  rim: 'rim',
  fog: 'fog',
  water: 'water',
  gate: 'gate',
};

/* ═══════════════════════════════════════════════════════════════════════════
   the discoveries themselves
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * Per world: five that make up its set, two rare, and one that asks something
 * of you first.
 *
 * `needs` is what has to be true before it will show itself at all, and is the
 * whole of the secret system:
 *   awake     this many structures woken in this world, this visit or before
 *   delivered this many motes given to the monument
 *   visits    this is at least your nth arrival here
 *   found     these discovery ids are already in the archive
 *
 * A discovery with `needs` is invisible until it is met — which is what makes
 * the journal's row of question marks worth chasing.
 */
export const DISCOVERIES = {
  meadow: [
    { id: 'petal-memory',    name: 'Petal Memory',       rarity: 'common',   place: 'grove',
      note: 'The first light of the meadow, folded into a petal.' },
    { id: 'dawn-thread',     name: 'Dawn Thread',        rarity: 'common',   place: 'wander',
      note: 'A single warm line, pulled loose from the morning.' },
    { id: 'sleeping-seed',   name: 'Sleeping Seed',      rarity: 'common',   place: 'wander',
      note: 'It has not decided what to become. It is in no hurry.' },
    { id: 'whispering-leaf', name: 'Whispering Leaf',    rarity: 'uncommon', place: 'grove',
      note: 'Held to the ear it repeats something you almost said.' },
    { id: 'bloom-fragment',  name: 'Bloom Fragment',     rarity: 'uncommon', place: 'monument',
      note: 'A piece of an opening that never quite finishes.' },

    { id: 'first-flower',    name: 'The First Flower',   rarity: 'rare',     place: 'rim',
      note: 'It grew facing away from the middle, toward whatever is out there.' },
    { id: 'sleeping-crown',  name: 'The Sleeping Crown', rarity: 'rare',     place: 'fog',
      note: 'Left at the edge by someone who decided not to be king.' },

    { id: 'meadow-dreaming', name: 'The Meadow Dreaming', rarity: 'dream',   place: 'monument',
      needs: { awake: 12 },
      note: 'With enough of it awake, the meadow dreams of itself, and leaves this behind.' },
  ],

  harbor: [
    { id: 'tide-memory',     name: 'Tide Memory',        rarity: 'common',   place: 'water',
      note: 'The shape the water makes when it is remembering going out.' },
    { id: 'moon-shell',      name: 'Moon Shell',         rarity: 'common',   place: 'water',
      note: 'Pale, and slightly too light for its size.' },
    { id: 'blue-thread',     name: 'Blue Thread',        rarity: 'common',   place: 'wander',
      note: 'It runs from somewhere to somewhere. Both ends are elsewhere.' },
    { id: 'distant-bell',    name: 'Distant Bell',       rarity: 'uncommon', place: 'grove',
      note: 'It has already rung. You are hearing the part that stayed.' },
    { id: 'harbour-echo',    name: 'Harbour Echo',       rarity: 'uncommon', place: 'monument',
      note: 'A sound with nothing left in front of it.' },

    { id: 'last-lantern',    name: 'The Last Lantern',   rarity: 'rare',     place: 'rim',
      note: 'Still lit, for a boat that has been arriving for a very long time.' },
    { id: 'quiet-name',      name: 'The Quiet Name',     rarity: 'rare',     place: 'fog',
      note: 'Someone said it once here and the fog has been holding it since.' },

    { id: 'tide-turning',    name: 'The Tide Turning',   rarity: 'dream',    place: 'water',
      needs: { delivered: 10 },
      note: 'Give the spire enough light and the water changes its mind.' },
  ],

  grove: [
    { id: 'coral-memory',    name: 'Coral Memory',       rarity: 'common',   place: 'grove',
      note: 'Grown one slow thought at a time.' },
    { id: 'deep-glow',       name: 'Deep Glow',          rarity: 'common',   place: 'wander',
      note: 'Light that has never once been to the surface.' },
    { id: 'lantern-seed',    name: 'Lantern Seed',       rarity: 'common',   place: 'grove',
      note: 'Plant it and something will be lit. Not necessarily a lamp.' },
    { id: 'lost-spark',      name: 'Lost Spark',         rarity: 'uncommon', place: 'fog',
      note: 'It got separated from whatever it was meant to start.' },
    { id: 'drift-fragment',  name: 'Drift Fragment',     rarity: 'uncommon', place: 'monument',
      note: 'Broken off the sponge, and still faintly counting.' },

    { id: 'breathing-reef',  name: 'The Breathing Reef', rarity: 'rare',     place: 'rim',
      note: 'Out where the grove thins, something is keeping time.' },
    { id: 'drowned-gate',    name: 'The Drowned Gate',   rarity: 'rare',     place: 'gate',
      note: 'A door that was here before the door.' },

    { id: 'grove-listening', name: 'The Grove Listening', rarity: 'mythic',  place: 'fog',
      needs: { awake: 16, visits: 2 },
      note: 'Come back to a grove you have already woken, and walk into the white. It knows you.' },
  ],

  garden: [
    { id: 'star-shard',      name: 'Star Shard',         rarity: 'common',   place: 'grove',
      note: 'Cold on one face, warm on the other.' },
    { id: 'crystal-memory',  name: 'Crystal Memory',     rarity: 'common',   place: 'wander',
      note: 'It remembers being enormous.' },
    { id: 'warm-star',       name: 'Warm Star',          rarity: 'common',   place: 'monument',
      note: 'Small enough to hold, which is not how stars usually work.' },
    { id: 'falling-light',   name: 'Falling Light',      rarity: 'uncommon', place: 'wander',
      note: 'Caught on the way down. It does not seem to mind.' },
    { id: 'constellation',   name: 'Constellation Thread', rarity: 'uncommon', place: 'rim',
      note: 'Joins two stars that have never agreed on anything.' },

    { id: 'garden-keeper',   name: 'The Garden Keeper',  rarity: 'rare',     place: 'fog',
      note: 'Not a person. Something that has been tending this a while.' },
    { id: 'unlit-star',      name: 'The Unlit Star',     rarity: 'rare',     place: 'rim',
      note: 'Waiting its turn. It has been waiting its turn for some time.' },

    { id: 'fourth-quiet',    name: 'The Fourth Quiet',   rarity: 'mythic',   place: 'monument',
      needs: { awake: 14, found: ['garden-keeper'] },
      note: 'The last still place, at the middle of the last garden.' },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   sets
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The five-piece set each world opens with. Completing one is the first real
 * "I finished something" the game offers, so the reward is deliberately
 * something you can *see* on yourself rather than a number.
 */
export const COLLECTIONS = [
  { id: 'first-light',   world: 'meadow', name: 'First Light',
    members: ['petal-memory', 'dawn-thread', 'sleeping-seed', 'whispering-leaf', 'bloom-fragment'],
    reward: { type: 'cloak', id: 'dawn' } },
  { id: 'slack-water',   world: 'harbor', name: 'Slack Water',
    members: ['tide-memory', 'moon-shell', 'blue-thread', 'distant-bell', 'harbour-echo'],
    reward: { type: 'companion', id: 'tideglass' } },
  { id: 'low-light',     world: 'grove',  name: 'Low Light',
    members: ['coral-memory', 'deep-glow', 'lantern-seed', 'lost-spark', 'drift-fragment'],
    reward: { type: 'cloak', id: 'lantern' } },
  { id: 'slow-sky',      world: 'garden', name: 'Slow Sky',
    members: ['star-shard', 'crystal-memory', 'warm-star', 'falling-light', 'constellation'],
    reward: { type: 'companion', id: 'emberlight' } },
];

/* ═══════════════════════════════════════════════════════════════════════════
   cosmetics
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Everything a wanderer can end up looking like.
 *
 * A cloak is a set of palette keys laid over whatever the world was going to
 * tint the robe. `null` values mean "leave the world's own choice alone", which
 * is how the default stays the thing the original game did: the wanderer
 * picking up the colour of wherever they are.
 */
export const COSMETICS = {
  cloak: [
    { id: 'wanderer', name: 'Wanderer', default: true,
      note: 'What you set out in. It takes the colour of wherever you are.',
      colors: null },
    { id: 'dawn', name: 'Dawn', note: 'The meadow, kept.',
      colors: { cloakLow: 0x4a3450, cloakHigh: 0xc98f88, cloakRim: 0xffd2b4, cloakGlow: 0xffd6a8 } },
    { id: 'lantern', name: 'Lantern', note: 'Lit from somewhere under the surface.',
      colors: { cloakLow: 0x1e3a40, cloakHigh: 0x5aa192, cloakRim: 0xa8ffe4, cloakGlow: 0xa8ffe4 } },
    { id: 'tideline', name: 'Tideline', note: 'The colour the harbour goes just before it is dark.',
      colors: { cloakLow: 0x2a2c50, cloakHigh: 0x6f7fb8, cloakRim: 0xc9d8ff, cloakGlow: 0xbfd0ff } },
    { id: 'nightfall', name: 'Nightfall', note: 'Worn by someone who has been to the end and come back.',
      colors: { cloakLow: 0x1a1730, cloakHigh: 0x4e4478, cloakRim: 0xe8d4ff, cloakGlow: 0xe8d4ff } },
    { id: 'firstlight', name: 'First Light', note: 'For the one who found everything.',
      colors: { cloakLow: 0x3e3450, cloakHigh: 0xd8c090, cloakRim: 0xfff0d0, cloakGlow: 0xffe2b0 } },
  ],

  companion: [
    { id: 'wisp', name: 'Wisp', default: true,
      note: 'The small light that has always been with you.', color: null },
    { id: 'tideglass', name: 'Tideglass', note: 'It picked you up somewhere near the water.',
      color: 0xbfd0ff },
    { id: 'emberlight', name: 'Emberlight', note: 'Warm, and slightly too interested in everything.',
      color: 0xffc08a },
    { id: 'mothlight', name: 'Mothlight', note: 'It found the grove first and waited for you there.',
      color: 0xa8ffe4 },
    { id: 'starling', name: 'Starling', note: 'Very old. Very small.',
      color: 0xe8d4ff },
  ],
};

/** the cosmetic a fresh wanderer wears */
export function defaultCosmetic(kind) {
  return (COSMETICS[kind] || []).find((c) => c.default)?.id ?? null;
}

export function cosmetic(kind, id) {
  return (COSMETICS[kind] || []).find((c) => c.id === id) || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   what mastery of a world gives back
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Mastery rewards, per world, at a quarter / half / three quarters / all.
 * These are the long tail: by the time a player is chasing 100% of a world
 * they are doing it because they want the thing at the end of it, so the
 * things at the end are the most distinctive ones in the game.
 */
export const MASTERY_REWARDS = {
  meadow: [
    { at: 0.25, type: 'title',     id: 'meadow-listener' },
    { at: 0.50, type: 'cloak',     id: 'firstlight' },
    { at: 0.75, type: 'monument',  id: 'blooming' },
    { at: 1.00, type: 'title',     id: 'keeper-small-lights' },
  ],
  harbor: [
    { at: 0.25, type: 'title',     id: 'tide-dreamer' },
    { at: 0.50, type: 'cloak',     id: 'tideline' },
    { at: 0.75, type: 'monument',  id: 'resonant' },
    { at: 1.00, type: 'companion', id: 'starling' },
  ],
  grove: [
    { at: 0.25, type: 'title',     id: 'lantern-keeper' },
    { at: 0.50, type: 'companion', id: 'mothlight' },
    { at: 0.75, type: 'monument',  id: 'radiant' },
    { at: 1.00, type: 'title',     id: 'collector-quiet-things' },
  ],
  garden: [
    { at: 0.25, type: 'title',     id: 'star-cartographer' },
    { at: 0.50, type: 'cloak',     id: 'nightfall' },
    { at: 0.75, type: 'monument',  id: 'radiant' },
    { at: 1.00, type: 'title',     id: 'the-unhurried' },
  ],
};

/* ═══════════════════════════════════════════════════════════════════════════
   dream variants
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Other moods the same place can be in.
 *
 * A variant is a shallow override of a world's own data — palette keys, fog,
 * stars, fireflies — and nothing else. The seed is untouched, so the ground
 * rolls the same way, the structures stand where they always stood and the
 * memories are where you left them. What changes is the light, and the light
 * is most of what a world *is* here.
 *
 * That makes a variant nearly free: no new geometry, no new generation, no
 * fifth world to author. It is the cheapest possible answer to "why would I
 * go back to somewhere I have finished", and the honest one — you go back
 * because you have never seen it like this.
 *
 * They unlock at half mastery of the world they belong to, which is far
 * enough in that the ordinary version is thoroughly familiar first.
 */
export const VARIANTS = {
  meadow: [
    { id: 'dawn', name: 'Dawn', default: true,
      note: 'The meadow as you first found it.' },
    { id: 'golden', name: 'Golden Dawn', at: 0.5,
      note: 'The morning got further along without you.',
      palette: {
        skyTopA: 0x4d4250, skyTopB: 0x6a4f48, skyHorizon: 0x9a6a50,
        horizonGlow: 0x5c3018, fog: 0x6e5044,
        groundHigh: 0xb0a878, fractalHigh: 0xe8c090, bloom: 0xffe0a8,
      },
      stars: 0.05, fireflies: 1.3 },
    { id: 'starfall', name: 'Starfall', at: 0.85,
      note: 'Night, and the sky is coming apart very slowly.',
      palette: {
        skyTopA: 0x1e1e3a, skyTopB: 0x2a2444, skyHorizon: 0x2e2840,
        horizonGlow: 0x1a1428, fog: 0x2a2440,
        groundLow: 0x2e3a3c, groundHigh: 0x5a6458,
        fractalHigh: 0x9a8fb0, bloom: 0xd8d0ff, mote: 0xc8c4ff,
      },
      stars: 1.0, fireflies: 0.5, fog: 0.0090 },
  ],

  harbor: [
    { id: 'twilight', name: 'Twilight', default: true,
      note: 'The harbour as you first found it.' },
    { id: 'slack', name: 'Slack Water', at: 0.5,
      note: 'The tide has stopped deciding. Everything is very still.',
      palette: {
        skyTopA: 0x243048, skyTopB: 0x2e3652, skyHorizon: 0x3e4a68,
        fog: 0x33405c, groundHigh: 0x62789a,
        fractalHigh: 0x8fa8cc, bloom: 0xd8e8ff, mote: 0xcfe0ff,
      },
      stars: 0.35, fireflies: 0.5, fog: 0.0170 },
    { id: 'lantern-tide', name: 'Lantern Tide', at: 0.85,
      note: 'Something out on the water is lit, and getting no nearer.',
      palette: {
        skyTopA: 0x201c38, skyTopB: 0x2a2140, skyHorizon: 0x4a3450,
        horizonGlow: 0x3a1c22, fog: 0x2e2442,
        fractalHigh: 0xc09ab0, bloom: 0xffc8a8, mote: 0xffbf96,
      },
      stars: 0.8, fireflies: 1.2 },
  ],

  grove: [
    { id: 'deep', name: 'Deep', default: true,
      note: 'The grove as you first found it.' },
    { id: 'sleeping-bloom', name: 'Sleeping Bloom', at: 0.5,
      note: 'The fog came all the way in. You can hear more than you can see.',
      palette: {
        skyTopA: 0x1a3038, skyTopB: 0x1e363a, skyHorizon: 0x142a32,
        fog: 0x18303a, groundHigh: 0x3e6660,
        fractalHigh: 0x6ea89e, bloom: 0x88e8d0,
      },
      stars: 0.0, fireflies: 1.8, fog: 0.0300 },
    { id: 'clearwater', name: 'Clearwater', at: 0.85,
      note: 'Once, and not for long, the grove is legible all the way out.',
      palette: {
        skyTopA: 0x24505c, skyTopB: 0x2e5c62, skyHorizon: 0x1e4650,
        fog: 0x224852, groundHigh: 0x6a9c90,
        fractalHigh: 0xa8dcd0, bloom: 0xc8fff0,
      },
      stars: 0.30, fireflies: 0.8, fog: 0.0105 },
  ],

  garden: [
    { id: 'cosmic', name: 'Cosmic', default: true,
      note: 'The garden as you first found it.' },
    { id: 'emberfall', name: 'Emberfall', at: 0.5,
      note: 'Warm, for once. Something a long way off is burning kindly.',
      palette: {
        skyTopA: 0x2a1c30, skyTopB: 0x3a2434, skyHorizon: 0x1c1220,
        horizonGlow: 0x4a2418, fog: 0x2a1e2c,
        groundHigh: 0x7a6068, fractalHigh: 0xd8a890,
        bloom: 0xffd0a0, mote: 0xffc088,
      },
      stars: 0.9, fireflies: 1.0 },
    { id: 'the-quiet', name: 'The Quiet', at: 0.85,
      note: 'Almost no light at all, and somehow the easiest place to be.',
      palette: {
        skyTopA: 0x101024, skyTopB: 0x16142a, skyHorizon: 0x080810,
        horizonGlow: 0x140e1c, fog: 0x101020,
        groundLow: 0x181a2e, groundHigh: 0x3a3658,
        fractalHigh: 0x8a7ab0, bloom: 0xd0c0f0,
      },
      stars: 1.0, fireflies: 0.4, fog: 0.0080 },
  ],
};

export function variantsOf(worldKey) {
  return VARIANTS[worldKey] || [];
}

export function variant(worldKey, id) {
  return variantsOf(worldKey).find((v) => v.id === id) || null;
}

export function defaultVariant(worldKey) {
  return variantsOf(worldKey).find((v) => v.default)?.id ?? null;
}

/**
 * Fold a variant's overrides over a world, returning a new object. The
 * original world data is never touched — it is module state shared by every
 * load, and mutating it would make a variant permanent the first time it was
 * chosen.
 */
export function applyVariant(world, id) {
  const v = variant(world.key, id);
  if (!v || v.default) return world;
  return {
    ...world,
    variant: v.id,
    variantName: v.name,
    palette: { ...world.palette, ...(v.palette || {}) },
    fog: { ...world.fog, ...(v.fog !== undefined ? { density: v.fog } : {}) },
    stars: v.stars !== undefined ? v.stars : world.stars,
    fireflies: v.fireflies !== undefined ? v.fireflies : world.fireflies,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   titles
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * What a wanderer can be called. `earn` is checked against the archive's own
 * summary, so a title is always a statement about something the player did
 * rather than a thing they bought.
 */
export const TITLES = [
  { id: 'wanderer', name: 'The Wanderer', default: true,
    note: 'Everyone starts here.' },
  { id: 'first-wanderer', name: 'First Wanderer',
    note: 'Found your first memory.', earn: { discoveries: 1 } },
  { id: 'meadow-listener', name: 'Meadow Listener',
    note: 'A quarter of the meadow known.' },
  { id: 'tide-dreamer', name: 'Tide Dreamer',
    note: 'A quarter of the harbour known.' },
  { id: 'lantern-keeper', name: 'Lantern Keeper',
    note: 'A quarter of the grove known.' },
  { id: 'star-cartographer', name: 'Star Cartographer',
    note: 'A quarter of the garden known.' },
  { id: 'keeper-small-lights', name: 'Keeper of Small Lights',
    note: 'The meadow, entirely.' },
  { id: 'collector-quiet-things', name: 'Collector of Quiet Things',
    note: 'The grove, entirely.' },
  { id: 'the-unhurried', name: 'The Unhurried',
    note: 'The garden, entirely. There was never any rush.' },
  { id: 'keeper-fourth-gate', name: 'Keeper of the Fourth Gate',
    note: 'Walked through every gate there is.', earn: { worldsVisited: 4 } },
  { id: 'dream-architect', name: 'Dream Architect',
    note: 'Every set completed.', earn: { collections: 4 } },
  { id: 'finder-of-rare-things', name: 'Finder of Rare Things',
    note: 'Eight rare discoveries or better.', earn: { rare: 8 } },
];

export function title(id) {
  return TITLES.find((t) => t.id === id) || null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   monument forms
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * How far along a monument looks. The world drives this from mastery, so a
 * world you know well *stands* differently to one you have just arrived in —
 * which is the whole reason to come back to a world you have finished.
 */
export const MONUMENT_FORMS = [
  { id: 'dormant',   name: 'Dormant',   at: 0.00, lift: 0.00, glow: 0.00 },
  { id: 'awakening', name: 'Awakening', at: 0.20, lift: 0.05, glow: 0.15 },
  { id: 'resonant',  name: 'Resonant',  at: 0.45, lift: 0.12, glow: 0.35 },
  { id: 'blooming',  name: 'Blooming',  at: 0.70, lift: 0.20, glow: 0.60 },
  { id: 'radiant',   name: 'Radiant',   at: 0.92, lift: 0.30, glow: 0.90 },
];

export function monumentForm(mastery) {
  let out = MONUMENT_FORMS[0];
  for (const f of MONUMENT_FORMS) if (mastery >= f.at) out = f;
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   lookups
   ═══════════════════════════════════════════════════════════════════════════ */

const BY_ID = new Map();
for (const [worldKey, list] of Object.entries(DISCOVERIES)) {
  for (const d of list) BY_ID.set(d.id, { ...d, world: worldKey });
}

export function discovery(id) {
  return BY_ID.get(id) || null;
}

export function discoveriesOf(worldKey) {
  return DISCOVERIES[worldKey] || [];
}

/** every discovery in the game, in world order — what the journal walks */
export function allDiscoveries() {
  return [...BY_ID.values()];
}

export const TOTAL_DISCOVERIES = BY_ID.size;
