import * as THREE from 'three';
import { mulberry32 } from './textures.js';

/**
 * Sky dome + parallax starfield.
 *
 * The dome rides along with the camera so it is effectively at infinity. The
 * star shells sit at different radii and turn at slightly different rates,
 * which is what sells the parallax — real stars are too far away to shift, so
 * this is a deliberate cheat in favour of the scene feeling alive.
 */
export function createSky({ CONFIG, quality, scene }) {
  const group = new THREE.Group();

  /* ── dome ──────────────────────────────────────────────────────────── */
  const domeUniforms = {
    uTop:     { value: new THREE.Color(CONFIG.palette.skyTopA) },
    uHorizon: { value: new THREE.Color(CONFIG.palette.skyHorizon) },
    uWarm:    { value: new THREE.Color(CONFIG.palette.horizonGlow) },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(CONFIG.world.skyRadius, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: domeUniforms,
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHorizon, uWarm;
        varying vec3 vPos;
        void main() {
          float h = clamp(normalize(vPos).y * 1.35 + 0.06, 0.0, 1.0);
          h = pow(h, 0.75);
          vec3 col = mix(uHorizon, uTop, h);
          // a breath of distant town light sitting on the horizon
          col += uWarm * pow(1.0 - h, 8.0);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  dome.renderOrder = -20;
  dome.frustumCulled = false;
  group.add(dome);

  /* ── stars ─────────────────────────────────────────────────────────── */
  const starUniforms = {
    uTime:    { value: 0 },
    uOpacity: { value: CONFIG.stars.brightness },
    uDensity: { value: 0.8 },      // drifts over minutes, fading stars in and out
    uScale:   { value: 1 },
  };

  const shells = [];
  const perShell = Math.round(CONFIG.stars.count * quality.starScale);

  function buildShell(count, radius, sizeScale, seed) {
    const rand = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const attr = new Float32Array(count * 3);   // size, phase, densityThreshold

    for (let i = 0; i < count; i++) {
      // biased to the upper hemisphere — barely any below the waterline
      const y = Math.abs(rand() * 2 - 1) * 0.94 + 0.02;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const th = rand() * Math.PI * 2;
      pos[i * 3]     = Math.cos(th) * r * radius;
      pos[i * 3 + 1] = y * radius;
      pos[i * 3 + 2] = Math.sin(th) * r * radius;

      const bright = Math.pow(rand(), 2.6);     // mostly faint, a few standouts
      attr[i * 3]     = (0.7 + bright * 3.4) * sizeScale;
      attr[i * 3 + 1] = rand() * Math.PI * 2;
      attr[i * 3 + 2] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aStar', new THREE.BufferAttribute(attr, 3));

    const mat = new THREE.ShaderMaterial({
      uniforms: starUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aStar;               // x=size  y=phase  z=densityThreshold
        uniform float uTime, uScale, uDensity;
        varying float vAlpha, vWarm;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float tw = 0.72 + 0.28 * sin(uTime * ${CONFIG.stars.twinkleSpeed.toFixed(3)} + aStar.y * 6.2);
          float d  = smoothstep(aStar.z - 0.16, aStar.z + 0.16, uDensity);
          vAlpha = tw * d;
          vWarm  = fract(aStar.y * 3.71);
          float px = aStar.x * uScale * (300.0 / max(1.0, -mv.z)) * 1.5;
          // dim rather than shrink past a pixel, or small stars crawl and shimmer
          vAlpha *= clamp(px, 0.0, 1.4) / 1.4;
          gl_PointSize = clamp(px, 1.0, 16.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity;
        varying float vAlpha, vWarm;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.06, d);
          a *= a;
          // most stars stay pale blue-white; a handful lean warm
          vec3 col = mix(vec3(0.72, 0.78, 0.95), vec3(1.0, 0.86, 0.68), vWarm * 0.75);
          gl_FragColor = vec4(col, a * vAlpha * uOpacity);
        }`,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
  }

  const near = buildShell(perShell, CONFIG.world.starRadiusNear, 1.25, 1337);
  const far  = buildShell(perShell, CONFIG.world.starRadiusFar,  1.0,  90210);
  shells.push(near, far);
  group.add(near, far);

  scene.add(group);

  const topA = new THREE.Color(CONFIG.palette.skyTopA);
  const topB = new THREE.Color(CONFIG.palette.skyTopB);

  return {
    group,

    /** star point size is in device pixels, so it has to track viewport height */
    setViewportHeight(h) {
      starUniforms.uScale.value = Math.min(1.6, h / 780 + 0.35);
    },

    /**
     * @param ctx.mood  0..1 slow colour oscillation shared by the whole scene
     * @param ctx.mood2 0..1 a second, out-of-step oscillation for star density
     */
    update(dt, ctx) {
      // The dome and both star shells ride with the camera. Stars are far
      // enough away that they should not parallax as you cross the lake —
      // leaving the shells at the origin would swing them overhead.
      dome.position.copy(ctx.cameraPosition);
      near.position.copy(ctx.cameraPosition);
      far.position.copy(ctx.cameraPosition);

      near.rotation.y += dt * CONFIG.stars.drift * ctx.motionScale;
      far.rotation.y  += dt * CONFIG.stars.drift * 0.45 * ctx.motionScale;

      starUniforms.uTime.value = ctx.time;
      starUniforms.uDensity.value = 0.62 + 0.30 * ctx.mood2;
      starUniforms.uOpacity.value =
        CONFIG.stars.brightness * (0.85 + 0.15 * ctx.mood) * ctx.dim;

      domeUniforms.uTop.value.copy(topA).lerp(topB, ctx.mood);
    },

    dispose() {
      scene.remove(group);
      dome.geometry.dispose();
      dome.material.dispose();
      for (const s of shells) { s.geometry.dispose(); s.material.dispose(); }
    },
  };
}
