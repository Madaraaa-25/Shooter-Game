import * as THREE from 'three';
import { createArena } from './arena.js';
import { PlayerControls } from './controls.js';
import { ShootingSystem } from './shooting.js';
import { TargetSystem } from './targets.js';
import { UI } from './ui.js';

// Setup Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Setup Scene & Camera
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111122);
scene.fog = new THREE.FogExp2(0x111122, 0.015);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 0);

// Create 3D Arena
const collidables = createArena(scene);

// Create Player Controls
const playerControls = new PlayerControls(camera, document.body, collidables);

// Create UI
const ui = new UI();

// Create Target System
const targetSystem = new TargetSystem(scene);

// Add targets to collidables for player collision
targetSystem.getAllTargetMeshes().forEach(mesh => collidables.push(mesh));

// Create Shooting System
const shootingSystem = new ShootingSystem(camera, scene, ui);

// Override shooting system's raycast to use target system's hit detection
// but delegate visual effects to shootingSystem's methods
const originalShoot = shootingSystem.shoot.bind(shootingSystem);
shootingSystem.shoot = function() {
  if (this.isReloading || this.ammo <= 0) {
    if (this.ammo <= 0 && !this.isReloading) {
      this.startReload();
    }
    return;
  }

  this.ammo--;
  this.ui.updateAmmo(this.ammo, this.maxAmmo);

  // Raycast from camera center (accurate aiming)
  this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
  const targetMeshes = targetSystem.getTargets();
  const intersects = this.raycaster.intersectObjects(targetMeshes, true);

  // Also check for walls/obstacles to limit tracer
  const allIntersects = this.raycaster.intersectObjects(this.scene.children, true);

  let hitTarget = null;
  let hitPoint = null;

  // Check if we hit a target first
  if (intersects.length > 0) {
    hitTarget = intersects[0].object;
    hitPoint = intersects[0].point.clone();
  } else if (allIntersects.length > 0) {
    // Hit something else (wall, obstacle) - find first non-target, non-camera
    for (const intersect of allIntersects) {
      if (!intersect.object.userData.isTarget && intersect.object !== this.camera) {
        hitPoint = intersect.point.clone();
        break;
      }
    }
  }

  // Use shootingSystem's barrel position & direction for visual effects
  const barrelPos = this.getBarrelPosition();
  const barrelDir = this.getBarrelDirection();
  const maxRange = 100;
  const endPoint = hitPoint || barrelPos.clone().addScaledVector(barrelDir, maxRange);

  // Visual effects at barrel
  this.createMuzzleFlash(barrelPos);
  this.createBulletTracer(barrelPos, endPoint);

  // Hit spark at impact point
  if (hitPoint) {
    this.createHitSpark(hitPoint);
  }

  // Notify target hit
  if (hitTarget) {
    this.ui.registerHit();
    targetSystem.checkHit(hitTarget);
  }
};

// Pointer Lock UI Blocker Setup
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

instructions.addEventListener('click', () => {
  playerControls.lock();
});

playerControls.controls.addEventListener('lock', () => {
  blocker.style.display = 'none';
});

playerControls.controls.addEventListener('unlock', () => {
  blocker.style.display = 'flex';
});

// Window Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main Render Loop
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  playerControls.update(delta);
  shootingSystem.update(delta);
  targetSystem.update(delta);

  renderer.render(scene, camera);
}

animate();