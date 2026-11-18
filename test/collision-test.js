import { buildCollisionShapes, resolveCollisions, rayHitsShapes } from '../shared/collision.js';

const layout = [
  { type: 'rock', x: 10, z: 0, r: 4, rotY: 0, scale: 2.4 },
  { type: 'tree', x: -10, z: 0, r: 6, rotY: 0, scale: 1.5 },
  { type: 'palm', x: 0, z: 10, r: 2.5, rotY: 0, scale: 1 },
  { type: 'hut', x: 0, z: -10, r: 7, rotY: 0, scale: 1 },
  { type: 'crate', x: 20, z: 20, r: 2, rotY: 0, scale: 1 },
];
const pr = 0.4;
const shapes = buildCollisionShapes(layout);

let failed = false;
function check(name, cond) {
  console.log((cond ? 'PASS' : 'FAIL') + ': ' + name);
  if (!cond) failed = true;
}

// 1. Far point unchanged.
{
  const r = resolveCollisions(shapes, 40, -40, 0, pr);
  check('far point unchanged', r.x === 40 && r.z === -40);
}

// 2. Rock centre pushed out: |x-10| >= 1.524*0.8 + 0.4 - 0.01 OR |z| >= 2.184*0.8 + 0.4 - 0.01.
{
  const r = resolveCollisions(shapes, 10, 0, 0, pr);
  check('rock centre pushed out',
    Math.abs(r.x - 10) >= 1.524 * 0.8 + 0.4 - 0.01 ||
    Math.abs(r.z - 0) >= 2.184 * 0.8 + 0.4 - 0.01);
}

// 2b. Rock top unchanged: same point at y = 2.4 stays put.
{
  const r = resolveCollisions(shapes, 10, 0, 2.4, pr);
  check('rock top unchanged', r.x === 10 && r.z === 0);
}

// 3. Tree trunk point pushed out: distance from (-10,0) >= 1.2 + 0.4 - 0.01.
{
  const r = resolveCollisions(shapes, -10.3, 0.2, 0, pr);
  const d = Math.hypot(r.x - (-10), r.z - 0);
  check('tree trunk pushed out', d >= 1.2 + 0.4 - 0.01);
}

// 4. Palm trunk point pushed out: distance from (0,10) >= 0.5 + 0.4 - 0.01.
{
  const r = resolveCollisions(shapes, 0.1, 10.1, 0, pr);
  const d = Math.hypot(r.x - 0, r.z - 10);
  check('palm trunk pushed out', d >= 0.5 + 0.4 - 0.01);
}

// 5. Hut back wall pushes point out: |z + 7| >= 0.15 + 0.4 - 0.01.
{
  const r = resolveCollisions(shapes, 0, -7.1, 0, pr);
  check('hut box pushed out', Math.abs(r.z + 7) >= 0.15 + 0.4 - 0.01);
}

// 5b. Hut walls with door gap (hut at 0,-20, door at world z = -23).
{
  const hutLayout = [{ type: 'hut', x: 0, z: -20, r: 7, rotY: 0, scale: 1 }];
  const hutShapes = buildCollisionShapes(hutLayout);
  // a. door gap open
  {
    const r = resolveCollisions(hutShapes, 0, -23, 0, pr);
    check('hut door gap open', r.x === 0 && r.z === -23);
  }
  // b. front wall solid
  {
    const r = resolveCollisions(hutShapes, -2, -23, 0, pr);
    check('hut front wall solid', Math.abs(r.z + 23) >= 0.54);
  }
  // c. inside open
  {
    const r = resolveCollisions(hutShapes, 0, -20, 0, pr);
    check('hut inside open', r.x === 0 && r.z === -20);
  }
  // d. back wall solid
  {
    const r = resolveCollisions(hutShapes, 0, -17, 0, pr);
    check('hut back wall solid', Math.abs(r.z + 17) >= 0.54);
  }
}

// 6. Crate point pushed out: |dx| or |dz| >= 1.2 + 0.4 - 0.01.
{
  const r = resolveCollisions(shapes, 20.5, 20.5, 0, pr);
  const dx = Math.abs(r.x - 20);
  const dz = Math.abs(r.z - 20);
  check('crate pushed out', dx >= 1.2 + 0.4 - 0.01 || dz >= 1.2 + 0.4 - 0.01);
}

// 7. Crate point with y=1.2 (standing on top) unchanged.
{
  const r = resolveCollisions(shapes, 20.5, 20.5, 1.2, pr);
  check('crate top unchanged', r.x === 20.5 && r.z === 20.5);
}

// 8. Tree trunk point with y=101 unchanged.
{
  const r = resolveCollisions(shapes, -10.3, 0.2, 101, pr);
  check('tree high unchanged', r.x === -10.3 && r.z === 0.2);
}

// 9. Palm centre does not return NaN.
{
  const r = resolveCollisions(shapes, 0, 10, 0, pr);
  check('palm centre no NaN', Number.isFinite(r.x) && Number.isFinite(r.z));
}

// 10. Rotated box side clear.
{
  const shapes2 = { circles: [], boxes: [{ x: 0, z: 0, hx: 3, hz: 1, rotY: Math.PI / 2, height: 100 }] };
  const r = resolveCollisions(shapes2, 2, 0, 0, pr);
  check('rotated box side clear', r.x === 2 && r.z === 0);
}

// 11. Rotated box pushed sideways.
{
  const shapes2 = { circles: [], boxes: [{ x: 0, z: 0, hx: 3, hz: 1, rotY: Math.PI / 2, height: 100 }] };
  const r = resolveCollisions(shapes2, 0.3, 2, 0, pr);
  check('rotated box pushed sideways', r.x >= 1.4 - 0.01);
}

// 12. Rotated box pushed from end.
{
  const shapes2 = { circles: [], boxes: [{ x: 0, z: 0, hx: 3, hz: 1, rotY: Math.PI / 2, height: 100 }] };
  const r = resolveCollisions(shapes2, 0.3, 3.2, 0, pr);
  check('rotated box pushed from end', r.z >= 3.4 - 0.01);
}

// 13. Scaled hut (scale 1.3): back wall at world z = -16.1, door at world z = -23.9
{
  const hutLayout = [{ type: 'hut', x: 0, z: -20, r: 7, rotY: 0, scale: 1.3 }];
  const hutShapes = buildCollisionShapes(hutLayout);
  // a. door open
  {
    const r = resolveCollisions(hutShapes, 0, -23.9, 0, pr);
    check('scaled hut door open', r.x === 0 && r.z === -23.9);
  }
  // b. back wall outer
  {
    const r = resolveCollisions(hutShapes, 0, -16.0, 0, pr);
    check('scaled hut back wall outer', Math.abs(r.z + 16.1) >= 0.195 + 0.4 - 0.01);
  }
  // c. front wall solid
  {
    const r = resolveCollisions(hutShapes, -2.6, -23.9, 0, pr);
    check('scaled hut front wall solid', Math.abs(r.z + 23.9) >= 0.195 + 0.4 - 0.01);
  }
  // d. inside open
  {
    const r = resolveCollisions(hutShapes, 0, -20, 0, pr);
    check('scaled hut inside open', r.x === 0 && r.z === -20);
  }
}

// rayHitsShapes tests
function checkRay(name, shapes, origin, dir, maxDist, expected) {
  const result = rayHitsShapes(shapes, origin, dir, maxDist);
  const ok = (expected === Infinity ? result === Infinity : Math.abs(result - expected) < 0.01);
  console.log((ok ? 'PASS' : 'FAIL') + ': ' + name + ' (got ' + result + ', expected ' + expected + ')');
  if (!ok) failed = true;
}

// a. ray hits box
{
  const shapes = { circles: [], boxes: [{ x: 0, z: 0, hx: 1, hz: 1, height: 3 }] };
  checkRay('ray hits box', shapes, { x: -5, y: 1.6, z: 0 }, { x: 1, y: 0, z: 0 }, 200, 4);
}

// b. ray over box
{
  const shapes = { circles: [], boxes: [{ x: 0, z: 0, hx: 1, hz: 1, height: 3 }] };
  checkRay('ray over box', shapes, { x: -5, y: 5, z: 0 }, { x: 1, y: 0, z: 0 }, 200, Infinity);
}

// c. ray max range
{
  const shapes = { circles: [], boxes: [{ x: 0, z: 0, hx: 1, hz: 1, height: 3 }] };
  checkRay('ray max range', shapes, { x: -5, y: 1.6, z: 0 }, { x: 1, y: 0, z: 0 }, 3, Infinity);
}

// d. ray away
{
  const shapes = { circles: [], boxes: [{ x: 0, z: 0, hx: 1, hz: 1, height: 3 }] };
  checkRay('ray away', shapes, { x: -5, y: 1.6, z: 0 }, { x: -1, y: 0, z: 0 }, 200, Infinity);
}

// e. ray hits circle
{
  const shapes = { circles: [{ x: 0, z: 0, r: 1, height: 100 }], boxes: [] };
  checkRay('ray hits circle', shapes, { x: -5, y: 1.6, z: 0 }, { x: 1, y: 0, z: 0 }, 200, 4);
}

// f. ray rotated box
{
  const shapes = { circles: [], boxes: [{ x: 0, z: 0, hx: 3, hz: 1, rotY: Math.PI / 2, height: 3 }] };
  checkRay('ray rotated box', shapes, { x: -5, y: 1.6, z: 0 }, { x: 1, y: 0, z: 0 }, 200, 4);
}

// g. ray hut shot height
{
  const shapes = { circles: [], boxes: [{ x: 0, z: 0, hx: 1, hz: 1, height: 100, shotHeight: 3 }] };
  checkRay('ray hut shot height', shapes, { x: -5, y: 4, z: 0 }, { x: 1, y: 0, z: 0 }, 200, Infinity);
}

if (!failed) {
  console.log('ALL COLLISION TESTS PASSED');
}
process.exitCode = failed ? 1 : 0;