import * as THREE from 'three';

interface Floater {
  el: HTMLElement;
  pos: THREE.Vector3;
  age: number;
  life: number;
}

interface Tag {
  el: HTMLElement;
  get: () => THREE.Vector3;
}

/** DOM labels pinned to 3D points: short-lived pop-ups ("+2 500") and persistent tags (bus load). */
export class Floaters {
  private readonly layer: HTMLElement;
  private readonly live: Floater[] = [];
  private readonly tags: Tag[] = [];
  private readonly v = new THREE.Vector3();

  constructor(
    parent: HTMLElement,
    private readonly camera: THREE.Camera,
  ) {
    this.layer = document.createElement('div');
    this.layer.className = 'floaters';
    parent.appendChild(this.layer);
  }

  pop(pos: THREE.Vector3, html: string, cls = '', life = 1.3): void {
    if (this.live.length > 40) return; // keep rush hour readable
    const el = document.createElement('div');
    el.className = `floater ${cls}`;
    el.innerHTML = html;
    this.layer.appendChild(el);
    this.live.push({ el, pos: pos.clone(), age: 0, life });
  }

  tag(cls: string, get: () => THREE.Vector3): HTMLElement {
    const el = document.createElement('div');
    el.className = `tag ${cls}`;
    this.layer.appendChild(el);
    this.tags.push({ el, get });
    return el;
  }

  /** Speech bubble that follows a moving point (keeps the last known spot if it disappears). */
  bubble(get: () => THREE.Vector3 | null, text: string, cls = '', life = 2.6): void {
    const el = document.createElement('div');
    el.className = `bubble ${cls}`;
    el.textContent = text;
    this.layer.appendChild(el);
    let lastPos = get() ?? new THREE.Vector3();
    this.bubbles.push({
      el,
      age: 0,
      life,
      get: () => {
        const p = get();
        if (p) lastPos = p;
        return lastPos;
      },
    });
  }

  get bubbleCount(): number {
    return this.bubbles.length;
  }

  private readonly bubbles: { el: HTMLElement; age: number; life: number; get: () => THREE.Vector3 }[] = [];

  untag(el: HTMLElement): void {
    const i = this.tags.findIndex((tg) => tg.el === el);
    if (i >= 0) this.tags.splice(i, 1);
    el.remove();
  }

  private project(p: THREE.Vector3): { x: number; y: number; ok: boolean } {
    this.v.copy(p).project(this.camera);
    return {
      x: (this.v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.v.y * 0.5 + 0.5) * window.innerHeight,
      ok: this.v.z < 1,
    };
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      f.age += dt;
      const t = f.age / f.life;
      if (t >= 1) {
        f.el.remove();
        this.live.splice(i, 1);
        continue;
      }
      const p = this.project(f.pos);
      const rise = 46 * (1 - (1 - t) ** 3);
      const scale = t < 0.15 ? 0.5 + (t / 0.15) * 0.7 : t < 0.3 ? 1.2 - ((t - 0.15) / 0.15) * 0.2 : 1;
      f.el.style.transform = `translate(${p.x}px, ${p.y - rise}px) translate(-50%, -50%) scale(${scale})`;
      f.el.style.opacity = String(t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
    }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.age += dt;
      if (b.age >= b.life) {
        b.el.remove();
        this.bubbles.splice(i, 1);
      }
    }
    // place oldest first; a newer bubble that would overlap gets stacked above
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const b of this.bubbles) {
      const p = this.project(b.get());
      const w = b.el.offsetWidth;
      const h = b.el.offsetHeight;
      let y = p.y;
      for (let guard = 0; guard < 4; guard++) {
        const hit = placed.find((o) => Math.abs(o.x - p.x) < (o.w + w) / 2 + 4 && Math.abs(o.y - y) < (o.h + h) / 2 + 4);
        if (!hit) break;
        y = hit.y - (hit.h + h) / 2 - 6;
      }
      placed.push({ x: p.x, y, w, h });
      const fade = b.age > b.life - 0.3 ? (b.life - b.age) / 0.3 : 1;
      b.el.style.transform = `translate(${p.x}px, ${y}px) translate(-50%, -100%)`;
      b.el.style.opacity = String(fade);
      b.el.style.display = p.ok ? '' : 'none';
    }
    for (const tg of this.tags) {
      const p = this.project(tg.get());
      tg.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      tg.el.style.display = p.ok ? '' : 'none';
    }
  }
}
