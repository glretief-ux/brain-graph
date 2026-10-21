(() => {
'use strict';

const $ = (s) => document.querySelector(s);
const canvas = $('#c');
const ctx = canvas.getContext('2d');
const panel = $('#panel');

const PALETTE = {
  router: '#4ade80', wiki: '#e5e7eb', concept: '#fbbf24', suite: '#a78bfa', skill: '#60a5fa',
  tool: '#f472b6', world: '#fb923c', note: '#34d399', file: '#64748b'
};
function colorFor(t) {
  if (PALETTE[t]) return PALETTE[t];
  let h = 0;
  for (const ch of t) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 62%)`;
}

const S = {
  nodes: [], links: [], adj: [], vis: [], hidden: new Set(),
  sel: -1, cited: new Set(), nb: new Set(), path: null, pathSet: new Set(), pathEdges: new Set(),
  pathMode: false, view: { x: 0, y: 0, k: 1 }, target: null,
  alpha: 1, repel: 300, linkLen: 45, dirty: true, W: 0, H: 0, dpr: 1
};

const isMobile = () => window.innerWidth < 760;
// 3D camera: yaw/pitch rotate the cloud, f is the perspective distance. S.flat = classic 2D view.
const cam = { yaw: 0.6, pitch: -0.3, f: 700, last: 0, m: { cy: 1, sy: 0, cp: 1, sp: 0 } };
S.flat = false;

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function dot(color) {
  const d = el('span', 'dot');
  d.style.background = color;
  return d;
}
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- sizing ---------- */
function resize() {
  S.dpr = Math.min(window.devicePixelRatio || 1, 2);
  S.W = window.innerWidth;
  S.H = window.innerHeight;
  canvas.width = Math.round(S.W * S.dpr);
  canvas.height = Math.round(S.H * S.dpr);
  canvas.style.width = S.W + 'px';
  canvas.style.height = S.H + 'px';
  S.dirty = true;
}
function usable() {
  const r = { x0: 0, y0: 0, x1: S.W, y1: S.H };
  if (!panel.classList.contains('closed')) {
    const b = panel.getBoundingClientRect();
    if (!isMobile()) r.x0 = b.right + 8;
    else r.y1 = b.top - 8;
  }
  return r;
}

/* ---------- data ---------- */
function init(g) {
  S.nodes = g.nodes.map((n, i) => ({
    ...n, i, x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, z: (Math.random() - 0.5) * 400, vx: 0, vy: 0, vz: 0,
    r: 3 + Math.sqrt(n.degree) * 1.8, color: colorFor(n.type), pinned: false
  }));
  S.adj = S.nodes.map(() => []);
  S.links = g.links.map(([a, b]) => { S.adj[a].push(b); S.adj[b].push(a); return { a, b }; });
  $('#stats').textContent = `${S.nodes.length} notes · ${S.links.length} connections`;
  refreshVisible();
  for (let i = 0; i < 160; i++) tick();   // warm up so the first frame is already settled
  S.alpha = 0.25;
  fit(true);
  renderFilters();
  renderInspector();
  if (location.hash.length > 1) {
    const id = decodeURIComponent(location.hash.slice(1));
    const n = S.nodes.find((x) => x.id === id);
    if (n) select(n.i, true);
  }
  requestAnimationFrame(frame);
}

function refreshVisible() {
  S.vis = S.nodes.filter((n) => !S.hidden.has(n.type));
  const ranked = [...S.vis].sort((a, b) => b.degree - a.degree);
  ranked.forEach((n, i) => { n.rank = i; });
  renderHubs();
  S.dirty = true;
}
const hiddenNode = (i) => S.hidden.has(S.nodes[i].type);

/* ---------- physics ---------- */
function tick() {
  const a = S.alpha;
  if (a < 0.003) return;
  const V = S.vis, rep = S.repel;
  for (let i = 0; i < V.length; i++) {
    const p = V[i];
    for (let j = i + 1; j < V.length; j++) {
      const q = V[j];
      let dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 160000) continue;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5; d2 = 1; }
      const f = (rep * a) / d2;
      p.vx -= dx * f; p.vy -= dy * f; p.vz -= dz * f;
      q.vx += dx * f; q.vy += dy * f; q.vz += dz * f;
    }
  }
  for (const l of S.links) {
    const p = S.nodes[l.a], q = S.nodes[l.b];
    if (S.hidden.has(p.type) || S.hidden.has(q.type)) continue;
    const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const f = ((d - S.linkLen) / d) * 0.25 * a / Math.min(p.degree, q.degree, 8);
    p.vx += dx * f; p.vy += dy * f; p.vz += dz * f;
    q.vx -= dx * f; q.vy -= dy * f; q.vz -= dz * f;
  }
  const gz = S.flat ? 0.25 : 0.012;                       // flat mode squeezes the cloud back to 2D
  for (const n of V) {
    n.vx -= n.x * 0.012 * a;
    n.vy -= n.y * 0.012 * a;
    n.vz -= n.z * gz * a;
    n.vx *= 0.6; n.vy *= 0.6; n.vz *= 0.6;
    if (n.pinned) { n.vx = n.vy = n.vz = 0; continue; }
    n.x += Math.max(-30, Math.min(30, n.vx));
    n.y += Math.max(-30, Math.min(30, n.vy));
    n.z += Math.max(-30, Math.min(30, n.vz));
  }
  S.alpha *= 0.992;
}
function reheat(v) { S.alpha = Math.max(S.alpha, v); }

/* ---------- drawing ---------- */
function labelCount(k) {
  const f = k < 0.6 ? 0.05 : k < 1 ? 0.14 : k < 1.5 ? 0.32 : k < 2.2 ? 0.65 : 1;
  return Math.ceil(S.vis.length * f);
}
function project() {
  const yaw = S.flat ? 0 : cam.yaw, pit = S.flat ? 0 : cam.pitch;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
  cam.m = { cy, sy, cp, sp };
  const { x: vx, y: vy, k } = S.view;
  for (const n of S.nodes) {
    const x1 = n.x * cy + n.z * sy, z1 = -n.x * sy + n.z * cy;
    const y2 = n.y * cp - z1 * sp, z2 = n.y * sp + z1 * cp;
    const ps = S.flat ? 1 : cam.f / (cam.f + Math.max(z2, -cam.f * 0.85));
    n.px = x1; n.py = y2; n.pz = z2; n.ps = ps;
    n.sx = vx + x1 * ps * k; n.sy = vy + y2 * ps * k;
  }
}
function draw() {
  const k = S.view.k;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.clearRect(0, 0, S.W, S.H);
  project();
  const V = S.vis, flat = S.flat;
  let zmin = 1e9, zmax = -1e9;
  for (const n of V) { zmin = Math.min(zmin, n.pz); zmax = Math.max(zmax, n.pz); }
  const span = Math.max(zmax - zmin, 1);
  const near = (z) => (flat ? 1 : 1 - (z - zmin) / span);                 // 1 = closest to you, 0 = farthest
  const fog = (z) => (flat ? 1 : 0.3 + 0.7 * near(z));

  const focus = S.sel >= 0;
  // edges, batched into 4 depth bands so far links fade
  const base = focus ? 0.05 : 0.2;
  const bands = [[], [], [], []];
  for (const l of S.links) {
    if (hiddenNode(l.a) || hiddenNode(l.b)) continue;
    const p = S.nodes[l.a], q = S.nodes[l.b];
    const b = Math.min(3, Math.floor(near((p.pz + q.pz) / 2) * 4));
    bands[b].push(p, q);
  }
  ctx.lineWidth = 1;
  bands.forEach((arr, b) => {
    if (!arr.length) return;
    ctx.strokeStyle = `rgba(130,170,160,${flat ? base * 0.8 : base * (0.35 + 0.65 * (b + 1) / 4)})`;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i += 2) { ctx.moveTo(arr[i].sx, arr[i].sy); ctx.lineTo(arr[i + 1].sx, arr[i + 1].sy); }
    ctx.stroke();
  });
  if (focus) {
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(180,230,210,0.6)';
    ctx.beginPath();
    const p = S.nodes[S.sel];
    for (const j of S.adj[S.sel]) {
      if (hiddenNode(j)) continue;
      const q = S.nodes[j];
      ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  }
  if (S.path) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#facc15';
    ctx.beginPath();
    for (let i = 0; i < S.path.length - 1; i++) {
      const p = S.nodes[S.path[i]], q = S.nodes[S.path[i + 1]];
      ctx.moveTo(p.sx, p.sy); ctx.lineTo(q.sx, q.sy);
    }
    ctx.stroke();
  }

  // nodes, far to near so closer spheres cover the ones behind
  const order = [...V].sort((a, b) => b.pz - a.pz);
  for (const n of order) {
    const lit = !focus || n.i === S.sel || S.nb.has(n.i) || S.pathSet.has(n.i);
    const R = Math.max(1.5, n.r * n.ps * k);
    ctx.globalAlpha = (lit ? 1 : 0.18) * fog(n.pz);
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(n.sx, n.sy, R, 0, 6.2832);
    ctx.fill();
    if (!flat && R > 3) {                                   // sphere shading
      const gr = ctx.createRadialGradient(n.sx - R * 0.35, n.sy - R * 0.35, R * 0.08, n.sx, n.sy, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, R, 0, 6.2832); ctx.fill();
    }
    if (n.i === S.sel || S.pathSet.has(n.i)) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = S.pathSet.has(n.i) ? '#facc15' : '#fff';
      ctx.beginPath(); ctx.arc(n.sx, n.sy, R, 0, 6.2832); ctx.stroke();
    } else if (S.cited.has(n.i)) {
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#4ade80';
      ctx.beginPath(); ctx.arc(n.sx, n.sy, R + 4, 0, 6.2832); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // labels
  const count = labelCount(k);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(7,9,13,0.9)';
  for (const n of order.slice().reverse()) {                 // near first
    const special = n.i === S.sel || S.pathSet.has(n.i) || S.cited.has(n.i) || (focus && S.nb.has(n.i));
    if (!special && (focus || n.rank >= count)) continue;
    if (!special && !flat && near(n.pz) < 0.25) continue;     // skip labels on the far side
    ctx.font = `${Math.round(12 * (flat ? 1 : Math.min(1.15, Math.max(0.8, n.ps))))}px -apple-system, system-ui, sans-serif`;
    ctx.globalAlpha = special ? 1 : fog(n.pz);
    ctx.fillStyle = special ? '#fff' : 'rgba(230,233,239,0.9)';
    const ty = n.sy + Math.max(1.5, n.r * n.ps * k) + 2;
    ctx.strokeText(n.title, n.sx, ty);
    ctx.fillText(n.title, n.sx, ty);
  }
  ctx.globalAlpha = 1;
}

function animate() {
  const t = S.target;
  if (!t) return;
  const v = S.view;
  v.x += (t.x - v.x) * 0.2; v.y += (t.y - v.y) * 0.2; v.k += (t.k - v.k) * 0.2;
  S.dirty = true;
  if (Math.abs(t.x - v.x) < 0.5 && Math.abs(t.y - v.y) < 0.5 && Math.abs(t.k - v.k) < 0.002) {
    Object.assign(v, t); S.target = null;
  }
}
function frame() {
  const moving = S.alpha > 0.003;
  if (moving) { tick(); S.dirty = true; }
  // slow idle spin: only in 3D, with nothing selected and nobody touching the graph
  if (!S.flat && S.sel < 0 && !g && !S.target && performance.now() - cam.last > 2500) { cam.yaw += 0.0022; S.dirty = true; }
  animate();
  if (S.dirty) { draw(); S.dirty = false; }
  requestAnimationFrame(frame);
}

/* ---------- view helpers ---------- */
function fit(instant) {
  if (!S.vis.length) return;
  project();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of S.vis) {
    const X = n.px * n.ps, Y = n.py * n.ps;
    x0 = Math.min(x0, X); y0 = Math.min(y0, Y); x1 = Math.max(x1, X); y1 = Math.max(y1, Y);
  }
  const u = usable(), pad = 40;
  const w = Math.max(x1 - x0, 60), h = Math.max(y1 - y0, 60);
  const k = Math.max(0.05, Math.min((u.x1 - u.x0 - pad * 2) / w, (u.y1 - u.y0 - pad * 2) / h, 2.5));
  const t = {
    k,
    x: (u.x0 + u.x1) / 2 - ((x0 + x1) / 2) * k,
    y: (u.y0 + u.y1) / 2 - ((y0 + y1) / 2) * k
  };
  if (instant) { Object.assign(S.view, t); S.target = null; S.dirty = true; } else S.target = t;
}
function centerOn(i) {
  project();
  const n = S.nodes[i], u = usable();
  const k = Math.max(S.view.k, 0.9);
  S.target = { k, x: (u.x0 + u.x1) / 2 - n.px * n.ps * k, y: (u.y0 + u.y1) / 2 - n.py * n.ps * k };
}
function pick(sx, sy) {
  project();
  let best = -1, bz = 1e9;
  for (const n of S.vis) {
    const d = Math.hypot(n.sx - sx, n.sy - sy);
    if (d < Math.max(1.5, n.r * n.ps * S.view.k) + 12 && n.pz < bz) { bz = n.pz; best = n.i; }
  }
  return best;
}

/* ---------- selection & path ---------- */
function select(i, center) {
  S.sel = i; S.path = null; S.pathSet = new Set();
  S.nb = new Set(i >= 0 ? S.adj[i].filter((j) => !hiddenNode(j)) : []);
  if (i >= 0) {
    try { history.replaceState(null, '', '#' + encodeURIComponent(S.nodes[i].id)); } catch (e) { /* file:// */ }
    if (isMobile() && panel.classList.contains('closed')) panel.classList.remove('closed');
    if (center) centerOn(i);
  }
  renderInspector();
  S.dirty = true;
}
function tracePath(a, b) {
  const prev = new Map([[a, -1]]);
  const queue = [a];
  while (queue.length) {
    const u = queue.shift();
    if (u === b) break;
    for (const v of S.adj[u]) {
      if (prev.has(v) || hiddenNode(v)) continue;
      prev.set(v, u); queue.push(v);
    }
  }
  if (!prev.has(b)) { toast('No path between those notes'); return; }
  const path = [];
  for (let c = b; c !== -1; c = prev.get(c)) path.push(c);
  path.reverse();
  S.path = path; S.pathSet = new Set(path); S.sel = b;
  S.nb = new Set(S.adj[b].filter((j) => !hiddenNode(j)));
  renderInspector();
  S.dirty = true;
  toast(`${path.length - 1} hop${path.length === 2 ? '' : 's'}`);
}
function handleTap(i, shift) {
  if (i < 0) { select(-1); return; }
  if ((S.pathMode || shift) && S.sel >= 0 && S.sel !== i) { tracePath(S.sel, i); return; }
  select(i, false);
}

/* ---------- panel rendering ---------- */
function renderInspector() {
  const box = $('#inspector');
  box.replaceChildren();
  if (S.sel < 0) {
    box.append(el('p', 'hint', 'Tap a note to focus it and light up its connections. Switch on Path, then tap a second note to trace the route between them.'));
    return;
  }
  const n = S.nodes[S.sel];
  box.append(el('h3', null, n.title));
  const meta = el('div', 'meta');
  meta.append(dot(n.color), el('span', null, `${n.type} · ${n.degree} connection${n.degree === 1 ? '' : 's'}`));
  box.append(meta);
  if (S.path) {
    box.append(el('div', 'label', `Path · ${S.path.length - 1} hops`));
    const p = el('div', 'path');
    S.path.forEach((i, idx) => {
      if (idx) p.append(el('span', 'arrow', '→'));
      const b = el('button', null, S.nodes[i].title);
      b.onclick = () => select(i, true);
      p.append(b);
    });
    box.append(p);
  }
  if (n.excerpt) box.append(el('p', 'excerpt', n.excerpt));
  const nbs = S.adj[S.sel].filter((j) => !hiddenNode(j)).sort((a, b) => S.nodes[b].degree - S.nodes[a].degree).slice(0, 30);
  if (nbs.length) {
    box.append(el('div', 'label', 'Connected to'));
    const wrap = el('div', 'links');
    for (const j of nbs) {
      const b = el('button', null, S.nodes[j].title);
      b.onclick = () => select(j, true);
      wrap.append(b);
    }
    box.append(wrap);
  }
}
function renderHubs() {
  const box = $('#hubs');
  box.replaceChildren();
  [...S.vis].sort((a, b) => b.degree - a.degree).slice(0, 8).forEach((n) => {
    const b = el('button');
    b.append(dot(n.color), el('span', null, n.title), el('span', 'count', String(n.degree)));
    b.onclick = () => select(n.i, true);
    box.append(b);
  });
}
function renderFilters() {
  const box = $('#filters');
  box.replaceChildren();
  const counts = {};
  S.nodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach((t) => {
    const c = el('button', 'chip' + (S.hidden.has(t) ? ' off' : ''));
    c.append(dot(colorFor(t)), el('span', null, t), el('small', null, String(counts[t])));
    c.onclick = () => {
      if (S.hidden.has(t)) S.hidden.delete(t); else S.hidden.add(t);
      c.classList.toggle('off');
      if (S.sel >= 0 && hiddenNode(S.sel)) select(-1);
      refreshVisible(); reheat(0.4);
    };
    box.append(c);
  });
}
$('#search').addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const box = $('#results');
  box.replaceChildren();
  if (!q) return;
  S.vis.filter((n) => n.title.toLowerCase().includes(q))
    .sort((a, b) => b.degree - a.degree).slice(0, 8).forEach((n) => {
      const b = el('button');
      b.append(dot(n.color), el('span', null, n.title), el('span', 'count', n.type));
      b.onclick = () => { select(n.i, true); box.replaceChildren(); e.target.value = ''; e.target.blur(); };
      box.append(b);
    });
});


/* ---------- J.A.R.V.I.S. orb ---------- */
const orb = (() => {
  const btn = $('#orb'), cv = $('#orbc'), label = $('#orbState'), g2 = cv.getContext('2d');
  const COL = { idle: [74, 222, 128], listening: [56, 189, 248], thinking: [251, 191, 36], speaking: [74, 222, 128] };
  const NAME = { idle: 'STANDBY', listening: 'LISTENING', thinking: 'THINKING', speaking: 'SPEAKING' };
  let state = 'idle', t0 = performance.now(), level = 0, hold = 0;
  function set(s) {
    if (s === state) return;
    state = s;
    btn.dataset.state = s;
    label.textContent = NAME[s];
  }
  function draw(now) {
    const t = (now - t0) / 1000, W = cv.width, c = W / 2;
    const [r, g, b] = COL[state], rgb = (a) => `rgba(${r},${g},${b},${a})`;
    const target = state === 'speaking' ? 0.55 + 0.45 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1)) :
      state === 'listening' ? 0.5 + 0.2 * Math.sin(t * 3) : state === 'thinking' ? 0.45 : 0.25 + 0.05 * Math.sin(t * 1.4);
    level += (target - level) * 0.18;
    const spin = state === 'thinking' ? 3.2 : state === 'idle' ? 0.35 : 1.1;
    g2.clearRect(0, 0, W, W);
    // glow core
    const grad = g2.createRadialGradient(c, c, 4, c, c, c * 0.62);
    grad.addColorStop(0, rgb(0.55 * level + 0.2));
    grad.addColorStop(1, rgb(0));
    g2.fillStyle = grad;
    g2.beginPath(); g2.arc(c, c, c * 0.62, 0, 6.2832); g2.fill();
    // outer tick ring
    g2.lineWidth = 3; g2.strokeStyle = rgb(0.55);
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * 6.2832 + t * spin * 0.15, long = i % 5 === 0;
      const r0 = c * 0.93, r1 = r0 - (long ? 12 : 6);
      g2.beginPath(); g2.moveTo(c + Math.cos(a) * r0, c + Math.sin(a) * r0); g2.lineTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1); g2.stroke();
    }
    // rotating arcs
    g2.lineCap = 'round';
    g2.lineWidth = 5; g2.strokeStyle = rgb(0.95);
    g2.beginPath(); g2.arc(c, c, c * 0.72, t * spin, t * spin + 1.6 + level); g2.stroke();
    g2.strokeStyle = rgb(0.6);
    g2.beginPath(); g2.arc(c, c, c * 0.72, t * spin + 3.3, t * spin + 4.4); g2.stroke();
    g2.lineWidth = 3; g2.strokeStyle = rgb(0.75);
    g2.beginPath(); g2.arc(c, c, c * 0.56, -t * spin * 1.4, -t * spin * 1.4 + 2.2); g2.stroke();
    // inner ring that breathes with the voice
    g2.lineWidth = 2; g2.strokeStyle = rgb(0.5 + 0.4 * level);
    g2.beginPath(); g2.arc(c, c, c * (0.36 + 0.07 * level), 0, 6.2832); g2.stroke();
    g2.fillStyle = rgb(0.9);
    g2.font = '700 15px ui-monospace, Menlo, monospace'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
    g2.fillText('J.A.R.V.I.S.', c, c);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  return { set, get: () => state, el: btn };
})();

/* ---------- ask the brain (chat) ---------- */
const CHAT_URL = (window.BRAIN_CONFIG && window.BRAIN_CONFIG.chatUrl) || '';
/* ---------- Groq straight from this browser (your free key stays in this browser only) ---------- */
const GKEY = () => { try { return localStorage.getItem('brain.groq') || ''; } catch (e) { return ''; } };
const AI_READY = () => !!(CHAT_URL || GKEY());
const BRAIN_SYSTEM = `You are J.A.R.V.I.S., the assistant for the user's personal knowledge base (their "second brain").
Answer using the notes provided below (they may include live calendar, Gmail and web results). If they do not contain the answer, say so briefly.
Be concise: one to four short sentences, or a short list. Plain language, no preamble.
Whenever you mention a note from the knowledge base, write its exact title in double square brackets, like [[Seizure Watch]].
Never invent details that are not in the notes.`;
let groqModel = '';
async function groqPickModel() {
  const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + GKEY() } });
  const d = await r.json().catch(() => ({}));
  const ids = ((d && d.data) || []).map((m) => m.id).filter((id) => !/whisper|guard|tts|orpheus|playai|embed|safeguard/i.test(id));
  return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'].find((m) => ids.includes(m)) || ids[0] || '';
}
const IS_GEM = () => /^AIza/.test(GKEY());
let gemModel = '';
async function gemCall(model, payload) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(GKEY()), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({}));
  return { r, d };
}
async function gemPick() {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(GKEY()));
  const d = await r.json().catch(() => ({}));
  const ids = ((d && d.models) || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => String(m.name).replace('models/', ''));
  return ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'].find((m) => ids.includes(m)) || ids.find((m) => /flash/.test(m) && !/lite|image|tts|live|thinking/.test(m)) || ids[0] || '';
}
async function gemGenerate(payload) {
  let { r, d } = await gemCall(gemModel || 'gemini-flash-latest', payload);
  if (!r.ok && /model|not found|not supported/i.test((d.error && d.error.message) || '')) {
    const alt = await gemPick();
    if (alt) { gemModel = alt; ({ r, d } = await gemCall(alt, payload)); }
  }
  if (!r.ok) throw new Error('Gemini: ' + ((d.error && d.error.message) || 'error ' + r.status));
  const cand = (d.candidates || [])[0];
  return String(((cand && cand.content && cand.content.parts) || []).map((x) => x.text || '').join('')).trim();
}
async function groqChatDirect(messages, max_tokens) {
  if (IS_GEM()) {
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    return gemGenerate({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { maxOutputTokens: Math.max(max_tokens, 400), temperature: 0.3 } });
  }
  const call = (model) => fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + GKEY() },
    body: JSON.stringify({ model, messages, max_tokens, temperature: 0.3 })
  });
  let r = await call(groqModel || 'llama-3.1-8b-instant');
  let d = await r.json().catch(() => ({}));
  if (!r.ok && /model/i.test((d.error && d.error.message) || '')) {
    const alt = await groqPickModel();
    if (alt) { groqModel = alt; r = await call(alt); d = await r.json().catch(() => ({})); }
  }
  if (!r.ok) throw new Error('Groq: ' + ((d.error && d.error.message) || 'error ' + r.status));
  return String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '').trim();
}
const fakeRes = (obj, ok = true, status = 200) => ({ ok, status, json: async () => obj });
// Same job as the Worker's text modes, but done here when a Groq key is saved. Falls back to the Worker.
async function brainFetch(body) {
  if (GKEY()) {
    try {
      if (body.question) {
        const ctx = (body.notes || []).slice(0, 9).map((n) => '## ' + String(n.title).slice(0, 120) + ' (' + String(n.type).slice(0, 30) + ')\n' + String(n.text).slice(0, 1000)).join('\n\n');
        const msgs = [];
        for (const m of (body.history || []).slice(-6)) {
          const exp = msgs.length % 2 === 0 ? 'user' : 'assistant';
          if (m && m.role === exp && m.content) msgs.push({ role: m.role, content: String(m.content).slice(0, 1200) });
        }
        if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.pop();
        msgs.push({ role: 'user', content: String(body.question).slice(0, 1000) });
        const answer = await groqChatDirect([{ role: 'system', content: BRAIN_SYSTEM + '\n\nNOTES:\n\n' + ctx }, ...msgs], 500);
        return fakeRes({ answer });
      }
      if (body.compose) {
        const sys = 'You write email drafts for the user. Reply with ONLY a JSON object: {"to":"","subject":"","body":""}.\n"to" must be ONE email address: copy it from the CONTACTS list when a name in the request matches a contact, or use an address the request spells out. If nothing matches, leave "to" empty. Never invent an address.\nWrite the email in the same language as the request unless asked otherwise. Short, polite and natural, in the first person as the user, with a greeting and a closing line. No placeholders like [Your name] and no text outside the JSON.\n\nCONTACTS:\n' + ((body.contacts || []).slice(0, 60).join('\n') || '(none)');
        const text = await groqChatDirect([{ role: 'system', content: sys }, { role: 'user', content: String(body.compose).slice(0, 1000) }], 600);
        const m = text.match(/\{[\s\S]*\}/); const d = m ? JSON.parse(m[0]) : null;
        if (!d || !d.body) return fakeRes({ error: 'Could not write a draft, try rephrasing' }, false, 502);
        return fakeRes({ draft: { to: String(d.to || ''), subject: String(d.subject || ''), body: String(d.body) } });
      }
      if (body.event) {
        const sys = 'You turn a request into one calendar event. Reply with ONLY JSON: {"title":"","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM","location":""}.\nCurrent date and time: ' + String(body.now || '') + '. Resolve words like tomorrow or Thursday from it. Use 24-hour local times. If no duration is given use 1 hour. If no time is given use 09:00. Keep the title short.';
        const text = await groqChatDirect([{ role: 'system', content: sys }, { role: 'user', content: String(body.event).slice(0, 500) }], 300);
        const m = text.match(/\{[\s\S]*\}/); const e = m ? JSON.parse(m[0]) : null;
        if (!e || !e.title || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(e.start || '')) return fakeRes({ error: 'Could not understand the event, try rephrasing' }, false, 502);
        return fakeRes({ event: { title: String(e.title), start: e.start.slice(0, 16), end: String(e.end || '').slice(0, 16), location: String(e.location || '') } });
      }
      if (body.search) {
        const r = await fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=5&srsearch=' + encodeURIComponent(String(body.search).slice(0, 200)));
        const d = await r.json().catch(() => ({}));
        const results = ((d.query && d.query.search) || []).map((x) => ({ title: x.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')), text: String(x.snippet).replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').slice(0, 300) }));
        return fakeRes({ results });
      }
    } catch (e) {
      if (!CHAT_URL) return fakeRes({ error: e.message || 'Groq error' }, false, 502);
      if (!body.question && !body.compose && !body.event && !body.search) throw e;
      brainFetch.lastErr = e.message;                                     // fall through to the Worker
    }
  }
  if (!CHAT_URL) return fakeRes({ error: 'Add a free AI key in the panel (Free AI key), or set up the Worker.' }, false, 400);
  const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok && brainFetch.lastErr) { const d = await r.json().catch(() => ({})); return fakeRes({ error: brainFetch.lastErr + ' | ' + (d.error || r.status) }, false, r.status); }
  return r;
}
/* ---------- VoiceStudio: optional local voice engine on your own PC (https://github.com/debpalash/VoiceStudio) ----------
   Settings live in this browser only. Speaks through its OpenAI-compatible /v1/audio/speech route and can also
   transcribe through /v1/audio/transcriptions. If the PC is off or unreachable, Jarvis falls back to the other voices. */
const VS = (() => {
  const get = (k) => { try { return localStorage.getItem('brain.vs' + k) || ''; } catch (e) { return ''; } };
  const set = (k, v) => { try { if (v) localStorage.setItem('brain.vs' + k, v); else localStorage.removeItem('brain.vs' + k); } catch (e) {} };
  const base = () => get('Url').trim().replace(/\/+$/, '');
  const hdr = () => { const k = get('Key').trim(); return k ? { Authorization: 'Bearer ' + k } : {}; };
  const timed = async (url, opts, ms) => {
    const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
    try { return await fetch(url, Object.assign({}, opts, { signal: ac.signal })); }
    catch (e) { throw new Error(e && e.name === 'AbortError' ? 'timed out' : 'cannot connect'); }
    finally { clearTimeout(t); }
  };
  const fail = async (r) => { let m = ''; try { const d = await r.json(); m = d.detail || d.error || ''; } catch (e) {} return new Error((typeof m === 'string' && m) || ('HTTP ' + r.status)); };
  let vcache = null;
  const voices = async (force) => {
    if (vcache && !force) return vcache;
    const r = await timed(base() + '/v1/audio/voices', { headers: hdr() }, 15000);
    if (!r.ok) throw await fail(r);
    const d = await r.json().catch(() => ({}));
    vcache = Array.isArray(d.voices) ? d.voices : [];
    return vcache;
  };
  // the voice to speak with: the one you chose, else your first saved (cloned/designed) voice, else the plain default
  const pickVoice = async () => {
    const v = get('Voice').trim(); if (v) return v;
    try { const p = (await voices()).find((x) => x.type === 'profile'); if (p) return p.voice_id; } catch (e) { /* use the default */ }
    return 'alloy';
  };
  return {
    get, set, base, voices,
    configured: () => !!base(),
    listen: () => get('Listen') === '1' && !!base(),
    async speak(text) {
      const r = await timed(base() + '/v1/audio/speech', {
        method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdr()),
        body: JSON.stringify({ model: 'tts-1', voice: await pickVoice(), input: text, response_format: 'wav' })
      }, 90000);
      if (!r.ok) throw await fail(r);
      const blob = await r.blob();
      if (!blob.size) throw new Error('empty audio');
      return blob;
    },
    async transcribe(blob) {
      const ct = (blob.type || 'audio/webm').split(';')[0];
      const ext = ct.includes('webm') ? 'webm' : ct.includes('ogg') ? 'ogg' : ct.includes('wav') ? 'wav' : ct.includes('mpeg') ? 'mp3' : 'm4a';
      const fd = new FormData(); fd.append('file', new File([blob], 'clip.' + ext, { type: ct })); fd.append('model', 'whisper-1'); fd.append('response_format', 'json');
      const r = await timed(base() + '/v1/audio/transcriptions', { method: 'POST', headers: hdr(), body: fd }, 60000);
      if (!r.ok) throw await fail(r);
      const d = await r.json().catch(() => ({}));
      return String(d.text || '');
    }
  };
})();

async function brainSTT(blob) {
  if (VS.listen()) {                                                   // your own PC first; cloud speech-to-text is the backup
    try { return await VS.transcribe(blob); } catch (e) { toast('VoiceStudio could not transcribe (' + e.message + '), using the cloud'); }
  }
  if (GKEY() && IS_GEM()) {
    const ct = (blob.type || 'audio/webm').split(';')[0];
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(blob); });
    return gemGenerate({ contents: [{ role: 'user', parts: [{ text: 'Transcribe this audio exactly as spoken. Reply with only the transcript, nothing else. If there is no speech, reply with nothing.' }, { inline_data: { mime_type: ct, data: b64 } }] }], generationConfig: { maxOutputTokens: 400, temperature: 0 } });
  }
  if (GKEY()) {
    const ct = (blob.type || 'audio/webm').split(';')[0];
    const ext = ct.includes('webm') ? 'webm' : ct.includes('ogg') ? 'ogg' : ct.includes('wav') ? 'wav' : ct.includes('mpeg') ? 'mp3' : 'm4a';
    const fd = new FormData(); fd.append('file', new File([blob], 'clip.' + ext, { type: ct })); fd.append('model', 'whisper-large-v3-turbo'); fd.append('response_format', 'json');
    try {
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + GKEY() }, body: fd });
      const d = await r.json().catch(() => ({}));
      if (r.ok) return String(d.text || '');
      if (!CHAT_URL) throw new Error('Groq: ' + ((d.error && d.error.message) || r.status));
    } catch (e) { if (!CHAT_URL) throw e; }
  }
  const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': (blob.type || 'audio/mp4').split(';')[0] }, body: blob });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Speech service error ' + r.status);
  return d.text || '';
}

let NOTES = [];
const chat = { history: [], busy: false };
const STOP = new Set('the and for with what which who how are was were this that from have has about does did can you your our their them into out all any not but use used using show tell give list when where why more most there here its it is of in on to a an or as at by be'.split(' '));

const BOOSTS = [
  { re: /to.?do|left|remaining|still|pending|next|outstanding|open/i, title: 'open items' },
  { re: /rule|lesson|tip|gotcha|mistake|learn/i, title: 'lessons learned' }
];
function scoreNotes(question) {
  const words = question.toLowerCase().match(/[a-z0-9À-ɏ]{3,}/g) || [];
  const terms = words.filter((w) => !STOP.has(w));
  return NOTES.map((n) => {
    const title = n.title.toLowerCase(), text = n.text.toLowerCase();
    let s = 0;
    for (const t of terms) {
      if (title.includes(t)) s += 5;
      let at = text.indexOf(t), c = 0;
      while (at !== -1 && c < 5) { s += 1; c++; at = text.indexOf(t, at + t.length); }
    }
    for (const b of BOOSTS) if (b.re.test(question) && title === b.title) s += 6;
    if (S.sel >= 0 && n.title === S.nodes[S.sel].title) s += 2;
    return { n, s };
  }).sort((a, b) => b.s - a.s);
}
function firstSentence(text) {
  const t = text.replace(/^#.*$/m, '').replace(/What it is:\s*/i, '').replace(/\*\*/g, '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.{20,200}?[.!?])(\s|$)/);
  return m ? m[1] : t.slice(0, 160);
}
// Free "search mode": no AI, just the best-matching notes with a one-line summary each.
function localAnswer(question) {
  const top = scoreNotes(question).filter((x) => x.s > 0).slice(0, 3);
  if (!top.length) return 'No matching notes. Try different words, for example a project or tool name.';
  return 'Best matches:\n' + top.map((x) => `• [[${x.n.title}]] ${firstSentence(x.n.text)}`).join('\n');
}

function retrieve(question) {
  if (NOTES.length <= 25) return NOTES;                        // small vault: send everything
  const scored = scoreNotes(question);
  const top = scored.slice(0, 12).filter((x) => x.s > 0).map((x) => x.n);
  // pull in direct neighbours of the best matches so related notes come along
  const byTitle = new Map(S.nodes.map((n) => [n.title.toLowerCase(), n]));
  const seen = new Set(top.map((n) => n.title));
  for (const t of top.slice(0, 3)) {
    const node = byTitle.get(t.title.toLowerCase());
    if (!node) continue;
    for (const j of S.adj[node.i]) {
      const nt = NOTES.find((n) => n.title === S.nodes[j].title);
      if (nt && !seen.has(nt.title) && top.length < 22) { top.push(nt); seen.add(nt.title); }
    }
  }
  return top.length ? top : NOTES.slice(0, 20);
}

function renderAnswer(text) {
  const box = $('#answer');
  box.replaceChildren();
  const cited = new Set();
  const byTitle = new Map(S.nodes.map((n) => [n.title.toLowerCase(), n]));
  text.split(/(\[\[[^\]]+\]\])/g).forEach((part) => {
    const m = part.match(/^\[\[([^\]]+)\]\]$/);
    if (!m) { box.append(document.createTextNode(part)); return; }
    const node = byTitle.get(m[1].trim().toLowerCase());
    if (!node) { box.append(document.createTextNode(m[1])); return; }
    cited.add(node.i);
    const b = el('button', null, node.title);
    b.type = 'button';
    b.onclick = () => select(node.i, true);
    box.append(b);
  });
  S.cited = cited;
  S.dirty = true;
}

/* ---------- Jarvis voice ---------- */
const voiceBox = (() => {
  const KEY = 'jarvisVoice';
  const AI = '__ai', PRO = '__pro', VSV = '__vs';                       // AI = free MeloTTS (practically unlimited), PRO = Aura-2 (about 10 short answers a day on the free plan)
  const AI_SPEAKER = (window.BRAIN_CONFIG && window.BRAIN_CONFIG.aiVoice) || 'draco';
  const player = new Audio();
  player.preload = 'auto';
  let busyAI = false, unlocked = false, aiDown = false, proDown = false, token = 0;
  // iOS only lets a page play audio after a tap: play a tiny silent clip inside the first tap
  const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  const unlock = () => {
    const c = getCtx(); if (c) { try { c.resume(); const b = c.createBuffer(1, 1, 22050), n = c.createBufferSource(); n.buffer = b; n.connect(c.destination); n.start(0); } catch (e) {} }
    if (unlocked) return; unlocked = true; try { player.src = SILENT; player.play().catch(() => {}); } catch (e) {}
  };
  const aiOn = () => !!CHAT_URL && !aiDown && !!sel() && (sel().value === AI || sel().value === PRO);
  const vsOn = () => VS.configured() && !!sel() && sel().value === VSV;
  const isPro = () => !!sel() && sel().value === PRO && !proDown;
  const cap = () => (vsOn() ? 900 : isPro() ? 300 : 600);
  const stop = () => { token++; try { player.pause(); } catch (e) {} try { if (node) node.stop(); } catch (e) {} node = null; busyAI = false; };
  let actx = null, node = null;
  const getCtx = () => { if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); } return actx; };
  const fetchSpeech = async (text, eng) => {
    const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ speak: text, speaker: AI_SPEAKER, engine: eng }) });
    if (!r.ok) { let m = ''; try { m = (await r.json()).error || ''; } catch (e) {} throw new Error(m || ('speech ' + r.status)); }
    const blob = await r.blob();
    if (!blob.size) throw new Error('empty audio');
    return blob;
  };
  // Play with <audio>; if iOS refuses, play the same bytes through the Web Audio context that was unlocked by a tap
  const playBlob = async (blob, my, onend) => {
    const done = () => { if (my === token) { busyAI = false; onend(); } };
    const url = URL.createObjectURL(blob);
    player.onended = () => { URL.revokeObjectURL(url); done(); };
    player.onerror = () => {};
    player.src = url;
    try { await player.play(); return; } catch (e) {}
    const ctx = getCtx();
    if (!ctx) throw new Error('audio blocked');
    try { await ctx.resume(); } catch (e) {}
    const ab = await blob.arrayBuffer();
    const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); });
    node = ctx.createBufferSource(); node.buffer = buf; node.connect(ctx.destination);
    node.onended = done; node.start();
  };
  const speakAI = async (text, onstart, onend, onfail) => {
    const my = ++token; busyAI = true;
    const attempt = async (eng) => { const blob = await fetchSpeech(text, eng); if (my !== token) return false; await playBlob(blob, my, onend); return true; };
    try {
      let ok;
      if (isPro()) {
        try { ok = await attempt('aura'); }
        catch (e) {
          if (my !== token) throw e;
          proDown = true;                                     // premium allowance used up (or failing): use the free voice
          toast('Premium voice limit reached for today. Using the free Jarvis voice.');
          ok = await attempt('melo');
        }
      } else ok = await attempt('melo');
      if (ok && my === token) onstart();
    } catch (e) {
      if (my !== token) return;
      busyAI = false; aiDown = true;
      toast('Jarvis voice failed (' + (e && e.message ? e.message : 'error') + '), using the device voice');
      onfail();
    }
  };
  const speakVS = async (text, onstart, onend, onfail) => {
    const my = ++token; busyAI = true;
    try {
      const blob = await VS.speak(text);
      if (my !== token) return;
      await playBlob(blob, my, onend);
      if (my === token) onstart();
    } catch (e) {
      if (my !== token) return;
      busyAI = false;
      toast('VoiceStudio is not reachable (' + (e && e.message ? e.message : 'error') + '), using the device voice');
      onfail();
    }
  };
  const sel = () => document.getElementById('voice');
  let voices = [];
  const rate = (v) => {                                   // higher = more Jarvis-like
    const n = (v.name + ' ' + v.lang).toLowerCase();
    let sc = 0;
    if (/en[-_]gb/.test(n)) sc += 40;
    if (/daniel|arthur|oliver|malcolm|gordon/.test(n)) sc += 30;   // British male voices on Apple devices
    if (/premium|enhanced/.test(n)) sc += 20;
    if (/^en/.test(v.lang)) sc += 10;
    if (/novelty|whisper|bad news|bells|boing|cellos|good news|jester|organ|superstar|trinoids|zarvox|albert|bubbles/.test(n)) sc -= 100;
    return sc;
  };
  const load = () => {
    if (!('speechSynthesis' in window) || !sel()) return;
    voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)).sort((a, b) => rate(b) - rate(a) || a.name.localeCompare(b.name));
    if (!voices.length && !CHAT_URL && !VS.configured()) return;
    let saved = ''; try { saved = localStorage.getItem(KEY) || ''; } catch (e) {}
    const opts = voices.map((v) => { const o = document.createElement('option'); o.value = v.voiceURI; o.textContent = v.name + ' (' + v.lang + ')'; return o; });
    if (CHAT_URL) {
      const f = document.createElement('option'); f.value = AI; f.textContent = 'Jarvis voice (free, unlimited)';
      const pr = document.createElement('option'); pr.value = PRO; pr.textContent = 'Jarvis premium voice (limited)';
      opts.unshift(f, pr);
    }
    if (VS.configured()) {
      const v = document.createElement('option'); v.value = VSV; v.textContent = 'VoiceStudio (your PC)';
      opts.unshift(v);
    }
    sel().replaceChildren(...opts);
    const ok = saved === VSV ? VS.configured() : (saved === AI || saved === PRO) ? !!CHAT_URL : voices.some((v) => v.voiceURI === saved);
    sel().value = ok ? saved : (CHAT_URL ? AI : voices.length ? voices[0].voiceURI : VSV);
  };
  const current = () => voices.find((v) => sel() && v.voiceURI === sel().value) || null;
  const init = () => {
    if (!('speechSynthesis' in window)) { const l = document.querySelector('label.voice'); if (l) l.style.display = 'none'; return; }
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    sel().addEventListener('change', () => {
      try { localStorage.setItem(KEY, sel().value); } catch (e) {}
      speechSynthesis.cancel(); stop(); unlock();
      if (vsOn()) { speakVS('At your service.', () => {}, () => {}, () => {}); return; }
      if (aiOn()) { speakAI('At your service.', () => {}, () => {}, () => {}); return; }
      const u = new SpeechSynthesisUtterance('At your service.');
      const v = current(); if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = 0.95;
      speechSynthesis.speak(u);
    });
  };
  return { init, current, aiOn, vsOn, cap, speakAI, speakVS, stop, unlock, reload: load, select: (v) => { if (sel()) { sel().value = v; try { localStorage.setItem(KEY, v); } catch (e) {} } }, busy: () => busyAI };
})();

function say(text) {
  if (!$('#speak').checked) return;
  const clean = text.replace(/\[\[|\]\]/g, '').replace(/^[•\-]\s*/gm, '').replace(/\s+/g, ' ').trim();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  voiceBox.stop();
  if (voiceBox.vsOn()) {
    voiceBox.speakVS(clean.slice(0, voiceBox.cap()), () => orb.set('speaking'), () => orb.set('idle'), () => speakLocal(clean));
    return;
  }
  if (voiceBox.aiOn()) {
    voiceBox.speakAI(clean.slice(0, voiceBox.cap()), () => orb.set('speaking'), () => orb.set('idle'), () => speakLocal(clean));
    return;
  }
  speakLocal(clean);
}
function speakLocal(clean) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  const v = voiceBox.current(); if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = 0.95;
  u.onstart = () => orb.set('speaking');
  u.onend = u.onerror = () => orb.set('idle');
  speechSynthesis.speak(u);
}

/* ---------- Google: Calendar + Gmail (read only, signed in inside your browser, nothing saved) ---------- */
const gg = (() => {
  const CID = (window.BRAIN_CONFIG && window.BRAIN_CONFIG.googleClientId) || '';
  const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly';
  let token = '', exp = 0, tc = null, at = 0, canWrite = false, canCal = false, contacts = [], contactsAt = 0;
  const data = { cal: '', mail: '', events: [], unread: null, from: [] };
  const live = () => !!token && Date.now() < exp - 30000;
  const when = (d, opt) => d.toLocaleString('en-GB', opt);
  const short = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

  async function api(url) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (r.status === 401) { token = ''; throw new Error('Google sign-in expired. Tap Connect Google again.'); }
    if (!r.ok) throw new Error('Google error ' + r.status + (r.status === 403 ? ' (is the API enabled for your project?)' : ''));
    return r.json();
  }
  const nowLine = () => 'Now: ' + when(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' (' + Intl.DateTimeFormat().resolvedOptions().timeZone + ').';

  async function loadCalendar() {
    const t0 = new Date(), t1 = new Date(Date.now() + 7 * 864e5);
    const qs = '?singleEvents=true&orderBy=startTime&maxResults=25&timeMin=' + encodeURIComponent(t0.toISOString()) + '&timeMax=' + encodeURIComponent(t1.toISOString());
    // every calendar you see in Google Calendar (family, classroom, holidays...), not only the main one
    let cals = [{ id: 'primary', summary: '' }];
    try {
      const cl = await api('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=20');
      cals = (cl.items || []).filter((c) => c.selected !== false).slice(0, 10).map((c) => ({ id: c.id, summary: c.primary ? '' : (c.summaryOverride || c.summary || '') }));
      if (!cals.length) cals = [{ id: 'primary', summary: '' }];
    } catch (e) { /* fall back to the main calendar */ }
    const results = await Promise.allSettled(cals.map((c) => api('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(c.id) + '/events' + qs).then((j) => ({ c, j }))));
    const events = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const e of r.value.j.items || []) {
        if (e.status === 'cancelled' || !e.start) continue;
        const allDay = !!e.start.date;
        const s = new Date(allDay ? e.start.date + 'T00:00:00' : e.start.dateTime), en = new Date(allDay ? e.end.date + 'T00:00:00' : e.end.dateTime);
        events.push({ title: e.summary || '(no title)', allDay, s, en, loc: e.location || '', cal: r.value.c.summary });
      }
    }
    if (!events.length && results.every((r) => r.status === 'rejected')) throw results[0].reason;
    data.events = events.sort((x, y) => x.s - y.s).slice(0, 40);
    const lines = data.events.map((e) => '- ' + when(e.s, { weekday: 'short', day: 'numeric', month: 'short' }) + (e.allDay ? ' all day' : ', ' + when(e.s, { hour: '2-digit', minute: '2-digit' }) + '-' + when(e.en, { hour: '2-digit', minute: '2-digit' })) + ': ' + short(e.title, 70) + (e.loc ? ' @ ' + short(e.loc, 40) : '') + (e.cal ? ' [' + short(e.cal, 24) + ']' : ''));
    const head = nowLine() + ' Calendar, next 7 days (' + data.events.length + ' events):\n';
    data.cal = (head + (lines.join('\n') || 'No events.')).slice(0, 1150);
  }
  async function loadMail() {
    const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';
    const [lab, list] = await Promise.all([api(base + 'labels/INBOX'), api(base + 'messages?labelIds=INBOX&maxResults=12')]);
    data.unread = lab.messagesUnread;
    const msgs = await Promise.all((list.messages || []).map((m) => api(base + 'messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date')));
    const hv = (m, n) => ((m.payload.headers || []).find((h) => h.name.toLowerCase() === n) || {}).value || '';
    const out = msgs.map((m) => {
      const from = short(hv(m, 'from').replace(/<.*>/, '').replace(/"/g, ''), 28) || 'Unknown';
      const unread = (m.labelIds || []).includes('UNREAD');
      return '- ' + (unread ? '[unread] ' : '') + from + ' (' + when(new Date(+m.internalDate), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '): ' + short(hv(m, 'subject'), 70) + ' | ' + short(m.snippet, 70);
    });
    data.from = msgs.map((m) => hv(m, 'from'));
    data.mail = ('Gmail inbox: ' + data.unread + ' unread. Latest messages:\n' + out.join('\n')).slice(0, 1150);
  }

  async function apiPost(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.status === 401) { token = ''; throw new Error('Google sign-in expired. Tap Connect Google again.'); }
    if (r.status === 403) throw new Error('Google refused. Tap Sign out, then Connect Google and allow "send email".');
    if (!r.ok) throw new Error('Google error ' + r.status);
    return r.json();
  }
  const parseAddrs = (str) => {
    const out = [], re = /(?:"?([^"<>,]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>|([^\s,<>"]+@[^\s,<>"]+)/g;
    let m;
    while ((m = re.exec(str || ''))) { const email = (m[2] || m[3] || '').toLowerCase(), name = (m[1] || '').trim(); if (email) out.push({ email, name }); }
    return out;
  };
  let book = [], bookAt = 0, bookErr = '';
  // Everyone in Google Contacts, plus people you have emailed before ("Other contacts"), loaded once and searched locally
  async function loadBook() {
    if (book.length && Date.now() - bookAt < 30 * 60000) return;
    const out = new Map();
    const add = (name, email) => { email = String(email || '').toLowerCase(); if (email && (!out.has(email) || (name && !out.get(email)))) out.set(email, name || ''); };
    const pull = async (url, key) => {
      let tok = '', n = 0;
      do {
        const j = await api(url + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
        for (const x of j[key] || []) for (const e of x.emailAddresses || []) add(((x.names || [])[0] || {}).displayName, e.value);
        tok = j.nextPageToken || ''; n++;
      } while (tok && n < 5);
    };
    bookErr = '';
    await Promise.allSettled([
      pull('https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses&pageSize=1000', 'connections').catch((e) => { bookErr = e.message; }),
      pull('https://people.googleapis.com/v1/otherContacts?readMask=names,emailAddresses&pageSize=1000', 'otherContacts').catch((e) => { bookErr = bookErr || e.message; })
    ]);
    book = [...out].map(([email, name]) => ({ email, name }));
    bookAt = Date.now();
  }
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const STOP = new Set(['email','mail','send','write','draft','compose','that','the','and','for','with','about','please','tell','him','her','them','to','from','message','gmail','jarvis','ask','say','saying','regarding']);
  const lev1 = (a, b) => { if (Math.abs(a.length - b.length) > 1) return false; let i = 0, j = 0, d = 0; while (i < a.length && j < b.length) { if (a[i] === b[j]) { i++; j++; continue; } if (++d > 1) return false; if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; } } return d + (a.length - i) + (b.length - j) <= 1; };
  // word matches a contact's name/address: exact piece, or one letter off (Elize / Elise)
  const hit = (hay, w) => hay.includes(w) || (w.length >= 4 && hay.split(/[^a-z0-9]+/).some((t) => t.length >= 4 && lev1(t, w)));
  // Words in the request that are NOT a person's name (so "pick" never matches "Pick n Pay")
  const COMMON = new Set(['pick','picks','pickup','tomorrow','today','tonight','morning','afternoon','evening','remember','remind','reminder','wondering','could','would','should','look','looking','forward','best','regards','thanks','thank','hello','hey','monday','tuesday','wednesday','thursday','friday','saturday','sunday','week','weekend','next','meeting','tell','ask','know','let','just','also','need','needs','want','wants','about','when','where','what','which','have','will','can','you','your','mine','know','coming','come','bring','ready','time','late','early','noon','night','minutes','hour','hours']);
  const isStop = (w) => STOP.has(w) || COMMON.has(w);
  // Which words in the request name the recipient? Capitalised words first ("Eliza"), then the word right after "to/for/email/tell/ask", then anything left.
  function nameWords(q) {
    const orig = String(q || '').split(/[^\p{L}\p{N}'@.-]+/u).filter(Boolean);
    const caps = orig.filter((w, i) => /^\p{Lu}/u.test(w) && w.length > 2 && !isStop(norm(w)) && !(i === 0 && /^(please|can|could|would|send|email|write|draft|hey|jarvis)$/i.test(w))).map(norm);
    if (caps.length) return [...new Set(caps)];
    const m = norm(q).match(/\b(?:to|for|tell|ask|email|e-?mail|mail|message|text)\s+(?:to\s+|for\s+)?([a-z0-9@.'-]{3,})/g);
    if (m) for (const frag of m) { const w = frag.trim().split(/\s+/).pop(); if (w && !isStop(w)) return [w]; }
    return norm(q).split(/[^a-z0-9@.]+/).filter((w) => w.length > 2 && !isStop(w));
  }
  // how a name sounds (Soundex): voice input often spells names differently ("Barry" for "Beri", "Eliza" for "Elise")
  function sdx(w) {
    w = norm(w).replace(/[^a-z]/g, '');
    if (w.length < 3) return '';
    const code = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };
    let out = w[0], prev = code[w[0]] || 0;
    for (let i = 1; i < w.length && out.length < 4; i++) {
      const ch = w[i], cd = code[ch] || 0;
      if (cd && cd !== prev) out += cd;
      if (ch !== 'h' && ch !== 'w') prev = cd;
    }
    return (out + '000').slice(0, 4);
  }
  const sounds = (a, b) => a.length >= 3 && b.length >= 3 && a[0] === b[0] && sdx(a) === sdx(b);
  // exact name part 3, one-letter-off or same-sounding name part 2, address-only match 1
  function contactScore(c, ws) {
    const nm = norm(c.name), parts = nm.split(/[^a-z0-9]+/).filter(Boolean), em = norm(c.email);
    const local = em.split('@')[0], ltoks = local.split(/[^a-z0-9]+/).filter(Boolean);
    // does the start of an address word sound like the name? (eliseretief ~ eliza: first 5 letters are one letter off)
    const pre = (t, w) => w.length >= 4 && t.length >= w.length && (t.startsWith(w) || lev1(t.slice(0, w.length), w) || lev1(t.slice(0, w.length + 1), w) || sounds(t.slice(0, w.length - 1), w) || sounds(t.slice(0, w.length), w));
    return ws.reduce((t, w) => t + (
      parts.includes(w) ? 3 :
      (w.length >= 3 && parts.some((x) => sounds(x, w))) ? 2 :
      (w.length >= 4 && parts.some((x) => x.length >= 4 && (lev1(x, w) || pre(x, w)))) ? 2 :
      (w.length >= 4 && ltoks.some((x) => pre(x, w))) ? 2 :
      (nm.includes(w) || ltoks.includes(w)) ? 1 : 0), 0);
  }
  async function getContacts(q) {
    const map = new Map();
    const add = (list) => list.forEach((a) => { if (!map.has(a.email) || (a.name && !map.get(a.email))) map.set(a.email, a.name); });
    // 1) anyone in your Contacts / past correspondents whose name or address matches a word in the request
    try { await loadBook(); } catch (e) { /* fall back to recent mail below */ }
    const words = nameWords(q);
    if (words.length && book.length) {
      const hits = book.map((c) => ({ c, s: contactScore(c, words) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 25);
      hits.forEach((x) => map.set(x.c.email, x.c.name));
    }
    // 2) recent senders and recipients
    data.from.forEach((f) => add(parseAddrs(f)));
    if (!contacts.length || Date.now() - contactsAt > 10 * 60000) {
      try {
        const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';
        const list = await api(base + 'messages?labelIds=SENT&maxResults=30');
        const msgs = await Promise.all((list.messages || []).map((m) => api(base + 'messages/' + m.id + '?format=metadata&metadataHeaders=To').catch(() => null)));
        msgs.forEach((m) => { if (m) add(parseAddrs(((m.payload.headers || []).find((h) => h.name.toLowerCase() === 'to') || {}).value)); });
      } catch (e) { /* inbox senders alone are fine */ }
      contacts = [1]; contactsAt = Date.now();
    }
    // 3) if the name still matches nothing, ask Gmail itself
    if (words.length && ![...map].some(([e, n]) => words.some((w) => hit(norm(n + ' ' + e), w)))) {
      try {
        const base = 'https://gmail.googleapis.com/gmail/v1/users/me/';
        const list = await api(base + 'messages?maxResults=8&q=' + encodeURIComponent('(' + words.slice(0, 3).map((w) => 'from:' + w + ' OR to:' + w).join(' OR ') + ')'));
        const msgs = await Promise.all((list.messages || []).map((m) => api(base + 'messages/' + m.id + '?format=metadata&metadataHeaders=From&metadataHeaders=To').catch(() => null)));
        msgs.forEach((m) => { if (m) (m.payload.headers || []).forEach((h) => add(parseAddrs(h.value).filter((a) => words.some((w) => hit(norm(a.name + ' ' + a.email), w))))); });
      } catch (e) { /* ignore */ }
    }
    return [...map].filter(([e]) => !/no-?reply|noreply|notifications?@/.test(e)).slice(0, 60).map(([e, n]) => (n ? n + ' <' + e + '>' : e));
  }
  const b64 = (str) => { const by = new TextEncoder().encode(str); let bin = ''; by.forEach((b) => { bin += String.fromCharCode(b); }); return btoa(bin); };
  const b64url = (str) => b64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function rawMessage(to, subject, body) {
    const clean = (t) => String(t).replace(/[\r\n]+/g, ' ').trim();
    return [
      'To: ' + clean(to),
      'Subject: =?UTF-8?B?' + b64(clean(subject) || '(no subject)') + '?=',
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      (b64(body.replace(/\r?\n/g, '\r\n')).match(/.{1,76}/g) || []).join('\r\n')
    ].join('\r\n');
  }
  const validTo = (t) => /^[^\s<>,;"]+@[^\s<>,;"]+\.[^\s<>,;"]+$/.test(t.trim());
  const cf = () => ({ to: $('#cTo'), subj: $('#cSubj'), body: $('#cBody') });
  function hideCompose() { $('#compose').hidden = true; }
  async function act(kind) {
    const f = cf(), to = f.to.value.trim(), body = f.body.value;
    if (!validTo(to)) { toast('Type one valid email address in the To box first'); f.to.focus(); return; }
    if (!body.trim()) { toast('The message is empty'); return; }
    if (!live()) { toast('Google sign-in expired. Tap Connect Google again.'); return; }
    if (!canWrite) { toast('Tap Sign out, then Connect Google again and allow "send email".'); return; }
    const btns = ['#cSend', '#cSave', '#cCancel'].map((x) => $(x));
    btns.forEach((b) => { b.disabled = true; });
    try {
      const raw = b64url(rawMessage(to, f.subj.value, body));
      if (kind === 'send') {
        await apiPost('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { raw });
        toast('Email sent to ' + to);
        say('Sent.');
      } else {
        await apiPost('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { message: { raw } });
        toast('Saved to your Gmail drafts');
      }
      hideCompose();
    } catch (e) { toast(e.message); }
    btns.forEach((b) => { b.disabled = false; });
  }
  const isComposeRequest = (q) => !/^\s*(?:how|what|why|can you explain|explain)\b/i.test(q) && !/\be-?mail\s+address\b/i.test(q) && (
    /\b(?:write|draft|compose|send|prepare|create|make|start|open|shoot|fire off)\b(?:\s+[\w'@.-]+){0,5}?\s+(?:an?\s+|the\s+|my\s+|new\s+)*(?:new\s+)?(?:e-?mail|mail|gmail|message)\b/i.test(q) ||
    /(?:^|\b(?:can you|could you|would you|will you|please|jarvis|hey|ok|okay|now)[\s,]+)(?:send\s+)?e-?mail\s+(?!address|me\b|messages?\b|inbox|from\b|today|about\s+my\b)\S/i.test(q));
  // "what is the email address of Anna", "find Anna's email": look the person up in Contacts and Gmail history
  const isLookup = (q) => /\b(?:e-?mail(?:\s+address)?|mail\s+address|address)\b/i.test(q) && /\b(?:what(?:'s| is)|find|look\s*up|search|get|give me|show|do you have|know|whose|who)\b/i.test(q) && !/\b(?:write|draft|compose|send)\b/i.test(q);
  async function lookupAddress(q) {
    const box = $('#answer');
    if (!live()) { box.replaceChildren(el('span', 'muted', 'Tap Connect Google first, then ask again.')); return; }
    chat.busy = true; orb.set('thinking');
    box.replaceChildren(el('span', 'muted', 'Looking in your contacts and Gmail…'));
    try {
      const list = await getContacts(q);
      const ws = norm(q).split(/[^a-z0-9@.]+/).filter((w) => w.length > 2 && !STOP.has(w) && !LSTOP.has(w));
      const pool = [...book, ...list.flatMap((x) => parseAddrs(x))];
      const seen = new Set(), hits = [];
      for (const c of pool) {
        if (seen.has(c.email)) continue;
        const hay = norm(c.name + ' ' + c.email), sc = ws.reduce((t, w) => t + (hit(hay, w) ? 1 : 0), 0);
        if (ws.length && sc > 0) { seen.add(c.email); hits.push({ c, sc }); }
      }
      hits.sort((a, b) => b.sc - a.sc);
      const top = hits.slice(0, 5).map((h) => (h.c.name ? h.c.name + ': ' : '') + h.c.email);
      const msg = top.length ? (top.length === 1 ? 'Found: ' : 'Found these: ') + top.join('; ') : 'I could not find that person (searched ' + (book.length ? book.length + ' contacts' : 'recent mail only' + (bookErr ? ', contacts error: ' + bookErr : '')) + ' and your recent Gmail). Try the full name as it is saved in Google Contacts.';
      box.replaceChildren(el('span', null, msg)); orb.set('idle'); say(msg);
    } catch (e) {
      box.replaceChildren(el('span', 'err', 'Lookup failed: ' + e.message)); orb.set('idle');
    } finally { chat.busy = false; }
  }
  const LSTOP = new Set(['address','what','whats','find','look','search','get','give','show','have','know','whose','who','does','his','her','their','please','of','is','for','from']);
  const isBare = (q) => q.replace(/\b(?:please|jarvis|hey|ok|okay|i|want|would|like|to|can|you|could|me|a|an|the|my|new|write|draft|compose|send|create|prepare|make|start|open|e-?mail|mail|gmail|message|via|using|with|in|on|for|now)\b/gi, ' ').replace(/[^\p{L}\p{N}@.]+/gu, ' ').trim().split(/\s+/).filter(Boolean).length < 2;
  async function compose(q) {
    const box = $('#answer');
    if (!AI_READY()) { box.replaceChildren(el('span', 'muted', 'Drafting emails needs a free AI key (panel: Free AI key).')); return; }
    if (!live()) { box.replaceChildren(el('span', 'muted', 'Tap Connect Google (Calendar & Gmail panel) first, then ask again.')); return; }
    if (!canWrite) { box.replaceChildren(el('span', 'muted', 'Tap Sign out, then Connect Google again and allow "send email", then ask again.')); return; }
    if (isBare(q)) {                                                          // no recipient or topic given: open an empty draft to fill in
      const f0 = cf(); f0.to.value = ''; f0.subj.value = ''; f0.body.value = '';
      $('#compose').hidden = false; panel.classList.remove('closed');
      $('#compose').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const m0 = 'Who is it for and what should it say? Type it in the form, or ask me again, for example: email Anna that the meeting moved to Thursday.';
      box.replaceChildren(el('span', null, m0)); say(m0); return;
    }
    chat.busy = true; orb.set('thinking');
    box.replaceChildren(el('span', 'muted', 'Writing the draft…'));
    try {
      const list = await getContacts(q);
      const r = await brainFetch({ compose: q, contacts: list });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.draft) throw new Error(d.error || 'No draft (' + r.status + ')');
      const f = cf();
      // pick the recipient ourselves: the best local match for the names in the request wins; the AI's guess is only trusted if it was spelled out or really matches a name
      const ws = nameWords(q);
      const pool = [...book, ...list.flatMap((x) => parseAddrs(x))];
      const scored = pool.map((c) => ({ c, s: contactScore(c, ws) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
      // with a first AND last name ("Barry Retief"), the first name must match too: a shared surname alone is never enough
      const first = ws[0], strict = ws.length > 1 ? scored.filter((x) => contactScore(x.c, [first]) > 0) : scored;
      const seenE = new Set(), near = [];
      for (const x of scored) if (!seenE.has(x.c.email) && !strict.includes(x) && near.length < 3) { seenE.add(x.c.email); near.push((x.c.name ? x.c.name + ' ' : '') + '<' + x.c.email + '>'); }
      let addr = strict.length ? { name: strict[0].c.name, email: strict[0].c.email } : null;
      if (!addr) {
        const ai = parseAddrs(d.draft.to)[0];
        const typed = ai && norm(q).includes(ai.email);
        if (typed) addr = ai;
      }
      f.to.value = addr ? addr.email : '';
      f.subj.value = d.draft.subject || '';
      f.body.value = d.draft.body || '';
      $('#compose').hidden = false;
      panel.classList.remove('closed');
      $('#compose').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const who = addr ? (addr.name || addr.email) : '';
      const msg = who ? 'Draft ready for ' + who + '. Check it, then tap Send.' : 'Draft ready, but I could not find an address for ' + (ws.length > 1 ? ws.join(' ') : (ws[0] || 'that person')) + ' (' + (book.length ? 'searched ' + book.length + ' contacts' : 'no contacts could be read' + (bookErr ? ': ' + bookErr : '')) + ').' + (near.length ? ' Similar names: ' + near.join('; ') + '.' : '') + ' Type the address in the To box, then tap Send.';
      box.replaceChildren(el('span', null, msg));
      orb.set('idle');
      say(msg);
    } catch (e) {
      box.replaceChildren(el('span', 'err', 'Could not write the draft: ' + e.message));
      orb.set('idle');
    } finally { chat.busy = false; }
  }

  // ---- calendar events by voice: Jarvis fills in the event, you tap Add ----
  const isEventRequest = (q) => !/^\s*(?:how|what|why|when|do i|am i|is there|any)\b/i.test(q) && /\b(?:add|create|schedule|book|put|set up|plan|make)\b[^.?!]*\b(?:meeting|event|appointment|call|lunch|dinner|reminder|calendar|interview|training|session)\b/i.test(q);
  const evf = () => ({ title: $('#eTitle'), start: $('#eStart'), end: $('#eEnd'), loc: $('#eLoc') });
  const hideEvent = () => { $('#evcard').hidden = true; };
  async function addEventDraft(q) {
    const box = $('#answer');
    if (!AI_READY()) { box.replaceChildren(el('span', 'muted', 'Calendar events need a free AI key (panel: Free AI key).')); return; }
    if (!live()) { box.replaceChildren(el('span', 'muted', 'Tap Connect Google first, then ask again.')); return; }
    if (!canCal) { box.replaceChildren(el('span', 'muted', 'Tap Sign out, then Connect Google again and allow "calendar events", then ask again.')); return; }
    chat.busy = true; orb.set('thinking');
    box.replaceChildren(el('span', 'muted', 'Preparing the event…'));
    try {
      const r = await brainFetch({ event: q, now: nowLine() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.event) throw new Error(d.error || 'No event (' + r.status + ')');
      const f = evf(), e = d.event;
      f.title.value = e.title; f.start.value = e.start;
      if (e.end) f.end.value = e.end; else { const t = new Date(e.start); t.setHours(t.getHours() + 1); f.end.value = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
      f.loc.value = e.location || '';
      $('#evcard').hidden = false; panel.classList.remove('closed');
      $('#evcard').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const msg = 'Event ready: ' + e.title + ', ' + when(new Date(e.start), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + '. Check it, then tap Add.';
      box.replaceChildren(el('span', null, msg)); orb.set('idle'); say(msg);
    } catch (e) {
      box.replaceChildren(el('span', 'err', 'Could not prepare the event: ' + e.message)); orb.set('idle');
    } finally { chat.busy = false; }
  }
  async function saveEvent() {
    const f = evf();
    if (!f.title.value.trim() || !f.start.value) { toast('Give the event a title and a start time'); return; }
    if (!live()) { toast('Google sign-in expired. Tap Connect Google again.'); return; }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const body = { summary: f.title.value.trim(), location: f.loc.value.trim() || undefined, start: { dateTime: f.start.value + ':00', timeZone: tz }, end: { dateTime: (f.end.value || f.start.value) + ':00', timeZone: tz } };
    const b = $('#eAdd'); b.disabled = true;
    try {
      await apiPost('https://www.googleapis.com/calendar/v3/calendars/primary/events', body);
      toast('Added to your calendar'); say('Added to your calendar.'); hideEvent(); refresh();
    } catch (e) { toast(e.message); }
    b.disabled = false;
  }

  function render(msg) {
    const st = $('#gStatus'), ag = $('#gAgenda');
    const on = live();
    $('#gConnect').hidden = on; $('#gRefresh').hidden = !on; $('#gOut').hidden = !on;
    ag.replaceChildren();
    if (!CID) { st.textContent = 'Needs a Google client ID in site/config.js (see the README).'; $('#gConnect').hidden = true; return; }
    st.textContent = msg || (on ? 'Connected. Ask Jarvis: "What is on my calendar today?", "Any new emails?" or "Email Anna that the meeting moved to Thursday". Nothing is sent until you tap Send.' : 'Not connected. Your calendar and Gmail are read live in this browser and never saved.');
    if (!on) return;
    const upcoming = data.events.filter((e) => e.en > new Date()).slice(0, 4);
    for (const e of upcoming) {
      const row = el('div', 'ev');
      row.append(el('b', null, e.allDay ? when(e.s, { day: 'numeric', month: 'short' }) : when(e.s, { weekday: 'short', hour: '2-digit', minute: '2-digit' })), el('span', null, e.title));
      ag.append(row);
    }
    if (!upcoming.length && data.cal) ag.append(el('div', 'ev', 'No upcoming events this week.'));
    if (data.unread != null) ag.append(el('div', 'mail', data.unread + ' unread in your inbox'));
  }

  async function refresh() {
    if (!live()) { render(); return; }
    $('#gStatus').textContent = 'Reading your calendar and inbox…';
    const [c, m] = await Promise.allSettled([loadCalendar(), loadMail()]);
    at = Date.now();
    const err = [c, m].find((x) => x.status === 'rejected');
    render(err ? err.reason.message : null);
  }

  function connect() {
    if (!window.google || !google.accounts) { toast('Google sign-in is still loading. Try again in a moment.'); return; }
    tc = tc || google.accounts.oauth2.initTokenClient({
      client_id: CID, scope: SCOPES,
      callback: (r) => {
        if (r.error) { toast('Google: ' + (r.error_description || r.error)); return; }
        token = r.access_token; exp = Date.now() + (+r.expires_in || 3600) * 1000;
        canWrite = String(r.scope || '').includes('gmail.compose');
        canCal = String(r.scope || '').includes('calendar.events');
        refresh();
      },
      error_callback: (e) => toast('Google sign-in ' + ((e && e.type) || 'failed').replace(/_/g, ' '))
    });
    tc.requestAccessToken({ prompt: '' });
  }
  function signOut() {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = ''; exp = 0; canWrite = false; canCal = false; contacts = []; book = []; bookAt = 0; data.cal = data.mail = ''; data.events = []; data.unread = null; data.from = [];
    hideCompose();
    render();
  }
  function init() {
    render();
    if (!CID) return;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    document.head.append(s);
    $('#gConnect').addEventListener('click', connect);
    $('#gRefresh').addEventListener('click', refresh);
    $('#gOut').addEventListener('click', signOut);
    $('#cSend').addEventListener('click', () => act('send'));
    $('#cSave').addEventListener('click', () => act('draft'));
    $('#cCancel').addEventListener('click', hideCompose);
    $('#eAdd').addEventListener('click', saveEvent);
    $('#eCancel').addEventListener('click', hideEvent);
  }
  // Extra notes for Jarvis, only when the question is about calendar or mail
  async function notesFor(q) {
    if (!live()) return [];
    const wantCal = /calendar|schedule|meeting|appointment|agenda|event|busy|free|today|tomorrow|tonight|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|brief|status|plan/i.test(q);
    const wantMail = /mail|inbox|message|unread|sender|gmail|brief|status/i.test(q);
    if (!wantCal && !wantMail) return [];
    if (Date.now() - at > 5 * 60000) { try { await refresh(); } catch (e) {} }
    const out = [];
    if (wantCal && data.cal) out.push({ title: 'Your calendar', type: 'google', text: data.cal });
    if (wantMail && data.mail) out.push({ title: 'Your Gmail inbox', type: 'google', text: data.mail });
    return out;
  }
  return { init, notesFor, live, compose, isComposeRequest, isEventRequest, addEventDraft, isLookup, lookupAddress };
})();

/* ---------- Services: quick answers that need no AI and no key (weather, date and time). Add more to SERVICES below. ---------- */
const svc = (() => {
  const store = (k, v) => { try { if (v === undefined) return localStorage.getItem('brain.' + k) || ''; if (v) localStorage.setItem('brain.' + k, v); else localStorage.removeItem('brain.' + k); } catch (e) {} return ''; };
  const getJSON = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error('service error ' + r.status); return r.json(); };
  const cityRe = "([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'. -]{1,40}?)";
  // ---- places ----
  async function geocode(name) {
    const d = await getJSON('https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=' + encodeURIComponent(name));
    const g = (d.results || [])[0];
    if (!g) return null;
    return { name: g.name + (g.country ? ', ' + g.country : ''), lat: g.latitude, lon: g.longitude, tz: g.timezone };
  }
  const home = () => { try { return JSON.parse(store('home') || 'null'); } catch (e) { return null; } };
  function here() {                                                // browser location (asks permission once)
    return new Promise((res) => {
      if (!navigator.geolocation) { res(null); return; }
      navigator.geolocation.getCurrentPosition((p) => res({ name: 'your location', lat: p.coords.latitude, lon: p.coords.longitude }), () => res(null), { timeout: 8000, maximumAge: 3600000 });
    });
  }
  // ---- weather ----
  const WMO = { 0: 'clear sky', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'heavy showers', 85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail' };
  const wmo = (c) => WMO[c] || 'mixed weather';
  const isWeather = (q) => /\b(?:weather|forecast|temperature|umbrella|raining|snowing|will it (?:rain|snow)|is it (?:raining|snowing|cold|hot|warm|sunny)|how (?:hot|cold|warm) is it)\b/i.test(q) && !/\b(?:write|draft|compose|email|e-mail|mail)\b/i.test(q);
  const isSetHome = (q) => /\b(?:my (?:home )?(?:city|town|location) is|i live in|set my (?:home )?(?:city|town|location) to|change my (?:home )?(?:city|town|location) to)\s+\S/i.test(q);
  async function setHome(q) {
    const m = q.match(new RegExp("(?:my (?:home )?(?:city|town|location) is|i live in|set my (?:home )?(?:city|town|location) to|change my (?:home )?(?:city|town|location) to)\\s+" + cityRe + "\\s*[.!?]*$", 'i'));
    const g = m ? await geocode(m[1].trim()) : null;
    if (!g) return 'I could not find that place. Try the city name, for example: my city is Brussels.';
    store('home', JSON.stringify(g));
    return 'Done. Your home location is ' + g.name + '. I will use it for the weather and the time.';
  }
  async function weather(q) {
    const when = /\bday after tomorrow\b/i.test(q) ? 2 : /\btomorrow\b/i.test(q) ? 1 : 0;
    const pm = q.match(new RegExp("\\b(?:in|for|at|near)\\s+(?!the\\b|my\\b|today\\b|tomorrow\\b|this\\b|next\\b|a\\b)" + cityRe + "(?=\\s+(?:today|tomorrow|tonight|this|next|on|right|now|please)\\b|[?.!,]|$)", 'i'));
    let place = null;
    if (pm) { place = await geocode(pm[1].trim()); if (!place) return 'I could not find a place called ' + pm[1].trim() + '.'; }
    else place = home() || await here();
    if (!place) return 'I do not know where you are yet. Tell me your city, for example: my city is Brussels. Or ask: weather in Brussels.';
    const d = await getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + place.lat + '&longitude=' + place.lon + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=3&wind_speed_unit=kmh');
    const dd = d.daily, i = Math.min(when, dd.time.length - 1);
    const hi = Math.round(dd.temperature_2m_max[i]), lo = Math.round(dd.temperature_2m_min[i]), rain = dd.precipitation_probability_max[i], wind = Math.round(dd.wind_speed_10m_max[i]);
    const label = place.name === 'your location' ? '' : ' in ' + place.name;
    const day = ['today', 'tomorrow', 'the day after tomorrow'][i];
    let out = '';
    if (i === 0) {
      const c = d.current;
      out = 'Right now' + label + ' it is ' + Math.round(c.temperature_2m) + ' degrees with ' + wmo(c.weather_code) + (Math.abs(c.apparent_temperature - c.temperature_2m) >= 3 ? ', feels like ' + Math.round(c.apparent_temperature) : '') + '. Today: high ' + hi + ', low ' + lo + (rain != null ? ', ' + rain + ' percent chance of rain' : '') + ', wind up to ' + wind + ' kilometres per hour.';
    } else {
      out = 'Weather' + label + ' ' + day + ': ' + wmo(dd.weather_code[i]) + ', high ' + hi + ', low ' + lo + (rain != null ? ', ' + rain + ' percent chance of rain' : '') + ', wind up to ' + wind + ' kilometres per hour.';
    }
    if (rain != null && rain >= 50) out += ' Take an umbrella.';
    return out;
  }
  // ---- date and time ----
  const isTime = (q) => /\b(?:what(?:'s| is) (?:the )?(?:time|date|day)|what time is it|what day is it|today'?s date|what is today|current time|time now)\b/i.test(q);
  async function time(q) {
    const pm = q.match(new RegExp("\\b(?:in|at)\\s+(?!the\\b|my\\b)" + cityRe + "(?=[?.!,]|$)", 'i'));
    let tz = undefined, label = '';
    if (pm) {
      const g = await geocode(pm[1].trim());
      if (!g) return 'I could not find a place called ' + pm[1].trim() + '.';
      tz = g.tz; label = ' in ' + g.name;
    }
    const now = new Date();
    const t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }).format(now);
    const dt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(now);
    return /\b(?:date|day)\b/i.test(q) && !/\btime\b/i.test(q) ? 'It is ' + dt + label + '.' : 'It is ' + t + ' on ' + dt + label + '.';
  }
  // ---- register services here: { match(question) -> bool, run(question) -> Promise<string> } ----
  const SERVICES = [
    { match: isSetHome, run: setHome },
    { match: isWeather, run: weather },
    { match: isTime, run: time }
  ];
  const find = (q) => SERVICES.find((x) => x.match(q));
  async function handle(q) {
    const svcFound = find(q);
    if (!svcFound) return false;
    chat.busy = true; orb.set('thinking');
    $('#answer').replaceChildren(el('span', 'muted', 'One moment…'));
    try {
      const text = await svcFound.run(q);
      renderAnswer(text); orb.set('idle'); say(text);
    } catch (e) {
      const msg = 'Sorry, that service is not reachable right now (' + (e && e.message ? e.message : 'error') + ').';
      $('#answer').replaceChildren(el('span', 'err', msg)); orb.set('idle');
    } finally { chat.busy = false; }
    return true;
  }
  return { match: (q) => !!find(q), handle };
})();

const WEB_RE = /\b(?:search|look\s*up|google|latest|news|current(?:ly)?|today'?s|weather|price of|who is|who was|what is the (?:capital|population)|how much (?:is|does)|score|stock|exchange rate)\b/i;

// Fly through the most connected notes and read each one out
async function tour() {
  const hubs = [...S.vis].sort((a, b) => b.degree - a.degree).slice(0, 6);
  if (!hubs.length) return;
  chat.busy = true; panel.classList.remove('closed');
  const box = $('#answer');
  try {
    S.flat = false; $('#btn3d').setAttribute('aria-pressed', 'true');
    for (const n of hubs) {
      select(n.i, true); reheat(0.3);
      const nt = NOTES.find((x) => x.title === n.title);
      const first = nt ? String(nt.text || '').replace(/^---[\s\S]*?---/, '').replace(/[#*>\[\]`]/g, '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] : '';
      const line = n.title + '. ' + (first || 'It connects to ' + n.degree + ' other notes.').slice(0, 160);
      box.replaceChildren(el('span', null, line));
      say(line);
      await new Promise((r) => setTimeout(r, 600));
      const t0 = Date.now();
      while (Date.now() - t0 < 30000 && (voiceBox.busy() || ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)))) await new Promise((r) => setTimeout(r, 250));
      if (!$('#speak').checked) await new Promise((r) => setTimeout(r, 3500));
      await new Promise((r) => setTimeout(r, 500));
    }
    fit(false); box.replaceChildren(el('span', null, 'That was the tour of your most connected notes.'));
  } finally { chat.busy = false; orb.set('idle'); }
}

async function ask(question) {
  if (chat.busy || !question) return;
  if (gg.isComposeRequest(question)) { await gg.compose(question); return; }
  if (gg.isEventRequest(question)) { await gg.addEventDraft(question); return; }
  if (gg.isLookup(question)) { await gg.lookupAddress(question); return; }
  if (svc.match(question)) { await svc.handle(question); return; }
  if (/\b(?:tour|show me around|walk me through|fly through)\b/i.test(question)) { await tour(); return; }
  const box = $('#answer');
  let ask_q = question;
  if (/^\s*(?:good\s+(?:morning|afternoon|evening)|morning|briefing|brief me|daily brief|jarvis status|status)\b/i.test(question)) ask_q = 'Give me a short spoken briefing for now: my calendar for today and tomorrow, my unread email, and my open items from the notes. Three or four sentences.';
  if (!AI_READY()) {                                            // free search mode
    const a = localAnswer(question);
    renderAnswer(a);
    orb.set('idle');
    say(a);
    return;
  }
  chat.busy = true;
  orb.set('thinking');
  $('#askGo').disabled = true;
  box.replaceChildren(el('span', 'muted', 'Thinking…'));
  S.cited = new Set();
  try {
    let web = [];
    if (WEB_RE.test(question)) {                                   // needs current information: search the web through the Worker
      box.replaceChildren(el('span', 'muted', 'Searching the web…'));
      try {
        const wr = await brainFetch({ search: question.replace(/^\s*(?:please\s+)?(?:search(?:\s+the\s+web)?(?:\s+for)?|look\s+up|google)\s+/i, '') });
        const wd = await wr.json().catch(() => ({}));
        web = (wd.results || []).slice(0, 5).map((x) => ({ title: x.title, type: 'web', text: x.text + ' (' + x.url + ')' }));
      } catch (e) { /* answer without it */ }
    }
    const r = await brainFetch({ question: ask_q, notes: [...web, ...(await gg.notesFor(ask_q)), ...retrieve(ask_q)].slice(0, 12), history: chat.history });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.answer) throw new Error(data.error || 'No answer (' + r.status + ')');
    chat.history.push({ role: 'user', content: question }, { role: 'assistant', content: data.answer });
    chat.history = chat.history.slice(-6);
    renderAnswer(data.answer);
    orb.set('idle');
    say(data.answer);
  } catch (e) {
    box.replaceChildren(el('span', 'err', 'Could not get an answer: ' + e.message));
    orb.set('idle');
  } finally {
    chat.busy = false;
    $('#askGo').disabled = false;
  }
}

function initChat() {
  const form = $('#askForm'), input = $('#askInput'), mic = $('#askMic');
  if (!AI_READY()) {
    input.placeholder = 'Search your notes… (free mode)';
  }
  fetch('notes.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { NOTES = d; }).catch(() => {});
  form.addEventListener('submit', (e) => {
    voiceBox.unlock();
    e.preventDefault();
    const q = input.value.trim();
    input.value = '';
    input.blur();
    ask(q);
  });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mic.style.display = 'none';
    orb.el.addEventListener('click', () => {
      voiceBox.unlock();
      if (convo.supported()) { convo.toggle(); return; }                  // hands-free mode needs no browser speech support
      panel.classList.remove('closed'); input.focus(); toast('Voice input is not supported in this browser. Type instead.');
    });
    return;
  }
  let voiceBroken = false;
  const typeInstead = () => {
    panel.classList.remove('closed');
    $('#speak').checked = true;
    input.focus();
    toast('Tap the mic key on the keyboard, speak, then press Send');
  };
  const startListening = () => {
    if (orb.get() === 'listening') return;
    if (voiceBroken) { typeInstead(); return; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const rec = new SR();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    mic.classList.add('on');
    rec.onstart = () => orb.set('listening');
    rec.onresult = (ev) => { const t = ev.results[0][0].transcript; input.value = ''; ask(t); };
    rec.onerror = (ev) => {
      if (ev.error === 'no-speech') { toast('Did not hear anything, try again'); return; }
      if (ev.error === 'network') { toast('Speech service needs internet'); return; }
      // Safari often refuses web speech even with Dictation on: switch to the keyboard mic for good
      voiceBroken = true;
      typeInstead();
    };
    rec.onend = () => { mic.classList.remove('on'); if (orb.get() === 'listening') orb.set('idle'); };
    try { rec.start(); } catch (e) { mic.classList.remove('on'); orb.set('idle'); }
  };
  mic.addEventListener('click', startListening);
  // Tapping the orb = talk to Jarvis, and Jarvis talks back
  orb.el.addEventListener('click', () => {
    voiceBox.unlock();
    if (convo.supported()) { convo.toggle(); return; }
    $('#speak').checked = true; startListening();
  });
}

/* ---------- hands-free conversation (needs the Worker for speech-to-text) ---------- */
const convo = (() => {
  let on = false, stream = null, ctx = null, lastPeak = 0, tried = new Set();
  const micSel = () => document.getElementById('mic');
  const savedMic = () => { try { return localStorage.getItem('brain.mic') || ''; } catch (e) { return ''; } };
  const openStream = (id) => navigator.mediaDevices.getUserMedia({ audio: Object.assign({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }, id ? { deviceId: { exact: id } } : {}) });
  async function listMics() {
    let all = [];
    try { all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId !== 'communications'); } catch (e) {}
    const sel = micSel(); if (!sel) return all;
    const cur = stream && stream.getAudioTracks()[0] ? stream.getAudioTracks()[0].getSettings().deviceId : '';
    sel.innerHTML = '';
    all.forEach((d, i) => { const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || ('Microphone ' + (i + 1)); if (d.deviceId === cur) o.selected = true; sel.appendChild(o); });
    return all;
  }
  async function useMic(id) {                                           // switch to another microphone
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = await openStream(id);
    tried.add(stream.getAudioTracks()[0].getSettings().deviceId || id);
    try { localStorage.setItem('brain.mic', id || ''); } catch (e) {}
    await listMics();
  }
  const say2 = (m) => { toast(m); const el = document.getElementById('voiceStatus'); if (el) el.textContent = m; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const supported = () => !!(AI_READY() && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

  // Wait for the user to speak, record until they pause, return the clip (or null if nobody spoke)
  async function record() {
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize);
    const level = () => { an.getFloatTimeDomainData(buf); let t = 0; for (const v of buf) t += v * v; return Math.sqrt(t / buf.length); };
    const rec = new MediaRecorder(stream);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start();
    const t0 = performance.now();
    let sum = 0, n = 0, thr = 0.02, spoke = false, lastVoice = 0, peak = 0;
    const lab = document.getElementById('orbState');
    const bar = (v) => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor(v / 0.06 * 8))];
    while (on) {
      await sleep(60);
      const now = performance.now(), lv = level();
      peak = Math.max(peak, lv);
      if (lab && orb.get() === 'listening') lab.textContent = 'LISTENING ' + bar(lv) + bar(peak);
      if (now - t0 < 450) {                                               // measure room noise first
        sum += Math.min(lv, 0.03); n++;
        thr = Math.max((sum / n) * 3, (sum / n) + 0.01, 0.012);
        continue;
      }
      if (lv > thr) { spoke = true; lastVoice = now; }
      if (spoke && now - lastVoice > 1300) break;                         // paused: done
      if (!spoke && now - t0 > 12000) break;                              // nobody spoke
      if (now - t0 > 30000) break;
    }
    lastPeak = peak;
    rec.stop(); await stopped; src.disconnect();
    return spoke && on ? new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }) : null;
  }

  async function transcribe(blob) { return brainSTT(blob); }

  async function loop() {
    while (on) {
      orb.set('listening');
      let clip;
      try { clip = await record(); } catch (e) { say2('Recording failed: ' + e.message); break; }
      if (!on) break;
      if (!clip) {
        const dev = stream && stream.getAudioTracks()[0] ? stream.getAudioTracks()[0].label : 'unknown microphone';
        if (lastPeak < 0.004) {                                              // silent mic: try the next one automatically
          const all = await listMics();
          const next = all.find((d) => !tried.has(d.deviceId));
          if (next) {
            try { await useMic(next.deviceId); say2('Mic "' + dev + '" was silent. Trying "' + (next.label || 'next microphone') + '".'); continue; } catch (e) {}
          }
          say2('No microphone picked up sound (last tried "' + dev + '"). Choose another under Microphone in the panel, or check Windows Sound > Input.');
        } else say2('Did not catch speech (mic "' + dev + '"). Tap the orb and try again.');
        break;
      }
      orb.set('thinking'); say2('Heard you, working on it…');
      let text = '';
      try { text = await transcribe(clip); } catch (e) { say2(e.message); break; }
      if (!text.trim()) continue;
      $('#askInput').value = '';
      await ask(text.trim());
      await sleep(400);                                                     // let the answer start speaking
      while (on && (voiceBox.busy() || ('speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)))) await sleep(200);
      await sleep(300);
    }
    stop();
  }

  async function start() {
    if (on) return;
    try {
      tried = new Set();
      try { stream = await openStream(savedMic()); } catch (e) { if (e && e.name === 'NotFoundError' || e && e.name === 'OverconstrainedError') stream = await openStream(''); else throw e; }
      const id0 = stream.getAudioTracks()[0].getSettings().deviceId; if (id0) tried.add(id0);
      listMics();
    } catch (e) {
      say2(e && e.name === 'NotFoundError' ? 'No microphone found on this device' : 'Microphone blocked: click the lock icon in the address bar and allow Microphone (Safari: Website Settings)');
      return false;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    try { await ctx.resume(); } catch (e) {}
    on = true; $('#speak').checked = true; say2('Listening… speak now.');
    orb.el.classList.add('live');
    loop();
    return true;
  }
  function stop() {
    on = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    voiceBox.stop();
    orb.el.classList.remove('live');
    orb.set('idle');
  }
  document.addEventListener('change', async (e) => {
    if (e.target && e.target.id === 'mic') {
      if (on && stream) { try { tried = new Set(); await useMic(e.target.value); say2('Microphone changed'); } catch (err) { say2('Could not use that microphone'); } }
      else { try { localStorage.setItem('brain.mic', e.target.value); } catch (err) {} }
    }
  });
  return { supported, toggle: () => (on ? stop() : start()), isOn: () => on };
})();

/* ---------- Free AI key (stored only in this browser) ---------- */
(() => {
  const inp = $('#gkKey'), btn = $('#gkSave'), st = $('#gkStatus'), clr = $('#gkClear');
  if (!inp) return;
  const show = () => {
    const on = !!GKEY();
    st.textContent = on ? 'Key saved in this browser (' + (IS_GEM() ? 'Google Gemini' : 'Groq') + '). Jarvis uses it directly.' : 'Paste a free Groq key (gsk_...) or Google Gemini key (AIza...). It stays in this browser only.';
    inp.value = ''; clr.hidden = !on;
  };
  btn.addEventListener('click', async () => {
    const k = inp.value.trim();
    if (!/^(gsk_[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_\-]{20,})$/.test(k)) { toast('That does not look like a key. Groq keys start with gsk_, Google Gemini keys start with AIza'); return; }
    btn.disabled = true;
    try {
      const gem = /^AIza/.test(k);
      const r = gem ? await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=5&key=' + encodeURIComponent(k)) : await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + k } });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 400 || r.status === 403 ? 'This key is not valid' : 'Key check failed (' + r.status + ')');
      localStorage.setItem('brain.groq', k); groqModel = ''; gemModel = '';
      toast('Groq key works and is saved'); show();
    } catch (e) { toast(e.message === 'Failed to fetch' ? 'Could not reach Groq. Check your internet or VPN.' : e.message); }
    btn.disabled = false;
  });
  clr.addEventListener('click', () => { try { localStorage.removeItem('brain.groq'); } catch (e) {} groqModel = ''; gemModel = ''; show(); });
  show();
})();

/* ---------- VoiceStudio settings (stored only in this browser) ---------- */
(() => {
  const url = $('#vsUrl'), voice = $('#vsVoice'), key = $('#vsKey'), listen = $('#vsListen'), save = $('#vsSave'), clr = $('#vsClear'), st = $('#vsStatus');
  if (!url) return;
  const show = () => {
    const on = VS.configured();
    url.value = VS.get('Url'); voice.value = VS.get('Voice'); listen.checked = VS.get('Listen') === '1';
    key.value = ''; key.placeholder = VS.get('Key') ? 'API key saved (type to replace)' : 'API key (only if you set one)';
    clr.hidden = !on;
    st.textContent = on ? 'Saved. Pick "VoiceStudio (your PC)" in the Voice list. If the PC is off, Jarvis uses another voice.' : 'Run VoiceStudio on this PC, then enter its address (usually http://localhost:3900).';
  };
  const pick = $('#vsPick');
  const fill = async () => {
    if (!pick) return;
    if (!VS.configured()) { pick.hidden = true; return; }
    try {
      const list = (await VS.voices(true)).filter((v) => v.type === 'profile');
      if (!list.length) { pick.hidden = true; return; }
      const cur = VS.get('Voice').trim();
      pick.replaceChildren(...list.map((v) => { const o = document.createElement('option'); o.value = v.voice_id; o.textContent = (v.name || v.voice_id) + (v.language ? ' (' + v.language + ')' : ''); return o; }));
      const other = document.createElement('option'); other.value = ''; other.textContent = 'Default voice (changes every time)'; pick.append(other);
      if (!cur) { VS.set('Voice', list[0].voice_id); voice.value = list[0].voice_id; }
      pick.value = [...pick.options].some((o) => o.value === VS.get('Voice')) ? VS.get('Voice') : '';
      pick.hidden = false;
    } catch (e) { pick.hidden = true; }
  };
  if (pick) pick.addEventListener('change', () => { VS.set('Voice', pick.value); voice.value = pick.value; toast(pick.value ? 'Voice saved: ' + pick.selectedOptions[0].textContent : 'Using the default voice'); });
  const hint = (msg) => {
    const https = location.protocol === 'https:' && /^http:/i.test(url.value.trim()) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url.value.trim());
    if (https) return 'This page is https, so the browser blocks a plain http address that is not localhost. Use localhost, or an https address (for example Tailscale Serve).';
    if (/cannot connect/.test(msg)) return 'Cannot connect. Is VoiceStudio open? If it is, allow this site: set OMNIVOICE_ALLOWED_ORIGINS to include https://glretief-ux.github.io (see README), and allow the browser prompt for local network access.';
    if (/401|key/i.test(msg)) return 'VoiceStudio asked for an API key. Enter the key you set in OMNIVOICE_API_KEY.';
    return 'VoiceStudio answered with an error: ' + msg;
  };
  save.addEventListener('click', async () => {
    let u = url.value.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s/]+/i.test(u)) { toast('Enter the full address, for example http://localhost:3900'); return; }
    VS.set('Url', u); VS.set('Voice', voice.value.trim());
    if (key.value.trim()) VS.set('Key', key.value.trim());
    VS.set('Listen', listen.checked ? '1' : '');
    voiceBox.unlock();
    save.disabled = true; st.textContent = 'Testing…';
    try {
      const blob = await VS.speak('VoiceStudio connected. At your service.');
      voiceBox.reload(); voiceBox.select('__vs'); show(); fill();
      st.textContent = 'Connected. Jarvis now speaks with VoiceStudio.';
      voiceBox.stop();
      const a = new Audio(URL.createObjectURL(blob)); a.play().catch(() => {});
    } catch (e) { voiceBox.reload(); st.textContent = hint(e.message || String(e)); }
    save.disabled = false;
  });
  clr.addEventListener('click', () => {
    ['Url', 'Voice', 'Key', 'Listen'].forEach((k) => VS.set(k, ''));
    try { if (localStorage.getItem('jarvisVoice') === '__vs') localStorage.removeItem('jarvisVoice'); } catch (e) {}
    voiceBox.reload(); show(); fill();
  });
  listen.addEventListener('change', () => { if (VS.configured()) VS.set('Listen', listen.checked ? '1' : ''); });
  show(); fill();
})();

/* ---------- controls ---------- */
$('#btnFit').onclick = () => fit(false);
$('#btnPanel').onclick = () => { panel.classList.toggle('closed'); };
$('#btn3d').onclick = (e) => {
  S.flat = !S.flat;
  e.currentTarget.setAttribute('aria-pressed', String(!S.flat));
  if (S.flat) { cam.yaw = 0; cam.pitch = 0; }
  reheat(0.7); S.dirty = true;
  setTimeout(() => fit(false), 700);
  toast(S.flat ? 'Flat view' : '3D view: drag to rotate, pinch to zoom');
};
$('#btnPath').onclick = (e) => {
  S.pathMode = !S.pathMode;
  e.currentTarget.setAttribute('aria-pressed', String(S.pathMode));
  toast(S.pathMode ? 'Path mode: tap two notes' : 'Path mode off');
};
$('#repel').oninput = (e) => { S.repel = +e.target.value; reheat(0.5); };
$('#linklen').oninput = (e) => { S.linkLen = +e.target.value; reheat(0.5); };
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') { if (e.key === 'Escape') e.target.blur(); return; }
  if (e.key === '/') { e.preventDefault(); panel.classList.remove('closed'); $('#search').focus(); }
  else if (e.key === 'f') fit(false);
  else if (e.key === 'Escape') select(-1);
});
window.addEventListener('resize', () => { resize(); });

/* ---------- pointer: tap, drag node, pan, pinch, wheel ---------- */
const ptrs = new Map();
let g = null;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  S.target = null;
  cam.last = performance.now();
  if (ptrs.size === 1) {
    const hit = pick(e.clientX, e.clientY);
    cam.last = performance.now();
    g = { type: hit >= 0 ? 'node' : (S.flat || e.shiftKey ? 'pan' : 'rotate'), node: hit, sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, yaw: cam.yaw, pitch: cam.pitch, moved: false, shift: e.shiftKey };
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    g = { type: 'pinch', d0: dist(a, b), k0: S.view.k, moved: true,
      wx: ((a.x + b.x) / 2 - S.view.x) / S.view.k, wy: ((a.y + b.y) / 2 - S.view.y) / S.view.k };
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!g) return;
  if (g.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const k = Math.max(0.05, Math.min(6, g.k0 * dist(a, b) / g.d0));
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    S.view.k = k; S.view.x = cx - g.wx * k; S.view.y = cy - g.wy * k;
    S.dirty = true;
    return;
  }
  const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
  if (!g.moved && Math.hypot(dx, dy) > 6) g.moved = true;
  if (!g.moved) return;
  cam.last = performance.now();
  if (g.type === 'pan') {
    S.view.x = g.vx + dx; S.view.y = g.vy + dy; S.dirty = true;
  } else if (g.type === 'rotate') {
    cam.yaw = g.yaw + dx * 0.008;
    cam.pitch = Math.max(-1.45, Math.min(1.45, g.pitch + dy * 0.008));
    S.dirty = true;
  } else if (g.type === 'node') {
    const n = S.nodes[g.node], m = cam.m;
    n.pinned = true;
    // move the node inside the plane facing you, keeping its depth
    const x1 = (e.clientX - S.view.x) / (S.view.k * n.ps), y2 = (e.clientY - S.view.y) / (S.view.k * n.ps), z2 = n.pz;
    const y = y2 * m.cp + z2 * m.sp, z1 = -y2 * m.sp + z2 * m.cp;
    n.x = x1 * m.cy - z1 * m.sy; n.y = y; n.z = x1 * m.sy + z1 * m.cy;
    reheat(0.3);
  }
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (!g) return;
  if (g.type === 'pinch') { if (ptrs.size === 0) g = null; return; }
  if (g.type === 'node') S.nodes[g.node].pinned = false;
  if (!g.moved && e.type === 'pointerup') handleTap(g.type === 'node' ? g.node : -1, g.shift);
  g = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  S.target = null; cam.last = performance.now();
  const k0 = S.view.k, k = Math.max(0.05, Math.min(6, k0 * Math.exp(-e.deltaY * 0.0015)));
  const wx = (e.clientX - S.view.x) / k0, wy = (e.clientY - S.view.y) / k0;
  S.view.k = k; S.view.x = e.clientX - wx * k; S.view.y = e.clientY - wy * k;
  S.dirty = true;
}, { passive: false });
// Safari ignores touch-action for gestures on some versions; stop page-level pinch zoom
document.addEventListener('gesturestart', (e) => e.preventDefault());

/* ---------- boot ---------- */
if (isMobile()) panel.classList.add('closed');
resize();
voiceBox.init();
gg.init();
initChat();
fetch('graph.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(init)
  .catch(() => { $('#stats').textContent = 'Could not load graph.json'; toast('Could not load graph.json'); });
})();
