import * as THREE from 'three';

import { pickTier, lowerTier, FrameWatch } from './quality.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createLanterns } from './lanterns.js';
import { createFireflies } from './fireflies.js';
import { createHaze } from './haze.js';
import { createTerrain } from './terrain.js';
import { createRig } from './rig.js';
import { createCharacter } from './character.js';
import { createPost } from './post.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG — everything worth tweaking lives here.

   Start with `palette`, `lanterns.riseSpeed`, `stars.count` and `tiers`.
   Colours are plain sRGB hex; Three.js converts them to linear for you.
   ═══════════════════════════════════════════════════════════════════════════ */
const CONFIG = {

  palette: {
    skyTopA:     0x121a3a,   // deep indigo overhead
    skyTopB:     0x1a1636,   // the violet it drifts toward over several minutes
    skyHorizon:  0x05060d,   // near-black where the sky meets the lake
    horizonGlow: 0x1a1008,   // a breath of distant town light on the horizon
    waterDeep:   0x0a1526,   // the lake itself
    waterFar:    0x070a14,   // used by the low-tier water only
    lanternWarm: 0xffb257,   // core amber
    lanternCool: 0xff8f4d,   // the other end of the lantern tint range
    firefly:     0xffd08a,
    haze:        0x2a3352,
    sand:        0x9c907a,   // dry sand, as it would look under a warm light
    sandWet:     0x4a4234,   // darker where the lake has been over it
    tree:        0x05070e,   // conifers against the sky: near-black is right
    treeLit:     0x2f3a2a,   // ...but this is what lantern light lands on

    // the wanderer. Kept a shade lighter than the ground behind them, or the
    // figure disappears into the horizon whenever they walk toward it.
    cloakLow:    0x352c52,   // the hem, in shadow
    cloakHigh:   0x6d629a,   // shoulders and hood, catching the sky
    cloakRim:    0xa79ad0,   // the edge light that lifts them off the fog
    cloakGlow:   0xffc98a,   // the light they carry at the chest
    shadow:      0x05070e,   // the contact shadow under them
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
    fogDensity: 0.009,       // how quickly distance swallows a lantern
    despawnZ: 260,
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
    lightRange: 26,          // how far a lantern's light reaches onto sand
    // Nothing releases lanterns by hand any more; the lake seeds its own while
    // the gathering loop is being built. Phase 4 replaces this wholesale.
    ambientInterval: 5.5,    // seconds between one drifting up on its own
    ambientRadius: 55,
  },

  spawn: { nearest: 7, farthest: 70, fallbackDistance: 26 },

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
  },

  /* The archipelago you drift toward — and can land on and walk around. */
  islands: {
    seed: 7,
    count: 13,
    minDistance: 55, maxDistance: 430,
    minRadius: 15, maxRadius: 30,
    minHeight: 2.2, maxHeight: 7.5,
    cellSize: 1.0,           // metres per terrain quad; smaller = finer dunes
    underwaterDrop: 2.4,     // how far the ground sinks past the shoreline
    shoreAt: 0.92,           // fraction of the radius where the sand meets water
    beachFalloff: 1.7,       // >1 gives a long shallow toe you can stand on
    shoreScale: 0.05,        // noise frequency that makes the coastline wander
    shoreWobble: 0.11,       // ...and how far it wanders, as a fraction of radius
    duneScale: 0.085,        // dune noise frequency
    duneAmount: 0.42,        // ...and how much of the island height it moves
    grain: 0.030,            // per-pixel sand grain, as a normal slope
    ripple: 0.11,            // depth of the ripples the water leaves behind
    detailFade: 0.05,        // how quickly grain fades with distance
    ambient: 0.55,           // how much of the night sky the sand catches
    sandLights: 6,           // nearest lanterns that light the beach
    lightPower: 3.2,         // brightness of a lantern falling on sand
    treeMinHeight: 1.4,      // no conifers down on the wet sand
    maxTrees: 7, treeHeight: 5.5,
    fogDensity: 0.0035,      // how far away they melt into the horizon
  },

  breeze: {
    power: 1.1,              // drag acceleration, units/sec²
    radius: 9.0,
    decay: 1.8,              // seconds for a puff to die out
    maxDrift: 0.55,          // ceiling on sideways speed, units/sec
    maxPuffs: 8,
    puffSpacing: 0.6,        // world units of finger travel between puffs
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
    hint2DelayMs: 9000,      // when the "two fingers to drift" nudge appears
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

  mood: { periodSeconds: 420 },   // one full colour / density cycle

  /* Quality tiers. `pickTier` guesses from the device, then the frame watcher
     steps down if the guess was optimistic. Set `forceTier` to pin one. */
  forceTier: null,           // 'low' | 'medium' | 'high' | null
  tiers: {
    high: {
      maxLanterns: 40, starScale: 1.0, particleScale: 1.0,
      reflections: true, reflectionSize: 512, waterNormalSize: 256,
      terrainCell: 1.5,
      charSegments: 22, charShadow: true,
      bloom: true, bloomScale: 0.5, msaa: 0, pixelRatio: 2,
    },
    medium: {
      maxLanterns: 30, starScale: 0.7, particleScale: 0.8,
      reflections: true, reflectionSize: 256, waterNormalSize: 128,
      terrainCell: 2.2,
      charSegments: 16, charShadow: true,
      bloom: true, bloomScale: 0.4, msaa: 0, pixelRatio: 1.75,
    },
    low: {
      maxLanterns: 20, starScale: 0.45, particleScale: 0.6,
      reflections: false, reflectionSize: 0, waterNormalSize: 128,
      terrainCell: 3.0,
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
  let water      = createWater({ CONFIG, quality, scene, renderer });
  let lanterns   = createLanterns({ CONFIG, quality, scene });
  let fireflies  = createFireflies({ CONFIG, quality, scene });
  let haze       = createHaze({ CONFIG, scene });
  const terrain  = createTerrain({ CONFIG, quality, scene });
  const rig      = createRig({ CONFIG, camera, terrain });
  let character  = createCharacter({ CONFIG, quality, scene });
  let post       = createPost({ CONFIG, quality, renderer, scene, camera });

  const audio = createAudio(CONFIG);
  const ui = createUI({ CONFIG, audio });

  const input = createInput({
    CONFIG,
    camera,
    domElement: renderer.domElement,
    onWake: () => ui.wake(),
  });

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

  /* ── adaptive quality ──────────────────────────────────────────────── */
  const frameWatch = new FrameWatch();

  function downgrade(force = false) {
    if (picked.pinned && !force) return;   // the tier was asked for explicitly
    const next = lowerTier(tierName);
    if (next === tierName) return;      // already at the bottom
    tierName = next;
    quality = CONFIG.tiers[tierName];

    // Rebuild only what the tier actually changes. Lantern state is lost, but
    // the ones in the air simply finish their flight and the player releases
    // more — far less jarring than a stutter that never goes away.
    water.dispose();
    lanterns.dispose();
    fireflies.dispose();
    character.dispose();
    post.dispose();

    water = createWater({ CONFIG, quality, scene, renderer });
    lanterns = createLanterns({ CONFIG, quality, scene });
    fireflies = createFireflies({ CONFIG, quality, scene });
    character = createCharacter({ CONFIG, quality, scene });
    post = createPost({ CONFIG, quality, renderer, scene, camera });

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

  let last = performance.now();
  let time = 0;
  let ambientAt = 2;

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

    // the lake seeds its own lanterns for now; the gathering loop replaces
    // this in a later pass
    ambientAt -= dt;
    if (ambientAt <= 0) {
      ambientAt = CONFIG.lanterns.ambientInterval * (0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * CONFIG.lanterns.ambientRadius;
      const lx = rig.state.x + Math.cos(a) * r;
      const lz = rig.state.z + Math.sin(a) * r;
      lanterns.release(lx, lz, Math.random() * 0.5, terrain.heightAt(lx, lz));
    }

    terrain.setLights(lanterns.nearestTo(camera.position, CONFIG.islands.sandLights));

    sky.update(dt, ctx);
    water.update(dt, ctx);
    lanterns.update(dt, ctx);
    fireflies.update(dt, ctx);
    haze.update(dt, ctx);

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
    get character() { return character; },
  };
}

/* ── offline support ──────────────────────────────────────────────────── */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
