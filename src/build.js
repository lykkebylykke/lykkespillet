import * as THREE from 'three';
import { FURNITURE } from './data.js';
import { bus, syncFurniture, assignDesks } from './state.js';
import { footprint, W, D } from './world.js';

const SNAP = 0.25;
const snap = (v) => Math.round(v / SNAP) * SNAP;
const $ = (sel) => document.querySelector(sel);

// Placing and moving furniture. Modes: null (playing), 'edit' (pick something to move), 'place' (ghost follows the finger).
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
  done() { this.mode = null; this.setZoom(false); this.render(); }
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
    for (const sl of FURNITURE[type].slots) if (this.w.canPlace(type, sl.x, sl.z, 0).ok) return { x: sl.x, z: sl.z, rot: 0 };
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
    p.rx = THREE.MathUtils.clamp(x, 0, W);
    p.rz = THREE.MathUtils.clamp(z, 0, D);
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
  onDrag(a, b) {
    if (!a || !b) return;
    if (this.mode === 'place') this.moveTo(this.p.rx + b.x - a.x, this.p.rz + b.z - a.z);
    else if (this.mode === 'edit') this.focus.set(THREE.MathUtils.clamp(this.focus.x - (b.x - a.x), 0, W), 0, THREE.MathUtils.clamp(this.focus.z - (b.z - a.z), 0, D));
  }

  update(playerPos) {
    if (this.mode === 'place') this.focus.set(this.p.rx, 0, this.p.rz);
    else if (this.mode !== 'edit') this.focus.copy(playerPos);
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
    if (placing) {
      const F = FURNITURE[this.p.type];
      $('#buildbar .bmsg').innerHTML = this.ok
        ? `<b>${F.icon} ${F.name}</b> · Træk for at flytte · 🟢 = hvor man står`
        : `<b>${F.icon} ${F.name}</b> · <span class="bad">${this.why}</span>`;
      $('#buildbar .bbtns').innerHTML = `<button class="btn ghost" data-b="cancel">✕</button><button class="btn ghost" data-b="rotate">↻ Drej</button>
        <button class="btn ok" data-b="confirm" ${this.ok ? '' : 'disabled'}>✓ Placér</button>`;
    } else {
      $('#buildbar .bmsg').innerHTML = '<b>🛠️ Indret</b> · Tryk på et møbel for at flytte eller dreje det';
      $('#buildbar .bbtns').innerHTML = `${this.kitCount() ? '<button class="btn ghost" data-b="kit">📦 Placér nyt</button>' : ''}<button class="btn ok" data-b="done">Færdig</button>`;
    }
  }
}
