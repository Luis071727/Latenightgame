import * as THREE from 'three';

/**
 * The follow rig — where the wanderer is, which way they face, and where the
 * camera trails them.
 *
 * The movement model is the one this project has always had and the reason it
 * stays restful: input adds to a velocity that is heavily damped, and both
 * speed and turn rate have hard ceilings. Nothing here can be made to move
 * quickly no matter how hard the stick is pushed. What changed is only *what*
 * it moves — the figure now, with the camera following at a distance.
 *
 * Steering is by heading rather than by rudder. The input hands over a
 * direction in world space; the figure turns toward it at a capped rate and
 * accelerates along its own facing. That means a shove of the stick can never
 * translate the character sideways, and the turn always reads as the figure
 * deciding to go that way rather than being dragged.
 */
export function createRig({ CONFIG, camera, terrain }) {
  const M = CONFIG.movement;
  const K = CONFIG.camera;

  const state = {
    x: 0,
    y: 0,             // feet, eased onto the ground
    z: 8,
    yaw: 0,           // 0 faces -Z, matching the opening view
    vx: 0,
    vz: 0,
    vYaw: 0,
    speed: 0,
    ground: 0,
  };

  // desired heading, refreshed by steer() and consumed by update()
  let wantX = 0, wantZ = 0, wantStrength = 0;

  /* Where the camera thinks it is standing, as an angle round the wanderer.
   *
   * The camera used to be placed straight off `state.yaw`, which made one
   * damping rate do two jobs: how quickly the view catches up when the figure
   * walks away from it, and how quickly it swings round when the figure turns.
   * Those want opposite answers — the first brisk, the second slow — and with
   * one number you can only have the swing feel right by making the follow
   * feel like a rubber band.
   *
   * So the orbit gets an angle of its own, eased at its own gentle rate, and
   * the position damping is left to do only what it is good at.
   */
  let camYaw = 0;

  const forward = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const smoothLook = new THREE.Vector3();

  let started = false;

  function headingVector(out) {
    return out.set(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  }

  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  return {
    state,

    /**
     * Ask to travel in a world-space direction.
     * @param strength 0..1 — how far the stick is pushed, not how fast to go
     */
    steer(dx, dz, strength) {
      wantX = dx; wantZ = dz;
      wantStrength = THREE.MathUtils.clamp(strength, 0, 1);
    },

    /** drop the wanderer somewhere else, e.g. arriving in a new world */
    place(x, z, yaw = state.yaw) {
      state.x = x; state.z = z; state.yaw = yaw;
      state.vx = 0; state.vz = 0; state.vYaw = 0; state.speed = 0;
      state.ground = terrain ? terrain.heightAt(x, z) : 0;
      state.y = state.ground;
      camYaw = yaw;         // ...and the camera is already behind them
      started = false;      // let the camera snap in behind rather than fly there
    },

    update(dt, time, cameraMotion) {
      /* ── heading ──────────────────────────────────────────────────────
       * Turn toward the requested direction, never faster than the ceiling,
       * and damp the turn rate itself so direction changes ease in and out.
       */
      let wantTurn = 0;
      if (wantStrength > 0.001) {
        const want = Math.atan2(wantX, -wantZ);
        const diff = wrapAngle(want - state.yaw);
        wantTurn = THREE.MathUtils.clamp(
          diff * M.turnGain, -M.maxTurnSpeed, M.maxTurnSpeed) * wantStrength;
      }
      state.vYaw = THREE.MathUtils.damp(state.vYaw, wantTurn, M.turnResponse, dt);
      state.yaw += state.vYaw * dt;

      /* ── travel ───────────────────────────────────────────────────────
       * Accelerate along the facing, and only in proportion to how much of
       * the turn is already done: pushing the stick behind you makes the
       * figure turn around rather than reverse into the move.
       */
      // The pace setting scales the ceilings, never the feel: the coast, the
      // capped turn and the damping stay what they were at every pace.
      const pace = M.paceScale ?? 1;
      const maxSpeed = M.maxSpeed * pace;

      headingVector(forward);
      if (wantStrength > 0.001) {
        const align = Math.max(0, forward.x * wantX + forward.z * wantZ);
        // strength is shaped before it drives travel, so a light push turns
        // the figure on the spot and only a committed one carries them off
        const drive = Math.pow(wantStrength, M.drive ?? 1);
        const push = M.accel * pace * drive * (0.25 + 0.75 * align) * dt;
        state.vx += forward.x * push;
        state.vz += forward.z * push;
      }

      /* ── the edge of the world ────────────────────────────────────────
       * A tide rather than a wall. Past the rim the ground falls away into
       * weather, and rather than stopping you dead — which would be the one
       * jarring thing in an otherwise soft experience — the world leans you
       * gently back toward its middle. Push hard enough and you can stand on
       * the rim and look out; let go and you drift home.
       */
      const bound = terrain ? terrain.radius : 0;
      if (bound > 0) {
        const r = Math.hypot(state.x, state.z);
        const over = (r - bound * M.edgeAt) / (bound * (1 - M.edgeAt));
        if (over > 0 && r > 0.001) {
          const pull = Math.min(1, over) * M.edgePull * dt;
          state.vx -= (state.x / r) * pull;
          state.vz -= (state.z / r) * pull;
        }
      }

      const damp = Math.pow(M.damping, dt);
      state.vx *= damp;
      state.vz *= damp;

      state.speed = Math.hypot(state.vx, state.vz);
      if (state.speed > maxSpeed) {
        const k = maxSpeed / state.speed;
        state.vx *= k; state.vz *= k;
        state.speed = maxSpeed;
      }

      state.x += state.vx * dt;
      state.z += state.vz * dt;

      state.ground = terrain ? terrain.heightAt(state.x, state.z) : 0;
      // eased separately from the ground itself, so cresting a rise is a slope
      // rather than a step
      state.y = THREE.MathUtils.damp(state.y, state.ground, M.groundFollow, dt);

      /* ── camera ───────────────────────────────────────────────────────
       * Behind and a little above, with enough lag that a turn swings the
       * view around after the figure instead of with it. The look point runs
       * ahead of the wanderer so you see where you are going, not their back.
       *
       * The swing is deliberately slower than the follow, so that turning
       * reads as the world easing round you rather than the camera being
       * yanked. It is bounded as well as eased: a lag with no ceiling would
       * let a determined spin leave the wanderer looking out of the side of
       * the frame, and however gentle that is to arrive at, being unable to
       * see the figure you are steering is not restful.
       */
      camYaw = camYaw + wrapAngle(state.yaw - camYaw) * (1 - Math.exp(-K.rotateFollow * dt));
      const lag = wrapAngle(state.yaw - camYaw);
      if (Math.abs(lag) > K.maxSwingLag) {
        camYaw = state.yaw - Math.sign(lag) * K.maxSwingLag;
      }
      const camFx = Math.sin(camYaw);
      const camFz = -Math.cos(camYaw);

      camTarget.set(
        state.x - camFx * K.distance,
        state.y + K.height,
        state.z - camFz * K.distance
      );

      // never let the follow point sink into a hillside behind us
      if (terrain) {
        const under = terrain.heightAt(camTarget.x, camTarget.z) + K.minClearance;
        if (camTarget.y < under) camTarget.y = under;
      }

      // ...and the gaze lands ahead of the *camera's* idea of forward, not the
      // figure's, or the look point would snap round the instant they turned
      // and undo everything the eased orbit just bought
      lookTarget.set(
        state.x + camFx * K.lookAhead,
        state.y + K.lookRise,
        state.z + camFz * K.lookAhead
      );

      if (!started) {
        started = true;
        camera.position.copy(camTarget);
        smoothLook.copy(lookTarget);
      } else {
        camera.position.x = THREE.MathUtils.damp(camera.position.x, camTarget.x, K.follow, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, camTarget.y, K.follow * 1.35, dt);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, camTarget.z, K.follow, dt);
        smoothLook.x = THREE.MathUtils.damp(smoothLook.x, lookTarget.x, K.lookFollow, dt);
        smoothLook.y = THREE.MathUtils.damp(smoothLook.y, lookTarget.y, K.lookFollow, dt);
        smoothLook.z = THREE.MathUtils.damp(smoothLook.z, lookTarget.z, K.lookFollow, dt);
      }

      // the barely-there idle breathing, layered on and never integrated, so
      // it cannot accumulate into the follow position
      const bob = K.bob * cameraMotion;
      camera.position.y += Math.sin(time * K.bobSpeed) * bob;
      camera.position.x += Math.sin(time * K.bobSpeed * 0.63) * bob * 2.4;

      camera.lookAt(smoothLook);

      wantStrength = 0;    // input must be re-asserted every frame
    },

    /** true while the wanderer is meaningfully under way */
    get moving() {
      return state.speed > 0.05 || Math.abs(state.vYaw) > 0.02;
    },
  };
}
