import * as THREE from 'three';
import { mulberry32 } from './textures.js';
import { discoveriesOf, RARITY } from './discoveries.js';
import { gateSpot } from './gate.js';

/**
 * Dream fragments — the things in the ground that are worth finding.
 *
 * Structurally these are close cousins of the motes: two InstancedMeshes, a
 * fixed small capacity, everything driven by instanced attributes so a whole
 * world's worth costs two draw calls. What is different is that there are
 * almost none of them and each one is a specific named thing. A world holds
 * eight; the ones already in the archive are simply not placed, so a world you
 * have picked clean has none left and a world you have never finished still
 * has exactly what you missed.
 *
 * Placement is seeded off the world's own seed, so a fragment is in the same
 * place on every visit and across every device — findable, memorable, and not
 * a lottery. It is *not* marked on anything: the only help is that the world
 * reacts as you get near, and the companion notices before you do.
 */

/* how close before a fragment starts to notice you at all */
const NOTICE = 26;

export function createFragments({ CONFIG, quality, scene, world, terrain, archive }) {
  const D = CONFIG.discoveries;

  /* ── which of this world's discoveries are still out there ──────────── */
  const found = archive.foundIn(world.key);
  const all = discoveriesOf(world.key);
  const state = archive.worldState(world.key);

  /** is a locked discovery's condition met yet? */
  function available(d) {
    if (!d.needs) return true;
    const n = d.needs;
    if (n.awake !== undefined && state.bestAwakened < n.awake) return false;
    if (n.delivered !== undefined && state.delivered < n.delivered) return false;
    if (n.visits !== undefined && state.visits < n.visits) return false;
    if (n.found !== undefined && !n.found.every((id) => found.includes(id))) return false;
    return true;
  }

  const pending = all.filter((d) => !found.includes(d.id) && available(d));

  /* ── where each one sits ─────────────────────────────────────────────
   *
   * Seeded from the world seed and the discovery's position in the list, so
   * the same fragment is in the same place every time without any of them
   * having to be authored by hand. Each placement kind is a band of the
   * island; the seed picks the spot within it.
   */
  const G = world.ground;
  const gateAt = gateSpot(CONFIG, world);

  function placeOne(d, i) {
    const rand = mulberry32((world.seed ^ 0x9e3779b9) + i * 7919);
    const a = rand() * Math.PI * 2;
    let r;

    switch (d.place) {
      case 'monument':
        r = G.plazaRadius * (0.45 + rand() * 0.75);
        break;
      case 'rim':
        // out where the ground starts to climb, but inside the lean-back
        r = G.radius * (0.78 + rand() * 0.08);
        break;
      case 'fog':
        // past the rim, where you have to walk into the white to see it
        r = G.radius * (0.87 + rand() * 0.05);
        break;
      case 'water':
        // the pools sit in the lows; hunt the middle band and take the
        // lowest ground the seed offers, so it lands near the waterline
        r = G.radius * (0.30 + rand() * 0.35);
        break;
      case 'gate':
        return { x: gateAt.x + Math.cos(a) * 7, z: gateAt.z + Math.sin(a) * 7 };
      case 'grove':
      case 'wander':
      default:
        r = G.plazaRadius * 1.5 + Math.sqrt(rand()) * (G.radius * 0.72 - G.plazaRadius * 1.5);
    }
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  }

  const capacity = Math.max(1, pending.length);
  const items = [];
  for (let i = 0; i < pending.length; i++) {
    const d = pending[i];
    // index within the world's full list, so a spot never moves as things
    // are found and the pending list shortens
    const at = placeOne(d, all.indexOf(d));
    const ground = terrain.heightAt(at.x, at.z);
    const rar = RARITY[d.rarity] || RARITY.common;
    items.push({
      d,
      x: at.x, z: at.z,
      baseY: ground + D.hover,
      y: ground + D.hover,
      rarity: rar,
      phase: Math.random() * Math.PI * 2,
      near: 0,          // 0..1, how aware of the player it is
      taking: 0,        // 0..1, the gathering animation
      gone: false,
      scale: 0,
    });
  }

  /* ── the body: a small faceted thing, brighter than a mote ──────────── */
  const geometry = new THREE.OctahedronGeometry(0.5, 0);
  const aTint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const aGlow = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  aTint.setUsage(THREE.DynamicDrawUsage);
  aGlow.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aTint', aTint);
  geometry.setAttribute('aGlow', aGlow);

  const uniforms = { uFogDensity: { value: world.fog.density } };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aTint;
      attribute float aGlow;
      varying vec3 vTint;
      varying float vGlow, vFacing, vDepth;
      void main() {
        vTint = aTint;
        vGlow = aGlow;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        vFacing = abs(n.z);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFogDensity;
      varying vec3 vTint;
      varying float vGlow, vFacing, vDepth;
      void main() {
        if (vGlow <= 0.001) discard;
        vec3 col = vTint * vGlow * (0.45 + 0.85 * vFacing);
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(col, (1.0 - fog));
      }`,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.count = 0;
  scene.add(mesh);

  /* ── the halo ────────────────────────────────────────────────────────── */
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const gTint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const gPower = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  gTint.setUsage(THREE.DynamicDrawUsage);
  gPower.setUsage(THREE.DynamicDrawUsage);
  glowGeo.setAttribute('gTint', gTint);
  glowGeo.setAttribute('gPower', gPower);

  const glowMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 gTint;
      attribute float gPower;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vPower, vDepth;
      void main() {
        vUv = uv;
        vTint = gTint;
        vPower = gPower;
        vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        vDepth = -centre.z;
        gl_Position = projectionMatrix * vec4(centre.xyz + vec3(position.xy * s, 0.0), 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uFogDensity;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vPower, vDepth;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float f = max(0.0, 1.0 - d);
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(vTint * (pow(f, 2.2) * 0.30 + pow(f, 7.0) * 1.4) * vPower * (1.0 - fog), 1.0);
      }`,
  });

  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, capacity);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 3;
  glowMesh.count = 0;
  scene.add(glowMesh);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color(world.palette.mote);
  const bright = new THREE.Color(world.palette.bloom);
  const live = [];

  let onFound = null;
  let onNear = null;

  return {
    mesh,
    glowMesh,

    /** how many of this world's memories are still out there to be found */
    get remaining() { return items.filter((i) => !i.gone).length; },
    get placed() { return items.length; },

    /** called with the discovery record the moment one is taken */
    set onFound(fn) { onFound = fn; },
    /** called with a fragment the first time the player comes near it */
    set onNear(fn) { onNear = fn; },

    setPalette(p) {
      if (p.mote) tint.set(p.mote);
      if (p.bloom) bright.set(p.bloom);
    },

    setFogDensity(d) { uniforms.uFogDensity.value = d; },

    /**
     * The nearest fragment the player has not taken, within `within` — what
     * the companion drifts toward and the eyes follow.
     */
    nearestTo(x, z, within) {
      let best = null, bestD2 = within * within;
      for (const it of items) {
        if (it.gone) continue;
        const dx = it.x - x, dz = it.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = it; }
      }
      return best;
    },

    update(dt, ctx, who) {
      const m = ctx.motionScale;
      live.length = 0;

      for (const it of items) {
        if (it.gone) continue;

        const dx = who.x - it.x, dz = who.z - it.z;
        const d2 = dx * dx + dz * dz;

        // Awareness. A fragment knows you are coming long before you can
        // reach it, and what it does about it is get slightly brighter and
        // rise slightly — enough that a player scanning the horizon sees
        // something change, never enough to be a waypoint.
        const want = d2 > NOTICE * NOTICE ? 0
          : 1 - Math.sqrt(d2) / NOTICE;
        if (want > 0.35 && it.near <= 0.35) onNear?.(it);
        it.near = THREE.MathUtils.damp(it.near, want, 1.6, dt);

        it.phase += dt * (0.5 + it.near * 0.8) * m;

        if (it.taking > 0) {
          /* being taken: it comes to the chest and folds itself away */
          it.taking = Math.min(1, it.taking + dt / D.takeSeconds);
          const k = it.taking * it.taking;
          it.x += (who.x - it.x) * k * 0.22;
          it.z += (who.z - it.z) * k * 0.22;
          it.y += ((who.y + 1.0) - it.y) * k * 0.22;
          it.scale = it.rarity.size * (1 - k) * (1 + it.taking * 0.8);
          if (it.taking >= 1) {
            it.gone = true;
            onFound?.(it.d, it);
            continue;
          }
        } else {
          // resting: a slow hover, rising a little as you approach
          it.y = it.baseY + Math.sin(it.phase) * D.bob + it.near * D.rise;
          it.scale = THREE.MathUtils.damp(
            it.scale, it.rarity.size * (1 + it.near * 0.25), 2.2, dt);
          if (d2 < D.takeRadius * D.takeRadius) it.taking = 0.001;
        }

        live.push(it);
      }

      /* ── pack ──────────────────────────────────────────────────────── */
      for (let i = 0; i < live.length; i++) {
        const it = live[i];
        const pulse = 0.85 + 0.15 * Math.sin(it.phase * 1.7);
        // rarer things burn brighter, and everything burns brighter when it
        // has noticed you
        const power = it.rarity.glow * pulse * (0.55 + 0.9 * it.near)
                    * (1 + it.taking * 2.2);

        dummy.position.set(it.x, it.y, it.z);
        dummy.rotation.set(it.phase * 0.4, it.phase * 0.7, it.phase * 0.2);
        dummy.scale.setScalar(it.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        aGlow.array[i] = power;
        aTint.array[i * 3] = bright.r;
        aTint.array[i * 3 + 1] = bright.g;
        aTint.array[i * 3 + 2] = bright.b;

        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(it.scale * D.glowRadius);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(i, dummy.matrix);

        gPower.array[i] = power * D.glowPower;
        gTint.array[i * 3] = tint.r;
        gTint.array[i * 3 + 1] = tint.g;
        gTint.array[i * 3 + 2] = tint.b;
      }

      mesh.count = live.length;
      glowMesh.count = live.length;
      if (live.length) {
        mesh.instanceMatrix.needsUpdate = true;
        glowMesh.instanceMatrix.needsUpdate = true;
        aGlow.needsUpdate = true;
        aTint.needsUpdate = true;
        gPower.needsUpdate = true;
        gTint.needsUpdate = true;
      }
    },

    /** the lit ones, for the ground shader's light list */
    lights(out, k, point) {
      for (const it of live) {
        if (it.near < 0.15) continue;
        const dx = it.x - point.x, dy = it.y - point.y, dz = it.z - point.z;
        it.dist2 = dx * dx + dy * dy + dz * dz;
        it.tint = bright;
        it.vis = it.near;
        it.glow = it.rarity.glow * (0.5 + it.taking * 2);
        if (out.length < k) out.push(it);
      }
      return out;
    },

    dispose() {
      scene.remove(mesh);
      scene.remove(glowMesh);
      geometry.dispose();
      material.dispose();
      mesh.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      glowMesh.dispose();
      items.length = 0;
      live.length = 0;
    },
  };
}
