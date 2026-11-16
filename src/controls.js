import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export class PlayerControls {
  constructor(camera, domElement, collidables) {
    this.controls = new PointerLockControls(camera, domElement);
    this.collidables = collidables;

    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.canJump = false;

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();

    this.playerHeight = 1.6;
    this.playerRadius = 0.5;
    this.gravity = 30; // m/s^2
    this.jumpVelocity = 10;
    this.moveSpeed = 40.0; // Acceleration factor

    this.initEventListeners();
  }

  initEventListeners() {
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
  }

  getObject() {
    return this.controls.getObject();
  }

  isLocked() {
    return this.controls.isLocked;
  }

  lock() {
    this.controls.lock();
  }

  unlock() {
    this.controls.unlock();
  }

  update(delta) {
    if (!this.controls.isLocked) return;

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

    // Move player relative to camera rotation
    const playerObj = this.controls.getObject();

    // Check proposed position with collisions
    const oldPosition = playerObj.position.clone();

    // Forward/Backward and Right/Left movements
    this.controls.moveRight(-this.velocity.x * delta);
    this.controls.moveForward(-this.velocity.z * delta);

    // Wall / Obstacle Collision (Horizontal)
    this.checkHorizontalCollisions(oldPosition);

    // Vertical movement & Ground collision
    playerObj.position.y += this.velocity.y * delta;

    // Floor check
    if (playerObj.position.y < this.playerHeight) {
      this.velocity.y = 0;
      playerObj.position.y = this.playerHeight;
      this.canJump = true;
    }

    // Top of obstacle check
    this.checkVerticalCollisions();
  }

  checkHorizontalCollisions(oldPos) {
    const playerObj = this.controls.getObject();
    const currentPos = playerObj.position;
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
        playerObj.position.x = oldPos.x;
        playerObj.position.z = oldPos.z;
        break;
      }
    }
  }

  checkVerticalCollisions() {
    const playerObj = this.controls.getObject();
    const playerFootY = playerObj.position.y - this.playerHeight;

    const raycaster = new THREE.Raycaster(
      playerObj.position,
      new THREE.Vector3(0, -1, 0),
      0,
      this.playerHeight + 0.5
    );

    const intersects = raycaster.intersectObjects(this.collidables);
    if (intersects.length > 0) {
      const hit = intersects[0];
      if (this.velocity.y <= 0 && hit.distance <= this.playerHeight + 0.1) {
        playerObj.position.y = hit.point.y + this.playerHeight;
        this.velocity.y = 0;
        this.canJump = true;
      }
    }
  }
}
