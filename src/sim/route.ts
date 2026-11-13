/**
 * Pure route geometry (no rendering). A route is a closed loop sampled into
 * a polyline; positions along it are addressed by distance in metres.
 * Coordinates are the ground plane: x = east, z = south.
 */
export interface Vec2 {
  x: number;
  z: number;
}

export interface RouteSample {
  x: number;
  z: number;
  /** unit tangent (direction of travel) */
  tx: number;
  tz: number;
}

export class Route {
  readonly pts: Vec2[];
  readonly cum: number[];
  readonly length: number;
  /** signed curvature (1/m) at each point; positive = turning left */
  readonly curv: number[];

  constructor(pts: Vec2[]) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i <= pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i % pts.length];
      this.cum.push(this.cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[pts.length];
    this.curv = pts.map((_, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const h1 = Math.atan2(b.z - a.z, b.x - a.x);
      const h2 = Math.atan2(c.z - b.z, c.x - b.x);
      let dh = h2 - h1;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      const ds = (Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z)) / 2;
      // screen-space: z points down, so a negative dh is a left turn
      return -dh / ds;
    });
  }

  wrap(d: number): number {
    return ((d % this.length) + this.length) % this.length;
  }

  private index(d: number): number {
    d = this.wrap(d);
    let lo = 0;
    let hi = this.pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  sample(d: number): RouteSample {
    d = this.wrap(d);
    const i = this.index(d);
    const a = this.pts[i];
    const b = this.pts[(i + 1) % this.pts.length];
    const seg = this.cum[i + 1] - this.cum[i];
    const f = seg > 0 ? (d - this.cum[i]) / seg : 0;
    const tx = (b.x - a.x) / seg;
    const tz = (b.z - a.z) / seg;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, tx, tz };
  }

  /** Distance along the route of the point closest to (x, z). */
  nearestD(x: number, z: number): number {
    let best = 0;
    let bestDist = Infinity;
    for (let d = 0; d < this.length; d += 0.25) {
      const s = this.sample(d);
      const dist = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = d;
      }
    }
    return best;
  }

  curvatureAt(d: number): number {
    return this.curv[this.index(d)];
  }

  /** Point offset to the right of travel direction (right-hand traffic lane). */
  static right(s: RouteSample, off: number): Vec2 {
    return { x: s.x - s.tz * off, z: s.z + s.tx * off };
  }

  /** Rounded-rectangle loop, driven anticlockwise on screen (so the outside is on the bus's right). */
  static roundedRect(cx: number, cz: number, w: number, h: number, r: number, seg = 14): Route {
    const pts: Vec2[] = [];
    const hx = w / 2 - r;
    const hz = h / 2 - r;
    const corners: [number, number, number][] = [
      [cx + hx, cz + hz, 0],
      [cx - hx, cz + hz, Math.PI / 2],
      [cx - hx, cz - hz, Math.PI],
      [cx + hx, cz - hz, (3 * Math.PI) / 2],
    ];
    for (const [ccx, ccz, a0] of corners) {
      for (let k = 0; k <= seg; k++) {
        const a = a0 + (k / seg) * (Math.PI / 2);
        pts.push({ x: ccx + r * Math.cos(a), z: ccz + r * Math.sin(a) });
      }
    }
    pts.reverse();
    return new Route(pts);
  }

  /**
   * Closed loop through `verts` (listed in travel order, anticlockwise on screen)
   * with every corner rounded to radius `r`. Corners may turn either way.
   */
  static roundedPolygon(verts: Vec2[], r: number, seg = 10): Route {
    const pts: Vec2[] = [];
    const push = (x: number, z: number) => {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - x, last.z - z) > 1e-4) pts.push({ x, z });
    };
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const a = verts[(i - 1 + n) % n];
      const b = verts[i];
      const c = verts[(i + 1) % n];
      const ul = Math.hypot(a.x - b.x, a.z - b.z);
      const vl = Math.hypot(c.x - b.x, c.z - b.z);
      const ux = (a.x - b.x) / ul;
      const uz = (a.z - b.z) / ul;
      const vx = (c.x - b.x) / vl;
      const vz = (c.z - b.z) / vl;
      const half = Math.acos(Math.min(1, Math.max(-1, ux * vx + uz * vz))) / 2;
      // tangent length, never more than 45% of either neighbouring edge
      const t = Math.min(r / Math.tan(half), ul * 0.45, vl * 0.45);
      const rr = t * Math.tan(half);
      const bl = Math.hypot(ux + vx, uz + vz);
      const cx = b.x + ((ux + vx) / bl) * (rr / Math.sin(half));
      const cz = b.z + ((uz + vz) / bl) * (rr / Math.sin(half));
      const a0 = Math.atan2(b.z + uz * t - cz, b.x + ux * t - cx);
      let sweep = Math.atan2(b.z + vz * t - cz, b.x + vx * t - cx) - a0;
      while (sweep > Math.PI) sweep -= 2 * Math.PI;
      while (sweep < -Math.PI) sweep += 2 * Math.PI;
      const steps = Math.max(2, Math.ceil((Math.abs(sweep) / (Math.PI / 2)) * seg));
      for (let k = 0; k <= steps; k++) {
        const ang = a0 + (sweep * k) / steps;
        push(cx + rr * Math.cos(ang), cz + rr * Math.sin(ang));
      }
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-4) pts.pop();
    return new Route(pts);
  }
}
