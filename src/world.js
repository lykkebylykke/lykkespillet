import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOX_SLOTS, DELIVERY_SPOT, PALLET, FURNITURE, PRODUCTS, productById } from './data.js';
import { capacity, stockTotal, queuedCount, shelfCap, shelfCount } from './state.js';

// The lot is split into 2×2 m tiles; the shop owns the original 18×20 m and can buy more (not towards the road).
export const TILE = 2;
export const LOT = { x0: -12, z0: -8, x1: 18, z1: 32 };
export const TILES = { i0: LOT.x0 / TILE, j0: LOT.z0 / TILE, i1: LOT.x1 / TILE, j1: LOT.z1 / TILE };
export const tileKey = (i, j) => `${i},${j}`;
export const isBaseTile = (i, j) => i >= 0 && i < 9 && j >= 0 && j < 10;
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

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c8b9a6', 1.6));
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
    sc.add(plane(160, 160, '#a7d99b', 9, 10, -0.03));
    sc.add(plane(3.6, 160, '#8e95a3', 20.8, 10, -0.02));
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

  // ---------- the room: owned 2×2 m tiles, floor, walls ----------
  ownsTile(i, j) { return isBaseTile(i, j) || this.tileSet.has(tileKey(i, j)); }
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
    this.tileSet = new Set(this.s.tiles);
    if (this.room) sc.remove(this.room);
    const g = (this.room = new THREE.Group());
    sc.add(g);
    const wall = '#fff3e3', trim = '#ff8fab', walls = [];
    for (let i = TILES.i0; i < TILES.i1; i++) for (let j = TILES.j0; j < TILES.j1; j++) {
      if (!own(i, j)) continue;
      const x0 = i * TILE, z0 = j * TILE;
      g.add(plane(TILE, TILE, '#f1ebe2', x0 + 1, z0 + 1));
      // Back walls (north/west) are tall with windows; the front ones are low so you can see in.
      if (!own(i, j - 1)) {
        g.add(at(rbox(2.25, 2.4, 0.25, wall), x0 + 1, 1.2, z0 - 0.125), at(rbox(2.25, 0.12, 0.3, trim), x0 + 1, 2.4, z0 - 0.125));
        if ((i + j) % 2) g.add(at(rbox(1.4, 0.9, 0.06, '#bde0fe'), x0 + 1, 1.45, z0 + 0.02));
        walls.push({ minX: x0 - 0.125, maxX: x0 + 2.125, minZ: z0 - 0.25, maxZ: z0 });
      }
      if (!own(i - 1, j)) {
        g.add(at(rbox(0.25, 2.4, 2.25, wall), x0 - 0.125, 1.2, z0 + 1), at(rbox(0.3, 0.12, 2.25, trim), x0 - 0.125, 2.4, z0 + 1));
        if ((i + j) % 2) g.add(at(rbox(0.06, 0.9, 1.4, '#bde0fe'), x0 + 0.02, 1.45, z0 + 1));
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
    for (const [z0, z1] of [[0, 1], [5.5, 14], [17.5, 20]]) g.add(at(rbox(0.25, 0.5, z1 - z0, wall), 18.125, 0.25, (z0 + z1) / 2));
    for (const z of [1, 5.5, 14, 17.5]) g.add(at(rbox(0.32, 2.4, 0.32, trim), 18.125, 1.2, z));
    g.add(at(rbox(0.32, 0.3, 4.8, trim), 18.125, 2.35, 3.25), at(rbox(0.32, 0.3, 3.8, trim), 18.125, 2.35, 15.75));
    walls.push({ minX: 18, maxX: 18.25, minZ: 0, maxZ: 20 });
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

  screenToGround(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray ??= new THREE.Raycaster();
    this.ray.setFromCamera(ndc, this.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
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
    if (type === 'shelf') {
      for (const [px, pz] of [[-1.27, -0.3], [1.27, -0.3], [-1.27, 0.3], [1.27, 0.3]]) g.add(at(rbox(0.08, 1.75, 0.08, '#5c677d', 0.02), px, 0.875, pz));
      const items = [];
      this.itemGeo ??= new RoundedBoxGeometry(0.36, 0.3, 0.46, 2, 0.06);
      for (const [b, y] of [0.1, 0.5, 0.9, 1.3].entries()) {
        g.add(at(rbox(2.62, 0.06, 0.72, '#a3b1c6', 0.02), 0, y, 0));
        for (let c = 0; c < 5; c++) {
          const m = new THREE.Mesh(this.itemGeo, mat('#ffffff'));
          m.castShadow = true;
          m.position.set(-1.04 + c * 0.52, y + 0.18, 0);
          m.visible = false;
          g.add(m);
          items[b * 5 + c] = m;
        }
      }
      g.add(at(rbox(2.62, 0.06, 0.72, '#a3b1c6', 0.02), 0, 1.72, 0));
      return { g, items };
    }
    if (type === 'table') {
      for (const [px, pz] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) g.add(at(rbox(0.09, 0.8, 0.09, '#9c6644', 0.02), px, 0.4, pz));
      g.add(at(rbox(2, 0.1, 1, '#e9c46a', 0.04), 0, 0.83, 0));
      g.add(at(rbox(0.3, 0.2, 0.2, '#e63946', 0.05), 0.72, 0.98, -0.28));
      g.add(at(rbox(0.6, 0.12, 0.45, '#d4a373', 0.02), -0.62, 0.94, -0.2));
      const box = at(rbox(0.5, 0.38, 0.5, '#d9a066', 0.05), 0, 1.07, 0.05);
      box.visible = false;
      g.add(box);
      return { g, box };
    }
    if (FURNITURE[type].decor) return { g: this.makeDecor(type, g) };
    for (const [px, pz] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) g.add(at(rbox(0.07, 0.74, 0.07, '#adb5bd', 0.02), px, 0.37, pz));
    g.add(at(rbox(1.6, 0.08, 0.8, '#f4f1de', 0.03), 0, 0.76, 0));
    g.add(at(rbox(0.12, 0.25, 0.08, '#495057', 0.02), 0, 0.92, -0.25));
    g.add(at(rbox(0.8, 0.5, 0.06, '#2b2d42', 0.03), 0, 1.25, -0.26));
    const screenMat = new THREE.MeshStandardMaterial({ color: '#1b1b2f', emissive: '#4cc9f0', emissiveIntensity: 0.15 });
    g.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.4), screenMat), 0, 1.25, -0.225));
    g.add(at(rbox(0.5, 0.03, 0.16, '#dee2e6', 0.01), 0, 0.81, 0.08));
    g.add(at(rbox(0.12, 0.12, 0.12, i === 0 ? '#ff8fab' : '#90e0ef', 0.04), 0.6, 0.86, -0.15));
    return { g, screenMat };
  }

  makeDecor(type, g) {
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
      g.add(at(ball(0.04, '#ffffff'), 0.05, 1.0, 0.05));
    }
    g.traverse((m) => { m.castShadow = true; });
    return g;
  }

  rebuild() {
    const s = this.s;
    if (this.stations) this.scene.remove(this.stations);
    this.stations = new THREE.Group();
    this.scene.add(this.stations);
    this.shelves = []; this.tables = []; this.desks = [];
    this.obstacles = [...this.staticObstacles];
    this.zones = [{ type: 'delivery', x: DELIVERY_SPOT.x, z: DELIVERY_SPOT.z, r: 1.3 }];
    const lists = { shelf: this.shelves, table: this.tables, desk: this.desks };
    for (const f of s.furniture) {
      const list = lists[f.type], i = list?.length ?? 0;
      const { g, ...parts } = this.makeFurniture(f.type, i);
      g.position.set(f.x, 0, f.z);
      g.rotation.y = (f.rot * Math.PI) / 2;
      this.stations.add(g);
      const fp = footprint(f.type, f.x, f.z, f.rot);
      if (!list) { this.obstacles.push(fp.box); continue; }
      if (f.type === 'shelf' && f.only) g.add(this.shelfSign(f.only));
      list.push({ i, id: f.id, f, type: f.type, x: f.x, z: f.z, ax: fp.ax, az: fp.az, fx: fp.fx, fz: fp.fz, spots: [{ ax: fp.ax, az: fp.az, fx: fp.fx, fz: fp.fz }], ...parts });
      this.obstacles.push(fp.box);
      this.zones.push({ type: f.type, idx: i, x: fp.ax, z: fp.az, r: FURNITURE[f.type].r });
    }
    // Shelves and packing tables can also be used from the back when there's room to stand there.
    for (const st of [...this.shelves, ...this.tables]) {
      const bx = 2 * st.x - st.ax, bz = 2 * st.z - st.az;
      if (!this.isFloor(bx, bz) || this.obstacles.some((o) => inside(o, bx, bz, 0.3))) continue;
      st.spots.push({ ax: bx, az: bz, fx: -st.fx, fz: -st.fz });
      this.zones.push({ type: st.type, idx: st.i, x: bx, z: bz, r: FURNITURE[st.type].r });
    }
    this.shelfSig = '';
    this.buildGrid();
  }

  // A sign on top of a shelf reserved for one product, readable from both sides.
  shelfSign(pid) {
    const p = productById[pid], g = new THREE.Group();
    for (const r of [0, Math.PI]) {
      const t = textPlane(`${p.icon} ${p.name}`, 2.2, 0.42, { color: '#ffffff', bg: p.color });
      t.rotation.y = r;
      t.position.z = r ? -0.02 : 0.02;
      g.add(t);
    }
    g.position.y = 2.02;
    return g;
  }

  // Can this piece go here? Checks walls, overlaps, room in front and that every station stays reachable.
  canPlace(type, x, z, rot, ignoreId) {
    const fp = footprint(type, x, z, rot), b = fp.box, decor = FURNITURE[type].decor;
    if (!this.boxOnFloor(b)) return { ok: false, why: 'Uden for rummet' };
    if (!decor && !this.boxOnFloor(this.aabb(fp.ax, fp.az, 0, 0), 0.35)) return { ok: false, why: 'Der skal være plads foran' };
    const others = this.s.furniture.filter((f) => f.id !== ignoreId).map((f) => ({ f, fp: footprint(f.type, f.x, f.z, f.rot) }));
    const solid = [...this.staticObstacles, ...others.map((o) => o.fp.box)];
    if ([...solid, ...KEEP_CLEAR].some((o) => overlaps(b, o, 0.05))) return { ok: false, why: 'Der står noget i vejen' };
    if (!decor && solid.some((o) => inside(o, fp.ax, fp.az, 0.3))) return { ok: false, why: 'Der skal være plads foran' };
    // Flood-fill from the receiving area: every access point must still be reachable.
    const grid = this.makeGrid([...solid, b]), seen = new Uint8Array(NX * NZ);
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
    const reach = (ax, az) => [-0.5, 0, 0.5].some((dx) => [-0.5, 0, 0.5].some((dz) => seen[this.cellOf(ax + dx, az + dz)]));
    if ((!decor && !reach(fp.ax, fp.az)) || others.some((o) => !FURNITURE[o.f.type].decor && !reach(o.fp.ax, o.fp.az))) return { ok: false, why: 'Det spærrer vejen' };
    return { ok: true, fp };
  }

  buildLabels() {
    this.lblDelivery = this.addLabel('bubble', '', new THREE.Vector3(13.75, 1.4, 2.85));
    // These follow the first table / shelf / desk wherever it was placed.
    const above = (list, y, fallback) => () => (list()[0] ? new THREE.Vector3(list()[0].x, y, list()[0].z) : fallback);
    this.lblOrders = this.addLabel('bubble orders', '', above(() => this.tables, 1.9, new THREE.Vector3(15.6, 1.9, 9)));
    this.lblStock = this.addLabel('bubble', '', above(() => this.shelves, 2.5, new THREE.Vector3(4.75, 2.5, 9.2)));
    this.lblTickets = this.addLabel('bubble', '', above(() => this.desks, 2.2, new THREE.Vector3(4.6, 2.2, 3.4)));
    this.lblQuest = this.addLabel('qarrow', '⬇', new THREE.Vector3(), { clamp: true });
    this.lblQuest.hidden = true;
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
        const m = 40, top = 190, bottom = 150;
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
  update(dt, focus, questTarget) {
    const s = this.s, now = s.time;
    // Mobile browsers change the viewport (toolbars) without reliable resize events.
    if (this.canvas.clientWidth !== this.cw || this.canvas.clientHeight !== this.ch) this.resize();
    if (this.marker.visible) this.marker.scale.setScalar(1 + Math.sin(now * 6) * 0.12);
    this.camTarget.lerp(new THREE.Vector3(focus.x, 0, focus.z), 1 - Math.exp(-dt * 5));
    this.camera.position.copy(this.camTarget).add(this.camOffset);
    this.camera.lookAt(this.camTarget);
    this.sun.position.copy(this.camTarget).add(new THREE.Vector3(7, 16, 5));
    this.sun.target.position.copy(this.camTarget);

    // Shelf contents
    const cap = capacity(s), per = shelfCap(s);
    const sig = JSON.stringify(this.shelves.map((sh) => sh.f.stock)) + per;
    if (sig !== this.shelfSig) {
      this.shelfSig = sig;
      // Each shelf shows its own items, grouped by product.
      for (const sh of this.shelves) {
        const seq = PRODUCTS.map((p) => [p.color, sh.f.stock?.[p.id] || 0]);
        const colorAt = (u) => { for (const [c, n] of seq) { if (u < n) return c; u -= n; } return '#ffffff'; };
        const shown = Math.ceil((Math.min(per, shelfCount(sh.f)) / per) * 20);
        sh.items.forEach((m, k) => {
          m.visible = k < shown;
          if (m.visible) m.material = mat(colorAt(Math.floor((k * per) / 20)));
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
        m = makeBox(productById[b.productId].color);
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
      if (active) { t.box.rotation.y = Math.sin(now * 9) * 0.25; t.box.scale.y = 0.85 + Math.abs(Math.sin(now * 12)) * 0.2; }
    });
    this.desks.forEach((d, i) => {
      const on = (this.deskActive[i] || -9) > now - 0.15;
      d.screenMat.emissive.setHSL(on ? (now * 0.15 + i * 0.3) % 1 : 0.55, 0.7, 0.55);
      d.screenMat.emissiveIntensity = on ? 0.9 + Math.sin(now * 8) * 0.15 : 0.12;
    });

    for (const t of this.trucks) {
      const z = t.g.position.z;
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
    this.lblDelivery.set(waiting ? `📦 ${waiting}` : s.deliveries.length ? `🚚 ${s.deliveries.length} på vej` : '');
    // What's waiting to be packed, per product: grey = still on the shelf, green ✓ = already fetched.
    const q = queuedCount(s), open = {};
    for (const o of s.orders) (open[o.productId] ??= { q: 0, p: 0 })[o.status === 'picked' ? 'p' : 'q']++;
    const chips = Object.entries(open).map(([id, n]) => (n.q ? `<i>${productById[id].icon}${n.q}</i>` : '') + (n.p ? `<i class="got">${productById[id].icon}${n.p}✓</i>` : '')).join('');
    this.lblOrders.set(s.orders.length ? `🧾 ${s.orders.length} at pakke<span class="olist">${chips}</span>` : '');
    this.lblOrders.el.classList.toggle('hot', q >= 6);
    this.lblTickets.set(s.tickets ? `🎧 ${s.tickets} ${s.tickets === 1 ? 'henvendelse' : 'henvendelser'}` : '');
    this.lblTickets.el.classList.toggle('hot', s.tickets >= 5);
    const st = stockTotal(s);
    this.lblStock.set(`🏬 ${st}/${cap}`);
    this.lblStock.el.classList.toggle('hot', st >= cap);

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

export function makeBox(color) {
  const g = new THREE.Group();
  g.add(at(rbox(0.62, 0.46, 0.62, '#d9a066', 0.05), 0, 0.23, 0));
  g.add(at(rbox(0.64, 0.02, 0.12, '#c08552', 0.01), 0, 0.465, 0));
  g.add(at(rbox(0.22, 0.02, 0.22, color, 0.01), 0.16, 0.47, 0.16));
  return g;
}
