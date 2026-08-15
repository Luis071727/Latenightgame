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
export function createRig({ CONFIG, camera, terrain }) {
  const M = CONFIG.movement;

  const state = {
    x: 0,
    z: 6,
    yaw: 0,          // 0 looks down -Z, matching the opening view
    vx: 0,
    vz: 0,
    vYaw: 0,
    ground: 0,       // height of whatever is underfoot
    onLand: false,
  };

  const forward = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  // eased separately from the ground height so cresting a dune doesn't jolt
  let eyeY = CONFIG.camera.height;
  let stride = 0;

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
      // On sand you walk: slower, and it stops when you stop. On the water you
      // glide. Blending the two by how far above the waterline you are keeps
      // wading ashore from switching feel abruptly.
      const land = Math.min(1, state.ground / 0.6);
      const damping = THREE.MathUtils.lerp(M.damping, M.landDamping, land);
      const maxSpeed = THREE.MathUtils.lerp(M.maxSpeed, M.landMaxSpeed, land);

      const damp = Math.pow(damping, dt);
      state.vYaw *= damp;
      state.vx *= damp;
      state.vz *= damp;

      if (Math.abs(state.vYaw) > M.maxTurnSpeed) {
        state.vYaw = Math.sign(state.vYaw) * M.maxTurnSpeed;
      }
      const speed = Math.hypot(state.vx, state.vz);
      if (speed > maxSpeed) {
        const k = maxSpeed / speed;
        state.vx *= k; state.vz *= k;
      }

      state.yaw += state.vYaw * dt;
      state.x += state.vx * dt;
      state.z += state.vz * dt;

      state.ground = terrain ? terrain.heightAt(state.x, state.z) : 0;
      state.onLand = state.ground > 0.05;

      // the barely-there idle breathing, layered on but never integrated
      const bob = CONFIG.camera.bob * cameraMotion;
      const bobY = Math.sin(time * CONFIG.camera.bobSpeed) * bob;
      const bobX = Math.sin(time * CONFIG.camera.bobSpeed * 0.63) * bob * 3.2;

      // a footfall sway, but only when actually walking on sand
      stride += speed * land * dt * M.strideRate;
      const walkY = Math.sin(stride * 2.0) * M.strideBob * land * cameraMotion;
      const walkX = Math.sin(stride) * M.strideSway * land * cameraMotion;

      // ease the eye onto the ground so dunes read as slopes, not steps
      const targetY = state.ground + CONFIG.camera.height;
      eyeY = THREE.MathUtils.damp(eyeY, targetY, M.groundFollow, dt);

      headingVector(forward);
      const right = { x: -forward.z, z: forward.x };

      camera.position.set(
        state.x + right.x * (bobX + walkX),
        eyeY + bobY + walkY,
        state.z + right.z * (bobX + walkX)
      );

      const wander = Math.sin(time * 0.05) * 0.6 * cameraMotion;
      // the gaze target is relative to the eye, so changing the camera height
      // moves the whole view rather than re-pitching it
      lookAt.set(
        camera.position.x + forward.x * CONFIG.camera.lookAtDistance + right.x * wander,
        camera.position.y + CONFIG.camera.lookAtRise,
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
