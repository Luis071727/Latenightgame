import * as THREE from 'three';
import { mulberry32 } from './textures.js';
import { softBoxGeometry } from './fractals.js';
import { DISCOVERIES, RARITY, discovery } from './discoveries.js';

/**
 * The sanctuary, standing up.
 *
 * Everywhere else in the game is a place things are found. This is the place
 * they are kept, and the whole job of this module is to make that a room you
 * can walk around rather than a number in a menu. Four things do it, and they
 * answer four different questions a player has when they come home:
 *
 *   the gallery      what have I found? — one slot per memory in the game,
 *                    grouped into four constellations, lit if it is yours and
 *                    left as a dim empty socket if it is not. The gaps are the
 *                    half that does the work: a journal can list what you are
 *                    missing, but a room with holes in it is a room you want
 *                    to fill.
 *
 *   the cairn        how far have I come? — a slow spiral of stones rising
 *                    around the monument, one for every memory kept, coloured
 *                    by how rare it was. It is the only thing in the game that
 *                    grows purely because you did something, and you can count
 *                    it.
 *
 *   the world marks  where have I been? — four standing stones, one per world.
 *                    Dark until you have walked there, and rising and
 *                    brightening as you come to know it. How many are lit is
 *                    the count of worlds visited, told as architecture instead
 *                    of as a statistic.
 *
 *   the constellations  how much of each place is mine? — a cluster of stars
 *                    over each world's arc, of which the fraction alight is
 *                    that world's completion. Finish a world and its stars are
 *                    all out at once.
 *
 * Four InstancedMeshes for the entire room however full it gets, so the cost
 * is fixed and small — the same trick the motes and the fragments use, and the
 * reason a personal museum of fifty objects does not cost fifty draw calls.
 */
export function createSanctuaryDisplay({ CONFIG, quality, scene, world, terrain, archive }) {
  const S = CONFIG.sanctuary;
  const worldKeys = Object.keys(DISCOVERIES);
  const extras = quality.sanctuaryExtras !== false;

  const uniforms = { uFogDensity: { value: world.fog.density } };

  /* ═════════════════════════════════════════════════════════════════════════
     the gallery
     ═════════════════════════════════════════════════════════════════════════ */

  /* Four arcs on a ring around the middle, each world getting a quarter of the
   * circle with a gap either side so the groups read as four separate
   * constellations rather than one undifferentiated fence.
   *
   * A world holds a dozen memories now, which is too many for one arc without
   * them becoming a picket line, so they alternate between an inner and an
   * outer row. That reads as a cluster — which is what a constellation is —
   * and it halves how far along the arc the eye has to travel.
   */
  const slots = [];

  worldKeys.forEach((key, w) => {
    const list = DISCOVERIES[key];
    const found = archive.foundIn(key);
    const centre = (w / worldKeys.length) * Math.PI * 2;
    const perRow = Math.ceil(list.length / S.rows);

    list.forEach((d, i) => {
      const row = i % S.rows;
      const at = Math.floor(i / S.rows);
      const t = perRow > 1 ? at / (perRow - 1) - 0.5 : 0;
      // stagger the rows against each other so nothing stands directly behind
      // anything else from the middle of the room
      const angle = centre + (t + (row ? 0.5 / perRow : 0)) * S.arc;
      const rar = RARITY[d.rarity] || RARITY.common;
      // rarer things stand further out and a little higher, so the eye finds
      // them without anything having to be labelled
      const radius = S.radius + row * S.rowGap + (rar.glow - 0.85) * S.rarityPush;
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

  mesh.count = slots.length;
  glowMesh.count = slots.length;

  /* ═════════════════════════════════════════════════════════════════════════
     the stonework — the cairn, and the four world marks
     ═════════════════════════════════════════════════════════════════════════

     Both are solid rather than additive on purpose. Everything else in this
     room is light, and a place made entirely of light has no architecture in
     it; these two are the only things here that you could lean on.
     ═════════════════════════════════════════════════════════════════════════ */

  const stones = [];
  const summary = archive.summary();

  /* ── the cairn: one stone per memory kept ────────────────────────────────
   * A spiral rising around the monument, tapering as it goes, so the shape it
   * makes is a tower under construction rather than a pile. Coloured by the
   * rarity of the memory it stands for, in the order they were found — so it
   * is not merely how many, it is *which*, and a run of rare finds shows in it.
   */
  const kept = [];
  for (const key of worldKeys) {
    for (const id of archive.foundIn(key)) {
      const d = discovery(id);
      kept.push(RARITY[d?.rarity] || RARITY.common);
    }
  }

  const base = terrain.heightAt(0, 0);
  const C = S.cairn;
  const cairnMax = Math.max(1, C.max);
  for (let i = 0; i < Math.min(kept.length, cairnMax); i++) {
    const t = i / cairnMax;
    // the golden angle, so however many there are they never line up into
    // a fence or a seam
    const a = i * 2.39996323;
    const radius = C.radius * (1 - t * C.taper);
    stones.push({
      x: Math.cos(a) * radius,
      y: base + C.lift + t * C.rise,
      z: Math.sin(a) * radius,
      size: C.stone * (0.85 + (kept[i].glow - 0.85) * 0.5),
      tall: 1,
      spin: a,
      glow: C.glow * kept[i].glow,
      phase: i * 0.4,
      lit: 1,
    });
  }

  /* ── the world marks: one standing stone per world ───────────────────────
   * At the head of its arc, just inside the gallery. Dark until you have been
   * there; then it stands up out of the floor and brightens as the place comes
   * to be known. Counting the lit ones is how many worlds you have walked in,
   * which is a thing this room ought to be able to tell you without a number.
   */
  const M = S.marks;
  const markIndex = stones.length;
  worldKeys.forEach((key, w) => {
    const angle = (w / worldKeys.length) * Math.PI * 2;
    const x = Math.cos(angle) * M.radius;
    const z = Math.sin(angle) * M.radius;
    const state = archive.worldState(key);
    const visited = state.visits > 0;
    const known = archive.mastery(key).value;
    stones.push({
      x,
      y: terrain.heightAt(x, z) + M.lift + (visited ? M.rise * known : 0) * 0.5,
      z,
      size: M.width,
      // an unvisited mark is still there, sunk down to almost nothing — the
      // same idea as an empty gallery slot, and for the same reason
      tall: (M.height * (visited ? M.stub + (1 - M.stub) * known : M.stub * 0.6)) / M.width,
      spin: -angle,
      glow: visited ? M.glow * (0.35 + 0.65 * known) : 0,
      phase: w * 1.3,
      lit: visited ? 1 : 0,
    });
  });

  let stoneMesh = null;
  let sTint = null, sGlow = null, stoneGeo = null, stoneMat = null;

  if (stones.length) {
    stoneGeo = softBoxGeometry(0.28, Math.max(1, quality.blockSegments));
    sTint = new THREE.InstancedBufferAttribute(new Float32Array(stones.length * 3), 3);
    sGlow = new THREE.InstancedBufferAttribute(new Float32Array(stones.length), 1);
    sTint.setUsage(THREE.DynamicDrawUsage);
    sGlow.setUsage(THREE.DynamicDrawUsage);
    stoneGeo.setAttribute('sTint', sTint);
    stoneGeo.setAttribute('sGlow', sGlow);

    stoneMat = new THREE.ShaderMaterial({
      uniforms: {
        uFogDensity: uniforms.uFogDensity,
        uFogColor: { value: new THREE.Color(world.palette.fog) },
        uStone:    { value: new THREE.Color(world.palette.fractalLow) },
        uSky:      { value: new THREE.Color(world.palette.skyTopA) },
      },
      vertexShader: /* glsl */`
        attribute vec3 sTint;
        attribute float sGlow;
        varying vec3 vTint, vNormal;
        varying float vGlow, vDepth, vUp;
        void main() {
          vTint = sTint; vGlow = sGlow;
          vNormal = normalize(mat3(instanceMatrix) * normal);
          vUp = position.y + 0.5;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFogColor, uStone, uSky;
        uniform float uFogDensity;
        varying vec3 vTint, vNormal;
        varying float vGlow, vDepth, vUp;
        void main() {
          // plain stone, lit by the sky above it and nothing else
          float up = 0.5 + 0.5 * vNormal.y;
          vec3 col = uStone * (0.42 + 0.58 * up) + uSky * up * 0.20;
          // ...and whatever it is carrying, strongest at the top of the block
          col += vTint * vGlow * (0.35 + 0.65 * vUp);
          float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
          gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
        }`,
    });

    stoneMesh = new THREE.InstancedMesh(stoneGeo, stoneMat, stones.length);
    stoneMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    stoneMesh.frustumCulled = false;
    stoneMesh.renderOrder = -3;
    scene.add(stoneMesh);
  }

  /* ═════════════════════════════════════════════════════════════════════════
     the constellations
     ═════════════════════════════════════════════════════════════════════════

     A cluster of stars over each world's arc. How many of them are alight is
     that world's completion, so a world you have finished has its whole
     constellation out and a world you have barely touched has one or two.
     Seeded off the world's own seed, so a constellation is the same shape on
     every visit and on every device — it is that world's sign, not decoration.
     ═════════════════════════════════════════════════════════════════════════ */

  const K = S.stars;
  const perWorld = extras ? Math.max(0, Math.round(K.count * (quality.particleScale ?? 1))) : 0;
  const starSlots = [];

  if (perWorld > 0) {
    worldKeys.forEach((key, w) => {
      const rand = mulberry32(1000 + w * 7919);
      const centre = (w / worldKeys.length) * Math.PI * 2;
      const total = Math.max(1, DISCOVERIES[key].length);
      const done = archive.foundIn(key).length / total;
      // how many of this world's stars are out — always at least a spark once
      // anything at all has been found there, so the sky never lies by silence
      const alight = done > 0 ? Math.max(1, Math.round(done * perWorld)) : 0;

      for (let i = 0; i < perWorld; i++) {
        const angle = centre + (rand() - 0.5) * K.arc;
        const radius = K.radius * (0.82 + rand() * 0.36);
        starSlots.push({
          x: Math.cos(angle) * radius,
          y: base + K.height + (rand() - 0.5) * K.spread,
          z: Math.sin(angle) * radius,
          size: K.size * (0.7 + rand() * 0.7),
          lit: i < alight,
          phase: rand() * Math.PI * 2,
        });
      }
    });
  }

  let starMesh = null;
  let kTint = null, kPower = null, starGeo = null, starMat = null;

  if (starSlots.length) {
    starGeo = new THREE.PlaneGeometry(1, 1);
    kTint = new THREE.InstancedBufferAttribute(new Float32Array(starSlots.length * 3), 3);
    kPower = new THREE.InstancedBufferAttribute(new Float32Array(starSlots.length), 1);
    kTint.setUsage(THREE.DynamicDrawUsage);
    kPower.setUsage(THREE.DynamicDrawUsage);
    starGeo.setAttribute('gTint', kTint);
    starGeo.setAttribute('gPower', kPower);

    // the same billboard the haloes use — a separate material only because it
    // needs its own attribute buffers, not because it does anything different
    starMat = glowMat.clone();
    starMat.uniforms = glowMat.uniforms;

    starMesh = new THREE.InstancedMesh(starGeo, starMat, starSlots.length);
    starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    starMesh.frustumCulled = false;
    starMesh.renderOrder = 3;
    scene.add(starMesh);
  }

  /* ═════════════════════════════════════════════════════════════════════════
     running it
     ═════════════════════════════════════════════════════════════════════════ */

  const dummy = new THREE.Object3D();
  const lit = new THREE.Color(world.palette.bloom);
  const dim = new THREE.Color(world.palette.fractalLow);
  const halo = new THREE.Color(world.palette.mote);

  /* The stonework and the stars are placed once and then left alone — none of
     it moves, and none of it can change without leaving the room and coming
     back. Writing their matrices every frame would be sixty times a second of
     work to arrive at the same numbers. */
  let stoneWritten = false;
  let starsWritten = false;

  function writeStones() {
    if (!stoneMesh) return;
    for (let i = 0; i < stones.length; i++) {
      const s = stones[i];
      dummy.position.set(s.x, s.y + (s.tall * s.size) * 0.5, s.z);
      dummy.rotation.set(0, s.spin, 0);
      dummy.scale.set(s.size, s.size * s.tall, s.size);
      dummy.updateMatrix();
      stoneMesh.setMatrixAt(i, dummy.matrix);
      sGlow.array[i] = s.glow;
      const c = s.lit ? lit : dim;
      sTint.array[i * 3] = c.r;
      sTint.array[i * 3 + 1] = c.g;
      sTint.array[i * 3 + 2] = c.b;
    }
    stoneMesh.instanceMatrix.needsUpdate = true;
    sGlow.needsUpdate = true;
    sTint.needsUpdate = true;
    stoneWritten = true;
  }

  function writeStars() {
    if (!starMesh) return;
    for (let i = 0; i < starSlots.length; i++) {
      const s = starSlots[i];
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(s.size);
      dummy.updateMatrix();
      starMesh.setMatrixAt(i, dummy.matrix);
      kPower.array[i] = s.lit ? K.glow : K.unlitGlow;
      kTint.array[i * 3] = halo.r;
      kTint.array[i * 3 + 1] = halo.g;
      kTint.array[i * 3 + 2] = halo.b;
    }
    starMesh.instanceMatrix.needsUpdate = true;
    kPower.needsUpdate = true;
    kTint.needsUpdate = true;
    starsWritten = true;
  }

  return {
    mesh,
    glowMesh,
    stoneMesh,
    starMesh,
    get slots() { return slots.length; },
    get found() { return slots.filter((s) => s.found).length; },
    /** how many world marks are standing lit — i.e. worlds walked in */
    get worldsLit() { return summary.worldsVisited; },
    get stones() { return stones.length; },
    get constellationStars() { return starSlots.length; },

    setPalette(p) {
      if (p.bloom) lit.set(p.bloom);
      if (p.fractalLow) dim.set(p.fractalLow);
      if (p.mote) halo.set(p.mote);
      if (stoneMat) {
        if (p.fractalLow) stoneMat.uniforms.uStone.value.set(p.fractalLow);
        if (p.skyTopA) stoneMat.uniforms.uSky.value.set(p.skyTopA);
        if (p.fog) stoneMat.uniforms.uFogColor.value.set(p.fog);
      }
      // the mood drifts, so the fixed instances need re-tinting when it does
      stoneWritten = false;
      starsWritten = false;
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

      if (!stoneWritten) writeStones();
      if (!starsWritten) writeStars();

      /* The gallery is the one place in the game where dozens of lit things
         stand close together *by design*, so it is also where additive haloes
         stack worst — a finished world's arc is a wall of overlapping cards.
         Eased down by how many of this world's memories are actually burning,
         which keeps a full arc bright without letting it turn into a bar of
         white across the horizon. */
      const crowd = 1 / (1 + S.crowdSoften * Math.max(0, this.found - S.crowdFree));

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

        gPower.array[i] = s.found ? power * S.glowPower * crowd : 0;
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
      if (stoneMesh) {
        scene.remove(stoneMesh);
        stoneGeo.dispose();
        stoneMat.dispose();
        stoneMesh.dispose();
      }
      if (starMesh) {
        scene.remove(starMesh);
        starGeo.dispose();
        starMat.dispose();
        starMesh.dispose();
      }
      slots.length = 0;
      stones.length = 0;
      starSlots.length = 0;
    },
  };
}
