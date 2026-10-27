import {
  PRODUCTS, productById, TIER_COLORS, PRICE_MODES, ROLES, EMP_TIERS, SOME_BONUS, SOME_VIRAL, ECOM_BONUS,
  UPGRADES, SHOP, CAMPAIGNS, QUESTS, DAY_LENGTH, xpFor, MAX_LEVEL, unlocksAt,
} from './data.js';
import {
  bus, fmt, kr, capacity, stockTotal, queuedCount, upgVal, unitPrice, salaryOf, hire, fire, empUpgradeCost,
  spend, addMoney, addXP, resetState, activeCampaign,
} from './state.js';
import { effects, buyStock, buyShop, advisor, dayReport, startCampaign, campaignDur, supportRate } from './sim.js';

const TABS = [
  ['home', '🏠', 'Hjem'], ['staff', '👥', 'Ansatte'], ['orders', '🧾', 'Ordrer'], ['products', '👕', 'Produkter'],
  ['shop', '🛍️', 'Butik'], ['upgrades', '⬆️', 'Upgrades'], ['stats', '📊', 'Statistik'],
];
const TITLES = { staff: 'Ansatte', orders: 'Ordrer', products: 'Produkter', shop: 'Butik & kampagner', upgrades: 'Upgrades', stats: 'Statistik' };
const $ = (sel, el = document) => el.querySelector(sel);
const pct = (v) => `${Math.round(v * 100)} %`;

export class UI {
  constructor(s, world) {
    this.s = s; this.w = world;
    this.tab = 'home';
    this.shownMoney = s.money;
    this.tick = 0;
    this.confirmFire = null;
    this.build();
    this.bind();
  }

  build() {
    const app = $('#app');
    app.insertAdjacentHTML('beforeend', `
      <div id="hud">
        <div class="top">
          <div class="chip money"><span>💰</span><b id="h-money"></b></div>
          <div class="chip level"><div class="lvl" id="h-lvl"></div><div class="xpbar"><i id="h-xp"></i></div></div>
          <div class="chip"><span>❤️</span><b id="h-gems"></b></div>
          <div class="chip"><span>👥</span><b id="h-staff"></b></div>
        </div>
        <div class="dayrow"><span id="h-day"></span><div class="daybar"><i id="h-daybar"></i></div></div>
        <div id="quest" class="quest"></div>
        <button id="advisor" class="advisor"></button>
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
    bus.on('toast', (t, cls) => this.toast(t, cls));
    bus.on('levelup', (l) => this.levelUp(l));
    bus.on('dayEnd', (r) => this.toast(dayReport(r), 'day', 5000));
    bus.on('ship', (rev, pos) => { this.w.popup(`+${fmt(rev)} kr`, pos, 'money'); bus.emit('sfx', 'coin'); });
    bus.on('built', (p) => { this.toast(`🎉 ${p.name} bygget!`, 'good'); bus.emit('sfx', 'level'); });
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
      if (c != null && spend(s, c)) { e.tier++; this.toast(`⭐ ${e.name} er nu ${EMP_TIERS[e.tier].name}!`, 'good'); } else this.toast('Ikke nok penge 💸', 'bad');
    }
    if (cmd === 'fire') {
      if (this.confirmFire === +x) { fire(s, +x); this.confirmFire = null; } else this.confirmFire = +x;
    }
    if (cmd === 'upg') {
      const U = UPGRADES[x], next = U.levels[s.upg[x] + 1];
      if (next && s.level >= next.lvl && spend(s, next.cost)) { s.upg[x]++; addXP(s, 10); this.toast(`⬆️ ${next.name} købt!`, 'good'); bus.emit('sfx', 'level'); }
    }
    if (cmd === 'shop') {
      const item = SHOP.find((i) => i.id === x);
      if (buyShop(s, item)) this.toast(`${item.icon} ${item.name} aktiveret!`, 'good'); else this.toast('Ikke nok 💰/❤️', 'bad');
    }
    if (cmd === 'camp') startCampaign(s, CAMPAIGNS.find((c) => c.id === x));
    if (cmd === 'claim') this.claimQuest();
    if (cmd === 'advisor' && x) this.open(x);
    if (cmd === 'closeModal') $('#modal').classList.remove('show');
    if (cmd === 'reset') { if (this.confirmReset) resetState(); else this.confirmReset = true; }
    this.renderSheet(true);
  }

  open(tab) {
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
    $('#h-gems').textContent = s.gems;
    $('#h-staff').textContent = s.employees.length;
    $('#h-day').textContent = `Dag ${s.day}`;
    $('#h-daybar').style.width = `${(s.dayTime / DAY_LENGTH) * 100}%`;

    const qs = this.quest();
    $('#quest').innerHTML = qs
      ? `<span class="qi">🎯</span><div class="qt"><b>${qs.q.text}</b><div class="qbar"><i style="width:${(qs.cur / qs.target) * 100}%"></i></div></div>
         ${qs.done ? `<button class="btn claim" data-act="claim">Hent ${rewardText(qs.q.reward)}</button>` : `<small>${fmtGoal(qs.cur)}/${fmtGoal(qs.target)}</small>`}`
      : `<span class="qi">🏆</span><div class="qt"><b>Alle mål klaret – flere kommer snart!</b></div>`;
    $('#quest').classList.toggle('done', !!qs?.done);

    const adv = advisor(s);
    const advEl = $('#advisor');
    advEl.innerHTML = `💡 ${adv.text}`;
    advEl.dataset.act = `advisor:${adv.tab || ''}`;

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
    return `<h3>Dit team (${s.employees.length})</h3>${team}
      <h3>Kandidater <small>· nye hver dag</small></h3>${cands || '<p class="empty">Ingen kandidater endnu – nå level 2 for at kunne ansætte.</p>'}${locked}`;
  }

  effectText(e) {
    const s = this.s, m = EMP_TIERS[e.tier].mult * (e.special === 'fast' ? 1.5 : 1), comp = upgVal(s, 'computer');
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
    const s = this.s;
    const transit = (id) => s.deliveries.filter((d) => d.productId === id).reduce((a, d) => a + d.qty, 0) + s.boxes.filter((b) => b.productId === id).reduce((a, b) => a + b.qty, 0);
    return `<p class="tip">Varer leveres i kasser ved varemodtagelsen. Lager: <b>${stockTotal(s)}/${capacity(s)}</b></p>` + PRODUCTS.map((p) => {
      if (p.lvl > s.level) return `<div class="locked">🔒 ${p.icon} ${p.name} <span class="tag" style="background:${TIER_COLORS[p.tier]}">${p.tier}</span> · Level ${p.lvl}</div>`;
      const price = unitPrice(s, p), mode = s.priceMode[p.id] || 'normal', box = p.cost * p.box;
      const stock = s.stock[p.id] || 0, tr = transit(p.id);
      const trend = s.trend?.id === p.id && s.trend.until > s.time;
      return `<div class="card prod">
        <div class="av big" style="background:${p.color}33">${p.icon}</div>
        <div class="info">
          <b>${p.name} <span class="tag" style="background:${TIER_COLORS[p.tier]}">${p.tier}</span>${trend ? ' <span class="tag hot">🔥 Trend</span>' : ''}</b>
          <small>På lager: <b class="${stock ? '' : 'warn'}">${stock}</b>${tr ? ` · På vej/ved modtagelse: ${tr}` : ''} · Solgt: ${s.sold[p.id] || 0}</small>
          <small>Indkøb ${kr(p.cost)} · Salg ${kr(price)} · Margin <b>${kr(price - p.cost)}</b></small>
          <small>Popularitet ${'★'.repeat(Math.round(p.pop * 3))}${'☆'.repeat(Math.max(0, 5 - Math.round(p.pop * 3)))}</small>
          <div class="seg">${Object.entries(PRICE_MODES).map(([k, m]) => `<button class="${k === mode ? 'on' : ''}" data-act="price:${p.id}:${k}">${m.name} pris</button>`).join('')}</div>
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
    return `<p class="tip">🟨 Nye reoler, pakkeborde og skriveborde bygges ved at stille dig på de gule felter i spillet.</p>` +
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

  r_stats() {
    const s = this.s, fx = effects(s), h = s.stats.history;
    const max = Math.max(1, ...h.map((d) => d.revenue));
    const bars = h.length
      ? `<div class="bars">${h.map((d) => `<div class="bar"><small>${fmt(d.revenue)}</small><i style="height:${(d.revenue / max) * 100}%"></i><span>D${d.day}</span></div>`).join('')}</div>`
      : '<p class="empty">Historik vises efter første dag.</p>';
    const sold = PRODUCTS.filter((p) => s.sold[p.id]).map((p) => `<div class="row"><span class="ic">${p.icon}</span><div class="info"><b>${p.name}</b></div><b>${s.sold[p.id]} stk</b></div>`).join('');
    return `<div class="grid3">
        <div class="stat"><small>Omsætning i alt</small><b>${kr(s.stats.revenue)}</b></div>
        <div class="stat"><small>Ordrer sendt</small><b>${fmt(s.stats.shipped)}</b></div>
        <div class="stat"><small>Tabte salg</small><b>${fmt(s.stats.lost)}</b></div>
        <div class="stat"><small>Besøgende/min</small><b>${fx.traffic.toFixed(0)}</b></div>
        <div class="stat"><small>Konvertering</small><b>${(fx.conv * 100).toFixed(1)} %</b></div>
        <div class="stat"><small>Ordrer/min</small><b>${fx.opm.toFixed(1)}</b></div>
      </div>
      <div class="breakdown">
        <small>Trafik: SoMe +${pct(fx.some)} · Boosts +${pct(fx.bt)} · Tilfredshed ×${fx.sat.toFixed(2)}</small>
        <small>Konvertering: Webshop +${pct(upgVal(s, 'webshop'))} · E-com +${pct(fx.ecom)} · Boosts +${pct(fx.bc)}</small>
        ${fx.camp ? `<small>Kampagne: ${fx.camp.name} · ordrer ×${fx.camp.orders} · priser ×${fx.camp.price}</small>` : ''}
      </div>
      <h3>Omsætning pr. dag</h3>${bars}
      <h3>Salg pr. produkt</h3>${sold || '<p class="empty">Intet solgt endnu.</p>'}
      <button class="btn ghost wide" data-act="reset">${this.confirmReset ? 'Tryk igen for at slette alt' : 'Start forfra'}</button>`;
  }
}

function rewardText(r) {
  return [r.money && `💰 ${fmt(r.money)}`, r.gems && `❤️ ${r.gems}`, r.xp && `⭐ ${r.xp} XP`].filter(Boolean).join(' ');
}
const fmtGoal = (n) => (n >= 10000 ? fmt(n) : n);
