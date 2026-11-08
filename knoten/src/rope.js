/* =====================================================================
   Seilphysik für „Knoten“
   Jede Kordel ist eine Kette aus Gliedern im Raum (x, y in Rastereinheiten,
   z = Höhe über dem Brett). Kordeln sind dick, elastisch, liegen durch
   Schwerkraft auf dem Brett und können einander nicht durchdringen –
   darum entstehen Umschlingungen und Verdrehungen von selbst.
   Die Enden stecken in Ösen. Ein gegriffenes Ende wird angehoben und
   über alles hinweggeführt; die Kordel schleift hinterher.
   Läuft im Browser und in Node (für die Level-Erzeugung).
   ===================================================================== */
(function (root) {
  "use strict";
  const RAD = 0.075;      // Radius einer Kordel
  const LIFT = 1.0;       // Höhe eines angehobenen Endes
  const N = 22;           // Glieder pro Kordel
  const G = 30;           // Schwerkraft
  const SUB = 6;          // Teilschritte pro Bild
  const DAMP = 0.985;
  const SPEED = 7;        // Höchsttempo eines gezogenen Endes (Einheiten/s)
  const D2 = 2 * RAD;
  const FRICTION = 0.35;  // Haftung zwischen Kordeln
  const PEG_R = 0.12 + RAD, PEG_H = 1.6 * RAD;

  function createWorld(cols, rows, ends) {
    const P = [];
    for (let h = 0; h < cols * rows; h++) P.push({ x: h % cols, y: Math.floor(h / cols) });
    const w = { cols, rows, P, ropes: [], drag: null };
    ends.forEach(([a, b]) => w.ropes.push(makeRope(P[a], P[b], a, b)));
    return w;
  }
  function makeRope(A, B, a, b) {
    const x = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      x[i * 3] = A.x + (B.x - A.x) * t;
      x[i * 3 + 1] = A.y + (B.y - A.y) * t;
      x[i * 3 + 2] = i === 0 || i === N - 1 ? 0 : RAD;
    }
    return { e: [a, b], x, p: x.slice(), tgt: [null, null] };
  }
  const endIdx = (e) => (e ? N - 1 : 0);

  // Ziel eines Endes: Öse (z = 0) oder angehoben über dem Finger
  function endTarget(w, r, e) {
    const R = w.ropes[r];
    if (w.drag && w.drag.r === r && w.drag.e === e) return { x: w.drag.x, y: w.drag.y, z: LIFT };
    const h = w.P[R.e[e]];
    return { x: h.x, y: h.y, z: 0 };
  }
  function restLen(w, R) {
    const a = R.x, i = (N - 1) * 3;
    const L = Math.hypot(a[i] - a[0], a[i + 1] - a[1]);
    return Math.max(0.35, L * 0.92) / (N - 1);
  }

  /* ---------- Nächste Punkte zweier Strecken im Raum ---------- */
  const cs = { s: 0, t: 0 };
  function closest(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) {
    const d1x = bx - ax, d1y = by - ay, d1z = bz - az, d2x = dx - cx, d2y = dy - cy, d2z = dz - cz;
    const rx = ax - cx, ry = ay - cy, rz = az - cz;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    if (a < 1e-12 && e < 1e-12) { s = t = 0; }
    else if (a < 1e-12) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
      const c = d1x * rx + d1y * ry + d1z * rz;
      if (e < 1e-12) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else {
        const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
        s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
        t = (b * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
      }
    }
    cs.s = s; cs.t = t;
  }

  /* ---------- Ein Teilschritt ---------- */
  // Kollisionssuche: Glieder nach linker Kante sortieren und nur Überlappungen prüfen
  let SEG = null, ORD = null, NSEG = 0;
  function collide(w) {
    const n = w.ropes.length * (N - 1);
    if (!SEG || NSEG !== n) { SEG = new Float64Array(n * 6); ORD = Int32Array.from({ length: n }, (_, i) => i); NSEG = n; }
    let id = 0;
    for (const R of w.ropes) {
      const x = R.x;
      for (let i = 0; i < N - 1; i++, id++) {
        const j = i * 3, k = j + 3, o = id * 6;
        SEG[o] = Math.min(x[j], x[k]) - D2; SEG[o + 1] = Math.max(x[j], x[k]) + D2;
        SEG[o + 2] = Math.min(x[j + 1], x[k + 1]) - D2; SEG[o + 3] = Math.max(x[j + 1], x[k + 1]) + D2;
        SEG[o + 4] = Math.min(x[j + 2], x[k + 2]) - D2; SEG[o + 5] = Math.max(x[j + 2], x[k + 2]) + D2;
      }
    }
    for (let i = 1; i < n; i++) {                 // Einfügesortierung – die Reihenfolge ändert sich kaum
      const v = ORD[i], key = SEG[v * 6];
      let j = i - 1;
      while (j >= 0 && SEG[ORD[j] * 6] > key) { ORD[j + 1] = ORD[j]; j--; }
      ORD[j + 1] = v;
    }
    const per = N - 1;
    for (let p = 0; p < n; p++) {
      const A = ORD[p], oa = A * 6, maxx = SEG[oa + 1], ra = (A / per) | 0;
      for (let q = p + 1; q < n; q++) {
        const B = ORD[q], ob = B * 6;
        if (SEG[ob] > maxx) break;
        const rb = (B / per) | 0;
        if (ra === rb) continue;
        if (SEG[oa + 3] < SEG[ob + 2] || SEG[ob + 3] < SEG[oa + 2] || SEG[oa + 5] < SEG[ob + 4] || SEG[ob + 5] < SEG[oa + 4]) continue;
        resolve(w, ra, A - ra * per, rb, B - rb * per);
      }
    }
  }
  function resolve(w, ra, ia, rb, ib) {
    const xa = w.ropes[ra].x, xb = w.ropes[rb].x;
    const a0 = ia * 3, a1 = a0 + 3, b0 = ib * 3, b1 = b0 + 3;
    closest(xa[a0], xa[a0 + 1], xa[a0 + 2], xa[a1], xa[a1 + 1], xa[a1 + 2], xb[b0], xb[b0 + 1], xb[b0 + 2], xb[b1], xb[b1 + 1], xb[b1 + 2]);
    const s = cs.s, t = cs.t;
    const px = xa[a0] + (xa[a1] - xa[a0]) * s, py = xa[a0 + 1] + (xa[a1 + 1] - xa[a0 + 1]) * s, pz = xa[a0 + 2] + (xa[a1 + 2] - xa[a0 + 2]) * s;
    const qx = xb[b0] + (xb[b1] - xb[b0]) * t, qy = xb[b0 + 1] + (xb[b1 + 1] - xb[b0 + 1]) * t, qz = xb[b0 + 2] + (xb[b1 + 2] - xb[b0 + 2]) * t;
    let nx = px - qx, ny = py - qy, nz = pz - qz;
    const d = Math.hypot(nx, ny, nz);
    if (d >= D2) return;
    if (d < 1e-9) { nx = 0; ny = 0; nz = pz >= qz ? 1 : -1; } else { nx /= d; ny /= d; nz /= d; }
    const wa0 = ia === 0 ? 0 : 1, wa1 = ia + 1 === N - 1 ? 0 : 1, wb0 = ib === 0 ? 0 : 1, wb1 = ib + 1 === N - 1 ? 0 : 1;
    const ca0 = (1 - s) * wa0, ca1 = s * wa1, cb0 = (1 - t) * wb0, cb1 = t * wb1;
    const W = ca0 * ca0 + ca1 * ca1 + cb0 * cb0 + cb1 * cb1;
    if (W < 1e-9) return;
    const lam = (D2 - d) / W;
    xa[a0] += nx * lam * ca0; xa[a0 + 1] += ny * lam * ca0; xa[a0 + 2] += nz * lam * ca0;
    xa[a1] += nx * lam * ca1; xa[a1 + 1] += ny * lam * ca1; xa[a1 + 2] += nz * lam * ca1;
    xb[b0] -= nx * lam * cb0; xb[b0 + 1] -= ny * lam * cb0; xb[b0 + 2] -= nz * lam * cb0;
    xb[b1] -= nx * lam * cb1; xb[b1 + 1] -= ny * lam * cb1; xb[b1 + 2] -= nz * lam * cb1;
    // Reibung: Kordeln, die sich berühren, gleiten nur zögernd aneinander vorbei
    const pa = w.ropes[ra].p, pb = w.ropes[rb].p;
    let rx = (xa[a0] - pa[a0]) * (1 - s) + (xa[a1] - pa[a1]) * s - (xb[b0] - pb[b0]) * (1 - t) - (xb[b1] - pb[b1]) * t;
    let ry = (xa[a0 + 1] - pa[a0 + 1]) * (1 - s) + (xa[a1 + 1] - pa[a1 + 1]) * s - (xb[b0 + 1] - pb[b0 + 1]) * (1 - t) - (xb[b1 + 1] - pb[b1 + 1]) * t;
    let rz = (xa[a0 + 2] - pa[a0 + 2]) * (1 - s) + (xa[a1 + 2] - pa[a1 + 2]) * s - (xb[b0 + 2] - pb[b0 + 2]) * (1 - t) - (xb[b1 + 2] - pb[b1 + 2]) * t;
    const rn = rx * nx + ry * ny + rz * nz;
    rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;
    const f = FRICTION / W;
    xa[a0] -= rx * f * ca0; xa[a0 + 1] -= ry * f * ca0; xa[a0 + 2] -= rz * f * ca0;
    xa[a1] -= rx * f * ca1; xa[a1 + 1] -= ry * f * ca1; xa[a1 + 2] -= rz * f * ca1;
    xb[b0] += rx * f * cb0; xb[b0 + 1] += ry * f * cb0; xb[b0 + 2] += rz * f * cb0;
    xb[b1] += rx * f * cb1; xb[b1 + 1] += ry * f * cb1; xb[b1 + 2] += rz * f * cb1;
  }
  // Die Stifte in den Ösen: niedrig liegende Kordeln anderer Farbe müssen um sie herum
  function pegs(w) {
    const R = w.ropes;
    for (let a = 0; a < R.length; a++) for (let e = 0; e < 2; e++) {
      const j = endIdx(e) * 3, xa = R[a].x;
      if (xa[j + 2] > 0.05) continue;                 // angehobenes Ende
      const px = xa[j], py = xa[j + 1];
      for (let b = 0; b < R.length; b++) {
        if (b === a) continue;
        const x = R[b].x;
        for (let i = 1; i < N - 1; i++) {
          const k = i * 3;
          if (x[k + 2] > PEG_H) continue;
          const dx = x[k] - px, dy = x[k + 1] - py, d2 = dx * dx + dy * dy;
          if (d2 >= PEG_R * PEG_R) continue;
          const d = Math.sqrt(d2) || 1e-6, push = (PEG_R - d) / d;
          x[k] += dx * push; x[k + 1] += dy * push;
        }
      }
    }
  }
  function pinEnds(w, h) {
    w.ropes.forEach((R, r) => {
      for (let e = 0; e < 2; e++) {
        const T = endTarget(w, r, e), j = endIdx(e) * 3, x = R.x, m = SPEED * h;
        const dx = T.x - x[j], dy = T.y - x[j + 1], dh = Math.hypot(dx, dy);
        // erst ganz anheben, dann führen – und erst über der Öse wieder absenken
        if (dh > 0.02 && x[j + 2] < LIFT - 0.02) { x[j + 2] = Math.min(LIFT, x[j + 2] + m * 1.5); continue; }
        if (dh > 1e-6) {
          if (dh <= m) { x[j] = T.x; x[j + 1] = T.y; }
          else { x[j] += (dx / dh) * m; x[j + 1] += (dy / dh) * m; }
          continue;
        }
        const dz = T.z - x[j + 2];
        x[j + 2] += Math.abs(dz) <= m * 1.5 ? dz : Math.sign(dz) * m * 1.5;
      }
    });
  }
  function substep(w, h) {
    const g = G * h * h;
    for (const R of w.ropes) {
      const x = R.x, p = R.p;
      for (let i = 1; i < N - 1; i++) {
        const j = i * 3;
        let vx = (x[j] - p[j]) * DAMP, vy = (x[j + 1] - p[j + 1]) * DAMP, vz = (x[j + 2] - p[j + 2]) * DAMP;
        if (x[j + 2] <= RAD * 1.05) { vx *= 0.9; vy *= 0.9; }   // Reibung auf dem Brett
        p[j] = x[j]; p[j + 1] = x[j + 1]; p[j + 2] = x[j + 2];
        x[j] += vx; x[j + 1] += vy; x[j + 2] += vz - g;
      }
      for (const e of [0, 1]) { const j = endIdx(e) * 3; p[j] = x[j]; p[j + 1] = x[j + 1]; p[j + 2] = x[j + 2]; }
    }
    pinEnds(w, h);
    for (let it = 0; it < 2; it++) {
      for (const R of w.ropes) {
        const x = R.x, L0 = restLen(w, R);
        for (let i = 0; i < N - 1; i++) {
          const j = i * 3, k = j + 3;
          const dx = x[k] - x[j], dy = x[k + 1] - x[j + 1], dz = x[k + 2] - x[j + 2], L = Math.hypot(dx, dy, dz) || 1e-9;
          const wi = i === 0 ? 0 : 1, wk = i + 1 === N - 1 ? 0 : 1, ws = wi + wk;
          if (!ws) continue;
          const stiff = L > L0 ? 0.25 : 0.1;
          const c = ((L - L0) / L / ws) * stiff;
          x[j] += dx * c * wi; x[j + 1] += dy * c * wi; x[j + 2] += dz * c * wi;
          x[k] -= dx * c * wk; x[k + 1] -= dy * c * wk; x[k + 2] -= dz * c * wk;
        }
      }
      collide(w);
      pegs(w);
      for (const R of w.ropes) {
        const x = R.x;
        for (let i = 1; i < N - 1; i++) if (x[i * 3 + 2] < RAD) x[i * 3 + 2] = RAD;
      }
    }
  }
  function step(w, dt) {
    const h = Math.min(dt, 1 / 30) / SUB;
    for (let s = 0; s < SUB; s++) substep(w, h);
  }
  function motion(w) {
    let m = 0;
    for (const R of w.ropes) for (let i = 0; i < N * 3; i++) m = Math.max(m, Math.abs(R.x[i] - R.p[i]));
    return m;
  }

  /* ---------- Kreuzungen in der Draufsicht ---------- */
  function crossings(w) {
    const out = [], R = w.ropes;
    for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
      const xa = R[a].x, xb = R[b].x;
      for (let i = 0; i < N - 1; i++) {
        const j = i * 3, k = j + 3;
        const ax = xa[j], ay = xa[j + 1], bx = xa[k], by = xa[k + 1];
        const minx = Math.min(ax, bx), maxx = Math.max(ax, bx), miny = Math.min(ay, by), maxy = Math.max(ay, by);
        for (let m = 0; m < N - 1; m++) {
          const p = m * 3, q = p + 3;
          const cx = xb[p], cy = xb[p + 1], dx = xb[q], dy = xb[q + 1];
          if (Math.max(cx, dx) < minx || Math.min(cx, dx) > maxx || Math.max(cy, dy) < miny || Math.min(cy, dy) > maxy) continue;
          const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
          if ((d1 > 0) === (d2 > 0)) continue;
          const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
          if ((d3 > 0) === (d4 > 0)) continue;
          const s = d1 / (d1 - d2), t = d3 / (d3 - d4);
          const za = xa[j + 2] + (xa[k + 2] - xa[j + 2]) * s, zb = xb[p + 2] + (xb[q + 2] - xb[p + 2]) * t;
          out.push({ a, b, x: ax + (bx - ax) * s, y: ay + (by - ay) * s, top: za >= zb ? a : b, ia: i + s, ib: m + t });
        }
      }
    }
    return out;
  }

  /* ---------- Speichern / Laden ---------- */
  function snapshot(w) { return { ends: w.ropes.map((R) => R.e.slice()), x: w.ropes.map((R) => Array.from(R.x)) }; }
  function restore(w, s) {
    w.ropes.forEach((R, r) => { R.e = s.ends[r].slice(); R.x = Float64Array.from(s.x[r]); R.p = R.x.slice(); });
    w.drag = null;
  }
  // kompakt: 1/200 Rastereinheit
  function pack(w) {
    const ends = w.ropes.map((R) => R.e.join(",")).join(";");
    const nums = [];
    for (const R of w.ropes) for (let i = 0; i < N * 3; i++) nums.push(Math.round(R.x[i] * 200));
    return ends + "|" + nums.map((v) => v.toString(36)).join(",");
  }
  function unpack(w, str) {
    const [e, n] = str.split("|");
    const ends = e.split(";").map((s) => s.split(",").map(Number));
    const nums = n.split(",").map((v) => parseInt(v, 36) / 200);
    w.ropes.forEach((R, r) => { R.e = ends[r]; R.x = Float64Array.from(nums.slice(r * N * 3, (r + 1) * N * 3)); R.p = R.x.slice(); });
    w.drag = null;
  }

  const API = { RAD, LIFT, N, createWorld, step, motion, crossings, snapshot, restore, pack, unpack };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Rope = API;
})(typeof window !== "undefined" ? window : globalThis);
