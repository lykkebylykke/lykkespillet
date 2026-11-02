import * as THREE from 'three';
import { mat, rbox, at, makeBox } from './world.js';
import { ROLES, EMP_TIERS, IDLE, DELIVERY_SPOT, BOX_SLOTS, DOOR, FURNITURE, SUPPORT_RATE, HELP_JOBS, productById, bossLook } from './data.js';
import {
  bus, upgVal, shelfAccepts, shelfHasOrder, takeBox, takeDrop, stockOne, claimOrder, releaseOrders, shipOrder, queuedCount,
  addBoost, addXP, activeCampaign, dutyOf, shelfAllows, misplaced, takeFromShelf,
} from './state.js';
import { empEff, helpEff, breakRooms } from './sim.js';
import { roomAt } from './rooms.js';

const PLAYER_PACK = 1.6, EMP_PACK = 2.2;
// Everyone's own job; a temporary job (e.help) takes its place for a while.
const OWN_JOB = { packer: 'pack', stocker: 'stock', some: 'desk', ecom: 'desk', support: 'desk' };
// How far someone moves in from the desk's access spot to sit on its chair.
const CHAIR = 0.24;
// Shown behind the character creator before a boss exists.
const DEFAULT_LOOK = { skin: '#ffd7b5', hair: '#e6be8a', hairStyle: 'short', shirt: '#ff5d8f', pants: '#2b2d42', hat: '#ffc300' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- character mesh ----------
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 4, 12);
const GEO = { body: capsule(0.27, 0.3), limb: capsule(0.085, 0.22).translate(0, -0.17, 0), head: new THREE.SphereGeometry(0.27, 18, 14), eye: new THREE.SphereGeometry(0.035, 8, 6) };

export function makeCharacter({ skin, hair, shirt, pants = '#3d405b', hat = null, bun = false, hairStyle = bun ? 'bun' : 'short', beard = false, skirt = false }) {
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  const m = (geo, color) => { const x = new THREE.Mesh(geo, mat(color)); x.castShadow = true; return x; };
  const legC = skirt ? skin : pants;
  const legL = at(m(GEO.limb, legC), -0.12, 0.38, 0), legR = at(m(GEO.limb, legC), 0.12, 0.38, 0);
  const body = at(m(GEO.body, shirt), 0, 0.66, 0);
  const armL = at(m(GEO.limb, shirt), -0.33, 0.88, 0), armR = at(m(GEO.limb, shirt), 0.33, 0.88, 0);
  const head = at(m(GEO.head, skin), 0, 1.16, 0);
  const hairM = at(m(GEO.head, hair), 0, 1.25, -0.05);
  hairM.scale.set(1.09, 0.82, 1.06);
  const eyeL = at(m(GEO.eye, '#1d1d1d'), -0.09, 1.17, 0.25), eyeR = at(m(GEO.eye, '#1d1d1d'), 0.09, 1.17, 0.25);
  const cheekL = at(new THREE.Mesh(GEO.eye, mat('#ff8fab')), -0.16, 1.1, 0.22), cheekR = at(new THREE.Mesh(GEO.eye, mat('#ff8fab')), 0.16, 1.1, 0.22);
  cheekL.scale.setScalar(1.4); cheekR.scale.setScalar(1.4);
  g.add(legL, legR, body, armL, armR, head, eyeL, eyeR, cheekL, cheekR);
  if (hairStyle !== 'bald') g.add(hairM);
  if (hairStyle === 'bun') { const b = at(m(GEO.head, hair), 0, 1.24, -0.27); b.scale.setScalar(0.5); g.add(b); }
  if (hairStyle === 'long') { const b = at(m(GEO.head, hair), 0, 1.0, -0.1); b.scale.set(1.08, 1.15, 0.8); g.add(b); }
  if (beard) { const b = at(m(GEO.head, hair), 0, 1.02, 0.1); b.scale.set(0.72, 0.42, 0.62); g.add(b); }
  if (skirt) { const sk = at(m(new THREE.CylinderGeometry(0.25, 0.36, 0.32, 16), pants), 0, 0.5, 0); g.add(sk); }
  if (hat) {
    const cap = at(new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(hat)), 0, 1.24, 0);
    const brim = at(rbox(0.3, 0.04, 0.22, hat, 0.015), 0, 1.25, 0.28);
    g.add(cap, brim);
  }
  const carry = new THREE.Group();
  carry.position.set(0, 0.62, 0.36);
  g.add(carry);
  // A cup in the right hand, shown on coffee breaks.
  const cup = at(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 10), mat('#ffffff')), 0, -0.42, 0.08);
  cup.visible = false;
  armR.add(cup);
  root.userData = { g, legL, legR, armL, armR, carry, cup, carrySig: '', seatH: 0.5 };
  root.traverse((o) => { o.castShadow = true; });
  return root;
}

// What people look like while using things. sitting: legs forward with the hips on the seat.
const seated = (u) => { u.legL.rotation.x = u.legR.rotation.x = -1.3; u.g.position.y = u.seatH - 0.34; };
const POSES = {
  sit(u, t) { seated(u); u.armL.rotation.x = u.armR.rotation.x = -0.5 + Math.sin(t * 1.3) * 0.05; },
  type(u, t) { seated(u); u.armL.rotation.x = -1.15 + Math.sin(t * 19) * 0.12; u.armR.rotation.x = -1.15 + Math.cos(t * 23) * 0.12; },
  pack(u, t) { u.armL.rotation.x = -1 + Math.sin(t * 6) * 0.4; u.armR.rotation.x = -1 - Math.sin(t * 6) * 0.4; u.armL.rotation.z = -0.15; u.armR.rotation.z = 0.15; },
  reach(u, t) { const w = Math.sin(t * 6.5); u.armL.rotation.x = -2.7 + w * 0.25; u.armR.rotation.x = -2.7 - w * 0.25; u.g.position.y = 0.05 + Math.abs(w) * 0.05; },
  cup(u, t) { u.cup.visible = true; u.armL.rotation.x = 0; u.armR.rotation.x = -0.9 - Math.max(0, Math.sin(t * 0.9)) * 1.3; },
  foos(u, t) { u.armL.rotation.x = -1.4 + Math.sin(t * 8) * 0.2; u.armR.rotation.x = -1.4 + Math.cos(t * 11) * 0.2; u.g.rotation.z = Math.sin(t * 5) * 0.05; },
  ping(u, t) { u.cup.visible = false; u.armL.rotation.x = -0.4; u.armR.rotation.x = -1.3 + Math.sin(t * 5.6) * 0.5; u.g.rotation.z = Math.sin(t * 2.8) * 0.06; },
  arcade(u, t) { u.armL.rotation.x = -1.25 + Math.sin(t * 15) * 0.14; u.armR.rotation.x = -1.25 + Math.cos(t * 19) * 0.14; },
  dance(u, t) { u.g.rotation.z = Math.sin(t * 4) * 0.13; u.g.position.y = Math.abs(Math.sin(t * 8)) * 0.07; u.armL.rotation.x = -2.2 + Math.sin(t * 8) * 0.4; u.armR.rotation.x = -2.2 - Math.sin(t * 8) * 0.4; },
};

export function animateCharacter(ch, t, moving, carrying, working, pose = null) {
  const u = ch.userData;
  u.g.rotation.z = 0;
  u.armL.rotation.z = u.armR.rotation.z = 0;
  u.cup.visible = false;
  if (pose && !moving && POSES[pose]) {
    u.legL.rotation.x = u.legR.rotation.x = 0;
    u.g.position.y = 0;
    POSES[pose](u, t);
    return;
  }
  const sw = moving ? Math.sin(t * 13) * 0.6 : 0;
  u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
  u.g.position.y = moving ? Math.abs(Math.sin(t * 13)) * 0.06 : Math.sin(t * 2) * 0.01;
  if (carrying) { u.armL.rotation.x = u.armR.rotation.x = -1.2; }
  else if (working) { u.armL.rotation.x = -0.9 + Math.sin(t * 22) * 0.15; u.armR.rotation.x = -0.9 + Math.cos(t * 22) * 0.15; }
  else { u.armL.rotation.x = -sw * 0.8; u.armR.rotation.x = sw * 0.8; }
}

// desc: null | {kind:'box', color} | {kind:'items', colors:[]}
export function setCarry(ch, desc) {
  const u = ch.userData;
  const sig = desc ? desc.kind + (desc.color || '') + (desc.colors || []).join() : '';
  if (sig === u.carrySig) return;
  u.carrySig = sig;
  u.carry.clear();
  if (!desc) return;
  if (desc.kind === 'box') { const b = makeBox(desc.color); b.position.y = -0.05; b.scale.setScalar(0.85); u.carry.add(b); }
  else desc.colors.forEach((c, i) => u.carry.add(at(rbox(0.36, 0.13, 0.3, c, 0.04), 0, 0.02 + i * 0.14, 0)));
}

const faceTowards = (ch, dx, dz, dt) => {
  const target = Math.atan2(dx, dz);
  let d = target - ch.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  ch.rotation.y += d * Math.min(1, dt * 14);
};

// ---------- player ----------
export class Player {
  constructor(world, s) {
    this.w = world; this.s = s;
    this.pos = new THREE.Vector3(s.player.x, 0, s.player.z);
    this.setLook(s.boss);
    this.zone = null; this.prog = 0; this.t = 0; this.moving = false;
    this.ring = world.addLabel('ring', '', () => this.pos.clone().setY(2));
    this.tag = world.addLabel('name boss', '', () => this.pos.clone().setY(-0.05));
    this.setName(s.boss);
    this.heldTable = null;
    // The boss always runs on autopilot (auto.js); buttons for it go in here.
    document.getElementById('app').insertAdjacentHTML('beforeend', '<div id="lbtns"></div>');
  }

  // Put down whatever we hold right in front of us; it stays there until someone picks it up.
  drop() {
    const s = this.s, c = this.carry, a = this.mesh.rotation.y;
    if (!c) return;
    let x = this.pos.x + Math.sin(a) * 0.45, z = this.pos.z + Math.cos(a) * 0.45;
    if (this.w.inObstacle(x, z) || !this.w.isFloor(x, z)) { x = this.pos.x; z = this.pos.z; }
    if (c.kind === 'box') {
      const b = s.boxes.find((o) => o.id === c.boxId);
      if (b) { b.carriedBy = null; b.at = { x, z }; b.slot = null; }
      this.ignore = b;
    } else {
      for (const o of s.orders) if (c.orderIds.includes(o.id)) o.by = 'floor';
      this.ignore = { id: s.nextId++, x, z, orderIds: [...c.orderIds] };
      s.drops.push(this.ignore);
    }
    if (this.heldTable != null && this.w.tableRes[this.heldTable] === 'player') this.w.tableRes[this.heldTable] = null;
    this.heldTable = null;
    this.carry = null;
    this.prog = 0;
    bus.emit('sfx', 'pop');
  }

  // Something on the floor within reach that we can pick up (not what we just put down).
  floorItem() {
    const s = this.s, c = this.carry, room = upgVal(s, 'trolley') - this.carriedOrders().length;
    const near = (o) => o !== this.ignore && Math.hypot((o.at ?? o).x - this.pos.x, (o.at ?? o).z - this.pos.z) < 0.8;
    if (!c) { const b = s.boxes.find((o) => o.at && !o.carriedBy && !o.claimedBy && near(o)); if (b) return b; }
    if (!c || (c.kind === 'items' && room > 0)) return s.drops.find((d) => !d.claimedBy && near(d)) ?? null;
    return null;
  }

  pickupAction(f) {
    const s = this.s;
    if (f.productId) return {
      label: `Saml kasse op ${productById[f.productId].icon}`, dur: 0.35,
      run: () => {
        if (f.carriedBy || !s.boxes.includes(f)) return;
        takeBox(s, f, 'player');
        this.carry = { kind: 'box', boxId: f.id };
        bus.emit('sfx', 'pop');
      },
    };
    return {
      label: 'Saml varer op 🛍️', dur: 0.3,
      run: () => {
        if (!s.drops.includes(f)) return;
        const ids = takeDrop(s, f, upgVal(s, 'trolley') - this.carriedOrders().length, 'player');
        this.carry = { kind: 'items', orderIds: [...this.carriedOrders(), ...ids] };
        bus.emit('sfx', 'pop');
      },
    };
  }

  goTo(t) {
    this.path = this.w.findPath(this.pos.x, this.pos.z, t.x, t.z);
    this.stuck = 0;
    this.w.setMarker(t);
  }

  stopPath() { this.path = null; this.w.setMarker(null); }

  setLook(boss) {
    const rot = this.mesh?.rotation.y ?? 0;
    if (this.mesh) this.w.scene.remove(this.mesh);
    this.mesh = makeCharacter(bossLook(boss ?? DEFAULT_LOOK));
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = rot;
    this.w.scene.add(this.mesh);
    this.setName(boss);
  }

  setName(boss) { this.tag?.set(boss ? `👑 ${esc(boss.name)} · Chef` : ''); }

  get carry() { return this.s.player.carry; }
  set carry(v) { this.s.player.carry = v; }

  carriedOrders() { return this.carry?.kind === 'items' ? this.carry.orderIds : []; }

  update(dt, input) {
    const s = this.s, w = this.w;
    this.t += dt;
    const speed = upgVal(s, 'shoes') * (activeCampaign(s) ? 1.15 : 1) * w.speedAt(this.pos.x, this.pos.z); // adrenaline during campaigns
    let mx = input.x, mz = input.z;
    if (Math.hypot(mx, mz) > 0.05) { if (this.path) this.stopPath(); }
    else if (this.path) {
      const wp = this.path[0], dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.08) { this.path.shift(); if (!this.path.length) this.stopPath(); }
      else { const k = Math.min(1, d / (speed * dt)); mx = (dx / d) * k; mz = (dz / d) * k; }
    }
    this.moving = Math.hypot(mx, mz) > 0.05;
    if (this.moving) {
      const px = this.pos.x, pz = this.pos.z;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      w.collide(this.pos);
      faceTowards(this.mesh, mx, mz, dt);
      // Give up on a tap-walk that is blocked.
      if (this.path) { const moved = Math.hypot(this.pos.x - px, this.pos.z - pz); this.stuck = moved < speed * dt * 0.2 ? (this.stuck || 0) + dt : 0; if (this.stuck > 0.5) this.stopPath(); }
    }
    this.mesh.position.copy(this.pos);
    s.player.x = this.pos.x; s.player.z = this.pos.z;

    // carry visual
    const c = this.carry;
    if (c?.kind === 'box') {
      const b = s.boxes.find((x) => x.id === c.boxId);
      if (!b) this.carry = null;
      else setCarry(this.mesh, { kind: 'box', color: productById[b.productId].color });
    }
    if (this.carry?.kind === 'items') {
      const ids = this.carry.orderIds.filter((id) => s.orders.some((o) => o.id === id));
      if (!ids.length) this.carry = null;
      else { this.carry.orderIds = ids; setCarry(this.mesh, { kind: 'items', colors: ids.map((id) => productById[s.orders.find((o) => o.id === id).productId].color) }); }
    }
    if (!this.carry) setCarry(this.mesh, null);

    // zone (things on the floor come first)
    if (this.ignore) { const o = this.ignore.productId ? this.ignore.at : this.ignore; if (!o || Math.hypot(o.x - this.pos.x, o.z - this.pos.z) > 1) this.ignore = null; }
    const floor = this.floorItem();
    let zone = floor, best = Infinity;
    if (!floor) for (const z of w.zones) {
      const d = Math.hypot(z.x - this.pos.x, z.z - this.pos.z);
      if (d < z.r && d < best) { best = d; zone = z; }
    }
    if (zone !== this.zone) { this.zone = zone; this.prog = 0; this.pickOk = false; }
    if (this.heldTable != null && !(zone?.type === 'table' && zone.idx === this.heldTable && this.carry?.kind === 'items')) {
      if (w.tableRes[this.heldTable] === 'player') w.tableRes[this.heldTable] = null;
      this.heldTable = null;
    }

    const act = this.act = floor ? this.pickupAction(floor) : zone ? this.actionFor(zone) : null;
    // Using a station looks the part: sitting at the desk, reaching up the shelf, packing at the table.
    const pose = act?.working && !this.moving ? { desk: 'type', table: 'pack', shelf: 'reach' }[zone?.type] : null;
    if (pose) {
      faceTowards(this.mesh, zone.fx, zone.fz, dt);
      if (pose === 'type') { this.mesh.position.x += zone.fx * CHAIR; this.mesh.position.z += zone.fz * CHAIR; }
    }
    animateCharacter(this.mesh, this.t, this.moving, !!this.carry, act?.working && !this.moving, pose);
    if (act && !act.blocked && act.dur) {
      this.prog += dt;
      if (act.onTick) act.onTick();
      if (this.prog >= act.dur) { this.prog = 0; act.run(); }
      const pct = Math.min(1, this.prog / act.dur);
      this.ring.set(`<i style="--p:${(pct * 100).toFixed(0)}%"></i>`);
    } else this.ring.set('');
  }

  actionFor(z) {
    const s = this.s, w = this.w, c = this.carry;
    const room = upgVal(s, 'trolley') - this.carriedOrders().length;
    if (z.type === 'delivery') {
      if (c) return { label: 'Hænderne er fulde', blocked: true };
      const box = s.boxes.find((b) => !b.carriedBy && !b.claimedBy && !b.at);
      if (!box) return { label: s.deliveries.length ? '🚚 Varer er på vej…' : 'Ingen kasser – køb varer under Produkter' };
      return {
        label: `Saml kasse op ${productById[box.productId].icon}`, dur: 0.45,
        run: () => { takeBox(s, box, 'player'); this.carry = { kind: 'box', boxId: box.id }; bus.emit('sfx', 'pop'); },
      };
    }
    if (z.type === 'shelf') {
      const f = w.shelves[z.idx].f;
      if (c?.kind === 'box') {
        const box = s.boxes.find((b) => b.id === c.boxId), p = productById[box.productId];
        if (!shelfAllows(f, box.productId)) return { label: `Reolen er kun til ${f.tags.map((id) => productById[id].icon).join(' ')}`, blocked: true };
        if (!shelfAccepts(s, f, box.productId)) return { label: 'Reolen er fuld – prøv en anden', blocked: true };
        return {
          label: `Lægger ${p.icon} på reolen (${box.qty})`, dur: 0.12, working: true,
          run: () => { if (stockOne(s, box, f)) bus.emit('sfx', 'tick'); if (box.qty <= 0) this.carry = null; },
        };
      }
      if (!queuedCount(s)) return { label: c ? `Bær varerne til pakkebordet` : 'Ingen ordrer at plukke' };
      if (!shelfHasOrder(s, f)) return { label: c ? 'Bær varerne til pakkebordet' : 'Ordrerne skal bruge varer fra en anden reol' };
      if (room <= 0) return { label: 'Fuld – gå til pakkebordet', blocked: true };
      return {
        label: 'Plukker vare til ordre', dur: 0.35, working: true,
        run: () => {
          const o = claimOrder(s, 'player', f);
          if (!o) return;
          this.carry = { kind: 'items', orderIds: [...this.carriedOrders(), o.id] };
          bus.emit('sfx', 'pop');
        },
      };
    }
    if (z.type === 'table') {
      if (c?.kind !== 'items') return { label: c ? 'Læg kassen på lageret først' : 'Hent varer på lageret først', blocked: !!c };
      const res = w.tableRes[z.idx];
      if (res != null && res !== 'player') return { label: 'Pakkebordet er optaget', blocked: true };
      w.tableRes[z.idx] = 'player';
      this.heldTable = z.idx;
      return {
        label: 'Pakker ordre 📦', dur: PLAYER_PACK * upgVal(s, 'packTable') * w.tables[z.idx].fast, working: true,
        onTick: () => { w.tablePacking[z.idx] = s.time; w.tableProg[z.idx] = this.prog / (PLAYER_PACK * upgVal(s, 'packTable') * w.tables[z.idx].fast); },
        run: () => {
          const id = this.carry.orderIds.shift();
          shipOrder(s, id, new THREE.Vector3(w.tables[z.idx].x, 0, w.tables[z.idx].z));
          if (!this.carry.orderIds.length) this.carry = null;
        },
      };
    }
    if (z.type === 'desk') {
      const owner = s.employees.find((e) => e.desk === z.idx);
      if (owner) return { label: `${owner.name} arbejder her` };
      if (c) return { label: 'Hænderne er fulde', blocked: true };
      if (s.tickets > 0) return {
        label: `Besvarer kundehenvendelse 🎧 (${s.tickets})`, dur: 1.4, working: true,
        onTick: () => (w.deskActive[z.idx] = s.time),
        run: () => {
          s.tickets--;
          s.stats.ticketsSolved++;
          s.satisfaction = Math.min(100, s.satisfaction + 1);
          addXP(s, 3);
          w.popup('😊 Glad kunde', this.pos, 'blue');
          bus.emit('sfx', 'pop');
        },
      };
      // The update lasts 60 s; it can only be renewed when it's about to run out.
      const web = s.boosts.find((b) => b.id === 'web'), left = web ? Math.ceil(web.until - s.time) : 0;
      if (left > 15) return { label: `Webshoppen er opdateret ✓ · igen om ${left - 15}s` };
      return {
        label: 'Opdaterer webshoppen 💻', dur: 2.5 / upgVal(s, 'computer'), working: true,
        onTick: () => (w.deskActive[z.idx] = s.time),
        run: () => {
          addBoost(s, { id: 'web', name: 'Webshop-opdatering', icon: '💻', kind: 'conv', mult: 0.25, dur: 60 });
          s.stats.webshopWork++;
          addXP(s, 5);
          w.popup('+25 % konvertering', this.pos, 'blue');
          bus.emit('sfx', 'pop');
        },
      };
    }
    return null;
  }
}

// ---------- employees ----------
class Worker {
  constructor(world, s, data, spawn) {
    this.w = world; this.s = s; this.d = data;
    this.mesh = makeCharacter({ ...data.look, pants: '#3d405b', hat: ROLES[data.role].color });
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.mesh.position.copy(this.pos);
    world.scene.add(this.mesh);
    this.items = []; this.box = null; this.table = null; this.status = ''; this.working = false; this.moving = false; this.pose = null;
    this.t = Math.random() * 10;
    this.dt = 0;
    this.bubble = world.addLabel('emp', '', () => this.pos.clone().setY(1.95));
    this.tag = world.addLabel('name', data.name, () => this.pos.clone().setY(-0.05));
    this.task = this.loop();
    // Staff who aren't on shift start the game at home.
    if (dutyOf(s, data) === 'off') { this.pos.set(DOOR.x + 2.5, 0, DOOR.z); this.show(false); }
  }

  show(on) {
    this.away = !on;
    this.mesh.visible = on;
    this.bubble.hidden = !on;
    this.tag.hidden = !on;
  }

  get duty() { return dutyOf(this.s, this.d); }
  get job() { return HELP_JOBS[this.d.help] ? this.d.help : OWN_JOB[this.d.role]; }

  // Off shift: out of the door and home. On a break: the sofa, the coffee bar or a chat with whoever else is on a break.
  *offDuty() {
    this.working = false;
    for (let m; (m = this.duty) !== 'work';) {
      if (m === 'off') {
        if (!this.away) {
          this.status = '🏠';
          yield* this.walkTo(DOOR.x, DOOR.z);
          yield* this.step(DOOR.x + 2.5, DOOR.z);
          this.show(false);
        }
        yield* this.wait(0.5);
      } else {
        if (this.away) yield* this.comeIn();
        yield* this.takeBreak();
      }
    }
    if (this.away) yield* this.comeIn();
    this.status = '';
  }

  *comeIn() {
    this.pos.set(DOOR.x + 2.5, 0, DOOR.z);
    this.show(true);
    this.status = '👋';
    yield* this.step(DOOR.x, DOOR.z);
    // Coat in the locker first, if there is one.
    const lk = this.s.furniture.find((f) => f.type === 'lockers'), q = lk && this.w.seats(lk)[0];
    if (q) {
      this.status = '';
      yield* this.walkTo(q.ax, q.az);
      yield* this.face(q.fx, q.fz);
      this.pose = 'reach';
      yield* this.wait(0.7);
      this.pose = null;
    }
  }

  // A straight walk, used for the step through the door (outside isn't on the walking grid).
  *step(x, z) {
    for (;;) {
      const dx = x - this.pos.x, dz = z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      const k = Math.min(d, 2.8 * this.dt);
      this.pos.x += (dx / d) * k; this.pos.z += (dz / d) * k;
      faceTowards(this.mesh, dx, dz, this.dt);
      this.moving = true;
      yield;
    }
    this.moving = false;
  }

  *takeBreak() {
    const s = this.s, w = this.w, id = this.d.id;
    // A proper break room comes first.
    const rooms = breakRooms(s), all = s.furniture.filter((f) => FURNITURE[f.type].use && f.type !== 'lockers'), inRoom = all.filter((f) => rooms.has(roomAt(s, f.x, f.z)));
    this.status = '☕';
    const q = w.claimSeat(inRoom, id) ?? w.claimSeat(all, id);
    if (q) {
      yield* this.walkTo(q.ax, q.az);
      if (q.sit) yield* this.step(q.x, q.z);
      yield* this.face(q.fx, q.fz);
      this.mesh.userData.seatH = q.h;
      this.pose = q.pose;
      while (this.duty === 'pause') {
        w.useActive[q.f.id] = s.time + 1;
        this.status = this.chatting() ? '💬' : '';
        yield* this.wait(0.5);
      }
      this.pose = null;
      if (q.sit) yield* this.step(q.ax, q.az);
      w.releaseSeat(id);
      return;
    }
    // Every seat taken (or no break furniture yet): stand around and eat a packed lunch.
    const a = (id * 2.4) % (Math.PI * 2), base = all[id % (all.length || 1)] ?? IDLE.office;
    yield* this.walkTo(base.x + Math.cos(a) * 1.6, base.z + Math.sin(a) * 1.6);
    while (this.duty === 'pause') {
      this.status = this.chatting() ? '💬' : '🥪';
      yield* this.wait(0.5);
    }
  }

  chatting() { return [...this.crew.list.values()].some((o) => o !== this && !o.away && o.duty === 'pause' && Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 3); }

  get mult() { return EMP_TIERS[this.d.tier].mult * (this.d.special === 'fast' ? 1.5 : 1) * empEff(this.s, this.d) * helpEff(this.d); }

  *wait(sec) { let t = sec; while (t > 0) { t -= this.dt; yield; } }

  *walkTo(x, z) {
    this.working = false;
    this.pose = null;
    const path = this.w.findPath(this.pos.x, this.pos.z, x, z);
    const speed = 2.8 * Math.sqrt(this.mult);
    for (const wp of path) {
      for (;;) {
        const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.05) break;
        const step = Math.min(d, speed * this.dt * this.w.speedAt(this.pos.x, this.pos.z));
        this.pos.x += (dx / d) * step; this.pos.z += (dz / d) * step;
        faceTowards(this.mesh, dx, dz, this.dt);
        this.moving = true;
        yield;
      }
    }
    this.moving = false;
  }

  *face(dx, dz) { for (let i = 0; i < 10; i++) { faceTowards(this.mesh, dx, dz, this.dt); yield; } }

  // Each loop runs until the job changes (finishing what's in the hands first).
  *loop() {
    for (;;) {
      const j = this.job;
      if (j === 'pack') yield* this.packerLoop();
      else if (j === 'stock') yield* this.stockerLoop();
      else if (j === 'support') yield* this.helpDeskLoop();
      else yield* this.deskLoop();
    }
  }

  *idle(spot) {
    this.working = false;
    const x = spot.x + (Math.random() - 0.5) * 1.6, z = spot.z + (Math.random() - 0.5) * 1.6;
    yield* this.walkTo(x, z);
    yield* this.wait(0.8 + Math.random());
  }

  // Idle packers wait by the nearest packing table, a step back from it.
  restSpot() {
    const t = this.w.nearestTable(this.pos.x, this.pos.z);
    return t ? { x: t.ax - t.fx * 1.1, z: t.az - t.fz * 1.1 } : IDLE.packer;
  }

  *packerLoop() {
    const s = this.s, w = this.w;
    for (;;) {
      if (!this.items.length && this.job !== 'pack') return;
      if (!this.items.length && this.duty !== 'work') { yield* this.offDuty(); continue; }
      if (!this.items.length) {
        const cap = this.d.tier >= 3 ? 3 : this.d.tier >= 1 ? 2 : 1;
        const d = s.drops.find((x) => !x.claimedBy);
        if (d) {
          // Someone left picked items on the floor – take those first.
          this.status = '';
          d.claimedBy = this.d.id;
          yield* this.walkTo(d.x, d.z);
          d.claimedBy = null;
          if (s.drops.includes(d)) { yield* this.wait(0.3); this.items.push(...takeDrop(s, d, cap, this.d.id)); }
          if (!this.items.length) continue;
        } else {
          // Go to the nearest shelf that holds something an order needs.
          const sh = w.nearestShelf(this.pos.x, this.pos.z, (x) => shelfHasOrder(s, x.f));
          if (!sh) {
            // Nothing to pack: put the morning's returns back on the shelves instead.
            const ret = s.boxes.find((b) => b.ret && !b.carriedBy && !b.claimedBy && w.shelves.some((x) => shelfAccepts(s, x.f, b.productId)));
            if (ret) { this.status = '↩️'; if (yield* this.fetchBox(ret)) while (yield* this.shelveBox()); continue; }
            this.status = '😴'; yield* this.idle(this.restSpot()); continue;
          }
          this.status = '';
          yield* this.walkTo(sh.ax, sh.az);
          yield* this.face(sh.fx, sh.fz);
          while (this.items.length < cap) {
            const o = claimOrder(s, this.d.id, sh.f);
            if (!o) break;
            this.working = true;
            this.pose = 'reach';
            yield* this.wait(0.5 / this.mult);
            this.items.push(o.id);
          }
          this.working = false;
          this.pose = null;
          if (!this.items.length) continue;
        }
      }
      let t;
      while ((t = w.tables.findIndex((_, i) => w.tableRes[i] == null)) < 0) { this.status = '⏳'; yield* this.wait(0.4); }
      this.status = '';
      w.tableRes[t] = this.d.id;
      this.table = t;
      const tb = w.tables[t], sp = w.spotOf(tb, this.pos.x, this.pos.z);
      yield* this.walkTo(sp.ax, sp.az);
      yield* this.face(sp.fx, sp.fz);
      while (this.items.length) {
        this.working = true;
        this.pose = 'pack';
        const total = (EMP_PACK * upgVal(s, 'packTable') * tb.fast) / this.mult;
        let left = total;
        while (left > 0) { left -= this.dt; w.tablePacking[t] = s.time; w.tableProg[t] = 1 - left / total; yield; }
        shipOrder(s, this.items.shift(), new THREE.Vector3(tb.x, 0, tb.z));
      }
      this.working = false;
      this.pose = null;
      w.tableRes[t] = null;
      this.table = null;
    }
  }

  *stockerLoop() {
    const s = this.s, w = this.w;
    for (;;) {
      if (!this.box && this.job !== 'stock') return;
      if (!this.box && this.duty !== 'work') { yield* this.offDuty(); continue; }
      if (!this.box) {
        const fits = (b) => w.shelves.some((sh) => shelfAccepts(s, sh.f, b.productId));
        const waiting = s.boxes.filter((b) => !b.carriedBy && !b.claimedBy), box = waiting.find(fits);
        // Nothing to unpack: move items that stand on the wrong shelf over to their tagged shelf.
        if (!box && (yield* this.tidy())) continue;
        if (!box) {
          this.status = !w.shelves.length || waiting.length ? '⚠️ 🧱' : '😴';
          yield* this.idle(IDLE.stocker);
          continue;
        }
        this.status = '';
        yield* this.fetchBox(box);
        continue;
      }
      if (!(yield* this.shelveBox()) && this.box) { this.status = '⚠️ 🧱'; yield* this.wait(0.8); }
    }
  }

  // Fetch items from a shelf they don't belong on; shelveBox then puts them where they belong.
  *tidy() {
    const s = this.s, w = this.w, m = misplaced(s);
    if (!m) return false;
    const sh = w.shelves.find((x) => x.f === m.f);
    if (!sh) return false;
    this.status = '🏷️';
    const sp = w.spotOf(sh, this.pos.x, this.pos.z);
    yield* this.walkTo(sp.ax, sp.az);
    yield* this.face(sp.fx, sp.fz);
    this.working = true;
    this.pose = 'reach';
    yield* this.wait(0.6 / this.mult);
    this.working = false;
    this.pose = null;
    // Someone may have picked some meanwhile; take what's still wrong.
    const again = misplaced(s);
    if (again?.f !== m.f || again.pid !== m.pid) return true;
    this.box = takeFromShelf(s, m.f, m.pid, Math.min(again.n, 12), this.d.id);
    return true;
  }

  // Walk to a box on the dock (or the floor) and pick it up. Shared by stockers and packers doing returns.
  *fetchBox(box) {
    const s = this.s;
    box.claimedBy = this.d.id;
    if (box.at) yield* this.walkTo(box.at.x, box.at.z);
    else yield* this.walkTo(THREE.MathUtils.clamp(BOX_SLOTS[box.slot].x, 11.5, 16), DELIVERY_SPOT.z - 0.4);
    if (!s.boxes.includes(box) || box.carriedBy) { this.box = null; return false; }
    if (!box.at) yield* this.face(0, -1);
    yield* this.wait(0.4);
    takeBox(s, box, this.d.id);
    this.box = box;
    return true;
  }

  // Fill the nearest shelf that takes the carried box. True while there's more to put away.
  *shelveBox() {
    const s = this.s, w = this.w, pid = this.box.productId;
    const sh = w.shelfFor(this.pos.x, this.pos.z, pid);
    this.working = false;
    if (!sh) {
      if (this.job === 'stock') return false; // stockers wait for room
      // A packer has orders to get back to: leave the box on the floor for later.
      this.box.carriedBy = null; this.box.at = { x: this.pos.x, z: this.pos.z }; this.box.slot = null; this.box = null;
      return false;
    }
    this.status = this.job === 'pack' ? '↩️' : this.box.move ? '🏷️' : '';
    yield* this.walkTo(sh.ax, sh.az);
    yield* this.face(sh.fx, sh.fz);
    while (this.box.qty > 0 && shelfAccepts(s, sh.f, pid)) {
      this.working = true;
      this.pose = 'reach';
      yield* this.wait(0.25 / this.mult);
      stockOne(s, this.box, sh.f);
    }
    this.working = false;
    this.pose = null;
    if (this.box.qty <= 0) { this.box = null; this.status = ''; return false; }
    return true;
  }

  // Sit down on a desk's chair, and get up from it again.
  *sitAt(dk) {
    yield* this.walkTo(dk.ax, dk.az);
    yield* this.step(dk.ax + dk.fx * CHAIR, dk.az + dk.fz * CHAIR);
    yield* this.face(dk.fx, dk.fz);
    this.mesh.userData.seatH = 0.5;
    this.pose = 'type';
    this.working = true;
  }
  *standUp(dk) {
    this.working = false;
    this.pose = null;
    yield* this.step(dk.ax, dk.az);
  }

  *deskLoop() {
    const s = this.s, w = this.w;
    for (;;) {
      if (this.job !== 'desk') return;
      if (this.duty !== 'work') { yield* this.offDuty(); continue; }
      const di = this.d.desk;
      if (di == null || !w.desks[di]) { this.status = '⚠️ 🖥️'; yield* this.idle(IDLE.office); continue; }
      this.status = '';
      const dk = w.desks[di];
      yield* this.sitAt(dk);
      while (this.d.desk === di && this.duty === 'work' && this.job === 'desk') { w.deskActive[di] = s.time; yield; }
      yield* this.standUp(dk);
    }
  }

  // Helping with customer service: at their own desk, or any desk that is free.
  *helpDeskLoop() {
    const s = this.s, w = this.w, id = this.d.id;
    for (;;) {
      if (this.job !== 'support') return;
      if (this.duty !== 'work') { yield* this.offDuty(); continue; }
      const dk = w.desks[this.d.desk] ?? w.desks.find((d) => !s.employees.some((e) => e.desk === d.i) && !(w.deskHelp?.[d.i] && w.deskHelp[d.i] !== id));
      if (!dk) { this.status = '⚠️ 🖥️'; yield* this.idle(IDLE.office); continue; }
      (w.deskHelp ??= {})[dk.i] = id;
      this.status = '';
      yield* this.sitAt(dk);
      while (this.job === 'support' && this.duty === 'work') {
        s.ticketWork += SUPPORT_RATE[0] * upgVal(s, 'computer') * empEff(s, this.d) * helpEff(this.d) * this.dt;
        w.deskActive[dk.i] = s.time;
        yield;
      }
      yield* this.standUp(dk);
      w.deskHelp[dk.i] = null;
    }
  }

  update(dt) {
    this.dt = dt;
    this.t += dt;
    this.moving = false;
    this.task.next();
    this.mesh.position.copy(this.pos);
    const s = this.s;
    if (this.box) setCarry(this.mesh, s.boxes.includes(this.box) ? { kind: 'box', color: productById[this.box.productId].color } : null);
    else if (this.items.length) setCarry(this.mesh, { kind: 'items', colors: this.items.map((id) => productById[s.orders.find((o) => o.id === id)?.productId]?.color || '#fff') });
    else setCarry(this.mesh, null);
    animateCharacter(this.mesh, this.t, this.moving, !!(this.box || this.items.length) && !this.working, this.working, this.pose);
    this.bubble.set(this.status ? `<span>${this.status}</span>` : '');
    // With a big crew the name tags would fill the screen; tapping someone shows who they are.
    this.tag.hidden = this.away || this.crew.list.size > 6;
  }

  destroy() {
    const s = this.s;
    releaseOrders(s, this.items);
    if (this.box && s.boxes.includes(this.box)) { this.box.carriedBy = null; if (this.box.slot == null) this.box.at = { x: this.pos.x, z: this.pos.z }; }
    for (const b of s.boxes) if (b.claimedBy === this.d.id) b.claimedBy = null;
    for (const d of s.drops) if (d.claimedBy === this.d.id) d.claimedBy = null;
    if (this.table != null) this.w.tableRes[this.table] = null;
    this.w.releaseSeat(this.d.id);
    this.w.scene.remove(this.mesh);
    this.bubble.remove();
    this.tag.remove();
  }
}

export class Crew {
  constructor(world, s) {
    this.w = world; this.s = s;
    this.list = new Map();
    for (const e of s.employees) this.add(e, this.homeOf(e));
    bus.on('hired', (e) => this.add(e, { x: 17, z: 3.2 }));
    bus.on('fired', (id) => { const k = this.list.get(id); if (k) { k.destroy(); this.list.delete(id); } });
  }

  homeOf(e) {
    if (ROLES[e.role].desk) { const d = this.w.desks[e.desk]; return d ? { x: d.ax, z: d.az } : IDLE.office; }
    return IDLE[e.role];
  }

  add(e, spawn) { const k = new Worker(this.w, this.s, e, spawn); k.crew = this; this.list.set(e.id, k); }

  update(dt) { for (const k of this.list.values()) k.update(dt); }

  // Who is at this spot on the ground (for tapping someone)?
  at(p) {
    let best = null, bd = 0.8;
    for (const k of this.list.values()) { const d = k.away ? 9 : Math.hypot(k.pos.x - p.x, k.pos.z - p.z); if (d < bd) { bd = d; best = k; } }
    return best?.d ?? null;
  }
}
