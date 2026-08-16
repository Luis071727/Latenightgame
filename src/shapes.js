/**
 * The shape vocabulary.
 *
 * Every memory in the game has a `shape`, and a shape is one row of numbers in
 * the table below. Those same numbers become two things:
 *
 *   in the archive   a line-drawn emblem, generated as inline SVG, crisp at any
 *                    size and costing nothing to ship
 *
 *   in the world     the silhouette of the solid the memory actually is, by
 *                    deforming a shared sphere in the vertex shader
 *
 * One description, two renderers. Add a row here and both of them know about it
 * without a line of render code changing — which is the whole point of putting
 * it in a table rather than in a switch statement in two files.
 *
 * ── how a form is described ────────────────────────────────────────────────
 *
 * A superformula pair, in the spherical product. It is the smallest set of
 * numbers that will give you petals, shells, seeds, bells and stars from the
 * same four lines of arithmetic:
 *
 *   lon  [m, n1, n2, n3]   the cross-section, looking down the axis. `m` is how
 *                          many lobes go round; low n1 makes them sharp points,
 *                          high n1 rounds them off to a smooth ring.
 *   lat  [m, n1, n2, n3]   the profile, from the bottom pole to the top. `m: 0`
 *                          is a plain round profile, i.e. a ball.
 *   taper                  positive narrows the top and widens the base is
 *                          negative — the one asymmetry the superformula cannot
 *                          express on its own, and the difference between a
 *                          seed and a bell.
 *   twist                  radians the lobing turns through between the poles,
 *                          which is what makes a shell a shell.
 *   stretch  [x, y, z]     the last word on proportion, applied after
 *                          everything else. Tall and thin, or flat and wide.
 *
 * Everything is normalised at load so that whatever the numbers say, the form
 * fits the same radius — rarity is what decides how big a memory is, and a
 * shape must never be able to overrule it.
 *
 * Nothing here is sampled, downloaded or traced from anything. It is nine rows
 * of numbers and about forty lines of trigonometry.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   the table — the only thing you need to edit to add a form
   ═══════════════════════════════════════════════════════════════════════════ */

export const SHAPES = {
  seed: {
    name: 'seed',
    note: 'Closed, unhurried, and not yet anything in particular.',
    lon: [0, 1, 1, 1], lat: [0, 1, 1, 1],
    taper: 0.45, twist: 0, stretch: [1, 1.35, 1],
  },
  petal: {
    name: 'petal',
    note: 'Six soft folds, tapering to where the light gets in.',
    /* An odd lobe count reads as lopsided once the emblem is tipped toward the
       viewer — the squash in y has nothing to be symmetric about. Even counts
       stay legible at every size, which is why this is six and not five. */
    lon: [6, 0.80, 1.4, 1.4], lat: [0, 1, 1, 1],
    taper: 0.30, twist: 0.35, stretch: [1, 1.05, 1],
  },
  leaf: {
    name: 'leaf',
    note: 'A blade with a point at either end, held flat.',
    lon: [2, 0.62, 0.9, 0.9], lat: [0, 1, 1, 1],
    taper: 0.10, twist: 0, stretch: [1.15, 0.52, 0.86],
  },
  flower: {
    name: 'flower',
    note: 'Eight shallow lobes, opened all the way out.',
    lon: [8, 1.35, 1.5, 1.5], lat: [0, 1, 1, 1],
    taper: 0, twist: 0.18, stretch: [1, 0.60, 1],
  },
  thread: {
    name: 'thread',
    note: 'Long, fluted, and going somewhere out of sight.',
    lon: [3, 1.2, 1.2, 1.2], lat: [0, 1, 1, 1],
    taper: 0.12, twist: 0.9, stretch: [0.44, 2.30, 0.44],
  },
  shell: {
    name: 'shell',
    note: 'Wound around itself, the way slow things grow.',
    lon: [4, 1.0, 1.0, 1.0], lat: [2, 1.0, 1.0, 1.0],
    taper: -0.28, twist: 1.45, stretch: [1, 1.10, 1],
  },
  bell: {
    name: 'bell',
    note: 'Narrow at the top, open at the bottom, still ringing.',
    lon: [6, 1.55, 1.7, 1.7], lat: [4, 2.0, 1.0, 1.0],
    taper: -0.50, twist: 0, stretch: [1, 1.25, 1],
  },
  crown: {
    name: 'crown',
    note: 'Seven points, none of them insisting on anything.',
    lon: [7, 0.55, 0.95, 0.95], lat: [0, 1, 1, 1],
    taper: 0.18, twist: 0, stretch: [1, 0.88, 1],
  },
  star: {
    name: 'star',
    note: 'Six arms of light, and very little in the middle.',
    lon: [6, 0.34, 1.0, 1.0], lat: [0, 1, 1, 1],
    taper: 0, twist: 0, stretch: [1, 0.56, 1],
  },
};

/** what a memory with no shape of its own, or an unknown one, falls back to */
export const DEFAULT_SHAPE = 'seed';

export const SHAPE_KEYS = Object.keys(SHAPES);

/* ═══════════════════════════════════════════════════════════════════════════
   the form itself
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One superformula radius. `p` is [m, n1, n2, n3].
 *
 * m = 0 gives a constant 1 — a circle — which is why a "no lobing" row in the
 * table is written as `[0, 1, 1, 1]` rather than needing a special case.
 */
function superR(ang, p) {
  const t = p[0] * ang * 0.25;
  const a = Math.pow(Math.abs(Math.cos(t)), p[2]);
  const b = Math.pow(Math.abs(Math.sin(t)), p[3]);
  return Math.pow(Math.max(a + b, 1e-4), -1 / p[1]);
}

/**
 * A point on the form, at longitude `th` and latitude `ph`.
 *
 * The twist is applied to the *lookup* only, not to where the point is put —
 * so the lobes wind round as they rise while the surface stays a closed
 * revolution rather than shearing off its own axis.
 */
function formPoint(s, th, ph, out) {
  const r1 = superR(th + s.twist * ph, s.lon);
  const r2 = Math.max(0, superR(ph, s.lat) * (1 + s.taper * Math.sin(ph)));
  const cp = Math.cos(ph);
  out[0] = r1 * Math.cos(th) * r2 * cp * s.stretch[0];
  out[1] = r2 * Math.sin(ph) * s.stretch[1];
  out[2] = r1 * Math.sin(th) * r2 * cp * s.stretch[2];
  return out;
}

/**
 * Normalise every form to the same reach.
 *
 * Without this a seven-point crown is nearly twice the radius of a seed for no
 * reason anyone chose, and rarity — which is the thing that is *supposed* to
 * decide how big a memory is — stops meaning anything. Sampled coarsely at
 * load; it only has to be right to a percent or two.
 */
const P = [0, 0, 0];
for (const s of Object.values(SHAPES)) {
  let max = 1e-4;
  for (let i = 0; i <= 48; i++) {
    const th = (i / 48) * Math.PI * 2;
    for (let j = 0; j <= 24; j++) {
      const ph = -Math.PI / 2 + (j / 24) * Math.PI;
      formPoint(s, th, ph, P);
      const d = Math.hypot(P[0], P[1], P[2]);
      if (d > max) max = d;
    }
  }
  s.norm = 1 / max;
}

export function shapeOf(id) {
  return SHAPES[id] || SHAPES[DEFAULT_SHAPE];
}

/**
 * The per-instance numbers the vertex shader needs, for a memory's shape.
 *
 * `scale` is what the instance matrix should be multiplied by, componentwise —
 * proportion and normalisation folded into one, so the caller sets a scalar
 * size from rarity and gets the right silhouette for free.
 */
export function formAttributes(id) {
  const s = shapeOf(id);
  return {
    lon: s.lon,
    lat: s.lat,
    warp: [s.taper, s.twist],
    scale: [s.stretch[0] * s.norm, s.stretch[1] * s.norm, s.stretch[2] * s.norm],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   the same form, as GLSL
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Shared by fragments.js and sanctuary.js, so the solid in the ground and the
 * solid in the gallery cannot drift apart. It reads three instanced attributes
 * and rewrites `position`, which keeps every memory in the world inside the
 * same single draw call however many forms are on screen — the alternative,
 * one mesh per shape, would have multiplied the scene's draw calls by the size
 * of the table above.
 *
 * The normal is taken from two finite differences across the surface rather
 * than from the sphere it started as: without it the lobing is invisible,
 * because the only thing the fragment shader does with a normal is decide how
 * edge-on the surface is.
 */
export const FORM_GLSL = /* glsl */`
  attribute vec4 aLon;      // [m, n1, n2, n3] round the axis
  attribute vec4 aLat;      // [m, n1, n2, n3] pole to pole
  attribute vec2 aWarp;     // [taper, twist]

  float superR(float ang, vec4 p) {
    float t = p.x * ang * 0.25;
    float a = pow(abs(cos(t)), p.z);
    float b = pow(abs(sin(t)), p.w);
    return pow(max(a + b, 1e-4), -1.0 / p.y);
  }

  vec3 formAt(float th, float ph) {
    float r1 = superR(th + aWarp.y * ph, aLon);
    float r2 = max(0.0, superR(ph, aLat) * (1.0 + aWarp.x * sin(ph)));
    float cp = cos(ph);
    return vec3(r1 * cos(th) * r2 * cp, r2 * sin(ph), r1 * sin(th) * r2 * cp);
  }

  /** deformed position (xyz) and a surface normal, from a unit direction */
  void formOf(vec3 dir, out vec3 pos, out vec3 nrm) {
    float th = atan(dir.z, dir.x);
    float ph = asin(clamp(dir.y, -1.0, 1.0));
    pos = formAt(th, ph);
    vec3 dt = formAt(th + 0.04, ph) - pos;
    vec3 dp = formAt(th, ph + 0.04) - pos;
    vec3 n = cross(dt, dp);
    // the poles are degenerate — there is no cross product there worth having
    nrm = dot(n, n) > 1e-9 ? normalize(n) : dir;
  }
`;

/* ═══════════════════════════════════════════════════════════════════════════
   the same form, as an emblem
   ═══════════════════════════════════════════════════════════════════════════ */

/*
 * Two curves, seen from slightly above, and no more than that:
 *
 *   the outline    the form's own silhouette, pole to pole — which is where
 *                  taper and proportion live, and the whole difference between
 *                  a seed, a bell and a thread
 *
 *   the rosette    the cross-section at the equator — which is where the lobing
 *                  lives, and the whole difference between a five-fold petal
 *                  and a seven-pointed crown
 *
 * Both are lifted straight off the surface of the same solid that stands in the
 * grass. An earlier draft drew the full wireframe — every meridian and three
 * rings — and it was worse in a way worth writing down: meridians all converge
 * at the poles, so every form, whatever its numbers, came out reading as a
 * globe. Fewer lines carry more identity here.
 *
 * A dim one is the same drawing at a lower opacity. That matters: a memory you
 * have not found shows you its silhouette and withholds only its name, which is
 * a far better reason to go looking than a row of question marks.
 */

const TILT = 0.42;            // radians the form is tipped toward the viewer
const R = 42;                 // drawing radius inside a 100×100 box
const OUTLINE_STEPS = 30;
const RING_STEPS = 72;        // the sharp forms have corners worth resolving

function project(p) {
  // rotate about x so the top comes toward us, then drop z
  const y = p[1] * Math.cos(TILT) - p[2] * Math.sin(TILT);
  return [50 + p[0] * R, 50 - y * R];
}

function polyline(points, close) {
  let d = '';
  for (let i = 0; i < points.length; i++) {
    d += (i ? 'L' : 'M') + points[i][0].toFixed(1) + ' ' + points[i][1].toFixed(1);
  }
  return d + (close ? 'Z' : '');
}

function buildEmblem(id) {
  const s = shapeOf(id);
  const n = s.norm;

  /* How far the widest lobe reaches sideways. The silhouette is that lobe
     turned toward the edge of the drawing, so this is the one number the
     outline needs from the cross-section. */
  let W = 0;
  for (let i = 0; i < 240; i++) {
    const th = (i / 240) * Math.PI * 2;
    W = Math.max(W, superR(th, s.lon) * Math.abs(Math.cos(th)));
  }

  /* ── the outline ──────────────────────────────────────────────────────── */
  const left = [], right = [];
  for (let i = 0; i <= OUTLINE_STEPS; i++) {
    const ph = -Math.PI / 2 + (i / OUTLINE_STEPS) * Math.PI;
    const r2 = Math.max(0, superR(ph, s.lat) * (1 + s.taper * Math.sin(ph)));
    const half = W * r2 * Math.cos(ph) * s.stretch[0] * n;
    const y = r2 * Math.sin(ph) * s.stretch[1] * n;
    right.push(project([half, y, 0]));
    left.push(project([-half, y, 0]));
  }
  const outline = polyline(right.concat(left.reverse()), true);

  /* ── the rosette ──────────────────────────────────────────────────────── */
  const ring = [];
  for (let i = 0; i < RING_STEPS; i++) {
    formPoint(s, (i / RING_STEPS) * Math.PI * 2, 0, P);
    ring.push(project([P[0] * n, P[1] * n, P[2] * n]));
  }
  const rosette = polyline(ring, true);

  return { outline, rosette };
}

const CACHE = new Map();

/**
 * The emblem for a shape, as SVG markup.
 *
 * Cached per shape rather than per memory: forty-eight tiles in the archive
 * share nine drawings between them, so opening the memories tab generates at
 * most nine and reuses them from then on.
 */
export function emblemSVG(id) {
  const key = id || DEFAULT_SHAPE;
  let hit = CACHE.get(key);
  if (!hit) {
    const e = buildEmblem(key);
    hit = '<svg class="emblem" viewBox="0 0 100 100" aria-hidden="true" focusable="false">'
      + `<path class="e-fill" d="${e.rosette}"/>`
      + `<path class="e-body" d="${e.outline}"/>`
      + `<path class="e-wire" d="${e.rosette}"/>`
      + '</svg>';
    CACHE.set(key, hit);
  }
  return hit;
}

/** put an emblem into an element, without going near innerHTML on user data */
export function paintEmblem(el, id) {
  el.innerHTML = emblemSVG(id);
  return el;
}
