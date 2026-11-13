import * as THREE from 'three';

/** Shared colour palette, tuned to match the bus model's soft pastel look. */
export const C = {
  grass: 0x9ad86a,
  grassDark: 0x7cc456,
  slabSide: 0xd9b98a,
  slabBottom: 0xb8956a,
  sidewalk: 0xf3e6c9,
  curb: 0xe2cfa6,
  road: 0x646a7d,
  roadLine: 0xfafafa,
  cream: 0xf7ead2,
  peach: 0xffd3b0,
  sky: 0xbfe6f6,
  mint: 0xbfe8d6,
  terracotta: 0xe9805c,
  turquoise: 0x35c2d4,
  turquoiseDeep: 0x1f9fb8,
  gold: 0xffc94d,
  wood: 0xb57c4e,
  trunk: 0x8c5b3a,
  leaf: 0x5cbf4b,
  leafLight: 0x7fd65a,
  poplar: 0x63b84a,
  window: 0x7fd0ee,
  windowFrame: 0xffffff,
  stopRoof: 0x3a8fe0,
  metroBlue: 0x2f6fd6,
  red: 0xe85d5d,
  water: 0x6fd3ea,
};

const cache = new Map<number, THREE.MeshStandardMaterial>();

/** Matte material, cached per colour so the whole city shares a handful of materials. */
export function mat(color: number): THREE.MeshStandardMaterial {
  let m = cache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
    cache.set(color, m);
  }
  return m;
}
