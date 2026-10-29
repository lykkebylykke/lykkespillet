import './style.css';
import { loadState, saveState, bus } from './state.js';
import { update as simUpdate } from './sim.js';
import { World } from './world.js';
import { Player, Crew } from './actors.js';
import { UI } from './ui.js';
import { Builder } from './build.js';
import { Creator } from './creator.js';

// ---------- input: virtual joystick + keyboard ----------
class Input {
  constructor(canvas) {
    this.jx = 0; this.jy = 0; this.keys = new Set();
    const joy = document.getElementById('joy'), knob = joy.querySelector('.knob');
    // A quick tap walks to that spot (onTap); press-and-drag is a joystick.
    // When onDrag is set (build mode) a drag goes there instead of the joystick.
    let id = null, ox = 0, oy = 0, lx = 0, ly = 0, t0 = 0, dragging = false, holdTimer = 0;
    const R = 55;
    const showJoy = () => {
      dragging = true;
      const r = joy.parentElement.getBoundingClientRect();
      joy.style.left = `${ox - r.left}px`; joy.style.top = `${oy - r.top}px`;
      joy.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
    };
    canvas.addEventListener('pointerdown', (e) => {
      id = e.pointerId; ox = lx = e.clientX; oy = ly = e.clientY; t0 = performance.now(); dragging = false;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => id === e.pointerId && !dragging && !this.dragMode?.() && showJoy(), 220);
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (this.dragMode?.()) {
        if (!dragging && d < 10) return;
        dragging = true;
        this.onDrag?.(lx, ly, e.clientX, e.clientY);
        lx = e.clientX; ly = e.clientY;
        return;
      }
      if (!dragging) { if (d < 10) return; showJoy(); }
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.jx = dx / R; this.jy = dy / R;
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      clearTimeout(holdTimer);
      if (e.type === 'pointerup' && !dragging && performance.now() - t0 < 350) this.onTap?.(e.clientX, e.clientY);
      id = null; dragging = false; this.jx = this.jy = 0; joy.classList.remove('on');
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  // Screen-space stick → world direction for the isometric camera.
  get dir() {
    let x = this.jx, y = this.jy;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x: (x + y) / Math.SQRT2, z: (y - x) / Math.SQRT2 };
  }
}

// ---------- tiny synth sfx ----------
let ac = null;
addEventListener('pointerdown', () => { ac ??= new (window.AudioContext || window.webkitAudioContext)(); }, { once: true });
function beep(freq, dur = 0.08, type = 'sine', vol = 0.06, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
const SFX = {
  coin: () => { beep(988, 0.07, 'square', 0.03); beep(1319, 0.12, 'square', 0.03, 0.06); },
  pop: () => beep(520, 0.06, 'triangle', 0.08),
  tick: () => beep(760, 0.03, 'triangle', 0.03),
  click: () => beep(660, 0.03, 'sine', 0.04),
  level: () => [523, 659, 784].forEach((f, i) => beep(f, 0.12, 'triangle', 0.07, i * 0.08)),
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'square', 0.04, i * 0.11)),
};
bus.on('sfx', (n) => SFX[n]?.());

// ---------- boot ----------
function boot() {
  const s = loadState();
  const canvas = document.getElementById('game');
  const world = new World(canvas, s);
  const player = new Player(world, s);
  const crew = new Crew(world, s);
  const ui = new UI(s, world);
  const builder = new Builder(world, s, player);
  const input = new Input(canvas);
  input.dragMode = () => builder.active;
  input.onDrag = (ax, ay, bx, by) => builder.onDrag(world.screenToGround(ax, ay), world.screenToGround(bx, by));
  input.onTap = (cx, cy) => {
    if (ui.sheetOpen) return;
    const p = world.screenToGround(cx, cy);
    if (builder.active) builder.onTap(p);
    else if (p) player.goTo(world.walkTarget(p));
  };
  window.__game = { s, world, player, crew, ui, builder };
  // A brand-new shop starts by creating the boss, then placing the starter kit.
  const startKit = () => { if (!s.furniture.length && builder.kitCount()) builder.kit(); };
  let creating = !s.boss;
  if (creating) {
    new Creator((boss) => {
      s.boss = boss;
      player.setLook(boss);
      creating = false;
      saveState(s);
      bus.emit('toast', `Velkommen, ${boss.name}! Indret dit lager 📦`, 'good');
      startKit();
    });
  } else startKit();

  bus.on('built', () => world.rebuild());
  bus.on('levelup', () => world.rebuild());
  bus.on('truck', () => world.driveTruck(0));
  bus.on('courier', () => world.driveTruck(1));

  let last = performance.now(), saveT = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!creating) simUpdate(s, dt);
    player.update(dt, creating || ui.sheetOpen || builder.active ? { x: 0, z: 0 } : input.dir);
    builder.update(player.pos);
    crew.update(dt);
    ui.update(dt);
    world.update(dt, builder.focus, builder.active ? null : ui.questTarget());
    world.render();
    if ((saveT += dt) > 5) { saveT = 0; saveState(s); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('visibilitychange', () => document.hidden && saveState(s));
  addEventListener('pagehide', () => saveState(s));
}

Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {}).finally(boot);
