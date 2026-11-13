import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Route } from '../sim/route';
import { PlaceKind } from '../sim/passengers';
import { LandmarkKind } from '../sim/layout';
import { C, mat } from './palette';
import { freezeStatic } from './freeze';
import { prop, tree, TreeKind, TREE_R } from './props';

export const ROAD_HALF = 3.2;
export const LANE_OFFSET = 1.6;
const SIDEWALK_OUT = 5.6;

/** Everything that should "pop" in during the intro animation. */
export const popTargets: THREE.Object3D[] = [];

function mesh(geo: THREE.BufferGeometry, color: number, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

function rbox(w: number, h: number, d: number, color: number, r = 0.2): THREE.Mesh {
  // thin trims get the cheapest rounding: the big map has hundreds of these
  const m = mesh(new RoundedBoxGeometry(w, h, d, r <= 0.12 ? 1 : 2, Math.min(r, w / 2, h / 2, d / 2)), color);
  m.position.y = h / 2;
  return m;
}

/** A flat ribbon following the route between two signed lateral offsets. */
function ribbon(route: Route, inner: number, outer: number, y: number, color: number): THREE.Mesh {
  const n = route.pts.length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const s = route.sample(route.cum[i % n] + 1e-4);
    const a = Route.right(s, inner);
    const b = Route.right(s, outer);
    pos.push(a.x, y, a.z, b.x, y, b.z);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face up regardless of winding
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const m = new THREE.Mesh(g, mat(color));
  m.material.side = THREE.DoubleSide;
  m.receiveShadow = true;
  return m;
}

function dashes(route: Route, y: number): THREE.InstancedMesh {
  const dash = 1.6;
  const gap = 1.6;
  const count = Math.floor(route.length / (dash + gap));
  const geo = new THREE.BoxGeometry(dash, 0.02, 0.18);
  const im = new THREE.InstancedMesh(geo, mat(C.roadLine), count);
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const s = route.sample(i * (dash + gap));
    o.position.set(s.x, y, s.z);
    o.rotation.set(0, Math.atan2(-s.tz, s.tx), 0);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  }
  im.receiveShadow = true;
  return im;
}

// ---------- props ----------

/** plain boxes: the big map has thousands of windows */
const WINDOW_GEO = new THREE.BoxGeometry(0.62, 0.72, 0.08);

function windowsOn(g: THREE.Group, w: number, d: number, floors: number, floorH: number, perRow: number): void {
  const geo = WINDOW_GEO;
  const frontZ = d / 2 + 0.02;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < perRow; i++) {
      const x = -w / 2 + (w / perRow) * (i + 0.5);
      const y = 0.9 + f * floorH;
      for (const side of [1, -1]) {
        const win = mesh(geo, C.window, false);
        win.position.set(x, y, side * frontZ);
        g.add(win);
      }
    }
  }
}

/** Soviet-era panel apartment block with pastel paint and a flat roof. */
function apartment(w: number, d: number, floors: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const floorH = 1.25;
  const h = floors * floorH + 0.3;
  g.add(rbox(w, h, d, color, 0.25));
  const roof = rbox(w + 0.25, 0.3, d + 0.25, C.cream, 0.12);
  roof.position.y = h + 0.05;
  g.add(roof);
  windowsOn(g, w, d, floors, floorH, Math.max(2, Math.round(w / 1.4)));
  // little balcony stripes for the "panelka" feel
  for (let f = 1; f < floors; f++) {
    const b = rbox(w * 0.9, 0.12, 0.35, C.windowFrame, 0.05);
    b.position.set(0, f * floorH + 0.25, d / 2 + 0.12);
    g.add(b);
  }
  return g;
}

/** Bazaar hall with a big turquoise dome, inspired by Chorsu. */
function bazaar(): THREE.Group {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(4.2, 4.5, 3, 24), C.peach);
  base.position.y = 1.5;
  g.add(base);
  const band = mesh(new THREE.CylinderGeometry(4.35, 4.35, 0.4, 24), C.turquoiseDeep);
  band.position.y = 3.0;
  g.add(band);
  const dome = mesh(new THREE.SphereGeometry(3.9, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), C.turquoise);
  dome.position.y = 3.2;
  dome.scale.y = 0.75;
  g.add(dome);
  const tip = mesh(new THREE.SphereGeometry(0.35, 12, 8), C.gold);
  tip.position.y = 6.25;
  g.add(tip);
  // arches around the base
  const arch = new RoundedBoxGeometry(1.1, 1.8, 0.3, 2, 0.12);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = mesh(arch, C.turquoiseDeep, false);
    m.position.set(Math.cos(a) * 4.42, 1.1, Math.sin(a) * 4.42);
    m.rotation.y = -a + Math.PI / 2;
    g.add(m);
  }
  // fruit stalls out front
  const colors = [C.red, C.gold, 0xff9c3d];
  for (let i = 0; i < 3; i++) {
    const stall = new THREE.Group();
    stall.add(rbox(1.4, 0.8, 0.9, C.wood, 0.1));
    const awning = rbox(1.6, 0.12, 1.1, i % 2 ? C.red : C.cream, 0.05);
    awning.position.y = 1.7;
    stall.add(awning);
    for (const px of [-0.65, 0.65]) {
      const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), C.wood);
      pole.position.set(px, 1.2, 0.45);
      stall.add(pole);
    }
    const fruit = mesh(new THREE.IcosahedronGeometry(0.42, 1), colors[i]);
    fruit.position.y = 0.95;
    fruit.scale.set(1.2, 0.5, 0.8);
    stall.add(fruit);
    stall.position.set(-2 + i * 2, 0, 5.4);
    g.add(stall);
  }
  return g;
}

/** Metro entrance pavilion with the blue "M" sign. */
function metro(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(4.2, 2.4, 3, C.cream, 0.3));
  const roof = rbox(4.8, 0.35, 3.6, C.metroBlue, 0.15);
  roof.position.y = 2.5;
  g.add(roof);
  const door = rbox(1.6, 1.7, 0.2, C.window, 0.1);
  door.position.set(0, 0.85, 1.5);
  g.add(door);
  const pole = mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), 0xdddddd);
  pole.position.set(2.8, 1.6, 1.6);
  g.add(pole);
  const sign = mesh(new THREE.SphereGeometry(0.55, 16, 12), C.metroBlue);
  sign.scale.z = 0.35;
  sign.position.set(2.8, 3.5, 1.6);
  g.add(sign);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), new THREE.MeshBasicMaterial({ map: textTexture('M', '#ffffff', 'transparent', 200), transparent: true }));
  m.position.set(2.8, 3.5, 1.81);
  m.userData.dynamic = true; // keeps its texture coordinates when the city is baked
  g.add(m);
  return g;
}

/** Bus stop shelter (Blender model: curved canopy, glass, bench, advert box, route sign) with a name board in the line's colour. */
function busStop(name: string, color: string): THREE.Group {
  const g = stopBoard(name, color, 3.4);
  g.add(prop('BusStop'));
  return g;
}

/** A stop's name board in the line's colour, `y` metres up (a sprite, so it always faces the camera). */
function stopBoard(name: string, color: string, y: number): THREE.Group {
  const g = new THREE.Group();
  const tex = textTexture(name, '#ffffff', color, 96);
  const board = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  const img = tex.image as HTMLCanvasElement;
  board.scale.set((1.0 * img.width) / img.height, 1.0, 1);
  board.position.set(0, y, 0.2);
  board.renderOrder = 10;
  g.add(board);
  g.userData.board = board;
  return g;
}

function textTexture(text: string, fg: string, bg: string, size: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d')!;
  ctx.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width + size * 0.9);
  c.width = Math.max(w, size * 3);
  c.height = Math.ceil(size * 1.4);
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    const r = c.height / 2.6;
    ctx.beginPath();
    ctx.roundRect(0, 0, c.width, c.height, r);
    ctx.fill();
  }
  ctx.font = `700 ${size}px Fredoka, "Trebuchet MS", sans-serif`;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Bus terminal (Blender model "Terminal": island platform, glass waiting hall, see-through half-round roof on four pipes,
 * departure boards, clock tower, painted bus stands on both bays) with its name above the tower.
 * Centred on the island, which runs along x; the clock tower stands at its west end.
 */
function terminalHall(name: string): THREE.Group {
  const g = prop('Terminal');
  const sign = textTexture(name, '#ffffff', '#1f9fb8', 96);
  const board = new THREE.Sprite(new THREE.SpriteMaterial({ map: sign, transparent: true }));
  const img = sign.image as HTMLCanvasElement;
  board.scale.set((1.6 * img.width) / img.height, 1.6, 1);
  board.position.set(-10.6, 12.4, 0);
  board.renderOrder = 10;
  g.add(board);
  return g;
}

/** Wooden tea-house platform (topchan / so'ri) with a little table — park centrepiece. */
function topchan(): THREE.Group {
  const g = new THREE.Group();
  const deck = rbox(3, 0.25, 2.2, C.wood, 0.08);
  deck.position.y = 0.6;
  g.add(deck);
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [-1.3, 0.9], [1.3, 0.9]]) {
    const leg = mesh(new THREE.BoxGeometry(0.18, 0.6, 0.18), C.trunk);
    leg.position.set(x, 0.3, z);
    g.add(leg);
  }
  const rug = rbox(2.6, 0.06, 1.8, C.red, 0.03);
  rug.position.y = 0.76;
  g.add(rug);
  const table = rbox(1.1, 0.25, 0.7, C.wood, 0.06);
  table.position.y = 0.92;
  g.add(table);
  const pot = mesh(new THREE.SphereGeometry(0.17, 12, 8), C.turquoise);
  pot.position.y = 1.18;
  g.add(pot);
  return g;
}

function fountain(): THREE.Group {
  const g = new THREE.Group();
  const rim = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.6, 28), C.cream);
  rim.position.y = 0.3;
  g.add(rim);
  const water = mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.1, 28), C.water, false);
  water.position.y = 0.58;
  g.add(water);
  const col = mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.4, 12), C.cream);
  col.position.y = 1.0;
  g.add(col);
  const bowl = mesh(new THREE.SphereGeometry(0.75, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.turquoise);
  bowl.rotation.x = Math.PI;
  bowl.position.y = 1.9;
  g.add(bowl);
  return g;
}

/** School (maktab): low wide building with a flag. */
function school(): THREE.Group {
  const g = apartment(10, 5, 2, 0xffe08a);
  const flagPole = mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.5, 8), 0xdddddd);
  flagPole.position.set(6, 2.25, 3.4);
  g.add(flagPole);
  const flag = rbox(1.4, 0.8, 0.05, C.turquoise, 0.02);
  flag.position.set(6.75, 3.9, 3.4);
  g.add(flag);
  return g;
}

/** University: long hall with a colonnade, a pediment and a small turquoise dome. */
function university(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(15, 4.2, 5.5, C.cream, 0.25));
  const cornice = rbox(15.5, 0.4, 6, C.peach, 0.12);
  cornice.position.y = 4.2;
  g.add(cornice);
  windowsOn(g, 15, 5.5, 2, 1.7, 9);
  const porch = rbox(7, 0.3, 2.4, C.curb, 0.08);
  porch.position.set(0, 0.15, 3.6);
  g.add(porch);
  for (let i = 0; i < 6; i++) {
    const col = mesh(new THREE.CylinderGeometry(0.24, 0.28, 3.6, 10), C.windowFrame);
    col.position.set(-3 + i * 1.2, 2.1, 4.3);
    g.add(col);
  }
  const lintel = rbox(7.4, 0.5, 2.6, C.cream, 0.1);
  lintel.position.set(0, 3.9, 3.6);
  g.add(lintel);
  const gable = rbox(7.4, 0.9, 2.6, C.peach, 0.3);
  gable.position.set(0, 4.4, 3.6);
  gable.scale.x = 0.7;
  g.add(gable);
  const drum = mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.8, 16), C.cream);
  drum.position.y = 5;
  g.add(drum);
  const dome = mesh(new THREE.SphereGeometry(1.5, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), C.turquoise);
  dome.position.y = 5.4;
  g.add(dome);
  return g;
}

/** Railway station: wide hall with a tall arched entrance and a clock tower. */
function station(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(16, 3.4, 5, C.peach, 0.25));
  const roof = rbox(16.6, 0.4, 5.6, C.terracotta, 0.12);
  roof.position.y = 3.4;
  g.add(roof);
  windowsOn(g, 16, 5, 2, 1.4, 10);
  g.add(rbox(5, 5, 5.6, C.cream, 0.3));
  const arch = rbox(2.6, 3.4, 0.3, C.window, 0.9);
  arch.position.set(0, 1.7, 2.8);
  g.add(arch);
  const tower = rbox(2, 8.5, 2, C.cream, 0.2);
  tower.position.x = 6;
  g.add(tower);
  const cap = mesh(new THREE.ConeGeometry(1.6, 1.8, 4), C.terracotta);
  cap.rotation.y = Math.PI / 4;
  cap.position.set(6, 9.4, 0);
  g.add(cap);
  const clock = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 20), C.windowFrame, false);
  clock.rotation.x = Math.PI / 2;
  clock.position.set(6, 7.2, 1.05);
  g.add(clock);
  const hand = rbox(0.08, 0.5, 0.06, C.road, 0.02);
  hand.position.set(6, 7.2, 1.13);
  g.add(hand);
  return g;
}

/** City centre: glass office towers around a square with a statue on a plinth. */
function centre(): THREE.Group {
  const g = new THREE.Group();
  const towers: [number, number, number, number, number, number][] = [
    [-5.5, -2.5, 4.2, 13, 4.2, C.sky],
    [-0.4, -3.2, 4.6, 17, 4.6, C.turquoise],
    [5, -2.4, 4, 10.5, 4, C.mint],
  ];
  for (const [x, z, w, h, d, color] of towers) {
    const t = new THREE.Group();
    t.add(rbox(w, h, d, color, 0.3));
    for (let y = 1.6; y < h - 0.6; y += 1.5) {
      const band = rbox(w + 0.08, 0.16, d + 0.08, C.windowFrame, 0.04);
      band.position.y = y;
      t.add(band);
    }
    const top = rbox(w * 0.7, 0.6, d * 0.7, C.cream, 0.15);
    top.position.y = h;
    t.add(top);
    t.position.set(x, 0, z);
    g.add(t);
  }
  const plaza = mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.1, 28), C.sidewalk, false);
  plaza.position.set(0, 0.06, 4.2);
  g.add(plaza);
  const plinth = mesh(new THREE.CylinderGeometry(1, 1.25, 1.8, 14), C.cream);
  plinth.position.set(0, 0.9, 4.2);
  g.add(plinth);
  const rider = mesh(new THREE.CapsuleGeometry(0.42, 1.1, 4, 10), C.gold);
  rider.position.set(0, 2.75, 4.2);
  g.add(rider);
  return g;
}

/** Park gate: a little Ferris wheel, the landmark of any Tashkent park. */
function ferrisWheel(): THREE.Group {
  const g = new THREE.Group();
  const R = 3.6;
  const hubY = 4.6;
  for (const z of [-0.7, 0.7]) {
    for (const lean of [-1, 1]) {
      const leg = mesh(new THREE.CylinderGeometry(0.12, 0.16, 5, 6), C.windowFrame);
      leg.position.set(lean * 0.8, 2.35, z);
      leg.rotation.z = lean * 0.33;
      g.add(leg);
    }
  }
  const rim = mesh(new THREE.TorusGeometry(R, 0.13, 6, 28), C.red);
  rim.position.y = hubY;
  g.add(rim);
  const colors = [C.gold, C.turquoise, C.red, C.mint, C.peach, C.metroBlue, C.gold, C.turquoise];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spoke = mesh(new THREE.CylinderGeometry(0.05, 0.05, R, 5), C.windowFrame, false);
    spoke.position.set((Math.cos(a) * R) / 2, hubY + (Math.sin(a) * R) / 2, 0);
    spoke.rotation.z = a + Math.PI / 2;
    g.add(spoke);
    const cabin = rbox(0.8, 0.7, 0.8, colors[i], 0.15);
    cabin.position.set(Math.cos(a) * R, hubY + Math.sin(a) * R - 0.75, 0);
    g.add(cabin);
  }
  const hub = mesh(new THREE.SphereGeometry(0.4, 10, 8), C.gold);
  hub.position.y = hubY;
  g.add(hub);
  return g;
}

/** Housing-estate landmark: a pair of taller blocks. */
function estate(tall: boolean, color: number): THREE.Group {
  const g = new THREE.Group();
  const a = apartment(9, 4.5, tall ? 7 : 3, color);
  a.position.x = -5.2;
  g.add(a);
  const b = apartment(8, 4.5, tall ? 5 : 2, tall ? C.cream : C.peach);
  b.position.x = 5;
  g.add(b);
  return g;
}

// ---------- real Tashkent landmarks (line 2) ----------

/** a cylinder from `a` to `b` (for legs and braces that lean) */
function strut(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, color: number): THREE.Mesh {
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(r1, r0, len, 8), color);
  m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

const STEEL = 0xdfe5ec;
const SAND = 0xebcb98;
const WHITE = 0xfbfaf5;

/** Tashkent TV Tower (Teleminora): three splayed legs, a tall shaft, a glass pod and a red-and-white mast. */
function tvTower(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    g.add(strut(Math.cos(a) * 4.6, 0, Math.sin(a) * 4.6, 0, 9.5, 0, 0.75, 0.4, STEEL));
    const foot = rbox(1.6, 0.5, 1.6, C.curb, 0.15);
    foot.position.set(Math.cos(a) * 4.6, 0.25, Math.sin(a) * 4.6);
    g.add(foot);
  }
  const shaft = mesh(new THREE.CylinderGeometry(0.55, 0.85, 22, 12), STEEL);
  shaft.position.y = 11;
  g.add(shaft);
  // observation pod: cream rings around a glass band
  const podLow = mesh(new THREE.CylinderGeometry(2.6, 1.3, 1.4, 20), C.cream);
  podLow.position.y = 15.3;
  g.add(podLow);
  const glass = mesh(new THREE.CylinderGeometry(2.7, 2.7, 1.1, 20), C.window);
  glass.position.y = 16.5;
  g.add(glass);
  const podTop = mesh(new THREE.CylinderGeometry(1.4, 2.6, 1.1, 20), C.cream);
  podTop.position.y = 17.6;
  g.add(podTop);
  const ring = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 16), C.window);
  ring.position.y = 19.8;
  g.add(ring);
  // the mast, painted in aviation red and white
  for (let k = 0; k < 6; k++) {
    const r0 = 0.48 - k * 0.06;
    const seg = mesh(new THREE.CylinderGeometry(r0 - 0.06, r0, 1.4, 10), k % 2 ? WHITE : C.red);
    seg.position.y = 22.7 + k * 1.4;
    g.add(seg);
  }
  const tip = mesh(new THREE.SphereGeometry(0.22, 8, 6), C.red);
  tip.position.y = 31.2;
  g.add(tip);
  return g;
}

/** Minor mosque: white walls, a turquoise dome and one slim minaret, on the Ankhor canal. */
function minorMosque(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(8.5, 4.2, 7.5, WHITE, 0.25));
  const cornice = rbox(8.9, 0.35, 7.9, C.turquoiseDeep, 0.1);
  cornice.position.y = 4.2;
  g.add(cornice);
  const drum = mesh(new THREE.CylinderGeometry(2.4, 2.6, 1.3, 20), WHITE);
  drum.position.y = 5.0;
  g.add(drum);
  const dome = mesh(new THREE.SphereGeometry(2.6, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2), C.turquoise);
  dome.position.y = 5.6;
  dome.scale.y = 1.15;
  g.add(dome);
  const finial = mesh(new THREE.CylinderGeometry(0.06, 0.12, 1.1, 6), C.gold);
  finial.position.y = 9.2;
  g.add(finial);
  // tall entrance portal (peshtak) with a deep blue arch
  const portal = rbox(4.6, 6, 1, WHITE, 0.15);
  portal.position.z = 3.9;
  g.add(portal);
  const arch = rbox(2.4, 4, 0.2, C.turquoiseDeep, 1.0);
  arch.position.set(0, 2.1, 4.42);
  g.add(arch);
  // side arcade
  for (const sx of [-1, 1]) {
    const a = rbox(1.1, 2, 0.2, C.window, 0.5);
    a.position.set(sx * 3.25, 1.3, 3.8);
    g.add(a);
  }
  // minaret with a balcony and a turquoise cap
  const mx = 5.6;
  const mz = 2.6;
  const base = mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.2, 12), WHITE);
  base.position.set(mx, 0.6, mz);
  g.add(base);
  const tower = mesh(new THREE.CylinderGeometry(0.5, 0.7, 12.5, 12), WHITE);
  tower.position.set(mx, 7.4, mz);
  g.add(tower);
  const balcony = mesh(new THREE.CylinderGeometry(0.95, 0.75, 0.6, 12), C.turquoiseDeep);
  balcony.position.set(mx, 12.2, mz);
  g.add(balcony);
  const lantern = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12), WHITE);
  lantern.position.set(mx, 13.2, mz);
  g.add(lantern);
  const cap = mesh(new THREE.ConeGeometry(0.62, 1.6, 12), C.turquoise);
  cap.position.set(mx, 14.7, mz);
  g.add(cap);
  return g;
}

/** Hazrati Imom: a sand-brick portal flanked by two tall minarets, with two turquoise domes behind. */
function hazratImam(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(17, 4.4, 6, SAND, 0.2));
  const band = rbox(17.3, 0.45, 6.3, C.turquoiseDeep, 0.1);
  band.position.y = 4.4;
  g.add(band);
  // wings: rows of small blue arches
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const a = rbox(1.2, 2.2, 0.2, C.turquoiseDeep, 0.55);
      a.position.set(sx * (3.6 + i * 1.7), 1.4, 3.02);
      g.add(a);
    }
  }
  // the big portal
  const portal = rbox(7, 8.5, 1.6, SAND, 0.2);
  portal.position.z = 3;
  g.add(portal);
  const frame = rbox(5.2, 6.4, 0.2, C.turquoise, 0.3);
  frame.position.set(0, 3.5, 3.82);
  g.add(frame);
  const arch = rbox(3.6, 5.2, 0.2, C.turquoiseDeep, 1.6);
  arch.position.set(0, 2.9, 3.95);
  g.add(arch);
  // two domes on drums behind the portal
  for (const sx of [-1, 1]) {
    const drum = mesh(new THREE.CylinderGeometry(2.1, 2.2, 1.4, 18), SAND);
    drum.position.set(sx * 4.4, 5.3, -0.5);
    g.add(drum);
    const dome = mesh(new THREE.SphereGeometry(2.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), C.turquoise);
    dome.position.set(sx * 4.4, 6, -0.5);
    dome.scale.y = 1.2;
    g.add(dome);
  }
  // minarets either side of the portal
  for (const sx of [-1, 1]) {
    const x = sx * 4.4;
    const tower = mesh(new THREE.CylinderGeometry(0.6, 0.85, 15, 12), SAND);
    tower.position.set(x, 7.5, 3.4);
    g.add(tower);
    for (const y of [5.5, 10]) {
      const ring = mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.4, 12), C.turquoiseDeep);
      ring.position.set(x, y, 3.4);
      g.add(ring);
    }
    const gallery = mesh(new THREE.CylinderGeometry(1.0, 0.7, 0.8, 12), SAND);
    gallery.position.set(x, 15.2, 3.4);
    g.add(gallery);
    const cap = mesh(new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), C.turquoise);
    cap.position.set(x, 15.6, 3.4);
    cap.scale.y = 1.3;
    g.add(cap);
  }
  return g;
}

/** a golden stork with spread wings (the birds on top of the Ezgulik arch) */
function stork(): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.SphereGeometry(0.42, 10, 8), C.gold);
  body.scale.set(0.7, 0.6, 1.3);
  g.add(body);
  const neck = mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 6), C.gold);
  neck.position.set(0, 0.35, 0.55);
  neck.rotation.x = 0.7;
  g.add(neck);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.5, 6), C.gold);
  beak.position.set(0, 0.62, 1.08);
  beak.rotation.x = 1.6;
  g.add(beak);
  for (const sx of [-1, 1]) {
    const wing = rbox(1.5, 0.08, 0.6, C.gold, 0.03);
    wing.position.set(sx * 0.85, 0.05, -0.05);
    wing.rotation.z = sx * 0.45;
    g.add(wing);
  }
  return g;
}

/** Mustaqillik maydoni: the white Ezgulik arch of columns with golden storks, over a plaza and fountain. */
function ezgulik(): THREE.Group {
  const g = new THREE.Group();
  const plaza = rbox(18, 0.14, 12, C.sidewalk, 0.05);
  plaza.position.y = 0.07;
  g.add(plaza);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const x = -7.7 + (i * 15.4) / (n - 1);
    const col = mesh(new THREE.CylinderGeometry(0.32, 0.38, 6.4, 12), WHITE);
    col.position.set(x, 3.3, -1.5);
    g.add(col);
    const capital = rbox(0.95, 0.35, 0.95, WHITE, 0.08);
    capital.position.set(x, 6.4, -1.5);
    g.add(capital);
  }
  const beam = rbox(17, 0.9, 1.6, WHITE, 0.2);
  beam.position.set(0, 6.7, -1.5);
  g.add(beam);
  const trim = rbox(17.2, 0.22, 1.7, C.gold, 0.06);
  trim.position.set(0, 6.95, -1.5);
  g.add(trim);
  for (const x of [-4.5, 0, 4.5]) {
    const plinth = rbox(1, 0.4, 1, WHITE, 0.1);
    plinth.position.set(x, 7.35, -1.5);
    g.add(plinth);
    const bird = stork();
    bird.position.set(x, 7.9, -1.5);
    bird.rotation.y = Math.PI * 0.08 * (x === 0 ? 0 : Math.sign(x));
    g.add(bird);
  }
  const f = fountain();
  f.scale.setScalar(0.8);
  f.position.z = 3.6;
  g.add(f);
  for (const sx of [-1, 1]) {
    const bed = mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.45, 16), C.red);
    bed.position.set(sx * 6.2, 0.23, 3.6);
    g.add(bed);
  }
  return g;
}

/** Tashkent City: a cluster of new glass towers on a podium. */
function tashkentCity(): THREE.Group {
  const g = new THREE.Group();
  const podium = rbox(17, 1.6, 8, C.cream, 0.3);
  podium.position.z = -1;
  g.add(podium);
  const glassTower = (w: number, h: number, d: number, color: number, x: number, z: number) => {
    const t = new THREE.Group();
    t.add(rbox(w, h, d, color, 0.35));
    for (let y = 2.4; y < h - 0.8; y += 1.25) {
      const band = rbox(w + 0.06, 0.1, d + 0.06, C.windowFrame, 0.03);
      band.position.y = y;
      t.add(band);
    }
    t.position.set(x, 1.4, z);
    g.add(t);
    return t;
  };
  // the tallest: a slim tower with a stepped crown
  const tall = glassTower(4, 24, 4, 0x3f86d8, -4.8, -2);
  const crown = rbox(2.6, 2.4, 2.6, C.window, 0.3);
  crown.position.y = 24;
  tall.add(crown);
  const spire = mesh(new THREE.CylinderGeometry(0.05, 0.14, 3, 6), STEEL);
  spire.position.y = 26.6;
  tall.add(spire);
  glassTower(4.6, 16, 3.6, 0x63b2ea, 1, -2.6);
  // a round hotel tower
  const round = mesh(new THREE.CylinderGeometry(2.3, 2.3, 13, 20), 0x86d0f0);
  round.position.set(5.9, 7.9, 0.4);
  g.add(round);
  for (let y = 3.2; y < 14; y += 1.3) {
    const ring = mesh(new THREE.CylinderGeometry(2.36, 2.36, 0.1, 20), C.windowFrame, false);
    ring.position.set(5.9, y, 0.4);
    g.add(ring);
  }
  const roof = mesh(new THREE.CylinderGeometry(1.6, 2.4, 0.8, 20), C.cream);
  roof.position.set(5.9, 14.8, 0.4);
  g.add(roof);
  return g;
}

/** Humo Arena: an oval hall with a glass band and a blue roof. */
function arena(): THREE.Group {
  const g = new THREE.Group();
  const shell = mesh(new THREE.CylinderGeometry(6.4, 6.8, 3.6, 32), WHITE);
  shell.position.y = 1.8;
  shell.scale.z = 0.72;
  g.add(shell);
  const glass = mesh(new THREE.CylinderGeometry(6.5, 6.5, 1.1, 32), C.window);
  glass.position.y = 2.2;
  glass.scale.z = 0.73;
  g.add(glass);
  const roof = mesh(new THREE.SphereGeometry(6.6, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), C.metroBlue);
  roof.position.y = 3.6;
  roof.scale.set(1, 0.32, 0.72);
  g.add(roof);
  const canopy = rbox(5, 0.3, 2.2, C.metroBlue, 0.1);
  canopy.position.set(0, 2.6, 5.2);
  g.add(canopy);
  for (const sx of [-2.2, 2.2]) {
    const pole = mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 6), STEEL);
    pole.position.set(sx, 1.3, 6.1);
    g.add(pole);
  }
  // a puck-shaped sign out front: it is the home of the hockey club
  const puck = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 16), C.road);
  puck.position.set(-5.4, 0.9, 4.6);
  puck.rotation.x = Math.PI / 2;
  g.add(puck);
  return g;
}

/** Alisher Navoi opera theatre: sand-coloured halls, an arched loggia and a raised central block. */
function opera(): THREE.Group {
  const g = new THREE.Group();
  g.add(rbox(16, 4.6, 7.5, SAND, 0.25));
  const cornice = rbox(16.4, 0.4, 7.9, C.cream, 0.1);
  cornice.position.y = 4.6;
  g.add(cornice);
  const mid = rbox(8, 7.6, 7, 0xf0d5a8, 0.25);
  g.add(mid);
  const midTop = rbox(8.4, 0.45, 7.4, C.cream, 0.1);
  midTop.position.y = 7.6;
  g.add(midTop);
  const roof = mesh(new THREE.ConeGeometry(4.4, 2.2, 4), C.terracotta);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.85;
  roof.position.y = 9.1;
  g.add(roof);
  // the loggia: a row of tall arches across the front
  for (let i = 0; i < 7; i++) {
    const a = rbox(1.25, 3.2, 0.2, C.turquoiseDeep, 0.6);
    a.position.set(-5.4 + i * 1.8, 1.9, 3.78);
    g.add(a);
  }
  for (let i = 0; i < 3; i++) {
    const w = rbox(1.4, 1.8, 0.2, C.window, 0.7);
    w.position.set(-2.2 + i * 2.2, 5.8, 3.6);
    g.add(w);
  }
  const f = fountain();
  f.scale.setScalar(0.7);
  f.position.z = 6.6;
  g.add(f);
  return g;
}

/** The landmark that stands behind a stop when the layout names one. */
function namedLandmark(kind: LandmarkKind): { obj: THREE.Group; r: number } {
  switch (kind) {
    case 'tvtower':
      return { obj: tvTower(), r: 5.5 };
    case 'minor':
      return { obj: minorMosque(), r: 7.5 };
    case 'hazratimom':
      return { obj: hazratImam(), r: 9.5 };
    case 'ezgulik':
      return { obj: ezgulik(), r: 9.5 };
    case 'tashkentcity':
      return { obj: tashkentCity(), r: 9.5 };
    case 'arena':
      return { obj: arena(), r: 7.5 };
    case 'opera':
      return { obj: opera(), r: 9.5 };
  }
}

function place(parent: THREE.Object3D, obj: THREE.Object3D, x: number, z: number, rotY = 0, pop = true): THREE.Object3D {
  obj.position.set(x, 0, z);
  obj.rotation.y = rotY;
  parent.add(obj);
  if (pop) popTargets.push(obj);
  return obj;
}

/** Rotation that makes an object's +z face toward (tx, tz) from (x, z). */
function face(x: number, z: number, tx: number, tz: number): number {
  return Math.atan2(tx - x, tz - z);
}

/** Merge a prop's meshes per material so each prop costs a few draw calls instead of dozens. */
function baked<T extends THREE.Object3D>(g: T): T {
  freezeStatic(g);
  return g;
}

/** Small deterministic random generator, so the city looks the same every time. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StopDef {
  key: string;
  name: string;
  d: number;
  kind: PlaceKind;
  size: number;
  landmark?: LandmarkKind;
  /** a platform at the bus terminal: the shared hall stands behind it instead of a landmark */
  terminal?: boolean;
}

/** Where the bus terminal hall stands, and the name on its tower. */
export interface TerminalDef {
  x: number;
  z: number;
  name: string;
}

/** One bus line as the city builder sees it: its road, its colour and its stops. */
export interface LineDef {
  route: Route;
  color: string;
  stops: StopDef[];
  /** false until the player buys the route: its road and buildings stand, its stops don't */
  open: boolean;
}

export interface CityBuild {
  group: THREE.Group;
  /** every line's stops, in the same order as `world.stops` */
  stopObjects: THREE.Group[];
  /** centre and half-size of the island, for the camera and the shadows */
  centre: { x: number; z: number };
  half: { x: number; z: number };
}

/** Landmark for a kind of place, and the radius it needs around its centre. */
function landmark(st: StopDef): { obj: THREE.Group; r: number } {
  if (st.landmark) return namedLandmark(st.landmark);
  switch (st.kind) {
    case 'bazaar': {
      const b = bazaar();
      b.scale.setScalar(0.95);
      return { obj: b, r: 7 };
    }
    case 'metro':
      return { obj: metro(), r: 4 };
    case 'school':
      return { obj: school(), r: 6.5 };
    case 'university':
      return { obj: university(), r: 8.5 };
    case 'station':
      return { obj: station(), r: 9 };
    case 'center':
      return { obj: centre(), r: 9.5 };
    case 'park':
      return { obj: ferrisWheel(), r: 4.5 };
    default:
      return { obj: estate(st.size > 1, st.size > 1.35 ? C.mint : C.sky), r: 10 };
  }
}

const MARGIN = 26;
const PASTELS = [C.peach, C.mint, C.cream, C.sky, 0xffe08a, C.cream, C.peach];

export function buildCity(lines: LineDef[], terminal?: TerminalDef): CityBuild {
  const city = new THREE.Group();
  const rnd = seeded(7);
  const routes = lines.map((l) => l.route);

  // --- island slab, sized to every route ---
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of routes.flatMap((r) => r.pts)) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const W = maxX - minX + MARGIN * 2;
  const D = maxZ - minZ + MARGIN * 2;
  const slab = (w: number, h: number, d: number, r: number, y: number, color: number) => {
    const m = mesh(new RoundedBoxGeometry(w, h, d, 4, r), color, false);
    m.position.set(cx, y, cz);
    city.add(m);
  };
  slab(W, 1.6, D, 0.8, -0.8, C.grass);
  slab(W - 1.2, 3, D - 1.2, 1.2, -2.6, C.slabSide);
  slab(W - 4, 2, D - 4, 1, -4.6, C.slabBottom);

  // --- roads + sidewalks (where two lines cross, the layers simply overlap into a junction) ---
  for (const route of routes) city.add(ribbon(route, -SIDEWALK_OUT, SIDEWALK_OUT, 0.01, C.sidewalk));
  for (const route of routes) city.add(ribbon(route, -ROAD_HALF - 0.25, ROAD_HALF + 0.25, 0.03, C.curb));
  for (const route of routes) city.add(ribbon(route, -ROAD_HALF, ROAD_HALF, 0.05, C.road));
  for (const route of routes) city.add(dashes(route, 0.07));

  // --- helpers for placing things without overlaps ---
  const road: { x: number; z: number }[] = [];
  for (const route of routes) for (let d = 0; d < route.length; d += 1.5) road.push(route.sample(d));
  const nearestRoad = (x: number, z: number) => {
    let best = road[0];
    let bestDist = Infinity;
    for (const p of road) {
      const dist = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = p;
      }
    }
    return { p: best, dist: Math.sqrt(bestDist) };
  };
  const insideRoute = (route: Route, x: number, z: number) => {
    let inside = false;
    const pts = route.pts;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  const insideLoop = (x: number, z: number) => routes.some((r) => insideRoute(r, x, z));
  const taken: { x: number; z: number; r: number }[] = [];
  const onIsland = (x: number, z: number, r: number) => Math.abs(x - cx) < W / 2 - r - 2.5 && Math.abs(z - cz) < D / 2 - r - 2.5;
  const free = (x: number, z: number, r: number, gap = 0.8) =>
    onIsland(x, z, r) && nearestRoad(x, z).dist >= r + SIDEWALK_OUT + 0.5 && taken.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r + gap);
  /** green areas: only trees grow here */
  const greens: { x: number; z: number; r: number }[] = [];
  const inGreen = (x: number, z: number) => greens.some((g) => Math.hypot(g.x - x, g.z - z) < g.r);

  // --- bus stops (on the bus's right, outside the loop) with their landmark behind ---
  const stopObjects: THREE.Group[] = [];
  for (const line of lines) for (const st of line.stops) {
    const route = line.route;
    const s = route.sample(st.d);
    const p = Route.right(s, ROAD_HALF + 1.4);
    // the terminal island has its own platforms, so only the line's name board stands there
    const obj = st.terminal ? stopBoard(st.name, line.color, 5.3) : busStop(st.name, line.color);
    // shelter's open side (+z) faces the road
    place(city, obj, p.x, p.z, face(p.x, p.z, s.x, s.z));
    obj.userData.key = st.key;
    if (!line.open) {
      // kept out of the baked city so it can appear when the route is bought
      obj.userData.dynamic = true;
      obj.visible = false;
    }
    stopObjects.push(obj);
    taken.push({ x: p.x, z: p.z, r: 2.6 });

    if (st.terminal) continue;
    const lm = landmark(st);
    const c = Route.right(s, ROAD_HALF + 4.2 + lm.r);
    place(city, baked(lm.obj), c.x, c.z, face(c.x, c.z, s.x, s.z));
    taken.push({ x: c.x, z: c.z, r: lm.r });
    if (st.kind === 'park' || st.kind === 'center' || st.kind === 'metro' || st.kind === 'sight') greens.push({ x: c.x, z: c.z, r: lm.r + 13 });
  }

  // --- bus terminal: the island between the two bays (the model brings its own paving) ---
  if (terminal) {
    place(city, baked(terminalHall(terminal.name)), terminal.x, terminal.z);
    // keep street trees and blocks off the island
    for (let x = -12; x <= 12; x += 4) taken.push({ x: terminal.x + x, z: terminal.z, r: 4.6 });
  }

  // --- central park inside line 1's ring (west of the line 2 avenue that cuts through it) ---
  const r1 = routes[0].pts;
  const park = { x: (Math.min(...r1.map((p) => p.x)) + Math.max(...r1.map((p) => p.x))) / 2 - 34, z: (Math.min(...r1.map((p) => p.z)) + Math.max(...r1.map((p) => p.z))) / 2 + 2 };
  greens.push({ ...park, r: 16 });
  place(city, fountain(), park.x, park.z);
  taken.push({ x: park.x, z: park.z, r: 3.2 });
  place(city, topchan(), park.x - 8, park.z + 4.5, 0.3);
  taken.push({ x: park.x - 8, z: park.z + 4.5, r: 2.2 });
  for (const [w, d] of [[26, 1.4], [1.4, 20]]) {
    const path = mesh(new THREE.BoxGeometry(w, 0.02, d), C.sidewalk, false);
    path.position.set(park.x, 0.012, park.z);
    city.add(path);
  }

  // --- willows around the fountain, between the paths ---
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = park.x + Math.cos(a) * 6;
    const z = park.z + Math.sin(a) * 6;
    const r = TREE_R.majnuntol;
    if (!free(x, z, r, 0.3)) continue;
    place(city, baked(tree('majnuntol', 0.95 + rnd() * 0.15)), x, z, rnd() * 6);
    taken.push({ x, z, r });
  }

  // --- street trees: each stretch of road gets its own avenue species, like real streets ---
  const AVENUE: TreeKind[] = ['terak', 'chinor', 'terak', 'qayragoch', 'sarv', 'terak', 'akatsiya'];
  for (const [ri, route] of routes.entries()) for (let d = 4, i = ri * 3; d < route.length; d += 11, i++) {
    const s = route.sample(d);
    const kind = AVENUE[Math.floor(i / 5) % AVENUE.length];
    // broad crowns sit a little further back from the kerb
    const back = TREE_R[kind] > 1 ? 1.9 : 1.3;
    for (const side of [1, -1]) {
      const p = Route.right(s, side * (SIDEWALK_OUT + back));
      if (!onIsland(p.x, p.z, 1) || nearestRoad(p.x, p.z).dist < SIDEWALK_OUT + back - 0.4) continue;
      if (taken.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + 1.4)) continue;
      place(city, baked(tree(kind, 0.85 + rnd() * 0.3)), p.x, p.z, rnd() * 6);
      taken.push({ x: p.x, z: p.z, r: Math.min(TREE_R[kind], 1.2) });
    }
  }

  // parks get a botanical mix; courtyards between blocks get mulberries and fruit trees
  const PARK: TreeKind[] = ['chinor', 'chinor', 'chinor', 'qayragoch', 'qayragoch', 'tut', 'archa', 'archa', 'akatsiya', 'olcha', 'orik', 'terak', 'sarv', 'buta', 'buta'];
  const YARD: TreeKind[] = ['tut', 'tut', 'tut', 'orik', 'orik', 'chinor', 'akatsiya', 'akatsiya', 'olcha', 'terak', 'qayragoch', 'buta'];
  const pick = (list: TreeKind[]) => list[Math.floor(rnd() * list.length)];
  /** keep crowns off the park's two crossing paths */
  const onPath = (x: number, z: number, r: number) =>
    (Math.abs(z - park.z) < 0.7 + r && Math.abs(x - park.x) < 13 + r) || (Math.abs(x - park.x) < 0.7 + r && Math.abs(z - park.z) < 10 + r);
  const plant = (x: number, z: number, kind: TreeKind, gap = 0.3): boolean => {
    const scale = 0.85 + rnd() * 0.3;
    const r = TREE_R[kind] * scale;
    if (!free(x, z, r, gap) || onPath(x, z, r + 0.3)) return false;
    place(city, baked(tree(kind, scale)), x, z, rnd() * 6);
    taken.push({ x, z, r });
    return true;
  };
  /** a tree, sometimes with a shrub tucked beside it */
  const grove = (x: number, z: number, list: TreeKind[]) => {
    if (!plant(x, z, pick(list))) return;
    if (rnd() < 0.45) {
      const a = rnd() * Math.PI * 2;
      plant(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6, 'buta', 0.1);
    }
  };

  // --- buildings and trees filling every block ---
  const block = (x: number, z: number) => {
    const near = nearestRoad(x, z);
    const green = inGreen(x, z);
    if (green || rnd() < 0.22) {
      grove(x, z, green ? PARK : YARD);
      return;
    }
    const w = 6 + Math.floor(rnd() * 4);
    const floors = insideLoop(x, z) ? 2 + Math.floor(rnd() * 4) : 2 + Math.floor(rnd() * 3);
    const r = Math.hypot(w, 4.5) / 2;
    if (!free(x, z, r)) {
      plant(x, z, pick(YARD));
      return;
    }
    // blocks near the road face it; deeper ones line up with the grid
    const rot = near.dist < 20 ? face(x, z, near.p.x, near.p.z) : rnd() < 0.5 ? 0 : Math.PI / 2;
    place(city, baked(apartment(w, 4.5, floors, PASTELS[Math.floor(rnd() * PASTELS.length)])), x, z, rot);
    taken.push({ x, z, r });
  };
  // a row of buildings along the outside and the inside of every road
  for (const route of routes) for (let d = 2; d < route.length; d += 10.5) {
    const s = route.sample(d);
    for (const off of [SIDEWALK_OUT + 6.4, -(SIDEWALK_OUT + 6.4)]) {
      const p = Route.right(s, off + (rnd() - 0.5) * 1.2);
      block(p.x, p.z);
    }
  }
  // then everything else on a loose grid
  for (let x = cx - W / 2 + 6; x < cx + W / 2 - 4; x += 11.5) {
    for (let z = cz - D / 2 + 6; z < cz + D / 2 - 4; z += 10.5) {
      block(x + (rnd() - 0.5) * 3, z + (rnd() - 0.5) * 3);
    }
  }

  return { group: city, stopObjects, centre: { x: cx, z: cz }, half: { x: W / 2, z: D / 2 } };
}
