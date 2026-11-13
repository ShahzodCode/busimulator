import { Route } from './route';
import { PlaceKind } from './passengers';

/** Which landmark building stands behind a stop (defaults to one picked from its kind). */
export type LandmarkKind = 'tvtower' | 'minor' | 'hazratimom' | 'ezgulik' | 'tashkentcity' | 'arena' | 'opera';

export interface StopSpec {
  key: string;
  d: number;
  kind: PlaceKind;
  /** how big / popular the place is */
  size: number;
  landmark?: LandmarkKind;
  /** a stop at the shared terminal: buses stand here longer and leave on an even headway */
  terminal?: boolean;
  /**
   * A timing point on the street (a line that doesn't reach the terminal): buses are held here
   * the same way, so every line can even out its gaps.
   */
  hold?: boolean;
}

export interface LineSpec {
  /** route number painted on the stops and the menu */
  no: number;
  /** translation key of the line's name */
  name: string;
  /** line colour: stop boards, buses, menu badge (and a darker shade for edges) */
  color: string;
  dark: string;
  route: Route;
  stops: StopSpec[];
  /** buses the player owns on this line on day 1 (0 = the line is not open yet) */
  startBuses: number;
  /** what it costs to open the line, its first bus included (0 = open from the start) */
  price: number;
}

/**
 * Opening a new route: licence, new stops and shelters, a depot place and its first bus.
 * About two weeks of a good network's profit, so new lines arrive slowly.
 */
export const ROUTE_PRICE = 60_000_000;

/**
 * The bus terminal: an island platform north of line 1's top road, west of line 2's avenue.
 * Both lines leave their road and drive through it: line 1 loops north into a bay along the
 * island's south side (z = -54), line 2 swings west into a bay along its north side (z = -68).
 * Buses stand at the island for their layover and holding time, then drive back out, so a
 * held bus waits off the street instead of blocking it (how real bus stations are laid out).
 * This is the island's centre; the Blender model (art/build_props.py, "Terminal") is built
 * around it, with its painted bus stands at the stop points below.
 */
export const TERMINAL_HALL = { x: -14, z: -61 };

function stopsOn(route: Route) {
  return (key: string, x: number, z: number, kind: PlaceKind, size: number, landmark?: LandmarkKind): StopSpec => ({
    key,
    d: route.nearestD(x, z),
    kind,
    size,
    landmark,
  });
}

/** A big station on a line that doesn't reach the terminal: its timing point, where buses are held. */
function holdAt(stop: StopSpec): StopSpec {
  return { ...stop, hold: true };
}

/**
 * A line's platform at the terminal: a transfer hub, so people start and end trips there like
 * at a station. `dx` is the stop point along the bay, east of the island centre; it sits near the
 * bay's far end so buses queueing behind a held bus still wait inside the terminal.
 */
function terminalOn(route: Route, dx: number, z: number): StopSpec {
  return { key: 'terminal', d: route.nearestD(TERMINAL_HALL.x + dx, z), kind: 'station', size: 0.9, terminal: true };
}

/**
 * Line 1: a ring route around a stylized Tashkent, with a notch on the east side
 * that wraps the central square. Stops are map points snapped to the route.
 * Coordinates: x = east, z = south; every loop is driven anticlockwise on screen.
 */
export function district1(): LineSpec {
  const route = Route.roundedPolygon(
    [
      { x: 64, z: -42 },
      // the loop into the terminal bay and back out
      { x: -4, z: -42 },
      { x: -4, z: -54 },
      { x: -28, z: -54 },
      { x: -28, z: -42 },
      { x: -36, z: -42 },
      { x: -64, z: -22 },
      { x: -64, z: 20 },
      { x: -42, z: 42 },
      { x: 38, z: 42 },
      { x: 64, z: 26 },
      { x: 64, z: 10 },
      { x: 26, z: 10 },
      { x: 26, z: -22 },
      { x: 64, z: -22 },
    ],
    9,
  );
  const at = stopsOn(route);
  const stops = [
    at('yunusobod', 44, -42, 'residential', 1.3), // big northern housing district
    at('chorsu', 22, -42, 'bazaar', 1.5), // old-town bazaar: busy all day
    terminalOn(route, -6, -54),
    at('bog', -50, -32, 'park', 0.6),
    at('universitet', -64, -2, 'university', 1.0),
    at('mahalla', -53, 31, 'residential', 0.9), // traditional low-rise neighbourhood
    at('chilonzor', -18, 42, 'residential', 1.4), // the largest housing district
    at('maktab', 18, 42, 'school', 0.8),
    at('vokzal', 51, 34, 'station', 1.0),
    at('metro', 50, 10, 'metro', 1.5), // metro transfer on the central square
    at('markaz', 42, -22, 'center', 1.4), // offices around Amir Temur square
  ];
  return { no: 1, name: 'lines.ring', color: '#ff8a3d', dark: '#d9661c', route, stops, startBuses: 5, price: 0 };
}

/**
 * Line 2: a bigger loop to the east past real Tashkent landmarks. Its west side runs
 * straight through line 1's ring, so the two lines cross at two junctions (x = 4).
 * In the north-west corner it detours through the terminal.
 */
export function district2(): LineSpec {
  const route = Route.roundedPolygon(
    [
      { x: 118, z: -78 },
      // swing west into the terminal bay, then back east onto the avenue
      { x: -30, z: -78 },
      { x: -30, z: -68 },
      { x: 4, z: -68 },
      { x: 4, z: 78 },
      { x: 92, z: 78 },
      { x: 124, z: 50 },
      { x: 124, z: -62 },
    ],
    10,
  );
  const at = stopsOn(route);
  const stops = [
    at('teleminora', 96, -78, 'sight', 0.8, 'tvtower'), // the 375 m TV tower
    at('minor', 58, -78, 'sight', 0.9, 'minor'), // white mosque on the Ankhor canal
    at('hazratimom', 20, -78, 'sight', 1.0, 'hazratimom'), // old-town religious complex
    terminalOn(route, 8, -68),
    at('navoiy', 4, 0, 'sight', 0.9, 'opera'), // Alisher Navoi opera theatre, inside line 1's ring
    at('mustaqillik', 24, 78, 'center', 1.3, 'ezgulik'), // Independence Square, ministries
    at('sergeli', 60, 78, 'residential', 1.5), // big southern housing district
    at('humo', 108, 64, 'park', 0.8, 'arena'), // Humo Arena, ice hockey and concerts
    at('tashkentcity', 124, 24, 'center', 1.5, 'tashkentcity'), // new business district
    at('olmazor', 124, -24, 'residential', 1.3),
  ];
  return { no: 2, name: 'lines.east', color: '#22b573', dark: '#178a55', route, stops, startBuses: 0, price: ROUTE_PRICE };
}

/**
 * Line 3: a compact loop through the western housing districts, beyond line 1's ring.
 * It is too far from the terminal, so its timing point is the intercity bus station
 * (real lines hold buses at a station or a lay-by the same way).
 */
export function district3(): LineSpec {
  const route = Route.roundedPolygon(
    [
      { x: -104, z: -60 },
      { x: -156, z: -60 },
      { x: -156, z: 56 },
      { x: -104, z: 56 },
    ],
    9,
  );
  const at = stopsOn(route);
  const stops = [
    at('beruniy', -128, -60, 'residential', 1.3),
    at('qoraqamish', -156, -32, 'residential', 1.4), // a big north-western housing estate
    holdAt(at('avtovokzal', -156, 4, 'station', 1.1)), // intercity bus station: the line's timing point
    at('uchtepa', -156, 36, 'residential', 1.2),
    at('farhod', -130, 56, 'bazaar', 1.2), // Farhod bazaar, a busy local market
    at('novza', -104, -24, 'metro', 1.3), // metro transfer facing line 1's ring
  ];
  return { no: 3, name: 'lines.west', color: '#8e6cf0', dark: '#6447c4', route, stops, startBuses: 0, price: ROUTE_PRICE };
}

/**
 * Line 4: the southern districts. A northern spur crosses line 2's southern avenue at two
 * junctions (x = 42 and x = 78) and loops around Sergeli, so buses take turns there.
 * Its timing point is the South railway station.
 */
export function district4(): LineSpec {
  const route = Route.roundedPolygon(
    [
      { x: 78, z: 64 },
      { x: 42, z: 64 },
      { x: 42, z: 120 },
      { x: -50, z: 120 },
      { x: -50, z: 156 },
      { x: 110, z: 156 },
      { x: 110, z: 120 },
      { x: 78, z: 120 },
    ],
    9,
  );
  const at = stopsOn(route);
  const stops = [
    at('bobur', 10, 120, 'park', 0.8), // Bobur park
    at('yakkasaroy', -20, 120, 'residential', 1.2),
    at('qoyliq', -20, 156, 'bazaar', 1.4), // Qoʻyliq farmers' market
    holdAt(at('janubiy', 30, 156, 'station', 1.0)), // South railway station: the line's timing point
    at('yangihayot', 80, 156, 'residential', 1.4), // a large new southern district
    at('bektemir', 110, 138, 'residential', 1.0),
    at('mirobod', 78, 100, 'metro', 1.1),
  ];
  return { no: 4, name: 'lines.south', color: '#3a8dde', dark: '#2468a8', route, stops, startBuses: 0, price: ROUTE_PRICE };
}

/** Every line on the map, in menu order. */
export function network(): LineSpec[] {
  return [district1(), district2(), district3(), district4()];
}
