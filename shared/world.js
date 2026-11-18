import { ARENA_HALF_SIZE, SPAWN_POINTS, LAYOUT_SEED } from './config.js';
import { generateLayout } from './layout.js';
import { buildCollisionShapes } from './collision.js';

export function buildWorld() {
  const layout = generateLayout({
    halfSize: ARENA_HALF_SIZE,
    seed: LAYOUT_SEED,
    spawnPoints: SPAWN_POINTS,
    counts: {}
  });
  return { layout, shapes: buildCollisionShapes(layout) };
}