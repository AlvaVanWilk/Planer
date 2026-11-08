// Hilfen, um Züge mit der Seilphysik durchzuspielen (für Level-Erzeugung und Tests).
const Rope = require("../src/rope.js");
const DT = 1 / 60;

// Ende e der Kordel r angehoben nach Öse h führen, absetzen und ausschwingen lassen.
function move(w, r, e, h, opts = {}) {
  const R = w.ropes[r], from = w.P[R.e[e]], to = w.P[h];
  const speed = opts.speed || 3.5;
  w.drag = { r, e, x: from.x, y: from.y };
  for (let i = 0; i < 8; i++) Rope.step(w, DT);           // anheben
  const L = Math.hypot(to.x - from.x, to.y - from.y), n = Math.max(1, Math.ceil(L / (speed * DT)));
  for (let i = 1; i <= n; i++) {
    w.drag.x = from.x + ((to.x - from.x) * i) / n;
    w.drag.y = from.y + ((to.y - from.y) * i) / n;
    Rope.step(w, DT);
  }
  for (let i = 0; i < 6; i++) Rope.step(w, DT);
  R.e[e] = h; w.drag = null;
  settle(w, opts.settle || 90);
}
function settle(w, maxSteps) {
  for (let i = 0; i < maxSteps; i++) {
    Rope.step(w, DT);
    if (i > 20 && Rope.motion(w) < 2e-5) break;
  }
}
// Kreuzungen als Rope-Paare zählen (jede einzelne Überkreuzung zählt)
const crossCount = (w) => Rope.crossings(w).length;
module.exports = { Rope, move, settle, crossCount, DT };
