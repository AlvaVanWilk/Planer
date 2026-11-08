// Hilfen, um Züge mit der Seilphysik durchzuspielen (für Level-Erzeugung und Tests).
const Rope = require("../src/rope.js");
const DT = 1 / 60;

// Ende e der Kordel r angehoben über die Wegpunkte `via` nach Öse h führen,
// absetzen und ausschwingen lassen.
function move(w, r, e, h, via = [], opts = {}) {
  const R = w.ropes[r], from = w.P[R.e[e]], to = w.P[h];
  const speed = opts.speed || 3;
  w.drag = { r, e, x: from.x, y: from.y };
  for (let i = 0; i < 8; i++) Rope.step(w, DT);           // anheben
  let cur = { x: from.x, y: from.y };
  for (const pt of [...via, to]) {
    const L = Math.hypot(pt.x - cur.x, pt.y - cur.y), n = Math.max(1, Math.ceil(L / (speed * DT)));
    for (let i = 1; i <= n; i++) {
      w.drag.x = cur.x + ((pt.x - cur.x) * i) / n;
      w.drag.y = cur.y + ((pt.y - cur.y) * i) / n;
      Rope.step(w, DT);
    }
    cur = pt;
  }
  for (let i = 0; i < 6; i++) Rope.step(w, DT);
  R.e[e] = h; w.drag = null;
  settle(w, opts.settle || 100);
}
function settle(w, maxSteps) {
  for (let i = 0; i < maxSteps; i++) {
    Rope.step(w, DT);
    if (i > 20 && Rope.motion(w) < 2e-5) break;
  }
}
const crossCount = (w) => Rope.crossings(w).length;
// Wie stark sind die Kordeln umeinander gewickelt?
//   curl: Summe über (Kordellänge in der Draufsicht / Abstand der Enden − 1)
//   wraps: Kordelpaare, die sich mehr als einmal kreuzen
function tangle(w) {
  const N = Rope.N;
  let curl = 0;
  for (const R of w.ropes) {
    const x = R.x;
    let L = 0;
    for (let i = 0; i < N - 1; i++) L += Math.hypot(x[i * 3 + 3] - x[i * 3], x[i * 3 + 4] - x[i * 3 + 1]);
    const d = Math.hypot(x[(N - 1) * 3] - x[0], x[(N - 1) * 3 + 1] - x[1]) || 1;
    curl += Math.max(0, L / d - 1);
  }
  const cnt = new Map();
  for (const c of Rope.crossings(w)) { const k = c.a + "_" + c.b; cnt.set(k, (cnt.get(k) || 0) + 1); }
  let wraps = 0, maxWrap = 0;
  for (const v of cnt.values()) { if (v >= 2) wraps++; maxWrap = Math.max(maxWrap, v); }
  const tangled = new Set(); for (const k of cnt.keys()) k.split("_").forEach((r) => tangled.add(+r));
  return { curl, wraps, maxWrap, cross: crossCount(w), freeRopes: w.ropes.length - tangled.size };
}
module.exports = { Rope, move, settle, crossCount, tangle, DT };
