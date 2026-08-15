import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Post-processing chain: render → bloom → vignette → output.
 *
 * The scene renders into half-float targets, so materials emit linear HDR and
 * nothing is tone mapped until the very end. Two things follow from that:
 * the lanterns can legitimately be brighter than white and drive the bloom
 * threshold on their own, and the vignette multiplies light rather than
 * darkening an already-compressed image, which keeps the falloff smooth
 * instead of crushing the corners to mud.
 *
 * `OutputPass` reads `renderer.toneMapping` and `renderer.toneMappingExposure`
 * every frame, so the sleep fade is simply a matter of easing the exposure
 * down — one number dims the lake, the lanterns, and the bloom together.
 */

/**
 * Vignette + dither, run *after* tone mapping so it works in display space.
 *
 * The dither matters more than it sounds: this scene is mostly a very dark,
 * very smooth gradient, which is exactly the case where 8-bit output banding
 * shows up as visible rings. Half a bit of noise costs nothing and removes
 * them completely.
 */
const VignetteDitherShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount:  { value: 0.9 },
    uRadius:  { value: 0.78 },
    uSoft:    { value: 0.55 },
    uDither:  { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uAmount, uRadius, uSoft, uDither;
    varying vec2 vUv;

    void main() {
      vec4 c = texture2D(tDiffuse, vUv);

      vec2 d = vUv - 0.5;
      d.x *= 1.15;                       // slightly wider than tall reads calmer
      float r = length(d) * 1.414;
      float v = smoothstep(uRadius + uSoft, uRadius - uSoft, r);
      c.rgb *= mix(1.0, v, uAmount);

      // ±half a code value of noise, enough to dissolve gradient banding
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (n - 0.5) * uDither / 255.0;

      gl_FragColor = c;
    }`,
};

export function createPost({ CONFIG, quality, renderer, scene, camera }) {
  // Drawing-buffer size, not CSS size: every target in the chain lives in
  // device pixels, and sizing the bloom in CSS pixels instead leaves its
  // resolution inconsistent with the texture it samples.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,          // keeps values above 1.0 for the bloom
    samples: quality.msaa,
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  let bloomPass = null;
  if (quality.bloom) {
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x * quality.bloomScale, size.y * quality.bloomScale),
      CONFIG.bloom.strength,
      CONFIG.bloom.radius,
      CONFIG.bloom.threshold
    );
    composer.addPass(bloomPass);
  }

  // Tone mapping and the sRGB conversion happen here...
  composer.addPass(new OutputPass());

  // ...and the vignette follows it, so it grades the displayed image and the
  // dither lands on the same 8-bit values that would otherwise band.
  const vignettePass = new ShaderPass(VignetteDitherShader);
  vignettePass.uniforms.uAmount.value = CONFIG.vignette.amount;
  vignettePass.uniforms.uRadius.value = CONFIG.vignette.radius;
  vignettePass.uniforms.uSoft.value = CONFIG.vignette.softness;
  vignettePass.uniforms.uDither.value = CONFIG.vignette.dither;
  composer.addPass(vignettePass);

  return {
    composer,
    bloomPass,

    setSize(w, h, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(w, h);
      // composer.setSize already sized every pass to the device-pixel buffer;
      // scale bloom down from *that*, not from the CSS size
      if (bloomPass) {
        bloomPass.setSize(
          w * pixelRatio * quality.bloomScale,
          h * pixelRatio * quality.bloomScale
        );
      }
    },

    render(dt) { composer.render(dt); },

    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
