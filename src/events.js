// Challenges: decision cards with consequences, the shop's calendar and company orders.
// Cards are defined by make (does it fit right now? returns the card's data, or null) and options (what you can do).
import { SEASONS, YEAR, TAX_EVERY, TAX_RATE, productById, gameTime } from './data.js';
import { bus, pick, listed, addBoost, addMoney, charge, spend, kr, onDuty, salaryOf, takeStock, available, fire } from './state.js';

const emp = (s, id) => s.employees.find((e) => e.id === id);
const inStock = (s, n) => listed(s).filter((p) => available(s, p.id) >= n);
const staffOnDuty = (s) => s.employees.filter((e) => onDuty(s, e));

export const CARDS = {
  influencer: {
    lvl: 2, icon: '🤳', title: 'En influencer skriver',
    make: (s) => { const p = pick(inStock(s, 3)); return p && { pid: p.id, n: Math.min(5, available(s, p.id)) }; },
    text: (s, c) => `"Send mig ${c.n} × ${productById[c.pid].icon} ${productById[c.pid].name} gratis, så viser jeg dem frem!" Måske går det stærkt – måske sker der ingenting.`,
    options: (s, c) => [
      { label: `Send varerne`, sub: `Koster ${kr(c.n * productById[c.pid].cost)} i varer`, run: () => {
        takeStock(s, c.pid, c.n);
        if (Math.random() < 0.6) { addBoost(s, { id: 'inf', name: 'Influencer-omtale', icon: '🤳', kind: 'traffic', mult: 1.5, dur: 70 }); return ['🤳 Videoen går viralt! +150 % trafik', 'event']; }
        return ['🤳 Influenceren lagde en story, som ingen så…', 'warn'];
      } },
      { label: 'Nej tak', sub: 'Der sker ingenting', run: () => ['Du beholder varerne.', ''] },
    ],
  },
  contract: {
    lvl: 3, icon: '🏢', title: 'Stor firmaordre',
    make: (s) => {
      if (s.contract) return null;
      const p = pick(inStock(s, 2));
      if (!p) return null;
      const n = Math.min(24, 6 + s.level);
      return { pid: p.id, n, pay: Math.round(n * p.price * 0.3 / 50) * 50, fine: Math.round(n * p.cost * 0.5 / 50) * 50 };
    },
    text: (s, c) => `Et firma vil have ${c.n} × ${productById[c.pid].icon} ${productById[c.pid].name} inden for ${gameTime(170)}. Klarer I det, er der en bonus oveni salget – ellers en bod.`,
    options: (s, c) => [
      { label: 'Tag ordren', sub: `Bonus ${kr(c.pay)} · bod ${kr(c.fine)}`, run: () => {
        for (let i = 0; i < c.n; i++) s.orders.push({ id: s.nextId++, productId: c.pid, t: s.time, status: 'queued', by: null, b2b: true });
        s.contract = { pid: c.pid, n: c.n, done: 0, until: s.time + 170, pay: c.pay, fine: c.fine };
        return [`🏢 Firmaordren er i køen. Husk at have ${productById[c.pid].icon} på lager!`, 'event'];
      } },
      { label: 'Sig nej', sub: 'For risikabelt lige nu', run: () => ['Firmaet handler et andet sted.', ''] },
    ],
  },
  job: {
    lvl: 3, icon: '💼', title: 'Jobtilbud fra konkurrenten',
    make: (s) => { const e = pick(s.employees.filter((x) => !x.raise)); return e && { id: e.id }; },
    valid: (s, c) => emp(s, c.id),
    text: (s, c) => `${emp(s, c.id).name} har fået et tilbud fra en konkurrent og spørger, om du kan matche det.`,
    options: (s, c) => { const e = emp(s, c.id); return [
      { label: 'Giv lønforhøjelse', sub: `+${kr(Math.round(salaryOf(e) * 0.2))}/dag for altid`, run: () => { e.raise = 1.2; e.mood = { until: s.day + 2, n: 12, why: '💰 Lønforhøjelse' }; return [`${e.name} bliver – og er glad for det!`, 'good']; } },
      { label: 'Sig nej', sub: 'Halv chance for, at de siger op', run: () => {
        if (Math.random() < 0.5) { const n = e.name; fire(s, e.id); return [`👋 ${n} har sagt op.`, 'bad']; }
        e.mood = { until: s.day + 3, n: -12, why: '😒 Fik ikke lønforhøjelse' };
        return [`${e.name} bliver, men er sur.`, 'warn'];
      } },
    ]; },
  },
  defect: {
    lvl: 3, icon: '🧵', title: 'Fejl i et parti',
    make: (s) => { const p = pick(inStock(s, 5)); return p && { pid: p.id, n: Math.min(10, available(s, p.id)) }; },
    text: (s, c) => `Leverandøren har opdaget syfejl i de seneste ${c.n} × ${productById[c.pid].icon} ${productById[c.pid].name}.`,
    options: (s, c) => [
      { label: 'Send dem retur', sub: `Mister ${c.n} varer · leverancer forsinkes`, run: () => { takeStock(s, c.pid, c.n); s.delayUntil = s.time + 60; return ['🧵 Partiet er sendt retur.', '']; } },
      { label: 'Sælg dem alligevel', sub: 'Dobbelt så mange returneringer i 2 dage', run: () => { s.defect = { id: c.pid, until: s.day + 1 }; s.satisfaction = Math.max(0, s.satisfaction - 4); return [`🧵 ${productById[c.pid].name} kommer oftere retur de næste dage.`, 'warn']; } },
    ],
  },
  competitor: {
    lvl: 4, icon: '🥊', title: 'Konkurrenten sænker priserne',
    make: (s) => (s.compete?.until > s.time ? null : {}),
    text: () => 'En konkurrent sælger de samme varer billigere, og kunderne har opdaget det.',
    options: (s) => [
      { label: 'Følg med', sub: `10 % lavere priser i ${gameTime(120)}`, run: () => { s.compete = { until: s.time + 120, price: 0.9 }; return ['🏷️ Priserne er sat ned for en stund.', '']; } },
      { label: 'Hold fast', sub: `25 % færre kunder i ${gameTime(120)}`, run: () => { addBoost(s, { id: 'rival', name: 'Billig konkurrent', icon: '🥊', kind: 'traffic', mult: -0.25, dur: 120 }); return ['🥊 Du holder prisen – færre kunder i dag.', 'warn']; } },
    ],
  },
  sick: {
    lvl: 2, icon: '🤒', title: 'Sygemelding',
    make: (s) => { const e = pick(staffOnDuty(s).filter((x) => !x.help)); return e && { id: e.id }; },
    valid: (s, c) => emp(s, c.id),
    text: (s, c) => `${emp(s, c.id).name} har det skidt og spørger, om det er okay at gå hjem.`,
    options: (s, c) => { const e = emp(s, c.id), cost = Math.round(salaryOf(e) * 0.6); return [
      { label: 'Send hjem', sub: 'Væk resten af dagen', run: () => { e.awayDay = s.day; e.mood = { until: s.day + 2, n: 5, why: '💛 God chef' }; return [`🤒 ${e.name} er gået hjem.`, '']; } },
      { label: 'Tag en vikar', sub: `${kr(cost)} · arbejdet fortsætter`, can: () => s.money >= cost, run: () => { spend(s, cost, 'events'); e.mood = { until: s.day + 2, n: 5, why: '💛 God chef' }; return ['🙋 En vikar har taget over.', 'good']; } },
      { label: 'Bed dem blive', sub: 'Dårlig stemning i 3 dage', run: () => { e.mood = { until: s.day + 2, n: -15, why: '🤒 Måtte arbejde syg' }; return [`😞 ${e.name} bliver, men er ikke glad.`, 'warn']; } },
    ]; },
  },
  power: {
    lvl: 3, icon: '🔌', title: 'Webshoppen er nede',
    make: (s) => (s.outage?.until > s.time ? null : {}),
    text: () => 'Serveren er gået ned. Så længe den er nede, kommer der ingen nye ordrer.',
    options: (s) => [
      { label: 'Ring efter hjælp', sub: `800 kr · oppe igen med det samme`, can: () => s.money >= 800, run: () => { spend(s, 800, 'events'); return ['🔌 Webshoppen er oppe igen.', 'good']; } },
      { label: 'Vent', sub: `Ingen ordrer i ${gameTime(30)}`, run: () => { s.outage = { until: s.time + 30 }; return [`🔌 Ingen nye ordrer de næste ${gameTime(30)}.`, 'warn']; } },
    ],
  },
  broken: {
    lvl: 3, icon: '🔧', title: 'Et pakkebord er gået i stykker',
    make: (s) => { const t = s.furniture.filter((f) => f.type === 'table'); return t.length >= 2 && !(s.broken?.until > s.time) ? { fid: pick(t).id } : null; },
    text: () => 'Benet er knækket, og bordet kan ikke bruges.',
    options: (s, c) => [
      { label: 'Reparér nu', sub: '600 kr', can: () => s.money >= 600, run: () => { spend(s, 600, 'events'); return ['🔧 Pakkebordet er repareret.', 'good']; } },
      { label: 'Vent på montøren', sub: `Bordet er ude i ${gameTime(60)}`, run: () => { s.broken = { fid: c.fid, until: s.time + 60 }; return ['🔧 Ét pakkebord er ude af drift et stykke tid.', 'warn']; } },
    ],
  },
  shrink: {
    lvl: 4, icon: '🕵️', title: 'Der mangler varer',
    make: (s) => { if (s.alarm) return null; const p = pick(inStock(s, 4)); return p && { pid: p.id, n: Math.min(6, available(s, p.id)) }; },
    text: (s, c) => `Optællingen viser, at der mangler ${c.n} × ${productById[c.pid].icon} ${productById[c.pid].name}. Det sker måske igen.`,
    options: (s, c) => [
      { label: 'Køb overvågning', sub: '1.500 kr · så sker det ikke igen', can: () => s.money >= 1500, run: () => { spend(s, 1500, 'events'); s.alarm = true; takeStock(s, c.pid, c.n); return ['📹 Overvågningen er sat op.', 'good']; } },
      { label: 'Glem det', sub: 'Varerne er væk', run: () => { takeStock(s, c.pid, c.n); return ['🕵️ Varerne er skrevet af.', 'warn']; } },
    ],
  },
  review: {
    lvl: 2, icon: '⭐', title: 'En sur anmeldelse',
    make: () => ({}),
    text: () => '"Min pakke kom for sent, og ingen svarer!" Anmeldelsen får mange likes.',
    options: (s) => [
      { label: 'Kompensér kunden', sub: '300 kr · kunderne bliver gladere', can: () => s.money >= 300, run: () => { spend(s, 300, 'events'); s.satisfaction = Math.min(100, s.satisfaction + 6); return ['⭐ Kunden skrev en ny, glad anmeldelse.', 'good']; } },
      { label: 'Ignorér den', sub: 'Kundetilfredshed −8', run: () => { s.satisfaction = Math.max(0, s.satisfaction - 8); return ['⭐ Anmeldelsen spreder sig.', 'warn']; } },
    ],
  },
  tv: {
    lvl: 5, icon: '📺', title: 'TV vil lave et indslag',
    make: () => ({}),
    text: () => 'Den lokale TV-station vil vise lageret frem i aften. Der kommer mange kunder – er I klar?',
    options: (s) => [
      { label: 'Ja tak!', sub: `+200 % trafik i ${gameTime(50)}`, run: () => { addBoost(s, { id: 'tv', name: 'TV-omtale', icon: '📺', kind: 'traffic', mult: 2, dur: 50 }); return ['📺 Så er I på TV! Ordrerne vælter ind.', 'event']; } },
      { label: 'Nej tak', sub: 'Ikke i dag', run: () => ['Du takker nej.', ''] },
    ],
  },
  party: {
    lvl: 3, icon: '🎉', title: 'Personalet vil holde fest',
    make: (s) => (s.employees.length >= 2 ? {} : null),
    text: () => 'De ansatte spørger, om firmaet vil give en omgang til fredagsbaren.',
    options: (s) => { const cost = 200 * s.employees.length; return [
      { label: 'Giv en omgang', sub: `${kr(cost)} · +10 glæde i 2 dage`, can: () => s.money >= cost, run: () => { spend(s, cost, 'events'); s.morale = { until: s.day + 1, n: 10, why: '🎉 God stemning' }; return ['🎉 Skål! Stemningen er i top.', 'good']; } },
      { label: 'Ikke i år', sub: '−5 glæde i dag', run: () => { s.morale = { until: s.day, n: -5, why: '😕 Ingen fest' }; return ['😕 Der er lidt lange ansigter i dag.', 'warn']; } },
    ]; },
  },
};

// Draw a card that fits right now and hasn't been seen lately.
function drawCard(s) {
  const open = Object.keys(CARDS).filter((id) => CARDS[id].lvl <= s.level && !s.cardSeen.includes(id));
  for (const id of open.sort(() => Math.random() - 0.5)) {
    const ctx = CARDS[id].make(s);
    if (!ctx) continue;
    s.card = { id, ctx };
    s.cardSeen = [id, ...s.cardSeen].slice(0, 5);
    bus.emit('sfx', 'pop');
    return;
  }
}

// Carry out option i of the card on the table; returns the [message, class] to show.
export function answerCard(s, i) {
  const { id, ctx } = s.card, c = CARDS[id];
  s.card = null;
  if (c.valid && !c.valid(s, ctx)) return null;
  return c.options(s, ctx)[i]?.run() ?? null;
}

export function tickEvents(s, dt) {
  if (s.outage && s.outage.until <= s.time) { s.outage = null; bus.emit('toast', '🔌 Webshoppen er oppe igen.', 'good'); }
  if (s.broken && s.broken.until <= s.time) { s.broken = null; bus.emit('toast', '🔧 Pakkebordet er repareret.', 'good'); }
  if (s.compete && s.compete.until <= s.time) s.compete = null;
  const c = s.contract;
  if (c && c.done >= c.n) {
    addMoney(s, c.pay);
    s.stats.contracts = (s.stats.contracts || 0) + 1;
    s.contract = null;
    bus.emit('toast', `🏢 Firmaordren er klaret! Bonus: ${kr(c.pay)}`, 'good', 5000);
    bus.emit('sfx', 'fanfare');
  } else if (c && c.until <= s.time) {
    charge(s, c.fine, 'events');
    for (const o of s.orders) if (o.b2b && o.status === 'queued') o.gone = true;
    s.orders = s.orders.filter((o) => !o.gone);
    s.contract = null;
    s.satisfaction = Math.max(0, s.satisfaction - 5);
    bus.emit('toast', `🏢 Firmaordren nåede ikke frem – bod på ${kr(c.fine)}`, 'bad', 5000);
  }
  if (s.card || s.level < 2 || !listed(s).length) return;
  s.cardT -= dt;
  if (s.cardT <= 0) { s.cardT = 90 + Math.random() * 90; drawCard(s); }
}

// ---------- the calendar ----------
const dayOfYear = (day) => ((day - 1) % YEAR) + 1;
// The next seasons from a day on (up to YEAR days ahead), nearest first, with how many days until they start.
export function upcoming(s) {
  const out = [];
  for (let k = 0; k < YEAR; k++) for (const x of SEASONS) if (x.lvl <= s.level && x.day === dayOfYear(s.day + k) && k) out.push({ ...x, in: k });
  return out;
}
export const nextTax = (s) => (TAX_EVERY - (s.day % TAX_EVERY)) % TAX_EVERY;
export const taxSoFar = (s) => Math.round((s.stats.revenue - s.taxFrom) * TAX_RATE);

export function endOfDay(s) {
  // Help is only for the day.
  const helped = s.employees.filter((e) => e.help);
  for (const e of s.employees) { e.help = null; e.helpT = 0; }
  if (helped.length) bus.emit('toast', `🤝 ${helped.length === 1 ? helped[0].name : `${helped.length} ansatte`} er tilbage på ${helped.length === 1 ? 'sit eget job' : 'deres eget job'} i morgen`, 'quiet');
  const sn = s.season, x = sn && SEASONS.find((o) => o.id === sn.id);
  if (x && sn.until <= s.day) {
    if (sn.goal) {
      const done = s.stats.shipped - sn.from;
      if (done >= sn.goal) {
        const pay = sn.goal * 40;
        addMoney(s, pay);
        s.gems += 3;
        s.stats.seasonsWon = (s.stats.seasonsWon || 0) + 1;
        bus.emit('toast', `${x.icon} ${x.name} blev en succes: ${done} ordrer! Bonus ${kr(pay)} og ❤️ 3`, 'good', 6000);
      } else {
        s.satisfaction = Math.max(0, s.satisfaction - 8);
        bus.emit('toast', `${x.icon} ${x.name}: kun ${done} af ${sn.goal} ordrer – kunderne er skuffede`, 'bad', 6000);
      }
    }
    s.season = null;
  }
}

export function startOfDay(s) {
  const today = dayOfYear(s.day);
  for (const x of SEASONS) {
    if (x.lvl > s.level) continue;
    if (x.day === today && !s.season) {
      const h = s.stats.history.slice(-3), usual = h.length ? h.reduce((a, d) => a + d.orders, 0) / h.length : 10;
      s.season = { id: x.id, until: s.day + x.days - 1, from: s.stats.shipped, goal: x.rush ? Math.max(12, Math.round(usual * x.rush * x.days)) : 0 };
      if (x.vacation) {
        const staff = [...s.employees].sort(() => Math.random() - 0.5).slice(0, Math.ceil(s.employees.length / 3));
        for (const e of staff) e.awayDay = s.day + x.days - 1;
      }
      bus.emit('toast', `${x.icon} ${x.name} er begyndt! ${x.desc}`, 'event', 6000);
      bus.emit('sfx', 'fanfare');
    } else if (dayOfYear(s.day + 2) === x.day) bus.emit('toast', `📅 Om 2 dage: ${x.icon} ${x.name}. ${x.desc}`, 'event', 6000);
  }
  if (s.level >= 3 && nextTax(s) === 2) bus.emit('toast', `🧾 Om 2 dage skal der betales moms – ca. ${kr(taxSoFar(s))} indtil videre`, 'warn', 5000);
}
