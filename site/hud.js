/* J.A.R.V.I.S. HUD layer for Brain Graph.
   Draws the reactor rings behind the graph, the day ruler and clock, the ring gauges, the target-lock readout
   and the markets / headlines feed. It only reads state (window.BRAIN_STATE); it never changes the graph. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const TAU = Math.PI * 2, CY = [92, 242, 255];
  const rgba = (a, c = CY) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = () => window.innerWidth < 760;
  const St = () => window.BRAIN_STATE;

  /* ---------- ruler + clock ---------- */
  function buildRuler() {
    const box = $('#days'); if (!box) return;
    const now = new Date(), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(), today = now.getDate();
    box.replaceChildren();
    for (let d = 1; d <= dim; d++) {
      const s = document.createElement('span');
      s.textContent = String(d).padStart(2, '0');
      if (d === today) s.className = 'on'; else if (d < today) s.className = 'past';
      box.append(s);
    }
    const cap = $('#capDate'); if (cap) cap.textContent = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toUpperCase();
  }
  function tickClock() {
    const n = new Date();
    $('#clockT').textContent = n.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    $('#clockD').textContent = n.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }).toUpperCase();
  }

  /* ---------- background reactor ---------- */
  const bg = $('#hudbg'), g = bg.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const dots = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.012, r: 0.6 + Math.random() * 1.4 }));
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    bg.style.width = W + 'px'; bg.style.height = H + 'px';
  }
  function area() {
    let x0 = 0, x1 = W;
    if (!isMobile()) {
      const p = $('#panel'), r = $('#rail');
      if (p && !p.classList.contains('closed')) x0 = p.getBoundingClientRect().right;
      if (r) x1 = r.getBoundingClientRect().left;
    }
    return { x0, x1, y0: isMobile() ? 44 : 52, y1: isMobile() ? H * 0.6 : H };
  }
  const REACTOR = false;   // set true to bring the rotating rings, crosshair and readouts back
  const arc = (c, cy, r, a0, a1) => { g.beginPath(); g.arc(c, cy, r, a0, a1); g.stroke(); };
  function drawBg(now) {
    const t = reduce ? 0 : now / 1000;
    const orbEl = $('#orb'), state = (orbEl && orbEl.dataset.state) || 'idle';
    const boost = state === 'thinking' ? 3 : state === 'listening' ? 1.8 : state === 'speaking' ? 1.4 : 1;
    const hot = state === 'thinking' ? [255, 196, 70] : state === 'listening' ? [120, 190, 255] : CY;
    const A = area(), cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2 + 6, R = Math.min(A.x1 - A.x0, A.y1 - A.y0) * 0.47;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // fine grid
    g.lineWidth = 1; g.strokeStyle = rgba(0.035);
    g.beginPath();
    for (let x = (cx % 56) - 56; x < W; x += 56) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (let y = (cy % 56) - 56; y < H; y += 56) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();

    // soft core glow
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, rgba(0.10, hot)); gr.addColorStop(0.55, rgba(0.035, hot)); gr.addColorStop(1, rgba(0));
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

    if (REACTOR) {
    // outer tick ring (slow turn)
    const spin = t * 0.05 * boost;
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * TAU + spin, major = i % 15 === 0, mid = i % 5 === 0;
      const r0 = R, r1 = R - (major ? 16 : mid ? 10 : 5);
      g.strokeStyle = rgba(major ? 0.5 : mid ? 0.28 : 0.15, hot); g.lineWidth = major ? 2 : 1;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.stroke();
    }
    // segmented bands, counter-rotating
    g.lineCap = 'butt';
    const bands = [[0.90, 7, 0.22, 0.20], [0.82, 3, 0.30, -0.30], [0.70, 10, 0.16, 0.12]];
    for (const [k, w, al, sp] of bands) {
      g.lineWidth = w; g.strokeStyle = rgba(al, hot);
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * TAU + t * sp * boost * 0.4 + k * 3;
        arc(cx, cy, R * k, a0, a0 + TAU / 6 * (0.35 + 0.35 * ((i * 7 + Math.round(k * 10)) % 3) / 2));
      }
    }
    // thin full circles
    g.lineWidth = 1;
    for (const k of [0.62, 0.46, 0.30]) { g.strokeStyle = rgba(0.12, hot); arc(cx, cy, R * k, 0, TAU); }
    // dashed ring
    g.save(); g.setLineDash([2, 9]); g.strokeStyle = rgba(0.3, hot); g.lineWidth = 2; arc(cx, cy, R * 0.94, -spin * 2, -spin * 2 + TAU); g.restore();
    // red alert arc (Stark reference)
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,77,77,0.7)';
    arc(cx, cy, R * 0.76, t * 0.12 * boost + 4.1, t * 0.12 * boost + 4.55);

    // crosshair with scale ticks
    g.lineWidth = 1; g.strokeStyle = rgba(0.10, hot);
    g.beginPath(); g.moveTo(cx - R * 1.04, cy); g.lineTo(cx + R * 1.04, cy); g.moveTo(cx, cy - R * 1.04); g.lineTo(cx, cy + R * 1.04); g.stroke();
    g.strokeStyle = rgba(0.3, hot); g.beginPath();
    for (let i = -10; i <= 10; i++) {
      const o = (i / 10) * R * 0.95, l = i % 5 === 0 ? 7 : 3;
      g.moveTo(cx + o, cy - l); g.lineTo(cx + o, cy + l); g.moveTo(cx - l, cy + o); g.lineTo(cx + l, cy + o);
    }
    g.stroke();

    // labels on the ring (live numbers); skipped on phones where they would be clipped
    const s = St();
    if (!isMobile()) {
    g.font = '11px "Share Tech Mono", ui-monospace, Menlo, monospace'; g.fillStyle = rgba(0.55, hot); g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText('NODES ' + String(s ? s.nodes.length : 0).padStart(3, '0'), cx + R * 0.72 + 6, cy - R * 0.18);
    g.fillText('LINKS ' + String(s ? s.links.length : 0).padStart(3, '0'), cx + R * 0.72 + 6, cy - R * 0.18 + 14);
    g.textAlign = 'right';
    g.fillText('YAW ' + (s ? ((((window.BRAIN_CAM || {}).yaw || 0) * 57.3) % 360).toFixed(0).padStart(3, '0') : '000'), cx - R * 0.72 - 6, cy + R * 0.18);
    g.textAlign = 'center';
    g.fillText(state.toUpperCase(), cx, cy - R - 14);
    }
    }

    // drifting particles
    g.fillStyle = rgba(0.35, hot);
    for (const d of dots) {
      d.y -= d.v * 0.016 * (reduce ? 0 : 1); if (d.y < 0) { d.y = 1; d.x = Math.random(); }
      g.beginPath(); g.arc(d.x * W, d.y * H, d.r, 0, TAU); g.fill();
    }
    // screen-corner brackets
    const m = 10, L = 26, top = isMobile() ? 46 : 50;
    g.strokeStyle = rgba(0.45); g.lineWidth = 2; g.beginPath();
    g.moveTo(m, top + L); g.lineTo(m, top); g.lineTo(m + L, top);
    g.moveTo(W - m - L, top); g.lineTo(W - m, top); g.lineTo(W - m, top + L);
    g.moveTo(m, H - m - L); g.lineTo(m, H - m); g.lineTo(m + L, H - m);
    g.moveTo(W - m - L, H - m); g.lineTo(W - m, H - m); g.lineTo(W - m, H - m - L);
    g.stroke();
  }

  /* ---------- ring gauges ---------- */
  const SZ = 108;
  const gauges = Array.from(document.querySelectorAll('canvas.gc')).map((cv) => {
    cv.width = SZ * 2; cv.height = SZ * 2;
    return { cv, g: cv.getContext('2d'), k: cv.dataset.k };
  });
  function ring(c, x, r, w, frac, a) {
    c.lineWidth = w; c.lineCap = 'butt';
    c.strokeStyle = rgba(0.13); c.beginPath(); c.arc(x, x, r, 0, TAU); c.stroke();
    c.strokeStyle = rgba(a); c.beginPath(); c.arc(x, x, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.001, Math.min(1, frac))); c.stroke();
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
      const tot = s ? s.nodes.length : 0, vis = s ? s.vis.length : 0;
      frac = tot ? vis / tot : 0; big = String(tot); sub = vis + ' SHOWN';
    } else {
      const n = s ? s.nodes.length : 0, l = s ? s.links.length : 0;
      frac = n ? Math.min(1, l / (n * 4)) : 0; big = String(l); sub = (n ? (l / n).toFixed(1) : '0.0') + ' / NODE';
    }
    // tick bezel
    c.strokeStyle = rgba(0.28); c.lineWidth = 2;
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * TAU, r0 = X - 4, r1 = r0 - (i % 4 === 0 ? 9 : 5);
      c.beginPath(); c.moveTo(X + Math.cos(a) * r0, X + Math.sin(a) * r0); c.lineTo(X + Math.cos(a) * r1, X + Math.sin(a) * r1); c.stroke();
    }
    ring(c, X, X - 24, 9, frac, 0.92);
    if (inner != null) ring(c, X, X - 40, 4, inner, 0.6); else { c.strokeStyle = rgba(0.18); c.lineWidth = 1; c.beginPath(); c.arc(X, X, X - 40, 0, TAU); c.stroke(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = rgba(1); c.shadowColor = rgba(0.8); c.shadowBlur = 10;
    c.font = `700 ${big.length > 4 ? 30 : 40}px Rajdhani, system-ui, sans-serif`; c.fillText(big, X, X - 6);
    c.shadowBlur = 0; c.fillStyle = rgba(0.6); c.font = '600 17px "Share Tech Mono", ui-monospace, monospace'; c.fillText(sub, X, X + 26);
  }

  /* ---------- target-lock readout ---------- */
  let lastLock = -2;
  function updateLock() {
    const s = St(), el = $('#lock'); if (!s || !el) return;
    if (s.sel === lastLock) return; lastLock = s.sel;
    const b = el.querySelector('b');
    if (s.sel >= 0 && s.nodes[s.sel]) { el.classList.add('on'); b.textContent = s.nodes[s.sel].title.toUpperCase() + ' · ' + s.adj[s.sel].length; }
    else { el.classList.remove('on'); b.textContent = 'NONE'; }
  }

  /* ---------- feeds (news.json / markets.json are written by the Pages workflow; hidden if absent) ---------- */
  async function loadFeeds() {
    const box = $('#feeds'); if (!box) return;
    const get = (u) => fetch(u + '?t=' + Math.floor(Date.now() / 600000), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [news, mk] = await Promise.all([get('news.json'), get('markets.json')]);
    let any = false;
    const fM = $('#fMarkets'), fN = $('#fNews');
    fM.replaceChildren(); fN.replaceChildren();
    if (mk && mk.quotes) {
      for (const q of Object.values(mk.quotes).slice(0, 6)) {
        const row = document.createElement('div'); row.className = 'fq';
        const a = document.createElement('span'); a.textContent = String(q.label || q.name || '').toUpperCase().slice(0, 12);
        const b = document.createElement('span');
        const ch = typeof q.change_pct === 'number' ? q.change_pct : null;
        b.textContent = String(q.price) + (ch == null ? '' : '  ' + (ch >= 0 ? '▲' : '▼') + Math.abs(ch).toFixed(1) + '%');
        if (ch != null) b.className = ch >= 0 ? 'up' : 'dn';
        row.append(a, b); fM.append(row); any = true;
      }
    }
    if (news && news.topics) {
      const rows = [];
      for (const list of Object.values(news.topics)) for (const it of (list || []).slice(0, 2)) rows.push(it);
      for (const it of rows.slice(0, 6)) {
        if (!it || !it.title) continue;
        const a = document.createElement('a'); a.className = 'fn'; a.target = '_blank'; a.rel = 'noopener noreferrer';
        if (/^https?:\/\//.test(it.link || '')) a.href = it.link;
        a.textContent = it.title;
        const sm = document.createElement('small'); sm.textContent = it.source || ''; a.append(sm);
        fN.append(a); any = true;
      }
    }
    box.hidden = !any;
  }

  /* ---------- run ---------- */
  if (window.innerWidth >= 760 && window.innerWidth < 1100) { const p = $('#panel'); if (p) p.classList.add('closed'); }
  size(); buildRuler(); tickClock(); loadFeeds();
  window.addEventListener('resize', () => { size(); });
  setInterval(tickClock, 1000);
  setInterval(buildRuler, 60 * 60 * 1000);
  setInterval(loadFeeds, 10 * 60 * 1000);

  let lastBg = 0, lastG = 0;
  function loop(now) {
    if (!document.hidden) {
      if (now - lastBg > 33) { lastBg = now; drawBg(now); }
      if (now - lastG > 120) { lastG = now; for (const o of gauges) drawGauge(o); updateLock(); }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
