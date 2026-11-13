import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import gsap from 'gsap';
import { BusSim } from '../sim/bus';
import { Route } from '../sim/route';
import { LANE_OFFSET } from './city';

const WHEEL_RADIUS = 0.42;
let template: THREE.Object3D | null = null;

export async function loadBusModel(url: string): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(url);
  template = gltf.scene;
  template.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of mats) {
        const sm = mm as THREE.MeshStandardMaterial;
        sm.roughness = Math.max(sm.roughness, 0.55);
        sm.metalness = 0;
      }
    }
  });
}

/** recoloured copies of the body paint, one set per line colour (shared by that line's buses) */
const paints = new Map<string, Map<THREE.Material, THREE.Material>>();

/** Repaint a bus in its line's colour: the body takes the colour, the stripe and sign a lighter shade. */
function repaint(model: THREE.Object3D, color: string): void {
  let set = paints.get(color);
  if (!set) paints.set(color, (set = new Map()));
  const body = new THREE.Color(color);
  const light = body.clone().lerp(new THREE.Color(0xffffff), 0.35);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const swap = (mm: THREE.Material): THREE.Material => {
      const tone = mm.name === 'Bus_Body' ? body : mm.name === 'Bus_Stripe' || mm.name === 'Bus_Sign' ? light : null;
      if (!tone) return mm;
      let copy = set.get(mm);
      if (!copy) {
        copy = mm.clone();
        (copy as THREE.MeshStandardMaterial).color.copy(tone);
        set.set(mm, copy);
      }
      return copy;
    };
    m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
  });
}

function find(root: THREE.Object3D, prefix: string): THREE.Object3D {
  let hit: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!hit && o.name.startsWith(prefix)) hit = o;
  });
  if (!hit) throw new Error(`bus model is missing "${prefix}"`);
  return hit;
}

/** Renders one BusSim: placement on the lane, spinning wheels, body lean, door and squash. */
export class BusView {
  readonly root = new THREE.Group();
  /** body pivot, leans independently of the wheels */
  private readonly chassis = new THREE.Group();
  private readonly wheels: THREE.Object3D[] = [];
  private readonly door: THREE.Object3D;
  private readonly doorClosed: THREE.Vector3;
  private pitch = 0;
  private roll = 0;
  private heading = 0;

  /** @param paint line colour to repaint the body in (the model's own orange when omitted) */
  constructor(
    readonly sim: BusSim,
    paint?: string,
  ) {
    if (!template) throw new Error('loadBusModel() first');
    const model = template.clone(true);
    if (paint) repaint(model, paint);
    const pivotY = 0.6;
    this.chassis.position.y = pivotY;
    this.root.add(this.chassis);

    const parts = [...find(model, 'Bus').children];
    for (const p of parts) {
      if (p.name.startsWith('Wheel')) {
        this.root.add(p);
        this.wheels.push(p);
      } else {
        p.position.y -= pivotY;
        this.chassis.add(p);
      }
    }
    this.door = find(this.chassis, 'Door');
    this.doorClosed = this.door.position.clone();
    this.place(true);
  }

  private place(snap = false): void {
    const s = this.sim.route.sample(this.sim.d);
    const p = Route.right(s, LANE_OFFSET);
    this.root.position.set(p.x, 0, p.z);
    const target = Math.atan2(-s.tz, s.tx);
    if (snap) this.heading = target;
    let dh = target - this.heading;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    this.heading += dh * (snap ? 1 : 0.35);
    this.root.rotation.y = this.heading;
  }

  update(dt: number): void {
    this.place();
    const v = this.sim.v;
    for (const w of this.wheels) w.rotation.z -= (v * dt) / WHEEL_RADIUS;

    // lean: nose dips when braking, squats when accelerating; rolls outward in turns
    const k = this.sim.route.curvatureAt(this.sim.d);
    const targetPitch = THREE.MathUtils.clamp(this.sim.a * 0.012, -0.06, 0.05);
    const targetRoll = THREE.MathUtils.clamp(-v * v * k * 0.03, -0.07, 0.07);
    const f = 1 - Math.exp(-dt * 6);
    this.pitch += (targetPitch - this.pitch) * f;
    this.roll += (targetRoll - this.roll) * f;
    this.chassis.rotation.set(this.roll, 0, this.pitch);
  }

  private readonly tmp = new THREE.Vector3();

  /** Point on the sidewalk just outside the door (read immediately; the vector is reused). */
  doorWorld(): THREE.Vector3 {
    return this.root.localToWorld(this.tmp.set(this.doorClosed.x, 0, this.doorClosed.z + 0.5));
  }

  /** New bus: drops in from the sky and bounces. */
  appear(): void {
    this.chassis.position.y += 7;
    this.root.scale.setScalar(0.3);
    gsap.to(this.chassis.position, { y: '-=7', duration: 0.55, ease: 'bounce.out' });
    gsap.to(this.root.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: 'elastic.out(1, 0.45)' });
  }

  /** Sold bus: a little hop, then shrinks away. */
  leave(): Promise<void> {
    return new Promise((resolve) => {
      gsap.timeline({ onComplete: resolve })
        .to(this.root.scale, { x: 1.15, y: 1.15, z: 1.15, duration: 0.15, ease: 'power2.out' })
        .to(this.root.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'back.in(2)' });
    });
  }

  arrive(): void {
    gsap.timeline()
      .to(this.chassis.scale, { x: 1.04, y: 0.93, z: 1.04, duration: 0.12, ease: 'power2.out' })
      .to(this.chassis.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.4)' });
    gsap.timeline({ delay: 0.15 })
      .to(this.door.position, { z: this.doorClosed.z + 0.08, duration: 0.12 })
      .to(this.door.position, { x: this.doorClosed.x - 0.75, duration: 0.3, ease: 'power2.out' });
  }

  depart(): void {
    gsap.timeline()
      .to(this.door.position, { x: this.doorClosed.x, duration: 0.25, ease: 'power2.in' })
      .to(this.door.position, { z: this.doorClosed.z, duration: 0.1 });
  }
}
