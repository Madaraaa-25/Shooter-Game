import * as THREE from 'three';
import { createArena } from './arena.js';
import { PlayerControls } from './controls.js';
import { ShootingSystem } from './shooting.js';
import { TargetSystem } from './targets.js';
import { UI } from './ui.js';
import { NetworkManager } from './network.js';
import { OtherPlayersManager } from './otherPlayers.js';
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from './constants.js';

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
camera.position.set(0, PLAYER_EYE_HEIGHT, 0);

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
// but also send shot to server for PvP
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

  // Barrel position & direction (for visual effects only)
  const barrelPos = this.getBarrelPosition();
  const barrelDir = this.getBarrelDirection();
  const maxRange = 100;
  const endPoint = hitPoint || barrelPos.clone().addScaledVector(barrelDir, maxRange);

  // Camera position & direction (crosshair ray) - for server hit detection
  const cameraPos = this.camera.getWorldPosition(new THREE.Vector3());
  const cameraDir = this.camera.getWorldDirection(new THREE.Vector3());

  // Visual effects at barrel - MUST happen first, before any diagnostic that could throw
  this.createMuzzleFlash(barrelPos);
  this.createBulletTracer(barrelPos, endPoint);

  // Hit spark at impact point
  if (hitPoint) {
    this.createHitSpark(hitPoint);
  }

  // Notify target hit (practice dummies)
  if (hitTarget) {
    this.ui.registerHit();
    targetSystem.checkHit(hitTarget);
  }

  // Send shot to server for PvP hit detection (use camera position/direction, not barrel)
  if (network.socket?.connected) {
    network.sendPlayerShoot(cameraPos, cameraDir);
  }
};

// Create Network Manager
const network = new NetworkManager();

// Create Other Players Manager
const otherPlayers = new OtherPlayersManager(scene);

// Local player state
let myHealth = 100;
let myMaxHealth = 100;
let myKills = 0;
let myDeaths = 0;
let isDead = false;
let respawnCooldown = 0;

// Network callbacks
network.onPlayersList((playersList) => {
  playersList.forEach((data) => {
    if (data.id !== network.getMyId()) {
      otherPlayers.addPlayer(data.id, data);
    } else {
      // Initialize local player state from server
      myHealth = data.health;
      myMaxHealth = data.maxHealth;
      myKills = data.kills;
      myDeaths = data.deaths;
      isDead = data.isDead;
      ui.updateHealth(myHealth, myMaxHealth);
      if (isDead) {
        ui.showDeathScreen(myKills, myDeaths);
      }
    }
  });
  ui.updatePlayerCount(otherPlayers.getPlayerCount() + 1);
});

network.onPlayerJoined((data) => {
  if (data.id !== network.getMyId()) {
    otherPlayers.addPlayer(data.id, data);
    ui.updatePlayerCount(otherPlayers.getPlayerCount() + 1);
  }
});

network.onPlayerMoved((data) => {
  otherPlayers.updatePlayer(data.id, data);
});

network.onPlayerLeft((id) => {
  otherPlayers.removePlayer(id);
  ui.updatePlayerCount(otherPlayers.getPlayerCount() + 1);
});

// Combat callbacks
network.onShotFired((data) => {
  // Don't render our own shot again (already done locally)
  if (data.shooterId === network.getMyId()) return;

  const shooter = otherPlayers.getPlayerData(data.shooterId);
  if (!shooter) return;

  const origin = new THREE.Vector3(data.origin.x, data.origin.y, data.origin.z);
  const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z).normalize();
  const maxRange = 100;
  const endPoint = data.hitPoint
    ? new THREE.Vector3(data.hitPoint.x, data.hitPoint.y, data.hitPoint.z)
    : origin.clone().addScaledVector(direction, maxRange);

  // Render other player's tracer in their color
  shootingSystem.createNetworkTracer(origin, endPoint, shooter.color);
});

network.onPlayerHit((data) => {
  // We hit someone - show hit marker
  ui.showHitMarker(data.isHeadshot);
});

network.onPlayerDied((data) => {
  if (data.victimId === network.getMyId()) {
    // We died
    isDead = true;
    myDeaths++;
    ui.registerDeath();
    ui.showDeathScreen(myKills, myDeaths);
  } else if (data.killerId === network.getMyId()) {
    // We killed someone
    myKills++;
    ui.registerKill();
  }
  // Update other player's dead state
  otherPlayers.setPlayerDead(data.victimId, true);
});

network.onPlayerRespawned((data) => {
  if (data.id === network.getMyId()) {
    // We respawned
    isDead = false;
    myHealth = data.health;
    myMaxHealth = 100;
    ui.updateHealth(myHealth, myMaxHealth);
    ui.hideDeathScreen();
    respawnCooldown = 0;
  } else {
    // Other player respawned
    otherPlayers.respawnPlayer(data.id, data.position, data.health);
  }
});

network.onScoreboardUpdate((players) => {
  // Add local player to scoreboard data
  const scoreboardData = players.map(p => ({
    ...p,
    name: p.id.slice(0, 4).toUpperCase()
  }));
  // Ensure local player is included
  const myId = network.getMyId();
  const myEntry = scoreboardData.find(p => p.id === myId);
  if (myEntry) {
    // Update local health from server (health bar updates on damage)
    if (myEntry.health !== undefined && myEntry.health !== myHealth) {
      myHealth = myEntry.health;
      ui.updateHealth(myHealth, myMaxHealth);
    }
  } else {
    scoreboardData.push({
      id: myId,
      name: myId.slice(0, 4).toUpperCase(),
      kills: myKills,
      deaths: myDeaths,
      color: 0x44aaff,
      health: myHealth,
      isDead: isDead
    });
  }
  ui.updateScoreboard(scoreboardData);
});

// Tab key for scoreboard
document.addEventListener('keydown', (e) => {
  if (e.code === 'Tab') {
    e.preventDefault();
    network.requestScoreboard();
    ui.showScoreboard(network.getMyId());
  }
});

document.addEventListener('keyup', (e) => {
  if (e.code === 'Tab') {
    ui.hideScoreboard();
  }
});

// Connect to server
network.connect();

// Give network a moment to connect, then set myId
setTimeout(() => {
  otherPlayers.setMyId(network.getMyId());
}, 100);

// Pointer Lock UI Blocker Setup
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');

function updateBlocker() {
  if (document.pointerLockElement) {
    blocker.style.display = 'none';
  } else {
    blocker.style.display = 'flex';
  }
}

instructions.addEventListener('click', () => {
  playerControls.lock();
});

// Listen for pointer lock changes - hide overlay when ANY element has pointer lock
document.addEventListener('pointerlockchange', updateBlocker);

// Also check at startup
updateBlocker();

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

  // Don't update movement if dead
  if (!isDead) {
    playerControls.update(delta);
  }

  shootingSystem.update(delta);
  targetSystem.update(delta);
  otherPlayers.update(delta);

  // Send local player position/rotation to server (throttled in network.js)
  const pos = playerControls.getWorldPosition();
  const quat = playerControls.getWorldQuaternion();
  if (network.socket?.connected && !isDead) {
    network.sendPlayerUpdate(pos, quat);
  }

  renderer.render(scene, camera);
}

animate();