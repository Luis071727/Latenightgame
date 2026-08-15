# Night Lanterns

A calm, endless bedtime scene. Tap a dark lake to release a glowing paper lantern
and watch it drift up into the stars. No score, no goals, no fail state, no timers —
just something quiet to hold for a few minutes before sleep.

- **Tap** — release a lantern.
- **Hold** — release a larger, brighter one that climbs more slowly.
- **One-finger drag** — a soft breeze that nudges nearby lanterns sideways.
- **Two-finger drag** — drift. Hold the two fingers away from where they started
  and you keep gliding, like leaning on an oar; let go and you coast to a stop.
  Sideways steers, up and down glides.
- **Keyboard** — `W`/`A`/`S`/`D` or the arrow keys do the same on a laptop.

The lake has islands on it — low wooded silhouettes scattered from just over the
horizon out to a few minutes' drift away. Lanterns stay where you released them,
so you can leave a trail of them behind you and come back to it.

Everything decays back to stillness on its own. After about ten minutes without a
touch the scene dims itself to black so it won't glow all night; any tap brings it back.

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

## Tweaking it

Everything worth changing lives in the `CONFIG` object at the top of
[`src/main.js`](src/main.js): palette, exposure, bloom, lantern speed and size,
star count, breeze strength, camera framing, sleep timings, audio, and the
quality tiers.

`CONFIG` is read live every frame, so you can also experiment from the browser
console without reloading:

```js
__night.CONFIG.lanterns.riseSpeed = 1.2   // lanterns climb faster
__night.CONFIG.stars.brightness = 0.9     // brighter sky
__night.CONFIG.movement.maxSpeed = 6      // drift across the lake faster
__night.CONFIG.water.reflectionSmear = 0.04   // longer reflections
__night.tier                              // which quality tier is running
__night.downgrade()                       // step down a tier by hand
__night.rig.state                         // position and heading on the lake
```

### Quality tiers

The scene picks `high`, `medium` or `low` from the device's GPU string, core
count and memory, then watches real frame times and steps down one tier if the
guess was optimistic. It never steps back up — oscillating between tiers is far
more noticeable than sitting one notch below perfect.

| | high | medium | low |
|---|---|---|---|
| Water reflections | 512px | 256px | off (shaded plane) |
| Bloom | yes | yes | off |
| Max lanterns | 40 | 30 | 20 |
| Star count | 100% | 70% | 45% |
| Pixel ratio cap | 2 | 1.75 | 1.25 |

Append `?tier=high`, `?tier=medium` or `?tier=low` to the URL to force one. A
forced tier is pinned — the frame watcher won't override a deliberate choice.

## How it's put together

```
index.html          meta tags, the small DOM overlay, mounts /src/main.js
src/main.js         CONFIG, bootstrap, the frame loop
src/quality.js      tier detection + the frame-time watcher
src/post.js         EffectComposer: render → bloom → tone map → vignette + dither
src/sky.js          gradient dome and the parallax star shells
src/water.js        the lake (Water addon, or a shaded plane on low)
src/lanterns.js     one InstancedMesh for every lantern
src/fireflies.js    points animated entirely in the vertex shader
src/haze.js         horizon mist band
src/islands.js      the archipelago, merged into one draw call
src/rig.js          where you are on the lake and which way you face
src/holdglow.js     the pool of light under a held finger
src/input.js        tap / hold / drag
src/audio.js        synthesised pad and water wash
src/ui.js           hint, mute, sleep fade, wake lock
public/             manifest, icons, OG image, service worker
```

A few decisions worth knowing about if you go editing:

- **Nothing is loaded from disk.** The water normal map, the icons' glow, and all
  the audio are generated at runtime. That is what makes the scene work offline
  and keeps the deploy to code alone.
- **Tone mapping happens once, in `OutputPass`.** Materials render linear HDR into
  half-float targets, so lanterns can legitimately be brighter than white and
  drive the bloom threshold themselves. The sleep fade is therefore a single
  number: `renderer.toneMappingExposure`.
- **Lanterns are additively blended.** Instances inside one `InstancedMesh` can't
  be depth-sorted against each other, and additive blending is order-independent —
  which is also the right look for a light source on a near-black lake.
- **The lantern's base is its brightest part.** The flame sits low, and the
  reflection camera under the lake sees nothing but the underside.
- **Instances are pooled, never allocated.** Capacity is fixed at construction and
  slots are recycled, so there is no memory growth and nothing to collect mid-flight.
- **Reflections are smeared, not sampled once.** The stock `Water` addon takes a
  single reflection tap and offsets it, which mirrors a lantern as a crisp
  displaced copy of itself — reflections end up looking like debris. Real water
  scatters a reflection along the view direction, so the shader is patched to walk
  several taps up and down the mirror texture. The taps are evenly spaced on
  purpose: randomised offsets turn a star, one or two pixels across, into speckle.
- **The sky rides with you.** The dome and both star shells follow the camera, so
  crossing the lake doesn't swing the constellations overhead. Fireflies wrap
  around you instead, and lanterns are recycled by distance from the camera
  rather than by absolute position.

## Browser support

Needs WebGL 2 (everything current). Falls back to a short message if it's
unavailable. Sound waits for your first touch, because browsers block audio
before a gesture. The Wake Lock API keeps the screen on where it exists and is
skipped silently where it doesn't. `prefers-reduced-motion` cuts the camera
movement and slows the drift.
