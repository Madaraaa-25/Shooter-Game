import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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

function isValidPosition(x, z, spawnPoints, coverPositions, extraExcludes = []) {
  if (!Array.isArray(extraExcludes)) {
    extraExcludes = extraExcludes ? [extraExcludes] : [];
  }
  // Check distance from spawn points
  for (const sp of spawnPoints) {
    if (dist2({ x, z }, sp) < 36) return false; // 6^2
  }
  // Check distance from cover objects
  for (const cp of coverPositions) {
    if (dist2({ x, z }, cp) < 16) return false; // 4^2
  }
  // Check extra exclusions (rocks, trees, hut, etc.) - 9 units
  for (const ex of extraExcludes) {
    if (dist2({ x, z }, ex) < 81) return false; // 9^2
  }
  return true;
}

function createThatchTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const data = imgData.data;

  // Base color #a07a3c
  const baseR = 0xa0;
  const baseG = 0x7a;
  const baseB = 0x3c;

  // Fill base
  for (let i = 0; i < data.length; i += 4) {
    data[i] = baseR;
    data[i + 1] = baseG;
    data[i + 2] = baseB;
    data[i + 3] = 255;
  }

  // 400+ thin streaks in #6b4a1f, #c29a55, #84602a
  const streakColors = [
    { r: 0x6b, g: 0x4a, b: 0x1f },
    { r: 0xc2, g: 0x9a, b: 0x55 },
    { r: 0x84, g: 0x60, b: 0x2a }
  ];

  const streakCount = 450;
  for (let s = 0; s < streakCount; s++) {
    const color = streakColors[Math.floor(Math.random() * streakColors.length)];
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    const length = 5 + Math.random() * 60; // random length
    const angle = (Math.random() - 0.5) * 0.3; // slight angle change (radians)
    const thickness = 1 + Math.random() * 1.5; // thin
    const steps = Math.max(1, Math.floor(length / 2));

    for (let step = 0; step < steps; step++) {
      const t = step / Math.max(1, steps - 1);
      const cx = Math.round(x0 + t * length * Math.sin(angle));
      const cy = Math.round(y0 + t * length);
      if (cx >= 0 && cx < size && cy >= 0 && cy < size) {
        const i = (cy * size + cx) * 4;
        // Blend streak color (dark on base)
        data[i] = Math.min(data[i], color.r);
        data[i + 1] = Math.min(data[i + 1], color.g);
        data[i + 2] = Math.min(data[i + 2], color.b);
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  tex.anisotropy = 4;
  return tex;
}

export function buildHut() {
  const crateLoader = new THREE.TextureLoader();
  const crateColorMap = crateLoader.load('/textures/crate_color.jpg', () => {
    crateColorMap.wrapS = THREE.RepeatWrapping;
    crateColorMap.wrapT = THREE.RepeatWrapping;
    crateColorMap.colorSpace = THREE.SRGBColorSpace;
    crateColorMap.anisotropy = 4;
  });
  const crateNormalMap = crateLoader.load('/textures/crate_normal.jpg', () => {
    crateNormalMap.wrapS = THREE.RepeatWrapping;
    crateNormalMap.wrapT = THREE.RepeatWrapping;
    crateNormalMap.anisotropy = 4;
  });

  const hut = new THREE.Group();
  hut.name = 'hut';

  // Wall material (wood from crate textures, tinted)
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xcfa97a,
    roughness: 0.85,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.6, 0.6)
  });
  if (crateColorMap) {
    wallMaterial.map = crateColorMap.clone();
    wallMaterial.map.repeat.set(6 / 2, 3 / 2);
    wallMaterial.map.wrapS = THREE.RepeatWrapping;
    wallMaterial.map.wrapT = THREE.RepeatWrapping;
    wallMaterial.map.colorSpace = THREE.SRGBColorSpace;
    wallMaterial.map.anisotropy = 4;
  }
  if (crateNormalMap) {
    wallMaterial.normalMap = crateNormalMap.clone();
    wallMaterial.normalMap.repeat.set(6 / 2, 3 / 2);
    wallMaterial.normalMap.wrapS = THREE.RepeatWrapping;
    wallMaterial.normalMap.wrapT = THREE.RepeatWrapping;
    wallMaterial.normalMap.anisotropy = 4;
  }
  wallMaterial.needsUpdate = true;

  // Wall dimensions: 6 x 3 x 6, walls are ~0.3 thick
  const wallThick = 0.3;
  const wallH = 3;
  const wallL = 6;
  const wallW = 6;

  // Build a wall with a centred window opening (1.4 wide, from height 1.0 to 2.0).
  // `place(length, height, alongOffset, heightCenter)` adds one box piece; the
  // caller maps "along the wall" to the correct local axis and sets the position.
  function addWindowWall(place) {
    const sideL = (wallL - 1.4) / 2; // 2.3
    const off = 1.4 / 2 + sideL / 2; // 1.85
    // piece 1: below the window, full wall length, height 1.0, centred at 0.5
    place(wallL, 1.0, 0, 0.5);
    // piece 2: above the window, full wall length, height 1.0, centred at 2.5
    place(wallL, 1.0, 0, 2.5);
    // piece 3: left of the window, length 2.3, height 1.0, centred at 1.5
    place(sideL, 1.0, -off, 1.5);
    // piece 4: right of the window, same size, offset +1.85 along the wall
    place(sideL, 1.0, +off, 1.5);
  }

  // Back wall (z = +3): "along the wall" is local x
  addWindowWall((length, height, alongOffset, heightCenter) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, wallThick), wallMaterial);
    mesh.position.set(alongOffset, heightCenter, wallW / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hut.add(mesh);
  });

  // Left wall (x = -3): "along the wall" is local z
  addWindowWall((length, height, alongOffset, heightCenter) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), wallMaterial);
    mesh.position.set(-wallL / 2, heightCenter, alongOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hut.add(mesh);
  });

  // Right wall (x = +3): "along the wall" is local z
  addWindowWall((length, height, alongOffset, heightCenter) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(wallThick, height, length), wallMaterial);
    mesh.position.set(wallL / 2, heightCenter, alongOffset);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    hut.add(mesh);
  });

  // Front wall with door opening: two side panels + top lintel
  const doorW = 2.2;
  const doorH = 2.2;
  const sideW = (wallL - doorW) / 2;

  // Left side panel
  if (sideW > 0) {
    const sideGeo = new THREE.BoxGeometry(sideW, wallH, wallThick);
    const side = new THREE.Mesh(sideGeo, wallMaterial);
    side.position.set(-wallL / 2 + sideW / 2, wallH / 2, -wallW / 2);
    side.castShadow = true;
    side.receiveShadow = true;
    hut.add(side);
  }
  // Right side panel
  if (sideW > 0) {
    const sideGeo = new THREE.BoxGeometry(sideW, wallH, wallThick);
    const side = new THREE.Mesh(sideGeo, wallMaterial);
    side.position.set(wallL / 2 - sideW / 2, wallH / 2, -wallW / 2);
    side.castShadow = true;
    side.receiveShadow = true;
    hut.add(side);
  }
  // Top lintel
  const lintelGeo = new THREE.BoxGeometry(doorW, wallH - doorH, wallThick);
  const lintel = new THREE.Mesh(lintelGeo, wallMaterial);
  lintel.position.set(0, wallH - (wallH - doorH) / 2, -wallW / 2);
  lintel.castShadow = true;
  lintel.receiveShadow = true;
  hut.add(lintel);

  // Thatch roof: pyramid (ConeGeometry 4 segments, rotated 45 deg)
  // Radius: half diagonal of 6x6 square + 0.6 overhang
  const roofRadius = (wallW / 2) * Math.SQRT2 + 0.6;
  const roofHeight = 3.2;
  const roofGeo = new THREE.ConeGeometry(roofRadius, roofHeight, 4);
  roofGeo.rotateY(Math.PI / 4); // corners over wall corners

  const thatchTex = createThatchTexture();
  thatchTex.anisotropy = 4;
  thatchTex.repeat.set(4, 3);
  const roofMaterial = new THREE.MeshStandardMaterial({
    map: thatchTex,
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0
  });
  const roof = new THREE.Mesh(roofGeo, roofMaterial);
  roof.position.set(0, wallH + roofHeight / 2, 0);
  roof.castShadow = true;
  roof.receiveShadow = true;
  hut.add(roof);

  return hut;
}

export function buildPalm() {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6b3e });
  const frondMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, side: THREE.DoubleSide });
  const nutMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a });
  const segments = 8;
  const segHeight = 7 / segments;
  let topX = 0;
  let y = 0;
  for (let i = 0; i < segments; i++) {
    const rBottom = 0.35 - (0.17 * i) / segments;
    const rTop = 0.35 - (0.17 * (i + 1)) / segments;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, segHeight, 8), trunkMat);
    const lean = 1 / segments;
    seg.position.set(topX + lean / 2, y + segHeight / 2, 0);
    seg.rotation.z = -Math.atan2(lean, segHeight);
    seg.castShadow = true;
    group.add(seg);
    topX += lean;
    y += segHeight;
  }
  const crown = new THREE.Group();
  crown.position.set(topX, y, 0);
  const fronds = 10;
  for (let i = 0; i < fronds; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / fronds) * Math.PI * 2;
    const frond = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 0.9), frondMat);
    frond.rotation.x = -Math.PI / 2;
    frond.position.set(1.75, 0, 0);
    frond.castShadow = true;
    const tilt = new THREE.Group();
    tilt.rotation.z = -(35 * Math.PI) / 180;
    tilt.add(frond);
    pivot.add(tilt);
    crown.add(pivot);
  }
  for (let i = 0; i < 3; i++) {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), nutMat);
    const a = (i / 3) * Math.PI * 2;
    nut.position.set(Math.cos(a) * 0.3, -0.25, Math.sin(a) * 0.3);
    nut.castShadow = true;
    crown.add(nut);
  }
  group.add(crown);
  return group;
}

export function addHut(scene, arenaHalfSize, spawnPoints, coverPositions, extraExcludes = []) {
  const hut = buildHut();

  // Find valid position: right side (positive x), near edge, door facing center
  // Keep at least 4 units from arena edge so it's not in water
  let placed = false;
  let attempts = 0;
  let lastX = 0, lastZ = 0;
  const minEdgeDist = 4 + 3; // 4 units from edge + half hut width (3)
  while (!placed && attempts < 100) {
    const x = randRange(minEdgeDist, arenaHalfSize - minEdgeDist);
    const z = randRange(-arenaHalfSize + minEdgeDist, arenaHalfSize - minEdgeDist);
    // Only right side (positive x)
    if (x < 0) continue;
    lastX = x;
    lastZ = z;
    if (isValidPosition(x, z, spawnPoints, coverPositions, extraExcludes)) {
      hut.position.set(x, 0, z);
      // Door faces -z in local; we want it to point toward origin (0,0).
      // World forward of door = (0,0,-1) rotated by hut.rotation.y.
      // For a point at (x,z), vector to origin is (-x, -z).
      // We need dot((0,0,-1) rotated by y, (-x,-z)) > 0.
      // That means door local -z axis (world direction after rotation) aligns with (-x,-z).
      // Rotation that aligns -z with (-x,-z) is atan2(x, z) + PI.
      let angle = Math.atan2(x, z) + Math.PI;
      // Verify: door world forward = (0,0,-1) rotated by angle
      const fwdX = Math.sin(angle) * -1;
      const fwdZ = Math.cos(angle) * -1;
      // Vector to origin
      const toX = -x;
      const toZ = -z;
      // Dot product must be positive
      if (fwdX * toX + fwdZ * toZ < 0) {
        angle += Math.PI;
      }
      hut.rotation.y = angle;
      placed = true;
    }
    attempts++;
  }
  if (!placed) {
    console.warn('[SCENERY] Hut position not fully validated, placing at last candidate');
    hut.position.set(lastX, 0, lastZ);
    let angle = Math.atan2(lastX, lastZ) + Math.PI;
    const fwdX = Math.sin(angle) * -1;
    const fwdZ = Math.cos(angle) * -1;
    if (fwdX * (-lastX) + fwdZ * (-lastZ) < 0) {
      angle += Math.PI;
    }
    hut.rotation.y = angle;
  }

  scene.add(hut);
  return { x: hut.position.x, z: hut.position.z };
}

export async function addScenery(scene, arenaHalfSize, spawnPoints, coverPositions, extraExcludes = []) {
  if (!Array.isArray(extraExcludes)) {
    extraExcludes = extraExcludes ? [extraExcludes] : [];
  }
  const loader = new GLTFLoader();

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

    for (let i = 0; i < 8; i++) {
      let x, z, attempts = 0;
      do {
        x = randRange(-outerBand, outerBand);
        z = randRange(-outerBand, outerBand);
        attempts++;
        if (attempts > 50) break;
      } while (!isValidPosition(x, z, spawnPoints, coverPositions, extraExcludes));

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
  const rockPositions = [];
  if (rockModel) {
    const innerBand = arenaHalfSize - 2;
    const outerBand = arenaHalfSize - 5;

    let placed = 0;
    while (placed < 6) {
      const groupSize = randInt(1, 3);
      const cx = randRange(-outerBand, outerBand);
      const cz = randRange(-outerBand, outerBand);

      if (!isValidPosition(cx, cz, spawnPoints, coverPositions, extraExcludes)) continue;

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

        rockPositions.push({ x: ox, z: oz });
        scenery.add(clone);
      }
    }
  }

  // Add hut (after rocks so we can exclude their positions)
  addHut(scene, arenaHalfSize, spawnPoints, coverPositions, rockPositions);

  scene.add(scenery);
  return scenery;
}

export async function addSceneryFromLayout(scene, layout) {
  const loader = new GLTFLoader();

  const [treeGltf, rockGltf] = await Promise.allSettled([
    loader.loadAsync('/models/tree1.glb'),
    loader.loadAsync('/models/rock1.glb')
  ]);

  const treeModel = treeGltf.status === 'fulfilled' ? treeGltf.value.scene : null;
  const rockModel = rockGltf.status === 'fulfilled' ? rockGltf.value.scene : null;

  if (!treeModel) console.warn('[SCENERY] tree1.glb failed to load');
  if (!rockModel) console.warn('[SCENERY] rock1.glb failed to load');

  function scaleModel(model, targetHeight) {
    const box = new THREE.Box3().setFromObject(model);
    const height = box.max.y - box.min.y;
    if (height > 0) {
      const scale = targetHeight / height;
      model.scale.setScalar(scale);
    }
  }

  function setShadows(model) {
    model.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  for (const obj of layout) {
    if (obj.type === 'hut') {
      const hut = buildHut();
      hut.position.set(obj.x, 0, obj.z);
      hut.rotation.y = Math.atan2(obj.x, obj.z) + Math.PI;
      hut.scale.setScalar(obj.scale);
      scene.add(hut);
    } else if (obj.type === 'rock') {
      if (!rockModel) continue;
      const clone = rockModel.clone(true);
      scaleModel(clone, obj.scale);
      clone.rotation.y = obj.rotY;
      clone.rotation.x = randRange(-0.1, 0.1);
      clone.rotation.z = randRange(-0.1, 0.1);
      clone.position.set(obj.x, 0, obj.z);
      setShadows(clone);
      scene.add(clone);
    } else if (obj.type === 'tree') {
      if (!treeModel) continue;
      const clone = treeModel.clone(true);

      // Compute bounding box BEFORE scaling to get original height
      const boxBefore = new THREE.Box3().setFromObject(clone);
      const originalHeight = boxBefore.max.y - boxBefore.min.y;

      if (originalHeight > 0) {
        const uniformScale = (8 * obj.scale) / originalHeight;
        clone.scale.setScalar(uniformScale);
      }

      clone.rotation.y = obj.rotY;

      // Recompute bounding box AFTER scaling and set position.y so bottom sits on ground
      const boxAfter = new THREE.Box3().setFromObject(clone);
      clone.position.set(obj.x, -boxAfter.min.y, obj.z);

      setShadows(clone);
      scene.add(clone);
    } else if (obj.type === 'palm') {
      const palm = buildPalm();
      palm.scale.setScalar(obj.scale);
      palm.position.set(obj.x, 0, obj.z);
      palm.rotation.y = obj.rotY;
      scene.add(palm);
    }
    // crate is skipped for now
  }
}