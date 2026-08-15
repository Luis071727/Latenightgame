import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './textures.js';

/**
 * Islands.
 *
 * Low, dark shapes scattered across the lake — hills with a few conifers on
 * them — so that drifting somewhere means arriving at something. They are
 * silhouettes rather than lit geometry: nearly black, lifting very slightly
 * toward the sky colour at their tops, and fading into the horizon haze with
 * distance. That reads correctly at night and costs no lighting.
 *
 * Every island is merged into a single geometry, so the whole archipelago is
 * one draw call. They sit in the scene like anything else, which means the
 * water reflects them for free.
 */
export function createIslands({ CONFIG, scene }) {
  const cfg = CONFIG.islands;
  const rand = mulberry32(cfg.seed);
  const parts = [];

  for (let i = 0; i < cfg.count; i++) {
    // scatter around the origin in a ring, so the opening view has depth but
    // you never start on top of one
    const angle = rand() * Math.PI * 2;
    const dist = cfg.minDistance + rand() * (cfg.maxDistance - cfg.minDistance);
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;

    const radius = cfg.minRadius + rand() * (cfg.maxRadius - cfg.minRadius);
    const height = cfg.minHeight + rand() * (cfg.maxHeight - cfg.minHeight);

    // the hill: a squat cone, few segments, dropped below the waterline so it
    // meets the lake with a soft edge rather than a rim
    const hill = new THREE.ConeGeometry(radius, height + 1.2, 7 + Math.floor(rand() * 4), 1);
    hill.translate(0, (height + 1.2) / 2 - 1.2, 0);
    hill.scale(1, 1, 0.7 + rand() * 0.6);
    hill.rotateY(rand() * Math.PI);
    hill.translate(cx, 0, cz);
    parts.push(hill);

    // a handful of conifers, kept inside the hill's footprint
    const trees = 2 + Math.floor(rand() * cfg.maxTrees);
    for (let t = 0; t < trees; t++) {
      const ta = rand() * Math.PI * 2;
      const tr = Math.sqrt(rand()) * radius * 0.62;
      const tx = cx + Math.cos(ta) * tr;
      const tz = cz + Math.sin(ta) * tr;

      // how high the hill is under this tree, so it doesn't float
      const ground = height * Math.max(0, 1 - tr / radius) * 0.85;
      const th = cfg.treeHeight * (0.6 + rand() * 0.8);

      const tree = new THREE.ConeGeometry(th * 0.26, th, 5, 1);
      tree.translate(tx, ground + th / 2, tz);
      parts.push(tree);
    }
  }

  const geometry = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uNear:    { value: new THREE.Color(CONFIG.palette.island) },
      uFar:     { value: new THREE.Color(CONFIG.palette.skyHorizon) },
      uRim:     { value: new THREE.Color(CONFIG.palette.skyTopA) },
      uFogDensity: { value: CONFIG.islands.fogDensity },
    },
    vertexShader: /* glsl */`
      varying float vDepth;
      varying float vUp;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        // upward-facing surfaces catch a little of the sky
        vUp = clamp(normalize(mat3(modelMatrix) * normal).y, 0.0, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uNear, uFar, uRim;
      uniform float uFogDensity;
      varying float vDepth, vUp;
      void main() {
        vec3 col = uNear + uRim * vUp * 0.10;
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        col = mix(col, uFar, fog);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -8;      // after the water, before the lanterns
  scene.add(mesh);

  return {
    mesh,
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
    },
  };
}
