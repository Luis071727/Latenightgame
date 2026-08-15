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
      headingVector(forward);
      if (wantStrength > 0.001) {
        const align = Math.max(0, forward.x * wantX + forward.z * wantZ);
        const push = M.accel * wantStrength * (0.25 + 0.75 * align) * dt;
        state.vx += forward.x * push;
        state.vz += forward.z * push;
      }

      const damp = Math.pow(M.damping, dt);
      state.vx *= damp;
      state.vz *= damp;

      state.speed = Math.hypot(state.vx, state.vz);
      if (state.speed > M.maxSpeed) {
        const k = M.maxSpeed / state.speed;
        state.vx *= k; state.vz *= k;
        state.speed = M.maxSpeed;
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
       */
      camTarget.set(
        state.x - forward.x * K.distance,
        state.y + K.height,
        state.z - forward.z * K.distance
      );

      // never let the follow point sink into a hillside behind us
      if (terrain) {
        const under = terrain.heightAt(camTarget.x, camTarget.z) + K.minClearance;
        if (camTarget.y < under) camTarget.y = under;
      }

      lookTarget.set(
        state.x + forward.x * K.lookAhead,
        state.y + K.lookRise,
        state.z + forward.z * K.lookAhead
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
