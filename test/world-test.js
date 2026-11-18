import { buildWorld } from '../shared/world.js';

const { layout, shapes } = buildWorld();

const counts = {};
for (const o of layout) {
  counts[o.type] = (counts[o.type] || 0) + 1;
}

const hut = counts.hut || 0;
const rock = counts.rock || 0;
const crate = counts.crate || 0;
const tree = counts.tree || 0;
const palm = counts.palm || 0;

console.log(`world: hut=${hut} rock=${rock} crate=${crate} tree=${tree} palm=${palm} circles=${shapes.circles.length} boxes=${shapes.boxes.length}`);

if (hut === 1 && rock === 14 && crate === 16 && tree === 4 && palm === 15) {
  console.log('WORLD TEST PASSED');
} else {
  console.log('WORLD TEST FAILED');
  process.exitCode = 1;
}