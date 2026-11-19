import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

// Exposed before controls.js is imported so its click handler can gate on it
window.__fpsCurrentScreen = 'lobby';

import { createArena, addCratesFromLayout } from './arena.js';
import { PlayerControls } from './controls.js';
import { ShootingSystem } from './shooting.js';
import { TargetSystem } from './targets.js';
import { UI } from './ui.js';
import { NetworkManager } from './network.js';
import { OtherPlayersManager } from './otherPlayers.js';
import { addSceneryFromLayout } from './scenery.js';
import { buildWorld } from '../shared/world.js';
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT } from './constants.js';
import { ARENA_HALF_SIZE } from '../shared/config.js';

// Setup Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

// Setup Scene & Camera
const scene = new THREE.Scene();

// Sky dome: sun ~30 degrees above the horizon
const sky = new Sky();
sky.material.uniforms['turbidity'].value = 3;
sky.material.uniforms['rayleigh'].value = 1;
sky.material.uniforms['mieCoefficient'].value = 0.005;
sky.material.uniforms['mieDirectionalG'].value = 0.7;

const sunElevation = THREE.MathUtils.degToRad(30);
const sunAzimuth = THREE.MathUtils.degToRad(-40);
const sun = new THREE.Vector3(
  Math.cos(sunElevation) * Math.sin(sunAzimuth),
  Math.sin(sunElevation),
  Math.cos(sunElevation) * Math.cos(sunAzimuth)
);
sky.material.uniforms['sunPosition'].value.copy(sun);

const skyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(4000, 32, 16),
  sky.material
);
skyMesh.scale.setScalar(1);
scene.add(skyMesh);

// Hemisphere light for soft sky fill
const hemiLight = new THREE.HemisphereLight(0x9fd3ff, 0xd9c08a, 1.2);
scene.add(hemiLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
scene.add(ambientLight);

// Sun directional light with soft shadows covering the whole arena
const dirLight = new THREE.DirectionalLight(0xfff4d6, 3.0);
dirLight.position.copy(sun.clone().multiplyScalar(60));
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = ARENA_HALF_SIZE * 4;
dirLight.shadow.camera.left = -ARENA_HALF_SIZE * 1.2;
dirLight.shadow.camera.right = ARENA_HALF_SIZE * 1.2;
dirLight.shadow.camera.top = ARENA_HALF_SIZE * 1.2;
dirLight.shadow.camera.bottom = -ARENA_HALF_SIZE * 1.2;
dirLight.shadow.bias = -0.0004;
dirLight.shadow.normalBias = 0.02;
dirLight.shadow.camera.updateProjectionMatrix();
scene.add(dirLight);

// Ocean water around the arena (cheap plane with animated normal map)
const oceanGeometry = new THREE.PlaneGeometry(2000, 2000);

function createOceanNormalMap() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;

      // Soft overlapping octaves of sine noise, tileable
      let n = 0;
      n += 0.50 * Math.sin(u * Math.PI * 4 + v * Math.PI * 2);
      n += 0.25 * Math.sin(u * Math.PI * 8 - v * Math.PI * 4);
      n += 0.15 * Math.sin(u * Math.PI * 16 + v * Math.PI * 8);
      n += 0.10 * Math.sin(u * Math.PI * 32 - v * Math.PI * 16);

      n = (n + 1.5) / 3.0;
      n = Math.max(0, Math.min(1, n));

      const nx = (Math.sin(u * Math.PI * 2) + Math.sin(v * Math.PI * 2)) * 0.25 + 0.5;
      const ny = (Math.cos(u * Math.PI * 2) + Math.cos(v * Math.PI * 2)) * 0.25 + 0.5;

      data[i] = nx * 255;
      data[i + 1] = ny * 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const oceanNormalMap = createOceanNormalMap();

const oceanMaterial = new THREE.MeshStandardMaterial({
  color: 0x0fa3b8,
  roughness: 0.15,
  metalness: 0.0,
  normalMap: oceanNormalMap,
  normalScale: new THREE.Vector2(0.6, 0.6),
  fog: false
});
oceanNormalMap.repeat.set(150, 150);

const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.3;
ocean.receiveShadow = false;
ocean.castShadow = false;
scene.add(ocean);

// Arena floor size from shared config
const FLOOR_SIZE = ARENA_HALF_SIZE * 2;
const HALF = FLOOR_SIZE / 2;

// Shallow water ring (~14 units wide) at y = -0.25
const shallowWidth = 14;
const inner = HALF;
const outer = HALF + shallowWidth;

function createShallowTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = y / size;
      // Fade from inner (opaque aqua) to outer (transparent)
      const alpha = Math.max(0, 1 - v) * 0.85;
      data[i] = 0x7f;
      data[i + 1] = 0xe3;
      data[i + 2] = 0xd0;
      data[i + 3] = alpha * 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Four strips forming a ring around the square floor
const shallowMat = new THREE.MeshBasicMaterial({
  map: createShallowTexture(),
  transparent: true,
  depthWrite: false,
  fog: false,
  side: THREE.DoubleSide
});

// North strip (z = -outer to -inner)
const northGeo = new THREE.PlaneGeometry(FLOOR_SIZE + shallowWidth * 2, shallowWidth);
const north = new THREE.Mesh(northGeo, shallowMat);
north.rotation.x = -Math.PI / 2;
north.position.set(0, -0.25, -(inner + outer) / 2);
north.receiveShadow = false;
north.castShadow = false;
scene.add(north);

// South strip
const south = new THREE.Mesh(northGeo, shallowMat);
south.rotation.x = -Math.PI / 2;
south.position.set(0, -0.25, (inner + outer) / 2);
south.receiveShadow = false;
south.castShadow = false;
scene.add(south);

// East strip (x = inner to outer)
const eastGeo = new THREE.PlaneGeometry(shallowWidth, FLOOR_SIZE);
const east = new THREE.Mesh(eastGeo, shallowMat);
east.rotation.x = -Math.PI / 2;
east.position.set((inner + outer) / 2, -0.25, 0);
east.receiveShadow = false;
east.castShadow = false;
scene.add(east);

// West strip
const west = new THREE.Mesh(eastGeo, shallowMat);
west.rotation.x = -Math.PI / 2;
west.position.set(-(inner + outer) / 2, -0.25, 0);
west.receiveShadow = false;
west.castShadow = false;
scene.add(west);

// Thin foam strip (~1.2 wide) at y = -0.2 along the sand edge
const foamWidth = 1.2;
const foamInner = HALF;
const foamOuter = HALF + foamWidth;

function createFoamTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = y / size;
      // Broken noise fading outward
      const noise = (Math.sin(x * 0.1) + Math.cos(y * 0.07) + Math.sin((x + y) * 0.05)) / 3;
      const alpha = Math.max(0, 1 - v) * 0.5 * (0.5 + noise * 0.5);
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha * 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

const foamMat = new THREE.MeshBasicMaterial({
  map: createFoamTexture(),
  transparent: true,
  depthWrite: false,
  fog: false,
  side: THREE.DoubleSide
});

// North foam
const foamNorthGeo = new THREE.PlaneGeometry(FLOOR_SIZE + foamWidth * 2, foamWidth);
const foamNorth = new THREE.Mesh(foamNorthGeo, foamMat);
foamNorth.rotation.x = -Math.PI / 2;
foamNorth.position.set(0, -0.2, -(foamInner + foamOuter) / 2);
foamNorth.receiveShadow = false;
foamNorth.castShadow = false;
scene.add(foamNorth);

// South foam
const foamSouth = new THREE.Mesh(foamNorthGeo, foamMat);
foamSouth.rotation.x = -Math.PI / 2;
foamSouth.position.set(0, -0.2, (foamInner + foamOuter) / 2);
foamSouth.receiveShadow = false;
foamSouth.castShadow = false;
scene.add(foamSouth);

// East foam
const foamEastGeo = new THREE.PlaneGeometry(foamWidth, FLOOR_SIZE);
const foamEast = new THREE.Mesh(foamEastGeo, foamMat);
foamEast.rotation.x = -Math.PI / 2;
foamEast.position.set((foamInner + foamOuter) / 2, -0.2, 0);
foamEast.receiveShadow = false;
foamEast.castShadow = false;
scene.add(foamEast);

// West foam
const foamWest = new THREE.Mesh(foamEastGeo, foamMat);
foamWest.rotation.x = -Math.PI / 2;
foamWest.position.set(-(foamInner + foamOuter) / 2, -0.2, 0);
foamWest.receiveShadow = false;
foamWest.castShadow = false;
scene.add(foamWest);

// Store foam meshes for animation
const foamMeshes = [foamNorth, foamSouth, foamEast, foamWest];

// Light haze fog at the horizon color, far distance larger so ocean stays turquoise
scene.fog = new THREE.FogExp2(0xbfd4e8, 0.0016);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, PLAYER_EYE_HEIGHT, 0);

// Create 3D Arena (walls/obstacles cast+receive, floor receives)
const collidables = createArena(scene, dirLight);

// Spawn points and cover positions (match server constants)
const coverPositions = [
  { x: -10, z: -10 }, { x: 10, z: -5 }, { x: 0, z: 12 },
  { x: -12, z: 8 }, { x: 15, z: 12 }
];

// Add scenery (trees/rocks/hut) from the shared seeded layout.
// Only palms are skipped here; crates use the default count of 16.
const { layout, shapes: collisionShapes } = buildWorld();
addSceneryFromLayout(scene, layout);
addCratesFromLayout(scene, layout, collidables);

// Create Player Controls
const playerControls = new PlayerControls(camera, document.body, collidables, collisionShapes);

// Create UI
const ui = new UI();
ui.createRoomCodeDisplay();
ui.initInviteBlock();

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
  // No shooting while waiting in the lobby
  if (network.isInLobby()) return;

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
  const me = playersList.find((d) => d.id === network.socket.id);
  if (me && me.position) {
    playerControls.getWorldPosition().set(me.position.x, me.position.y, me.position.z);
    playerControls.velocity.set(0, 0, 0);
  }
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
    playerControls.getWorldPosition().set(data.position.x, data.position.y, data.position.z);
    playerControls.velocity.set(0, 0, 0);
  } else {
    // Other player respawned
    otherPlayers.respawnPlayer(data.id, data.position, data.health);
  }
});

network.onPlayerHealth((data) => {
  if (data.id === network.getMyId()) {
    myHealth = data.health;
    myMaxHealth = data.maxHealth;
    ui.updateHealth(myHealth, myMaxHealth);
  } else {
    otherPlayers.updateHealth(data.id, data.health, data.maxHealth);
  }
});

network.onScoreboardUpdate((players) => {
  // Add local player to scoreboard data
  const scoreboardData = players.map(p => ({
    ...p,
    name: (p.name && String(p.name).trim()) ? p.name : p.id.slice(0, 4).toUpperCase()
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

// ============================================================
// Lobby
// ============================================================
let lobbyBusy = false;
let lobbyTimeout = null;

function enableLobbyButtons() {
  lobbyBusy = false;
  ui.setLobbyButtonsEnabled(network.isSocketConnected());
}

function startLobbyTimeout() {
  if (lobbyTimeout) clearTimeout(lobbyTimeout);
  lobbyTimeout = setTimeout(() => {
    lobbyBusy = false;
    enableLobbyButtons();
    ui.setLobbyError('No response from the server');
  }, 5000);
}

ui.setLobbyCallbacks(
  () => {
    if (lobbyBusy) return;
    lobbyBusy = true;
    ui.setLobbyButtonsEnabled(false);
    ui.setLobbyError('');
    ui.setLobbyStatus('');
    ui.clearLobbyInvite();
    network.createRoom(null, ui.getLobbyName());
    startLobbyTimeout();
  },
  () => {
    if (lobbyBusy) return;
    const code = ui.getLobbyCode();
    if (!code) {
      ui.setLobbyError('Enter a 4-character room code');
      return;
    }
    lobbyBusy = true;
    ui.setLobbyButtonsEnabled(false);
    ui.setLobbyError('');
    ui.setLobbyStatus('');
    ui.clearLobbyInvite();
    network.joinRoom(code, ui.getLobbyName());
    startLobbyTimeout();
  }
);

// ============================================================
// Screen state - ONE source of truth for what is visible
// ============================================================
let currentScreen = 'lobby';

function setScreen(state) {
  currentScreen = state;
  window.__fpsCurrentScreen = state;
  console.log('[SCREEN]', state);

  const inRoom = state !== 'lobby';

  // Lobby overlay
  if (state === 'lobby') {
    ui.showLobby();
    ui.hideHUD();
  } else {
    ui.hideLobby();
    ui.showHUD();
  }

  // "Click to Play" overlay + Esc hint + LEAVE ROOM button
  blocker.style.display = (state === 'ready') ? 'flex' : 'none';
  leaveRoomBtn.style.display = (state === 'ready') ? 'inline-block' : 'none';
  escHint.style.display = (state === 'ready') ? 'block' : 'none';

  // Invite block: only on the "ready" screen
  if (state === 'ready') ui.showInviteBlock(); else ui.hideInviteBlock();

  // Crosshair (defined in index.html)
  const crosshair = document.getElementById('crosshair');
  if (crosshair) crosshair.style.display = inRoom ? 'block' : 'none';

  // Canvas must not capture clicks while the lobby is shown
  renderer.domElement.style.pointerEvents = state === 'lobby' ? 'none' : 'auto';
}

function onRoomJoined(data) {
  console.log('[NET] roomJoined handler called', data);
  try { lobbyBusy = false; enableLobbyButtons(); } catch (e) { console.error('[ROOM] enableLobbyButtons', e); }
  try { setScreen('ready'); } catch (e) { console.error('[ROOM] setScreen ready', e); }
  try { ui.setRoomCode(data.roomCode); } catch (e) { console.error('[ROOM] setRoomCode', e); }
  try { ui.setLobbyError(''); } catch (e) { console.error('[ROOM] setLobbyError', e); }
  try { ui.clearLobbyCode(); } catch (e) { console.error('[ROOM] clearLobbyCode', e); }
  try { ui.clearLobbyInvite(); } catch (e) { console.error('[ROOM] clearLobbyInvite', e); }
  try { ui.setInviteLink(data.roomCode); } catch (e) { console.error('[ROOM] setInviteLink', e); }
  try {
    if (readInviteCode()) {
      history.replaceState(null, '', `${window.location.pathname}`);
    }
  } catch (e) { console.error('[ROOM] history.replaceState', e); }

  // Clear the safety timeout
  if (lobbyTimeout) { clearTimeout(lobbyTimeout); lobbyTimeout = null; }
}

function onRoomError(data) {
  console.log('[NET] roomError handler called', data);
  try { lobbyBusy = false; enableLobbyButtons(); } catch (e) { console.error('[ROOM] enableLobbyButtons', e); }
  try { setScreen('lobby'); } catch (e) { console.error('[ROOM] setScreen lobby', e); }
  try { ui.setLobbyError(data.message); } catch (e) { console.error('[ROOM] setLobbyError', e); }
  try { ui.clearLobbyInvite(); } catch (e) { console.error('[ROOM] clearLobbyInvite', e); }

  if (lobbyTimeout) { clearTimeout(lobbyTimeout); lobbyTimeout = null; }
}

network.onRoomJoined(onRoomJoined);
network.onRoomError(onRoomError);

// Full local reset when leaving a room. Runs synchronously, is safe to call
// twice (the button click and the server reply both use it).
function resetRoomState() {
  // 1. Remove other-player capsules, labels and interpolation state
  otherPlayers.clear();

  // 2. Remove live visual effects from the scene
  shootingSystem.clearSceneEffects();

  // 3. Clear scoreboard data and hide the scoreboard and death screen
  ui.updateScoreboard([]);
  ui.hideScoreboard();
  ui.hideDeathScreen();

  // 4. Reset local state
  isDead = false;
  myHealth = 100;
  myMaxHealth = 100;
  myKills = 0;
  myDeaths = 0;
  ui.hits = 0;
  ui.kills = 0;
  ui.deaths = 0;
  ui.health = 100;
  ui.maxHealth = 100;
  ui.updateHealth(100, 100);
  ui.updateAmmo(30, 30);
  ui.hitCounter.textContent = 'HITS: 0';
  ui.kdCounter.textContent = 'KILLS: 0  DEATHS: 0';
  ui.updatePlayerCount(1);
  ui.hideRoomCode();
  ui.hideInviteBlock();

  // 5. Exit pointer lock
  if (document.pointerLockElement) document.exitPointerLock();

  // 6. Back to the lobby
  ui.setLobbyError('');
  ui.clearLobbyCode();
  enableLobbyButtons();
  setScreen('lobby');

  console.log('[LEAVE] reset done', performance.now());
}

function onRoomLeft() {
  console.log('[LEAVE] roomLeft received', performance.now());
  try { resetRoomState(); } catch (e) { console.error('[ROOM] resetRoomState', e); }
}

network.onRoomLeft(onRoomLeft);

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

// ============================================================
// Invite link handling
// ============================================================
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function readInviteCode() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('room');
  if (!raw || raw.length !== 4) return null;
  const code = raw.toUpperCase();
  return [...code].every((c) => ROOM_CODE_CHARS.includes(c)) ? code : null;
}

const inviteCode = readInviteCode();
if (inviteCode) {
  ui.lobbyCodeInput.value = inviteCode;
  ui.setLobbyInvite(`Invite link: press JOIN to enter room ${inviteCode}`);
}

function copyInviteLink() {
  const code = network.getRoomCode();
  if (!code) return;
  const url = `${window.location.origin}/?room=${code}`;

  const finish = (ok) => {
    ui.setCopyInviteStatus(ok ? 'Copied!' : '');
    setTimeout(() => ui.setCopyInviteStatus(''), 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => finish(true)).catch(() => finish(fallbackCopy(url)));
  } else {
    finish(fallbackCopy(url));
  }
}

function fallbackCopy(text) {
  // Select the invite link text box so the player can also copy it by hand
  if (ui.inviteLinkEl) {
    ui.inviteLinkEl.focus();
    ui.inviteLinkEl.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    return ok;
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

ui.onCopyInvite(copyInviteLink);

// Give network a moment to connect, then set myId
setTimeout(() => {
  otherPlayers.setMyId(network.getMyId());
}, 100);

// Pointer Lock UI Blocker Setup
const blocker = document.getElementById('blocker');
const instructions = document.getElementById('instructions');
const leaveRoomBtn = document.getElementById('leave-room');
const escHint = document.getElementById('esc-hint');

// Pointer lock may be requested ONLY from the Click to Play overlay while in
// ready state. The lobby, code input, CREATE ROOM, JOIN and LEAVE ROOM buttons
// must never trigger it.
instructions.addEventListener('click', (e) => {
  if (currentScreen !== 'ready') return;
  if (e.target !== instructions && !instructions.contains(e.target)) return;
  if (window.__fpsCurrentScreen !== 'ready') return;
  playerControls.lock();
});

// LEAVE ROOM button: must not start pointer lock.
// Reset locally the moment the button is clicked, then emit leaveRoom.
leaveRoomBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  console.log('[LEAVE] click', performance.now());
  network.startLeaving();
  resetRoomState();
  network.leaveRoom();
});

// Pointer lock changes are the only trigger for the playing/ready transition
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement) {
    if (currentScreen === 'lobby') {
      // Pointer lock was gained while in the lobby - refuse it and stay put
      document.exitPointerLock();
      return;
    }
    setScreen('playing');
  } else if (network.isInLobby()) {
    setScreen('lobby');
  } else {
    setScreen('ready');
  }
});

// If the socket connects before the lobby is shown, unlock it immediately
if (network.socket) {
  network.socket.on('connect', () => setScreen('lobby'));
  if (network.socket.connected) setScreen('lobby');
}

// Initial screen
setScreen('lobby');

// Window Resize Handler
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main Render Loop
const clock = new THREE.Clock();
const perfEl = document.createElement('div');
perfEl.style.cssText = "position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-family:'Courier New',monospace;font-size:13px;color:#9fe;text-shadow:0 0 4px #000;pointer-events:none;z-index:5;";
perfEl.textContent = 'FPS -- | PING --';
document.body.appendChild(perfEl);
let perfFrames = 0;
let perfPing = '--';
setInterval(() => {
  perfEl.textContent = 'FPS ' + perfFrames + ' | PING ' + perfPing;
  perfFrames = 0;
}, 1000);
setInterval(() => {
  if (!network.socket || !network.socket.connected) { perfPing = '--'; return; }
  const t0 = performance.now();
  network.socket.emit('pingCheck', () => { perfPing = Math.round(performance.now() - t0) + ' ms'; });
}, 2000);

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.getElapsedTime();
  perfFrames++;

  // Animate ocean normal map offset for ripples
  if (oceanMaterial && oceanMaterial.normalMap) {
    oceanMaterial.normalMap.offset.x += delta * 0.01;
    oceanMaterial.normalMap.offset.y += delta * 0.006;
  }

  // Animate foam opacity gently (0.5 to 0.9)
  if (foamMeshes) {
    const foamOpacity = 0.7 + Math.sin(time * 1.5) * 0.2;
    foamMeshes.forEach(m => m.material.opacity = foamOpacity);
  }

  // Don't update movement if dead or still in the lobby
  if (!isDead && !network.isInLobby()) {
    playerControls.update(delta);
  }

  shootingSystem.update(delta);
  targetSystem.update(delta);
  otherPlayers.update(delta);

  // Send local player position/rotation to server (throttled in network.js)
  const pos = playerControls.getWorldPosition();
  const quat = playerControls.getWorldQuaternion();
  if (network.socket?.connected && !isDead) {
    network.sendPlayerUpdate(pos, quat, playerControls.eyeHeight);
  }

  renderer.render(scene, camera);
}

animate();