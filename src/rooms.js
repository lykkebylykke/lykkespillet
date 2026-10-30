// Floor tiles, inner walls and doors, and the rooms they make. Kept free of Three.js so the simulation can use it.
// A wall sits on the edge between two owned 2×2 m tiles:
//   h:i,j – along z = j·TILE, between tile (i, j−1) and (i, j)
//   v:i,j – along x = i·TILE, between tile (i−1, j) and (i, j)
// s.walls maps such an edge to 'wall' or 'door'.
export const TILE = 2;
export const tileKey = (i, j) => `${i},${j}`;
export const isBaseTile = (i, j) => i >= 0 && i < 9 && j >= 0 && j < 10;
export const WALL_T = 0.18;

const tileSets = new WeakMap();
export function ownsTile(s, i, j) {
  if (isBaseTile(i, j)) return true;
  let c = tileSets.get(s);
  if (!c || c.n !== s.tiles.length) { c = { n: s.tiles.length, set: new Set(s.tiles) }; tileSets.set(s, c); }
  return c.set.has(tileKey(i, j));
}

export const parseEdge = (k) => { const [d, rest] = k.split(':'), [i, j] = rest.split(',').map(Number); return { d, i, j }; };
// The two tiles an edge separates.
export const edgeTiles = (k) => { const { d, i, j } = parseEdge(k); return d === 'h' ? [[i, j - 1], [i, j]] : [[i - 1, j], [i, j]]; };
export const isInnerEdge = (s, k) => edgeTiles(k).every(([i, j]) => ownsTile(s, i, j));

// The solid box of a wall segment (a door leaves the middle open).
export function edgeBox(k, grow = 0) {
  const { d, i, j } = parseEdge(k), h = WALL_T / 2 + grow;
  return d === 'h'
    ? { minX: i * TILE - h, maxX: (i + 1) * TILE + h, minZ: j * TILE - h, maxZ: j * TILE + h }
    : { minX: i * TILE - h, maxX: i * TILE + h, minZ: j * TILE - h, maxZ: (j + 1) * TILE + h };
}

// The edge closest to a ground point (null when the point is near no edge).
export function edgeAt(x, z, max = 0.7) {
  const dh = Math.abs(z - Math.round(z / TILE) * TILE), dv = Math.abs(x - Math.round(x / TILE) * TILE);
  if (Math.min(dh, dv) > max) return null;
  return dh <= dv ? `h:${Math.floor(x / TILE)},${Math.round(z / TILE)}` : `v:${Math.round(x / TILE)},${Math.floor(z / TILE)}`;
}

// Tile → room number. Walls and doors both split rooms (a door connects two rooms, it doesn't merge them).
const roomCache = new WeakMap();
export function roomMap(s) {
  const sig = s.tiles.length + JSON.stringify(s.walls);
  const c = roomCache.get(s);
  if (c?.sig === sig) return c.map;
  const map = new Map(), all = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 10; j++) all.push([i, j]);
  for (const k of s.tiles) all.push(k.split(',').map(Number));
  let n = 0;
  for (const [i0, j0] of all) {
    if (map.has(tileKey(i0, j0))) continue;
    const q = [[i0, j0]];
    map.set(tileKey(i0, j0), n);
    while (q.length) {
      const [i, j] = q.pop();
      for (const [di, dj, e] of [[1, 0, `v:${i + 1},${j}`], [-1, 0, `v:${i},${j}`], [0, 1, `h:${i},${j + 1}`], [0, -1, `h:${i},${j}`]]) {
        const a = i + di, b = j + dj, key = tileKey(a, b);
        if (!ownsTile(s, a, b) || map.has(key) || s.walls[e]) continue;
        map.set(key, n);
        q.push([a, b]);
      }
    }
    n++;
  }
  roomCache.set(s, { sig, map });
  return map;
}
export const roomAt = (s, x, z) => roomMap(s).get(tileKey(Math.floor(x / TILE), Math.floor(z / TILE)));
