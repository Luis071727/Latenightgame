import * as THREE from 'three';

/**
 * Steering the wanderer.
 *
 * Touch is a floating joystick: the stick appears wherever the finger lands,
 * and how far it is pushed asks for a direction — not a speed. A quick tap
 * instead nudges the wanderer toward the spot that was tapped, which decays
 * on its own, so someone who never works out that they can drag can still get
 * about by tapping ahead of themselves.
 *
 * The output is a world-space direction and a 0..1 strength. The rig decides
 * what that is worth, and its ceilings mean a frantic push is worth no more
 * than a firm one — a hurried gesture must not be able to make this hurried.
 */
export function createInput({ CONFIG, camera, domElement, onWake }) {
  const M = CONFIG.movement;

  const keys = new Set();

  // the live stick, if a finger is down
  let stick = null;      // { id, ox, oy, x, y, dragged, t0 }
  // a decaying nudge left behind by a tap
  const tap = { x: 0, y: 0, life: 0 };

  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('knob');

  // camera basis on the ground plane, recomputed each time nav is drained
  const camForward = new THREE.Vector3();
  const dir = new THREE.Vector3();

  // kept only so systems written against the old breeze field keep working;
  // nothing lays down puffs any more
  const breezes = [];

  function showStick(x, y) {
    if (!stickEl) return;
    stickEl.style.transform = `translate(${x}px, ${y}px)`;
    stickEl.classList.add('show');
    moveKnob(0, 0);
  }
  function moveKnob(dx, dy) {
    if (knobEl) knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
  }
  function hideStick() {
    if (stickEl) stickEl.classList.remove('show');
  }

  function onDown(e) {
    onWake();
    if (stick) return;                    // one finger steers; the rest are idle
    stick = {
      id: e.pointerId,
      ox: e.clientX, oy: e.clientY,
      x: e.clientX, y: e.clientY,
      dragged: false,
      t0: performance.now(),
    };
    showStick(e.clientX, e.clientY);
  }

  function onMove(e) {
    if (!stick || e.pointerId !== stick.id) return;
    onWake();
    stick.x = e.clientX;
    stick.y = e.clientY;

    let dx = stick.x - stick.ox;
    let dy = stick.y - stick.oy;
    const mag = Math.hypot(dx, dy);

    if (mag > CONFIG.input.dragThreshold) stick.dragged = true;

    // A floating origin: once the finger is past the ring, the ring comes with
    // it. Without this a long drag pins at full tilt and the direction stops
    // responding, which feels like the controls have jammed.
    if (mag > M.stickRadius) {
      const k = (mag - M.stickRadius) / mag;
      stick.ox += dx * k;
      stick.oy += dy * k;
      dx -= dx * k;
      dy -= dy * k;
      if (stickEl) stickEl.style.transform = `translate(${stick.ox}px, ${stick.oy}px)`;
    }

    moveKnob(dx, dy);
  }

  function onUp(e) {
    if (!stick || e.pointerId !== stick.id) return;
    onWake();

    // a tap, not a drag: walk toward wherever they touched
    if (!stick.dragged && performance.now() - stick.t0 < CONFIG.input.tapMaxMs) {
      const cx = window.innerWidth * 0.5;
      // the wanderer sits a little below the middle of the frame, so measure
      // from there rather than from the centre of the screen
      const cy = window.innerHeight * CONFIG.input.tapAnchor;
      const dx = stick.x - cx;
      const dy = stick.y - cy;
      const mag = Math.hypot(dx, dy);
      if (mag > 1) {
        tap.x = dx / mag;
        tap.y = dy / mag;
        tap.life = 1;
      }
    }

    stick = null;
    hideStick();
  }

  function onCancel(e) {
    if (stick && e.pointerId === stick.id) { stick = null; hideStick(); }
  }

  /* ── keyboard, for anyone opening this on a laptop ─────────────────── */
  const NAV_KEYS = new Set([
    'w', 'a', 's', 'd', 'W', 'A', 'S', 'D',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
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
     * Drain the steering gathered since the last frame.
     * @returns {{x:number, z:number, strength:number}} a world-space direction
     */
    takeNav() {
      // screen-space request first: +x right, +y down (i.e. toward the viewer)
      let sx = 0, sy = 0;

      if (stick) {
        const dx = stick.x - stick.ox;
        const dy = stick.y - stick.oy;
        const mag = Math.hypot(dx, dy);
        if (mag > M.deadzone) {
          const k = Math.min(1, (mag - M.deadzone) / (M.stickRadius - M.deadzone));
          sx += (dx / mag) * k;
          sy += (dy / mag) * k;
        }
      }

      if (tap.life > 0) {
        sx += tap.x * tap.life;
        sy += tap.y * tap.life;
      }

      const kx = (keys.has('d') || keys.has('ArrowRight') ? 1 : 0)
               - (keys.has('a') || keys.has('ArrowLeft') ? 1 : 0);
      const ky = (keys.has('s') || keys.has('ArrowDown') ? 1 : 0)
               - (keys.has('w') || keys.has('ArrowUp') ? 1 : 0);
      sx += kx; sy += ky;

      const strength = Math.min(1, Math.hypot(sx, sy));
      if (strength < 0.001) return { x: 0, z: 0, strength: 0 };

      // rotate the screen request into the world using the camera's own
      // heading, so "up" always means "away from the viewer" however far the
      // follow camera has swung round
      camera.getWorldDirection(camForward);
      camForward.y = 0;
      if (camForward.lengthSq() < 1e-6) camForward.set(0, 0, -1);
      camForward.normalize();

      // right = forward x up
      const rx = -camForward.z;
      const rz = camForward.x;

      dir.set(
        rx * sx - camForward.x * sy,
        0,
        rz * sx - camForward.z * sy
      );
      if (dir.lengthSq() < 1e-6) return { x: 0, z: 0, strength: 0 };
      dir.normalize();

      return { x: dir.x, z: dir.z, strength };
    },

    /** true while a finger or a movement key is asking to go somewhere */
    get navigating() { return !!stick || keys.size > 0 || tap.life > 0; },

    update(dt) {
      if (tap.life > 0) {
        tap.life -= dt / CONFIG.input.tapDecaySeconds;
        if (tap.life < 0) tap.life = 0;
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
      hideStick();
    },
  };
}
