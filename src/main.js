import * as THREE from 'three';

import { pickTier, lowerTier, FrameWatch } from './quality.js';
import { createSky } from './sky.js';
import { createWater } from './water.js';
import { createMotes } from './motes.js';
import { createFireflies } from './fireflies.js';
import { createHaze } from './haze.js';
import { createAmbience } from './ambience.js';
import { createTerrain } from './terrain.js';
import { WORLDS, SANCTUARY, createWorldContent, makePaletteCycler } from './worlds.js';
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
import { createSanctuaryDisplay } from './sanctuary.js';
import { createStory, BEATS as STORY_BEATS } from './story.js';
import { createAnalytics, EVENTS } from './analytics.js';
import { createProfileService, createLeaderboardService } from './leaderboard.js';
import { RARITY, title, cosmetic, applyVariant } from './discoveries.js';

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

    /* Adaptive exposure — the eye adjusting, not an effect.
     *
     * Walking into a clearing where everything is awake and a dozen motes are
     * in tow used to clip the frame to white, and you could no longer see
     * where you were going. This stops the aperture down a touch when that
     * happens and opens it again when you leave.
     *
     * The brightness is estimated from the light list the ground shader is
     * already given each frame rather than read back off the GPU. A readback
     * — even of one pixel — stalls the pipeline, and a stutter in service of
     * a slow, subtle grade is a bad trade on a mid phone. The estimate does
     * not have to be right; it has to be smooth and in the right direction.
     *
     * `adaptFloor` is the important one. It is deliberately close to 1: this
     * must never be something you can catch happening, and a scene that
     * visibly gets darker as you approach it would be worse than the blowout.
     */
    adaptFrom: 1.6,          // scene load below this changes nothing at all
    adaptStrength: 0.13,     // how hard it stops down past that
    adaptFloor: 0.62,        // ...and the very furthest it may ever close
    adaptDown: 0.55,         // damping rate closing; slow
    adaptUp: 0.28,           // ...and slower still opening back up
  },

  /* Kept deliberately soft. Raising `strength` past ~0.9 starts to look like
     a lens effect rather than light.

     `threshold` is the readability knob. At the 0.62 it sat at, a halo card
     overlapping an awakened tip cluster crossed it easily, so the bloom was
     spreading every soft edge in the frame rather than the few things that are
     genuinely bright — and a clearing full of woken structures clipped to
     white. Up at 0.88 only the cores go, which is what bloom is for: the light
     still blooms, the fog around it no longer does. `strength` is nudged up a
     little to keep those cores looking the same as they did. */
  bloom: {
    strength: 0.54,
    radius: 0.62,
    threshold: 0.88,
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
    /* How quickly the view swings *around* the wanderer when they turn, as
       opposed to how quickly it catches up when they walk away from it. Kept
       well under `follow` on purpose: the camera should ease round behind a
       turn rather than be dragged through it. `maxSwingLag` is the ceiling on
       how far behind it may fall, so a determined spin can never leave the
       figure out at the edge of the frame. */
    rotateFollow: 1.5,       // damping rate of the orbit; lower = a lazier swing
    maxSwingLag: 0.55,       // radians the view may trail the facing by, at most
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
    glow: 1.00,              // brightness of the light at the chest
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
    glowGather: 0.50,        // extra brightness on gathering, decaying away
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
    lightPower: 2.5,
    /* What all six of them together may add up to, at most. The sum is soft-
       clamped rather than cut — see the fragment shader in terrain.js — so a
       quiet world is completely unaffected and a blazing one bends over toward
       this instead of running away to white. This is what guarantees the
       ground under the wanderer stays readable however much is awake. */
    lightClamp: 1.35,
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
    glow: 1.00,              // emissive multiplier; much past ~1.6 clips to white
    glowRadius: 3.0,         // halo card size, relative to the mote
    glowPower: 0.22,
    /* A gathered mote used to brighten. It should not: it is now the closest
       thing in the scene to the lens, it has already been won, and the free
       one still out in the field is the thing worth looking at. Under 1 it
       settles back rather than announcing itself. */
    gatheredGlow: 0.90,

    /* Halo cards fade toward `nearFadeFloor` as they approach the lens. A
       mote a few metres from the camera covers a huge share of the screen, and
       the gathered ring orbits exactly there. Distant motes are untouched. */
    nearFadeFrom: 2.0,       // fully faded at this depth...
    nearFadeTo: 11.0,        // ...and completely itself again by this one
    nearFadeFloor: 0.30,     // how much of its light a mote at the lens keeps

    /* Crowding. A dozen gathered motes orbit the wanderer in a ring, and a
       dozen overlapping additive cards centred on the figure you are steering
       is the single worst blowout in the game. `crowdFree` of them cost
       nothing — the ordinary handful must look exactly as it always did — and
       past that the total eases off instead of stacking. */
    crowdRadius: 9,          // how near counts as being in the same glare
    crowdFree: 3,            // this many cost nothing at all...
    crowdSoften: 0.14,       // ...and each one past it takes a little off
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
    lightPower: 1.7,         // what an awake structure does to the ground
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
    glowPower: 0.34,
    noticeSeconds: 3.0,      // how long the companion stays interested
  },

  /* The sanctuary. Four things stand in it, and between them they answer what
     have I found, how far have I come, where have I been, and how much of each
     place is mine — see the head of sanctuary.js.

     The gallery is forty-eight places in four arcs, one arc per world, laid in
     two rows because a dozen in a single row is a picket fence. A found memory
     burns in its place; an unfound one stays as a dim, empty socket, which is
     the half of this that actually does the work — a room with gaps in it is a
     room you want to fill. */
  sanctuary: {
    radius: 26,              // how far the near row of memories stands out
    rows: 2,                 // ...and how many rows a world's arc is laid in
    rowGap: 4.6,             // how much further out the second row sits
    arc: 1.42,               // radians one world's dozen spread across
    lift: 2.0,               // how high they float
    bob: 0.22,
    // These are the subject of the room, not scenery in it, so they are
    // deliberately larger than the fragments they were found as.
    foundScale: 2.3,
    rarityPush: 4.2,         // how much further out a rare thing stands...
    rarityRise: 1.5,         // ...and how much higher
    glowRadius: 3.8,
    glowPower: 0.38,
    emptySize: 0.44,         // an unfound place: small...
    emptyGlow: 0.34,         // ...and barely lit, but never absent

    /* Walking up to one. The gallery used to be a diorama — things stood in it
       and none of them acknowledged you or said what they were, so a room full
       of your own history read as decoration. `nearRadius` is where a memory
       starts to notice you and `readRadius` is where it says its name, and the
       gap between them matters: the first is what tells you it can be
       approached, the second is the reward for having done it. */
    nearRadius: 13,          // it starts to notice you from here...
    readRadius: 5.5,         // ...and names itself once you are this close
    nearRise: 0.75,          // how far it lifts as you come up to it
    nearSwell: 0.28,         // ...how much larger it stands
    nearGlow: 0.85,          // ...and how much brighter it burns
    // ...and the same crowding relief the motes get, because a finished
    // world's arc is a dozen lit haloes standing side by side
    crowdFree: 10,
    crowdSoften: 0.016,

    /* The cairn: one stone per memory kept, spiralling up around the monument
       and tapering as it climbs. `max` is what a complete journey builds, so
       it wants to stay in step with the total number of discoveries — past it
       the tower simply stops growing rather than running off up the sky. */
    cairn: {
      max: 48, radius: 7.4, taper: 0.58, rise: 9.0, lift: 0.6,
      stone: 0.86, glow: 0.30,
    },

    /* The four world marks: a standing stone per world, at the head of its
       arc. `stub` is how much of one is showing before you have ever been
       there — never nothing, because an absent mark is a missing world rather
       than an unvisited one. */
    marks: {
      radius: 16.5, width: 1.05, height: 6.4, stub: 0.22,
      rise: 1.6, lift: 0, glow: 0.55,
    },

    /* The constellations: `count` stars over each world's arc, of which the
       fraction alight is that world's completion. Scaled by the tier's
       particle budget and dropped entirely on the lowest one. */
    stars: {
      count: 9, radius: 34, height: 17, spread: 7.0, arc: 1.5,
      size: 1.35, glow: 0.34, unlitGlow: 0.03,
    },
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
     figure, so you can look around without gliding off.

     `scheme` is the one to try first if the steering ever feels like work:

       stable-relative  push a direction on screen and go that way. The basis
                        is input.js's own frozen yaw, never the live camera, so
                        the view swinging round behind a turn cannot move it.
       heading          tank steering. Stick x turns, stick y goes. Nothing is
                        camera-relative at all, which makes it the most
                        predictable of the two for one thumb and no attention. */
  movement: {
    scheme: 'stable-relative',   // 'stable-relative' | 'heading'
    maxSpeed: 2.5,           // units/sec, an unhurried walking pace
    accel: 14.0,             // units/sec² while the stick is fully over
    paceScale: 1.15,         // set from settings.pace via `paces` below
    paces: { stroll: 0.85, wander: 1.15, drift: 1.5 },
    drive: 1.6,              // exponent on stick strength → forward push
    damping: 0.03,           // per-second velocity decay; you settle, not skid
    maxTurnSpeed: 1.7,       // radians/sec, hard ceiling
    /* `turnGain` is how much of a heading error is asked for as turn rate, and
       it is the number that decides whether a correction is a lean or a snap.
       At the 4.0 it used to be, the ceiling above was reached by a heading
       error of only 24° — so very nearly every correction was a full-rate
       turn and there was no gentle part of the range at all. Low gain with a
       high `turnResponse` is what eases: the rate asked for is small, and the
       turn tracks it closely enough not to overshoot and hunt. */
    turnGain: 2.1,           // how eagerly the heading chases the stick
    turnResponse: 10.0,      // damping rate of the turn itself
    deadzone: 16,            // px of stick offset that does nothing
    angleHysteresis: 0.10,   // radians of thumb wobble that changes nothing
    stickRadius: 78,         // px from the origin that counts as fully over

    /* How the steering basis keeps up with the wanderer. It is re-aligned
       briskly once nobody is steering, and while they *are* steering it moves
       at `basisEaseHeld` — slow enough that a sustained turn barely shifts it
       and no gesture can be felt to drift, but not so slow that a very long
       drag ends up steering against a basis from minutes ago. */
    basisEase: 0.9,          // damping rate of the basis while idle
    basisEaseHeld: 0.12,     // ...and while a finger is down. Keep this tiny.

    /* The 'heading' scheme. `headingTurnArc` is how far off the current facing
       a fully-over stick asks for — the turn rate that results is still the
       capped, damped one above. `headingTurnDrive` is what a turn with no
       forward at all is worth as strength, kept low so that turning on the
       spot stays turning on the spot. */
    headingTurnArc: 1.05,    // radians off the facing at full stick x
    headingTurnDrive: 0.45,  // strength a pure turn asks for

    groundFollow: 7.0,       // how quickly the figure settles onto the ground
    edgeAt: 0.88,            // fraction of the world radius where it leans back
    edgePull: 9.0,           // units/sec² of that lean, at the very edge
  },

  wind: { strength: 0.10 },

  fireflies: { count: 14, brightness: 1.25, range: 46 },

  haze: { radius: 110, height: 7.5, amount: 0.30, centerY: 1.5 },

  /* Ambience: things to notice, that ask nothing. Three instanced or points
     systems, one draw call each, all counted by the tier — see ambience.js.

     The drift and the curtains are deliberately far below the bloom threshold.
     They are air and weather, not light, and the moment either of them starts
     to bloom they undo the readability work rather than adding to the mood. */
  ambience: {
    // drifting pollen, in a box that travels with the viewer and wraps
    driftBox: 90,            // how wide that box is, in units
    driftHeight: 16,         // ...and how tall
    driftSize: 26,           // point size at one unit of depth
    driftOpacity: 0.16,      // very faint. This is air, not fireflies.

    // shapes standing in the weather past the rim, as fractions of the radius
    silhouetteNear: 1.30,
    silhouetteFar: 2.10,
    silhouetteHeight: 46,
    silhouetteDepth: 0.42,   // how far they darken against the fog

    // the slow thing the sky is doing
    curtainRadius: 300,
    curtainWidth: 220,
    curtainHeight: 150,
    curtainLift: -20,        // hung from below the horizon so they stand up out of it
    curtainAmount: 0.13,
  },

  input: {
    dragThreshold: 12,       // px before a touch counts as a drag, not a tap
    tapMaxMs: 420,           // a touch shorter than this, and still, is a tap
    tapAnchor: 0.62,         // where down the screen the wanderer sits, 0..1
    tapDecaySeconds: 1.6,    // how long a tap keeps nudging them along
  },

  /* The dream telling itself. All the writing is in the two tables at the top
     of story.js; these are only the timings.

     The whisper numbers are all restraints rather than triggers — every one of
     them is a reason *not* to speak. `whisperAfterSeconds` is a stretch with
     no progress of any kind, `whisperSettleSeconds` keeps it quiet while
     somebody is still taking a new place in, and `whispersPerVisit` is the
     point at which it accepts that the player is fine and stops offering.
     Turning `whispers` off leaves the beats and removes the nudging entirely. */
  story: {
    /* How long a passage stays is worked out from how long it is, not fixed.
       It used to be a flat two-second floor before movement could dismiss one
       — and since the player is moving essentially all of the time, that meant
       every passage in the game lasted two seconds however much of it there
       was. Nowhere near long enough to read two lines. These are once-ever, so
       there is no second chance at them, and erring long costs nothing.

       Roughly: a 24-word beat gets about eleven seconds before moving will
       take it away, and about fourteen if you stand still. */
    readBase: 2.4,             // seconds before the first word is counted...
    readPerWord: 0.38,         // ...and how long each word is given after that
    lingerSeconds: 3.0,        // how much longer it stays if nobody moves at all
    gapSeconds: 3.5,           // enforced quiet between one passage and the next

    whispers: true,
    whisperAfterSeconds: 34,   // no progress at all for this long, first
    whisperSettleSeconds: 20,  // ...and never this soon after arriving somewhere
    whisperGapSeconds: 95,     // ...and never closer together than this
    whispersPerVisit: 3,       // ...and only this many before it lets you be
    carryHint: 3,              // motes in tow before it mentions the monument
  },

  ui: {
    hintDelayMs: 2600,
    hint2DelayMs: 9000,      // when the "or tap ahead of yourself" nudge appears
    hint2VisibleMs: 9000,
    memoryVisibleMs: 7200,   // how long a found thing's name and line stay up
    worldNameMs: 6800,       // ...and the name of a place you have arrived in
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

    /* The chord, moving on. Every `driftSeconds` each layer steps to the next
       degree of the world's scale and takes `driftGlideSeconds` to get there,
       so the music is never where you left it and there is never a moment at
       which it changed. Set driftSeconds to 0 to hold one voicing forever. */
    driftSeconds: 52,
    driftGlideSeconds: 14,

    /* Stereo. `width` scales everything — 0 is mono — and `panSeconds` is how
       long one voice takes to wander across its part of the field. Minutes, on
       purpose: this is meant to stop the sound having a location, not to be
       heard as movement. */
    width: 0.55,
    panSeconds: 105,

    /* Timbre, as fallbacks. Each world names its own (see worlds.js):
       `spread` is the chorus width in cents, `shimmer` how much of the
       brighter of each layer's two voices is present, 0..1. */
    spread: 8,
    shimmer: 0.5,

    /* The bells. `chimeGain` is the whole bus, so one number turns them down
       against everything else; `chimeAttack` is long enough that no bell has
       an edge on it, and `chimeSeconds` is the tail at the softest rarity —
       rarer finds ring longer. */
    chimeGain: 0.30,
    chimeAttack: 0.09,
    chimeSeconds: 6.5,
    chimeBrightness: 3800,   // lowpass over the bells, in Hz. Lower is softer.

    /* How far the pad closes down when the sleep fade is fully out, 0..1.
       Lower is darker. Falling asleep to something should make it duller as
       well as quieter. */
    idleSettle: 0.42,
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
      driftCount: 260, silhouettes: 22, skyVeils: 3,
      reflections: true, reflectionSize: 512, waterNormalSize: 256,
      groundCells: 128,
      fractalDepth: 5, fractalInstances: 7000, structureScale: 1.0,
      mengerDepth: 2, blockSegments: 3, cloudLayers: 3, kaleidoscope: true,
      charSegments: 22, charShadow: true, companion: true, sanctuaryExtras: true,
      // how finely a memory's form is resolved — the vertex shader rewrites a
      // sphere into it, so this is the one knob that costs per-vertex work
      memoryDetail: 2,
      bloom: true, bloomScale: 0.5, msaa: 0, pixelRatio: 2,
    },
    medium: {
      maxMotes: 34, starScale: 0.7, particleScale: 0.8,
      driftCount: 170, silhouettes: 16, skyVeils: 2,
      reflections: true, reflectionSize: 256, waterNormalSize: 128,
      groundCells: 96,
      fractalDepth: 4, fractalInstances: 3600, structureScale: 0.8,
      mengerDepth: 2, blockSegments: 2, cloudLayers: 2, kaleidoscope: true,
      charSegments: 16, charShadow: true, companion: true, sanctuaryExtras: true,
      memoryDetail: 2,
      bloom: true, bloomScale: 0.4, msaa: 0, pixelRatio: 1.75,
    },
    low: {
      maxMotes: 20, starScale: 0.45, particleScale: 0.6,
      driftCount: 90, silhouettes: 11, skyVeils: 1,
      reflections: false, reflectionSize: 0, waterNormalSize: 128,
      groundCells: 64,
      fractalDepth: 3, fractalInstances: 1400, structureScale: 0.6,
      mengerDepth: 1, blockSegments: 1, cloudLayers: 1, kaleidoscope: false,
      charSegments: 11, charShadow: false, companion: true, sanctuaryExtras: true,
      memoryDetail: 1,
      bloom: false, bloomScale: 0.35, msaa: 0, pixelRatio: 1.2,
    },
    /* The floor. Meant for a phone that would rather stay cool than look its
       best — and for the software rasterisers, which are fill-rate bound long
       before they are geometry bound, so what matters most here is the pixel
       ratio and the transparent sheets, not the instance count. */
    saver: {
      maxMotes: 14, starScale: 0.30, particleScale: 0.40,
      // the silhouettes stay: they are the most atmosphere per pixel of fill
      // of anything here, and six of them is a horizon
      driftCount: 0, silhouettes: 6, skyVeils: 0,
      reflections: false, reflectionSize: 0, waterNormalSize: 64,
      groundCells: 48,
      fractalDepth: 3, fractalInstances: 900, structureScale: 0.45,
      mengerDepth: 1, blockSegments: 1, cloudLayers: 0, kaleidoscope: false,
      charSegments: 9, charShadow: false, companion: false, sanctuaryExtras: false,
      memoryDetail: 1,
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
  // ...and the same choice reaches the CSS, so the overlays shorten their
  // fades whether the preference came from the OS or from the settings panel
  document.body.classList.toggle('reduced-motion', reduced);
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

  // a gathered mote is acknowledged by the light at the chest — and, the very
  // first time, by the dream explaining what it is you have just picked up
  function onMoteGathered() {
    character.flare();
    story.note('mote');
  }
  motes.onGather = onMoteGathered;

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
    // going home is a journey, so it fades through the same light a gate does
    inSanctuary: () => inSanctuary,
    onSanctuary: () => {
      journal.hide();
      if (inSanctuary) ui.transition(() => loadWorld(returnTo));
      else ui.transition(() => loadSanctuary());
    },
  });
  ui.onArchive = () => {
    analytics.track(EVENTS.archiveOpened, {});
    journal.show();
  };

  /* The dream, telling itself. It owns every passage the game says that is not
     a name or a found thing, and it is handed events rather than asked
     questions — so nothing else in here has to know what a beat is or whether
     one has been said before. */
  const story = createStory({ CONFIG, archive, ui });

  ui.onSettingsSave = saveSettings;
  ui.onBegin = () => {
    ui.showWorldName(world.name, 1400);
    story.begin(world.key);
  };
  ui.onStep = () => {
    if (!ui.transitioning && gate && gate.enterable
        && gate.distance2(rig.state.x, rig.state.z) < CONFIG.gate.promptRadius ** 2) {
      enterGate();
    }
  };

  /* The steering never asks the camera which way is up — that was the whole
     source of the drift, since the follow camera orbits as the wanderer turns.
     It is handed the rig's own yaw instead: no bob, no look smoothing, nothing
     that swings. */
  const input = createInput({
    CONFIG,
    domElement: renderer.domElement,
    getHeading: () => rig.state.yaw,
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
  let ambience = null;         // drift, silhouettes, curtains — scenery only
  let display = null;          // the memories standing up, in the sanctuary
  let readingSlot = null;      // the memory being stood in front of, if any
  let inSanctuary = false;
  let returnTo = 0;            // the world the sanctuary's gate returns to
  let delivered = 0;
  let gateAnnounced = false;   // "a gate has opened" is said once per visit

  /**
   * Build a place. Shared by the four worlds and by the sanctuary, which is
   * shaped exactly like a world so that every system already knows what to do
   * with it — the only differences are gathered in `isHome` below.
   */
  function buildPlace(w, isHome = false) {
    world = w;
    inSanctuary = isHome;
    const p = world.palette;

    if (content) content.dispose();
    if (gate) gate.dispose();
    if (fragments) fragments.dispose();
    if (ambience) ambience.dispose();
    if (display) { display.dispose(); display = null; }
    readingSlot = null;
    ui.setLabel(null);

    terrain.build(world);
    content = createWorldContent({ CONFIG, quality, scene, world, terrain });
    gate = createGate({ CONFIG, scene, world, terrain });
    // scenery, and only scenery: nothing in here can be gathered, woken or
    // missed, and it is built before the pre-warm below so its shaders link
    // while the screen is still full of gate-light
    ambience = createAmbience({ CONFIG, quality, scene, world });
    ambience.setViewportHeight(window.innerHeight);
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

    if (isHome) {
      /* The sanctuary keeps nothing and asks nothing. Everything in it is
         already awake — a place you come back to should not need waking —
         and its monument answers to the whole journey rather than to any one
         world, so it is the single object in the game that shows everything
         you have ever done at once. */
      const every = [];
      for (let i = 0; i < content.structures.length; i++) every.push(i);
      content.restoreAwake(every, () => {});
      const s = archive.summary();
      delivered = 0;
      content.setMonumentGrowth(s.completion);
      content.setMasteryForm(archive.monumentForm(null, s.mastery));

      display = createSanctuaryDisplay({
        CONFIG, quality, scene, world, terrain, archive,
      });
      analytics.track(EVENTS.sanctuaryOpened, { found: s.discoveries });
    } else {
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
    }

    // name the place as it comes into view — held back so it arrives with the
    // gate-light still clearing, not on top of it. The name sits at the top of
    // the frame and the dream's own line at the bottom, so arriving reads as a
    // page turning rather than as two notices fighting.
    //
    // Both are held until the title has lifted: on the very first load this
    // runs before anyone has pressed begin, and the opening beat covers the
    // first world itself.
    if (ui.began) {
      ui.showWorldName(
        world.variantName ? `${world.name} — ${world.variantName.toLowerCase()}` : world.name,
        1400);
      story.arrive(world.key, isHome);
    }

    // water is per-world: most of them have none at all
    if (water) { water.dispose(); water = null; }
    if (world.water) water = createWater({ CONFIG, quality, scene, renderer, world });

    /* Arrive out on the plaza, facing the monument in the middle — or, at
       home, close enough to the gallery to see that it is made of things.
       Landing at the usual distance put the whole of it twenty metres off,
       which is exactly far enough for a room of your own history to read as
       scenery on the horizon. */
    rig.place(0, world.ground.spawnRadius ?? world.ground.plazaRadius * 2.4, 0);
    // ...and "up the screen" means the way they are facing from the first
    // frame, rather than easing over from however the last world was left
    input.syncBasis();
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

  /** one of the four worlds, by index, wrapping in both directions */
  function loadWorld(index) {
    worldIndex = ((index % WORLDS.length) + WORLDS.length) % WORLDS.length;
    const base = WORLDS[worldIndex];
    // ...in whichever mood it has been set to be found in. The seed is
    // untouched, so the ground, the structures and the memories are exactly
    // where they were — only the light is different.
    buildPlace(applyVariant(base, archive.variant(base.key)), false);
  }

  /**
   * Go home. Remembers where you were so the sanctuary's gate can put you
   * back — you are visiting, not moving, and the journey waits exactly where
   * you left it.
   */
  function loadSanctuary() {
    if (inSanctuary) return;
    returnTo = worldIndex;
    buildPlace(SANCTUARY, true);
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
    ambience?.setViewportHeight(h);
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
    motes.onGather = onMoteGathered;

    // ...and this rebuilds the ground, the fractals and the water, and
    // re-tints everything that was just replaced
    const at = { x: rig.state.x, z: rig.state.z, yaw: rig.state.yaw };
    loadWorld(worldIndex);
    rig.place(at.x, at.z, at.yaw);
    input.syncBasis();

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
    // ...and the first one is also where the dream draws the line between a
    // mote, which is light, and a memory, which is a thing that happened
    story.note('memory');
    analytics.track(EVENTS.discoveryFound,
      { id: d.id, world: d.world, rarity: d.rarity });
    character.flare();
    companion?.notice(it.x, it.y, it.z);
    // the world says something back: a bell in the chord it is already
    // playing, pitched and held by how rare the thing was
    audio.chime(RARITY[d.rarity]?.chime ?? 0);
    // ...and a rarer find brings the world up a layer with it
    if (RARITY[d.rarity]?.chime >= 2) audio.addLayer();
    // and the monument answers, since knowing a world is part of mastery
    content.setMasteryForm(archive.monumentForm(world.key));
  }

  /** walk on to the next world, through the gate's soft light. The same path
      serves the walked-into ring and the tapped "step through" prompt. */
  function enterGate() {
    analytics.track(EVENTS.gateEntered, { from: world.key });
    story.note('travel');
    ui.setStepPrompt(false);
    // from the sanctuary the gate is the way back to where you were; from a
    // world it is the way on to the next one
    const next = inSanctuary ? returnTo : worldIndex + 1;
    ui.transition(() => loadWorld(next));
  }

  /** forget the journey and wake up back at the start, through the same
      soft light a dream-gate uses — resetting should feel like dreaming
      again, not like a page reload */
  function resetJourney() {
    archive.reset();
    /* Begun again means taught again. The archive's reset has already dropped
       every `story:` milestone, so the opening beat is owed — and it has to be
       claimed *before* the world is built, or buildPlace's own arrival line
       would be queued in front of it. */
    const begin = () => {
      story.reset();
      story.begin(WORLDS[0].key);
      loadWorld(0);
    };
    if (!ui.transition(begin)) begin();
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
    ambience?.setPalette(p);
    display?.setPalette(p);
    character.setPalette(p);
    gate.setPalette(p);
  }

  /* What the dream can see of where the player is up to. Filled in each frame
     and handed to story.update — one reused object, because this is per-frame
     and a fresh one would be sixty allocations a second to describe a mood. */
  /** the display name of a world, for the sanctuary's labels */
  function worldName(key) {
    return WORLDS.find((w) => w.key === key)?.name ?? key;
  }

  const situation = {
    began: false, transitioning: false, menuOpen: false, moving: false,
    inSanctuary: false, gateEnterable: false, gateNear: false,
    freeMotes: 0, heldMotes: 0, awake: 0, delivered: 0, fragmentNear: false,
  };

  // the ground's light list, rebuilt each frame from two sources and never
  // reallocated
  const lights = [];
  const byDistance = (a, b) => a.dist2 - b.dist2;

  let last = performance.now();
  let time = 0;
  let ambientAt = 2;
  let moodAt = 0;
  let exposureScale = 1;      // the adaptive aperture; 1 is wide open

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
        if (inSanctuary) return;      // nothing here sleeps, or is scored
        audio.addLayer(true);         // ...and it is heard arriving
        story.note('awaken');
        archive.noteAwakened(world.key, i, content.awake);
        analytics.track(EVENTS.structureAwakened, { world: world.key });
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
    if (arrived > 0 && !inSanctuary) {
      delivered += arrived;
      story.note('deliver');
      archive.noteDelivered(world.key, delivered);
      content.setMonumentGrowth(delivered / CONFIG.motes.monumentTarget);
    }

    // The gate opens on whichever the player has actually been doing — waking
    // structures or carrying motes to the monument — so either kind of
    // wandering leads onward. Walking into it takes you to the next world.
    // The sanctuary's gate is your own front door: always open, and it leads
    // back to the journey rather than on to the next world.
    const wantedOpen = (inSanctuary || CONFIG.debug.freeTravel) ? 1 : Math.max(
      content.awakeFraction / CONFIG.awaken.gateAt,
      delivered / (CONFIG.motes.monumentTarget * CONFIG.gate.gatherAt)
    );
    gate.update(dt, ctx, wantedOpen);

    // say so, quietly, the moment it would admit you
    if (!gateAnnounced && gate.enterable && !inSanctuary) {
      gateAnnounced = true;
      if (ui.began) ui.announce('a gate has opened');
      // ...and the first time it ever happens, what opened it and what to do
      // with it, which is the one piece of the loop nothing else teaches
      story.note('gate-open');
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
    const frag = fragments
      ? fragments.nearestTo(rig.state.x, rig.state.z, 22)
      : display?.nearestTo(rig.state.x, rig.state.z, 16);
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
    if (!ui.transitioning) fragments?.update(dt, ctx, rig.state);
    display?.update(dt, ctx, rig.state);

    /* ── what you are standing in front of, at home ────────────────────
     * Proximity, not a notification: it appears because the player walked up
     * to a memory and goes when they walk away, so nothing queues and nothing
     * can be missed by being elsewhere when it fired. An empty place names
     * itself too — as the world it belongs to, never as the thing it is
     * waiting for, because a gap that tells you its answer stops being one.
     */
    if (display && !ui.transitioning) {
      const at = display.readingAt(rig.state.x, rig.state.z);
      if (at !== readingSlot) {
        readingSlot = at;
        if (!at) {
          ui.setLabel(null);
        } else if (at.found) {
          ui.setLabel({
            kind: `a memory of ${worldName(at.world)}`,
            name: at.name, note: at.note,
          });
        } else {
          ui.setLabel({
            kind: 'an empty place', empty: true,
            name: `something from ${worldName(at.world)}`,
            note: 'Still out there. It will stand here when you find it.',
          });
        }
      }
    } else if (readingSlot) {
      readingSlot = null;
      ui.setLabel(null);
    }

    companion?.update(dt, ctx, rig.state, gate);

    /* ── and the dream, saying something about all that ────────────────
     * Last of the gameplay systems on purpose: everything it reads has been
     * settled by now, including whether there is an unfound memory in view.
     */
    situation.began = ui.began;
    situation.transitioning = ui.transitioning;
    situation.menuOpen = ui.panelOpen || journal.open;
    // intent as well as motion, so a passage gets out of the way the moment
    // the player reaches for the stick rather than once they are under way
    situation.moving = input.navigating || rig.moving;
    situation.inSanctuary = inSanctuary;
    situation.gateEnterable = gate.enterable;
    situation.gateNear = gateD2 < CONFIG.gate.promptRadius ** 2;
    situation.freeMotes = motes.free;
    situation.heldMotes = motes.held;
    situation.awake = content.awake;
    situation.delivered = delivered;
    situation.fragmentNear = !!frag;
    story.update(dt, situation);

    // the ground takes light from the motes and from whatever is awake, as
    // one list of the nearest few
    lights.length = 0;
    for (const m of motes.nearestTo(camera.position, CONFIG.ground.lights)) lights.push(m);
    content.nearestAwake(camera.position, CONFIG.ground.lights, lights);
    fragments?.lights(lights, CONFIG.ground.lights, camera.position);
    lights.sort(byDistance);
    if (lights.length > CONFIG.ground.lights) lights.length = CONFIG.ground.lights;
    terrain.setLights(lights);

    /* ── the eye adjusting ─────────────────────────────────────────────
     * `lights` is already the brightest few things near the camera, sorted,
     * which makes it a free and quite good estimate of how much light is
     * about to be in the frame. Near things count for more than far ones, and
     * an open gate is added on top because a beacon is a lot of light that
     * carries no ground lights of its own.
     */
    const R = CONFIG.render;
    let load = gate.open * 0.9;
    for (const l of lights) load += (l.vis * l.glow) / (1 + l.dist2 * 0.012);

    const want = Math.max(
      R.adaptFloor,
      1 / (1 + R.adaptStrength * Math.max(0, load - R.adaptFrom))
    );
    // closing is quicker than opening, the way an eye is: walking into light
    // should not blind you, and walking back out should take a moment to
    // recover from rather than snapping bright
    exposureScale = THREE.MathUtils.damp(
      exposureScale, want, want < exposureScale ? R.adaptDown : R.adaptUp, dt);
    ui.setExposureScale(exposureScale);

    sky.update(dt, ctx);
    if (water) water.update(dt, ctx);
    fireflies.update(dt, ctx);
    haze.update(dt, ctx);
    ambience.update(dt, ctx);
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
    /** swap steering scheme live, e.g. __night.scheme('heading') */
    scheme(name) {
      if (name === 'stable-relative' || name === 'heading') {
        CONFIG.movement.scheme = name;
        input.syncBasis();
      }
      return CONFIG.movement.scheme;
    },
    renderer, scene, camera, rig, terrain,
    get post() { return post; },
    get character() { return character; },
    get companion() { return companion; },
    get gate() { return gate; },
    get motes() { return motes; },
    get fragments() { return fragments; },
    get ambience() { return ambience; },
    get display() { return display; },
    get inSanctuary() { return inSanctuary; },
    journal,
    story,
    /** say a beat again regardless of whether it has been said — for reading
        the copy back without playing to it */
    say(id) {
      const lines = STORY_BEATS[id];
      if (lines) ui.showBeat(lines);
      return lines || Object.keys(STORY_BEATS);
    },
    /** visit the sanctuary, or come back from it */
    home() { inSanctuary ? loadWorld(returnTo) : loadSanctuary(); return world.key; },
    /** walk to the nearest unfound memory, for looking at one on purpose */
    toFragment() {
      const f = fragments.nearestTo(rig.state.x, rig.state.z, 1e6);
      if (!f) return null;
      rig.place(f.x, f.z + 4, 0);
      return f.d.name;
    },
    /** wake the whole world at once, for looking at what that does */
    wakeAll() {
      // This used to write to `journey` and call `saveJourneySoon`, neither of
      // which has existed since the archive replaced the old save record — so
      // it threw on the first structure it woke.
      const was = CONFIG.awaken.radius;
      CONFIG.awaken.radius = 1e6;
      content.updateAwakening(0, rig.state.x, rig.state.z, (i) => {
        audio.addLayer();
        if (!inSanctuary) archive.noteAwakened(world.key, i, content.awake);
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
