// All tunable game data lives here.

export const DAY_LENGTH = 120; // game seconds per in-game day
// How fast the game runs: game seconds per real second. Normal makes a day last 3 real minutes.
export const SPEEDS = {
  slow: { icon: '🐢', name: '½×', scale: 1 / 3, next: 'normal' },
  normal: { icon: '▶️', name: '1×', scale: 2 / 3, next: 'fast' },
  fast: { icon: '⏩', name: '2×', scale: 4 / 3, next: 'slow' },
};
// Game seconds as time on the shop's clock (the working day is 11½ hours).
export const gameTime = (sec) => {
  const m = (sec / DAY_LENGTH) * 690;
  if (m < 55) return `${Math.max(5, Math.round(m / 5) * 5)} min`;
  return `${String(Math.round(m / 30) / 2).replace('.', ',')} t`;
};

// ---------- running costs ----------
export const PACKAGING = 4; // kr per parcel
export const FREIGHT = 15; // kr per parcel
// Daily rent grows with the space you build.
export const rentOf = (s) => 100 + 40 * (s.shelves - 1) + 80 * (s.tables - 1) + 50 * (s.desks - 1) + 90 * (s.racks || 0) + TILE_RENT * s.tiles.length;
// Extra floor space, bought per 2×2 m tile.
export const TILE_COST = 300;
export const TILE_RENT = 6;
export const EXPENSES = {
  goods: '📦 Varekøb', staff: '👥 Løn', rent: '🏠 Husleje', packaging: '🎁 Emballage', freight: '🚚 Fragt',
  hiring: '🤝 Rekruttering & oplæring', invest: '🏗️ Byggeri & upgrades', marketing: '📣 Annoncer & boosts', interest: '🏦 Renter', returns: '↩️ Returneringer', events: '🎲 Hændelser', tax: '🧾 Moms',
};
// Bank loans: paid back in equal daily installments (principal + interest) when each day ends.
export const LOANS = [
// maxBad: the bank only lends if at most this many of the last 7 days ended with a negative balance.
  { id: 'small', name: 'Iværksætterlån', icon: '🌱', amount: 5000, rate: 0.08, days: 7, lvl: 1, maxBad: 3 },
  { id: 'mid', name: 'Vækstlån', icon: '📈', amount: 20000, rate: 0.12, days: 10, lvl: 3, maxBad: 1 },
  { id: 'big', name: 'Erhvervslån', icon: '🏦', amount: 60000, rate: 0.18, days: 14, lvl: 6, maxBad: 0 },
];
// Days in a row ending with a negative balance before the shop goes bankrupt.
export const BANKRUPT_DAYS = 7;
export const MAX_LEVEL = 20;
export const xpFor = (l) => Math.round(80 * Math.pow(l, 1.55));

export const PRODUCTS = [
  { id: 'tshirt', name: 'T-shirt', icon: '👕', tier: 'Basic', cost: 60, price: 149, pop: 1.0, color: '#ff8fab', lvl: 1, box: 10, ret: 0.12 },
  { id: 'cap', name: 'Kasket', icon: '🧢', tier: 'Basic', cost: 40, price: 119, pop: 0.8, color: '#ffd166', lvl: 1, box: 10, ret: 0.05 },
  { id: 'socks', name: 'Strømper', icon: '🧦', tier: 'Basic', cost: 25, price: 79, pop: 0.9, color: '#f4a261', lvl: 2, box: 20, ret: 0.03 },
  { id: 'hoodie', name: 'Hoodie', icon: '🧥', tier: 'Basic', cost: 140, price: 349, pop: 0.9, color: '#7b8cff', lvl: 2, box: 10, ret: 0.15 },
  { id: 'tote', name: 'Mulepose', icon: '🛍️', tier: 'Basic', cost: 35, price: 129, pop: 0.8, color: '#e9c46a', lvl: 3, box: 15, ret: 0.03 },
  { id: 'jeans', name: 'Jeans', icon: '👖', tier: 'Basic', cost: 170, price: 399, pop: 0.8, color: '#3d5a98', lvl: 4, box: 10, ret: 0.3 },
  { id: 'shades', name: 'Solbriller', icon: '🕶️', tier: 'Trending', cost: 120, price: 299, pop: 1.0, color: '#264653', lvl: 5, box: 10, ret: 0.08 },
  { id: 'gloves', name: 'Handsker', icon: '🧤', tier: 'Basic', cost: 50, price: 149, pop: 0.7, color: '#bc4749', lvl: 6, box: 15, ret: 0.06 },
  { id: 'sneakers', name: 'Sneakers', icon: '👟', tier: 'Trending', cost: 280, price: 699, pop: 1.1, color: '#ff7b54', lvl: 6, box: 10, ret: 0.25 },
  { id: 'shorts', name: 'Shorts', icon: '🩳', tier: 'Basic', cost: 90, price: 229, pop: 0.9, color: '#90be6d', lvl: 7, box: 10, ret: 0.18 },
  { id: 'swim', name: 'Badetøj', icon: '👙', tier: 'Trending', cost: 110, price: 279, pop: 1.0, color: '#00b4d8', lvl: 8, box: 10, ret: 0.25 },
  { id: 'dress', name: 'Kjole', icon: '👗', tier: 'Trending', cost: 220, price: 549, pop: 1.2, color: '#c77dff', lvl: 9, box: 10, ret: 0.32 },
  { id: 'handbag', name: 'Håndtaske', icon: '👜', tier: 'Premium', cost: 450, price: 1199, pop: 0.8, color: '#9d4edd', lvl: 10, box: 5, ret: 0.12 },
  { id: 'boots', name: 'Støvler', icon: '👢', tier: 'Premium', cost: 350, price: 899, pop: 0.9, color: '#8d5524', lvl: 11, box: 10, ret: 0.25 },
  { id: 'scarf', name: 'Kashmir-tørklæde', icon: '🧣', tier: 'Premium', cost: 300, price: 799, pop: 0.9, color: '#2ec4b6', lvl: 12, box: 10, ret: 0.08 },
  { id: 'watch', name: 'Ur', icon: '⌚', tier: 'Premium', cost: 700, price: 1799, pop: 0.7, color: '#6c757d', lvl: 13, box: 5, ret: 0.08 },
  { id: 'limited', name: 'Limited Drop', icon: '👑', tier: 'Limited', cost: 600, price: 1999, pop: 1.6, color: '#f5b400', lvl: 15, box: 5, ret: 0.1 },
  { id: 'ring', name: 'Guldring', icon: '💍', tier: 'Limited', cost: 900, price: 2499, pop: 0.8, color: '#ff6b9d', lvl: 17, box: 5, ret: 0.1 },
];
// Fashion changes from day to day: one product is in (more orders), sometimes one is out (fewer).
export const TREND = { hot: 2.5, flop: 0.5, days: [1, 4], flopFrom: 3 };

// What the boss does on autopilot, in the order the player sets.
export const AUTO_TASKS = {
  pack: { icon: '📦', name: 'Pak ordrer', desc: 'Pakker de varer chefen har i hænderne' },
  pick: { icon: '🛒', name: 'Pluk ordrer', desc: 'Henter varer på reolerne og samler varer op fra gulvet' },
  stock: { icon: '🧱', name: 'Fyld reolerne', desc: 'Bærer kasser fra varemodtagelsen op på reolerne' },
  tickets: { icon: '🎧', name: 'Kundeservice', desc: 'Besvarer henvendelser ved et ledigt skrivebord' },
  web: { icon: '💻', name: 'Opdatér webshoppen', desc: '+25 % konvertering, når den gamle opdatering løber ud' },
};
// Returns: `ret` on each product is its base return rate (clothes that must fit come back more often).
// Refunds are paid when the goods come back with the morning truck, plus a return label per item.
export const RETURN_FREIGHT = 25;
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
// stores: holds goods like a shelf (capMult × the shelf size). decor: no work spot. walk: flat, you walk on it.
// joy: happiness for up to joyMax pieces. Pieces near where people work count in the same room within ~7 m;
// pause and anywhere pieces count wherever they stand, because staff walk there.
// use: spots in the piece's own coordinates, for staff on a break (x/z: where they end up; ax/az: where they walk to
// first when they sit on it; f: which way they look; h: seat height).
const seat = (x, z, pose, f, extra) => ({ x, z, pose, f, ...extra });
export const FURNITURE = {
  shelf: { name: 'Lagerreol', icon: '🧱', cat: 'work', key: 'shelves', stores: true, cost: SHELF_COST, lvl: SHELF_LVL, slots: SHELF_SLOTS, hx: 1.35, hz: 0.4, acc: 0.85, r: 0.85 },
  rack: { name: 'Stor pallereol', icon: '🏗️', cat: 'work', key: 'racks', stores: true, capMult: 2, desc: 'Rummer dobbelt så meget som en lagerreol', cost: [4000], lvl: [7], hx: 1.85, hz: 0.5, acc: 0.95, r: 0.9 },
  table: { name: 'Pakkebord', icon: '📦', cat: 'work', key: 'tables', cost: TABLE_COST, lvl: TABLE_LVL, slots: TABLE_SLOTS, hx: 1.05, hz: 0.55, acc: 0.95, r: 0.85 },
  desk: { name: 'Skrivebord', icon: '🖥️', cat: 'work', key: 'desks', cost: DESK_COST, lvl: DESK_LVL, slots: DESK_SLOTS, hx: 0.85, hz: 0.45, acc: 0.9, r: 0.8 },
  printer: { name: 'Labelprinter', icon: '🖨️', cat: 'work', decor: true, desc: 'Pakkeborde inden for 3,5 m pakker 15 % hurtigere', cost: [900], lvl: [3], hx: 0.3, hz: 0.3, acc: 0 },
  belt: { name: 'Rullebånd', icon: '➡️', cat: 'work', decor: true, walk: true, desc: 'Alle går næsten dobbelt så hurtigt på båndet', cost: [1500], lvl: [5], hx: 2, hz: 0.45, acc: 0 },
  whiteboard: { name: 'Whiteboard', icon: '📋', cat: 'work', decor: true, joy: 3, joyMax: 1, label: '📋 Whiteboard', desc: 'Kontorfolk arbejder 10 % bedre (ét er nok)', cost: [1200], lvl: [4], hx: 0.7, hz: 0.12, acc: 0 },
  lockers: { name: 'Garderobeskabe', icon: '🚪', cat: 'pause', decor: true, anywhere: true, joy: 4, joyMax: 1, label: '🧥 Garderobe', cost: [900], lvl: [3], hx: 0.8, hz: 0.25, acc: 0, use: [seat(0, 0.7, 'reach', [0, -1])] },
  coffee: { name: 'Kaffebar', icon: '☕', cat: 'pause', decor: true, joy: 8, joyMax: 1, pause: true, label: '☕ Kaffe', tip: '☕ Savner en kop kaffe i pauserne – køb en kaffebar', cost: [1200], lvl: [2], hx: 0.6, hz: 0.35, acc: 0, use: [seat(-0.25, 0.8, 'cup', [0, -1]), seat(0.3, 0.8, 'cup', [0, -1])] },
  water: { name: 'Vandautomat', icon: '🚰', cat: 'pause', decor: true, joy: 3, joyMax: 1, pause: true, label: '🚰 Vand', cost: [400], lvl: [1], hx: 0.25, hz: 0.25, acc: 0, use: [seat(0, 0.65, 'cup', [0, -1])] },
  fridge: { name: 'Køleskab', icon: '🧊', cat: 'pause', decor: true, joy: 4, joyMax: 1, pause: true, label: '🧊 Køleskab', cost: [700], lvl: [2], hx: 0.4, hz: 0.35, acc: 0, use: [seat(0, 0.8, 'cup', [0, -1])] },
  sofa: { name: 'Sofa', icon: '🛋️', cat: 'pause', decor: true, joy: 6, joyMax: 2, pause: true, label: '🛋️ Pausested', tip: '🛋️ Savner et sted at holde pause – køb en sofa', cost: [1500, 2500], lvl: [3, 6], hx: 1.0, hz: 0.45, acc: 0, use: [seat(-0.45, 0.1, 'sit', [0, 1], { ax: -0.45, az: 0.95, h: 0.62 }), seat(0.45, 0.1, 'sit', [0, 1], { ax: 0.45, az: 0.95, h: 0.62 })] },
  foosball: { name: 'Bordfodbold', icon: '⚽', cat: 'pause', decor: true, joy: 8, joyMax: 1, pause: true, label: '⚽ Bordfodbold', tip: '⚽ Et bordfodboldbord ville gøre pauserne sjovere', cost: [3500], lvl: [5], hx: 0.75, hz: 0.45, acc: 0, use: [seat(-1.1, 0, 'foos', [1, 0]), seat(1.1, 0, 'foos', [-1, 0])] },
  arcade: { name: 'Arcade-maskine', icon: '🕹️', cat: 'pause', decor: true, joy: 8, joyMax: 1, pause: true, label: '🕹️ Arcade', cost: [3000], lvl: [6], hx: 0.4, hz: 0.35, acc: 0, use: [seat(0, 0.8, 'arcade', [0, -1])] },
  pingpong: { name: 'Bordtennis', icon: '🏓', cat: 'pause', decor: true, joy: 9, joyMax: 1, pause: true, label: '🏓 Bordtennis', cost: [4500], lvl: [7], hx: 1.3, hz: 0.7, acc: 0, use: [seat(-1.65, 0, 'ping', [1, 0]), seat(1.65, 0, 'ping', [-1, 0])] },
  plant: { name: 'Plante', icon: '🪴', cat: 'cozy', decor: true, joy: 4, joyMax: 3, label: '🪴 Planter', tip: '🪴 Savner lidt grønt – sæt en plante tæt på (i samme rum)', cost: [250, 250, 350, 350, 500, 500], lvl: [1, 1, 2, 2, 3, 3], hx: 0.3, hz: 0.3, acc: 0 },
  rug: { name: 'Tæppe', icon: '🟪', cat: 'cozy', decor: true, walk: true, joy: 2, joyMax: 2, label: '🟪 Tæppe', cost: [300], lvl: [1], hx: 1.2, hz: 0.8, acc: 0 },
  lamp: { name: 'Gulvlampe', icon: '💡', cat: 'cozy', decor: true, joy: 3, joyMax: 3, label: '💡 Hyggelys', desc: 'Tænder, når det bliver mørkt', cost: [450], lvl: [2], hx: 0.25, hz: 0.25, acc: 0 },
  neon: { name: 'Neonskilt', icon: '🌈', cat: 'cozy', decor: true, joy: 3, joyMax: 1, label: '🌈 Neonskilt', cost: [1000], lvl: [3], hx: 0.7, hz: 0.15, acc: 0 },
  speaker: { name: 'Højttaler', icon: '🎵', cat: 'cozy', decor: true, joy: 7, joyMax: 1, label: '🎵 Musik', tip: '🎵 Savner musik – sæt en højttaler tæt på (i samme rum)', cost: [800], lvl: [4], hx: 0.3, hz: 0.3, acc: 0, use: [seat(0.8, 0.2, 'dance', [-1, 0]), seat(-0.8, 0.2, 'dance', [1, 0])] },
  aquarium: { name: 'Akvarium', icon: '🐠', cat: 'cozy', decor: true, joy: 6, joyMax: 1, label: '🐠 Akvarium', cost: [2500], lvl: [6], hx: 0.75, hz: 0.3, acc: 0 },
};
// There is no limit on furniture: after the listed prices each extra piece costs 25 % more than the one before,
// and it needs the last listed level.
export const furnCost = (F, n) => n < F.cost.length ? F.cost[n] : Math.round(F.cost.at(-1) * 1.25 ** (n - F.cost.length + 1) / 50) * 50;
export const furnLvl = (F, n) => F.lvl[Math.min(n, F.lvl.length - 1)];
// Inner walls and doors (per 2 m segment); tearing down is free.
export const WALL_COST = 150;
export const DOOR_COST = 400;
// A room with break furniture and no work stations in it.
export const BREAK_ROOM_JOY = 6;
// Painting a room, per floor tile, and the colours to choose from.
export const PAINT_COST = 15;
export const FLOOR_COLORS = ['#f1ebe2', '#d9c2a3', '#b9c8d6', '#c9e4ca', '#f7d6e0', '#d8cff0', '#ffe8b3', '#9aa3ad'];
export const WALL_COLORS = ['#fff3e3', '#ffd9c0', '#cfe8ff', '#d5f0d5', '#ffd6e5', '#e3d9ff', '#fff2a8', '#b9c2cc'];

// Temporary jobs: anyone can help out elsewhere, slower and less happily, and their own job stands still meanwhile.
// The pace starts at eff and improves by up to learn the more they've done that job. Help ends when the day ends.
export const HELP = { eff: 0.55, learn: 0.25, learnTime: 900, joy: 8, joyMax: 20 };
export const HELP_JOBS = {
  pack: { icon: '📦', name: 'Pakning', role: 'packer' },
  stock: { icon: '🧱', name: 'Lager', role: 'stocker' },
  support: { icon: '🎧', name: 'Kundeservice', role: 'support' },
};

// The shop's year: the calendar repeats every YEAR days. traffic and ret multiply orders and returns.
// goal: the season has an order target (rush × a normal day's orders); hitting it pays, missing it disappoints.
export const YEAR = 24;
export const SEASONS = [
  { id: 'summer', name: 'Sommerferie', icon: '🏖️', day: 6, days: 3, lvl: 3, traffic: 0.8, vacation: true, desc: 'En tredjedel af de ansatte holder ferie, og der er færre kunder.' },
  { id: 'school', name: 'Skolestart', icon: '🎒', day: 11, days: 2, lvl: 2, traffic: 1.4, desc: 'Alle skal have nyt tøj – 40 % flere kunder.' },
  { id: 'bf', name: 'Black Friday', icon: '🖤', day: 16, days: 1, lvl: 4, traffic: 2.5, rush: 1.7, desc: 'Vanvittigt mange kunder på én dag. Fyld lageret, og flyt folk til pakning.' },
  { id: 'xmas', name: 'Julehandel', icon: '🎄', day: 20, days: 3, lvl: 5, traffic: 1.7, rush: 1.4, desc: 'Pakkerne skal nå frem inden jul – travlt i tre dage.' },
  { id: 'jan', name: 'Januarudsalg', icon: '🧾', day: 23, days: 2, lvl: 3, traffic: 0.85, ret: 1.6, desc: 'Julegaverne kommer retur, og kunderne har ingen penge.' },
];
// VAT is settled every TAX_EVERY days on what was sold since last time.
export const TAX_EVERY = 8;
export const TAX_RATE = 0.05;

// The long game: each chapter has a few big goals and a reward.
export const CHAPTERS = [
  { name: 'Garagen', icon: '🏠', reward: { money: 1000, gems: 2 }, goals: [
    { text: 'Send 25 ordrer', f: (s) => [s.stats.shipped, 25] },
    { text: 'Ansæt din første medarbejder', f: (s) => [s.employees.length, 1] },
  ] },
  { name: 'Det første lager', icon: '📦', reward: { money: 3000, gems: 3 }, goals: [
    { text: 'Tjen 25.000 kr i omsætning', f: (s) => [s.stats.revenue, 25000] },
    { text: 'Hav 3 ansatte', f: (s) => [s.employees.length, 3] },
    { text: 'Byg et rum med vægge', f: (s) => [Object.keys(s.walls).length, 4] },
  ] },
  { name: 'Den travle webshop', icon: '🚀', reward: { money: 10000, gems: 5 }, goals: [
    { text: 'Nå level 8', f: (s) => [s.level, 8] },
    { text: 'Nå målet i en travl sæson', f: (s) => [s.stats.seasonsWon || 0, 1] },
    { text: 'Klar en firmaordre', f: (s) => [s.stats.contracts || 0, 1] },
  ] },
  { name: 'Den store virksomhed', icon: '🏢', reward: { money: 30000, gems: 8 }, goals: [
    { text: 'Hav 10 ansatte', f: (s) => [s.employees.length, 10] },
    { text: 'Tjen 250.000 kr i omsætning', f: (s) => [s.stats.revenue, 250000] },
    { text: 'Send 1.000 ordrer', f: (s) => [s.stats.shipped, 1000] },
  ] },
  { name: 'Danmarks lykkeligste webshop', icon: '👑', reward: { money: 100000, gems: 20 }, goals: [
    { text: 'Tjen 1 mio. kr i omsætning', f: (s) => [s.stats.revenue, 1000000] },
    { text: 'Nå level 20', f: (s) => [s.level, 20] },
    { text: 'Hav 90 i kundetilfredshed', f: (s) => [Math.round(s.satisfaction), 90] },
  ] },
];
export const BOX_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ x: 11.8 + (i % 4) * 1.3, z: 2.2 + Math.floor(i / 4) * 1.3 }));
export const DELIVERY_SPOT = { x: 13.75, z: 5.0 };
export const PALLET = { x: 16.6, z: 15.7 };
// The working day runs 07:00–18:30 in half-hour slots. A shift is at most 8 hours (70 % of the day)
// and includes a break of 10 % of the shift in the middle. Wages follow the hours.
export const SHIFT = { from: 7, slots: 23, max: 16, min: 2, pause: 0.1 };
// Where staff come in and leave: the north door in the front wall.
export const DOOR = { x: 17.4, z: 3.2 };
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
  returns: {
    name: 'Produktsider', icon: '📏', fmt: (v) => `Returrate ×${v}`,
    levels: [
      { name: 'Kun et billede', cost: 0, lvl: 1, val: 1 },
      { name: 'Størrelsesguide', cost: 1500, lvl: 3, val: 0.8 },
      { name: 'Flere billeder & video', cost: 5000, lvl: 6, val: 0.65 },
      { name: 'Anmeldelser & pasform-hjælp', cost: 14000, lvl: 10, val: 0.5 },
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
  { id: 'fb', name: 'Facebook-annoncer', icon: '📣', desc: `+50 % trafik i ${gameTime(90)}`, money: 600, lvl: 1, boost: { kind: 'traffic', mult: 0.5, dur: 90 } },
  { id: 'google', name: 'Google Shopping', icon: '🔎', desc: `+80 % trafik i ${gameTime(120)}`, money: 2000, lvl: 4, boost: { kind: 'traffic', mult: 0.8, dur: 120 } },
  { id: 'influencer', name: 'Influencer-samarbejde', icon: '🤳', desc: `+150 % trafik i ${gameTime(90)}`, gems: 8, lvl: 1, boost: { kind: 'traffic', mult: 1.5, dur: 90 } },
  { id: 'express', name: 'Express-levering', icon: '⚡', desc: 'Alle varer på vej ankommer med det samme', gems: 2, lvl: 1, action: 'express' },
  { id: 'cash', name: 'Investor-møde', icon: '💼', desc: 'Få 5.000 kr til virksomheden', gems: 10, lvl: 1, action: 'cash' },
];

const empCount = (s, role) => s.employees.filter((e) => e.role === role).length;

// target: world hint for quest arrow, tab: UI hint
export const QUESTS = [
  { text: 'Indret dit lager: placér starterkittet', goal: (s) => [s.furniture.length, 3], reward: { xp: 10 } },
  { text: 'Se chefen samle kassen op ved varemodtagelsen', goal: (s) => [s.stats.boxesPicked, 1], reward: { xp: 10 }, target: 'delivery' },
  { text: 'Chefen lægger T-shirts på lagerreolen', goal: (s) => [s.stats.unitsStocked, 10], reward: { xp: 10 }, target: 'shelf' },
  { text: 'Vent på en ordre – chefen henter varen på reolen', goal: (s) => [s.stats.itemsPicked, 1], reward: { xp: 10 }, target: 'shelf' },
  { text: 'Chefen pakker ordren ved pakkebordet', goal: (s) => [s.stats.shipped, 1], reward: { money: 200 }, target: 'table' },
  { text: 'Chefen arbejder på webshoppen ved computeren', goal: (s) => [s.stats.webshopWork, 1], reward: { money: 100 }, target: 'desk' },
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
  Object.values(FURNITURE).forEach((F) => !F.slots && F.lvl[0] === level && level > 1 && out.push(`${F.icon} ${F.name}`));
  return out;
}
