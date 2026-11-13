import { Route } from './route';

export type BusState = 'driving' | 'dwelling';

export interface BusEvents {
  onArrive?: (stopIndex: number) => void;
  onDepart?: (stopIndex: number) => void;
}

/** Bus movement along a route: accelerates, slows for corners, stops at each stop. */
export class BusSim {
  d: number;
  v = 0;
  /** last frame's acceleration (m/s²), used for body lean */
  a = 0;
  state: BusState = 'driving';
  nextStop = 0;
  private dwellLeft = 0;
  /** set by the world while passengers are still getting on/off */
  hold = false;

  cruise = 9;
  /** traffic: 1 = free road, lower in rush-hour congestion (set by the world) */
  speedFactor = 1;
  accel = 2.6;
  decel = 3.6;
  lateralLimit = 2.4;
  /** minimum time at a stop (door open/close) */
  dwellTime = 1.4;

  constructor(
    readonly route: Route,
    readonly stops: number[],
    startD = 0,
    readonly events: BusEvents = {},
  ) {
    this.d = startD;
    this.nextStop = this.findNextStop();
  }

  private findNextStop(): number {
    let best = 0;
    let bestDist = Infinity;
    this.stops.forEach((s, i) => {
      const dist = this.route.wrap(s - this.d);
      if (dist > 0.5 && dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    return best;
  }

  /** Put the bus back on the road at `d`, stopped and ready to drive (morning line-up). */
  reset(d: number): void {
    this.d = this.route.wrap(d);
    this.v = 0;
    this.a = 0;
    this.state = 'driving';
    this.dwellLeft = 0;
    this.hold = false;
    this.nextStop = this.findNextStop();
  }

  /** @param room free road ahead before reaching the next bus (m) */
  update(dt: number, room = Infinity): void {
    const v0 = this.v;
    if (this.state === 'dwelling') {
      this.dwellLeft -= dt;
      if (this.dwellLeft <= 0 && !this.hold) {
        const left = this.nextStop;
        this.state = 'driving';
        this.nextStop = (this.nextStop + 1) % this.stops.length;
        this.events.onDepart?.(left);
      }
      this.a = 0;
      return;
    }

    const toStop = this.route.wrap(this.stops[this.nextStop] - this.d);
    // speed limit from upcoming curvature
    let target = this.cruise * this.speedFactor;
    for (let look = 0; look <= 12; look += 2) {
      const k = Math.abs(this.route.curvatureAt(this.d + look));
      if (k > 1e-4) target = Math.min(target, Math.sqrt(this.lateralLimit / k) + look * 0.25);
    }
    // speed limit to stop at the stop
    target = Math.min(target, Math.sqrt(2 * this.decel * Math.max(0, toStop - 0.05)));
    // don't run into the bus ahead
    target = Math.min(target, Math.sqrt(2 * this.decel * Math.max(0, room)));

    if (this.v < target) this.v = Math.min(target, this.v + this.accel * dt);
    else this.v = Math.max(target, this.v - this.decel * 1.4 * dt);

    const step = Math.min(this.v * dt, Math.max(0, room));
    if (step <= 0 && room <= 0) {
      this.v = 0;
      this.a = dt > 0 ? -v0 / dt : 0;
      return;
    }
    if (step >= toStop || toStop < 0.06) {
      this.d = this.stops[this.nextStop];
      this.v = 0;
      this.state = 'dwelling';
      this.dwellLeft = this.dwellTime;
      this.events.onArrive?.(this.nextStop);
    } else {
      this.d = this.route.wrap(this.d + step);
    }
    this.a = dt > 0 ? (this.v - v0) / dt : 0;
  }
}
