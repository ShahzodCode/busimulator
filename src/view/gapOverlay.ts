import * as THREE from 'three';
import { Route } from '../sim/route';
import { BusGap, GapLevel, World } from '../sim/world';
import { t } from '../i18n';
import { Floaters } from '../ui/floaters';

/** shared by the road overlay, its labels and the line strip in the menu */
export const GAP_COLOR: Record<GapLevel, string> = { good: '#35c46a', ok: '#ffc02e', bad: '#f0483e' };

const STEP = 1.5;
const HALF_WIDTH = 1.15;

/**
 * Paints the road between every two buses by how long that gap is: green when the next bus
 * is close, yellow in between, red when riders there may give up and take a taxi.
 * A label in the middle of each gap says how many minutes it is. Off until the player turns it on.
 */
export class GapOverlay {
  readonly mesh: THREE.Mesh;
  private readonly colors: THREE.BufferAttribute;
  private readonly n: number;
  private readonly rgb: Record<GapLevel, THREE.Color>;
  private readonly tags = new Map<number, HTMLElement>();
  private on = false;
  private latest: BusGap[] = [];

  constructor(
    private readonly world: World,
    private readonly floaters: Floaters,
    /** the line whose road this overlay paints */
    private readonly line: number,
  ) {
    const route = world.lines[line].route;
    this.n = Math.ceil(route.length / STEP);
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= this.n; i++) {
      const s = route.sample((i / this.n) * route.length);
      const a = Route.right(s, -HALF_WIDTH);
      const b = Route.right(s, HALF_WIDTH);
      pos.push(a.x, 0.1, a.z, b.x, 0.1, b.z);
      if (i < this.n) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.colors = new THREE.BufferAttribute(new Float32Array((this.n + 1) * 6), 3);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('color', this.colors);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    this.rgb = {
      good: new THREE.Color(GAP_COLOR.good),
      ok: new THREE.Color(GAP_COLOR.ok),
      bad: new THREE.Color(GAP_COLOR.bad),
    };
  }

  get enabled(): boolean {
    return this.on;
  }

  set(on: boolean): void {
    this.on = on;
    if (on) this.mesh.visible = true;
    else this.clearTags();
  }

  private clearTags(): void {
    for (const el of this.tags.values()) this.floaters.untag(el);
    this.tags.clear();
  }

  update(dt: number): void {
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    const on = this.on && this.world.lines[this.line].open;
    if (on) this.mesh.visible = true;
    // fade in and out rather than popping
    mat.opacity += ((on ? 0.92 : 0) - mat.opacity) * (1 - Math.exp(-dt * 10));
    if (!on) {
      if (mat.opacity < 0.02) this.mesh.visible = false;
      return;
    }
    const gaps = (this.latest = this.world.gaps(this.line));
    const L = this.world.lines[this.line].route.length;

    // colour every slice of road by the gap it lies in
    const levelAt: GapLevel[] = new Array(this.n + 1);
    for (const g of gaps) {
      const from = Math.ceil((g.d / L) * this.n);
      const count = Math.ceil((g.dist / L) * this.n);
      for (let k = 0; k <= count; k++) levelAt[(from + k) % this.n] = g.level;
    }
    levelAt[this.n] = levelAt[0];
    const arr = this.colors.array as Float32Array;
    for (let i = 0; i <= this.n; i++) {
      const c = this.rgb[levelAt[i] ?? 'bad'];
      arr.set([c.r, c.g, c.b, c.r, c.g, c.b], i * 6);
    }
    this.colors.needsUpdate = true;

    this.label(gaps);
  }

  /** one label per gap, sitting on the road halfway between the two buses */
  private label(gaps: BusGap[]): void {
    const seen = new Set<number>();
    for (const g of gaps) {
      seen.add(g.bus.id);
      let el = this.tags.get(g.bus.id);
      if (!el) {
        const id = g.bus.id;
        el = this.floaters.tag('gap', () => {
          const now = this.latest.find((x) => x.bus.id === id);
          const s = this.world.lines[this.line].route.sample(now ? now.d + now.dist / 2 : 0);
          return new THREE.Vector3(s.x, 0.6, s.z);
        });
        this.tags.set(id, el);
      }
      const text = t('gaps.tag', { m: Math.max(1, Math.round(g.minutes)) });
      if (el.textContent !== text) el.textContent = text;
      const cls = `tag gap ${g.level}`;
      if (el.className !== cls) el.className = cls;
      // two buses nose to tail: no room for a label, and nothing worth saying
      el.style.visibility = g.dist < 14 ? 'hidden' : '';
    }
    for (const [id, el] of this.tags) {
      if (seen.has(id)) continue;
      this.floaters.untag(el);
      this.tags.delete(id);
    }
  }
}
