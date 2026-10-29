// LykkeSpillet server: serves the built game (dist/) and a tiny account + cloud-save API.
// No dependencies – plain Node 20. Data lives in DATA_DIR (mount a volume there on Sliplane).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const PORT = Number(process.env.PORT || 3000);
const SESSION_DAYS = 60;
const MAX_SAVE = 2 * 1024 * 1024;

fs.mkdirSync(path.join(DATA, 'saves'), { recursive: true });

// ---------- tiny JSON "database" (atomic writes) ----------
const file = (name) => path.join(DATA, name);
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
function writeAtomic(f, text) {
  const tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, f);
}
const users = readJson(file('users.json'), {});
const sessions = readJson(file('sessions.json'), {});
const saveUsers = () => writeAtomic(file('users.json'), JSON.stringify(users));
const saveSessions = () => writeAtomic(file('sessions.json'), JSON.stringify(sessions));
// Usernames are case-insensitive; the save file name is a hash so any characters are safe.
const keyOf = (name) => name.trim().toLowerCase();
const saveFile = (key) => path.join(DATA, 'saves', `${crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)}.json`);

// ---------- passwords & sessions ----------
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 64).toString('hex');
function checkPass(u, pass) {
  const a = Buffer.from(hashPass(pass, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function newSession(key) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions[token] = { key, exp: Date.now() + SESSION_DAYS * 864e5 };
  saveSessions();
  return token;
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function userOf(req) {
  const t = cookies(req).ls_session, s = t && sessions[t];
  if (!s) return null;
  if (s.exp < Date.now()) { delete sessions[t]; saveSessions(); return null; }
  return users[s.key] ? { key: s.key, token: t } : null;
}
function sessionCookie(req, token, maxAge) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '';
  return `ls_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// Simple brute-force brake: 10 login/register attempts per IP per minute.
const attempts = new Map();
function tooMany(req) {
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const now = Date.now(), a = (attempts.get(ip) || []).filter((t) => now - t < 60e3);
  a.push(now);
  attempts.set(ip, a);
  return a.length > 10;
}

// ---------- http helpers ----------
const send = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const NAME_RE = /^[\p{L}\p{N}_.-]{3,20}$/u;

// ---------- API ----------
async function api(req, res, route) {
  const me = userOf(req);
  if (route === 'me' && req.method === 'GET') return me ? send(res, 200, { user: users[me.key].name }) : send(res, 401, { error: 'Ikke logget ind' });

  if ((route === 'register' || route === 'login') && req.method === 'POST') {
    if (tooMany(req)) return send(res, 429, { error: 'For mange forsøg – vent et minut' });
    let body;
    try { body = JSON.parse(await readBody(req, 10e3)); } catch { return send(res, 400, { error: 'Ugyldig forespørgsel' }); }
    const name = String(body.user || '').trim(), pass = String(body.pass || ''), key = keyOf(name);
    if (route === 'register') {
      if (!NAME_RE.test(name)) return send(res, 400, { error: 'Brugernavnet skal være 3–20 tegn (bogstaver, tal, _ . -)' });
      if (pass.length < 6) return send(res, 400, { error: 'Koden skal være mindst 6 tegn' });
      if (users[key]) return send(res, 409, { error: 'Brugernavnet er taget' });
      const salt = crypto.randomBytes(16).toString('hex');
      users[key] = { name, salt, hash: hashPass(pass, salt), created: new Date().toISOString() };
      saveUsers();
    } else if (!users[key] || !checkPass(users[key], pass)) return send(res, 401, { error: 'Forkert brugernavn eller kode' });
    const token = newSession(key);
    return send(res, 200, { user: users[key].name }, { 'Set-Cookie': sessionCookie(req, token, SESSION_DAYS * 86400) });
  }

  if (route === 'logout' && req.method === 'POST') {
    if (me) { delete sessions[me.token]; saveSessions(); }
    return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }

  if (route === 'save') {
    if (!me) return send(res, 401, { error: 'Ikke logget ind' });
    const f = saveFile(me.key);
    // rev = file mtime; a PUT must name the rev it was based on, so an older tab can't overwrite newer progress.
    const rev = () => (fs.existsSync(f) ? fs.statSync(f).mtimeMs : 0);
    if (req.method === 'GET') {
      if (!fs.existsSync(f)) return send(res, 200, { save: null, rev: 0 });
      return send(res, 200, `{"save":${JSON.stringify(fs.readFileSync(f, 'utf8'))},"rev":${rev()}}`);
    }
    if (req.method === 'PUT') {
      if (Number(req.headers['x-save-rev'] || 0) !== rev()) return send(res, 409, { error: 'Spillet er gemt fra et andet sted' });
      let text;
      try { text = await readBody(req, MAX_SAVE); JSON.parse(text); } catch { return send(res, 400, { error: 'Ugyldigt gem' }); }
      writeAtomic(f, text);
      return send(res, 200, { rev: rev() });
    }
    if (req.method === 'DELETE') { fs.rmSync(f, { force: true }); return send(res, 200, { ok: true }); }
  }
  return send(res, 404, { error: 'Ukendt' });
}

// ---------- static files ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function serveStatic(req, res, urlPath) {
  let f = path.normalize(path.join(DIST, decodeURIComponent(urlPath)));
  if (!f.startsWith(DIST)) return send(res, 403, { error: 'Nej' });
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  const ext = path.extname(f);
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
  fs.createReadStream(f).pipe(res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const m = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (m) return await api(req, res, m[1]);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Nej' });
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Serverfejl' });
  }
}).listen(PORT, () => console.log(`LykkeSpillet kører på :${PORT} · data i ${DATA}`));
