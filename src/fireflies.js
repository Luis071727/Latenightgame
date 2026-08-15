import * as THREE from 'three';
import { mulberry32 } from './textures.js';

/**
 * Fireflies.
 *
 * Their whole flight path is a function of time, so every one is animated
 * entirely in the vertex shader from a handful of per-particle constants. The
 * CPU touches nothing per frame — it just advances one uniform.
 */
export function createFireflies({ CONFIG, quality, scene }) {
  const count = Math.max(1, Math.round(CONFIG.fireflies.count * quality.particleScale));
  const rand = mulberry32(4242);

  const origin = new Float32Array(count * 3);
  const swing  = new Float32Array(count * 3);   // radiusA, radiusB, speedA
  const cyc    = new Float32Array(count * 3);   // speedB, cycleLength, cycleOffset

  for (let i = 0; i < count; i++) {
    origin[i * 3]     = (rand() - 0.5) * 34;
    origin[i * 3 + 1] = 0.5 + rand() * 2.4;
    origin[i * 3 + 2] = -6 - rand() * 30;

    swing[i * 3]     = 1.4 + rand() * 3.2;
    swing[i * 3 + 1] = 0.5 + rand() * 1.1;
    swing[i * 3 + 2] = 0.10 + rand() * 0.16;

    cyc[i * 3]     = 0.07 + rand() * 0.13;
    cyc[i * 3 + 1] = 26 + rand() * 40;
    cyc[i * 3 + 2] = rand() * 60;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(origin, 3));
  geo.setAttribute('aSwing', new THREE.BufferAttribute(swing, 3));
  geo.setAttribute('aCycle', new THREE.BufferAttribute(cyc, 3));

  const uniforms = {
    uTime:   { value: 0 },
    uScale:  { value: 1 },
    uColor:  { value: new THREE.Color(CONFIG.palette.firefly) },
    uAmount: { value: CONFIG.fireflies.brightness },
    uMotion: { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aSwing;   // radiusA, radiusB, speedA
      attribute vec3 aCycle;   // speedB, cycleLength, cycleOffset
      uniform float uTime, uScale, uMotion;
      varying float vFade;

      void main() {
        float t = uTime * uMotion;
        float a = t * aSwing.z + aCycle.z;
        float b = t * aCycle.x + aCycle.z * 1.7;

        // a lazy lissajous wander around the starting point
        vec3 p = position + vec3(
          sin(a) * aSwing.x,
          sin(b * 1.7) * aSwing.y,
          cos(a * 0.8) * aSwing.x
        );

        // each one drifts into and back out of the scene on its own long cycle
        float phase   = fract((uTime + aCycle.z) / aCycle.y);
        float present = sin(phase * 3.14159265);
        float blink   = 0.45 + 0.55 * pow(max(0.0, sin(t * 1.1 + aCycle.z)), 2.0);
        vFade = present * blink;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uScale * (95.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uAmount;
      varying float vFade;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        a *= a;
        gl_FragColor = vec4(uColor * uAmount, a * vFade);
      }`,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 1;
  scene.add(points);

  return {
    points,
    setViewportHeight(h) { uniforms.uScale.value = Math.min(2.2, h / 620 + 0.4); },
    update(dt, ctx) {
      uniforms.uTime.value += dt;
      uniforms.uMotion.value = ctx.motionScale;
    },
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}
