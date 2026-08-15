import * as THREE from 'three';

/**
 * Lanterns.
 *
 * All of them live in one InstancedMesh, so however many are in the air it
 * stays a single draw call. Per-lantern opacity and colour ride along as
 * instanced attributes, which a stock material can't express — hence the small
 * custom shader.
 *
 * Capacity is fixed at construction and instances are recycled from a free
 * list. Nothing is allocated or destroyed while the scene runs, so there is no
 * memory to grow and nothing to garbage collect mid-flight; `dispose()` tears
 * the whole system down at once.
 *
 * The paper is deliberately brighter than white (values well above 1.0 in the
 * HDR buffer) near the flame. That is what feeds UnrealBloomPass — the glow is
 * a real light response, not a sprite pasted behind the mesh.
 */
export function createLanterns({ CONFIG, quality, scene }) {
  const capacity = quality.maxLanterns;
  const L = CONFIG.lanterns;

  /* ── geometry: a squat closed drum, tapered like folded paper ──────── */
  // Closed, and rendered front-faces-only: with additive blending an open
  // cylinder draws its far wall through its near one, which reads as a cup
  // rather than a lantern.
  const geometry = new THREE.CylinderGeometry(0.28, 0.22, 0.54, 10, 1, false);
  // height along the body, 0 at the base, 1 at the rim — drives the gradient
  {
    const pos = geometry.attributes.position;
    const h = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      h[i] = THREE.MathUtils.clamp((pos.getY(i) + 0.27) / 0.54, 0, 1);
    }
    geometry.setAttribute('aHeight', new THREE.BufferAttribute(h, 1));
  }

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
    side: THREE.FrontSide,
    // Additive keeps overlapping lanterns order-independent, which matters
    // because instances in a single mesh cannot be depth-sorted against
    // each other. On a near-black lake it also reads correctly: they are
    // light sources, so they should add.
    blending: THREE.AdditiveBlending,
    uniforms: {
      uFogDensity: { value: CONFIG.world.fogDensity },
    },
    vertexShader: /* glsl */`
      attribute float aHeight;
      attribute float aOpacity;
      attribute vec3  aTint;
      attribute float aGlow;

      varying float vHeight;
      varying float vOpacity;
      varying vec3  vTint;
      varying float vGlow;
      varying float vDepth;

      void main() {
        vHeight  = aHeight;
        vOpacity = aOpacity;
        vTint    = aTint;
        vGlow    = aGlow;

        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uFogDensity;

      varying float vHeight, vOpacity, vGlow, vDepth;
      varying vec3  vTint;

      void main() {
        if (vOpacity <= 0.001) discard;

        // Paper lit from inside. The flame sits low in the lantern, so the
        // base stays warm rather than going dark — which also matters for the
        // reflection, since the mirrored camera under the lake sees the
        // underside and nothing else.
        float grad = 0.74 + 0.42 * pow(vHeight, 0.7);

        // push past 1.0 so the bloom pass has something real to work with
        vec3 col = vTint * grad * vGlow;

        // Distance haze. Additive blending weights the fragment by alpha, so
        // fading alpha alone dissolves the lantern into the night — applying
        // it to the colour as well would double up.
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));

        gl_FragColor = vec4(col, vOpacity * (1.0 - fog));
      }`,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;      // they are small and cheap; culling costs more
  mesh.renderOrder = 2;
  mesh.count = 0;
  scene.add(mesh);

  /* ── glow: instanced billboards for the flame's core and halo ────────
   *
   * Bloom alone gives a broad atmospheric spread but no hot centre, which
   * leaves the paper looking evenly lit and washed out. This adds back the
   * bright core and the close halo, and the bloom pass then spreads *that*.
   * Two lobes in one quad: a tight high-power falloff over a wide soft one.
   * It billboards against whatever camera is drawing, so it faces the
   * mirrored camera correctly during the water's reflection pass too.
   */
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

        // billboard: take the instance's origin into view space, then offset
        // by the quad corner so the card always faces the camera
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
        float core = pow(f, 6.0);
        float halo = pow(f, 2.3);

        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        vec3 col = vTint * (halo * 0.30 + core * 1.6) * vPower * (1.0 - fog);

        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const glowMesh = new THREE.InstancedMesh(glowGeo, glowMat, capacity);
  glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glowMesh.frustumCulled = false;
  glowMesh.renderOrder = 3;
  glowMesh.count = 0;
  scene.add(glowMesh);

  /* ── simulation state, one plain object per slot, never reallocated ── */
  const slots = [];
  for (let i = 0; i < capacity; i++) {
    slots.push({
      active: false,
      x: 0, y: 0, z: 0, vx: 0, vz: 0,
      size: 1, scale: 1, rise: 0, phase: 0, spin: 0, rot: 0,
      life: 0, alpha: 0, vis: 0, glow: 1, dist2: 0,
      tint: new THREE.Color(),
    });
  }
  const active = [];               // slots currently in the air, oldest first
  const nearest = [];              // scratch for nearestTo, never reallocated

  const dummy = new THREE.Object3D();
  const warm = new THREE.Color(CONFIG.palette.lanternWarm);
  const cool = new THREE.Color(CONFIG.palette.lanternCool);
  const tmpColor = new THREE.Color();

  function release(x, z, bigness = 0, groundY = 0) {
    let s;
    if (active.length >= capacity) {
      s = active.shift();           // recycle the oldest rather than refuse
    } else {
      s = slots.find((v) => !v.active);
      if (!s) return null;
    }

    const size = L.baseSize + bigness * L.sizeRange;
    s.active = true;
    s.x = x; s.y = groundY + 0.34; s.z = z;   // sits on sand, or on the lake
    s.vx = 0; s.vz = 0;
    s.size = size;
    s.scale = size * 0.35;          // grows in as it lifts off the water
    s.rise = THREE.MathUtils.lerp(L.riseSpeed, L.riseSpeedBig, bigness)
             * (0.85 + Math.random() * 0.3);
    s.phase = Math.random() * Math.PI * 2;
    s.spin = (Math.random() - 0.5) * 0.16;
    s.rot = Math.random() * Math.PI;
    s.life = 0;
    s.alpha = 0;
    s.glow = L.glow * (0.85 + bigness * 0.5);
    s.tint.copy(warm).lerp(cool, Math.random() * 0.55);

    active.push(s);
    return s;
  }

  function update(dt, ctx) {
    const wind = ctx.wind;
    const decay = Math.pow(L.drag, dt);

    for (let i = active.length - 1; i >= 0; i--) {
      const s = active[i];
      s.life += dt;

      s.alpha = Math.min(1, s.alpha + dt * 0.7);
      s.scale = THREE.MathUtils.damp(s.scale, s.size, 1.4, dt);

      // rise, ramped in so it lifts off gently rather than launching
      s.y += s.rise * Math.min(1, s.life * 0.55) * ctx.motionScale * dt;

      s.vx += wind.x * dt * 0.55;
      s.vz += wind.z * dt * 0.55;
      for (const b of ctx.breezes) {
        const dx = s.x - b.x, dz = s.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < b.r * b.r) {
          const falloff = (1 - Math.sqrt(d2) / b.r) * b.life * b.strength;
          s.vx += b.dx * falloff * CONFIG.breeze.power * dt;
          s.vz += b.dz * falloff * CONFIG.breeze.power * dt;
        }
      }
      s.vx *= decay; s.vz *= decay;

      // a hard ceiling on drift: a frantic swipe must never fling anything
      const sp = Math.hypot(s.vx, s.vz);
      if (sp > CONFIG.breeze.maxDrift) {
        const k = CONFIG.breeze.maxDrift / sp;
        s.vx *= k; s.vz *= k;
      }

      s.x += s.vx * dt;
      s.z += s.vz * dt;

      s.phase += dt * 0.4;
      s.x += Math.sin(s.phase) * L.sway * dt * ctx.motionScale;
      s.z -= dt * 0.16 * ctx.motionScale;      // drift slowly toward the horizon
      s.rot += s.spin * dt;

      // dissolve high in the sky, then hand the slot back
      let vis = s.alpha;
      if (s.y > L.fadeStartY) {
        vis *= 1 - THREE.MathUtils.clamp(
          (s.y - L.fadeStartY) / (L.fadeEndY - L.fadeStartY), 0, 1);
      }
      const far = Math.hypot(s.x - ctx.cameraPosition.x, s.z - ctx.cameraPosition.z);
      if (vis <= 0.004 || s.y > L.fadeEndY || far > L.despawnDistance) {
        s.active = false;
        active.splice(i, 1);
        continue;
      }
      s.vis = vis;
    }

    // pack the live ones into the front of the instance buffers
    for (let i = 0; i < active.length; i++) {
      const s = active[i];
      const flicker = 0.92 + 0.08 * Math.sin(s.life * 2.3 + s.phase);

      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(Math.sin(s.phase * 0.7) * 0.05, s.rot, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      aOpacity.array[i] = s.vis;
      aGlow.array[i] = s.glow * flicker;
      tmpColor.copy(s.tint);
      aTint.array[i * 3]     = tmpColor.r;
      aTint.array[i * 3 + 1] = tmpColor.g;
      aTint.array[i * 3 + 2] = tmpColor.b;

      // the glow card sits at the flame, a little below the paper's middle
      dummy.position.set(s.x, s.y - s.scale * 0.08, s.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(s.scale * L.glowRadius);
      dummy.updateMatrix();
      glowMesh.setMatrixAt(i, dummy.matrix);

      gPower.array[i] = s.vis * s.glow * flicker * L.glowPower;
      gTint.array[i * 3]     = tmpColor.r;
      gTint.array[i * 3 + 1] = tmpColor.g;
      gTint.array[i * 3 + 2] = tmpColor.b;
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
  }

  return {
    mesh,
    glowMesh,
    release,
    update,

    /** re-tint for a world. Lights already in the air keep their old colour,
     *  which is right: they were lit somewhere else. */
    setPalette(p) {
      if (p.mote) { warm.set(p.mote); cool.set(p.mote); }
      if (p.lanternWarm) warm.set(p.lanternWarm);
      if (p.lanternCool) cool.set(p.lanternCool);
    },
    get count() { return active.length; },
    /** live positions, so the reflection system can mirror them */
    get active() { return active; },

    /**
     * The `k` lanterns nearest a point, brightest-weighted, for lighting the
     * sand. Sorting the whole list every frame would be wasteful, so this
     * keeps a small running top-k instead — at these counts it is a handful
     * of comparisons.
     */
    nearestTo(point, k) {
      nearest.length = 0;
      for (const s of active) {
        if (s.vis <= 0.01) continue;
        const dx = s.x - point.x, dy = s.y - point.y, dz = s.z - point.z;
        s.dist2 = dx * dx + dy * dy + dz * dz;
        if (s.dist2 > L.lightRange * L.lightRange) continue;

        let at = nearest.length;
        while (at > 0 && nearest[at - 1].dist2 > s.dist2) at--;
        if (at >= k) continue;
        nearest.splice(at, 0, s);
        if (nearest.length > k) nearest.length = k;
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
