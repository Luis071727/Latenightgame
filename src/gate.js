import * as THREE from 'three';

/**
 * A dream-gate.
 *
 * Two pieces: a soft ring, and a veil of drifting light stretched across it.
 * Both are driven by one number — how open the gate is — which the world
 * raises as more of it comes awake. Shut, it is a faint outline you might walk
 * past; open, it is a lit doorway you can see from across the world.
 *
 * It is deliberately visible from the first moment, dim rather than absent.
 * A gate that appears out of nowhere once a threshold is crossed asks you to
 * notice a thing that was not there; a gate that has been quietly brightening
 * on the horizon the whole time is somewhere you were already heading.
 */
/**
 * Where a world's gate stands. A fixed spot per world, out toward the rim so
 * that reaching it is a walk, derived from the seed so it is the same place
 * every visit. Exported because the structure scatter needs to know: a gate
 * with a dream-tree grown through it is a gate you cannot see.
 */
export function gateSpot(CONFIG, world) {
  const angle = ((world.seed % 360) / 360) * Math.PI * 2;
  const radius = world.ground.radius * CONFIG.gate.atRadius;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle };
}

export function createGate({ CONFIG, scene, world, terrain }) {
  const G = CONFIG.gate;

  const { x, z, angle } = gateSpot(CONFIG, world);
  const y = terrain.heightAt(x, z);

  const group = new THREE.Group();
  group.position.set(x, y, z);
  // face the middle of the world, so you arrive at it front-on
  group.rotation.y = -angle + Math.PI / 2;
  scene.add(group);

  const uniforms = {
    uTime:    { value: 0 },
    uMotion:  { value: 1 },
    uOpen:    { value: 0 },
    uRing:    { value: new THREE.Color(world.palette.bloom) },
    uVeil:    { value: new THREE.Color(world.palette.mote) },
  };

  /* ── the ring ───────────────────────────────────────────────────────── */
  const ringGeo = new THREE.TorusGeometry(G.radius, G.thickness, 8, 40);
  const ring = new THREE.Mesh(ringGeo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uMotion, uOpen;
      varying float vGlow;
      void main() {
        // a slow travelling brightness around the ring, so it reads as
        // something running rather than something switched on
        float around = atan(position.y, position.x);
        vGlow = 0.55 + 0.45 * sin(around * 3.0 - uTime * uMotion * 0.9);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uRing;
      uniform float uOpen;
      varying float vGlow;
      void main() {
        float a = 0.18 + 0.82 * uOpen;
        gl_FragColor = vec4(uRing * vGlow * (0.35 + 1.5 * uOpen), a);
      }`,
  }));
  ring.position.y = G.radius + G.lift;
  group.add(ring);

  /* ── the veil across it ─────────────────────────────────────────────── */
  const veilGeo = new THREE.CircleGeometry(G.radius, 32);
  const veil = new THREE.Mesh(veilGeo, new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vXY;
      void main() {
        vXY = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uMotion, uOpen;
      uniform vec3 uVeil;
      varying vec2 vXY;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        float t = uTime * uMotion * 0.16;
        // Sampled in polar rather than in xy: value noise on a square grid
        // leaves a visible weave inside a circle, and turning with the angle
        // makes the veil read as something flowing across the opening.
        float r = length(vXY);
        float a = atan(vXY.y, vXY.x);
        vec2 p = vec2(a * 1.6 + t * 0.7, r * 0.55 - t);
        float n = noise(p * 3.0) * 0.6 + noise(p * 7.0 + 4.0) * 0.4;

        float edge = smoothstep(1.0, 0.55, r / ${G.radius.toFixed(3)});
        gl_FragColor = vec4(uVeil * (0.25 + n * 0.9), pow(n, 1.6) * edge * uOpen * 0.55);
      }`,
  }));
  veil.position.y = G.radius + G.lift;
  group.add(veil);

  let open = 0;

  return {
    position: group.position,
    get open() { return open; },

    setPalette(p) {
      if (p.bloom) uniforms.uRing.value.set(p.bloom);
      if (p.mote) uniforms.uVeil.value.set(p.mote);
    },

    /** @param wanted 0..1 — how much of the world has come awake */
    update(dt, ctx, wanted) {
      open = THREE.MathUtils.damp(open, THREE.MathUtils.clamp(wanted, 0, 1), G.openRate, dt);
      uniforms.uTime.value = ctx.time;
      uniforms.uMotion.value = ctx.motionScale;
      uniforms.uOpen.value = open;

      // it breathes a little wider as it opens
      const s = 0.86 + 0.14 * open;
      ring.scale.setScalar(s);
      veil.scale.setScalar(s);
    },

    /** true when the wanderer has walked into a gate that is actually open */
    entered(px, pz) {
      if (open < CONFIG.gate.enterAt) return false;
      const dx = px - x, dz = pz - z;
      return dx * dx + dz * dz < G.enterRadius * G.enterRadius;
    },

    dispose() {
      scene.remove(group);
      ringGeo.dispose();
      ring.material.dispose();
      veilGeo.dispose();
      veil.material.dispose();
    },
  };
}
