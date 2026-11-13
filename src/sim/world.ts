import { BusSim } from './bus';
import { trafficFactor, tripsPerMinute } from './demand';
import { Persona, PERSONAS, PlaceKind, pickTrip } from './passengers';
import { Route } from './route';
import { LineSpec } from './layout';

/**
 * The simulation: stops with queues, buses with passengers on board, fares, costs and happiness.
 * Pure logic — the view listens to events and reads state, it never changes it.
 *
 * Time: `simDt` is in simulated seconds (bus physics); `gameMin` is game minutes (people).
 */

export type Mood = 'happy' | 'ok' | 'angry';

export interface Passenger {
  id: number;
  persona: Persona;
  origin: number;
  dest: number;
  /** true when heading home */
  homeward: boolean;
  /** boards only while the bus is emptier than this share of its capacity */
  crowd: number;
  /** boarding / alighting time compared with an average adult */
  boardTime: number;
  /** world time (game minutes) when they started waiting */
  since: number;
  /** minutes they're willing to wait before giving up */
  patience: number;
  /** extra frustration (minutes) from e.g. a full bus driving past */
  penalty: number;
}

export interface StopState {
  key: string;
  /** the line this stop belongs to, and that line's road */
  line: number;
  route: Route;
  d: number;
  kind: PlaceKind;
  /** how big / popular the place is */
  size: number;
  /** a platform at the bus terminal */
  terminal: boolean;
  /** a timing point (the terminal, or a line's own station), where buses are held to even out the gaps */
  hold: boolean;
  queue: Passenger[];
}

export interface BusAgent {
  id: number;
  /** index into `world.lines` */
  line: number;
  sim: BusSim;
  capacity: number;
  onboard: Passenger[];
  /** boarding work at the current stop, and when the bus pulled in (game minutes) */
  work: { stop: number; timer: number; since: number } | null;
  /** standing at the terminal to even out the gaps (boarding is done, the bus waits for its slot) */
  holding: boolean;
  /** sold: drops everyone off, takes nobody new, then leaves */
  retiring: boolean;
  lapStart: number;
  lastD: number;
}

/** Where this line's road crosses another line's: buses give way to a bus already in the junction. */
export interface Crossing {
  /** distance along this line, and the other line's index and distance along it */
  d: number;
  other: number;
  otherD: number;
}

export interface Line {
  index: number;
  spec: LineSpec;
  route: Route;
  /** global indices into `world.stops`, in driving order */
  stops: number[];
  /** this line's share of the city's trips (line 1 = 1) */
  demandShare: number;
  /** bought and running; closed lines have no buses and no riders */
  open: boolean;
  /**
   * How well known a line is (0..1). A brand-new route starts with few riders: people
   * have to notice it and change their habits, so ridership builds up over its first days.
   */
  ramp: number;
  crossings: Crossing[];
  /** when this line's last bus left the terminal (game minutes; NaN before the first one today) */
  terminalDepart: number;
  /** fractional trip accumulator */
  acc: number;
  lapTimes: number[];
}

export interface WorldEvents {
  spawn?: (p: Passenger, stop: number) => void;
  board?: (p: Passenger, bus: BusAgent, stop: number) => void;
  alight?: (p: Passenger, bus: BusAgent, stop: number) => void;
  giveUp?: (p: Passenger, stop: number) => void;
  leftBehind?: (bus: BusAgent, stop: number, count: number) => void;
  /** people who chose to wait for an emptier bus */
  skipped?: (bus: BusAgent, stop: number, waiting: Passenger[]) => void;
  fare?: (bus: BusAgent, amount: number) => void;
  arrive?: (bus: BusAgent, stop: number) => void;
  /** a bus leaves the terminal after being held `minutes` beyond its normal stop to even out the gaps */
  released?: (bus: BusAgent, stop: number, minutes: number) => void;
  depart?: (bus: BusAgent, stop: number) => void;
  busAdded?: (bus: BusAgent) => void;
  lineOpened?: (line: number) => void;
  busRemoved?: (bus: BusAgent) => void;
}

export interface DayStats {
  served: number;
  gaveUp: number;
  leftBehind: number;
  totalWait: number;
  revenue: number;
  fuelLitres: number;
}

export interface DaySummary extends DayStats {
  day: number;
  buses: number;
  costs: number;
  profit: number;
  avgWait: number;
  happiness: number;
  /** estimated minutes between buses at a stop */
  headway: number;
  /** ridership multiplier for tomorrow, and how it changed */
  demandMult: number;
  demandChange: number;
  /** lines the player opened today */
  linesOpened: number;
  fuelLitres: number;
  fuelCost: number;
}

/** How long the road between two buses is, in waiting terms. */
export type GapLevel = 'good' | 'ok' | 'bad';
/** minutes between buses: up to GAP_GOOD is comfortable, beyond GAP_BAD the least patient riders start leaving */
export const GAP_GOOD = 10;
export const GAP_BAD = 20;

export interface BusGap {
  /** the bus at the back of the gap, and the one it is following */
  bus: BusAgent;
  ahead: BusAgent;
  /** where the gap starts on the route, and how long it is (m) */
  d: number;
  dist: number;
  /** time until the bus behind reaches where the bus ahead is now */
  minutes: number;
  level: GapLevel;
}

export const FARE = 2500; // so'm, Tashkent city bus fare (raised from 2 000 to 2 500 so'm, the current price)
export const BUS_PRICE = 25_000_000;
export const SELL_REFUND = 0.5;
/** Fixed driver wages and maintenance per bus/day; fuel is charged by actual use. */
export const DAILY_FIXED_COST = 270_000;
/** Diesel price in so'm per litre (editable economy balance). */
export const DIESEL_PRICE = 12_000;
/** Heavy city bus baseline: 38 litres per 100 km, before passenger load. */
export const FUEL_L_PER_KM = 0.38;
export const MAX_BUSES = 30;
export const START_MONEY = 30_000_000;
export const BUS_CAPACITY = 30;

// 1 sim second = 1 game minute, so these are ~5–8 game seconds per person (realistic with a door + fare)
const ALIGHT_TIME = 0.09; // sim seconds per person
const BOARD_TIME = 0.13;
/** buses keep this much road (m, centre to centre) to the bus ahead */
const FOLLOW_GAP = 6.5;
const MAX_QUEUE = 60;
/** a junction is busy while a bus is this close to its centre (m along the bus's own road) */
const JUNCTION_IN = 7.5;
const JUNCTION_OUT = 7.5;
/** a bus giving way waits with its centre this far before the junction */
const JUNCTION_HOLD = 8.5;
/** a new line starts with this share of its eventual riders and gains NEW_LINE_RAMP_DAILY a day */
const NEW_LINE_RAMP = 0.25;
const NEW_LINE_RAMP_DAILY = 0.1;
/**
 * Terminal holding. Buses on a loop bunch up on their own: a late bus finds more people
 * waiting, so it gets later still, while the bus behind it finds empty stops and catches up.
 * The proven fix is a control point where buses wait for their slot instead of following a
 * timetable: Bartholdi & Eisenstein, "A self-coördinating bus route to resist bus bunching",
 * Transportation Research B 46(4), 2012, tested on a real route in Atlanta; and Daganzo &
 * Pilachowski, Transportation Research B 45(1), 2011, who use the gap to the bus behind as
 * well as the gap ahead. Our rule: a bus leaves when the time since the previous bus left is
 * at least the time until the next bus arrives, so it sits halfway between its neighbours.
 */
/** every bus stands at least this long at the terminal (game minutes): driver change, quick check */
const TERMINAL_LAYOVER = 2;
/**
 * Longest a bus may be held (game minutes). Holding costs the riders on board time, so agencies
 * cap it; no single published value exists, so this is about half of a typical headway here.
 */
const TERMINAL_MAX_HOLD = 8;
/** while held, look again for latecomers and for the release moment this often (sim seconds) */
const TERMINAL_POLL = 0.1;

export class World {
  readonly lines: Line[];
  /** every stop on every line; passengers and the views address stops by this index */
  readonly stops: StopState[];
  readonly buses: BusAgent[] = [];
  /** monotonic game minutes since the world started */
  time = 0;
  money = START_MONEY;
  /** 0..1, shown as the happiness meter */
  happiness = 0.8;
  /** ridership grows when people trust the buses, shrinks when they don't */
  demandMult = 1;
  stats: DayStats = World.emptyStats();
  /** sum of happiness samples during the day, for the daily average */
  private happySum = 0;
  private happySamples = 0;
  private nextPassengerId = 1;
  private nextBusId = 0;
  private dailyFuelLitres = 0;
  private linesOpenedToday = 0;
  rng: () => number = Math.random;

  constructor(
    specs: LineSpec[],
    readonly events: WorldEvents = {},
  ) {
    this.stops = [];
    const size0 = specs[0].stops.reduce((n, s) => n + s.size, 0);
    this.lines = specs.map((spec, index) => {
      const stops = spec.stops.map((s) => {
        this.stops.push({ key: s.key, d: s.d, kind: s.kind, size: s.size, terminal: !!s.terminal, hold: !!(s.terminal || s.hold), line: index, route: spec.route, queue: [] });
        return this.stops.length - 1;
      });
      const size = spec.stops.reduce((n, s) => n + s.size, 0);
      const open = spec.price === 0;
      return { index, spec, route: spec.route, stops, demandShare: size / size0, open, ramp: open ? 1 : 0, crossings: [], terminalDepart: NaN, acc: 0, lapTimes: [] };
    });
    // where the roads cross: buses take turns at these junctions
    for (let a = 0; a < this.lines.length; a++) {
      for (let b = a + 1; b < this.lines.length; b++) {
        for (const [da, db] of crossings(this.lines[a].route, this.lines[b].route)) {
          this.lines[a].crossings.push({ d: da, other: b, otherD: db });
          this.lines[b].crossings.push({ d: db, other: a, otherD: da });
        }
      }
    }
  }

  /** Stops of one line, in driving order. */
  stopsOf(line: number): StopState[] {
    return this.lines[line].stops.map((i) => this.stops[i]);
  }

  static emptyStats(): DayStats {
    return { served: 0, gaveUp: 0, leftBehind: 0, totalWait: 0, revenue: 0, fuelLitres: 0 };
  }

  get activeBuses(): BusAgent[] {
    return this.buses.filter((b) => !b.retiring);
  }

  /** Buses still in service on one line. */
  activeOn(line: number): BusAgent[] {
    return this.buses.filter((b) => !b.retiring && b.line === line);
  }

  addBus(line: number, startD: number, capacity = BUS_CAPACITY): BusAgent {
    const L = this.lines[line];
    const bus: BusAgent = {
      id: this.nextBusId++,
      line,
      sim: null as unknown as BusSim,
      capacity,
      onboard: [],
      work: null,
      holding: false,
      retiring: false,
      lapStart: NaN,
      lastD: startD,
    };
    bus.sim = new BusSim(L.route, L.stops.map((i) => this.stops[i].d), startD, {
      onArrive: (i) => this.arrive(bus, L.stops[i]),
      onDepart: (i) => this.events.depart?.(bus, L.stops[i]),
    });
    this.buses.push(bus);
    this.events.busAdded?.(bus);
    return bus;
  }

  /** Where bus `i` of `n` on a line lines up in the morning: evenly round the loop, just short of its first stop. */
  startPoint(line: number, i: number, n: number): number {
    const L = this.lines[line];
    return L.route.wrap(this.stops[L.stops[0]].d - 18 + (i * L.route.length) / n);
  }

  /** Put every line's day-1 fleet on the road. */
  addStartBuses(): void {
    this.lines.forEach((L, line) => {
      for (let i = 0; i < L.spec.startBuses; i++) this.addBus(line, this.startPoint(line, i, L.spec.startBuses));
    });
  }

  /** Lines the player runs today. */
  get openLines(): Line[] {
    return this.lines.filter((L) => L.open);
  }

  canOpenLine(line: number): boolean {
    const L = this.lines[line];
    return !L.open && this.money >= L.spec.price && this.activeBuses.length < MAX_BUSES;
  }

  /** Buy a new route: it opens with a single bus and a few riders who are still discovering it. */
  openLine(line: number): BusAgent | null {
    if (!this.canOpenLine(line)) return null;
    const L = this.lines[line];
    this.money -= L.spec.price;
    L.open = true;
    L.ramp = NEW_LINE_RAMP;
    L.lapTimes.length = 0;
    this.linesOpenedToday++;
    this.events.lineOpened?.(line);
    return this.addBus(line, this.startPoint(line, 0, 1));
  }

  /** a bus can be bought while there is money; every bus costs the same */
  canBuy(): boolean {
    return this.money >= BUS_PRICE && this.activeBuses.length < MAX_BUSES;
  }

  /** Buy a bus for a line and put it in that line's biggest gap (even spacing = short waits). */
  buyBus(line: number): BusAgent | null {
    if (!this.canBuy() || !this.lines[line].open) return null;
    this.money -= BUS_PRICE;
    return this.addBus(line, this.biggestGapPoint(line));
  }

  /** every line keeps at least one bus */
  canSell(line: number): boolean {
    return this.activeOn(line).length > 1;
  }

  /** Sell a line's emptiest bus: it finishes dropping people off, then drives away. */
  sellBus(line: number): BusAgent | null {
    if (!this.canSell(line)) return null;
    const bus = this.activeOn(line).reduce((a, b) => (b.onboard.length < a.onboard.length ? b : a));
    bus.retiring = true;
    this.money += BUS_PRICE * SELL_REFUND;
    return bus;
  }

  biggestGapPoint(line: number): number {
    const route = this.lines[line].route;
    const L = route.length;
    const ds = this.buses.filter((b) => b.line === line).map((b) => b.sim.d).sort((a, b) => a - b);
    if (ds.length === 0) return this.startPoint(line, 0, 1);
    let best = 0;
    let at = 0;
    ds.forEach((d, i) => {
      const next = i + 1 < ds.length ? ds[i + 1] : ds[0] + L;
      if (next - d > best) {
        best = next - d;
        at = d + best / 2;
      }
    });
    return route.wrap(at);
  }

  /** Recent average time for one lap of a line (game minutes). */
  lapTime(line: number): number {
    const L = this.lines[line];
    // first-day estimate before any lap completes: driving plus a stop's worth of braking and doors
    if (L.lapTimes.length === 0) return L.route.length / 6.5 + L.stops.length * 4;
    return L.lapTimes.reduce((a, b) => a + b, 0) / L.lapTimes.length;
  }

  /** Minutes between buses at a stop of this line if they were evenly spaced. */
  headway(line: number): number {
    return this.lapTime(line) / Math.max(1, this.activeOn(line).length);
  }

  /** The longest headway on any line: the one riders notice. */
  worstHeadway(): number {
    return Math.max(...this.openLines.map((L) => this.headway(L.index)));
  }

  /** Headway the average rider sees across the network (weighted by each line's ridership). */
  meanHeadway(): number {
    const lines = this.openLines;
    const total = lines.reduce((n, L) => n + L.demandShare * L.ramp, 0);
    return lines.reduce((n, L) => n + this.headway(L.index) * L.demandShare * L.ramp, 0) / total;
  }

  /** The stretch of road between each bus and the next one ahead on its line, with how long a rider there would wait. */
  gaps(line: number): BusGap[] {
    const buses = this.activeOn(line).sort((a, b) => a.sim.d - b.sim.d);
    const route = this.lines[line].route;
    const L = route.length;
    const lap = this.lapTime(line);
    return buses.map((bus, i) => {
      const ahead = buses[(i + 1) % buses.length];
      const dist = buses.length === 1 ? L : route.wrap(ahead.sim.d - bus.sim.d);
      const minutes = (dist / L) * lap;
      return { bus, ahead, d: bus.sim.d, dist, minutes, level: minutes <= GAP_GOOD ? 'good' : minutes <= GAP_BAD ? 'ok' : 'bad' };
    });
  }

  waitOf(p: Passenger): number {
    return this.time - p.since + p.penalty;
  }

  moodOf(p: Passenger): Mood {
    const f = this.waitOf(p) / p.patience;
    return f < 0.45 ? 'happy' : f < 0.8 ? 'ok' : 'angry';
  }

  waitingCount(): number {
    return this.stops.reduce((n, s) => n + s.queue.length, 0);
  }

  /**
   * @param simDt simulated seconds since last step
   * @param gameMin game minutes since last step
   * @param hour current hour of day (for demand)
   */
  step(simDt: number, gameMin: number, hour: number): void {
    this.time += gameMin;
    this.spawn(gameMin, hour);
    this.patience();
    const traffic = trafficFactor(hour);
    for (const bus of [...this.buses]) {
      bus.sim.speedFactor = traffic;
      this.boarding(bus, simDt);
      const beforeD = bus.sim.d;
      const wasDwelling = bus.sim.state === 'dwelling' || bus.sim.hold;
      bus.sim.update(simDt, Math.min(this.gapAhead(bus) - FOLLOW_GAP, this.junctionRoom(bus)));
      const travelledM = bus.sim.route.wrap(bus.sim.d - beforeD);
      const loadRatio = bus.capacity > 0 ? bus.onboard.length / bus.capacity : 0;
      // Loaded buses need more energy; idling at stops still burns fuel.
      const movingFuel = (travelledM / 1000) * FUEL_L_PER_KM * (1 + 0.35 * loadRatio);
      const idleFuel = wasDwelling ? simDt * 0.00055 : 0;
      this.dailyFuelLitres += movingFuel + idleFuel;
      this.stats.fuelLitres += movingFuel + idleFuel;
      this.trackLap(bus);
      if (bus.retiring && bus.onboard.length === 0 && !bus.work) this.removeBus(bus);
    }
    this.happySum += this.happiness * gameMin;
    this.happySamples += gameMin;
  }

  /** road distance to the next bus ahead on the same line (Infinity if alone) */
  private gapAhead(bus: BusAgent): number {
    let gap = Infinity;
    const route = bus.sim.route;
    for (const o of this.buses) {
      if (o === bus || o.line !== bus.line) continue;
      const g = route.wrap(o.sim.d - bus.sim.d);
      if (g > 0 && g < gap) gap = g;
    }
    return gap;
  }

  /** is a bus of `line` inside the junction at `d` on that line's road? */
  private junctionBusy(line: number, d: number): boolean {
    const route = this.lines[line].route;
    for (const o of this.buses) {
      if (o.line !== line) continue;
      const rel = route.wrap(o.sim.d - d);
      if (rel < JUNCTION_OUT || rel > route.length - JUNCTION_IN) return true;
    }
    return false;
  }

  /**
   * Free road before the next junction a bus has to give way at. A bus already in a junction
   * always drives on (so two buses can never wait for each other); one approaching a busy
   * junction stops short of it until the crossing bus has cleared.
   */
  private junctionRoom(bus: BusAgent): number {
    const L = this.lines[bus.line];
    let room = Infinity;
    for (const c of L.crossings) {
      const to = L.route.wrap(c.d - bus.sim.d);
      if (to <= JUNCTION_IN || to > 40) continue;
      if (this.junctionBusy(c.other, c.otherD)) room = Math.min(room, to - JUNCTION_HOLD);
    }
    return room;
  }

  private trackLap(bus: BusAgent): void {
    const L = this.lines[bus.line];
    if (bus.sim.d < bus.lastD - L.route.length / 2) {
      // wrapped past the start: one lap done (the first wrap only marks the start)
      if (!Number.isNaN(bus.lapStart)) {
        L.lapTimes.push(this.time - bus.lapStart);
        if (L.lapTimes.length > 8) L.lapTimes.shift();
      }
      bus.lapStart = this.time;
    }
    bus.lastD = bus.sim.d;
  }

  private removeBus(bus: BusAgent): void {
    const i = this.buses.indexOf(bus);
    if (i >= 0) this.buses.splice(i, 1);
    this.events.busRemoved?.(bus);
  }

  private spawn(gameMin: number, hour: number): void {
    for (const L of this.openLines) {
      L.acc += tripsPerMinute(hour) * this.demandMult * L.demandShare * L.ramp * gameMin;
      const places = this.stopsOf(L.index);
      const ride = (i: number, j: number) => L.route.wrap(places[j].d - places[i].d);
      // arrivals at the expected rate, with jittered spacing so they don't look metronomic
      while (L.acc >= 1) {
        L.acc -= 0.6 + this.rng() * 0.8;
        const trip = pickTrip(hour, places, ride, L.route.length * 0.5, this.rng);
        if (trip) this.addPassenger(trip.persona, L.stops[trip.origin], L.stops[trip.dest], trip.homeward);
      }
    }
  }

  /** a new rider starts waiting at a stop (origin and dest are indices into `stops`) */
  private addPassenger(persona: Persona, origin: number, dest: number, homeward: boolean): void {
    const s = this.stops[origin];
    if (s.queue.length >= MAX_QUEUE) return;
    const spec = PERSONAS[persona];
    const p: Passenger = {
      id: this.nextPassengerId++,
      persona,
      origin,
      dest,
      homeward,
      crowd: spec.crowd,
      boardTime: spec.boardTime,
      since: this.time,
      patience: spec.patience[0] + this.rng() * (spec.patience[1] - spec.patience[0]),
      penalty: 0,
    };
    s.queue.push(p);
    this.events.spawn?.(p, origin);
  }

  private patience(): void {
    this.stops.forEach((s, i) => {
      for (let k = s.queue.length - 1; k >= 0; k--) {
        const p = s.queue[k];
        if (this.waitOf(p) >= p.patience) {
          s.queue.splice(k, 1);
          this.stats.gaveUp++;
          this.rate(-0.3);
          this.events.giveUp?.(p, i);
        }
      }
    });
  }

  /** nudge happiness towards a passenger's experience score */
  private rate(score: number): void {
    // each rider moves the meter only a little: a big network has thousands of them a day
    this.happiness = Math.min(1, Math.max(0, this.happiness + (score - this.happiness) * 0.02));
  }

  private arrive(bus: BusAgent, stop: number): void {
    bus.work = { stop, timer: 0, since: this.time };
    bus.sim.hold = true;
    this.events.arrive?.(bus, stop);
  }

  private boarding(bus: BusAgent, simDt: number): void {
    const w = bus.work;
    if (!w) return;
    w.timer -= simDt;
    while (w.timer <= 0) {
      const s = this.stops[w.stop];
      // 1) people get off first (a retiring bus lets everyone off)
      const off = bus.retiring ? (bus.onboard.length ? 0 : -1) : bus.onboard.findIndex((p) => p.dest === w.stop);
      if (off >= 0) {
        const [p] = bus.onboard.splice(off, 1);
        this.events.alight?.(p, bus, w.stop);
        w.timer += ALIGHT_TIME * p.boardTime;
        continue;
      }
      // 2) then board while there's room; some people let a packed bus go and wait for the next
      const load = bus.onboard.length / bus.capacity;
      const next = bus.retiring || load >= 1 ? -1 : s.queue.findIndex((p) => load < p.crowd);
      if (next >= 0) {
        const [p] = s.queue.splice(next, 1);
        const wait = this.waitOf(p);
        bus.onboard.push(p);
        this.stats.served++;
        this.stats.totalWait += wait;
        this.stats.revenue += FARE;
        this.money += FARE;
        this.rate(1 - Math.min(1, wait / p.patience) * 0.9);
        this.events.board?.(p, bus, w.stop);
        this.events.fare?.(bus, FARE);
        // squeezing past standing passengers takes longer than stepping into an empty bus
        w.timer += BOARD_TIME * p.boardTime * (1 + 0.5 * load);
        continue;
      }
      // 3) at the terminal, wait for this bus's slot; people arriving meanwhile still get on
      if (s.hold && !bus.retiring && !this.slotReady(bus, w.since)) {
        bus.holding = true;
        w.timer += TERMINAL_POLL;
        break;
      }
      // 4) done — anyone still waiting watched the bus leave without them
      if (!bus.retiring && s.queue.length > 0) {
        if (load >= 1) {
          for (const p of s.queue) p.penalty += 8;
          this.stats.leftBehind += s.queue.length;
          this.rate(0.2);
          this.events.leftBehind?.(bus, w.stop, s.queue.length);
        } else {
          for (const p of s.queue) p.penalty += 3;
          this.events.skipped?.(bus, w.stop, s.queue);
        }
      }
      if (s.hold && !bus.retiring) {
        this.lines[bus.line].terminalDepart = this.time;
        this.events.released?.(bus, w.stop, Math.max(0, this.time - w.since - TERMINAL_LAYOVER));
      }
      bus.holding = false;
      bus.work = null;
      bus.sim.hold = false;
      break;
    }
  }

  /**
   * May a bus standing at the terminal since `since` leave now? After the layover it leaves as
   * soon as it has fallen at least as far behind the previous bus as the next bus is behind it.
   */
  private slotReady(bus: BusAgent, since: number): boolean {
    const stood = this.time - since;
    if (stood < TERMINAL_LAYOVER) return false;
    if (stood >= TERMINAL_MAX_HOLD) return true;
    const L = this.lines[bus.line];
    const behind = this.busBehind(bus);
    if (!behind || Number.isNaN(L.terminalDepart)) return true;
    const ahead = this.time - L.terminalDepart;
    // the bus behind needs about its share of a lap (stops and traffic included) to get here
    const coming = (L.route.wrap(bus.sim.d - behind.sim.d) / L.route.length) * this.lapTime(bus.line);
    return ahead >= coming;
  }

  /** The nearest bus behind on the same line (null when it runs alone). */
  private busBehind(bus: BusAgent): BusAgent | null {
    const route = bus.sim.route;
    let best: BusAgent | null = null;
    let gap = Infinity;
    for (const o of this.activeOn(bus.line)) {
      if (o === bus) continue;
      const g = route.wrap(bus.sim.d - o.sim.d);
      if (g > 0 && g < gap) {
        gap = g;
        best = o;
      }
    }
    return best;
  }

  /**
   * Close the day: pay running costs, adjust tomorrow's ridership by reputation,
   * send everyone home and return the summary.
   */
  endDay(day: number): DaySummary {
    const s = this.stats;
    const buses = this.activeBuses.length;
    const fuelLitres = this.dailyFuelLitres;
    const fuelCost = Math.round(fuelLitres * DIESEL_PRICE);
    const fixedCosts = buses * DAILY_FIXED_COST;
    const costs = fixedCosts + fuelCost;
    this.money -= costs;
    const avgHappy = this.happySamples > 0 ? this.happySum / this.happySamples : this.happiness;
    // happy riders tell friends; unhappy ones buy a car or call a taxi
    const before = this.demandMult;
    this.demandMult = Math.min(1.8, Math.max(0.6, this.demandMult * (0.9 + 0.2 * avgHappy)));

    const summary: DaySummary = {
      ...s,
      day,
      buses,
      costs,
      fuelLitres,
      fuelCost,
      profit: s.revenue - costs,
      avgWait: s.served ? s.totalWait / s.served : 0,
      happiness: avgHappy,
      headway: this.meanHeadway(),
      demandMult: this.demandMult,
      demandChange: this.demandMult / before - 1,
      linesOpened: this.linesOpenedToday,
    };

    // night: queues go home, buses empty out
    for (const st of this.stops) {
      st.queue.length = 0;
    }
    for (const L of this.lines) {
      L.acc = 0;
      // word gets round: a new line gains riders every day until it is as known as the old ones
      if (L.open) L.ramp = Math.min(1, L.ramp + NEW_LINE_RAMP_DAILY);
      L.terminalDepart = NaN;
    }
    this.dailyFuelLitres = 0;
    this.linesOpenedToday = 0;
    for (const b of [...this.buses]) {
      b.onboard.length = 0;
      if (b.retiring) this.removeBus(b);
    }
    // buses leave the depot evenly spaced along their line every morning
    this.lines.forEach((_, line) => {
      const fleet = this.buses.filter((b) => b.line === line);
      fleet.forEach((b, i) => {
        b.sim.reset(this.startPoint(line, i, fleet.length));
        b.work = null;
        b.holding = false;
        b.lapStart = NaN;
        b.lastD = b.sim.d;
      });
    });
    this.stats = World.emptyStats();
    this.happySum = 0;
    this.happySamples = 0;
    return summary;
  }
}

/** Where two closed routes cross: pairs of (distance along a, distance along b). */
function crossings(a: Route, b: Route): [number, number][] {
  const out: [number, number][] = [];
  const na = a.pts.length;
  const nb = b.pts.length;
  for (let i = 0; i < na; i++) {
    const p = a.pts[i];
    const p2 = a.pts[(i + 1) % na];
    const rx = p2.x - p.x;
    const rz = p2.z - p.z;
    for (let j = 0; j < nb; j++) {
      const q = b.pts[j];
      const q2 = b.pts[(j + 1) % nb];
      const sx = q2.x - q.x;
      const sz = q2.z - q.z;
      const den = rx * sz - rz * sx;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((q.x - p.x) * sz - (q.z - p.z) * sx) / den;
      const u = ((q.x - p.x) * rz - (q.z - p.z) * rx) / den;
      if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
      out.push([a.cum[i] + t * (a.cum[i + 1] - a.cum[i]), b.cum[j] + u * (b.cum[j + 1] - b.cum[j])]);
    }
  }
  return out;
}
