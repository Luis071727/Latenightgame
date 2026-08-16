# Phase 0 — Discovery

A read-only map of the systems the refactor touches. No behaviour changed in this
commit. Line references are against the tree at the time of writing.

---

## 1. Steering: how the basis is derived, and how the camera rotates

**Two loops that feed each other.** This is the root cause of the "straight push
curves" complaint, and it is exactly as described in the brief.

### The basis (`input.js:155–208`)

`takeNav()` accumulates a *screen-space* request into `(sx, sy)` from three
sources — the floating stick (`159–168`), a decaying tap nudge (`170–173`), and
WASD/arrows (`175–179`) — then rotates it into world space using the **live
camera** every single frame:

```js
camera.getWorldDirection(camForward);   // input.js:189
camForward.y = 0; camForward.normalize();
const rx = -camForward.z, rz = camForward.x;   // right = forward × up
dir.set(rx * sx - camForward.x * sy, 0, rz * sx - camForward.z * sy);
```

There is no stored control yaw anywhere. The basis is re-derived from
`camera.matrixWorld` on every drain, which means it inherits *everything* the
rig did to the camera on the previous frame — including the bob.

### The camera (`rig.js:147–189`)

The follow rig recomputes `camTarget` from the wanderer's own heading each frame:

```js
camTarget.set(state.x - forward.x * K.distance, state.y + K.height,
              state.z - forward.z * K.distance);     // rig.js:152
```

`forward` is `headingVector(state.yaw)` (`rig.js:45–47`, `rig.js:99`), so the
camera's orbital position around the wanderer is a pure function of `state.yaw`.
It is then damped toward that target at a **single rate for all three axes**
(`K.follow = 2.4`, with y at `follow * 1.35`; `rig.js:175–177`), and the look
point is damped separately at `K.lookFollow = 3.0` (`rig.js:178–180`).

Crucially there is **no separate rotational damping**. Because the follow point
is positional, `K.follow` is simultaneously the translation lag *and* the
rotation lag — you cannot slow the swing without also making the camera trail
sluggishly behind straight-line movement.

Two extra contaminants land on the camera *after* the damp, at `rig.js:185–187`:

```js
const bob = K.bob * cameraMotion;
camera.position.y += Math.sin(time * K.bobSpeed) * bob;
camera.position.x += Math.sin(time * K.bobSpeed * 0.63) * bob * 2.4;
```

The x-offset is 2.4× the bob amplitude and is applied to the camera *position*
before `camera.lookAt(smoothLook)`. So the camera's world direction — and
therefore the steering basis — has a slow lateral sinusoid baked into it. It is
small (`bob: 0.05` → ±0.12 units of lateral sway) but it is a permanent,
never-settling wobble in the frame of reference the player is pushing against.

### The feedback loop

```
stick (screen) ──→ camera basis ──→ world direction
                        ↑                  │
                        │                  ▼
                  camera.lookAt  ←──  rig.state.yaw  ←── turn toward direction
```

Push up-and-slightly-right → the figure turns right → the camera swings right
behind them → "up" on screen now means a *different* world direction → the same
unchanged thumb position now asks for a further-right heading → the figure turns
further right. The path spirals until the player corrects. That is the balancing
act.

### Turn feel (`rig.js:79–87`, CONFIG at `main.js:343–358`)

```js
const want = Math.atan2(wantX, -wantZ);
const diff = wrapAngle(want - state.yaw);
wantTurn = clamp(diff * M.turnGain, ±M.maxTurnSpeed) * wantStrength;
state.vYaw = damp(state.vYaw, wantTurn, M.turnResponse, dt);
```

Current values: `turnGain: 4.0`, `maxTurnSpeed: 1.7`, `turnResponse: 7.0`,
`deadzone: 10` px, `stickRadius: 78` px, `drive: 1.6`, `damping: 0.03`,
`paceScale` from `paces {stroll 0.85, wander 1.15, drift 1.5}`.

`turnGain 4.0` saturates the clamp at only ~24° of heading error, so almost any
correction is a full-rate turn — there is no gentle zone. There is **no
hysteresis**: a stick 1 px past the deadzone produces a full-strength heading
demand. Ceilings and coast-to-stop that must be preserved: `maxSpeed`, `accel`,
`maxTurnSpeed`, `damping`, `edgeAt`/`edgePull` (`rig.js:110–137`).

### Tap-to-move

The tap path (`input.js:94–110`) stores a *screen-space* unit vector and decays
it over `tapDecaySeconds: 1.6`, and it is summed into `(sx, sy)` and rotated
through the same live-camera basis. So a tap suffers the same drift — over 1.6 s
of decay the camera can rotate meaningfully and the nudge bends.

**Phase 1 conclusion:** need a control yaw owned by `input.js` (frozen at
pointer-down, or eased very slowly), a `'heading'` alternative that skips the
basis entirely, a separate rotational damping term in `rig.js`, and the bob
lifted out of the basis (either by dropping the x-bob or by having `input.js`
never read the camera).

---

## 2. Sanctuary vs. the four worlds

**Structurally identical, deliberately.** `SANCTUARY` (`worlds.js:185–225`) is a
world literal with the exact same shape as the four in `WORLDS` — palette, fog,
ground, species, structures, monument, clouds, water, stars, fireflies, audio —
plus one marker field `sanctuary: true` (which nothing currently reads) and a
smaller `ground.radius: 76`.

Both go through the same `buildPlace(w, isHome)` in `main.js:677–786`. The only
divergences are inside the `if (isHome)` branch (`main.js:716–733`):

| | four worlds | sanctuary |
|---|---|---|
| terrain | `terrain.build(world)` | *same call, same generator* |
| structures | `createWorldContent` scatter, dormant | *same*, then `restoreAwake(every)` |
| monument growth | `delivered / monumentTarget` | `archive.summary().completion` |
| monument form | `archive.monumentForm(world.key)` | `monumentForm(null, s.mastery)` |
| fragments | `createFragments(...)` | none |
| gallery | none | `createSanctuaryDisplay(...)` |
| visit counting | `archive.arrive(key)` | not counted |
| gate | opens with progress | forced `wantedOpen = 1` (`main.js:1090`) |
| gate destination | `worldIndex + 1` | `returnTo` (`main.js:931`) |

So the "generic" feeling is real and structural: **the sanctuary ground is
literally the same fbm heightfield generator with the same rim, the same drop,
the same plaza formula** (`terrain.js:130–154`), differing only in the numeric
constants in `SANCTUARY.ground` and in the palette. `terrain.heightAt` has no
notion of a sanctuary. `createWorldContent` grows the same `species: 'tree'`
branching structures the meadow uses.

The one genuinely bespoke thing is `sanctuary.js` — the memory gallery. It lays
out one slot per discovery in `DISCOVERIES` (32 today), grouped as four arcs
(`sanctuary.js:31–55`), rarity pushing a slot further out and higher
(`radius + (rar.glow - 0.85) * S.rarityPush`). Two `InstancedMesh`es for the
whole gallery — bodies (octahedra) and halo billboards — so it is 2 draw calls
regardless of count. Found slots burn and rotate; unfound ones sit at
`S.emptySize: 0.30` / `S.emptyGlow: 0.26` as inviting gaps. That "empty socket"
idea is the thing worth keeping and building on.

**Phase 3 hooks that already exist:** `archive.summary()` gives
`discoveries / rare / collections / worldsVisited / mastery / completion`;
`archive.mastery(key)` gives per-world breakdown. Nothing in the sanctuary
currently surfaces worlds-visited, per-world completion, or travel.

---

## 3. Discoveries & fragments: definition, placement, persistence

### Definition — `discoveries.js`, pure data

`DISCOVERIES` (`discoveries.js:82–170`) is keyed by world key; each world has
**exactly 8**: 3 common, 2 uncommon, 2 rare, 1 gated `dream`/`mythic`. 32 total
(`TOTAL_DISCOVERIES`, built from `BY_ID` at `494–512`).

Each record: `{ id, name, rarity, place, note, needs? }`.

- `rarity` → `RARITY` table (`24–30`) giving `glow`, `size`, `chime`.
- `place` → `PLACE` band (`54–62`): `wander | grove | monument | rim | fog |
  water | gate`.
- `needs` (`77–81`) is the secret-unlock system: `{ awake, delivered, visits,
  found[] }`, all checked against `archive.worldState(key)`.

Also in this file: `COLLECTIONS` (4 five-piece sets → cosmetic rewards),
`COSMETICS` (6 cloaks, 5 companions), `MASTERY_REWARDS` (4 thresholds × 4
worlds), `VARIANTS` (3 moods per world, 2 unlockable), `TITLES` (12), and
`MONUMENT_FORMS` (5 stages).

### Placement — `fragments.js`

`createFragments` filters to what is neither found nor locked (`fragments.js:45`),
then places each with `mulberry32((world.seed ^ 0x9e3779b9) + i * 7919)` where
`i` is the index in the world's *full* list (`fragments.js:93`) — so a spot never
moves as the pending list shortens. `placeOne` (`57–87`) maps the `place` band to
a radius fraction of `G.radius`. Two `InstancedMesh`es again (body + halo),
capacity = pending count, `mesh.count` repacked each frame from the live list.

`NOTICE = 26` units is the awareness radius; `it.near` drives brightness, lift
and the companion's attention. `D.takeRadius: 2.6` is the pickup.

### Persistence — `archive.js` over `save.js`

`archive.record(id)` (`archive.js:351–362`) appends to
`data.worlds[world].found`, then runs `checkMastery` → `checkCollections` →
`checkTitles`, each of which may `unlock()` and fire `onUnlock` / `onCollection`
/ `onMastery`. Writes are debounced 1200 ms (`saveSoon`, `archive.js:148–156`)
and flushed on `pagehide` (`main.js:1167`).

Everything is monotonic — `noteAwakened` uses `Math.max` on `bestAwakened`,
`noteDelivered` uses `Math.max` on `delivered`, nothing is ever removed.

---

## 4. Menus: sizing and scrolling

### Settings panel — **broken on short viewports**

`index.html:304–317`:

```css
#panel-card {
  width: min(400px, calc(100vw - 28px));
  margin-bottom: max(16px, env(safe-area-inset-bottom));
  padding: 22px 24px calc(14px + env(safe-area-inset-bottom) * 0.4);
  /* no max-height, no overflow */
}
```

The parent `#panel` is `position: fixed; inset: 0; display: grid; place-items:
end center`. With no `max-height` and no `overflow`, a card taller than the
viewport simply overflows the grid area — and because grid `place-items: end`
aligns to the *end* edge, the overflow goes off the **top** of the screen and
cannot be scrolled to. The card content is: title, sound row, music slider,
ambience slider, motion toggle, quality picker (stacked, 5 options), pace picker
(stacked), **"open the dream archive" button**, reset button. On a 640 px-tall
portrait viewport with the browser toolbar showing, the archive button and reset
are the ones that fall off. Confirmed: nothing in the stylesheet gives this
element `overflow-y`.

### Dream archive — scrolls, but is cut off by mobile chrome

`index.html:460–474`:

```css
#journal .j-card { width: min(560px, 100vw); height: min(88vh, 900px); ... overflow: hidden; }
```

`index.html:514–517`:

```css
#journal .j-body {
  flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 4px 22px calc(28px + env(safe-area-inset-bottom));
}
```

So `.j-body` **already** has momentum scrolling and safe-area bottom padding —
that half is fine. The defect is `height: min(88vh, 900px)`: `vh` on mobile
resolves against the *largest* viewport (toolbar hidden), so with the toolbar
showing, 88vh is taller than the visible area and the bottom of the card —
including the last rows of a tab — sits behind the browser chrome. `dvh` is the
fix. The card is `flex-direction: column` with `overflow: hidden`, so head/tabs
stay pinned and only the body scrolls; that structure is correct and should be
kept.

Tab content is rebuilt on open and on tab change only (`journal.js:47–53`) —
never during the render loop.

---

## 5. Additive glow sources, and how bloom is configured

### Every additive-blended material

| file | line | what it is | notes |
|---|---|---|---|
| `sky.js` | 90 | star points | scaled by `quality.starScale`, `world.stars` |
| `haze.js` | 28 | ground haze sheet | `renderOrder 0` |
| `fractals.js` | 523 | cloud sheets | 0–3 layers by tier |
| `gate.js` | 55 | gate ring | `× (0.35 + 1.5 * uOpen)` |
| `gate.js` | 85 | gate veil | |
| `gate.js` | 137 | gate beacon ×2 meshes | shared material, `uBeacon: 1.0` |
| `fireflies.js` | 53 | firefly points | `brightness: 1.5`, `count: 14` |
| `motes.js` | 43 | mote bodies | `glow 1.20 × gatheredGlow 1.55` |
| `motes.js` | 96 | mote haloes | `glowPower 0.32`, `glowRadius 3.0` |
| `fragments.js` | 127 | fragment bodies | `rarity.glow` up to 1.80 |
| `fragments.js` | 174 | fragment haloes | `glowPower 0.40` |
| `sanctuary.js` | 74 | gallery bodies | up to 32 at once |
| `sanctuary.js` | 118 | gallery haloes | `glowPower 0.42` |
| `character.js` | 170 | chest glow card | `glow 1.15` + `glowGather 0.85` flare |
| `character.js` | 227 | the two eyes | `eyeGlow 0.62` |
| `companion.js` | 39 | companion light | `glow 1.25` |

**Not additive but still HDR-emissive, and the biggest contributor:** the
structure meshes from `createFractalMesh` (`fractals.js:387`) are ordinary opaque
materials that add `uBloomColor * vBloom * uBloomGain * (0.30 + 0.95 * vLevel)`
(`fractals.js:444`). `bloomGain` is `0.30` for trunks, **`1.0` for tips**
(`worlds.js:364`, `worlds.js:384`), `0.55` for the monument (`worlds.js:418`).
An awakened structure drives `vBloom → 1` across its whole tip slice. A grove of
40 awakened structures is therefore a large area of the frame emitting above 1.0
*before* any additive sprite is drawn on top of it.

### Bloom & tone mapping

`main.js:73–77`:

```js
bloom: { strength: 0.48, radius: 0.62, threshold: 0.62 }
```

Built at `post.js:165–174` as an `UnrealBloomPass` sized to
`size × quality.bloomScale` (0.30–0.50 by tier; **disabled entirely on `low` and
`saver`** — `quality.bloom` is false there).

Pipeline (`post.js:143–186`): `RenderPass → [Kaleidoscope] → [UnrealBloom] →
OutputPass → VignetteDither`. Targets are `HalfFloatType`, so everything before
`OutputPass` is linear HDR and values above 1.0 survive to drive the threshold.

Tone mapping is `ACESFilmicToneMapping` with `toneMappingExposure` set **once**
at `main.js:516` and then overwritten **every frame** by the sleep fade at
`ui.js:416`:

```js
renderer.toneMappingExposure = CONFIG.render.exposure * (0.18 + 0.82 * dim);
```

`OutputPass` reads the renderer's exposure live, so that one line is the single
control point for global brightness. **Any adaptive-exposure work in Phase 4 must
compose with this line rather than fight it** — writing `toneMappingExposure`
anywhere else in the frame will be clobbered by `ui.update()` on the next tick.

### Why it blows out

Nothing anywhere clamps the *sum*. Each source is individually tame; a mote halo
is `0.32`, a fragment halo `0.40`. But halo cards are large (`glowRadius` 3.0–3.8
× the body) and additive, so N overlapping haloes contribute N × their peak with
no rolloff. With a threshold of `0.62` against an exposure of `0.95`, a halo
overlapping an awakened tip cluster crosses the threshold easily and the bloom
then spreads it further. There is no exposure adaptation, no soft-clamp, and no
protection for the ground under the wanderer — the ground shader
(`terrain.js:109–116`) accumulates up to 6 point lights at
`CONFIG.ground.lightPower: 3.2` with `1/(1+d²·0.12)` falloff and no ceiling.

Relevant knobs today: `render.exposure 0.95`, `bloom.threshold 0.62`,
`awaken.lightPower 2.4`, `ground.lightPower 3.2`, `motes.glow 1.20`,
`motes.glowPower 0.32`, `motes.gatheredGlow 1.55`, `discoveries.glowPower 0.40`,
`sanctuary.glowPower 0.42`, `character.glow 1.15`, `companion.glow 1.25`,
`fireflies.brightness 1.5`.

---

## 6. What `save.js` already persists

Three independent `localStorage` keys, all read/written best-effort inside
try/catch (`save.js:18–35`).

### `soft-worlds:settings`

```js
{ muted, musicVolume, ambienceVolume, reducedMotion, quality, pace }
```

Defaults at `save.js:38–45`. `reducedMotion: null` means "follow the OS".

### `soft-worlds:journey` — legacy (v1)

```js
{ world, delivered, awakened[] }
```

`loadJourney`/`saveJourney`/`eraseJourney` are exported but **`main.js` no longer
imports them** — it imports only `loadSettings, saveSettings` (`main.js:19`). The
key survives solely so `loadLegacyJourney()` (`save.js:120`) can hand a
pre-archive save to `foldLegacy` (`archive.js:88–107`) exactly once, guarded by
the `migrated:v1` milestone.

### `soft-worlds:archive` — the real record (`SAVE_VERSION = 2`)

```js
{
  v: 2,
  currentWorld: 0,
  worlds: { <key>: { visits, awakened[], bestAwakened, delivered, found[] } },
  unlocks: { cloak[], companion[], monument[], title[] },
  equipped: { cloak, companion, title },
  profile: { name, created },
  variants: { <key>: variantId },
  milestones: [ ... ]
}
```

**`milestones` is the key finding for Phase 2.** It is a flat array of one-off
string flags with a ready-made API:

```js
archive.milestone(id)      // → true the first time only, then persists
archive.hasMilestone(id)   // → boolean
```

Existing entries use namespaced ids (`migrated:v1`, `mastery:<key>:<at>`,
`set:<id>`), so `story:<beat>` slots in without a migration and without bumping
`SAVE_VERSION`. Story beats do **not** need a new storage key — though a small
dedicated block may still be worth it for the idle-whisper rate limiter, which is
session state rather than a permanent flag.

### Also noted

`window.__night.wakeAll()` (`main.js:1210–1220`) references `journey.awakened`
and `saveJourneySoon()`, neither of which exists in `start()` — leftovers from
the pre-archive save. The helper throws on call. Console-only, no gameplay
impact, but worth fixing when Phase 7 passes through.

---

## 7. Files each phase touches

| Phase | Files |
|---|---|
| **1 — steering** | `src/input.js` (control yaw, schemes, deadzone/hysteresis, tap), `src/rig.js` (rotational follow damping, bob out of the basis), `src/main.js` (CONFIG `movement.scheme` + new knobs, wire the scheme through) |
| **2 — story** | **`src/story.js` (new)**, `src/main.js` (build it, fire beats from the existing callbacks: `onDiscovery`, `updateAwakening`, mote delivery, `gateAnnounced`, `enterGate`, `buildPlace`), `src/ui.js` (a non-blocking beat overlay beside `showWorldName`), `index.html` (`#beat` element + CSS), `src/archive.js` (only if beats want more than `milestone()`), `src/save.js` (only if a dedicated story block is added), `public/sw.js` (cache bump) |
| **3 — sanctuary** | `src/worlds.js` (`SANCTUARY` distinct ground/palette + a sanctuary profile flag), `src/terrain.js` (sanctuary-only height profile: flatter plaza, quieter fractals), `src/sanctuary.js` (constellations, worlds-visited readout, growing central structure), `src/discoveries.js` (more per world + conditional rares), `src/fragments.js` (only if new `place` bands are needed), `src/main.js` (CONFIG `sanctuary.*`, wire the new display), `src/archive.js` (only if new summary fields are needed) |
| **4 — lighting** | `src/post.js` (adaptive exposure, bloom threshold), `src/ui.js` (the exposure line at 416 must compose, not conflict), `src/motes.js`, `src/fragments.js`, `src/sanctuary.js`, `src/character.js`, `src/companion.js` (soft-clamp per-source glow), `src/terrain.js` (clamp accumulated ground light, protect under the wanderer), `src/worlds.js` (`bloomGain`), `src/main.js` (CONFIG knobs) |
| **5 — menus** | `index.html` only (`#panel-card` max-height + overflow; `.j-card` `vh` → `dvh`), `public/sw.js` (cache bump — CSS is inline in `index.html`, so an HTML change is enough) |
| **6 — atmosphere** | `src/fractals.js` or a new instanced/points module, `src/worlds.js` (per-world density), `src/main.js` (tier entries in `CONFIG.tiers`, wire into `buildPlace` + `applyTier` dispose path), `src/quality.js` (only if the FrameWatch budget needs adjusting) |
| **7 — ship** | `public/sw.js` (final `VERSION` bump), `README.md`, `src/main.js` (the `wakeAll` bug), verification pass |

### Constraints carried through every phase

- `CONFIG` at the top of `main.js` stays authoritative and is read live each frame.
- Every new GPU resource needs a `dispose()` reachable from both `buildPlace`'s
  teardown (`main.js:682–685`) and `applyTier` (`main.js:863–873`).
- `ctx.motionScale` / `motion.camera` are live references — read them, don't
  snapshot them, so the reduced-motion toggle lands immediately.
- New per-world content must be tier-scaled and covered by the FrameWatch
  downgrade path, and pre-warmed by `renderer.compile(scene, camera)` at
  `main.js:785` during the gate fade.
- `public/sw.js` `VERSION` bumps on any js/css change.
