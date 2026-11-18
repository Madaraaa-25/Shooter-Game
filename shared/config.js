export const ARENA_HALF_SIZE = 52;
export const CRATE_SIZE = 2.4;
export const CRATE_HEIGHT = 1.2;
export const LAYOUT_SEED = 12345;

const BASE_SPAWN_POINTS = [{x:-15,z:-15},{x:15,z:-15},{x:-15,z:15},{x:15,z:15},{x:0,z:-20},{x:0,z:20},{x:-20,z:0},{x:20,z:0},{x:-10,z:5},{x:10,z:-5}];
export const SPAWN_POINTS = BASE_SPAWN_POINTS.map(p => ({ x: p.x * (ARENA_HALF_SIZE / 30), z: p.z * (ARENA_HALF_SIZE / 30) }));