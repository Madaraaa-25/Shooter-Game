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