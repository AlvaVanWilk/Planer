// Level-Erzeugung mit der Seilphysik.
// 1. kreuzungsfreie Lösung legen
// 2. verknoten: Enden angehoben in freie Ösen führen – und wo die Kordel unter einer
//    anderen liegt, das Ende in einem Bogen um deren Öse herum. So entstehen echte
//    Umschlingungen und mehrfache Verwirbelungen.
// 3. Probe: alle Züge mit umgekehrtem Weg rückwärts – nur wenn danach alles frei ist,
//    zählt das Level.
const { Rope, move, settle, crossCount, tangle } = require("./sim.js");

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
  return o(c, d, a) * o(c, d, b) < 0 && o(a, b, c) * o(a, b, d) < 0;
}
function near(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L));
  return Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y) < 0.25;
}
const hit = (A, B, C, D) => segX(A, B, C, D) || near(C, A, B) || near(D, A, B) || near(A, C, D) || near(B, C, D);

function params(L) {
  const [cols, rows] = L <= 8 ? [4, 5] : L <= 24 ? [4, 6] : L <= 40 ? [5, 6] : [5, 7];
  const r = Math.min(L <= 24 ? 7 : 8, 2 + Math.floor((L + 2) / 4));
  const S = Math.min(14, 2 + Math.floor(L * 0.3));
  const loops = Math.min(0.75, 0.35 + L * 0.01);      // Anteil der Bogenzüge
  return { cols, rows, cells: cols * rows, r, S, loops };
}

// Wegpunkte für einen Bogen um die Öse Q (Startwinkel von S aus, `turns` Umläufe)
function arcAround(Q, S, D, turns, dir, cols, rows) {
  const rad = 0.42, pts = [];
  const a0 = Math.atan2(S.y - Q.y, S.x - Q.x), aD = Math.atan2(D.y - Q.y, D.x - Q.x);
  let span = dir * turns * Math.PI * 2;
  // so enden, dass es zur Zielöse hin weitergeht
  let extra = (aD - (a0 + span)) * dir; while (extra < 0) extra += Math.PI * 2;
  span += dir * extra;
  const n = Math.max(6, Math.ceil(Math.abs(span) / 0.45));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (span * i) / n;
    pts.push({ x: Math.max(-0.6, Math.min(cols - 0.4, Q.x + Math.cos(a) * rad)), y: Math.max(-0.6, Math.min(rows - 0.4, Q.y + Math.sin(a) * rad)) });
  }
  return pts;
}

function generate(level, seedBump = 0) {
  const { cols, rows, cells, r, S, loops } = params(level);
  const rng = mulberry32(((level * 2654435761) ^ (0x7f4a7c15 + seedBump * 7919)) >>> 0);
  const ri = (n) => Math.floor(rng() * n);
  const P = range(cells).map((h) => ({ x: h % cols, y: Math.floor(h / cols) }));
  // 1. Lösung
  let sol = null;
  const maxLen = Math.min(3, 1.5 + level * 0.03);
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
  // 2. Verknoten: abwechselnd überdecken und einhaken
  const hist = [];
  const freeHoles = () => { const occ = new Set(); w.ropes.forEach((R) => { occ.add(R.e[0]); occ.add(R.e[1]); }); return range(cells).filter((h) => !occ.has(h)); };
  const endPos = (r, e) => P[w.ropes[r].e[e]];
  // Zug ausführen; kommt das Ende wegen straffer Kordel nicht an, wird er zurückgenommen
  const doMove = (m) => {
    const snap = Rope.snapshot(w);
    if (move(w, m.r, m.e, m.h, m.via)) { hist.push(m); return true; }
    Rope.restore(w, snap); return false;
  };
  const tangledSet = (cr) => { const t = new Set(); cr.forEach((x) => { t.add(x.a); t.add(x.b); }); return t; };
  // Einhaken: A liegt unter B → A's Ende spitz um B's nächste Öse herum zurückführen
  function tryHook(cands) {
    const free = freeHoles();
    for (let t = 0; t < 12 && cands.length; t++) {
      const x = cands[ri(cands.length)], B = x.top, A = x.a === B ? x.b : x.a;
      const ib = x.a === B ? x.ia : x.ib, eB = ib < (Rope.N - 1) / 2 ? 0 : 1, Q = endPos(B, eB);
      const ia = x.a === A ? x.ia : x.ib, eA = ia < (Rope.N - 1) / 2 ? 0 : 1, F = endPos(A, 1 - eA), S0 = endPos(A, eA);
      let best = null, bs = -Infinity;
      for (const h of free) {
        const D = P[h], dQ = dist(D, Q), dF = dist(D, F);
        if (dQ < 0.9 || dQ > 2.6 || dF < 0.99 || dF > 3.4) continue;
        const ang = Math.acos(Math.max(-1, Math.min(1, ((F.x - Q.x) * (D.x - Q.x) + (F.y - Q.y) * (D.y - Q.y)) / (dist(F, Q) * dQ || 1))));
        const sc = -ang + rng() * 0.4;                    // spitzer Haken = besser
        if (ang < 1.9 && sc > bs) { bs = sc; best = h; }
      }
      if (best == null) continue;
      const turns = rng() < 0.3 ? 1.5 : 0.75;
      if (doMove({ r: A, e: eA, h: best, from: w.ropes[A].e[eA], via: arcAround(Q, S0, P[best], turns, rng() < 0.5 ? 1 : -1, cols, rows), kind: "hook" })) return true;
    }
    return false;
  }
  // Überdecken: ein Ende gerade quer über möglichst viele andere Kordeln (nur `only`, falls angegeben)
  function cover(only) {
    const free = freeHoles(), tg = tangledSet(Rope.crossings(w));
    let best = null, bs = -Infinity;
    for (let c = 0; c < 60; c++) {
      const rp = only != null ? only : ri(r), e = ri(2), R = w.ropes[rp], from = P[R.e[e]], other = P[R.e[1 - e]], h = free[ri(free.length)], to = P[h];
      if (dist(to, other) < 0.99 || dist(to, other) > 3) continue;
      let sc = rng() + (tg.has(rp) ? 0 : 3);                    // freie Kordeln zuerst ins Spiel bringen
      w.ropes.forEach((Q, q) => { if (q !== rp && segX(other, to, P[Q.e[0]], P[Q.e[1]])) sc += tg.has(q) ? 2 : 3.5; });
      if (sc > bs) { bs = sc; best = { r: rp, e, h, from: R.e[e], via: [], kind: "cover" }; }
    }
    if (best) doMove(best);
    return !!best;
  }
  for (let k = 0; k < S; k++) {
    const unders = Rope.crossings(w).filter((x) => x.top >= 0);
    if (unders.length && (k % 3 !== 0 || rng() < 0.3) && tryHook(unders)) continue;
    cover();
  }
  // Nachknoten: Kordeln, die noch frei liegen, quer durch den Knoten legen und einhaken
  for (let extra = 0; extra < r * 2 && hist.length < S + 4; extra++) {
    const freeR = range(r).filter((q) => !tangledSet(Rope.crossings(w)).has(q));
    if (!freeR.length) break;
    const rp = freeR[ri(freeR.length)];
    cover(rp);
    const under = Rope.crossings(w).filter((x) => x.top === rp);
    if (under.length) tryHook(under);
  }
  const start = Rope.snapshot(w), packed = Rope.pack(w), tg = tangle(w);
  // 3. Probe: rückwärts auf dem umgekehrten Weg – einmal ruhig, einmal hastig (das Ende hinkt
  //    dem Finger hinterher und kürzt Bögen ab). Nur wenn beides aufgeht, zählt das Level.
  let solvedBack = true;
  for (const speed of [2.5, 9]) {
    Rope.restore(w, start);
    let ok = true;
    for (let i = hist.length - 1; i >= 0 && ok; i--) { const m = hist[i]; ok = move(w, m.r, m.e, m.from, m.via.slice().reverse(), { speed }); }
    if (!ok) { solvedBack = false; break; }
    settle(w, 150);
    if (crossCount(w) !== 0) { solvedBack = false; break; }
  }
  return { level, cols, rows, r, moves: hist.length, loops: hist.filter((m) => m.kind === "hook").length, ...tg, solvedBack, packed, start, hist, sol };
}
module.exports = { generate, params };
