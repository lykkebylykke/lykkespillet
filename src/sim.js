import {
  DAY_LENGTH, rentOf, FURNITURE, PRICE_MODES, ROLES, SOME_BONUS, SOME_VIRAL, ECOM_BONUS, SUPPORT_RATE, productById, TABLE_SLOTS, PLAYER_NAME,
} from './data.js';
import {
  bus, pick, capacity, stockTotal, listed, upgVal, addBoost, addMoney, salaryOf, queuedCount,
  freeBoxSlot, refreshCandidates, spend, charge, newDay, kr, activeCampaign, available, ownedFurniture, addXP,
} from './state.js';

export function effects(s) {
  const comp = upgVal(s, 'computer');
  let some = 0, ecom = 0;
  for (const e of s.employees) {
    if (e.desk == null) continue;
    if (e.role === 'some') some += SOME_BONUS[e.tier] * comp;
    if (e.role === 'ecom') ecom += ECOM_BONUS[e.tier] * comp * (e.special === 'data' ? 1.5 : 1);
  }
  let bt = 0, bc = 0;
  for (const b of s.boosts) b.kind === 'traffic' ? (bt += b.mult) : (bc += b.mult);
  const sat = 0.6 + (s.satisfaction / 100) * 0.6;
  const n = listed(s).length;
  const traffic = 50 * (1 + 0.06 * (s.level - 1)) * (1 + 0.08 * Math.max(0, n - 1)) * (1 + some) * (1 + bt) * sat;
  const conv = 0.06 * (1 + upgVal(s, 'webshop') + ecom + bc);
  const camp = activeCampaign(s);
  return { traffic, conv, opm: n ? traffic * conv * (camp?.orders ?? 1) : 0, some, ecom, bt, bc, sat, camp };
}

export const queueCap = (s) => 15 + 5 * s.tables;

export const supportRate = (s, e) => SUPPORT_RATE[e.tier] * (e.special === 'fast' ? 1.5 : 1) * upgVal(s, 'computer');
// Each E-commerce Manager makes campaigns run 25 % longer.
export const campaignDur = (s, c) => Math.round(c.dur * (1 + 0.25 * s.employees.filter((e) => e.role === 'ecom').length));

export function startCampaign(s, c) {
  if (s.level < c.lvl || activeCampaign(s) || (s.campCd[c.id] || 0) > s.time) return false;
  const dur = campaignDur(s, c);
  s.campaign = { id: c.id, name: c.name, icon: c.icon, price: c.price, orders: c.orders, until: s.time + dur, total: dur };
  s.campCd[c.id] = s.time + dur + c.cd;
  s.stats.campaigns++;
  bus.emit('toast', `${c.icon} ${c.name} er i gang! Ordrerne vælter ind – løb, ${PLAYER_NAME}! 🏃‍♀️`, 'event');
  bus.emit('sfx', 'fanfare');
  return true;
}

// Buys the next piece of furniture into the kit; the player then places it.
export function buyFurniture(s, type) {
  const F = FURNITURE[type], n = ownedFurniture(s, type);
  if (n >= F.cost.length || s.level < F.lvl[n] || !spend(s, F.cost[n], 'invest')) return false;
  s.kit[type]++;
  addXP(s, 15);
  return true;
}

export function buyStock(s, productId, boxes) {
  const p = productById[productId];
  if (!spend(s, p.cost * p.box * boxes, 'goods')) return false;
  const delay = s.time < s.delayUntil ? 20 : 6;
  for (let i = 0; i < boxes; i++) s.deliveries.push({ productId, qty: p.box, eta: s.time + delay + i * 0.4 });
  s.stats.boxesBought += boxes;
  return true;
}

function lose(s, p, why) {
  s.stats.lost++;
  s.stats.today.lost++;
  s.recentLost.push({ t: s.time, id: p.id, why });
  s.satisfaction = Math.max(0, s.satisfaction - (why === 'queue' ? 1 : 0.3));
}

function spawnOrder(s) {
  const L = listed(s);
  if (!L.length) return;
  const trend = s.trend && s.trend.until > s.time ? s.trend.id : null;
  const w = L.map((p) => p.pop * PRICE_MODES[s.priceMode[p.id] || 'normal'].demand * (p.id === trend ? 3 : 1));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  let p = L[L.length - 1];
  for (let i = 0; i < L.length; i++) { r -= w[i]; if (r <= 0) { p = L[i]; break; } }
  if (available(s, p.id) <= 0) return lose(s, p, 'stock');
  if (s.orders.length >= queueCap(s)) return lose(s, p, 'queue');
  s.orders.push({ id: s.nextId++, productId: p.id, t: s.time, status: 'queued', by: null });
  bus.emit('order', p);
}

function endDay(s) {
  const wages = s.employees.reduce((a, e) => a + salaryOf(e), 0);
  charge(s, wages, 'staff');
  charge(s, rentOf(s), 'rent');
  const t = s.stats.today;
  s.stats.history.push({ day: s.day, ...t, wages });
  if (s.stats.history.length > 7) s.stats.history.shift();
  bus.emit('dayEnd', { day: s.day, ...t, wages });
  s.stats.today = newDay();
  s.day++;
  s.dayTime = 0;
  refreshCandidates(s);
}

function randomEvent(s) {
  const L = listed(s);
  const opts = [];
  if (L.length > 1) opts.push('trend');
  if (s.level >= 3) opts.push('delay');
  if (s.level >= 6) opts.push('blackfriday');
  if (s.level >= 2) opts.push('tiktok');
  if (!opts.length) return;
  const ev = pick(opts);
  if (ev === 'trend') {
    const p = pick(L);
    s.trend = { id: p.id, until: s.time + 75 };
    bus.emit('toast', `🔥 ${p.icon} ${p.name} går viralt! Efterspørgslen er ×3 i 75 sek.`, 'event');
  } else if (ev === 'delay') {
    s.delayUntil = s.time + 90;
    bus.emit('toast', '🚧 Leverandør forsinket – nye leverancer tager længere tid.', 'warn');
  } else if (ev === 'blackfriday') {
    addBoost(s, { id: 'bf', name: 'Black Friday', icon: '🛍️', kind: 'traffic', mult: 3, dur: 40 });
    bus.emit('toast', '🛍️ BLACK FRIDAY! +300 % trafik – er lageret klar?', 'event');
  } else {
    addBoost(s, { id: 'tiktok', name: 'Viral TikTok', icon: '🎵', kind: 'traffic', mult: 0.6, dur: 50 });
    bus.emit('toast', '🎵 En kunde lavede en TikTok om jer! +60 % trafik', 'event');
  }
}

export function update(s, dt) {
  s.time += dt;
  s.dayTime += dt;
  if (s.dayTime >= DAY_LENGTH) endDay(s);
  if (s.boosts.some((b) => b.until <= s.time)) s.boosts = s.boosts.filter((b) => b.until > s.time);

  // Deliveries land in the receiving area if there's floor space.
  let arrived = false;
  for (const d of s.deliveries) {
    if (d.eta > s.time) continue;
    const slot = freeBoxSlot(s);
    if (slot < 0) break;
    s.boxes.push({ id: s.nextId++, productId: d.productId, qty: d.qty, slot });
    d.done = true;
    arrived = true;
  }
  if (arrived) { s.deliveries = s.deliveries.filter((d) => !d.done); bus.emit('truck'); }

  if (s.campaign && s.campaign.until <= s.time) {
    bus.emit('toast', `${s.campaign.icon} ${s.campaign.name} er slut – priserne er normale igen.`, '');
    s.campaign = null;
  }

  // Customer service works through tickets; open tickets slowly hurt satisfaction.
  for (const e of s.employees) if (e.role === 'support' && e.desk != null) s.ticketWork += supportRate(s, e) * dt;
  while (s.ticketWork >= 1) { s.ticketWork--; if (s.tickets > 0) { s.tickets--; s.stats.ticketsSolved++; s.satisfaction = Math.min(100, s.satisfaction + 0.8); } }
  if (!s.tickets) s.ticketWork = 0;
  if (s.tickets) s.satisfaction = Math.max(0, s.satisfaction - 0.012 * s.tickets * dt);

  const fx = effects(s);
  if (Math.random() < (fx.opm / 60) * dt) spawnOrder(s);

  for (const e of s.employees) {
    if (e.role !== 'some' || e.desk == null) continue;
    e.postT = (e.postT || 0) + dt;
    if (e.postT < 25) continue;
    e.postT = 0;
    const big = e.special === 'viral';
    if (Math.random() < SOME_VIRAL[e.tier] + (big ? 0.1 : 0)) {
      addBoost(s, { id: 'viral', name: big ? 'Mega-viral' : 'Viral video', icon: '🔥', kind: 'traffic', mult: big ? 2 : 0.4, dur: big ? 40 : 60 });
      bus.emit('toast', big ? `🔥 ${e.name}s opslag gik MEGA-viralt! +200 % trafik` : `🔥 ${e.name}s video går viralt! +40 % trafik`, 'event');
    }
  }

  s.eventT -= dt;
  if (s.eventT <= 0) { s.eventT = 150 + Math.random() * 120; randomEvent(s); }

  let late = 0;
  for (const o of s.orders) if (s.time - o.t > 90) late++;
  if (late) s.satisfaction = Math.max(0, s.satisfaction - 0.02 * late * dt);

  // Courier collects parcels every ~18 seconds.
  s.parcelT += dt;
  if (s.parcelT > 18 && s.parcels > 0 && !s.pickupAt) { s.parcelT = 0; s.pickupAt = s.time + 1.6; bus.emit('courier'); }
  if (s.pickupAt && s.time >= s.pickupAt) { s.parcels = 0; s.pickupAt = 0; }

  if (s.recentLost.length && s.recentLost[0].t < s.time - 60) s.recentLost = s.recentLost.filter((x) => x.t >= s.time - 60);
}

export function buyShop(s, item) {
  if (item.money && !spend(s, item.money, 'marketing')) return false;
  if (item.gems) { if (s.gems < item.gems) return false; s.gems -= item.gems; }
  if (item.boost) addBoost(s, { id: item.id, name: item.name, icon: item.icon, ...item.boost });
  if (item.action === 'express') s.deliveries.forEach((d) => (d.eta = s.time));
  if (item.action === 'cash') addMoney(s, 5000);
  return true;
}

// The one-line hint that points at the current bottleneck.
export function advisor(s) {
  const has = (r) => s.employees.some((e) => e.role === r);
  const cap = capacity(s), stock = stockTotal(s);
  const q = queuedCount(s);
  const waitingBoxes = s.boxes.filter((b) => !b.carriedBy).length;
  const lostStock = s.recentLost.filter((x) => x.why === 'stock');
  const lostQueue = s.recentLost.filter((x) => x.why === 'queue');
  const deskless = s.employees.find((e) => ROLES[e.role].desk && e.desk == null);

  const kit = Object.values(s.kit).reduce((a, b) => a + b, 0);
  if (kit) return { text: `${kit} ${kit === 1 ? 'møbel venter' : 'møbler venter'} på at blive placeret → tryk 📦 Placér`, tab: null };
  if (!listed(s).length) return { text: 'Pak kassen ud og læg varerne på reolen for at åbne webshoppen', tab: null };
  if (s.money < 0) return { text: 'Negativ saldo! Sælg mere eller skær ned på lønudgifter', tab: 'staff' };
  if (deskless) return { text: `${deskless.name} mangler et skrivebord → køb et under Indretning`, tab: 'upgrades' };
  if (activeCampaign(s) && q >= 3) return { text: `${s.campaign.icon} Kampagne! Ordrerne vælter ind – løb, ${PLAYER_NAME}! 🏃‍♀️`, tab: null };
  if (s.tickets >= 5) return s.level >= ROLES.support.lvl && !has('support')
    ? { text: 'For mange kundehenvendelser → ansæt kundeservice', tab: 'staff' }
    : { text: `${s.tickets} kundehenvendelser venter → besvar dem ved computeren`, tab: null };
  if (stock >= cap * 0.95 && waitingBoxes) return { text: 'Lageret er fuldt → byg en lagerreol eller opgrader lageret', tab: 'upgrades' };
  if (waitingBoxes >= 3) return s.level >= ROLES.stocker.lvl && !has('stocker')
    ? { text: 'Kasser hober sig op → ansæt en lagermedarbejder', tab: 'staff' }
    : { text: 'Kasser venter ved varemodtagelsen → pak dem ud', tab: null };
  if (lostStock.length >= 2) {
    const p = productById[lostStock[lostStock.length - 1].id];
    return { text: `Udsolgt: ${p.icon} ${p.name} – du taber salg → køb flere varer`, tab: 'buy' };
  }
  if (lostQueue.length || q >= 6) {
    if (s.level >= ROLES.packer.lvl && s.employees.filter((e) => e.role === 'packer').length < s.tables)
      return { text: 'For mange ordrer i kø → ansæt en lagerpakker', tab: 'staff' };
    if (s.tables < TABLE_SLOTS.length && s.level >= 3) return { text: 'Pakningen er flaskehalsen → køb et pakkebord mere', tab: 'upgrades' };
    return { text: 'Pakning går for langsomt → opgrader pakkebordet', tab: 'upgrades' };
  }
  if (q <= 1 && stock > 5) {
    if (s.level >= ROLES.some.lvl && !has('some')) return { text: 'For få ordrer → ansæt en SoMe Manager', tab: 'staff' };
    if (s.level >= ROLES.ecom.lvl && !has('ecom')) return { text: 'For få ordrer → ansæt en E-commerce Manager', tab: 'staff' };
    return { text: 'For få ordrer → kør en kampagne, arbejd på webshoppen eller køb annoncer', tab: 'shop' };
  }
  if (stock < 8 && !s.deliveries.length) return { text: 'Lageret er ved at løbe tørt → bestil flere varer', tab: 'buy' };
  return { text: 'Det kører! Find den næste ting at optimere 🚀', tab: null };
}

export function dayReport(r) {
  const profit = r.revenue - r.costs;
  return `🌙 Dag ${r.day} slut · ${r.orders} ordrer · Omsætning ${kr(r.revenue)} · Udgifter ${kr(r.costs)} · Resultat ${profit >= 0 ? '+' : ''}${kr(profit)}`;
}
