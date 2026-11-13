import * as THREE from 'three';
import { Route } from '../sim/route';
import { Mood, Passenger, World } from '../sim/world';
import { Persona } from '../sim/passengers';
import { ROAD_HALF } from './city';
import { BusView } from './busView';

const MAX = 1500;
const SHIRTS = [0xff7a6b, 0x5ab4ff, 0xffc94d, 0x8a5cf6, 0x4ccf9a, 0xff9ad5, 0xf2f2f2, 0x6b7cff, 0xffa64d];
/** how each kind of passenger looks: size, walking pace and (optionally) their own clothes */
const LOOK: Record<Persona, { scale: number; pace: number; shirts?: number[] }> = {
  worker: { scale: 1, pace: 1.1 },
  student: { scale: 0.96, pace: 1 },
  pupil: { scale: 0.72, pace: 1.15, shirts: [0xffffff, 0xf4f6ff, 0xffffff, 0x3d5a9e] }, // school uniform
  shopper: { scale: 1, pace: 0.9 },
  elder: { scale: 0.9, pace: 0.6, shirts: [0xc9b79c, 0xa9a9b8, 0xd8c7a8, 0x8e9aa6, 0xb7a58e] },
  visitor: { scale: 1.05, pace: 0.85, shirts: [0xff5fa2, 0x2fd0c8, 0xffb300, 0x9b6bff] },
};
const SKIN = [0xffd9b8, 0xf1c094, 0xd9a273, 0xb87c52];
const MOOD_COLOR: Record<Mood | 'gone', number> = { happy: 0x5cd65c, ok: 0xffc23d, angry: 0xff4d4d, gone: 0xff4d4d };

function look(p: Passenger): { shirt: THREE.Color; skin: THREE.Color; size: number; pace: number } {
  const l = LOOK[p.persona];
  const shirts = l.shirts ?? SHIRTS;
  return {
    shirt: new THREE.Color(shirts[p.id % shirts.length]),
    skin: new THREE.Color(SKIN[(p.id * 7) % SKIN.length]),
    size: l.scale,
    pace: l.pace,
  };
}

type Phase = 'queue' | 'boarding' | 'alighting' | 'leaving';

interface Walker {
  id: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  phase: Phase;
  mood: Mood | 'gone';
  scale: number;
  /** full-grown size and walking pace for this kind of passenger */
  size: number;
  pace: number;
  life: number;
  bob: number;
  shirt: THREE.Color;
  skin: THREE.Color;
  bus?: BusView;
  heading: number;
}

/**
 * Draws every passenger as a chunky little capsule person with a mood dot,
 * using three instanced meshes (3 draw calls for the whole crowd).
 */
export class PeopleView {
  readonly group = new THREE.Group();
  private readonly body: THREE.InstancedMesh;
  private readonly head: THREE.InstancedMesh;
  private readonly dot: THREE.InstancedMesh;
  private readonly walkers = new Map<number, Walker>();
  private readonly o = new THREE.Object3D();
  private readonly c = new THREE.Color();
  private time = 0;

  constructor(
    private readonly world: World,
    private readonly busViews: Map<number, BusView>,
  ) {
    const m = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    this.body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.24, 0.32, 4, 10), m(0xffffff), MAX);
    this.head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.21, 12, 10), m(0xffffff), MAX);
    this.dot = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX);
    for (const im of [this.body, this.head, this.dot]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
    }
    this.body.castShadow = true;
    this.head.castShadow = true;
    // prime instance colours
    this.body.setColorAt(0, this.c.set(0xffffff));
    this.head.setColorAt(0, this.c);
    this.dot.setColorAt(0, this.c);
  }

  // ---------- event hooks (called by main from world events) ----------

  spawn(p: Passenger, stop: number): void {
    const slot = this.slot(stop, this.world.stops[stop].queue.length - 1);
    // walk in from further out on the sidewalk
    const s = this.world.stops[stop].route.sample(this.world.stops[stop].d);
    const from = Route.right(s, this.world.stops[stop].terminal ? ROAD_HALF + 3.8 : ROAD_HALF + 7);
    this.walkers.set(p.id, {
      id: p.id,
      x: from.x + (Math.random() - 0.5) * 4,
      z: from.z + (Math.random() - 0.5) * 4,
      tx: slot.x,
      tz: slot.z,
      phase: 'queue',
      mood: 'happy',
      scale: 0,
      life: 0,
      bob: Math.random() * 10,
      ...look(p),
      heading: 0,
    });
  }

  board(p: Passenger, busId: number): void {
    const w = this.walkers.get(p.id);
    if (!w) return;
    w.phase = 'boarding';
    w.bus = this.busViews.get(busId);
    w.life = 0;
  }

  alight(p: Passenger, busId: number, stop: number): void {
    const bus = this.busViews.get(busId);
    if (!bus) return;
    const door = bus.doorWorld();
    const st = this.world.stops[stop];
    const s = st.route.sample(st.d + (Math.random() - 0.3) * 6);
    // at the terminal they head into the waiting hall in the middle of the island, not across the other bay
    const away = Route.right(s, st.terminal ? ROAD_HALF + 3.4 + Math.random() * 0.6 : ROAD_HALF + 9 + Math.random() * 3);
    this.walkers.set(p.id, {
      id: p.id,
      x: door.x,
      z: door.z,
      tx: away.x,
      tz: away.z,
      phase: 'alighting',
      mood: 'happy',
      scale: 0.6,
      life: 0,
      bob: Math.random() * 10,
      ...look(p),
      heading: 0,
    });
  }

  giveUp(p: Passenger, stop: number): void {
    const w = this.walkers.get(p.id);
    if (!w) return;
    const st = this.world.stops[stop];
    const s = st.route.sample(st.d - 6 - Math.random() * 6);
    const away = Route.right(s, st.terminal ? ROAD_HALF + 3.6 : ROAD_HALF + 10);
    w.phase = 'leaving';
    w.mood = 'gone';
    w.tx = away.x;
    w.tz = away.z;
    w.life = 0;
  }

  /** World point just above a passenger's head, or null if they're gone. */
  headOf(id: number): THREE.Vector3 | null {
    const w = this.walkers.get(id);
    return w ? new THREE.Vector3(w.x, 1.9 * Math.max(0.3, w.scale * w.size), w.z) : null;
  }

  /** End of day: everyone still waiting walks home. */
  sendHome(): void {
    for (const w of this.walkers.values()) {
      if (w.phase !== 'queue') continue;
      w.phase = 'leaving';
      w.mood = 'ok';
      w.life = 0;
      const a = Math.atan2(w.z, w.x);
      w.tx = w.x + Math.cos(a) * 8;
      w.tz = w.z + Math.sin(a) * 8;
    }
  }

  /** Queue slot k at a stop: rows of 3 lined up behind the shelter along the sidewalk. */
  slot(stop: number, k: number): { x: number; z: number } {
    const s = this.world.stops[stop].route.sample(this.world.stops[stop].d - 2.9 - Math.floor(k / 3) * 0.62);
    return Route.right(s, ROAD_HALF + 0.9 + (k % 3) * 0.62);
  }

  /** world position of a queue's front, for floating labels */
  stopFront(stop: number): THREE.Vector3 {
    const p = this.slot(stop, 0);
    return new THREE.Vector3(p.x, 2.2, p.z);
  }

  update(realDt: number, speed: number): void {
    this.time += realDt;
    const dt = realDt * Math.max(1, speed);

    // queue targets + moods come straight from the sim
    this.world.stops.forEach((s, si) => {
      s.queue.forEach((p, k) => {
        const w = this.walkers.get(p.id);
        if (!w || w.phase !== 'queue') return;
        const t = this.slot(si, k);
        w.tx = t.x;
        w.tz = t.z;
        w.mood = this.world.moodOf(p);
      });
    });

    let n = 0;
    for (const w of this.walkers.values()) {
      w.life += dt;
      if (w.phase === 'boarding' && w.bus) {
        const door = w.bus.doorWorld();
        w.tx = door.x;
        w.tz = door.z;
      }
      const dx = w.tx - w.x;
      const dz = w.tz - w.z;
      const dist = Math.hypot(dx, dz);
      const walkSpeed = w.phase === 'boarding' ? 6 : (w.phase === 'queue' ? 3.2 : 2.4) * w.pace;
      const step = Math.min(dist, walkSpeed * dt);
      const moving = dist > 0.05;
      if (moving) {
        w.x += (dx / dist) * step;
        w.z += (dz / dist) * step;
        w.heading = Math.atan2(dx, dz);
      }

      // scale: pop in, shrink out
      let target = 1;
      if (w.phase === 'boarding' && (dist < 0.35 || w.life > 1.6)) target = 0;
      if ((w.phase === 'alighting' || w.phase === 'leaving') && (dist < 0.3 || w.life > 6)) target = 0;
      w.scale += (target - w.scale) * (1 - Math.exp(-dt * (target ? 10 : 14)));
      if (target === 0 && w.scale < 0.04) {
        this.walkers.delete(w.id);
        continue;
      }
      if (n >= MAX) continue;

      // hop while walking; angry people stomp in place
      const hopRate = moving ? 14 : w.mood === 'angry' || w.mood === 'gone' ? 9 : 0;
      const hop = hopRate ? Math.abs(Math.sin(this.time * hopRate + w.bob)) * (moving ? 0.16 : 0.07) : 0;
      const breathe = 1 + Math.sin(this.time * 2.2 + w.bob) * 0.03;
      const s = w.scale * w.size;

      this.o.position.set(w.x, (0.4 + hop) * s, w.z);
      this.o.rotation.set(0, w.heading, 0);
      this.o.scale.set(s, s * breathe, s);
      this.o.updateMatrix();
      this.body.setMatrixAt(n, this.o.matrix);
      this.body.setColorAt(n, w.shirt);

      this.o.position.y = (0.98 + hop) * s;
      this.o.scale.setScalar(s);
      this.o.updateMatrix();
      this.head.setMatrixAt(n, this.o.matrix);
      this.head.setColorAt(n, w.skin);

      this.o.position.y = (1.55 + hop + Math.sin(this.time * 4 + w.bob) * 0.04) * s;
      this.o.scale.setScalar(w.phase === 'queue' || w.phase === 'leaving' ? s : 0.001);
      this.o.updateMatrix();
      this.dot.setMatrixAt(n, this.o.matrix);
      this.dot.setColorAt(n, this.c.set(MOOD_COLOR[w.mood]));
      n++;
    }
    for (const im of [this.body, this.head, this.dot]) {
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
}
