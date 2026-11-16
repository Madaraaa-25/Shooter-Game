import { createServer } from 'http';
import { Server } from 'socket.io';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST']
  }
});

// Store connected players: Map<socketId, playerData>
const players = new Map();

// Spawn points around the arena (feet positions)
const spawnPoints = [
  { x: -15, y: 0, z: -15 },
  { x: 15, y: 0, z: -15 },
  { x: -15, y: 0, z: 15 },
  { x: 15, y: 0, z: 15 },
  { x: 0, y: 0, z: -20 },
  { x: 0, y: 0, z: 20 },
  { x: -20, y: 0, z: 0 },
  { x: 20, y: 0, z: 0 },
  { x: -10, y: 0, z: 5 },
  { x: 10, y: 0, z: -5 }
];

// Weapon range constant (server only)
const MAX_SHOT_RANGE = 200;

// Player height constants
const PLAYER_EYE_HEIGHT = 1.6;
const PLAYER_HEIGHT = 1.8;
const PLAYER_BODY_RADIUS = 0.4;
const PLAYER_HEAD_RADIUS = 0.25;
const PLAYER_HEAD_CENTER_OFFSET = 1.7;

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
    closestHit = { ...headHit, isHeadshot: true };
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

// Broadcast scoreboard to all players
function broadcastScoreboard() {
  const scoreboard = Array.from(players.values()).map(p => ({
    id: p.id,
    name: p.id.slice(0, 4).toUpperCase(),
    kills: p.kills,
    deaths: p.deaths,
    color: p.color,
    health: p.health,
    isDead: p.isDead
  }));
  io.emit('scoreboardUpdate', scoreboard);
}

io.on('connection', (socket) => {
  console.log(`[SERVER] connected ${socket.id}, total players: ${players.size + 1}`);

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

  players.set(socket.id, playerData);

  // Send current players list to the new player - convert feet to eye position
  const playersList = Array.from(players.values()).map(p => ({
    id: p.id,
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

  // Broadcast new player to all OTHER clients - convert feet to eye position
  socket.broadcast.emit('playerJoined', {
    id: playerData.id,
    position: { x: playerData.position.x, y: playerData.position.y + PLAYER_EYE_HEIGHT, z: playerData.position.z },
    rotation: playerData.rotation,
    color: playerData.color,
    health: playerData.health,
    maxHealth: playerData.maxHealth,
    kills: playerData.kills,
    deaths: playerData.deaths,
    isDead: playerData.isDead
  });

  // Handle position/rotation updates from client (~20 Hz)
  socket.on('playerUpdate', (data) => {
    const player = players.get(socket.id);
    if (player && !player.isDead) {
      // Client sends eye position (y = 1.6 at ground). Convert to feet position for server storage.
      const feetY = data.position.y - PLAYER_EYE_HEIGHT;
      player.position.x = data.position.x;
      player.position.y = feetY;
      player.position.z = data.position.z;
      player.rotation.x = data.rotation.x;
      player.rotation.y = data.rotation.y;
      player.rotation.z = data.rotation.z;
      player.rotation.w = data.rotation.w;

      // Broadcast eye position to other clients
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        position: { x: data.position.x, y: data.position.y, z: data.position.z },
        rotation: data.rotation
      });
    }
  });

  // Handle shooting
  // Handle shooting
  socket.on('playerShoot', (data) => {
    const shooter = players.get(socket.id);
    if (!shooter || shooter.isDead) return;

    const { origin, direction } = data;

    // Hit detection
    let hitResult = null, hitPlayerId = null;
    for (const [id, target] of players) {
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

    io.emit('shotFired', { shooterId: socket.id, origin, direction, hitTargetId: hitPlayerId, hitPoint: hitResult ? hitResult.point : null, isHeadshot: hitResult ? hitResult.isHeadshot : false });

    if (hitPlayerId && hitResult) {
      const target = players.get(hitPlayerId);
      const damage = hitResult.isHeadshot ? 50 : 25;
      target.health -= damage;
      socket.emit('playerHit', { targetId: hitPlayerId, isHeadshot: hitResult.isHeadshot });
      if (target.health <= 0) {
        target.health = 0; target.isDead = true; target.deaths++; shooter.kills++;
        io.emit('playerDied', { victimId: hitPlayerId, killerId: socket.id, isHeadshot: hitResult.isHeadshot });
        setTimeout(() => {
          const t = players.get(hitPlayerId);
          if (t && t.isDead) {
            const spawn = getRandomSpawnPoint();
            t.position = { x: spawn.x, y: spawn.y, z: spawn.z }; t.health = t.maxHealth; t.isDead = false;
            io.emit('playerRespawned', { id: hitPlayerId, position: { x: t.position.x, y: t.position.y + PLAYER_EYE_HEIGHT, z: t.position.z }, health: t.health });
            broadcastScoreboard();
          }
        }, 3000);
      }
      broadcastScoreboard();
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`[SERVER] disconnected ${socket.id}, total players: ${players.size - 1}`);
    players.delete(socket.id);
    io.emit('playerLeft', { id: socket.id });
    broadcastScoreboard();
  });

  // Request scoreboard
  socket.on('requestScoreboard', () => {
    broadcastScoreboard();
  });
});

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`[SERVER] listening on ${PORT}`);
  console.log(`CORS enabled for any localhost origin`);
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