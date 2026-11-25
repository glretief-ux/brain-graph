/* J.A.R.V.I.S. arc reactor, drawn in 3D with three.js (vendor/three.min.js).
   Sits in the free centre of jarvis.html. The #orb button is laid over its core, so tapping the core = tap to talk.
   The reactor reads the orb state (idle / listening / thinking / speaking) and speeds up or changes colour.
   Drag the rings to tilt it; it springs back. Falls back to the flat 2D reactor if WebGL is missing. */
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const T = window.THREE;
  const root = document.documentElement;
  let canvas = $('#reactor');
  if (!canvas) { canvas = document.createElement('canvas'); canvas.id = 'reactor'; document.body.insertBefore(canvas, $('#colL')); }

  let renderer;
  try {
    if (!T) throw new Error('three.js missing');
    renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { window.JV_FALLBACK = true; document.body.classList.add('no3d'); canvas.remove(); return; }
  renderer.setClearColor(0x000000, 0);

  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(34, 1, 0.1, 50);
  cam.position.set(0, 0, 4.4);
  const reactor = new T.Group();
  scene.add(reactor);

  const CYAN = new T.Color(0x5cf2ff), BLUE = new T.Color(0x78beff), AMBER = new T.Color(0xffc446);
  const tint = new T.Color(0x5cf2ff), tintTarget = new T.Color(0x5cf2ff);
  const tinted = [];                                     // materials that follow the state colour
  const mat = (opacity, color = 0x5cf2ff, follow = true) => {
    const m = new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, blending: T.AdditiveBlending, depthWrite: false });
    if (follow) tinted.push(m);
    return m;
  };
  const spinners = [];                                   // [object, speed rad/s]
  const layer = (z) => { const g = new T.Group(); g.position.z = z; reactor.add(g); return g; };

  /* thin full circle */
  function circle(g, r, w, opacity, seg = 128) {
    const m = new T.Mesh(new T.RingGeometry(r - w / 2, r + w / 2, seg), mat(opacity)); g.add(m); return m;
  }
  /* thick arc band split into pieces; returns a group so the whole band can spin */
  function band(z, r, w, pieces, gapFrac, opacity, speed, seed = 1) {
    const g = layer(z), step = (Math.PI * 2) / pieces;
    for (let i = 0; i < pieces; i++) {
      const len = step * (1 - gapFrac) * (0.55 + 0.45 * (((i * 7 + seed * 3) % 5) / 4));
      g.add(new T.Mesh(new T.RingGeometry(r - w / 2, r + w / 2, 24, 1, i * step, len), mat(opacity * (0.7 + 0.3 * ((i + seed) % 3) / 2))));
    }
    spinners.push([g, speed]); return g;
  }

  /* ---- core: fresnel sphere + glow sprite ---- */
  const coreMat = new T.ShaderMaterial({
    uniforms: { uInner: { value: new T.Color(0x5fb6ff) }, uOuter: { value: new T.Color(0xc4fbff) }, uPulse: { value: 1 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uInner; uniform vec3 uOuter; uniform float uPulse; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)),2.2); vec3 c = mix(uInner,uOuter,f); gl_FragColor = vec4(c*(1.0+f*1.2)*uPulse,1.0); }'
  });
  const core = new T.Mesh(new T.SphereGeometry(0.3, 48, 32), coreMat);
  const coreG = layer(0.02); coreG.add(core);
  // dark pupil + bright ring around it, like the lens in the reference
  coreG.add(new T.Mesh(new T.RingGeometry(0.31, 0.345, 96), mat(0.95, 0xbff8ff, false)));
  coreG.add(new T.Mesh(new T.RingGeometry(0.40, 0.43, 96), mat(0.55)));
  function glowTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(160,240,255,.95)'); g.addColorStop(0.25, 'rgba(60,180,255,.45)'); g.addColorStop(1, 'rgba(0,120,200,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c);
  }
  const glow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
  glow.scale.set(1.7, 1.7, 1); glow.position.z = -0.02; reactor.add(glow);

  /* ---- rings, front to back (z gives real depth when it tilts) ---- */
  const L1 = layer(0.10); circle(L1, 0.52, 0.018, 0.75); circle(L1, 0.56, 0.006, 0.5);
  band(0.08, 0.64, 0.085, 5, 0.28, 0.55, 0.45, 1);                  // chunky inner segments
  const L2 = layer(0.04); circle(L2, 0.74, 0.012, 0.6);
  band(0.00, 0.80, 0.034, 8, 0.35, 0.8, -0.32, 2);
  band(-0.04, 0.90, 0.11, 6, 0.40, 0.42, 0.18, 3);                  // wide dim plates
  const L3 = layer(-0.06); circle(L3, 0.98, 0.010, 0.55); circle(L3, 1.04, 0.004, 0.35);
  band(-0.10, 1.01, 0.028, 4, 0.55, 0.9, -0.12, 4);

  // tick ring (minor ticks as lines, major ticks as little plates)
  const tickG = layer(-0.08);
  {
    const pos = [], N = 180, r0 = 1.12, r1 = 1.16;
    for (let i = 0; i < N; i++) { if (i % 15 === 0) continue; const a = (i / N) * Math.PI * 2, r2 = i % 5 === 0 ? 1.18 : r1; pos.push(Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r2, Math.sin(a) * r2, 0); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    const lm = new T.LineBasicMaterial({ color: 0x5cf2ff, transparent: true, opacity: 0.7, blending: T.AdditiveBlending, depthWrite: false }); tinted.push(lm);
    tickG.add(new T.LineSegments(geo, lm));
    for (let i = 0; i < 12; i++) tickG.add(new T.Mesh(new T.RingGeometry(1.10, 1.22, 2, 1, (i / 12) * Math.PI * 2 - 0.007, 0.014), mat(0.95)));
  }
  spinners.push([tickG, 0.05]);

  // dashed outer ring
  {
    const pts = []; for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * 1.28, Math.sin(a) * 1.28, -0.12)); }
    const geo = new T.BufferGeometry().setFromPoints(pts);
    const dm = new T.LineDashedMaterial({ color: 0x5cf2ff, transparent: true, opacity: 0.5, dashSize: 0.012, gapSize: 0.05, blending: T.AdditiveBlending, depthWrite: false }); tinted.push(dm);
    const line = new T.Line(geo, dm); line.computeLineDistances(); const g = layer(0); g.add(line); spinners.push([g, -0.03]);
  }

  // red alert arc (never tinted)
  const redG = layer(0.12);
  redG.add(new T.Mesh(new T.RingGeometry(0.855, 0.875, 48, 1, 1.9, 0.62), mat(0.9, 0xff4d4d, false)));
  spinners.push([redG, 0.08]);

  // spokes
  {
    const pos = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; pos.push(Math.cos(a) * 0.58, Math.sin(a) * 0.58, 0, Math.cos(a) * 0.74, Math.sin(a) * 0.74, 0); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    const lm = new T.LineBasicMaterial({ color: 0x5cf2ff, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false }); tinted.push(lm);
    const g = layer(0.02); g.add(new T.LineSegments(geo, lm)); spinners.push([g, -0.1]);
  }

  // drifting light points around the ring (volume + parallax)
  const pts = (() => {
    const N = 220, pos = new Float32Array(N * 3), seed = [];
    for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 1.1; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.9; seed.push([a, r, 0.03 + Math.random() * 0.1]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.PointsMaterial({ color: 0x9ff8ff, size: 0.022, transparent: true, opacity: 0.8, blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true }); tinted.push(m);
    const p = new T.Points(geo, m); reactor.add(p); return { p, seed, pos, N };
  })();

  /* ---- layout: square canvas centred in the free area, orb button laid over the core ---- */
  let S = 0;
  function layout() {
    const a = window.JV_AREA ? window.JV_AREA() : { x0: 0, x1: innerWidth, y0: 52, y1: innerHeight };
    const side = Math.max(120, Math.min(a.x1 - a.x0, a.y1 - (a.y0 + 8)) * 0.94);
    const cx = (a.x0 + a.x1) / 2, cy = (a.y0 + 8 + a.y1) / 2;
    S = side;
    canvas.style.width = side + 'px'; canvas.style.height = side + 'px'; canvas.style.left = (cx - side / 2) + 'px'; canvas.style.top = (cy - side / 2) + 'px';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.setSize(side, side, false);
    root.style.setProperty('--rx', cx + 'px'); root.style.setProperty('--ry', cy + 'px'); root.style.setProperty('--rr', (side * 0.5) + 'px');
    root.style.setProperty('--ow', Math.round(side * 0.26) + 'px');
  }
  layout(); window.addEventListener('resize', layout); setInterval(layout, 1500);    // columns can appear/disappear

  /* ---- drag to tilt, springs back ---- */
  let dragging = false, lx = 0, ly = 0, tiltX = 0, tiltY = 0, vx = 0, vy = 0;
  let down = null;                                          // a tap (not a drag) anywhere on the reactor = talk to Jarvis
  canvas.addEventListener('pointerdown', (e) => { dragging = true; down = { x: e.clientX, y: e.clientY, t: Date.now() }; lx = e.clientX; ly = e.clientY; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', (e) => {
    const r = canvas.getBoundingClientRect(), o = document.querySelector('#orb');
    if (o && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 12 && Date.now() - down.t < 700 && Math.hypot(e.clientX - r.x - r.width / 2, e.clientY - r.y - r.height / 2) < r.width * 0.46) o.click();
    down = null;
  });
  canvas.addEventListener('pointermove', (e) => { if (!dragging) return; vy += (e.clientX - lx) * 0.004; vx += (e.clientY - ly) * 0.004; lx = e.clientX; ly = e.clientY; });
  const up = () => { dragging = false; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

  /* ---- animate ---- */
  const clock = new T.Clock();
  const orbEl = $('#orb');
  const speedFor = { idle: 1, listening: 1.8, thinking: 3.4, speaking: 1.5 };
  let boost = 1, pulse = 1;
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime * (reduce ? 0.2 : 1);
    const state = (orbEl && orbEl.dataset.state) || 'idle';
    boost += ((speedFor[state] || 1) - boost) * Math.min(1, dt * 3);
    tintTarget.copy(state === 'thinking' ? AMBER : state === 'listening' ? BLUE : CYAN);
    tint.lerp(tintTarget, Math.min(1, dt * 4));
    for (const m of tinted) m.color.copy(tint);
    const target = state === 'speaking' ? 1.05 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1)) : state === 'listening' ? 1.1 + 0.12 * Math.sin(t * 3) : state === 'thinking' ? 1.15 : 1 + 0.06 * Math.sin(t * 1.4);
    pulse += (target - pulse) * Math.min(1, dt * 8);
    coreMat.uniforms.uPulse.value = pulse; core.scale.setScalar(0.96 + 0.1 * (pulse - 1) * 3);
    glow.material.opacity = 0.55 + 0.35 * pulse; glow.scale.setScalar(1.5 + 0.35 * pulse);
    for (const [o, sp] of spinners) o.rotation.z += sp * boost * dt;
    // drifting points
    const arr = pts.pos;
    for (let i = 0; i < pts.N; i++) { const s = pts.seed[i]; s[0] += s[2] * dt * boost * 0.5; arr[i * 3] = Math.cos(s[0]) * s[1]; arr[i * 3 + 1] = Math.sin(s[0]) * s[1]; }
    pts.p.geometry.attributes.position.needsUpdate = true;
    // tilt: gentle sway + drag with spring
    tiltY += vy; tiltX += vx; vx *= 0.82; vy *= 0.82;
    if (!dragging) { tiltX *= 0.94; tiltY *= 0.94; }
    tiltX = Math.max(-0.9, Math.min(0.9, tiltX)); tiltY = Math.max(-0.9, Math.min(0.9, tiltY));
    reactor.rotation.x = tiltX + Math.sin(t * 0.23) * 0.10;
    reactor.rotation.y = tiltY + Math.sin(t * 0.31) * 0.16;
    renderer.render(scene, cam);
  }
  frame();
})();
