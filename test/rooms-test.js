import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';
import { setTimeout as sleep } from 'timers/promises';

// ============================================================
// Minimal THREE.Vector3 clone for server math
class THREE {
  static Vector3 = class {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    normalize() { const len = Math.sqrt(this.x**2 + this.y**2 + this.z**2); if (len > 0) { this.x /= len; this.y /= len; this.z /= len; } return this; }
    clone() { return new THREE.Vector3(this.x, this.y, this.z); }
  };
}

// ============================================================
// Player height constants (match server/src/index.js)
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_HEIGHT = 1.8;
const PLAYER_BODY_RADIUS = 0.4;
const PLAYER_HEAD_RADIUS = 0.25;
const PLAYER_HEAD_CENTER_OFFSET = 1.7;

// Weapon range constant (server only)
const MAX_SHOT_RANGE = 200;

// Room constants
const MAX_PLAYERS_PER_ROOM = 8;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ============================================================
// Server hit detection functions (match server/src/index.js)

function raySphereIntersection(rayOrigin, rayDir, sphereCenter, radius) {
  const oc = { x: rayOrigin.x - sphereCenter.x, y: rayOrigin.y - sphereCenter.y, z: rayOrigin.z - sphereCenter.z };
  const a = rayDir.x * rayDir.x + rayDir.y * rayDir.y + rayDir.z * rayDir.z;
  const b = 2 * (oc.x * rayDir.x + oc.y * rayDir.y + oc.z * rayDir.z);
  const c = oc.x * oc.x + oc.y * oc.y + oc.z * oc.z - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  const t = (t1 >= 0) ? t1 : (t2 >= 0 ? t2 : null);
  if (t === null) return null;
  return { distance: t, point: { x: rayOrigin.x + rayDir.x * t, y: rayOrigin.y + rayDir.y * t, z: rayOrigin.z + rayDir.z * t } };
}

function rayCylinderIntersection(rayOrigin, rayDir, capsulePos, radius, height) {
  const cylMinY = capsulePos.y;
  const cylMaxY = capsulePos.y + height;
  const dirXZ = Math.sqrt(rayDir.x * rayDir.x + rayDir.z * rayDir.z);
  if (dirXZ < 0.0001) return null;
  const a = rayDir.x * rayDir.x + rayDir.z * rayDir.z;
  const b = 2 * (rayOrigin.x * rayDir.x + rayOrigin.z * rayDir.z - capsulePos.x * rayDir.x - capsulePos.z * rayDir.z);
  const c = (rayOrigin.x - capsulePos.x) ** 2 + (rayOrigin.z - capsulePos.z) ** 2 - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  let hit = null;
  for (const t of [t1, t2]) {
    if (t < 0) continue;
    const y = rayOrigin.y + rayDir.y * t;
    if (y >= cylMinY && y <= cylMaxY) {
      if (!hit || t < hit.distance) {
        hit = { distance: t, point: { x: rayOrigin.x + rayDir.x * t, y: y, z: rayOrigin.z + rayDir.z * t } };
      }
    }
  }
  if (Math.abs(rayDir.y) > 0.0001) {
    for (const capY of [cylMinY, cylMaxY]) {
      const t = (capY - rayOrigin.y) / rayDir.y;
      if (t < 0) continue;
      const x = rayOrigin.x + rayDir.x * t;
      const z = rayOrigin.z + rayDir.z * t;
      const distSq = (x - capsulePos.x) ** 2 + (z - capsulePos.z) ** 2;
      if (distSq <= radius * radius) {
        if (!hit || t < hit.distance) {
          hit = { distance: t, point: { x, y: capY, z } };
        }
      }
    }
  }
  return hit;
}

function rayCapsuleIntersection(rayOrigin, rayDir, capsulePos, bodyRadius, bodyHeight, headRadius, headCenterY) {
  const maxDistance = MAX_SHOT_RANGE;
  let closestHit = null;
  const headCenter = { x: capsulePos.x, y: headCenterY, z: capsulePos.z };
  const headHit = raySphereIntersection(rayOrigin, rayDir, headCenter, headRadius);
  if (headHit && headHit.distance <= maxDistance) {
    closestHit = { ...headHit, isHeadshot: true };
  }
  const bodyHit = rayCylinderIntersection(rayOrigin, rayDir, capsulePos, bodyRadius, bodyHeight);
  if (bodyHit && bodyHit.distance <= maxDistance) {
    if (!closestHit || bodyHit.distance < closestHit.distance) {
      closestHit = { ...bodyHit, isHeadshot: false };
    }
  }
  return closestHit;
}

// ============================================================
// Start test server

const TEST_PORT = 3100;
const httpServer = createServer();
const io = new Server(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } });

// Room state: Map<roomCode, { players: Map<socketId, playerData>, createdAt: number }>
const rooms = new Map();

function getRandomColor() { return 0xff4444; }

function getRandomSpawnPoint() {
  return { x: 0, y: 0, z: 0 }; // feet position
}

function generateRoomCode(existingCodes) {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (existingCodes.has(code));
  return code;
}

function getPlayerRoom(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.has(socketId)) {
      return { code, room };
    }
  }
  return null;
}

function createRoom(requestedCode = null) {
  const code = requestedCode && !rooms.has(requestedCode) ? requestedCode : generateRoomCode(rooms);
  const room = {
    players: new Map(),
    createdAt: Date.now()
  };
  rooms.set(code, room);
  console.log(`[SERVER] room ${code} created`);
  return { code, room };
}

function joinRoom(socket, roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return { success: false, message: 'Room not found' };
  }
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    return { success: false, message: 'Room full' };
  }

  const spawn = getRandomSpawnPoint();
  const playerData = {
    id: socket.id,
    position: { x: spawn.x, y: spawn.y, z: spawn.z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    color: getRandomColor(),
    health: 100,
    maxHealth: 100,
    kills: 0,
    deaths: 0,
    isDead: false,
    respawnTimer: 0
  };

  room.players.set(socket.id, playerData);
  socket.join(roomCode);

  console.log(`[SERVER] ${socket.id.slice(0,4)} joined room ${roomCode} (${room.players.size} players)`);

  return { success: true, roomCode, room, playerData };
}

function leaveRoom(socketId) {
  const found = getPlayerRoom(socketId);
  if (!found) return;

  const { code, room } = found;
  room.players.delete(socketId);

  if (room.players.size === 0) {
    rooms.delete(code);
    console.log(`[SERVER] room ${code} deleted`);
  }
}

function broadcastScoreboard(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const scoreboard = Array.from(room.players.values()).map(p => ({
    id: p.id, name: p.id.slice(0,4).toUpperCase(), kills: p.kills, deaths: p.deaths,
    color: p.color, health: p.health, isDead: p.isDead
  }));
  io.to(roomCode).emit('scoreboardUpdate', scoreboard);
}

io.on('connection', (socket) => {
  console.log(`[SERVER] connected ${socket.id}, total players: ${Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0) + 1}`);

  socket.on('createRoom', (requestedCode) => {
    const currentRoom = getPlayerRoom(socket.id);
    if (currentRoom) {
      leaveRoom(socket.id);
    }

    const result = createRoom(requestedCode);
    const roomCode = result.code;
    const room = result.room;

    const spawn = getRandomSpawnPoint();
    const playerData = {
      id: socket.id, position: { x: spawn.x, y: spawn.y, z: spawn.z },
      rotation: { x: 0, y: 0, z: 0, w: 1 }, color: getRandomColor(),
      health: 100, maxHealth: 100, kills: 0, deaths: 0, isDead: false, respawnTimer: 0
    };

    room.players.set(socket.id, playerData);
    socket.join(roomCode);

    const playersList = Array.from(room.players.values()).map(p => ({
      id: p.id,
      position: { x: p.position.x, y: p.position.y + PLAYER_EYE_HEIGHT, z: p.position.z },
      rotation: p.rotation, color: p.color,
      health: p.health, maxHealth: p.maxHealth, kills: p.kills, deaths: p.deaths, isDead: p.isDead
    }));
    socket.emit('playersList', playersList);

    socket.emit('roomJoined', { roomCode, myId: socket.id });

    console.log(`[SERVER] ${socket.id.slice(0,4)} created and joined room ${roomCode} (${room.players.size} players)`);
  });

  socket.on('joinRoom', (roomCode) => {
    const currentRoom = getPlayerRoom(socket.id);
    if (currentRoom) {
      leaveRoom(socket.id);
    }

    const result = joinRoom(socket, roomCode);
    if (!result.success) {
      socket.emit('roomError', { message: result.message });
      return;
    }

    const { room, playerData } = result;

    const playersList = Array.from(room.players.values()).map(p => ({
      id: p.id,
      position: { x: p.position.x, y: p.position.y + PLAYER_EYE_HEIGHT, z: p.position.z },
      rotation: p.rotation, color: p.color,
      health: p.health, maxHealth: p.maxHealth, kills: p.kills, deaths: p.deaths, isDead: p.isDead
    }));
    socket.emit('playersList', playersList);

    socket.to(roomCode).emit('playerJoined', {
      id: playerData.id,
      position: { x: playerData.position.x, y: playerData.position.y + PLAYER_EYE_HEIGHT, z: playerData.position.z },
      rotation: playerData.rotation, color: playerData.color,
      health: playerData.health, maxHealth: playerData.maxHealth, kills: playerData.kills, deaths: playerData.deaths, isDead: playerData.isDead
    });

    socket.emit('roomJoined', { roomCode, myId: socket.id });
  });

  socket.on('playerUpdate', (data) => {
    const found = getPlayerRoom(socket.id);
    if (!found) return;

    const { room, code } = found;
    const player = room.players.get(socket.id);
    if (player && !player.isDead) {
      const feetY = data.position.y - PLAYER_EYE_HEIGHT;
      player.position.x = data.position.x;
      player.position.y = feetY;
      player.position.z = data.position.z;
      player.rotation.x = data.rotation.x;
      player.rotation.y = data.rotation.y;
      player.rotation.z = data.rotation.z;
      player.rotation.w = data.rotation.w;

      socket.to(code).emit('playerMoved', {
        id: socket.id,
        position: { x: data.position.x, y: data.position.y, z: data.position.z },
        rotation: data.rotation
      });
    }
  });

  socket.on('playerShoot', (data) => {
    const found = getPlayerRoom(socket.id);
    if (!found) return;

    const { room, code } = found;
    const shooter = room.players.get(socket.id);
    if (!shooter || shooter.isDead) return;

    const { origin, direction } = data;

    let hitResult = null, hitPlayerId = null;
    for (const [id, target] of room.players) {
      if (id === socket.id || target.isDead) continue;

      const feetY = target.position.y;
      const hit = rayCapsuleIntersection(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: direction.x, y: direction.y, z: direction.z },
        { x: target.position.x, y: feetY, z: target.position.z },
        PLAYER_BODY_RADIUS, PLAYER_HEIGHT, PLAYER_HEAD_RADIUS, feetY + PLAYER_HEAD_CENTER_OFFSET
      );

      if (hit && (!hitResult || hit.distance < hitResult.distance)) {
        hitResult = hit;
        hitPlayerId = id;
      }
    }

    io.to(code).emit('shotFired', { shooterId: socket.id, origin, direction, hitTargetId: hitPlayerId, hitPoint: hitResult ? hitResult.point : null, isHeadshot: hitResult ? hitResult.isHeadshot : false });

    if (hitPlayerId && hitResult) {
      const target = room.players.get(hitPlayerId);
      const damage = hitResult.isHeadshot ? 50 : 25;
      target.health -= damage;
      socket.emit('playerHit', { targetId: hitPlayerId, isHeadshot: hitResult.isHeadshot });
      if (target.health <= 0) {
        target.health = 0; target.isDead = true; target.deaths++; shooter.kills++;
        io.to(code).emit('playerDied', { victimId: hitPlayerId, killerId: socket.id, isHeadshot: hitResult.isHeadshot });
        setTimeout(() => {
          const t = room.players.get(hitPlayerId);
          if (t && t.isDead) {
            const spawn = getRandomSpawnPoint();
            t.position = { x: spawn.x, y: spawn.y, z: spawn.z }; t.health = t.maxHealth; t.isDead = false; t.respawnTimer = 0;
            io.to(code).emit('playerRespawned', { id: hitPlayerId, position: { x: t.position.x, y: t.position.y + PLAYER_EYE_HEIGHT, z: t.position.z }, health: t.health });
            broadcastScoreboard(code);
          }
        }, 3000);
      }
      broadcastScoreboard(code);
    }
  });

  socket.on('disconnect', () => {
    const totalPlayers = Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0);
    console.log(`[SERVER] disconnected ${socket.id}, total players: ${totalPlayers}`);
    leaveRoom(socket.id);
  });

  socket.on('requestScoreboard', () => {
    const found = getPlayerRoom(socket.id);
    if (found) {
      broadcastScoreboard(found.code);
    }
  });
});

async function waitForEvent(socket, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${eventName} timeout`)), timeout);
    const handler = (data) => { clearTimeout(timer); socket.off(eventName, handler); resolve(data); };
    socket.on(eventName, handler);
  });
}

await new Promise(resolve => httpServer.listen(TEST_PORT, resolve));
console.log(`[TEST] Server listening on port ${TEST_PORT}`);

// ============================================================
// Test helper

async function connectClient(roomCode = 'TEST') {
  const client = ClientIO(`http://localhost:${TEST_PORT}`, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false });

  // Set up the race promises BEFORE connecting
  const joinPromise = new Promise((resolve) => {
    client.once('roomJoined', (data) => resolve({ type: 'joined', data }));
  });

  const errorPromise = new Promise((resolve) => {
    client.once('roomError', (data) => resolve({ type: 'error', data }));
  });

  // Set up playersList listener BEFORE connecting
  const playersListPromise = new Promise((resolve) => {
    client.once('playersList', (data) => resolve(data));
  });

  client.connect();
  await waitForEvent(client, 'connect');
  client.id = client.id;

  // Join the room - race between roomJoined and roomError
  client.emit('joinRoom', roomCode);

  // Race between roomJoined and roomError
  const result = await Promise.race([joinPromise, errorPromise]);

  if (result.type === 'joined') {
    client.roomCode = result.data.roomCode;
    client.myId = result.data.myId;
  } else {
    // roomError was emitted - create the room
    client.emit('createRoom', roomCode);
    const roomJoinedData = await waitForEvent(client, 'roomJoined');
    client.roomCode = roomJoinedData.roomCode;
    client.myId = roomJoinedData.myId;
  }

  // Wait for playersList (use pre-registered promise)
  await playersListPromise;

  return client;
}

// ============================================================
// Tests

async function testTwoClientsSameRoom() {
  console.log('\n[TEST] Two clients in same room should see each other');

  const clientA = await connectClient('TEST');
  const clientB = await connectClient('TEST');

  await sleep(200); // let playerJoined propagate

  // A moves
  let movedB = false;
  clientB.on('playerMoved', () => { movedB = true; });

  clientA.emit('playerUpdate', { position: { x: 5, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
  await sleep(150);

  // A shoots at B
  let bHit = false;
  clientB.on('shotFired', (data) => { if (data.hitTargetId === clientB.myId) bHit = true; });

  clientA.emit('playerShoot', { origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: -1 } });
  await sleep(200);

  clientA.disconnect();
  clientB.disconnect();

  if (movedB && bHit) {
    console.log('[TEST] PASS: Clients in same room see moves and shots');
    return true;
  } else {
    console.log('[TEST] FAIL: Clients in same room did not see moves/shots');
    return false;
  }
}

async function testClientInDifferentRoom() {
  console.log('\n[TEST] Client in different room should NOT see moves/shots');

  const clientA = await connectClient('ROOM1');
  const clientB = await connectClient('ROOM2');

  await sleep(200);

  // A moves
  let movedB = false;
  clientB.on('playerMoved', () => { movedB = true; });

  clientA.emit('playerUpdate', { position: { x: 5, y: 1.6, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
  await sleep(150);

  // A shoots at B
  let bHit = false;
  clientB.on('shotFired', (data) => { if (data.hitTargetId === clientB.myId) bHit = true; });

  clientA.emit('playerShoot', { origin: { x: 0, y: 1.6, z: 0 }, direction: { x: 0, y: 0, z: -1 } });
  await sleep(200);

  clientA.disconnect();
  clientB.disconnect();

  if (!movedB && !bHit) {
    console.log('[TEST] PASS: Clients in different rooms do NOT see moves/shots');
    return true;
  } else {
    console.log('[TEST] FAIL: Clients in different rooms saw moves/shots');
    return false;
  }
}

async function testWrongRoomCode() {
  console.log('\n[TEST] Joining wrong room code should give roomError');

  const clientA = await connectClient('TEST');
  await sleep(100);

  let roomError = false;
  clientA.on('roomError', (data) => {
    if (data.message === 'Room not found') roomError = true;
  });

  clientA.emit('joinRoom', 'WRONG');
  await sleep(200);

  clientA.disconnect();

  if (roomError) {
    console.log('[TEST] PASS: Wrong room code gives roomError');
    return true;
  } else {
    console.log('[TEST] FAIL: Wrong room code did not give roomError');
    return false;
  }
}

async function testRoomFull() {
  console.log('\n[TEST] 9th player should get Room full error');

  // Create 8 clients in same room
  const clients = [];
  for (let i = 0; i < 8; i++) {
    const client = await connectClient('FULLTEST');
    clients.push(client);
    await sleep(50);
  }

  // Try 9th
  const client9 = ClientIO(`http://localhost:3100`, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false });
  client9.connect();

  let roomFull = false;
  client9.on('roomError', (data) => {
    if (data.message === 'Room full') roomFull = true;
  });

  client9.emit('joinRoom', 'FULLTEST');
  await sleep(300);

  clients.forEach(c => c.disconnect());
  client9.disconnect();

  if (roomFull) {
    console.log('[TEST] PASS: 9th player gets Room full error');
    return true;
  } else {
    console.log('[TEST] FAIL: 9th player did not get Room full error');
    return false;
  }
}

async function testEmptyRoomDeleted() {
  console.log('\n[TEST] Empty room should be deleted');

  const clientA = await connectClient('DELETETEST');
  await sleep(100);

  // Get room code
  const roomCode = clientA.roomCode;

  clientA.disconnect();
  await sleep(300); // wait for disconnect handler

  // Try to join the deleted room
  const clientB = ClientIO(`http://localhost:3100`, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false });
  clientB.connect();

  let roomError = false;
  clientB.on('roomError', (data) => {
    if (data.message === 'Room not found') roomError = true;
  });

  clientB.emit('joinRoom', roomCode);
  await sleep(300);

  clientB.disconnect();

  if (roomError) {
    console.log('[TEST] PASS: Deleted room gives Room not found');
    return true;
  } else {
    console.log('[TEST] FAIL: Deleted room did not give error');
    return false;
  }
}

// ============================================================
// Run all tests

async function runTests() {
  const results = [];

  results.push(await testTwoClientsSameRoom());
  await sleep(500);

  results.push(await testClientInDifferentRoom());
  await sleep(500);

  results.push(await testWrongRoomCode());
  await sleep(500);

  results.push(await testRoomFull());
  await sleep(500);

  results.push(await testEmptyRoomDeleted());
  await sleep(500);

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`\n[TEST] === ROOMS TEST RESULTS ===`);
  console.log(`  Passed: ${passed}/${total}`);

  await new Promise(resolve => httpServer.close(resolve));
  console.log(`\n[TEST] Server stopped`);

  if (passed === total) {
    console.log(`\n[TEST] ALL TESTS PASSED`);
    process.exit(0);
  } else {
    console.log(`\n[TEST] SOME TESTS FAILED`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[TEST] ERROR:', err);
  process.exit(1);
});