import { createServer } from 'http';
import { Server } from 'socket.io';
import { readFile, readdirSync } from 'fs';
import { extname, join, normalize, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { SPAWN_POINTS } from '../shared/config.js';
import { buildWorld } from '../shared/world.js';
import { resolveCollisions, rayHitsShapes } from '../shared/collision.js';

// Directory this file lives in, so we can locate dist/ relative to it.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = resolve(__dirname, '..', 'dist');
const HAS_DIST = (() => {
  try { readdirSync(DIST_DIR); return true; }
  catch { return false; }
})();

// Map of file extension -> MIME type for the built game assets.
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json; charset=utf-8'
};

// Serve the built game from dist/ when it exists. Unknown paths fall back to
// index.html (SPA routing). Path traversal outside dist/ is blocked.
function serveStatic(req, res) {
  if (!HAS_DIST) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  // Reject anything that escapes the dist directory.
  const resolved = resolve(DIST_DIR, '.' + reqPath);
  if (!resolved.startsWith(DIST_DIR + pathSep()) || resolved !== normalize(resolved)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = extname(resolved).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  readFile(resolved, (err, data) => {
    if (err) {
      // Fall back to index.html for unknown paths (SPA routing).
      if (ext === '' || !MIME_TYPES[ext]) {
        readFile(join(DIST_DIR, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data2);
          }
        });
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function pathSep() {
  return process.platform === 'win32' ? '\\' : '/';
}

const httpServer = createServer((req, res) => {
  if (HAS_DIST) {
    serveStatic(req, res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

// In development the page (Vite:5173) and the socket server (3000) are on
// different origins, so allow any localhost origin. In production they share
// one origin, so CORS is not needed.
const isDev = process.env.NODE_ENV !== 'production';
const io = new Server(httpServer, {
  cors: isDev ? {
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST']
  } : false
});

// Spawn points around the arena (feet positions) from shared config
const spawnPoints = SPAWN_POINTS.map(p => ({ x: p.x, y: 0, z: p.z }));

// Player collision radius and the shared world layout (walls, obstacles)
const PLAYER_RADIUS = 0.4;
const WORLD = buildWorld();

// Weapon range constant (server only)
const MAX_SHOT_RANGE = 200;

// Player height constants
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_HEIGHT = 1.8;
const PLAYER_BODY_RADIUS = 0.4;
const PLAYER_HEAD_RADIUS = 0.25;
const PLAYER_HEAD_CENTER_OFFSET = 1.7;

// Room constants
const MAX_PLAYERS_PER_ROOM = 8;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0,O,1,I

// Generate random color for player
function getRandomColor() {
  const colors = [
    0xff4444, 0x44ff44, 0x4444ff, 0xffaa00, 0xff44ff,
    0x00ffff, 0xff8800, 0x8844ff, 0x44ffff, 0xff4488
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

function getRandomSpawnPoint() {
  return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
}

// Generate a unique 4-character room code
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

// Room state: Map<roomCode, { players: Map<socketId, playerData>, createdAt: number }>
const rooms = new Map();

// Get the room a socket is in (or null)
function getPlayerRoom(socketId) {
  for (const [code, room] of rooms) {
    if (room.players.has(socketId)) {
      return { code, room };
    }
  }
  return null;
}

// Create a new room with optional specific code
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

// Sanitize a player name: strip control chars, collapse whitespace,
// trim to 12 chars, fall back to 'Player' if empty.
function cleanName(raw) {
  let s = typeof raw === 'string' ? raw : '';
  s = s.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
  return s || 'Player';
}

// Get or create room for a player
function joinRoom(socket, roomCode, name) {
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
    name: cleanName(name),
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

// Check whether a requested room code is usable (4 chars from ROOM_CODE_CHARS, not already taken)
function isValidRoomCode(code) {
  return typeof code === 'string'
    && code.length === 4
    && [...code].every((c) => ROOM_CODE_CHARS.includes(c))
    && !rooms.has(code);
}

// Remove player from their room, clean up if empty
function leaveRoom(socketId) {
  const found = getPlayerRoom(socketId);
  if (!found) return;

  const { code, room } = found;
  room.players.delete(socketId);

  // Remove the socket from the Socket.IO room namespace if it still exists
  const socket = io.sockets.sockets.get(socketId);
  if (socket) {
    socket.leave(code);
  }

  if (room.players.size === 0) {
    rooms.delete(code);
    console.log(`[SERVER] room ${code} deleted`);
  } else {
    // Notify remaining players in the room
    io.to(code).emit('playerLeft', { id: socketId });
  }
}

// Capsule-ray intersection (server-side hit detection)
function rayCapsuleIntersection(rayOrigin, rayDir, capsulePos, bodyRadius, bodyHeight, headRadius, headCenterY) {
  // rayOrigin and rayDir are THREE.Vector3-like objects {x,y,z}
  // capsulePos is {x,y,z} - center of capsule at FEET level (y=0), body extends up from there

  const maxDistance = MAX_SHOT_RANGE;
  let closestHit = null;

  // Check head sphere first (higher priority for headshot detection)
  const headCenter = { x: capsulePos.x, y: headCenterY, z: capsulePos.z };
  const headHit = raySphereIntersection(rayOrigin, rayDir, headCenter, headRadius);
  if (headHit && headHit.distance <= maxDistance) {
    return { ...headHit, isHeadshot: true };
  }

  // Check body cylinder
  const bodyHit = rayCylinderIntersection(rayOrigin, rayDir, capsulePos, bodyRadius, bodyHeight);
  if (bodyHit && bodyHit.distance <= maxDistance) {
    if (!closestHit || bodyHit.distance < closestHit.distance) {
      closestHit = { ...bodyHit, isHeadshot: false };
    }
  }

  return closestHit;
}

function raySphereIntersection(rayOrigin, rayDir, sphereCenter, radius) {
  const oc = {
    x: rayOrigin.x - sphereCenter.x,
    y: rayOrigin.y - sphereCenter.y,
    z: rayOrigin.z - sphereCenter.z
  };

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

  return {
    distance: t,
    point: {
      x: rayOrigin.x + rayDir.x * t,
      y: rayOrigin.y + rayDir.y * t,
      z: rayOrigin.z + rayDir.z * t
    }
  };
}

function rayCylinderIntersection(rayOrigin, rayDir, capsulePos, radius, height) {
  // Cylinder centered at capsulePos, extending from y to y+height
  const cylMinY = capsulePos.y;
  const cylMaxY = capsulePos.y + height;

  // Project ray onto XZ plane
  const dirXZ = Math.sqrt(rayDir.x * rayDir.x + rayDir.z * rayDir.z);
  if (dirXZ < 0.0001) return null; // Ray parallel to cylinder axis

  // Solve quadratic for infinite cylinder
  const a = rayDir.x * rayDir.x + rayDir.z * rayDir.z;
  const b = 2 * (rayOrigin.x * rayDir.x + rayOrigin.z * rayDir.z - capsulePos.x * rayDir.x - capsulePos.z * rayDir.z);
  const c = (rayOrigin.x - capsulePos.x) ** 2 + (rayOrigin.z - capsulePos.z) ** 2 - radius * radius;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  // Check both intersections for valid Y range
  let hit = null;
  for (const t of [t1, t2]) {
    if (t < 0) continue;
    const y = rayOrigin.y + rayDir.y * t;
    if (y >= cylMinY && y <= cylMaxY) {
      if (!hit || t < hit.distance) {
        hit = {
          distance: t,
          point: {
            x: rayOrigin.x + rayDir.x * t,
            y: y,
            z: rayOrigin.z + rayDir.z * t
          }
        };
      }
    }
  }

  // Check caps (top and bottom disks)
  if (Math.abs(rayDir.y) > 0.0001) {
    for (const capY of [cylMinY, cylMaxY]) {
      const t = (capY - rayOrigin.y) / rayDir.y;
      if (t < 0) continue;
      const x = rayOrigin.x + rayDir.x * t;
      const z = rayOrigin.z + rayDir.z * t;
      const distSq = (x - capsulePos.x) ** 2 + (z - capsulePos.z) ** 2;
      if (distSq <= radius * radius) {
        if (!hit || t < hit.distance) {
          hit = {
            distance: t,
            point: { x, y: capY, z }
          };
        }
      }
    }
  }

  return hit;
}

// Broadcast scoreboard to room
function broadcastScoreboard(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const scoreboard = Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.id.slice(0, 4).toUpperCase(),
    kills: p.kills,
    deaths: p.deaths,
    color: p.color,
    health: p.health,
    isDead: p.isDead
  }));
  io.to(roomCode).emit('scoreboardUpdate', scoreboard);
}

io.on('connection', (socket) => {
  console.log(`[SERVER] connected ${socket.id}, total players: ${Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0) + 1}`);

  // Player not in a room yet - wait for createRoom or joinRoom

  // Create a room (optional code parameter: plain string or { requestedCode })
  socket.on('createRoom', (payload) => {
    // If player already in a room, leave it first
    const currentRoom = getPlayerRoom(socket.id);
    if (currentRoom) {
      leaveRoom(socket.id);
    }

    let requestedCode = null;
    if (typeof payload === 'string') {
      requestedCode = payload;
    } else if (payload && typeof payload.requestedCode === 'string') {
      requestedCode = payload.requestedCode;
    }
    if (!isValidRoomCode(requestedCode)) {
      requestedCode = null;
    }

    const result = createRoom(requestedCode);
    const roomCode = result.code;
    const room = result.room;

    const spawn = getRandomSpawnPoint();
    const playerName = cleanName(payload && typeof payload === 'object' ? payload.name : null);
    const playerData = {
      id: socket.id,
      name: playerName,
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

    // Send current players list to the new player - convert feet to eye position
    const playersList = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      position: { x: p.position.x, y: p.position.y + PLAYER_EYE_HEIGHT, z: p.position.z },
      rotation: p.rotation,
      color: p.color,
      health: p.health,
      maxHealth: p.maxHealth,
      kills: p.kills,
      deaths: p.deaths,
      isDead: p.isDead
    }));
    socket.emit('playersList', playersList);

    socket.emit('roomJoined', { roomCode, myId: socket.id });

    console.log(`[SERVER] ${socket.id.slice(0,4)} created and joined room ${roomCode} (${room.players.size} players)`);
  });

  // Join an existing room
  socket.on('joinRoom', (payload) => {
    // If player already in a room, leave it first
    const roomCode = (payload && typeof payload === 'object') ? payload.roomCode : payload;
    const rawName = (payload && typeof payload === 'object') ? payload.name : null;
    const currentRoom = getPlayerRoom(socket.id);
    if (currentRoom) {
      // If they are already in the requested room, just re-confirm it without
      // leaving and re-joining (which would log a second join).
      if (currentRoom.code === roomCode) {
        const room = currentRoom.room;
        const playerData = room.players.get(socket.id);
        const playersList = Array.from(room.players.values()).map(p => ({
          id: p.id,
          name: p.name,
          position: { x: p.position.x, y: p.position.y + PLAYER_EYE_HEIGHT, z: p.position.z },
          rotation: p.rotation, color: p.color,
          health: p.health, maxHealth: p.maxHealth, kills: p.kills, deaths: p.deaths, isDead: p.isDead
        }));
        socket.emit('playersList', playersList);
        socket.emit('roomJoined', { roomCode, myId: socket.id });
        return;
      }
      leaveRoom(socket.id);
    }

    const result = joinRoom(socket, roomCode, rawName);
    if (!result.success) {
      socket.emit('roomError', { message: result.message });
      return;
    }

    const { room, playerData } = result;

    // Send current players list to the new player - convert feet to eye position
    const playersList = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      position: { x: p.position.x, y: p.position.y + PLAYER_EYE_HEIGHT, z: p.position.z },
      rotation: p.rotation,
      color: p.color,
      health: p.health,
      maxHealth: p.maxHealth,
      kills: p.kills,
      deaths: p.deaths,
      isDead: p.isDead
    }));
    socket.emit('playersList', playersList);

    // Broadcast new player to all OTHER clients in the room - convert feet to eye position
    socket.to(roomCode).emit('playerJoined', {
      id: playerData.id,
      name: playerData.name,
      position: { x: playerData.position.x, y: playerData.position.y + PLAYER_EYE_HEIGHT, z: playerData.position.z },
      rotation: playerData.rotation,
      color: playerData.color,
      health: playerData.health,
      maxHealth: playerData.maxHealth,
      kills: playerData.kills,
      deaths: playerData.deaths,
      isDead: playerData.isDead
    });

    socket.emit('roomJoined', { roomCode, myId: socket.id });
  });

  // Handle position/rotation updates from client (~20 Hz)
  socket.on('playerUpdate', (data) => {
    const found = getPlayerRoom(socket.id);
    if (!found) return; // Not in a room

    const { room } = found;
    const player = room.players.get(socket.id);
    if (player && !player.isDead) {
      // Client sends eye position. Convert to feet position for server storage.
      const rawEye = Number(data.eyeHeight);
      const eyeH = Number.isFinite(rawEye) ? Math.min(PLAYER_EYE_HEIGHT, Math.max(1.0, rawEye)) : PLAYER_EYE_HEIGHT;
      const feetY = data.position.y - eyeH;
      const fixed = resolveCollisions(WORLD.shapes, data.position.x, data.position.z, feetY, PLAYER_RADIUS);
      player.position.x = fixed.x;
      player.position.y = feetY;
      player.position.z = fixed.z;
      player.eyeHeight = eyeH;
      player.rotation.x = data.rotation.x;
      player.rotation.y = data.rotation.y;
      player.rotation.z = data.rotation.z;
      player.rotation.w = data.rotation.w;

      // Broadcast eye position to other clients in the room
      socket.to(found.code).emit('playerMoved', {
        id: socket.id,
        position: { x: fixed.x, y: feetY + PLAYER_EYE_HEIGHT, z: fixed.z },
        rotation: data.rotation,
        eyeHeight: eyeH
      });
    }
  });

  // Handle shooting
  socket.on('playerShoot', (data) => {
    const found = getPlayerRoom(socket.id);
    if (!found) return; // Not in a room

    const { room } = found;
    const shooter = room.players.get(socket.id);
    if (!shooter || shooter.isDead) return;

    const { origin, direction } = data;
    const dlen = Math.hypot(direction.x, direction.y, direction.z);
    if (!dlen) return;
    const dir = { x: direction.x / dlen, y: direction.y / dlen, z: direction.z / dlen };
    const wallDist = rayHitsShapes(WORLD.shapes.shots, origin, dir, MAX_SHOT_RANGE);

    // Hit detection - only against players in the same room
    let hitResult = null, hitPlayerId = null;
    for (const [id, target] of room.players) {
      if (id === socket.id || target.isDead) continue;

      const feetY = target.position.y;
      const crouchScale = Math.min(1, Math.max(0.6, (target.eyeHeight || PLAYER_EYE_HEIGHT) / PLAYER_EYE_HEIGHT));
      const hit = rayCapsuleIntersection(
        { x: origin.x, y: origin.y, z: origin.z },
        { x: dir.x, y: dir.y, z: dir.z },
        { x: target.position.x, y: feetY, z: target.position.z },
        PLAYER_BODY_RADIUS, PLAYER_HEIGHT * crouchScale, PLAYER_HEAD_RADIUS, feetY + PLAYER_HEAD_CENTER_OFFSET * crouchScale
      );

      if (hit && hit.distance <= MAX_SHOT_RANGE && hit.distance < wallDist && (!hitResult || hit.distance < hitResult.distance)) {
        hitResult = hit;
        hitPlayerId = id;
      }
    }

    // Broadcast to room
    io.to(found.code).emit('shotFired', { shooterId: socket.id, origin, direction, hitTargetId: hitPlayerId, hitPoint: hitResult ? hitResult.point : null, isHeadshot: hitResult ? hitResult.isHeadshot : false });

    if (hitPlayerId && hitResult) {
      const target = room.players.get(hitPlayerId);
      const damage = hitResult.isHeadshot ? 50 : 25;
      target.health -= damage;
      target.lastDamageAt = Date.now();
      io.to(found.code).emit('playerHealth', { id: hitPlayerId, health: Math.max(0, target.health), maxHealth: target.maxHealth });
      socket.emit('playerHit', { targetId: hitPlayerId, isHeadshot: hitResult.isHeadshot });
      if (target.health <= 0) {
        target.health = 0; target.isDead = true; target.deaths++; shooter.kills++;
        io.to(found.code).emit('playerDied', { victimId: hitPlayerId, killerId: socket.id, isHeadshot: hitResult.isHeadshot });
        setTimeout(() => {
          const t = room.players.get(hitPlayerId);
          if (t && t.isDead) {
            const spawn = getRandomSpawnPoint();
            t.position = { x: spawn.x, y: spawn.y, z: spawn.z }; t.health = t.maxHealth; t.isDead = false;
            io.to(found.code).emit('playerRespawned', { id: hitPlayerId, position: { x: t.position.x, y: t.position.y + PLAYER_EYE_HEIGHT, z: t.position.z }, health: t.health });
            broadcastScoreboard(found.code);
          }
        }, 3000);
      }
      broadcastScoreboard(found.code);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    const totalPlayers = Array.from(rooms.values()).reduce((sum, r) => sum + r.players.size, 0);
    console.log(`[SERVER] disconnected ${socket.id}, total players: ${totalPlayers}`);
    leaveRoom(socket.id);
  });

  // Request scoreboard
  socket.on('requestScoreboard', () => {
    const found = getPlayerRoom(socket.id);
    if (found) {
      broadcastScoreboard(found.code);
    }
  });

  // Leave the current room (player pressed LEAVE ROOM)
  socket.on('leaveRoom', () => {
    leaveRoom(socket.id);
    console.log(`[SERVER] leaveRoom ${socket.id} handled`);
    socket.emit('roomLeft');
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] listening on ${PORT}`);
  if (isDev) console.log(`CORS enabled for any localhost origin`);
});

// Need THREE.Vector3 for math - use a minimal inline version
class THREE {
  static Vector3 = class {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x; this.y = y; this.z = z;
    }
    normalize() {
      const len = Math.sqrt(this.x**2 + this.y**2 + this.z**2);
      if (len > 0) { this.x /= len; this.y /= len; this.z /= len; }
      return this;
    }
    clone() { return new THREE.Vector3(this.x, this.y, this.z); }
  };
}