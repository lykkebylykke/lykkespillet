// Autopilot: the boss works through the player's priority list on their own,
// while the player pans the camera around and shops in the menus.
import * as THREE from 'three';
import { AUTO_TASKS } from './data.js';
import { bus, upgVal, shelfAccepts, shelfHasOrder, queuedCount, listed } from './state.js';
import { LOT } from './world.js';

const dist = (a, x, z) => Math.hypot(a.x - x, a.z - z);
const nearest = (list, x, z) => list.reduce((best, o) => (!best || dist(o, x, z) < dist(best, x, z) ? o : best), null);

export class Autopilot {
  constructor(world, s, player) {
    this.w = world; this.s = s; this.p = player;
    this.t = 0; this.target = null; this.task = null; this.free = false; this.was = s.auto.on;
    this.cam = new THREE.Vector3();
    document.getElementById('lbtns').insertAdjacentHTML('afterbegin', `
      <button id="followbtn" class="fab" hidden>📍 Følg chefen</button>
      <div id="autobtn" class="fab"><button data-act="auto"></button><button class="gear" data-act="autoSet" title="Prioriteter">⚙️</button></div>`);
    this.btn = document.querySelector('#autobtn [data-act="auto"]');
    this.followBtn = document.getElementById('followbtn');
    this.followBtn.addEventListener('click', () => { this.free = false; });
  }

  get on() { return this.s.auto.on; }

  // Dragging (or WASD) moves the camera freely while the boss works.
  pan(a, b) {
    if (!a || !b) return;
    this.move(a.x - b.x, a.z - b.z);
  }
  panDir(dir, dt) { if (dir.x || dir.z) this.move(dir.x * 9 * dt, dir.z * 9 * dt); }
  move(dx, dz) {
    if (!this.free) { this.cam.copy(this.p.pos); this.free = true; }
    this.cam.set(THREE.MathUtils.clamp(this.cam.x + dx, LOT.x0, LOT.x1), 0, THREE.MathUtils.clamp(this.cam.z + dz, LOT.z0, LOT.z1));
  }
  focus() { return this.on && this.free ? this.cam : this.p.pos; }

  update(dt) {
    const s = this.s;
    if (this.on !== this.was) {
      this.was = this.on;
      this.free = false; this.target = null; this.task = null;
      this.p.stopPath();
      bus.emit('toast', this.on ? '🤖 Autopilot slået til – træk for at se dig omkring' : '🎮 Du styrer selv chefen igen', 'good');
    }
    const task = this.task && this.on ? AUTO_TASKS[this.task] : null;
    const label = this.on ? `🤖 ${task ? `${task.icon} ${task.name}` : 'Venter…'}` : '🤖 Autopilot';
    if (this.btn.textContent !== label) this.btn.textContent = label;
    this.btn.parentElement.classList.toggle('on', this.on);
    if (this.followBtn.hidden === (this.on && this.free)) this.followBtn.hidden = !(this.on && this.free);
    if (!this.on || (this.t -= dt) > 0) return;
    this.t = 0.3;
    const goal = this.choose();
    this.task = goal?.task ?? null;
    if (!goal) { this.target = null; return; }
    // Already working where the top task wants us (zones are about 1 m wide).
    const act = this.p.act, d = dist(goal, this.p.pos.x, this.p.pos.z);
    if (d < 0.25 || (d < 0.9 && act?.dur && !act.blocked)) return;
    if (this.p.path && this.target && dist(this.target, goal.x, goal.z) < 0.3) return;
    this.target = goal;
    this.p.goTo(goal);
    this.w.setMarker(null);
  }

  // The first task on the list that has something to do, as a spot to walk to.
  choose() {
    const s = this.s, w = this.w, c = s.player.carry, { x, z } = this.p.pos;
    const room = upgVal(s, 'trolley') - this.p.carriedOrders().length;
    const spot = (st) => { const sp = w.spotOf(st, x, z); return { x: sp.ax, z: sp.az }; };
    const shelfFor = (box) => w.nearestShelf(x, z, (sh) => shelfAccepts(s, sh.f, box.productId));
    const freeDesk = () => nearest(w.desks.filter((d) => !s.employees.some((e) => e.desk === d.i)).map(spot), x, z);
    const tasks = {
      pack: () => (c?.kind === 'items' ? nearest(w.tables.filter((t) => w.tableRes[t.i] == null || w.tableRes[t.i] === 'player').map(spot), x, z) : null),
      pick: () => {
        if (c && (c.kind !== 'items' || room <= 0)) return null;
        const drop = nearest(s.drops.filter((d) => !d.claimedBy), x, z);
        const sh = queuedCount(s) ? w.nearestShelf(x, z, (o) => shelfHasOrder(s, o.f)) : null;
        return nearest([drop && { x: drop.x, z: drop.z }, sh && { x: sh.ax, z: sh.az }].filter(Boolean), x, z);
      },
      stock: () => {
        if (c?.kind === 'box') {
          const box = s.boxes.find((b) => b.id === c.boxId), sh = box && shelfFor(box);
          return sh ? { x: sh.ax, z: sh.az } : null;
        }
        if (c) return null;
        const floor = nearest(s.boxes.filter((b) => b.at && !b.carriedBy && !b.claimedBy && shelfFor(b)).map((b) => b.at), x, z);
        if (floor) return floor;
        // The dock hands out its first box, so only go when that one has a shelf to go to.
        const first = s.boxes.find((b) => !b.carriedBy && !b.claimedBy && !b.at), dock = w.zones.find((o) => o.type === 'delivery');
        return first && shelfFor(first) ? { x: dock.x, z: dock.z } : null;
      },
      tickets: () => (!c && s.tickets > 0 ? freeDesk() : null),
      web: () => {
        const web = s.boosts.find((b) => b.id === 'web');
        return !c && listed(s).length && (!web || web.until - s.time <= 15) ? freeDesk() : null;
      },
    };
    for (const id of s.auto.prio) {
      if (s.auto.off.includes(id)) continue;
      const g = tasks[id]();
      if (g) return { ...g, task: id };
    }
    // Never get stuck holding something: finish what's in the hands even if that task is switched off.
    if (c?.kind === 'box') { const g = tasks.stock(); if (g) return { ...g, task: 'stock' }; }
    if (c?.kind === 'items') { const g = tasks.pack(); if (g) return { ...g, task: 'pack' }; }
    return null;
  }
}
