import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function addScenery(scene, arenaHalfSize, spawnPoints, coverPositions) {
  const loader = new GLTFLoader();

  // Seeded random for identical layout on every client
  let seed = 42;
  function rand() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }

  function randRange(min, max) {
    return min + rand() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(min + rand() * (max - min + 1));
  }

  function dist2(a, b) {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
  }

  function isValidPosition(x, z) {
    // Check distance from spawn points
    for (const sp of spawnPoints) {
      if (dist2({ x, z }, sp) < 36) return false; // 6^2
    }
    // Check distance from cover objects
    for (const cp of coverPositions) {
      if (dist2({ x, z }, cp) < 16) return false; // 4^2
    }
    return true;
  }

  // Load models
  const [treeGltf, rockGltf] = await Promise.allSettled([
    loader.loadAsync('/models/tree1.glb'),
    loader.loadAsync('/models/rock1.glb')
  ]);

  const treeModel = treeGltf.status === 'fulfilled' ? treeGltf.value.scene : null;
  const rockModel = rockGltf.status === 'fulfilled' ? rockGltf.value.scene : null;

  if (!treeModel) console.warn('[SCENERY] tree1.glb failed to load');
  if (!rockModel) console.warn('[SCENERY] rock1.glb failed to load');

  const scenery = new THREE.Group();
  scenery.name = 'scenery';

  // Helper to scale model by bounding box
  function scaleModel(model, targetHeight) {
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    if (height > 0) {
      const scale = targetHeight / height;
      model.scale.setScalar(scale);
    }
  }

  // Place trees (8 trees)
  if (treeModel) {
    const innerBand = arenaHalfSize - 2;
    const outerBand = arenaHalfSize - 5;
    const minDist = 8; // min distance between trees

    for (let i = 0; i < 8; i++) {
      let x, z, attempts = 0;
      do {
        x = randRange(-outerBand, outerBand);
        z = randRange(-outerBand, outerBand);
        attempts++;
        if (attempts > 50) break;
      } while (!isValidPosition(x, z));

      if (attempts <= 50) {
        const clone = treeModel.clone(true);
        scaleModel(clone, randRange(6, 8));
        clone.rotation.y = randRange(0, Math.PI * 2);
        clone.position.set(x, 0, z);

        clone.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scenery.add(clone);
      }
    }
  }

  // Place rocks (6 rocks, some in small groups)
  if (rockModel) {
    const innerBand = arenaHalfSize - 2;
    const outerBand = arenaHalfSize - 5;

    let placed = 0;
    while (placed < 6) {
      const groupSize = randInt(1, 3);
      const cx = randRange(-outerBand, outerBand);
      const cz = randRange(-outerBand, outerBand);

      if (!isValidPosition(cx, cz)) continue;

      for (let i = 0; i < groupSize && placed < 6; i++, placed++) {
        const ox = cx + randRange(-1.5, 1.5);
        const oz = cz + randRange(-1.5, 1.5);

        const clone = rockModel.clone(true);
        scaleModel(clone, randRange(1.5, 3));
        clone.rotation.y = randRange(0, Math.PI * 2);
        clone.rotation.x = randRange(-0.1, 0.1);
        clone.rotation.z = randRange(-0.1, 0.1);
        clone.position.set(ox, 0, oz);

        clone.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scenery.add(clone);
      }
    }
  }

  scene.add(scenery);
  return scenery;
}