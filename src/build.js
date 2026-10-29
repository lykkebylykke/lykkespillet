import * as THREE from 'three';
import { FURNITURE, TILE_COST, TILE_RENT } from './data.js';
import { bus, syncFurniture, assignDesks, spend, kr } from './state.js';
import { footprint, LOT, TILE, TILES, tileKey } from './world.js';

const SNAP = 0.25;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const $ = (sel) => document.querySelector(sel);

// Placing and moving furniture, and buying floor space.
// Modes: null (playing), 'edit' (pick something to move), 'place' (ghost follows the finger), 'expand' (drag over tiles to buy).
export class Builder {
  constructor(world, s, player) {
    this.w = world; this.s = s; this.player = player;
    this.mode = null;
    this.focus = new THREE.Vector3();
    document.getElementById('app').insertAdjacentHTML('beforeend', `
      <div id="buildbar">
        <div class="bmsg"></div>
        <div class="bbtns"></div>
      </div>`);
    document.getElementById('hud').insertAdjacentHTML('beforeend', `
      <div id="buildfab">
        <button class="fab kit" data-b="kit">📦 Placér <b></b></button>
        <button class="fab" data-b="edit">🛠️ Indret</button>
      </div>`);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-b]');
      if (!b || b.disabled) return;
      bus.emit('sfx', 'click');
      this[b.dataset.b]();
    });
    bus.on('placeStart', (type) => this.start(type));
    bus.on('expandStart', () => this.expand());

    this.ghost = null;
    this.foot = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }));
    this.foot.rotation.x = -Math.PI / 2;
    this.spot = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }));
    this.spot.rotation.x = -Math.PI / 2;
    this.foot.visible = this.spot.visible = false;
    world.scene.add(this.foot, this.spot);
    this.render();
  }

  get active() { return this.mode != null; }
  kitCount() { return Object.values(this.s.kit).reduce((a, b) => a + b, 0); }

  // ---------- buttons ----------
  kit() { const type = Object.keys(this.s.kit).find((k) => this.s.kit[k] > 0); if (type) this.start(type); }
  edit() { this.mode = 'edit'; this.setZoom(true); this.render(); }
  done() { this.clearTiles(); this.mode = null; this.setZoom(false); this.render(); }
  rotate() { this.p.rot = (this.p.rot + 1) % 4; this.validate(); }
  cancel() { this.clearGhost(); this.p = null; this.mode = this.wasEditing ? 'edit' : null; if (!this.mode) this.setZoom(false); this.render(); }

  confirm() {
    const s = this.s, p = this.p;
    if (!this.validate()) return;
    if (p.id == null) {
      s.furniture.push({ id: s.nextId++, type: p.type, x: p.x, z: p.z, rot: p.rot });
      s.kit[p.type]--;
    } else Object.assign(s.furniture.find((f) => f.id === p.id), { x: p.x, z: p.z, rot: p.rot });
    syncFurniture(s);
    assignDesks(s);
    bus.emit('built', { ...FURNITURE[p.type], moved: p.id != null });
    this.clearGhost();
    this.p = null;
    // Keep going through the kit, otherwise back to where we came from.
    const next = Object.keys(s.kit).find((k) => s.kit[k] > 0);
    if (next && !this.wasEditing) { this.start(next); return; }
    this.mode = this.wasEditing ? 'edit' : null;
    if (!this.mode) this.setZoom(false);
    this.render();
  }

  // ---------- buying floor space ----------
  expand() {
    this.clearGhost();
    this.p = null;
    this.mode = 'expand';
    this.sel = [];
    this.player.stopPath();
    this.w.zoom = 0.5;
    this.w.resize();
    this.focus.set((LOT.x0 + LOT.x1) / 2 + 2, 0, (LOT.z0 + LOT.z1) / 2);
    this.drawTiles();
    this.render();
  }

  // One faint square per tile we could buy; the selection turns green (or red if it isn't next to the shop).
  drawTiles() {
    this.clearTiles();
    this.tiles = new THREE.Group();
    this.tileMats ??= ['#ffffff', '#2bb673', '#ef476f'].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false }));
    const geo = new THREE.PlaneGeometry(TILE - 0.2, TILE - 0.2);
    for (let i = TILES.i0; i < TILES.i1; i++) for (let j = TILES.j0; j < TILES.j1; j++) {
      if (this.w.ownsTile(i, j)) continue;
      const m = new THREE.Mesh(geo, this.tileMats[0]);
      m.rotation.x = -Math.PI / 2;
      m.position.set(i * TILE + 1, 0.02, j * TILE + 1);
      m.userData.key = tileKey(i, j);
      this.tiles.add(m);
    }
    this.w.scene.add(this.tiles);
  }

  clearTiles() { if (this.tiles) this.w.scene.remove(this.tiles); this.tiles = null; this.sel = []; }

  tileAt(g) { return { i: Math.floor(g.x / TILE), j: Math.floor(g.z / TILE) }; }

  select(a, b) {
    const A = this.tileAt(a), B = this.tileAt(b), w = this.w, sel = [];
    for (let i = Math.max(TILES.i0, Math.min(A.i, B.i)); i <= Math.min(TILES.i1 - 1, Math.max(A.i, B.i)); i++)
      for (let j = Math.max(TILES.j0, Math.min(A.j, B.j)); j <= Math.min(TILES.j1 - 1, Math.max(A.j, B.j)); j++)
        if (!w.ownsTile(i, j)) sel.push([i, j]);
    this.sel = sel;
    const keys = new Set(sel.map(([i, j]) => tileKey(i, j)));
    this.selOk = sel.some(([i, j]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => w.ownsTile(i + di, j + dj)));
    for (const m of this.tiles.children) m.material = this.tileMats[keys.has(m.userData.key) ? (this.selOk ? 1 : 2) : 0];
    this.render();
  }

  buyTiles() {
    const s = this.s, n = this.sel.length;
    if (!n || !this.selOk) return;
    if (!spend(s, n * TILE_COST, 'invest')) { bus.emit('toast', 'Ikke nok penge 💸', 'bad'); return; }
    s.tiles.push(...this.sel.map(([i, j]) => tileKey(i, j)));
    this.w.buildRoom();
    this.w.rebuild();
    bus.emit('toast', `📐 Lageret er udvidet med ${n * TILE * TILE} m²!`, 'good');
    bus.emit('sfx', 'level');
    this.drawTiles();
    this.render();
  }

  // ---------- placing ----------
  start(type, id = null) {
    const s = this.s, F = FURNITURE[type];
    this.wasEditing = this.mode === 'edit';
    this.clearGhost();
    let pos;
    if (id != null) { const f = s.furniture.find((x) => x.id === id); pos = { x: f.x, z: f.z, rot: f.rot }; } else pos = this.suggest(type);
    this.p = { type, id, ...pos, rx: pos.x, rz: pos.z };
    const i = id != null ? s.furniture.filter((f) => f.type === type).findIndex((f) => f.id === id) : s[F.key];
    this.ghost = this.w.makeFurniture(type, i).g;
    this.ghost.traverse((m) => {
      if (!m.material) return;
      m.material = m.material.clone();
      m.material.transparent = true;
      m.material.opacity = 0.75;
      m.castShadow = false;
    });
    this.w.scene.add(this.ghost);
    this.foot.visible = this.spot.visible = true;
    this.mode = 'place';
    this.setZoom(true);
    this.validate();
    this.render();
  }

  // The old fixed slots make good first suggestions; otherwise search outward from the player.
  suggest(type) {
    for (const sl of FURNITURE[type].slots ?? []) if (this.w.canPlace(type, sl.x, sl.z, 0).ok) return { x: sl.x, z: sl.z, rot: 0 };
    const px = snap(this.player.pos.x), pz = snap(this.player.pos.z);
    for (let r = 0; r < 20; r += SNAP) {
      for (let a = 0; a < 16; a++) {
        const x = snap(px + Math.cos((a / 16) * Math.PI * 2) * r), z = snap(pz + Math.sin((a / 16) * Math.PI * 2) * r);
        for (let rot = 0; rot < 4; rot++) if (this.w.canPlace(type, x, z, rot).ok) return { x, z, rot };
      }
    }
    return { x: px, z: pz, rot: 0 };
  }

  moveTo(x, z) {
    const p = this.p;
    p.rx = THREE.MathUtils.clamp(x, LOT.x0, LOT.x1);
    p.rz = THREE.MathUtils.clamp(z, LOT.z0, LOT.z1);
    const nx = snap(p.rx), nz = snap(p.rz);
    if (nx !== p.x || nz !== p.z) { p.x = nx; p.z = nz; this.validate(); }
  }

  validate() {
    const p = this.p;
    const res = this.w.canPlace(p.type, p.x, p.z, p.rot, p.id);
    const fp = res.fp || footprint(p.type, p.x, p.z, p.rot), b = fp.box;
    this.ok = res.ok;
    this.why = res.why;
    this.ghost.position.set(p.x, 0, p.z);
    this.ghost.rotation.y = (p.rot * Math.PI) / 2;
    const col = res.ok ? '#2bb673' : '#ef476f';
    this.foot.material.color.set(col);
    this.foot.scale.set(b.maxX - b.minX + 0.1, b.maxZ - b.minZ + 0.1, 1);
    this.foot.position.set(p.x, 0.02, p.z);
    this.spot.material.color.set(col);
    this.spot.position.set(fp.ax, 0.03, fp.az);
    this.spot.visible = !FURNITURE[p.type].decor;
    this.render();
    return res.ok;
  }

  clearGhost() {
    if (this.ghost) this.w.scene.remove(this.ghost);
    this.ghost = null;
    this.foot.visible = this.spot.visible = false;
  }

  setZoom(on) {
    if (on) this.player.stopPath();
    this.w.zoom = on ? 0.75 : 1;
    this.w.resize();
  }

  // ---------- input from main.js ----------
  onTap(g) {
    if (!g) return;
    if (this.mode === 'place') { this.moveTo(g.x, g.z); return; }
    if (this.mode === 'expand') { this.select(g, g); return; }
    // Edit mode: pick up the piece under the finger.
    let best = null, bd = Infinity;
    for (const f of this.s.furniture) {
      const b = footprint(f.type, f.x, f.z, f.rot).box;
      if (g.x < b.minX - 0.4 || g.x > b.maxX + 0.4 || g.z < b.minZ - 0.4 || g.z > b.maxZ + 0.4) continue;
      const d = Math.hypot(f.x - g.x, f.z - g.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) this.start(best.type, best.id);
  }

  // Dragging moves the ghost; in edit mode it pans the view.
  onDrag(a, b, origin) {
    if (!a || !b) return;
    if (this.mode === 'expand') { if (origin) this.select(origin, b); return; }
    if (this.mode === 'place') this.moveTo(this.p.rx + b.x - a.x, this.p.rz + b.z - a.z);
    else if (this.mode === 'edit') this.focus.set(THREE.MathUtils.clamp(this.focus.x - (b.x - a.x), LOT.x0, LOT.x1), 0, THREE.MathUtils.clamp(this.focus.z - (b.z - a.z), LOT.z0, LOT.z1));
  }

  update(playerPos) {
    if (this.mode === 'place') this.focus.set(this.p.rx, 0, this.p.rz);
    else if (this.mode !== 'edit' && this.mode !== 'expand') this.focus.copy(playerPos);
    const n = this.kitCount();
    if (n !== this.shownKit) { this.shownKit = n; this.render(); }
  }

  render() {
    const placing = this.mode === 'place';
    document.body.classList.toggle('building', this.active);
    const kit = $('#buildfab .kit');
    kit.hidden = !this.kitCount();
    kit.querySelector('b').textContent = this.kitCount();
    $('#buildfab').hidden = this.active;
    $('#buildbar').hidden = !this.active;
    if (!this.active) return;
    if (this.mode === 'expand') {
      const n = this.sel.length;
      $('#buildbar .bmsg').innerHTML = !n ? `<b>📐 Udvid lageret</b> · Træk en firkant over de felter du vil købe · ${kr(TILE_COST)} pr. felt (${TILE}×${TILE} m)`
        : this.selOk ? `<b>📐 ${n} ${n === 1 ? 'felt' : 'felter'} · ${n * TILE * TILE} m²</b> · ${kr(n * TILE_COST)} · husleje +${kr(n * TILE_RENT)}/dag`
        : `<b>📐 ${n} ${n === 1 ? 'felt' : 'felter'}</b> · <span class="bad">Skal ligge op ad lageret</span>`;
      $('#buildbar .bbtns').innerHTML = `<button class="btn ghost" data-b="done">Færdig</button>
        <button class="btn ok" data-b="buyTiles" ${n && this.selOk && this.s.money >= n * TILE_COST ? '' : 'disabled'}>✓ Køb${n ? ` ${kr(n * TILE_COST)}` : ''}</button>`;
    } else if (placing) {
      const F = FURNITURE[this.p.type];
      $('#buildbar .bmsg').innerHTML = this.ok
        ? `<b>${F.icon} ${F.name}</b> · Træk for at flytte · ${F.decor ? `😊 +${F.joy} glæde for ansatte tæt på` : '🟢 = hvor man står'}`
        : `<b>${F.icon} ${F.name}</b> · <span class="bad">${this.why}</span>`;
      $('#buildbar .bbtns').innerHTML = `<button class="btn ghost" data-b="cancel">✕</button><button class="btn ghost" data-b="rotate">↻ Drej</button>
        <button class="btn ok" data-b="confirm" ${this.ok ? '' : 'disabled'}>✓ Placér</button>`;
    } else {
      $('#buildbar .bmsg').innerHTML = '<b>🛠️ Indret</b> · Tryk på et møbel for at flytte eller dreje det';
      $('#buildbar .bbtns').innerHTML = `${this.kitCount() ? '<button class="btn ghost" data-b="kit">📦 Placér nyt</button>' : ''}<button class="btn ghost" data-b="expand">📐 Udvid</button><button class="btn ok" data-b="done">Færdig</button>`;
    }
  }
}
