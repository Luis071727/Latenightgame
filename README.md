# Night Lanterns

A calm, endless bedtime scene, seen first person from the waterline. Tap a dark
lake to release a glowing paper lantern and watch it drift up into the stars.
No score, no goals, no fail state, no timers — just something quiet to hold for
a few minutes before sleep.

- **Tap** — release a lantern.
- **Hold** — release a larger, brighter one that climbs more slowly.
- **One-finger drag** — a soft breeze that nudges nearby lanterns sideways.
- **Two-finger drag** — drift. Hold the two fingers away from where they started
  and you keep gliding, like leaning on an oar; let go and you coast to a stop.
  Sideways steers, up and down glides.
- **Keyboard** — `W`/`A`/`S`/`D` or the arrow keys do the same on a laptop.

The lake has islands on it, and you can land on them. Drift up to a beach and
walk out of the water onto sand — the ground rises under you, the gliding turns
into walking, and lanterns released ashore sit on the sand and light it. Lanterns
stay where you left them, so you can leave a trail behind you and come back to it.

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
| Terrain detail | ~53k tris | ~25k | ~14k |

Append `?tier=high`, `?tier=medium` or `?tier=low` to the URL to force one. A
forced tier is pinned — the frame watcher won't override a deliberate choice.

Terrain resolution is fixed when the scene starts, so an automatic downgrade
mid-session sheds the reflection pass and bloom but keeps the ground it has
already built. Reload to rebuild it coarser.

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
src/terrain.js      island heightfields, the sand shader, and heightAt()
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
- **The eye sits at the waterline.** `camera.height` is 1.6 — head height for
  someone sitting on a low jetty. It is the single number that decides whether
  the scene reads as first person or as a drone shot; much above 2 and you are
  looking down on the lake. `camera.lookAtRise` is relative to the eye, so
  changing the height moves the whole view instead of re-pitching it.
- **Each island is its own mesh, deliberately.** Merging the archipelago into
  one draw call also merges it into one bounding volume, so the whole terrain
  gets submitted every frame even when most of it is behind you — and the
  water's reflection pass draws it a second time. Thirteen draw calls cost far
  less than the vertices the frustum can reject: measured on the high tier,
  a frame facing an island draws about 39k of the 53k triangles available.
- **The dunes are coarse geometry on purpose.** Ripples and grain live in the
  fragment shader, so the mesh only has to carry the large forms. Halving the
  vertex density is invisible on the beach and halves what the reflection pass
  has to redraw.
- **The islands are heightfields, and one function defines them.** `heightAt()`
  both displaces the mesh vertices and answers where the camera's feet are, so
  what you walk on is exactly what you see — there is no second collision
  approximation to drift out of sync with the art. Normals come from central
  differences on the same function rather than from the triangles, which is
  exact and cannot seam where islands are merged together.
- **Sand is shaded, not textured.** Ripples are an analytic slope, grain is a
  finite difference on noise, and both perturb the normal rather than tinting
  the colour — sand catches light, it isn't speckled with dark spots. The grain
  fades out with distance: left on, it aliases into blotches that read as
  gravel. The nearest few lanterns are fed in as real point lights, which is
  what makes it look like a surface at all; lit only by the sky it is a flat
  grey shape.
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
