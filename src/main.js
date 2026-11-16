import * as THREE from 'three';
import { createArena } from './arena.js';
import { PlayerControls } from './controls.js';

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

  const delta = Math.min(clock.getDelta(), 0.1); // Clamp delta to prevent huge jumps
  playerControls.update(delta);

  renderer.render(scene, camera);
}

animate();
