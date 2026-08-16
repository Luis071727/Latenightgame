import * as THREE from 'three';

/**
 * Light-motes.
 *
 * They drift over the world until the wanderer passes close, then they follow.
 * After a while — or straight away, if you happen to be near the monument —
 * they let go and stream into it, and the monument brightens by however many
 * have arrived. That is the entire loop: walk near a thing, it comes with you,
 * it goes somewhere, the world is a little more lit than it was.
 *
 * Nothing is required. A mote you never walk near drifts for as long as you
 * leave it, and the world is perfectly fine unlit.
 *
 * Structurally this is the old lantern system: one InstancedMesh for the
 * bodies and one for their glow cards, a fixed capacity with slots recycled
 * from a free list, and per-mote colour and opacity carried as instanced
 * attributes. Nothing is allocated while the scene runs.
 */
export function createMotes({ CONFIG, quality, scene }) {
  const capacity = quality.maxMotes;
  const M = CONFIG.motes;

  /* ── the mote itself: a small faceted bead ─────────────────────────── */
  const geometry = new THREE.IcosahedronGeometry(0.5, 0);

  const aOpacity = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const aTint    = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const aGlow    = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  aOpacity.setUsage(THREE.DynamicDrawUsage);
  aTint.setUsage(THREE.DynamicDrawUsage);
  aGlow.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOpacity', aOpacity);
  geometry.setAttribute('aTint', aTint);
  geometry.setAttribute('aGlow', aGlow);

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    // Additive keeps overlapping motes order-independent, which matters
    // because instances in a single mesh cannot be depth-sorted against each
    // other. They are light, so adding is also what they should do.
    blending: THREE.AdditiveBlending,
    uniforms: { uFogDensity: { value: CONFIG.world.fogDensity } },
    vertexShader: /* glsl */`
      attribute float aOpacity;
      attribute vec3  aTint;
      attribute float aGlow;

      varying float vOpacity, vGlow, vDepth, vFacing;
      varying vec3  vTint;

      void main() {
        vOpacity = aOpacity;
        vTint = aTint;
        vGlow = aGlow;

        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        vFacing = abs(n.z);          // facets facing us read brightest
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFogDensity;
      varying float vOpacity, vGlow, vDepth, vFacing;
      varying vec3  vTint;

      void main() {
        if (vOpacity <= 0.001) discard;
        vec3 col = vTint * vGlow * (0.55 + 0.75 * vFacing);
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(col, vOpacity * (1.0 - fog));
      }`,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;      // small and cheap; culling costs more
  mesh.renderOrder = 2;
  mesh.count = 0;
  scene.add(mesh);

  /* ── the halo, as instanced billboards ─────────────────────────────── */
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const gTint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
  const gPower = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  gTint.setUsage(THREE.DynamicDrawUsage);
  gPower.setUsage(THREE.DynamicDrawUsage);
  glowGeo.setAttribute('gTint', gTint);
  glowGeo.setAttribute('gPower', gPower);

  const glowMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uFogDensity: { value: CONFIG.world.fogDensity } },
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
        // billboard: the instance's origin in view space, offset by the quad
        // corner, so the card faces whichever camera is drawing
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
        gl_FragColor = vec4(vTint * (pow(f, 2.3) * 0.32 + pow(f, 6.0) * 1.5) * vPower * (1.0 - fog), 1.0);
      }`,
  });

  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, capacity);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 3;
  glowMesh.count = 0;
  scene.add(glowMesh);

  /* ── state, one plain object per slot, never reallocated ───────────── */
  const FREE = 0, HELD = 1, STREAMING = 2;

  const slots = [];
  for (let i = 0; i < capacity; i++) {
    slots.push({
      active: false,
      state: FREE,
      x: 0, y: 0, z: 0, homeY: 0,
      vx: 0, vy: 0, vz: 0,
      phase: 0, orbit: 0, size: 1, scale: 0,
      life: 0, held: 0, alpha: 0, vis: 0, glow: 1, dist2: 0,
      tint: new THREE.Color(),
    });
  }
  const active = [];
  const nearest = [];

  const dummy = new THREE.Object3D();
  const warm = new THREE.Color(CONFIG.palette.mote);
  const cool = new THREE.Color(CONFIG.palette.bloom);

  let freeCount = 0;
  let heldCount = 0;
  // fired the moment a free mote decides to come along, so the wanderer can
  // acknowledge it. Installed by the caller; absent by default.
  let onGather = null;

  function spawn(x, y, z) {
    if (active.length >= capacity) return null;   // never evict a held mote
    let s = null;
    for (let i = 0; i < slots.length; i++) {
      if (!slots[i].active) { s = slots[i]; break; }
    }
    if (!s) return null;

    s.active = true;
    s.state = FREE;
    s.x = x; s.y = y; s.z = z;
    s.homeY = y;
    s.vx = 0; s.vy = 0; s.vz = 0;
    s.size = M.size * (0.7 + Math.random() * 0.6);
    s.scale = 0.01;                 // fades in from nothing
    s.phase = Math.random() * Math.PI * 2;
    s.orbit = Math.random() * Math.PI * 2;
    s.life = 0;
    s.held = 0;
    s.alpha = 0;
    s.glow = M.glow * (0.85 + Math.random() * 0.3);
    s.tint.copy(warm).lerp(cool, Math.random());

    active.push(s);
    freeCount++;
    return s;
  }

  /**
   * @param who   the rig state — where the wanderer is and which way they face
   * @param to    where gathered motes eventually go, i.e. the monument
   * @returns how many arrived at the monument this frame
   */
  function update(dt, ctx, who, to) {
    const decay = Math.pow(M.drag, dt);
    const gather2 = M.gatherRadius * M.gatherRadius;
    const attract2 = M.attractRadius * M.attractRadius;
    const nearMonument = (who.x - to.x) ** 2 + (who.z - to.z) ** 2
                       < M.deliverRadius * M.deliverRadius;

    let delivered = 0;
    freeCount = 0;
    heldCount = 0;

    for (let i = active.length - 1; i >= 0; i--) {
      const s = active[i];
      s.life += dt;
      s.alpha = Math.min(1, s.alpha + dt * 0.8);
      s.scale = THREE.MathUtils.damp(s.scale, s.size, 2.0, dt);
      s.phase += dt * 0.55 * ctx.motionScale;

      if (s.state === FREE) {
        freeCount++;
        // A lazy bob around wherever it was left. Motes are not simulated
        // against anything — they are decoration until you touch them.
        s.y = s.homeY + Math.sin(s.phase) * M.bob;
        s.vx += ctx.wind.x * dt * 0.5;
        s.vz += ctx.wind.z * dt * 0.5;
        s.vx *= decay; s.vz *= decay;
        s.x += s.vx * dt * ctx.motionScale;
        s.z += s.vz * dt * ctx.motionScale;

        const dx = who.x - s.x, dz = who.z - s.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < gather2) {
          s.state = HELD;
          s.held = 0;
          onGather?.(s);
        } else if (d2 < attract2) {
          // A gentle lean toward whoever is nearby, well before they are close
          // enough to gather. Without it a mote is a 3-metre target in a
          // 120-metre world and you only ever collect one by accident; with it
          // walking vaguely toward one is enough, which is the whole intended
          // difficulty of this.
          const d = Math.sqrt(d2) || 1;
          const k = (1 - d / M.attractRadius) * M.attractPull * dt;
          s.vx += (dx / d) * k;
          s.vz += (dz / d) * k;
          // ...and it rises to meet them, so a mote drawn across a dip does
          // not end up buried in the hillside it started on
          s.homeY = THREE.MathUtils.damp(s.homeY, who.y + M.trailHeight, 1.2, dt);
        }
      } else if (s.state === HELD) {
        heldCount++;
        s.held += dt;

        // trail in a slow ring behind and above them, rather than clumping
        // on one point — a dozen motes at the same target is one bright dot
        s.orbit += dt * M.orbitSpeed * ctx.motionScale;
        const back = who.yaw + Math.PI;
        const ang = s.orbit;
        const tx = who.x + Math.sin(back) * M.trail + Math.cos(ang) * M.orbitRadius;
        const tz = who.z - Math.cos(back) * M.trail + Math.sin(ang) * M.orbitRadius;
        const ty = who.y + M.trailHeight + Math.sin(s.phase * 1.3) * 0.14;

        s.x = THREE.MathUtils.damp(s.x, tx, M.follow, dt);
        s.y = THREE.MathUtils.damp(s.y, ty, M.follow, dt);
        s.z = THREE.MathUtils.damp(s.z, tz, M.follow, dt);

        if (nearMonument || s.held > M.holdSeconds) s.state = STREAMING;
      } else {
        // streaming home. Eased rather than driven, so they arrive in a long
        // slow curve and the monument seems to draw them in.
        s.x = THREE.MathUtils.damp(s.x, to.x, M.streamRate, dt);
        s.y = THREE.MathUtils.damp(s.y, to.y, M.streamRate, dt);
        s.z = THREE.MathUtils.damp(s.z, to.z, M.streamRate, dt);

        const dx = s.x - to.x, dy = s.y - to.y, dz = s.z - to.z;
        if (dx * dx + dy * dy + dz * dz < M.arriveRadius * M.arriveRadius) {
          s.active = false;
          // swap-remove: instance order is repacked every frame anyway, and
          // splice allocates its removed-elements array on every delivery
          active[i] = active[active.length - 1];
          active.pop();
          delivered++;
          continue;
        }
      }

      s.vis = s.alpha;
    }

    /* ── how crowded it is right here ──────────────────────────────────
     * Additive halo cards are order-independent and cheap, and they have one
     * failure mode: N of them overlapping contribute N times their peak with
     * nothing to stop it, so a dozen gathered motes trailing in a ring around
     * the wanderer is a solid white disc centred on the thing you are steering.
     *
     * So the light each one is allowed to give up is eased down as more of
     * them gather near the player. `crowdFree` of them cost nothing at all —
     * a handful of motes is the ordinary case and must look exactly as it
     * always did — and past that the total flattens out instead of stacking.
     * Measured against the wanderer rather than the camera because the camera
     * trails them, so this is the middle of the frame either way.
     */
    let near = 0;
    const crowd2 = M.crowdRadius * M.crowdRadius;
    for (const s of active) {
      const dx = s.x - who.x, dz = s.z - who.z;
      if (dx * dx + dz * dz < crowd2) near++;
    }
    const crowdScale = 1 / (1 + M.crowdSoften * Math.max(0, near - M.crowdFree));

    /* ── pack the live ones into the front of the instance buffers ───── */
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const flicker = 0.88 + 0.12 * Math.sin(s.life * 1.9 + s.phase);
      const gathered = (s.state === FREE ? 1 : M.gatheredGlow) * crowdScale;

      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(s.phase * 0.5, s.phase * 0.8, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      aOpacity.array[i] = s.vis;
      aGlow.array[i] = s.glow * flicker * gathered;
      aTint.array[i * 3]     = s.tint.r;
      aTint.array[i * 3 + 1] = s.tint.g;
      aTint.array[i * 3 + 2] = s.tint.b;

      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(s.scale * M.glowRadius);
      dummy.updateMatrix();
      glowMesh.setMatrixAt(i, dummy.matrix);

      gPower.array[i] = s.vis * s.glow * flicker * gathered * M.glowPower;
      gTint.array[i * 3]     = s.tint.r;
      gTint.array[i * 3 + 1] = s.tint.g;
      gTint.array[i * 3 + 2] = s.tint.b;
    }

    mesh.count = active.length;
    glowMesh.count = active.length;
    if (active.length > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      aOpacity.needsUpdate = true;
      aTint.needsUpdate = true;
      aGlow.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
      gTint.needsUpdate = true;
      gPower.needsUpdate = true;
    }

    return delivered;
  }

  return {
    mesh,
    glowMesh,
    spawn,
    update,

    /** called with the mote the moment it is picked up */
    set onGather(fn) { onGather = fn; },

    get count() { return active.length; },

    /**
     * The nearest free mote to a point, or null. What the wanderer's eyes
     * follow — held motes are already theirs and not worth looking at.
     */
    nearestFree(x, z, within) {
      let best = null;
      let bestD2 = within * within;
      for (const s of active) {
        if (s.state !== FREE || s.vis <= 0.2) continue;
        const dx = s.x - x, dz = s.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; best = s; }
      }
      return best;
    },
    /** live positions, for tuning the gathering radius from the console */
    debug() {
      return active.map((s) => ({ x: +s.x.toFixed(1), y: +s.y.toFixed(1), z: +s.z.toFixed(1), state: s.state, held: +s.held.toFixed(1) }));
    },
    get free() { return freeCount; },
    get held() { return heldCount; },

    setPalette(p) {
      if (p.mote) warm.set(p.mote);
      if (p.bloom) cool.set(p.bloom);
    },

    setFogDensity(d) {
      material.uniforms.uFogDensity.value = d;
      glowMat.uniforms.uFogDensity.value = d;
    },

    /** throw away every mote — a world change, not a slow fade */
    clear() {
      for (const s of active) s.active = false;
      active.length = 0;
      mesh.count = 0;
      glowMesh.count = 0;
    },

    /**
     * The `k` motes nearest a point, for lighting the ground. Sorting the whole
     * list every frame would be wasteful, so this keeps a small running top-k
     * instead — at these counts it is a handful of comparisons.
     */
    nearestTo(point, k) {
      nearest.length = 0;
      for (const s of active) {
        if (s.vis <= 0.01) continue;
        const dx = s.x - point.x, dy = s.y - point.y, dz = s.z - point.z;
        s.dist2 = dx * dx + dy * dy + dz * dz;
        if (s.dist2 > M.lightRange * M.lightRange) continue;

        let at = nearest.length;
        while (at > 0 && nearest[at - 1].dist2 > s.dist2) at--;
        if (at >= k) continue;
        // shift-insert by hand: splice allocates its return array every call,
        // and this runs for every lit mote every frame
        if (nearest.length < k) nearest.length++;
        for (let j = nearest.length - 1; j > at; j--) nearest[j] = nearest[j - 1];
        nearest[at] = s;
      }
      return nearest;
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
      active.length = 0;
    },
  };
}
