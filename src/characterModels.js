import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER_HEIGHT } from './constants.js';

export const CHARACTER_FILES = { male: 'character-b', female: 'character-n' };

const MODEL_HEIGHT = 2.7;
const loader = new GLTFLoader();
const cache = new Map();

export async function loadCharacter(key) {
  if (!CHARACTER_FILES[key]) {
    key = 'male';
  }
  const file = CHARACTER_FILES[key];
  if (!cache.has(file)) {
    const promise = loader
      .loadAsync('/characters/' + file + '.glb')
      .catch((err) => {
        console.warn('[CHARACTER] failed to load', key, err);
        return null;
      });
    cache.set(file, promise);
  }
  const gltf = await cache.get(file);
  if (!gltf) {
    return null;
  }
  const model = new THREE.Group();
  const inner = gltf.scene.clone(true);
  model.add(inner);
  model.scale.setScalar(PLAYER_HEIGHT / MODEL_HEIGHT);
  inner.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.userData.sharedAsset = true;
    }
  });
  return { model, animations: gltf.animations };
}

export async function loadGun() {
  if (!cache.has('gun')) {
    const promise = loader
      .loadAsync('/guns/blaster-d.glb')
      .catch((err) => {
        console.warn('[GUN] failed to load', err);
        return null;
      });
    cache.set('gun', promise);
  }
  const gltf = await cache.get('gun');
  if (!gltf) {
    return null;
  }
  const g = new THREE.Group();
  g.add(gltf.scene.clone(true));
  g.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.userData.sharedAsset = true;
    }
  });
  return g;
}