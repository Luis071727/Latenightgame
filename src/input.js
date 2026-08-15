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
      world: new THREE.Vector3(),
      puffX: 0, puffZ: 0,
    };
    screenToWater(e.clientX, e.clientY, p.world);
    p.puffX = p.world.x; p.puffZ = p.world.z;
    pointers.set(e.pointerId, p);
  }

  function onMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    onWake();
    p.x = e.clientX; p.y = e.clientY;

    if (!p.dragged && Math.hypot(p.x - p.x0, p.y - p.y0) > CONFIG.input.dragThreshold) {
      p.dragged = true;
    }

    screenToWater(p.x, p.y, p.world);

    if (p.dragged) {
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

    if (p.dragged) return;            // that was a breeze, not a release

    const held = performance.now() - p.t0;
    const bigness = THREE.MathUtils.clamp(
      (held - CONFIG.input.holdForBig) /
      (CONFIG.input.holdMax - CONFIG.input.holdForBig), 0, 1);
    onRelease(p.world.x, p.world.z, bigness);
  }

  function onCancel(e) { pointers.delete(e.pointerId); }

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

    /** how long the longest still-held finger has been down, in ms */
    heldFor() {
      let best = 0;
      for (const p of pointers.values()) {
        if (p.dragged) continue;
        best = Math.max(best, performance.now() - p.t0);
      }
      return best;
    },

    /** world position under the longest-held finger, or null */
    heldAt() {
      let best = null, bestT = 0;
      for (const p of pointers.values()) {
        if (p.dragged) continue;
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
