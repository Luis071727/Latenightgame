import * as THREE from 'three';
import { mulberry32 } from './textures.js';

/**
 * The things you notice second.
 *
 * Everything in here is scenery with no rules attached: none of it can be
 * gathered, woken, completed or missed, and nothing in it will ever ask
 * anything of you. It exists because a world you have finished should still be
 * worth standing in, and because the difference between a place and a level is
 * mostly things happening at the edges that you did not cause.
 *
 * Three systems, one draw call each, and all three obey the same rules:
 *
 *   Instances or points only. No system here may add a draw call per thing it
 *   draws — a hundred more objects that cost a hundred more draws is exactly
 *   the trade this project does not make.
 *
 *   Everything scales with the tier, and everything can be zero. On the lowest
 *   tier the drift and the curtains switch off entirely and only a handful of
 *   silhouettes remain, because they are the largest gain in atmosphere per
 *   pixel of fill of anything here.
 *
 *   Nothing is bright. Phase 4 spent a good deal of effort making crowded
 *   places readable and this is the obvious way to undo it, so the drift and
 *   the curtains sit far below the bloom threshold and stay there.
 */
export function createAmbience({ CONFIG, quality, scene, world }) {
  const A = CONFIG.ambience;
  const rand = mulberry32(world.seed ^ 0x5bf03635);
  const parts = [];

  const fogDensity = world.fog.density;

  /* ═══════════════════════════════════════════════════════════════════════
     drift — pollen, spores, whatever a dream has instead of dust
     ═══════════════════════════════════════════════════════════════════════

     A fixed number of points in a box that travels with the camera and wraps
     at its edges, so the air is equally full wherever you stand and the count
     never depends on how big the world is. It is the cheapest possible way to
     make a space feel like it has air in it rather than vacuum.
     ═══════════════════════════════════════════════════════════════════════ */

  const driftCount = Math.round((quality.driftCount ?? 0));
  let drift = null;

  if (driftCount > 0) {
    const pos = new Float32Array(driftCount * 3);
    const seed = new Float32Array(driftCount);
    for (let i = 0; i < driftCount; i++) {
      pos[i * 3] = (rand() - 0.5) * A.driftBox;
      pos[i * 3 + 1] = rand() * A.driftHeight;
      pos[i * 3 + 2] = (rand() - 0.5) * A.driftBox;
      seed[i] = rand();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), A.driftBox);

    const uniforms = {
      uTime:    { value: 0 },
      uColor:   { value: new THREE.Color(world.palette.haze) },
      uOpacity: { value: A.driftOpacity },
      uSize:    { value: A.driftSize },
      uHeight:  { value: A.driftHeight },
      uBox:     { value: A.driftBox },
      uOrigin:  { value: new THREE.Vector3() },
      uFogDensity: { value: fogDensity },
      uViewport:{ value: 900 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        uniform float uTime, uSize, uHeight, uBox, uViewport;
        uniform vec3 uOrigin;
        varying float vFade, vDepth;
        void main() {
          vec3 p = position;
          // drift: sideways on a lazy figure of eight, and always very slowly
          // upward, because things that only fall read as weather
          float t = uTime * (0.35 + aSeed * 0.5);
          p.x += sin(t * 0.6 + aSeed * 31.0) * 2.2;
          p.z += cos(t * 0.47 + aSeed * 17.0) * 2.2;
          p.y += mod(uTime * (0.18 + aSeed * 0.22), uHeight);

          // wrap into a box centred on the viewer, so the air is equally full
          // wherever they are and nothing ever runs out
          vec3 rel = p - uOrigin;
          rel.x = mod(rel.x + uBox * 0.5, uBox) - uBox * 0.5;
          rel.z = mod(rel.z + uBox * 0.5, uBox) - uBox * 0.5;
          rel.y = mod(rel.y, uHeight);
          vec3 w = uOrigin + rel;

          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDepth = -mv.z;
          // out at the edges of the box they fade rather than pop
          vFade = 1.0 - smoothstep(uBox * 0.30, uBox * 0.5, length(rel.xz));
          gl_PointSize = uSize * (0.5 + aSeed) * (uViewport / max(vDepth, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity, uFogDensity;
        varying float vFade, vDepth;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float f = max(0.0, 1.0 - d);
          float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
          gl_FragColor = vec4(uColor, pow(f, 2.5) * uOpacity * vFade * (1.0 - fog));
        }`,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.renderOrder = 1;
    scene.add(points);
    drift = { points, geo, mat, uniforms };
    parts.push(drift);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     silhouettes — whatever is out past the edge
     ═══════════════════════════════════════════════════════════════════════

     Beyond the rim the island falls away into weather, and until now the
     weather was all there was. These are shapes standing in it: darker than
     the fog rather than lighter, unreachable, never explained. They are the
     single largest thing here for making a world feel like it continues past
     the part you can walk on, and they cost one draw call and a handful of
     triangles.

     Billboards rather than geometry, because at this distance the silhouette
     is the entire information and anything more is detail nobody can resolve.
     ═══════════════════════════════════════════════════════════════════════ */

  const silCount = Math.round(quality.silhouettes ?? 0);
  let silhouettes = null;

  if (silCount > 0) {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 1);
    geo.translate(0, 0.5, 0);        // stand on the ground rather than straddle it

    const aShape = new THREE.InstancedBufferAttribute(new Float32Array(silCount), 1);
    geo.setAttribute('aShape', aShape);

    const uniforms = {
      uFog:     { value: new THREE.Color(world.palette.fog) },
      uInk:     { value: new THREE.Color(world.palette.shadow ?? world.palette.fog) },
      uAmount:  { value: A.silhouetteDepth },
      uTime:    { value: 0 },
      uMotion:  { value: 1 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float aShape;
        varying vec2 vUv;
        varying float vShape;
        void main() {
          vUv = uv; vShape = aShape;
          // billboard about the instance's own vertical axis, so they always
          // present their full width however you walk around the island
          vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float sx = length(instanceMatrix[0].xyz);
          float sy = length(instanceMatrix[1].xyz);
          gl_Position = projectionMatrix
            * vec4(centre.xyz + vec3(position.x * sx, position.y * sy, 0.0), 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFog, uInk;
        uniform float uAmount, uTime, uMotion;
        varying vec2 vUv;
        varying float vShape;
        void main() {
          // a soft tapering column, narrowing toward the top, with a couple of
          // profiles so a horizon of them is not one shape repeated
          float taper = mix(0.85, 0.25, pow(vUv.y, 0.7 + vShape * 1.4));
          float across = 1.0 - smoothstep(taper * 0.55, taper, abs(vUv.x - 0.5) * 2.0);
          // dissolve into the weather at the top; nothing out here has an end
          float up = 1.0 - smoothstep(0.45, 1.0, vUv.y);
          float a = across * up * uAmount;
          // and breathe, barely, so the horizon is not a painted backdrop
          a *= 0.88 + 0.12 * sin(uTime * uMotion * 0.13 + vShape * 6.0);
          gl_FragColor = vec4(mix(uFog, uInk, 0.55), a);
        }`,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, silCount);
    mesh.frustumCulled = false;
    // behind everything in the world but in front of the sky
    mesh.renderOrder = -8;
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    const base = -world.ground.drop * 0.35;
    for (let i = 0; i < silCount; i++) {
      // scattered round the whole horizon rather than evenly spaced, or they
      // read as a fence; the jitter is seeded so they are where they were
      const a = ((i + rand() * 0.75) / silCount) * Math.PI * 2;
      const r = world.ground.radius * (A.silhouetteNear
        + rand() * (A.silhouetteFar - A.silhouetteNear));
      const height = A.silhouetteHeight * (0.55 + rand() * 0.9);
      dummy.position.set(Math.cos(a) * r, base, Math.sin(a) * r);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(height * (0.30 + rand() * 0.28), height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      aShape.array[i] = rand();
    }
    mesh.instanceMatrix.needsUpdate = true;
    aShape.needsUpdate = true;

    silhouettes = { mesh, geo, mat, uniforms };
    parts.push(silhouettes);
  }

  /* ═══════════════════════════════════════════════════════════════════════
     curtains — the slow thing the sky is doing
     ═══════════════════════════════════════════════════════════════════════

     Very large, very faint vertical veils standing a long way off and turning
     imperceptibly. Distinct from the cloud sheets, which are horizontal and
     overhead: these hang, and what they are for is that if you look up twice
     ten minutes apart the sky is not the same sky.
     ═══════════════════════════════════════════════════════════════════════ */

  const veilCount = Math.round(quality.skyVeils ?? 0);
  let curtains = null;

  if (veilCount > 0) {
    const geo = new THREE.PlaneGeometry(1, 1, 1, 6);
    const aSeed = new THREE.InstancedBufferAttribute(new Float32Array(veilCount), 1);
    geo.setAttribute('aSeed', aSeed);

    const uniforms = {
      uTime:   { value: 0 },
      uMotion: { value: 1 },
      uColor:  { value: new THREE.Color(world.palette.haze) },
      uAmount: { value: A.curtainAmount },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute float aSeed;
        varying vec2 vUv;
        varying float vSeed;
        void main() {
          vUv = uv; vSeed = aSeed;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uMotion, uAmount;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vSeed;

        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
                     mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
        }

        void main() {
          float t = uTime * uMotion * 0.012 + vSeed * 40.0;
          // vertical streaks, drifting sideways slower than anything else here
          float n = noise(vec2(vUv.x * 5.0 + t, vUv.y * 1.6 - t * 0.3)) * 0.65
                  + noise(vec2(vUv.x * 13.0 - t * 0.6, vUv.y * 3.0)) * 0.35;
          n = pow(max(0.0, n - 0.42) / 0.58, 2.0);
          // brightest low down and gone before the top, so it hangs
          float rise = pow(1.0 - vUv.y, 1.4) * smoothstep(0.0, 0.22, vUv.y);
          float edge = pow(sin(vUv.x * 3.14159), 1.5);
          gl_FragColor = vec4(uColor, n * rise * edge * uAmount);
        }`,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, veilCount);
    mesh.frustumCulled = false;
    mesh.renderOrder = -9;
    scene.add(mesh);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < veilCount; i++) {
      const a = (i / veilCount) * Math.PI * 2 + rand() * 0.8;
      const r = A.curtainRadius * (0.85 + rand() * 0.3);
      dummy.position.set(Math.cos(a) * r, A.curtainLift, Math.sin(a) * r);
      dummy.rotation.set(0, -a + Math.PI / 2, 0);
      dummy.scale.set(A.curtainWidth * (0.7 + rand() * 0.6), A.curtainHeight, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      aSeed.array[i] = rand();
    }
    mesh.instanceMatrix.needsUpdate = true;
    aSeed.needsUpdate = true;

    curtains = { mesh, geo, mat, uniforms };
    parts.push(curtains);
  }

  return {
    /** how much this is costing, for the console readout */
    get draws() { return parts.length; },
    get points() { return driftCount; },
    get instances() { return silCount + veilCount; },

    setViewportHeight(h) {
      if (drift) drift.uniforms.uViewport.value = h * 0.55;
    },

    setPalette(p) {
      if (drift && p.haze) drift.uniforms.uColor.value.set(p.haze);
      if (curtains && p.haze) curtains.uniforms.uColor.value.set(p.haze);
      if (silhouettes) {
        if (p.fog) silhouettes.uniforms.uFog.value.set(p.fog);
        if (p.shadow) silhouettes.uniforms.uInk.value.set(p.shadow);
      }
    },

    update(dt, ctx) {
      const t = ctx.time * ctx.motionScale;
      if (drift) {
        drift.uniforms.uTime.value = t;
        // the box follows the viewer; the wrap in the shader does the rest
        drift.uniforms.uOrigin.value.copy(ctx.cameraPosition);
      }
      if (silhouettes) {
        silhouettes.uniforms.uTime.value = ctx.time;
        silhouettes.uniforms.uMotion.value = ctx.motionScale;
      }
      if (curtains) {
        curtains.uniforms.uTime.value = ctx.time;
        curtains.uniforms.uMotion.value = ctx.motionScale;
        // ride with the viewer so they stay on the horizon rather than being
        // somewhere you could walk to the side of
        curtains.mesh.position.x = ctx.cameraPosition.x;
        curtains.mesh.position.z = ctx.cameraPosition.z;
      }
    },

    dispose() {
      for (const part of parts) {
        scene.remove(part.points || part.mesh);
        part.geo.dispose();
        part.mat.dispose();
        part.mesh?.dispose();
      }
      parts.length = 0;
    },
  };
}
