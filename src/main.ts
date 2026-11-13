import * as THREE from 'three';
import gsap from 'gsap';
import { t } from './i18n';
import { network, TERMINAL_HALL } from './sim/layout';
import { GameClock } from './sim/clock';
import { BUS_PRICE, FARE, SELL_REFUND, World } from './sim/world';
import { buildCity, LineDef, popTargets, StopDef } from './view/city';
import { BusView, loadBusModel } from './view/busView';
import { loadProps } from './view/props';
import { CameraRig } from './view/cameraRig';
import { DayLighting } from './view/lighting';
import { PeopleView } from './view/peopleView';
import { freezeStatic } from './view/freeze';
import { Hud, formatMoney } from './ui/hud';
import { Floaters } from './ui/floaters';
import { GameMenu } from './ui/menu';
import { GapOverlay } from './view/gapOverlay';
import { showDayCard } from './ui/dayCard';
import { Speech } from './ui/speech';
import { sfx } from './audio/sfx';

const app = document.getElementById('app')!;
const hudRoot = document.getElementById('hud')!;
const loading = document.createElement('div');
loading.id = 'loading';
loading.textContent = t('loading');
document.body.appendChild(loading);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const rig = new CameraRig(renderer.domElement);
const lighting = new DayLighting(scene);
const clock = new GameClock();

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  rig.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

// ---------- world ----------
const lineSpecs = network();
const lineDefs: LineDef[] = lineSpecs.map((l) => ({
  route: l.route,
  color: l.color,
  open: l.price === 0,
  stops: l.stops.map((s): StopDef => ({ key: s.key, name: t(`stop.${s.key}`), d: s.d, kind: s.kind, size: s.size, landmark: s.landmark, terminal: s.terminal })),
}));
// shelters and trees are Blender models (art/build_props.py); the city is built from them
await loadProps(`${import.meta.env.BASE_URL}models/props.glb`);
const city = buildCity(lineDefs, { ...TERMINAL_HALL, name: t('stop.terminal') });
scene.add(city.group);
rig.fit(city.centre, city.half);

const busViews = new Map<number, BusView>();
const busTags = new Map<number, HTMLElement>();
const world = new World(lineSpecs);
const people = new PeopleView(world, busViews);
scene.add(people.group);
const hud = new Hud(hudRoot, clock, world);
const floaters = new Floaters(document.body, rig.camera);
const busTop = (v: BusView) => v.root.position.clone().setY(3.3);
const speech = new Speech(world, people, floaters);

// ---------- fleet: views follow the sim's buses ----------
let introDone = false;
world.events.busAdded = (bus) => {
  // line 1 keeps the model's own orange; other lines are repainted in their colour
  const view = new BusView(bus.sim, bus.line === 0 ? undefined : lineSpecs[bus.line].color);
  busViews.set(bus.id, view);
  scene.add(view.root);
  busTags.set(bus.id, floaters.tag('bus-load', () => busTop(view)));
  if (introDone) {
    view.appear();
    sfx.buy();
    setTimeout(() => sfx.horn(), 450);
    floaters.pop(busTop(view).setY(4.5), `🚌 ${t('float.newBus')}`, 'coin-pop', 1.8);
  }
};
world.events.busRemoved = (bus) => {
  const view = busViews.get(bus.id);
  const tag = busTags.get(bus.id);
  busViews.delete(bus.id);
  busTags.delete(bus.id);
  if (tag) floaters.untag(tag);
  view?.leave().then(() => scene.remove(view.root));
};

// every line's road painted by how far apart its buses are (off until switched on in the dock)
const gapOverlays = world.lines.map((_, i) => new GapOverlay(world, floaters, i));
for (const g of gapOverlays) scene.add(g.mesh);

const menu = new GameMenu(hudRoot, world, clock, {
  onBuy: (line) => {
    world.buyBus(line);
    hud.bumpMoney();
  },
  onSell: (line) => {
    const bus = world.sellBus(line);
    const view = bus && busViews.get(bus.id);
    if (view) floaters.pop(busTop(view).setY(4.5), `${t('float.sold')} +${formatMoney(BUS_PRICE * SELL_REFUND)}`, 'coin-pop', 1.8);
    if (bus) sfx.sell();
    hud.bumpMoney();
  },
  onDenied: () => {
    hud.denyMoney();
    sfx.deny();
  },
  onOpenLine: (line) => {
    world.openLine(line);
    hud.bumpMoney();
  },
  onGaps: (on) => gapOverlays.forEach((g) => g.set(on)),
});

// ---------- routes for sale ----------
// a lock sign floats over each route that hasn't been bought yet
const lockTags = new Map<number, HTMLElement>();
world.lines.forEach((L, i) => {
  if (L.open) return;
  const s = L.route.sample(world.stops[L.stops[0]].d);
  const el = floaters.tag('line-lock', () => new THREE.Vector3(s.x, 3, s.z));
  el.style.setProperty('--line-1', L.spec.color);
  el.textContent = `🔒 ${L.spec.no} · ${t(L.spec.name)}`;
  lockTags.set(i, el);
});
world.events.lineOpened = (line) => {
  const L = world.lines[line];
  const tag = lockTags.get(line);
  if (tag) floaters.untag(tag);
  lockTags.delete(line);
  // the new stops pop up one after another along the route
  L.stops.forEach((si, k) => {
    const obj = city.stopObjects[si];
    const s = obj.scale.clone();
    obj.visible = true;
    obj.scale.setScalar(0.001);
    gsap.to(obj.scale, { x: s.x, y: s.y, z: s.z, duration: 0.55, delay: 0.15 + k * 0.12, ease: 'back.out(2.2)' });
  });
  sfx.star(2);
  menu.toast(t('lines.opened', { name: t(L.spec.name) }), 'map-pin-add-fill');
};

// ---------- passengers ----------
world.events.spawn = (p, i) => people.spawn(p, i);
world.events.board = (p, bus) => {
  speech.boarded(p);
  people.board(p, bus.id);
};
world.events.alight = (p, bus, i) => people.alight(p, bus.id, i);
world.events.fare = (bus) => {
  const v = busViews.get(bus.id);
  if (!v) return;
  floaters.pop(v.doorWorld().clone().setY(2.2), `+${formatMoney(FARE)}`, 'coin-pop', 1.0);
  hud.bumpMoney();
  sfx.coin();
};
world.events.giveUp = (p, i) => {
  people.giveUp(p, i);
  floaters.pop(people.stopFront(i), `🚕 ${t('float.taxi')}`, 'bad', 1.6);
  speech.gaveUp(p);
  sfx.angry();
};
world.events.leftBehind = (_bus, i) => {
  floaters.pop(people.stopFront(i).setY(3), `😤 ${t('float.full')}`, 'bad', 1.8);
  speech.leftBehind(i);
};
world.events.skipped = (_bus, i, waiting) => speech.skipped(i, waiting);
world.events.arrive = (bus, i) => {
  busViews.get(bus.id)?.arrive();
  sfx.door();
  const board = city.stopObjects[i].userData.board as THREE.Object3D;
  const base = (board.userData.base ??= board.scale.clone()) as THREE.Vector3;
  gsap.fromTo(board.scale, { x: base.x * 1.25, y: base.y * 1.25 }, { x: base.x, y: base.y, duration: 0.5, ease: 'back.out(3)' });
};
world.events.depart = (bus) => busViews.get(bus.id)?.depart();
// the terminal held a bus back so it leaves halfway between the bus ahead and the bus behind
world.events.released = (bus, _i, minutes) => {
  const v = busViews.get(bus.id);
  if (v && minutes >= 0.5) floaters.pop(busTop(v).setY(4.5), t('float.held', { m: Math.round(minutes) }), 'held-pop', 1.8);
};

// ---------- day cycle ----------
let dayCardOpen = false;
function endOfDay(): void {
  dayCardOpen = true;
  const summary = world.endDay(clock.day);
  people.sendHome();
  showDayCard(summary).then(() => {
    clock.nextDay();
    dayCardOpen = false;
  });
}

// ---------- main loop ----------
async function start(): Promise<void> {
  await loadBusModel(`${import.meta.env.BASE_URL}models/bus.glb`);
  world.addStartBuses();
  const firstViews = world.buses.map((b) => busViews.get(b.id)!.root);

  const stopTags = world.stops.map((_, i) => floaters.tag('stop-crowd', () => people.stopFront(i).setY(2.6)));
  const MOOD_EMOJI = { happy: '🙂', ok: '😐', angry: '😠' } as const;

  if (import.meta.env.DEV) Object.assign(window, { game: { world, busViews, scene, clock, rig, renderer, people, gsap, speech, floaters, sfx } });

  intro(firstViews);
  gsap.to(loading, { opacity: 0, duration: 0.4, onComplete: () => loading.remove() });

  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // sim: sub-step so 16x stays stable; frozen while the day card is up
    if (!clock.dayOver) {
      const simDt = realDt * clock.speed;
      const steps = Math.max(1, Math.ceil(simDt / 0.02));
      for (let i = 0; i < steps && !clock.dayOver; i++) {
        const dt = simDt / steps;
        clock.update(dt);
        world.step(dt, dt * GameClock.BASE_RATE, clock.hour);
      }
    }
    if (clock.dayOver && !dayCardOpen) endOfDay();

    for (const bus of world.buses) {
      const view = busViews.get(bus.id);
      const tag = busTags.get(bus.id);
      if (!view || !tag) continue;
      view.update(realDt);
      const load = bus.onboard.length;
      tag.textContent = bus.retiring ? `👋 ${load}` : bus.holding ? `⏱ ${load}/${bus.capacity}` : `${load}/${bus.capacity}`;
      tag.className = `tag bus-load${bus.retiring ? ' retiring' : bus.holding ? ' holding' : load >= bus.capacity ? ' full' : load >= bus.capacity * 0.7 ? ' busy' : ''}`;
    }
    people.update(realDt, dayCardOpen ? 1 : clock.speed);
    if (!dayCardOpen && clock.speed > 0) speech.update(realDt);
    rig.update(realDt);
    lighting.update(clock.hour, rig.focus, rig.distance * 0.55);
    hud.update(realDt);
    menu.update();
    for (const g of gapOverlays) g.update(realDt);
    floaters.update(realDt);

    world.stops.forEach((s, i) => {
      const el = stopTags[i];
      if (s.queue.length === 0) {
        el.style.visibility = 'hidden';
        return;
      }
      // the crowd shows the mood of its unhappiest third
      const moods = s.queue.map((p) => world.moodOf(p));
      const angry = moods.filter((m) => m === 'angry').length;
      const ok = moods.filter((m) => m === 'ok').length;
      const mood = angry * 3 >= moods.length ? 'angry' : (angry + ok) * 3 >= moods.length ? 'ok' : 'happy';
      el.style.visibility = '';
      el.textContent = `${MOOD_EMOJI[mood]} ${s.queue.length}`;
      el.className = `tag stop-crowd ${mood}`;
    });

    renderer.render(scene, rig.camera);
  });
}

/** Satisfying entrance: the island rises, then every prop pops up in a wave from the centre. */
function intro(buses: THREE.Object3D[]): void {
  city.group.position.y = -12;
  gsap.to(city.group.position, { y: 0, duration: 1.1, ease: 'back.out(1.4)' });
  const sorted = [...popTargets].sort((a, b) => a.position.length() - b.position.length());
  const maxR = sorted.length ? sorted[sorted.length - 1].position.length() : 1;
  const wave = 1.2; // seconds for the pop wave to reach the island edge
  sorted.forEach((o) => {
    const s = o.scale.clone();
    o.scale.setScalar(0.001);
    const delay = 0.5 + (o.position.length() / maxR) * wave;
    gsap.to(o.scale, { x: s.x, y: s.y, z: s.z, duration: 0.55, delay, ease: 'back.out(2.2)' });
  });
  // once everything has landed, bake the static city into a few big meshes
  gsap.delayedCall(0.5 + wave + 0.6, () => {
    freezeStatic(city.group);
    introDone = true;
  });
  buses.forEach((bus, i) => {
    const bs = bus.scale.clone();
    bus.scale.setScalar(0.001);
    gsap.to(bus.scale, { x: bs.x, y: bs.y, z: bs.z, duration: 0.8, delay: 0.6 + wave + i * 0.12, ease: 'elastic.out(1, 0.5)' });
  });
}

start().catch((err) => {
  console.error(err);
  loading.textContent = String(err);
});
