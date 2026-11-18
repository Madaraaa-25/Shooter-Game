import { spawn } from 'child_process';
import { io as ClientIO } from 'socket.io-client';
import { setTimeout as sleep } from 'timers/promises';
import { buildWorld } from '../shared/world.js';
import { resolveCollisions } from '../shared/collision.js';

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

  const connected = waitForEvent(client, 'connect');
  client.connect();
  return { client, connected };
}

// Send the EYE position (feet y + PLAYER_EYE_HEIGHT = 1.6)
function moveTo(client, feetX, feetY, feetZ) {
  client.emit('playerUpdate', {
    position: { x: feetX, y: feetY + 1.6, z: feetZ },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  });
}

// ============================================================
// Build world and get test positions
// ============================================================
const WORLD = buildWorld();

function findFirstObject(type) {
  return WORLD.layout.find(o => o.type === type);
}

// Get hut back wall center from WORLD.shapes.boxes (first hut box is the back wall)
function getHutBackWallCenter() {
  for (const o of WORLD.layout) {
    if (o.type === 'hut') {
      // Find the first hut box in WORLD.shapes.boxes
      for (const b of WORLD.shapes.boxes) {
        // The back wall is at cx: 0, cz: 3 in local space (walls[0])
        // We need to find a box that matches the hut's position and rotation
        // and is the back wall (width ~6, depth ~0.3)
        if (Math.abs(b.height - 100) < 0.1) { // hut walls have height 100
          // Check if this box belongs to this hut by checking distance
          const dx = b.x - o.x;
          const dz = b.z - o.z;
          const dist = Math.hypot(dx, dz);
          // The back wall is at local cz = 3 * scale
          const scale = o.scale;
          const expectedDist = 3 * scale;
          if (Math.abs(dist - expectedDist) < 0.5) {
            return { x: b.x, z: b.z };
          }
        }
      }
    }
  }
  return null;
}

// Get test cases
const testCases = [];

// 1. rock: the rock centre
const rock = findFirstObject('rock');
if (rock) {
  testCases.push({ name: 'rock', x: rock.x, z: rock.z });
}

// 2. tree: the tree centre
const tree = findFirstObject('tree');
if (tree) {
  testCases.push({ name: 'tree', x: tree.x, z: tree.z });
}

// 3. palm: the palm centre
const palm = findFirstObject('palm');
if (palm) {
  testCases.push({ name: 'palm', x: palm.x, z: palm.z });
}

// 4. hut: the centre of the hut's back wall
const hutBackWall = getHutBackWallCenter();
if (hutBackWall) {
  testCases.push({ name: 'hut', x: hutBackWall.x, z: hutBackWall.z });
}

// Control case: free position
// Check if (0, 0) is clear at feetY=0 with radius 0.4
const freeCheck = resolveCollisions(WORLD.shapes, 0, 0, 0, 0.4);
let freeX = 0;
let freeZ = 0;
if (Math.abs(freeCheck.x) > 0.05 || Math.abs(freeCheck.z) > 0.05) {
  freeX = -45;
  freeZ = 45;
}
const freeCase = { name: 'free', x: freeX, z: freeZ };

console.log('\n[TEST] Test cases:', testCases.map(t => `${t.name}(${t.x.toFixed(2)}, ${t.z.toFixed(2)})`).join(', '), `free(${freeCase.x.toFixed(2)}, ${freeCase.z.toFixed(2)})`);

// ============================================================
// Test: A connects, creates room, B joins, then run collision tests
// ============================================================
console.log('\n[TEST] Connecting A (createRoom) and B (joinRoom)');

const { client: clientA, connected: aConnected } = connectClient();
const { client: clientB, connected: bConnected } = connectClient();

// Store A's position as received by B
let lastReceivedPos = null;
let aId = null;

clientB.on('playerMoved', (data) => {
  if (data.id === aId) {
    lastReceivedPos = { x: data.position.x, z: data.position.z };
  }
});

clientB.on('playersList', (list) => {
  for (const p of list) {
    if (p.id !== clientB.id) {
      aId = p.id;
      break;
    }
  }
});

clientB.on('playerJoined', (data) => {
  if (data.id !== clientB.id) {
    aId = data.id;
  }
});

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

// Wait for playersList to get A's id
await sleep(300);

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
}

// Run collision tests
for (const tc of testCases) {
  console.log(`\n[TEST] Testing ${tc.name} at (${tc.x.toFixed(2)}, ${tc.z.toFixed(2)})`);

  // A sends position at the object center
  moveTo(clientA, tc.x, 0, tc.z);
  await sleep(150);

  if (!lastReceivedPos) {
    check(`server pushed out ${tc.name}`, false, 'no playerMoved received');
    continue;
  }

  const sentX = tc.x;
  const sentZ = tc.z;
  const recvX = lastReceivedPos.x;
  const recvZ = lastReceivedPos.z;

  const dx = recvX - sentX;
  const dz = recvZ - sentZ;
  const horizDist = Math.hypot(dx, dz);

  // Check 1: server pushed out by at least 0.3m horizontally
  const pushedOut = horizDist >= 0.3;
  check(`server pushed out ${tc.name}`, pushedOut, `sent (${sentX.toFixed(2)}, ${sentZ.toFixed(2)}) recv (${recvX.toFixed(2)}, ${recvZ.toFixed(2)}) dist=${horizDist.toFixed(3)}`);

  // Check 2: resolveCollisions returns same position within 0.05
  const resolved = resolveCollisions(WORLD.shapes, recvX, recvZ, 0, 0.4);
  const resDx = resolved.x - recvX;
  const resDz = resolved.z - recvZ;
  const resDist = Math.hypot(resDx, resDz);
  const isClear = resDist <= 0.05;
  check(`server position is clear ${tc.name}`, isClear, `recv (${recvX.toFixed(2)}, ${recvZ.toFixed(2)}) resolved (${resolved.x.toFixed(3)}, ${resolved.z.toFixed(3)}) dist=${resDist.toFixed(3)}`);

  // Reset for next test
  lastReceivedPos = null;
}

// Control case: free position should NOT be pushed out
console.log(`\n[TEST] Testing free at (${freeCase.x.toFixed(2)}, ${freeCase.z.toFixed(2)})`);
moveTo(clientA, freeCase.x, 0, freeCase.z);
await sleep(150);

if (lastReceivedPos) {
  const sentX = freeCase.x;
  const sentZ = freeCase.z;
  const recvX = lastReceivedPos.x;
  const recvZ = lastReceivedPos.z;
  const dx = recvX - sentX;
  const dz = recvZ - sentZ;
  const horizDist = Math.hypot(dx, dz);
  const ok = horizDist <= 0.05;
  check('server keeps free position', ok, `sent (${sentX.toFixed(2)}, ${sentZ.toFixed(2)}) recv (${recvX.toFixed(2)}, ${recvZ.toFixed(2)}) dist=${horizDist.toFixed(3)}`);
} else {
  check('server keeps free position', false, 'no playerMoved received');
}

// ============================================================
// Cleanup
// ============================================================
clientA.disconnect();
clientB.disconnect();
await sleep(200);

const failed = results.filter(r => !r.ok).length;
await killServer();

if (failed === 0) {
  console.log('\nALL SERVER COLLISION TESTS PASSED');
  process.exit(0);
} else {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}