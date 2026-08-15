import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { makeWaterNormals } from './textures.js';

/**
 * The lake.
 *
 * On medium/high this is the Three.js Water addon, which renders the scene a
 * second time from a mirrored camera to get true reflections of the lanterns
 * and stars. That second pass is the most expensive thing in the scene, so its
 * target resolution is driven by the quality tier — and on `low` we skip the
 * reflection pass entirely and shade a plain plane instead, which costs one
 * draw call and no extra scene traversal.
 *
 * Both paths share the same palette so dropping a tier changes the fidelity,
 * not the mood.
 */
export function createWater({ CONFIG, quality, scene, renderer }) {
  const normals = makeWaterNormals(quality.waterNormalSize);
  const size = CONFIG.world.waterSize;
  const geometry = new THREE.PlaneGeometry(size, size);

  return quality.reflections
    ? reflectiveWater({ CONFIG, quality, scene, geometry, normals, renderer })
    : shadedWater({ CONFIG, scene, geometry, normals });
}

/* ── medium / high: real mirrored reflections ────────────────────────── */
function reflectiveWater({ CONFIG, quality, scene, geometry, normals, renderer }) {
  const p = CONFIG.palette;

  const water = new Water(geometry, {
    textureWidth: quality.reflectionSize,
    textureHeight: quality.reflectionSize,
    waterNormals: normals,
    // There is no sun at midnight. Killing the specular highlight is what
    // turns the ocean shader into a still night lake.
    sunDirection: new THREE.Vector3(0, 1, 0),
    sunColor: 0x000000,
    waterColor: p.waterDeep,
    distortionScale: CONFIG.water.distortion,
    fog: false,
    alpha: 1.0,
  });

  water.rotation.x = -Math.PI / 2;
  water.renderOrder = -10;
  water.material.uniforms.size.value = CONFIG.water.rippleSize;
  water.material.transparent = false;

  /*
   * The addon takes a single reflection sample and offsets it isotropically,
   * which makes a small bright object mirror as a crisp displaced copy of
   * itself — reflections end up looking like debris floating on the lake.
   *
   * Real water smears a reflection *along the view direction*: the spread of
   * ripple slopes scatters the reflected rays vertically, which is why a
   * lantern on a still lake reads as a long shimmering column rather than a
   * second lantern. Here we replace the single tap with a few taps walked up
   * and down the mirror texture, weighted to a soft falloff.
   */
  const fs = water.material.fragmentShader;
  const oldTap = 'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );';
  if (!fs.includes(oldTap)) {
    console.warn('[water] reflection tap not found; three.js Water.js may have changed');
  }
  water.material.fragmentShader = fs
    .replace('vec4 getNoise( vec2 uv ) {', 'uniform float uSmear;\nuniform float uReflectivity;\nvec4 getNoise( vec2 uv ) {')
    .replace(oldTap, /* glsl */`
      vec2 refUv = mirrorCoord.xy / mirrorCoord.w + distortion;
      // steeper ripples scatter more; nearby water smears more than the far shore
      float smear = uSmear
                  * (0.25 + 0.75 * abs(surfaceNormal.x + surfaceNormal.z))
                  * (0.35 + 7.0 / (distance + 7.0));
      // Taps are evenly spaced and close enough together that a point source's
      // copies overlap into one streak. Randomised offsets were tried first
      // and are worse: white noise turns a star — one or two pixels across —
      // into speckle scattered along the streak rather than a smooth line.
      vec3 reflectionSample = vec3( 0.0 );
      float wsum = 0.0;
      for ( int i = 0; i < 9; i ++ ) {
        float t = ( float( i ) - 4.0 ) / 4.0;
        float w = 1.0 - abs( t ) * 0.7;
        reflectionSample += texture2D( mirrorSampler, refUv + vec2( 0.0, t * smear ) ).rgb * w;
        wsum += w;
      }
      reflectionSample /= wsum;
      reflectionSample *= uReflectivity;`);
  water.material.uniforms.uSmear = { value: CONFIG.water.reflectionSmear };
  water.material.uniforms.uReflectivity = { value: CONFIG.water.reflectivity };

  // The addon renders the reflection every frame. At 30fps of *reflection*
  // updates the water still reads as alive, and it halves the cost of the
  // most expensive pass in the scene.
  let reflectAccum = 0;
  const baseOnBeforeRender = water.onBeforeRender;
  water.onBeforeRender = function (rndr, scn, cam) {
    if (reflectAccum < CONFIG.water.reflectionInterval) return;
    reflectAccum = 0;
    baseOnBeforeRender.call(this, rndr, scn, cam);
  };

  scene.add(water);

  return {
    object: water,
    reflective: true,
    update(dt, ctx) {
      reflectAccum += dt;
      water.material.uniforms.time.value += dt * CONFIG.water.flowSpeed;
      // keep the plane centred under the camera so it never runs out
      water.position.x = ctx.cameraPosition.x;
      water.position.z = ctx.cameraPosition.z;
    },
    dispose() {
      scene.remove(water);
      geometry.dispose();
      normals.dispose();
      // the addon keeps its reflection target in a closure; its texture is the
      // only handle we get, and disposing that releases the attachment
      water.material.uniforms.mirrorSampler.value?.dispose?.();
      water.material.dispose();
    },
  };
}

/* ── low: no second scene pass, just a well-behaved dark plane ────────── */
function shadedWater({ CONFIG, scene, geometry, normals }) {
  const p = CONFIG.palette;

  const uniforms = {
    uTime:    { value: 0 },
    uDeep:    { value: new THREE.Color(p.waterDeep) },
    uFar:     { value: new THREE.Color(p.waterFar) },
    uCam:     { value: new THREE.Vector3() },
    uNormals: { value: normals },
  };

  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uDeep, uFar, uCam;
      uniform sampler2D uNormals;
      varying vec3 vWorld;

      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      void main() {
        float dist = length(vWorld.xz - uCam.xz);
        float f    = 1.0 - exp(-dist * 0.012);
        float near = 1.0 - f;
        float fine = exp(-dist * 0.09);

        vec3 col = mix(uDeep, uFar, clamp(f, 0.0, 1.0));

        // two scrolling samples of the same normal map stand in for a swell
        vec2 uv = vWorld.xz * 0.16;
        vec3 n1 = texture2D(uNormals, uv + vec2(uTime * 0.004, uTime * 0.003)).rgb;
        vec3 n2 = texture2D(uNormals, uv * 2.7 - vec2(uTime * 0.007, 0.0)).rgb;
        float ripple = (n1.r - 0.5) * 0.65 + (n2.r - 0.5) * 0.35;
        col += vec3(0.012, 0.015, 0.024) * ripple * fine;

        // sparse round glints where starlight catches the surface
        vec2 gp   = vWorld.xz * 0.45;
        vec2 cell = floor(gp);
        float h   = hash(cell);
        vec2 seed = vec2(hash(cell + 3.1), hash(cell + 7.7));
        float dd  = length(fract(gp) - seed);
        float glint = smoothstep(0.10, 0.0, dd)
                    * smoothstep(0.90, 1.0, sin(uTime * (0.35 + h * 0.5) + h * 40.0))
                    * step(0.58, h);
        col += vec3(0.24, 0.27, 0.38) * glint * fine;

        gl_FragColor = vec4(col, 1.0);
      }`,
  }));

  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -10;
  scene.add(mesh);

  return {
    object: mesh,
    reflective: false,
    update(dt, ctx) {
      uniforms.uTime.value += dt;
      uniforms.uCam.value.copy(ctx.cameraPosition);
      mesh.position.x = ctx.cameraPosition.x;
      mesh.position.z = ctx.cameraPosition.z;
    },
    dispose() {
      scene.remove(mesh);
      geometry.dispose();
      normals.dispose();
      mesh.material.dispose();
    },
  };
}
