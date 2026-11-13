/**
 * Who travels, when, and where to.
 *
 * Transport planners split trips into "productions" (homes) and "attractions"
 * (work, school, shops) and send people between them with a gravity model:
 * a place pulls harder the bigger it is and the closer it is. Mornings flow
 * from homes to activities, evenings flow back — which is why rush-hour buses
 * fill up in one direction.
 */

export type PlaceKind = 'residential' | 'bazaar' | 'metro' | 'school' | 'university' | 'center' | 'station' | 'park' | 'sight';

export type Persona = 'worker' | 'student' | 'pupil' | 'shopper' | 'elder' | 'visitor';

/** A bump of departures: [peak hour, spread in hours, share of this persona's trips] */
type Wave = [number, number, number];

export interface PersonaSpec {
  /** share of all trips made by this group */
  share: number;
  /** minutes they will wait before giving up (min, max) */
  patience: [number, number];
  /** they only board while the bus is emptier than this (1 = will squeeze into anything) */
  crowd: number;
  /** boarding / alighting time compared with an average adult */
  boardTime: number;
  /** where their day starts: weight per kind of place */
  home: Partial<Record<PlaceKind, number>>;
  /** where they go: weight per kind of place */
  go: Partial<Record<PlaceKind, number>>;
  /** when they set off, and when they come back */
  out: Wave[];
  back: Wave[];
}

export const PERSONAS: Record<Persona, PersonaSpec> = {
  // commuters: fixed start time, no patience in the morning, will squeeze in
  worker: {
    share: 0.36,
    patience: [20, 36],
    crowd: 1,
    boardTime: 1,
    home: { residential: 1, metro: 0.35 },
    go: { center: 1, metro: 0.7, bazaar: 0.3, station: 0.25, university: 0.15, school: 0.1 },
    out: [[7.6, 0.8, 1]],
    back: [[17.6, 1.1, 1]],
  },
  student: {
    share: 0.14,
    patience: [26, 44],
    crowd: 1,
    boardTime: 1,
    home: { residential: 1, metro: 0.4 },
    go: { university: 1, center: 0.25, metro: 0.2, park: 0.15, sight: 0.1 },
    out: [[8.2, 0.7, 0.75], [11.5, 1, 0.25]],
    back: [[14.5, 1.2, 0.5], [17.5, 1, 0.5]],
  },
  // schools in Tashkent teach in two shifts, so there is a second wave around 13:00
  pupil: {
    share: 0.12,
    patience: [18, 30],
    crowd: 1,
    boardTime: 0.85,
    home: { residential: 1 },
    go: { school: 1 },
    out: [[7.4, 0.45, 0.6], [12.6, 0.45, 0.4]],
    back: [[12.9, 0.45, 0.5], [17.2, 0.6, 0.5]],
  },
  // flexible about time, picky about comfort
  shopper: {
    share: 0.16,
    patience: [32, 52],
    crowd: 0.85,
    boardTime: 1.15,
    home: { residential: 1, metro: 0.3 },
    go: { bazaar: 1, center: 0.5, park: 0.2, sight: 0.15 },
    out: [[10.5, 1.6, 0.6], [15.5, 1.5, 0.4]],
    back: [[12.5, 1.6, 0.55], [17.8, 1.4, 0.45]],
  },
  // very patient, slow on the steps, will not board a packed bus
  elder: {
    share: 0.11,
    patience: [42, 65],
    crowd: 0.7,
    boardTime: 1.8,
    home: { residential: 1 },
    go: { bazaar: 1, park: 0.6, sight: 0.45, center: 0.25, metro: 0.15 },
    out: [[9.5, 1.3, 1]],
    back: [[12.5, 1.5, 1]],
  },
  // arrive by train or metro with luggage (or from a city-centre hotel), spread through the day
  visitor: {
    share: 0.11,
    patience: [28, 48],
    crowd: 0.8,
    boardTime: 1.5,
    home: { station: 1, metro: 0.7, center: 0.35 },
    go: { sight: 1.1, center: 1, bazaar: 0.9, park: 0.6, residential: 0.5, university: 0.2 },
    out: [[10, 3, 1]],
    back: [[15, 3.2, 1]],
  },
};

export const PERSONA_KEYS = Object.keys(PERSONAS) as Persona[];

export interface Place {
  kind: PlaceKind;
  /** how big / popular the place is (homes for a neighbourhood, visitors for a bazaar) */
  size: number;
}

export interface Trip {
  persona: Persona;
  origin: number;
  dest: number;
  /** true when heading home */
  homeward: boolean;
}

const SQRT_2PI = Math.sqrt(2 * Math.PI);
const waves = (hour: number, list: Wave[]) =>
  list.reduce((n, [mu, sigma, share]) => n + (share * Math.exp(-((hour - mu) ** 2) / (2 * sigma * sigma))) / (sigma * SQRT_2PI), 0);

function pick(weights: number[], rng: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return -1;
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (weights[i] > 0 && r <= 0) return i;
  }
  return weights.findIndex((w) => w > 0);
}

/**
 * Draw one trip for this time of day.
 * @param ride distance a bus travels from stop i to stop j
 * @param reach distance at which a place's pull has faded to about a third
 */
export function pickTrip(hour: number, places: Place[], ride: (i: number, j: number) => number, reach: number, rng: () => number): Trip | null {
  // 1) who is setting off right now, and in which direction
  const options: number[] = [];
  for (const key of PERSONA_KEYS) {
    const p = PERSONAS[key];
    options.push(p.share * waves(hour, p.out), p.share * waves(hour, p.back));
  }
  const o = pick(options, rng);
  if (o < 0) return null;
  const persona = PERSONA_KEYS[o >> 1];
  const homeward = (o & 1) === 1;
  const spec = PERSONAS[persona];

  // 2) where from: bigger places send (and receive) more people
  const homes = places.map((s) => (spec.home[s.kind] ?? 0) * s.size);
  const pulls = places.map((s) => (spec.go[s.kind] ?? 0) * s.size);
  const origin = pick(homeward ? pulls : homes, rng);
  if (origin < 0) return null;

  // 3) where to: popular and nearby beats small and far
  const ends = (homeward ? homes : pulls).map((w, j) => (j === origin ? 0 : w * Math.exp(-ride(origin, j) / reach)));
  const dest = pick(ends, rng);
  if (dest < 0) return null;
  return { persona, origin, dest, homeward };
}
