# Wanderer of Soft Worlds

A calm, endless bedtime wander. A small hooded figure drifts through a handful of
soft-coloured worlds grown from fractals, connected by dream-gates. Walk near
something dormant and it slowly comes alight; walk near a drifting mote of light
and it follows you home. No score, no timers, no fail state, no combat — just
somewhere quiet to be for a few minutes before sleep.

Nothing has to be done. If you only want to walk about and wake nothing, that is
a complete way to play it.

- **Drag anywhere** — a floating joystick appears under your finger. Push it in
  the direction you want to go; the figure turns toward it and drifts that way.
  How hard you push asks for a *direction*, not a speed — a frantic shove is
  worth no more than a firm one.
- **Tap** — a gentle nudge toward wherever you tapped, which fades on its own.
- **Keyboard** — `W`/`A`/`S`/`D` or the arrow keys.

Push a direction and you go that direction. The steering basis is frozen the
moment your finger lands and held for the whole gesture, so "up" means the same
thing at the end of a drag as it did at the start, however far the camera has
swung round behind the turn. There is no balancing act and nothing to correct.

There are two schemes, in `CONFIG.movement.scheme`, switchable live:

| scheme | what it does |
|---|---|
| `stable-relative` *(default)* | push a direction on screen and go that way. The basis is the game's own yaw, never the live camera, so the view swinging behind a turn cannot move it. |
| `heading` | tank steering. Stick x asks for a gentle turn off the current facing, stick y goes. Nothing is camera-relative at all, which makes it the most predictable of the two for one thumb and no attention. Pulling back does not reverse — it stops asking, and the coast does the rest. |

```js
__night.scheme('heading')        // try the other one, immediately
```

Everything else happens by being near it:

- **Dormant structures** bloom when you come within a few metres, over about five
  seconds, and each one adds a layer to the ambient pad — so a world you have
  explored is visibly and audibly fuller than one you have just arrived in.
  Waking is permanent for the visit.
- **Light-motes** drift over the ground and lean toward you as you approach.
  Gathered ones trail behind you in a slow ring, then let go and stream into the
  world's monument, which brightens and stands a little taller as they arrive.
- **Dream-gates** stand out toward the rim of every world, dim from the first
  moment and brightening as the world wakes *or* as motes reach the monument —
  whichever you were doing was already the way onward. A soft pillar of light
  stands over an opening gate, so the horizon itself tells you where; the
  companion leans that way too. Once it would admit you, a passing line says
  so, and standing near it offers **step through** — walk in or tap, either
  works. The screen fades up into soft light, the next world is built while
  nothing can be seen, and it fades back down. Worlds recur, so it never ends.

### The Dream Archive

Wandering now leaves something behind. Each world holds twelve **memories** —
named, written, and placed by that world's own seed, so a thing is in the same
spot on every visit and every device. Nothing marks them: a memory notices you
from twenty metres out and brightens, the companion goes to look, and the
wanderer's eyes find it a moment before you do. Walk up to one and it comes to
you. Taken memories are never placed again, so a world you have picked clean
holds nothing and a world you half-know holds exactly what you missed.

Forty-eight memories exist, twelve in each world: five that make up its set,
two rare ones out at the edges, two more scattered about, and three that will
not appear until something is true. The journal says only that *something has
to be true first*; the conditions are
enough of a world awake, enough motes delivered, an nth visit, another memory
found first, this world known to a given depth, a fraction of everything found,
or every world walked in. The last three are the long tail — they are what puts
something in a world you finished months ago that was not there when you left.

Finding them completes **sets**, deepens **mastery** of each world, and unlocks
cloaks, companions, titles and monument forms. Mastery is not an XP bar: it is
computed from structures woken, memories found and motes delivered, and the
monument in each world visibly stands further along the better you know it.

Everything opens from **the dream archive** in the settings: the journey
entire, the four worlds, every memory there is, the wanderer themself, and a
quiet **beside** view for comparing journeys. Nothing there is ranked, nothing
expires, and nothing is lost by staying away.

### Your sanctuary

From the archive you can **visit your sanctuary** — a small place that is only
yours. Nothing there sleeps and nothing is scored, and its gate takes you back
to exactly where you were.

It is built rather than grown: a wide level court and a few shallow terraces
stepping outward, a palette of warm unsaturated stone built around none of the
four wild hues, thinner fog than anywhere else so it is legible all the way to
the rim, and twelve near-identical standing shapes that read as a colonnade
rather than a wood. It is a home, not a biome.

Four things stand in it, and between them they answer four different questions
you have on coming home:

| | |
|---|---|
| **the gallery** | *what have I found?* — one slot per memory in the game, in four arcs of twelve. Found ones burn and turn; unfound ones stay as dim empty sockets. The gaps are the half that does the work. Everything in it notices you coming, and **walking up to one names it** — a memory of yours gives its name and its line, an empty place says only which world it belongs to. |
| **the cairn** | *how far have I come?* — a spiral of stones rising around the monument, one for every memory kept, coloured by how rare it was. |
| **the world marks** | *where have I been?* — four standing stones, sunk to a stub until you have walked there, then rising and brightening as the place comes to be known. How many are lit is your count of worlds visited. |
| **the constellations** | *how much of each place is mine?* — a cluster of stars over each world's arc, of which the fraction alight is that world's completion. |

### The dream telling itself

There is no tutorial and there is not going to be one. Nothing stops you, waits
for a button, or explains a mechanic. Instead a handful of short passages
arrive low on the screen at the moment they would mean something, say one true
thing, and go away.

Each fires **once, ever** — across sessions, devices and months away — on first
launch, your first mote, your first delivery, your first awakening, your first
memory, the first time a gate opens, your first journey through one, your first
time home, and each of the five places the first time you arrive in it. Each is
one or two lines, and each carries the framing while quietly teaching the thing
you are about to need. The first-gate passage is what tells you both what
opened it and that you travel by walking in.

They never block and never wait to be dismissed. Moving puts one away, but not
until it has actually been on screen long enough to read: the time is worked
out from how many words the passage has, so a two-line beat gets about thirteen
seconds before movement will take it, and a few more if you stand still. Tune it
with `story.readBase` and `story.readPerWord`.

There is also a **whisper**: if you have made no progress of any kind for a
good while, one soft line suggests the thing you are nearest to being able to
do. Every number governing it is a reason not to speak — no sooner than 34s
without progress, never within 20s of arriving somewhere, never within 95s of
the last one, at most three in a visit, and never the same line twice running.
A game about not being pressured cannot have a hint system that pesters.

All the writing is in two tables at the top of [`src/story.js`](src/story.js),
`BEATS` and `WHISPERS`. Nothing below them reads what any of the copy says, so
the tone can be rewritten without touching a line of logic.

### Dream variants

Once you know a world well it can be found in other moods. At half mastery one
opens, at 85% another:

| | | |
|---|---|---|
| **the waking meadow** | Golden Dawn | Starfall |
| **the quiet harbour** | Slack Water | Lantern Tide |
| **the lantern grove** | Sleeping Bloom | Clearwater |
| **the star garden** | Emberfall | The Quiet |

A variant overrides palette, fog, stars and fireflies and *nothing else*. The
seed is untouched, so the ground rolls the same way, the structures stand where
they always stood, and any memory you have not found is exactly where it was.
Only the light changes — which is most of what a world is here, and makes a
variant nearly free: no new geometry and no fifth world to author. Choose one
from the **worlds** tab of the archive.

The wanderer has two soft lights in their hood that blink and glance at
whatever the world has just offered, breathe and shift their weight when
standing still, and carry a chest light that flares when a mote is gathered and
breathes when a gate stands open. A small companion light keeps them company,
darts off to look at anything that wakes, and drifts gateward.

Each world is a floating island: rolling in the middle, a soft rim near the edge
that turns walking outward into walking uphill, and then a drop into weather.
There is no wall — push out to the rim and you can stand on it and look over;
let go and the world leans you gently back toward its middle.

After about ten minutes without a touch the whole thing dims itself to black so
it won't glow all night. Any tap brings it back.

It opens on a title over the live world — **begin wandering** is the tap that
also lets the browser start the audio. A small gear in the corner opens the
settings: sound, music and ambience volume, reduced motion, **pace** (stroll,
wander or drift), graphics quality, and a way to begin the journey again. The
journey itself — which world you are in, what you have woken there, how full
the monument is — is written to localStorage as you go, so a refresh or a phone
quietly killing the tab overnight puts you back where you drifted off.

### Everything there is to find

Forty-eight memories, twelve per world: five that make up the world's set, two
rare ones out at the edges, two more scattered about, and three that will not
appear until something is true. `needs` is what has to be true — until then the
journal shows a memory only as a shape.

**the waking meadow** (`meadow`)

| memory | rarity | where | needs |
|---|---|---|---|
| Petal Memory | common | grove | — |
| Dawn Thread | common | wander | — |
| Sleeping Seed | common | wander | — |
| Whispering Leaf | uncommon | grove | — |
| Bloom Fragment | uncommon | monument | — |
| The First Flower | rare | rim | — |
| The Sleeping Crown | rare | fog | — |
| The Meadow Dreaming | dream | monument | `awake: 12` |
| Grass Hour | common | wander | — |
| Kept Morning | uncommon | rim | — |
| The Long Field | rare | fog | `visits: 3` |
| What the Meadow Keeps | mythic | monument | `completion: 0.55` |

**the quiet harbour** (`harbor`)

| memory | rarity | where | needs |
|---|---|---|---|
| Tide Memory | common | water | — |
| Moon Shell | common | water | — |
| Blue Thread | common | wander | — |
| Distant Bell | uncommon | grove | — |
| Harbour Echo | uncommon | monument | — |
| The Last Lantern | rare | rim | — |
| The Quiet Name | rare | fog | — |
| The Tide Turning | dream | water | `delivered: 10` |
| Rope Memory | common | wander | — |
| Low Water | uncommon | water | — |
| The Far Bell | rare | fog | `visits: 3` |
| What the Harbour Keeps | mythic | water | `mastery: 0.75` |

**the lantern grove** (`grove`)

| memory | rarity | where | needs |
|---|---|---|---|
| Coral Memory | common | grove | — |
| Deep Glow | common | wander | — |
| Lantern Seed | common | grove | — |
| Lost Spark | uncommon | fog | — |
| Drift Fragment | uncommon | monument | — |
| The Breathing Reef | rare | rim | — |
| The Drowned Gate | rare | gate | — |
| The Grove Listening | mythic | fog | `awake: 16, visits: 2` |
| Slow Current | common | wander | — |
| Held Breath | uncommon | grove | — |
| The Unlit Lantern | rare | rim | `visits: 3` |
| What the Grove Keeps | mythic | gate | `completion: 0.70` |

**the star garden** (`garden`)

| memory | rarity | where | needs |
|---|---|---|---|
| Star Shard | common | grove | — |
| Crystal Memory | common | wander | — |
| Warm Star | common | monument | — |
| Falling Light | uncommon | wander | — |
| Constellation Thread | uncommon | rim | — |
| The Garden Keeper | rare | fog | — |
| The Unlit Star | rare | rim | — |
| The Fourth Quiet | mythic | monument | `awake: 14, found: ['garden-keeper']` |
| Cold Thread | common | wander | — |
| Quiet Orbit | uncommon | grove | — |
| The Long Night | rare | fog | `visits: 3` |
| What the Garden Keeps | mythic | rim | `worldsVisited: 4` |

### The worlds

| | palette | grows | monument | sky |
|---|---|---|---|---|
| **the waking meadow** | dusty rose and soft teal | blossoming dream-trees | a crown of arches | dawn, a few stars |
| **the quiet harbour** | muted indigo and lavender | tall pale stalks | a stepped spire | twilight, pools of water |
| **the lantern grove** | deep teal, heavy fog | bioluminescent coral | a Menger sponge | underwater |
| **the star garden** | violet and warm cream | faceted crystals | a Menger sponge | full starfield |

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # → dist/
npm run preview    # serve the production build locally
```

## Deploy to Vercel

The project is zero-config: Vercel detects Vite, runs `npm run build`, and serves
`dist/`. There is no `vercel.json` and none is needed.

**From a Git repo (recommended)**

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In the Vercel dashboard: **Add New → Project**, import the repo.
3. Framework Preset should already read **Vite**. Leave build command
   (`npm run build`) and output directory (`dist`) at their defaults.
4. **Deploy.** Pushes to the default branch redeploy automatically.

**From the CLI**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

### After the first deploy

The Open Graph tags use root-relative URLs (`/og-image.jpg`), which every major
scraper resolves against the page. If you want them fully absolute — some older
scrapers insist — swap the `og:image` and `twitter:image` values in `index.html`
for `https://your-domain.vercel.app/og-image.jpg`.

Bump `VERSION` in [`public/sw.js`](public/sw.js) whenever you change something a
returning visitor must see immediately; it drops the old cache wholesale.

## Tweaking it

Two files. [`src/main.js`](src/main.js) holds the `CONFIG` object at the top —
everything that is the same wherever you are: the fallback palette, exposure,
bloom, kaleidoscope, the wanderer, camera framing, movement, mote behaviour,
awakening, gates, sleep timings, audio, and the quality tiers.
[`src/worlds.js`](src/worlds.js) holds the worlds themselves, one object each.

`CONFIG` is read live every frame, so you can experiment from the browser console
without reloading:

```js
__night.CONFIG.movement.maxSpeed = 4        // walk faster
__night.CONFIG.kaleidoscope.amount = 0.45   // much more symmetry (and much less calm)
__night.CONFIG.awaken.radius = 20           // wake things from further away
__night.CONFIG.motes.gatherRadius = 10      // sweep motes up as you pass
__night.CONFIG.camera.distance = 10         // stand further back
__night.go('grove')                         // jump to a world by key
__night.wakeAll()                           // wake everything at once
__night.mood(1)                             // hold the far end of the colour cycle
__night.progress                            // awake / gate / motes / delivered / layers
__night.tier                                // which quality tier is running
__night.downgrade()                         // step down a tier by hand
__night.setTier('high')                     // jump to a tier, as the settings would
__night.perf                                // fps, draw calls, triangles, instances
__night.journey                             // what the save file currently remembers
__night.settings                            // what the settings panel currently holds
__night.CONFIG.debug.freeTravel = true      // open every gate at once
__night.summary                             // the whole journey, in numbers
__night.archive.mastery('meadow')           // how well one world is known
__night.toFragment()                        // walk to the nearest unfound memory
__night.journal.show('memories')            // open the archive at a tab
__night.home()                              // go to the sanctuary, or come back
__night.archive.variants('meadow')          // its moods, and which are unlocked
__night.archive.setVariant('meadow','golden')
__night.analytics.recent                    // what has been emitted this session
__night.CONFIG.movement.paceScale = 1.8     // faster than any pace preset
__night.companion                           // the little light, or null on saver
__night.scheme('heading')                   // swap steering scheme live
__night.say('first-gate-open')              // read a story passage back
__night.story.saying                        // what is on screen, if anything
__night.ambience                            // drift / silhouette / curtain counts
__night.display                             // the sanctuary's gallery, cairn and marks
__night.CONFIG.story.whispers = false       // keep the beats, drop the nudging
__night.CONFIG.render.adaptStrength = 0     // switch off the adaptive exposure
__night.CONFIG.ground.lightClamp = 1e6      // ...and the ground's light ceiling
```

### Steering, story and light

The knobs added in this pass, and what each is for:

| knob | what it does |
|---|---|
| `movement.scheme` | `stable-relative` or `heading` — see **Controls** above. |
| `movement.basisEase` / `basisEaseHeld` | how fast the steering basis re-aligns with the wanderer when idle, and while a finger is down. The second wants to stay tiny: it exists only so a very long drag cannot end up steering against a basis from minutes ago. |
| `movement.angleHysteresis` | radians of thumb wobble that change nothing. A near-vertical push goes straight. |
| `movement.turnGain` / `turnResponse` | low gain with high response is what eases: the rate asked for is small, and the turn tracks it closely enough not to overshoot and hunt. |
| `movement.headingTurnArc` / `headingTurnDrive` | the `heading` scheme only: how far off the facing a full stick asks for, and what a turn with no forward is worth. |
| `camera.rotateFollow` / `maxSwingLag` | how quickly the view swings *around* the wanderer, as opposed to how quickly it catches up when they walk away. Kept well under `camera.follow`; the lag is capped so a spin cannot put the figure at the edge of the frame. |
| `story.readBase` / `readPerWord` / `lingerSeconds` / `gapSeconds` | how long a passage stays, worked out from its own length: a base, plus time per word, plus a little longer if nobody moves. |
| `sanctuary.nearRadius` / `readRadius` | how close before a memory notices you, and how close before it says what it is. |
| `sanctuary.nearRise` / `nearSwell` / `nearGlow` | how much it lifts, grows and brightens as you come up to it. |
| `motes.nearFadeFrom` / `nearFadeTo` / `nearFadeFloor` | how much light a mote's halo gives up near the lens. The gathered ring orbits a few metres from the camera where a halo card covers a huge share of the screen; distant motes are untouched. |
| `story.whispers` and the four `whisper*` numbers | every restraint on the idle nudge. Set `whispers: false` to keep the beats and drop the nudging entirely. |
| `render.adaptFrom` / `adaptStrength` / `adaptFloor` / `adaptDown` / `adaptUp` | the adaptive exposure. It closes faster than it opens, the way an eye does, and `adaptFloor` stays near 1 — this must never be something you can catch happening. |
| `ground.lightClamp` | what all six ground lights together may add up to, at most. Soft-clamped rather than cut, so a quiet world is untouched and a blazing one bends over toward this instead of running away to white. |
| `motes.crowdRadius` / `crowdFree` / `crowdSoften` | how much light gathered motes give up as more of them crowd the player. `crowdFree` of them cost nothing at all. |
| `sanctuary.crowdFree` / `crowdSoften` | the same relief for the gallery, where a finished world's arc is a dozen lit haloes side by side. |
| `bloom.threshold` | raised to 0.88 so only the brightest cores bloom rather than every soft edge in the frame. |
| `ambience.*` | the drift, the silhouettes past the rim, and the sky curtains. Counts come from the tier; everything here is shape and opacity. |

### Travel

A gate's openness is whichever of two things you have been doing more of:

```
open ← max( awakeFraction / awaken.gateAt,
            delivered / (motes.monumentTarget * gate.gatherAt) )
```

With the defaults that is a fifth of the world's structures woken, *or* eleven
motes delivered — and it admits you at `gate.enterAt` (0.45), so in practice a
handful of either. `gate.enterRadius` is deliberately generous and the **step
through** prompt appears within `gate.promptRadius`, because travel must never
depend on threading an exact radius from a moving thumb. Set
`CONFIG.debug.freeTravel` to open everything at once.

### Per-world tuning

Each entry in `WORLDS` is data and nothing else — adding a fifth world is another
object in that array. The fields, and what each one is actually for:

| field | what it does |
|---|---|
| `seed` | fixes the ground, the scatter and the gate's position. Same seed, same world, every visit. |
| `palette` | overrides `CONFIG.palette` key by key. `bloom` is what an awake thing glows; `mote`, the motes; `fractalLow`/`fractalHigh` the trunk-to-tip gradient; `cloak*` re-tints the wanderer. |
| `fog.density` | how quickly distance swallows things. Under ~0.008 you can see the edge of the world; over ~0.02 it is a fog bank. |
| `ground.radius` | how big the island is. `amp`/`freq` are how much it rolls; `plazaRadius` flattens the middle for the monument; `rim` is the lip near the edge; `drop` is how far it falls past it. |
| `species` | `tree`, `stalk`, `coral` or `crystal`. Branch angles and shrink rates live in `SPECIES` in [`src/fractals.js`](src/fractals.js); `tipScale` there is the single number that decides whether a structure reads as a tree in leaf or a tree in winter. |
| `structures` | `count` before the tier scales it, `min`/`maxHeight`, `radius` for trunk thickness, `sway`, and `spacing` as a minimum distance apart. |
| `monument` | `type` is `menger`, `spire` or `ring`; `size` is roughly its footprint. |
| `clouds` | drifting sheets: `height`, `spacing` between layers, `scale` and `drift` for the noise, `amount` for opacity. Layer count comes from the tier. |
| `water` | `null`, or `{ level, size }`. Giving a `size` anchors the lake at the world's centre; without one it becomes an endless sea riding under the camera, which draws a hard line across the horizon of an island that ends in fog. |
| `stars` | 0..1, how much of the starfield this sky admits. |
| `fireflies` | 0..1.4, how thick the ambient drift is. |
| `audio` | `root` in Hz, `scale` as semitone offsets, `brightness` as a lowpass cutoff. Layers walk up the scale and wrap an octave higher, so more layers is a wider chord rather than the same notes doubled. |

### Quality tiers

The scene picks a tier from the device's GPU string, core count and memory, then
watches real frame times and steps down one if the guess was optimistic. It never
steps back up — oscillating between tiers is far more noticeable than sitting one
notch below perfect. `saver` is the floor, meant for a phone that would rather
stay cool than look its best, and is what the software rasterisers are given.

| | high | medium | low | saver |
|---|---|---|---|---|
| Fractal recursion depth | 5 | 4 | 3 | 3 |
| Instance budget per world | 7000 | 3600 | 1400 | 900 |
| Structures | 100% | 80% | 60% | 45% |
| Menger depth | 2 (400 blocks) | 2 | 1 (20) | 1 |
| Ground resolution | 128² | 96² | 64² | 48² |
| Cloud layers | 3 | 2 | 1 | 0 |
| Kaleidoscope | yes | yes | off | off |
| Bloom | yes | yes | off | off |
| Max motes | 48 | 34 | 20 | 14 |
| Wanderer segments / shadow | 22 / yes | 16 / yes | 11 / no | 9 / no |
| Companion | yes | yes | yes | no |
| Drifting pollen | 260 | 170 | 90 | off |
| Silhouettes past the rim | 22 | 16 | 11 | 6 |
| Sky curtains | 3 | 2 | 1 | off |
| Sanctuary constellations | 36 stars | 28 | 20 | off |
| Water reflections | 512px | 256px | off (shaded plane) | off |
| Pixel ratio cap | 2 | 1.75 | 1.2 | 1.0 |

Measured on one machine, for a sense of the gradient — `__night.perf` will tell
you the same about yours:

| | instances | draw calls | triangles |
|---|---|---|---|
| high | 7509 | 37 | 213558 |
| medium | 3178 | 36 | 87212 |
| low | 976 | 20 | 26798 |
| saver | 794 | 19 | 22600 |

Append `?tier=high`, `?tier=medium` or `?tier=low` to force one, or pick a tier
in the settings panel — either way it is pinned, and the frame watcher won't
override a deliberate choice. The settings choice is remembered between visits;
`auto` hands control back to the guess.

A downgrade rebuilds the world in place: the fractals thin out, the ground
coarsens, and the motes in flight are lost. It costs a fraction of a second, in
exchange for a stutter that would otherwise never go away.

## How it's put together

```
index.html          meta tags, the small DOM overlay, mounts /src/main.js
src/main.js         CONFIG, bootstrap, world loading, the frame loop
src/worlds.js       the worlds as data, and building one
src/fractals.js     bounded recursion, instancing, fbm, cloud sheets
src/terrain.js      the ground heightfield, its shader, and heightAt()
src/character.js    the wanderer: one lathe, a swaying hem, eyes, idle life
src/companion.js    the small light that keeps them company
src/discoveries.js  what there is to find, and what finding it earns (all data)
src/archive.js      the Dream Archive: found, mastery, unlocks, save migration
src/fragments.js    the memories as objects in the ground, instanced
src/journal.js      the archive as a page (DOM, only renders when open)
src/sanctuary.js    the memories standing up, in the place that is yours
src/leaderboard.js  profile + comparison behind a service interface, local mock
src/analytics.js    event names and a ring buffer; no provider, no network
src/rig.js          where the wanderer is, and the camera trailing them
src/input.js        floating joystick, tap-to-move, keyboard
src/motes.js        one InstancedMesh for every light-mote
src/gate.js         a dream-gate: a ring and a veil, driven by one number
src/post.js         EffectComposer: render → kaleidoscope → bloom → tone map → vignette
src/sky.js          gradient dome and the parallax star shells
src/water.js        lakes (Water addon, or a shaded plane on low)
src/fireflies.js    points animated entirely in the vertex shader
src/haze.js         horizon mist band
src/audio.js        drone, noise wash, and the layers that come up as you explore
src/ui.js           title, hints, settings panel, gate fade, sleep fade, wake lock
src/save.js         settings + journey persistence, best-effort localStorage
src/quality.js      tier detection + the frame-time watcher
src/textures.js     the water normal map and the seeded PRNG
public/             manifest, icons, OG image, service worker
```

A few decisions worth knowing about if you go editing:

- **Nothing is loaded from disk.** Every mesh, texture and sound is generated at
  runtime. That is what makes the whole thing work offline and keeps the deploy
  to code alone.
- **Fractals are evaluated once and then only moved.** A fractal is expensive to
  evaluate and cheap to have, so each world bakes its recursion into instance
  transforms at build time; a whole forest is one draw call and the per-frame
  cost is a uniform. Depth is capped everywhere it appears, because a branching
  structure is 3^depth instances and that exponent is the only thing between
  this and a phone that gets hot.
- **There is no raymarched fractal.** It was on the table as a distant backdrop
  rendered at reduced resolution on the high tier only. Instanced geometry got
  close enough to the look that a second, tier-gated rendering path would have
  been cost without a difference — so the monuments are instanced like
  everything else.
- **Structures stay contiguous in the instance buffers.** Each one remembers its
  own slice, so waking a single structure writes a range of an attribute rather
  than touching the scene graph.
- **Waking lights the tips and only warms the body.** Lighting a whole structure
  evenly blows the frame out to white; what reads as *it came alive* is the ends
  glowing while the body underneath stays a body.
- **The kaleidoscope is masked out of the middle of the screen.** Folding the
  whole frame is genuinely unpleasant — the ground swims under you and there is
  nothing fixed left to hold on to. The periphery dreams; the thing you are
  steering stays exactly where you put it. It also sits *before* the bloom, so
  what it folds is light rather than an already-graded image.
- **Tone mapping happens once, in `OutputPass`.** Materials render linear HDR into
  half-float targets, so an awake structure can legitimately be brighter than
  white and drive the bloom threshold itself. The sleep fade is therefore a
  single number: `renderer.toneMappingExposure`.
- **Movement is capped and damped, not scaled.** Input asks for a direction and a
  0..1 strength; the rig decides what that is worth, and its ceilings mean a
  hurried gesture cannot make the experience hurried. Steering is by heading
  rather than by rudder, so a shove of the stick can never slide the figure
  sideways.
- **The wanderer has no joints.** A walk cycle at this scale is either expensive
  or bad, and a figure that glides reads as serene where a figure that walks
  badly reads as broken. The movement is sold by a slow bob, a lean into turns,
  and a hem that sways on a sine field and trails behind the direction of travel.
- **The robe is shaded like clay.** The palette colour is the answer and the sky
  only brightens it — multiplying a dark robe by a dark sky lands two dark
  colours on top of each other and leaves a black cut-out.
- **The ground is one heightfield, and one function defines it.** `heightAt()`
  both displaces the mesh and answers where the wanderer's feet are, so what you
  walk on is exactly what you see. Normals come from central differences on the
  same function rather than from the triangles.
- **The terrain object survives a world change.** `build()` swaps its insides, so
  the rig holding a reference to it keeps working straight through a transition.
- **Motes lean toward you well before they can be gathered.** Without it a mote
  is a four-metre target in a hundred-and-twenty-metre world and you only ever
  collect one by accident.
- **Motes are additively blended and pooled.** Instances inside one
  `InstancedMesh` can't be depth-sorted against each other, and additive blending
  is order-independent — which is also the right look for a light source.
  Capacity is fixed at construction and slots are recycled, so there is no
  memory growth and nothing to collect mid-flight.
- **Audio layers are built once and retuned, never created and destroyed.** Every
  oscillator start and stop is a chance for a click, and a click is the one thing
  that could wake someone who is nearly asleep. The layer count is also tracked
  whether or not there is an audio context yet: the first structures are usually
  woken before the first touch, so a world explored in silence comes up already
  full when sound is finally allowed to start.
- **Gates keep a clearing.** A gate with a dream-tree grown through it is a gate
  you cannot see.

## Browser support

Needs WebGL 2 (everything current). Falls back to a short message if it's
unavailable. Sound waits for your first touch, because browsers block audio
before a gesture. The Wake Lock API keeps the screen on where it exists and is
skipped silently where it doesn't.

`prefers-reduced-motion` is respected throughout: the camera bob is cut to a
fraction, everything that drifts slows down, the hem and the clouds move less,
and the kaleidoscope is halved and stops turning.
