import * as THREE from 'three';

import { pickTier, lowerTier, FrameWatch } from './quality.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createLanterns } from './lanterns.js';
import { createFireflies } from './fireflies.js';
import { createHaze } from './haze.js';
import { createIslands } from './islands.js';
import { createRig } from './rig.js';
import { createHoldGlow } from './holdglow.js';
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
    island:      0x05070e,   // island silhouettes, barely above the horizon
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

  camera: {
    height: 4.5,             // eye height above the water, like a low dock
    lookAtHeight: 6.6,       // pitched slightly up: more sky than lake
    lookAtDistance: 34,
    fovPortrait: 72,
    fovLandscape: 62,
    bob: 0.055,              // vertical breathing; 0 is perfectly still
    bobSpeed: 0.16,
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
    glowPower: 0.48,         // brightness of the flame's core + halo
    drag: 0.55,              // per-second velocity decay back to stillness
    fadeStartY: 30,
    fadeEndY: 66,
    despawnDistance: 260,    // recycled once this far from the camera
  },

  spawn: { nearest: 8, farthest: 80, fallbackDistance: 34 },

  /* Drifting across the lake. Two fingers to steer and glide; WASD or the
     arrow keys on a laptop. Everything is capped and heavily damped — this
     should never feel like driving. */
  movement: {
    maxSpeed: 3.2,           // units/sec, roughly a slow row
    maxTurnSpeed: 0.42,      // radians/sec
    damping: 0.45,           // per-second velocity decay; you coast to a stop
    deadzone: 14,            // px of two-finger offset that does nothing
    touchTurn: 0.010,        // radians/sec² per px held away from the origin
    touchGlide: 0.10,        // units/sec² per px held away from the origin
    keyTurn: 1.6,            // radians/sec² while a turn key is held
    keyGlide: 9.0,           // units/sec² while a glide key is held
  },

  /* The archipelago you drift toward. */
  islands: {
    seed: 7,
    count: 16,
    minDistance: 70, maxDistance: 470,
    minRadius: 12, maxRadius: 42,
    minHeight: 3.5, maxHeight: 13,
    maxTrees: 6, treeHeight: 6.5,
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

  haze: { radius: 110, height: 11, amount: 0.30, centerY: 2.6 },

  input: {
    dragThreshold: 14,       // px before a touch counts as a drag, not a tap
    holdFeedbackMs: 180,     // when the glow under the finger starts to show
    holdForBig: 650,         // ms held before a lantern counts as "big"
    holdMax: 1800,           // ms at which size maxes out
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
      bloom: true, bloomScale: 0.5, msaa: 0, pixelRatio: 2,
    },
    medium: {
      maxLanterns: 30, starScale: 0.7, particleScale: 0.8,
      reflections: true, reflectionSize: 256, waterNormalSize: 128,
      bloom: true, bloomScale: 0.4, msaa: 0, pixelRatio: 1.75,
    },
    low: {
      maxLanterns: 20, starScale: 0.45, particleScale: 0.6,
      reflections: false, reflectionSize: 0, waterNormalSize: 128,
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
  camera.position.set(0, CONFIG.camera.height, 6);

  /* ── scene systems ─────────────────────────────────────────────────── */
  let sky        = createSky({ CONFIG, quality, scene });
  let water      = createWater({ CONFIG, quality, scene, renderer });
  let lanterns   = createLanterns({ CONFIG, quality, scene });
  let fireflies  = createFireflies({ CONFIG, quality, scene });
  let haze       = createHaze({ CONFIG, scene });
  const islands  = createIslands({ CONFIG, scene });
  const rig      = createRig({ CONFIG, camera });
  let holdGlow   = createHoldGlow({ CONFIG, scene });
  let post       = createPost({ CONFIG, quality, renderer, scene, camera });

  const audio = createAudio(CONFIG);
  const ui = createUI({ CONFIG, audio });

  const input = createInput({
    CONFIG,
    camera,
    domElement: renderer.domElement,
    onWake: () => ui.wake(),
    onRelease: (x, z, bigness) => {
      // the tap that wakes the scene from a deep fade only brings the light
      // back; it shouldn't also drop a lantern
      if (ui.consumeWakeTap()) return;
      lanterns.release(x, z, bigness);
    },
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
    post.dispose();

    water = createWater({ CONFIG, quality, scene, renderer });
    lanterns = createLanterns({ CONFIG, quality, scene });
    fireflies = createFireflies({ CONFIG, quality, scene });
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

    // steer and glide, then let the rig place the camera (bob included)
    const move = input.takeNav(dt);
    if (move.turn || move.glide) {
      rig.push(move.turn, move.glide);
      ui.noteMovement();
    }
    rig.update(dt, time, cameraMotion);

    sky.update(dt, ctx);
    water.update(dt, ctx);
    lanterns.update(dt, ctx);
    fireflies.update(dt, ctx);
    haze.update(dt, ctx);
    holdGlow.update(dt, input.heldAt(), input.heldFor());

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
    renderer, scene, camera, rig,
  };
}

/* ── offline support ──────────────────────────────────────────────────── */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
