import { spawn } from 'child_process';
import { io as ClientIO } from 'socket.io-client';
import { setTimeout as sleep } from 'timers/promises';

// ============================================================
// Spawn the REAL server as a child process
// ============================================================
const TEST_PORT = 3100;

const server = spawn('C:\\Program Files\\nodejs\\node.exe', ['server/index.js'], {
  cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:\/)/, '$1'),
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverReady = false;
let serverOutput = '';

server.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  serverOutput += text;
  process.stdout.write(text);
  if (text.includes(`listening on ${TEST_PORT}`)) {
    serverReady = true;
  }
});

server.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  serverOutput += text;
  process.stderr.write(text);
});

server.on('error', (err) => {
  console.error('[TEST] Failed to start server:', err);
  cleanupAndExit(1);
});

server.on('exit', (code) => {
  if (!serverReady) {
    console.error(`[TEST] Server exited early (code ${code}). Output:\n${serverOutput}`);
    process.exit(1);
  }
});

function killServer() {
  return new Promise((resolve) => {
    if (server.killed) return resolve();
    server.on('exit', () => resolve());
    server.kill();
    setTimeout(() => { if (!server.killed) server.kill('SIGKILL'); resolve(); }, 2000);
  });
}

async function cleanupAndExit(code) {
  await killServer();
  process.exit(code);
}

// Wait until the server reports it is listening
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Server did not start in time')), 10000);
  const check = () => {
    if (serverReady) { clearTimeout(timer); resolve(); }
    else if (server.killed) { clearTimeout(timer); reject(new Error('Server died before listening')); }
    else setTimeout(check, 50);
  };
  check();
});

// ============================================================
// Test helpers
// ============================================================

function waitForEvent(client, eventName, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${eventName} timeout`)), timeout);
    const handler = (data) => { clearTimeout(timer); client.off(eventName, handler); resolve(data); };
    client.on(eventName, handler);
  });
}

function connectClient() {
  const client = ClientIO(`http://localhost:${TEST_PORT}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
  });

  // Register the connect listener BEFORE connecting so we never miss the event
  const connected = waitForEvent(client, 'connect');
  client.connect();
  return { client, connected };
}

// Send the EYE position (feet y + PLAYER_EYE_HEIGHT)
function moveTo(client, feetX, feetY, feetZ) {
  client.emit('playerUpdate', {
    position: { x: feetX, y: feetY + 1.6, z: feetZ },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  });
}

// Like moveTo but also sends an explicit eyeHeight (1.0 = crouched)
function moveToCrouched(client, feetX, feetY, feetZ, eyeHeight) {
  client.emit('playerUpdate', {
    position: { x: feetX, y: feetY + eyeHeight, z: feetZ },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    eyeHeight: eyeHeight,
  });
}

// Send a ray from the shooter's eye to a target point
function shootAt(shooter, targetPoint) {
  const eyeY = 1.6;
  const origin = { x: 0, y: eyeY, z: 0 };
  const direction = {
    x: targetPoint.x - origin.x,
    y: targetPoint.y - origin.y,
    z: targetPoint.z - origin.z,
  };
  shooter.emit('playerShoot', { origin, direction });
}

// Track a player's health/kills/deaths from scoreboard updates
function makeTracker(client, myId) {
  const state = { health: 100, kills: 0, deaths: 0 };
  client.on('scoreboardUpdate', (data) => {
    const me = data.find((p) => p.id === myId);
    if (me) { state.health = me.health; state.kills = me.kills; state.deaths = me.deaths; }
  });
  return state;
}

// Kill B (4 body shots at 3m) and wait for it to respawn, leaving it at 100 health
async function resetB() {
  // Register listeners BEFORE firing so we never miss the death/respawn events
  const diedPromise = waitForEvent(clientB, 'playerDied', 8000);
  const respawnedPromise = waitForEvent(clientB, 'playerRespawned', 8000);

  moveTo(clientB, 0, 0, -3);
  await sleep(150);
  for (let i = 0; i < 4; i++) {
    shootAt(clientA, { x: 0, y: 0.9, z: -3 });
    await sleep(150);
  }
  await diedPromise;
  await respawnedPromise;
  await sleep(300);
  clientB.emit('requestScoreboard');
  await sleep(200);
}

// ============================================================
// Test: A shoots B's body centre at 3m
// ============================================================
console.log('\n[TEST] Connecting A (createRoom "PVPT") and B (joinRoom "PVPT")');

const { client: clientA, connected: aConnected } = connectClient();
const { client: clientB, connected: bConnected } = connectClient();

// A creates the room
await aConnected;
clientA.emit('createRoom', 'PVPT');
const aJoined = await waitForEvent(clientA, 'roomJoined');
console.log(`[TEST] A joined room ${aJoined.roomCode}`);

// B joins the room
await bConnected;
clientB.emit('joinRoom', 'PVPT');
const bJoined = await waitForEvent(clientB, 'roomJoined');
console.log(`[TEST] B joined room ${bJoined.roomCode}`);

// Position players: A at feet (0,0,0), B at feet (0,0,-3)
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -3);
await sleep(150);

// Track B's health from scoreboard updates
let bHealth = 100;
clientB.on('scoreboardUpdate', (data) => {
  const me = data.find((p) => p.id === clientB.id);
  if (me) bHealth = me.health;
});

// Wait for an initial scoreboard so we know we have a baseline
clientB.emit('requestScoreboard');
await sleep(200);
console.log(`[TEST] B initial health: ${bHealth}`);

// Shoot B's body centre: feet y + 0.9 = (0, 0.9, -3)
const bodyCentre = { x: 0, y: 0.9, z: -3 };
console.log(`[TEST] A shoots B body centre at 3m (target y=0.9)`);
shootAt(clientA, bodyCentre);
await sleep(300);

const healthAfter = bHealth;
console.log(`[TEST] B health after shot: ${healthAfter}`);

if (healthAfter === 75) {
  console.log('PASS body shot 3m: 100 -> 75');
} else {
  console.log(`FAIL body shot 3m: expected 100 -> 75, got 100 -> ${healthAfter}`);
}

// ============================================================
// Track stats
// ============================================================
const bTracker = makeTracker(clientB, clientB.id);
const aTracker = makeTracker(clientA, clientA.id);

const results = [];
function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
}

// ============================================================
// 1. Body shots at 10m, 30m, 60m
// ============================================================
for (const dist of [10, 30, 60]) {
  await resetB();
  moveTo(clientA, 0, 0, 0);
  moveTo(clientB, 0, 0, -dist);
  await sleep(150);

  const before = bTracker.health;
  shootAt(clientA, { x: 0, y: 0.9, z: -dist });
  await sleep(300);
  check(`body shot ${dist}m`, bTracker.health === before - 25, `${before} -> ${bTracker.health}`);
}

// ============================================================
// 2. Headshot at 10m
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -10);
await sleep(150);

const headBefore = bTracker.health;
// Aim at the TOP of the head (centre y=1.7 + radius 0.25) so the ray hits the
// head sphere before grazing the body cylinder below it.
shootAt(clientA, { x: 0, y: 1.95, z: -10 });
await sleep(300);
check('headshot 10m', bTracker.health === headBefore - 50, `${headBefore} -> ${bTracker.health}`);

// ============================================================
// 8. Face shot 10m (horizontal ray at y=1.55) is a headshot
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -10);
await sleep(150);

const faceBefore = bTracker.health;
// Shooter fires horizontally at y=1.55 from 10m (target at z=-10)
shootAt(clientA, { x: 0, y: 1.55, z: -10 });
await sleep(300);
check('face shot 10m is headshot', bTracker.health === faceBefore - 50, `${faceBefore} -> ${bTracker.health}`);

// ============================================================
// 9. Crouched head shot
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveToCrouched(clientB, 0, 0, -10, 1.0);
await sleep(150);

const crouchHeadBefore = bTracker.health;
// Shooter fires horizontally at y=1.06 from 10m
shootAt(clientA, { x: 0, y: 1.06, z: -10 });
await sleep(300);
check('crouched head shot', bTracker.health === crouchHeadBefore - 50, `${crouchHeadBefore} -> ${bTracker.health}`);

// ============================================================
// 10. Crouched, shot above head misses
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveToCrouched(clientB, 0, 0, -10, 1.0);
await sleep(150);

const crouchMissBefore = bTracker.health;
// Shooter fires horizontally at y=1.7 from 10m (above the crouched head)
shootAt(clientA, { x: 0, y: 1.7, z: -10 });
await sleep(300);
check('crouched shot above head misses', bTracker.health === crouchMissBefore, `${crouchMissBefore} -> ${bTracker.health}`);

// Restore standing eyeHeight so later tests are not affected
moveTo(clientB, 0, 0, -10);
await sleep(150);

// ============================================================
// 3 & 4. Four body shots kill B, then B respawns with 100 health
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -3);
await sleep(150);

const diedPromise = waitForEvent(clientB, 'playerDied', 8000);
const respawnedPromise2 = waitForEvent(clientB, 'playerRespawned', 8000);

// Counters are cumulative across the whole session, so measure the delta
const killsBefore = aTracker.kills;
const deathsBefore = bTracker.deaths;

for (let i = 0; i < 4; i++) {
  shootAt(clientA, { x: 0, y: 0.9, z: -3 });
  await sleep(150);
}
const diedEvent = await diedPromise;
await respawnedPromise2;
check('four body shots kill', diedEvent && (aTracker.kills - killsBefore) === 1 && (bTracker.deaths - deathsBefore) === 1,
  `kills+${aTracker.kills - killsBefore} deaths+${bTracker.deaths - deathsBefore}`);

await sleep(300);
clientB.emit('requestScoreboard');
await sleep(200);
check('respawn health 100', bTracker.health === 100, `health=${bTracker.health}`);

// ============================================================
// 5. Shot aimed away does 0 damage
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -10);
await sleep(150);

const awayBefore = bTracker.health;
shootAt(clientA, { x: 0, y: 1.6, z: 10 }); // opposite direction from B
await sleep(300);
check('shot away 0 damage', bTracker.health === awayBefore, `${awayBefore} -> ${bTracker.health}`);

// ============================================================
// 6. Shot at the ground 1.5 below B's feet does 0 damage
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -10);
await sleep(150);

const groundBefore = bTracker.health;
shootAt(clientA, { x: 0, y: -1.5, z: -10 }); // 1.5 below feet (feet y = 0)
await sleep(300);
check('shot at ground 0 damage', bTracker.health === groundBefore, `${groundBefore} -> ${bTracker.health}`);

// ============================================================
// 7. Platform: B at feet y = 1.0, body centre shot lowers by 25
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 1.0, -10);
await sleep(150);

const platBefore = bTracker.health;
shootAt(clientA, { x: 0, y: 1.9, z: -10 }); // body centre = feet 1.0 + 0.9
await sleep(300);
check('platform body shot', bTracker.health === platBefore - 25, `${platBefore} -> ${bTracker.health}`);

// ============================================================
// 8. Health regeneration (5 s delay, then +10 per second)
// ============================================================
await resetB();
moveTo(clientA, 0, 0, 0);
moveTo(clientB, 0, 0, -3);
await sleep(150);
let regenHealth = null;
const onRegenHealth = (d) => { if (d.id === clientB.id) regenHealth = d.health; };
clientB.on('playerHealth', onRegenHealth);
shootAt(clientA, { x: 0, y: 0.9, z: -3 });
await sleep(150);
shootAt(clientA, { x: 0, y: 0.9, z: -3 });
await sleep(300);
check('regen: two body shots leave B at 50', regenHealth === 50, `health ${regenHealth}`);
await sleep(3000);
check('regen: no healing within 5s of damage', regenHealth === 50, `health ${regenHealth}`);
await sleep(4500);
check('regen: health rises after 5s and stays <= 100', regenHealth > 50 && regenHealth <= 100, `health ${regenHealth}`);
const beforeHit = regenHealth;
shootAt(clientA, { x: 0, y: 0.9, z: -3 });
await sleep(300);
check('regen: damage still applies while healing', regenHealth < beforeHit, `${beforeHit} -> ${regenHealth}`);
clientB.off('playerHealth', onRegenHealth);

// ============================================================
// Cleanup
// ============================================================
clientA.disconnect();
clientB.disconnect();
await sleep(200);

const failed = results.filter((r) => !r).length;
await killServer();

if (failed === 0) {
  console.log('\n[TEST] ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log(`\n[TEST] ${failed} FAILED`);
  process.exit(1);
}