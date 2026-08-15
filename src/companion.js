import * as THREE from 'three';

/**
 * The companion.
 *
 * One small light that keeps the wanderer company. It is not a pet and it is
 * not a guide — it has somewhere it would rather be at any given moment, and
 * most of the time that place happens to be near you.
 *
 * Three things move it, in order of how much they matter to it:
 *
 *   1. an open dream-gate, if there is one within reach. It drifts that way,
 *      which makes it the quietest piece of wayfinding in the game: nothing
 *      tells you where to go, but the light you have been walking beside
 *      starts leaning.
 *   2. something that has just woken. It darts off to look, for a few seconds.
 *   3. otherwise, a loose orbit off the wanderer's shoulder, with enough drift
 *      of its own that it never traces the same circle twice.
 *
 * Visually it is one additive billboard — the same trick the motes use — so it
 * costs a single draw call and no geometry to speak of. The low tiers switch
 * it off entirely.
 */
export function createCompanion({ CONFIG, quality, scene }) {
  const K = CONFIG.companion;
  if (!K.enabled || !quality.companion) return null;

  const geo = new THREE.PlaneGeometry(1, 1);
  const uniforms = {
    uColor: { value: new THREE.Color(CONFIG.palette.firefly) },
    uPower: { value: K.glow },
    uFogDensity: { value: CONFIG.world.fogDensity },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        // billboard about the object's own origin, as the motes do
        vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(vec3(modelMatrix[0].xyz));
        vDepth = -centre.z;
        gl_Position = projectionMatrix * vec4(centre.xyz + vec3(position.xy * s, 0.0), 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uPower, uFogDensity;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float f = max(0.0, 1.0 - d);
        // a wide soft halo with a hard little core, so it survives the bloom
        float v = pow(f, 2.4) * 0.30 + pow(f, 9.0) * 1.6;
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(uColor * v * uPower * (1.0 - fog), 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.scale.setScalar(K.size);
  mesh.renderOrder = 3;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // where it is, and where it currently wants to be
  const at = new THREE.Vector3();
  const want = new THREE.Vector3();
  let placed = false;

  let orbit = Math.random() * Math.PI * 2;
  let excited = 0;               // seconds of darting about left
  const dart = { x: 0, y: 0, z: 0 };
  let phase = Math.random() * 6.28;

  return {
    mesh,
    get position() { return at; },
    /** true while it is off looking at something that just woke */
    get excited() { return excited > 0; },

    setPalette(p) {
      if (p.firefly) uniforms.uColor.value.set(p.firefly);
    },

    setFogDensity(d) {
      uniforms.uFogDensity.value = d;
    },

    /** something woke up over there — go and see */
    notice(x, y, z) {
      excited = K.excitedFor;
      // a spot near the thing rather than at it, so it hovers and inspects
      const a = Math.random() * Math.PI * 2;
      dart.x = x + Math.cos(a) * K.excitedRange * 0.4;
      dart.y = y + 1.2;
      dart.z = z + Math.sin(a) * K.excitedRange * 0.4;
    },

    /** drop it beside the wanderer, e.g. on arriving in a new world */
    place(who) {
      at.set(who.x + 1, who.y + K.orbitHeight, who.z + 1);
      placed = true;
      excited = 0;
    },

    /**
     * @param who   the rig state
     * @param gate  the world's gate, or null — consulted only when it is open
     */
    update(dt, ctx, who, gate) {
      const m = ctx.motionScale;
      phase += dt * K.wanderSpeed * m;
      orbit += dt * K.orbitSpeed * m;

      // the resting place: off the shoulder, with a drift of its own
      want.set(
        who.x + Math.cos(orbit) * K.orbitRadius + Math.sin(phase * 1.3) * K.wander,
        who.y + K.orbitHeight + Math.sin(phase * 0.9) * K.wander * 0.6,
        who.z + Math.sin(orbit) * K.orbitRadius + Math.cos(phase * 1.1) * K.wander
      );

      // an open gate pulls it, the nearer the harder — this is the wayfinding
      let pull = 0;
      if (gate && gate.enterable) {
        const d2 = gate.distance2(who.x, who.z);
        if (d2 < K.gateRange * K.gateRange) {
          pull = K.gateLean * (1 - Math.sqrt(d2) / K.gateRange);
          want.x += (gate.position.x - want.x) * pull;
          want.z += (gate.position.z - want.z) * pull;
        }
      }

      // ...but something that has just woken beats even that, briefly
      if (excited > 0) {
        excited -= dt;
        want.set(dart.x, dart.y, dart.z);
      }

      if (!placed) { at.copy(want); placed = true; }
      // it hurries when it is excited and dawdles the rest of the time
      const rate = K.follow * (excited > 0 ? 1.8 : 1);
      at.x = THREE.MathUtils.damp(at.x, want.x, rate, dt);
      at.y = THREE.MathUtils.damp(at.y, want.y, rate, dt);
      at.z = THREE.MathUtils.damp(at.z, want.z, rate, dt);
      mesh.position.copy(at);

      // it burns a little brighter when it has something to be interested in
      const keen = excited > 0 ? 0.5 : pull * 0.8;
      uniforms.uPower.value = K.glow
        * (0.80 + 0.20 * Math.sin(ctx.time * 2.1 + phase) + keen);
    },

    dispose() {
      scene.remove(mesh);
      geo.dispose();
      material.dispose();
    },
  };
}
