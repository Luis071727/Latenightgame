import * as THREE from 'three';
import { mulberry32 } from './textures.js';
import {
  speciesGeometry, softBoxGeometry, growBranching, growMenger, growSpire,
  growRing, createFractalMesh, createClouds,
} from './fractals.js';
import { gateSpot } from './gate.js';

/**
 * The worlds, and what it takes to stand one up.
 *
 * A world is data first: a palette, a fog, a ground profile, one fractal
 * species and one monument. Everything visible is grown from those numbers, so
 * adding a fifth world is an entry in this array and nothing else — which is
 * the point of keeping the generators in fractals.js dumb about what they are
 * making.
 *
 * The palettes share a rule: soft, desaturated, low in contrast, and never a
 * hard blue-white. This is meant to be looked at in a dark room by someone
 * most of the way to sleep, so every colour here is one you could paint a
 * nursery in.
 */
export const WORLDS = [
  {
    key: 'meadow',
    name: 'the waking meadow',
    seed: 1701,
    palette: {
      skyTopA:    0x3b3550,   // overhead, before dawn
      skyTopB:    0x4a3c52,   // ...and the dusty rose it drifts toward
      skyHorizon: 0x6a4f52,   // warm haze low down
      horizonGlow:0x3a2018,
      fog:        0x574350,
      groundLow:  0x4a5a52,   // soft teal turf in shadow
      groundHigh: 0x8e9878,   // ...and where the light lands
      fractalLow: 0x5e5266,
      fractalHigh:0xc9a8a0,   // dusty rose canopy
      bloom:      0xffd9b0,   // warm cream, what an awake thing glows
      mote:       0xffd2a0,
      firefly:    0xffdcb4,
      haze:       0x6d5460,
      cloud:      0x8a6f74,
      cloakLow:   0x3d3550,
      cloakHigh:  0x8a7c9e,
      cloakRim:   0xd8bfc0,
      cloakGlow:  0xffd6a8,
      shadow:     0x2e2836,
    },
    fog:    { density: 0.0115 },
    ground: { radius: 120, amp: 5.4, freq: 0.019, plazaRadius: 18, rim: 6.5, drop: 26, ambient: 0.86 },
    species: 'tree',
    structures: { count: 34, minHeight: 6.5, maxHeight: 13.0, radius: 0.62, sway: 0.10, spacing: 15 },
    monument: { type: 'ring', size: 4.0 },
    clouds: { height: 34, spacing: 13, size: 460, scale: 0.0072, drift: 0.9, amount: 0.24, color: 0x8a6f74 },
    water: null,
    stars: 0.22,
    fireflies: 1.0,
    audio: { root: 130.81, scale: [0, 4, 7, 11, 14], brightness: 480 },
  },

  {
    key: 'harbor',
    name: 'the quiet harbour',
    seed: 20899,
    palette: {
      skyTopA:    0x2a2c4e,   // muted indigo
      skyTopB:    0x373258,
      skyHorizon: 0x4a4468,
      horizonGlow:0x2a1c2e,
      fog:        0x3d3a5c,
      groundLow:  0x353a56,
      groundHigh: 0x6f7290,
      fractalLow: 0x413f66,
      fractalHigh:0x9c93c4,   // twilight lavender
      bloom:      0xc9d8ff,
      mote:       0xbfd0ff,
      firefly:    0xc4c8f0,
      haze:       0x4a4670,
      cloud:      0x5a5480,
      cloakLow:   0x322c4c,
      cloakHigh:  0x746a9c,
      cloakRim:   0xb3a8d8,
      cloakGlow:  0xffd0a4,
      shadow:     0x1e1c30,
      waterDeep:  0x232a44,
      waterFar:   0x1a1e34,
    },
    fog:    { density: 0.0135 },
    ground: { radius: 116, amp: 4.2, freq: 0.023, plazaRadius: 16, rim: 5.0, drop: 22, ambient: 0.80 },
    species: 'stalk',
    structures: { count: 28, minHeight: 7.5, maxHeight: 15.0, radius: 0.40, sway: 0.16, spacing: 16 },
    monument: { type: 'spire', size: 3.6 },
    clouds: { height: 28, spacing: 11, size: 440, scale: 0.0060, drift: 0.7, amount: 0.20, color: 0x5a5480 },
    water: { level: -2.2, size: 280 },   // pools in the lows, not an ocean
    stars: 0.62,
    fireflies: 0.8,
    audio: { root: 110.0, scale: [0, 3, 7, 10, 12], brightness: 380 },
  },

  {
    key: 'grove',
    name: 'the lantern grove',
    seed: 33377,
    palette: {
      skyTopA:    0x1e3a44,   // looking up through deep water
      skyTopB:    0x27454a,
      skyHorizon: 0x16303c,
      horizonGlow:0x123038,
      fog:        0x1b3640,
      groundLow:  0x223c42,
      groundHigh: 0x4e7a72,   // soft teal
      fractalLow: 0x2c4a54,
      fractalHigh:0x86c4b8,
      bloom:      0xa8ffe4,   // the one cool glow, kept low and minty
      mote:       0x9ce8d8,
      firefly:    0xa4e4d4,
      haze:       0x2a4c56,
      cloud:      0x2e5a60,
      cloakLow:   0x2a3a4e,
      cloakHigh:  0x5f8298,
      cloakRim:   0x9fd0d0,
      cloakGlow:  0xffcf9c,
      shadow:     0x16282e,
    },
    fog:    { density: 0.0205 },
    ground: { radius: 104, amp: 5.6, freq: 0.028, plazaRadius: 15, rim: 7.0, drop: 24, ambient: 0.74 },
    species: 'coral',
    structures: { count: 42, minHeight: 3.4, maxHeight: 8.0, radius: 0.66, sway: 0.22, spacing: 11 },
    monument: { type: 'menger', size: 9.0 },
    clouds: { height: 26, spacing: 9, size: 380, scale: 0.0090, drift: 0.45, amount: 0.30, color: 0x2e5a60 },
    water: null,
    stars: 0.10,
    fireflies: 1.4,
    audio: { root: 98.0, scale: [0, 5, 7, 12, 17], brightness: 300 },
  },

  {
    key: 'garden',
    name: 'the star garden',
    seed: 40009,
    palette: {
      skyTopA:    0x191a34,
      skyTopB:    0x241f3e,
      skyHorizon: 0x0e0f1e,
      horizonGlow:0x241830,
      fog:        0x1c1c34,
      groundLow:  0x252642,
      groundHigh: 0x5d5480,
      fractalLow: 0x37325c,
      fractalHigh:0xb9a6d8,
      bloom:      0xe8d4ff,
      mote:       0xdcc8ff,
      firefly:    0xd0c4f4,
      haze:       0x2e2a4c,
      cloud:      0x3a3260,
      cloakLow:   0x2c2646,
      cloakHigh:  0x6e6398,
      cloakRim:   0xbdaee4,
      cloakGlow:  0xffd2ac,
      shadow:     0x14142a,
    },
    fog:    { density: 0.0098 },
    ground: { radius: 126, amp: 4.6, freq: 0.016, plazaRadius: 20, rim: 5.4, drop: 30, ambient: 0.70 },
    species: 'crystal',
    structures: { count: 34, minHeight: 4.5, maxHeight: 10.0, radius: 0.85, sway: 0.05, spacing: 14 },
    monument: { type: 'menger', size: 10.0 },
    clouds: { height: 40, spacing: 15, size: 500, scale: 0.0050, drift: 0.5, amount: 0.16, color: 0x3a3260 },
    water: null,
    stars: 1.0,
    fireflies: 0.7,
    audio: { root: 87.31, scale: [0, 2, 7, 9, 14], brightness: 340 },
  },
];

/**
 * The sanctuary — the one place that is yours.
 *
 * Shaped exactly like a world so that every system already knows how to build
 * it, but it is not in the rotation and no gate leads here: you go because you
 * chose to, from the archive, and its gate takes you back to wherever you
 * were. Nothing sleeps here, there is nothing to find and nothing to master.
 * It is small, warm, and already awake — the one place in the game that asks
 * nothing at all of you.
 */
export const SANCTUARY = {
  key: 'sanctuary',
  name: 'your sanctuary',
  seed: 7,
  sanctuary: true,

  /* The palette is the first thing that has to say "not another biome". The
     four worlds are each built around one wild hue — turf, tide, deep water,
     starlight — and this one is deliberately built around none of them: warm
     unsaturated stone and a sky that has stopped changing its mind. Nothing
     here is trying to be a landscape. It is a room with the roof off. */
  palette: {
    skyTopA:    0x272338,   // an even, settled dusk — no drama overhead
    skyTopB:    0x2f2942,
    skyHorizon: 0x4a3e4a,   // and no sunset either; just warmth low down
    horizonGlow:0x3a2620,
    fog:        0x342c3c,
    groundLow:  0x3a3442,   // stone in shadow...
    groundHigh: 0x8c8092,   // ...and stone with the light on it. Pale, not lush.
    fractalLow: 0x584c62,
    fractalHigh:0xe0cbb2,   // the standing shapes read as pillars, not trees
    bloom:      0xffe6c8,
    mote:       0xffdcb8,
    firefly:    0xffe0c8,
    haze:       0x584a60,
    cloud:      0x5e5064,
    cloakLow:   0x3d3550,
    cloakHigh:  0x8a7c9e,
    cloakRim:   0xd8bfc0,
    cloakGlow:  0xffd6a8,
    shadow:     0x2a2434,
  },

  // Thinner than anywhere else, and on purpose: every other place hides its
  // far side, and this one is legible all the way to the rim. You should be
  // able to stand in the middle and see everything you have.
  fog:    { density: 0.0072 },

  /* Deliberately small, and laid rather than grown. `profile: 'plaza'` swaps
     terrain.js over to a level court and a few shallow terraces — see
     `plazaHeight` there. `amp` is a tenth of a wild world's, because what is
     left of the fbm here is only there to stop the floor looking printed.
     `ambient` stays down with the rest of them: a home that is brighter than
     everywhere else stops being part of the same night. */
  ground: {
    profile: 'plaza',
    radius: 76, amp: 0.42, freq: 0.020, plazaRadius: 22,
    // just outside the gallery ring rather than the usual plazaRadius * 2.4,
    // so you arrive with your own memories close enough to be objects
    spawnRadius: 39,
    rim: 3.2, drop: 20, ambient: 0.74,
    courtScale: 1.5,       // the level middle, as a multiple of plazaRadius
    terraceWidth: 9.5,     // how far out one tread runs
    terraceRise: 1.15,     // ...and how far up the riser at the end of it goes
    terraceSoften: 0.42,   // how much of a tread is spent easing into the next
  },

  species: 'tree',
  // Few, tall, evenly matched: a colonnade rather than a wood. `sway` is
  // almost nothing, because the one thing this place is is still.
  structures: { count: 12, minHeight: 7.0, maxHeight: 8.6, radius: 0.62, sway: 0.02, spacing: 19 },
  monument: { type: 'ring', size: 4.2 },
  // barely moving, and high enough to read as a ceiling rather than weather
  clouds: { height: 40, spacing: 14, size: 380, scale: 0.0052, drift: 0.16, amount: 0.13, color: 0x5e5064 },
  water: null,
  stars: 0.32,
  fireflies: 0.55,
  audio: { root: 146.83, scale: [0, 4, 7, 12, 16], brightness: 520 },
};

/* ═══════════════════════════════════════════════════════════════════════════
   the slow colour drift
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Build a function that returns a world's palette somewhere between itself and
 * a slightly-shifted copy of itself.
 *
 * Both ends are computed once, at world load, and the returned function only
 * lerps — so the drift costs a handful of colour lerps a few times a second
 * rather than an HSL round-trip per frame. The shifts want to stay small:
 * anything you can catch happening reads as a colour effect, and the point is
 * that you only notice by having looked away.
 */
export function makePaletteCycler(palette, mood) {
  const a = {}, b = {}, out = {};
  const hsl = { h: 0, s: 0, l: 0 };

  for (const key of Object.keys(palette)) {
    const from = new THREE.Color(palette[key]);
    from.getHSL(hsl);
    a[key] = from;
    b[key] = new THREE.Color().setHSL(
      (hsl.h + mood.hueShift + 1) % 1,
      THREE.MathUtils.clamp(hsl.s * mood.satShift, 0, 1),
      THREE.MathUtils.clamp(hsl.l * mood.lumShift, 0, 1)
    );
    out[key] = new THREE.Color();
  }

  return function at(t) {
    for (const key in out) out[key].copy(a[key]).lerp(b[key], t);
    return out;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   building one
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Grow a world's contents onto the ground the terrain has already built.
 *
 * Structures are kept *contiguous* in the instance buffers and each one
 * remembers its own slice. That is what lets a single structure come awake
 * later without touching anything else — the awakening loop writes a range of
 * an attribute, not a scene graph.
 */
export function createWorldContent({ CONFIG, quality, scene, world, terrain }) {
  const rand = mulberry32(world.seed);
  const F = CONFIG.fractals;

  const depth = Math.min(F.maxDepth, quality.fractalDepth);
  const budget = quality.fractalInstances;

  /* ── scatter ────────────────────────────────────────────────────────── */
  const segments = [];
  const tips = [];
  const structures = [];

  const placed = [];
  const gateAt = gateSpot(CONFIG, world);
  const S = world.structures;
  const minR = world.ground.plazaRadius * 1.35;
  const maxR = world.ground.radius * 0.80;

  const wanted = Math.round(S.count * quality.structureScale);
  for (let attempt = 0; attempt < wanted * 24 && structures.length < wanted; attempt++) {
    if (segments.length + tips.length > budget) break;

    const a = rand() * Math.PI * 2;
    // sqrt keeps the scatter even by area instead of crowding the middle
    const r = minR + Math.sqrt(rand()) * (maxR - minR);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;

    // leave the gate a clearing to stand in
    if ((gateAt.x - x) ** 2 + (gateAt.z - z) ** 2 < CONFIG.gate.clearing ** 2) continue;

    let clear = true;
    for (const p of placed) {
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < S.spacing * S.spacing) { clear = false; break; }
    }
    if (!clear) continue;
    placed.push({ x, z });

    const y = terrain.heightAt(x, z);
    const height = S.minHeight + rand() * (S.maxHeight - S.minHeight);

    const segStart = segments.length;
    const tipStart = tips.length;

    growBranching({
      rand,
      species: world.species,
      depth,
      origin: new THREE.Vector3(x, y - 0.1, z),
      // leaning very slightly off vertical stops a field of them looking
      // stamped out of the same mould
      dir: new THREE.Vector3((rand() - 0.5) * 0.16, 1, (rand() - 0.5) * 0.16),
      length: height * 0.42,
      radius: S.radius * (0.8 + rand() * 0.5),
      sway: S.sway,
      segments,
      tips,
    });

    structures.push({
      x, z,
      // the height the ground shader should treat this as a light at, once it
      // is awake: up in the canopy, not down at the roots
      y: y + height * 0.55,
      height,
      segStart, segCount: segments.length - segStart,
      tipStart, tipCount: tips.length - tipStart,
      bloom: 0,
      awake: false,
      // the world's own light list wants a colour and a brightness per entry
      tint: new THREE.Color(world.palette.bloom),
      vis: 0, glow: 0, dist2: 0,
    });
  }

  const geo = speciesGeometry(world.species);

  const segMesh = createFractalMesh({
    parts: segments,
    geometry: geo.segment,
    fogDensity: world.fog.density,
    sway: S.sway,
    palette: {
      low: world.palette.fractalLow,
      high: world.palette.fractalHigh,
      sky: world.palette.skyTopA,
      ground: world.palette.groundLow,
      fog: world.palette.fog,
      bloom: world.palette.bloom,
      bloomGain: 0.30,          // the body of a structure only warms
      ambient: 0.80,
    },
  });
  segMesh.mesh.renderOrder = -3;
  scene.add(segMesh.mesh);

  const tipMesh = createFractalMesh({
    parts: tips,
    geometry: geo.tip,
    fogDensity: world.fog.density,
    sway: S.sway * 1.35,
    palette: {
      low: world.palette.fractalHigh,
      high: world.palette.bloom,
      sky: world.palette.skyTopA,
      ground: world.palette.groundLow,
      fog: world.palette.fog,
      bloom: world.palette.bloom,
      bloomGain: 1.0,           // ...and the tips are what actually light up
      ambient: 0.95,
    },
  });
  tipMesh.mesh.renderOrder = -3;
  scene.add(tipMesh.mesh);

  /* ── monument ───────────────────────────────────────────────────────── */
  const monumentParts = [];
  const mSize = world.monument.size;
  const mBase = terrain.heightAt(0, 0);
  const mDepth = Math.min(world.monument.type === 'menger' ? quality.mengerDepth : depth, F.maxDepth);

  const origin = new THREE.Vector3(0, mBase + mSize * 0.55, 0);
  if (world.monument.type === 'menger') {
    growMenger({ depth: mDepth, size: mSize, origin, out: monumentParts });
  } else if (world.monument.type === 'spire') {
    growSpire({ depth: mDepth, size: mSize, origin: new THREE.Vector3(0, mBase, 0), out: monumentParts, rand });
  } else {
    growRing({ depth: mDepth, size: mSize, origin: new THREE.Vector3(0, mBase, 0), out: monumentParts, rand });
  }

  const monumentGeo = softBoxGeometry(CONFIG.fractals.blockRound, quality.blockSegments);
  const monument = createFractalMesh({
    parts: monumentParts,
    geometry: monumentGeo,
    fogDensity: world.fog.density,
    sway: 0,
    palette: {
      low: world.palette.fractalLow,
      high: world.palette.fractalHigh,
      sky: world.palette.skyTopA,
      ground: world.palette.groundLow,
      fog: world.palette.fog,
      bloom: world.palette.bloom,
      bloomGain: 0.55,
      ambient: 0.9,
    },
  });
  monument.mesh.renderOrder = -3;
  scene.add(monument.mesh);

  /* ── weather ────────────────────────────────────────────────────────── */
  const clouds = createClouds({ CONFIG, scene, world, count: quality.cloudLayers });

  let spin = 0;
  let awake = 0;
  let growth = 0;
  // how far along the monument stands because of everything the player has
  // ever done here, as opposed to `growth`, which is this visit's motes
  let form = { lift: 0, glow: 0 };

  // where gathered motes go, and where the monument's own light sits
  const monumentPoint = new THREE.Vector3(0, mBase + mSize * 1.05, 0);
  const nearAwake = [];

  return {
    world,
    structures,
    monument,
    monumentPoint,
    segMesh,
    tipMesh,

    /** total instances standing in this world, for the console readout */
    get instances() {
      return segments.length + tips.length + monumentParts.length;
    },

    /** how many structures have been woken, and what fraction that is */
    get awake() { return awake; },
    get awakeFraction() {
      return structures.length ? awake / structures.length : 0;
    },

    /**
     * Light one structure, 0..1. Writes only that structure's slice of the
     * bloom attribute — the rest of the world is untouched.
     */
    setBloom(index, value) {
      const s = structures[index];
      if (!s) return;
      s.bloom = value;
      const segArr = segMesh.bloom.array;
      for (let i = 0; i < s.segCount; i++) segArr[s.segStart + i] = value;
      const tipArr = tipMesh.bloom.array;
      for (let i = 0; i < s.tipCount; i++) tipArr[s.tipStart + i] = value;
      segMesh.bloom.needsUpdate = true;
      tipMesh.bloom.needsUpdate = true;
    },

    /**
     * How full the monument is, 0..1. It brightens and stands a little taller
     * as motes arrive — the growth is small on purpose, because a monument
     * that visibly doubles turns a quiet reward into a progress bar.
     */
    setMonumentGrowth(value) {
      growth = THREE.MathUtils.clamp(value, 0, 1);
      const arr = monument.bloom.array;
      // This visit's motes, plus whatever standing the player has already
      // earned here. A monument in a world you know well is already lit when
      // you arrive, which is the point of coming back to one.
      const lit = Math.min(1, growth * 0.85 + form.glow * 0.55);
      for (let i = 0; i < arr.length; i++) arr[i] = lit;
      monument.bloom.needsUpdate = true;
      monument.mesh.scale.setScalar(0.80 + 0.20 * growth + form.lift);
    },

    /**
     * How the monument stands, from the player's mastery of this world.
     * @param f an entry from MONUMENT_FORMS — dormant through radiant
     */
    setMasteryForm(f) {
      form = f || { lift: 0, glow: 0 };
      this.setMonumentGrowth(growth);
    },

    /**
     * Re-light structures woken on an earlier visit, instantly — a remembered
     * journey should be found as it was left, not watched waking up again.
     * Indices are stable because the scatter is seeded; anything past this
     * tier's structure count is quietly ignored.
     *
     * @param onAwaken called once per restored structure, e.g. to bring the
     *                 audio layers back up to where they were
     */
    restoreAwake(indices, onAwaken) {
      for (const i of indices) {
        const s = structures[i];
        if (!s || s.awake) continue;
        s.awake = true;
        awake++;
        this.setBloom(i, 1);
        s.vis = 1;
        s.glow = CONFIG.awaken.lightPower;
        onAwaken?.(i, s);
      }
    },

    /**
     * Wake anything the wanderer has walked near, and carry on lighting
     * whatever is already waking. Awakening is one-way for the visit: a
     * structure that is lit stays lit however far away you go.
     *
     * @param onAwaken called once, the moment a structure starts to wake
     */
    updateAwakening(dt, x, z, onAwaken) {
      const R = CONFIG.awaken.radius;
      const R2 = R * R;
      for (let i = 0; i < structures.length; i++) {
        const s = structures[i];

        if (!s.awake) {
          const dx = s.x - x, dz = s.z - z;
          if (dx * dx + dz * dz > R2) continue;
          s.awake = true;
          awake++;
          onAwaken?.(i, s);
        }

        if (s.bloom < 1) {
          const next = Math.min(1, s.bloom + dt / CONFIG.awaken.bloomSeconds);
          this.setBloom(i, next);
          s.vis = next;
          s.glow = next * CONFIG.awaken.lightPower;
        }
      }
    },

    /**
     * Awake structures near a point, for the ground shader. Appends into
     * `out` so the caller can merge them with the motes in one list.
     */
    nearestAwake(point, k, out) {
      nearAwake.length = 0;
      const range2 = CONFIG.awaken.lightRange * CONFIG.awaken.lightRange;
      for (const s of structures) {
        if (s.bloom <= 0.02) continue;
        const dx = s.x - point.x, dy = s.y - point.y, dz = s.z - point.z;
        s.dist2 = dx * dx + dy * dy + dz * dz;
        if (s.dist2 > range2) continue;
        let at = nearAwake.length;
        while (at > 0 && nearAwake[at - 1].dist2 > s.dist2) at--;
        if (at >= k) continue;
        // shift-insert by hand — splice allocates, and this is per frame
        if (nearAwake.length < k) nearAwake.length++;
        for (let j = nearAwake.length - 1; j > at; j--) nearAwake[j] = nearAwake[j - 1];
        nearAwake[at] = s;
      }
      for (const s of nearAwake) out.push(s);
      return out;
    },

    setPalette(p) {
      const shared = {
        sky: p.skyTopA, ground: p.groundLow, fog: p.fog, bloom: p.bloom,
      };
      segMesh.setPalette(shared);
      tipMesh.setPalette(shared);
      monument.setPalette(shared);
      clouds.setPalette({ cloud: p.cloud });
    },

    update(dt, ctx) {
      segMesh.update(dt, ctx);
      tipMesh.update(dt, ctx);
      monument.update(dt, ctx);
      clouds.update(dt, ctx);

      // the monument turns, slowly enough that you only notice it if you stop
      spin += dt * CONFIG.fractals.monumentSpin * ctx.motionScale;
      monument.mesh.rotation.y = spin;
    },

    dispose() {
      scene.remove(segMesh.mesh);
      scene.remove(tipMesh.mesh);
      scene.remove(monument.mesh);
      segMesh.dispose();
      tipMesh.dispose();
      monument.dispose();
      clouds.dispose();
      structures.length = 0;
    },
  };
}
