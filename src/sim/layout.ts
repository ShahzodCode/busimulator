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
 * The bus terminal sits at the north crossing of lines 1 and 2 (x = 4, z = -42), the one
 * place every bus of both lines passes. Each line has its own platform there, and the
 * terminal hall stands on the corner plaza between them (this is the hall's centre).
 */
export const TERMINAL_HALL = { x: -11, z: -63 };

function stopsOn(route: Route) {
  return (key: string, x: number, z: number, kind: PlaceKind, size: number, landmark?: LandmarkKind): StopSpec => ({
    key,
    d: route.nearestD(x, z),
    kind,
    size,
    landmark,
  });
}

/** A line's platform at the terminal: a transfer hub, so people start and end trips there like at a station. */
function terminalOn(route: Route, x: number, z: number): StopSpec {
  return { key: 'terminal', d: route.nearestD(x, z), kind: 'station', size: 0.9, terminal: true };
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
    // just past the crossing, so a bus standing here leaves the junction free
    terminalOn(route, -14, -42),
    at('chorsu', -28, -42, 'bazaar', 1.5), // old-town bazaar: busy all day
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
 */
export function district2(): LineSpec {
  const route = Route.roundedPolygon(
    [
      { x: 118, z: -78 },
      { x: 4, z: -78 },
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
    // just before the crossing with line 1
    terminalOn(route, 4, -62),
    at('navoiy', 4, 0, 'sight', 0.9, 'opera'), // Alisher Navoi opera theatre, inside line 1's ring
    at('mustaqillik', 24, 78, 'center', 1.3, 'ezgulik'), // Independence Square, ministries
    at('sergeli', 60, 78, 'residential', 1.5), // big southern housing district
    at('humo', 108, 64, 'park', 0.8, 'arena'), // Humo Arena, ice hockey and concerts
    at('tashkentcity', 124, 24, 'center', 1.5, 'tashkentcity'), // new business district
    at('olmazor', 124, -24, 'residential', 1.3),
  ];
  return { no: 2, name: 'lines.east', color: '#22b573', dark: '#178a55', route, stops, startBuses: 0, price: ROUTE_PRICE };
}

/** Every line on the map, in menu order. */
export function network(): LineSpec[] {
  return [district1(), district2()];
}
