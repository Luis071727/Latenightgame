import * as THREE from 'three';
import { DISCOVERIES, RARITY } from './discoveries.js';

/**
 * The memories, standing up.
 *
 * Everything the archive holds, arranged around the sanctuary's plaza as four
 * arcs of eight — one arc per world, in the order you would walk them. A found
 * memory burns; an unfound one is still there as a dim, empty place waiting for
 * something. That second half is the entire point of building this: a journal
 * can list what you are missing, but a *room* with gaps in it is a room you
 * want to fill.
 *
 * Two InstancedMeshes for the whole thing however much has been found, so the
 * cost is fixed and small — this is the same trick the motes and the fragments
 * use, and the reason a personal gallery of thirty-two objects does not cost
 * thirty-two draw calls.
 */
export function createSanctuaryDisplay({ CONFIG, scene, world, terrain, archive }) {
  const S = CONFIG.sanctuary;

  /* ── lay out the slots ──────────────────────────────────────────────────
   *
   * Four arcs on a ring around the middle. Each world gets a quarter of the
   * circle with a gap either side, so the groups read as four separate
   * constellations rather than one undifferentiated fence.
   */
  const slots = [];
  const worldKeys = Object.keys(DISCOVERIES);

  worldKeys.forEach((key, w) => {
    const list = DISCOVERIES[key];
    const found = archive.foundIn(key);
    const centre = (w / worldKeys.length) * Math.PI * 2;

    list.forEach((d, i) => {
      const t = list.length > 1 ? i / (list.length - 1) - 0.5 : 0;
      const angle = centre + t * S.arc;
      const rar = RARITY[d.rarity] || RARITY.common;
      // rarer things stand further out and a little higher, so the eye finds
      // them without anything having to be labelled
      const radius = S.radius + (rar.glow - 0.85) * S.rarityPush;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      slots.push({
        id: d.id,
        world: key,
        x, z,
        y: terrain.heightAt(x, z) + S.lift + (rar.glow - 0.85) * S.rarityRise,
        rarity: rar,
        found: found.includes(d.id),
        phase: (w * 1.7) + i * 0.6,
      });
    });
  });

  const capacity = Math.max(1, slots.length);

  /* ── the bodies ───────────────────────────────────────────────────────── */
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
        vTint = aTint; vGlow = aGlow;
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
        vec3 col = vTint * vGlow * (0.40 + 0.90 * vFacing);
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(col, (1.0 - fog));
      }`,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  scene.add(mesh);

  /* ── the haloes ───────────────────────────────────────────────────────── */
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
        vUv = uv; vTint = gTint; vPower = gPower;
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
        gl_FragColor = vec4(vTint * (pow(f, 2.2) * 0.28 + pow(f, 7.0) * 1.3) * vPower * (1.0 - fog), 1.0);
      }`,
  });

  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, capacity);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 3;
  scene.add(glowMesh);

  const dummy = new THREE.Object3D();
  const lit = new THREE.Color(world.palette.bloom);
  const dim = new THREE.Color(world.palette.fractalLow);
  const halo = new THREE.Color(world.palette.mote);

  mesh.count = slots.length;
  glowMesh.count = slots.length;

  return {
    mesh,
    glowMesh,
    get slots() { return slots.length; },
    get found() { return slots.filter((s) => s.found).length; },

    setPalette(p) {
      if (p.bloom) lit.set(p.bloom);
      if (p.fractalLow) dim.set(p.fractalLow);
      if (p.mote) halo.set(p.mote);
    },

    /** the nearest memory to a point, for the wanderer to look at */
    nearestTo(x, z, within) {
      let best = null, bestD2 = within * within;
      for (const s of slots) {
        const dx = s.x - x, dz = s.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = s; }
      }
      return best;
    },

    update(dt, ctx) {
      const t = ctx.time * ctx.motionScale;

      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        const breathe = 0.85 + 0.15 * Math.sin(t * 0.5 + s.phase);

        // a found memory turns slowly and burns; an empty place barely
        // registers, which is exactly how a gap should feel
        const scale = s.found ? s.rarity.size * S.foundScale : S.emptySize;
        const power = s.found ? s.rarity.glow * breathe : S.emptyGlow;
        const col = s.found ? lit : dim;

        dummy.position.set(s.x, s.y + Math.sin(t * 0.35 + s.phase) * S.bob, s.z);
        dummy.rotation.set(0, s.found ? t * 0.18 + s.phase : s.phase, 0.4);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        aGlow.array[i] = power;
        aTint.array[i * 3] = col.r;
        aTint.array[i * 3 + 1] = col.g;
        aTint.array[i * 3 + 2] = col.b;

        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(scale * S.glowRadius);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(i, dummy.matrix);

        gPower.array[i] = s.found ? power * S.glowPower : 0;
        gTint.array[i * 3] = halo.r;
        gTint.array[i * 3 + 1] = halo.g;
        gTint.array[i * 3 + 2] = halo.b;
      }

      mesh.instanceMatrix.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
      aGlow.needsUpdate = true;
      aTint.needsUpdate = true;
      gPower.needsUpdate = true;
      gTint.needsUpdate = true;
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
      slots.length = 0;
    },
  };
}
