import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { makeWaterNormals } from './textures.js';

/**
 * The lake.
 *
 * On medium/high this is the Three.js Water addon, which renders the scene a
 * second time from a mirrored camera to get true reflections of the lanterns
 * and stars. That second pass is the most expensive thing in the scene, so its
 * target resolution is driven by the quality tier — and on `low` we skip the
 * reflection pass entirely and shade a plain plane instead, which costs one
 * draw call and no extra scene traversal.
 *
 * Both paths share the same palette so dropping a tier changes the fidelity,
 * not the mood.
 */
export function createWater({ CONFIG, quality, scene, renderer, world }) {
  // built on demand: the reflective path keeps one for the life of the tier
  // and does not want a fresh one per arrival
  const makeNormals = () => makeWaterNormals(quality.waterNormalSize);
  // A world that names a size gets a lake anchored at its own centre; without
  // one the plane is an endless sea that rides along under the camera. A lake
  // is nearly always what a floating island wants — an endless sea drawn under
  // an island that ends in fog cuts a hard line straight across the horizon.
  const size = world?.water?.size ?? CONFIG.world.waterSize;
  const anchored = !!world?.water?.size;
  const geometry = new THREE.PlaneGeometry(size, size);
  const level = world?.water?.level ?? 0;
  const palette = { ...CONFIG.palette, ...(world?.palette || {}) };

  return quality.reflections
    ? reflectiveWater({ CONFIG, quality, scene, geometry, makeNormals, renderer, palette, level, anchored })
    : shadedWater({ CONFIG, scene, geometry, normals: makeNormals(), palette, level, anchored });
}

/* ── medium / high: real mirrored reflections ─────────────────────────────
 *
 * One lake, kept for the life of the tier.
 *
 * This used to be built and thrown away on every arrival, and it leaked: the
 * addon holds its reflection target in a closure and hands out only the
 * texture, and disposing a render target's texture does not free the target —
 * measured at one half-float target per visit to the harbour, standing back in
 * the meadow each time to be sure, climbing without bound over a session.
 *
 * Rather than reach into the addon for a handle it does not offer, the whole
 * thing is simply kept. Only one world has water, its plane is the only part
 * that differs, and swapping the geometry is cheap. That fixes the leak
 * outright and takes a shader compile — including the fragment-shader surgery
 * below — out of the gate transition as well.
 *
 * A tier change still cannot free the old target, since the handle is still
 * not ours to take. But tiers only ever step downward and there are four of
 * them, so that is a bounded three targets in the worst session anybody can
 * have, against one per arrival for as long as they keep playing.
 */
let cached = null;      // { water, normals, size, accum }

function reflectiveWater({ CONFIG, quality, scene, geometry, makeNormals, renderer, palette, level, anchored }) {
  if (cached && cached.size !== quality.reflectionSize) {
    // the tier moved: let go of everything we are actually able to let go of
    cached.water.material.uniforms.mirrorSampler.value?.dispose?.();
    cached.water.material.dispose();
    cached.water.geometry.dispose();
    cached.normals.dispose();
    cached = null;
  }

  if (cached) {
    // reuse: this world's plane replaces the last one's, and nothing else moves
    cached.water.geometry.dispose();
    cached.water.geometry = geometry;
  } else {
    cached = buildReflective({ CONFIG, quality, geometry, normals: makeNormals(), palette });
  }

  const entry = cached;
  const water = entry.water;

  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -10;
  water.material.transparent = false;
  water.material.uniforms.size.value = CONFIG.water.rippleSize;
  water.material.uniforms.uSmear.value = CONFIG.water.reflectionSmear;
  water.material.uniforms.uReflectivity.value = CONFIG.water.reflectivity;
  water.material.uniforms.waterColor.value.set(palette.waterDeep);
  water.position.set(0, level, 0);
  entry.accum = 0;
  scene.add(water);

  return {
    object: water,
    reflective: true,
    setPalette(next) {
      if (next.waterDeep) water.material.uniforms.waterColor.value.set(next.waterDeep);
    },
    update(dt, ctx) {
      entry.accum += dt;
      water.material.uniforms.time.value += dt * CONFIG.water.flowSpeed;
      if (!anchored) {
        // keep the plane centred under the camera so it never runs out
        water.position.x = ctx.cameraPosition.x;
        water.position.z = ctx.cameraPosition.z;
      }
    },
    /* Leaving the harbour takes the lake out of the scene and no further. The
       geometry belongs to the cache and is disposed by the next build; the
       material, the normal map and the reflection target are the whole point
       of keeping it. */
    dispose() {
      scene.remove(water);
    },
  };
}

function buildReflective({ CONFIG, quality, geometry, normals, palette }) {
  const p = palette;

  const water = new Water(geometry, {
    textureWidth: quality.reflectionSize,
    textureHeight: quality.reflectionSize,
    waterNormals: normals,
    // There is no sun at midnight. Killing the specular highlight is what
    // turns the ocean shader into a still night lake.
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0x000000,
    waterColor: p.waterDeep,
    distortionScale: CONFIG.water.distortion,
    fog: false,
    alpha: 1.0,
  });

  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -10;
  water.material.uniforms.size.value = CONFIG.water.rippleSize;
  water.material.transparent = false;

  /*
   * The addon takes a single reflection sample and offsets it isotropically,
   * which makes a small bright object mirror as a crisp displaced copy of
   * itself — reflections end up looking like debris floating on the lake.
   *
   * Real water smears a reflection *along the view direction*: the spread of
   * ripple slopes scatters the reflected rays vertically, which is why a
   * lantern on a still lake reads as a long shimmering column rather than a
   * second lantern. Here we replace the single tap with a few taps walked up
   * and down the mirror texture, weighted to a soft falloff.
   */
  const fs = water.material.fragmentShader;
  const oldTap = 'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );';
  if (!fs.includes(oldTap)) {
    console.warn('[water] reflection tap not found; three.js Water.js may have changed');
  }
  water.material.fragmentShader = fs
    .replace('vec4 getNoise( vec2 uv ) {', 'uniform float uSmear;\nuniform float uReflectivity;\nvec4 getNoise( vec2 uv ) {')
    .replace(oldTap, /* glsl */`
      vec2 refUv = mirrorCoord.xy / mirrorCoord.w + distortion;
      // steeper ripples scatter more; nearby water smears more than the far shore
      float smear = uSmear
                  * (0.25 + 0.75 * abs(surfaceNormal.x + surfaceNormal.z))
                  * (0.35 + 7.0 / (distance + 7.0));
      // Taps are evenly spaced and close enough together that a point source's
      // copies overlap into one streak. Randomised offsets were tried first
      // and are worse: white noise turns a star — one or two pixels across —
      // into speckle scattered along the streak rather than a smooth line.
      vec3 reflectionSample = vec3( 0.0 );
      float wsum = 0.0;
      for ( int i = 0; i < 9; i ++ ) {
        float t = ( float( i ) - 4.0 ) / 4.0;
        float w = 1.0 - abs( t ) * 0.7;
        reflectionSample += texture2D( mirrorSampler, refUv + vec2( 0.0, t * smear ) ).rgb * w;
        wsum += w;
      }
      reflectionSample /= wsum;
      reflectionSample *= uReflectivity;`);
  water.material.uniforms.uSmear = { value: CONFIG.water.reflectionSmear };
  water.material.uniforms.uReflectivity = { value: CONFIG.water.reflectivity };

  // The addon renders the reflection every frame. At 30fps of *reflection*
  // updates the water still reads as alive, and it halves the cost of the
  // most expensive pass in the scene. The accumulator lives on the cache entry
  // rather than in here, so it survives the lake being reused.
  const entry = { water, normals, size: quality.reflectionSize, accum: 0 };
  const baseOnBeforeRender = water.onBeforeRender;
  water.onBeforeRender = function (rndr, scn, cam) {
    if (entry.accum < CONFIG.water.reflectionInterval) return;
    entry.accum = 0;
    baseOnBeforeRender.call(this, rndr, scn, cam);
  };

  return entry;
}

/* ── low: no second scene pass, just a well-behaved dark plane ────────── */
function shadedWater({ CONFIG, scene, geometry, normals, palette, level, anchored }) {
  const p = palette;

  const uniforms = {
    uTime:    { value: 0 },
    uDeep:    { value: new THREE.Color(p.waterDeep) },
    uFar:     { value: new THREE.Color(p.waterFar) },
    uCam:     { value: new THREE.Vector3() },
    uNormals: { value: normals },
  };

  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uDeep, uFar, uCam;
      uniform sampler2D uNormals;
      varying vec3 vWorld;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        float dist = length(vWorld.xz - uCam.xz);
        float f    = 1.0 - exp(-dist * 0.012);
        float near = 1.0 - f;
        float fine = exp(-dist * 0.09);

        vec3 col = mix(uDeep, uFar, clamp(f, 0.0, 1.0));

        // two scrolling samples of the same normal map stand in for a swell
        vec2 uv = vWorld.xz * 0.16;
        vec3 n1 = texture2D(uNormals, uv + vec2(uTime * 0.004, uTime * 0.003)).rgb;
        vec3 n2 = texture2D(uNormals, uv * 2.7 - vec2(uTime * 0.007, 0.0)).rgb;
        float ripple = (n1.r - 0.5) * 0.65 + (n2.r - 0.5) * 0.35;
        col += vec3(0.012, 0.015, 0.024) * ripple * fine;

        // sparse round glints where starlight catches the surface
        vec2 gp   = vWorld.xz * 0.45;
        vec2 cell = floor(gp);
        float h   = hash(cell);
        vec2 seed = vec2(hash(cell + 3.1), hash(cell + 7.7));
        float dd  = length(fract(gp) - seed);
        float glint = smoothstep(0.10, 0.0, dd)
                    * smoothstep(0.90, 1.0, sin(uTime * (0.35 + h * 0.5) + h * 40.0))
                    * step(0.58, h);
        col += vec3(0.24, 0.27, 0.38) * glint * fine;

        gl_FragColor = vec4(col, 1.0);
      }`,
  }));

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = level;
  mesh.renderOrder = -10;
  scene.add(mesh);

  return {
    object: mesh,
    reflective: false,
    setPalette(next) {
      if (next.waterDeep) uniforms.uDeep.value.set(next.waterDeep);
      if (next.waterFar) uniforms.uFar.value.set(next.waterFar);
    },
    update(dt, ctx) {
      uniforms.uTime.value += dt;
      uniforms.uCam.value.copy(ctx.cameraPosition);
      if (!anchored) {
        mesh.position.x = ctx.cameraPosition.x;
        mesh.position.z = ctx.cameraPosition.z;
      }
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      normals.dispose();
      mesh.material.dispose();
    },
  };
}
