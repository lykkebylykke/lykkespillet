import {
  PRODUCTS, productById, TIER_COLORS, PRICE_MODES, ROLES, EMP_TIERS, SOME_BONUS, SOME_VIRAL, ECOM_BONUS,
  UPGRADES, SHOP, CAMPAIGNS, QUESTS, DAY_LENGTH, EXPENSES, LOANS, BANKRUPT_DAYS, TILE_COST, TILE_RENT, FURNITURE, PACKAGING, FREIGHT, rentOf, xpFor, MAX_LEVEL, unlocksAt, TREND, AUTO_TASKS, RETURN_FREIGHT, SHIFT, furnCost, furnLvl, SPEEDS, gameTime, HELP_JOBS, CHAPTERS,
} from './data.js';
import {
  bus, fmt, kr, capacity, stockTotal, available, upgVal, unitPrice, salaryOf, hire, fire, empUpgradeCost,
  spend, addMoney, addXP, resetState, activeCampaign, setDesk, ownedFurniture, returnRate, returnFactors, listed, slotNow, clockText, pauseOf, dutyOf, helpOptions, activeSeason,
} from './state.js';
import {
  effects, buyStock, buyFurniture, buyShop, advisor, dayReport, startCampaign, campaignDur, supportRate, takeLoan, repayLoan, loanRate, loanPayoff, loanBlock, happiness, happyEff, helpEff, helpPenalty, taxDue,
} from './sim.js';
import { CARDS, answerCard, upcoming, nextTax, taxSoFar } from './events.js';
import { TILE } from './world.js';
import { cloud, logout } from './cloud.js';

const TABS = [
  ['staff', '👥', 'Ansatte'], ['products', '👕', 'Varer'], ['shop', '📣', 'Marketing'], ['upgrades', '🛠️', 'Indret'], ['stats', '📊', 'Økonomi'],
];
const TITLES = { staff: 'Ansatte', products: 'Varer & ordrer', shop: 'Marketing & butik', upgrades: 'Indret & opgradér', stats: 'Økonomi' };
const FURN_GROUPS = [['work', '🏭 Arbejde'], ['pause', '☕ Pause'], ['cozy', '🪴 Hygge']];
const $ = (sel, el = document) => el.querySelector(sel);
const pct = (v) => `${Math.round(v * 100)} %`;

export class UI {
  constructor(s, world) {
    this.s = s; this.w = world;
    this.tab = 'home';
    this.shownMoney = s.money;
    this.tick = 0;
    this.confirmFire = null;
    this.prodTab = 'mine';
    this.staffTab = 'team';
    this.folds = new Set();
    this.log = [];
    this.panelOpen = false;
    this.build();
    this.bind();
  }

  build() {
    const app = $('#app');
    app.insertAdjacentHTML('beforeend', `
      <div id="hud">
        <div class="topbar">
          <button class="tb money" data-act="panel"><b id="h-money"></b></button>
          <button class="tb lvlring" id="h-lvl" data-act="panel" title="Level"></button>
          <button class="tb clock" data-act="panel"><span id="h-sky"></span><span class="ct"><b id="h-clock"></b><small id="h-day"></small></span></button>
          <button class="tb sp" id="h-pause" data-act="pause" title="Pause (mellemrum)"></button>
          <button class="tb sp" id="h-speed" data-act="speed" title="Skift fart"></button>
          <button class="tb bell" data-act="panel" title="Overblik">🔔<i id="h-badge" hidden></i></button>
        </div>
        <button id="ticker" hidden></button>
        <div id="boosts"></div>
        <div id="hudpanel" hidden></div>
      </div>
      <div id="sheet" class="sheet"><div class="sheet-head"><h2 id="sheet-title"></h2><button class="x" data-act="tab:home">✕</button></div><div class="sheet-body" id="sheet-body"></div></div>
      <nav id="nav">${TABS.map(([id, ic, name]) => `<button data-act="tab:${id}" data-tab="${id}"><span>${ic}</span><small>${name}</small></button>`).join('')}</nav>
      <div id="toasts"></div>
      <div id="daycard"></div>
      <div id="modal"></div>
    `);
  }

  bind() {
    const s = this.s;
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.act(b.dataset.act);
    });
    document.addEventListener('pointerdown', (ev) => { this.pressing = !!ev.target.closest('#sheet, #hudpanel'); this.dragShift(ev); });
    // Don't swap a menu's contents under the finger, or the tap goes nowhere.
    addEventListener('pointerup', () => { this.pressing = false; });
    addEventListener('pointercancel', () => { this.pressing = false; });
    bus.on('closeSheet', () => this.open('home'));
    bus.on('toast', (t, cls, ms) => this.toast(t, cls, ms));
    bus.on('bankrupt', () => this.bankrupt());
    bus.on('shelfMenu', (f) => this.shelfMenu(f));
    if (s.bankrupt) this.bankrupt();
    bus.on('levelup', (l) => this.levelUp(l));
    bus.on('dayEnd', (r) => this.dayCard(r));
    bus.on('ship', (rev, pos) => { this.w.popup(`+${fmt(rev)} kr`, pos, 'money'); bus.emit('sfx', 'coin'); });
    bus.on('built', (p) => { this.toast(`${p.icon} ${p.name} ${p.moved ? 'flyttet' : 'placeret'}!`, 'good'); bus.emit('sfx', p.moved ? 'pop' : 'level'); });
    bus.on('hired', (e) => this.toast(`👋 ${e.name} er startet som ${ROLES[e.role].name}!`, 'good'));
  }

  // Drag a shift bar (move) or one of its ends (when they come in / go home), snapping to half hours.
  dragShift(ev) {
    const bar = ev.target.closest('.shift');
    if (!bar) return;
    const e = this.s.employees.find((x) => x.id === +bar.dataset.id);
    if (!e) return;
    ev.preventDefault();
    const kind = ev.target.closest('.h')?.dataset.h || 'move', N = SHIFT.slots;
    const slotW = bar.parentElement.getBoundingClientRect().width / N, x0 = ev.clientX, { a: a0, b: b0 } = e.shift;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const move = (m) => {
      const d = Math.round((m.clientX - x0) / slotW);
      let a = a0, b = b0;
      if (kind === 'move') { const k = clamp(d, -a0, N - b0); a += k; b += k; }
      else if (kind === 'l') a = clamp(a0 + d, Math.max(0, b0 - SHIFT.max), b0 - SHIFT.min);
      else b = clamp(b0 + d, a0 + SHIFT.min, Math.min(N, a0 + SHIFT.max));
      if (a !== e.shift.a || b !== e.shift.b) { e.shift = { a, b }; this.renderSheet(true); }
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
  }

  act(a) {
    const s = this.s;
    const [cmd, x, y] = a.split(':');
    bus.emit('sfx', 'click');
    if (cmd === 'tab') { this.open(x === this.tab ? 'home' : x); return; }
    if (cmd === 'panel') { this.panelOpen = !this.panelOpen; this.tick = 1; return; }
    if (cmd === 'pause') { s.paused = !s.paused; this.tick = 1; return; }
    if (cmd === 'speed') { s.speed = SPEEDS[s.speed].next; this.tick = 1; return; }
    if (cmd === 'fold') { this.folds.has(x) ? this.folds.delete(x) : this.folds.add(x); this.renderSheet(true); this.tick = 1; return; }
    if (cmd === 'help') {
      const e = s.employees.find((k) => k.id === +x);
      if (e) { e.help = y === 'own' ? null : y; e.helpT = 0; }
    }
    if (cmd === 'helpAll') {
      const on = x === 'pack', staff = s.employees.filter((e) => (on ? e.role !== 'packer' : e.help));
      for (const e of staff) { e.help = on ? 'pack' : null; e.helpT = 0; }
      this.toast(on ? `🚨 ${staff.length} ${staff.length === 1 ? 'ansat hjælper' : 'ansatte hjælper'} nu med at pakke` : '🤝 Alle er tilbage på deres eget job', on ? 'event' : 'good');
    }
    if (cmd === 'cardPick') {
      const res = answerCard(s, +x);
      $('#modal').classList.remove('show');
      if (res?.[0]) this.toast(res[0], res[1], 4500);
      this.renderSheet(true);
      return;
    }
    if (cmd === 'buy') { if (!buyStock(s, x, +y)) this.toast('Ikke nok penge 💸', 'bad'); }
    if (cmd === 'buyQty') { if (!buyStock(s, x, 1, +y)) this.toast('Ikke nok penge 💸', 'bad'); else this.toast(`🚚 ${y} × ${productById[x].icon} ${productById[x].name} er bestilt`, 'good'); }
    if (cmd === 'price') s.priceMode[x] = y;
    if (cmd === 'hire') { if (!hire(s, +x)) this.toast('Ikke nok penge 💸', 'bad'); }
    if (cmd === 'upEmp') {
      const e = s.employees.find((k) => k.id === +x), c = empUpgradeCost(e);
      if (c != null && spend(s, c, 'hiring')) { e.tier++; this.toast(`⭐ ${e.name} er nu ${EMP_TIERS[e.tier].name}!`, 'good'); } else this.toast('Ikke nok penge 💸', 'bad');
    }
    if (cmd === 'fire') {
      if (this.confirmFire === +x) { fire(s, +x); this.confirmFire = null; } else this.confirmFire = +x;
    }
    if (cmd === 'upg') {
      const U = UPGRADES[x], next = U.levels[s.upg[x] + 1];
      if (next && s.level >= next.lvl && spend(s, next.cost, 'invest')) { s.upg[x]++; addXP(s, 10); this.toast(`⬆️ ${next.name} købt!`, 'good'); bus.emit('sfx', 'level'); }
    }
    if (cmd === 'shop') {
      const item = SHOP.find((i) => i.id === x);
      if (buyShop(s, item)) this.toast(`${item.icon} ${item.name} aktiveret!`, 'good'); else this.toast('Ikke nok 💰/❤️', 'bad');
    }
    if (cmd === 'camp') startCampaign(s, CAMPAIGNS.find((c) => c.id === x));
    if (cmd === 'claim') this.claimQuest();
    if (cmd === 'furn') {
      if (buyFurniture(s, x)) { this.open('home'); bus.emit('placeStart', x); return; }
      this.toast('Ikke nok penge 💸', 'bad');
    }
    if (cmd === 'ptab') this.prodTab = x;
    if (cmd === 'stab') this.staffTab = x;
    if (cmd === 'autoSet') { this.staffTab = 'team'; this.folds.add('boss'); this.open('staff'); return; }
    if (cmd === 'autoMove') {
      const L = s.auto.prio, i = L.indexOf(x), j = i + +y;
      if (j >= 0 && j < L.length) [L[i], L[j]] = [L[j], L[i]];
    }
    if (cmd === 'autoOff') s.auto.off = s.auto.off.includes(x) ? s.auto.off.filter((k) => k !== x) : [...s.auto.off, x];
    if (cmd === 'shelfTag') {
      const f = s.furniture.find((o) => o.id === +x);
      if (f) {
        f.tags = y === 'all' ? [] : f.tags?.includes(y) ? f.tags.filter((k) => k !== y) : [...f.tags, y];
        this.w.rebuild();
        this.shelfMenu(f);
      }
      return;
    }
    if (cmd === 'deskOwner') {
      const e = s.employees.find((o) => o.id === +y);
      if (e) { setDesk(s, +x, e); this.toast(`🖥️ ${e.name} sidder nu ved skrivebord ${+x + 1}`, 'good'); }
      $('#modal').classList.remove('show');
      this.renderSheet(true);
      return;
    }
    if (cmd === 'expand') { this.open('home'); bus.emit('expandStart'); return; }
    if (cmd === 'advisor' && x) { this.panelOpen = false; this.open(x); }
    if (cmd === 'closeModal') { $('#modal').classList.remove('show'); return; }
    if (cmd === 'loan') { if (takeLoan(s, x)) { this.toast(`🏦 ${kr(s.loans.at(-1).amount)} er sat ind på kontoen`, 'good'); bus.emit('sfx', 'coin'); } }
    if (cmd === 'repay') { if (!repayLoan(s, x)) this.toast('Ikke nok penge til at indfri lånet 💸', 'bad'); else this.toast('✅ Lånet er indfriet', 'good'); }
    if (cmd === 'restart') resetState();
    if (cmd === 'logout') { logout(); return; }
    if (cmd === 'reset') { if (this.confirmReset) resetState(); else this.confirmReset = true; }
    this.renderSheet(true);
  }

  open(tab) {
    if (tab === 'buy') { tab = 'products'; this.prodTab = 'buy'; } else if (tab === 'orders') { tab = 'products'; this.prodTab = 'orders'; } else if (tab === 'products' && this.tab !== 'products') this.prodTab = 'mine';
    this.tab = tab;
    this.confirmFire = null;
    this.confirmReset = false;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#sheet').classList.toggle('open', tab !== 'home');
    if (tab !== 'home') { $('#sheet-title').textContent = TITLES[tab]; $('#sheet-body').scrollTop = 0; this.renderSheet(true); }
  }

  get sheetOpen() { return this.tab !== 'home'; }
  get modalOpen() { return $('#modal').classList.contains('show'); }
  closePanel() { this.panelOpen = false; $('#hudpanel').hidden = true; }

  // Open one employee's card (tapping someone in the shop).
  openEmp(id) {
    this.staffTab = 'team';
    this.folds.add(`emp-${id}`);
    this.closePanel();
    this.open('staff');
  }

  // A one-line row that folds out to show the details. Which ones are open is remembered by key.
  fold(key, { av, title, sub = '', action = '', body = '', cls = '' }) {
    const open = this.folds.has(key);
    return `<div class="card fold ${cls} ${open ? 'open' : ''}">
      <div class="fhead" ${body ? `data-act="fold:${key}"` : ''}>${av}<div class="info"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div>${action}${body ? '<span class="fchev">›</span>' : ''}</div>
      ${open && body ? `<div class="fbody">${body}</div>` : ''}</div>`;
  }

  // A heading that folds a whole group away; shut unless it's marked open from the start.
  section(key, title, inner, startOpen = false) {
    const open = this.folds.has(key) !== startOpen;
    return `<button class="sechead ${open ? 'open' : ''}" data-act="fold:${key}"><span>${title}</span><span class="fchev">›</span></button>${open ? `<div class="secbody">${inner}</div>` : ''}`;
  }

  // ---------- quests ----------
  quest() {
    const q = QUESTS[this.s.quest];
    if (!q) return null;
    const [cur, target] = q.goal(this.s);
    return { q, cur: Math.min(cur, target), target, done: cur >= target };
  }

  questTarget() {
    const st = this.quest();
    if (!st || st.done || !st.q.target) return null;
    return this.w.questTarget(st.q.target);
  }

  claimQuest() {
    const s = this.s, st = this.quest();
    if (!st?.done) return;
    const r = st.q.reward;
    if (r.money) addMoney(s, r.money);
    if (r.gems) s.gems += r.gems;
    if (r.xp) addXP(s, r.xp);
    s.quest++;
    this.toast(`🎯 Mål klaret! ${rewardText(r)}`, 'good');
    bus.emit('sfx', 'level');
  }

  // ---------- notifications ----------
  toast(text, cls = '', ms = cls === 'good' ? 2200 : 3200) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = text;
    // Everything goes in the log under 🔔; only what matters right now also pops up.
    this.log.unshift({ text, at: `Dag ${this.s.day} ${clockText(Math.floor(slotNow(this.s)))}` });
    this.log.length = Math.min(this.log.length, 12);
    if (cls === 'quiet') return;
    if ([...box.children].some((o) => o.textContent === text)) return;
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }

  // Tag a shelf for one or more products (no tags = anything goes).
  shelfMenu(f) {
    const s = this.s, tags = f.tags || [];
    const opts = PRODUCTS.filter((p) => p.lvl <= s.level || tags.includes(p.id));
    const on = Object.entries(f.stock || {}).filter(([, n]) => n).map(([id, n]) => `${productById[id].icon} ${n}`).join(' · ');
    $('#modal').innerHTML = `<div class="card-modal shelfmenu">
      <h2>🏷️ Reolens tags</h2><p>Vælg de varer, reolen er til – gerne flere. Lagermedarbejderne fylder tagget reoler først og flytter varer, der står forkert, over på de rigtige reoler.</p>
      <p><small>Der står nu: ${on || 'ingenting'}</small></p>
      <div class="opts"><button class="chipbtn ${tags.length ? '' : 'on'}" data-act="shelfTag:${f.id}:all">📦 Alle varer</button>${opts.map((p) => `<button class="chipbtn ${tags.includes(p.id) ? 'on' : ''}" data-act="shelfTag:${f.id}:${p.id}">${p.icon} ${p.name}</button>`).join('')}</div>
      <button class="btn" data-act="closeModal">Færdig</button></div>`;
    $('#modal').classList.add('show');
  }

  // Choose who sits at a desk; they swap with whoever sat there.
  deskMenu(f) {
    const s = this.s, i = s.furniture.filter((o) => o.type === 'desk').indexOf(f);
    const owner = s.employees.find((e) => e.desk === i), staff = s.employees.filter((e) => ROLES[e.role].desk);
    const btn = (e) => `<button class="chipbtn ${e === owner ? 'on' : ''}" data-act="deskOwner:${i}:${e.id}">${ROLES[e.role].icon} ${esc(e.name)}${e.desk != null && e !== owner ? ` <small>(nr. ${e.desk + 1})</small>` : ''}</button>`;
    $('#modal').innerHTML = `<div class="card-modal shelfmenu">
      <h2>🖥️ Skrivebord ${i + 1}</h2><p>${owner ? `${esc(owner.name)} sidder her nu.` : 'Ledigt – chefen bruger det til kundeservice og webshoppen.'} Vælg hvem skrivebordet tilhører.</p>
      <div class="opts">${staff.length ? staff.map(btn).join('') : '<small>Ingen kontorfolk ansat endnu.</small>'}</div>
      <button class="btn ghost" data-act="closeModal">Luk</button></div>`;
    $('#modal').classList.add('show');
  }

  // The decision on the table; the game waits for an answer.
  showCard() {
    const s = this.s, { id, ctx } = s.card, c = CARDS[id];
    if (c.valid && !c.valid(s, ctx)) { s.card = null; return; }
    $('#modal').innerHTML = `<div class="card-modal decision">
      <div class="burst">${c.icon}</div><h2>${c.title}</h2><p>${esc(c.text(s, ctx))}</p>
      <div class="dopts">${c.options(s, ctx).map((o, i) => `<button class="btn ${i ? 'ghost' : ''}" data-act="cardPick:${i}" ${o.can && !o.can() ? 'disabled' : ''}>${o.label}<small>${o.sub}</small></button>`).join('')}</div></div>`;
    $('#modal').classList.add('show');
    bus.emit('sfx', 'pop');
  }

  // Evening: the screen dims for a moment and shows how the day went.
  dayCard(r) {
    if (this.s.bankrupt) return;
    const profit = r.revenue - r.costs, el = $('#daycard');
    this.log.unshift({ text: dayReport(r), at: `Dag ${r.day}` });
    el.innerHTML = `<div><span>🌙</span><b>Dag ${r.day} er slut</b><em class="${profit < 0 ? 'neg' : ''}">${profit >= 0 ? '+' : ''}${kr(profit)}</em><small>${r.orders} ordrer · saldo ${kr(this.s.money)}</small></div>`;
    el.classList.remove('show');
    void el.offsetWidth; // restart the animation
    el.classList.add('show');
  }

  bankrupt() {
    const s = this.s;
    const st = s.stats, days = s.day - 1 + (s.bankruptWhy === 'stuck' ? 1 : 0);
    const exp = Object.values(st.exp).reduce((a, b) => a + b, 0), result = st.revenue - exp;
    const best = st.history.reduce((a, d) => (!a || d.revenue - d.costs > a.revenue - a.costs ? d : a), null);
    const top = Object.entries(s.sold || {}).sort((a, b) => b[1] - a[1])[0];
    const why = s.bankruptWhy === 'stuck'
      ? 'Kassen er tom, lageret er tomt, og banken vil ikke låne dig flere penge.'
      : `Saldoen var i minus ${BANKRUPT_DAYS} dage i træk, og banken har lukket butikken.`;
    const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    $('#toasts').innerHTML = '';
    $('#modal').innerHTML = `<div class="card-modal summary">
      <div class="burst">💸</div><h2>KONKURS</h2>
      <p>${why}</p>
      <h4>${esc(s.boss?.name || '')}s webshop</h4>
      <table class="ledger plain">
        ${row('📅 Dage i drift', fmt(days))}
        ${row('⭐ Level', s.level)}
        ${row('📦 Pakker sendt', fmt(st.shipped))}
        ${row('🛍️ Omsætning', kr(st.revenue))}
        ${row('💸 Udgifter i alt', kr(exp))}
        ${row('📊 Samlet resultat', `<b class="${result < 0 ? 'warn' : 'pos'}">${result >= 0 ? '+' : ''}${kr(result)}</b>`)}
        ${best ? row('🏆 Bedste dag', `Dag ${best.day} · ${kr(best.revenue)}`) : ''}
        ${top ? row('👑 Mest solgte vare', `${productById[top[0]].icon} ${productById[top[0]].name} (${fmt(top[1])})`) : ''}
        ${row('😞 Tabte ordrer', fmt(st.lost))}
        ${row('👥 Ansatte', s.employees.length)}
        ${row('📣 Kampagner', fmt(st.campaigns))}
        ${row('🎧 Kundehenvendelser løst', fmt(st.ticketsSolved))}
        ${row('📐 Lager', `${fmt((90 + s.tiles.length) * 4)} m²`)}
      </table>
      <button class="btn big" data-act="restart">Start en ny webshop</button></div>`;
    $('#modal').classList.add('show');
  }

  levelUp(l) {
    bus.emit('sfx', 'fanfare');
    const un = unlocksAt(l);
    $('#modal').innerHTML = `<div class="card-modal">
      <div class="burst">🎉</div><h2>Level ${l}!</h2><p>+3 ❤️</p>
      ${un.length ? `<h4>Låst op</h4><ul>${un.map((u) => `<li>${u}</li>`).join('')}</ul>` : ''}
      <button class="btn big" data-act="closeModal">Fedt!</button></div>`;
    $('#modal').classList.add('show');
  }

  // ---------- per-frame ----------
  update(dt) {
    const s = this.s;
    this.shownMoney += (s.money - this.shownMoney) * Math.min(1, dt * 6);
    if (Math.abs(s.money - this.shownMoney) < 1) this.shownMoney = s.money;
    $('#h-money').textContent = `${fmt(this.shownMoney)} kr`;
    $('#h-money').classList.toggle('neg', s.money < 0);
    this.tick += dt;
    if (this.tick < 0.25) return;
    this.tick = 0;

    const f = s.dayTime / DAY_LENGTH;
    const xp = s.level >= MAX_LEVEL ? 1 : s.xp / xpFor(s.level);
    const lv = $('#h-lvl');
    lv.textContent = s.level;
    lv.style.setProperty('--p', `${(xp * 100).toFixed(0)}%`);
    $('#h-sky').textContent = f < 0.12 ? '🌅' : f < 0.72 ? '☀️' : f < 0.88 ? '🌇' : '🌙';
    $('#h-clock').textContent = clockText(Math.floor(slotNow(s) * 6) / 6);
    const dh = `Dag ${s.day}${s.redDays ? ` <i>⚠️${s.redDays}</i>` : ''}`;
    if (dh !== this.dayHtml) { this.dayHtml = dh; $('#h-day').innerHTML = dh; }
    const paused = $('#h-pause'), sp = SPEEDS[s.speed];
    paused.textContent = s.paused ? '▶' : '⏸';
    paused.classList.toggle('on', s.paused);
    const st = `${sp.icon}${sp.name}`;
    if ($('#h-speed').textContent !== st) $('#h-speed').textContent = st;

    if (s.card && !this.modalOpen && !document.body.classList.contains('building')) this.showCard();
    this.checkChapter();

    const qs = this.quest(), adv = advisor(s), chap = this.chapterState();
    const badge = (qs?.done ? 1 : 0) + (adv.calm ? 0 : 1);
    const be = $('#h-badge');
    be.hidden = !badge;
    be.textContent = badge;

    // The one line under the bar: only the single most important thing right now, otherwise nothing.
    const line = this.tickerLine(qs);
    const te = $('#ticker');
    te.hidden = !line;
    if (line) {
      if (line.html !== this.tickHtml) { this.tickHtml = line.html; te.innerHTML = line.html; }
      te.dataset.act = line.act;
      te.className = line.cls || '';
    }

    const bh = this.boostIcons();
    if (bh !== this.boostHtml) { this.boostHtml = bh; $('#boosts').innerHTML = bh; }

    const pe = $('#hudpanel');
    pe.hidden = !this.panelOpen;
    if (this.panelOpen && !this.pressing) {
      const html = this.panelHtml(qs, adv, chap);
      if (html !== this.panelLast) { this.panelLast = html; pe.innerHTML = html; }
    }
    this.renderSheet();
  }

  tickerLine(qs) {
    const s = this.s, season = activeSeason(s), c = s.contract, left = (t) => gameTime(Math.max(0, t - s.time));
    if (s.paused) return { html: '⏸ Spillet er sat på pause – tryk ▶ for at fortsætte', act: 'pause', cls: 'paused' };
    if (qs?.done) return { html: `🎯 Mål klaret: <b>hent ${rewardText(qs.q.reward)}</b>`, act: 'claim', cls: 'good' };
    if (s.redDays >= 2) return { html: `⚠️ I minus ${s.redDays} dage i træk – konkurs efter ${BANKRUPT_DAYS}`, act: 'advisor:stats', cls: 'bad' };
    if (s.outage?.until > s.time) return { html: `🔌 Webshoppen er nede · ${left(s.outage.until)}`, act: 'panel', cls: 'bad' };
    if (c) return { html: `🏢 Firmaordre ${productById[c.pid].icon} <b>${c.done}/${c.n}</b> · ${left(c.until)} tilbage`, act: 'advisor:orders', cls: 'event' };
    if (s.season?.goal && season) return { html: `${season.icon} ${season.name}: <b>${s.stats.shipped - s.season.from}/${s.season.goal}</b> ordrer`, act: 'panel', cls: 'event' };
    if (qs && s.quest < 9 && !qs.done) return { html: `🎯 ${qs.q.text}${qs.target > 1 ? ` <b>${fmtGoal(qs.cur)}/${fmtGoal(qs.target)}</b>` : ''}`, act: `advisor:${qs.q.tab || ''}` };
    return null;
  }

  // Small icons for what's running right now; the details are one tap away under 🔔.
  boostIcons() {
    const s = this.s, camp = activeCampaign(s), season = activeSeason(s);
    const chip = (icon, cls = '', p = null) => `<button class="boost ${cls}" data-act="panel">${icon}${p != null ? `<i style="width:${(p * 100).toFixed(0)}%"></i>` : ''}</button>`;
    return [
      season && chip(season.icon, 'trend'),
      camp && chip(camp.icon, 'camp', (camp.until - s.time) / camp.total),
      ...s.boosts.map((b) => chip(b.icon, '', Math.max(0, b.until - s.time) / b.total)),
      s.trend && chip(`🔥${productById[s.trend.id].icon}`, 'trend'),
      s.flop && chip(`📉${productById[s.flop.id].icon}`, 'flop'),
      s.employees.some((e) => e.help) && chip('🤝', 'trend'),
    ].filter(Boolean).join('');
  }

  // The overview under 🔔: level, goals, the advisor's tip, what's coming and what has happened.
  panelHtml(qs, adv, chap) {
    const s = this.s, camp = activeCampaign(s), days = (d) => (d === 1 ? 'i dag' : `${d} dage`), season = activeSeason(s);
    const left = (t) => gameTime(Math.max(0, t - s.time));
    const xpTxt = s.level >= MAX_LEVEL ? 'MAX' : `${fmt(s.xp)}/${fmt(xpFor(s.level))} XP`;
    const running = [
      season && `${season.icon} ${season.name} · ${season.desc}`,
      camp && `${camp.icon} ${camp.name} · ${left(camp.until)}`,
      ...s.boosts.map((b) => `${b.icon} ${b.name} · ${left(b.until)}`),
      s.trend && `🔥 ${productById[s.trend.id].icon} ${productById[s.trend.id].name} trender · ${days(s.trend.days)}`,
      s.flop && `📉 ${productById[s.flop.id].icon} ${productById[s.flop.id].name} er ude · ${days(s.flop.days)}`,
    ].filter(Boolean);
    const next = upcoming(s).slice(0, 2).map((x) => `<small>${x.in === 1 ? 'I morgen' : `Om ${x.in} dage`}: ${x.icon} ${x.name}</small>`);
    if (s.level >= 3) next.unshift(`<small>${nextTax(s) ? `Om ${nextTax(s)} ${nextTax(s) === 1 ? 'dag' : 'dage'}` : 'I aften'}: 🧾 Moms ca. ${kr(taxSoFar(s))}</small>`);
    return `<div class="pstats"><div class="plv"><b>⭐ Level ${s.level}</b><div class="xpbar"><i style="width:${s.level >= MAX_LEVEL ? 100 : (s.xp / xpFor(s.level)) * 100}%"></i></div><small>${xpTxt}</small></div>
        <span>❤️ <b>${s.gems}</b></span><span>👥 <b>${s.employees.length}</b></span></div>
      ${qs ? `<button class="quest ${qs.done ? 'done' : ''}" data-act="${qs.done ? 'claim' : `advisor:${qs.q.tab || ''}`}"><span class="qi">🎯</span><b class="qt">${qs.q.text}</b>${qs.done ? `<span class="btn claim">Hent ${rewardText(qs.q.reward)}</span>` : `<small>${fmtGoal(qs.cur)}/${fmtGoal(qs.target)}</small>`}</button>` : ''}
      <button class="advisor" data-act="advisor:${adv.tab || ''}"><span class="qi">💡</span><span class="qt">${adv.text}</span>${adv.tab ? '<span class="chev">›</span>' : ''}</button>
      ${chap ? `<div class="pblock"><b>${chap.c.icon} Kapitel ${s.chapter + 1}: ${chap.c.name}</b>${chap.goals.map((g) => `<small class="${g.done ? 'pos' : ''}">${g.done ? '✅' : '▫️'} ${g.text}${g.done ? '' : ` (${fmtGoal(g.cur)}/${fmtGoal(g.target)})`}</small>`).join('')}</div>` : ''}
      ${running.length ? `<div class="pblock"><b>I gang nu</b>${running.map((r) => `<small>${r}</small>`).join('')}</div>` : ''}
      ${next.length ? `<div class="pblock"><b>📅 På vej</b>${next.join('')}</div>` : ''}
      ${this.log.length ? `<div class="pblock"><b>Beskeder</b>${this.log.slice(0, 6).map((l) => `<small>${l.text}</small>`).join('')}</div>` : ''}`;
  }

  chapterState() {
    const s = this.s, c = CHAPTERS[s.chapter];
    if (!c) return null;
    const goals = c.goals.map((g) => { const [cur, target] = g.f(s); return { text: g.text, cur: Math.min(cur, target), target, done: cur >= target }; });
    return { c, goals, done: goals.every((g) => g.done) };
  }

  // A finished chapter pays out and opens the next one.
  checkChapter() {
    const st = this.chapterState(), s = this.s;
    if (!st?.done || this.modalOpen) return;
    const r = st.c.reward;
    addMoney(s, r.money);
    s.gems += r.gems;
    s.chapter++;
    const next = CHAPTERS[s.chapter];
    bus.emit('sfx', 'fanfare');
    $('#modal').innerHTML = `<div class="card-modal"><div class="burst">${st.c.icon}</div><h2>Kapitel klaret!</h2><p>${st.c.name}</p><p>${rewardText(r)}</p>
      ${next ? `<h4>Næste kapitel</h4><p>${next.icon} ${next.name}</p>` : '<p>Du har bygget Danmarks lykkeligste webshop! 👑</p>'}
      <button class="btn big" data-act="closeModal">Videre!</button></div>`;
    $('#modal').classList.add('show');
  }

  // How often parcels come back, what drives it and what would help.
  returnsCard() {
    const s = this.s, L = listed(s);
    if (!L.length) return '';
    const w = L.map((p) => s.sold[p.id] || 1), sum = w.reduce((a, b) => a + b, 0);
    const avg = L.reduce((a, p, i) => a + returnRate(s, p) * w[i], 0) / sum;
    const f = returnFactors(s), tips = f.map(([, , tip]) => tip).filter(Boolean);
    const real = s.stats.shipped ? `${s.stats.returns} af ${fmt(s.stats.shipped)} pakker er kommet retur (${Math.round((s.stats.returns / s.stats.shipped) * 100)} %).` : '';
    return `<div class="card retcard"><div class="av" style="background:#ffe3e8">↩️</div><div class="info">
      <b>Returrate ca. <span class="${avg >= 0.15 ? 'warn' : 'pos'}">${Math.round(avg * 100)} %</span></b>
      <small>Returvarer kommer med morgenbilen. Kunden får pengene tilbage + ${kr(RETURN_FREIGHT)} i returfragt pr. vare, og varen skal på reolen igen – lagerfolk og ledige pakkere tager dem. ${real}</small>
      <small class="hwhy">${f.filter(([, m]) => Math.abs(m - 1) > 0.005).map(([n, m]) => `${n} ${m < 1 ? '−' : '+'}${Math.abs(Math.round((m - 1) * 100))} %`).join(' · ')}</small>
      ${tips.length ? `<div class="htips">${tips.map((t) => `<small>💡 ${t}</small>`).join('')}</div>` : ''}
</div></div>`;
  }

  trendTag(id) {
    const s = this.s;
    return s.trend?.id === id ? ` <span class="tag hot">🔥 Trend ×${TREND.hot}</span>` : s.flop?.id === id ? ` <span class="tag cold">📉 Ude af mode</span>` : '';
  }

  renderSheet(force) {
    if (!this.sheetOpen || (this.pressing && !force)) return;
    const html = this['r_' + this.tab]();
    if (force || html !== this.lastSheet) { this.lastSheet = html; $('#sheet-body').innerHTML = html; }
  }

  // ---------- tabs ----------
  r_staff() {
    const s = this.s;
    const team = s.employees.map((e) => {
      const R = ROLES[e.role], up = empUpgradeCost(e), { v } = happiness(s, e), face = v >= 70 ? '😄' : v >= 45 ? '🙂' : v >= 25 ? '😐' : '😟';
      const job = e.help ? `🤝 ${HELP_JOBS[e.help].name}` : DUTY_SHORT[dutyOf(s, e)];
      return this.fold(`emp-${e.id}`, {
        av: `<div class="av" style="background:${R.color}">${R.icon}</div>`,
        title: `${esc(e.name)} ${e.tier ? `<span class="tag">${EMP_TIERS[e.tier].name}</span>` : ''}`,
        sub: `${R.name} · ${job}${R.desk && e.desk == null ? ' · <span class="warn">⚠️ Intet skrivebord</span>' : ''}`,
        action: `<span class="face">${face}</span>`,
        body: `<small>Løn ${kr(salaryOf(e))}/dag · 🗓️ ${clockText(e.shift.a)}–${clockText(e.shift.b)}${e.awayDay >= s.day ? ' · 🏖️ Væk' : ''}</small>
          <small class="eff">${this.effectText(e)}</small>
          ${e.special ? `<small class="special">✨ ${e.specialDesc}</small>` : ''}
          ${this.happyBar(e)}
          <small class="hlabel">Midlertidig opgave${e.help ? ` · ${Math.round(helpEff(e) * 100)} % tempo, −${helpPenalty(e)} glæde` : ''}</small>
          <div class="seg"><button class="${e.help ? '' : 'on'}" data-act="help:${e.id}:own">Eget job</button>${helpOptions(e).map((k) => `<button class="${e.help === k ? 'on' : ''}" data-act="help:${e.id}:${k}">${HELP_JOBS[k].icon} ${HELP_JOBS[k].name}</button>`).join('')}</div>
          <div class="fact">${up != null ? `<button class="btn" data-act="upEmp:${e.id}" ${s.money < up ? 'disabled' : ''}>⬆ ${EMP_TIERS[e.tier + 1].name}<small>${kr(up)}</small></button>` : '<span class="tag gold">MAX</span>'}
            <button class="btn ghost" data-act="fire:${e.id}">${this.confirmFire === e.id ? 'Sikker?' : 'Afskedig'}</button></div>`,
      });
    }).join('') || '<p class="empty">Du laver alt selv lige nu. Ansæt dit første teammedlem under 🤝 Ansæt.</p>';
    const cands = s.candidates.map((c) => {
      const R = ROLES[c.role];
      return this.fold(`cand-${c.cid}`, {
        av: `<div class="av" style="background:${R.color}">${R.icon}</div>`,
        cls: c.special ? 'rare' : '',
        title: `${esc(c.name)} ${c.special ? '<span class="tag gold">SJÆLDEN</span>' : ''}`,
        sub: `${R.name} · ${kr(Math.round(R.salary * (c.special ? 1.3 : 1)))}/dag`,
        action: `<button class="btn" data-act="hire:${c.cid}" ${s.money < c.cost ? 'disabled' : ''}>Ansæt<small>${kr(c.cost)}</small></button>`,
        body: `<small class="eff">${R.desc}</small>${c.special ? `<small class="special">✨ ${c.specialDesc}</small>` : ''}`,
      });
    }).join('');
    const locked = Object.values(ROLES).filter((r) => r.lvl > s.level).sort((a, b) => a.lvl - b.lvl)[0];
    const st = this.staffTab, tab = (id, label) => `<button class="${st === id ? 'on' : ''}" data-act="stab:${id}">${label}</button>`;
    const tabs = `<div class="seg subtabs">${tab('team', `👥 Team (${s.employees.length})`)}${tab('plan', '🗓️ Vagter')}${tab('hire', `🤝 Ansæt (${s.candidates.length})`)}</div>`;
    if (st === 'plan') return tabs + this.r_plan();
    if (st === 'hire') return tabs + (cands || '<p class="empty">Nå level 2 for at kunne ansætte. Nye kandidater hver dag.</p>') + (locked ? `<div class="locked">🔒 Næste: ${locked.icon} ${locked.name} · Level ${locked.lvl}</div>` : '');
    const helping = s.employees.filter((e) => e.help).length, others = s.employees.some((e) => e.role !== 'packer');
    const rush = helping ? `<button class="btn ghost wide rush" data-act="helpAll:stop">🤝 ${helping} hjælper til · Tilbage til eget job</button>`
      : others ? '<button class="btn wide rush" data-act="helpAll:pack">🚨 Alle mand til pakning<small>Langsommere og mindre glade, og deres eget job står stille</small></button>' : '';
    return tabs + rush + this.autoCard() + team;
  }

  // The boss's priority list.
  autoCard() {
    const s = this.s, L = s.auto.prio;
    const rows = L.map((id, i) => {
      const T = AUTO_TASKS[id], off = s.auto.off.includes(id);
      return `<div class="aprio ${off ? 'off' : ''}">
        <b>${i + 1}</b><div><span>${T.icon} ${T.name}</span></div>
        <button data-act="autoMove:${id}:-1" ${i ? '' : 'disabled'}>▲</button><button data-act="autoMove:${id}:1" ${i < L.length - 1 ? '' : 'disabled'}>▼</button>
        <button class="tgl ${off ? '' : 'on'}" data-act="autoOff:${id}">${off ? 'Fra' : 'Til'}</button></div>`;
    }).join('');
    return this.fold('boss', {
      av: '<div class="av" style="background:#ffd166">👑</div>',
      title: `${esc(s.boss?.name || 'Chefen')} <span class="tag gold">Chef</span>`,
      sub: 'Arbejder selv efter din prioritetsliste',
      body: `<div class="aprios">${rows}</div>`,
    });
  }

  // Shift planner: one bar per employee on a 07:00–18:30 timeline. Drag a bar to move it, drag its ends to change hours.
  r_plan() {
    const s = this.s, N = SHIFT.slots, pct = (v) => `${((v / N) * 100).toFixed(2)}%`;
    if (!s.employees.length) return '<p class="empty">Ansæt nogen først – så kan du lægge deres vagter her.</p>';
    const hours = Array.from({ length: Math.floor(N / 2) + 1 }, (_, i) => `<span style="left:${pct(i * 2)}">${String(SHIFT.from + i).padStart(2, '0')}</span>`).join('');
    const now = `<i class="now" style="left:${pct(Math.floor(slotNow(s) * 4) / 4)}"></i>`;
    const rows = s.employees.map((e) => {
      const R = ROLES[e.role], sh = e.shift, p = pauseOf(sh), h = (sh.b - sh.a) / 2;
      return `<div class="prow"><div class="pwho"><span style="background:${R.color}">${R.icon}</span><b>${esc(e.name)}</b><small>${h % 1 ? h.toFixed(1).replace('.', ',') : h} t · ${DUTY_SHORT[dutyOf(s, e)]}</small></div>
        <div class="ptrack">${now}<div class="shift" data-id="${e.id}" style="left:${pct(sh.a)};width:${pct(sh.b - sh.a)};--c:${R.color}">
          <i class="pause" style="left:${(((p.a - sh.a) / (sh.b - sh.a)) * 100).toFixed(2)}%;width:${(SHIFT.pause * 100).toFixed(0)}%"></i>
          <i class="h" data-h="l"></i><em>${clockText(sh.a)}–${clockText(sh.b)}</em><i class="h" data-h="r"></i></div></div></div>`;
    }).join('');
    // How many are actually working (not on a break) in each half hour.
    const cover = Array.from({ length: N }, (_, k) => {
      const n = s.employees.filter((e) => { const p = pauseOf(e.shift), t = k + 0.5; return t >= e.shift.a && t < e.shift.b && !(t >= p.a && t < p.b); }).length;
      return `<i class="c${Math.min(n, 4)}" title="${clockText(k)}: ${n} på arbejde">${n || ''}</i>`;
    }).join('');
    const wages = s.employees.reduce((a, e) => a + salaryOf(e), 0);
    return `<p class="tip">Træk i en vagt for at flytte den, eller i enderne for at ændre længden. Løn: <b>${kr(wages)}/dag</b>.</p>
      <div class="plan"><div class="prow head"><div class="pwho"></div><div class="ptrack hours">${hours}</div></div>${rows}
        <div class="prow cover"><div class="pwho"><b>Bemanding</b><small>på arbejde</small></div><div class="ptrack">${cover}</div></div></div>
`;
  }

  // Satisfaction bar going from red (unhappy) to green (happy), with the reasons underneath.
  happyBar(e) {
    const { v, why, tips } = happiness(this.s, e), face = v >= 70 ? '😄' : v >= 45 ? '🙂' : v >= 25 ? '😐' : '😟';
    return `<div class="happy"><span>${face}</span><div class="hbar"><i style="width:${v}%;background:hsl(${Math.round(v * 1.2)},70%,50%)"></i></div><b>${v}</b></div>
      <small class="hwhy">⚡ Arbejdstempo <b>${Math.round(happyEff(v) * 100)} %</b>${why.length ? ` · ${why.join(' · ')}` : ''}</small>
      ${tips.length ? `<div class="htips">${tips.slice(0, 2).map((t) => `<small>💭 ${t}</small>`).join('')}</div>` : ''}`;
  }

  effectText(e) {
    const s = this.s, eff = happyEff(happiness(s, e).v), m = EMP_TIERS[e.tier].mult * (e.special === 'fast' ? 1.5 : 1) * eff, comp = upgVal(s, 'computer') * eff;
    if (e.role === 'packer') return `📦 ${((2.2 * upgVal(s, 'packTable')) / m).toFixed(1)} s pr. ordre · bærer ${e.tier >= 3 ? 3 : e.tier >= 1 ? 2 : 1}`;
    if (e.role === 'stocker') return `🛒 ${(4 * m).toFixed(1)} varer/sek`;
    if (e.role === 'support') return `🎧 ${(supportRate(s, e) * 60).toFixed(0)} henvendelser/min`;
    if (e.role === 'some') return `📈 +${pct(SOME_BONUS[e.tier] * comp)} trafik · ${pct(SOME_VIRAL[e.tier] + (e.special === 'viral' ? 0.1 : 0))} viral-chance`;
    return `🛍️ +${pct(ECOM_BONUS[e.tier] * comp * (e.special === 'data' ? 1.5 : 1))} konvertering`;
  }

  r_orders() {
    const s = this.s, fx = effects(s);
    const who = (by) => (by === 'player' ? 'dig' : s.employees.find((e) => e.id === by)?.name || '?');
    const sat = s.satisfaction;
    const rows = s.orders.slice(0, 40).map((o) => {
      const p = productById[o.productId], wait = Math.floor(s.time - o.t);
      return `<div class="row"><span class="ic">${p.icon}</span><div class="info"><b>#${o.id} ${p.name}</b><small class="${wait > 90 ? 'warn' : ''}">Venter ${gameTime(wait)}${o.b2b ? ' · 🏢 Firmaordre' : ''}</small></div>
        <span class="tag ${o.status === 'queued' ? '' : 'blue'}">${o.status === 'queued' ? 'I kø' : `Plukket af ${who(o.by)}`}</span></div>`;
    }).join('') || '<p class="empty">Ingen ordrer i kø lige nu.</p>';
    return `<div class="grid3">
        <div class="stat"><small>Ordrer/min</small><b>${fx.opm.toFixed(1)}</b></div>
        <div class="stat"><small>Kundetilfredshed</small><b>${sat > 75 ? '😍' : sat > 50 ? '🙂' : sat > 25 ? '😐' : '😡'} ${Math.round(sat)}</b></div>
        <div class="stat"><small>Tabte salg i dag</small><b class="${s.stats.today.lost ? 'warn' : ''}">${s.stats.today.lost}</b></div>
      </div>
      <div class="grid3" style="margin-top:6px">
        <div class="stat"><small>Kundehenvendelser</small><b class="${s.tickets >= 5 ? 'warn' : ''}">🎧 ${s.tickets}</b></div>
        <div class="stat"><small>Besvaret i alt</small><b>${s.stats.ticketsSolved}</b></div>
        <div class="stat"><small>Kampagner kørt</small><b>${s.stats.campaigns}</b></div>
      </div>
      <h3>Ordrekø (${s.orders.length})</h3>${rows}`;
  }

  r_products() {
    const t = this.prodTab, tab = (id, label) => `<button class="${t === id ? 'on' : ''}" data-act="ptab:${id}">${label}</button>`;
    const tabs = `<div class="seg subtabs">${tab('mine', '👕 Mine')}${tab('buy', '🛒 Indkøb')}${tab('orders', `🧾 Ordrer (${this.s.orders.length})`)}</div>`;
    return tabs + (t === 'buy' ? this.r_buy() : t === 'orders' ? this.r_orders() : this.r_mine());
  }

  // Products the shop sells or has sold.
  r_mine() {
    const s = this.s;
    const transit = (id) => s.deliveries.filter((d) => d.productId === id).reduce((a, d) => a + d.qty, 0) + s.boxes.filter((b) => b.productId === id).reduce((a, b) => a + b.qty, 0);
    const mine = PRODUCTS.filter((p) => s.everStocked[p.id] || transit(p.id));
    if (!mine.length) return '<p class="empty">Du har ingen varer i shoppen endnu. Køb dem hjem under 🛒 Indkøb.</p>';
    return `<p class="tip">Lager: <b>${stockTotal(s)}/${capacity(s)}</b></p>` + mine.map((p) => {
      const price = unitPrice(s, p), mode = s.priceMode[p.id] || 'normal';
      const stock = s.stock[p.id] || 0, tr = transit(p.id), free = Math.max(0, available(s, p.id));
      return this.fold(`mine-${p.id}`, {
        av: `<div class="av" style="background:${p.color}33">${p.icon}</div>`,
        title: `${p.name}${this.trendTag(p.id)}${stock ? '' : ' <span class="tag hot">Udsolgt</span>'}`,
        sub: `På reolen <b class="${free ? '' : 'warn'}">${stock}</b>${tr ? ` · På vej ${tr}` : ''} · Solgt ${s.sold[p.id] || 0}`,
        action: `<button class="btn" data-act="buyQty:${p.id}:10" ${s.money < p.cost * 10 ? 'disabled' : ''}>🛒 10<small>${kr(p.cost * 10)}</small></button>`,
        body: `<small>Salgspris ${kr(price)} · Margin <b>${kr(price - p.cost)}</b>${stock !== free ? ` · ${stock - free} bestilt` : ''}</small>
          <small>↩️ Retur ca. <b class="${returnRate(s, p) >= 0.2 ? 'warn' : ''}">${Math.round(returnRate(s, p) * 100)} %</b>${s.returned[p.id] ? ` (${s.returned[p.id]} sendt retur)` : ''}</small>
          <div class="seg">${Object.entries(PRICE_MODES).map(([k, m]) => `<button class="${k === mode ? 'on' : ''}" data-act="price:${p.id}:${k}">${m.name} pris</button>`).join('')}</div>`,
      });
    }).join('') + this.section('sec-returns', '↩️ Returneringer', this.returnsCard());
  }

  r_buy() {
    const s = this.s, locked = PRODUCTS.find((p) => p.lvl > s.level);
    return `<p class="tip">Lager: <b>${stockTotal(s)}/${capacity(s)}</b> · Varerne kommer i kasser til varemodtagelsen</p>` + PRODUCTS.filter((p) => p.lvl <= s.level).map((p) => {
      const box = p.cost * p.box;
      return this.fold(`buy-${p.id}`, {
        av: `<div class="av" style="background:${p.color}33">${p.icon}</div>`,
        title: `${p.name}${s.everStocked[p.id] ? '' : ' <span class="tag gold">NY</span>'}${this.trendTag(p.id)}`,
        sub: `Køb ${kr(p.cost)} · Salg ${kr(p.price)} · Har ${s.stock[p.id] || 0}`,
        action: `<button class="btn" data-act="buy:${p.id}:1" ${s.money < box ? 'disabled' : ''}>📦 ${p.box}<small>${kr(box)}</small></button>`,
        body: `<small>Popularitet ${'★'.repeat(Math.round(p.pop * 3))}${'☆'.repeat(Math.max(0, 5 - Math.round(p.pop * 3)))} · ↩️ ca. ${Math.round(returnRate(s, p) * 100)} % · <span class="tag" style="background:${TIER_COLORS[p.tier]}">${p.tier}</span></small>
          <div class="fact"><button class="btn" data-act="buy:${p.id}:3" ${s.money < box * 3 ? 'disabled' : ''}>Køb 3 kasser<small>${kr(box * 3)}</small></button></div>`,
      });
    }).join('') + (locked ? `<div class="locked">🔒 Næste: ${locked.icon} ${locked.name} · Level ${locked.lvl}</div>` : '');
  }

  r_shop() {
    const s = this.s;
    const camp = activeCampaign(s);
    const camps = CAMPAIGNS.filter((c) => c.lvl <= s.level).map((c) => {
      const cd = (s.campCd[c.id] || 0) - s.time, on = camp?.id === c.id;
      const btn = on ? `<span class="tag hot">${gameTime(camp.until - s.time)}</span>`
        : cd > 0 ? `<span class="tag">Klar om ${gameTime(cd)}</span>`
        : `<button class="btn" data-act="camp:${c.id}" ${camp ? 'disabled' : ''}>Start</button>`;
      return this.fold(`camp-${c.id}`, { av: `<div class="av">${c.icon}</div>`, cls: on ? 'rare' : '', title: c.name, sub: `−${Math.round((1 - c.price) * 100)} % · ×${c.orders} ordrer · ${gameTime(campaignDur(s, c))}`, action: btn });
    }).join('');
    const items = SHOP.filter((i) => i.lvl <= s.level).map((i) => {
      const can = i.money ? s.money >= i.money : s.gems >= i.gems, active = s.boosts.find((b) => b.id === i.id);
      return this.fold(`shop-${i.id}`, { av: `<div class="av">${i.icon}</div>`, title: i.name, sub: active ? `<span class="eff">Aktiv · ${gameTime(active.until - s.time)}</span>` : i.desc,
        action: `<button class="btn ${i.gems ? 'gem' : ''}" data-act="shop:${i.id}" ${can ? '' : 'disabled'}>${i.money ? kr(i.money) : `❤️ ${i.gems}`}</button>` });
    }).join('');
    const nextC = CAMPAIGNS.find((c) => c.lvl > s.level), nextI = SHOP.find((i) => i.lvl > s.level);
    return this.section('sec-camp', '📣 Kampagner', `<p class="tip">Lavere priser, flere ordrer. Sørg for at lageret er fyldt.</p>${camps}${nextC ? `<div class="locked">🔒 Næste: ${nextC.icon} ${nextC.name} · Level ${nextC.lvl}</div>` : ''}`, true)
      + this.section('sec-shop', `🛍️ Annoncer & boosts · ❤️ ${s.gems}`, `${items}${nextI ? `<div class="locked">🔒 Næste: ${nextI.icon} ${nextI.name} · Level ${nextI.lvl}</div>` : ''}`, true);
  }

  r_upgrades() {
    const s = this.s;
    const card = ([type, F]) => {
      const n = ownedFurniture(s, type), cost = furnCost(F, n), lvl = furnLvl(F, n);
      const eff = F.desc ? `${F.desc}${F.joy ? ` · 😊 +${F.joy}` : ''}` : F.joy ? `😊 +${F.joy} glæde${F.pause ? ' · bruges i pauserne' : F.anywhere ? '' : ' tæt på'}` : '';
      return this.fold(`furn-${type}`, {
        av: `<div class="av">${F.icon}</div>`,
        title: F.name,
        sub: `Du har ${n}${s.kit[type] ? ` · ${s.kit[type]} venter` : ''}`,
        action: `<button class="btn" data-act="furn:${type}" ${s.money < cost ? 'disabled' : ''}>Køb<small>${kr(cost)}</small></button>`,
        body: eff ? `<small class="eff">${eff}</small>` : '',
      });
    };
    const all = Object.entries(FURNITURE), open = all.filter(([type, F]) => s.level >= furnLvl(F, ownedFurniture(s, type)));
    const nextOf = (cat) => all.filter(([type, F]) => F.cat === cat && s.level < furnLvl(F, ownedFurniture(s, type))).map(([type, F]) => ({ F, lvl: furnLvl(F, ownedFurniture(s, type)) })).sort((a, b) => a.lvl - b.lvl)[0];
    const furn = FURN_GROUPS.map(([cat, title]) => {
      const nx = nextOf(cat);
      return this.section(`sec-${cat}`, title, open.filter(([, F]) => F.cat === cat).map(card).join('') + (nx ? `<div class="locked">🔒 Næste: ${nx.F.icon} ${nx.F.name} · Level ${nx.lvl}</div>` : ''), cat === 'work');
    }).join('');
    const upgrades = Object.entries(UPGRADES).map(([k, U]) => {
      const cur = U.levels[s.upg[k]], next = U.levels[s.upg[k] + 1];
      const dots = U.levels.map((_, i) => `<i class="${i <= s.upg[k] ? 'on' : ''}"></i>`).join('');
      return this.fold(`upg-${k}`, {
        av: `<div class="av">${U.icon}</div>`,
        title: U.name,
        sub: `<span class="dots">${dots}</span>`,
        action: !next ? '<span class="tag gold">MAX</span>' : s.level < next.lvl ? `<span class="tag">🔒 Lvl ${next.lvl}</span>` : `<button class="btn" data-act="upg:${k}" ${s.money < next.cost ? 'disabled' : ''}>⬆<small>${kr(next.cost)}</small></button>`,
        body: `<small>Nu: ${cur.name} · ${U.fmt(cur.val)}</small>${next ? `<small class="eff">Næste: ${next.name} · ${U.fmt(next.val)}</small>` : ''}`,
      });
    }).join('');
    return `<div class="tools"><button data-b="edit">🛠️<small>Flyt</small></button><button data-b="walls">🧱<small>Vægge</small></button><button data-b="paintRooms">🎨<small>Farver</small></button><button data-b="expand">📐<small>Udvid</small></button></div>
      <p class="tip">Lageret er ${fmt((90 + s.tiles.length) * TILE * TILE)} m² · Nye felter ${kr(TILE_COST)} pr. stk. + ${kr(TILE_RENT)}/dag</p>
      ${furn}${this.section('sec-upg', '⬆️ Opgraderinger', upgrades)}`;
  }

  // How close the shop is to bankruptcy.
  r_risk() {
    const s = this.s, n = s.redDays;
    // Forecast: the balance once wages, rent and loan installments are paid tonight.
    const tonight = s.money - s.employees.reduce((a, e) => a + salaryOf(e), 0) - rentOf(s) - taxDue(s) - s.loans.reduce((a, l) => { const r = loanRate(l); return a + r.principal + r.interest; }, 0);
    const dots = Array.from({ length: BANKRUPT_DAYS }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    return `<div class="risk ${n >= 4 ? 'hot' : ''}">
      <div><b>${n ? `⚠️ I minus ${n} ${n === 1 ? 'dag' : 'dage'} i træk` : '✅ Saldoen er i plus'}</b><div class="rdots">${dots}</div></div>
      <small>Saldo i aften (efter løn, husleje og afdrag): <b class="${tonight < 0 ? 'warn' : ''}">${kr(tonight)}</b>${n ? ` · Konkurs efter ${BANKRUPT_DAYS} dage i træk i minus` : ''}</small></div>`;
  }

  r_loans() {
    const s = this.s;
    return `<p class="tip">Betales tilbage med renter hver aften. Højst ét af hver slags.</p>` +
      LOANS.map((L) => {
        const l = s.loans.find((x) => x.id === L.id);
        if (l) {
          const r = loanRate(l);
          return `<div class="card"><div class="av">${l.icon}</div>
            <div class="info"><b>${l.name} · ${kr(l.amount)} <span class="tag gold">AKTIVT</span></b><small>Restgæld ${kr(l.principal + l.interest)} · ${l.left} ${l.left === 1 ? 'dag' : 'dage'} tilbage</small>
              <small class="eff">Afdrag ${kr(r.principal + r.interest)}/dag (heraf renter ${kr(r.interest)})</small></div>
            <div class="btns"><button class="btn ghost" data-act="repay:${l.id}" ${s.money < loanPayoff(l) ? 'disabled' : ''}>Indfri<small>${kr(loanPayoff(l))}</small></button></div></div>`;
        }
        const interest = Math.round(L.amount * L.rate), per = Math.round((L.amount + interest) / L.days), why = loanBlock(s, L);
        const locked = why?.startsWith('🔒'), bad = why && !locked;
        const req = L.maxBad ? `højst ${L.maxBad} ${L.maxBad === 1 ? 'dag' : 'dage'} i minus den seneste uge` : 'ingen dage i minus den seneste uge';
        return `<div class="card"><div class="av">${L.icon}</div>
          <div class="info"><b>${L.name} · ${kr(L.amount)}</b><small>${Math.round(L.rate * 100)} % rente (${kr(interest)}) · ${L.days} dage · ca. ${kr(per)}/dag</small>
            <small class="${bad ? 'warn' : 'eff'}">Krav: ${req}${bad ? ` – du har ${why.match(/\d+/)[0]}` : ''}</small></div>
          <div class="btns">${locked ? `<span class="tag">${why}</span>` : `<button class="btn" data-act="loan:${L.id}" ${why ? 'disabled' : ''}>Lån</button>`}</div></div>`;
      }).join('');
  }

  r_stats() {
    const s = this.s, fx = effects(s), h = s.stats.history, td = s.stats.today, st = s.stats;
    const wages = s.employees.reduce((a, e) => a + salaryOf(e), 0);
    const res = (n) => `<b class="${n < 0 ? 'warn' : 'pos'}">${n >= 0 ? '+' : ''}${kr(n)}</b>`;
    const totalExp = Object.values(st.exp).reduce((a, b) => a + b, 0);
    // Bills that are paid when the day ends: wages, rent and the loan installment.
    const tonight = [['👥 Løn', wages], ['🏠 Husleje', rentOf(s)], ['🧾 Moms', taxDue(s)], ...s.loans.map((l) => { const r = loanRate(l); return [`${l.icon} ${l.name} (afdrag ${kr(r.principal)} + renter ${kr(r.interest)})`, r.principal + r.interest]; })].filter(([, n]) => n);
    const pending = tonight.reduce((a, [, n]) => a + n, 0), dayCost = td.costs + pending;
    const lines = Object.entries(EXPENSES).filter(([k]) => td.exp[k] || st.exp[k])
      .map(([k, name]) => `<tr><td>${name}</td><td>${td.exp[k] ? kr(td.exp[k]) : ''}</td><td>${kr(st.exp[k] || 0)}</td></tr>`).join('');
    const max = Math.max(1, ...h.map((d) => Math.max(d.revenue, d.costs)));
    const bars = h.length
      ? `<div class="bars">${h.map((d) => `<div class="bar"><small>${fmt(d.revenue - d.costs)}</small><div class="pair"><i style="height:${(d.revenue / max) * 100}%"></i><i class="cost" style="height:${(d.costs / max) * 100}%"></i></div><span>D${d.day}</span></div>`).join('')}</div>
         <p class="legend"><i></i>Indtægter <i class="cost"></i>Udgifter · tal = resultat</p>`
      : '<p class="empty">Historik vises efter første dag.</p>';
    const ledger = `<table class="ledger">
        <tr><th></th><th>I dag</th><th>I alt</th></tr>
        <tr class="inc"><td>🛍️ Salg (${td.orders} / ${fmt(st.shipped)} ordrer)</td><td>${kr(td.revenue)}</td><td>${kr(st.revenue)}</td></tr>
        ${lines}
        ${tonight.length ? `<tr class="sub"><td colspan="3">⏳ Trækkes når dagen slutter</td></tr>${tonight.map(([n, v]) => `<tr><td>${n}</td><td>${kr(v)}</td><td></td></tr>`).join('')}` : ''}
        <tr class="sum"><td>Resultat</td><td>${res(td.revenue - dayCost)}</td><td>${res(st.revenue - totalExp)}</td></tr>
      </table>`;
    const fixed = `<div class="breakdown">
        <small>🏠 Husleje: <b>${kr(rentOf(s))}/dag</b> – stiger når du bygger reoler, pakkeborde og skriveborde</small>
        <small>👥 Løn: <b>${kr(wages)}/dag</b> (${s.employees.length} ansatte)</small>
        <small>🎁 Emballage: <b>${kr(PACKAGING)}</b> og 🚚 fragt: <b>${kr(FREIGHT)}</b> pr. pakke</small>
        ${s.loans.map((l) => { const r = loanRate(l); return `<small>${l.icon} ${l.name}: <b>${kr(r.principal + r.interest)}/dag</b> (heraf renter ${kr(r.interest)})</small>`; }).join('')}
      </div>`;
    const figures = `<div class="grid3">
        <div class="stat"><small>Besøgende/min</small><b>${fx.traffic.toFixed(0)}</b></div>
        <div class="stat"><small>Konvertering</small><b>${(fx.conv * 100).toFixed(1)} %</b></div>
        <div class="stat"><small>Tabte salg</small><b>${fmt(st.lost)}</b></div>
      </div>`;
    return `<div class="grid3">
        <div class="stat"><small>Indtægter i dag</small><b class="pos">${kr(td.revenue)}</b></div>
        <div class="stat"><small>Udgifter i dag</small><b>${kr(dayCost)}</b><small>heraf ${kr(pending)} i aften</small></div>
        <div class="stat"><small>Resultat i dag</small>${res(td.revenue - dayCost)}</div>
      </div>
      ${this.r_risk()}
      ${this.section('sec-ledger', '🧾 Regnskab', ledger, true)}
      ${this.section('sec-loans', `🏦 Lån${s.loans.length ? ` (${s.loans.length})` : ''}`, this.r_loans())}
      ${this.section('sec-hist', '📈 Resultat pr. dag', bars)}
      ${this.section('sec-fixed', '🏠 Faste udgifter', fixed)}
      ${this.section('sec-figs', '🔢 Nøgletal', figures)}
      ${this.section('sec-acct', '⚙️ Konto', `${cloud.user ? `<p class="tip acct">👤 Logget ind som <b>${esc(cloud.user)}</b> · spillet gemmes i skyen</p><button class="btn ghost wide" data-act="logout">Log ud</button>` : ''}
        <button class="btn ghost wide" data-act="reset">${this.confirmReset ? 'Tryk igen for at slette alt' : 'Start forfra'}</button>`)}`;
  }
}

const DUTY = { work: '🟢 På arbejde', pause: '☕ Pause', off: '🏠 Fri' };
const DUTY_SHORT = { work: '🟢 Inde', pause: '☕ Pause', off: '🏠 Fri' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function rewardText(r) {
  return [r.money && `💰 ${fmt(r.money)}`, r.gems && `❤️ ${r.gems}`, r.xp && `⭐ ${r.xp} XP`].filter(Boolean).join(' ');
}
const fmtGoal = (n) => (n >= 10000 ? fmt(n) : n);
