/* J.A.R.V.I.S. HUD page (jarvis.html). Loads BEFORE app.js.
   - keeps the engine from popping the Systems drawer open
   - tells the graph where its free area is (between the columns, above the dock)
   - draws the reactor behind the graph, ring gauges, ruler/clock, weather, timers, markets and headlines
   It only reads state; the engine in app.js still does the graph, chat, voice, Google and services. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2, CY = [92, 242, 255];
  const rgba = (a, c = CY) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isNarrow = () => window.innerWidth < 1100;
  const St = () => window.BRAIN_STATE;
  const panel = $('#panel');

  /* ---------- Systems drawer: the engine "opens the panel" on every answer; here the drawer is only opened by the user ---------- */
  ['add', 'remove', 'toggle'].forEach((m) => { panel.classList[m] = () => false; });
  const drawer = (open) => { panel.toggleAttribute('data-open', open); };
  $('#btnPanel').addEventListener('click', () => drawer(!panel.hasAttribute('data-open')));
  $('#drawerX').addEventListener('click', () => drawer(false));
  $('#search').addEventListener('focus', () => drawer(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') drawer(false); });
  document.addEventListener('click', (e) => {            // tap the graph = close the drawer
    if (panel.hasAttribute('data-open') && !panel.contains(e.target) && !e.target.closest('#bar')) drawer(false);
  });

  /* ---------- graph free area ---------- */
  function box(sel) { const e = $(sel); if (!e || getComputedStyle(e).display === 'none') return null; return e.getBoundingClientRect(); }
  function area() {
    const W = window.innerWidth, H = window.innerHeight, L = box('#colL'), R = box('#colR'), D = box('#dock');
    const narrow = isNarrow();
    return {
      x0: L && !narrow ? L.right + 8 : 0, x1: R && !narrow ? R.left - 8 : W,
      y0: 52, y1: D ? D.top - 8 : H
    };
  }
  window.JV_AREA = area;
  document.body.append($('#orb'));                           // the orb floats over the 3D reactor core, outside the dock
  window.BRAIN_USABLE = () => {                              // the graph fits inside the reactor, a little smaller than the free area
    const a = area(), top = a.y0 + 40, w = (a.x1 - a.x0) * 0.88, h = (a.y1 - top) * 0.88, cx = (a.x0 + a.x1) / 2, cy = (top + a.y1) / 2;
    return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
  };
  function clipGraph() {                                     // nothing is drawn under the columns or the dock
    const a = area(), c = $('#c'); if (!c) return;
    c.style.clipPath = `inset(${a.y0}px ${Math.max(0, window.innerWidth - a.x1)}px ${Math.max(0, window.innerHeight - a.y1)}px ${a.x0}px)`;
  }

  /* ---------- ruler + clock ---------- */
  function buildRuler() {
    const days = $('#days'); if (!days) return;
    const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), today = now.getDate();
    days.replaceChildren();
    for (let d = 1; d <= dim; d++) {
      const s = document.createElement('span'); s.textContent = String(d).padStart(2, '0');
      if (d === today) s.className = 'on'; else if (d < today) s.className = 'past';
      days.append(s);
    }
    const cap = $('#capDate'); if (cap) cap.textContent = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
  }
  function tickClock() {
    const n = new Date();
    $('#clockT').textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    $('#clockD').textContent = n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  }

  /* ---------- reactor behind the graph ---------- */
  const bg = $('#hudbg'), g = bg.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const dots = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.012, r: 0.6 + Math.random() * 1.4 }));
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr); bg.style.width = W + 'px'; bg.style.height = H + 'px';
  }
  const arc = (c, cy, r, a0, a1) => { g.beginPath(); g.arc(c, cy, r, a0, a1); g.stroke(); };
  function drawBg(now) {
    const t = reduce ? 0 : now / 1000;
    const orbEl = $('#orb'), state = (orbEl && orbEl.dataset.state) || 'idle';
    const boost = state === 'thinking' ? 3 : state === 'listening' ? 1.8 : state === 'speaking' ? 1.4 : 1;
    const hot = state === 'thinking' ? [255, 196, 70] : state === 'listening' ? [120, 190, 255] : CY;
    const A = area(), cx = (A.x0 + A.x1) / 2, cy = (A.y0 + 40 + A.y1) / 2, R = Math.min(A.x1 - A.x0, A.y1 - A.y0 - 40) * 0.5;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);

    g.lineWidth = 1; g.strokeStyle = rgba(0.035); g.beginPath();
    for (let x = (cx % 56) - 56; x < W; x += 56) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = (cy % 56) - 56; y < H; y += 56) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();

    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, rgba(0.11, hot)); gr.addColorStop(0.55, rgba(0.04, hot)); gr.addColorStop(1, rgba(0));
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

    if (window.JV_FALLBACK) {   // flat 2D rings only if WebGL / three.js is unavailable
    const spin = t * 0.05 * boost;
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * TAU + spin, major = i % 15 === 0, mid = i % 5 === 0, r1 = R - (major ? 16 : mid ? 10 : 5);
      g.strokeStyle = rgba(major ? 0.5 : mid ? 0.28 : 0.15, hot); g.lineWidth = major ? 2 : 1;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    g.lineCap = 'butt';
    for (const [k, w, al, sp] of [[0.90, 7, 0.22, 0.20], [0.82, 3, 0.30, -0.30], [0.70, 10, 0.16, 0.12]]) {
      g.lineWidth = w; g.strokeStyle = rgba(al, hot);
      for (let i = 0; i < 6; i++) { const a0 = (i / 6) * TAU + t * sp * boost * 0.4 + k * 3; arc(cx, cy, R * k, a0, a0 + TAU / 6 * (0.35 + 0.35 * ((i * 7 + Math.round(k * 10)) % 3) / 2)); }
    }
    g.lineWidth = 1;
    for (const k of [0.62, 0.46, 0.30]) { g.strokeStyle = rgba(0.12, hot); arc(cx, cy, R * k, 0, TAU); }
    g.save(); g.setLineDash([2, 9]); g.strokeStyle = rgba(0.3, hot); g.lineWidth = 2; arc(cx, cy, R * 0.94, -spin * 2, -spin * 2 + TAU); g.restore();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,77,77,0.7)'; arc(cx, cy, R * 0.76, t * 0.12 * boost + 4.1, t * 0.12 * boost + 4.55);

    g.lineWidth = 1; g.strokeStyle = rgba(0.10, hot); g.beginPath();
    g.moveTo(cx - R * 1.04, cy); g.lineTo(cx + R * 1.04, cy); g.moveTo(cx, cy - R * 1.04); g.lineTo(cx, cy + R * 1.04); g.stroke();
    g.strokeStyle = rgba(0.3, hot); g.beginPath();
    for (let i = -10; i <= 10; i++) { const o = (i / 10) * R * 0.95, l = i % 5 === 0 ? 7 : 3; g.moveTo(cx + o, cy - l); g.lineTo(cx + o, cy + l); g.moveTo(cx - l, cy + o); g.lineTo(cx + l, cy + o); }
    g.stroke();

    const s = St();
    g.font = '11px "Share Tech Mono", ui-monospace, Menlo, monospace'; g.fillStyle = rgba(0.55, hot); g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText('NODES ' + String(s ? s.nodes.length : 0).padStart(3, '0'), cx + R * 0.72 + 6, cy - R * 0.18);
    g.fillText('LINKS ' + String(s ? s.links.length : 0).padStart(3, '0'), cx + R * 0.72 + 6, cy - R * 0.18 + 14);
    g.textAlign = 'right'; g.fillText('YAW ' + String(Math.round((((window.BRAIN_CAM || {}).yaw || 0) * 57.3) % 360)).padStart(3, '0'), cx - R * 0.72 - 6, cy + R * 0.18);
    g.textAlign = 'center'; g.fillText(state.toUpperCase(), cx, cy - R - 12);
    }

    g.fillStyle = rgba(0.35, hot);
    for (const d of dots) { d.y -= d.v * 0.016 * (reduce ? 0 : 1); if (d.y < 0) { d.y = 1; d.x = Math.random(); } g.beginPath(); g.arc(d.x * W, d.y * H, d.r, 0, TAU); g.fill(); }

    const m = 10, L = 26, top = 50;
    g.strokeStyle = rgba(0.45); g.lineWidth = 2; g.beginPath();
    g.moveTo(m, top + L); g.lineTo(m, top); g.lineTo(m + L, top); g.moveTo(W - m - L, top); g.lineTo(W - m, top); g.lineTo(W - m, top + L);
    g.moveTo(m, H - m - L); g.lineTo(m, H - m); g.lineTo(m + L, H - m); g.moveTo(W - m - L, H - m); g.lineTo(W - m, H - m); g.lineTo(W - m, H - m - L);
    g.stroke();
  }

  /* ---------- ring gauges ---------- */
  const SZ = 120;
  let battery = null;
  if (navigator.getBattery) navigator.getBattery().then((b) => { battery = b; }).catch(() => {});
  const gauges = Array.from(document.querySelectorAll('canvas.gc')).map((cv) => { cv.width = SZ * 2; cv.height = SZ * 2; return { cv, g: cv.getContext('2d'), k: cv.dataset.k }; });
  function ring(c, x, r, w, frac, a) {
    c.lineWidth = w; c.lineCap = 'butt';
    c.strokeStyle = rgba(0.13); c.beginPath(); c.arc(x, x, r, 0, TAU); c.stroke();
    c.strokeStyle = rgba(a); c.beginPath(); c.arc(x, x, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, Math.min(1, frac))); c.stroke();
  }
  function aiMode() {
    const has = (k) => { try { return !!localStorage.getItem(k); } catch (e) { return false; } };
    if (has('brain.olOn') && localStorage.getItem('brain.olOn') === '1') return ['LOCAL', 1];
    if (has('brain.groq')) return ['KEY', 1];
    if (window.BRAIN_CONFIG && window.BRAIN_CONFIG.chatUrl) return ['CLOUD', 0.85];
    return ['NOTES', 0.3];
  }
  function drawGauge(o) {
    const c = o.g, X = SZ, s = St(), now = new Date();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, SZ * 2, SZ * 2);
    let frac = 0, big = '', sub = '', inner = null;
    if (o.k === 'time') {
      frac = (now.getSeconds() + now.getMilliseconds() / 1000) / 60; inner = (now.getMinutes() + now.getSeconds() / 60) / 60;
      big = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'); sub = String(now.getSeconds()).padStart(2, '0');
    } else if (o.k === 'date') {
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      frac = now.getDate() / dim; big = String(now.getDate()); sub = now.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
    } else if (o.k === 'notes') {
      const tot = s ? s.nodes.length : 0, vis = s ? s.vis.length : 0; frac = tot ? vis / tot : 0; big = String(tot); sub = vis + ' SHOWN';
    } else if (o.k === 'links') {
      const n = s ? s.nodes.length : 0, l = s ? s.links.length : 0; frac = n ? Math.min(1, l / (n * 4)) : 0; big = String(l); sub = (n ? (l / n).toFixed(1) : '0.0') + '/NODE';
    } else if (o.k === 'power') {
      if (battery) { frac = battery.level; big = Math.round(battery.level * 100) + '%'; sub = battery.charging ? 'CHARGING' : 'BATTERY'; }
      else { frac = navigator.onLine ? 1 : 0.05; big = navigator.onLine ? 'ON' : 'OFF'; sub = 'NETWORK'; }
      const cap = $('#capPower'); if (cap) cap.textContent = battery ? 'POWER' : 'NETWORK';
    } else {
      const [m, f] = aiMode(); frac = f; big = m; sub = 'MODE';
    }
    c.strokeStyle = rgba(0.28); c.lineWidth = 2;
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, r0 = X - 4, r1 = r0 - (i % 4 === 0 ? 9 : 5); c.beginPath(); c.moveTo(X + Math.cos(a) * r0, X + Math.sin(a) * r0); c.lineTo(X + Math.cos(a) * r1, X + Math.sin(a) * r1); c.stroke(); }
    ring(c, X, X - 24, 9, frac, 0.92);
    if (inner != null) ring(c, X, X - 40, 4, inner, 0.6); else { c.strokeStyle = rgba(0.18); c.lineWidth = 1; c.beginPath(); c.arc(X, X, X - 40, 0, TAU); c.stroke(); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = rgba(1); c.shadowColor = rgba(0.8); c.shadowBlur = 10;
    c.font = `700 ${big.length > 4 ? 42 : big.length > 3 ? 50 : 58}px Rajdhani, system-ui, sans-serif`; c.fillText(big, X, X - 8);
    c.shadowBlur = 0; c.fillStyle = rgba(0.6); c.font = '600 20px "Share Tech Mono", ui-monospace, monospace'; c.fillText(sub, X, X + 34);
  }

  /* ---------- weather (Open-Meteo, no key). Place = the engine's saved home, else browser location, else IP ---------- */
  const GLYPH = (c) => (c <= 1 ? '☀' : c <= 3 ? '☁' : c === 45 || c === 48 ? '≈' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? '❄' : c >= 95 ? '⚡' : '☂');
  const WORD = { 0: 'Clear sky', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  async function place() {
    try { const h = JSON.parse(localStorage.getItem('brain.home') || 'null'); if (h && h.lat != null) return h; } catch (e) { /* none saved */ }
    const gps = new Promise((res) => {
      if (!navigator.geolocation) { res(null); return; }
      navigator.geolocation.getCurrentPosition((p) => res({ name: 'Your location', lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { timeout: 6000, maximumAge: 3600000 });
    });
    const limit = new Promise((res) => setTimeout(() => res(null), 7000));
    const first = await Promise.race([gps, limit]);
    if (first) return first;
    try { const r = await fetch('https://ipapi.co/json/'); const d = await r.json(); if (d && d.latitude) return { name: d.city || 'Your area', lat: d.latitude, lon: d.longitude }; } catch (e) { /* offline */ }
    return null;
  }
  async function loadWeather() {
    const now = $('#wxNow'), days = $('#wxDays');
    try {
      const p = await place();
      if (!p) { now.replaceChildren(el('span', 'muted', 'Say: "my city is Brussels"')); return; }
      const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5&wind_speed_unit=kmh');
      if (!r.ok) throw new Error('weather ' + r.status);
      const d = await r.json(), c = d.current, dd = d.daily;
      const big = el('div', 'big'); big.append(String(Math.round(c.temperature_2m)), el('small', null, '°C'));
      const txt = el('div', 'txt'); txt.append(el('b', null, WORD[c.weather_code] || 'Mixed'), 'FEELS ' + Math.round(c.apparent_temperature) + '° · WIND ' + Math.round(c.wind_speed_10m), document.createElement('br'), String(p.name).toUpperCase());
      now.replaceChildren(big, txt);
      days.replaceChildren();
      dd.time.forEach((t, i) => {
        const row = el('div', 'wxrow');
        const dt = new Date(t + 'T12:00'); const rain = dd.precipitation_probability_max[i];
        const tt = el('span', 't', Math.round(dd.temperature_2m_max[i]) + '° '); tt.append(el('i', null, '/ ' + Math.round(dd.temperature_2m_min[i]) + '°'));
        row.append(el('span', 'd', i === 0 ? 'TODAY' : dt.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()), el('span', 'g', GLYPH(dd.weather_code[i])), el('span', 'c', (WORD[dd.weather_code[i]] || 'Mixed') + (rain != null && rain >= 30 ? ' · ' + rain + '%' : '')), tt);
        days.append(row);
      });
    } catch (e) { now.replaceChildren(el('span', 'muted', 'Weather offline')); }
  }

  /* ---------- timers (the engine arms them and stores them in localStorage) ---------- */
  function tickTimers() {
    let list = []; try { list = JSON.parse(localStorage.getItem('brain.timers') || '[]'); } catch (e) { /* none */ }
    const box = $('#tmList'); const nowMs = Date.now();
    list = list.filter((t) => t.at > nowMs).sort((a, b) => a.at - b.at).slice(0, 4);
    if (!list.length) { if (!box.querySelector('.muted')) box.replaceChildren(el('span', 'muted', 'No timers running.')); return; }
    box.replaceChildren(...list.map((t) => {
      const s = Math.round((t.at - nowMs) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      const row = el('div', 'tr'); row.append(el('span', null, (t.label || (t.kind === 'timer' ? 'Timer' : 'Reminder')).slice(0, 24)), el('b', null, (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0')));
      return row;
    }));
  }
  document.querySelectorAll('.tmq button').forEach((b) => b.addEventListener('click', () => {
    const input = $('#askInput'), form = $('#askForm'); if (!input || !form) return;
    input.value = b.dataset.q; form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
  }));

  /* ---------- markets + headlines (written by the Pages workflow; the card hides itself if absent) ---------- */
  async function loadFeeds() {
    const card = $('#feeds'); if (!card) return;
    const get = (u) => fetch(u + '?t=' + Math.floor(Date.now() / 600000), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [news, mk] = await Promise.all([get('news.json'), get('markets.json')]);
    const fM = $('#fMarkets'), fN = $('#fNews'); let any = false;
    fM.replaceChildren(); fN.replaceChildren();
    if (mk && mk.quotes) for (const q of Object.values(mk.quotes).slice(0, 6)) {
      const row = el('div', 'fq'), ch = typeof q.change_pct === 'number' ? q.change_pct : null;
      const b = el('span', ch == null ? '' : ch >= 0 ? 'up' : 'dn', String(q.price) + (ch == null ? '' : '  ' + (ch >= 0 ? '▲' : '▼') + Math.abs(ch).toFixed(1) + '%'));
      row.append(el('span', null, String(q.label || q.name || '').toUpperCase().slice(0, 12)), b); fM.append(row); any = true;
    }
    if (news && news.topics) {
      const rows = []; for (const list of Object.values(news.topics)) for (const it of (list || []).slice(0, 2)) rows.push(it);
      for (const it of rows.slice(0, 6)) {
        if (!it || !it.title) continue;
        const a = el('a', 'fn', it.title); a.target = '_blank'; a.rel = 'noopener noreferrer';
        if (/^https?:\/\//.test(it.link || '')) a.href = it.link;
        a.append(el('small', null, it.source || '')); fN.append(a); any = true;
      }
    }
    card.hidden = !any;
  }

  { const sm = $('#cfg summary'); if (sm) sm.textContent = 'Voice, AI keys, wake word'; }

  // no graph on screen: stop its idle spin so the page is not redrawing a hidden canvas every frame
  { let tries = 0; const iv = setInterval(() => { const s = St(); if (s) { s.flat = true; clearInterval(iv); } else if (++tries > 100) clearInterval(iv); }, 100); }

  /* ---------- run ---------- */
  size(); buildRuler(); tickClock(); loadWeather(); loadFeeds(); tickTimers();
  window.addEventListener('resize', size);
  setInterval(tickClock, 1000); setInterval(tickTimers, 1000);
  setInterval(buildRuler, 3600000); setInterval(loadFeeds, 600000); setInterval(loadWeather, 900000);
  let lastBg = 0, lastG = 0;
  function loop(now) {
    if (!document.hidden) {
      if (now - lastBg > 33) { lastBg = now; drawBg(now); }
      if (now - lastG > 120) { lastG = now; for (const o of gauges) drawGauge(o); clipGraph(); }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

/* ---- Household budget panel (budget.html in an iframe) + voice/chat bridge ---- */
(() => {
  const box = document.getElementById('budget'), frame = document.getElementById('budgetFrame');
  if (!box || !frame) return;
  const ping = () => { try { frame.contentWindow.postMessage({ jv: 'ping' }, location.origin); } catch (e) {} };
  const open = (v) => { box.hidden = !v; document.body.classList.toggle('budget-open', v); if (v) { ping(); setTimeout(() => { try { frame.contentWindow.postMessage({ jv: 'show' }, location.origin); } catch (e) {} ping(); }, 200); } };
  frame.addEventListener('load', () => { ping(); setTimeout(ping, 600); });
  setInterval(ping, 4000);
  document.getElementById('openBudget')?.addEventListener('click', () => open(true));
  document.getElementById('budgetX').addEventListener('click', () => open(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !box.hidden) open(false); });
  const waits = new Map(); let seq = 0;
  const $b = (id) => document.getElementById(id);
  const fmt = (cur, n) => (n < 0 ? '-' : '') + cur + Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  function summary(d) {
    const left = d.inc - d.exp, sav = d.inc > 0 ? Math.round(left / d.inc * 100) : 0;
    $b('budMonth').textContent = d.month + (d.sample ? ' · sample data' : '');
    $b('budInc').textContent = fmt(d.cur, d.inc); $b('budExp').textContent = fmt(d.cur, d.exp);
    const l = $b('budLeft'); l.textContent = fmt(d.cur, left); l.classList.toggle('neg', left < 0);
    $b('budSav').textContent = sav + '%';
    const bar = $b('budBar'); bar.style.width = Math.min(100, d.inc ? d.exp / d.inc * 100 : 0) + '%'; bar.classList.toggle('over', d.exp > d.inc);
    const R = $b('budRecent');
    if (R) R.replaceChildren(...(d.recent || []).map((t) => {
      const r = document.createElement('div'); r.className = 're' + (t.type === 'income' ? ' inc' : '');
      const b = document.createElement('b'); b.textContent = t.note || t.cat;
      const s = document.createElement('small'); s.textContent = t.cat + ' · ' + String(t.date).slice(5).replace('-', '/');
      const a = document.createElement('span'); a.textContent = (t.type === 'income' ? '+' : '−') + fmt(d.cur, t.amt);
      r.append(b, s, a); return r;
    }));
    $b('budTop').replaceChildren(...d.top.map((t) => { const r = document.createElement('div'); r.textContent = t.cat; const s = document.createElement('span'); s.textContent = fmt(d.cur, t.amt) + (t.bud ? ' / ' + fmt(d.cur, t.bud) : ''); r.append(s); return r; }));
  }
  $b('budForm').addEventListener('submit', async (e) => {
    e.preventDefault(); const inp = $b('budIn'), q = inp.value.trim(); if (!q) return; inp.value = '';
    const id = ++seq;
    const text = await new Promise((res) => { waits.set(id, res); setTimeout(() => { if (waits.delete(id)) res('No answer from the budget.'); }, 6000); frame.contentWindow.postMessage({ jv: 'cmd', id, text: q }, location.origin); });
    $b('budMonth').textContent = text;
  });
  // Direct read of the budget's saved data (same origin): works even if messages are blocked
  function fromStorage() {
    try {
      const s = JSON.parse(localStorage.getItem('hbudget3d')); if (!s || !Array.isArray(s.tx)) return;
      const mk = s.month || new Date().toISOString().slice(0, 7); let inc = 0, exp = 0; const by = {};
      s.tx.forEach((t) => { if (String(t.date).slice(0, 7) !== mk) return; if (t.type === 'income') inc += t.amount; else { exp += t.amount; by[t.cat] = (by[t.cat] || 0) + t.amount; } });
      const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const top = Object.keys(by).sort((a, c) => by[c] - by[a]).slice(0, 3).map((k) => ({ cat: k, amt: by[k], bud: (s.budgets || {})[k] || 0 }));
      summary({ recent: s.tx.slice().sort((a, c) => (a.date < c.date ? 1 : a.date > c.date ? -1 : c.id - a.id)).slice(0, 5).map((x) => ({ type: x.type, cat: x.cat, note: x.note, amt: x.amount, date: x.date })), cur: s.currency || 'R', month: MN[+mk.slice(5, 7) - 1] + ' ' + mk.slice(0, 4), inc, exp, top, sample: !!s.sample && s.tx.some((t) => t.sample) });
    } catch (e) { $b('budMonth').textContent = 'Budget unavailable'; }
  }
  fromStorage(); setInterval(fromStorage, 2000); addEventListener('storage', fromStorage);
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.origin === location.origin && d && d.jv === 'summary') return summary(d);
    if (e.origin !== location.origin || !d || d.jv !== 'reply') return;
    const w = waits.get(d.id); if (w) { waits.delete(d.id); w(d.text); }
  });
  const MONEY = /\b(?:spent|spend|paid|pay|bought|received|earned|salary|income|expenses?|budgets?|groceries|rent|undo)\b/i;
  const NOT = /\b(?:timers?|alarms?|remind|weather|forecast|news|markets?|stocks?|train|calendar|email|gmail)\b/i;
  window.JV_SERVICE = {
    match: (q) => (/\bbudget\b/i.test(q) || (MONEY.test(q) && /\d/.test(q)) || /\bhow much (?:did|have) i (?:spend|spent|earn)/i.test(q)) && !NOT.test(q),
    run: async (q) => {
      open(true);
      const id = ++seq;
      const text = await new Promise((res) => {
        waits.set(id, res); setTimeout(() => { if (waits.delete(id)) res('The budget did not answer in time.'); }, 6000);
        frame.contentWindow.postMessage({ jv: 'cmd', id, text: q }, location.origin);
      });
      return text;
    }
  };
})();

/* ---- Whisky channel panel: numbers come from the Google sign-in in app.js (read only), shown here ---- */
(() => {
  const $ = (s) => document.querySelector(s);
  const card = $('#ytp'); if (!card) return;
  const KEY = 'brain.ytcache';                                  // last numbers seen, kept in this browser only (Sign out clears it)
  const n = (v) => Number(v || 0).toLocaleString('en-GB');
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const change = (a, b) => (b ? (a >= b ? '\u25b2' : '\u25bc') + Math.abs(Math.round((a - b) / b * 100)) + '%' : '');
  const date = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
  function snapshot(y) {
    return {
      at: Date.now(), name: y.name, subs: y.subs, total: y.views,
      an: y.an ? { views: y.an.views, prev: y.prev ? y.prev.views : 0, hours: Math.round(y.an.estimatedMinutesWatched / 60), gained: y.an.subscribersGained - y.an.subscribersLost } : null,
      vids: y.vids.filter((v) => v.pub !== false).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2).map((v) => ({ id: v.id, title: v.title, date: v.date, views: v.views, likes: v.likes }))
    };
  }
  function paint(c) {
    $('#ytName').textContent = c ? c.name : '';
    const stats = $('#ytStats'), vids = $('#ytVids'); stats.replaceChildren(); vids.replaceChildren();
    if (!c) return;
    const box = (label, value, extra) => { const d = make('div'); d.append(make('small', null, label), make('b', null, value)); if (extra) d.append(make('i', extra[0] === '\u25bc' ? 'dn' : 'up', extra)); stats.append(d); };
    box('Subscribers', c.subs == null ? 'hidden' : n(c.subs));
    if (c.an) {
      box('Views, 28 days', n(c.an.views), change(c.an.views, c.an.prev));
      box('Watch hours', n(c.an.hours));
      box('New subscribers', (c.an.gained > 0 ? '+' : '') + n(c.an.gained));
    } else box('Total views', n(c.total));
    if (c.vids.length) vids.append(make('h3', null, 'Latest videos'));
    for (const v of c.vids) {
      const a = make('a', 'ytv'); a.href = 'https://youtu.be/' + encodeURIComponent(v.id); a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.append(make('span', null, v.title), make('small', null, date(v.date) + ' \u00b7 ' + n(v.views) + ' views \u00b7 ' + n(v.likes) + ' likes'));
      vids.append(a);
    }
  }
  let action = 'connect';
  window.addEventListener('jarvis:youtube', (e) => {
    const s = e.detail;
    card.hidden = !s.ready; if (!s.ready) return;
    let c = read(), msg = '';
    if (s.yt) { c = snapshot(s.yt); try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (err) {} }
    const seen = c && !s.yt ? 'Last updated ' + new Date(c.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '. ' : '';
    if (s.yt) { action = 'refresh'; msg = s.yt.anErr ? s.yt.anErr : ''; }
    else if (!s.on) { action = 'connect'; msg = seen || 'Connect Google and pick the account that owns your channel. Read only.'; }
    else if (!s.allowed) { action = 'allow'; msg = 'Google is connected without YouTube permission. Tap Allow YouTube and tick the YouTube boxes.'; }
    else if (s.err) { action = 'refresh'; msg = s.err; }
    else { action = 'refresh'; msg = seen + 'Loading your channel\u2026'; }
    paint(c);
    $('#ytMsg').textContent = msg;
    $('#ytBtn').textContent = action === 'connect' ? 'Connect Google' : action === 'allow' ? 'Allow YouTube' : 'Refresh';
  });
  $('#ytBtn').addEventListener('click', () => {
    if (action === 'allow') { $('#gOut').click(); $('#gConnect').click(); }
    else $(action === 'connect' ? '#gConnect' : '#gRefresh').click();
  });
})();
