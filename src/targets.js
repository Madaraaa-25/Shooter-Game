import * as THREE from 'three';

export class TargetSystem {
  constructor(scene) {
    this.scene = scene;
    this.targets = [];
    this.targetPositions = [
      { x: -15, y: 1.5, z: -15 },
      { x: 15, y: 1.5, z: -10 },
      { x: 0, y: 1.5, z: 18 },
      { x: -18, y: 1.5, z: 10 },
      { x: 18, y: 1.5, z: 15 }
    ];

    this.targetMaterial = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x330000,
      emissiveIntensity: 0.3
    });

    this.targetMaterialHit = new THREE.MeshStandardMaterial({
      color: 0x22ff22,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0x003300,
      emissiveIntensity: 0.5
    });

    this.createTargets();
  }

  createTargets() {
    this.targetPositions.forEach((pos, index) => {
      const target = this.createTarget(pos, index);
      this.targets.push({
        mesh: target,
        originalPosition: pos,
        isAlive: true,
        respawnTimer: 0,
        index
      });
      this.scene.add(target);
    });
  }

  createTarget(pos, index) {
    // Main body - capsule shape (cylinder + spheres)
    const group = new THREE.Group();
    group.userData.isTarget = true;
    group.userData.targetIndex = index;

    // Body (cylinder)
    const bodyGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const body = new THREE.Mesh(bodyGeo, this.targetMaterial);
    body.position.y = 1;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Head (sphere)
    const headGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const head = new THREE.Mesh(headGeo, this.targetMaterial);
    head.position.y = 2.4;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);

    // Arms (small boxes)
    const armGeo = new THREE.BoxGeometry(0.2, 1, 0.2);
    const leftArm = new THREE.Mesh(armGeo, this.targetMaterial);
    leftArm.position.set(-0.6, 1.2, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, this.targetMaterial);
    rightArm.position.set(0.6, 1.2, 0);
    rightArm.castShadow = true;
    group.add(rightArm);

    group.position.set(pos.x, pos.y, pos.z);

    // Store original materials for hit flash
    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.originalMaterial = child.material;
      }
    });

    return group;
  }

  hitTarget(targetData) {
    if (!targetData.isAlive) return;

    targetData.isAlive = false;
    targetData.respawnTimer = 3000; // 3 seconds

    // Visual feedback - flash green then hide
    this.flashAndHide(targetData.mesh);

    // Remove from raycasting temporarily
    targetData.mesh.visible = false;
  }

  flashAndHide(mesh) {
    // Flash green briefly
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.material = this.targetMaterialHit;
      }
    });

    setTimeout(() => {
      mesh.visible = false;
    }, 100);
  }

  update(delta) {
    const deltaMs = delta * 1000;

    this.targets.forEach((targetData) => {
      if (!targetData.isAlive) {
        targetData.respawnTimer -= deltaMs;
        if (targetData.respawnTimer <= 0) {
          this.respawnTarget(targetData);
        }
      }
    });
  }

  respawnTarget(targetData) {
    targetData.isAlive = true;
    targetData.mesh.position.set(
      targetData.originalPosition.x,
      targetData.originalPosition.y,
      targetData.originalPosition.z
    );
    targetData.mesh.visible = true;

    // Restore original materials
    targetData.mesh.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
      }
    });
  }

  getTargets() {
    return this.targets.filter(t => t.isAlive).map(t => t.mesh);
  }

  getAllTargetMeshes() {
    return this.targets.map(t => t.mesh);
  }

  // Called when a target is hit - find which one
  checkHit(intersectedObject) {
    for (const targetData of this.targets) {
      if (targetData.isAlive) {
        // Check if intersected object is part of this target group
        let current = intersectedObject;
        while (current) {
          if (current === targetData.mesh) {
            this.hitTarget(targetData);
            return true;
          }
          current = current.parent;
        }
      }
    }
    return false;
  }
}