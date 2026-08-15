import * as THREE from 'three';

import { pickTier, lowerTier, FrameWatch } from './quality.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createLanterns } from './lanterns.js';
import { createFireflies } from './fireflies.js';
import { createHaze } from './haze.js';
import { createTerrain } from './terrain.js';
import { WORLDS, createWorldContent, makePaletteCycler } from './worlds.js';
import { createRig } from './rig.js';
import { createCharacter } from './character.js';
import { createPost } from './post.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG — everything worth tweaking lives here.

   Per-world colour, fog and fractal settings live in worlds.js; what is here
   is the fallback palette every world starts from and the machinery that is
   the same wherever you are. Start with `worlds` in worlds.js, then
   `fractals.maxDepth`, `movement.maxSpeed` and `tiers`.

   Colours are plain sRGB hex; Three.js converts them to linear for you.
   ═══════════════════════════════════════════════════════════════════════════ */
const CONFIG = {

  /* The fallback palette. Every world in worlds.js overrides most of it; what
     survives here is what a world chose not to have an opinion about. */
  palette: {
    skyTopA:     0x2a2c4e,   // overhead
    skyTopB:     0x373258,   // the colour it drifts toward over several minutes
    skyHorizon:  0x4a4468,   // low down, where the sky meets the ground
    horizonGlow: 0x2a1c2e,   // a breath of warmth sitting on the horizon
    fog:         0x3d3a5c,
    groundLow:   0x353a56,
    groundHigh:  0x6f7290,
    waterDeep:   0x232a44,
    waterFar:    0x1a1e34,   // used by the low-tier water only
    lanternWarm: 0xffd2a0,   // core of a mote
    lanternCool: 0xffb98a,   // the other end of the mote tint range
    firefly:     0xc4c8f0,
    haze:        0x4a4670,

    // the wanderer. Kept a shade lighter than the ground behind them, or the
    // figure disappears into the horizon whenever they walk toward it.
    cloakLow:    0x352c52,   // the hem, in shadow
    cloakHigh:   0x6d629a,   // shoulders and hood, catching the sky
    cloakRim:    0xa79ad0,   // the edge light that lifts them off the fog
    cloakGlow:   0xffc98a,   // the light they carry at the chest
    shadow:      0x1e1c30,   // the contact shadow under them
  },

  render: {
    exposure: 0.95,          // low on purpose — this is for a dark room
    maxPixelRatio: 2,        // mobile GPUs hate 3x
  },

  // Kept deliberately soft. Raising `strength` past ~0.9 starts to look like
  // a lens effect rather than light.
  bloom: {
    strength: 0.48,
    radius: 0.62,
    threshold: 0.62,
  },

  vignette: { amount: 0.85, radius: 0.80, softness: 0.58, dither: 1.0 },

  /* The mirror symmetry at the edges of the frame. `amount` is the one to be
     careful with: it is blended over the plain render, and much past ~0.35 the
     periphery stops being dreamlike and starts being disorienting. `inner`
     and `outer` are fractions of the half-diagonal — everything inside
     `inner` is left completely alone, which is what keeps the wanderer and
     the ground under them from ever being mirrored. */
  kaleidoscope: {
    enabled: true,
    amount: 0.20,
    segments: 6,
    speed: 0.010,            // radians/sec. This is meant to be barely a drift.
    inner: 0.34,             // untouched out to here...
    outer: 0.82,             // ...and fully folded past here
    reducedScale: 0.4,       // multiplier under prefers-reduced-motion
  },

  /* Third person, trailing the wanderer. The distance is the one number worth
     playing with: much under 5 and the figure fills the frame in portrait,
     much over 8 and they stop being the subject of the shot. */
  camera: {
    distance: 6.4,           // how far behind
    height: 2.55,            // ...and how far above their feet
    lookAhead: 5.5,          // the gaze lands this far in front of them...
    lookRise: 1.35,          // ...and this high, i.e. just over their shoulder
    follow: 2.4,             // damping rate; lower = the view lags further
    lookFollow: 3.0,         // the gaze catches up faster than the body does
    minClearance: 1.1,       // never let the camera sink into a rise behind us
    fovPortrait: 68,
    fovLandscape: 58,
    bob: 0.05,               // vertical breathing; 0 is perfectly still
    bobSpeed: 0.16,
  },

  /* The wanderer themself. `scale` is the whole figure; everything else is
     how the cloth behaves. hemWobble past ~0.15 starts to look like wind
     rather than fabric. */
  character: {
    scale: 1.0,
    ambient: 0.72,           // how much of the sky the robe catches
    glow: 1.15,              // brightness of the light at the chest
    glowSize: 0.30,
    bob: 0.042,              // vertical float, in units
    bobSpeed: 1.15,          // ...and its rate, per second
    lean: 0.20,              // radians of roll at a full-speed turn
    pitch: 0.07,             // radians of forward tilt at full speed
    hemWobble: 0.085,        // amplitude of the cloth sway at the hem
    hemDrag: 0.13,           // how far the hem trails behind the travel
    swaySpeed: 1.1,
    shadowRadius: 1.15,
    shadowOpacity: 0.42,
  },

  world: {
    skyRadius: 600,
    starRadiusNear: 260,
    starRadiusFar: 520,
    waterSize: 1400,
    fogDensity: 0.009,       // fallback; each world sets its own
    start: 0,                // which entry in worlds.js you arrive in
  },

  /* The fractal builders. `maxDepth` is the ceiling nothing may exceed however
     generous a tier is being — a branching structure is 3^depth instances, so
     this is the number standing between the scene and a phone-melting world. */
  fractals: {
    maxDepth: 5,
    blockRound: 0.34,        // 0 = a box, 1 = a sphere, for monument blocks
    monumentSpin: 0.012,     // radians/sec — slow enough to only notice at rest
  },

  /* The ground shader. `lights` is a shader constant: changing it recompiles. */
  ground: {
    lights: 6,               // nearest motes that light the ground
    lightPower: 3.2,
    grain: 0.028,            // per-pixel surface grain, as a normal slope
    detailFade: 0.045,       // how quickly the grain fades with distance
  },

  water: {
    distortion: 0.50,        // how much the surface bends the reflection;
                             // low keeps the lantern's mirror image coherent
    rippleSize: 9.0,         // bigger = longer, smoother swells
    flowSpeed: 0.12,         // very slow: this is a lake, not a sea
    reflectionInterval: 1 / 30,   // seconds between reflection re-renders
    reflectionSmear: 0.018,  // how far reflections streak toward the viewer
    reflectivity: 0.72,      // how much of the sky the lake gives back
  },

  stars: { count: 1500, brightness: 0.62, drift: 0.0055, twinkleSpeed: 0.35 },

  lanterns: {
    baseSize: 0.75,          // a tapped lantern
    sizeRange: 1.25,         // ...plus this much for a fully-held one
    riseSpeed: 0.55,         // units/sec
    riseSpeedBig: 0.34,      // held lanterns are heavier and climb slower
    sway: 0.16,
    // Emissive multiplier for the paper. Kept modest on purpose: push it much
    // past ~1.4 and the tone curve clips the amber toward white.
    glow: 1.15,
    glowRadius: 2.3,         // glow card size, relative to the lantern
    glowPower: 0.40,         // brightness of the flame's core + halo
    drag: 0.55,              // per-second velocity decay back to stillness
    fadeStartY: 30,
    fadeEndY: 66,
    despawnDistance: 260,    // recycled once this far from the camera
    lightRange: 26,          // how far a lantern's light reaches onto the ground
    // Nothing releases lanterns by hand any more; each world seeds its own
    // while the gathering loop is being built. Phase 4 replaces this wholesale.
    ambientInterval: 5.5,    // seconds between one drifting up on its own
    ambientRadius: 55,
  },

  /* Wandering. Drag anywhere for a floating joystick, tap ahead of yourself to
     drift that way, or WASD / arrow keys on a laptop. Everything is capped and
     heavily damped — this should never feel like driving. */
  movement: {
    maxSpeed: 2.5,           // units/sec, an unhurried walking pace
    accel: 10.0,             // units/sec² while the stick is fully over
    damping: 0.03,           // per-second velocity decay; you settle, not skid
    maxTurnSpeed: 1.7,       // radians/sec, hard ceiling
    turnGain: 3.2,           // how eagerly the heading chases the stick
    turnResponse: 5.0,       // damping rate of the turn itself
    deadzone: 12,            // px of stick offset that does nothing
    stickRadius: 92,         // px from the origin that counts as fully over
    groundFollow: 7.0,       // how quickly the figure settles onto the ground
    edgeAt: 0.88,            // fraction of the world radius where it leans back
    edgePull: 9.0,           // units/sec² of that lean, at the very edge
  },

  breeze: {
    power: 1.1,              // drag acceleration, units/sec²
    radius: 9.0,
    decay: 1.8,              // seconds for a puff to die out
    maxDrift: 0.55,          // ceiling on sideways speed, units/sec
    maxPuffs: 8,
  },

  wind: { strength: 0.10 },

  fireflies: { count: 14, brightness: 1.5, range: 46 },

  haze: { radius: 110, height: 7.5, amount: 0.30, centerY: 1.5 },

  input: {
    dragThreshold: 12,       // px before a touch counts as a drag, not a tap
    tapMaxMs: 420,           // a touch shorter than this, and still, is a tap
    tapAnchor: 0.62,         // where down the screen the wanderer sits, 0..1
    tapDecaySeconds: 1.6,    // how long a tap keeps nudging them along
  },

  ui: {
    hintDelayMs: 2600,
    hint2DelayMs: 9000,      // when the "or tap ahead of yourself" nudge appears
    hint2VisibleMs: 9000,
    sleepAfterSeconds: 600,  // ~10 minutes of stillness, then it dims itself
    sleepFadeSeconds: 50,
    wakeFadeSeconds: 2.5,
    wakeLock: true,
  },

  audio: {
    enabled: true,
    volume: 0.16,            // intentionally very quiet
    fadeInSeconds: 8,
    chord: [110.0, 164.81, 220.0, 246.94],
  },

  /* The slow colour drift. Every world's palette breathes between itself and
     a warmer, slightly-shifted copy of itself over `periodSeconds`, so nothing
     you look at for five minutes is ever quite the colour it was. Keep the
     shifts small: this should be something you only notice by leaving. */
  mood: {
    periodSeconds: 420,      // one full colour cycle
    hueShift: 0.035,         // how far round the wheel the far end of the cycle sits
    satShift: 0.88,          // ...and what it does to saturation
    lumShift: 1.10,          // ...and to lightness
    applyEvery: 0.25,        // seconds between re-tints; this is not per-frame work
  },

  /* Quality tiers. `pickTier` guesses from the device, then the frame watcher
     steps down if the guess was optimistic. Set `forceTier` to pin one. */
  forceTier: null,           // 'low' | 'medium' | 'high' | null
  tiers: {
    high: {
      maxLanterns: 40, starScale: 1.0, particleScale: 1.0,
      reflections: true, reflectionSize: 512, waterNormalSize: 256,
      groundCells: 128,
      fractalDepth: 5, fractalInstances: 7000, structureScale: 1.0,
      mengerDepth: 2, blockSegments: 3, cloudLayers: 3, kaleidoscope: true,
      charSegments: 22, charShadow: true,
      bloom: true, bloomScale: 0.5, msaa: 0, pixelRatio: 2,
    },
    medium: {
      maxLanterns: 30, starScale: 0.7, particleScale: 0.8,
      reflections: true, reflectionSize: 256, waterNormalSize: 128,
      groundCells: 96,
      fractalDepth: 4, fractalInstances: 3600, structureScale: 0.8,
      mengerDepth: 2, blockSegments: 2, cloudLayers: 2, kaleidoscope: true,
      charSegments: 16, charShadow: true,
      bloom: true, bloomScale: 0.4, msaa: 0, pixelRatio: 1.75,
    },
    low: {
      maxLanterns: 20, starScale: 0.45, particleScale: 0.6,
      reflections: false, reflectionSize: 0, waterNormalSize: 128,
      groundCells: 64,
      fractalDepth: 3, fractalInstances: 1600, structureScale: 0.6,
      mengerDepth: 1, blockSegments: 1, cloudLayers: 1, kaleidoscope: false,
      charSegments: 11, charShadow: false,
      bloom: false, bloomScale: 0.35, msaa: 0, pixelRatio: 1.25,
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   bootstrap
   ═══════════════════════════════════════════════════════════════════════════ */
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cameraMotion = reduceMotion ? 0.18 : 1;   // camera bob
const sceneMotion  = reduceMotion ? 0.6 : 1;    // drift of everything else

const picked = pickTier(CONFIG);
let tierName = picked.tier;
let quality = CONFIG.tiers[tierName];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: false,          // the composer and bloom handle edges for us
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch { /* handled below */ }

if (!renderer || !renderer.getContext()) {
  document.getElementById('nogl').style.display = 'grid';
  document.getElementById('hint').remove();
} else {
  start();
}

function start() {
  renderer.setClearColor(CONFIG.palette.skyHorizon, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping is applied once, by OutputPass at the end of the chain —
  // materials render linear HDR into the composer's half-float targets.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.render.exposure;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fovPortrait, 1, 0.1, 900);
  camera.position.set(0, CONFIG.camera.height, 6 + CONFIG.camera.distance);

  /* ── scene systems ─────────────────────────────────────────────────── */
  let sky        = createSky({ CONFIG, quality, scene });
  let water      = null;               // only the worlds that have any
  let lanterns   = createLanterns({ CONFIG, quality, scene });
  let fireflies  = createFireflies({ CONFIG, quality, scene });
  let haze       = createHaze({ CONFIG, scene });
  const terrain  = createTerrain({ CONFIG, quality, scene });
  const rig      = createRig({ CONFIG, camera, terrain });
  let character  = createCharacter({ CONFIG, quality, scene });
  let post       = createPost({ CONFIG, quality, renderer, scene, camera, motion: cameraMotion });

  const audio = createAudio(CONFIG);
  const ui = createUI({ CONFIG, audio });

  const input = createInput({
    CONFIG,
    camera,
    domElement: renderer.domElement,
    onWake: () => ui.wake(),
  });

  /* ── worlds ──────────────────────────────────────────────────────────
   *
   * Loading a world is: throw away the last one's geometry, rebuild the
   * ground, grow the new one's contents, and re-tint everything shared. The
   * shared systems are re-tinted rather than rebuilt — a ShaderMaterial is a
   * shader compile, and compiling one mid-transition is exactly where a
   * stutter would show.
   */
  let worldIndex = -1;
  let world = null;
  let content = null;
  let cyclePalette = null;

  function loadWorld(index) {
    worldIndex = ((index % WORLDS.length) + WORLDS.length) % WORLDS.length;
    world = WORLDS[worldIndex];
    const p = world.palette;

    if (content) content.dispose();

    terrain.build(world);
    content = createWorldContent({ CONFIG, quality, scene, world, terrain });
    cyclePalette = makePaletteCycler(p, CONFIG.mood);

    sky.setPalette(p);
    sky.setStars(world.stars);
    haze.setPalette(p);
    fireflies.setPalette(p);
    fireflies.setDensity(world.fireflies);
    lanterns.setPalette(p);
    character.setPalette(p);
    character.setFogDensity(world.fog.density);
    renderer.setClearColor(p.fog, 1);

    // water is per-world: most of them have none at all
    if (water) { water.dispose(); water = null; }
    if (world.water) water = createWater({ CONFIG, quality, scene, renderer, world });

    // arrive out on the plaza, facing the monument in the middle
    rig.place(0, world.ground.plazaRadius * 2.4, 0);
  }

  /* ── resize ────────────────────────────────────────────────────────── */
  let pixelRatio = 1;
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    pixelRatio = Math.min(
      window.devicePixelRatio || 1,
      CONFIG.render.maxPixelRatio,
      quality.pixelRatio
    );

    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.75 ? CONFIG.camera.fovPortrait : CONFIG.camera.fovLandscape;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    post.setSize(w, h, pixelRatio);

    sky.setViewportHeight(h);
    fireflies.setViewportHeight(h);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  resize();

  loadWorld(CONFIG.world.start);

  /* ── adaptive quality ──────────────────────────────────────────────── */
  const frameWatch = new FrameWatch();

  function downgrade(force = false) {
    if (picked.pinned && !force) return;   // the tier was asked for explicitly
    const next = lowerTier(tierName);
    if (next === tierName) return;      // already at the bottom
    tierName = next;
    quality = CONFIG.tiers[tierName];

    // Everything the tier actually changes goes: the fractals thin out, the
    // ground coarsens, the motes in flight are lost. The world is rebuilt
    // rather than patched because its instance counts are baked at build time
    // — and a world rebuilt in place is a fraction of a second where a
    // permanent stutter would otherwise be.
    lanterns.dispose();
    fireflies.dispose();
    character.dispose();
    post.dispose();

    lanterns = createLanterns({ CONFIG, quality, scene });
    fireflies = createFireflies({ CONFIG, quality, scene });
    character = createCharacter({ CONFIG, quality, scene });
    post = createPost({ CONFIG, quality, renderer, scene, camera, motion: cameraMotion });

    // ...and this rebuilds the ground, the fractals and the water, and
    // re-tints everything that was just replaced
    const at = { x: rig.state.x, z: rig.state.z, yaw: rig.state.yaw };
    loadWorld(worldIndex);
    rig.place(at.x, at.z, at.yaw);

    resize();
  }

  /* ── slow ambient wind, a lazy noise field made of sines ───────────── */
  const wind = { x: 0, z: 0 };
  function updateWind(t) {
    const s = CONFIG.wind.strength;
    wind.x = (Math.sin(t * 0.061) * 0.6 + Math.sin(t * 0.017 + 1.3) * 0.4) * s;
    wind.z = Math.sin(t * 0.043 + 2.1) * 0.5 * s * 0.5;
  }

  /* ── main loop ─────────────────────────────────────────────────────── */
  const ctx = {
    time: 0, dim: 1, mood: 0, mood2: 0,
    motionScale: sceneMotion,
    cameraPosition: camera.position,
    wind,
    breezes: input.breezes,
  };

  /**
   * Re-tint everything that drifts with the mood. The sky runs its own cycle
   * off the same phase, so it is left out of this — colouring it twice makes
   * the two cycles fight and the horizon wobbles.
   */
  function applyMood(mood) {
    const p = cyclePalette(mood);
    terrain.setPalette(p);
    content.setPalette(p);
    haze.setPalette(p);
    fireflies.setPalette(p);
    lanterns.setPalette(p);
    character.setPalette(p);
  }

  let last = performance.now();
  let time = 0;
  let ambientAt = 2;
  let moodAt = 0;

  function frame(now) {
    const rawDt = now - last;
    last = now;
    const dt = Math.min(rawDt / 1000, 0.05);   // clamp after a tab switch
    time += dt;

    if (frameWatch.sample(rawDt)) downgrade();

    const phase = (time / CONFIG.mood.periodSeconds) * Math.PI * 2;
    ctx.time = time;
    ctx.mood = 0.5 + 0.5 * Math.sin(phase);
    ctx.mood2 = 0.5 + 0.5 * Math.sin(phase * 0.61 + 1.1);
    ctx.dim = ui.update(dt, renderer);

    // a few times a second, not every frame: the drift takes seven minutes to
    // come round, so a quarter of a second of quantisation is invisible
    moodAt -= dt;
    if (moodAt <= 0) {
      moodAt = CONFIG.mood.applyEvery;
      applyMood(ctx.mood);
    }

    updateWind(time);
    input.update(dt);

    // ask for a direction, then let the rig walk the wanderer and trail the
    // camera behind them
    const move = input.takeNav();
    if (move.strength > 0) {
      rig.steer(move.x, move.z, move.strength);
      ui.noteMovement();
    }
    rig.update(dt, time, cameraMotion);
    character.update(dt, ctx, rig.state);

    // each world seeds its own drifting lights for now; the gathering loop
    // replaces this in a later pass
    ambientAt -= dt;
    if (ambientAt <= 0) {
      ambientAt = CONFIG.lanterns.ambientInterval * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * CONFIG.lanterns.ambientRadius;
      const lx = rig.state.x + Math.cos(a) * r;
      const lz = rig.state.z + Math.sin(a) * r;
      lanterns.release(lx, lz, Math.random() * 0.5, terrain.heightAt(lx, lz));
    }

    terrain.setLights(lanterns.nearestTo(camera.position, CONFIG.ground.lights));

    sky.update(dt, ctx);
    if (water) water.update(dt, ctx);
    lanterns.update(dt, ctx);
    fireflies.update(dt, ctx);
    haze.update(dt, ctx);
    content.update(dt, ctx);

    post.render(dt);
  }

  renderer.setAnimationLoop(frame);

  // let go of the GPU politely if the page is put away
  window.addEventListener('pagehide', () => renderer.setAnimationLoop(null));
  window.addEventListener('pageshow', () => {
    last = performance.now();
    renderer.setAnimationLoop(frame);
  });

  // Exposed for tuning from the console. CONFIG is read live every frame, so
  // e.g. __night.CONFIG.lanterns.riseSpeed = 1.2 takes effect immediately.
  window.__night = {
    CONFIG,
    get tier() { return tierName; },
    get lanterns() { return lanterns.count; },
    /** force the next quality step down, as the frame watcher would */
    downgrade() { const was = tierName; downgrade(true); return `${was} -> ${tierName}`; },
    renderer, scene, camera, rig, terrain,
    get post() { return post; },
    get character() { return character; },
    /** hold the colour drift at a point on its cycle, for looking at one end */
    mood(v) { applyMood(v); return v; },
    get world() { return world.key; },
    get instances() { return content.instances; },
    get structures() { return content.structures; },
    /** step to a world by index or by key, for looking at one on purpose */
    go(which) {
      const i = typeof which === 'number'
        ? which
        : WORLDS.findIndex((w) => w.key === which);
      if (i >= 0) loadWorld(i);
      return world.key;
    },
  };
}

/* ── offline support ──────────────────────────────────────────────────── */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
