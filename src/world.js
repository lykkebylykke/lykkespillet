import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOX_SLOTS, DELIVERY_SPOT, PALLET, DOOR, FURNITURE, PRODUCTS, productById, DAY_LENGTH } from './data.js';
import { queuedCount, capOf, shelfCount, shelfAccepts } from './state.js';
import { TILE, tileKey, isBaseTile, ownsTile, edgeBox, edgeTiles, isInnerEdge, parseEdge } from './rooms.js';

// The lot is split into 2×2 m tiles; the shop owns the original 18×20 m and can buy more (not towards the road).
export { TILE, tileKey, isBaseTile };
export const LOT = { x0: -12, z0: -8, x1: 18, z1: 32 };
export const TILES = { i0: LOT.x0 / TILE, j0: LOT.z0 / TILE, i1: LOT.x1 / TILE, j1: LOT.z1 / TILE };
const CELL = 0.5, NX = (LOT.x1 - LOT.x0) / CELL, NZ = (LOT.z1 - LOT.z0) / CELL;
const cellX = (c) => LOT.x0 + ((c % NX) + 0.5) * CELL, cellZ = (c) => LOT.z0 + (((c / NX) | 0) + 0.5) * CELL;

const matCache = new Map();
export function mat(color, extra) {
  const key = color + (extra ? JSON.stringify(extra) : '');
  let m = matCache.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...extra }); matCache.set(key, m); }
  return m;
}
const geoCache = new Map();
export function rbox(w, h, d, color, r = 0.05) {
  const key = `${w},${h},${d},${r}`;
  let g = geoCache.get(key);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)); geoCache.set(key, g); }
  const m = new THREE.Mesh(g, typeof color === 'string' ? mat(color) : color);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
export const at = (m, x, y, z) => { m.position.set(x, y, z); return m; };

function textPlane(text, w, h, { color = 'rgba(70,50,100,0.22)', weight = 700, bg = null } = {}) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = Math.round((1024 * h) / w);
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(0, 0, c.width, c.height, c.height * 0.3); g.fill(); }
  g.fillStyle = color;
  g.font = `${weight} ${Math.round(c.height * 0.62)}px Fredoka, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + c.height * 0.04);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

function floorText(text, x, z, w, h, opts) {
  const m = textPlane(text, w, h, opts);
  m.rotation.set(-Math.PI / 2, Math.PI / 4, 0, 'YXZ');
  m.position.set(x, 0.015, z);
  return m;
}

function plane(w, d, color, x, z, y = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  return m;
}

// The sky over the working day (f: how far through the day). glow: how much the building's lights are on.
const col = (c) => new THREE.Color(c);
const SKY = [
  { f: 0, bg: col('#f6cfa9'), sun: col('#ffcf9c'), sunI: 1.4, sky: col('#ffe9d6'), skyI: 1.3, glow: 0.05 },
  { f: 0.2, bg: col('#bde3f7'), sun: col('#fff4e0'), sunI: 2.2, sky: col('#ffffff'), skyI: 1.6, glow: 0 },
  { f: 0.62, bg: col('#bde3f7'), sun: col('#fff4e0'), sunI: 2.2, sky: col('#ffffff'), skyI: 1.6, glow: 0 },
  { f: 0.8, bg: col('#f7b98b'), sun: col('#ffb070'), sunI: 1.7, sky: col('#ffe0c4'), skyI: 1.35, glow: 0.2 },
  { f: 0.92, bg: col('#5f5a9c'), sun: col('#ff7f6b'), sunI: 0.6, sky: col('#a9a3e0'), skyI: 1.05, glow: 0.65 },
  { f: 1, bg: col('#1d2050'), sun: col('#7b8cff'), sunI: 0.25, sky: col('#8d92d8'), skyI: 0.95, glow: 1 },
];
const GRASS = col('#a7d99b'), GRASS_NIGHT = col('#22384d'), ROAD = col('#8e95a3'), ROAD_NIGHT = col('#2c3148');

// Areas furniture may not cover: the receiving floor and the parcel pallet.
const KEEP_CLEAR = [{ minX: 11, maxX: 16.6, minZ: 1.4, maxZ: 6.2 }, { minX: PALLET.x - 1.1, maxX: 18, minZ: PALLET.z - 1.1, maxZ: PALLET.z + 1.1 }];
const overlaps = (a, b, m = 0) => a.minX < b.maxX + m && a.maxX > b.minX - m && a.minZ < b.maxZ + m && a.maxZ > b.minZ - m;
const inside = (o, x, z, m) => x > o.minX - m && x < o.maxX + m && z > o.minZ - m && z < o.maxZ + m;

// Box, access point and facing for a piece of furniture at (x, z) turned rot × 90°.
export function footprint(type, x, z, rot) {
  const F = FURNITURE[type], odd = rot % 2, a = (rot * Math.PI) / 2;
  const hx = odd ? F.hz : F.hx, hz = odd ? F.hx : F.hz;
  const sin = Math.round(Math.sin(a)), cos = Math.round(Math.cos(a));
  return { box: { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }, ax: x + F.acc * sin, az: z + F.acc * cos, fx: -sin, fz: -cos };
}

export class World {
  constructor(canvas, s) {
    this.s = s;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#bde3f7');

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camOffset = new THREE.Vector3(30, 36, 30);
    this.camTarget = new THREE.Vector3(s.player.x, 0, s.player.z);
    this.zoom = 1;

    this.hemi = new THREE.HemisphereLight('#ffffff', '#c8b9a6', 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.labelsEl = document.getElementById('labels');
    this.labels = [];
    this.tableRes = [];
    this.tablePacking = [];
    this.deskActive = [];
    this.tableProg = [];
    this.useActive = {};
    this.seatBy = new Map();
    this.glow = 0;
    this.sunF = 0.3;
    this.lit = new Set();
    // Soft pools of light on the floor (lamps), all fading in together at dusk.
    const gc = document.createElement('canvas');
    gc.width = gc.height = 128;
    const gg = gc.getContext('2d'), grad = gg.createRadialGradient(64, 64, 2, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,214,140,0.9)');
    grad.addColorStop(1, 'rgba(255,214,140,0)');
    gg.fillStyle = grad;
    gg.fillRect(0, 0, 128, 128);
    this.glowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.bulbMat = new THREE.MeshStandardMaterial({ color: '#fff3c9', emissive: '#ffd27a', emissiveIntensity: 0 });
    this.boxMeshes = new Map();
    this._v = new THREE.Vector3();
    this.cw = 1; this.ch = 1;

    this.buildStatic();
    this.buildRoom();
    this.rebuild();
    this.buildLabels();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 0.9 : 1.1), 0.6, 1.6);
      this.resize();
    }, { passive: true });
  }

  resize() {
    this.cw = this.canvas.clientWidth;
    this.ch = this.canvas.clientHeight;
    this.renderer.setSize(this.cw, this.ch, false);
    const aspect = this.cw / this.ch;
    let w, h;
    if (aspect < 1) { w = 11; h = w / aspect; } else { h = 15; w = h * aspect; }
    w /= this.zoom; h /= this.zoom;
    Object.assign(this.camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    this.camera.updateProjectionMatrix();
  }

  // ---------- static scenery ----------
  buildStatic() {
    const sc = this.scene;
    this.staticObstacles = [];
    const grass = plane(160, 160, '#a7d99b', 9, 10, -0.03), road = plane(3.6, 160, '#8e95a3', 20.8, 10, -0.02);
    grass.material = this.grassMat = grass.material.clone();
    road.material = this.roadMat = road.material.clone();
    sc.add(grass, road);
    // Street lamps along the road
    for (const z of [-4, 10, 24]) {
      sc.add(at(rbox(0.12, 3, 0.12, '#5c677d', 0.03), 19.1, 1.5, z), at(rbox(0.5, 0.12, 0.26, this.bulbMat, 0.04), 19.3, 3, z));
      sc.add(this.glowDisc(19.5, z, 3.2));
    }
    for (let z = -60; z < 80; z += 3) sc.add(plane(0.18, 1.4, '#f1f1f1', 20.8, z, -0.015));
    sc.add(plane(1.6, 4.5, '#c9ccd3', 18.8, 3.25, -0.01));
    sc.add(plane(1.6, 3.5, '#c9ccd3', 18.8, 15.75, -0.01));

    // Pallet for outgoing parcels
    sc.add(at(rbox(1.3, 0.16, 1.3, '#c8a165', 0.03), PALLET.x, 0.08, PALLET.z));
    this.staticObstacles.push(this.aabb(PALLET.x, PALLET.z, 0.65, 0.65));
    this.parcelMeshes = [];
    for (let i = 0; i < 12; i++) {
      const p = rbox(0.42, 0.32, 0.42, '#e0b07a', 0.04);
      p.position.set(PALLET.x - 0.3 + (i % 2) * 0.6, 0.32 + Math.floor(i / 4) * 0.34, PALLET.z - 0.3 + (Math.floor(i / 2) % 2) * 0.6);
      p.visible = false;
      sc.add(p);
      this.parcelMeshes.push(p);
    }
    this.staticObstacles.push({ minX: 11.2, maxX: 16.3, minZ: 1.6, maxZ: 4.1 });

    // Plants along the front wall (it never moves)
    for (const [x, z] of [[17.4, 19.4], [17.4, 0.5]]) {
      const g = new THREE.Group();
      g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.4, 14), mat('#e07a5f')), 0, 0.2, 0));
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), mat('#52b788')), 0, 0.68, 0));
      g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), mat('#74c69d')), 0.12, 0.98, 0.05));
      g.traverse((m) => { m.castShadow = true; });
      g.position.set(x, 0, z);
      sc.add(g);
      this.staticObstacles.push(this.aabb(x, z, 0.3, 0.3));
    }
    this.fixedObstacles = this.staticObstacles;

    this.truck = this.makeTruck('#ff5d8f', 'LykkeFragt');
    this.van = this.makeTruck('#ffc300', 'Pakkepost', 0.85);
    this.trucks = [
      { g: this.truck, stop: 3.6, state: 'away', t: 0, again: false },
      { g: this.van, stop: 16.1, state: 'away', t: 0, again: false },
    ];
    for (const t of this.trucks) { t.g.position.set(20.6, 0, -25); sc.add(t.g); }

    // Quest arrow
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 16), mat('#ff3d7f', { emissive: '#ff3d7f', emissiveIntensity: 0.35 }));
    this.arrow.rotation.x = Math.PI;
    this.arrow.visible = false;
    sc.add(this.arrow);

    // Tap-to-walk destination marker
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.4, 28), new THREE.MeshBasicMaterial({ color: '#ff5d8f', transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.03;
    this.marker.visible = false;
    sc.add(this.marker);
  }

  glowDisc(x, z, r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), this.glowMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.03, z);
    return m;
  }

  // ---------- the room: owned 2×2 m tiles, floor, walls ----------
  ownsTile(i, j) { return ownsTile(this.s, i, j); }
  isFloor(x, z) { return this.ownsTile(Math.floor(x / TILE), Math.floor(z / TILE)); }
  // Every point of the box (grown by m) stands on our floor.
  boxOnFloor(b, m = 0) {
    const e = 0.001, x0 = b.minX - m + e, x1 = b.maxX + m - e, z0 = b.minZ - m + e, z1 = b.maxZ + m - e;
    const nx = Math.ceil((x1 - x0) / 0.5), nz = Math.ceil((z1 - z0) / 0.5);
    for (let a = 0; a <= nx; a++) for (let c = 0; c <= nz; c++) if (!this.isFloor(x0 + ((x1 - x0) * a) / nx, z0 + ((z1 - z0) * c) / nz)) return false;
    return true;
  }

  buildRoom() {
    const sc = this.scene, own = (i, j) => this.ownsTile(i, j);
    if (this.room) sc.remove(this.room);
    const g = (this.room = new THREE.Group());
    sc.add(g);
    const trim = '#ff8fab', walls = [], paint = this.s.paint;
    // Lit from inside when it gets dark: floors and walls glow softly, windows brightly.
    const lit = (color, emissive, k) => { const m = mat(color); m.emissive.set(emissive); this.lit.add(m); m.userData.glow = k; return color; };
    const floorOf = (k) => lit(paint[k]?.floor ?? '#f1ebe2', '#ffcf8a', 0.32), wallOf = (k) => lit(paint[k]?.wall ?? '#fff3e3', '#ffcf8a', 0.22);
    const pane = lit('#bde0fe', '#ffd27a', 1), wall0 = wallOf('');
    for (let i = TILES.i0; i < TILES.i1; i++) for (let j = TILES.j0; j < TILES.j1; j++) {
      if (!own(i, j)) continue;
      const x0 = i * TILE, z0 = j * TILE, wall = wallOf(tileKey(i, j));
      g.add(plane(TILE, TILE, floorOf(tileKey(i, j)), x0 + 1, z0 + 1));
      // Back walls (north/west) are tall with windows; the front ones are low so you can see in.
      if (!own(i, j - 1)) {
        g.add(at(rbox(2.25, 2.4, 0.25, wall), x0 + 1, 1.2, z0 - 0.125), at(rbox(2.25, 0.12, 0.3, trim), x0 + 1, 2.4, z0 - 0.125));
        if ((i + j) % 2) g.add(at(rbox(1.4, 0.9, 0.06, pane), x0 + 1, 1.45, z0 + 0.02));
        walls.push({ minX: x0 - 0.125, maxX: x0 + 2.125, minZ: z0 - 0.25, maxZ: z0 });
      }
      if (!own(i - 1, j)) {
        g.add(at(rbox(0.25, 2.4, 2.25, wall), x0 - 0.125, 1.2, z0 + 1), at(rbox(0.3, 0.12, 2.25, trim), x0 - 0.125, 2.4, z0 + 1));
        if ((i + j) % 2) g.add(at(rbox(0.06, 0.9, 1.4, pane), x0 + 0.02, 1.45, z0 + 1));
        walls.push({ minX: x0 - 0.25, maxX: x0, minZ: z0 - 0.125, maxZ: z0 + 2.125 });
      }
      if (!own(i, j + 1)) {
        g.add(at(rbox(2.25, 0.5, 0.25, wall), x0 + 1, 0.25, z0 + 2.125));
        walls.push({ minX: x0 - 0.125, maxX: x0 + 2.125, minZ: z0 + 2, maxZ: z0 + 2.25 });
      }
      if (!own(i + 1, j) && !(i === TILES.i1 - 1 && isBaseTile(i, j))) {
        g.add(at(rbox(0.25, 0.5, 2.25, wall), x0 + 2.125, 0.25, z0 + 1));
        walls.push({ minX: x0 + 2, maxX: x0 + 2.25, minZ: z0 - 0.125, maxZ: z0 + 2.125 });
      }
    }
    // The original front towards the road, with the two doors.
    for (const [z0, z1] of [[0, 1], [5.5, 14], [17.5, 20]]) g.add(at(rbox(0.25, 0.5, z1 - z0, wall0), 18.125, 0.25, (z0 + z1) / 2));
    for (const z of [1, 5.5, 14, 17.5]) g.add(at(rbox(0.32, 2.4, 0.32, trim), 18.125, 1.2, z));
    g.add(at(rbox(0.32, 0.3, 4.8, trim), 18.125, 2.35, 3.25), at(rbox(0.32, 0.3, 3.8, trim), 18.125, 2.35, 15.75));
    walls.push({ minX: 18, maxX: 18.25, minZ: 0, maxZ: 20 });
    // Inner walls (low, so you can see into the rooms) and doors (an opening between two posts).
    this.doorways = [];
    for (const [k, kind] of Object.entries(this.s.walls)) {
      if (!isInnerEdge(this.s, k)) continue;
      const { d } = parseEdge(k), b = edgeBox(k), [ti, tj] = edgeTiles(k)[1], wall = wallOf(tileKey(ti, tj)), cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, hor = d === 'h';
      const seg = (len, h, x, z, c) => at(hor ? rbox(len, h, 0.18, c, 0.04) : rbox(0.18, h, len, c, 0.04), x, h / 2, z);
      if (kind === 'door') {
        for (const s of [-1, 1]) g.add(seg(0.22, 1.5, cx + (hor ? s * 0.95 : 0), cz + (hor ? 0 : s * 0.95), trim));
        g.add(hor ? plane(1.7, 0.3, '#e3d5c2', cx, cz, 0.006) : plane(0.3, 1.7, '#e3d5c2', cx, cz, 0.006));
        this.doorways.push(edgeBox(k, 0.6));
      } else {
        g.add(seg(2.18, 1.0, cx, cz, wall));
        g.add(at(hor ? rbox(2.2, 0.08, 0.24, trim, 0.03) : rbox(0.24, 0.08, 2.2, trim, 0.03), cx, 1.02, cz));
        walls.push(b);
      }
    }
    // Shop sign on the back wall
    let jn = 0;
    while (own(2, jn - 1)) jn--;
    const sign = textPlane('LykkeShop', 2.4, 0.6, { color: '#ffffff', bg: '#ff5d8f' });
    sign.position.set(5, 1.6, jn * TILE + 0.03);
    g.add(sign);
    // Red floor where nothing may be placed: receiving and the parcel pallet
    for (const [k, label, lx, lz, lw] of [[0, 'VAREMODTAGELSE', 14.6, 6.5, 5], [1, 'VARELEVERING', 15.3, 17.4, 3.6]]) {
      const o = KEEP_CLEAR[k], w = o.maxX - o.minX, d = o.maxZ - o.minZ, cx = (o.minX + o.maxX) / 2, cz = (o.minZ + o.maxZ) / 2;
      g.add(plane(w, d, '#ffd3d8', cx, cz, 0.004));
      for (const [x, z, pw, pd] of [[cx, o.minZ, w, 0.1], [cx, o.maxZ, w, 0.1], [o.minX, cz, 0.1, d], [o.maxX, cz, 0.1, d]]) g.add(plane(pw, pd, '#ef476f', x, z, 0.008));
      g.add(floorText(label, lx, lz, lw, 0.8, { color: 'rgba(239,71,111,0.45)' }));
    }
    this.staticObstacles = [...this.fixedObstacles, ...walls];
  }

  setMarker(p) {
    this.marker.visible = !!p;
    if (p) this.marker.position.set(p.x, 0.03, p.z);
  }

  screenToGround(cx, cy, y = 0) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray ??= new THREE.Raycaster();
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p);
  }

  inObstacle(x, z) {
    return this.obstacles.some((o) => x > o.minX - 0.3 && x < o.maxX + 0.3 && z > o.minZ - 0.3 && z < o.maxZ + 0.3);
  }

  // Where to walk when the player taps a ground point: snap to nearby stations.
  walkTarget(p) {
    const blocked = this.inObstacle(p.x, p.z);
    let best = null, bd = blocked ? 3.5 : 1.6;
    for (const z of this.zones) { const d = Math.hypot(z.x - p.x, z.z - p.z); if (d < bd) { bd = d; best = z; } }
    if (best) return { x: best.x, z: best.z };
    if (blocked || !this.isFloor(p.x, p.z)) { const c = this.nearestFree(this.cellOf(p.x, p.z)); return { x: cellX(c), z: cellZ(c) }; }
    return { x: p.x, z: p.z };
  }

  makeTruck(color, label, scale = 1) {
    const g = new THREE.Group();
    g.add(at(rbox(1.8, 1.8, 3, '#ffffff', 0.12), 0, 1.3, -0.5));
    g.add(at(rbox(1.84, 0.28, 3.04, color, 0.05), 0, 0.85, -0.5));
    g.add(at(rbox(1.8, 1.3, 1.3, color, 0.15), 0, 0.95, 1.7));
    g.add(at(rbox(1.5, 0.5, 0.06, '#bde0fe', 0.02), 0, 1.25, 2.36));
    const wg = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 16);
    for (const [x, z] of [[-0.85, -1.3], [0.85, -1.3], [-0.85, 1.5], [0.85, 1.5]]) {
      const w = new THREE.Mesh(wg, mat('#2b2d42'));
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.36, z);
      g.add(w);
    }
    const t = textPlane(label, 2.6, 0.6, { color });
    t.position.set(0.92, 1.55, -0.5);
    t.rotation.y = Math.PI / 2;
    g.add(t);
    g.scale.setScalar(scale);
    return g;
  }

  driveTruck(i) {
    const t = this.trucks[i];
    if (t.state === 'away') { t.state = 'in'; t.g.position.z = -25; } else t.again = true;
  }

  aabb(x, z, hx, hz) { return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz }; }

  // ---------- furniture (rebuilt when something is placed) ----------
  makeFurniture(type, i) {
    const g = new THREE.Group();
    if (FURNITURE[type].stores) {
      const big = type === 'rack', hw = big ? 1.77 : 1.27, cols = big ? 7 : 5, deck = big ? 3.62 : 2.62, dz = big ? 0.92 : 0.72, post = big ? '#2a6f97' : '#5c677d', top = big ? 2.1 : 1.72;
      for (const [px, pz] of [[-hw, -dz / 2 + 0.06], [hw, -dz / 2 + 0.06], [-hw, dz / 2 - 0.06], [hw, dz / 2 - 0.06]]) g.add(at(rbox(0.08, top + 0.03, 0.08, post, 0.02), px, (top + 0.03) / 2, pz));
      const items = [];
      this.itemGeo ??= new RoundedBoxGeometry(0.36, 0.3, 0.46, 2, 0.06);
      for (const [b, y] of (big ? [0.1, 0.5, 0.9, 1.3, 1.7] : [0.1, 0.5, 0.9, 1.3]).entries()) {
        g.add(at(rbox(deck, 0.06, dz, big ? '#f4a261' : '#a3b1c6', 0.02), 0, y, 0));
        for (let c = 0; c < cols; c++) {
          const m = new THREE.Mesh(this.itemGeo, mat('#ffffff'));
          m.castShadow = true;
          m.position.set(-hw + 0.23 + c * 0.52, y + 0.18, 0);
          m.visible = false;
          g.add(m);
          items[b * cols + c] = m;
        }
      }
      g.add(at(rbox(deck, 0.06, dz, big ? '#f4a261' : '#a3b1c6', 0.02), 0, top, 0));
      return { g, items };
    }
    if (type === 'table') {
      for (const [px, pz] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) g.add(at(rbox(0.09, 0.8, 0.09, '#9c6644', 0.02), px, 0.4, pz));
      g.add(at(rbox(2, 0.1, 1, '#e9c46a', 0.04), 0, 0.83, 0));
      g.add(at(rbox(0.3, 0.2, 0.2, '#e63946', 0.05), 0.72, 0.98, -0.28));
      g.add(at(rbox(0.6, 0.12, 0.45, '#d4a373', 0.02), -0.62, 0.94, -0.2));
      const box = at(rbox(0.5, 0.38, 0.5, '#d9a066', 0.05), 0, 1.07, 0.05);
      box.visible = false;
      const tape = at(rbox(0.52, 0.02, 0.1, '#c08552', 0.005), 0, 1.27, 0.05);
      tape.visible = false;
      g.add(box, tape);
      return { g, box, tape };
    }
    if (FURNITURE[type].decor) return this.makeDecor(type, g);
    for (const [px, pz] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) g.add(at(rbox(0.07, 0.74, 0.07, '#adb5bd', 0.02), px, 0.37, pz));
    g.add(at(rbox(1.6, 0.08, 0.8, '#f4f1de', 0.03), 0, 0.76, 0));
    g.add(at(rbox(0.12, 0.25, 0.08, '#495057', 0.02), 0, 0.92, -0.25));
    g.add(at(rbox(0.8, 0.5, 0.06, '#2b2d42', 0.03), 0, 1.25, -0.26));
    const screenMat = new THREE.MeshStandardMaterial({ color: '#1b1b2f', emissive: '#4cc9f0', emissiveIntensity: 0.15 });
    g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), screenMat), 0, 1.25, -0.225));
    g.add(at(rbox(0.5, 0.03, 0.16, '#dee2e6', 0.01), 0, 0.81, 0.08));
    g.add(at(rbox(0.12, 0.12, 0.12, i === 0 ? '#ff8fab' : '#90e0ef', 0.04), 0.6, 0.86, -0.15));
    // Office chair in front of the desk
    g.add(at(rbox(0.46, 0.08, 0.44, '#4a4e69', 0.03), 0, 0.46, 0.66), at(rbox(0.44, 0.42, 0.07, '#4a4e69', 0.03), 0, 0.72, 0.9), at(rbox(0.07, 0.4, 0.07, '#adb5bd', 0.02), 0, 0.22, 0.66));
    return { g, screenMat };
  }

  makeDecor(type, g) {
    const parts = {};
    const cyl = (rt, rb, h, c) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), mat(c));
    const ball = (r, c) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), mat(c));
    if (type === 'plant') {
      g.add(at(cyl(0.24, 0.18, 0.4, '#e07a5f'), 0, 0.2, 0));
      g.add(at(ball(0.34, '#40916c'), 0, 0.7, 0));
      g.add(at(ball(0.25, '#74c69d'), 0.12, 1.02, 0.05));
      g.add(at(ball(0.18, '#95d5b2'), -0.12, 1.2, -0.06));
    } else if (type === 'coffee') {
      g.add(at(rbox(1.2, 0.85, 0.7, '#8d6e63', 0.04), 0, 0.425, 0));
      g.add(at(rbox(1.24, 0.06, 0.74, '#f4f1de', 0.02), 0, 0.88, 0));
      g.add(at(rbox(0.38, 0.5, 0.36, '#343a40', 0.05), -0.25, 1.16, -0.08));
      g.add(at(rbox(0.22, 0.06, 0.1, '#adb5bd', 0.02), -0.25, 1.2, 0.12));
      for (const [x, c] of [[0.22, '#ffffff'], [0.42, '#ff8fab']]) g.add(at(cyl(0.06, 0.05, 0.12, c), x, 0.97, 0.1));
    } else if (type === 'sofa') {
      g.add(at(rbox(2, 0.4, 0.9, '#6c63ff', 0.1), 0, 0.3, 0));
      g.add(at(rbox(2, 0.6, 0.25, '#5a52e0', 0.1), 0, 0.6, -0.33));
      for (const x of [-0.92, 0.92]) g.add(at(rbox(0.22, 0.55, 0.9, '#5a52e0', 0.08), x, 0.38, 0));
      for (const x of [-0.42, 0.42]) g.add(at(rbox(0.78, 0.14, 0.62, '#8b85ff', 0.06), x, 0.55, 0.06));
      g.add(at(rbox(0.36, 0.3, 0.12, '#ffc300', 0.06), -0.6, 0.72, -0.12));
    } else if (type === 'speaker') {
      g.add(at(rbox(0.5, 1.1, 0.45, '#2b2d42', 0.06), 0, 0.55, 0));
      for (const [y, r] of [[0.38, 0.17], [0.82, 0.1]]) {
        const c = cyl(r, r, 0.04, '#8d99ae');
        c.rotation.x = Math.PI / 2;
        g.add(at(c, 0, y, 0.23));
      }
    } else if (type === 'foosball') {
      for (const [px, pz] of [[-0.6, -0.32], [0.6, -0.32], [-0.6, 0.32], [0.6, 0.32]]) g.add(at(rbox(0.1, 0.75, 0.1, '#5c4033', 0.02), px, 0.375, pz));
      g.add(at(rbox(1.5, 0.22, 0.9, '#7f5539', 0.04), 0, 0.85, 0));
      g.add(at(rbox(1.36, 0.02, 0.76, '#2a9d8f', 0.01), 0, 0.97, 0));
      for (let i = 0; i < 4; i++) {
        const x = -0.5 + i * 0.33, rod = cyl(0.02, 0.02, 1.2, '#ced4da');
        rod.rotation.x = Math.PI / 2;
        g.add(at(rod, x, 1.04, 0));
        for (const z of [-0.2, 0.2]) g.add(at(rbox(0.06, 0.14, 0.06, i % 2 ? '#e63946' : '#457b9d', 0.02), x, 1.0, z));
      }
      parts.ball = at(ball(0.04, '#ffffff'), 0.05, 1.0, 0.05);
      g.add(parts.ball);
    } else if (type === 'printer') {
      g.add(at(rbox(0.5, 0.75, 0.5, '#adb5bd', 0.03), 0, 0.375, 0), at(rbox(0.46, 0.2, 0.42, '#f1f3f5', 0.04), 0, 0.85, 0), at(rbox(0.24, 0.015, 0.3, '#ffffff', 0.005), 0, 0.965, 0.04), at(rbox(0.08, 0.04, 0.02, '#2bb673', 0.005), 0.14, 0.86, 0.215));
    } else if (type === 'belt') {
      g.add(at(rbox(4, 0.05, 0.9, '#495057', 0.02), 0, 0.025, 0));
      this.beltTex ??= (() => {
        const c = document.createElement('canvas');
        c.width = 64; c.height = 16;
        const x = c.getContext('2d');
        x.fillStyle = '#3a3f4a'; x.fillRect(0, 0, 64, 16);
        x.fillStyle = '#ffc300'; x.beginPath(); x.moveTo(16, 2); x.lineTo(30, 8); x.lineTo(16, 14); x.fill();
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.set(5, 1);
        return tex;
      })();
      const top = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 0.74), new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.9 }));
      top.rotation.x = -Math.PI / 2;
      g.add(at(top, 0, 0.056, 0));
    } else if (type === 'whiteboard') {
      for (const x of [-0.6, 0.6]) g.add(at(rbox(0.06, 1.6, 0.06, '#adb5bd', 0.02), x, 0.8, 0), at(rbox(0.06, 0.04, 0.3, '#adb5bd', 0.01), x, 0.02, 0));
      g.add(at(rbox(1.4, 0.9, 0.05, '#ffffff', 0.02), 0, 1.25, 0));
      for (const [x, y, w, c] of [[-0.3, 1.45, 0.6, '#ef476f'], [0.1, 1.28, 0.9, '#4c8df6'], [-0.2, 1.1, 0.7, '#2bb673']]) g.add(at(rbox(w, 0.04, 0.01, c, 0.005), x, y, 0.03));
    } else if (type === 'lockers') {
      for (let k = 0; k < 4; k++) {
        const x = -0.6 + k * 0.4;
        g.add(at(rbox(0.38, 1.7, 0.48, k % 2 ? '#4cc9f0' : '#3a86ff', 0.02), x, 0.85, 0));
        g.add(at(rbox(0.04, 0.12, 0.02, '#ffffff', 0.005), x + 0.12, 0.95, 0.25));
      }
    } else if (type === 'water') {
      g.add(at(rbox(0.42, 0.85, 0.42, '#e9ecef', 0.04), 0, 0.425, 0), at(cyl(0.16, 0.16, 0.45, '#90e0ef'), 0, 1.08, 0), at(rbox(0.1, 0.06, 0.06, '#4c8df6', 0.01), 0, 0.7, 0.23));
    } else if (type === 'fridge') {
      g.add(at(rbox(0.75, 1.7, 0.66, '#dee2e6', 0.06), 0, 0.85, 0), at(rbox(0.72, 0.02, 0.02, '#adb5bd', 0.005), 0, 1.15, 0.335), at(rbox(0.04, 0.4, 0.04, '#6c757d', 0.01), 0.28, 1.4, 0.35), at(rbox(0.04, 0.4, 0.04, '#6c757d', 0.01), 0.28, 0.85, 0.35));
    } else if (type === 'arcade') {
      g.add(at(rbox(0.72, 1.55, 0.62, '#7b2cbf', 0.05), 0, 0.775, 0), at(rbox(0.72, 0.1, 0.34, '#3c096c', 0.03), 0, 0.92, 0.3), at(ball(0.05, '#ef476f'), -0.12, 1.0, 0.32), at(ball(0.04, '#ffd166'), 0.12, 0.99, 0.32));
      parts.screen = new THREE.MeshStandardMaterial({ color: '#10002b', emissive: '#4cc9f0', emissiveIntensity: 0.3 });
      g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.42), parts.screen), 0, 1.25, 0.315));
    } else if (type === 'pingpong') {
      for (const [px, pz] of [[-1.1, -0.55], [1.1, -0.55], [-1.1, 0.55], [1.1, 0.55]]) g.add(at(rbox(0.08, 0.74, 0.08, '#343a40', 0.02), px, 0.37, pz));
      g.add(at(rbox(2.6, 0.06, 1.4, '#2a6f97', 0.02), 0, 0.77, 0), at(rbox(0.03, 0.14, 1.44, '#f8f9fa', 0.005), 0, 0.87, 0));
      parts.pong = at(ball(0.045, '#ffffff'), 0, 1, 0);
      g.add(parts.pong);
    } else if (type === 'rug') {
      g.add(at(rbox(2.4, 0.03, 1.6, '#cdb4db', 0.01), 0, 0.015, 0), at(rbox(2.1, 0.032, 1.3, '#ffafcc', 0.01), 0, 0.016, 0), at(rbox(1.7, 0.034, 0.9, '#bde0fe', 0.01), 0, 0.017, 0));
    } else if (type === 'lamp') {
      g.add(at(cyl(0.2, 0.22, 0.05, '#495057'), 0, 0.025, 0), at(cyl(0.025, 0.025, 1.5, '#495057'), 0, 0.77, 0));
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.28, 0.32, 16), this.bulbMat);
      g.add(at(shade, 0, 1.62, 0), this.glowDisc(0, 0, 2.2));
    } else if (type === 'neon') {
      for (const x of [-0.55, 0.55]) g.add(at(rbox(0.05, 1.2, 0.05, '#495057', 0.01), x, 0.6, 0));
      const t = textPlane('LYKKE', 1.4, 0.45, { color: '#ff5d8f', bg: '#1b1b2f' });
      g.add(at(t, 0, 1.35, 0.03));
    } else if (type === 'aquarium') {
      g.add(at(rbox(1.5, 0.6, 0.6, '#343a40', 0.03), 0, 0.3, 0));
      const water = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.7, 0.52), new THREE.MeshStandardMaterial({ color: '#48cae4', transparent: true, opacity: 0.55, emissive: '#00b4d8', emissiveIntensity: 0.25 }));
      g.add(at(water, 0, 0.95, 0), at(rbox(1.5, 0.06, 0.6, '#343a40', 0.02), 0, 1.33, 0), at(rbox(1.4, 0.05, 0.5, '#e9c46a', 0.01), 0, 0.63, 0));
      parts.fish = ['#ff9f1c', '#ef476f', '#ffd166'].map((c, k) => { const f = at(ball(0.07, c), 0, 0.85 + k * 0.14, 0.02 * k); f.scale.set(1.5, 0.8, 0.6); g.add(f); return f; });
    }
    g.traverse((m) => { if (m.isMesh && m.material !== this.glowMat && !FURNITURE[type].walk) m.castShadow = true; });
    return { g, ...parts };
  }

  rebuild() {
    const s = this.s;
    if (this.stations) this.scene.remove(this.stations);
    this.stations = new THREE.Group();
    this.scene.add(this.stations);
    this.shelves = []; this.tables = []; this.desks = []; this.decorParts = []; this.belts = [];
    this.obstacles = [...this.staticObstacles];
    this.zones = [{ type: 'delivery', x: DELIVERY_SPOT.x, z: DELIVERY_SPOT.z, r: 1.3 }];
    const lists = { shelf: this.shelves, rack: this.shelves, table: this.tables, desk: this.desks };
    for (const f of s.furniture) {
      const list = lists[f.type], i = list?.length ?? 0, kind = FURNITURE[f.type].stores ? 'shelf' : f.type;
      const { g, ...parts } = this.makeFurniture(f.type, i);
      g.position.set(f.x, 0, f.z);
      g.rotation.y = (f.rot * Math.PI) / 2;
      this.stations.add(g);
      const fp = footprint(f.type, f.x, f.z, f.rot);
      if (!list) {
        if (f.type === 'belt') this.belts.push(fp.box); else if (!FURNITURE[f.type].walk) this.obstacles.push(fp.box);
        this.decorParts.push({ f, ...parts });
        continue;
      }
      if (kind === 'shelf' && f.tags?.length) g.add(this.shelfSign(f.tags, f.type === 'rack' ? 2.42 : 2.02));
      list.push({ i, id: f.id, f, g, type: kind, x: f.x, z: f.z, ax: fp.ax, az: fp.az, fx: fp.fx, fz: fp.fz, spots: [{ ax: fp.ax, az: fp.az, fx: fp.fx, fz: fp.fz }], ...parts });
      this.obstacles.push(fp.box);
      this.zones.push({ type: kind, idx: i, x: fp.ax, z: fp.az, fx: fp.fx, fz: fp.fz, r: FURNITURE[f.type].r });
    }
    // Shelves and packing tables can also be used from the back when there's room to stand there.
    for (const st of [...this.shelves, ...this.tables]) {
      const bx = 2 * st.x - st.ax, bz = 2 * st.z - st.az;
      if (!this.isFloor(bx, bz) || this.obstacles.some((o) => inside(o, bx, bz, 0.3))) continue;
      st.spots.push({ ax: bx, az: bz, fx: -st.fx, fz: -st.fz });
      this.zones.push({ type: st.type, idx: st.i, x: bx, z: bz, fx: -st.fx, fz: -st.fz, r: FURNITURE[st.type].r });
    }
    // A label printer speeds up the packing tables close to it.
    const printers = s.furniture.filter((f) => f.type === 'printer');
    for (const t of this.tables) t.fast = printers.some((p) => Math.hypot(p.x - t.x, p.z - t.z) <= 3.5) ? 0.85 : 1;
    // One count label on top of each shelf (higher when it carries a product sign).
    for (const L of this.shelfLabels || []) L.remove();
    this.shelfLabels = this.shelves.map((sh) => this.addLabel('bubble shelfqty', '', new THREE.Vector3(sh.x, (sh.f.type === 'rack' ? 0.4 : 0) + (sh.f.tags?.length ? 2.95 : 2.45), sh.z)));
    this.shelfSig = '';
    this.buildGrid();
  }

  // A sign on top of a shelf tagged for some products, readable from both sides.
  shelfSign(tags, y = 2.02) {
    const ps = tags.map((id) => productById[id]).filter(Boolean), g = new THREE.Group();
    const text = ps.length === 1 ? `${ps[0].icon} ${ps[0].name}` : ps.map((p) => p.icon).join(' ');
    for (const r of [0, Math.PI]) {
      const t = textPlane(text, 2.2, 0.42, { color: '#ffffff', bg: ps.length === 1 ? ps[0].color : '#7d6bd6' });
      t.rotation.y = r;
      t.position.z = r ? -0.02 : 0.02;
      g.add(t);
    }
    g.position.y = y;
    return g;
  }

  // Can this piece go here? Checks walls, overlaps, room in front and that every station stays reachable.
  canPlace(type, x, z, rot, ignoreId) {
    const fp = footprint(type, x, z, rot), b = fp.box, decor = FURNITURE[type].decor;
    if (!this.boxOnFloor(b)) return { ok: false, why: 'Uden for rummet' };
    // Rugs and belts lie flat: people walk on them and furniture may stand on them.
    if (FURNITURE[type].walk) return [...this.fixedObstacles, ...KEEP_CLEAR].some((o) => overlaps(b, o, 0.05)) ? { ok: false, why: 'Her skal der være fri adgang' } : { ok: true, fp };
    if (!decor && !this.boxOnFloor(this.aabb(fp.ax, fp.az, 0, 0), 0.35)) return { ok: false, why: 'Der skal være plads foran' };
    const others = this.s.furniture.filter((f) => f.id !== ignoreId && !FURNITURE[f.type].walk).map((f) => ({ f, fp: footprint(f.type, f.x, f.z, f.rot) }));
    const solid = [...this.staticObstacles, ...others.map((o) => o.fp.box)];
    if ([...solid, ...KEEP_CLEAR].some((o) => overlaps(b, o, 0.05))) return { ok: false, why: 'Der står noget i vejen' };
    if (this.doorways.some((o) => overlaps(b, o))) return { ok: false, why: 'Den står i en døråbning' };
    if (!decor && solid.some((o) => inside(o, fp.ax, fp.az, 0.3))) return { ok: false, why: 'Der skal være plads foran' };
    const reach = this.reachable([...solid, b]);
    if ((!decor && !reach(fp.ax, fp.az)) || others.some((o) => !FURNITURE[o.f.type].decor && !reach(o.fp.ax, o.fp.az))) return { ok: false, why: 'Det spærrer vejen' };
    return { ok: true, fp };
  }

  // Flood-fill from the receiving area through these obstacles; returns a test for whether a point can be reached.
  reachable(solid) {
    const grid = this.makeGrid(solid), seen = new Uint8Array(NX * NZ);
    const start = this.cellOf(DELIVERY_SPOT.x, DELIVERY_SPOT.z), q = [start];
    seen[start] = 1;
    while (q.length) {
      const c = q.pop(), ci = c % NX, cj = (c / NX) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i = ci + di, j = cj + dj, n = j * NX + i;
        if (i >= 0 && j >= 0 && i < NX && j < NZ && !grid[n] && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    // The cell right at an access point can sit in the inflated margin, so accept a neighbour.
    return (ax, az) => [-0.5, 0, 0.5].some((dx) => [-0.5, 0, 0.5].some((dz) => seen[this.cellOf(ax + dx, az + dz)]));
  }

  // Can a wall (or door) go on this edge? Walls may not cut through furniture or shut anything in.
  canWall(k, kind) {
    const s = this.s;
    if (!isInnerEdge(s, k)) return { ok: false, why: 'Vægge bygges inde i lageret' };
    const b = edgeBox(k), fps = s.furniture.filter((f) => !FURNITURE[f.type].walk).map((f) => ({ f, fp: footprint(f.type, f.x, f.z, f.rot) }));
    if ([...this.fixedObstacles, ...KEEP_CLEAR].some((o) => overlaps(b, o, 0.05))) return { ok: false, why: 'Her skal der være fri adgang' };
    if (kind === 'door') return { ok: true };
    if (fps.some((o) => overlaps(b, o.fp.box, 0.02))) return { ok: false, why: 'Der står et møbel i vejen' };
    const reach = this.reachable([...this.staticObstacles, ...fps.map((o) => o.fp.box), b]);
    const need = [...fps.filter((o) => !FURNITURE[o.f.type].decor).map((o) => [o.fp.ax, o.fp.az]), [DOOR.x - 0.6, DOOR.z], [PALLET.x - 1, PALLET.z]];
    if (!need.every(([x, z]) => reach(x, z))) return { ok: false, why: 'Så kan man ikke komme rundt – sæt en dør' };
    return { ok: true };
  }

  // The piece of furniture under a screen point (for tapping a shelf or desk). Furniture has height, so the
  // tap ray is tested at a few heights, top first.
  furnitureAt(cx, cy) {
    for (const h of [1.6, 1.2, 0.8, 0.4, 0]) {
      const g = this.screenToGround(cx, cy, h);
      const f = g && this.s.furniture.find((o) => {
        if (FURNITURE[o.type].walk) return false;
        const b = footprint(o.type, o.x, o.z, o.rot).box;
        return g.x > b.minX - 0.15 && g.x < b.maxX + 0.15 && g.z > b.minZ - 0.15 && g.z < b.maxZ + 0.15;
      });
      if (f) return f;
    }
    return null;
  }

  buildLabels() {
    this.lblDelivery = this.addLabel('bubble', '', new THREE.Vector3(13.75, 1.4, 2.85));
    // These follow the first table / shelf / desk wherever it was placed.
    const above = (list, y, fallback) => () => (list()[0] ? new THREE.Vector3(list()[0].x, y, list()[0].z) : fallback);
    this.lblOrders = this.addLabel('bubble orders', '', above(() => this.tables, 1.9, new THREE.Vector3(15.6, 1.9, 9)));
    this.lblTickets = this.addLabel('bubble', '', above(() => this.desks, 2.2, new THREE.Vector3(4.6, 2.2, 3.4)));
    this.lblQuest = this.addLabel('qarrow', '⬇', new THREE.Vector3(), { clamp: true });
    this.lblQuest.hidden = true;
    this.lblBroken = this.addLabel('bubble hot', '🔧 Ude af drift', new THREE.Vector3());
    this.lblBroken.hidden = true;
  }

  // ---------- labels ----------
  addLabel(cls, html, pos, opts = {}) {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls;
    const inner = document.createElement('div');
    inner.className = 'in';
    inner.innerHTML = html;
    el.appendChild(inner);
    this.labelsEl.appendChild(el);
    const L = {
      el, pos, html, hidden: false, clamp: opts.clamp, ttl: opts.ttl,
      set(h) { if (h !== this.html) { this.html = h; inner.innerHTML = h; } },
      remove: () => { el.remove(); this.labels = this.labels.filter((x) => x !== L); },
    };
    this.labels.push(L);
    return L;
  }

  popup(text, pos, cls = '') {
    this.addLabel('pop ' + cls, `<span>${text}</span>`, pos.clone ? pos.clone().setY(pos.y + 1.6) : new THREE.Vector3(pos.x, 1.6, pos.z), { ttl: 1.3 });
  }

  project(p) {
    this._v.copy(p).project(this.camera);
    return { x: ((this._v.x + 1) / 2) * this.cw, y: ((1 - this._v.y) / 2) * this.ch };
  }

  updateLabels(dt) {
    for (const L of [...this.labels]) {
      if (L.ttl != null && (L.ttl -= dt) <= 0) { L.remove(); continue; }
      if (L.hidden || !L.html) { L.el.style.display = 'none'; continue; }
      L.el.style.display = '';
      const p = this.project(typeof L.pos === 'function' ? L.pos() : L.pos);
      if (L.clamp) {
        const m = 40, top = 96, bottom = 130;
        const off = p.x < m || p.x > this.cw - m || p.y < top || p.y > this.ch - bottom;
        L.el.classList.toggle('edge', off);
        if (off) {
          const cx = this.cw / 2, cy = this.ch / 2;
          const ang = Math.atan2(p.y - cy, p.x - cx);
          p.x = THREE.MathUtils.clamp(p.x, m, this.cw - m);
          p.y = THREE.MathUtils.clamp(p.y, top, this.ch - bottom);
          L.el.style.setProperty('--rot', `${ang - Math.PI / 2}rad`);
        }
      }
      L.el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px)`;
    }
  }

  // ---------- pathfinding ----------
  buildGrid() { this.grid = this.makeGrid(this.obstacles); }

  makeGrid(obstacles) {
    const grid = new Uint8Array(NX * NZ);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const x = LOT.x0 + (i + 0.5) * CELL, z = LOT.z0 + (j + 0.5) * CELL;
      if (!this.isFloor(x, z) || obstacles.some((o) => inside(o, x, z, 0.3))) grid[j * NX + i] = 1;
    }
    return grid;
  }

  cellOf(x, z) {
    const i = THREE.MathUtils.clamp(Math.floor((x - LOT.x0) / CELL), 0, NX - 1);
    const j = THREE.MathUtils.clamp(Math.floor((z - LOT.z0) / CELL), 0, NZ - 1);
    return j * NX + i;
  }

  nearestFree(c) {
    if (!this.grid[c]) return c;
    const ci = c % NX, cj = (c / NX) | 0;
    for (let r = 1; r < 8; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < NX && j < NZ && !this.grid[j * NX + i]) return j * NX + i;
    }
    return c;
  }

  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let k = 1; k < n; k++) {
      const t = k / n;
      if (this.grid[this.cellOf(ax + (bx - ax) * t, az + (bz - az) * t)]) return false;
    }
    return true;
  }

  findPath(sx, sz, tx, tz) {
    const start = this.nearestFree(this.cellOf(sx, sz)), goal = this.nearestFree(this.cellOf(tx, tz));
    const N = NX * NZ, g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const h = (c) => { const dx = Math.abs((c % NX) - (goal % NX)), dz = Math.abs(((c / NX) | 0) - ((goal / NX) | 0)); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    const open = [start], f = new Map([[start, h(start)]]);
    g[start] = 0;
    let found = start === goal;
    while (open.length && !found) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (f.get(open[k]) < f.get(open[bi])) bi = k;
      const c = open[bi];
      open.splice(bi, 1);
      if (c === goal) { found = true; break; }
      closed[c] = 1;
      const ci = c % NX, cj = (c / NX) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const n = j * NX + i;
        if (this.grid[n] || closed[n]) continue;
        if (di && dj && (this.grid[cj * NX + i] || this.grid[j * NX + ci])) continue;
        const ng = g[c] + (di && dj ? 1.414 : 1);
        if (ng < g[n]) {
          g[n] = ng; came[n] = c; f.set(n, ng + h(n));
          if (!open.includes(n)) open.push(n);
        }
      }
    }
    if (!found) return [{ x: tx, z: tz }];
    const cells = [];
    for (let c = goal; c !== -1 && c !== start; c = came[c]) cells.unshift(c);
    const pts = cells.map((c) => ({ x: cellX(c), z: cellZ(c) }));
    pts.push({ x: tx, z: tz });
    // String-pull: skip waypoints we can see past.
    const out = [];
    let cx = sx, cz = sz, k = 0;
    while (k < pts.length) {
      let far = k;
      for (let m = pts.length - 1; m > k; m--) if (this.los(cx, cz, pts[m].x, pts[m].z)) { far = m; break; }
      out.push(pts[far]);
      cx = pts[far].x; cz = pts[far].z;
      k = far + 1;
    }
    return out;
  }

  // Push a circle out of all obstacles and keep it inside the building.
  collide(p, r = 0.3) {
    for (const o of this.obstacles) {
      const qx = THREE.MathUtils.clamp(p.x, o.minX, o.maxX), qz = THREE.MathUtils.clamp(p.z, o.minZ, o.maxZ);
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = qx + (dx / d) * r; p.z = qz + (dz / d) * r; } else {
        const pen = [[p.x - o.minX, -1, 0], [o.maxX - p.x, 1, 0], [p.z - o.minZ, 0, -1], [o.maxZ - p.z, 0, 1]].sort((a, b) => a[0] - b[0])[0];
        p.x += pen[1] * (pen[0] + r); p.z += pen[2] * (pen[0] + r);
      }
    }
    p.x = THREE.MathUtils.clamp(p.x, LOT.x0 + r, LOT.x1 - r);
    p.z = THREE.MathUtils.clamp(p.z, LOT.z0 + r, LOT.z1 - r);
  }

  // The nearest usable side of the nearest shelf matching ok (null if none).
  nearestShelf(x, z, ok = () => true) {
    let best = null, bd = Infinity;
    for (const sh of this.shelves) {
      if (!ok(sh)) continue;
      for (const sp of sh.spots) {
        const d = Math.hypot(sp.ax - x, sp.az - z);
        if (d < bd) { bd = d; best = { ...sh, ...sp }; }
      }
    }
    return best;
  }

  // Walking is faster on a belt.
  speedAt(x, z) { return this.belts.some((b) => inside(b, x, z, 0)) ? 1.8 : 1; }

  // The spots on a piece of furniture where someone can spend a break, in world coordinates.
  seats(f) {
    const a = (f.rot * Math.PI) / 2, cos = Math.round(Math.cos(a)), sin = Math.round(Math.sin(a));
    const rx = (x, z) => x * cos + z * sin, rz = (x, z) => z * cos - x * sin;
    return (FURNITURE[f.type].use || []).map((u, n) => ({
      key: `${f.id}:${n}`, f, pose: u.pose, h: u.h ?? 0.5, sit: u.ax != null,
      x: f.x + rx(u.x, u.z), z: f.z + rz(u.x, u.z),
      ax: f.x + rx(u.ax ?? u.x, u.az ?? u.z), az: f.z + rz(u.ax ?? u.x, u.az ?? u.z),
      fx: rx(u.f[0], u.f[1]), fz: rz(u.f[0], u.f[1]),
    })).filter((q) => this.isFloor(q.ax, q.az) && !this.inObstacle(q.ax, q.az));
  }

  // Take a free seat on one of these pieces (spread out by who is asking); null when they're all taken.
  claimSeat(list, who) {
    for (let k = 0; k < list.length; k++) {
      const q = this.seats(list[(who + k) % list.length]).find((o) => !this.seatBy.has(o.key));
      if (q) { this.seatBy.set(q.key, who); return q; }
    }
    return null;
  }
  releaseSeat(who) { for (const [k, v] of this.seatBy) if (v === who) this.seatBy.delete(k); }

  // Where to put a product: the nearest shelf tagged for it with room, otherwise the nearest open (untagged) shelf.
  shelfFor(x, z, pid) {
    const s = this.s;
    return this.nearestShelf(x, z, (sh) => sh.f.tags?.includes(pid) && shelfAccepts(s, sh.f, pid)) ?? this.nearestShelf(x, z, (sh) => shelfAccepts(s, sh.f, pid));
  }

  // The side of a station closest to (x, z).
  spotOf(st, x, z) {
    return st.spots.reduce((a, b) => (Math.hypot(b.ax - x, b.az - z) < Math.hypot(a.ax - x, a.az - z) ? b : a));
  }

  nearestTable(x, z) {
    let best = null, bd = Infinity;
    for (const t of this.tables) { const d = Math.hypot(t.ax - x, t.az - z); if (d < bd) { bd = d; best = t; } }
    return best;
  }

  questTarget(t) {
    const s = this.s;
    if (t === 'delivery') return s.boxes.length ? new THREE.Vector3(13.75, 1.4, 2.85) : null;
    const first = { shelf: [this.shelves, 2.4], table: [this.tables, 1.9], desk: [this.desks, 2] }[t];
    if (first?.[0][0]) return new THREE.Vector3(first[0][0].x, first[1], first[0][0].z);
    return null;
  }

  // ---------- per-frame ----------
  // Light follows the clock: warm morning, clear day, golden afternoon and a dark evening with the lights on.
  // A new day's morning fades in over a second or two, while the day card is showing.
  daylight(dt) {
    const s = this.s, f = THREE.MathUtils.clamp(s.dayTime / DAY_LENGTH, 0, 1);
    let i = 0;
    while (i < SKY.length - 2 && f > SKY[i + 1].f) i++;
    const A = SKY[i], B = SKY[i + 1], k = (f - A.f) / (B.f - A.f), e = 1 - Math.exp(-dt * 2.5), c = (this._c ??= new THREE.Color());
    const mix = (cur, a, b) => cur.lerp(c.copy(a).lerp(b, k), e), num = (a, b) => a + (b - a) * k;
    mix(this.scene.background, A.bg, B.bg);
    mix(this.sun.color, A.sun, B.sun);
    mix(this.hemi.color, A.sky, B.sky);
    this.sun.intensity += (num(A.sunI, B.sunI) - this.sun.intensity) * e;
    this.hemi.intensity += (num(A.skyI, B.skyI) - this.hemi.intensity) * e;
    this.glow += (num(A.glow, B.glow) - this.glow) * e;
    this.sunF += (f - this.sunF) * e;
    const a = Math.PI * (0.12 + 0.76 * this.sunF);
    this.sun.position.copy(this.camTarget).add(this._v.set(Math.cos(a) * 15, 6 + Math.sin(a) * 12, 6));
    this.grassMat.color.copy(GRASS).lerp(GRASS_NIGHT, this.glow);
    this.roadMat.color.copy(ROAD).lerp(ROAD_NIGHT, this.glow);
    this.glowMat.opacity = this.glow * 0.8;
    this.bulbMat.emissiveIntensity = this.glow * 1.6;
    for (const m of this.lit) m.emissiveIntensity = this.glow * m.userData.glow;
  }

  update(dt, gdt, focus, questTarget) {
    const s = this.s, now = s.time;
    // Mobile browsers change the viewport (toolbars) without reliable resize events.
    if (this.canvas.clientWidth !== this.cw || this.canvas.clientHeight !== this.ch) this.resize();
    if (this.marker.visible) this.marker.scale.setScalar(1 + Math.sin(now * 6) * 0.12);
    this.camTarget.lerp(new THREE.Vector3(focus.x, 0, focus.z), 1 - Math.exp(-dt * 5));
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.camera.lookAt(this.camTarget);
    this.daylight(dt);
    this.sun.target.position.copy(this.camTarget);
    if (this.beltTex) this.beltTex.offset.x -= gdt * 0.9;
    for (const d of this.decorParts) {
      const on = (this.useActive[d.f.id] || 0) > now;
      if (d.ball && on) { d.ball.position.x = Math.sin(now * 3.1) * 0.55; d.ball.position.z = Math.cos(now * 2.3) * 0.28; }
      if (d.pong && on) { const q = Math.sin(now * 2.8); d.pong.position.set(q * 1.15, 0.86 + Math.abs(Math.cos(now * 2.8)) * 0.35, Math.sin(now * 1.3) * 0.3); }
      if (d.screen) { d.screen.emissive.setHSL(on ? (now * 0.3) % 1 : 0.55, 0.8, 0.55); d.screen.emissiveIntensity = on ? 0.9 : 0.25; }
      if (d.fish) d.fish.forEach((m, k) => { const w = now * (0.5 + k * 0.17) + k * 2; m.position.x = Math.sin(w) * 0.55; m.rotation.y = Math.cos(w) > 0 ? 0 : Math.PI; });
    }

    // Shelf contents
    const sig = JSON.stringify(this.shelves.map((sh) => sh.f.stock)) + capOf(s, { type: 'shelf' });
    if (sig !== this.shelfSig) {
      this.shelfSig = sig;
      // Each shelf shows its own items, grouped by product.
      for (const sh of this.shelves) {
        const per = capOf(s, sh.f), count = sh.items.length;
        const seq = PRODUCTS.map((p) => [p.color, sh.f.stock?.[p.id] || 0]);
        const colorAt = (u) => { for (const [c, n] of seq) { if (u < n) return c; u -= n; } return '#ffffff'; };
        const n = shelfCount(sh.f), shown = Math.ceil((Math.min(per, n) / per) * count);
        // The two biggest products; the rest is one tap away in the shelf's menu.
        const held = PRODUCTS.filter((p) => sh.f.stock?.[p.id]).sort((a, b) => sh.f.stock[b.id] - sh.f.stock[a.id]);
        const what = held.slice(0, 2).map((p) => `${p.icon}${sh.f.stock[p.id]}`).join(' ') + (held.length > 2 ? ` +${held.length - 2}` : '');
        const L = this.shelfLabels[sh.i];
        L.set(`${what || 'Tom'} <b>${n}/${per}</b>`);
        L.el.classList.toggle('full', n >= per);
        L.el.classList.toggle('empty', !n);
        sh.items.forEach((m, k) => {
          m.visible = k < shown;
          if (m.visible) m.material = mat(colorAt(Math.floor((k * per) / count)));
        });
      }
    }

    // Boxes on the receiving floor
    const live = new Set();
    for (const b of s.boxes) {
      if (b.carriedBy) continue;
      live.add(b.id);
      let m = this.boxMeshes.get(b.id);
      if (!m) {
        m = makeBox(productById[b.productId].color, b.ret);
        this.scene.add(m);
        this.boxMeshes.set(b.id, m);
        m.scale.setScalar(0.01);
      }
      const sl = b.at ?? BOX_SLOTS[b.slot];
      m.position.set(sl.x, 0, sl.z);
      m.scale.setScalar(Math.min(1, m.scale.x + dt * 4));
    }
    for (const [id, m] of this.boxMeshes) if (!live.has(id)) { this.scene.remove(m); this.boxMeshes.delete(id); }

    // Picked items someone put down on the floor
    const dsig = s.drops.map((d) => `${d.id}:${d.x},${d.z}:${d.orderIds.join('.')}`).join('|');
    if (dsig !== this.dropSig) {
      this.dropSig = dsig;
      if (this.dropGroup) this.scene.remove(this.dropGroup);
      this.dropGroup = new THREE.Group();
      for (const d of s.drops) {
        d.orderIds.forEach((id, i) => {
          const o = s.orders.find((x) => x.id === id);
          this.dropGroup.add(at(rbox(0.36, 0.13, 0.3, productById[o?.productId]?.color || '#fff', 0.04), d.x + (i % 2) * 0.12, 0.07 + i * 0.14, d.z));
        });
      }
      this.scene.add(this.dropGroup);
    }

    this.parcelMeshes.forEach((m, i) => (m.visible = i < s.parcels));

    this.tables.forEach((t, i) => {
      const active = (this.tablePacking[i] || -9) > now - 0.15;
      t.box.visible = active;
      // The box is folded up, then taped shut.
      const p = this.tableProg[i] || 0, h = Math.max(0.12, Math.min(1, p * 2.4));
      t.tape.visible = active && p > 0.55;
      if (active) { t.box.scale.y = h; t.box.position.y = 0.88 + 0.19 * h; t.tape.scale.x = Math.max(0.05, (p - 0.55) / 0.45); }
      const broken = s.broken?.fid === t.id && s.broken.until > now;
      if (broken && this.tableRes[i] == null) this.tableRes[i] = 'broken';
      else if (!broken && this.tableRes[i] === 'broken') this.tableRes[i] = null;
      t.g.rotation.z = broken ? 0.07 : 0;
    });
    const out = this.tables.find((t) => s.broken?.fid === t.id && s.broken.until > now);
    this.lblBroken.hidden = !out;
    if (out) this.lblBroken.pos = new THREE.Vector3(out.x, 1.7, out.z);
    this.desks.forEach((d, i) => {
      const on = (this.deskActive[i] || -9) > now - 0.15;
      d.screenMat.emissive.setHSL(on ? (now * 0.15 + i * 0.3) % 1 : 0.55, 0.7, 0.55);
      d.screenMat.emissiveIntensity = on ? 0.9 + Math.sin(now * 8) * 0.15 : 0.12;
    });

    for (const t of this.trucks) {
      const z = t.g.position.z, dt = gdt;
      if (t.state === 'in') {
        t.g.position.z = z + Math.max(1.2, (t.stop - z) * 3) * dt;
        if (t.g.position.z >= t.stop) { t.g.position.z = t.stop; t.state = 'wait'; t.t = 1.4; }
      } else if (t.state === 'wait') {
        if ((t.t -= dt) <= 0) t.state = 'out';
      } else if (t.state === 'out') {
        t.g.position.z = z + Math.min(18, 2 + (z - t.stop) * 2) * dt;
        if (t.g.position.z > 45) { t.state = 'away'; t.g.position.z = -25; if (t.again) { t.again = false; t.state = 'in'; } }
      }
    }

    const waiting = s.boxes.filter((b) => !b.carriedBy && !b.at).length;
    const rets = s.boxes.filter((b) => !b.carriedBy && !b.at && b.ret).length;
    this.lblDelivery.set(waiting ? [waiting > rets && `📦 ${waiting - rets}`, rets && `↩️ ${rets}`].filter(Boolean).join(' ') : s.deliveries.length ? `🚚 ${s.deliveries.length} på vej` : '');
    // What's waiting to be packed, per product: grey = still on the shelf, green ✓ = already fetched.
    const q = queuedCount(s), open = {};
    for (const o of s.orders) (open[o.productId] ??= { q: 0, p: 0 })[o.status === 'picked' ? 'p' : 'q']++;
    const kinds = Object.entries(open);
    const chips = kinds.slice(0, 4).map(([id, n]) => (n.q ? `<i>${productById[id].icon}${n.q}</i>` : '') + (n.p ? `<i class="got">${productById[id].icon}${n.p}✓</i>` : '')).join('') + (kinds.length > 4 ? `<i>+${kinds.length - 4}</i>` : '');
    this.lblOrders.set(s.orders.length ? `🧾 ${s.orders.length} at pakke<span class="olist">${chips}</span>` : '');
    this.lblOrders.el.classList.toggle('hot', q >= 6);
    this.lblTickets.set(s.tickets ? `🎧 ${s.tickets} ${s.tickets === 1 ? 'henvendelse' : 'henvendelser'}` : '');
    this.lblTickets.el.classList.toggle('hot', s.tickets >= 5);

    if (questTarget) {
      this.arrow.visible = true;
      this.arrow.position.set(questTarget.x, questTarget.y + 0.6 + Math.abs(Math.sin(now * 4)) * 0.35, questTarget.z);
      this.arrow.rotation.y += dt * 2;
      this.lblQuest.hidden = false;
      this.lblQuest.pos = new THREE.Vector3(questTarget.x, questTarget.y + 1.6, questTarget.z);
    } else { this.arrow.visible = false; this.lblQuest.hidden = true; }

    this.updateLabels(dt);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}

// Return boxes are grey with a red return sticker on the side.
export function makeBox(color, ret = false) {
  const g = new THREE.Group();
  g.add(at(rbox(0.62, 0.46, 0.62, ret ? '#b9b2aa' : '#d9a066', 0.05), 0, 0.23, 0));
  if (ret) g.add(at(rbox(0.3, 0.16, 0.02, '#ef476f', 0.01), 0, 0.26, 0.315));
  g.add(at(rbox(0.64, 0.02, 0.12, '#c08552', 0.01), 0, 0.465, 0));
  g.add(at(rbox(0.22, 0.02, 0.22, color, 0.01), 0.16, 0.47, 0.16));
  return g;
}
