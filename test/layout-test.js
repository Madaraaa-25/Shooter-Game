import { generateLayout } from '../shared/layout.js';

const defaults = { hut: 1, rock: 14, crate: 16, tree: 6, palm: 16 };
const spawnPoints = [
  { x: -60, z: -60 },
  { x: 60, z: 60 },
  { x: -60, z: 60 },
  { x: 60, z: -60 },
  { x: 0, z: 0 },
];

function check(seed) {
  const layout = generateLayout({ halfSize: 90, seed, spawnPoints, counts: {} });
  const layout2 = generateLayout({ halfSize: 90, seed, spawnPoints, counts: {} });
  const problems = [];

  // 1. No overlap
  for (let i = 0; i < layout.length; i++) {
    for (let j = i + 1; j < layout.length; j++) {
      const a = layout[i];
      const b = layout[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < a.r + b.r) {
        problems.push(`overlap ${a.type}(${a.r.toFixed(2)}) and ${b.type}(${b.r.toFixed(2)}) dist=${d.toFixed(2)} need>=${(a.r + b.r).toFixed(2)}`);
      }
    }
  }

  // 2. Distance to spawn points
  for (const o of layout) {
    for (const s of spawnPoints) {
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (d < 10) {
        problems.push(`${o.type} at (${o.x.toFixed(2)},${o.z.toFixed(2)}) is ${d.toFixed(2)} from spawn (${s.x},${s.z})`);
      }
    }
  }

  // 3. Counts
  const counts = {};
  for (const o of layout) counts[o.type] = (counts[o.type] || 0) + 1;
  if (counts.hut !== 1) problems.push(`hut count ${counts.hut} != 1`);
  for (const t of ['rock', 'crate', 'tree', 'palm']) {
    const got = counts[t] || 0;
    if (got < defaults[t] * 0.8) problems.push(`${t} count ${got} < 80% of ${defaults[t]}`);
  }

  // 4. Determinism
  if (JSON.stringify(layout) !== JSON.stringify(layout2)) {
    problems.push('same seed produced different output');
  }

  return problems;
}

let passCount = 0;
let failed = false;
for (let seed = 1; seed <= 20; seed++) {
  const problems = check(seed);
  if (problems.length === 0) {
    passCount++;
    console.log(`PASS seed ${seed}`);
  } else {
    failed = true;
    console.log(`FAIL seed ${seed}`);
    for (const p of problems) console.log('  - ' + p);
  }
}

console.log(`${passCount}/20 seeds passed`);
if (failed) process.exitCode = 1;