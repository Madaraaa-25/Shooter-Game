import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_BODY_RADIUS } from './constants.js';
import { resolveCollisions, getGroundHeight } from '../shared/collision.js';

export class PlayerControls {
  constructor(camera, domElement, collidables, collisionShapes) {
    this.camera = camera;
    this.domElement = domElement;
    this.collidables = collidables;
    this.collisionShapes = collisionShapes;

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.canJump = false;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.playerHeight = PLAYER_EYE_HEIGHT;
    this.playerRadius = PLAYER_BODY_RADIUS;
    this.gravity = 30; // m/s^2
    this.jumpVelocity = 10;
    this.moveSpeed = 40.0; // Acceleration factor

    // Mouse look state
    this.isLocked = false;
    this.yaw = 0;   // left/right rotation (radians)
    this.pitch = 0; // up/down rotation (radians)
    this.sensitivity = 0.002; // radians per pixel

    this.initEventListeners();
  }

  initEventListeners() {
    // Keyboard movement
    const onKeyDown = (event) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = true;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = true;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = true;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = true;
          break;
        case 'Space':
          if (this.canJump) {
            this.velocity.y = this.jumpVelocity;
            this.canJump = false;
          }
          break;
      }
    };

    const onKeyUp = (event) => {
      switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
          this.moveForward = false;
          break;
        case 'KeyS':
        case 'ArrowDown':
          this.moveBackward = false;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          this.moveLeft = false;
          break;
        case 'KeyD':
        case 'ArrowRight':
          this.moveRight = false;
          break;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Pointer lock
    this.domElement.addEventListener('click', () => {
      if (!this.isLocked) {
        // Only the Click to Play overlay in a ready room may request pointer lock
        if (window.__fpsCurrentScreen !== 'ready') return;
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement;
    });

    // Mouse look - only apply when pointer lock is active
    document.addEventListener('mousemove', (event) => {
      if (!this.isLocked) return;

      // Ignore unusually large movement values (browser glitches)
      if (Math.abs(event.movementX) > 200 || Math.abs(event.movementY) > 200) return;

      // Fixed sensitivity, no delta-time scaling, no smoothing, no acceleration
      this.yaw -= event.movementX * this.sensitivity;
      this.pitch -= event.movementY * this.sensitivity;

      // Clamp pitch between -85 and +85 degrees
      const maxPitch = Math.PI * 85 / 180;
      this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

      // Apply rotation: yaw on Y axis, pitch on X axis, roll = 0
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    });
  }

  getObject() {
    // Return the camera itself - its position IS the player position
    return this.camera;
  }

  isLocked() {
    return this.isLocked;
  }

  lock() {
    this.domElement.requestPointerLock();
  }

  unlock() {
    document.exitPointerLock();
  }

  update(delta) {
    if (!this.isLocked) return;

    // Apply friction to horizontal velocity
    this.velocity.x -= this.velocity.x * 10.0 * delta;
    this.velocity.z -= this.velocity.z * 10.0 * delta;

    // Apply gravity
    this.velocity.y -= this.gravity * delta;

    // Calculate movement direction vector
    this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
    this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
    this.direction.normalize();

    if (this.moveForward || this.moveBackward) {
      this.velocity.z -= this.direction.z * this.moveSpeed * delta;
    }
    if (this.moveLeft || this.moveRight) {
      this.velocity.x -= this.direction.x * this.moveSpeed * delta;
    }

    // Move camera relative to its rotation (yaw only for horizontal movement)
    // Get forward/right vectors from camera's rotation
    const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.yaw, 0, 'YXZ'));

    // Check proposed position with collisions
    const oldPosition = this.camera.position.clone();

    // Apply horizontal movement
    this.camera.position.addScaledVector(forward, -this.velocity.z * delta);
    this.camera.position.addScaledVector(right, -this.velocity.x * delta);

    // Shared collision shapes (trees/rocks/palms/huts/crates)
    if (this.collisionShapes) {
      const feetY = this.camera.position.y - PLAYER_EYE_HEIGHT;
      const fixed = resolveCollisions(this.collisionShapes, this.camera.position.x, this.camera.position.z, feetY, this.playerRadius);
      this.camera.position.x = fixed.x;
      this.camera.position.z = fixed.z;
    }

    // Wall / Obstacle Collision (Horizontal)
    this.checkHorizontalCollisions(oldPosition);

    // Vertical movement & Ground collision
    this.camera.position.y += this.velocity.y * delta;

    // Floor check - camera y is eye position, feet are at camera.y - PLAYER_EYE_HEIGHT
    if (this.camera.position.y < PLAYER_EYE_HEIGHT) {
      this.velocity.y = 0;
      this.camera.position.y = PLAYER_EYE_HEIGHT;
      this.canJump = true;
    }

    // Top of obstacle check
    this.checkVerticalCollisions();
  }

  checkHorizontalCollisions(oldPos) {
    const currentPos = this.camera.position;
    const playerBox = new THREE.Box3();

    // Create bounding box for player
    playerBox.min.set(
      currentPos.x - this.playerRadius,
      currentPos.y - this.playerHeight + 0.1,
      currentPos.z - this.playerRadius
    );
    playerBox.max.set(
      currentPos.x + this.playerRadius,
      currentPos.y + 0.2,
      currentPos.z + this.playerRadius
    );

    const obstacleBox = new THREE.Box3();
    for (const obj of this.collidables) {
      obstacleBox.setFromObject(obj);
      if (playerBox.intersectsBox(obstacleBox)) {
        // Simple rollback on collision along horizontal axes
        this.camera.position.x = oldPos.x;
        this.camera.position.z = oldPos.z;
        break;
      }
    }
  }

  checkVerticalCollisions() {
    const playerFootY = this.camera.position.y - PLAYER_EYE_HEIGHT;

    const raycaster = new THREE.Raycaster(
      this.camera.position,
      new THREE.Vector3(0, -1, 0),
      0,
      PLAYER_EYE_HEIGHT + 0.5
    );

    const intersects = raycaster.intersectObjects(this.collidables);
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (this.velocity.y <= 0 && hit.distance <= PLAYER_EYE_HEIGHT + 0.1) {
        this.camera.position.y = hit.point.y + PLAYER_EYE_HEIGHT;
        this.velocity.y = 0;
        this.canJump = true;
      }
    }

    // Ground height from shared collision shapes (handles shapes the raycast misses)
    if (this.collisionShapes && this.velocity.y <= 0) {
      const footY = this.camera.position.y - PLAYER_EYE_HEIGHT;
      const ground = getGroundHeight(this.collisionShapes, this.camera.position.x, this.camera.position.z, this.playerRadius, footY);
      if (ground > 0 && footY <= ground + 0.1) {
        this.camera.position.y = ground + PLAYER_EYE_HEIGHT;
        this.velocity.y = 0;
        this.canJump = true;
      }
    }
  }

  // Get camera world position (same as camera.position since camera has no parent)
  getWorldPosition() {
    return this.camera.position;
  }

  // Get camera world quaternion (from current yaw/pitch)
  getWorldQuaternion() {
    const quaternion = new THREE.Quaternion();
    quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return quaternion;
  }
}
