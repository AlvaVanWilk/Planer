/* Mosaik – Spiel. */
(function () {
  "use strict";
  const SV = window.MosaikSolver, AU = window.MosaikAudio, WORLDS = window.MOSAIK_WORLDS, PUZ = window.MOSAIK_PUZZLES;
  const $ = s => document.querySelector(s);
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const ease = t => 1 - Math.pow(1 - t, 3);
  const easeBack = t => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb = a => "rgb(" + Math.round(a[0]) + "," + Math.round(a[1]) + "," + Math.round(a[2]) + ")";
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = a => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
  const now = () => performance.now();
  const REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const INK = "#ece2cf";
  const fmtTime = s => { s = Math.round(s); const m = Math.floor(s / 60); return m + ":" + String(s % 60).padStart(2, "0"); };

  /* ---------- Bilder vorbereiten ---------- */
  const PICS = [];
  WORLDS.forEach((w, wi) => {
    w.idx = wi; w.list = [];
    w.pics.forEach((p, pi) => {
      const H = p.art.length, W = p.art[0].length, N = H * W;
      const sol = new Int8Array(N), col = new Array(N), rgbs = new Array(N);
      const b0 = hex(p.bg[0]), b1 = hex(p.bg[1]);
      let nFill = 0; const acc = [0, 0, 0];
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
        const ch = p.art[r][c], i = r * W + c;
        const fill = ch !== "." && !(ch >= "a" && ch <= "z");
        const a = ch === "." ? mix(b0, b1, H > 1 ? r / (H - 1) : 0) : hex(p.pal[ch]);
        sol[i] = fill ? 1 : 0; rgbs[i] = a; col[i] = rgb(a);
        if (fill) { nFill++; acc[0] += a[0]; acc[1] += a[1]; acc[2] += a[2]; }
      }
      const vr = new Uint8Array(N);
      for (let i = 0; i < N; i++) vr[i] = ((Math.imul(i + 7, 2654435761) >>> 0) ^ (pi * 131 + wi * 17)) % 6;
      const z = PUZ[p.id];
      const pic = Object.assign({}, p, {
        w, wi, pi, H, W, N, sol, col, rgbs, nFill, vr, idx: PICS.length,
        avg: rgb(acc.map(v => v / Math.max(1, nFill))),
        clues: Array.from(z.c, ch => (ch === "." ? -1 : +ch)),
        given: Array.from(z.g, ch => (ch === "." ? -1 : +ch)),
      });
      PICS.push(pic); w.list.push(pic);
    });
  });
  const byId = id => PICS.find(p => p.id === id);

  /* ---------- Speicher ---------- */
  const KEY = "mosaik.v1";
  const DEF = { mode: "zauber", sound: true, music: true, auto: false };
  const save = { solved: {}, prog: {}, set: Object.assign({}, DEF), help: false, last: null };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s) { Object.assign(save, s); save.set = Object.assign({}, DEF, s.set || {}); }
  } catch (e) { /* ohne Speicher spielen */ }
  let saveTimer = 0;
  function persist(immediate) {
    clearTimeout(saveTimer);
    const go = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* voll oder gesperrt */ } };
    if (immediate) go(); else saveTimer = setTimeout(go, 400);
  }
  AU.soundOn = save.set.sound; AU.musicOn = save.set.music;

  const RANKS = [[0, "Kiesel"], [5, "Scherbe"], [14, "Glasstein"], [26, "Tessera"], [42, "Smalte"], [60, "Fries"], [80, "Fresko"], [100, "Meisterwerk"]];
  const totalStars = () => Object.values(save.solved).reduce((s, r) => s + (r.stars || 0), 0);
  const rankOf = n => { let i = 0; while (i + 1 < RANKS.length && n >= RANKS[i + 1][0]) i++; return i; };
  const solvedIn = w => w.list.filter(p => save.solved[p.id]).length;
  const NEED = 4;
  const unlocked = wi => wi === 0 || solvedIn(WORLDS[wi - 1]) >= NEED;

  function setMood(w) {
    const r = document.documentElement.style;
    r.setProperty("--wa", w.mood[0]); r.setProperty("--wb", w.mood[1]); r.setProperty("--wc", w.mood[2]);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", w.mood[1]);
  }

  /* ---------- Mosaiksteine ----------
     Jeder Stein ist von Hand "geschnitten": leicht schiefe Kanten, je Feld eine von NV Formen.
     slate  offener Stein: matter Schiefer mit Sprenkeln und gebrochener Kante
     glass  gesetzter Stein: Smalten-Glas mit Farbwolken, Bläschen und Glanzsplitter
     marble gesetzter Stein im Modus Klassisch
     matte  Hintergrundstein nach der Enthüllung: unglasierte Keramik
     hole / holeDot  leeres Feld: vertieftes Mörtelbett (Farbe tönt es leicht) */
  const NV = 6, PAD = 0.2;
  const cache = new Map();
  // Steinbilder freigeben: Safari zählt jede Zeichenfläche gegen ein festes Speicherlimit
  function flush() { for (const cv of cache.values()) { cv.width = cv.height = 0; } cache.clear(); }
  const srng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const shade = (a, k) => k >= 0 ? mix(a, [255, 255, 255], k) : deep(a, -k);
  function toHsl(a) {
    const [r, g, b] = a.map(v => v / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, dd = mx - mn;
    let h = 0, sat = 0;
    if (dd) {
      sat = dd / (1 - Math.abs(2 * l - 1));
      h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, Math.min(1, sat), l];
  }
  function fromHsl(h, sat, l) {
    const C = (1 - Math.abs(2 * l - 1)) * sat, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - C / 2;
    const [rr, gg, bb] = h < 60 ? [C, X, 0] : h < 120 ? [X, C, 0] : h < 180 ? [0, C, X] : h < 240 ? [0, X, C] : h < 300 ? [X, 0, C] : [C, 0, X];
    return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255];
  }
  // Abdunkeln wie dickes Glas: satter und wärmer statt grau
  function deep(a, k) {
    let [h, sat, l] = toHsl(a);
    if (l > 0.8) sat *= 0.3; // weißes Glas dunkelt kühl, nicht orange
    else if (h > 38 && h < 75 && sat > 0.25) h -= (h - 30) * 0.55 * k * 1.6; // Gelb wird zu Bernstein
    return fromHsl(h, Math.min(1, sat * (1 + k * 0.5)), l * (1 - k * 0.85));
  }
  // Aufhellen wie Glas im Gegenlicht: heller und leuchtender, nicht milchig
  function lift(a, k) {
    const [h, sat, l] = toHsl(a);
    return fromHsl(h, Math.min(1, sat * (1 + k * 0.9) + (sat > 0.15 ? k * 0.15 : 0)), l + (1 - l) * k * 0.75);
  }

  const rgba = (a, al) => "rgba(" + Math.round(a[0]) + "," + Math.round(a[1]) + "," + Math.round(a[2]) + "," + al + ")";
  const parseCol = s => s[0] === "#" ? hex(s) : s.match(/\d+/g).slice(0, 3).map(Number);

  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  // Ecken eines Steins im Einheitsquadrat, je Form leicht verschoben
  const CORNERS = [];
  for (let v = 0; v < NV; v++) {
    const R = srng(v * 7919 + 101), j = 0.045;
    CORNERS.push([[R() * j, R() * j], [1 - R() * j, R() * j], [1 - R() * j, 1 - R() * j], [R() * j, 1 - R() * j]]);
  }
  function stonePath(c, v, x, y, S, inset = 0, rad = 0.13, keep = false) {
    const p = CORNERS[v % NV].map(([u, w]) => [x + inset + u * (S - 2 * inset), y + inset + w * (S - 2 * inset)]);
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const r = S * rad;
    if (!keep) c.beginPath();
    const s0 = m(p[3], p[0]); c.moveTo(s0[0], s0[1]);
    for (let k = 0; k < 4; k++) { const a = p[k], b = p[(k + 1) % 4]; c.arcTo(a[0], a[1], b[0], b[1], r); }
    c.closePath();
  }
  // Form als Path2D im Einheitsquadrat, für Überlagerungen direkt auf dem Brett
  const UNIT = [];
  for (let v = 0; v < NV; v++) {
    const P = new Path2D(), p = CORNERS[v], m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0 = m(p[3], p[0]);
    P.moveTo(s0[0], s0[1]);
    for (let k = 0; k < 4; k++) { const a = p[k], b = p[(k + 1) % 4]; P.arcTo(a[0], a[1], b[0], b[1], 0.13); }
    P.closePath(); UNIT.push(P);
  }
  // Form der Edelsteine (stärker gerundet, leicht eingerückt) für den Lichtglanz
  const GEMUNIT = [];
  for (let v = 0; v < NV; v++) {
    const P = new Path2D(), ins = 0.02, p = CORNERS[v].map(([u, w]) => [ins + u * (1 - 2 * ins), ins + w * (1 - 2 * ins)]);
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0 = m(p[3], p[0]);
    P.moveTo(s0[0], s0[1]);
    for (let k = 0; k < 4; k++) { const a = p[k], b = p[(k + 1) % 4]; P.arcTo(a[0], a[1], b[0], b[1], 0.17); }
    P.closePath(); GEMUNIT.push(P);
  }

  function sprite(style, color, S, v = 0) {
    S = Math.max(4, Math.round(S)); v = (style === "glass" || style === "gem") ? v % (SNV * 3) : v % NV;
    const key = style + "|" + color + "|" + S + "|" + v;
    let cv = cache.get(key);
    if (cv) return cv;
    if (cache.size > 700) flush();
    const P = Math.ceil(S * PAD);
    cv = document.createElement("canvas"); cv.width = cv.height = S + 2 * P; cv.S = S; cv.pad = P;
    paint(cv.getContext("2d", { willReadFrequently: true }), S, P, style, color, v);
    cache.set(key, cv);
    return cv;
  }
  // Stein der Größe size bei (x,y) zeichnen (Rand für Schatten eingerechnet)
  function blit(c, img, x, y, w, h = w) {
    const k = img.width / img.S, o = img.pad / img.S;
    c.drawImage(img, x - o * w, y - o * h, w * k, h * k);
  }

  function grain(c, S, P, amt, seed, cool) {
    if (S < 10) return;
    const n = S + 2 * P, id = c.getImageData(0, 0, n, n), d = id.data, R = srng(seed);
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      let g = (R() - 0.5) * amt;
      if (R() < 0.012) g += (R() < 0.5 ? -1 : 1) * amt * 1.6; // einzelne Körner
      d[i] += g; d[i + 1] += g; d[i + 2] += g + (cool ? g * 0.15 : 0);
    }
    c.putImageData(id, 0, 0);
  }
  function blobs(c, S, P, R, n, colA, colB, al) {
    for (let k = 0; k < n; k++) {
      const x = P + R() * S, y = P + R() * S, r = S * (0.18 + R() * 0.35);
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      const col = R() < 0.5 ? colA : colB;
      g.addColorStop(0, rgba(col, al)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.fillRect(P, P, S, S);
    }
  }
  function bevel(c, S, P, v, light, dark, w) {
    stonePath(c, v, P, P, S); c.save(); c.clip();
    const g = c.createLinearGradient(P, P, P + S, P + S);
    g.addColorStop(0, "rgba(255,255,255," + light + ")"); g.addColorStop(0.45, "rgba(255,255,255,0)");
    g.addColorStop(0.6, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0," + dark + ")");
    c.lineWidth = S * w * 2; c.strokeStyle = g; stonePath(c, v, P, P, S); c.stroke();
    c.restore();
  }
  function dropShadow(c, S, P, v, color, blur, dy) {
    c.save(); c.globalCompositeOperation = "destination-over";
    c.shadowColor = color; c.shadowBlur = S * blur; c.shadowOffsetY = S * dy; c.shadowOffsetX = S * dy * 0.3;
    stonePath(c, v, P, P, S); c.fillStyle = "#000"; c.fill(); c.restore();
  }

  function paint(c, S, P, style, color, v) {
    const R = srng(v * 977 + S * 13 + style.length * 31 + (color ? parseCol(color)[0] * 7 + parseCol(color)[2] : 0));
    if (style === "hole" || style === "holeDot") {
      // vertieftes Mörtelbett
      const base = color ? mix([20, 17, 25], parseCol(color), 0.14) : [20, 17, 25], ins = S * 0.04;
      stonePath(c, v, P, P, S, ins); c.fillStyle = rgba(base, 1); c.fill();
      c.save(); c.clip();
      blobs(c, S, P, R, 3, [0, 0, 0], [255, 255, 255], 0.05);
      c.restore();
      grain(c, S, P, 28, v * 31 + S, false);
      // weicher Schatten, der von der oberen linken Kante ins Loch fällt
      c.save(); stonePath(c, v, P, P, S, ins); c.clip();
      c.shadowColor = "rgba(0,0,0,.9)"; c.shadowBlur = S * 0.14; c.shadowOffsetX = S * 0.05; c.shadowOffsetY = S * 0.09;
      c.beginPath(); c.rect(-S, -S, S * 4, S * 4); stonePath(c, v, P, P, S, ins, 0.13, true);
      c.fillStyle = "#000"; c.fill("evenodd");
      c.restore();
      // Lichtkante unten rechts
      c.save(); stonePath(c, v, P, P, S, ins); c.clip();
      const h = c.createLinearGradient(P + S, P + S, P + S * 0.45, P + S * 0.45);
      h.addColorStop(0, "rgba(255,255,255,.16)"); h.addColorStop(0.3, "rgba(255,255,255,0)");
      c.lineWidth = S * 0.06; c.strokeStyle = h; stonePath(c, v, P, P, S, ins); c.stroke();
      c.restore();
      if (style === "holeDot") {
        const x = P + S * 0.5, y = P + S * 0.52, r = S * 0.065;
        c.beginPath(); c.arc(x, y + r * 0.3, r, 0, 7); c.fillStyle = "rgba(0,0,0,.5)"; c.fill();
        c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = "rgba(160,150,170,.55)"; c.fill();
        c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, 7); c.fillStyle = "rgba(255,255,255,.35)"; c.fill();
      }
      return;
    }

    if (style === "glass" || style === "gem") { paintSmalti(c, S, P, parseCol(color), v % SNV, Math.floor(v / SNV) % 3); return; }
    let base;
    if (style === "slate") { const d = (R() - 0.5) * 14; base = [176 + d, 172 + d, 182 + d * 1.1]; }   // heller grauer Kalkstein
    else if (style === "marble") base = [30, 28, 38];                                                  // polierter Onyx
    else base = parseCol(color);

    // Körper
    stonePath(c, v, P, P, S);
    const g0 = c.createLinearGradient(P, P, P + S * 0.3, P + S);
    if (style === "slate") { g0.addColorStop(0, rgba(shade(base, 0.08), 1)); g0.addColorStop(1, rgba(shade(base, -0.14), 1)); }
    else { g0.addColorStop(0, rgba(shade(base, 0.06), 1)); g0.addColorStop(1, rgba(shade(base, -0.1), 1)); }
    c.fillStyle = g0; c.fill();
    c.save(); stonePath(c, v, P, P, S); c.clip();

    if (style === "slate") {
      blobs(c, S, P, R, 4, [255, 255, 255], [90, 86, 100], 0.12);
      if (R() < 0.6) { // feine Ader
        c.beginPath(); const y0 = P + S * R();
        c.moveTo(P, y0); c.bezierCurveTo(P + S * 0.3, y0 + S * (R() - 0.5) * 0.6, P + S * 0.7, y0 + S * (R() - 0.5) * 0.6, P + S, y0 + S * (R() - 0.5) * 0.5);
        c.lineWidth = Math.max(0.6, S * 0.012); c.strokeStyle = "rgba(70,66,84,.16)"; c.stroke();
      }
    } else if (style === "marble") {
      blobs(c, S, P, R, 3, [70, 66, 90], [0, 0, 0], 0.3);
      for (let k = 0; k < 2; k++) {
        c.beginPath(); const x0 = P + S * R();
        c.moveTo(x0, P); c.bezierCurveTo(x0 + S * (R() - 0.5), P + S * 0.35, x0 + S * (R() - 0.5), P + S * 0.65, x0 + S * (R() - 0.5) * 0.8, P + S);
        c.lineWidth = S * (0.008 + R() * 0.01); c.strokeStyle = "rgba(190,186,210,.14)"; c.stroke();
      }
    } else if (style === "matte") {
      blobs(c, S, P, R, 3, shade(base, 0.2), shade(base, -0.2), 0.18);
    }
    c.restore();

    grain(c, S, P, style === "slate" ? 16 : style === "marble" ? 4 : 7, v * 53 + S + base[0], style === "slate");

    if (style === "slate") {
      bevel(c, S, P, v, 0.45, 0.4, 0.07);
      dropShadow(c, S, P, v, "rgba(0,0,0,.6)", 0.08, 0.07);
    } else if (style === "marble") {
      bevel(c, S, P, v, 0.35, 0.6, 0.06);
      c.save(); stonePath(c, v, P, P, S); c.clip();
      const gl = c.createLinearGradient(P, P, P + S, P + S);
      gl.addColorStop(0, "rgba(255,255,255,.16)"); gl.addColorStop(0.35, "rgba(255,255,255,0)");
      c.fillStyle = gl; c.fillRect(P, P, S, S); c.restore();
      dropShadow(c, S, P, v, "rgba(0,0,0,.6)", 0.08, 0.07);
    } else {
      bevel(c, S, P, v, 0.22, 0.35, 0.05);
      dropShadow(c, S, P, v, "rgba(0,0,0,.45)", 0.06, 0.05);
    }
  }

  /* Handgeschnittene Smalten: unregelmäßige Form (teils abgeschlagene Ecke), muschelige Bruchfläche,
     Farbwolken, Tiefe zum Rand, Licht- und Schattenkanten je nach Ausrichtung der Bruchkante. */
  const SNV = 8, SPOLY = [];
  for (let k = 0; k < SNV; k++) {
    const R = srng(k * 4441 + 7), j = 0.065;
    const pts = [[R() * j, R() * j], [1 - R() * j, R() * j], [1 - R() * j, 1 - R() * j], [R() * j, 1 - R() * j]];
    if (k % 3 === 1) {
      const ci = Math.floor(R() * 4), a = pts[ci], nx = pts[(ci + 1) % 4], pv = pts[(ci + 3) % 4], cut = 0.13 + R() * 0.08;
      pts.splice(ci, 1, [a[0] + (pv[0] - a[0]) * cut, a[1] + (pv[1] - a[1]) * cut], [a[0] + (nx[0] - a[0]) * cut, a[1] + (nx[1] - a[1]) * cut]);
    }
    SPOLY.push(pts);
  }
  const smaltiPts = (k, x, y, S, ins = 0) => SPOLY[k % SNV].map(([u, w]) => [x + ins + u * (S - 2 * ins), y + ins + w * (S - 2 * ins)]);
  function polyPath(c, pts, r) {
    const m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], n = pts.length, s0 = m(pts[n - 1], pts[0]);
    c.beginPath(); c.moveTo(s0[0], s0[1]);
    for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; c.arcTo(a[0], a[1], b[0], b[1], r); }
    c.closePath();
  }
  const SM_UNIT = SPOLY.map(pts => { const P2 = new Path2D(), n = pts.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s0 = m(pts[n - 1], pts[0]);
    P2.moveTo(s0[0], s0[1]); for (let k = 0; k < n; k++) { const a = pts[k], b = pts[(k + 1) % n]; P2.arcTo(a[0], a[1], b[0], b[1], 0.045); } P2.closePath(); return P2; });

  function paintSmalti(c, S, P, base, k, tone) {
    const R = srng(k * 977 + tone * 131 + Math.round(base[0] + base[1] * 3 + base[2] * 7));
    const b0 = tone === 0 ? deep(base, 0.1) : tone === 2 ? lift(base, 0.1) : base;
    const X = f => P + S * f, pts = smaltiPts(k, P, P, S), rad = S * 0.045;
    // Kontaktschatten und ein zarter Farbschein im Mörtel
    c.save();
    c.shadowColor = rgba(lift(base, 0.3), 0.3); c.shadowBlur = S * 0.12;
    polyPath(c, pts, rad); c.fillStyle = rgba(b0, 1); c.fill();
    c.shadowColor = "rgba(0,0,0,.6)"; c.shadowBlur = S * 0.045; c.shadowOffsetY = S * 0.035; c.shadowOffsetX = S * 0.012;
    c.fill();
    c.restore();

    c.save(); polyPath(c, pts, rad); c.clip();
    // Neigung: jeder Stein fängt das Licht in einem etwas anderen Winkel
    const ang = -2.2 + (R() - 0.5) * 1.5, gx = Math.cos(ang) * S * 0.55, gy = Math.sin(ang) * S * 0.55;
    const g = c.createLinearGradient(X(0.5) + gx, X(0.5) + gy, X(0.5) - gx, X(0.5) - gy);
    g.addColorStop(0, rgba(lift(b0, 0.2 + R() * 0.14), 1)); g.addColorStop(0.55, rgba(b0, 1)); g.addColorStop(1, rgba(deep(b0, 0.3), 1));
    c.fillStyle = g; c.fillRect(P, P, S, S);
    // Farbwolken im Glas
    for (let n = 0; n < 5; n++) {
      const x = X(0.1 + R() * 0.8), y = X(0.1 + R() * 0.8), r = S * (0.18 + R() * 0.3);
      const col = R() < 0.5 ? lift(b0, 0.38) : deep(b0, 0.38);
      c.save(); c.translate(x, y); c.rotate(R() * 3.14); c.scale(1.6, 0.7);
      const cg = c.createRadialGradient(0, 0, 0, 0, 0, r); cg.addColorStop(0, rgba(col, 0.32)); cg.addColorStop(1, rgba(col, 0));
      c.fillStyle = cg; c.fillRect(-r, -r, r * 2, r * 2); c.restore();
    }
    // durchscheinendes Licht im unteren Teil
    const tg = c.createRadialGradient(X(0.55), X(0.74), 0, X(0.55), X(0.74), S * 0.38);
    tg.addColorStop(0, rgba(lift(b0, 0.5), 0.42)); tg.addColorStop(1, rgba(lift(b0, 0.5), 0));
    c.fillStyle = tg; c.fillRect(P, P, S, S);
    // Tiefe zum Rand
    const vg = c.createRadialGradient(X(0.5), X(0.5), S * 0.18, X(0.5), X(0.5), S * 0.75);
    vg.addColorStop(0, rgba(deep(b0, 0.55), 0)); vg.addColorStop(1, rgba(deep(b0, 0.55), 0.55));
    c.fillStyle = vg; c.fillRect(P, P, S, S);
    // muschelige Bruchfläche: je Stein anders (oder glatt), heller Grat mit Schattenstufe darunter
    const kind = Math.floor(R() * 4);
    if (kind > 0) {
      let p0, p1, cp;
      if (kind === 1) { p0 = [P - 1, X(0.2 + R() * 0.25)]; p1 = [P + S + 1, X(0.08 + R() * 0.3)]; cp = [X(0.3 + R() * 0.4), X(R() * 0.1)]; }
      else if (kind === 2) { p0 = [X(0.35 + R() * 0.3), P - 1]; p1 = [P - 1, X(0.35 + R() * 0.3)]; cp = [X(0.32), X(0.32)]; }
      else { p0 = [X(0.45 + R() * 0.3), P + S + 1]; p1 = [P + S + 1, X(0.45 + R() * 0.3)]; cp = [X(0.75 + R() * 0.1), X(0.75 + R() * 0.1)]; }
      const curve = () => { c.moveTo(p0[0], p0[1]); c.quadraticCurveTo(cp[0], cp[1], p1[0], p1[1]); };
      // helle Seite (zum Licht)
      c.save(); c.beginPath(); curve();
      if (kind === 3) { c.lineTo(P + S + 1, P + S + 1); } else { c.lineTo(P - 1, P - 1); }
      c.closePath(); c.fillStyle = rgba(lift(b0, 0.42), kind === 3 ? 0.1 : 0.17); c.fill(); c.restore();
      // Schattenstufe direkt neben dem Grat
      c.save(); c.beginPath(); curve(); c.lineWidth = S * 0.07; c.strokeStyle = rgba(deep(b0, 0.45), 0.22);
      c.translate(S * 0.012, S * 0.03); c.stroke(); c.restore();
      c.beginPath(); curve(); c.lineWidth = Math.max(0.8, S * 0.013); c.strokeStyle = "rgba(255,255,255,.3)"; c.stroke();
    }
    // matter Himmelsreflex auf der Oberseite
    const sk = c.createLinearGradient(0, P, 0, X(0.35)); sk.addColorStop(0, "rgba(255,255,255,.1)"); sk.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = sk; c.fillRect(P, P, S, S * 0.35);
    // Bruchkanten: zum Licht gewandte hell, abgewandte dunkel
    const n = pts.length;
    c.lineCap = "round";
    for (let e = 0; e < n; e++) {
      const a = pts[e], b = pts[(e + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
      const face = (dy / len) * -0.6 + (-dx / len) * -0.8;
      if (Math.abs(face) < 0.15) continue;
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]);
      c.lineWidth = S * 0.085;
      c.strokeStyle = face > 0 ? "rgba(255,255,255," + (0.14 + 0.36 * face).toFixed(3) + ")" : rgba(deep(b0, 0.65), (0.6 * -face).toFixed(3));
      c.stroke();
    }
    // Lichtsaum: Licht tritt an der unteren Kante durch das Glas
    const ls = c.createLinearGradient(0, X(0.6), 0, X(1));
    ls.addColorStop(0, rgba(lift(b0, 0.7), 0)); ls.addColorStop(1, rgba(lift(b0, 0.7), 0.45));
    c.lineWidth = S * 0.035; c.strokeStyle = ls; polyPath(c, smaltiPts(k, P, P, S, S * 0.05), rad); c.stroke();
    c.restore();
    c.lineWidth = Math.max(0.8, S * 0.01); c.strokeStyle = rgba(deep(b0, 0.7), 0.5);
    polyPath(c, pts, rad); c.stroke();
  }

  // Lage eines Steins: leicht verdreht, minimal größer oder kleiner, eigene Glasvariante
  function lay(i) {
    const h = Math.imul(i + 3, 2654435761) >>> 0;
    return { rot: (((h >>> 3) % 9) - 4) * 0.011, sc: 1 + (((h >>> 9) % 5) - 2) * 0.012, gv: (h % SNV) + SNV * ((h >>> 13) % 3) };
  }

  // Mörtelbett als Muster für das Brett
  let mortar = null;
  function mortarPattern(c) {
    if (mortar) return c.createPattern(mortar, "repeat");
    const n = 180; mortar = document.createElement("canvas"); mortar.width = mortar.height = n;
    const m = mortar.getContext("2d");
    m.fillStyle = "#1b1721"; m.fillRect(0, 0, n, n);
    const id = m.getImageData(0, 0, n, n), d = id.data, R = srng(42);
    for (let i = 0; i < d.length; i += 4) { let g = (R() - 0.5) * 18; if (R() < 0.02) g += 22; d[i] += g; d[i + 1] += g; d[i + 2] += g; }
    m.putImageData(id, 0, 0);
    return c.createPattern(mortar, "repeat");
  }

  // Fertiges Mosaik in eine Leinwand malen (Übersicht, Galerie).
  function drawMosaic(cv, pic, px) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const n = Math.max(pic.W, pic.H);
    cv.width = cv.height = Math.round(px * d);
    const c = cv.getContext("2d");
    const cell = cv.width / n, gap = Math.max(0.8, cell * 0.08), S = cell - gap;
    c.fillStyle = mortarPattern(c); c.fillRect(0, 0, cv.width, cv.height);
    const ox = (n - pic.W) * cell / 2, oy = (n - pic.H) * cell / 2;
    for (let r = 0; r < pic.H; r++) for (let q = 0; q < pic.W; q++) {
      const i = r * pic.W + q;
      const t = lay(i), img = sprite(pic.sol[i] ? "glass" : "matte", pic.col[i], S, pic.sol[i] ? t.gv : pic.vr[i]);
      c.save(); c.translate(ox + q * cell + cell / 2, oy + r * cell + cell / 2); c.rotate(t.rot); blit(c, img, -S * t.sc / 2, -S * t.sc / 2, S * t.sc); c.restore();
    }
  }

  /* ---------- Bildschirme ---------- */
  let screen = "home";
  function show(name) {
    ["home", "game", "gallery"].forEach(n => { const el = $("#" + n); el.hidden = n !== name; });
    const el = $("#" + name); el.classList.remove("enter"); void el.offsetWidth; el.classList.add("enter");
    screen = name;
    if (name !== "game") releaseWake();
  }

  /* ---------- Startseite ---------- */
  function renderHome() {
    const st = totalStars(), rk = rankOf(st);
    $("#rankName").textContent = RANKS[rk][1];
    const lo = RANKS[rk][0], hi = rk + 1 < RANKS.length ? RANKS[rk + 1][0] : 108;
    requestAnimationFrame(() => { $("#rankBar").style.width = (rk + 1 < RANKS.length ? clamp((st - lo) / (hi - lo)) * 100 : 100) + "%"; });
    $("#starCount").textContent = st + " ★";
    let top = 0; WORLDS.forEach((w, i) => { if (unlocked(i)) top = i; });
    setMood(WORLDS[top]);

    const cw = $("#continueWrap"); cw.innerHTML = "";
    const cont = nextPic(save.last && save.prog[save.last] ? byId(save.last) : null);
    if (cont) {
      const b = document.createElement("button");
      b.className = "pill primary";
      b.innerHTML = '<svg viewBox="0 0 24 24" style="stroke:#2a1c08"><path d="M8 5l11 7-11 7z"/></svg>' +
        (save.prog[cont.id] ? "Weiterlegen" : "Nächstes Bild") + " · " + cont.w.name + " " + (cont.pi + 1);
      b.onclick = () => { AU.init(); AU.ui(); startGame(cont); };
      cw.appendChild(b);
    }

    const box = $("#worlds"); box.innerHTML = "";
    WORLDS.forEach((w, wi) => {
      const open = unlocked(wi), n = solvedIn(w);
      const card = document.createElement("article");
      card.className = "world" + (open ? "" : " locked");
      card.style.setProperty("--a", w.mood[0]); card.style.setProperty("--b", w.mood[1]); card.style.setProperty("--c", w.mood[2]);
      const size = w.list[0].W + "×" + w.list[0].H;
      card.innerHTML = `<header><h2>${w.name}</h2><span class="meta">${size} · ${n}/${w.list.length}</span></header><p>${w.sub}</p><div class="thumbs"></div>`;
      const th = card.querySelector(".thumbs");
      w.list.forEach(p => {
        const b = document.createElement("button");
        b.className = "thumb";
        const rec = save.solved[p.id], pr = save.prog[p.id];
        b.setAttribute("aria-label", rec ? p.title : "Bild " + (p.pi + 1));
        if (rec) {
          const cv = document.createElement("canvas"); b.appendChild(cv); drawMosaic(cv, p, 96);
          const s = document.createElement("span"); s.className = "st"; s.textContent = "★".repeat(rec.stars); b.appendChild(s);
        } else {
          b.innerHTML = '<span class="q">' + (p.pi + 1) + "</span>";
          if (pr) {
            const done = pr.st ? [...pr.st].filter(ch => ch !== "?").length / pr.st.length : 0;
            b.innerHTML += '<span class="pr"><i style="width:' + Math.round(done * 100) + '%;background:' + w.mood[2] + '"></i></span>';
          }
        }
        if (open) b.onclick = () => { AU.init(); AU.ui(); startGame(p); };
        else b.disabled = true;
        th.appendChild(b);
      });
      if (!open) {
        const prev = WORLDS[wi - 1], miss = NEED - solvedIn(prev);
        const l = document.createElement("div"); l.className = "lock";
        l.innerHTML = `<span><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>Löse noch ${miss} ${miss === 1 ? "Bild" : "Bilder"} in „${prev.name}“, dann öffnet sich diese Welt.</span>`;
        card.appendChild(l);
      }
      box.appendChild(card);
    });
    logoTiles();
  }

  function nextPic(pref) {
    if (pref && !save.solved[pref.id]) return pref;
    for (let wi = 0; wi < WORLDS.length; wi++) {
      if (!unlocked(wi)) break;
      const p = WORLDS[wi].list.find(q => !save.solved[q.id]);
      if (p) return p;
    }
    return null;
  }

  // Kleine Steinreihe über dem Titel
  function logoTiles() {
    const cv = $("#logoTiles"), c = cv.getContext("2d");
    const cols = ["#e1333c", "#ff9a2e", "#ffd25e", "#6cc26a", "#3fb8af", "#3d6fb6", "#8e5bd1"];
    const t0 = now();
    const step = () => {
      const t = now() - t0;
      c.clearRect(0, 0, cv.width, cv.height);
      let more = false;
      cols.forEach((col, k) => {
        const p = REDUCE ? 1 : clamp((t - k * 110) / 520);
        if (p < 1) more = true;
        const S = 56, x = 22 + k * 66, y = 8;
        const sc = Math.max(0.01, easeBack(p));
        c.save(); c.translate(x + S / 2, y + S / 2); c.scale(sc, 1); c.translate(-S / 2, -S / 2);
        blit(c, sprite(p < 0.5 ? "slate" : "glass", col, S, k), 0, 0, S); c.restore();
      });
      if (more) requestAnimationFrame(step);
    };
    step();
  }

  /* ---------- Spiel ---------- */
  const board = $("#board"), bctx = board.getContext("2d");
  const L = { s: 30, cw: 0, ch: 0, d: 1, xs: [], ys: [], g: 0 };
  let G = null;

  function startGame(pic) {
    flush();
    AU.setWorld(pic.w); setMood(pic.w);
    const N = pic.N, st = new Int8Array(N).fill(-1);
    pic.given.forEach((v, i) => { if (v >= 0) st[i] = v; });
    const pr = save.prog[pic.id];
    let mistakes = 0, hints = 0, elapsed = 0;
    if (pr && pr.st && pr.st.length === N) {
      for (let i = 0; i < N; i++) { const ch = pr.st[i]; if (ch === "1") st[i] = 1; else if (ch === "0") st[i] = 0; }
      mistakes = pr.m || 0; hints = pr.h || 0; elapsed = pr.t || 0;
    }
    const zauber = save.set.mode === "zauber";
    if (zauber) for (let i = 0; i < N; i++) if (st[i] >= 0 && st[i] !== pic.sol[i]) st[i] = -1;
    const lives = livesFor(pic);
    if (zauber && mistakes >= lives) { // aus einem alten Spielstand: frisch beginnen
      st.fill(-1); pic.given.forEach((v, i) => { if (v >= 0) st[i] = v; });
      mistakes = 0; hints = 0; elapsed = 0; delete save.prog[pic.id];
    }
    G = {
      pic, N, st, mistakes, hints, elapsed, zauber, tool: 1,
      B: SV.blocks(pic.H, pic.W), undo: [], redo: [],
      anim: new Array(N).fill(null), cs: new Int8Array(N), ct: new Float64Array(N),
      hint: null, done: false, reveal: null, actions: 0, press: -1, lastI: -1, tick: now(), rings: [],
      firstMistake: !mistakes, lives, over: false,
    };
    $("#game").classList.remove("broken");
    $("#gWorld").textContent = pic.w.name + " · Bild " + (pic.pi + 1) + " von " + pic.w.list.length;
    $("#gRiddle").textContent = pic.riddle;
    $("#win").hidden = true; $("#win").innerHTML = "";
    $("#game").classList.remove("won"); board.style.transform = board.style.transition = ""; $("#boardShadow").style.transform = $("#boardShadow").style.transition = "";
    $("#glow").style.opacity = 0;
    setTool(1);
    $("#tUndo").style.display = zauber ? "none" : "";
    show("game");
    layout();
    clueStates(true);
    hud();
    save.last = pic.id; persist();
    requestWake();
    kick();
    warm(pic);
    coach("start");
    if (!save.help) { save.help = true; persist(); setTimeout(openHelp, 450); }
  }

  // Steine vorab schneiden, damit die Enthüllung flüssig läuft
  function warm(pic) {
    const jobs = [];
    for (let i = 0; i < pic.N; i++) {
      jobs.push(i);
    }
    const step = () => {
      if (!G || G.pic !== pic) return;
      const S = L.s * Math.min(2, L.d), t0 = now();
      while (jobs.length && now() - t0 < 8) {
        const i = jobs.shift();
        if (pic.sol[i]) sprite("gem", pic.col[i], S, lay(i).gv);
        else {
          sprite("matte", pic.col[i], S, pic.vr[i]);
          sprite(pic.clues[i] >= 0 ? "hole" : "holeDot", G.zauber ? pic.col[i] : "", S, pic.vr[i]);
        }
      }
      if (jobs.length) setTimeout(step, 20);
    };
    setTimeout(step, 400);
  }

  function layout() {
    if (!G) return;
    const wrap = $("#boardWrap").getBoundingClientRect();
    const { W, H } = G.pic;
    const ux = W + (W - 1) * 0.08 + 0.7;
    const uy = H + (H - 1) * 0.08 + 0.7;
    const s = Math.max(10, Math.floor(Math.min((wrap.width - 4) / ux, (wrap.height - 4) / uy, 70)));
    L.s = s; L.cw = Math.round(s * ux); L.ch = Math.round(s * uy);
    L.d = Math.min(3, window.devicePixelRatio || 1);
    board.style.width = L.cw + "px"; board.style.height = L.ch + "px";
    board.style.left = Math.round((wrap.width - L.cw) / 2) + "px"; board.style.top = Math.round((wrap.height - L.ch) / 2) + "px";
    board.width = Math.round(L.cw * L.d); board.height = Math.round(L.ch * L.d);
    geom(1);
    const sh = $("#boardShadow");
    Object.assign(sh.style, { left: board.style.left, top: board.style.top, width: L.cw + "px", height: L.ch + "px", borderRadius: Math.round(s * 0.42) + "px" });
    buildTray();
    fxSize();
    kick();
  }
  // Tablett (Mörtelbett mit Innenschatten und Lichtkante) und Raumlicht einmal vorab rendern
  function buildTray() {
    const d = L.d, W = Math.round(L.cw * d), H = Math.round(L.ch * d), r = L.s * 0.42 * d;
    const mk = () => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; return cv; };
    const tray = L.tray && L.tray.width === W && L.tray.height === H ? L.tray : mk();
    let c = tray.getContext("2d"); c.clearRect(0, 0, W, H);
    rr(c, 0, 0, W, H, r); c.fillStyle = mortarPattern(c); c.fill();
    c.save(); rr(c, 0, 0, W, H, r); c.clip();
    const tg = c.createLinearGradient(0, 0, 0, H); tg.addColorStop(0, "rgba(255,255,255,.035)"); tg.addColorStop(1, "rgba(0,0,0,.22)");
    c.fillStyle = tg; c.fillRect(0, 0, W, H);
    c.shadowColor = "rgba(0,0,0,.85)"; c.shadowBlur = 22 * d; c.shadowOffsetY = 6 * d;
    c.beginPath(); c.rect(-W, -H, W * 3, H * 3); rr(c, 0, 0, W, H, r); c.fillStyle = "#000"; c.fill("evenodd");
    c.restore();
    const rim = c.createLinearGradient(0, 0, 0, H); rim.addColorStop(0, "rgba(255,255,255,.22)"); rim.addColorStop(0.12, "rgba(255,255,255,.05)"); rim.addColorStop(1, "rgba(255,255,255,.03)");
    rr(c, 0.5 * d, 0.5 * d, W - d, H - d, r); c.lineWidth = 1.2 * d; c.strokeStyle = rim; c.stroke();
    L.tray = tray;
    const light = L.light && L.light.width === W && L.light.height === H ? L.light : mk();
    c = light.getContext("2d"); c.clearRect(0, 0, W, H);
    c.save(); rr(c, 0, 0, W, H, r); c.clip();
    const lg = c.createRadialGradient(W * 0.28, H * 0.12, 0, W * 0.28, H * 0.12, Math.max(W, H) * 1.05);
    lg.addColorStop(0, "rgba(255,250,240,.13)"); lg.addColorStop(0.45, "rgba(255,255,255,.02)"); lg.addColorStop(0.75, "rgba(0,0,0,.08)"); lg.addColorStop(1, "rgba(0,0,0,.32)");
    c.fillStyle = lg; c.fillRect(0, 0, W, H);
    c.restore();
    L.light = light;
  }
  function geom(k) {
    const s = L.s, g = s * 0.08 * k, bx = 0, { W, H } = G.pic;
    const tw = W * s + (W - 1) * g + Math.floor((W - 1) / 5) * bx;
    const th = H * s + (H - 1) * g + Math.floor((H - 1) / 5) * bx;
    const ox = (L.cw - tw) / 2, oy = (L.ch - th) / 2;
    for (let q = 0; q < W; q++) L.xs[q] = ox + q * (s + g) + Math.floor(q / 5) * bx;
    for (let r = 0; r < H; r++) L.ys[r] = oy + r * (s + g) + Math.floor(r / 5) * bx;
    L.xs.length = W; L.ys.length = H; L.g = g;
  }
  function axisIdx(arr, v) {
    const s = L.s;
    if (v < arr[0] - s * 0.35 || v > arr[arr.length - 1] + s * 1.35) return -1;
    let k = 0;
    for (let i = 1; i < arr.length; i++) if (v >= (arr[i - 1] + s + arr[i]) / 2) k = i;
    return k;
  }
  function cellAt(x, y) {
    const r = board.getBoundingClientRect();
    const q = axisIdx(L.xs, x - r.left), w = axisIdx(L.ys, y - r.top);
    return q < 0 || w < 0 ? -1 : w * G.pic.W + q;
  }
  function cellCenter(i) {
    const r = board.getBoundingClientRect(), W = G.pic.W;
    return [r.left + L.xs[i % W] + L.s / 2, r.top + L.ys[Math.floor(i / W)] + L.s / 2];
  }

  function setTool(t) {
    if (G) G.tool = t;
    $("#tFill").classList.toggle("on", t === 1); $("#tMark").classList.toggle("on", t === 0);
    $("#tFill").setAttribute("aria-checked", t === 1); $("#tMark").setAttribute("aria-checked", t === 0);
  }

  // Zustand jeder Zahl: 0 offen, 1 erledigt, 2 widersprüchlich
  function clueStates(init) {
    const { clues } = G.pic, B = G.B, st = G.st, t = now();
    let fresh = [];
    for (let i = 0; i < G.N; i++) {
      if (clues[i] < 0) continue;
      let f = 0, u = 0;
      for (const x of B[i]) { if (st[x] === 1) f++; else if (st[x] < 0) u++; }
      const k = clues[i];
      const s = f > k || f + u < k ? 2 : u === 0 ? 1 : 0;
      if (s !== G.cs[i]) {
        if (s === 1 && !init) { G.ct[i] = t; fresh.push(i); }
        else if (s !== 1) G.ct[i] = init ? 0 : t;
        if (init && s === 1) G.ct[i] = -1e9;
        G.cs[i] = s;
      }
    }
    if (fresh.length && !G.done) {
      AU.clueDone(fresh.length);
    }
  }

  function hud() {
    const sStars = starsFor(G);
    $("#gStars").innerHTML = [0, 1, 2].map(k => '<i class="' + (k < sStars ? "" : "off") + '">★</i>').join("");
    const lv = $("#gLives");
    lv.hidden = !G.zauber;
    const left = Math.max(0, G.lives - G.mistakes);
    lv.innerHTML = Array.from({ length: G.lives }, (_, k) => '<i class="' + (k < left ? "" : "gone") + '"></i>').join("");
    lv.setAttribute("aria-label", left + " von " + G.lives + " Versuchen übrig");
    let known = 0; for (let i = 0; i < G.N; i++) if (G.st[i] >= 0) known++;
    $("#gProg").style.width = (known / G.N * 100) + "%";
    $("#tUndo").disabled = !G.undo.length;
    const hc = $("#hintCnt"); hc.textContent = G.hints; hc.style.display = G.hints ? "grid" : "none";
  }
  // Versuche je Bild: 3 bei kleinen Rastern, 4 bei 15–16, 5 bei 18–20
  function livesFor(pic) { return 3 + Math.floor((Math.max(pic.W, pic.H) - 10) / 4); }
  function starsFor(g) { const pen = (g.zauber ? g.mistakes : 0) + g.hints; return pen === 0 ? 3 : pen <= 2 ? 2 : 1; }

  function setCell(i, v, stroke, delay = 0) {
    const from = G.st[i];
    if (from === v) return false;
    G.st[i] = v;
    G.anim[i] = { t: now() + delay, k: v === 1 ? "fill" : v === 0 ? "mark" : "clear", from };
    if (stroke) stroke.ch.push([i, from, v]);
    return true;
  }

  function applyAt(i, stroke) {
    const st = G.st, sol = G.pic.sol;
    if (G.zauber) {
      if (st[i] >= 0) return;
      const want = stroke.val;
      if (sol[i] !== want) {
        st[i] = sol[i];
        G.anim[i] = { t: now(), k: "wrong", from: -1 };
        G.mistakes++; stroke.dead = true;
        AU.oops();
        const left = G.lives - G.mistakes;
        if (left <= 0) { G.over = true; setTimeout(gameOver, 700); }
        else if (G.firstMistake) {
          G.firstMistake = false;
          toast((want === 1 ? "Dieses Feld gehört nicht zum Bild." : "Dieses Feld gehört zum Bild.") + " Das kostet einen Versuch – noch <b>" + left + "</b>.", 5200);
        } else toast("Das passt nicht. Noch <b>" + left + "</b> " + (left === 1 ? "Versuch" : "Versuche") + ".", 3200);
        hud();
      } else {
        setCell(i, want, stroke);
        if (want === 1) { AU.hit(); glowAt(i, G.pic.col[i]); } else AU.empty();
      }
    } else {
      const v = stroke.action === "clear" ? -1 : stroke.val;
      if (setCell(i, v, stroke)) { if (v === 1) AU.hit(); else if (v === 0) AU.empty(); else AU.tick(0.1); }
    }
    G.lastI = i; G.actions++;
  }

  function afterChange() {
    clueStates(false);
    if (G.zauber && save.set.auto) autoEmpty();
    if (G.hint && G.hint.cells && G.hint.cells.every(([x]) => G.st[x] >= 0)) G.hint = null;
    if (G.hint && G.hint.wrong != null && G.st[G.hint.wrong] === G.pic.sol[G.hint.wrong]) G.hint = null;
    hud();
    saveProg();
    kick();
    if (G.actions === 3) coach("zero");
    if (G.actions === 24) coach("press");
    checkWin();
  }

  function autoEmpty() {
    const { clues } = G.pic, B = G.B, st = G.st;
    let k = 0;
    for (let i = 0; i < G.N; i++) {
      if (clues[i] < 0 || G.cs[i] === 1) continue;
      let f = 0; for (const x of B[i]) if (st[x] === 1) f++;
      if (f === clues[i]) for (const x of B[i]) if (st[x] < 0) setCell(x, 0, null, 60 + 30 * k++);
    }
    if (k) clueStates(false);
  }

  function saveProg() {
    if (!G || G.done || G.over) return;
    let s = ""; for (let i = 0; i < G.N; i++) s += G.st[i] < 0 ? "?" : G.st[i];
    save.prog[G.pic.id] = { st: s, m: G.mistakes, h: G.hints, t: Math.round(G.elapsed) };
    persist();
  }

  function checkWin() {
    if (G.done || G.over) return;
    const { sol } = G.pic, st = G.st;
    if (G.zauber) {
      let f = 0; for (let i = 0; i < G.N; i++) if (st[i] === 1) f++;
      if (f < G.pic.nFill) return;
    } else {
      for (let i = 0; i < G.N; i++) if ((st[i] === 1) !== (sol[i] === 1)) return;
    }
    win();
  }

  /* ---------- Eingabe ---------- */
  const ptrs = new Map();
  let stroke = null, lpTimer = 0, twoTap = null;

  board.addEventListener("pointerdown", e => {
    AU.init();
    if (!G) return;
    e.preventDefault();
    if (G.over) return;
    if (G.done) { if (!G.reveal || now() - G.reveal.t0 > 2600) showCard(true); return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: now() });
    if (ptrs.size === 2) {
      clearTimeout(lpTimer);
      if (stroke && now() - stroke.t0 < 350 && !G.zauber) {
        revert(stroke.ch); stroke = null; twoTap = { t: now() }; afterChange();
      }
      return;
    }
    if (ptrs.size > 2) return;
    try { board.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    const onClue = G.pic.clues[i] >= 0;
    stroke = { id: e.pointerId, val: G.tool, action: !G.zauber && G.st[i] === G.tool ? "clear" : "set", last: i, start: i, ch: [], t0: now(), dead: false, pending: onClue };
    G.press = i;
    // Auf einer Zahl abwarten: langes Drücken soll nur vervollständigen, nie das Werkzeug anwenden
    if (onClue) { lpTimer = setTimeout(() => longPress(i), 430); kick(); }
    else { applyAt(i, stroke); afterChange(); }
  });
  board.addEventListener("pointermove", e => {
    if (!G || !stroke || e.pointerId !== stroke.id || stroke.dead || G.done) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === stroke.last) return;
    clearTimeout(lpTimer);
    if (stroke.pending) { stroke.pending = false; applyAt(stroke.start, stroke); if (stroke.dead) { afterChange(); return; } }
    const W = G.pic.W;
    let r0 = Math.floor(stroke.last / W), c0 = stroke.last % W;
    const r1 = Math.floor(i / W), c1 = i % W;
    const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
    for (let k = 1; k <= n && !stroke.dead; k++) {
      const r = Math.round(r0 + (r1 - r0) * k / n), c = Math.round(c0 + (c1 - c0) * k / n);
      applyAt(r * W + c, stroke);
    }
    stroke.last = i; G.press = i;
    afterChange();
  });
  const up = e => {
    ptrs.delete(e.pointerId);
    if (twoTap && ptrs.size === 0) { if (now() - twoTap.t < 450) undo(); twoTap = null; }
    if (stroke && e.pointerId === stroke.id) {
      clearTimeout(lpTimer);
      if (stroke.pending && G && !G.done && !G.over) { stroke.pending = false; applyAt(stroke.start, stroke); afterChange(); }
      if (stroke.ch.length && !G.zauber) { G.undo.push(stroke.ch); G.redo = []; }
      stroke = null;
      if (G) { G.press = -1; hud(); kick(); }
    }
  };
  board.addEventListener("pointerup", up);
  board.addEventListener("pointercancel", up);
  board.addEventListener("contextmenu", e => e.preventDefault());

  function longPress(i) {
    if (!G || G.done || G.over || !stroke || stroke.start !== i || stroke.last !== i || !stroke.pending) return;
    stroke.pending = false; // das Werkzeug wird für diesen Druck nicht mehr angewendet
    const r = SV.singleStep(G.B, G.pic.clues, G.st, i);
    if (!r || r.bad) { AU.tick(0.18); toast("Diese Zahl verrät gerade noch nichts Sicheres."); kick(); return; }
    let k = 0;
    for (const [x, v] of r) {
      if (G.zauber && G.pic.sol[x] !== v) continue;
      if (setCell(x, v, stroke, 45 * k)) {
        const d = 45 * k;
        if (v === 1) setTimeout(() => { AU.hit(); if (G) glowAt(x, G.pic.col[x]); }, d);
        else setTimeout(() => AU.empty(), d);
        k++;
      }
    }
    afterChange();
  }

  function revert(ch) { for (let k = ch.length - 1; k >= 0; k--) { const [i, from] = ch[k]; G.st[i] = from; G.anim[i] = { t: now(), k: "clear", from: -1 }; } }
  function undo() {
    if (!G || G.zauber || G.done || !G.undo.length) return;
    const ch = G.undo.pop(); revert(ch); G.redo.push(ch); AU.tick(0.15); afterChange();
  }

  $("#tFill").onclick = () => { AU.init(); AU.ui(); setTool(1); };
  $("#tMark").onclick = () => { AU.init(); AU.ui(); setTool(0); };
  $("#tUndo").onclick = () => { AU.init(); undo(); };
  $("#tHint").onclick = () => { AU.init(); hint(); };
  $("#gBack").onclick = () => { AU.ui(); leaveGame(); };
  window.addEventListener("keydown", e => {
    if (screen !== "game" || !G) return;
    if (e.key === "f" || e.key === "1") setTool(1);
    else if (e.key === "x" || e.key === "2") setTool(0);
    else if (e.key === " ") { e.preventDefault(); setTool(G.tool ? 0 : 1); }
    else if ((e.key === "z" && (e.metaKey || e.ctrlKey)) || e.key === "Backspace") undo();
    else if (e.key === "h") hint();
    else if (e.key === "Escape") leaveGame();
  });

  function leaveGame() {
    flush();
    if (G && !G.done) saveProg();
    persist(true);
    G = null; stroke = null;
    renderHome(); show("home");
  }

  /* ---------- Tipps ---------- */
  function hint() {
    if (!G || G.done) return;
    const { clues, sol } = G.pic, st = G.st;
    if (G.hint) {
      // Zweites Tippen: eintragen
      const h = G.hint; G.hint = null;
      const sk = { ch: [], val: 1 };
      if (h.wrong != null) setCell(h.wrong, sol[h.wrong], sk);
      else h.cells.forEach(([x, v], k) => { if (setCell(x, v, sk, 50 * k) && v === 1) setTimeout(() => { AU.hit(); if (G) glowAt(x, G.pic.col[x]); }, 50 * k); });
      if (sk.ch.length && !G.zauber) { G.undo.push(sk.ch); G.redo = []; }
      afterChange();
      return;
    }
    if (!G.zauber) {
      for (let i = 0; i < G.N; i++) if (st[i] >= 0 && st[i] !== sol[i]) {
        G.hint = { wrong: i, t: now() }; G.hints++; AU.hint();
        toast("Hier hat sich ein Fehler eingeschlichen. Tippe noch einmal auf die Glühbirne, um ihn zu beheben.", 5200);
        hud(); kick(); return;
      }
    }
    const h = SV.hint(G.pic.H, G.pic.W, clues, st, G.lastI);
    if (!h) { toast("Hier gibt es gerade nichts zu schließen."); return; }
    G.hints++; G.hint = Object.assign(h, { t: now() }); AU.hint();
    const B = G.B;
    if (h.kind === "single") {
      const i = h.clues[0], k = clues[i];
      let f = 0, u = 0; for (const x of B[i]) { if (st[x] === 1) f++; else if (st[x] < 0) u++; }
      let msg;
      if (k === 0) msg = "Eine <b>0</b>: Nichts in ihrem Block gehört zum Bild.";
      else if (f === k) msg = `Die <b>${k}</b> hat schon alle ${k} gefüllten Felder. Der Rest ihres Blocks bleibt leer.`;
      else if (k === B[i].length) msg = `Die <b>${k}</b> füllt ihren ganzen Block.`;
      else msg = `Die <b>${k}</b> braucht noch ${k - f} ${k - f === 1 ? "Feld" : "Felder"} und hat genau ${u} frei. Also alle füllen.`;
      toast(msg + "<br>Noch einmal tippen trägt es ein.", 6500);
    } else {
      const [a, b] = h.clues;
      toast(`Vergleiche die <b>${clues[a]}</b> und die <b>${clues[b]}</b>: Ihre Blöcke überlappen. Zusammen legen sie die markierten Felder fest.<br>Noch einmal tippen trägt es ein.`, 7500);
    }
    hud(); kick();
  }

  /* ---------- Hinweise beim ersten Bild ---------- */
  const coached = {};
  function coach(step) {
    if (!G || G.pic.idx !== 0 || save.solved[G.pic.id] || coached[step]) return;
    coached[step] = true;
    const msgs = {
      start: "Jede Zahl zählt die Bildfelder in ihrem <b>3×3-Block</b>. Sie selbst zählt mit.",
      zero: "Fang bei <b>0</b> und <b>9</b> an: Bei 0 bleibt der Block leer, bei 9 gehört alles zum Bild. Am Rand sind es weniger Felder.",
      press: "Halte eine Zahl <b>gedrückt</b>: Steht ihr Block schon fest, legt Mosaik ihn für dich.",
    };
    setTimeout(() => toast(msgs[step], 6500), step === "start" ? 700 : 0);
  }

  let toastT = 0;
  function toast(html, ms = 4200) {
    const t = $("#toast"); t.innerHTML = html; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), ms);
  }

  /* ---------- Zeichnen ---------- */
  function drawBoard(t) {
    const c = bctx, s = L.s, d = L.d, pic = G.pic, { W, H, clues, col, sol } = pic;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, L.cw, L.ch);
    const R = G.reveal, rt = R ? t - R.t0 : 0;
    // Tablett: Mörtelbett
    if (L.tray) c.drawImage(L.tray, 0, 0, L.cw, L.ch);
    if (R) { rr(c, 0, 0, L.cw, L.ch, s * 0.42); c.fillStyle = "rgba(6,4,10," + (0.35 * clamp(rt / 1500)) + ")"; c.fill(); }
    geom(R ? 1 - 0.7 * ease(clamp((rt - 900) / 1100)) : 1);
    let busy = !!R && rt < 4600;
    const S = s * Math.min(2, d), numA = R ? 1 - clamp(rt / 500) : 1;
    let LT = null;
    const put = (img, x, y, sc = 1, alpha = 1, sx = sc) => {
      if (alpha <= 0.002 || sx <= 0.01) return;
      c.globalAlpha = Math.min(1, alpha);
      const w = s * sx * LT.sc, h = s * sc * LT.sc;
      c.save(); c.translate(x + s / 2, y + s / 2); c.rotate(LT.rot);
      blit(c, img, -w / 2, -h / 2, w, h);
      c.restore();
      c.globalAlpha = 1;
    };
    const over = (x, y, vv, color, alpha, sc = 1, sx = sc) => {
      if (alpha <= 0.002) return;
      const w = s * sx, h = s * sc;
      c.save(); c.translate(x + (s - w) / 2, y + (s - h) / 2); c.scale(w, h);
      c.globalAlpha = Math.min(1, alpha); c.fillStyle = color; c.fill(UNIT[vv]); c.restore();
    };
    const filledLook = i => G.zauber ? sprite("gem", col[i], S, LT.gv) : sprite("marble", "", S, pic.vr[i]);
    const holeLook = i => sprite(clues[i] >= 0 ? "hole" : "holeDot", G.zauber ? col[i] : "", S, pic.vr[i]);
    for (let r = 0; r < H; r++) for (let q = 0; q < W; q++) {
      const i = r * W + q, x0 = L.xs[q], y = L.ys[r], vv = pic.vr[i];
      let v = G.st[i], dx = 0, red = 0, ap = -1, ak = "";
      LT = lay(i);
      const a = G.anim[i];
      if (a) {
        const dur = a.k === "wrong" ? 700 : a.k === "fill" ? 420 : a.k === "mark" ? 420 : 300;
        const p = (t - a.t) / dur;
        busy = true;
        if (p < 0) v = a.from;
        else if (p >= 1) G.anim[i] = null;
        else { ap = p; ak = a.k; }
        if (ak === "wrong") { dx = Math.sin(p * 18) * s * 0.06 * (1 - p); red = Math.sin(Math.min(1, p * 1.4) * Math.PI) * 0.8; }
      }
      const x = x0 + dx;
      if (R) {
        const p = clamp((rt - R.d[i]) / 560);
        if (sol[i]) {
          if (!G.zauber) put(sprite("marble", "", S, vv), x, y, 1, 1 - p);
          put(sprite("gem", col[i], S, LT.gv), x, y, 1, G.zauber ? 1 : p);
        } else {
          put(v === 0 ? holeLook(i) : sprite("slate", "", S, vv), x, y, 1, 1 - p);
          put(sprite("matte", col[i], S, vv), x, y, 0.6 + 0.4 * ease(p), p);
        }
      } else if (ak === "fill") {
        // Glasstein legt sich sanft an seinen Platz
        const e = ease(ap);
        put(sprite("slate", "", S, vv), x, y, 1, 1 - e);
        put(filledLook(i), x, y, 1.1 - 0.1 * e, Math.min(1, ap * 2.2));
      } else if (ak === "mark") {
        // Stein wird herausgehoben, darunter das Mörtelbett
        put(holeLook(i), x, y, 1);
        put(sprite("slate", "", S, vv), x, y - s * 0.12 * ease(ap), 1 + 0.1 * ease(ap), 1 - ease(ap));
      } else if (ak === "clear") {
        put(holeLook(i), x, y, 1);
        put(sprite("slate", "", S, vv), x, y, 0.8 + 0.2 * ease(ap), ease(ap));
      } else if (v < 0) put(sprite("slate", "", S, vv), x, y);
      else if (v === 1) put(filledLook(i), x, y);
      else put(holeLook(i), x, y);
      if (red > 0) over(x, y, vv, "#e0605a", red * 0.4);
      // Zahl
      const k = clues[i];
      if (k >= 0 && numA > 0) {
        let kind = v === 1 ? (G.zauber ? (lum(pic.rgbs[i]) > 0.62 ? "gemL" : "gem") : "marble") : v === 0 ? "hole" : "stone";
        let alpha = numA;
        const cs = G.cs[i];
        if (cs === 1) { const p = clamp((t - G.ct[i]) / 600); alpha *= 1 - 0.66 * p; if (p < 1) busy = true; }
        if (cs === 2) kind = "bad";
        c.globalAlpha = alpha;
        c.save(); c.translate(x + s / 2, y + s / 2); c.rotate(LT.rot); c.drawImage(numSprite(k, kind, S), -s / 2, -s / 2, s, s); c.restore();
        c.globalAlpha = 1;
      }
    }
    // Raumlicht über allem: weiches Oberlicht, Vignette zum Rand
    if (L.light) c.drawImage(L.light, 0, 0, L.cw, L.ch);
    // Block der gedrückten Zahl
    if (!R && G.press >= 0 && clues[G.press] >= 0) blockFrame(G.press, "rgba(255,255,255,.6)", 0.06);
    // Ring füllt sich, solange eine Zahl gehalten wird
    if (!R && stroke && stroke.pending) {
      const p = clamp((t - stroke.t0) / 430), q = stroke.start % W, r = Math.floor(stroke.start / W);
      if (p > 0.15) {
        c.beginPath(); c.arc(L.xs[q] + s / 2, L.ys[r] + s / 2, s * 0.62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ease((p - 0.15) / 0.85));
        c.lineWidth = Math.max(2, s * 0.06); c.lineCap = "round"; c.strokeStyle = "rgba(10,8,20,.55)"; c.stroke();
        c.lineWidth = Math.max(1.2, s * 0.035); c.strokeStyle = "rgba(235,238,255,.95)"; c.stroke();
      }
      busy = true;
    }
    // Tipp
    if (G.hint && !R) {
      busy = true;
      const pulse = 0.5 + 0.5 * Math.sin(t / 650);
      if (G.hint.wrong != null) cellFrame(G.hint.wrong, "rgba(255,160,170," + (0.5 + 0.5 * pulse) + ")", 0.09);
      else {
        G.hint.clues.forEach(i => blockFrame(i, "rgba(225,228,255," + (0.4 + 0.4 * pulse) + ")", 0.06));
        G.hint.cells.forEach(([x, v]) => { if (G.st[x] < 0) cellFrame(x, v ? "rgba(255,231,168," + (0.35 + 0.6 * pulse) + ")" : "rgba(255,255,255," + (0.25 + 0.5 * pulse) + ")", 0.08, !v); });
      }
    }
    // Lichtstreif über das fertige Bild
    if (R && rt > 1600 && rt < 4400) {
      const p = (rt - 1600) / 2800;
      const bw = L.cw * 0.35, x = -bw + (L.cw + bw * 2) * ease(p);
      c.save(); rr(c, L.xs[0], L.ys[0], L.xs[W - 1] + s - L.xs[0], L.ys[H - 1] + s - L.ys[0], s * 0.2); c.clip();
      c.globalCompositeOperation = "lighter";
      const g = c.createLinearGradient(x - bw, 0, x + bw, L.ch * 0.4);
      g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,248,230,.14)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, L.cw, L.ch); c.restore();
    }
    return busy;
  }
  /* Zahlen: in Schiefer graviert und platinweiß ausgelegt, ins Glas geätzt, in Marmor gemeißelt */
  const numCache = new Map();
  const NUM = { family: '"Poiret One", "Avenir Next", "Helvetica Neue", sans-serif', weight: 400, size: 0.64 };
  function numSprite(k, kind, S) {
    S = Math.max(8, Math.round(S));
    const key = k + kind + S;
    let cv = numCache.get(key);
    if (cv) return cv;
    if (numCache.size > 200) numCache.clear();
    cv = document.createElement("canvas"); cv.width = cv.height = S;
    const c = cv.getContext("2d"), d = String(k), cx = S / 2, cy = S * 0.535, e = Math.max(1, S * 0.022);
    c.font = NUM.weight + " " + Math.round(S * NUM.size) + "px " + NUM.family;
    c.textAlign = "center"; c.textBaseline = "middle";
    const gold = (a, b, m) => { const g = c.createLinearGradient(0, cy - S * 0.24, 0, cy + S * 0.24); g.addColorStop(0, a); g.addColorStop(0.5, m); g.addColorStop(1, b); return g; };
    if (kind === "stone") {
      c.fillStyle = "rgba(255,255,255,.55)"; c.fillText(d, cx, cy + e);        // Lichtkante unten im Schnitt
      c.fillStyle = "rgba(0,0,0,.28)"; c.fillText(d, cx, cy - e * 0.8);         // Schatten oben
      c.lineJoin = "round"; c.lineWidth = S * 0.012; c.strokeStyle = "rgba(14,12,22,.8)"; c.strokeText(d, cx, cy);
      c.fillStyle = gold("#2a2836", "#0c0a14", "#1a1824"); c.fillText(d, cx, cy);
    } else if (kind === "hole" || kind === "bad" || kind === "marble") {
      c.fillStyle = "rgba(0,0,0,.7)"; c.fillText(d, cx, cy - e);            // Schatten oben im Schnitt
      c.fillStyle = "rgba(255,255,255,.2)"; c.fillText(d, cx, cy + e);       // Lichtkante unten
      c.fillStyle = kind === "bad" ? gold("#ffd6d0", "#e0685c", "#ff9a8e") : gold("#ffffff", "#bfc3d4", "#eceef6");  // Platin
      c.fillText(d, cx, cy);
      if (kind === "hole") { c.globalCompositeOperation = "destination-in"; c.fillStyle = "rgba(0,0,0,.72)"; c.fillRect(0, 0, S, S); }
    } else if (kind === "gem") {
      c.lineJoin = "round"; c.lineWidth = S * 0.035; c.strokeStyle = "rgba(0,0,0,.28)"; c.strokeText(d, cx, cy + e * 0.6);
      c.fillStyle = "rgba(0,0,0,.38)"; c.fillText(d, cx, cy + e * 1.2);
      const g = c.createLinearGradient(0, cy - S * 0.24, 0, cy + S * 0.24); g.addColorStop(0, "rgba(255,255,255,.98)"); g.addColorStop(1, "rgba(255,255,255,.78)");
      c.fillStyle = g; c.fillText(d, cx, cy);
    } else if (kind === "gemL") {
      c.lineJoin = "round"; c.lineWidth = S * 0.03; c.strokeStyle = "rgba(255,255,255,.35)"; c.strokeText(d, cx, cy);
      c.fillStyle = "rgba(255,255,255,.55)"; c.fillText(d, cx, cy + e);
      c.fillStyle = "rgba(34,30,44,.85)"; c.fillText(d, cx, cy);
    }
    numCache.set(key, cv);
    return cv;
  }

  function blockFrame(i, color, w) {
    const W = G.pic.W, H = G.pic.H, q = i % W, r = Math.floor(i / W), s = L.s;
    const q0 = Math.max(0, q - 1), q1 = Math.min(W - 1, q + 1), r0 = Math.max(0, r - 1), r1 = Math.min(H - 1, r + 1);
    const pad = s * 0.12;
    rr(bctx, L.xs[q0] - pad, L.ys[r0] - pad, L.xs[q1] + s - L.xs[q0] + pad * 2, L.ys[r1] + s - L.ys[r0] + pad * 2, s * 0.3);
    bctx.strokeStyle = "rgba(10,8,20,.55)"; bctx.lineWidth = s * w + 3; bctx.stroke();
    bctx.strokeStyle = color; bctx.lineWidth = s * w; bctx.stroke();
  }
  function cellFrame(i, color, w, dashed) {
    const W = G.pic.W, q = i % W, r = Math.floor(i / W), s = L.s;
    rr(bctx, L.xs[q] + s * 0.08, L.ys[r] + s * 0.08, s * 0.84, s * 0.84, s * 0.18);
    bctx.setLineDash(dashed ? [s * 0.12, s * 0.1] : []);
    bctx.strokeStyle = color; bctx.lineWidth = s * w; bctx.stroke(); bctx.setLineDash([]);
  }

  /* ---------- Partikel ---------- */
  const fx = $("#fx"), fc = fx.getContext("2d");
  let parts = [], fxD = 1;
  let fxW = 0, fxH = 0;
  function fxSize() {
    fxD = Math.min(2, window.devicePixelRatio || 1);
    fxW = document.documentElement.clientWidth; fxH = document.documentElement.clientHeight;
    fx.width = Math.round(fxW * fxD); fx.height = Math.round(fxH * fxD);
    fx.style.width = fxW + "px"; fx.style.height = fxH + "px";
  }
  // sanfter Lichtschein in der Farbe des Steins
  function glowAt(i, color) {
    if (REDUCE || !G) return;
    const [x, y] = cellCenter(i);
    parts.push({ k: "glow", x, y, life: 0, max: 0.7, size: L.s * 0.9, color });
    kick();
  }
  function motes(pic) {
    if (REDUCE) return;
    const W = pic.W;
    for (let k = 0; k < 36; k++) {
      let i; do { i = Math.floor(Math.random() * pic.N); } while (!pic.sol[i] && Math.random() < 0.8);
      const [x, y] = cellCenter(i);
      parts.push({ k: "mote", x: x + (Math.random() - 0.5) * L.s, y, vx: (Math.random() - 0.5) * 18, vy: -(8 + Math.random() * 18), life: -Math.random() * 2, max: 3.5 + Math.random() * 2.5, size: 1.5 + Math.random() * 3.2, color: pic.col[i] });
    }
    kick();
  }
  let lastFx = 0;
  function drawFx(t) {
    const dt = Math.min(0.05, (t - (lastFx || t)) / 1000); lastFx = t;
    fc.setTransform(1, 0, 0, 1, 0, 0);
    fc.clearRect(0, 0, fx.width, fx.height);
    fc.setTransform(fxD, 0, 0, fxD, 0, 0);
    if (!parts.length) { lastFx = 0; return false; }
    parts = parts.filter(p => (p.life += dt) < p.max);
    for (const p of parts) {
      if (p.life < 0) continue;
      const q = p.life / p.max;
      if (p.k === "glow") {
        const a = Math.sin(Math.min(1, q * 1.6) * Math.PI) * 0.32;
        const r = p.size * (0.8 + 0.5 * ease(q));
        const g = fc.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, p.color); g.addColorStop(1, "rgba(0,0,0,0)");
        fc.globalAlpha = a; fc.fillStyle = g; fc.fillRect(p.x - r, p.y - r, r * 2, r * 2); fc.globalAlpha = 1;
      } else if (p.k === "shard") {
        p.vy += 900 * dt * 0.6; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        fc.save(); fc.translate(p.x, p.y); fc.rotate(p.rot); fc.globalAlpha = 1 - q;
        fc.fillStyle = p.color; fc.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        fc.fillStyle = "rgba(255,255,255,.5)"; fc.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.35);
        fc.restore();
      } else if (p.k === "ring") {
        fc.beginPath(); fc.arc(p.x, p.y, p.size * (1 + 1.4 * ease(q)), 0, 7);
        fc.strokeStyle = p.color; fc.globalAlpha = 0.8 * (1 - q); fc.lineWidth = 2.5 * (1 - q) + 0.5; fc.stroke(); fc.globalAlpha = 1;
      } else if (p.k === "mote") {
        p.x += p.vx * dt + Math.sin((t / 600) + p.size) * 0.3; p.y += p.vy * dt;
        const a = Math.sin(q * Math.PI);
        fc.globalCompositeOperation = "lighter";
        const g = fc.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        g.addColorStop(0, p.color); g.addColorStop(1, "rgba(0,0,0,0)");
        fc.globalAlpha = a * 0.45; fc.fillStyle = g; fc.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
        fc.globalAlpha = 1; fc.globalCompositeOperation = "source-over";
      }
    }
    return true;
  }

  /* ---------- Schleife ---------- */
  let raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  let lastBoard = 0, boardBusy = true;
  function loop(t) {
    raf = 0;
    let more = false;
    if (G && screen === "game") {
      if (!G.done && !document.hidden) { G.elapsed += Math.min(1, (t - G.tick) / 1000); }
      G.tick = t;
      lastBoard = t;
      boardBusy = drawBoard(t);
      more = boardBusy || more;
    }
    more = drawFx(t) || more;
    if (more) kick();
  }
  setInterval(() => { if (G && !G.done && screen === "game" && !document.hidden) { const t = now(); G.elapsed += (t - G.tick) / 1000; G.tick = t; } }, 1000);

  /* ---------- Gewonnen ---------- */
  function win() {
    const pic = G.pic, t = now();
    G.done = true; G.hint = null; stroke = null; clearTimeout(lpTimer);
    for (let i = 0; i < G.N; i++) if (G.st[i] < 0) G.st[i] = pic.sol[i];
    const W = pic.W, li = G.lastI >= 0 ? G.lastI : 0, lr = Math.floor(li / W), lq = li % W;
    const d = new Float32Array(G.N);
    for (let i = 0; i < G.N; i++) d[i] = Math.hypot(Math.floor(i / W) - lr, (i % W) - lq) * 42 + Math.random() * 60;
    G.reveal = { t0: t + 280, d };
    const stars = starsFor(G);
    const before = totalStars(), rkBefore = rankOf(before);
    const unlockedBefore = WORLDS.map((w, i) => unlocked(i));
    const old = save.solved[pic.id];
    const rec = { stars, time: Math.round(G.elapsed), m: G.mistakes, h: G.hints, date: new Date().toISOString().slice(0, 10) };
    if (!old || stars >= old.stars) save.solved[pic.id] = rec;
    delete save.prog[pic.id];
    persist(true);
    const after = totalStars(), rkAfter = rankOf(after);
    const newWorld = WORLDS.find((w, i) => unlocked(i) && !unlockedBefore[i]);
    G.result = { rec, rankUp: rkAfter > rkBefore ? RANKS[rkAfter][1] : null, newWorld };
    hud();
    const glow = $("#glow");
    glow.style.background = "radial-gradient(60% 50% at 50% 45%, " + pic.avg + ", transparent 70%)";
    setTimeout(() => { glow.style.opacity = 0.45; }, 600);
    setTimeout(() => AU.reveal(2.4), 280);
    setTimeout(() => { if (G && G.pic === pic) showCard(true); }, 3300);
    kick();
  }

  function gameOver() {
    if (!G || !G.over) return;
    const pic = G.pic;
    delete save.prog[pic.id]; persist(true);
    clearTimeout(lpTimer); stroke = null; G.hint = null;
    $("#game").classList.add("broken", "won");
    AU.broken();
    const box = $("#win");
    box.innerHTML = `<div class="card">
      <div class="kick">${pic.w.name} · Bild ${pic.pi + 1}</div>
      <h3>Das Mosaik ist zersprungen</h3>
      <p class="verse">Alle ${G.lives} Versuche sind aufgebraucht. Jedes Bild lässt sich ohne Raten lösen – wenn du festhängst, zeigt dir die Glühbirne den nächsten Schluss.</p>
      <div class="row" style="margin-top:18px">
        <button class="pill" id="oHome">Übersicht</button>
        <button class="pill primary" id="oAgain">Neu beginnen</button>
      </div></div>`;
    box.hidden = false;
    requestAnimationFrame(() => fitBoard(true)); setTimeout(() => { if (!$("#win").hidden) fitBoard(true); }, 950);
    $("#oHome").onclick = () => { AU.ui(); leaveGame(); };
    $("#oAgain").onclick = () => { AU.ui(); startGame(pic); };
    kick();
  }

  function showCard(on) {
    const box = $("#win");
    if (!on) { box.hidden = true; fitBoard(false); $("#game").classList.remove("won"); return; }
    if (!G || !G.result) return;
    const pic = G.pic, { rec, rankUp, newWorld } = G.result;
    const allDone = PICS.every(p => save.solved[p.id]);
    const nxt = nextPic(null);
    let extra = "";
    if (rankUp) extra += `<div class="rankup">Neuer Rang: <b>${rankUp}</b></div>`;
    if (newWorld) extra += `<div class="rankup">Eine neue Welt hat sich geöffnet: <b>${newWorld.name}</b></div>`;
    if (allDone) extra += `<div class="rankup">Alle ${PICS.length} Bilder gelegt. Deine Galerie ist vollständig.</div>`;
    box.innerHTML = `<div class="card">
      <div class="kick">${pic.w.name} · Bild ${pic.pi + 1}</div>
      <h3>${pic.title}</h3>
      <p class="verse">${pic.verse}</p>
      <div class="bigstars">${[0, 1, 2].map(k => `<i class="${k < rec.stars ? "" : "dim"}">★</i>`).join("")}</div>
      <div class="facts"><span>${fmtTime(rec.time)} min</span>${G.zauber ? `<span>${rec.m} ${rec.m === 1 ? "Fehler" : "Fehler"}</span>` : ""}<span>${rec.h} ${rec.h === 1 ? "Tipp" : "Tipps"}</span></div>
      ${extra}
      <div class="row">
        <button class="pill" id="wLook">Bild ansehen</button>
        <button class="pill" id="wHome">Übersicht</button>
        ${nxt ? '<button class="pill primary" id="wNext">Nächstes Bild</button>' : ""}
      </div></div>`;
    box.hidden = false;
    if (!G.cardShown) {
      G.cardShown = true;
      box.querySelectorAll(".bigstars i").forEach((el, k) => setTimeout(() => { el.classList.add("in"); if (k < rec.stars) AU.star(k); }, 450 + k * 260));
    } else box.querySelectorAll(".bigstars i").forEach(el => el.classList.add("in"));
    $("#game").classList.add("won");
    requestAnimationFrame(() => fitBoard(true)); setTimeout(() => { if (!$("#win").hidden) fitBoard(true); }, 950);
    $("#wLook").onclick = () => { AU.ui(); showCard(false); toast("Tippe auf das Bild, um die Karte wieder zu öffnen.", 2600); };
    $("#wHome").onclick = () => { AU.ui(); leaveGame(); };
    if (nxt) $("#wNext").onclick = () => { AU.ui(); startGame(nxt); };
  }

  // Fertiges Bild über die Karte schieben, damit nichts verdeckt wird.
  function fitBoard(on) {
    const sh = $("#boardShadow");
    board.style.transition = sh.style.transition = "transform .9s cubic-bezier(.2,.8,.2,1)";
    if (!on) { board.style.transform = sh.style.transform = ""; return; }
    const card = $("#win .card"); if (!card) return;
    // Endlagen aus dem Layout, nicht aus laufenden Animationen
    const wr = $("#boardWrap").getBoundingClientRect(), wb = $("#win").getBoundingClientRect();
    const bl = wr.left + parseFloat(board.style.left || 0), bt = wr.top + parseFloat(board.style.top || 0);
    const b = { left: bl, top: bt, width: L.cw, height: L.ch, right: bl + L.cw, bottom: bt + L.ch };
    const cr = { left: wb.left + card.offsetLeft, top: wb.top + card.offsetTop };
    const top = $(".gbar").getBoundingClientRect().bottom + 6;
    const side = cr.left > b.left + b.width * 0.5;
    const right = side ? cr.left - 18 : innerWidth - 16, left = 16;
    const bottom = side ? innerHeight - 16 : cr.top - 14;
    if (b.bottom <= bottom && b.right <= right) { board.style.transform = sh.style.transform = ""; return; }
    const k = Math.min(1, (bottom - top) / b.height, (right - left) / b.width);
    const dy = (top + bottom) / 2 - (b.top + b.height / 2), dx = side ? (left + right) / 2 - (b.left + b.width / 2) : 0;
    board.style.transform = sh.style.transform = "translate(" + dx + "px," + dy + "px) scale(" + k + ")";
  }


  /* ---------- Galerie ---------- */
  function renderGallery() {
    const body = $("#galBody"); body.innerHTML = "";
    let n = 0;
    WORLDS.forEach(w => {
      const sec = document.createElement("section"); sec.className = "gsec";
      sec.innerHTML = `<h3>${w.name}</h3><div class="ggrid"></div>`;
      const grid = sec.querySelector(".ggrid");
      w.list.forEach(p => {
        const rec = save.solved[p.id];
        const f = document.createElement("button");
        f.className = "frame" + (rec ? "" : " empty");
        if (rec) {
          n++;
          const cv = document.createElement("canvas"); f.appendChild(cv); drawMosaic(cv, p, 220);
          f.insertAdjacentHTML("beforeend", `<div class="cap">${p.title}</div>`);
          f.onclick = () => { AU.ui(); openView(p); };
        } else {
          f.innerHTML = `<div class="ph">?</div><div class="cap">Noch verborgen</div>`;
          f.disabled = true;
        }
        grid.appendChild(f);
      });
      body.appendChild(sec);
    });
    $("#galCount").textContent = n + " von " + PICS.length;
  }
  $("#btnGallery").onclick = () => { AU.init(); AU.ui(); renderGallery(); show("gallery"); };
  $("#galBack").onclick = () => { AU.ui(); renderHome(); show("home"); };

  /* ---------- Bögen ---------- */
  const sheet = $("#sheet");
  function openSheet(html) {
    sheet.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    sheet.hidden = false;
    sheet.onclick = e => { if (e.target === sheet) closeSheet(); };
    return sheet.firstElementChild;
  }
  function closeSheet() { sheet.hidden = true; sheet.innerHTML = ""; }

  function openView(p) {
    const rec = save.solved[p.id];
    const el = openSheet(`<div class="view"><canvas></canvas><h2>${p.title}</h2><p>${p.verse}</p>
      <p style="color:#fff">${"★".repeat(rec.stars)}<span style="color:var(--faint)"> · ${fmtTime(rec.time)} min · ${rec.date.split("-").reverse().join(".")}</span></p>
      <div class="acts" style="justify-content:center"><button class="pill" id="vAgain">Noch einmal legen</button><button class="pill primary" id="vClose">Schließen</button></div></div>`);
    drawMosaic(el.querySelector("canvas"), p, 440);
    $("#vClose").onclick = () => { AU.ui(); closeSheet(); };
    $("#vAgain").onclick = () => { AU.ui(); closeSheet(); delete save.prog[p.id]; startGame(p); };
  }

  function openHelp() {
    const el = openSheet(`<h2>So geht Mosaik</h2>
      <canvas class="demo" width="460" height="460"></canvas>
      <p>Hinter jedem Raster steckt ein Bild. Jede <b>Zahl</b> sagt, wie viele Felder in ihrem <b>3×3-Block</b> zum Bild gehören. Das Feld mit der Zahl zählt selbst mit.</p>
      <p>Mit <b>Füllen</b> legst du Bildsteine, mit <b>Leer</b> markierst du Felder, die frei bleiben. Du kannst mit dem Finger über mehrere Felder <b>ziehen</b>.</p>
      <p><b>Gedrückt halten</b> auf einer Zahl legt ihren Block automatisch, sobald er feststeht. Die <b>Glühbirne</b> zeigt dir den nächsten Schluss, ein zweites Tippen trägt ihn ein.</p>
      <p>Im Modus <b>Farbenzauber</b> leuchtet jeder richtige Stein sofort in seiner Farbe auf. Ein Fehler kostet einen Versuch (oben die kleinen Tropfen), sind alle aufgebraucht, beginnt das Bild von vorn. Fehler und Tipps kosten außerdem Sterne. Im Modus <b>Klassisch</b> liegen gesetzte Steine wie im Heft als schwarzer Onyx, die Farben erscheinen erst am Ende, und zwei Finger tippen macht den letzten Zug rückgängig.</p>
      <div class="acts"><button class="pill primary" id="hClose">Los geht's</button></div>`);
    demo(el.querySelector("canvas"));
    $("#hClose").onclick = () => { AU.init(); AU.ui(); closeSheet(); };
  }
  function demo(cv) {
    const c = cv.getContext("2d"), n = 5, s = cv.width / n, g = s * 0.08;
    const fill = [0, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1];
    const cols = ["#ff8a5c", "#ffd25e", "#e8414f", "#8e5bd1", "#3fb8af"];
    c.font = "500 " + Math.round(s * 0.42) + "px Lexend, sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < 25; i++) {
      const r = Math.floor(i / n), q = i % n, x = q * s + g / 2, y = r * s + g / 2, inB = r >= 0 && r <= 2 && q >= 0 && q <= 2;
      c.globalAlpha = inB ? 1 : 0.35;
      blit(c, sprite(fill[i] ? "glass" : "hole", fill[i] ? cols[i % 5] : "", s - g, i), x, y, s - g);
      c.globalAlpha = 1;
    }
    c.fillStyle = "#ffffff"; c.fillText("6", s * 1.5, s * 1.5);
    rr(c, 2, 2, s * 3 - 4, s * 3 - 4, s * 0.3); c.strokeStyle = "rgba(225,228,255,.9)"; c.lineWidth = 4; c.stroke();
  }
  $("#btnHelp").onclick = () => { AU.init(); AU.ui(); openHelp(); };

  function openSettings() {
    const s = save.set;
    const el = openSheet(`<h2>Einstellungen</h2>
      <div class="modes">
        <button class="mode ${s.mode === "zauber" ? "on" : ""}" data-m="zauber"><b>Farbenzauber</b><small>Richtige Steine leuchten sofort in ihrer Farbe auf.</small></button>
        <button class="mode ${s.mode === "klassisch" ? "on" : ""}" data-m="klassisch"><b>Klassisch</b><small>Wie in der Zeitschrift. Farben erst am Ende.</small></button>
      </div>
      <div class="opt"><div class="tx"><b>Klänge</b><small>Töne beim Legen und Enthüllen</small></div><button class="tog ${s.sound ? "on" : ""}" data-k="sound" aria-label="Klänge"></button></div>
      <div class="opt"><div class="tx"><b>Musik</b><small>Leise Klangtupfer im Hintergrund</small></div><button class="tog ${s.music ? "on" : ""}" data-k="music" aria-label="Musik"></button></div>
      <div class="opt"><div class="tx"><b>Leerfelder selbst setzen</b><small>Ist eine Zahl voll, markiert Mosaik den Rest ihres Blocks als leer (nur Farbenzauber).</small></div><button class="tog ${s.auto ? "on" : ""}" data-k="auto" aria-label="Leerfelder selbst setzen"></button></div>
      <div class="opt"><div class="tx"><b>Fortschritt löschen</b><small>Alle gelösten Bilder und Sterne zurücksetzen</small></div><button class="pill danger" id="sReset">Löschen</button></div>
      <div class="acts"><button class="pill primary" id="sClose">Fertig</button></div>`);
    el.querySelectorAll(".mode").forEach(b => b.onclick = () => {
      AU.init(); AU.ui(); s.mode = b.dataset.m; persist();
      el.querySelectorAll(".mode").forEach(x => x.classList.toggle("on", x === b));
    });
    el.querySelectorAll(".tog").forEach(b => b.onclick = () => {
      AU.init(); const k = b.dataset.k; s[k] = !s[k]; b.classList.toggle("on", s[k]); persist();
      if (k === "sound") AU.setSound(s[k]); if (k === "music") AU.setMusic(s[k]);
      AU.ui();
    });
    $("#sReset").onclick = () => {
      const row = $("#sReset").parentElement;
      row.innerHTML = `<div class="tx"><b>Wirklich alles löschen?</b><small>Das lässt sich nicht rückgängig machen.</small></div><button class="pill" id="sNo">Abbrechen</button><button class="pill danger" id="sYes">Ja, löschen</button>`;
      $("#sNo").onclick = () => { closeSheet(); openSettings(); };
      $("#sYes").onclick = () => { save.solved = {}; save.prog = {}; save.last = null; persist(true); closeSheet(); renderHome(); };
    };
    $("#sClose").onclick = () => { AU.ui(); closeSheet(); };
  }
  $("#btnSettings").onclick = () => { AU.init(); AU.ui(); openSettings(); };

  /* ---------- Bildschirm wach halten ---------- */
  let wake = null;
  function requestWake() { try { navigator.wakeLock && navigator.wakeLock.request("screen").then(w => { wake = w; }).catch(() => {}); } catch (e) { /* nicht verfügbar */ } }
  function releaseWake() { try { wake && wake.release(); } catch (e) { /* egal */ } wake = null; }

  /* ---------- Start ---------- */
  let relayT = 0;
  const relayout = () => { cancelAnimationFrame(relayT); relayT = requestAnimationFrame(() => { fxSize(); if (G && screen === "game") layout(); }); };
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", () => { relayout(); setTimeout(relayout, 300); setTimeout(relayout, 900); });
  if (window.visualViewport) visualViewport.addEventListener("resize", relayout);
  if (window.ResizeObserver) new ResizeObserver(relayout).observe($("#boardWrap"));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { AU.stopMusic(); if (G) saveProg(); persist(true); }
    else { if (AU.ctx && save.set.music) AU.startMusic(); if (G) { G.tick = now(); if (screen === "game") requestWake(); } }
  });
  window.addEventListener("pagehide", () => { if (G) saveProg(); persist(true); });
  document.addEventListener("pointerdown", () => AU.init(), { once: true });
  fxSize();
  (function toolIcons() {
    const n = 52, mk = (style, col) => { const cv = document.createElement("canvas"); cv.width = cv.height = n; blit(cv.getContext("2d"), sprite(style, col, 34, 2), 9, 9, 34); return cv.toDataURL(); };
    try {
      document.documentElement.style.setProperty("--gem-icon", "url(" + mk("glass", "#2fb39a") + ")");
      document.documentElement.style.setProperty("--hole-icon", "url(" + mk("holeDot", "") + ")");
    } catch (e) { /* Symbole sind Zierde */ }
  })();
  renderHome();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { numCache.clear(); kick(); });
  try { document.fonts && document.fonts.load('400 40px "Poiret One"').then(() => { numCache.clear(); kick(); }); } catch (e) { /* ohne Webschrift */ }
  window.__mosaik = { numFont(f, w, z) { NUM.family = f; NUM.weight = w; NUM.size = z || 0.6; numCache.clear(); kick(); }, PICS, save, drawMosaic, get G() { return G; }, startGame, win: () => G && win() };
})();
