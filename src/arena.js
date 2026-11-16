import * as THREE from 'three';

export function createArena(scene) {
  const collidables = [];

  // Floor material & mesh
  const floorSize = 60;
  const floorGeometry = new THREE.PlaneGeometry(floorSize, floorSize);

  // Create grid-like texture visually with MeshStandardMaterial
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x333344,
    roughness: 0.8,
    metalness: 0.2
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Helper grid on the floor
  const gridHelper = new THREE.GridHelper(floorSize, 30, 0x00ff88, 0x444466);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Wall configuration
  const wallHeight = 8;
  const wallThickness = 2;
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x222233,
    roughness: 0.6
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
    scene.add(wall);
    collidables.push(wall);
  });

  // Box obstacles
  const boxMaterial = new THREE.MeshStandardMaterial({
    color: 0xff8800,
    roughness: 0.5,
    metalness: 0.1
  });

  const obstacles = [
    { x: -10, y: 1.5, z: -10, w: 3, h: 3, d: 3 },
    { x: 10, y: 2, z: -5, w: 4, h: 4, d: 4 },
    { x: 0, y: 1, z: 12, w: 6, h: 2, d: 2 },
    { x: -12, y: 2.5, z: 8, w: 5, h: 5, d: 2 },
    { x: 15, y: 1.5, z: 12, w: 3, h: 3, d: 6 }
  ];

  obstacles.forEach((obs) => {
    const geo = new THREE.BoxGeometry(obs.w, obs.h, obs.d);
    const mesh = new THREE.Mesh(geo, boxMaterial);
    mesh.position.set(obs.x, obs.y, obs.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    collidables.push(mesh);
  });

  // Add lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(20, 40, 20);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 100;
  const d = 40;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d;
  dirLight.shadow.camera.bottom = -d;
  scene.add(dirLight);

  return collidables;
}
