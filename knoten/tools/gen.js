// Level-Erzeugung mit der Seilphysik:
// kreuzungsfreie Lösung legen, dann mit echten Zügen (Ende angehoben in eine freie Öse)
// verknoten. Zur Probe werden die Züge rückwärts gespielt – das Level zählt nur,
// wenn danach wirklich alles frei ist.
const { Rope, move, settle, crossCount } = require("./sim.js");

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const range = (n) => Array.from({ length: n }, (_, i) => i);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segX(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
function near(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L));
  return Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y) < 0.2;
}
const hit = (A, B, C, D) => segX(A, B, C, D) || near(C, A, B) || near(D, A, B) || near(A, C, D) || near(B, C, D);

function params(L) {
  const [cols, rows] = L <= 6 ? [4, 5] : L <= 18 ? [4, 6] : L <= 36 ? [5, 6] : [5, 7];
  const cells = cols * rows, emptyMin = Math.max(4, Math.ceil(cells * 0.25));
  const r = Math.min(Math.floor((cells - emptyMin) / 2), 2 + Math.floor((L + 1) / 3));
  const S = Math.min(18, 2 + Math.floor(L * 0.45));
  return { cols, rows, cells, r, S };
}
// Paare, die sich mehr als einmal kreuzen = verdreht
function twistInfo(w) {
  const cnt = new Map();
  for (const c of Rope.crossings(w)) { const k = c.a + "_" + c.b; cnt.set(k, (cnt.get(k) || 0) + 1); }
  let twisted = 0, maxTw = 0;
  for (const v of cnt.values()) { if (v >= 2) twisted++; maxTw = Math.max(maxTw, v); }
  return { twisted, maxTw };
}

function generate(level, seedBump = 0) {
  const { cols, rows, cells, r, S } = params(level);
  const rng = mulberry32(((level * 2654435761) ^ (0x9e3779b9 + seedBump * 7919)) >>> 0);
  const ri = (n) => Math.floor(rng() * n);
  const P = range(cells).map((h) => ({ x: h % cols, y: Math.floor(h / cols) }));
  // 1. Lösung: kurze, kreuzungsfreie Kordeln mit etwas Abstand
  let sol = null;
  const maxLen = Math.min(3.2, 1.6 + level * 0.03);
  for (let att = 0; att < 400 && !sol; att++) {
    const ends = [], occ = new Set();
    for (let t = 0; t < 4000 && ends.length < r; t++) {
      const a = ri(cells), b = ri(cells);
      if (a === b || occ.has(a) || occ.has(b)) continue;
      const d = dist(P[a], P[b]); if (d < 0.99 || d > maxLen) continue;
      if (ends.some(([c, e]) => hit(P[a], P[b], P[c], P[e]))) continue;
      ends.push([a, b]); occ.add(a); occ.add(b);
    }
    if (ends.length === r) sol = ends;
  }
  if (!sol) return null;
  const w = Rope.createWorld(cols, rows, sol);
  settle(w, 30);
  // 2. Verknoten
  const hist = [];
  let last = -1;
  for (let k = 0; k < S; k++) {
    const occ = new Set(); w.ropes.forEach((R) => { occ.add(R.e[0]); occ.add(R.e[1]); });
    const free = range(cells).filter((h) => !occ.has(h));
    let best = null, bs = -Infinity;
    for (let c = 0; c < 40; c++) {
      const rp = ri(r), e = ri(2);
      if (rp === last) continue;
      const R = w.ropes[rp], from = P[R.e[e]], other = P[R.e[1 - e]], h = free[ri(free.length)], to = P[h];
      if (dist(to, other) < 0.99 || dist(to, other) > 3.6) continue;
      // Weg und neue Lage sollen über möglichst viele andere Kordeln führen
      let sc = 0;
      const cr = Rope.crossings(w);
      w.ropes.forEach((Q, q) => {
        if (q === rp) return;
        const A = P[Q.e[0]], B = P[Q.e[1]];
        const already = cr.some((c) => (c.a === rp && c.b === q) || (c.a === q && c.b === rp));
        if (segX(from, to, A, B)) sc += already ? 3 : 1.5;   // nochmal um dieselbe Kordel = Verdrehung
        if (segX(other, to, A, B)) sc += 1;
      });
      sc += rng() * 1.2;
      if (sc > bs) { bs = sc; best = { r: rp, e, h, from: R.e[e] }; }
    }
    if (!best) continue;
    move(w, best.r, best.e, best.h);
    hist.push(best); last = best.r;
  }
  const start = Rope.snapshot(w), packed = Rope.pack(w);
  const cross = crossCount(w), tw = twistInfo(w);
  // 3. Probe: rückwärts spielen muss alles lösen
  for (let i = hist.length - 1; i >= 0; i--) move(w, hist[i].r, hist[i].e, hist[i].from);
  settle(w, 120);
  const solvedBack = crossCount(w) === 0;
  return { level, cols, rows, r, moves: hist.length, cross, twisted: tw.twisted, maxTw: tw.maxTw, solvedBack, packed, start, hist, sol };
}
module.exports = { generate, params };
