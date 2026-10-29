// Accounts and cloud saves. Only active when the game is served by server/index.js (e.g. on Sliplane);
// on static hosting (GitHub Pages, vite dev) there is no API and the game just saves in the browser.
import { SAVE_KEY, setSaveKey, setResetHook } from './state.js';

const api = (p, opts = {}) => fetch(`api/${p}`, { credentials: 'same-origin', ...opts });
const SYNC_MS = 15000;

export const cloud = { user: null, rev: 0, last: null, stopped: false };

export async function startCloud() {
  let r;
  try { r = await api('me'); } catch { return null; }
  // Static hosting answers with index.html or a 404 – no account system there.
  if (!(r.headers.get('content-type') || '').includes('application/json') || r.status === 404) return null;
  cloud.user = r.ok ? (await r.json()).user : await loginScreen();
  const guestKey = SAVE_KEY;
  const key = `${guestKey}:${cloud.user.toLowerCase()}`;
  setSaveKey(key);
  const { save, rev } = await (await api('save')).json();
  cloud.rev = rev;
  if (save) localStorage.setItem(key, save);
  else if (!localStorage.getItem(key) && localStorage.getItem(guestKey)) localStorage.setItem(key, localStorage.getItem(guestKey)); // bring a guest game into the new account
  cloud.last = save;
  setInterval(sync, SYNC_MS);
  // Claim the save right away, so an older tab or device left open stops instead of overwriting this one.
  setTimeout(() => sync(false, true), 1500);
  // main.js saves on these events first; sync right after.
  addEventListener('visibilitychange', () => document.hidden && setTimeout(sync, 0));
  addEventListener('pagehide', () => setTimeout(() => sync(true), 0));
  setResetHook(async () => { await api('save', { method: 'DELETE' }); cloud.rev = 0; cloud.last = null; });
  return cloud.user;
}

export async function sync(leaving = false, force = false) {
  if (cloud.stopped) return;
  const text = localStorage.getItem(SAVE_KEY);
  if (!text || (text === cloud.last && !force)) return;
  const pending = text;
  try {
    const r = await api('save', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Save-Rev': String(cloud.rev) }, body: pending, keepalive: leaving && pending.length < 60000 });
    if (r.status === 409) return conflict();
    if (r.ok) { cloud.rev = (await r.json()).rev; cloud.last = pending; }
  } catch { /* offline – try again next time */ }
}

export async function logout() {
  await sync();
  await api('logout', { method: 'POST' });
  location.reload();
}

// Another device (or tab) saved newer progress: stop here so we don't overwrite it.
function conflict() {
  cloud.stopped = true;
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="card-modal"><div class="burst">📱</div><h2>Spillet er åbnet et andet sted</h2>
    <p>Du har spillet videre på en anden enhed eller fane. Genindlæs for at hente det nyeste.</p>
    <button class="btn big" onclick="location.reload()">Genindlæs</button></div>`;
  m.classList.add('show');
}

function loginScreen() {
  return new Promise((resolve) => {
    let mode = 'login';
    const el = document.createElement('div');
    el.id = 'login';
    document.getElementById('app').appendChild(el);
    const render = (err = '') => {
      const reg = mode === 'register';
      el.innerHTML = `<form class="cr-card">
        <div class="lg-logo">🛍️</div>
        <h2>LykkeSpillet</h2>
        <p class="tip">${reg ? 'Opret en bruger, så du kan spille videre fra alle dine enheder.' : 'Log ind for at spille videre, hvor du slap.'}</p>
        <label class="cr-name">Brugernavn<input name="user" autocomplete="username" maxlength="20" required></label>
        <label class="cr-name">Kode<input name="pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" minlength="${reg ? 6 : 1}" required></label>
        ${err ? `<p class="lg-err">${err}</p>` : ''}
        <button class="btn big wide" type="submit">${reg ? 'Opret bruger' : 'Log ind'}</button>
        <button class="lg-switch" type="button">${reg ? 'Har du allerede en bruger? Log ind' : 'Ny spiller? Opret en bruger'}</button>
      </form>`;
      const form = el.querySelector('form');
      el.querySelector('.lg-switch').onclick = () => { mode = reg ? 'login' : 'register'; render(); };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('[type=submit]');
        btn.disabled = true;
        try {
          const r = await api(mode, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: form.user.value, pass: form.pass.value }) });
          const j = await r.json();
          if (!r.ok) { const u = form.user.value; render(j.error || 'Noget gik galt'); el.querySelector('[name=user]').value = u; return; }
          el.remove();
          resolve(j.user);
        } catch { render('Kunne ikke få forbindelse – prøv igen'); }
      };
      setTimeout(() => el.querySelector('[name=user]')?.focus(), 50);
    };
    render();
  });
}
