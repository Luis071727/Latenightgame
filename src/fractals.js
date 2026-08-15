import * as THREE from 'three';

/**
 * The things the worlds are grown from.
 *
 * Everything here is bounded recursion baked into instance transforms — a few
 * hundred matrices per structure, all of them drawn in one call. Nothing is
 * raymarched and nothing is generated per frame, which is the whole reason
 * this survives on a phone: a fractal is expensive to *evaluate* and cheap to
 * *have*, so we evaluate it once at world-build time and then only ever move
 * a uniform.
 *
 * Depth is capped everywhere it appears. A branching structure is 3^depth
 * segments in the worst case, so the difference between depth 4 and depth 6 is
 * the difference between a hundred instances and a thousand — which is why the
 * quality tier gets to choose it and why nothing reads a depth it was not
 * given.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   noise
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Value-noise fbm on a shuffled permutation table. The ground, the structure
 * scatter and the cloud layers all share one of these, so a world's terrain
 * and the things standing on it are generated from the same field and can't
 * disagree about where the hills are.
 */
export function createFbm(seed) {
  const perm = new Uint8Array(512);
  {
    let a = seed >>> 0;
    const rand = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
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

  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const at = (a, b) => perm[(perm[a & 255] + (b & 255)) & 511] / 255;
    return lerp(
      lerp(at(xi, yi), at(xi + 1, yi), u),
      lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v
    ) * 2 - 1;
  }

  /** four octaves, weights halving — enough for rolling ground, cheap enough
   *  to call a few hundred thousand times while a world is being built */
  function fbm2(x, y) {
    return noise2(x, y) * 0.53
         + noise2(x * 2.03, y * 2.03) * 0.27
         + noise2(x * 4.11, y * 4.11) * 0.13
         + noise2(x * 8.07, y * 8.07) * 0.07;
  }

  return { noise2, fbm2 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   geometry
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A box with its corners pulled toward a sphere. Menger sponges are all right
 * angles, which under this palette reads as brutalism rather than as a dream;
 * softening the corners is what turns the same recursion into something that
 * looks moulded by hand.
 *
 * @param round 0 = a box, 1 = a sphere. Around 0.3 is a soft brick.
 */
export function softBoxGeometry(round = 0.32, seg = 3) {
  const geo = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // a point on the box surface, and the same direction on a sphere of the
    // same radius; blending between them rounds every corner at once
    const sphere = v.clone().normalize().multiplyScalar(0.5);
    v.lerp(sphere, round);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * The unit piece each species is built from, always standing on the origin and
 * one unit tall, so an instance matrix is just (where, which way, how big).
 */
export function speciesGeometry(species) {
  let segment;
  switch (species) {
    case 'crystal':
      // a diamond rather than a tube: with a cylinder the crystals grew into
      // a field of bare winter trees, which is a different world entirely
      segment = new THREE.OctahedronGeometry(0.5, 0);
      segment.scale(1, 1, 1);
      break;
    case 'coral':
      segment = new THREE.CylinderGeometry(0.55, 0.80, 1, 7, 1);
      break;
    case 'stalk':
      segment = new THREE.CylinderGeometry(0.62, 0.74, 1, 6, 1);
      break;
    default:   // 'tree'
      segment = new THREE.CylinderGeometry(0.44, 0.78, 1, 6, 1);
  }
  segment.translate(0, 0.5, 0);          // stand it on the origin

  const tip = species === 'crystal'
    ? new THREE.OctahedronGeometry(0.5, 0)
    : new THREE.IcosahedronGeometry(0.5, 0);

  return { segment, tip };
}

/** how each species branches. Bounded by `depth` at the call site, always. */
export const SPECIES = {
  // tipScale is how much bigger the thing on the end of a branch is than the
  // branch itself. It is the single number that decides whether a structure
  // reads as a tree in leaf or a tree in winter, so it is generous here.
  tree:    { children: [2, 3], spread: 0.62, shrink: 0.70, shorten: 0.74, droop: 0.06, tipScale: 5.0 },
  crystal: { children: [2, 3], spread: 0.64, shrink: 0.76, shorten: 0.68, droop: -0.14, tipScale: 2.2 },
  coral:   { children: [2, 4], spread: 0.92, shrink: 0.66, shorten: 0.66, droop: 0.14, tipScale: 3.0 },
  stalk:   { children: [1, 2], spread: 0.34, shrink: 0.82, shorten: 0.86, droop: 0.02, tipScale: 3.4 },
};

/* ═══════════════════════════════════════════════════════════════════════════
   growth
   ═══════════════════════════════════════════════════════════════════════════ */

const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Grow one branching structure, appending to `segments` and `tips`.
 *
 * Recursion is on `depth` and nothing else — there is no length threshold or
 * instance budget checked in here, because a generator that can decide to stop
 * early is a generator whose cost you cannot predict before you call it.
 *
 * @returns the number of segments produced
 */
export function growBranching({
  rand, species, depth, origin, dir, length, radius, sway = 0, segments, tips,
}) {
  const S = SPECIES[species] || SPECIES.tree;
  let count = 0;

  function grow(pos, direction, len, rad, level, left) {
    _dir.copy(direction).normalize();
    _q.setFromUnitVectors(_up, _dir);

    segments.push({
      position: pos.clone(),
      quaternion: _q.clone(),
      scale: new THREE.Vector3(rad, len, rad),
      level: level / Math.max(1, depth),
      phase: rand() * Math.PI * 2,
      sway,
    });
    count++;

    const tipPos = pos.clone().addScaledVector(_dir, len);

    if (left <= 0) {
      tips.push({
        position: tipPos,
        quaternion: _q.clone(),
        scale: new THREE.Vector3(rad * S.tipScale, rad * S.tipScale, rad * S.tipScale),
        level: 1,
        phase: rand() * Math.PI * 2,
        sway,
      });
      return;
    }

    const n = S.children[0]
            + Math.floor(rand() * (S.children[1] - S.children[0] + 1));
    const spin = rand() * Math.PI * 2;

    for (let i = 0; i < n; i++) {
      // Fan the children evenly around the parent and then jitter, rather than
      // picking free directions. Free directions bunch up often enough that
      // roughly one structure in five grows a bald side.
      const around = spin + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.7;
      _axis.set(Math.cos(around), 0, Math.sin(around));
      // an axis perpendicular to the growth direction, to tilt about
      _axis.cross(_dir).normalize();
      if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);

      const angle = S.spread * (0.6 + rand() * 0.8);
      const child = _dir.clone().applyAxisAngle(_axis, angle);
      child.y -= S.droop * (0.5 + rand());     // gravity, or the lack of it
      child.normalize();

      grow(tipPos, child, len * S.shorten * (0.85 + rand() * 0.3),
           rad * S.shrink, level + 1, left - 1);
    }
  }

  grow(origin.clone(), dir.clone(), length, radius, 0, depth);
  return count;
}

/**
 * A Menger-sponge-like solid: the cube minus its face and body centres, at
 * every scale. Depth 2 is 400 blocks and depth 3 is 8000, so this is capped
 * hard by the tier and depth 3 is high-tier only.
 */
export function growMenger({ depth, size, origin, out }) {
  function carve(cx, cy, cz, s, level) {
    if (level <= 0) {
      out.push({
        position: new THREE.Vector3(cx, cy, cz),
        quaternion: new THREE.Quaternion(),
        scale: new THREE.Vector3(s, s, s),
        level: 1 - level / Math.max(1, depth),
        phase: 0,
        sway: 0,
      });
      return;
    }
    const t = s / 3;
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // the sponge rule: drop anything sitting in the middle of a face or
          // of the body, keep everything on an edge
          if ((x === 0 ? 1 : 0) + (y === 0 ? 1 : 0) + (z === 0 ? 1 : 0) > 1) continue;
          carve(cx + x * t, cy + y * t, cz + z * t, t, level - 1);
        }
      }
    }
  }
  carve(origin.x, origin.y, origin.z, size, depth);
  return out;
}

/**
 * A spire: the same recursion, but each level is a smaller block stacked and
 * twisted on the one below. Cheap — linear in depth, not cubic.
 */
export function growSpire({ depth, size, origin, out, rand }) {
  let y = origin.y;
  let s = size;
  let twist = 0;
  for (let i = 0; i <= depth * 3; i++) {
    const q = new THREE.Quaternion().setFromAxisAngle(_up, twist);
    out.push({
      position: new THREE.Vector3(origin.x, y + s * 0.5, origin.z),
      quaternion: q,
      scale: new THREE.Vector3(s, s * 1.15, s),
      level: i / (depth * 3),
      phase: rand ? rand() * 6.28 : 0,
      sway: 0,
    });
    y += s * 1.02;
    s *= 0.86;
    twist += 0.42;
  }
  return out;
}

/**
 * A crown of arches: columns that rise from a ring and curve inward until they
 * almost meet overhead. This is the one monument you can walk under, which is
 * worth the extra maths — a ring of straight columns reads as a fence, and a
 * fence is a thing that keeps you out.
 */
export function growRing({ depth, size, origin, out, rand }) {
  const arms = 6 + depth * 2;
  const steps = depth * 4 + 6;
  const R = size * 2.3;              // how far out the feet stand
  const H = size * 3.4;              // ...and how high the crown closes
  const K = Math.PI * 0.5 * 0.94;    // just short of meeting, so it stays open

  const dir = new THREE.Vector3();

  for (let a = 0; a < arms; a++) {
    const ang = (a / arms) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = t * K;
      const r = R * Math.cos(u);
      const h = H * Math.sin(u);

      // the tangent of the quarter-ellipse the column follows, so each block
      // sits along the curve instead of being stacked and tilted by eye
      const dr = -R * Math.sin(u);
      const dh = H * Math.cos(u);
      dir.set(ca * dr, dh, sa * dr).normalize();

      const s = size * (0.40 - t * 0.14);
      out.push({
        position: new THREE.Vector3(origin.x + ca * r, origin.y + h, origin.z + sa * r),
        quaternion: new THREE.Quaternion().setFromUnitVectors(_up, dir),
        scale: new THREE.Vector3(s * 1.5, s * 1.5, s * 1.5),
        level: t,
        phase: rand ? rand() * 6.28 : 0,
        sway: 0,
      });
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   rendering
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One InstancedMesh for a whole pile of parts, with the soft shading every
 * fractal in the game shares.
 *
 * `aBloom` is the interesting attribute: it runs 0..1 per instance and is what
 * a structure waking up actually *is*. Instances are written in the order they
 * are handed over, so a caller that keeps its parts contiguous can light one
 * structure by writing a slice of that array and nothing else.
 */
export function createFractalMesh({ parts, geometry, palette, fogDensity, sway = 0 }) {
  const count = parts.length;

  const aTint  = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const aBloom = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const aLevel = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  const aPhase = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
  aBloom.setUsage(THREE.DynamicDrawUsage);

  const low = new THREE.Color(palette.low);
  const high = new THREE.Color(palette.high);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const p = parts[i];
    tmp.copy(low).lerp(high, p.level);
    aTint.array[i * 3] = tmp.r;
    aTint.array[i * 3 + 1] = tmp.g;
    aTint.array[i * 3 + 2] = tmp.b;
    aLevel.array[i] = p.level;
    aPhase.array[i] = p.phase;
  }

  geometry.setAttribute('aTint', aTint);
  geometry.setAttribute('aBloom', aBloom);
  geometry.setAttribute('aLevel', aLevel);
  geometry.setAttribute('aPhase', aPhase);

  const uniforms = {
    uTime:       { value: 0 },
    uMotion:     { value: 1 },
    uSway:       { value: sway },
    uSky:        { value: new THREE.Color(palette.sky) },
    uGroundTint: { value: new THREE.Color(palette.ground) },
    uFogColor:   { value: new THREE.Color(palette.fog) },
    uFogDensity: { value: fogDensity },
    uBloomColor: { value: new THREE.Color(palette.bloom) },
    uAmbient:    { value: palette.ambient ?? 0.8 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      attribute vec3 aTint;
      attribute float aBloom, aLevel, aPhase;
      uniform float uTime, uMotion, uSway;

      varying vec3 vTint, vNormal, vWorld;
      varying float vBloom, vLevel, vDepth;

      void main() {
        vTint = aTint;
        vBloom = aBloom;
        vLevel = aLevel;

        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);

        // Sway the whole instance rather than bending it. Bending would need
        // the segment's own length in the shader and a second attribute to
        // carry it; moving the tips further than the trunk gets ninety per
        // cent of the look from the level we already have.
        float s = uSway * aLevel * aLevel * uMotion;
        float t = uTime * 0.42 + aPhase;
        wp.x += sin(t) * s;
        wp.z += cos(t * 0.83 + 1.4) * s * 0.7;

        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);

        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSky, uGroundTint, uFogColor, uBloomColor;
      uniform float uFogDensity, uAmbient;

      varying vec3 vTint, vNormal, vWorld;
      varying float vBloom, vLevel, vDepth;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);

        // the same soft-clay model the wanderer uses: the tint is the answer,
        // and the sky above / the ground below only shift it
        float up = 0.5 + 0.5 * n.y;
        vec3 col = vTint * uAmbient * (0.46 + 0.88 * up);
        col += mix(uGroundTint, uSky, up) * 0.30;

        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.4);
        col += uSky * rim * 0.35;

        // Awake. Pushed well past 1.0 on purpose — this is the one thing in
        // the scene that is meant to drive the bloom pass by itself, so that
        // a structure coming alive reads as light and not as a colour change.
        col += uBloomColor * vBloom * (0.55 + 1.5 * vLevel);

        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
      }`,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const p = parts[i];
    dummy.position.copy(p.position);
    dummy.quaternion.copy(p.quaternion);
    dummy.scale.copy(p.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = count;

  return {
    mesh,
    uniforms,
    bloom: aBloom,

    /** @param p a world palette; only the keys present are changed */
    setPalette(p) {
      if (p.sky) uniforms.uSky.value.set(p.sky);
      if (p.ground) uniforms.uGroundTint.value.set(p.ground);
      if (p.fog) uniforms.uFogColor.value.set(p.fog);
      if (p.bloom) uniforms.uBloomColor.value.set(p.bloom);
    },

    update(dt, ctx) {
      uniforms.uTime.value = ctx.time;
      uniforms.uMotion.value = ctx.motionScale;
    },

    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   cloud layers
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A few big horizontal sheets of fbm, drifting at different rates. Seen from
 * under them they read as slow weather; seen edge-on from a rise they read as
 * distance. Either way it is one transparent quad per layer and no particles.
 */
export function createClouds({ CONFIG, scene, world, count }) {
  const layers = [];
  const c = world.clouds;
  if (!c || count <= 0) return { update() {}, setPalette() {}, dispose() {} };

  const geo = new THREE.PlaneGeometry(c.size, c.size, 1, 1);
  geo.rotateX(-Math.PI / 2);

  for (let i = 0; i < count; i++) {
    const f = i / Math.max(1, count - 1);
    const uniforms = {
      uTime:   { value: 0 },
      uMotion: { value: 1 },
      uColor:  { value: new THREE.Color(c.color) },
      uAmount: { value: c.amount * (1 - f * 0.35) },
      uScale:  { value: c.scale * (1 + f * 0.8) },
      uDrift:  { value: c.drift * (1 + f * 0.6) },
      uFade:   { value: c.size * 0.5 },
    };
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec2 vXZ;
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vXZ = position.xz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uMotion, uAmount, uScale, uDrift, uFade;
        uniform vec3 uColor;
        varying vec2 vXZ;
        varying vec3 vWorld;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }

        void main() {
          float t = uTime * uMotion * uDrift;
          vec2 p = vXZ * uScale + vec2(t, t * 0.4);
          float n = noise(p) * 0.55 + noise(p * 2.13 - vec2(t * 0.6, 0.0)) * 0.30
                  + noise(p * 4.7) * 0.15;
          n = pow(max(0.0, n - 0.28) / 0.72, 1.9);

          // fade to nothing at the rim, or the sheet ends in a visible edge
          float edge = 1.0 - smoothstep(0.55, 1.0, length(vXZ) / uFade);
          gl_FragColor = vec4(uColor, n * uAmount * edge);
        }`,
    }));
    mesh.position.y = c.height + i * c.spacing;
    mesh.renderOrder = -2;
    mesh.frustumCulled = false;
    scene.add(mesh);
    layers.push({ mesh, uniforms });
  }

  return {
    setPalette(p) {
      if (p.cloud) for (const l of layers) l.uniforms.uColor.value.set(p.cloud);
    },
    update(dt, ctx) {
      for (const l of layers) {
        l.uniforms.uTime.value = ctx.time;
        l.uniforms.uMotion.value = ctx.motionScale;
        // ride with the wanderer so the sheets never run out overhead
        l.mesh.position.x = ctx.cameraPosition.x;
        l.mesh.position.z = ctx.cameraPosition.z;
      }
    },
    dispose() {
      for (const l of layers) {
        scene.remove(l.mesh);
        l.mesh.material.dispose();
      }
      geo.dispose();
    },
  };
}
