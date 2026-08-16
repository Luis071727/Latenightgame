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
 *
 * ── the steering basis ──────────────────────────────────────────────────────
 *
 * The one thing this module will not do is ask the camera which way is up.
 *
 * It used to. The screen request was rotated into the world through
 * `camera.getWorldDirection()` every frame, and because the follow camera
 * orbits as the wanderer turns, the basis swung under the thumb: push up and
 * slightly right, the figure turns right, the camera comes round behind it,
 * and now the same unmoved thumb is asking for a heading further right still.
 * A straight push curved, and staying straight meant constantly correcting.
 * It also inherited the camera's idle bob, so the frame of reference had a
 * permanent slow wobble in it that never settled.
 *
 * So the basis is ours instead: one yaw, `basisYaw`, held still for as long as
 * anyone is steering and re-aligned only when they are not. Nothing the camera
 * does — the bob, the look smoothing, the swing behind a turn — can reach it.
 * Push a direction, go that direction.
 *
 * Two schemes, both built on that:
 *
 *   stable-relative  the screen request is rotated by `basisYaw`, which is
 *                    frozen the moment a finger lands and held for the whole
 *                    gesture, so "up" means the same thing at the end of a
 *                    drag as it did at the start.
 *
 *   heading          no rotation at all. Stick x is a gentle turn, stick y is
 *                    forward. The most predictable thing there is for one
 *                    sleepy thumb, and the one to reach for if the relative
 *                    scheme ever feels like work.
 */
import * as THREE from 'three';

export function createInput({ CONFIG, domElement, getHeading, onWake, onTap }) {
  const M = CONFIG.movement;

  const keys = new Set();

  // the live stick, if a finger is down
  let stick = null;      // { id, ox, oy, x, y, dragged, t0 }
  // a decaying nudge left behind by a tap
  const tap = { x: 0, y: 0, life: 0 };

  const stickEl = document.getElementById('stick');
  const knobEl = document.getElementById('knob');

  /* ── the basis ────────────────────────────────────────────────────────────
   * Our own idea of which world direction is "up the screen". It follows the
   * wanderer's facing, but only while nobody is asking to go anywhere, and
   * even then it is never allowed to move quickly enough to be felt.
   */
  let basisYaw = 0;

  /* The committed heading, kept so that a thumb wobbling by a degree or two
   * changes nothing at all. Without it a near-vertical push wanders by
   * whatever the finger is doing, which on a phone held in bed is quite a lot.
   */
  let heldAngle = 0;
  let hasAngle = false;

  // the one nav result, reused every frame — takeNav is called from the main
  // loop, and a fresh object per frame is sixty allocations a second for
  // nothing
  const nav = { x: 0, z: 0, strength: 0 };

  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  /** ease one angle toward another the short way round */
  function dampAngle(from, to, lambda, dt) {
    return from + wrapAngle(to - from) * (1 - Math.exp(-lambda * dt));
  }

  /** true while anything at all is asking to travel */
  function steering() {
    return !!stick || keys.size > 0 || tap.life > 0;
  }

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
    // this gesture starts from wherever the basis has settled, and takes it
    // with it: from here until the last of the touch has decayed away, "up"
    // is one fixed direction in the world
    hasAngle = false;
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
        // let the surface acknowledge the touch — a breath of light, not a marker
        onTap?.(stick.x, stick.y);
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
    if (!steering()) hasAngle = false;    // a fresh press commits afresh
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
    /**
     * Drain the steering gathered since the last frame.
     * @returns {{x:number, z:number, strength:number}} a world-space direction
     */
    takeNav() {
      nav.x = 0; nav.z = 0; nav.strength = 0;

      /* ── the screen request ────────────────────────────────────────────
       * +x right, +y down, i.e. toward the viewer. Every source lands in the
       * same two numbers, so the stick, a decaying tap and the arrow keys are
       * all steering the same way and cannot mean different things.
       */
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

      if (Math.hypot(sx, sy) < 0.001) return nav;

      /* ── into the world ──────────────────────────────────────────────── */
      let angle, strength;

      if (M.scheme === 'heading') {
        /* Tank steering. Stick x asks for a turn off whatever the wanderer is
           already facing, stick y asks to go. Pulling back does not reverse —
           the figure has no reverse — it simply stops asking, and the coast
           takes them the rest of the way to still. */
        const turn = THREE.MathUtils.clamp(sx, -1, 1);
        const forward = Math.max(0, -sy);
        angle = getHeading() + turn * M.headingTurnArc;
        // a turn on its own is worth something, or the stick could not be used
        // to look about; kept low so it mostly turns rather than travels
        strength = Math.min(1, Math.max(forward, Math.abs(turn) * M.headingTurnDrive));
        // the heading is already relative to the facing, so there is nothing
        // for the hysteresis to hold on to
        hasAngle = false;
      } else {
        /* Stable-relative. Rotate the screen request by our own frozen basis —
           never the camera's — so a straight push stays a straight line
           however far the view has swung round behind the turn. */
        const fx = Math.sin(basisYaw), fz = -Math.cos(basisYaw);
        // right = forward x up
        const wx = -fz * sx - fx * sy;
        const wz =  fx * sx - fz * sy;
        if (wx * wx + wz * wz < 1e-8) return nav;

        angle = Math.atan2(wx, -wz);
        strength = Math.min(1, Math.hypot(sx, sy));

        /* Angular hysteresis. The committed heading only moves once the
           request has pulled more than a hair away from it, and then only as
           far as the far side of that hair — so it tracks a real change
           smoothly and ignores a shaking thumb completely. */
        if (!hasAngle) {
          heldAngle = angle;
          hasAngle = true;
        } else {
          const diff = wrapAngle(angle - heldAngle);
          const H = M.angleHysteresis;
          if (Math.abs(diff) > H) heldAngle = wrapAngle(angle - Math.sign(diff) * H);
        }
        angle = heldAngle;
      }

      if (strength < 0.001) return nav;

      nav.x = Math.sin(angle);
      nav.z = -Math.cos(angle);
      nav.strength = strength;
      return nav;
    },

    /** true while a finger or a movement key is asking to go somewhere */
    get navigating() { return steering(); },

    /** which way the basis currently calls "up the screen", for the console */
    get basis() { return basisYaw; },

    /**
     * Put the basis where the wanderer is facing, at once. Called on arriving
     * somewhere — easing a basis across a world change would mean the first
     * few seconds in a new place were steered against the last one.
     */
    syncBasis() {
      basisYaw = getHeading();
      hasAngle = false;
    },

    update(dt) {
      if (tap.life > 0) {
        tap.life -= dt / CONFIG.input.tapDecaySeconds;
        if (tap.life < 0) tap.life = 0;
      }

      /* Re-align the basis with the wanderer's facing — briskly once they have
         stopped asking to go anywhere, and while they are still asking, at a
         rate slow enough that it cannot be felt. That second one only exists
         so a basis cannot go stale during a very long drag; at this rate a
         sustained turn barely moves it at all, and it catches up in the pauses.

         `getHeading` is the rig's own yaw, not the camera's: no bob, no look
         smoothing, nothing that swings. */
      basisYaw = dampAngle(
        basisYaw, getHeading(),
        steering() ? M.basisEaseHeld : M.basisEase,
        dt);
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
