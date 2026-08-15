import * as THREE from 'three';

/**
 * The wanderer.
 *
 * One robed silhouette — hem, shoulders and hood are a single lathe, so there
 * is no seam where a head would be joined on and no articulated rig to go
 * wrong. Everything that sells movement is done in the vertex shader from three
 * numbers the rig hands over each frame: how fast we are going, which way the
 * cloth should trail, and how hard we are turning.
 *
 * Deliberately no legs. A walk cycle at this scale is either expensive or bad,
 * and a figure that glides reads as serene where a figure that walks badly
 * reads as broken. The bob, the lean and the hem sway do the work instead.
 */
export function createCharacter({ CONFIG, quality, scene }) {
  const C = CONFIG.character;

  const group = new THREE.Group();
  scene.add(group);

  /* ── the robe: one lathe from hem to the crown of the hood ─────────────
   *
   * The profile is where all the character is. The slight flare at the bottom
   * and the pinch at the shoulders are what stop it reading as a traffic cone,
   * and closing the bottom (starting at r=0) means we never see the inside.
   */
  const PROFILE = [
    [0.000, 0.02], [0.170, 0.02], [0.335, 0.045], [0.446, 0.12],
    [0.434, 0.30], [0.392, 0.55], [0.334, 0.82], [0.286, 1.02],
    [0.272, 1.12],                                  // shoulders, flaring a little
    [0.246, 1.22], [0.196, 1.30],                   // the cowl pinches in...
    [0.214, 1.38], [0.216, 1.48],                   // ...and the hood swells back out
    [0.186, 1.57], [0.112, 1.64], [0.000, 1.68],
  ];
  const HEIGHT = PROFILE[PROFILE.length - 1][1];

  const robeGeo = new THREE.LatheGeometry(
    PROFILE.map(([x, y]) => new THREE.Vector2(x, y)),
    quality.charSegments
  );
  robeGeo.scale(C.scale, C.scale, C.scale);

  const robeUniforms = {
    uTime:      { value: 0 },
    uHeight:    { value: HEIGHT * C.scale },
    uSpeed:     { value: 0 },        // 0..1, fraction of top speed
    uMove:      { value: new THREE.Vector2() },  // local-space travel direction
    uWobble:    { value: C.hemWobble },
    uDrag:      { value: C.hemDrag },
    uSwaySpeed: { value: C.swaySpeed },
    uMotion:    { value: 1 },

    uCloakLow:  { value: new THREE.Color(CONFIG.palette.cloakLow) },
    uCloakHigh: { value: new THREE.Color(CONFIG.palette.cloakHigh) },
    uRim:       { value: new THREE.Color(CONFIG.palette.cloakRim) },
    uGlowColor: { value: new THREE.Color(CONFIG.palette.cloakGlow) },
    uSky:       { value: new THREE.Color(CONFIG.palette.skyTopA) },
    uGround:    { value: new THREE.Color(CONFIG.palette.skyHorizon) },
    uFogColor:  { value: new THREE.Color(CONFIG.palette.skyHorizon) },
    uFogDensity:{ value: CONFIG.world.fogDensity },
    uAmbient:   { value: C.ambient },
    uGlow:      { value: C.glow },
  };

  const robeMat = new THREE.ShaderMaterial({
    uniforms: robeUniforms,
    vertexShader: /* glsl */`
      uniform float uTime, uHeight, uSpeed, uWobble, uDrag, uSwaySpeed, uMotion;
      uniform vec2 uMove;

      varying vec3 vNormal;      // world space, for the sky term and the rim
      varying vec3 vLocal;       // object space, for the hood and the chest
      varying vec3 vWorld;
      varying float vY;
      varying float vDepth;

      void main() {
        float y01 = clamp(position.y / uHeight, 0.0, 1.0);
        // cloth is loose at the hem and pinned at the shoulders
        float hem = pow(1.0 - y01, 2.2);

        vec3 p = position;

        // A cheap sine field around the body rather than any kind of cloth
        // solve. Two frequencies beating against each other is enough to stop
        // it looking like a pulsing ring, and it costs two sines.
        float ang = atan(position.z, position.x);
        float t = uTime * uSwaySpeed * uMotion;
        float w = sin(ang * 3.0 + t) * 0.6
                + sin(ang * 5.0 - t * 0.7 + 1.7) * 0.4;

        vec2 radial = normalize(vec2(position.x, position.z) + vec2(1e-4));
        p.xz += radial * w * hem * uWobble * (0.55 + 0.85 * uSpeed);
        p.y  += w * hem * uWobble * 0.35;

        // the hem lags behind wherever we are going, which is most of what
        // makes it read as fabric rather than a skirt-shaped solid
        p.xz -= uMove * hem * uDrag;

        vLocal = normalize(normal);
        vY = y01;

        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);

        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCloakLow, uCloakHigh, uRim, uGlowColor, uSky, uGround, uFogColor;
      uniform float uFogDensity, uAmbient, uGlow;

      varying vec3 vNormal, vLocal, vWorld;
      varying float vY, vDepth;

      void main() {
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vWorld);

        vec3 base = mix(uCloakLow, uCloakHigh, smoothstep(0.05, 0.95, vY));

        // Soft clay rather than a shaded solid: the palette colour is the
        // answer and the sky only brightens it. Multiplying the robe by the
        // night sky instead — the obvious thing — lands two dark colours on
        // top of each other and the figure goes to a black cut-out.
        float up = 0.5 + 0.5 * n.y;
        vec3 col = base * uAmbient * (0.48 + 0.86 * up);
        col += uSky * up * 0.38;              // sky bounce, added not multiplied

        // rim light: this is what separates the figure from the fog behind it
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6);
        col += uRim * rim * 0.55;

        float front = smoothstep(0.0, 0.9, dot(vLocal, vec3(0.0, 0.0, -1.0)));

        // The hood opening, in object space so it turns with the figure. It is
        // just a darkening where the surface faces forward high on the body —
        // no geometry, but it reads unmistakably as a cowl with a face in it.
        float head = smoothstep(0.74, 0.93, vY);
        col *= 1.0 - head * smoothstep(0.35, 0.95, dot(vLocal, vec3(0.0, 0.0, -1.0))) * 0.80;

        // The light they carry, bleeding through the cloth. It stays faintly
        // visible from behind, which matters: from behind is where this figure
        // is seen almost all of the time.
        float chest = exp(-pow((vY - 0.55) * 5.0, 2.0));
        col += uGlowColor * chest * uGlow * (0.14 + 0.55 * front) * 0.55;

        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(mix(col, uFogColor, fog), 1.0);
      }`,
  });

  const robe = new THREE.Mesh(robeGeo, robeMat);
  group.add(robe);

  /* ── the glow at the chest, as a billboard so the bloom has a core ───── */
  const glowGeo = new THREE.PlaneGeometry(1, 1);
  const glowUniforms = {
    uColor: { value: new THREE.Color(CONFIG.palette.cloakGlow) },
    uPower: { value: C.glow },
    uFogDensity: { value: CONFIG.world.fogDensity },
  };
  const glowMat = new THREE.ShaderMaterial({
    uniforms: glowUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        vUv = uv;
        // billboard against whatever camera is drawing, exactly as the motes do
        vec4 centre = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(vec3(modelMatrix[0].xyz));
        vDepth = -centre.z;
        gl_Position = projectionMatrix * vec4(centre.xyz + vec3(position.xy * s, 0.0), 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uPower, uFogDensity;
      varying vec2 vUv;
      varying float vDepth;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float f = max(0.0, 1.0 - d);
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(uColor * (pow(f, 2.2) * 0.35 + pow(f, 7.0)) * uPower * (1.0 - fog), 1.0);
      }`,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.scale.setScalar(C.glowSize);
  // just in front of the chest, so the robe occludes it from behind and it
  // only shows as they turn
  glow.position.set(0, HEIGHT * C.scale * 0.55, -0.22 * C.scale);
  glow.renderOrder = 3;
  group.add(glow);

  /* ── the face in the hood ─────────────────────────────────────────────
   *
   * Two soft lights on one quad, drawn in the fragment shader — one mesh, one
   * draw call, no geometry per eye. The quad sits just proud of the cowl
   * surface and faces forward in object space, so it turns with the figure and
   * the head occludes it honestly whenever you are behind them.
   *
   * They blink, and they glance at whatever the world has just offered. What
   * they deliberately do not do is emote: the moment these can look pleased or
   * worried the figure stops being a dream you are moving through and starts
   * being someone with opinions about it.
   */
  const EYE_W = 0.26, EYE_H = 0.13;
  const eyeGeo = new THREE.PlaneGeometry(EYE_W, EYE_H);
  const eyeUniforms = {
    uColor:  { value: new THREE.Color(CONFIG.palette.cloakGlow) },
    uGlow:   { value: C.eyeGlow },
    uBlink:  { value: 1 },        // 1 open, 0 shut
    uGlance: { value: 0 },        // horizontal, in units
    uFogDensity: { value: CONFIG.world.fogDensity },
  };
  const eyeMat = new THREE.ShaderMaterial({
    uniforms: eyeUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vP;
      varying float vDepth;
      void main() {
        vP = position.xy;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      uniform float uGlow, uBlink, uGlance, uFogDensity;
      varying vec2 vP;
      varying float vDepth;

      float eye(vec2 p, vec2 at, float blink) {
        vec2 d = p - at;
        // dividing the vertical distance by how open the lid is turns the dot
        // into a line and then into nothing, which is what a blink looks like
        d.y /= max(blink, 0.05);
        float r = length(d) / ${C.eyeSize.toFixed(4)};
        return pow(max(0.0, 1.0 - r), 2.0) * 0.6 + pow(max(0.0, 1.0 - r), 8.0);
      }

      void main() {
        float s = ${C.eyeSpacing.toFixed(4)};
        float v = eye(vP, vec2(-s + uGlance, 0.0), uBlink)
                + eye(vP, vec2( s + uGlance, 0.0), uBlink);
        float fog = 1.0 - exp(-pow(vDepth * uFogDensity, 2.0));
        gl_FragColor = vec4(uColor * v * uGlow * (1.0 - fog), 1.0);
      }`,
  });
  const eyes = new THREE.Mesh(eyeGeo, eyeMat);
  eyes.position.set(0, HEIGHT * C.scale * C.eyeHeight, -C.eyeDepth * C.scale);
  eyes.rotation.y = Math.PI;      // face -Z, the direction yaw 0 looks
  eyes.renderOrder = 4;
  group.add(eyes);

  /* ── contact shadow ───────────────────────────────────────────────────
   *
   * A blob, not a shadow map. The whole scene is lit by a sky dome, so there
   * is no direction for a real shadow to fall in; what the figure actually
   * needs is something to stop it looking like it is hovering.
   */
  let shadow = null;
  let shadowGeo = null;
  if (quality.charShadow) {
    shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadow = new THREE.Mesh(shadowGeo, new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor:   { value: new THREE.Color(CONFIG.palette.shadow) },
        uOpacity: { value: C.shadowOpacity },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          gl_FragColor = vec4(uColor, pow(max(0.0, 1.0 - d), 2.6) * uOpacity);
        }`,
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.renderOrder = -4;
    scene.add(shadow);   // in the scene, not the group: it stays flat and level
  }

  const localMove = new THREE.Vector2();
  const glowWorld = new THREE.Vector3();   // reused; glowPosition allocates nothing
  let lean = 0;
  let pitch = 0;
  let bobPhase = 0;

  /* ── the small internal life ───────────────────────────────────────────
   * Everything below is a timer and an eased value. There is no state machine
   * because there are no states worth naming: the figure is always breathing,
   * usually still, and occasionally does one of two small things.
   */
  let blinkAt = 1 + Math.random() * C.blinkEvery;
  let blinkT = -1;              // < 0 when not blinking; runs 0..1 through one
  let blinksLeft = 0;           // a second one queued, for a double blink
  let glance = 0;               // where the eyes are, in units across the quad
  let glanceWant = 0;
  let shiftAt = C.shiftEvery;
  let shift = 0, shiftWant = 0;
  let lookAt = C.lookAboutEvery;
  let look = 0, lookWant = 0;
  let breathPhase = Math.random() * 6.28;
  let idleFor = 0;
  let glowBoost = 0;            // decaying flare from gathering a mote
  let gateNear = 0;             // 0..1, how strongly an open gate is calling

  /** a random interval around a mean, never less than a third of it */
  const soon = (mean) => mean * (0.4 + Math.random() * 1.2);

  return {
    group,
    robe,

    /** world position of the light at the chest, for anything that wants it.
        Returns a shared scratch vector — copy it if you need to keep it. */
    get glowPosition() { return glow.getWorldPosition(glowWorld); },

    /**
     * Re-tint for a new world. Called on a world swap rather than per frame —
     * the wanderer picks up the colour of wherever they are.
     */
    setPalette(p) {
      if (p.cloakLow)  robeUniforms.uCloakLow.value.set(p.cloakLow);
      if (p.cloakHigh) robeUniforms.uCloakHigh.value.set(p.cloakHigh);
      if (p.cloakRim)  robeUniforms.uRim.value.set(p.cloakRim);
      if (p.cloakGlow) {
        robeUniforms.uGlowColor.value.set(p.cloakGlow);
        glowUniforms.uColor.value.set(p.cloakGlow);
      }
      if (p.skyTopA)     robeUniforms.uSky.value.set(p.skyTopA);
      if (p.skyHorizon) {
        robeUniforms.uGround.value.set(p.skyHorizon);
        robeUniforms.uFogColor.value.set(p.skyHorizon);
      }
      if (p.shadow && shadow) shadow.material.uniforms.uColor.value.set(p.shadow);
      if (p.mote) eyeUniforms.uColor.value.set(p.mote);
    },

    setFogDensity(d) {
      robeUniforms.uFogDensity.value = d;
      glowUniforms.uFogDensity.value = d;
      eyeUniforms.uFogDensity.value = d;
    },

    /**
     * Something was just gathered. The light at the chest takes it in and
     * gives it back over the next second or so.
     */
    flare() {
      glowBoost = Math.min(glowBoost + C.glowGather, C.glowGather * 1.6);
    },

    /**
     * How strongly an open gate is calling, 0..1. The chest light breathes
     * with it, which is the quietest half of the wayfinding.
     */
    setGateNear(v) {
      gateNear = THREE.MathUtils.clamp(v, 0, 1);
    },

    /**
     * Look at something, in world space — the nearest mote, an open gate.
     * Pass nothing to let the gaze drift back to centre. Only the horizontal
     * component is used: these are two dots, not a head.
     */
    lookToward(x, z) {
      if (x === undefined || x === null) { glanceWant = 0; return; }
      const dx = x - group.position.x;
      const dz = z - group.position.z;
      // the angle between where they face and the thing, wrapped to ±π
      const want = Math.atan2(dx, -dz);
      const diff = Math.atan2(Math.sin(want - group.rotation.y),
                              Math.cos(want - group.rotation.y));
      // Clamped hard, and the sign flips because the eye quad is turned to
      // face -Z: its local +X runs to the wanderer's left.
      const k = THREE.MathUtils.clamp(diff / (Math.PI * 0.5), -1, 1);
      glanceWant = -k * C.glanceMax * C.eyeSpacing;
    },

    /**
     * @param rig  the rig's state object — position, heading, and how hard it
     *             is currently moving and turning
     */
    update(dt, ctx, rig) {
      const topSpeed = CONFIG.movement.maxSpeed * (CONFIG.movement.paceScale ?? 1);
      const speed01 = THREE.MathUtils.clamp(rig.speed / topSpeed, 0, 1);

      group.position.set(rig.x, rig.y, rig.z);
      group.rotation.y = rig.yaw;

      // Lean into the turn and a touch forward into the travel. Both are eased
      // rather than tracked, so a flick of the stick can't snap the figure over.
      const wantLean = -THREE.MathUtils.clamp(rig.vYaw / CONFIG.movement.maxTurnSpeed, -1, 1)
                       * C.lean * speed01;
      const wantPitch = speed01 * C.pitch;
      lean = THREE.MathUtils.damp(lean, wantLean, 3.2, dt);
      pitch = THREE.MathUtils.damp(pitch, wantPitch, 3.0, dt);

      /* ── the idle life ──────────────────────────────────────────────
       * A figure that has stopped must not look paused. Three things run:
       * breathing, always; a weight-shift and a look-around, occasionally,
       * and only once they have actually been standing still a moment.
       */
      const m = ctx.motionScale;
      idleFor = speed01 < 0.06 ? idleFor + dt : 0;
      const settled = THREE.MathUtils.clamp(idleFor - 0.7, 0, 1);

      breathPhase += dt * C.breathSpeed * m;
      // fuller breaths at rest than under way — walking is not resting
      const breath = Math.sin(breathPhase) * C.breathDepth * (0.5 + 0.5 * settled) * m;
      robe.scale.set(1 + breath * 0.6, 1 - breath * 0.35, 1 + breath * 0.6);

      shiftAt -= dt;
      if (shiftAt <= 0) {
        shiftAt = soon(C.shiftEvery);
        shiftWant = (Math.random() - 0.5) * 2 * C.shiftAmount;
      }
      // the shift eases away on its own, so they are never left leaning
      shiftWant = THREE.MathUtils.damp(shiftWant, 0, 0.5, dt);
      shift = THREE.MathUtils.damp(shift, shiftWant * settled, 1.4, dt);

      lookAt -= dt;
      if (lookAt <= 0) {
        lookAt = soon(C.lookAboutEvery);
        lookWant = (Math.random() - 0.5) * 2 * C.lookAboutMax;
      }
      lookWant = THREE.MathUtils.damp(lookWant, 0, 0.35, dt);
      look = THREE.MathUtils.damp(look, lookWant * settled, 1.1, dt);

      group.rotation.z = (lean + shift * m) * ctx.motionScale;
      group.rotation.x = pitch * ctx.motionScale;
      group.rotation.y = rig.yaw + look * m;

      /* ── blinking and glancing ────────────────────────────────────────
       * The closed part of a blink is a *window*, not an instant. A blink
       * lasts a fifth of a second, which on a phone holding 20fps is four
       * frames: shape it as a knife-edge and the one frame that matters gets
       * stepped over, and the figure simply never blinks on exactly the
       * devices least able to spare the frames.
       */
      if (blinkT >= 0) {
        blinkT += dt / C.blinkSeconds;
        if (blinkT >= 1) {
          blinkT = -1;
          if (blinksLeft > 0) { blinksLeft--; blinkAt = 0.09; }
          else blinkAt = soon(C.blinkEvery);
        }
      } else {
        blinkAt -= dt;
        if (blinkAt <= 0) {
          blinkT = 0;
          // now and then it comes as two, because a metronome is not a creature
          if (blinksLeft === 0 && Math.random() < C.doubleBlink) blinksLeft = 1;
        }
      }
      // a broad closed window rather than a single shut instant
      const lid = blinkT < 0 ? 1 : 1 - Math.pow(Math.sin(blinkT * Math.PI), 0.6);
      eyeUniforms.uBlink.value = 1 - (1 - lid) * m;

      glance = THREE.MathUtils.damp(glance, glanceWant, C.glanceRate, dt);
      eyeUniforms.uGlance.value = glance;
      eyeUniforms.uGlow.value = C.eyeGlow * (0.85 + 0.15 * Math.sin(ctx.time * 0.6));

      // a slow breathing bob that speeds up a little when under way
      bobPhase += dt * C.bobSpeed * (0.55 + 0.85 * speed01) * ctx.motionScale;
      group.position.y += Math.sin(bobPhase) * C.bob * ctx.motionScale;

      // travel direction, rotated into the model's own frame so the shader can
      // drag the hem straight back without knowing which way we are facing
      const cos = Math.cos(-rig.yaw), sin = Math.sin(-rig.yaw);
      localMove.set(
        rig.vx * cos - rig.vz * sin,
        rig.vx * sin + rig.vz * cos
      ).multiplyScalar(1 / Math.max(topSpeed, 0.001));

      robeUniforms.uTime.value = ctx.time;
      robeUniforms.uSpeed.value = speed01;
      robeUniforms.uMove.value.copy(localMove);
      robeUniforms.uMotion.value = ctx.motionScale;
      /* ── the light at the chest, answering what just happened ────────
       * Its resting state is a slow breath. Gathering a mote adds a flare
       * that decays over about a second, and an open gate ahead adds a
       * second, faster breath — so the figure themself is part of the
       * wayfinding rather than a passenger being pointed at one.
       */
      glowBoost = Math.max(0, glowBoost - dt * C.glowGatherDecay);
      const gatePulse = gateNear * C.glowGatePulse
                      * (0.5 + 0.5 * Math.sin(ctx.time * C.glowGateSpeed * m));
      const power = C.glow * (0.88 + 0.12 * Math.sin(ctx.time * 0.7))
                  + glowBoost + gatePulse;
      glowUniforms.uPower.value = power;
      // the eyes catch a little of whatever the chest is doing
      eyeUniforms.uGlow.value += (glowBoost + gatePulse) * 0.35;

      if (shadow) {
        // sits on the ground, not on the figure: it must not bob or lean
        shadow.position.set(rig.x, rig.ground + 0.03, rig.z);
        const r = C.shadowRadius * (1 - speed01 * 0.12);
        shadow.scale.set(r, r, 1);
      }
    },

    dispose() {
      scene.remove(group);
      robeGeo.dispose();
      robeMat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      eyeGeo.dispose();
      eyeMat.dispose();
      if (shadow) {
        scene.remove(shadow);
        shadowGeo.dispose();
        shadow.material.dispose();
      }
    },
  };
}
