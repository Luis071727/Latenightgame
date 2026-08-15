import * as THREE from 'three';

/**
 * Everything the scene draws with is generated at runtime, so there are no
 * image requests at all — which is what makes the page work offline and keeps
 * the deployed bundle to just code.
 */

/**
 * A seamlessly tiling water normal map, built from a sum of sine waves whose
 * frequencies are whole numbers (so the pattern wraps exactly at the edges).
 * Normals come from the analytic derivatives rather than from sampling
 * neighbours, so the result stays smooth at any resolution.
 */
export function makeWaterNormals(size = 256, waves = 9) {
  const data = new Uint8Array(size * size * 4);

  // each wave: integer frequency vector, amplitude, phase
  const W = [];
  let rand = mulberry32(20240815);
  for (let i = 0; i < waves; i++) {
    const fx = Math.round((rand() * 2 - 1) * 6) || 1;
    const fy = Math.round((rand() * 2 - 1) * 6) || 1;
    const amp = 1 / (1 + Math.hypot(fx, fy));      // bigger ripples dominate
    W.push({ fx, fy, amp, ph: rand() * Math.PI * 2 });
  }

  const TAU = Math.PI * 2;
  const strength = 1.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let dx = 0, dy = 0;
      for (const w of W) {
        const a = TAU * (w.fx * u + w.fy * v) + w.ph;
        const c = Math.cos(a) * w.amp * TAU;
        dx += c * w.fx;
        dy += c * w.fy;
      }
      // normal of the height field h(u,v)
      let nx = -dx * strength, ny = -dy * strength, nz = size / 24;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;

      const i = (y * size + x) * 4;
      data[i]     = Math.round((nx * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((nz * 0.5 + 0.5) * 255);   // Y-up in tangent space
      data[i + 2] = Math.round((ny * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Small deterministic PRNG so the generated art is identical every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
