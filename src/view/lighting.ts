import * as THREE from 'three';

interface Key {
  h: number;
  sky: number;
  sun: number;
  sunI: number;
  hemiI: number;
}

// colour keys through the day: soft dawn, bright noon, golden evening, blue dusk
const KEYS: Key[] = [
  { h: 5, sky: 0x9fb8e8, sun: 0xffb98a, sunI: 0.8, hemiI: 1.2 },
  { h: 8, sky: 0xbfe6f6, sun: 0xfff1d6, sunI: 2.4, hemiI: 1.6 },
  { h: 13, sky: 0xc4ecfa, sun: 0xffffff, sunI: 2.7, hemiI: 1.7 },
  { h: 17.5, sky: 0xffd6b0, sun: 0xffc78a, sunI: 2.2, hemiI: 1.5 },
  { h: 20, sky: 0xc9a6d9, sun: 0xff9a7a, sunI: 1.2, hemiI: 1.3 },
  { h: 23, sky: 0x6f7fc4, sun: 0xa6b8ff, sunI: 0.6, hemiI: 1.0 },
];

export class DayLighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private readonly sky = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xb7d59a, 1.6);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -45;
    c.right = 45;
    c.top = 45;
    c.bottom = -45;
    c.near = 1;
    c.far = 520;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.background = this.sky;
  }

  /**
   * @param focus point the camera looks at — the shadow map follows it
   * @param reach how much ground around the focus needs shadows (world units)
   */
  update(hour: number, focus?: THREE.Vector3, reach = 45): void {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h < hour) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hour - a.h) / (b.h - a.h), 0, 1);
    const tmp = new THREE.Color();
    this.sky.set(a.sky).lerp(tmp.set(b.sky), t);
    this.sun.color.set(a.sun).lerp(tmp.set(b.sun), t);
    this.sun.intensity = THREE.MathUtils.lerp(a.sunI, b.sunI, t);
    this.hemi.intensity = THREE.MathUtils.lerp(a.hemiI, b.hemiI, t);
    this.hemi.color.copy(this.sky).lerp(tmp.set(0xffffff), 0.6);

    // sun sweeps east -> west, staying fairly high so shadows stay short and readable
    const ang = THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(hour, 6, 21), 6, 21, -1, 1);
    // snap to a coarse grid so shadow edges don't crawl while panning
    const fx = focus ? Math.round(focus.x / 4) * 4 : 0;
    const fz = focus ? Math.round(focus.z / 4) * 4 : 0;
    const half = Math.round(THREE.MathUtils.clamp(reach, 45, 150) / 15) * 15;
    const c = this.sun.shadow.camera;
    if (c.right !== half) {
      c.left = -half;
      c.right = half;
      c.top = half;
      c.bottom = -half;
      c.updateProjectionMatrix();
    }
    this.sun.position.set(fx + ang * 90, 140 - Math.abs(ang) * 36, fz + 70);
    this.sun.target.position.set(fx, 0, fz);
  }
}
