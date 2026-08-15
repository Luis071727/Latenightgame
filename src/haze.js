import * as THREE from 'three';

/**
 * Horizon haze.
 *
 * A single open cylinder standing around the camera, shaded with drifting
 * value noise and faded out at both rims. Seen edge-on across the lake it
 * reads as a low band of mist without needing particles, sorting, or a
 * volumetric pass — one draw call, no overdraw to speak of.
 */
export function createHaze({ CONFIG, scene }) {
  const geo = new THREE.CylinderGeometry(
    CONFIG.haze.radius, CONFIG.haze.radius, CONFIG.haze.height, 48, 1, true
  );

  const uniforms = {
    uTime:    { value: 0 },
    uColor:   { value: new THREE.Color(CONFIG.palette.haze) },
    uAmount:  { value: CONFIG.haze.amount },
    uMotion:  { value: 1 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAmount, uMotion;
      uniform vec3 uColor;
      varying vec2 vUv;

      // cheap value noise
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                   mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }

      void main() {
        float t = uTime * uMotion;

        // Sample the noise around a circle rather than along the UV. Value
        // noise built on floor() cells does not wrap, so feeding it vUv.x
        // directly leaves a hard vertical seam where the cylinder closes;
        // cos/sin are periodic, so this cannot seam no matter the frequency.
        float ang = vUv.x * 6.28318530718;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 p1 = dir * 3.5 + vec2(0.0, vUv.y * 2.0) + vec2(t * 0.012, t * 0.004);
        vec2 p2 = dir * 8.0 + vec2(vUv.y * 3.5, 0.0) - vec2(t * 0.019, 0.0);
        float n = noise(p1) * 0.6 + noise(p2) * 0.4;

        // fade to nothing at the top and bottom rims
        float band = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float a = pow(n, 2.2) * band * uAmount;

        gl_FragColor = vec4(uColor, a);
      }`,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = CONFIG.haze.centerY;
  mesh.renderOrder = 0;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    setPalette(p) { if (p.haze) uniforms.uColor.value.set(p.haze); },
    update(dt, ctx) {
      uniforms.uTime.value += dt;
      uniforms.uMotion.value = ctx.motionScale;
      mesh.position.x = ctx.cameraPosition.x;
      mesh.position.z = ctx.cameraPosition.z;
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mat.dispose();
    },
  };
}
