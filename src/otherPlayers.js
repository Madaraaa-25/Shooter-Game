import * as THREE from 'three';
import { PLAYER_EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_BODY_RADIUS, PLAYER_HEAD_RADIUS } from './constants.js';

export class OtherPlayersManager {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> { mesh, targetPosition, targetQuaternion, color, health, maxHealth, isDead, nameLabel }
    this.myId = null;
  }

  setMyId(id) {
    this.myId = id;
  }

  // Create a player capsule mesh
  createPlayerMesh(color, id, name) {
    const group = new THREE.Group();
    group.userData.playerId = id;

    // Body material
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.4,
      metalness: 0.1
    });

    // Body: cylinder + spheres - centred at PLAYER_HEIGHT/2 so bottom is at feet (y=0)
    const bodyGeo = new THREE.CylinderGeometry(PLAYER_BODY_RADIUS, PLAYER_BODY_RADIUS, PLAYER_HEIGHT, 8);
    const body = new THREE.Mesh(bodyGeo, bodyMaterial);
    body.position.y = PLAYER_HEIGHT / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // Bottom sphere (feet level)
    const sphereGeo = new THREE.SphereGeometry(PLAYER_BODY_RADIUS, 8, 8);
    const bottomSphere = new THREE.Mesh(sphereGeo, bodyMaterial);
    bottomSphere.position.y = PLAYER_BODY_RADIUS;
    bottomSphere.castShadow = true;
    group.add(bottomSphere);

    // Top sphere (top of body)
    const topSphere = new THREE.Mesh(sphereGeo, bodyMaterial);
    topSphere.position.y = PLAYER_HEIGHT - PLAYER_BODY_RADIUS;
    topSphere.castShadow = true;
    group.add(topSphere);

    // Head (smaller sphere on top)
    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0xffeedd,
      roughness: 0.6,
      metalness: 0.1
    });
    const headGeo = new THREE.SphereGeometry(PLAYER_HEAD_RADIUS, 8, 8);
    const head = new THREE.Mesh(headGeo, headMaterial);
    head.position.y = PLAYER_HEIGHT - PLAYER_BODY_RADIUS + PLAYER_HEAD_RADIUS;
    head.castShadow = true;
    group.add(head);

    // Player name/ID label
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const labelText = (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 12) : id.slice(0, 4);
    let fontSize = 32;
    ctx.font = 'bold ' + fontSize + 'px Arial';
    while (ctx.measureText(labelText).width > 240 && fontSize > 12) { fontSize -= 2; ctx.font = 'bold ' + fontSize + 'px Arial'; }
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(labelText, 128, 32);
    ctx.fillText(labelText, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false
    });
    const label = new THREE.Sprite(spriteMaterial);
    label.scale.set(2, 0.5, 1);
    label.position.y = PLAYER_HEIGHT + 0.5;
    label.renderOrder = 1;
    group.add(label);
    group.userData.label = label;

    // Health bar sprite (drawn above the head)
    const barCanvas = document.createElement('canvas');
    barCanvas.width = 128; barCanvas.height = 16;
    const barTexture = new THREE.CanvasTexture(barCanvas);
    const barSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: barTexture, transparent: true, depthTest: false }));
    barSprite.scale.set(1.2, 0.15, 1);
    barSprite.position.y = PLAYER_HEIGHT + 0.18;
    barSprite.renderOrder = 1;
    group.add(barSprite);
    group.userData.healthBar = { sprite: barSprite, ctx: barCanvas.getContext('2d'), texture: barTexture };
    this.drawHealthBar(group, 100, 100);

    // Store original materials for death effect
    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.originalMaterial = child.material;
      }
    });

    return group;
  }

  addPlayer(id, data) {
    if (id === this.myId) return;
    if (this.players.has(id)) return;

    const mesh = this.createPlayerMesh(data.color, id, data.name);
    // Server sends eye position; convert to feet for visual mesh (mesh bottom at feet)
    mesh.position.set(data.position.x, data.position.y - PLAYER_EYE_HEIGHT, data.position.z);
    mesh.quaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);

    this.scene.add(mesh);

    this.players.set(id, {
      mesh,
      targetPosition: new THREE.Vector3().copy(mesh.position),
      targetQuaternion: new THREE.Quaternion().copy(mesh.quaternion),
      color: data.color,
      health: data.health || 100,
      maxHealth: data.maxHealth || 100,
      isDead: data.isDead || false
    });
    this.drawHealthBar(mesh, data.health || 100, data.maxHealth || 100);

    // Apply dead state if needed
    if (data.isDead) {
      this.setPlayerDead(id, true);
    }
  }

  updatePlayer(id, data) {
    if (id === this.myId) return;

    const player = this.players.get(id);
    if (player) {
      // Server sends eye position; convert to feet for visual mesh
      player.targetPosition.set(data.position.x, data.position.y - PLAYER_EYE_HEIGHT, data.position.z);
      player.targetQuaternion.set(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
      const eh = Number(data.eyeHeight);
      player.targetScaleY = Number.isFinite(eh) ? Math.min(1, Math.max(0.6, eh / PLAYER_EYE_HEIGHT)) : 1;
    }
  }

  drawHealthBar(group, health, maxHealth) {
    const hb = group.userData.healthBar;
    if (!hb) return;
    const ratio = Math.max(0, Math.min(1, health / (maxHealth || 100)));
    const c = hb.ctx;
    c.clearRect(0, 0, 128, 16);
    c.fillStyle = 'rgba(0,0,0,0.7)';
    c.fillRect(0, 0, 128, 16);
    c.fillStyle = 'hsl(' + Math.round(ratio * 120) + ', 100%, 45%)';
    c.fillRect(2, 2, Math.round(124 * ratio), 12);
    hb.texture.needsUpdate = true;
  }

  // Update health (for hit feedback)
  updateHealth(id, health, maxHealth) {
    const player = this.players.get(id);
    if (player) {
      player.health = health;
      player.maxHealth = maxHealth;
      this.drawHealthBar(player.mesh, health, maxHealth);
    }
  }

  // Set player dead/alive visual state
  setPlayerDead(id, isDead) {
    const player = this.players.get(id);
    if (!player) return;

    player.isDead = isDead;

    if (isDead) {
      // Hide the mesh but keep it in scene for respawning
      player.mesh.visible = false;
      // Could add a death effect here (ragdoll, particles, etc.)
    } else {
      // Respawn - show mesh at new position
      player.mesh.visible = true;
      // Reset materials to original
      player.mesh.traverse((child) => {
        if (child.isMesh && child.userData.originalMaterial) {
          child.material = child.userData.originalMaterial;
        }
      });
    }
  }

  // Respawn at new position
  respawnPlayer(id, position, health) {
    const player = this.players.get(id);
    if (!player) return;

    player.mesh.position.set(position.x, position.y, position.z);
    player.targetPosition.set(position.x, position.y, position.z);
    player.health = health;
    player.isDead = false;
    this.drawHealthBar(player.mesh, health, player.maxHealth);
    player.mesh.visible = true;

    // Reset materials
    player.mesh.traverse((child) => {
      if (child.isMesh && child.userData.originalMaterial) {
        child.material = child.userData.originalMaterial;
      }
    });
  }

  removePlayer(id) {
    const player = this.players.get(id);
    if (player) {
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

  // Remove all other players (used when leaving a room)
  clear() {
    for (const id of Array.from(this.players.keys())) {
      this.removePlayer(id);
    }
  }

  // Call each frame to interpolate positions
  update(delta) {
    const lerpFactor = Math.min(1, delta * 15);

    this.players.forEach((player) => {
      if (player.isDead) return; // Don't interpolate dead players

      player.mesh.position.lerp(player.targetPosition, lerpFactor);
      player.mesh.quaternion.slerp(player.targetQuaternion, lerpFactor);
      const ty = player.targetScaleY ?? 1;
      const s = player.mesh.scale.y + (ty - player.mesh.scale.y) * lerpFactor;
      player.mesh.scale.y = s;
      const label = player.mesh.userData.label;
      if (label) label.scale.y = 0.5 / s;
      const bar = player.mesh.userData.healthBar;
      if (bar) bar.sprite.scale.y = 0.15 / s;
    });
  }

  getPlayerCount() {
    return this.players.size;
  }

  getPlayers() {
    return this.players;
  }

  // Get player data for scoreboard
  getPlayerData(id) {
    return this.players.get(id);
  }
}