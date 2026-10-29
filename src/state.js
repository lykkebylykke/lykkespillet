import {
  PRODUCTS, productById, PRICE_MODES, ROLES, EMP_TIERS, SPECIALS, NAMES, ROSTER, SKINS, HAIRS, SHIRTS,
  UPGRADES, BOX_SLOTS, MAX_LEVEL, xpFor, PACKAGING, FREIGHT, FURNITURE, DEFAULT_BOSS,
} from './data.js';

// Logged-in players get their own key (see cloud.js); guests use the plain one.
export let SAVE_KEY = 'lykkespillet-v1';
export const setSaveKey = (k) => { SAVE_KEY = k; };
let resetHook = null;
export const setResetHook = (f) => { resetHook = f; };

export const bus = {
  l: {},
  on(e, f) { (this.l[e] ??= []).push(f); },
  emit(e, ...a) { (this.l[e] || []).forEach((f) => f(...a)); },
};

export const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function fmt(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' mio.';
  return Math.round(n).toLocaleString('da-DK');
}
export const kr = (n) => `${fmt(n)} kr`;

export const newDay = () => ({ orders: 0, revenue: 0, costs: 0, lost: 0, exp: {} });

export function newState() {
  return {
    v: 4, money: 1500, gems: 5, xp: 0, level: 1,
    time: 0, day: 1, dayTime: 0, eventT: 200, parcelT: 0, pickupAt: 0,
    stock: {}, everStocked: {}, priceMode: {}, sold: {},
    orders: [], nextId: 1,
    boxes: [{ id: 0, productId: 'tshirt', qty: 10, slot: 0 }],
    deliveries: [],
    // Placed furniture; `kit` holds bought pieces still waiting to be placed (the starter kit at first).
    furniture: [], kit: { shelf: 1, table: 1, desk: 1 }, drops: [], shelves: 0, tables: 0, desks: 0,
    upg: { packTable: 0, computer: 0, storage: 0, webshop: 0, shoes: 0, trolley: 0 },
    employees: [], candidates: [],
    boosts: [], trend: null, delayUntil: 0, campaign: null, campCd: {}, tickets: 0, ticketWork: 0,
    satisfaction: 80, parcels: 0,
    loans: [], redDays: 0, bankrupt: false, boss: null, tiles: [], hideTips: false, hideQuest: false,
    player: { x: 14, z: 7, carry: null },
    quest: 0,
    recentLost: [],
    stats: {
      shipped: 0, revenue: 0, lost: 0, boxesPicked: 0, unitsStocked: 0, itemsPicked: 0,
      webshopWork: 0, boxesBought: 0, campaigns: 0, ticketsSolved: 0, history: [],
      exp: {}, today: newDay(),
    },
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = Object.assign(newState(), JSON.parse(raw));
      s.stats.exp ??= {};
      s.stats.today.exp ??= {};
      // v1 took stock off the shelf when an order arrived; now it stays until picked.
      if (s.v < 2) { for (const o of s.orders) if (o.status === 'queued') s.stock[o.productId] = (s.stock[o.productId] || 0) + 1; s.v = 2; }
      // v2 had fixed slots; turn them into placed furniture and skip the new placement quest.
      if (s.v < 3) {
        s.furniture = [];
        for (const [type, F] of Object.entries(FURNITURE)) for (let i = 0; i < s[F.key]; i++) s.furniture.push({ id: s.nextId++, type, ...F.slots[i], rot: 0 });
        s.kit = { shelf: 0, table: 0, desk: 0 };
        s.quest++;
        s.v = 3;
      }
      for (const type in FURNITURE) s.kit[type] ??= 0;
      s.boss ??= { ...DEFAULT_BOSS };
      if (s.loan) s.loans.push(s.loan);
      delete s.loan;
      syncFurniture(s);
      // v3 had one shared stock; spread it over the shelves.
      if (s.v < 4) {
        const sh = shelvesOf(s), cap = shelfCap(s);
        let k = 0;
        for (const [pid, n] of Object.entries(s.stock)) for (let u = 0; u < n; u++) {
          while (k < sh.length - 1 && shelfCount(sh[k]) >= cap) k++;
          if (sh[k]) putOnShelf(pid, sh[k]);
        }
        s.v = 4;
      }
      // Runtime claims don't survive a reload; employees restart their tasks.
      const pc = s.player.carry;
      for (const o of s.orders) {
        const held = o.by === 'player' && pc?.kind === 'items' && pc.orderIds.includes(o.id);
        if (o.status === 'picked' && !held && o.by !== 'floor') {
          o.status = 'queued'; o.by = null; returnItem(s, o);
        }
      }
      for (const d of s.drops) { d.claimedBy = null; d.orderIds = d.orderIds.filter((id) => s.orders.some((o) => o.id === id)); }
      s.drops = s.drops.filter((d) => d.orderIds.length);
      syncStock(s);
      for (const b of s.boxes) {
        if (b.carriedBy !== 'player') b.carriedBy = null;
        b.claimedBy = null;
      }
      return s;
    }
  } catch (e) { console.warn('Kunne ikke indlæse gemt spil', e); }
  const s = newState();
  refreshCandidates(s);
  return s;
}

let resetting = false;
export function saveState(s) {
  if (resetting) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

export function resetState() {
  resetting = true;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  Promise.resolve(resetHook?.()).catch(() => {}).finally(() => location.reload());
}

// ---------- derived values ----------
export const upgVal = (s, key) => UPGRADES[key].levels[s.upg[key]].val;
export const capacity = (s) => s.shelves * upgVal(s, 'storage');
export const stockTotal = (s) => Object.values(s.stock).reduce((a, b) => a + b, 0);
export const listed = (s) => PRODUCTS.filter((p) => p.lvl <= s.level && s.everStocked[p.id]);
export const activeCampaign = (s) => (s.campaign && s.campaign.until > s.time ? s.campaign : null);
export const unitPrice = (s, p) => Math.round(p.price * PRICE_MODES[s.priceMode[p.id] || 'normal'].price * (activeCampaign(s)?.price ?? 1));
// Units on the shelf not yet promised to a queued order.
export const available = (s, id) => (s.stock[id] || 0) - s.orders.filter((o) => o.productId === id && o.status === 'queued').length;
export const queuedCount = (s) => s.orders.filter((o) => o.status === 'queued').length;
export const salaryOf = (e) => Math.round(ROLES[e.role].salary * EMP_TIERS[e.tier].sal * (e.special ? 1.3 : 1));
export function syncFurniture(s) {
  for (const [type, F] of Object.entries(FURNITURE)) if (F.key) s[F.key] = s.furniture.filter((f) => f.type === type).length;
}
export const ownedFurniture = (s, type) => s.furniture.filter((f) => f.type === type).length + (s.kit[type] || 0);
export const freeBoxSlot = (s) => {
  const used = new Set(s.boxes.map((b) => b.slot));
  return BOX_SLOTS.findIndex((_, i) => !used.has(i));
};

// ---------- economy ----------
export function addMoney(s, amt, pos) {
  s.money += amt;
  bus.emit('money', amt, pos);
}

// Books an expense under a category (see EXPENSES) — may push the balance negative.
export function charge(s, amt, cat) {
  if (!amt) return;
  s.money -= amt;
  const t = s.stats.today;
  t.costs += amt;
  t.exp[cat] = (t.exp[cat] || 0) + amt;
  s.stats.exp[cat] = (s.stats.exp[cat] || 0) + amt;
  bus.emit('money', -amt);
}

export function spend(s, amt, cat) {
  if (s.money < amt) return false;
  charge(s, amt, cat);
  return true;
}

export function addXP(s, n) {
  if (s.level >= MAX_LEVEL) return;
  s.xp += n;
  while (s.level < MAX_LEVEL && s.xp >= xpFor(s.level)) {
    s.xp -= xpFor(s.level);
    s.level++;
    s.gems += 3;
    refreshCandidates(s);
    bus.emit('levelup', s.level);
  }
}

export function addBoost(s, b) {
  const ex = s.boosts.find((x) => x.id === b.id);
  if (ex) { ex.until = Math.max(ex.until, s.time + b.dur); ex.total = ex.until - s.time; return; }
  s.boosts.push({ ...b, until: s.time + b.dur, total: b.dur });
}

// ---------- shared physical operations (player + employees) ----------
export function takeBox(s, box, who) {
  box.carriedBy = who;
  box.claimedBy = null;
  box.at = null;
  if (who === 'player') s.stats.boxesPicked++;
}

// Moves one unit from a box onto the shelves. Returns false if the warehouse is full.
// ---------- per-shelf stock ----------
// Each shelf keeps its own items (f.stock) and can be reserved for one product (f.only); s.stock is the sum.
export const shelfCap = (s) => upgVal(s, 'storage');
const shelvesOf = (s) => s.furniture.filter((f) => f.type === 'shelf');
export const shelfCount = (f) => Object.values(f.stock || {}).reduce((a, b) => a + b, 0);
export const shelfAccepts = (s, f, pid) => (!f.only || f.only === pid) && shelfCount(f) < shelfCap(s);
export const shelfHasOrder = (s, f) => s.orders.some((o) => o.status === 'queued' && (f.stock?.[o.productId] || 0) > 0);

export function syncStock(s) {
  const st = {};
  for (const f of shelvesOf(s)) for (const [k, n] of Object.entries(f.stock || {})) if (n) st[k] = (st[k] || 0) + n;
  s.stock = st;
}

function putOnShelf(pid, f) {
  f.stock ??= {};
  f.stock[pid] = (f.stock[pid] || 0) + 1;
}

// An item goes back where it came from, or else to any shelf with room.
function returnItem(s, o) {
  const sh = shelvesOf(s);
  const f = sh.find((x) => x.id === o.from) ?? sh.find((x) => shelfAccepts(s, x, o.productId)) ?? sh[0];
  if (f) putOnShelf(o.productId, f);
}

export function stockOne(s, box, f) {
  if (!f || !shelfAccepts(s, f, box.productId)) return false;
  putOnShelf(box.productId, f);
  syncStock(s);
  s.everStocked[box.productId] = true;
  s.stats.unitsStocked++;
  box.qty--;
  if (box.qty <= 0) s.boxes = s.boxes.filter((b) => b !== box);
  addXP(s, 1);
  return true;
}

// Picks the first queued order whose product is on this shelf.
export function claimOrder(s, who, f) {
  const o = s.orders.find((x) => x.status === 'queued' && (f.stock?.[x.productId] || 0) > 0);
  if (!o) return null;
  o.status = 'picked';
  o.by = who;
  o.from = f.id;
  f.stock[o.productId]--;
  syncStock(s);
  s.stats.itemsPicked++;
  return o;
}

// Takes up to n picked items from a pile on the floor.
export function takeDrop(s, d, n, who) {
  const ids = d.orderIds.splice(0, n);
  for (const o of s.orders) if (ids.includes(o.id)) o.by = who;
  if (!d.orderIds.length) s.drops = s.drops.filter((x) => x !== d);
  return ids;
}

export function releaseOrders(s, ids) {
  for (const o of s.orders) {
    if (!ids.includes(o.id) || o.status !== 'picked') continue;
    o.status = 'queued'; o.by = null;
    returnItem(s, o);
  }
  syncStock(s);
}

export function shipOrder(s, id, pos) {
  const o = s.orders.find((x) => x.id === id);
  if (!o) return;
  s.orders = s.orders.filter((x) => x !== o);
  const p = productById[o.productId];
  const rev = unitPrice(s, p);
  addMoney(s, rev, pos);
  charge(s, PACKAGING, 'packaging');
  charge(s, FREIGHT, 'freight');
  s.stats.shipped++;
  s.stats.revenue += rev;
  s.stats.today.orders++;
  s.stats.today.revenue += rev;
  s.sold[p.id] = (s.sold[p.id] || 0) + 1;
  const wait = s.time - o.t;
  s.satisfaction = Math.max(0, Math.min(100, s.satisfaction + (wait < 45 ? 0.6 : wait < 90 ? 0.1 : -1.5)));
  s.parcels++;
  if (Math.random() < 0.1) s.tickets++; // some customers write in
  addXP(s, 10 + Math.round(p.price / 40));
  bus.emit('ship', rev, pos);
}

// ---------- staff ----------
function randomLook(name) {
  return { skin: pick(SKINS), hair: pick(HAIRS), shirt: pick(SHIRTS), bun: name !== 'Lasse' };
}

// Named team members first, then other Danish names not already in use.
function candidateName(s, role, taken) {
  const used = new Set([...s.employees.map((e) => e.name), ...taken]);
  const named = (ROSTER[role] || []).find((n) => !used.has(n));
  if (named) return named;
  const free = NAMES.filter((n) => !used.has(n));
  return pick(free.length ? free : NAMES);
}

export function refreshCandidates(s) {
  const roles = Object.keys(ROLES).filter((r) => ROLES[r].lvl <= s.level);
  s.candidates = [];
  if (!roles.length) return;
  const n = Math.min(5, roles.length + 1), taken = [];
  for (let i = 0; i < n; i++) {
    const role = roles[i % roles.length], name = candidateName(s, role, taken);
    taken.push(name);
    s.candidates.push({ cid: s.nextId++, name, role, look: randomLook(name), cost: ROLES[role].hire });
  }
  const sp = SPECIALS.filter((x) => roles.includes(x.role) && !s.employees.some((e) => e.name === x.name));
  if (sp.length && Math.random() < 0.2) {
    const x = pick(sp);
    s.candidates.unshift({ cid: s.nextId++, name: x.name, role: x.role, special: x.special, specialDesc: x.desc, look: randomLook(x.name), cost: ROLES[x.role].hire * 2 });
  }
}

export function assignDesks(s) {
  const used = new Set(s.employees.map((e) => e.desk).filter((d) => d != null));
  for (const e of s.employees) {
    if (!ROLES[e.role].desk || e.desk != null) continue;
    for (let i = 1; i < s.desks; i++) if (!used.has(i)) { e.desk = i; used.add(i); break; }
  }
}

export function hire(s, cid) {
  const c = s.candidates.find((x) => x.cid === cid);
  if (!c || !spend(s, c.cost, 'hiring')) return false;
  s.candidates = s.candidates.filter((x) => x !== c);
  const e = { id: s.nextId++, name: c.name, role: c.role, tier: 0, special: c.special || null, specialDesc: c.specialDesc || null, look: c.look, desk: null };
  s.employees.push(e);
  assignDesks(s);
  bus.emit('hired', e);
  return true;
}

export function fire(s, id) {
  s.employees = s.employees.filter((e) => e.id !== id);
  assignDesks(s);
  bus.emit('fired', id);
}

export const empUpgradeCost = (e) => (e.tier >= 3 ? null : Math.round(ROLES[e.role].hire * EMP_TIERS[e.tier + 1].up));
