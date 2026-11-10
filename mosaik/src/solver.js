/* Mosaik – Logik-Löser und Rätselbau.
   Ein Feld ist -1 (offen), 0 (leer) oder 1 (gefüllt).
   Eine Zahl zählt die gefüllten Felder in ihrem 3×3-Block (sie selbst eingeschlossen).
   Der Löser benutzt nur Schlüsse, die ein Mensch auch zieht:
     einzeln – eine Zahl allein erzwingt Felder,
     paar    – zwei sich überlappende Zahlen zusammen erzwingen Felder.
   Was er ohne Raten lösen kann, ist eindeutig lösbar. */
(function (root) {
  "use strict";

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // Für jedes Feld: die Felder seines 3×3-Blocks.
  function blocks(H, W) {
    const out = new Array(H * W);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const b = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < H && cc >= 0 && cc < W) b.push(rr * W + cc);
      }
      out[r * W + c] = b;
    }
    return out;
  }

  function countClues(sol, H, W) {
    const B = blocks(H, W);
    return B.map(b => b.reduce((s, i) => s + sol[i], 0));
  }

  // Zahlen, deren Blöcke sich überlappen (Abstand ≤ 2 in beide Richtungen).
  function partners(H, W, clues) {
    const P = new Array(H * W);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (clues[i] < 0) { P[i] = []; continue; }
      const p = [];
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < H && cc >= 0 && cc < W && clues[rr * W + cc] >= 0) p.push(rr * W + cc);
      }
      P[i] = p;
    }
    return P;
  }

  // Ein Schluss aus einer Zahl. Gibt [[feld, wert], …] oder null.
  function singleStep(B, clues, st, i) {
    const k = clues[i];
    let f = 0, u = 0;
    const b = B[i];
    for (let j = 0; j < b.length; j++) { const v = st[b[j]]; if (v === 1) f++; else if (v < 0) u++; }
    if (!u) return null;
    if (f > k || f + u < k) return { bad: true };
    if (f === k) return b.filter(x => st[x] < 0).map(x => [x, 0]);
    if (f + u === k) return b.filter(x => st[x] < 0).map(x => [x, 1]);
    return null;
  }

  // Ein Schluss aus zwei Zahlen.
  function pairStep(B, clues, st, i, j) {
    const A = B[i], C = B[j];
    let fa = 0, fb = 0;
    const ua = [], ub = [];
    for (const x of A) { if (st[x] === 1) fa++; else if (st[x] < 0) ua.push(x); }
    for (const x of C) { if (st[x] === 1) fb++; else if (st[x] < 0) ub.push(x); }
    if (!ua.length || !ub.length) return null;
    const a = clues[i] - fa, b = clues[j] - fb;
    const inB = new Set(ub);
    const I = [], oA = [];
    for (const x of ua) (inB.has(x) ? I : oA).push(x);
    if (!I.length) return null;
    const inI = new Set(I);
    const oB = ub.filter(x => !inI.has(x));
    if (!oA.length && !oB.length) return null;
    const lo = Math.max(0, a - oA.length, b - oB.length);
    const hi = Math.min(I.length, a, b);
    if (lo > hi) return { bad: true };
    const out = [];
    if (oA.length) {
      if (a - lo <= 0) oA.forEach(x => out.push([x, 0]));
      else if (a - hi >= oA.length) oA.forEach(x => out.push([x, 1]));
    }
    if (oB.length) {
      if (b - lo <= 0) oB.forEach(x => out.push([x, 0]));
      else if (b - hi >= oB.length) oB.forEach(x => out.push([x, 1]));
    }
    if (lo === I.length) I.forEach(x => out.push([x, 1]));
    else if (hi === 0) I.forEach(x => out.push([x, 0]));
    return out.length ? out : null;
  }

  // Volles Lösen. opts.pair erlaubt Paar-Schlüsse.
  function solve(H, W, clues, init, opts) {
    opts = opts || {};
    const N = H * W;
    const B = opts.B || blocks(H, W);
    const st = init ? Int8Array.from(init) : new Int8Array(N).fill(-1);
    const cl = [];
    for (let i = 0; i < N; i++) if (clues[i] >= 0) cl.push(i);
    const P = opts.pair ? partners(H, W, clues) : null;
    // Welche Zahlen ein Feld berühren (Blöcke sind symmetrisch).
    let pairSteps = 0, unknown = 0;
    for (let i = 0; i < N; i++) if (st[i] < 0) unknown++;
    const dirty = new Uint8Array(N);
    let queue = cl.slice();
    cl.forEach(i => dirty[i] = 1);
    const set = (x, v) => {
      if (st[x] >= 0) return;
      st[x] = v; unknown--;
      for (const y of B[x]) if (clues[y] >= 0 && !dirty[y]) { dirty[y] = 1; queue.push(y); }
    };
    for (;;) {
      while (queue.length) {
        const i = queue.pop(); dirty[i] = 0;
        const r = singleStep(B, clues, st, i);
        if (!r) continue;
        if (r.bad) return { ok: false, contradiction: true, st, pairSteps };
        for (const [x, v] of r) set(x, v);
      }
      if (!unknown || !P) break;
      let found = false;
      outer: for (const i of cl) {
        for (const j of P[i]) {
          if (j < i) continue;
          const r = pairStep(B, clues, st, i, j);
          if (!r) continue;
          if (r.bad) return { ok: false, contradiction: true, st, pairSteps };
          pairSteps++;
          for (const [x, v] of r) set(x, v);
          found = true;
          break outer;
        }
      }
      if (!found) break;
    }
    return { ok: unknown === 0, st, pairSteps };
  }

  // Nächster Schritt für einen Tipp. Bevorzugt Einzel-Schlüsse,
  // und unter diesen den, der am nächsten an `near` liegt.
  function hint(H, W, clues, st, near) {
    const N = H * W, B = blocks(H, W);
    const dist = i => {
      if (near == null || near < 0) return 0;
      const r = Math.floor(i / W) - Math.floor(near / W), c = (i % W) - (near % W);
      return r * r + c * c;
    };
    let best = null;
    for (let i = 0; i < N; i++) {
      if (clues[i] < 0) continue;
      const r = singleStep(B, clues, st, i);
      if (!r || r.bad) continue;
      const d = dist(i) - r.length * 0.5;
      if (!best || d < best.d) best = { d, kind: "single", clues: [i], cells: r };
    }
    if (best) return best;
    const P = partners(H, W, clues);
    for (let i = 0; i < N; i++) {
      if (clues[i] < 0) continue;
      for (const j of P[i]) {
        if (j < i) continue;
        const r = pairStep(B, clues, st, i, j);
        if (!r || r.bad) continue;
        const d = dist(i) + dist(j);
        if (!best || d < best.d) best = { d, kind: "pair", clues: [i, j], cells: r };
      }
    }
    return best;
  }

  /* Rätsel aus einem Bild bauen.
     opts: pair (bool, Paarschlüsse erlaubt), remove (Anteil der Zahlen, die höchstens wegfallen),
           maxPairs (höchstens so viele Paarschlüsse), seed */
  function build(sol, H, W, opts) {
    const N = H * W, B = blocks(H, W);
    const clues = countClues(sol, H, W);
    const given = new Int8Array(N).fill(-1);
    const pair = !!opts.pair, cap = opts.maxPairs == null ? Infinity : opts.maxPairs;
    const R = rng(opts.seed || 1);
    const fits = r => r.ok && r.pairSteps <= cap;
    // Notfalls Startsteine vorgeben, bis das Bild mit den erlaubten Schlüssen lösbar ist
    let res = solve(H, W, clues, given, { pair, B }), guard = 0;
    while (!fits(res) && guard++ < N) {
      const open = [];
      for (let i = 0; i < N; i++) if (res.st[i] < 0) open.push(i);
      const filled = open.filter(i => sol[i]);
      const pool = filled.length ? filled : open;
      const pick = pool[Math.floor(R() * pool.length)];
      given[pick] = sol[pick];
      res = solve(H, W, clues, given, { pair, B });
    }
    let order = [];
    for (let i = 0; i < N; i++) order.push(i);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    // Auf Wunsch zuerst die trivialen Zahlen (0 und voller Block) entfernen: weniger Flächen zum stumpfen Ausfüllen
    if (opts.trivialFirst) {
      const triv = i => clues[i] === 0 || clues[i] === B[i].length;
      order = order.filter(triv).concat(order.filter(i => !triv(i)));
    }
    const maxRemove = Math.floor(N * (opts.remove == null ? 1 : opts.remove));
    let removed = 0;
    for (const i of order) {
      if (removed >= maxRemove) break;
      const k = clues[i];
      clues[i] = -1;
      if (fits(solve(H, W, clues, given, { pair, B }))) removed++;
      else clues[i] = k;
    }
    const fin = solve(H, W, clues, given, { pair, B });
    return { clues, given, pairSteps: fin.pairSteps, ok: fin.ok };
  }

  /* Textur: verteilt in einheitlichen Flächen sparsam Glas-Funken (im Leeren) und matte Lücken
     (im Gefüllten), bis höchstens `target` der Felder in einem einheitlichen 3×3-Block liegen.
     Die Farben des Bildes bleiben unberührt; Umrisse und Details werden geschont. */
  function texture(art, target, seed) {
    const H = art.length, W = art[0].length, N = H * W, B = blocks(H, W), R = rng(seed || 1);
    const ch = (r, c) => art[r][c];
    const sol = new Int8Array(N);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const x = ch(r, c); sol[r * W + c] = x !== "." && !(x >= "a" && x <= "z") ? 1 : 0; }
    // geschützt: Felder an Farbgrenzen (Umrisse, Augen, Details)
    const prot = new Uint8Array(N);
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const x = ch(r, c);
      for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W && ch(rr, cc) !== x) prot[r * W + c] = 1; }
    }
    const sum = new Int16Array(N);
    const recount = i => { let s = 0; for (const j of B[i]) s += sol[j]; sum[i] = s; };
    for (let i = 0; i < N; i++) recount(i);
    const uni = i => sum[i] === 0 || sum[i] === B[i].length;
    let nUni = 0; for (let i = 0; i < N; i++) if (uni(i)) nUni++;
    const jitter = new Float32Array(N); for (let i = 0; i < N; i++) jitter[i] = R() * 0.5;
    let guard = 0;
    while (nUni > target * N && guard++ < N) {
      let best = -1, bestScore = -1e9;
      for (let i = 0; i < N; i++) {
        let fix = 0, make = 0;
        for (const j of B[i]) {
          const n = B[j].length, s = sum[j], s2 = s + (sol[i] ? -1 : 1);
          if (s === 0 || s === n) fix++;
          else if (s2 === 0 || s2 === n) make++;
        }
        if (!fix) continue;
        const score = fix - make * 1.2 - (prot[i] ? 2.5 : 0) + jitter[i];
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best < 0) break;
      sol[best] ^= 1;
      for (const j of B[best]) { const was = uni(j); recount(j); const is = uni(j); nUni += (is ? 1 : 0) - (was ? 1 : 0); }
    }
    return { sol, uniform: nUni / N };
  }

  const api = { rng, hashStr, blocks, countClues, solve, hint, build, singleStep, pairStep, texture };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MosaikSolver = api;
})(typeof window !== "undefined" ? window : globalThis);
