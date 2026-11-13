import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Bake every static mesh under `root` into one mesh per material (world space).
 * Turns hundreds of draw calls into a few dozen — essential on phones.
 * Sprites, instanced meshes and anything with userData.dynamic are left alone.
 */
export function freezeStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Mesh[] = [];

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return;
    let p: THREE.Object3D | null = m;
    while (p) {
      if (p.userData.dynamic) return;
      p = p.parent;
    }
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const entry = byMat.get(m.material) ?? { geos: [], cast: false };
    entry.geos.push(g);
    entry.cast ||= m.castShadow;
    byMat.set(m.material, entry);
    remove.push(m);
  });

  for (const m of remove) m.removeFromParent();
  for (const [material, { geos, cast }] of byMat) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  // drop now-empty groups
  const empties: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o !== root && o.type === 'Group' && o.children.length === 0) empties.push(o);
  });
  empties.forEach((o) => o.removeFromParent());
}
