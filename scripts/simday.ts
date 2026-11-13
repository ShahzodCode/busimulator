/**
 * Headless balance check: plays several days, buying buses whenever affordable (up to a cap).
 * Usage: npx tsx scripts/simday.ts [days=5] [maxBuses=8] [reserve=0]
 */
import { BUS_PRICE, World } from '../src/sim/world';
import { network } from '../src/sim/layout';
import { GameClock } from '../src/sim/clock';

const days = Number(process.argv[2] ?? 5);
const maxBuses = Number(process.argv[3] ?? 8);
/** money kept back when buying buses, so saving up for a route is possible */
const reserve = Number(process.argv[4] ?? 0);
/** extra buses the player can afford before opening a route */
const openWith = Number(process.argv[5] ?? 0);
let seed = 42;
const world = new World(network());
world.rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
world.addStartBuses();
for (const L of world.lines) {
  console.log(`line ${L.spec.no}: ${L.route.length.toFixed(0)} m, ${L.stops.length} stops, ${L.spec.startBuses} buses, price ${L.spec.price}, demand ×${L.demandShare.toFixed(2)}, ${L.crossings.length} junctions`);
}
// served per line, to see each line's share of the work
let servedBy: number[] = [];
world.events.board = (_p, bus) => (servedBy[bus.line] = (servedBy[bus.line] ?? 0) + 1);
const clock = new GameClock();
// taxis taken per hour of the day, to see where service breaks down
let lost: number[] = [];
world.events.giveUp = () => (lost[Math.floor(clock.hour)] = (lost[Math.floor(clock.hour)] ?? 0) + 1);
const dt = 0.05;
/** how uneven the gaps are: spread of gap minutes / mean gap, sampled every game minute (0 = perfectly even) */
let cvSum = 0;
let cvN = 0;
let nextSample = 0;
const gapSpread = () => {
  for (const L of world.openLines) {
    const g = world.gaps(L.index).map((x) => x.minutes);
    if (g.length < 2) continue;
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / g.length);
    cvSum += sd / mean;
    cvN++;
  }
};

console.log(`strategy: buy whenever affordable, up to ${maxBuses} bus(es)`);
console.log('day buses served gaveUp leftB avgWait headway happy  revenue    costs   profit    money  riders×');
for (let d = 1; d <= days; d++) {
  const buys: string[] = [];
  while (!clock.dayOver) {
    clock.update(dt);
    world.step(dt, dt * GameClock.BASE_RATE, clock.hour);
    if (world.time >= nextSample) {
      gapSpread();
      nextSample = world.time + 1;
    }
    // open the next route as soon as it is affordable, otherwise add buses where the wait is longest
    const closed = world.lines.find((L) => !L.open);
    if (closed && world.canOpenLine(closed.index) && world.money >= closed.spec.price + openWith * BUS_PRICE) {
      world.openLine(closed.index);
      buys.push(`${clock.label()} OPEN L${closed.index + 1}`);
    } else if (world.activeBuses.length < maxBuses && world.money >= BUS_PRICE + (closed ? reserve : 0)) {
      const line = world.openLines.reduce((a, b) => (world.headway(b.index) > world.headway(a.index) ? b : a)).index;
      if (world.headway(line) > 16 || !closed) {
        world.buyBus(line);
        buys.push(`${clock.label()}→L${line + 1}`);
      }
    }
  }
  const s = world.endDay(clock.day);
  const hist = Array.from({ length: 16 }, (_, i) => lost[i + 6] ?? 0).join(' ');
  lost = [];
  clock.nextDay();
  const f = (n: number) => String(Math.round(n)).padStart(8);
  console.log(
    `${String(s.day).padStart(3)} ${String(s.buses).padStart(5)} ${String(s.served).padStart(6)} ${String(s.gaveUp).padStart(6)} ${String(s.leftBehind).padStart(5)} ${s.avgWait.toFixed(1).padStart(7)} ${s.headway.toFixed(1).padStart(7)} ${(s.happiness * 100).toFixed(0).padStart(4)}% ${f(s.revenue)} ${f(s.costs)} ${f(s.profit)} ${f(world.money)}  ${s.demandMult.toFixed(2)}` +
      (buys.length ? `   bought at ${buys.join(', ')}` : '') +
      `
      taxis by hour 06..21: ${hist}
      served by line: ${servedBy.join(' / ')}   headways: ${world.openLines.map((L) => world.headway(L.index).toFixed(1)).join(' / ')} min   gap spread ${cvN ? ((cvSum / cvN) * 100).toFixed(0) : '-'}%`,
  );
  servedBy = [];
  cvSum = 0;
  cvN = 0;
}
