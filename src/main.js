import './style.css';
import { loadState, saveState, bus } from './state.js';
import { update as simUpdate } from './sim.js';
import { World } from './world.js';
import { Player, Crew } from './actors.js';
import { UI } from './ui.js';
import { Builder } from './build.js';
import { Creator } from './creator.js';
import { startCloud } from './cloud.js';
import { Autopilot } from './auto.js';

// ---------- input: drag / tap + keyboard ----------
// The boss runs on autopilot, so a drag moves the camera (or a piece in build mode) and a tap opens what's under it.
class Input {
  constructor(canvas) {
    this.keys = new Set();
    let id = null, ox = 0, oy = 0, lx = 0, ly = 0, t0 = 0, dragging = false;
    canvas.addEventListener('pointerdown', (e) => {
      this.onPress?.();
      id = e.pointerId; ox = lx = e.clientX; oy = ly = e.clientY; t0 = performance.now(); dragging = false;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      if (!dragging && Math.hypot(e.clientX - ox, e.clientY - oy) < 10) return;
      dragging = true;
      this.onDrag?.(lx, ly, e.clientX, e.clientY, ox, oy);
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      if (e.type === 'pointerup' && !dragging && performance.now() - t0 < 350) this.onTap?.(e.clientX, e.clientY);
      if (e.type === 'pointerup' && dragging) this.onDragEnd?.();
      id = null; dragging = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    addEventListener('keydown', (e) => { if (!e.target.closest?.('input')) this.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
  }

  // Arrow keys / WASD → world direction for the isometric camera.
  get dir() {
    let x = 0, y = 0;
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
  const auto = new Autopilot(world, s, player);
  // The game stays playable with a menu open; on a phone the menu covers the game, so touching it closes the menu.
  input.onPress = () => { if (ui.sheetOpen && innerWidth < 720) ui.open('home'); };
  input.onDrag = (ax, ay, bx, by, ox, oy) => (!builder.active ? auto.pan(world.screenToGround(ax, ay), world.screenToGround(bx, by)) : builder.onDrag(world.screenToGround(ax, ay), world.screenToGround(bx, by), world.screenToGround(ox, oy)));
  input.onDragEnd = () => builder.onDragEnd?.();
  // Tap a shelf to set its tags, or a desk to choose who sits there.
  input.onTap = (cx, cy) => {
    if (builder.active) { builder.onTap(world.screenToGround(cx, cy)); return; }
    const f = world.furnitureAt(cx, cy);
    if (f?.type === 'shelf') ui.shelfMenu(f);
    else if (f?.type === 'desk') ui.deskMenu(f);
  };
  window.__game = { s, world, player, crew, ui, builder, auto };
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
    if (!builder.active) auto.panDir(input.dir, dt);
    player.update(dt, { x: 0, z: 0 });
    auto.update(dt);
    builder.update(player.pos);
    crew.update(dt);
    ui.update(dt);
    world.update(dt, !builder.active ? auto.focus() : builder.focus, builder.active ? null : ui.questTarget());
    world.render();
    if ((saveT += dt) > 5) { saveT = 0; saveState(s); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('visibilitychange', () => document.hidden && saveState(s));
  addEventListener('pagehide', () => saveState(s));
}

Promise.race([document.fonts.load('700 40px Fredoka'), new Promise((r) => setTimeout(r, 1500))]).catch(() => {})
  .then(startCloud).catch(() => null).then(boot);
