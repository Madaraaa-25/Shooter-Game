import * as THREE from 'three';

export function createArena(scene, dirLight) {
  const collidables = [];

  // Floor material & mesh
  const floorSize = 60;
  const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);

  // Base material (fallback color if textures fail)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1.0,
    metalness: 0.0
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Load sand textures
  const loader = new THREE.TextureLoader();
  loader.load('/textures/sand_color.jpg', (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(floorSize / 4, floorSize / 4);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    floorMaterial.map = tex;
    floorMaterial.needsUpdate = true;
  });
  loader.load('/textures/sand_normal.jpg', (tex) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(floorSize / 4, floorSize / 4);
    tex.anisotropy = 8;
    floorMaterial.normalMap = tex;
    floorMaterial.normalScale.set(0.8, 0.8);
    floorMaterial.needsUpdate = true;
  });

  // Helper grid on the floor (hidden)
  const gridHelper = new THREE.GridHelper(floorSize, 30, 0x00ff88, 0x444466);
  gridHelper.position.y = 0.01;
  gridHelper.visible = false;
  scene.add(gridHelper);

  // Wall configuration
  const wallHeight = 8;
  const wallThickness = 2;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xb8b2a6,
    roughness: 0.85,
    metalness: 0.0
  });

  const wallSpecs = [
    // North wall
    { width: floorSize + wallThickness * 2, height: wallHeight, depth: wallThickness, x: 0, y: wallHeight / 2, z: -floorSize / 2 - wallThickness / 2 },
    // South wall
    { width: floorSize + wallThickness * 2, height: wallHeight, depth: wallThickness, x: 0, y: wallHeight / 2, z: floorSize / 2 + wallThickness / 2 },
    // East wall
    { width: wallThickness, height: wallHeight, depth: floorSize, x: floorSize / 2 + wallThickness / 2, y: wallHeight / 2, z: 0 },
    // West wall
    { width: wallThickness, height: wallHeight, depth: floorSize, x: -floorSize / 2 - wallThickness / 2, y: wallHeight / 2, z: 0 }
  ];

  wallSpecs.forEach((spec) => {
    const geo = new THREE.BoxGeometry(spec.width, spec.height, spec.depth);
    const wall = new THREE.Mesh(geo, wallMaterial);
    wall.position.set(spec.x, spec.y, spec.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    wall.visible = false;
    scene.add(wall);
    collidables.push(wall);
  });

  // Box obstacles
  // Base material settings (textures loaded once, shared)
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

  const baseMaterialParams = {
    color: 0xcfa97a,
    roughness: 0.85,
    metalness: 0.0,
    normalScale: new THREE.Vector2(0.6, 0.6)
  };

  const obstacles = [
    { x: -10, y: 1.5, z: -10, w: 3, h: 3, d: 3 },
    { x: 10, y: 2, z: -5, w: 4, h: 4, d: 4 },
    { x: 0, y: 1, z: 12, w: 6, h: 2, d: 2 },
    { x: -12, y: 2.5, z: 8, w: 5, h: 5, d: 2 },
    { x: 15, y: 1.5, z: 12, w: 3, h: 3, d: 6 }
  ];

  obstacles.forEach((obs) => {
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);

    // Create material per crate with repeat based on crate size (~2 world units per tile)
    const material = new THREE.MeshStandardMaterial(baseMaterialParams);
    if (crateColorMap) {
      material.map = crateColorMap.clone();
      material.map.repeat.set(obs.w / 2, obs.d / 2);
      material.map.wrapS = THREE.RepeatWrapping;
      material.map.wrapT = THREE.RepeatWrapping;
      material.map.colorSpace = THREE.SRGBColorSpace;
      material.map.anisotropy = 4;
    }
    if (crateNormalMap) {
      material.normalMap = crateNormalMap.clone();
      material.normalMap.repeat.set(obs.w / 2, obs.d / 2);
      material.normalMap.wrapS = THREE.RepeatWrapping;
      material.normalMap.wrapT = THREE.RepeatWrapping;
      material.normalMap.anisotropy = 4;
    }
    material.needsUpdate = true;

    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(obs.x, obs.y, obs.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    collidables.push(mesh);
  });

  // Lighting is provided by the scene setup (sky, hemisphere, sun).
  // Floor receives shadows; walls and cover objects cast and receive.
  return collidables;
}
