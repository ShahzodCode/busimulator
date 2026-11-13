import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { C, mat } from './palette';

/**
 * City props modelled in Blender (art/build_props.py → public/models/props.glb).
 * Each top-level node is one asset ("BusStop", "Tree_chinor", ...).
 */
const templates = new Map<string, THREE.Object3D>();

export async function loadProps(url: string): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(url);
  for (const root of [...gltf.scene.children]) {
    root.position.set(0, 0, 0); // assets sit side by side in the .blend
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // share the city's cached matte materials, so the baked city merges them into one draw call each
      const src = m.material as THREE.MeshStandardMaterial;
      const named = (C as Record<string, number>)[src.name];
      m.material = mat(named ?? src.color.getHex());
      src.dispose();
      m.castShadow = true;
      m.receiveShadow = true;
    });
    templates.set(root.name, root);
  }
}

/** A fresh copy of a prop (geometry is shared with the template). */
export function prop(name: string): THREE.Group {
  const t = templates.get(name);
  if (!t) throw new Error(`props.glb is missing "${name}"`);
  const g = new THREE.Group();
  g.add(t.clone(true));
  return g;
}

export type TreeKind =
  | 'chinor'
  | 'terak'
  | 'sarv'
  | 'qayragoch'
  | 'tut'
  | 'archa'
  | 'majnuntol'
  | 'orik'
  | 'akatsiya'
  | 'olcha'
  | 'buta';

/** Crown radius of each species at scale 1, for spacing. */
export const TREE_R: Record<TreeKind, number> = {
  chinor: 1.5,
  terak: 0.75,
  sarv: 0.6,
  qayragoch: 1.6,
  tut: 1.3,
  archa: 1.1,
  majnuntol: 1.45,
  orik: 1.1,
  akatsiya: 1.3,
  olcha: 1.0,
  buta: 0.95,
};

export function tree(kind: TreeKind, scale = 1): THREE.Group {
  const g = prop(`Tree_${kind}`);
  g.scale.setScalar(scale);
  return g;
}
