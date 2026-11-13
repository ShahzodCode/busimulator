/**
 * Passenger demand and traffic over the day, built on measured data.
 *
 * Hour-by-hour shape: real weekday bus boardings counted by fare validators
 * (MTA Bus Hourly Ridership, Mon–Fri 7–11 Oct 2024, data.ny.gov dataset kv7t-n8in).
 * Tashkent's operator publishes daily totals (about 1.4–1.5 million bus trips a day
 * on 165 routes) but no hourly series, so the shape of a measured big-city weekday
 * is used: a sharp morning peak at 07–09 and a longer afternoon peak at 15–18.
 */
const HOURLY_BOARDINGS: Record<number, number> = {
  5: 150256,
  6: 399329,
  7: 727199,
  8: 614767,
  9: 374191,
  10: 295547,
  11: 289101,
  12: 323840,
  13: 372861,
  14: 463213,
  15: 532040,
  16: 563198,
  17: 587312,
  18: 462435,
  19: 298281,
  20: 199524,
  21: 136454,
  22: 90422,
};

const SERVICE_START = 6;
const SERVICE_END = 22;
const SERVICE_MINUTES = (SERVICE_END - SERVICE_START) * 60;

let mean = 0;
for (let h = SERVICE_START; h < SERVICE_END; h++) mean += HOURLY_BOARDINGS[h];
mean /= SERVICE_END - SERVICE_START;

/** Trips starting on the whole network in one day, before reputation changes it. */
export const DAILY_TRIPS = 2100;

/**
 * Demand relative to the day's average (1 = average hour, 1.75 = the 07:00 peak).
 * Each count belongs to the middle of its hour; values in between are interpolated.
 */
export function demandLevel(hour: number): number {
  const x = Math.min(22.5, Math.max(5.5, hour)) - 0.5;
  const h0 = Math.floor(x);
  const h1 = Math.min(22, h0 + 1);
  const f = x - h0;
  return (HOURLY_BOARDINGS[h0] * (1 - f) + HOURLY_BOARDINGS[h1] * f) / mean;
}

/** New trips per game minute across the whole network. */
export function tripsPerMinute(hour: number): number {
  return (DAILY_TRIPS / SERVICE_MINUTES) * demandLevel(hour);
}

/** True while demand is well above the day's average (07–09 and 15–18). */
export function isRushHour(hour: number): boolean {
  return demandLevel(hour) >= 1.2;
}

/**
 * How fast buses can drive compared with an empty road. Streets fill up when everyone
 * travels at once: Tashkent's Transport Ministry reports average bus speeds of
 * 18.7 km/h in mixed traffic against 24.1 km/h once buses were given priority
 * (a ratio of 0.78), and the worst hour is slower than the average.
 */
export function trafficFactor(hour: number): number {
  const jam = Math.min(1, Math.max(0, (demandLevel(hour) - 0.9) / 0.85));
  return 1 - 0.35 * jam;
}
