import { CRATE_SIZE, CRATE_HEIGHT } from './config.js';

// Returns { circles: [{x,z,r,height}], boxes: [{x,z,hx,hz,height}] }
export function buildCollisionShapes(layout) {
  const circles = [];
  const boxes = [];
  for (const o of layout) {
    if (o.type === 'rock') {
      circles.push({ x: o.x, z: o.z, r: o.r * 0.8, height: 3 });
    } else if (o.type === 'tree') {
      circles.push({ x: o.x, z: o.z, r: 0.8 * o.scale, height: 100 });
    } else if (o.type === 'palm') {
      circles.push({ x: o.x, z: o.z, r: 0.5 * o.scale, height: 100 });
    } else if (o.type === 'hut') {
      boxes.push({ x: o.x, z: o.z, hx: 2.5, hz: 2.5, height: 100 });
    } else if (o.type === 'crate') {
      boxes.push({ x: o.x, z: o.z, hx: CRATE_SIZE / 2, hz: CRATE_SIZE / 2, height: CRATE_HEIGHT });
    }
  }
  return { circles, boxes };
}

// Pushes a player at (x, z) with radius pr and feet height y out of every shape taller than y.
// Returns the corrected { x, z }.
export function resolveCollisions(shapes, x, z, y, pr) {
  for (const c of shapes.circles) {
    if (y >= c.height) continue;
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
    if (y >= b.height) continue;
    const dx = x - b.x;
    const dz = z - b.z;
    const ox = b.hx + pr - Math.abs(dx);
    const oz = b.hz + pr - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) x += dx >= 0 ? ox : -ox;
      else z += dz >= 0 ? oz : -oz;
    }
  }
  return { x, z };
}