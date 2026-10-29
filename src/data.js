// All tunable game data lives here.

export const DAY_LENGTH = 120; // seconds per in-game day

// ---------- running costs ----------
export const PACKAGING = 4; // kr per parcel
export const FREIGHT = 15; // kr per parcel
// Daily rent grows with the space you build.
export const rentOf = (s) => 100 + 40 * (s.shelves - 1) + 80 * (s.tables - 1) + 50 * (s.desks - 1) + TILE_RENT * s.tiles.length;
// Extra floor space, bought per 2×2 m tile.
export const TILE_COST = 300;
export const TILE_RENT = 6;
export const EXPENSES = {
  goods: '📦 Varekøb', staff: '👥 Løn', rent: '🏠 Husleje', packaging: '🎁 Emballage', freight: '🚚 Fragt',
  hiring: '🤝 Rekruttering & oplæring', invest: '🏗️ Byggeri & upgrades', marketing: '📣 Annoncer & boosts', interest: '🏦 Renter',
};
// Bank loans: paid back in equal daily installments (principal + interest) when each day ends.
export const LOANS = [
  { id: 'small', name: 'Iværksætterlån', icon: '🌱', amount: 5000, rate: 0.08, days: 7, lvl: 1 },
  { id: 'mid', name: 'Vækstlån', icon: '📈', amount: 20000, rate: 0.12, days: 10, lvl: 3 },
  { id: 'big', name: 'Erhvervslån', icon: '🏦', amount: 60000, rate: 0.18, days: 14, lvl: 6 },
];
// Days in a row with a deficit (or a negative balance) before the shop goes bankrupt.
export const BANKRUPT_DAYS = 7;
export const MAX_LEVEL = 20;
export const xpFor = (l) => Math.round(80 * Math.pow(l, 1.55));

export const PRODUCTS = [
  { id: 'tshirt', name: 'T-shirt', icon: '👕', tier: 'Basic', cost: 60, price: 149, pop: 1.0, color: '#ff8fab', lvl: 1, box: 10 },
  { id: 'cap', name: 'Kasket', icon: '🧢', tier: 'Basic', cost: 40, price: 119, pop: 0.8, color: '#ffd166', lvl: 1, box: 10 },
  { id: 'hoodie', name: 'Hoodie', icon: '🧥', tier: 'Basic', cost: 140, price: 349, pop: 0.9, color: '#7b8cff', lvl: 2, box: 10 },
  { id: 'jeans', name: 'Jeans', icon: '👖', tier: 'Basic', cost: 170, price: 399, pop: 0.8, color: '#3d5a98', lvl: 4, box: 10 },
  { id: 'sneakers', name: 'Sneakers', icon: '👟', tier: 'Trending', cost: 280, price: 699, pop: 1.1, color: '#ff7b54', lvl: 6, box: 10 },
  { id: 'dress', name: 'Kjole', icon: '👗', tier: 'Trending', cost: 220, price: 549, pop: 1.2, color: '#c77dff', lvl: 9, box: 10 },
  { id: 'scarf', name: 'Kashmir-tørklæde', icon: '🧣', tier: 'Premium', cost: 300, price: 799, pop: 0.9, color: '#2ec4b6', lvl: 12, box: 10 },
  { id: 'limited', name: 'Limited Drop', icon: '👑', tier: 'Limited', cost: 600, price: 1999, pop: 1.6, color: '#f5b400', lvl: 15, box: 5 },
];
export const productById = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

export const TIER_COLORS = { Basic: '#8d99ae', Trending: '#ff5d8f', Premium: '#7b61ff', Limited: '#e0a100' };

export const PRICE_MODES = {
  low: { name: 'Lav', price: 0.85, demand: 1.35 },
  normal: { name: 'Normal', price: 1, demand: 1 },
  high: { name: 'Høj', price: 1.2, demand: 0.7 },
};

export const ROLES = {
  packer: { name: 'Lagerpakker', icon: '📦', lvl: 2, hire: 600, salary: 220, color: '#ff9f1c', desc: 'Henter varer på lageret og pakker ordrer.' },
  some: { name: 'SoMe Manager', icon: '📱', lvl: 3, hire: 900, salary: 300, color: '#ff5d8f', desk: true, desc: 'Laver markedsføring på Instagram, Facebook og TikTok. Skaber trafik og kan gå viral.' },
  support: { name: 'Kundeservice', icon: '🎧', lvl: 3, hire: 800, salary: 260, color: '#9b5de5', desk: true, desc: 'Håndterer kundehenvendelser og returneringer. Holder kunderne glade.' },
  ecom: { name: 'E-commerce Manager', icon: '💻', lvl: 4, hire: 1200, salary: 380, color: '#4cc9f0', desk: true, desc: 'Laver kampagner og annoncering. Øger konverteringen og gør kampagner længere.' },
  stocker: { name: 'Lagermedarbejder', icon: '🛒', lvl: 5, hire: 900, salary: 240, color: '#80b918', desc: 'Pakker leverancer ud og fylder lageret op.' },
};

export const EMP_TIERS = [
  { name: 'Junior', mult: 1, sal: 1, up: 0 },
  { name: 'Specialist', mult: 1.35, sal: 1.5, up: 1.5 },
  { name: 'Senior', mult: 1.75, sal: 2.2, up: 4 },
  { name: 'Expert', mult: 2.2, sal: 3, up: 10 },
];
export const SOME_BONUS = [0.15, 0.25, 0.38, 0.55];
export const SOME_VIRAL = [0.05, 0.07, 0.09, 0.12];
export const ECOM_BONUS = [0.12, 0.2, 0.3, 0.42];
export const SUPPORT_RATE = [0.1, 0.15, 0.22, 0.3]; // tickets per second

// The real team gets hired first; extra hires get other Danish names.
const LAGER = ['Gry', 'Naya', 'Frederikke'];
export const ROSTER = { some: ['Stine'], ecom: ['Lasse', 'Sophie'], packer: LAGER, stocker: LAGER, support: ['Trine'] };
// The boss the player creates at the start; older saves keep Janne.
export const DEFAULT_BOSS = { name: 'Janne', gender: 'kvinde', skin: '#ffd7b5', hair: '#e6be8a', hairStyle: 'bun', beard: false, shirt: '#ff5d8f', bottom: 'pants', pants: '#2b2d42', hat: '#ffc300' };
export const GENDERS = [['kvinde', '👩 Kvinde'], ['mand', '👨 Mand'], ['andet', '🧑 Andet']];
export const HAIR_STYLES = [['short', 'Kort'], ['long', 'Langt'], ['bun', 'Knold'], ['bald', 'Skaldet']];
export const CLOTHES = ['#ff5d8f', '#ef476f', '#ff9f1c', '#ffd166', '#80ed99', '#2a9d8f', '#4cc9f0', '#3a86ff', '#7b61ff', '#cdb4db', '#ffffff', '#2b2d42'];
export const HATS = [null, '#ffc300', '#ff5d8f', '#3a86ff', '#2b2d42', '#80ed99'];
export const runner = (b) => ({ kvinde: '🏃‍♀️', mand: '🏃‍♂️' })[b.gender] || '🏃';
export const bossLook = (b) => ({ skin: b.skin, hair: b.hair, hairStyle: b.hairStyle, beard: b.beard, shirt: b.shirt, pants: b.pants, skirt: b.bottom === 'skirt', hat: b.hat });

export const SPECIALS = [
  { name: 'Viral Emma', role: 'some', special: 'viral', desc: '10 % chance for at et opslag går viralt: +200 % trafik' },
  { name: 'Lyn-Line', role: 'packer', special: 'fast', desc: 'Arbejder 50 % hurtigere' },
  { name: 'Data-Dorthe', role: 'ecom', special: 'data', desc: '+50 % konverteringsbonus' },
  { name: 'Stærke Sara', role: 'stocker', special: 'fast', desc: 'Arbejder 50 % hurtigere' },
  { name: 'Smilende Sanne', role: 'support', special: 'fast', desc: 'Løser henvendelser 50 % hurtigere' },
];

export const NAMES = ['Mette', 'Camilla', 'Louise', 'Julie', 'Emma', 'Ida', 'Freja', 'Clara', 'Alma', 'Ella', 'Karla', 'Josefine',
  'Signe', 'Maja', 'Laura', 'Anna', 'Cecilie', 'Mathilde', 'Nanna', 'Line', 'Pernille', 'Rikke', 'Astrid', 'Liva', 'Ellen', 'Malou', 'Nora', 'Vigga'];
export const SKINS = ['#ffd7b5', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffe0c7'];
export const HAIRS = ['#2b1b10', '#5a3825', '#a0522d', '#e6be8a', '#1c1c1c', '#d35400', '#7d5ba6'];
export const SHIRTS = ['#4cc9f0', '#80ed99', '#ffafcc', '#ffd166', '#cdb4db', '#90e0ef', '#f4a261'];

// Physical layout (world units, x: 0..18, z: 0..20)
export const SHELF_SLOTS = [{ x: 2.5, z: 9.5 }, { x: 7, z: 9.5 }, { x: 2.5, z: 13 }, { x: 7, z: 13 }, { x: 2.5, z: 16.5 }, { x: 7, z: 16.5 }];
export const SHELF_COST = [0, 400, 900, 1800, 3500, 6000];
export const SHELF_LVL = [1, 1, 2, 4, 6, 8];
export const TABLE_SLOTS = [{ x: 13, z: 10 }, { x: 13, z: 13.5 }, { x: 13, z: 17 }];
export const TABLE_COST = [0, 1500, 5000];
export const TABLE_LVL = [1, 3, 7];
export const DESK_SLOTS = [{ x: 1.8, z: 2 }, { x: 4.6, z: 2 }, { x: 7.4, z: 2 }, { x: 1.8, z: 4.8 }, { x: 4.6, z: 4.8 }, { x: 7.4, z: 4.8 }];
export const DESK_COST = [0, 1000, 2000, 3500, 6000, 9000];
export const DESK_LVL = [1, 3, 3, 5, 7, 9];
// Furniture the player places freely. half/acc are for rotation 0 (access side faces +z).
export const FURNITURE = {
  shelf: { name: 'Lagerreol', icon: '🧱', key: 'shelves', cost: SHELF_COST, lvl: SHELF_LVL, slots: SHELF_SLOTS, hx: 1.35, hz: 0.4, acc: 0.85, r: 0.85 },
  table: { name: 'Pakkebord', icon: '📦', key: 'tables', cost: TABLE_COST, lvl: TABLE_LVL, slots: TABLE_SLOTS, hx: 1.05, hz: 0.55, acc: 0.95, r: 0.85 },
  desk: { name: 'Skrivebord', icon: '🖥️', key: 'desks', cost: DESK_COST, lvl: DESK_LVL, slots: DESK_SLOTS, hx: 0.85, hz: 0.45, acc: 0.9, r: 0.8 },
  // Decor has no work spot; each placed piece makes the whole team work a bit faster (mood).
  plant: { name: 'Plante', icon: '🪴', decor: true, mood: 0.02, cost: [250, 250, 350, 350, 500, 500], lvl: [1, 1, 2, 2, 3, 3], hx: 0.3, hz: 0.3, acc: 0 },
  coffee: { name: 'Kaffebar', icon: '☕', decor: true, mood: 0.06, cost: [1200], lvl: [2], hx: 0.6, hz: 0.35, acc: 0 },
  sofa: { name: 'Sofa', icon: '🛋️', decor: true, mood: 0.05, cost: [1500, 2500], lvl: [3, 6], hx: 1.0, hz: 0.45, acc: 0 },
  speaker: { name: 'Højttaler', icon: '🎵', decor: true, mood: 0.03, cost: [800], lvl: [4], hx: 0.3, hz: 0.3, acc: 0 },
  foosball: { name: 'Bordfodbold', icon: '⚽', decor: true, mood: 0.08, cost: [3500], lvl: [5], hx: 0.75, hz: 0.45, acc: 0 },
};
export const BOX_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 11.8 + (i % 4) * 1.3, z: 2.2 + Math.floor(i / 4) * 1.3 }));
export const DELIVERY_SPOT = { x: 13.75, z: 5.0 };
export const PALLET = { x: 16.6, z: 15.7 };
export const IDLE = { packer: { x: 15.5, z: 12 }, stocker: { x: 16, z: 6.3 }, office: { x: 5.5, z: 6.4 } };

export const UPGRADES = {
  packTable: {
    name: 'Pakkebord', icon: '📦', fmt: (v) => `Pakketid ×${v}`,
    levels: [
      { name: 'Simpelt pakkebord', cost: 0, lvl: 1, val: 1 },
      { name: 'Tape-dispenser', cost: 800, lvl: 2, val: 0.75 },
      { name: 'Pro pakkestation', cost: 3000, lvl: 5, val: 0.55 },
      { name: 'Automatisk pakkelinje', cost: 10000, lvl: 9, val: 0.4 },
    ],
  },
  computer: {
    name: 'Computere', icon: '🖥️', fmt: (v) => `Kontor-effekt ×${v}`,
    levels: [
      { name: 'Basic computer', cost: 0, lvl: 1, val: 1 },
      { name: 'Professional computer', cost: 1000, lvl: 3, val: 1.25 },
      { name: 'Dual monitor setup', cost: 4000, lvl: 6, val: 1.55 },
      { name: 'High-end workstation', cost: 12000, lvl: 10, val: 1.9 },
    ],
  },
  storage: {
    name: 'Lager-niveau', icon: '🏬', fmt: (v) => `${v} varer pr. reol`,
    levels: [
      { name: 'Lager Level 1', cost: 0, lvl: 1, val: 25 },
      { name: 'Lager Level 2', cost: 2000, lvl: 4, val: 50 },
      { name: 'Lager Level 3', cost: 8000, lvl: 8, val: 85 },
    ],
  },
  webshop: {
    name: 'Webshop-software', icon: '🛍️', fmt: (v) => `+${Math.round(v * 100)} % konvertering`,
    levels: [
      { name: 'Gratis tema', cost: 0, lvl: 1, val: 0 },
      { name: 'Premium tema', cost: 1500, lvl: 3, val: 0.1 },
      { name: 'Smarte apps', cost: 5000, lvl: 6, val: 0.25 },
      { name: 'Headless webshop', cost: 15000, lvl: 10, val: 0.45 },
    ],
  },
  shoes: {
    name: 'Løbesko', icon: '👟', fmt: (v) => `Fart ${v}`,
    levels: [
      { name: 'Sutsko', cost: 0, lvl: 1, val: 3.4 },
      { name: 'Sneakers', cost: 300, lvl: 2, val: 4 },
      { name: 'Løbesko', cost: 1200, lvl: 4, val: 4.6 },
      { name: 'Raket-sko', cost: 4000, lvl: 7, val: 5.2 },
    ],
  },
  trolley: {
    name: 'Plukkevogn', icon: '🛒', fmt: (v) => `Bær ${v} varer`,
    levels: [
      { name: 'Hænderne', cost: 0, lvl: 1, val: 2 },
      { name: 'Indkøbskurv', cost: 500, lvl: 2, val: 3 },
      { name: 'Plukkevogn', cost: 2000, lvl: 5, val: 4 },
      { name: 'Turbo-vogn', cost: 6000, lvl: 8, val: 6 },
    ],
  },
};

// Campaigns: lower prices in exchange for many more orders.
export const CAMPAIGNS = [
  { id: 'freight', name: 'Gratis fragt', icon: '🚚', lvl: 1, price: 0.92, orders: 1.6, dur: 60, cd: 90 },
  { id: 'sale20', name: 'Rabat-weekend −20 %', icon: '🏷️', lvl: 2, price: 0.8, orders: 2.2, dur: 45, cd: 120 },
  { id: 'flash', name: 'Flash Sale −40 %', icon: '⚡', lvl: 4, price: 0.6, orders: 3.2, dur: 30, cd: 180 },
  { id: 'bf', name: 'Black Friday −50 %', icon: '🖤', lvl: 7, price: 0.5, orders: 4.5, dur: 40, cd: 300 },
];

export const SHOP = [
  { id: 'fb', name: 'Facebook-annoncer', icon: '📣', desc: '+50 % trafik i 90 sek', money: 600, lvl: 1, boost: { kind: 'traffic', mult: 0.5, dur: 90 } },
  { id: 'google', name: 'Google Shopping', icon: '🔎', desc: '+80 % trafik i 120 sek', money: 2000, lvl: 4, boost: { kind: 'traffic', mult: 0.8, dur: 120 } },
  { id: 'influencer', name: 'Influencer-samarbejde', icon: '🤳', desc: '+150 % trafik i 90 sek', gems: 8, lvl: 1, boost: { kind: 'traffic', mult: 1.5, dur: 90 } },
  { id: 'express', name: 'Express-levering', icon: '⚡', desc: 'Alle varer på vej ankommer med det samme', gems: 2, lvl: 1, action: 'express' },
  { id: 'cash', name: 'Investor-møde', icon: '💼', desc: 'Få 5.000 kr til virksomheden', gems: 10, lvl: 1, action: 'cash' },
];

const empCount = (s, role) => s.employees.filter((e) => e.role === role).length;

// target: world hint for quest arrow, tab: UI hint
export const QUESTS = [
  { text: 'Indret dit lager: placér starterkittet', goal: (s) => [s.furniture.length, 3], reward: { xp: 10 } },
  { text: 'Saml kassen op ved varemodtagelsen', goal: (s) => [s.stats.boxesPicked, 1], reward: { xp: 10 }, target: 'delivery' },
  { text: 'Læg T-shirts på lagerreolen', goal: (s) => [s.stats.unitsStocked, 10], reward: { xp: 10 }, target: 'shelf' },
  { text: 'Vent på en ordre og hent varen på reolen', goal: (s) => [s.stats.itemsPicked, 1], reward: { xp: 10 }, target: 'shelf' },
  { text: 'Pak ordren ved pakkebordet', goal: (s) => [s.stats.shipped, 1], reward: { money: 200 }, target: 'table' },
  { text: 'Arbejd på webshoppen ved computeren', goal: (s) => [s.stats.webshopWork, 1], reward: { money: 100 }, target: 'desk' },
  { text: 'Køb en kasse varer under Indkøb', goal: (s) => [s.stats.boxesBought, 1], reward: { money: 150 }, tab: 'buy' },
  { text: 'Send 10 ordrer', goal: (s) => [s.stats.shipped, 10], reward: { money: 300, gems: 2 } },
  { text: 'Køb og placér en ekstra lagerreol', goal: (s) => [s.shelves, 2], reward: { money: 300 }, tab: 'upgrades' },
  { text: 'Ansæt en Lagerpakker', goal: (s) => [empCount(s, 'packer'), 1], reward: { money: 500 }, tab: 'staff' },
  { text: 'Opgrader pakkebordet', goal: (s) => [s.upg.packTable, 1], reward: { gems: 2 }, tab: 'upgrades' },
  { text: 'Køb og placér et ekstra skrivebord', goal: (s) => [s.desks, 2], reward: { money: 400 }, tab: 'upgrades' },
  { text: 'Kør din første kampagne', goal: (s) => [s.stats.campaigns, 1], reward: { money: 400 }, tab: 'shop' },
  { text: 'Ansæt Stine som SoMe Manager', goal: (s) => [empCount(s, 'some'), 1], reward: { money: 600 }, tab: 'staff' },
  { text: 'Ansæt Trine i kundeservice', goal: (s) => [empCount(s, 'support'), 1], reward: { money: 500 }, tab: 'staff' },
  { text: 'Sælg 20 hoodies', goal: (s) => [s.sold.hoodie || 0, 20], reward: { money: 800 }, tab: 'products' },
  { text: 'Tjen 10.000 kr i omsætning', goal: (s) => [s.stats.revenue, 10000], reward: { gems: 3 } },
  { text: 'Ansæt en E-commerce Manager (Lasse eller Sophie)', goal: (s) => [empCount(s, 'ecom'), 1], reward: { money: 1000 }, tab: 'staff' },
  { text: 'Køb og placér et ekstra pakkebord', goal: (s) => [s.tables, 2], reward: { gems: 3 }, tab: 'upgrades' },
  { text: 'Send 100 ordrer', goal: (s) => [s.stats.shipped, 100], reward: { money: 2000 } },
  { text: 'Ansæt en Lagermedarbejder', goal: (s) => [empCount(s, 'stocker'), 1], reward: { money: 1500 }, tab: 'staff' },
  { text: 'Ansæt 5 medarbejdere', goal: (s) => [s.employees.length, 5], reward: { gems: 5 }, tab: 'staff' },
  { text: 'Opnå 100.000 kr i omsætning', goal: (s) => [s.stats.revenue, 100000], reward: { gems: 5 } },
  { text: 'Send 1.000 ordrer', goal: (s) => [s.stats.shipped, 1000], reward: { gems: 10 } },
  { text: 'Nå level 20', goal: (s) => [s.level, 20], reward: { gems: 20 } },
];

export function unlocksAt(level) {
  const out = [];
  PRODUCTS.forEach((p) => p.lvl === level && out.push(`${p.icon} ${p.name}`));
  Object.values(ROLES).forEach((r) => r.lvl === level && out.push(`${r.icon} ${r.name}`));
  SHELF_LVL.forEach((l, i) => i > 0 && l === level && out.push(`🧱 Lagerreol #${i + 1}`));
  TABLE_LVL.forEach((l, i) => i > 0 && l === level && out.push(`📦 Pakkebord #${i + 1}`));
  DESK_LVL.forEach((l, i) => i > 0 && l === level && out.push(`🖥️ Skrivebord #${i + 1}`));
  Object.values(UPGRADES).forEach((u) => u.levels.forEach((x, i) => i > 0 && x.lvl === level && out.push(`${u.icon} ${x.name}`)));
  SHOP.forEach((x) => x.lvl === level && level > 1 && out.push(`${x.icon} ${x.name}`));
  CAMPAIGNS.forEach((x) => x.lvl === level && out.push(`${x.icon} Kampagne: ${x.name}`));
  return out;
}
