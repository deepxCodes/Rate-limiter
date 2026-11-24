'use strict';

const API_BASE = window.API_BASE || '';
const $ = (sel) => document.querySelector(sel);
const RING = 326.7;

const state = {
  api: null, db: 'connecting', dbName: null, collection: null,
  limit: null, windowMs: null, windowEnd: null, offset: 0,
  used: null, last: null, lastHealthAt: 0,
};
const STATUS_TEXT = { 200: 'OK', 429: 'TOO MANY REQUESTS', 503: 'DB UNAVAILABLE', 0: 'NO RESPONSE' };

const serverNow = () => Date.now() + state.offset;
const secondsLeft = () => (state.windowEnd ? Math.max(0, Math.ceil((state.windowEnd - serverNow()) / 1000)) : null);
const pad = (n) => (n === null ? '--' : String(n).padStart(2, '0'));
const stamp = () => new Date().toLocaleTimeString([], { hour12: false });

async function loadHealth() {
  state.lastHealthAt = Date.now();
  try {
    const res = await fetch(`${API_BASE}/api/health`, { cache: 'no-store' });
    const h = await res.json();
    state.api = true;
    state.offset = h.serverTime - Date.now();
    state.limit = h.rateLimit.limit;
    state.windowMs = h.rateLimit.windowSeconds * 1000;
    state.windowEnd = h.rateLimit.windowEnd;
    state.db = h.database.state;
    state.dbName = h.database.name;
    state.collection = h.database.collection;
    if (h.client) state.used = h.client.used;
  } catch {
    state.api = false;
    state.db = 'unreachable';
  }
  render();
}

async function sendRequest() {
  const btn = $('#send');
  btn.disabled = true;
  const t0 = performance.now();
  log([[`[${stamp()}] `, 't'], ['GET /api/test', 'h']]);
  let code = 0;
  try {
    const res = await fetch(`${API_BASE}/api/test`, { cache: 'no-store' });
    const ms = Math.round(performance.now() - t0);
    code = res.status;
    const limit = res.headers.get('RateLimit-Limit');
    const remaining = res.headers.get('RateLimit-Remaining');
    if (limit !== null && remaining !== null) {
      state.limit = Number(limit);
      state.used = state.limit - Number(remaining);
    }
    const cls = code === 200 ? 'ok' : code === 429 ? 'bad' : 'err';
    log([[`> HTTP ${code} ${res.statusText || STATUS_TEXT[code] || ''} (${ms} ms)`, cls]]);
    ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'].forEach((name) => {
      const v = res.headers.get(name);
      if (v !== null) log([[`  ${name}: ${v}`, 'h']]);
    });
    log([[`  ${(await res.text()).trim()}`, 't']]);
    if (code === 503) loadHealth();
  } catch (err) {
    log([['> NETWORK ERROR: server not reachable', 'err']]);
    state.api = false;
  }
  state.last = code;
  addBlock(code);
  btn.disabled = false;
  render();
}

function log(parts) {
  const term = $('#console');
  const line = document.createElement('div');
  parts.forEach(([text, cls]) => {
    const s = document.createElement('span');
    s.className = cls; s.textContent = text; line.append(s);
  });
  term.append(line);
  while (term.children.length > 120) term.firstChild.remove();
  term.scrollTop = term.scrollHeight;
}

function addBlock(code) {
  const blocks = $('#blocks');
  const b = document.createElement('i');
  b.className = `s${code}`; b.title = `${stamp()} · ${code || 'no reply'}`;
  blocks.append(b);
  while (blocks.children.length > 36) blocks.firstChild.remove();
  const viz = $('#viz');
  viz.classList.remove('go'); void viz.offsetWidth; viz.classList.add('go');
}

function setText(sel, text) {
  const el = $(sel);
  if (el.textContent !== text) {
    el.textContent = text;
    if (el.tagName === 'B' && sel === '#used') { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  }
}

function render() {
  const ok = state.db === 'connected';
  $('#dbChip').dataset.s = ok ? 'connected' : state.db === 'connecting' ? '' : 'bad';
  setText('#dbText', `MONGODB: ${state.db.toUpperCase()}`);
  setText('#dbState', state.db.toUpperCase());
  setText('#dbName', state.dbName || '--');
  setText('#dbColl', state.collection || '--');
  setText('#apiState', state.api === null ? 'CONNECTING' : state.api ? 'ONLINE' : 'UNREACHABLE');

  const remaining = state.used === null || state.limit === null ? null : Math.max(0, state.limit - state.used);
  setText('#used', pad(state.used));
  setText('#max', pad(state.limit));
  setText('#remaining', pad(remaining));
  if (state.limit) {
    const segs = $('#segs');
    if (segs.children.length !== state.limit) {
      segs.innerHTML = '';
      for (let i = 0; i < state.limit; i++) segs.append(Object.assign(document.createElement('i'), { className: 'seg' }));
    }
    [...segs.children].forEach((s, i) => s.classList.toggle('on', i < (state.used || 0)));
    $('#win-limiter').classList.toggle('full', remaining === 0);
    setText('#rule', `FIXED WINDOW · ${state.limit} REQ / ${state.windowMs / 1000} SEC · KEY = CLIENT IP`);
  }

  const st = $('#status');
  st.dataset.code = state.last === null ? 'idle' : String(state.last);
  st.querySelector('b').textContent = state.last === null ? '---' : state.last === 0 ? 'ERR' : state.last;
  st.querySelector('span').textContent = state.last === null ? 'AWAITING INPUT' : STATUS_TEXT[state.last] || '';
  tickCountdown();
  $('#track').innerHTML = tickerHtml();
}

function tickCountdown() {
  const left = secondsLeft();
  setText('#secs', pad(left));
  if (left !== null && state.windowMs) {
    const frac = Math.min(1, Math.max(0, (state.windowEnd - serverNow()) / state.windowMs));
    $('#prog').style.strokeDashoffset = String(RING * (1 - frac));
  }
  const hint = $('#hint');
  hint.textContent = state.last === 429 && left ? `BLOCKED · RETRY IN ${left}s` : 'GET /api/test';
  hint.style.color = state.last === 429 && left ? 'var(--status-blocked)' : '';
}

function tickerHtml() {
  const used = state.used === null ? '--' : state.used;
  const parts = [
    `SYSTEM ${state.api ? 'ONLINE' : state.api === null ? 'BOOTING' : 'API UNREACHABLE'}`,
    `MONGODB ${state.db.toUpperCase()}`,
    `QUOTA ${used}/${state.limit ?? '--'}`,
    `LAST RESPONSE ${state.last === null ? 'NONE' : state.last || 'NO REPLY'}`,
    `NEXT WINDOW IN ${pad(secondsLeft())}s`,
  ];
  return parts.map((p) => `${p}<b>///</b>`).join('');
}

let zTop = 10;
const isDesktop = () => window.matchMedia('(min-width: 901px)').matches;
function focusWin(win) { win.style.zIndex = ++zTop; }

function openWin(name) {
  const win = $(`#win-${name}`);
  win.hidden = false; win.classList.remove('min');
  focusWin(win);
  if (!isDesktop()) win.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.querySelectorAll('.icon').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.open;
    if (target === 'tester') { openWin('tester'); openWin('console'); } else if (target === 'limiter') { openWin('limiter'); } else openWin(target);
  });
});

document.querySelectorAll('.win').forEach((win) => {
  win.addEventListener('pointerdown', () => focusWin(win));
  win.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.act === 'close') win.hidden = true; else win.classList.toggle('min');
  }));

  const bar = win.querySelector('.titlebar');
  let sx = 0, sy = 0, x = 0, y = 0, dragging = false;
  bar.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button') || !isDesktop()) return;
    dragging = true; sx = e.clientX - x; sy = e.clientY - y; bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    x = e.clientX - sx; y = e.clientY - sy;
    win.style.transform = `translate(${x}px, ${y}px)`;
  });
  bar.addEventListener('pointerup', () => { dragging = false; });
});

$('#send').addEventListener('click', sendRequest);
log([[`[${stamp()}] RATELIMIT.OS ready. Press SEND REQUEST.`, 't']]);

setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 1000);
setInterval(() => {
  tickCountdown();
  if (state.windowEnd && serverNow() >= state.windowEnd && Date.now() - state.lastHealthAt > 2000) loadHealth();
}, 250);
setInterval(loadHealth, 10000);
setInterval(() => { $('#track').innerHTML = tickerHtml(); }, 5000);
$('#clock').textContent = new Date().toLocaleTimeString([], { hour12: false });
loadHealth();
