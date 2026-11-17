export function generateLayout({ halfSize, seed, spawnPoints, counts }) {
  const defaults = { hut: 1, rock: 14, crate: 16, tree: 6, palm: 16 };
  const count = { ...defaults, ...counts };

  const rand = mulberry32(seed);

  const radiusByType = {
    hut: 5,
    crate: 1.2,
    tree: 1.2,
    palm: 0.8,
    rock: null, // computed per-object from its scale
  };

  const edgeMargin = {
    hut: 10,
    crate: 6,
    tree: 6,
    palm: 6,
    rock: 6,
  };

  const max = halfSize;
  const validArea = {
    hut: max - edgeMargin.hut,
    crate: max - edgeMargin.crate,
    tree: max - edgeMargin.tree,
    palm: max - edgeMargin.palm,
    rock: max - edgeMargin.rock,
  };

  // Build 8x8 grid of cells over the full area, shuffle, share one counter.
  const cells = [];
  for (let i = 0; i < 64; i++) cells.push(i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  let cellIndex = 0;

  const placed = [];
  const order = ['hut', 'rock', 'crate', 'tree', 'palm'];

  function pickCell() {
    const c = cells[cellIndex % cells.length];
    cellIndex++;
    return c;
  }

  for (const type of order) {
    const n = count[type];
    const margin = validArea[type];
    for (let k = 0; k < n; k++) {
      let accepted = null;
      for (let attempt = 0; attempt < 40 && !accepted; attempt++) {
        const cell = pickCell();
        const cx = (cell % 8) * (max * 2 / 8) - max;
        const cz = Math.floor(cell / 8) * (max * 2 / 8) - max;
        const cellW = max * 2 / 8;
        let x = cx + rand() * cellW;
        let z = cz + rand() * cellW;
        x = Math.max(-margin, Math.min(margin, x));
        z = Math.max(-margin, Math.min(margin, z));

        let scale;
        if (type === 'rock') {
          scale = 1.5 + rand() * 1.5;
        } else {
          scale = 0.9 + rand() * 0.4;
        }
        const r = type === 'rock' ? 2 * scale : radiusByType[type];

        let ok = true;
        for (const p of placed) {
          const dx = x - p.x;
          const dz = z - p.z;
          if (Math.sqrt(dx * dx + dz * dz) < r + p.r + 3) {
            ok = false;
            break;
          }
        }
        if (ok) {
          for (const s of spawnPoints) {
            const dx = x - s.x;
            const dz = z - s.z;
            if (Math.sqrt(dx * dx + dz * dz) < 10) {
              ok = false;
              break;
            }
          }
        }
        if (ok) {
          accepted = { type, x, z, r, rotY: rand() * Math.PI * 2, scale };
        }
      }
      if (accepted) placed.push(accepted);
    }
  }

  return placed;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}