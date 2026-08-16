# Phase 0 — Discovery

A read-only map of the four systems this pull request touches: touch scrolling,
memory identity, ambient sound, and how an unlock is earned and shown. No
behaviour changes in this commit. Line references are against the tree as of
this commit.

---

## 1. Why the dream archive will not scroll on touch

There are **two independent blockers**, and removing either one alone leaves the
archive dead. The CSS that *should* make it scroll is already correct and is not
one of them.

### What is already right

```css
#journal .j-body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; }   /* index.html:623 */
#panel-card     { max-height: 85dvh; overflow-y: auto;
                  -webkit-overflow-scrolling: touch;
                  overscroll-behavior: contain; }                                    /* index.html:406 */
```

Both surfaces are real scroll containers with correct heights (`dvh`, so the
mobile toolbar does not eat the last rows). On a desktop pointer — mouse wheel,
trackpad — they scroll today. It is only *touch* that is broken.

### Blocker A — the document-level `touchmove` preventDefault (`input.js:202-206`)

```js
const stop = (e) => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('gesturestart', stop, { passive: false });
document.addEventListener('dblclick', stop, { passive: false });
document.addEventListener('contextmenu', stop);
```

Registered on `document`, unconditionally, with `{ passive: false }` — so the
browser honours the `preventDefault()`. It fires for **every** touchmove
anywhere in the page, including one whose `target` is a row inside
`#journal .j-body` or a slider inside `#panel-card`. A prevented `touchmove`
cancels the native pan for that whole touch sequence, so the finger drags and
nothing moves. There is no target test of any kind.

Note what is *not* implicated: the joystick's pointer handlers are bound to
`domElement` — the canvas — not to the document (`input.js:195-199`), so a touch
in the archive never starts a stick. The only thing in this file that reaches an
archive touch is `stop`.

`gesturestart` is Safari's pinch-zoom and wants no target test; `dblclick` and
`contextmenu` are not gestures and never swallow a scroll.

### Blocker B — `touch-action: none` on `body` (`index.html:65-75`)

```css
html, body {
  overflow: hidden;
  overscroll-behavior: none;          /* no pull-to-refresh */
  touch-action: none;                 /* no pan / pinch-zoom */
}
```

Per the CSS spec the *effective* touch-action for a gesture is the intersection
of `touch-action` over the touched element **and all of its ancestors** up to
the element that would handle the pan. `none` on `body` therefore disables
panning in every descendant, whatever the scroll container itself declares —
so even with Blocker A fixed, `#journal .j-body` still cannot pan.

What each guard is actually for, and how it survives the fix:

| guard | protects against | after Phase 1 |
| --- | --- | --- |
| `overscroll-behavior: none` on body | pull-to-refresh, overscroll chaining | keep as-is — unrelated to panning |
| `user-scalable=no` in the viewport meta (`index.html:5`) | pinch-zoom | keep as-is |
| `touch-action: none` on `canvas` (`index.html:76`) | pan/zoom over the world | keep — this is where it belongs |
| `touch-action: none` on `body` | the same, redundantly | must be relaxed |
| `stop` on `touchmove` | pan/zoom over the world | must be scoped to non-scrollable targets |

Over the world the JS `preventDefault` alone is sufficient, so relaxing the body
rule costs nothing there.

---

## 2. What a memory is, and how it becomes geometry

### The record (`discoveries.js:90-222`)

Four worlds × 12 = **48 discoveries**. Every entry is:

| field | type | used by |
| --- | --- | --- |
| `id` | string, unique game-wide | `archive`, the `BY_ID` map (`discoveries.js:546`) |
| `name` | string | `journal`, `ui.showMemory`, sanctuary labels |
| `rarity` | key into `RARITY` | glow / size / chime |
| `place` | key into `PLACE` | `fragments.placeOne` — a band of the island, not a coordinate |
| `note` | one line of prose | `journal`, the found notice, the sanctuary label |
| `needs` | optional gate | `fragments.available` |

`world` is not authored; it is folded in by the `BY_ID` lookup map.

`needs` accepts `{ awake, delivered, visits, found[], mastery, completion,
worldsVisited }` and is evaluated in `fragments.available()`
(`fragments.js:42-56`) — an ungated discovery is simply not placed.

`RARITY` (`discoveries.js:24-30`) carries `glow`, `size` and `chime` (0-4).
`glow` and `size` feed the shaders directly; **`chime` is currently read in
exactly one place** — `main.js:1187`, as a `>= 2` threshold to bring an audio
layer up. Nothing plays a chime.

### Where shape would have to land

Both renderers use **one geometry for all 48 memories**:

```js
const geometry = new THREE.OctahedronGeometry(0.5, 0);   // fragments.js:126
const geometry = new THREE.OctahedronGeometry(0.5, 0);   // sanctuary.js:107
```

**`fragments.js`** — the memories still out in a world. Filters to
`pending` (unfound and available), places each from `mulberry32(world.seed ^ …)`
so a memory is in the same spot on every device, and draws the lot with two
`InstancedMesh`es: the octahedron bodies and a billboard `PlaneGeometry` halo.
Two draw calls for a whole world. Per-instance variation is only:

- `aTint` — the world palette (`bloom` for the body, `mote` for the halo). Every
  memory in a world is the same colour.
- `aGlow` — `rarity.glow × pulse × (0.55 + 0.9 × near)`.
- the instance matrix — `rarity.size` for scale, a `phase`-driven tumble for
  rotation.

So rarity today changes **brightness and size and nothing else**. A mythic and a
common are the same solid.

**`sanctuary.js`** — the gallery, one slot per memory *in the game* (all 48,
found or not), laid on four arcs in two rows (`sanctuary.js:62-102`). Same
octahedron, same instanced tint/glow pair. A found slot gets
`rarity.size × foundScale` and the `bloom` colour; an unfound one gets
`S.emptySize` / `S.emptyGlow` and the dim `fractalLow` colour — the empty socket
that makes the gaps do the work. Also in the room, and not affected by shape:
the cairn and world marks (`softBoxGeometry`, one `InstancedMesh`) and the
constellation stars (planes, one more).

**`journal.js:225-244`** — the archive rows are pure text: a `j-mem-dot`
(an 8px CSS circle whose glow is `RARITY[d.rarity].glow`), the name or an em
dash, the note or "Not yet found.", and the rarity label. No emblem exists.

### The constraint that shapes the Phase 2 design

Both in-world renderers get a whole world for **two draw calls** because they
share one geometry. Giving each shape its own `InstancedMesh` would multiply
that by the size of the vocabulary. The way to keep one draw call is to put the
silhouette in the **vertex shader**, driven by a per-instance `aShape` attribute
and a small table of numeric form parameters (lobes, taper, twist, flatten,
spikiness) — and to have the 2D emblem generator read *the same* parameters, so
the SVG in the archive and the solid in the world are the same form described
once. That is the "one editable table" the brief asks for.

---

## 3. How the ambience is built, and where a world's tonality lives

`createAudio(CONFIG)` — everything synthesised, nothing fetched. `start()`
(`audio.js:40`) builds the graph once, on the first gesture, and nothing is ever
stopped afterwards; the file's governing rule is that every oscillator start or
stop is a chance for a click.

```
                                    ┌─ padGain → padFilter (lowpass A.brightness, Q 0.4) ─┐
drone: 3 osc @ root × {1, 1.5, 2}  ─┤                                                     ├→ musicBus ─┐
       sine/triangle, ±4.5c detune, │                                                     │            │
       each with a 0.035–0.085 Hz   │                                                     │            │
       LFO on its own gain          └─────────────────────────────────────────────────────┘            │
                                                                                                       ├→ master → destination
layers ×7: oscA sine + oscB triangle (+7–13c), 0.02–0.06 Hz tremolo,                                    │
           gain 0 until lit, → lowpass (brightness × 1.4) → musicBus ──────────────────────────────────┤
                                                                                                       │
noise: 4 s pink-ish buffer, JS-generated, looped with a 0.25 s seam crossfade,                          │
       → lowpass 380 Hz swept ±190 Hz by a 0.045 Hz LFO → gain 0.30 → ambienceBus ─────────────────────┘
```

- **Master** starts at 0 and `linearRampToValueAtTime` to `A.volume` over
  `A.fadeInSeconds` (8 s). `applyGain()` re-targets it with `setTargetAtTime`
  for mute and for the sleep dim (`setDim`, driven from `ui.update`).
- **Two buses** so the settings panel can weigh the tonal half (`setMusicVolume`)
  against the textural half (`setAmbienceVolume`) independently.
- **Layers** are the awakening stack. `lit` counts how many *should* sound —
  counted even before there is a context, so a world explored in silence comes
  up already full. `applyLayers()` ramps each with
  `setTargetAtTime(…, A.layerFadeSeconds)` and quietens them as they stack:
  `A.layerGain / (1 + (i + 1) × 0.35)`.
- **Tonality is exactly three numbers per world**, in `worlds.js`:

  ```js
  meadow:    audio: { root: 130.81, scale: [0, 4, 7, 11, 14], brightness: 480 }   // worlds.js:58
  harbor:    audio: { root: 110.00, scale: [0, 3, 7, 10, 12], brightness: 380 }   // worlds.js:97
  grove:     audio: { root:  98.00, scale: [0, 5, 7, 12, 17], brightness: 300 }   // worlds.js:134
  garden:    audio: { root:  87.31, scale: [0, 2, 7,  9, 14], brightness: 340 }   // worlds.js:171
  sanctuary: audio: { root: 146.83, scale: [0, 4, 7, 12, 16], brightness: 520 }   // worlds.js:252
  ```

  `setWorld(a)` (`audio.js:260`) assigns `root`/`voicing`/`A.brightness`, resets
  `lit` to 0 and calls `retune()`, which glides every layer oscillator with
  `setTargetAtTime(f, t, A.glideSeconds)`. Layer *i* takes
  `voicing[i % voicing.length]`, octave-shifted by `floor(i / voicing.length)`,
  so more layers widens the chord rather than doubling it.

### What is missing, for Phase 3

- **No stereo at all.** There is not a single `StereoPannerNode` or channel split
  anywhere; the whole graph is mono into one gain.
- **No chord drift.** The voicing is fixed for as long as you stay in a world.
  The only movement is the per-voice LFOs and the noise sweep.
- **No chimes.** `RARITY.chime` is authored but unused as sound.
- **No idle behaviour of its own** beyond `setDim`, which is the visual sleep
  fade being mirrored.
- Chimes are the one thing that must *not* follow the "start once, never stop"
  rule, so they need either a small fixed voice pool or short-lived nodes with a
  zero-start envelope and a scheduled `stop()` well after the tail.

---

## 4. How something is earned, and how the Wanderer tab shows it

### The unlock path (`archive.js`)

```js
function unlock(type, id, why) {          // archive.js:197
  const list = data.unlocks[type];        // 'cloak' | 'companion' | 'monument' | 'title'
  if (!list || list.includes(id)) return false;
  list.push(id); saveSoon();
  onUnlock?.({ type, id, why });
  return true;
}
```

Once-only by construction: the second call finds the id present and returns
false without firing the listener. Three feeders:

| feeder | trigger | guard | source of truth |
| --- | --- | --- | --- |
| `checkMastery(key)` (`archive.js:207`) | `noteAwakened`, `noteDelivered`, `record` | milestone `mastery:<key>:<at>` | `MASTERY_REWARDS` — 0.25 / 0.50 / 0.75 / 1.00 per world |
| `checkCollections()` (`archive.js:246`) | `record` | milestone `set:<id>` | `COLLECTIONS` — the five-piece set per world |
| `checkTitles()` (`archive.js:258`) | `record`, `arrive` | `data.unlocks.title` | `TITLES[].earn` against `summary()` |

`checkTitles` understands exactly four keys: `discoveries`, `rare`,
`collections`, `worldsVisited`.

### What the moment looks like today (`main.js:817-825`)

```js
archive.onUnlock = ({ type, id }) => {
  const c = type === 'title' ? title(id) : cosmetic(type, id);
  if (!c) return;
  const kind = type === 'title' ? 'new title' : … ;
  ui.showMemory(kind, c.name, c.note || '', 'dream');
};
```

`ui.showMemory` is the same queued one-line corner notice used for picking a
flower up off the ground (`ui.js:328`, queue at `ui.js:48-71`). Earning a title
and finding a common memory are told in identical voice and identical furniture.
The queue is good and should be kept — completing a set can fire a discovery, a
collection and an unlock in the same instant.

There is a second, more ceremonial channel already present and unused for this:
`ui.showBeat(lines)` / `ui.hideBeat()` (`ui.js:348-355`, `#beat` at
`index.html:127-169`) — centred serif italic, 0.85 s in / 2.0 s out, a dark text
halo rather than a panel, and already reduced-motion aware. `story.js` owns its
timing today and is the model to follow.

### The Wanderer tab (`journal.js:252-303`)

`renderWanderer()` is three calls to `pickerFor(kind, label, all)` plus a
"N more things are out there" line. Each entry is a button carrying:

- `j-pick-name` — `c.name`, or the literal string **`'not yet earned'`**
- `j-pick-note` — `c.note`, or a single space

A locked entry therefore says nothing about what it is or how to get it, has no
emblem, and shows no rarity or weight. Equipping is a click that re-renders.

### The gap Phase 4 has to close in the data

`TITLES` (`discoveries.js:488-513`) has 12 entries. Only **four** carry a
machine-readable `earn` block — `first-wanderer`, `keeper-fourth-gate`,
`dream-architect`, `finder-of-rare-things`. The other seven non-default titles
are granted only as `MASTERY_REWARDS` side effects and describe their condition
in prose (`note: 'A quarter of the meadow known.'`). `COSMETICS` entries carry no
condition at all — a cloak's `note` is flavour ("The meadow, kept.").

So a Wanderer tab that shows "how to earn" and "progress toward it" needs a
declared condition on every title and cosmetic, resolvable against the archive.
The conditions already exist in the system; they are just spread across
`MASTERY_REWARDS` and `COLLECTIONS[].reward` rather than stated on the thing
being earned.

### The public profile (`leaderboard.js:53-73`)

`createProfileService().me()` returns `{ name, title, cloak, companion, summary,
local }` — `title` is the bare id, never resolved to a name and never rendered.
The `beside` tab (`journal.js:313-346`) draws name + value rows only, so an
equipped title is invisible to the one screen that compares journeys.

---

## 5. Which files each phase touches

| phase | files |
| --- | --- |
| **1** — make it scroll | `src/input.js` (scope `stop`), `index.html` (body `touch-action`, `touch-action: pan-y` on the two scroll surfaces), `public/sw.js` (cache bump) |
| **2** — shape, emblem, identity | `src/discoveries.js` (`SHAPES` table + a `shape` on all 48 entries), new `src/shapes.js` (the vocabulary → SVG path + GLSL params), `src/journal.js` (emblem tiles), `src/fragments.js` + `src/sanctuary.js` (`aShape` attribute, vertex-shader deform), `index.html` (tile CSS), `public/sw.js` |
| **3** — richer ambience | `src/audio.js` (chord drift, stereo width, chimes), `src/main.js` (`CONFIG.audio` knobs; call the chime on a find), `src/worlds.js` (per-world timbre alongside root/scale), `public/sw.js` |
| **4** — earned titles | `src/discoveries.js` (declared `earn` on every title/cosmetic + emblems), `src/archive.js` (progress toward a condition; richer `why`), `src/ui.js` (the ceremonial reveal + its queue), `src/main.js` (route `onUnlock` to it), `src/journal.js` (`renderWanderer` as badges), `src/leaderboard.js` (title on the profile), `index.html` (reveal + badge CSS), `public/sw.js` |
| **5** — verify + ship | `README.md`, `public/sw.js`, build check |
