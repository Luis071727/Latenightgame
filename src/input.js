import * as THREE from 'three';

/**
 * Touch handling: tap releases a lantern, holding makes it bigger, dragging
 * lays down a breeze. All three come from the same gesture, so the distinction
 * is made on release — and generously, because nothing here should ever feel
 * like a mis-click.
 */
export function createInput({ CONFIG, camera, domElement, onRelease, onWake }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const waterPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  const pointers = new Map();
  const breezes = [];

  // Where the two-finger gesture started, and how far it is currently held
  // from there. Treating the offset as a joystick — rather than integrating
  // the frame-to-frame delta — means you can press and hold to keep gliding,
  // instead of having to swipe over and over to cross the lake.
  const keys = new Set();
  let navOrigin = null;
  let navOffset = { x: 0, y: 0 };

  /**
   * Two or more fingers means "move", not "release a lantern" or "make a
   * breeze". Marking every live pointer settles it for the whole gesture, so
   * lifting back down to one finger can't accidentally drop a lantern at the
   * end of a long drift.
   */
  function enterNavMode() {
    for (const p of pointers.values()) p.nav = true;
    navOrigin = centroid();
    navOffset = { x: 0, y: 0 };
  }

  function centroid() {
    let x = 0, y = 0, n = 0;
    for (const p of pointers.values()) { x += p.x; y += p.y; n++; }
    return n ? { x: x / n, y: y / n } : null;
  }

  /** screen point → a spot on the lake, kept within a comfortable range */
  function screenToWater(px, py, out) {
    ndc.x = (px / window.innerWidth) * 2 - 1;
    ndc.y = -(py / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    if (!raycaster.ray.intersectPlane(waterPlane, out)) {
      // finger is above the horizon — drop it a sensible distance out instead
      out.copy(raycaster.ray.origin)
         .addScaledVector(raycaster.ray.direction, CONFIG.spawn.fallbackDistance);
      out.y = 0;
    }

    const cx = camera.position.x, cz = camera.position.z;
    const dx = out.x - cx, dz = out.z - cz;
    const d = Math.hypot(dx, dz) || 1;
    const clamped = THREE.MathUtils.clamp(d, CONFIG.spawn.nearest, CONFIG.spawn.farthest);
    out.set(cx + (dx / d) * clamped, 0, cz + (dz / d) * clamped);
    return out;
  }

  function addBreeze(x, z, dx, dz, strength) {
    if (breezes.length >= CONFIG.breeze.maxPuffs) breezes.shift();
    breezes.push({ x, z, dx, dz, strength, r: CONFIG.breeze.radius, life: 1 });
  }

  function onDown(e) {
    onWake();
    const p = {
      x0: e.clientX, y0: e.clientY,
      x: e.clientX, y: e.clientY,
      t0: performance.now(),
      dragged: false,
      nav: false,
      world: new THREE.Vector3(),
      puffX: 0, puffZ: 0,
    };
    screenToWater(e.clientX, e.clientY, p.world);
    p.puffX = p.world.x; p.puffZ = p.world.z;
    pointers.set(e.pointerId, p);

    if (pointers.size >= 2) enterNavMode();
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    onWake();
    p.x = e.clientX; p.y = e.clientY;

    // two fingers down: steer and glide instead of stirring the water
    if (pointers.size >= 2) {
      const c = centroid();
      if (navOrigin && c) {
        navOffset = { x: c.x - navOrigin.x, y: c.y - navOrigin.y };
      }
      return;
    }

    if (!p.dragged && Math.hypot(p.x - p.x0, p.y - p.y0) > CONFIG.input.dragThreshold) {
      p.dragged = true;
    }

    screenToWater(p.x, p.y, p.world);

    if (p.dragged && !p.nav) {
      // Throttle by distance travelled so a long drag lays down a few puffs
      // rather than one per event, and normalise the direction so a fast
      // swipe carries no more force than a slow one.
      const dx = p.world.x - p.puffX;
      const dz = p.world.z - p.puffZ;
      const mag = Math.hypot(dx, dz);
      if (mag > CONFIG.breeze.puffSpacing) {
        addBreeze(p.world.x, p.world.z, dx / mag, dz / mag,
                  THREE.MathUtils.clamp(mag / 2.5, 0.15, 1));
        p.puffX = p.world.x; p.puffZ = p.world.z;
      }
    }
  }

  function onUp(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    onWake();
    if (pointers.size < 2) { navOrigin = null; navOffset = { x: 0, y: 0 }; }

    if (p.nav) return;                // that finger was steering
    if (p.dragged) return;            // that was a breeze, not a release

    const held = performance.now() - p.t0;
    const bigness = THREE.MathUtils.clamp(
      (held - CONFIG.input.holdForBig) /
      (CONFIG.input.holdMax - CONFIG.input.holdForBig), 0, 1);
    onRelease(p.world.x, p.world.z, bigness);
  }

  function onCancel(e) { pointers.delete(e.pointerId); }

  /* ── keyboard, for anyone opening this on a laptop ─────────────────── */
  const NAV_KEYS = new Set([
    'w','a','s','d','W','A','S','D',
    'ArrowUp','ArrowDown','ArrowLeft','ArrowRight',
  ]);
  function onKeyDown(e) {
    if (!NAV_KEYS.has(e.key)) return;
    e.preventDefault();
    keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    onWake();
  }
  function onKeyUp(e) {
    keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  domElement.addEventListener('pointerdown', onDown, { passive: true });
  domElement.addEventListener('pointermove', onMove, { passive: true });
  domElement.addEventListener('pointerup', onUp, { passive: true });
  domElement.addEventListener('pointercancel', onCancel, { passive: true });
  domElement.addEventListener('pointerleave', onCancel, { passive: true });

  // belt and braces against scroll / zoom / double-tap zoom on mobile
  const stop = (e) => e.preventDefault();
  document.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('gesturestart', stop, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', stop);

  return {
    breezes,

    /**
     * Drain the navigation input gathered since the last frame, folding in
     * whatever keys are held. Returns impulses, not positions.
     */
    takeNav(dt) {
      const M = CONFIG.movement;
      let turn = 0;
      let glide = 0;

      if (navOrigin) {
        // a small deadzone, so resting two fingers on the glass doesn't drift
        const ox = Math.abs(navOffset.x) > M.deadzone
          ? navOffset.x - Math.sign(navOffset.x) * M.deadzone : 0;
        const oy = Math.abs(navOffset.y) > M.deadzone
          ? navOffset.y - Math.sign(navOffset.y) * M.deadzone : 0;
        turn += ox * M.touchTurn * dt;
        glide -= oy * M.touchGlide * dt;
      }

      const kTurn = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0)
                  - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
      const kGlide = (keys.has('w') || keys.has('ArrowUp') ? 1 : 0)
                   - (keys.has('s') || keys.has('ArrowDown') ? 1 : 0);

      turn += kTurn * CONFIG.movement.keyTurn * dt;
      glide += kGlide * CONFIG.movement.keyGlide * dt;
      return { turn, glide };
    },

    /** true while a two-finger gesture or a movement key is active */
    get navigating() { return pointers.size >= 2 || keys.size > 0; },

    /** how long the longest still-held finger has been down, in ms */
    heldFor() {
      let best = 0;
      for (const p of pointers.values()) {
        if (p.dragged || p.nav) continue;
        best = Math.max(best, performance.now() - p.t0);
      }
      return best;
    },

    /** world position under the longest-held finger, or null */
    heldAt() {
      let best = null, bestT = 0;
      for (const p of pointers.values()) {
        if (p.dragged || p.nav) continue;
        const t = performance.now() - p.t0;
        if (t > bestT) { bestT = t; best = p.world; }
      }
      return best;
    },

    update(dt) {
      for (let i = breezes.length - 1; i >= 0; i--) {
        const b = breezes[i];
        b.life -= dt / CONFIG.breeze.decay;
        b.r += dt * 3.0;              // the puff spreads out as it dies
        if (b.life <= 0) breezes.splice(i, 1);
      }
    },

    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      domElement.removeEventListener('pointerdown', onDown);
      domElement.removeEventListener('pointermove', onMove);
      domElement.removeEventListener('pointerup', onUp);
      domElement.removeEventListener('pointercancel', onCancel);
      domElement.removeEventListener('pointerleave', onCancel);
      document.removeEventListener('touchmove', stop);
      document.removeEventListener('gesturestart', stop);
      document.removeEventListener('dblclick', stop);
      document.removeEventListener('contextmenu', stop);
    },
  };
}
