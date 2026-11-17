import * as THREE from 'three';

export class ShootingSystem {
  constructor(camera, scene, ui) {
    this.camera = camera;
    this.scene = scene;
    this.ui = ui;

    this.maxAmmo = 30;
    this.ammo = this.maxAmmo;
    this.isReloading = false;
    this.reloadTime = 1500; // ms
    this.reloadTimer = 0;

    // Gun barrel offset from camera (right, down, forward)
    this.barrelOffset = new THREE.Vector3(0.3, -0.2, -0.5);

    // Tracer: thin glowing cylinder mesh - bright yellow, ~90ms
    this.tracerGeometry = new THREE.CylinderGeometry(0.015, 0.015, 1, 6, 1, true);
    this.tracerGeometry.rotateX(Math.PI / 2); // Align to Z axis
    this.tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      toneMapped: false
    });

    // Muzzle flash: sprite at barrel
    this.flashMaterial = new THREE.SpriteMaterial({
      color: 0xffff88,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    // Hit spark: small sprite at impact
    this.sparkMaterial = new THREE.SpriteMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
      toneMapped: false
    });

    this.activeTracers = [];
    this.activeFlash = null;
    this.activeSparks = [];

    // Raycaster for shooting
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 100;

    this.initEventListeners();
  }

  // Remove every live visual effect (tracers, muzzle flash, hit sparks).
  // Safe to call when nothing is active.
  clearSceneEffects() {
    for (const t of this.activeTracers) {
      this.scene.remove(t.tracer);
      t.tracer.geometry.dispose();
      if (t.tracer.material) t.tracer.material.dispose();
    }
    this.activeTracers = [];

    if (this.activeFlash) {
      this.scene.remove(this.activeFlash);
      if (this.activeFlash.material) this.activeFlash.material.dispose();
      this.activeFlash = null;
    }

    for (const s of this.activeSparks) {
      this.scene.remove(s.sprite);
      if (s.sprite.material) s.sprite.material.dispose();
    }
    this.activeSparks = [];
  }

  initEventListeners() {
    document.addEventListener('mousedown', (event) => {
      if (event.button === 0) this.shoot();
    });

    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyR' && !this.isReloading && this.ammo < this.maxAmmo) {
        this.startReload();
      }
    });
  }

  getBarrelPosition() {
    const pos = this.camera.getWorldPosition(new THREE.Vector3());
    const dir = this.camera.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);

    // Apply offset: right, down, forward
    pos.addScaledVector(right, this.barrelOffset.x);
    pos.addScaledVector(up, this.barrelOffset.y);
    pos.addScaledVector(dir, -this.barrelOffset.z); // forward is -Z in camera space
    return pos;
  }

  getBarrelDirection() {
    return this.camera.getWorldDirection(new THREE.Vector3());
  }

  shoot() {
    if (this.isReloading || this.ammo <= 0) {
      if (this.ammo <= 0 && !this.isReloading) this.startReload();
      return;
    }

    this.ammo--;
    this.ui.updateAmmo(this.ammo, this.maxAmmo);

    // Raycast from camera center (for accurate aiming)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersects = this.raycaster.intersectObjects(this.scene.children, true);

    let hitTarget = null;
    let hitPoint = null;

    for (const intersect of intersects) {
      if (intersect.object.userData.isTarget) {
        hitTarget = intersect.object;
        hitPoint = intersect.point.clone();
        break;
      }
      if (!intersect.object.userData.isTarget && intersect.object !== this.camera) {
        hitPoint = intersect.point.clone();
        break;
      }
    }

    // Barrel position & direction
    const barrelPos = this.getBarrelPosition();
    const barrelDir = this.getBarrelDirection();
    const maxRange = 100;
    const endPoint = hitPoint || barrelPos.clone().addScaledVector(barrelDir, maxRange);

    // Visual effects at barrel
    this.createMuzzleFlash(barrelPos);
    this.createBulletTracer(barrelPos, endPoint);

    // Hit spark at impact point
    if (hitPoint) {
      this.createHitSpark(hitPoint);
    }

    // Notify target hit
    if (hitTarget) {
      this.ui.registerHit();
      hitTarget.userData.onHit?.();
    }
  }

  createMuzzleFlash(position) {
    if (this.activeFlash) {
      this.scene.remove(this.activeFlash);
      this.activeFlash.material.dispose();
    }

    // Create a fresh material clone for each flash so we can animate its rotation
    const flashMaterial = this.flashMaterial.clone();
    flashMaterial.rotation = Math.random() * Math.PI * 2;

    const flash = new THREE.Sprite(flashMaterial);
    flash.scale.set(0.4, 0.4, 0.4);
    flash.position.copy(position);

    this.scene.add(flash);
    this.activeFlash = flash;

    let opacity = 1;
    let rotation = flashMaterial.rotation;
    const fadeFlash = () => {
      opacity -= 0.2;
      rotation += 0.3;
      if (opacity <= 0) {
        this.scene.remove(flash);
        flash.material.dispose();
        if (this.activeFlash === flash) this.activeFlash = null;
        return;
      }
      flash.material.opacity = opacity;
      flash.material.rotation = rotation;
      flash.scale.multiplyScalar(1.3);
      requestAnimationFrame(fadeFlash);
    };
    requestAnimationFrame(fadeFlash);
  }

  createBulletTracer(start, end) {
    const distance = start.distanceTo(end);
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const tracer = new THREE.Mesh(this.tracerGeometry, this.tracerMaterial.clone());
    tracer.position.copy(midPoint);
    tracer.scale.set(1, 1, distance);
    tracer.lookAt(end);
    tracer.rotateX(Math.PI / 2); // Align cylinder to point at target

    this.scene.add(tracer);
    this.activeTracers.push({ tracer, age: 0, maxAge: 90 }); // 90ms lifetime
  }

  createHitSpark(position) {
    // Fresh material clone for rotation animation
    const sparkMaterial = this.sparkMaterial.clone();
    sparkMaterial.rotation = Math.random() * Math.PI * 2;

    const spark = new THREE.Sprite(sparkMaterial);
    spark.scale.set(0.3, 0.3, 0.3);
    spark.position.copy(position);

    this.scene.add(spark);
    this.activeSparks.push({ sprite: spark, material: sparkMaterial });

    let opacity = 1;
    let scale = 0.3;
    let rotation = sparkMaterial.rotation;
    const fadeSpark = () => {
      opacity -= 0.12;
      scale += 0.15;
      rotation += 0.5;
      if (opacity <= 0) {
        this.scene.remove(spark);
        spark.material.dispose();
        return;
      }
      spark.material.opacity = opacity;
      spark.material.rotation = rotation;
      spark.scale.set(scale, scale, scale);
      requestAnimationFrame(fadeSpark);
    };
    requestAnimationFrame(fadeSpark);
  }

  // Create tracer for other players' shots (with custom color)
  createNetworkTracer(start, end, color) {
    const distance = start.distanceTo(end);
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      toneMapped: false
    });

    const tracer = new THREE.Mesh(this.tracerGeometry, material);
    tracer.position.copy(midPoint);
    tracer.scale.set(1, 1, distance);
    tracer.lookAt(end);
    tracer.rotateX(Math.PI / 2);

    this.scene.add(tracer);
    this.activeTracers.push({ tracer, age: 0, maxAge: 90 });
  }

  startReload() {
    this.isReloading = true;
    this.ui.setReloading(true);
    this.reloadTimer = this.reloadTime;
  }

  update(delta) {
    const deltaMs = delta * 1000;

    if (this.isReloading) {
      this.reloadTimer -= deltaMs;
      this.ui.updateReloadProgress(1 - this.reloadTimer / this.reloadTime);

      if (this.reloadTimer <= 0) {
        this.ammo = this.maxAmmo;
        this.isReloading = false;
        this.ui.updateAmmo(this.ammo, this.maxAmmo);
        this.ui.setReloading(false);
      }
    }

    // Update bullet tracers (fade out over ~90ms)
    for (let i = this.activeTracers.length - 1; i >= 0; i--) {
      const t = this.activeTracers[i];
      t.age += deltaMs;
      const progress = t.age / t.maxAge;

      if (progress >= 1) {
        this.scene.remove(t.tracer);
        t.tracer.geometry.dispose();
        t.tracer.material.dispose();
        this.activeTracers.splice(i, 1);
      } else {
        t.tracer.material.opacity = 1 * (1 - progress);
        // Optional: shrink slightly as it fades
        t.tracer.scale.setScalar(1 - progress * 0.3);
      }
    }
  }

  getAmmo() { return this.ammo; }
  getMaxAmmo() { return this.maxAmmo; }
  isReloadingState() { return this.isReloading; }
}