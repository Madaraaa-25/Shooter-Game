import { generateLayout } from '../shared/layout.js';
import { ARENA_HALF_SIZE, SPAWN_POINTS } from '../shared/config.js';

function countTypes(layout) {
  const counts = { hut: 0, rock: 0, crate: 0, tree: 0, palm: 0 };
  for (const obj of layout) {
    if (counts[obj.type] !== undefined) counts[obj.type]++;
  }
  return counts;
}

const seeds = [...Array(20).keys()].map(i => i + 1);
const mins = { hut: Infinity, rock: Infinity, crate: Infinity, tree: Infinity, palm: Infinity };

for (const seed of seeds) {
  const layout = generateLayout({ halfSize: ARENA_HALF_SIZE, seed, spawnPoints: SPAWN_POINTS, counts: {} });
  const c = countTypes(layout);
  console.log(`seed ${seed}: hut=${c.hut} rock=${c.rock} crate=${c.crate} tree=${c.tree} palm=${c.palm}`);
  for (const t of Object.keys(mins)) mins[t] = Math.min(mins[t], c[t]);
}

// Special seed used by the game
const layout12345 = generateLayout({ halfSize: ARENA_HALF_SIZE, seed: 12345, spawnPoints: SPAWN_POINTS, counts: {} });
const c12345 = countTypes(layout12345);
console.log(`seed 12345: hut=${c12345.hut} rock=${c12345.rock} crate=${c12345.crate} tree=${c12345.tree} palm=${c12345.palm}`);

console.log(`min: hut=${mins.hut} rock=${mins.rock} crate=${mins.crate} tree=${mins.tree} palm=${mins.palm}`);