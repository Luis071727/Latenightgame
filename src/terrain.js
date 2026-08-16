import * as THREE from 'three';
import { createFbm } from './fractals.js';

/**
 * The ground of whichever world you are standing in.
 *
 * One heightfield, built from the same fbm the world's structures are scattered
 * with, so what is under your feet and what is growing out of it are generated
 * from one field and cannot disagree. The same height function fills the mesh
 * and answers `heightAt()`, which means there is no separate collision shape to
 * drift out of sync with what you can see.
 *
 * Each world is an island floating in its own weather: rolling in the middle,
 * a soft rim near the edge that makes walking outward feel like walking uphill,
 * and then a drop into fog. The rim is doing quiet work — it turns "the world
 * has an edge" into "the world has a shape", with nothing to bump into.
 *
 * The object identity survives a world change: `build()` swaps the insides, so
 * everything holding a reference to the terrain — the rig above all — keeps
 * working across a transition.
 */
export function createTerrain({ CONFIG, quality, scene }) {
  let world = null;
  let fbm = null;
  let G = null;                // the current world's ground settings
  let mesh = null;
  let geometry = null;

  const NUM_LIGHTS = CONFIG.ground.lights;

  /* ── shading ──────────────────────────────────────────────────────────
   * Built once and re-tinted per world rather than rebuilt: a ShaderMaterial
   * is a shader compile, and compiling one during a world transition is
   * exactly where a stutter would be most noticeable.
   */
  const uniforms = {
    uLow:       { value: new THREE.Color(0x2a2a3a) },
    uHigh:      { value: new THREE.Color(0x4a4a5a) },
    uSky:       { value: new THREE.Color(0x202030) },
    uFogColor:  { value: new THREE.Color(0x101018) },
    uFogDensity:{ value: 0.01 },
    uAmbient:   { value: 0.8 },
    uGrain:     { value: CONFIG.ground.grain },
    uDetailFade:{ value: CONFIG.ground.detailFade },
    uLightPos:  { value: Array.from({ length: NUM_LIGHTS }, () => new THREE.Vector3()) },
    uLightColor:{ value: Array.from({ length: NUM_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    uLightPower:{ value: new Float32Array(NUM_LIGHTS) },
    uLightClamp:{ value: CONFIG.ground.lightClamp },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      #define NUM_LIGHTS ${NUM_LIGHTS}

      uniform vec3 uLow, uHigh, uSky, uFogColor;
      uniform float uFogDensity, uAmbient, uGrain, uDetailFade;
      uniform vec3 uLightPos[NUM_LIGHTS];
      uniform vec3 uLightColor[NUM_LIGHTS];
      uniform float uLightPower[NUM_LIGHTS];
      uniform float uLightClamp;

      varying vec3 vWorld;
      varying vec3 vNormal;
      varying float vDepth;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        vec2 p = vWorld.xz;

        // Grain is only resolvable close up. Left on at distance it aliases
        // into blotches, so it fades with depth and the broad shading carries
        // the surface from there.
        float fade = exp(-vDepth * uDetailFade);
        float e = 0.06;
        float g0 = noise(p * 12.0);
        vec2 slope = vec2(noise((p + vec2(e, 0.0)) * 12.0) - g0,
                          noise((p + vec2(0.0, e)) * 12.0) - g0) * uGrain * fade;

        vec3 n = normalize(vNormal + vec3(-slope.x, 0.0, -slope.y));

        // higher ground catches more light, and flanks stay in the low colour
        float rise = smoothstep(-1.0, 6.0, vWorld.y);
        float level = smoothstep(0.35, 0.95, n.y);
        vec3 albedo = mix(uLow, uHigh, rise * 0.55 + level * 0.45);
        albedo *= 0.93 + 0.07 * noise(p * 0.28);      // faint large-scale mottling

        vec3 col = albedo * uAmbient * (0.42 + 0.9 * (0.5 + 0.5 * n.y));
        col += uSky * (0.5 + 0.5 * n.y) * 0.22;

        /* Whatever soft lights are nearby — motes, and structures coming
           awake. Gathered into one sum and then soft-clamped rather than added
           straight onto the surface: six lights each contributing a perfectly
           reasonable amount still add up to six times a reasonable amount, and
           the place that happens is a clearing where everything is awake and a
           handful of motes are following you, which is to say the exact ground
           the player most needs to be able to read.

           x/(1+x/c) is the whole trick. It is linear while the light is dim,
           so nothing about a quiet world changes at all, and it bends over
           toward c as the light piles up — so a crowded, blazing patch of
           ground gets brighter, but never white, and the wanderer's own shadow
           and the slope under their feet stay legible. */
        vec3 gathered = vec3(0.0);
        for (int i = 0; i < NUM_LIGHTS; i++) {
          if (uLightPower[i] <= 0.0) continue;
          vec3 toLight = uLightPos[i] - vWorld;
          float d = length(toLight);
          vec3 L = toLight / max(d, 0.001);
          float atten = uLightPower[i] / (1.0 + d * d * 0.12);
          gathered += uLightColor[i] * max(dot(n, L), 0.0) * atten;
        }
        col += albedo * (gathered / (1.0 + gathered / uLightClamp));

        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
      }`,
  });

  /* ── height ───────────────────────────────────────────────────────────── */

  /**
   * The world's surface at a point. Everything about a world's silhouette is
   * in here: the rolling middle, the flat plaza the monument stands on, the
   * rim, and the drop past it.
   *
   * Two profiles share the rim and the drop, because those are what make a
   * place an island and every place here is one. What differs is the middle:
   * `wild` rolls, `plaza` is laid.
   */
  function heightAt(x, z) {
    if (!G) return 0;

    const r = Math.hypot(x, z);
    const rn = r / G.radius;

    let h = G.profile === 'plaza' ? plazaHeight(x, z, r) : wildHeight(x, z, r);

    // the rim: walking outward becomes walking uphill, which turns the edge
    // of the world into a shape rather than a wall
    const rim = Math.exp(-Math.pow((rn - 0.87) / 0.12, 2)) * G.rim;
    h += rim;

    // ...and past it, the island falls away into the weather
    const edge = 1 - smoothstep(0.94, 1.14, rn);
    h = h * edge - (1 - edge) * G.drop;

    return h;
  }

  /** the four worlds: land that grew */
  function wildHeight(x, z, r) {
    // two scales of rolling, the broad one carrying most of the shape
    let h = fbm.fbm2(x * G.freq * 0.37 + 11.3, z * G.freq * 0.37 - 7.1) * G.amp * 1.35
          + fbm.fbm2(x * G.freq, z * G.freq) * G.amp * 0.55;

    // a level place in the middle for the monument to stand on
    const plaza = smoothstep(G.plazaRadius * 2.0, G.plazaRadius * 0.6, r);
    return h * (1 - plaza * 0.88);
  }

  /**
   * The sanctuary: ground that was *laid* rather than ground that grew.
   *
   * A wide level court in the middle and then a few shallow terraces stepping
   * outward — flat treads with softened risers, so the silhouette reads as
   * something built and the walking stays completely even. The fbm is still
   * here but turned right down and used only to keep the surface from being
   * dead: a perfectly true floor looks like a bug, not like architecture.
   *
   * This is the whole difference between a home and a biome. Everywhere else
   * the ground is weather; here it is a floor, and you can see the whole of it
   * from the middle without anything rolling out of view.
   */
  function plazaHeight(x, z, r) {
    const court = G.plazaRadius * G.courtScale;
    // distance out past the court, in terraces
    const t = Math.max(0, (r - court) / G.terraceWidth);
    const step = Math.floor(t);
    const into = t - step;
    // ease the last of each tread up into the next riser
    const risen = step + smoothstep(1 - G.terraceSoften, 1, into);
    let h = risen * G.terraceRise;

    // a whisper of unevenness, so it is laid stone rather than printed stone
    h += fbm.fbm2(x * G.freq, z * G.freq) * G.amp;
    return h;
  }

  function smoothstep(a, b, x) {
    const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /* ── build ────────────────────────────────────────────────────────────── */

  function disposeMesh() {
    if (!mesh) return;
    scene.remove(mesh);
    geometry.dispose();
    mesh = null;
    geometry = null;
  }

  function build(next) {
    disposeMesh();

    world = next;
    G = world.ground;
    fbm = createFbm(world.seed);

    const span = G.radius * 2.4;
    const cells = quality.groundCells;
    geometry = new THREE.PlaneGeometry(span, span, cells, cells);
    geometry.rotateX(-Math.PI / 2);

    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const eps = span / cells * 0.5;
    const nrm = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));

      // Normals from central differences on the height function rather than
      // from the triangles: exact, and cheap enough at build time that there
      // is no reason to take the approximation.
      nrm.set(
        heightAt(x - eps, z) - heightAt(x + eps, z),
        2 * eps,
        heightAt(x, z - eps) - heightAt(x, z + eps)
      ).normalize();
      nor.setXYZ(i, nrm.x, nrm.y, nrm.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    geometry.computeBoundingSphere();

    mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -6;
    scene.add(mesh);

    setPalette(world.palette);
    uniforms.uFogDensity.value = world.fog.density;
    uniforms.uAmbient.value = world.ground.ambient;
  }

  function setPalette(p) {
    if (p.groundLow) uniforms.uLow.value.set(p.groundLow);
    if (p.groundHigh) uniforms.uHigh.value.set(p.groundHigh);
    if (p.skyTopA) uniforms.uSky.value.set(p.skyTopA);
    if (p.fog) uniforms.uFogColor.value.set(p.fog);
  }

  /* ── lighting ─────────────────────────────────────────────────────────── */
  const zero = new THREE.Color(0, 0, 0);

  /**
   * Feed the nearest few soft lights into the ground shader. Anything further
   * away contributes nothing you could see, so it is not worth a slot.
   */
  function setLights(nearest) {
    for (let i = 0; i < NUM_LIGHTS; i++) {
      const l = nearest[i];
      if (!l) {
        uniforms.uLightPower.value[i] = 0;
        uniforms.uLightColor.value[i].copy(zero);
        continue;
      }
      uniforms.uLightPos.value[i].set(l.x, l.y, l.z);
      uniforms.uLightColor.value[i].copy(l.tint);
      uniforms.uLightPower.value[i] = l.vis * l.glow * CONFIG.ground.lightPower;
    }
  }

  return {
    heightAt,
    build,
    setPalette,
    setLights,

    get mesh() { return mesh; },
    /** how far out the world goes, for anything that wants to stay inside it */
    get radius() { return G ? G.radius : 0; },

    dispose() {
      disposeMesh();
      material.dispose();
    },
  };
}
