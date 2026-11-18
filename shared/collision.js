import { CRATE_SIZE, CRATE_HEIGHT } from './config.js';

export const STEP_TOLERANCE = 0.35;

const ROCK_BANDS = [
  [-0.360, 0.416, -0.921, 0.638],
  [-0.410, 0.444, -0.870, 0.675],
  [-0.439, 0.469, -0.817, 0.718],
  [-0.490, 0.464, -0.784, 0.759],
  [-0.578, 0.424, -0.716, 0.799],
  [-0.658, 0.263, -0.679, 0.750],
  [-0.636, 0.245, -0.577, 0.776],
  [-0.536, 0.262, -0.382, 0.777],
  [-0.320, 0.267, -0.240, 0.749],
  [-0.224, 0.142, -0.163, 0.717]
];
const TREE_BANDS = [
  [-0.065, 0.034, -0.077, 0.041],
  [0.111, 0.203, -0.188, -0.099],
  [-0.002, 0.276, -0.208, -0.015]
];

function addBandBoxes(shots, o, size, bands) {
  const c = Math.cos(o.rotY);
  const s = Math.sin(o.rotY);
  bands.forEach(([x0, x1, z0, z1], i) => {
    const lx = ((x0 + x1) / 2) * size;
    const lz = ((z0 + z1) / 2) * size;
    shots.boxes.push({
      x: o.x + lx * c + lz * s,
      z: o.z - lx * s + lz * c,
      hx: ((x1 - x0) / 2) * size,
      hz: ((z1 - z0) / 2) * size,
      rotY: o.rotY,
      shotBottom: i * 0.1 * size,
      height: (i + 1) * 0.1 * size
    });
  });
}

// Returns { circles: [{x,z,r,height}], boxes: [{x,z,hx,hz,height}] }
export function buildCollisionShapes(layout) {
  const circles = [];
  const boxes = [];
  for (const o of layout) {
    if (o.type === 'rock') {
      const H = o.scale;
      const hw = 0.635 * H;
      const hd = 0.91 * H;
      boxes.push({ x: o.x, z: o.z, hx: hw * 0.8, hz: hd * 0.8, rotY: o.rotY, height: Math.min(0.8, H) });
      if (H > 1.0) boxes.push({ x: o.x, z: o.z, hx: hw * 0.55, hz: hd * 0.55, rotY: o.rotY, height: Math.min(1.6, H) });
      if (H > 1.8) boxes.push({ x: o.x, z: o.z, hx: hw * 0.3, hz: hd * 0.3, rotY: o.rotY, height: H });
    } else if (o.type === 'tree') {
      circles.push({ x: o.x, z: o.z, r: 0.8 * o.scale, height: 100 });
    } else if (o.type === 'palm') {
      circles.push({ x: o.x, z: o.z, r: 0.5 * o.scale, height: 100 });
    } else if (o.type === 'hut') {
      const th = Math.atan2(o.x, o.z) + Math.PI;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const walls = [
        { cx: 0, cz: 3, hx: 3, hz: 0.15 },
        { cx: -3, cz: 0, hx: 0.15, hz: 3 },
        { cx: 3, cz: 0, hx: 0.15, hz: 3 },
        { cx: -2.05, cz: -3, hx: 0.95, hz: 0.15 },
        { cx: 2.05, cz: -3, hx: 0.95, hz: 0.15 }
      ];
      const k = o.scale;
      for (const w of walls) {
        boxes.push({
          x: o.x + (w.cx * c + w.cz * s) * k,
          z: o.z + (-w.cx * s + w.cz * c) * k,
          hx: w.hx * k, hz: w.hz * k, rotY: th, height: 100, shotHeight: 3 * k
        });
      }
    } else if (o.type === 'crate') {
      boxes.push({ x: o.x, z: o.z, hx: CRATE_SIZE / 2, hz: CRATE_SIZE / 2, height: CRATE_HEIGHT });
    }
  }
  const shots = { circles: [], boxes: [] };
  for (const o of layout) {
    const s0 = o.scale;
    if (o.type === 'rock') { addBandBoxes(shots, o, s0, ROCK_BANDS); }
    else if (o.type === 'crate') {
      shots.boxes.push({ x: o.x, z: o.z, hx: CRATE_SIZE / 2, hz: CRATE_SIZE / 2, height: CRATE_HEIGHT });
    } else if (o.type === 'tree') { addBandBoxes(shots, o, 8 * s0, TREE_BANDS); }
    else if (o.type === 'palm') {
      const cr = Math.cos(o.rotY);
      const sr = Math.sin(o.rotY);
      for (let i = 0; i < 8; i++) {
        const lx = ((i + 0.5) / 8) * s0;
        shots.circles.push({
          x: o.x + lx * cr,
          z: o.z - lx * sr,
          r: (0.35 - (0.17 * (i + 0.5)) / 8 + 0.05) * s0,
          shotBottom: i * 0.875 * s0,
          height: (i + 1) * 0.875 * s0
        });
      }
    } else if (o.type === 'hut') {
      const th = Math.atan2(o.x, o.z) + Math.PI;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const k = o.scale;
      const add = (cx, cz, hx, hz, y0, y1) => shots.boxes.push({
        x: o.x + (cx * c + cz * s) * k,
        z: o.z + (-cx * s + cz * c) * k,
        hx: hx * k, hz: hz * k, rotY: th, shotBottom: y0 * k, height: y1 * k
      });
      // back wall (local z = +3), window x -0.7..0.7, y 1..2
      add(0, 3, 3, 0.15, 0, 1); add(0, 3, 3, 0.15, 2, 3);
      add(-1.85, 3, 1.15, 0.15, 1, 2); add(1.85, 3, 1.15, 0.15, 1, 2);
      // left wall (local x = -3)
      add(-3, 0, 0.15, 3, 0, 1); add(-3, 0, 0.15, 3, 2, 3);
      add(-3, -1.85, 0.15, 1.15, 1, 2); add(-3, 1.85, 0.15, 1.15, 1, 2);
      // right wall (local x = +3)
      add(3, 0, 0.15, 3, 0, 1); add(3, 0, 0.15, 3, 2, 3);
      add(3, -1.85, 0.15, 1.15, 1, 2); add(3, 1.85, 0.15, 1.15, 1, 2);
      // front wall (local z = -3): two side panels and a lintel above the 2.2 m door
      add(-2.05, -3, 0.95, 0.15, 0, 3); add(2.05, -3, 0.95, 0.15, 0, 3);
      add(0, -3, 1.1, 0.15, 2.2, 3);
    }
  }
  return { circles, boxes, shots };
}

// Pushes a player at (x, z) with radius pr and feet height y out of every shape taller than y.
// Returns the corrected { x, z }.
export function resolveCollisions(shapes, x, z, y, pr) {
  for (const c of shapes.circles) {
    if (y >= c.height - STEP_TOLERANCE) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    const dist = Math.hypot(dx, dz);
    const min = c.r + pr;
    if (dist < min) {
      if (dist === 0) { x += min; continue; }
      x = c.x + (dx / dist) * min;
      z = c.z + (dz / dist) * min;
    }
  }
  for (const b of shapes.boxes) {
    if (y >= b.height - STEP_TOLERANCE) continue;
    const rot = b.rotY || 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    const ox = b.hx + pr - Math.abs(lx);
    const oz = b.hz + pr - Math.abs(lz);
    if (ox > 0 && oz > 0) {
      let nlx = lx;
      let nlz = lz;
      if (ox < oz) nlx += lx >= 0 ? ox : -ox;
      else nlz += lz >= 0 ? oz : -oz;
      x = b.x + nlx * cos + nlz * sin;
      z = b.z - nlx * sin + nlz * cos;
    }
  }
  return { x, z };
}

// Returns the height of the highest ground shape (circle or box) under (x, z)
// that the player's feet (at feetY) can stand on. pr is the player radius.
export function getGroundHeight(shapes, x, z, pr, feetY) {
  let best = 0;
  const tol = STEP_TOLERANCE + 0.05;
  for (const c of shapes.circles) {
    if (c.height > 50) continue;
    if (c.height > feetY + tol) continue;
    if (Math.hypot(x - c.x, z - c.z) < c.r + pr * 0.5 && c.height > best) best = c.height;
  }
  for (const b of shapes.boxes) {
    if (b.height > 50) continue;
    if (b.height > feetY + tol) continue;
    const rot = b.rotY || 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const dx = x - b.x;
    const dz = z - b.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) < b.hx + pr * 0.5 && Math.abs(lz) < b.hz + pr * 0.5 && b.height > best) best = b.height;
  }
  return best;
}

// Distance along the ray to the first solid shape, or Infinity if none within maxDist.
// origin and dir are {x,y,z}; dir should be normalised. Shapes span y from 0 to (shotHeight ?? height).
export function rayHitsShapes(shapes, origin, dir, maxDist) {
  let best = Infinity;
  for (const c of shapes.circles) {
    const top = c.shotHeight ?? c.height;
    const a = dir.x * dir.x + dir.z * dir.z;
    if (a < 1e-9) continue;
    const ox = origin.x - c.x;
    const oz = origin.z - c.z;
    const b = ox * dir.x + oz * dir.z;
    const k = ox * ox + oz * oz - c.r * c.r;
    const disc = b * b - a * k;
    if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / a;
    if (t < 0 || t > maxDist || t >= best) continue;
    const y = origin.y + dir.y * t;
    const bottom = c.shotBottom ?? 0;
    if (y < bottom || y > top) continue;
    best = t;
  }
  for (const bx of shapes.boxes) {
    const top = bx.shotHeight ?? bx.height;
    const rot = bx.rotY || 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const dx = origin.x - bx.x;
    const dz = origin.z - bx.z;
    const o = [dx * cos - dz * sin, origin.y, dx * sin + dz * cos];
    const d = [dir.x * cos - dir.z * sin, dir.y, dir.x * sin + dir.z * cos];
    const lo = [-bx.hx, bx.shotBottom ?? 0, -bx.hz];
    const hi = [bx.hx, top, bx.hz];
    let tmin = -Infinity;
    let tmax = Infinity;
    let miss = false;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (o[i] < lo[i] || o[i] > hi[i]) { miss = true; break; }
      } else {
        let t1 = (lo[i] - o[i]) / d[i];
        let t2 = (hi[i] - o[i]) / d[i];
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
      }
    }
    if (miss || tmin > tmax || tmin < 0 || tmin > maxDist || tmin >= best) continue;
    best = tmin;
  }
  return best;
}