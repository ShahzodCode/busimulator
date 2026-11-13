# Toshkent Avtobus — CLAUDE.md

A phone-first, top-down **bus network manager** set in a stylized Tashkent. The player buys buses and routes, keeps headways short, and watches crowds react. The game exists to **teach how real public transport works** (headways, bunching, tidal commuter flows, demand ramps, operating costs) using measured data and proven fixes. It still has to feel simple and satisfying from the first minute: juicy, low-poly, *My Little Universe*-style, never a spreadsheet.

## Product rules (don't break these)

- **Uzbek first.** Every player-visible string goes through `t()` / `say()` from `src/i18n` with a key in `src/i18n/uz.json`. Never hard-code UI text in TS. Use the Uzbek Latin script with the proper `ʻ` (U+02BB) in `oʻ`, `gʻ`.
- **Teach with real data.** Numbers that model reality (demand curve, speeds, fares, fuel) come from a cited source. Put the source in a doc comment next to the constant, like `src/sim/demand.ts` does. If no real data exists, say so in the comment and explain the stand-in.
- **Simple opening, depth later.** New mechanics reveal themselves gradually (e.g. the guidebook unlocks on `BOOK_DAY = 3`; the gap overlay is off until toggled). Don't front-load numbers.
- **Progression.** The game starts with **one open route** (line 1, 5 buses). New routes cost `ROUTE_PRICE` (60M so'm, about 2 weeks of profit), open with **one bus**, and ramp ridership up over days (`NEW_LINE_RAMP` → +`NEW_LINE_RAMP_DAILY`). **Bus price is flat** (`BUS_PRICE`) and must never escalate with fleet size.
- **Stylized, not literal.** Real landmarks (TV tower, Minor mosque, Hazrati Imom, Navoi theatre, Ezgulik arch, Tashkent City, Humo Arena) appear on an invented map, not a real street layout.
- **Free tools only.** Any library, service or asset pipeline you suggest must be free or have a usable free tier.
- **Phone performance matters.** Keep draw calls low (the static city is baked by `freezeStatic`), triangle budgets small, and pixel ratio capped at 2.

## Stack and commands

- TypeScript (strict, `noUnusedLocals`), Vite, Three.js r187, GSAP for tweens, Remix Icon (inlined SVG), Google Font *Fredoka*.
- Sound is fully procedural Web Audio (`src/audio/sfx.ts`), with no audio files.
- Not a git repo yet.

```bash
npm run dev        # Vite dev server (http://localhost:5173)
npm run host       # same, exposed on LAN, for testing on a phone
npm run build      # tsc --noEmit && vite build  → dist/
npm run preview    # serve dist/
npx tsx scripts/simday.ts [days=5] [maxBuses=8] [reserve=0] [openWith=0]   # headless balance run
```

- `.claude/launch.json` defines the `game` launch config (Vite on port 5173, strict port).
- In dev, `window.game` exposes `{ world, busViews, scene, clock, rig, renderer, people, gsap, speech, floaters, sfx }` for console poking and browser-automation checks.
- **Always run `npm run build`** (it type-checks) after code changes. After any sim or economy change, also run `scripts/simday.ts`. It uses a seeded RNG, so before/after runs compare directly.
- `.env.local` holds a `V0_API_KEY`. Never print, commit or ship it. The `v0` npm dependency isn't imported anywhere in `src/`.

## Architecture

```
index.html            → loads Fredoka, src/ui/style.css, src/main.ts
src/main.ts           → composition root: renderer, scene, wiring of sim events → views/UI, main loop, intro animation
src/sim/   (pure logic, NO three.js / DOM imports — must run under tsx in Node)
  world.ts            World: stops + queues, buses, fares, costs, happiness, day summary, junction right-of-way
  bus.ts              BusSim: one bus moving along a Route (accel, corner slowdown, dwell, follow gap)
  route.ts            Route: closed polyline addressed by distance d (m); sample/wrap/nearestD/roundedPolygon
  layout.ts           LineSpec/StopSpec + the map: district1() (ring, open), district2() (east loop, for sale); network()
  demand.ts           hourly demand curve (measured), trips/min, rush-hour test, traffic speed factor
  passengers.ts       personas (worker, student, pupil, shopper, elder, visitor), place kinds, gravity-model trip picking
  clock.ts            GameClock: 06:00–22:00 day, speed multiplier, day counter
src/view/  (three.js; reads sim state, never mutates it)
  city.ts             builds the island, roads, stops, landmarks, buildings, trees from LineDefs; LANE_OFFSET/ROAD_HALF
  busView.ts          bus GLB instance following a BusSim (lean, doors, appear/leave tweens); line colour repaint
  peopleView.ts       instanced passengers: queues, walking, boarding/alighting, persona looks
  gapOverlay.ts       optional road paint by gap length (GAP_COLOR good/ok/bad) + minute labels
  cameraRig.ts        fixed-angle diorama camera: drag pan, wheel/pinch zoom, smoothing
  lighting.ts         day-cycle sun/sky colours keyed by hour
  props.ts            loads public/models/props.glb (shelter + tree species), swaps to shared palette materials
  palette.ts          shared colours C and cached materials mat()
  freeze.ts           bakes static meshes into one mesh per material after the intro
src/ui/    (DOM overlay in #hud; plain TS + CSS, no framework)
  hud.ts              clock, mood, waiting count, money, speed button (SPEEDS = 1, 2, 4, 8); formatMoney
  menu.ts             bottom dock, toasts, opens sheets; MenuHandlers callbacks to main.ts
  sheet.ts            slide-up panel base (one open at a time; game keeps running)
  linesPanel.ts       per-line card: live strip of bus gaps, buy/sell bus, buy route
  guidebook.ts        lessons book (unlocks at BOOK_DAY)
  dayCard.ts          end-of-day results + one real-world tip chosen by pickTip()
  speech.ts           rate-limited funny passenger lines that hint at the real problem
  floaters.ts         DOM labels pinned to 3D points (pop-ups and persistent tags)
  icons.ts            Remix Icon SVGs imported with ?raw. Add new icons here.
  style.css           all UI styling
src/i18n/  index.ts (t, lines, say) + uz.json
src/audio/sfx.ts      procedural sounds, throttled per type
scripts/simday.ts     headless multi-day balance simulation
art/                  Blender sources + build_props.py (generates props)
public/models/        bus.glb, props.glb (what the game loads)
```

### Sim/view contract

- `World` is the single source of truth. Views and UI **subscribe to `world.events`** (`spawn`, `board`, `alight`, `giveUp`, `leftBehind`, `skipped`, `fare`, `arrive`, `depart`, `busAdded`, `busRemoved`, `lineOpened`) and read state each frame. They never mutate it. Player actions go through `World` methods (`buyBus`, `sellBus`, `openLine`).
- Nothing in `src/sim/` may import three.js, the DOM, i18n or the UI. `scripts/simday.ts` depends on that.
- Stops are addressed by **global index into `world.stops`**. Lines hold `stops: number[]` in driving order. Positions along a road are distance `d` in metres, wrapped with `route.wrap()`.
- Coordinates: x = east, z = south. All loops drive anticlockwise on screen.

### Time

- 1 simulated second = 1 game minute (`GameClock.BASE_RATE = 1`). Service day is 06:00–22:00.
- The main loop sub-steps the sim at ≤ 0.02 sim-s per step, so 8x stays stable. `realDt` is clamped to 0.05.
- At `DAY_END` the sim freezes, `world.endDay()` charges costs, adjusts `demandMult` from average happiness (clamped 0.6–1.8), clears queues and respaces buses. Then the day card shows, and `clock.nextDay()` runs when it's dismissed.

## Simulation model (what the game teaches)

| Concept | Where | Notes |
|---|---|---|
| Demand by hour | `demand.ts` `HOURLY_BOARDINGS` | Shape from MTA weekday hourly ridership (data.ny.gov `kv7t-n8in`), because Tashkent publishes only daily totals. Peaks 07–09 and 15–18. `DAILY_TRIPS = 2100` network-wide. |
| Traffic | `trafficFactor()` | Up to −35% speed at peak; anchored on Tashkent's 18.7 vs 24.1 km/h bus-priority figures. |
| Who travels where | `passengers.ts` | Personas with share, patience range, crowd tolerance, board time, home/destination weights, departure waves (gravity model, productions → attractions; two-shift schools). |
| Stop popularity | `StopSpec.size`, `kind` | Bigger places produce/attract more trips. Line `demandShare` = its total stop size / line 1's. |
| Boarding | `World.boarding()` | Alight first, then board while `load < p.crowd`. Crowded buses board slower. Full bus → `leftBehind` (+8 min penalty). Choosing to skip a crowded bus → +3 min. |
| Giving up | `World.patience()` | Wait + penalty ≥ patience → takes a taxi (`giveUp`), hurting happiness. |
| Happiness | `World.rate()` | Each rider nudges the meter 2% toward their experience score. |
| Headway/bunching | `headway()`, `gaps()`, `GAP_GOOD=10`, `GAP_BAD=20` min | New buses are inserted into the biggest gap. Buses keep `FOLLOW_GAP` and give way at junctions with other lines. |
| Economy | `world.ts` constants | `FARE` 2 000 so'm, `BUS_PRICE` 25M, sell refund 50%, `DAILY_FIXED_COST` 270k/bus, diesel 12 000 so'm/L at 0.38 L/km (+35% fully loaded, plus idle burn), `START_MONEY` 30M, `MAX_BUSES` 30, `BUS_CAPACITY` 30. |
| New routes | `layout.ts` `ROUTE_PRICE`, `NEW_LINE_RAMP*` | 25% ridership on day one, +10%/day to 100%. |
| Terminal holding | `World.slotReady()`, `TERMINAL_*` | Shared terminal at the north crossing (`TERMINAL_HALL`, stops with `terminal: true`). Every bus stands ≥ `TERMINAL_LAYOVER` (2 min), then leaves once the time since the previous bus left ≥ the time until the next bus arrives (capped at `TERMINAL_MAX_HOLD` = 8 min). Riders keep boarding while it waits. Cuts the line 1 gap spread from ~45% to ~15% in `simday`. |

Lines don't share stops and riders **don't transfer** between lines yet. Transfers are the natural next "network" lesson.

## Map and content

- **Line 1 "ring"** (`#ff8a3d`, the bus model's own orange; open, 5 buses): Yunusobod, Chorsu, Bog', Universitet, Mahalla, Chilonzor, Maktab, Vokzal, Metro, Markaz.
- **Line 2 "east"** (`#22b573`, for sale): TV tower, Minor, Hazrati Imom, Navoiy (inside the ring), Mustaqillik, Sergeli, Humo, Tashkent City, Olmazor. Crosses line 1 at two junctions (x = 4).
- **Terminal** (`stop.terminal`): one hall on the NW corner of the north crossing (x = 4, z = −42), with a platform for each line (line 1 just past the crossing, line 2 just before it). Buses are held there to even out headways.
- **Adding a line:** add a `districtN()` in `layout.ts` (route via `Route.roundedPolygon`, stops via `stopsOn(route)`, `startBuses: 0`, `price: ROUTE_PRICE`), add it to `network()`, add `stop.<key>` and `lines.<name>` keys to `uz.json`, and add any new `LandmarkKind` builder in `city.ts`. Buses on lines other than line 1 are repainted in the line colour automatically.
- **Adding a stop name, speech line or tip:** edit `uz.json`. Key groups: `hud.`, `menu.`, `lines.`, `fleet.`, `gaps.`, `day.`, `tip.`, `book.`, `float.`, `say.` (arrays; `say.<key>.<stopKey>` gives stop-specific variants picked half the time), `stop.`, `settings.`, `game.`.
- **Day-card tips** (`dayCard.ts` `pickTip`) must explain a *real* transit cause and fix (tidal flow, bunching, headway, costs, new-line ramp, …), triggered by what actually happened that day.

## 3D assets

- `public/models/bus.glb` is the orange low-poly bus (source `art/bus.blend`; also in the user's Blender scene as a `Bus` empty with separate parts).
- `public/models/props.glb` (bus-stop shelter + 11 tree species) is **generated** by `art/build_props.py`. Don't hand-edit the GLB. Edit the script and re-run:
  ```
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python art/build_props.py
  ```
  Conventions: one root Empty per asset (`BusStop`, `Tree_<kind>`), one mesh child per material, a small colour count (materials are swapped for palette materials by colour), trees < ~600 tris, shelter < ~1500. Blender is Z-up; the shelter's road side faces −Y.
- Prefer the Blender MCP for new 3D assets when it's running. Otherwise use headless Blender scripts like the one above.
- Buildings, roads, landmarks and the island are built procedurally in `src/view/city.ts` with `RoundedBoxGeometry` and palette materials.

## Look and feel

- Soft pastel palette (`palette.ts`), matte materials, PCF soft shadows, ACES tone mapping, Fredoka font.
- Everything that appears should *pop* with GSAP: `back.out` / `elastic.out` scales, staggered waves. The intro raises the island, pops props from the centre outward, then freezes the static city.
- Feedback for every economic event: coin pop + `sfx.coin()` on fares, toasts on purchases, emoji crowd tags (🙂 😐 😠) on stops, bus load tags (`n/30`, busy/full colours).
- UI is DOM over the canvas. Sheets slide up while the game keeps running, and the map stays draggable. Keep touch targets large. Test at phone width and with `npm run host` on a real phone.

## Code conventions

- Match the existing style: small classes or modules, named exports, short doc comments that explain *why* (often the real-world reason), no framework.
- Gameplay tunables are `UPPER_SNAKE` constants at the top of their module, each with a comment giving units and source.
- Units: money in so'm (integers), distance in metres, sim time in game minutes, hours as fractional `hour`.
- Keep `src/sim` deterministic given `world.rng` (don't call `Math.random()` directly in the sim).
- Don't add dependencies casually. If you must, they need to be free/OSS and light enough for phones.

## Verifying changes

1. `npm run build`: must pass type-checking.
2. Sim/economy changes: `npx tsx scripts/simday.ts 10 12` (or similar). Check served, taxis by hour, headways, profit and money trend. A good network should take about 2 weeks of profit to afford a new route.
3. Visual/UI changes: `npm run dev`, then check in the browser (desktop and phone width). Use `window.game` to jump time (`game.clock.speed = 8`) or inspect state.
