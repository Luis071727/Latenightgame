import * as THREE from 'three';

/**
 * The pool of light that swells under a finger while it is held down — the
 * only feedback that holding longer will release a bigger lantern. It lies
 * flat on the water so the bloom picks it up as a soft glow on the surface.
 */
export function createHoldGlow({ CONFIG, scene }) {
  const geo = new THREE.PlaneGeometry(1, 1);

  const uniforms = {
    uColor:     { value: new THREE.Color(CONFIG.palette.lanternWarm) },
    uIntensity: { value: 0 },
  };

  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms,
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
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), 2.4);
        gl_FragColor = vec4(uColor * uIntensity, a);
      }`,
  }));

  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.05;
  mesh.visible = false;
  mesh.renderOrder = 1;
  scene.add(mesh);

  let intensity = 0;

  return {
    mesh,
    /** @param at world position under the finger, or null when nothing is held */
    update(dt, at, heldMs) {
      const wanted = at && heldMs > CONFIG.input.holdFeedbackMs
        ? THREE.MathUtils.clamp(
            (heldMs - CONFIG.input.holdFeedbackMs) / CONFIG.input.holdMax, 0, 1)
        : 0;

      intensity = THREE.MathUtils.damp(intensity, wanted, wanted > intensity ? 5 : 8, dt);
      mesh.visible = intensity > 0.004;
      if (!mesh.visible) return;

      if (at) { mesh.position.x = at.x; mesh.position.z = at.z; }
      const r = 1.8 + intensity * 4.0;
      mesh.scale.set(r, r, 1);
      uniforms.uIntensity.value = 0.25 + intensity * 0.9;
    },
    dispose() {
      scene.remove(mesh);
      geo.dispose();
      mesh.material.dispose();
    },
  };
}
