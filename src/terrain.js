import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './textures.js';

/**
 * The islands — real ground rather than silhouettes.
 *
 * Each one is a heightfield: a dome profile falling away to below the
 * waterline, roughened with fbm noise so the shoreline is irregular and the
 * surface has dunes. The same height function builds the mesh and answers
 * `heightAt()` for the camera, so what you walk on is exactly what you see —
 * there is no separate collision approximation to drift out of sync.
 *
 * Sand is shaded rather than textured: a hemispheric term for the night sky,
 * fine grain and beach ripples perturbing the normal per pixel, and warm point
 * lights from the nearest lanterns. That last part matters more than it
 * sounds. Lit only by a dim sky, sand at night is a flat grey shape; it only
 * reads as a surface once something warm is close enough to rake across it.
 */
export function createTerrain({ CONFIG, quality, scene }) {
  const cfg = CONFIG.islands;
  const cellSize = cfg.cellSize * quality.terrainCell;
  const rand = mulberry32(cfg.seed);

  /* ── noise, shared by the mesh builder and the height query ─────────── */
  const perm = new Uint8Array(512);
  {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }

  const fade = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const at = (a, b) => perm[(perm[a & 255] + (b & 255)) & 511] / 255;
    return lerp(
      lerp(at(xi, yi), at(xi + 1, yi), u),
      lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v
    ) * 2 - 1;
  }

  function fbm(x, y) {
    return vnoise(x, y) * 0.6
         + vnoise(x * 2.03, y * 2.03) * 0.28
         + vnoise(x * 4.11, y * 4.11) * 0.12;
  }

  /* ── island placement ───────────────────────────────────────────────── */
  const islands = [];
  for (let i = 0; i < cfg.count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = cfg.minDistance + rand() * (cfg.maxDistance - cfg.minDistance);
    islands.push({
      cx: Math.cos(angle) * dist,
      cz: Math.sin(angle) * dist,
      radius: cfg.minRadius + rand() * (cfg.maxRadius - cfg.minRadius),
      height: cfg.minHeight + rand() * (cfg.maxHeight - cfg.minHeight),
      offX: rand() * 500,
      offZ: rand() * 500,
      squash: 0.75 + rand() * 0.5,
    });
  }

  /**
   * Raw surface height, which goes negative off the shore so the ground
   * submerges cleanly instead of ending in a wall at the waterline.
   */
  function heightRaw(x, z) {
    let h = -cfg.underwaterDrop;
    for (const isl of islands) {
      const dx = x - isl.cx;
      const dz = (z - isl.cz) / isl.squash;
      let r = Math.hypot(dx, dz) / isl.radius;
      if (r > 1.6) continue;

      // wander the shoreline so islands aren't circles
      r += fbm((x + isl.offX) * cfg.shoreScale, (z + isl.offZ) * cfg.shoreScale)
           * cfg.shoreWobble;

      // s > 0 is dry land, s < 0 is the submerged approach
      const t = (cfg.shoreAt - r) / cfg.shoreAt;

      let local;
      if (t >= 0) {
        // A power above 1 puts a long shallow toe at the waterline and keeps
        // the height inland, which is the shape a beach actually has. A plain
        // dome gives you a shoreline you cannot stand on.
        const dune = fbm((x + isl.offX) * cfg.duneScale, (z + isl.offZ) * cfg.duneScale);
        local = isl.height * Math.pow(t, cfg.beachFalloff)
              + dune * isl.height * cfg.duneAmount * t * t;
      } else {
        local = -cfg.underwaterDrop * Math.min(1, Math.pow(-t * 2.4, 1.4));
      }

      if (local > h) h = local;
    }
    return h;
  }

  /** Ground the camera can stand on: the lake surface, or sand above it. */
  function heightAt(x, z) {
    return Math.max(0, heightRaw(x, z));
  }

  /* ── mesh ───────────────────────────────────────────────────────────── */
  const sandParts = [];
  const treeParts = [];
  const nrm = new THREE.Vector3();

  for (const isl of islands) {
    const span = isl.radius * 2.9;
    const cells = Math.max(12, Math.min(72, Math.round(span / cellSize)));
    const geo = new THREE.PlaneGeometry(span, span * isl.squash, cells, cells);
    geo.rotateX(-Math.PI / 2);
    geo.translate(isl.cx, 0, isl.cz);

    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const eps = cellSize * 0.5;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, heightRaw(x, z));

      // Normals from central differences on the height function rather than
      // from the triangles: exact, and it can't seam where islands are merged.
      nrm.set(
        heightRaw(x - eps, z) - heightRaw(x + eps, z),
        2 * eps,
        heightRaw(x, z - eps) - heightRaw(x, z + eps)
      ).normalize();
      nor.setXYZ(i, nrm.x, nrm.y, nrm.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    sandParts.push(geo);

    // conifers, planted on whatever the ground turned out to be
    const trees = 2 + Math.floor(rand() * cfg.maxTrees);
    for (let t = 0; t < trees; t++) {
      const ta = rand() * Math.PI * 2;
      const tr = Math.sqrt(rand()) * isl.radius * 0.66;
      const tx = isl.cx + Math.cos(ta) * tr;
      const tz = isl.cz + Math.sin(ta) * tr * isl.squash;

      const ground = heightRaw(tx, tz);
      if (ground < cfg.treeMinHeight) continue;   // no trees on the beach

      const th = cfg.treeHeight * (0.6 + rand() * 0.8);
      // Two or three stacked cones rather than one. A single cone up close is
      // unmistakably a pyramid; the tiers are what read as a conifer, and it
      // is still only a few dozen triangles.
      const tiers = 2 + Math.floor(rand() * 2);
      for (let k = 0; k < tiers; k++) {
        const f = k / tiers;
        const tierH = th * (0.62 - f * 0.16);
        const tierR = th * (0.30 - f * 0.085);
        const base = ground + th * f * 0.42 - 0.2;
        const cone = new THREE.ConeGeometry(tierR, tierH, 6, 1);
        cone.translate(tx, base + tierH / 2, tz);
        treeParts.push(cone);
      }
    }
  }

  const NUM_LIGHTS = cfg.sandLights;

  const sandUniforms = {
    uSand:      { value: new THREE.Color(CONFIG.palette.sand) },
    uSandWet:   { value: new THREE.Color(CONFIG.palette.sandWet) },
    uSky:       { value: new THREE.Color(CONFIG.palette.skyTopA) },
    uHorizon:   { value: new THREE.Color(CONFIG.palette.skyHorizon) },
    uAmbient:   { value: cfg.ambient },
    uFogDensity:{ value: cfg.fogDensity },
    uLightPos:  { value: Array.from({ length: NUM_LIGHTS }, () => new THREE.Vector3()) },
    uLightColor:{ value: Array.from({ length: NUM_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
    uLightPower:{ value: new Float32Array(NUM_LIGHTS) },
    uGrain:     { value: cfg.grain },
    uRipple:    { value: cfg.ripple },
    uDetailFade:{ value: cfg.detailFade },
  };

  const sandMaterial = new THREE.ShaderMaterial({
    uniforms: sandUniforms,
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

      uniform vec3 uSand, uSandWet, uSky, uHorizon;
      uniform float uAmbient, uFogDensity, uGrain, uRipple, uDetailFade;
      uniform vec3 uLightPos[NUM_LIGHTS];
      uniform vec3 uLightColor[NUM_LIGHTS];
      uniform float uLightPower[NUM_LIGHTS];

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
        // into blotches that read as gravel, so it fades out with depth and
        // the long ripples carry the surface from there.
        float fade = exp(-vDepth * uDetailFade);

        // ripples the water left behind, in patches rather than everywhere
        const float K = 0.85;                       // ~7m between crests
        float phase = p.x * K + noise(p * 0.11) * 7.0;
        float rippleMask = smoothstep(0.2, 0.8, noise(p * 0.07 + 3.1));
        float rippleSlope = cos(phase) * K * uRipple * rippleMask;

        // grain, as a slope rather than a colour: sand catches light, it
        // isn't speckled with dark spots
        float e = 0.06;
        float g0 = noise(p * 30.0);
        vec2 grainSlope = vec2(noise((p + vec2(e, 0.0)) * 30.0) - g0,
                               noise((p + vec2(0.0, e)) * 30.0) - g0)
                        * uGrain * fade;

        vec3 n = normalize(vNormal + vec3(-(rippleSlope + grainSlope.x),
                                          0.0,
                                          -grainSlope.y));

        // wet, darker sand where the lake has been over it
        float wet = smoothstep(0.7, 0.03, vWorld.y);
        vec3 albedo = mix(uSand, uSandWet, wet);
        albedo *= 0.92 + 0.08 * noise(p * 0.9);     // faint large-scale mottling

        // the night sky is the only ambient there is
        vec3 col = albedo * mix(uHorizon, uSky, 0.5 + 0.5 * n.y) * uAmbient;

        // warm light from whichever lanterns are nearest
        for (int i = 0; i < NUM_LIGHTS; i++) {
          if (uLightPower[i] <= 0.0) continue;
          vec3 toLight = uLightPos[i] - vWorld;
          float d = length(toLight);
          vec3 L = toLight / max(d, 0.001);
          float atten = uLightPower[i] / (1.0 + d * d * 0.12);
          col += albedo * uLightColor[i] * max(dot(n, L), 0.0) * atten;
          // wet sand throws a little of it back
          col += uLightColor[i] * pow(max(dot(n, L), 0.0), 6.0) * atten * wet * 0.3;
        }

        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        col = mix(col, uHorizon, fog);

        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  /*
   * One mesh per island rather than one merged mesh for the archipelago.
   * Merging would make it a single draw call, but a single draw call is also
   * a single bounding volume: the whole terrain gets submitted every frame
   * even when most of it is behind you, and the water's reflection pass draws
   * it a second time. Thirteen draw calls cost far less than the vertices
   * they let the frustum reject.
   */
  const sandMeshes = sandParts.map((geo) => {
    const m = new THREE.Mesh(geo, sandMaterial);
    m.renderOrder = -6;
    scene.add(m);
    return m;
  });

  let trees = null;
  let treeGeometry = null;
  if (treeParts.length) {
    treeGeometry = mergeGeometries(treeParts, false);
    for (const g of treeParts) g.dispose();
    trees = new THREE.Mesh(treeGeometry, new THREE.ShaderMaterial({
      uniforms: {
        uNear: { value: new THREE.Color(CONFIG.palette.tree) },
        uLit: { value: new THREE.Color(CONFIG.palette.treeLit) },
        uFar: { value: new THREE.Color(CONFIG.palette.skyHorizon) },
        uRim: { value: new THREE.Color(CONFIG.palette.skyTopA) },
        uFogDensity: { value: cfg.fogDensity },
        uLightPos: sandUniforms.uLightPos,
        uLightColor: sandUniforms.uLightColor,
        uLightPower: sandUniforms.uLightPower,
      },
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
        uniform vec3 uNear, uLit, uFar, uRim;
        uniform float uFogDensity;
        uniform vec3 uLightPos[NUM_LIGHTS];
        uniform vec3 uLightColor[NUM_LIGHTS];
        uniform float uLightPower[NUM_LIGHTS];

        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vDepth;

        void main() {
          vec3 n = normalize(vNormal);
          vec3 col = uNear + uRim * clamp(n.y, 0.0, 1.0) * 0.16;

          // Trees take the lantern light too, weakly. Left unlit they are
          // fine on the horizon but become black cut-outs when you walk up
          // to one, which is worse than any amount of foliage detail.
          for (int i = 0; i < NUM_LIGHTS; i++) {
            if (uLightPower[i] <= 0.0) continue;
            vec3 toLight = uLightPos[i] - vWorld;
            float d = length(toLight);
            float atten = uLightPower[i] / (1.0 + d * d * 0.16);
            col += uLit * uLightColor[i] * max(dot(n, toLight / max(d, 0.001)), 0.0) * atten;
          }

          float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
          gl_FragColor = vec4(mix(col, uFar, fog), 1.0);
        }`,
    }));
    trees.renderOrder = -6;
    scene.add(trees);
  }

  /* ── lantern lighting ───────────────────────────────────────────────── */
  const zero = new THREE.Color(0, 0, 0);

  /**
   * Feed the nearest few lanterns into the sand shader. Anything further than
   * `lightRange` contributes nothing you could see, so it is not worth a slot.
   */
  function setLights(nearest) {
    for (let i = 0; i < NUM_LIGHTS; i++) {
      const l = nearest[i];
      if (!l) {
        sandUniforms.uLightPower.value[i] = 0;
        sandUniforms.uLightColor.value[i].copy(zero);
        continue;
      }
      sandUniforms.uLightPos.value[i].set(l.x, l.y, l.z);
      sandUniforms.uLightColor.value[i].copy(l.tint);
      sandUniforms.uLightPower.value[i] = l.vis * l.glow * cfg.lightPower;
    }
    sandUniforms.uLightPower.needsUpdate = true;
  }

  return {
    sandMeshes,
    trees,
    islands,
    heightAt,
    setLights,
    dispose() {
      for (const m of sandMeshes) { scene.remove(m); m.geometry.dispose(); }
      sandMaterial.dispose();
      if (trees) {
        scene.remove(trees);
        treeGeometry.dispose();
        trees.material.dispose();
      }
    },
  };
}
