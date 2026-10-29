import {
  PRODUCTS, productById, TIER_COLORS, PRICE_MODES, ROLES, EMP_TIERS, SOME_BONUS, SOME_VIRAL, ECOM_BONUS,
  UPGRADES, SHOP, CAMPAIGNS, QUESTS, DAY_LENGTH, EXPENSES, LOANS, BANKRUPT_DAYS, TILE_COST, TILE_RENT, FURNITURE, PACKAGING, FREIGHT, rentOf, xpFor, MAX_LEVEL, unlocksAt,
} from './data.js';
import {
  bus, fmt, kr, capacity, stockTotal, available, upgVal, unitPrice, salaryOf, hire, fire, empUpgradeCost,
  spend, addMoney, addXP, resetState, activeCampaign, ownedFurniture,
} from './state.js';
import {
  effects, buyStock, buyFurniture, buyShop, advisor, dayReport, startCampaign, campaignDur, supportRate, takeLoan, repayLoan, loanRate, loanPayoff, dayResult, loanBlock, happiness, happyEff,
} from './sim.js';
import { TILE } from './world.js';
import { cloud, logout } from './cloud.js';

const TABS = [
  ['home', '🏠', 'Hjem'], ['staff', '👥', 'Ansatte'], ['orders', '🧾', 'Ordrer'], ['products', '👕', 'Produkter'],
  ['shop', '🛍️', 'Butik'], ['upgrades', '⬆️', 'Upgrades'], ['stats', '📊', 'Økonomi'],
];
const TITLES = { staff: 'Ansatte', orders: 'Ordrer', products: 'Produkter', shop: 'Butik & kampagner', upgrades: 'Upgrades', stats: 'Økonomi' };
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
    this.build();
    this.bind();
  }

  build() {
    const app = $('#app');
    app.insertAdjacentHTML('beforeend', `
      <div id="hud">
        <div class="top">
          <div class="chip money"><span class="ci">💰</span><div class="ct"><b id="h-money"></b><small>Din balance</small></div></div>
          <div class="chip level"><div class="lvl" id="h-lvl"></div><div class="ct"><div class="xpbar"><i id="h-xp"></i></div><small><b id="h-lvtxt"></b><br><span id="h-xptxt"></span></small></div></div>
          <div class="chip"><span class="ci">❤️</span><div class="ct"><b id="h-gems"></b><small>Hjerter</small></div></div>
          <div class="chip"><span class="ci">👥</span><div class="ct"><b id="h-staff"></b><small>Ansatte</small></div></div>
        </div>
        <div class="panel">
          <div class="dayrow"><b id="h-day"></b><div class="daybar"><i id="h-daybar"></i></div><small id="h-daytxt"></small><button id="questbtn" data-act="qmin:0" title="Vis mål"></button><button id="tipsbtn" data-act="tips:1" title="Vis tips">💡</button></div>
          <button id="quest" class="quest"></button>
          <button id="advisor" class="advisor"></button>
        </div>
        <div id="boosts"></div>
      </div>
      <div id="joy"><div class="knob"></div></div>
      <div id="sheet" class="sheet"><div class="sheet-head"><h2 id="sheet-title"></h2><button class="x" data-act="tab:home">✕</button></div><div class="sheet-body" id="sheet-body"></div></div>
      <nav id="nav">${TABS.map(([id, ic, name]) => `<button data-act="tab:${id}" data-tab="${id}"><span>${ic}</span><small>${name}</small></button>`).join('')}</nav>
      <div id="toasts"></div>
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
    bus.on('toast', (t, cls, ms) => this.toast(t, cls, ms));
    bus.on('bankrupt', () => this.bankrupt());
    bus.on('shelfMenu', (f) => this.shelfMenu(f));
    if (s.bankrupt) this.bankrupt();
    bus.on('levelup', (l) => this.levelUp(l));
    bus.on('dayEnd', (r) => this.toast(dayReport(r), 'day', 5000));
    bus.on('ship', (rev, pos) => { this.w.popup(`+${fmt(rev)} kr`, pos, 'money'); bus.emit('sfx', 'coin'); });
    bus.on('built', (p) => { this.toast(`${p.icon} ${p.name} ${p.moved ? 'flyttet' : 'placeret'}!`, 'good'); bus.emit('sfx', p.moved ? 'pop' : 'level'); });
    bus.on('hired', (e) => this.toast(`👋 ${e.name} er startet som ${ROLES[e.role].name}!`, 'good'));
  }

  act(a) {
    const s = this.s;
    const [cmd, x, y] = a.split(':');
    bus.emit('sfx', 'click');
    if (cmd === 'tab') { this.open(x); return; }
    if (cmd === 'buy') { if (!buyStock(s, x, +y)) this.toast('Ikke nok penge 💸', 'bad'); }
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
    if (cmd === 'qmin') s.hideQuest = x === '1';
    if (cmd === 'tips') s.hideTips = x === '0';
    if (cmd === 'shelfOnly') {
      const f = s.furniture.find((o) => o.id === +x);
      if (f) { f.only = y === 'all' ? null : y; this.w.rebuild(); this.toast(f.only ? `🏷️ Reolen er nu til ${productById[y].icon} ${productById[y].name}` : '🏷️ Reolen tager alle varer', 'good'); }
      $('#modal').classList.remove('show');
      return;
    }
    if (cmd === 'expand') { this.open('home'); bus.emit('expandStart'); return; }
    if (cmd === 'advisor' && x) this.open(x);
    if (cmd === 'closeModal') $('#modal').classList.remove('show');
    if (cmd === 'loan') { if (takeLoan(s, x)) { this.toast(`🏦 ${kr(s.loans.at(-1).amount)} er sat ind på kontoen`, 'good'); bus.emit('sfx', 'coin'); } }
    if (cmd === 'repay') { if (!repayLoan(s, x)) this.toast('Ikke nok penge til at indfri lånet 💸', 'bad'); else this.toast('✅ Lånet er indfriet', 'good'); }
    if (cmd === 'restart') resetState();
    if (cmd === 'logout') { logout(); return; }
    if (cmd === 'reset') { if (this.confirmReset) resetState(); else this.confirmReset = true; }
    this.renderSheet(true);
  }

  open(tab) {
    if (tab === 'buy') { tab = 'products'; this.prodTab = 'buy'; } else if (tab === 'products') this.prodTab = 'mine';
    this.tab = tab;
    this.confirmFire = null;
    this.confirmReset = false;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#sheet').classList.toggle('open', tab !== 'home');
    if (tab !== 'home') { $('#sheet-title').textContent = TITLES[tab]; $('#sheet-body').scrollTop = 0; this.renderSheet(true); }
  }

  get sheetOpen() { return this.tab !== 'home'; }

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
  toast(text, cls = '', ms = 3200) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + cls;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
  }

  // Choose which product a shelf is for.
  shelfMenu(f) {
    const s = this.s, opts = [['all', '📦', 'Alle varer'], ...PRODUCTS.filter((p) => p.lvl <= s.level).map((p) => [p.id, p.icon, p.name])];
    const on = Object.entries(f.stock || {}).filter(([, n]) => n).map(([id, n]) => `${productById[id].icon} ${n}`).join(' · ');
    $('#modal').innerHTML = `<div class="card-modal shelfmenu">
      <h2>🏷️ Reolens varer</h2><p>Vælg hvad der skal stå på denne reol. Der står nu: ${on || 'ingenting'}</p>
      <div class="opts">${opts.map(([id, ic, name]) => `<button class="chipbtn ${(f.only || 'all') === id ? 'on' : ''}" data-act="shelfOnly:${f.id}:${id}">${ic} ${name}</button>`).join('')}</div>
      <button class="btn ghost" data-act="closeModal">Luk</button></div>`;
    $('#modal').classList.add('show');
  }

  bankrupt() {
    const s = this.s;
    const st = s.stats, days = s.day - 1 + (s.bankruptWhy === 'stuck' ? 1 : 0);
    const exp = Object.values(st.exp).reduce((a, b) => a + b, 0), result = st.revenue - exp;
    const best = st.history.reduce((a, d) => (!a || d.revenue - d.costs > a.revenue - a.costs ? d : a), null);
    const top = Object.entries(s.sold || {}).sort((a, b) => b[1] - a[1])[0];
    const why = s.bankruptWhy === 'stuck'
      ? 'Kassen er tom, lageret er tomt, og banken vil ikke låne dig flere penge.'
      : `Webshoppen havde underskud ${BANKRUPT_DAYS} dage i træk, og banken har lukket butikken.`;
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
    $('#h-money').textContent = fmt(this.shownMoney);
    $('#h-money').parentElement.classList.toggle('neg', s.money < 0);
    this.tick += dt;
    if (this.tick < 0.25) return;
    this.tick = 0;

    $('#h-lvl').textContent = s.level;
    $('#h-xp').style.width = s.level >= MAX_LEVEL ? '100%' : `${(s.xp / xpFor(s.level)) * 100}%`;
    $('#h-lvtxt').textContent = `Level ${s.level}`;
    $('#h-xptxt').textContent = s.level >= MAX_LEVEL ? 'MAX' : `${fmt(s.xp)}/${fmt(xpFor(s.level))} XP`;
    $('#h-gems').textContent = s.gems;
    $('#h-staff').textContent = s.employees.length;
    const dh = `Dag ${s.day}${s.redDays ? ` <span class="red">⚠️ ${s.redDays}/${BANKRUPT_DAYS}</span>` : ''}`;
    if (dh !== this.dayHtml) { this.dayHtml = dh; $('#h-day').innerHTML = dh; }
    $('#h-daybar').style.width = `${(s.dayTime / DAY_LENGTH) * 100}%`;
    const left = Math.max(0, Math.ceil(DAY_LENGTH - s.dayTime));
    $('#h-daytxt').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

    const qs = this.quest();
    const qEl = $('#quest');
    const qh = (qs
      ? `<span class="qi">🎯</span><b class="qt">${qs.q.text}</b>
         ${qs.done ? `<span class="btn claim">Hent ${rewardText(qs.q.reward)}</span>` : `<small>${fmtGoal(qs.cur)}/${fmtGoal(qs.target)}</small>${qs.q.tab ? '<span class="chev">›</span>' : ''}`}`
      : `<span class="qi">🏆</span><b class="qt">Alle mål klaret – flere kommer snart!</b>`) + '<span class="hide" data-act="qmin:1" title="Minimér">–</span>';
    if (qh !== this.questHtml) { this.questHtml = qh; qEl.innerHTML = qh; }
    qEl.classList.toggle('done', !!qs?.done);
    // Minimised: just a small 🎯 chip in the day row (green when there's a reward to collect).
    qEl.hidden = s.hideQuest;
    const qb = $('#questbtn');
    qb.hidden = !s.hideQuest;
    const qbt = qs ? (qs.done ? '🎯 Hent!' : `🎯 ${fmtGoal(qs.cur)}/${fmtGoal(qs.target)}`) : '🏆';
    if (qb.textContent !== qbt) qb.textContent = qbt;
    qb.classList.toggle('done', !!qs?.done);
    qEl.dataset.act = qs?.done ? 'claim' : `advisor:${qs?.q.tab || ''}`;

    const adv = advisor(s);
    const advEl = $('#advisor');
    const ah = `<span class="qi">💡</span><span class="qt">${adv.text}</span>${adv.tab ? '<span class="chev">›</span>' : ''}<span class="hide" data-act="tips:0" title="Skjul tips">✕</span>`;
    if (ah !== this.advHtml) { this.advHtml = ah; advEl.innerHTML = ah; }
    advEl.dataset.act = `advisor:${adv.tab || ''}`;
    advEl.hidden = s.hideTips;
    $('#tipsbtn').hidden = !s.hideTips;

    const camp = activeCampaign(s);
    $('#boosts').innerHTML = (camp ? `<div class="boost camp"><span>${camp.icon}</span>${camp.name} · ${Math.ceil(camp.until - s.time)}s<i style="width:${((camp.until - s.time) / camp.total) * 100}%"></i></div>` : '') + s.boosts.map((b) => {
      const left = Math.max(0, b.until - s.time);
      return `<div class="boost"><span>${b.icon}</span>${b.name} · ${Math.ceil(left)}s<i style="width:${(left / b.total) * 100}%"></i></div>`;
    }).join('') + (s.trend && s.trend.until > s.time ? `<div class="boost trend"><span>🔥</span>${productById[s.trend.id].name} trender · ${Math.ceil(s.trend.until - s.time)}s</div>` : '');

    this.renderSheet();
  }

  renderSheet(force) {
    if (!this.sheetOpen) return;
    const html = this['r_' + this.tab]();
    if (force || html !== this.lastSheet) { this.lastSheet = html; $('#sheet-body').innerHTML = html; }
  }

  // ---------- tabs ----------
  r_staff() {
    const s = this.s;
    const team = s.employees.map((e) => {
      const R = ROLES[e.role], up = empUpgradeCost(e);
      return `<div class="card">
        <div class="av" style="background:${R.color}">${R.icon}</div>
        <div class="info"><b>${e.name} <span class="tag">${EMP_TIERS[e.tier].name}</span></b>
          <small>${R.name} · Løn ${kr(salaryOf(e))}/dag</small>
          <small class="eff">${this.effectText(e)}</small>
          ${e.special ? `<small class="special">✨ ${e.specialDesc}</small>` : ''}
          ${R.desk && e.desk == null ? '<small class="warn">⚠️ Mangler skrivebord</small>' : ''}
          ${this.happyBar(e)}
        </div>
        <div class="btns">
          ${up != null ? `<button class="btn" data-act="upEmp:${e.id}" ${s.money < up ? 'disabled' : ''}>⬆ ${EMP_TIERS[e.tier + 1].name}<small>${kr(up)}</small></button>` : '<span class="tag gold">MAX</span>'}
          <button class="btn ghost" data-act="fire:${e.id}">${this.confirmFire === e.id ? 'Sikker?' : 'Afskedig'}</button>
        </div></div>`;
    }).join('') || '<p class="empty">Du laver alt selv lige nu. Ansæt dit første teammedlem herunder!</p>';
    const cands = s.candidates.map((c) => {
      const R = ROLES[c.role];
      return `<div class="card ${c.special ? 'rare' : ''}">
        <div class="av" style="background:${R.color}">${R.icon}</div>
        <div class="info"><b>${c.name} ${c.special ? '<span class="tag gold">SJÆLDEN</span>' : '<span class="tag">Junior</span>'}</b>
          <small>${R.name}</small><small class="eff">${R.desc}</small>
          ${c.special ? `<small class="special">✨ ${c.specialDesc}</small>` : ''}
          <small>Løn ${kr(Math.round(R.salary * (c.special ? 1.3 : 1)))}/dag</small></div>
        <div class="btns"><button class="btn" data-act="hire:${c.cid}" ${s.money < c.cost ? 'disabled' : ''}>Ansæt<small>${kr(c.cost)}</small></button></div></div>`;
    }).join('');
    const locked = Object.values(ROLES).filter((r) => r.lvl > s.level).map((r) => `<div class="locked">🔒 ${r.icon} ${r.name} · Level ${r.lvl}</div>`).join('');
    const hireTab = this.staffTab === 'hire';
    const tabs = `<div class="seg subtabs"><button class="${hireTab ? '' : 'on'}" data-act="stab:team">👥 Personale (${s.employees.length})</button><button class="${hireTab ? 'on' : ''}" data-act="stab:hire">🤝 Ansæt (${s.candidates.length})</button></div>`;
    return tabs + (hireTab
      ? `<p class="tip">Nye kandidater hver dag.</p>${cands || '<p class="empty">Ingen kandidater endnu – nå level 2 for at kunne ansætte.</p>'}${locked}`
      : `<p class="tip">😊 <b>Glæde giver tempo:</b> en medarbejder på 0 arbejder i 75 % tempo, på 50 i 100 % og på 100 i 125 %. Pynt tæt på deres arbejdsplads, kolleger i samme område og ro i økonomien gør dem gladere.</p>${team.replace('Ansæt dit første teammedlem herunder!', 'Ansæt dit første teammedlem under 🤝 Ansæt.')}`);
  }

  // Satisfaction bar going from red (unhappy) to green (happy), with the reasons underneath.
  happyBar(e) {
    const { v, why, tips } = happiness(this.s, e), face = v >= 70 ? '😄' : v >= 45 ? '🙂' : v >= 25 ? '😐' : '😟';
    return `<div class="happy"><span>${face}</span><div class="hbar"><i style="width:${v}%;background:hsl(${Math.round(v * 1.2)},70%,50%)"></i></div><b>${v}</b></div>
      <small class="hwhy">⚡ Arbejdstempo <b>${Math.round(happyEff(v) * 100)} %</b>${why.length ? ` · ${why.join(' · ')}` : ''}</small>
      ${tips.length ? `<div class="htips">${tips.slice(0, 3).map((t) => `<small>💭 ${t}</small>`).join('')}</div>` : ''}`;
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
      return `<div class="row"><span class="ic">${p.icon}</span><div class="info"><b>#${o.id} ${p.name}</b><small class="${wait > 90 ? 'warn' : ''}">Venter ${wait} sek</small></div>
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
      <p class="tip">Hurtig levering gør kunderne glade – ordrer der venter over 90 sek. sænker tilfredsheden og dermed trafikken.</p>
      <h3>Ordrekø (${s.orders.length})</h3>${rows}`;
  }

  r_products() {
    const s = this.s, buy = this.prodTab === 'buy';
    const tabs = `<div class="seg subtabs"><button class="${buy ? '' : 'on'}" data-act="ptab:mine">👕 Mine produkter</button><button class="${buy ? 'on' : ''}" data-act="ptab:buy">🛒 Indkøb</button></div>`;
    return tabs + (buy ? this.r_buy() : this.r_mine());
  }

  // Products the shop sells or has sold.
  r_mine() {
    const s = this.s;
    const transit = (id) => s.deliveries.filter((d) => d.productId === id).reduce((a, d) => a + d.qty, 0) + s.boxes.filter((b) => b.productId === id).reduce((a, b) => a + b.qty, 0);
    const mine = PRODUCTS.filter((p) => s.everStocked[p.id] || transit(p.id));
    if (!mine.length) return '<p class="empty">Du har ingen varer i shoppen endnu. Køb dem hjem under 🛒 Indkøb.</p>';
    return `<p class="tip">Lager: <b>${stockTotal(s)}/${capacity(s)}</b> · Varer der er bestilt men ikke plukket, står stadig på reolen.</p>` + mine.map((p) => {
      const price = unitPrice(s, p), mode = s.priceMode[p.id] || 'normal';
      const stock = s.stock[p.id] || 0, tr = transit(p.id), free = Math.max(0, available(s, p.id));
      const trend = s.trend?.id === p.id && s.trend.until > s.time;
      return `<div class="card prod">
        <div class="av big" style="background:${p.color}33">${p.icon}</div>
        <div class="info">
          <b>${p.name} <span class="tag" style="background:${TIER_COLORS[p.tier]}">${p.tier}</span>${trend ? ' <span class="tag hot">🔥 Trend</span>' : ''}${stock ? '' : ' <span class="tag hot">Udsolgt</span>'}</b>
          <small>På reolen: <b class="${free ? '' : 'warn'}">${stock}</b>${stock !== free ? ` (${stock - free} bestilt)` : ''}${tr ? ` · På vej: ${tr}` : ''} · Solgt: ${s.sold[p.id] || 0}</small>
          <small>Salgspris ${kr(price)} · Margin <b>${kr(price - p.cost)}</b></small>
          <div class="seg">${Object.entries(PRICE_MODES).map(([k, m]) => `<button class="${k === mode ? 'on' : ''}" data-act="price:${p.id}:${k}">${m.name} pris</button>`).join('')}</div>
        </div></div>`;
    }).join('');
  }

  r_buy() {
    const s = this.s;
    return `<p class="tip">Varerne kommer i kasser til varemodtagelsen – bær dem hen på reolen. Lager: <b>${stockTotal(s)}/${capacity(s)}</b></p>` + PRODUCTS.map((p) => {
      if (p.lvl > s.level) return `<div class="locked">🔒 ${p.icon} ${p.name} <span class="tag" style="background:${TIER_COLORS[p.tier]}">${p.tier}</span> · Level ${p.lvl}</div>`;
      const box = p.cost * p.box;
      return `<div class="card prod">
        <div class="av big" style="background:${p.color}33">${p.icon}</div>
        <div class="info">
          <b>${p.name} <span class="tag" style="background:${TIER_COLORS[p.tier]}">${p.tier}</span>${s.everStocked[p.id] ? '' : ' <span class="tag gold">NY</span>'}</b>
          <small>Indkøb ${kr(p.cost)} · Salg ${kr(p.price)} · På reolen: ${s.stock[p.id] || 0}</small>
          <small>Popularitet ${'★'.repeat(Math.round(p.pop * 3))}${'☆'.repeat(Math.max(0, 5 - Math.round(p.pop * 3)))}</small>
          <div class="buyrow">
            <button class="btn" data-act="buy:${p.id}:1" ${s.money < box ? 'disabled' : ''}>Køb 1 kasse (${p.box})<small>${kr(box)}</small></button>
            <button class="btn" data-act="buy:${p.id}:3" ${s.money < box * 3 ? 'disabled' : ''}>Køb 3 kasser<small>${kr(box * 3)}</small></button>
          </div>
        </div></div>`;
    }).join('');
  }

  r_shop() {
    const s = this.s;
    const camp = activeCampaign(s);
    const camps = CAMPAIGNS.map((c) => {
      if (c.lvl > s.level) return `<div class="locked">🔒 ${c.icon} ${c.name} · Level ${c.lvl}</div>`;
      const cd = Math.ceil((s.campCd[c.id] || 0) - s.time), on = camp?.id === c.id;
      const btn = on ? `<span class="tag hot">Kører · ${Math.ceil(camp.until - s.time)}s</span>`
        : cd > 0 ? `<span class="tag">Klar om ${cd}s</span>`
        : `<button class="btn" data-act="camp:${c.id}" ${camp ? 'disabled' : ''}>Start</button>`;
      return `<div class="card ${on ? 'rare' : ''}"><div class="av">${c.icon}</div><div class="info"><b>${c.name}</b>
        <small>Priser <b>−${Math.round((1 - c.price) * 100)} %</b> · <b>×${c.orders}</b> ordrer · ${campaignDur(s, c)} sek</small></div>
        <div class="btns">${btn}</div></div>`;
    }).join('');
    return `<h3>📣 Kampagner</h3>
      <p class="tip">Sæt priserne ned og få mange flere ordrer – men mindre fortjeneste pr. vare. Sørg for at lageret er fyldt og at I kan pakke hurtigt nok! Hver E-commerce Manager gør kampagner 25 % længere.</p>${camps}
      <h3>🛍️ Butik</h3>
      <p class="tip">Du har <b>❤️ ${s.gems}</b> – du får 3 ❤️ for hvert level og flere for mål.</p>` + SHOP.map((i) => {
      if (i.lvl > s.level) return `<div class="locked">🔒 ${i.icon} ${i.name} · Level ${i.lvl}</div>`;
      const can = i.money ? s.money >= i.money : s.gems >= i.gems;
      const active = s.boosts.find((b) => b.id === i.id);
      return `<div class="card"><div class="av">${i.icon}</div><div class="info"><b>${i.name}</b><small>${i.desc}</small>${active ? `<small class="eff">Aktiv · ${Math.ceil(active.until - s.time)}s tilbage</small>` : ''}</div>
        <div class="btns"><button class="btn ${i.gems ? 'gem' : ''}" data-act="shop:${i.id}" ${can ? '' : 'disabled'}>${i.money ? kr(i.money) : `❤️ ${i.gems}`}</button></div></div>`;
    }).join('');
  }

  r_upgrades() {
    const s = this.s;
    const card = ([type, F]) => {
      const n = ownedFurniture(s, type), max = F.cost.length, cost = F.cost[n], lvl = F.lvl[n];
      const eff = F.decor ? `<small class="eff">😊 +${F.joy} glæde for ansatte tæt på (ca. 7 m)</small>` : '';
      return `<div class="card"><div class="av">${F.icon}</div>
        <div class="info"><b>${F.name}</b><small>Du har ${n} af ${max}${s.kit[type] ? ` · ${s.kit[type]} venter på at blive placeret` : ''}</small>${eff}</div>
        <div class="btns">${n >= max ? '<span class="tag gold">MAX</span>'
          : s.level < lvl ? `<span class="tag">🔒 Lvl ${lvl}</span>`
          : `<button class="btn" data-act="furn:${type}" ${s.money < cost ? 'disabled' : ''}>Køb<small>${kr(cost)}</small></button>`}</div></div>`;
    };
    const all = Object.entries(FURNITURE);
    return `<h3>🛠️ Indretning</h3><p class="tip">Køb møbler og placér dem selv. Med 🛠️ Indret-knappen kan du flytte og dreje alt.</p>${all.filter(([, F]) => !F.decor).map(card).join('')}
      <div class="card"><div class="av">📐</div>
        <div class="info"><b>Mere plads</b><small>Lageret er ${fmt(90 + s.tiles.length)} felter · ${fmt((90 + s.tiles.length) * TILE * TILE)} m²</small>
          <small class="eff">${kr(TILE_COST)} pr. felt (${TILE}×${TILE} m) · husleje +${kr(TILE_RENT)}/dag pr. felt</small></div>
        <div class="btns"><button class="btn" data-act="expand">Udvid</button></div></div>
      <h3>🪴 Hygge & trivsel</h3><p class="tip">Glade medarbejdere arbejder hurtigere. Pynten virker på dem, der arbejder tæt på den – se under 👥 Ansatte, hvad hver enkelt savner.</p>${all.filter(([, F]) => F.decor).map(card).join('')}
      <h3>⬆️ Opgraderinger</h3>` +
      Object.entries(UPGRADES).map(([k, U]) => {
        const cur = U.levels[s.upg[k]], next = U.levels[s.upg[k] + 1];
        const dots = U.levels.map((_, i) => `<i class="${i <= s.upg[k] ? 'on' : ''}"></i>`).join('');
        return `<div class="card"><div class="av">${U.icon}</div>
          <div class="info"><b>${U.name}</b><div class="dots">${dots}</div>
            <small>Nu: ${cur.name} · ${U.fmt(cur.val)}</small>
            ${next ? `<small class="eff">Næste: ${next.name} · ${U.fmt(next.val)}</small>` : ''}</div>
          <div class="btns">${!next ? '<span class="tag gold">MAX</span>'
            : s.level < next.lvl ? `<span class="tag">🔒 Lvl ${next.lvl}</span>`
            : `<button class="btn" data-act="upg:${k}" ${s.money < next.cost ? 'disabled' : ''}>Opgrader<small>${kr(next.cost)}</small></button>`}</div></div>`;
      }).join('');
  }

  // How close the shop is to bankruptcy.
  r_risk() {
    const s = this.s, n = s.redDays;
    // Forecast: what the day will count as once wages, rent and interest are paid tonight.
    const today = dayResult(s.stats.today) - s.employees.reduce((a, e) => a + salaryOf(e), 0) - rentOf(s) - s.loans.reduce((a, l) => a + loanRate(l).interest, 0);
    const dots = Array.from({ length: BANKRUPT_DAYS }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    return `<div class="risk ${n >= 4 ? 'hot' : ''}">
      <div><b>${n ? `⚠️ Underskud ${n} ${n === 1 ? 'dag' : 'dage'} i træk` : '✅ Ingen underskudsdage'}</b><div class="rdots">${dots}</div></div>
      <small>Har du underskud (eller negativ saldo) ${BANKRUPT_DAYS} dage i træk, går du konkurs. Køb af møbler og upgrades tæller ikke som underskud.
      Forventet i dag (efter løn, husleje og renter): ${today >= 0 ? '+' : ''}${kr(today)}</small></div>`;
  }

  r_loans() {
    const s = this.s;
    return `<h3>🏦 Lån</h3><p class="tip">Lån penge til at vokse hurtigere. Lånene betales tilbage med renter hver aften. Du kan have flere lån, men kun ét af hver slags – og banken kigger på dine underskudsdage den seneste uge.</p>` +
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
        const req = L.maxBad ? `højst ${L.maxBad} underskudsdag${L.maxBad === 1 ? '' : 'e'} den seneste uge` : 'ingen underskudsdage den seneste uge';
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
    const tonight = [['👥 Løn', wages], ['🏠 Husleje', rentOf(s)], ...s.loans.map((l) => { const r = loanRate(l); return [`${l.icon} ${l.name} (afdrag ${kr(r.principal)} + renter ${kr(r.interest)})`, r.principal + r.interest]; })].filter(([, n]) => n);
    const pending = tonight.reduce((a, [, n]) => a + n, 0), dayCost = td.costs + pending;
    const lines = Object.entries(EXPENSES).filter(([k]) => td.exp[k] || st.exp[k])
      .map(([k, name]) => `<tr><td>${name}</td><td>${kr(td.exp[k] || 0)}</td><td>${kr(st.exp[k] || 0)}</td></tr>`).join('');
    const max = Math.max(1, ...h.map((d) => Math.max(d.revenue, d.costs)));
    const bars = h.length
      ? `<div class="bars">${h.map((d) => `<div class="bar"><small>${fmt(d.revenue - d.costs)}</small><div class="pair"><i style="height:${(d.revenue / max) * 100}%"></i><i class="cost" style="height:${(d.costs / max) * 100}%"></i></div><span>D${d.day}</span></div>`).join('')}</div>
         <p class="legend"><i></i>Indtægter <i class="cost"></i>Udgifter · tal = resultat</p>`
      : '<p class="empty">Historik vises efter første dag.</p>';
    return `<div class="grid3">
        <div class="stat"><small>Indtægter i dag</small><b class="pos">${kr(td.revenue)}</b></div>
        <div class="stat"><small>Udgifter i dag</small><b>${kr(dayCost)}</b><small>heraf ${kr(pending)} i aften</small></div>
        <div class="stat"><small>Resultat i dag</small>${res(td.revenue - dayCost)}</div>
      </div>
      <h3>Regnskab</h3>
      <table class="ledger">
        <tr><th></th><th>I dag</th><th>I alt</th></tr>
        <tr class="inc"><td>🛍️ Salg (${td.orders} / ${fmt(st.shipped)} ordrer)</td><td>${kr(td.revenue)}</td><td>${kr(st.revenue)}</td></tr>
        ${lines}
        ${tonight.length ? `<tr class="sub"><td colspan="3">⏳ Trækkes når dagen slutter</td></tr>${tonight.map(([n, v]) => `<tr><td>${n}</td><td>${kr(v)}</td><td></td></tr>`).join('')}` : ''}
        <tr class="sum"><td>Resultat</td><td>${res(td.revenue - dayCost)}</td><td>${res(st.revenue - totalExp)}</td></tr>
      </table>
      ${this.r_risk()}
      ${this.r_loans()}
      <h3>Faste udgifter</h3>
      <div class="breakdown">
        <small>🏠 Husleje: <b>${kr(rentOf(s))}/dag</b> – stiger når du bygger reoler, pakkeborde og skriveborde</small>
        <small>👥 Løn: <b>${kr(wages)}/dag</b> (${s.employees.length} ansatte)</small>
        <small>🎁 Emballage: <b>${kr(PACKAGING)}</b> og 🚚 fragt: <b>${kr(FREIGHT)}</b> pr. pakke</small>
        ${s.loans.map((l) => { const r = loanRate(l); return `<small>${l.icon} ${l.name}: <b>${kr(r.principal + r.interest)}/dag</b> (heraf renter ${kr(r.interest)})</small>`; }).join('')}
        <small>Husleje, løn og afdrag trækkes når dagen slutter.</small>
      </div>
      <h3>Resultat pr. dag</h3>${bars}
      <h3>Nøgletal</h3>
      <div class="grid3">
        <div class="stat"><small>Besøgende/min</small><b>${fx.traffic.toFixed(0)}</b></div>
        <div class="stat"><small>Konvertering</small><b>${(fx.conv * 100).toFixed(1)} %</b></div>
        <div class="stat"><small>Tabte salg</small><b>${fmt(st.lost)}</b></div>
      </div>
      ${cloud.user ? `<p class="tip acct">👤 Logget ind som <b>${esc(cloud.user)}</b> · spillet gemmes i skyen</p><button class="btn ghost wide" data-act="logout">Log ud</button>` : ''}
      <button class="btn ghost wide" data-act="reset">${this.confirmReset ? 'Tryk igen for at slette alt' : 'Start forfra'}</button>`;
  }
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function rewardText(r) {
  return [r.money && `💰 ${fmt(r.money)}`, r.gems && `❤️ ${r.gems}`, r.xp && `⭐ ${r.xp} XP`].filter(Boolean).join(' ');
}
const fmtGoal = (n) => (n >= 10000 ? fmt(n) : n);
