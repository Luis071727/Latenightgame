import * as THREE from 'three';

import { pickTier, lowerTier, FrameWatch } from './quality.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createMotes } from './motes.js';
import { createFireflies } from './fireflies.js';
import { createHaze } from './haze.js';
import { createTerrain } from './terrain.js';
import { WORLDS, createWorldContent, makePaletteCycler } from './worlds.js';
import { createGate } from './gate.js';
import { createRig } from './rig.js';
import { createCharacter } from './character.js';
import { createCompanion } from './companion.js';
import { createPost } from './post.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { loadSettings, saveSettings } from './save.js';
import { createArchive } from './archive.js';
import { createFragments } from './fragments.js';
import { createJournal } from './journal.js';
import { createAnalytics, EVENTS } from './analytics.js';
import { createProfileService, createLeaderboardService } from './leaderboard.js';
import { RARITY, title, cosmetic } from './discoveries.js';

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
    mote:        0xffd2a0,   // the core of a light-mote
    bloom:       0xffe2c0,   // ...and what an awake thing glows
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

    /* The face in the hood. Two soft lights set back inside the cowl, so what
       you see is a suggestion of a face rather than a face — the moment these
       read as eyes with expressions the figure stops being a dream and starts
       being a character with opinions. Keep `glow` low. */
    eyeGlow: 0.62,           // brightness; past ~1.1 they read as headlights
    eyeSize: 0.030,          // radius, in units
    eyeSpacing: 0.062,       // half the distance between them
    eyeHeight: 0.855,        // up the body, 0..1 of full height
    // How far forward of the axis they sit. This has to clear the hood's own
    // surface — the robe is a closed lathe and will occlude anything inside
    // it — so it wants to stay a little above the profile radius at
    // `eyeHeight`, which is about 0.215. Below that and the face goes dark.
    eyeDepth: 0.232,
    blinkEvery: 4.4,         // mean seconds between blinks
    blinkSeconds: 0.20,      // how long one takes, closed window included
    doubleBlink: 0.18,       // chance a blink comes as two
    glanceMax: 0.62,         // how far the gaze shifts, as a fraction of the
                             // eye spacing — 1 would put an eye where the
                             // other one was, so this stays well under it
    glanceRate: 1.6,         // how quickly it settles onto a new subject

    /* Idle life. What a figure that is standing still does so that it never
       looks paused: breathing, a slow weight-shift, an occasional look about. */
    breathDepth: 0.012,      // how much the body swells, as a scale
    breathSpeed: 0.42,
    shiftEvery: 7.0,         // mean seconds between weight-shifts
    shiftAmount: 0.035,      // radians of roll in one
    lookAboutEvery: 11.0,    // mean seconds between idle look-arounds
    lookAboutMax: 0.55,      // radians of head-turn in one

    /* The chest light answers what is happening: it flares when a mote is
       gathered and breathes when a gate stands open ahead. */
    glowGather: 0.85,        // extra brightness on gathering, decaying away
    glowGatherDecay: 1.6,    // ...per second
    glowGatePulse: 0.30,     // depth of the breathing near an open gate
    glowGateSpeed: 1.5,
  },

  /* The companion: one small light with a mind of its own. It orbits at a
     distance it chooses, darts off when something wakes, and leans toward an
     open gate — which quietly makes it the second half of the wayfinding. */
  companion: {
    enabled: true,
    size: 0.85,              // radius of its glow card, in units
    glow: 1.25,
    orbitRadius: 1.9,        // how far off the shoulder it usually sits
    orbitHeight: 1.5,
    orbitSpeed: 0.55,        // radians/sec around the wanderer
    follow: 2.6,             // damping rate toward wherever it wants to be
    wander: 0.55,            // amplitude of its own aimless drift
    wanderSpeed: 0.7,
    excitedFor: 3.2,         // seconds it darts about after something wakes
    excitedRange: 5.0,       // ...and how far out it goes while excited
    gateLean: 0.45,          // fraction of the way it drifts toward a gate
    gateRange: 26,           // how near the gate must be for it to care
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

  /* Light-motes: the things you gather just by walking near them.
     `gatherRadius` is the whole difficulty curve — it wants to be generous
     enough that you collect them without aiming. `monumentTarget` is how many
     have to arrive for the monument to be full. */
  motes: {
    size: 0.44,
    glow: 1.20,              // emissive multiplier; much past ~1.6 clips to white
    glowRadius: 3.0,         // halo card size, relative to the mote
    glowPower: 0.32,
    gatheredGlow: 1.55,      // a mote brightens once it is following you
    bob: 0.55,               // how far a free mote drifts up and down
    drag: 0.50,              // per-second velocity decay back to stillness

    gatherRadius: 4.5,       // walk this close and it comes with you
    attractRadius: 11,       // ...and from this far it starts leaning your way
    attractPull: 1.8,        // units/sec² of that lean, at its strongest
    trail: 2.1,              // how far behind the wanderer the ring sits
    trailHeight: 1.45,
    orbitRadius: 0.85,       // ...and how wide it is
    orbitSpeed: 0.65,        // radians/sec around that ring
    follow: 2.0,             // damping rate of a gathered mote

    holdSeconds: 24,         // after this long they let go and head home
    deliverRadius: 17,       // ...or immediately, this close to the monument
    streamRate: 0.55,        // damping rate on the way in — deliberately slow
    arriveRadius: 1.8,

    lightRange: 24,          // how far a mote's light reaches onto the ground
    perWorld: 30,            // how many drift at once, budget permitting
    respawnSeconds: 3.4,     // ...and how often a gap is filled
    spawnNear: 14, spawnFar: 48,
    monumentTarget: 24,      // arrivals for a full monument
  },

  /* Awakening. Nothing here can fail or expire: a structure that has started
     to wake finishes waking, and stays awake for the rest of the visit. */
  awaken: {
    radius: 8.0,             // how close is close enough
    bloomSeconds: 5.5,       // how long it takes to come fully alight
    lightPower: 2.4,         // what an awake structure does to the ground
    lightRange: 32,
    gateAt: 0.18,            // fraction awake before the gate is fully open
  },

  /* Dream-gates. `atRadius` is a fraction of the world radius, so a gate is
     always a walk away but never out past the rim. Openness is driven by
     whichever the player is actually doing — waking structures *or* feeding
     the monument — so either kind of wandering leads onward:
     open ← max(awakeFraction / awaken.gateAt,
                delivered / (motes.monumentTarget * gate.gatherAt)). */
  gate: {
    atRadius: 0.52,          // a shorter walk than it was
    radius: 2.8,             // the opening itself
    thickness: 0.16,
    lift: 0.25,              // how far off the ground the ring floats
    openRate: 0.5,           // damping rate as it opens; slow is the point
    enterAt: 0.45,           // how open it has to be before it will take you
    enterRadius: 4.2,        // generous: walking *at* it is enough
    promptRadius: 9,         // this close to an open gate, offer "step through"
    gatherAt: 0.45,          // fraction of a full monument that opens it fully
    clearing: 16,            // no structures grow this close to one
    beacon: 1.0,             // strength of the skyward light once it is opening
  },

  /* Dream fragments — the named things worth finding. There are eight in a
     world and they never come back once taken, so every number here is about
     making one findable rather than about pacing a drip of pickups.

     `takeRadius` is deliberately close: a memory should be something you
     walked up to, not something you swept up in passing like a mote. */
  discoveries: {
    hover: 1.25,             // how far off the ground one floats
    bob: 0.30,               // ...and how far it drifts up and down
    rise: 0.55,              // extra lift once it knows you are coming
    takeRadius: 2.6,         // walk this close and it comes to you
    takeSeconds: 1.15,       // how long the taking itself lasts
    glowRadius: 3.4,         // halo size, relative to the body
    glowPower: 0.40,
    noticeSeconds: 3.0,      // how long the companion stays interested
  },

  /* Debug switches, all off in play. `freeTravel` opens every gate at once so
     the whole loop can be walked without earning it. */
  debug: {
    freeTravel: false,
  },

  /* Wandering. Drag anywhere for a floating joystick, tap ahead of yourself to
     drift that way, or WASD / arrow keys on a laptop. Everything is capped and
     heavily damped — this should never feel like driving.

     `paceScale` multiplies maxSpeed and accel together, and is what the pace
     setting writes: the ceilings scale but the character of the movement — the
     heavy coast, the capped turn — stays exactly what it was. `drive` shapes
     stick strength into travel: above 1 a light push mostly *turns* the
     figure, so you can look around without gliding off. */
  movement: {
    maxSpeed: 2.5,           // units/sec, an unhurried walking pace
    accel: 14.0,             // units/sec² while the stick is fully over
    paceScale: 1.15,         // set from settings.pace via `paces` below
    paces: { stroll: 0.85, wander: 1.15, drift: 1.5 },
    drive: 1.6,              // exponent on stick strength → forward push
    damping: 0.03,           // per-second velocity decay; you settle, not skid
    maxTurnSpeed: 1.7,       // radians/sec, hard ceiling
    turnGain: 4.0,           // how eagerly the heading chases the stick
    turnResponse: 7.0,       // damping rate of the turn itself
    deadzone: 10,            // px of stick offset that does nothing
    stickRadius: 78,         // px from the origin that counts as fully over
    groundFollow: 7.0,       // how quickly the figure settles onto the ground
    edgeAt: 0.88,            // fraction of the world radius where it leans back
    edgePull: 9.0,           // units/sec² of that lean, at the very edge
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
    // walking through a gate: up into light, swap, back down. Out is slower
    // than in on purpose — arriving should feel like a long exhale.
    gateInSeconds: 1.7,
    gateHoldSeconds: 0.45,
    gateOutSeconds: 2.6,
  },

  /* Layered generative pads. The drone and the wash are always there; the
     layers come up one at a time as the world wakes, so how full it sounds is
     how much of it you have found. Every per-world value here is overwritten
     from that world's `audio` block on arrival. */
  audio: {
    enabled: true,
    volume: 0.16,            // intentionally very quiet
    fadeInSeconds: 8,
    root: 110.0,             // fallback; each world names its own
    chord: [0, 3, 7, 10, 12],// semitone offsets, likewise
    brightness: 420,         // lowpass cutoff on the drone, in Hz
    droneVoices: 3,
    layers: 7,               // how many awakenings are audible as new notes
    layerGain: 0.16,
    layerFadeSeconds: 7,     // a layer arriving must never be an event
    glideSeconds: 2.5,       // how long a world change takes to slide pitch
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
      maxMotes: 48, starScale: 1.0, particleScale: 1.0,
      reflections: true, reflectionSize: 512, waterNormalSize: 256,
      groundCells: 128,
      fractalDepth: 5, fractalInstances: 7000, structureScale: 1.0,
      mengerDepth: 2, blockSegments: 3, cloudLayers: 3, kaleidoscope: true,
      charSegments: 22, charShadow: true, companion: true,
      bloom: true, bloomScale: 0.5, msaa: 0, pixelRatio: 2,
    },
    medium: {
      maxMotes: 34, starScale: 0.7, particleScale: 0.8,
      reflections: true, reflectionSize: 256, waterNormalSize: 128,
      groundCells: 96,
      fractalDepth: 4, fractalInstances: 3600, structureScale: 0.8,
      mengerDepth: 2, blockSegments: 2, cloudLayers: 2, kaleidoscope: true,
      charSegments: 16, charShadow: true, companion: true,
      bloom: true, bloomScale: 0.4, msaa: 0, pixelRatio: 1.75,
    },
    low: {
      maxMotes: 20, starScale: 0.45, particleScale: 0.6,
      reflections: false, reflectionSize: 0, waterNormalSize: 128,
      groundCells: 64,
      fractalDepth: 3, fractalInstances: 1400, structureScale: 0.6,
      mengerDepth: 1, blockSegments: 1, cloudLayers: 1, kaleidoscope: false,
      charSegments: 11, charShadow: false, companion: true,
      bloom: false, bloomScale: 0.35, msaa: 0, pixelRatio: 1.2,
    },
    /* The floor. Meant for a phone that would rather stay cool than look its
       best — and for the software rasterisers, which are fill-rate bound long
       before they are geometry bound, so what matters most here is the pixel
       ratio and the transparent sheets, not the instance count. */
    saver: {
      maxMotes: 14, starScale: 0.30, particleScale: 0.40,
      reflections: false, reflectionSize: 0, waterNormalSize: 64,
      groundCells: 48,
      fractalDepth: 3, fractalInstances: 900, structureScale: 0.45,
      mengerDepth: 1, blockSegments: 1, cloudLayers: 0, kaleidoscope: false,
      charSegments: 9, charShadow: false, companion: false,
      bloom: false, bloomScale: 0.30, msaa: 0, pixelRatio: 1.0,
    },
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   bootstrap
   ═══════════════════════════════════════════════════════════════════════════ */
const settings = loadSettings();

/* Reduced motion follows the OS preference until the settings panel says
   otherwise. The scales live in one shared object rather than two constants so
   flipping the toggle mid-wander stills the camera and the drift immediately —
   everything that moves reads these through `ctx` or a live reference. */
const osReducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motion = { camera: 1, scene: 1 };
function applyMotionPreference() {
  const reduced = settings.reducedMotion ?? osReducedMotion;
  motion.camera = reduced ? 0.18 : 1;   // camera bob
  motion.scene  = reduced ? 0.6 : 1;    // drift of everything else
}
applyMotionPreference();

// a remembered quality choice pins the tier exactly as ?tier= does
if (settings.quality !== 'auto' && CONFIG.tiers[settings.quality]) {
  CONFIG.forceTier = settings.quality;
}

const picked = pickTier(CONFIG);
let tierName = picked.tier;
let pinned = picked.pinned;
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
  renderer.setClearColor(CONFIG.palette.fog, 1);   // until a world sets its own
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Tone mapping is applied once, by OutputPass at the end of the chain —
  // materials render linear HDR into the composer's half-float targets.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.render.exposure;
  // The composer renders several times a frame and each render would reset the
  // counters, leaving `info` describing the last fullscreen quad rather than
  // the frame. Reset once, ourselves, at the top of the loop instead.
  renderer.info.autoReset = false;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.camera.fovPortrait, 1, 0.1, 900);
  camera.position.set(0, CONFIG.camera.height, 6 + CONFIG.camera.distance);

  /* The archive owns everything the player keeps: which world they are in,
     what they woke and found in each, what they have unlocked and what they
     are wearing. It migrates a pre-archive save forward rather than replacing
     it, so a returning player arrives partway along rather than at zero.
     Built before anything else because the UI, the world loader and the
     wanderer's own colours all ask it questions. */
  // No provider is installed, so this is a ring buffer nobody reads — the
  // shape of the instrumentation without a tracker in the deploy.
  const analytics = createAnalytics();
  analytics.track(EVENTS.sessionStart, {});

  const archive = createArchive({
    worlds: WORLDS,
    monumentTarget: CONFIG.motes.monumentTarget,
  });
  CONFIG.world.start =
    ((archive.currentWorld % WORLDS.length) + WORLDS.length) % WORLDS.length;

  /* ── scene systems ─────────────────────────────────────────────────── */
  let sky        = createSky({ CONFIG, quality, scene });
  let water      = null;               // only the worlds that have any
  let motes      = createMotes({ CONFIG, quality, scene });
  let fireflies  = createFireflies({ CONFIG, quality, scene });
  let haze       = createHaze({ CONFIG, scene });
  const terrain  = createTerrain({ CONFIG, quality, scene });
  const rig      = createRig({ CONFIG, camera, terrain });
  let character  = createCharacter({ CONFIG, quality, scene });
  let companion  = createCompanion({ CONFIG, quality, scene });
  let post       = createPost({ CONFIG, quality, renderer, scene, camera, motion });

  // a gathered mote is acknowledged by the light at the chest
  motes.onGather = () => character.flare();

  const audio = createAudio(CONFIG);
  audio.setMuted(settings.muted);
  audio.setMusicVolume(settings.musicVolume);
  audio.setAmbienceVolume(settings.ambienceVolume);

  // the pace preset scales speed and acceleration together; nothing else
  function applyPaceChoice(pace) {
    const M = CONFIG.movement;
    M.paceScale = M.paces[pace] ?? M.paces.wander;
  }
  applyPaceChoice(settings.pace);

  const ui = createUI({
    CONFIG,
    audio,
    settings,
    onMotionChange: applyMotionPreference,
    onQualityChange: applyQualityChoice,
    onPaceChange: applyPaceChoice,
    onReset: resetJourney,
  });
  /* What the archive says when it grants something. All three are told in the
     same quiet voice as a discovery and go away by themselves; the queue in
     the UI keeps them from talking over each other when a single find
     completes a set and passes a mastery threshold at once. */
  archive.onCollection = (c) => {
    ui.showMemory('collection complete', c.name,
      'Every piece of it found.', 'rare');
    audio.addLayer();
    analytics.track(EVENTS.collectionCompleted, { id: c.id, world: c.world });
  };
  archive.onUnlock = ({ type, id }) => {
    const c = type === 'title' ? title(id) : cosmetic(type, id);
    if (!c) return;
    const kind = type === 'title' ? 'new title'
      : type === 'monument' ? 'the monument answers'
      : `new ${type}`;
    ui.showMemory(kind, c.name, c.note || '', 'dream');
    analytics.track(EVENTS.cosmeticUnlocked, { type, id });
  };
  archive.onMastery = ({ world: key, at }) => {
    analytics.track(EVENTS.masteryReached, { world: key, at });
    if (at < 1) return;    // the quarters are told by what they unlock
    const w = WORLDS.find((x) => x.key === key);
    ui.showMemory('world known', w ? w.name : key,
      'You have seen everything it had to show you.', 'mythic');
  };

  /* The archive as a page. Equipping from it applies immediately — the mood
     pass picks the new cloak up on its next tick, a quarter second away. */
  const journal = createJournal({
    archive,
    worlds: WORLDS,
    leaderboard: createLeaderboardService({ archive }),
    profiles: createProfileService({ archive }),
    onClose: () => ui.keepAwake(),
    onEquip: (kind, id) => {
      ui.keepAwake();
      analytics.track(EVENTS.cosmeticEquipped, { kind, id });
    },
    onTab: (t) => analytics.track(
      t === 'wanderer' ? EVENTS.profileOpened : EVENTS.archiveOpened, { tab: t }),
  });
  ui.onArchive = () => {
    analytics.track(EVENTS.archiveOpened, {});
    journal.show();
  };

  ui.onSettingsSave = saveSettings;
  ui.onBegin = () => ui.showWorldName(world.name, 1400);
  ui.onStep = () => {
    if (!ui.transitioning && gate && gate.enterable
        && gate.distance2(rig.state.x, rig.state.z) < CONFIG.gate.promptRadius ** 2) {
      enterGate();
    }
  };

  const input = createInput({
    CONFIG,
    camera,
    domElement: renderer.domElement,
    onWake: () => ui.wake(),
    onTap: (x, y) => ui.tapAt(x, y),
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
  let gate = null;
  let cyclePalette = null;
  let fragments = null;
  let delivered = 0;
  let gateAnnounced = false;   // "a gate has opened" is said once per visit

  function loadWorld(index) {
    worldIndex = ((index % WORLDS.length) + WORLDS.length) % WORLDS.length;
    world = WORLDS[worldIndex];
    const p = world.palette;

    if (content) content.dispose();
    if (gate) gate.dispose();
    if (fragments) fragments.dispose();

    terrain.build(world);
    content = createWorldContent({ CONFIG, quality, scene, world, terrain });
    gate = createGate({ CONFIG, scene, world, terrain });
    cyclePalette = makePaletteCycler(p, CONFIG.mood);
    gateAnnounced = false;
    ui.setStepPrompt(false);

    sky.setPalette(p);
    sky.setStars(world.stars);
    haze.setPalette(p);
    fireflies.setPalette(p);
    fireflies.setDensity(world.fireflies);
    motes.setPalette(p);
    motes.setFogDensity(world.fog.density);
    motes.clear();
    // Left undressed on purpose: `p` here is the world's raw palette of hex
    // numbers, not the cycler's Colors, and the mood pass runs on the very
    // first frame after this — so the worn cloak is applied before anything
    // is ever drawn.
    character.setPalette(p);
    character.setFogDensity(world.fog.density);
    if (companion) {
      companion.setPalette(p);
      companion.setFogDensity(world.fog.density);
    }
    renderer.setClearColor(p.fog, 1);
    ui.setFlashColor(p.bloom);
    audio.setWorld(world.audio);

    /* Every world remembers its own visit. Arriving anywhere — for the first
       time, after a refresh, or years later — puts back what was woken and
       delivered there, so a world you know is visibly a world you know and
       the monument stands where you left it. What is left to do in a world
       you have finished is find the things you never found. */
    const visited = archive.arrive(world.key);
    archive.setCurrentWorld(worldIndex);
    content.restoreAwake(visited.awakened, () => audio.addLayer());
    delivered = visited.delivered;

    // ...and lay out whatever memories this world is still holding. Placed
    // after the visit is counted, so a discovery that asks for an nth visit
    // can appear on the visit that satisfies it.
    fragments = createFragments({
      CONFIG, quality, scene, world, terrain, archive,
    });
    fragments.onNear = (it) => companion?.notice(it.x, it.y, it.z);
    fragments.onFound = onDiscovery;
    content.setMonumentGrowth(delivered / CONFIG.motes.monumentTarget);
    content.setMasteryForm(archive.monumentForm(world.key));

    analytics.track(EVENTS.worldEntered,
      { world: world.key, visits: visited.visits });

    // name the place as it comes into view — held back so it arrives with the
    // gate-light still clearing, not on top of it
    if (ui.began) ui.showWorldName(world.name, 1400);

    // water is per-world: most of them have none at all
    if (water) { water.dispose(); water = null; }
    if (world.water) water = createWater({ CONFIG, quality, scene, renderer, world });

    // arrive out on the plaza, facing the monument in the middle
    rig.place(0, world.ground.plazaRadius * 2.4, 0);
    companion?.place(rig.state);

    // a first handful of motes already drifting, so the world is never empty
    for (let i = 0; i < Math.min(CONFIG.motes.perWorld, quality.maxMotes) * 0.6; i++) {
      spawnMote();
    }

    // Warm every new shader now, while the screen is still full of gate-light
    // (or the title, on the first load). A world's materials are new each
    // visit, and a program that links on the first *visible* frame is a
    // stutter exactly where the arrival should feel like an exhale.
    renderer.compile(scene, camera);
  }

  /** Drop one free mote somewhere in the world, at a walkable distance. */
  function spawnMote() {
    const M = CONFIG.motes;
    const a = Math.random() * Math.PI * 2;
    const r = M.spawnNear + Math.random() * (M.spawnFar - M.spawnNear);
    const x = rig.state.x + Math.cos(a) * r;
    const z = rig.state.z + Math.sin(a) * r;
    // keep them inside the world; anything past the rim is over the edge
    if (Math.hypot(x, z) > terrain.radius * 0.92) return;
    motes.spawn(x, terrain.heightAt(x, z) + 1.1 + Math.random() * 1.6, z);
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

  function applyTier(next) {
    if (next === tierName || !CONFIG.tiers[next]) return;
    tierName = next;
    quality = CONFIG.tiers[tierName];

    // Everything the tier actually changes goes: the fractals thin out, the
    // ground coarsens, the motes in flight are lost. The world is rebuilt
    // rather than patched because its instance counts are baked at build time
    // — and a world rebuilt in place is a fraction of a second where a
    // permanent stutter would otherwise be.
    motes.dispose();
    fireflies.dispose();
    character.dispose();
    companion?.dispose();
    post.dispose();

    motes = createMotes({ CONFIG, quality, scene });
    fireflies = createFireflies({ CONFIG, quality, scene });
    character = createCharacter({ CONFIG, quality, scene });
    companion = createCompanion({ CONFIG, quality, scene });
    post = createPost({ CONFIG, quality, renderer, scene, camera, motion });
    motes.onGather = () => character.flare();

    // ...and this rebuilds the ground, the fractals and the water, and
    // re-tints everything that was just replaced
    const at = { x: rig.state.x, z: rig.state.z, yaw: rig.state.yaw };
    loadWorld(worldIndex);
    rig.place(at.x, at.z, at.yaw);

    resize();
  }

  function downgrade(force = false) {
    if (pinned && !force) return;       // the tier was asked for explicitly
    applyTier(lowerTier(tierName));
  }

  /** the settings panel chose a tier — 'auto' hands control back to the guess */
  function applyQualityChoice(choice) {
    if (choice === 'auto') {
      CONFIG.forceTier = null;
      pinned = false;
      applyTier(pickTier(CONFIG).tier);
    } else if (CONFIG.tiers[choice]) {
      pinned = true;
      applyTier(choice);
    }
  }

  /**
   * A memory was taken.
   *
   * Recording it is what makes it permanent; everything after that is telling
   * the player, quietly and without stopping them. `record` returns null if it
   * was somehow already held, so nothing is ever celebrated twice.
   */
  function onDiscovery(d, it) {
    const rec = archive.record(d.id);
    if (!rec) return;

    ui.showMemory('new memory', d.name, d.note, d.rarity);
    analytics.track(EVENTS.discoveryFound,
      { id: d.id, world: d.world, rarity: d.rarity });
    character.flare();
    companion?.notice(it.x, it.y, it.z);
    // a rarer find brings the world up a layer with it
    if (RARITY[d.rarity]?.chime >= 2) audio.addLayer();
    // and the monument answers, since knowing a world is part of mastery
    content.setMasteryForm(archive.monumentForm(world.key));
  }

  /** walk on to the next world, through the gate's soft light. The same path
      serves the walked-into ring and the tapped "step through" prompt. */
  function enterGate() {
    const next = worldIndex + 1;
    analytics.track(EVENTS.gateEntered, { from: world.key });
    ui.setStepPrompt(false);
    ui.transition(() => loadWorld(next));
  }

  /** forget the journey and wake up back at the start, through the same
      soft light a dream-gate uses — resetting should feel like dreaming
      again, not like a page reload */
  function resetJourney() {
    archive.reset();
    if (!ui.transition(() => loadWorld(0))) loadWorld(0);
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
    motionScale: motion.scene,
    cameraPosition: camera.position,
    wind,
  };

  /**
   * Re-tint everything that drifts with the mood. The sky runs its own cycle
   * off the same phase, so it is left out of this — colouring it twice makes
   * the two cycles fight and the horizon wobbles.
   */
  /**
   * Lay the worn cloak over whatever the world was going to tint the robe.
   *
   * This has to happen inside the mood pass rather than once on equip: the
   * palette is recomputed and pushed to everything several times a second as
   * the colour cycle drifts, so a cosmetic applied anywhere else is overwritten
   * within a quarter of a second and reads as a flicker. The default cloak
   * returns null and the world's own choice stands, exactly as it always did.
   */
  function dressPalette(p) {
    const cloak = archive.cloakColors();
    if (cloak) for (const k in cloak) p[k].set(cloak[k]);
    return p;
  }

  /* The companion takes its colour from the same palette key as the ambient
     fireflies, so a chosen companion has to be handed over on its own rather
     than by overriding that key — otherwise picking one recolours every
     firefly in the world along with it. */
  const companionTint = { firefly: 0 };
  function dressCompanion(p) {
    if (!companion) return;
    companionTint.firefly = archive.companionColor() ?? p.firefly.getHex();
    companion.setPalette(companionTint);
  }

  function applyMood(mood) {
    const p = dressPalette(cyclePalette(mood));
    dressCompanion(p);
    terrain.setPalette(p);
    content.setPalette(p);
    haze.setPalette(p);
    fireflies.setPalette(p);
    motes.setPalette(p);
    fragments?.setPalette(p);
    character.setPalette(p);
    gate.setPalette(p);
  }

  // the ground's light list, rebuilt each frame from two sources and never
  // reallocated
  const lights = [];
  const byDistance = (a, b) => a.dist2 - b.dist2;

  let last = performance.now();
  let time = 0;
  let ambientAt = 2;
  let moodAt = 0;

  // a rolling frame rate, for tuning from the console. Smoothed hard enough
  // that a number read off it by eye means something.
  let fps = 60;

  function frame(now) {
    const rawDt = now - last;
    last = now;
    const dt = Math.min(rawDt / 1000, 0.05);   // clamp after a tab switch
    time += dt;

    if (rawDt > 0 && rawDt < 400) fps += (1000 / rawDt - fps) * 0.05;
    if (frameWatch.sample(rawDt)) downgrade();
    renderer.info.reset();

    const phase = (time / CONFIG.mood.periodSeconds) * Math.PI * 2;
    ctx.time = time;
    ctx.mood = 0.5 + 0.5 * Math.sin(phase);
    ctx.mood2 = 0.5 + 0.5 * Math.sin(phase * 0.61 + 1.1);
    ctx.motionScale = motion.scene;   // live, so the settings toggle lands at once
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
    rig.update(dt, time, motion.camera);
    character.update(dt, ctx, rig.state);

    /* ── the loop: wake things, gather things, walk through ──────────── */

    // Anything the wanderer has come near starts to wake, and each one that
    // does brings up one more layer of the pad. Suspended during a transition,
    // or arriving somewhere would light whatever happened to be near the spot.
    if (!ui.transitioning) {
      content.updateAwakening(dt, rig.state.x, rig.state.z, (i, s) => {
        audio.addLayer();
        archive.noteAwakened(world.key, i, content.awake);
        companion?.notice(s.x, s.y, s.z);   // off it goes to look
      });
    }

    // top the motes back up, slowly, so a world never runs out of them
    ambientAt -= dt;
    if (ambientAt <= 0) {
      ambientAt = CONFIG.motes.respawnSeconds * (0.7 + Math.random() * 0.6);
      if (motes.count < Math.min(CONFIG.motes.perWorld, quality.maxMotes)) spawnMote();
    }

    const arrived = motes.update(dt, ctx, rig.state, content.monumentPoint);
    if (arrived > 0) {
      delivered += arrived;
      archive.noteDelivered(world.key, delivered);
    }
    content.setMonumentGrowth(delivered / CONFIG.motes.monumentTarget);

    // The gate opens on whichever the player has actually been doing — waking
    // structures or carrying motes to the monument — so either kind of
    // wandering leads onward. Walking into it takes you to the next world.
    const wantedOpen = CONFIG.debug.freeTravel ? 1 : Math.max(
      content.awakeFraction / CONFIG.awaken.gateAt,
      delivered / (CONFIG.motes.monumentTarget * CONFIG.gate.gatherAt)
    );
    gate.update(dt, ctx, wantedOpen);

    // say so, quietly, the moment it would admit you
    if (!gateAnnounced && gate.enterable) {
      gateAnnounced = true;
      if (ui.began) ui.announce('a gate has opened');
    }

    // standing before an open gate, offer the step — travel must never depend
    // on threading an exact radius from a moving thumb
    ui.setStepPrompt(
      !ui.transitioning && gate.enterable
      && gate.distance2(rig.state.x, rig.state.z) < CONFIG.gate.promptRadius ** 2
    );

    if (!ui.transitioning && gate.entered(rig.state.x, rig.state.z)) enterGate();

    /* ── what the wanderer is currently paying attention to ────────────
     * An open gate outranks a mote: by the time one is open it is the more
     * interesting thing in the world. Otherwise they watch the nearest mote
     * they have not yet picked up, and failing that, look where they walk.
     */
    const gateD2 = gate.distance2(rig.state.x, rig.state.z);
    const gateCall = gate.enterable
      ? 1 - Math.min(1, Math.sqrt(gateD2) / CONFIG.companion.gateRange)
      : 0;
    character.setGateNear(gateCall);

    // An unfound memory outranks everything: it is the rarest thing in view
    // and the eyes finding it a moment before the player does is the gentlest
    // hint the game can give.
    const frag = fragments.nearestTo(rig.state.x, rig.state.z, 22);
    if (frag) {
      character.lookToward(frag.x, frag.z);
    } else if (gateCall > 0.25) {
      character.lookToward(gate.position.x, gate.position.z);
    } else {
      const near = motes.nearestFree(rig.state.x, rig.state.z, CONFIG.motes.attractRadius);
      if (near) character.lookToward(near.x, near.z);
      else character.lookToward(null);
    }

    // the memories this world is still holding, and how near we are to one
    if (!ui.transitioning) fragments.update(dt, ctx, rig.state);

    companion?.update(dt, ctx, rig.state, gate);

    // the ground takes light from the motes and from whatever is awake, as
    // one list of the nearest few
    lights.length = 0;
    for (const m of motes.nearestTo(camera.position, CONFIG.ground.lights)) lights.push(m);
    content.nearestAwake(camera.position, CONFIG.ground.lights, lights);
    fragments.lights(lights, CONFIG.ground.lights, camera.position);
    lights.sort(byDistance);
    if (lights.length > CONFIG.ground.lights) lights.length = CONFIG.ground.lights;
    terrain.setLights(lights);

    sky.update(dt, ctx);
    if (water) water.update(dt, ctx);
    fireflies.update(dt, ctx);
    haze.update(dt, ctx);
    content.update(dt, ctx);

    post.render(dt);
  }

  renderer.setAnimationLoop(frame);

  // let go of the GPU politely if the page is put away — and write the journey
  // down first, since a backgrounded tab may never come back
  window.addEventListener('pagehide', () => {
    archive.flush();
    saveSettings(settings);
    renderer.setAnimationLoop(null);
  });
  window.addEventListener('pageshow', () => {
    last = performance.now();
    renderer.setAnimationLoop(frame);
  });

  // Exposed for tuning from the console. CONFIG is read live every frame, so
  // e.g. __night.CONFIG.movement.maxSpeed = 4 takes effect immediately.
  window.__night = {
    CONFIG,
    settings,
    archive,
    get summary() { return archive.summary(); },
    analytics,
    get tier() { return tierName; },
    /** jump to any tier by name, exactly as the settings panel would */
    setTier(name) { applyQualityChoice(name); return tierName; },
    /** force the next quality step down, as the frame watcher would */
    downgrade() { const was = tierName; downgrade(true); return `${was} -> ${tierName}`; },
    renderer, scene, camera, rig, terrain,
    get post() { return post; },
    get character() { return character; },
    get companion() { return companion; },
    get gate() { return gate; },
    get motes() { return motes; },
    get fragments() { return fragments; },
    journal,
    /** walk to the nearest unfound memory, for looking at one on purpose */
    toFragment() {
      const f = fragments.nearestTo(rig.state.x, rig.state.z, 1e6);
      if (!f) return null;
      rig.place(f.x, f.z + 4, 0);
      return f.d.name;
    },
    /** wake the whole world at once, for looking at what that does */
    wakeAll() {
      const was = CONFIG.awaken.radius;
      CONFIG.awaken.radius = 1e6;
      content.updateAwakening(0, rig.state.x, rig.state.z, (i) => {
        audio.addLayer();
        journey.awakened.add(i);
        saveJourneySoon();
      });
      CONFIG.awaken.radius = was;
      return content.awake;
    },
    /** hold the colour drift at a point on its cycle, for looking at one end */
    mood(v) { applyMood(v); return v; },
    get world() { return world.key; },
    get instances() { return content.instances; },
    get structures() { return content.structures; },

    /** what the renderer is actually doing, for tuning a tier by hand */
    get perf() {
      const info = renderer.info.render;
      return {
        fps: Math.round(fps),
        tier: tierName,
        instances: content.instances,
        motes: motes.count,
        drawCalls: info.calls,
        triangles: info.triangles,
        pixelRatio: +pixelRatio.toFixed(2),
        programs: renderer.info.programs?.length ?? 0,
      };
    },
    /** where the loop currently stands, for tuning it without playing it */
    get progress() {
      return {
        awake: content.awake,
        of: content.structures.length,
        gate: +gate.open.toFixed(2),
        motes: motes.count,
        held: motes.held,
        delivered,
        layers: audio.layers,
      };
    },
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
