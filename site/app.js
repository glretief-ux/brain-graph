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
    ...n, i, x: (Math.random() - 0.5) * 400, y: (Math.random() - 0.5) * 400, vx: 0, vy: 0,
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
      let dx = q.x - p.x, dy = q.y - p.y, d2 = dx * dx + dy * dy;
      if (d2 > 160000) continue;
      if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
      const f = (rep * a) / d2;
      p.vx -= dx * f; p.vy -= dy * f;
      q.vx += dx * f; q.vy += dy * f;
    }
  }
  for (const l of S.links) {
    const p = S.nodes[l.a], q = S.nodes[l.b];
    if (S.hidden.has(p.type) || S.hidden.has(q.type)) continue;
    const dx = q.x - p.x, dy = q.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const f = ((d - S.linkLen) / d) * 0.25 * a / Math.min(p.degree, q.degree, 8);
    p.vx += dx * f; p.vy += dy * f;
    q.vx -= dx * f; q.vy -= dy * f;
  }
  for (const n of V) {
    n.vx -= n.x * 0.012 * a;
    n.vy -= n.y * 0.012 * a;
    n.vx *= 0.6; n.vy *= 0.6;
    if (n.pinned) { n.vx = n.vy = 0; continue; }
    n.x += Math.max(-30, Math.min(30, n.vx));
    n.y += Math.max(-30, Math.min(30, n.vy));
  }
  S.alpha *= 0.992;
}
function reheat(v) { S.alpha = Math.max(S.alpha, v); }

/* ---------- drawing ---------- */
function labelCount(k) {
  const f = k < 0.6 ? 0.05 : k < 1 ? 0.14 : k < 1.5 ? 0.32 : k < 2.2 ? 0.65 : 1;
  return Math.ceil(S.vis.length * f);
}
function draw() {
  const { x, y, k } = S.view;
  ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
  ctx.clearRect(0, 0, S.W, S.H);
  ctx.translate(x, y);
  ctx.scale(k, k);

  const focus = S.sel >= 0;
  // edges
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = focus ? 'rgba(130,170,160,0.05)' : 'rgba(130,170,160,0.16)';
  ctx.beginPath();
  for (const l of S.links) {
    if (hiddenNode(l.a) || hiddenNode(l.b)) continue;
    const p = S.nodes[l.a], q = S.nodes[l.b];
    ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  if (focus) {
    ctx.lineWidth = 1.4 / k;
    ctx.strokeStyle = 'rgba(180,230,210,0.55)';
    ctx.beginPath();
    for (const j of S.adj[S.sel]) {
      if (hiddenNode(j)) continue;
      const p = S.nodes[S.sel], q = S.nodes[j];
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }
  if (S.path) {
    ctx.lineWidth = 3 / k;
    ctx.strokeStyle = '#facc15';
    ctx.beginPath();
    for (let i = 0; i < S.path.length - 1; i++) {
      const p = S.nodes[S.path[i]], q = S.nodes[S.path[i + 1]];
      ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }

  // nodes
  for (const n of S.vis) {
    const lit = !focus || n.i === S.sel || S.nb.has(n.i) || S.pathSet.has(n.i);
    ctx.globalAlpha = lit ? 1 : 0.18;
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, 6.2832);
    ctx.fill();
    if (n.i === S.sel || S.pathSet.has(n.i)) {
      ctx.lineWidth = 2 / k;
      ctx.strokeStyle = S.pathSet.has(n.i) ? '#facc15' : '#fff';
      ctx.stroke();
    } else if (S.cited.has(n.i)) {
      ctx.lineWidth = 2.5 / k;
      ctx.strokeStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + 4 / k, 0, 6.2832);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // labels
  const count = labelCount(k);
  ctx.font = `${12 / k}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3 / k;
  ctx.strokeStyle = 'rgba(7,9,13,0.9)';
  for (const n of S.vis) {
    const special = n.i === S.sel || S.pathSet.has(n.i) || S.cited.has(n.i) || (focus && S.nb.has(n.i));
    if (!special && (focus || n.rank >= count)) continue;
    ctx.fillStyle = special ? '#fff' : 'rgba(230,233,239,0.85)';
    const ty = n.y + n.r + 2 / k;
    ctx.strokeText(n.title, n.x, ty);
    ctx.fillText(n.title, n.x, ty);
  }
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
  animate();
  if (S.dirty) { draw(); S.dirty = false; }
  requestAnimationFrame(frame);
}

/* ---------- view helpers ---------- */
function fit(instant) {
  if (!S.vis.length) return;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const n of S.vis) {
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
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
  const n = S.nodes[i], u = usable();
  const k = Math.max(S.view.k, 0.9);
  S.target = { k, x: (u.x0 + u.x1) / 2 - n.x * k, y: (u.y0 + u.y1) / 2 - n.y * k };
}
function pick(sx, sy) {
  const wx = (sx - S.view.x) / S.view.k, wy = (sy - S.view.y) / S.view.k;
  let best = -1, bd = 1e9;
  for (const n of S.vis) {
    const d = Math.hypot(n.x - wx, n.y - wy);
    if (d < n.r + 12 / S.view.k && d < bd) { bd = d; best = n.i; }
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

function say(text) {
  if (!$('#speak').checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/\[\[|\]\]/g, ''));
  u.onstart = () => orb.set('speaking');
  u.onend = u.onerror = () => orb.set('idle');
  speechSynthesis.speak(u);
}

async function ask(question) {
  if (chat.busy || !question) return;
  const box = $('#answer');
  if (!CHAT_URL) {                                              // free search mode
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
    const r = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, notes: retrieve(question), history: chat.history })
    });
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
  if (!CHAT_URL) {
    input.placeholder = 'Search your notes… (free mode)';
  }
  fetch('notes.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { NOTES = d; }).catch(() => {});
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    input.value = '';
    input.blur();
    ask(q);
  });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    mic.style.display = 'none';
    orb.el.addEventListener('click', () => { panel.classList.remove('closed'); input.focus(); toast('Voice input is not supported in this browser. Type instead.'); });
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
    if (convo.supported()) { convo.toggle(); return; }
    $('#speak').checked = true; startListening();
  });
}

/* ---------- hands-free conversation (needs the Worker for speech-to-text) ---------- */
const convo = (() => {
  let on = false, stream = null, ctx = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const supported = () => !!(CHAT_URL && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);

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
    let floor = 0.01, n = 0, spoke = false, lastVoice = 0;
    while (on) {
      await sleep(60);
      const now = performance.now(), lv = level();
      if (now - t0 < 500) { floor = Math.max(floor, lv); continue; }    // measure room noise first
      if (lv > floor * 2.5 + 0.015) { spoke = true; lastVoice = now; }
      if (spoke && now - lastVoice > 1300) break;                         // paused: done
      if (!spoke && now - t0 > 12000) break;                              // nobody spoke
      if (now - t0 > 30000) break;
    }
    rec.stop(); await stopped; src.disconnect();
    return spoke && on ? new Blob(chunks, { type: rec.mimeType || 'audio/mp4' }) : null;
  }

  async function transcribe(blob) {
    const r = await fetch(CHAT_URL, { method: 'POST', headers: { 'Content-Type': (blob.type || 'audio/mp4').split(';')[0] }, body: blob });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Speech service error ' + r.status);
    return d.text || '';
  }

  async function loop() {
    while (on) {
      orb.set('listening');
      let clip;
      try { clip = await record(); } catch (e) { toast('Recording failed: ' + e.message); break; }
      if (!on) break;
      if (!clip) { toast('Jarvis stopped listening. Tap the orb to talk again.'); break; }
      orb.set('thinking');
      let text = '';
      try { text = await transcribe(clip); } catch (e) { toast(e.message); break; }
      if (!text.trim()) continue;
      $('#askInput').value = '';
      await ask(text.trim());
      await sleep(400);                                                     // let the answer start speaking
      while (on && 'speechSynthesis' in window && (speechSynthesis.speaking || speechSynthesis.pending)) await sleep(200);
      await sleep(300);
    }
    stop();
  }

  async function start() {
    if (on) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) { toast('Microphone blocked: allow it in Safari (Website Settings, Microphone)'); return false; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    try { await ctx.resume(); } catch (e) {}
    on = true; $('#speak').checked = true;
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
    orb.el.classList.remove('live');
    orb.set('idle');
  }
  return { supported, toggle: () => (on ? stop() : start()), isOn: () => on };
})();

/* ---------- controls ---------- */
$('#btnFit').onclick = () => fit(false);
$('#btnPanel').onclick = () => { panel.classList.toggle('closed'); };
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
  if (ptrs.size === 1) {
    const hit = pick(e.clientX, e.clientY);
    g = { type: hit >= 0 ? 'node' : 'pan', node: hit, sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y, moved: false, shift: e.shiftKey };
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
  if (g.type === 'pan') {
    S.view.x = g.vx + dx; S.view.y = g.vy + dy; S.dirty = true;
  } else if (g.type === 'node') {
    const n = S.nodes[g.node];
    n.pinned = true;
    n.x = (e.clientX - S.view.x) / S.view.k;
    n.y = (e.clientY - S.view.y) / S.view.k;
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
  S.target = null;
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
initChat();
fetch('graph.json', { cache: 'no-cache' })
  .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(init)
  .catch(() => { $('#stats').textContent = 'Could not load graph.json'; toast('Could not load graph.json'); });
})();
