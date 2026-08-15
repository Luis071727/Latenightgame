import * as THREE from 'three';

/**
 * The camera rig — where you are on the lake and which way you are facing.
 *
 * Movement is deliberately boat-like: pushes add to a velocity that is heavily
 * damped, so you glide to a stop instead of stopping dead, and there is a hard
 * ceiling on both drift and turn speed. Nothing here can be made to move
 * quickly no matter how hard the input is pushed, which is the whole point —
 * it has to stay restful even when someone is impatient with it.
 *
 * The idle bob rides on top and never affects position, so movement and
 * breathing can't fight each other.
 */
export function createRig({ CONFIG, camera }) {
  const M = CONFIG.movement;

  const state = {
    x: 0,
    z: 6,
    yaw: 0,          // 0 looks down -Z, matching the opening view
    vx: 0,
    vz: 0,
    vYaw: 0,
  };

  const forward = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function headingVector(out) {
    return out.set(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  }

  return {
    state,

    /** Impulses, in the same units as velocity: turn (rad/s), glide (units/s) */
    push(turn, glide) {
      state.vYaw += turn;
      headingVector(forward);
      state.vx += forward.x * glide;
      state.vz += forward.z * glide;
    },

    update(dt, time, cameraMotion) {
      // damp toward stillness first, so a held input reaches a terminal speed
      const damp = Math.pow(M.damping, dt);
      state.vYaw *= damp;
      state.vx *= damp;
      state.vz *= damp;

      if (Math.abs(state.vYaw) > M.maxTurnSpeed) {
        state.vYaw = Math.sign(state.vYaw) * M.maxTurnSpeed;
      }
      const speed = Math.hypot(state.vx, state.vz);
      if (speed > M.maxSpeed) {
        const k = M.maxSpeed / speed;
        state.vx *= k; state.vz *= k;
      }

      state.yaw += state.vYaw * dt;
      state.x += state.vx * dt;
      state.z += state.vz * dt;

      // the barely-there idle breathing, layered on but never integrated
      const bob = CONFIG.camera.bob * cameraMotion;
      const bobY = Math.sin(time * CONFIG.camera.bobSpeed) * bob;
      const bobX = Math.sin(time * CONFIG.camera.bobSpeed * 0.63) * bob * 3.2;

      headingVector(forward);
      const right = { x: -forward.z, z: forward.x };

      camera.position.set(
        state.x + right.x * bobX,
        CONFIG.camera.height + bobY,
        state.z + right.z * bobX
      );

      const wander = Math.sin(time * 0.05) * 0.6 * cameraMotion;
      lookAt.set(
        camera.position.x + forward.x * CONFIG.camera.lookAtDistance + right.x * wander,
        CONFIG.camera.lookAtHeight + bobY,
        camera.position.z + forward.z * CONFIG.camera.lookAtDistance + right.z * wander
      );
      camera.lookAt(lookAt);
    },

    /** true while the rig is meaningfully under way */
    get moving() {
      return Math.hypot(state.vx, state.vz) > 0.05 || Math.abs(state.vYaw) > 0.02;
    },
  };
}
