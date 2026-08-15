import * as THREE from 'three';

import { pickTier, lowerTier, FrameWatch } from './quality.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createLanterns } from './lanterns.js';
import { createFireflies } from './fireflies.js';
import { createHaze } from './haze.js';
import { createTerrain } from './terrain.js';
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
    sand:        0x9c907a,   // dry sand, as it would look under a warm light
    sandWet:     0x4a4234,   // darker where the lake has been over it
    tree:        0x05070e,   // conifers against the sky: near-black is right
    treeLit:     0x2f3a2a,   // ...but this is what lantern light lands on
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
    // First person, at the waterline: eye height of someone sitting on a low
    // jetty with their feet near the surface. Anything much above ~2 starts to
    // read as looking down on the lake from a drone.
    height: 1.6,
    lookAtRise: 2.1,         // how much higher than the eye the gaze lands...
    lookAtDistance: 34,      // ...at this distance, i.e. pitched slightly up
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
    glowPower: 0.40,         // brightness of the flame's core + halo
    drag: 0.55,              // per-second velocity decay back to stillness
    fadeStartY: 30,
    fadeEndY: 66,
    despawnDistance: 260,    // recycled once this far from the camera
    lightRange: 26,          // how far a lantern's light reaches onto sand
  },

  spawn: { nearest: 7, farthest: 70, fallbackDistance: 26 },

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
    // ashore you walk instead of gliding: slower, and it stops when you do
    landMaxSpeed: 1.7,
    landDamping: 0.02,
    groundFollow: 7.0,       // how quickly the eye settles onto the ground
    strideRate: 1.5,         // footfalls per unit walked
    strideBob: 0.035,        // vertical footfall movement
    strideSway: 0.022,       // ...and the sideways part of it
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
      terrainCell: 1.5,
      bloom: true, bloomScale: 0.5, msaa: 0, pixelRatio: 2,
    },
    medium: {
      maxLanterns: 30, starScale: 0.7, particleScale: 0.8,
      reflections: true, reflectionSize: 256, waterNormalSize: 128,
      terrainCell: 2.2,
      bloom: true, bloomScale: 0.4, msaa: 0, pixelRatio: 1.75,
    },
    low: {
      maxLanterns: 20, starScale: 0.45, particleScale: 0.6,
      reflections: false, reflectionSize: 0, waterNormalSize: 128,
      terrainCell: 3.0,
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
  const terrain  = createTerrain({ CONFIG, quality, scene });
  const rig      = createRig({ CONFIG, camera, terrain });
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
      lanterns.release(x, z, bigness, terrain.heightAt(x, z));
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

    terrain.setLights(lanterns.nearestTo(camera.position, CONFIG.islands.sandLights));

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
    renderer, scene, camera, rig, terrain,
  };
}

/* ── offline support ──────────────────────────────────────────────────── */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
