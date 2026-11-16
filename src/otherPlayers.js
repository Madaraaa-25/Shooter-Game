import * as THREE from 'three';

export class OtherPlayersManager {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> { mesh, targetPosition, targetQuaternion, color, nameLabel }
    this.myId = null;
  }

  setMyId(id) {
    this.myId = id;
  }

  // Create a player capsule mesh
  createPlayerMesh(color, id) {
    const group = new THREE.Group();
    group.userData.playerId = id;

    // Body (capsule: cylinder + two spheres)
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.4,
      metalness: 0.1
    });

    // Cylinder body
    const cylinderGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.2, 8);
    const body = new THREE.Mesh(cylinderGeo, bodyMaterial);
    body.position.y = 0.9;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Bottom sphere
    const sphereGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const bottomSphere = new THREE.Mesh(sphereGeo, bodyMaterial);
    bottomSphere.position.y = 0.3;
    bottomSphere.castShadow = true;
    group.add(bottomSphere);

    // Top sphere
    const topSphere = new THREE.Mesh(sphereGeo, bodyMaterial);
    topSphere.position.y = 1.5;
    topSphere.castShadow = true;
    group.add(topSphere);

    // Head (smaller sphere on top)
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      roughness: 0.6,
      metalness: 0.1
    });
    const headGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const head = new THREE.Mesh(headGeo, headMaterial);
    head.position.y = 1.85;
    head.castShadow = true;
    group.add(head);

    // Player name/ID label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shortId = id.slice(0, 4);
    ctx.strokeText(shortId, 128, 32);
    ctx.fillText(shortId, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const label = new THREE.Sprite(spriteMaterial);
    label.scale.set(2, 0.5, 1);
    label.position.y = 2.3;
    label.renderOrder = 1;
    group.add(label);
    group.userData.label = label;

    return group;
  }

  addPlayer(id, data) {
    if (id === this.myId) return; // Don't create mesh for self
    if (this.players.has(id)) return; // Already exists

    const mesh = this.createPlayerMesh(data.color, id);
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    mesh.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);

    this.scene.add(mesh);

    this.players.set(id, {
      mesh,
      targetPosition: new THREE.Vector3().copy(mesh.position),
      targetQuaternion: new THREE.Quaternion().copy(mesh.quaternion),
      color: data.color
    });
  }

  updatePlayer(id, data) {
    if (id === this.myId) return;

    const player = this.players.get(id);
    if (player) {
      // Set target for interpolation
      player.targetPosition.set(data.position.x, data.position.y, data.position.z);
      player.targetQuaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
    }
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (player) {
      // Dispose geometries and materials
      player.mesh.traverse((child) => {
        if (child.isMesh) {
          child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        } else if (child.isSprite) {
          if (child.material.map) child.material.map.dispose();
          child.material.dispose();
        }
      });
      this.scene.remove(player.mesh);
      this.players.delete(id);
    }
  }

  // Call each frame to interpolate positions
  update(delta) {
    const lerpFactor = Math.min(1, delta * 15); // ~15x per second interpolation

    this.players.forEach((player) => {
      // Interpolate position
      player.mesh.position.lerp(player.targetPosition, lerpFactor);

      // Interpolate rotation (slerp)
      player.mesh.quaternion.slerp(player.targetQuaternion, lerpFactor);
    });
  }

  getPlayerCount() {
    return this.players.size;
  }

  getPlayers() {
    return this.players;
  }
}