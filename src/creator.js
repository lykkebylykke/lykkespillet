import * as THREE from 'three';
import { DEFAULT_BOSS, GENDERS, HAIR_STYLES, SKINS, HAIRS, CLOTHES, HATS, bossLook } from './data.js';
import { bus } from './state.js';
import { makeCharacter } from './actors.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const $ = (sel, root = document) => root.querySelector(sel);

// "Opret din chef": name, gender, looks and clothes, with a turning 3D preview.
export class Creator {
  constructor(onDone) {
    this.onDone = onDone;
    this.b = { ...DEFAULT_BOSS, name: '', hairStyle: 'long' };
    this.el = document.createElement('div');
    this.el.id = 'creator';
    document.getElementById('app').appendChild(this.el);
    this.el.innerHTML = `<div class="cr-card">
      <h2>Opret din chef 👑</h2>
      <p class="tip">Du driver webshoppen – hvem er du?</p>
      <div class="cr-preview"><canvas></canvas><button class="cr-dice" data-c="random" title="Tilfældig">🎲</button></div>
      <label class="cr-name">Navn<input maxlength="14" placeholder="Skriv dit navn" autocomplete="off" enterkeyhint="done"></label>
      <div class="cr-opts"></div>
      <button class="btn big wide" data-c="done" disabled>Start webshoppen 🚀</button>
    </div>`;
    this.input = $('input', this.el);
    this.input.addEventListener('input', () => { this.b.name = this.input.value; this.renderOpts(); });
    this.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.input.blur(); });
    this.el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-c]');
      if (!t || t.disabled) return;
      bus.emit('sfx', 'click');
      const [k, v] = t.dataset.c.split('=');
      if (k === 'done') return this.finish();
      if (k === 'random') this.randomize();
      else if (k === 'gender') this.setGender(v);
      else this.b[k] = v === 'null' ? null : v === 'true' ? true : v === 'false' ? false : v;
      this.renderOpts();
      this.refresh();
    });
    this.initPreview();
    this.renderOpts();
    this.refresh();
    setTimeout(() => this.input.focus(), 300);
  }

  // Picking a gender suggests a matching look; everything can still be changed afterwards.
  setGender(g) {
    this.b.gender = g;
    if (g === 'mand') Object.assign(this.b, { hairStyle: 'short', bottom: 'pants' });
    if (g === 'kvinde') Object.assign(this.b, { hairStyle: 'long', beard: false });
  }

  randomize() {
    this.setGender(pick(GENDERS)[0]);
    Object.assign(this.b, {
      skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(CLOTHES), pants: pick(CLOTHES), hat: pick(HATS),
      hairStyle: pick(HAIR_STYLES)[0], beard: this.b.gender !== 'kvinde' && Math.random() < 0.4,
      bottom: this.b.gender === 'mand' || Math.random() < 0.6 ? 'pants' : 'skirt',
    });
  }

  renderOpts() {
    const b = this.b;
    const chips = (key, list) => list.map(([v, label]) => `<button class="chipbtn ${String(b[key]) === String(v) ? 'on' : ''}" data-c="${key}=${v}">${label}</button>`).join('');
    const dots = (key, list) => list.map((c) => `<button class="sw ${b[key] === c ? 'on' : ''} ${c ? '' : 'none'}" style="${c ? `background:${c}` : ''}" data-c="${key}=${c}">${c ? '' : '✕'}</button>`).join('');
    $('.cr-opts', this.el).innerHTML = `
      <div class="cr-row"><small>Køn</small><div>${chips('gender', GENDERS)}</div></div>
      <div class="cr-row"><small>Hud</small><div>${dots('skin', SKINS)}</div></div>
      <div class="cr-row"><small>Frisure</small><div>${chips('hairStyle', HAIR_STYLES)}</div></div>
      <div class="cr-row"><small>Hårfarve</small><div>${dots('hair', HAIRS)}</div></div>
      <div class="cr-row"><small>Skæg</small><div>${chips('beard', [[false, 'Nej'], [true, 'Ja']])}</div></div>
      <div class="cr-row"><small>Trøje</small><div>${dots('shirt', CLOTHES)}</div></div>
      <div class="cr-row"><small>Underdel</small><div>${chips('bottom', [['pants', '👖 Bukser'], ['skirt', '👗 Nederdel']])}</div></div>
      <div class="cr-row"><small>${b.bottom === 'skirt' ? 'Nederdel' : 'Bukser'}</small><div>${dots('pants', CLOTHES)}</div></div>
      <div class="cr-row"><small>Kasket</small><div>${dots('hat', HATS)}</div></div>`;
    $('[data-c="done"]', this.el).disabled = !b.name.trim();
  }

  initPreview() {
    const canvas = $('canvas', this.el);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    this.renderer.setSize(150, 170, false);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b8a8d8', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(30, 150 / 170, 0.1, 20);
    this.camera.position.set(0, 1.1, 3.4);
    this.camera.lookAt(0, 0.78, 0);
    this.rot = 0.5;
    const tick = () => {
      if (!this.renderer) return;
      this.rot += 0.012;
      if (this.mesh) this.mesh.rotation.y = Math.sin(this.rot) * 0.8;
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  refresh() {
    if (this.mesh) this.scene.remove(this.mesh);
    this.mesh = makeCharacter(bossLook(this.b));
    this.scene.add(this.mesh);
  }

  finish() {
    const b = { ...this.b, name: this.b.name.trim() };
    if (!b.name) return;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer = null;
    this.el.remove();
    this.onDone(b);
  }
}
