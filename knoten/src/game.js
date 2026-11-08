"use strict";
(() => {

/* =====================================================================
   Werkzeuge
   ===================================================================== */
const $ = (s) => document.querySelector(s);
const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const eOut = (t) => 1 - Math.pow(1 - t, 3);
const eInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eIn = (t) => t * t * t;
const eBack = (t) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const now = () => performance.now();
const range = (n) => Array.from({ length: n }, (_, i) => i);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };

/* ---------- Geometrie ---------- */
const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function segCross(a, b, c, d) {
  const d1 = orient(c, d, a), d2 = orient(c, d, b);
  if ((d1 > 0 && d2 > 0) || (d1 < 0 && d2 < 0) || d1 === 0 || d2 === 0) return false;
  const d3 = orient(a, b, c), d4 = orient(a, b, d);
  return (d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0);
}
function distPtSeg2(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
  const L = vx * vx + vy * vy;
  const t = clamp(L ? (wx * vx + wy * vy) / L : 0, 0, 1);
  const dx = a.x + vx * t - p.x, dy = a.y + vy * t - p.y;
  return dx * dx + dy * dy;
}
function intersect(a, b, c, d) {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), t };
}
function toward(a, b, d) {
  const L = dist(a, b); if (L < 1e-9) return { x: a.x, y: a.y };
  return { x: a.x + ((b.x - a.x) / L) * d, y: a.y + ((b.y - a.y) / L) * d };
}

/* =====================================================================
   Kapitel – gedeckte Farben
   ===================================================================== */
const CHAPTERS = [
  { name: "Leinen",    bg: ["#2b2621", "#121010"], cords: ["#c7905b", "#8fa07a", "#c97d68", "#d8c49c", "#9c8bb0", "#6f9aa3"] },
  { name: "Salbei",    bg: ["#1f2823", "#0b0f0d"], cords: ["#8fb08f", "#c9b77a", "#6f9a95", "#d1cdb0", "#a9846b", "#7f8fb5"] },
  { name: "Bernstein", bg: ["#2c2218", "#110c08"], cords: ["#d9963f", "#e6c07a", "#b0603a", "#8fa58b", "#c9a6a0", "#7b93a8"] },
  { name: "Tiefsee",   bg: ["#15222b", "#070b0f"], cords: ["#5fa3a8", "#9ebac1", "#6f84b0", "#c9b48a", "#82b59c", "#c88f84"] },
  { name: "Pflaume",   bg: ["#261b29", "#0e0a10"], cords: ["#b07aa4", "#d1a0a0", "#a69cc2", "#d9b6af", "#8fa5a0", "#c9a66b"] },
  { name: "Kupfer",    bg: ["#281c16", "#0f0a08"], cords: ["#c7784a", "#6fa898", "#d1a46b", "#9cc0b0", "#b98a8a", "#8c9bb8"] },
  { name: "Nacht",     bg: ["#181b2a", "#07070d"], cords: ["#8a90c8", "#c0c4d8", "#9c86c4", "#7fa2c4", "#d1b98a", "#b58aa5"] },
  { name: "Granat",    bg: ["#281618", "#0e0809"], cords: ["#c4566a", "#d69a8f", "#a8794f", "#e2cbb4", "#8f9f86", "#9a7fb0"] },
];
const ROMAN = ["", " II", " III", " IV", " V", " VI", " VII", " VIII", " IX", " X"];
const chapterIdx = (lvl) => Math.floor((lvl - 1) / 10);
const chapterOf = (lvl) => CHAPTERS[chapterIdx(lvl) % CHAPTERS.length];
const chapterName = (lvl) => chapterOf(lvl).name + (ROMAN[Math.floor(chapterIdx(lvl) / CHAPTERS.length)] || "");
const GOLD_HI = hex("#f6e4bb");
const ASH = hex("#7d766d");

/* =====================================================================
   Speicher
   ===================================================================== */
const STORE = "knoten:v6";
let save = { unlocked: 1, solved: {}, cur: null, sound: true, vib: true, tips: {} };
try {
  const s = JSON.parse(localStorage.getItem(STORE) || "null");
  if (s) save = Object.assign(save, s);
  else {
    const old = JSON.parse(localStorage.getItem("knoten:v5") || localStorage.getItem("knoten:v4") || "null");
    if (old) { save.sound = old.sound !== false; save.vib = old.vib !== false; }
  }
} catch (e) {}
let saveTimer = 0;
function persist(soon) {
  clearTimeout(saveTimer);
  const go = () => { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) {} };
  if (soon) saveTimer = setTimeout(go, 250); else go();
}

/* =====================================================================
   Klang – gezupfte Saiten mit Hall
   ===================================================================== */
const Sound = {
  ctx: null, out: null, rev: null, last: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    this.out = c.createGain(); this.out.gain.value = 0.9; this.out.connect(comp); comp.connect(c.destination);
    const len = Math.floor(c.sampleRate * 3), buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4); }
    const conv = c.createConvolver(); conv.buffer = buf;
    this.rev = c.createGain(); this.rev.gain.value = 0.4; this.rev.connect(conv); conv.connect(this.out);
    const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
  },
  tone(f, o = {}) {
    if (!save.sound || !this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + (o.t || 0), dur = o.dur || 1.8, vol = o.vol || 0.16, br = o.bright || 2600;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.att || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const fl = c.createBiquadFilter(); fl.type = "lowpass";
    fl.frequency.setValueAtTime(br, t0); fl.frequency.exponentialRampToValueAtTime(Math.max(180, br * 0.22), t0 + dur);
    const parts = [[1, "triangle", 1], [2.003, "sine", 0.32], [3.01, "sine", 0.1], [4.2, "sine", o.bell ? 0.06 : 0]];
    for (const [mm, type, a] of parts) {
      if (!a) continue;
      const os = c.createOscillator(); os.type = type; os.frequency.value = f * mm;
      const og = c.createGain(); og.gain.value = a; os.connect(og); og.connect(fl);
      os.start(t0); os.stop(t0 + dur + 0.05);
    }
    fl.connect(g); g.connect(this.out);
    const send = c.createGain(); send.gain.value = o.rev ?? 0.6; g.connect(send); send.connect(this.rev);
  },
  pad(freqs, t, dur, vol) {
    if (!save.sound || !this.ctx) return;
    const c = this.ctx, t0 = c.currentTime + t;
    for (const f of freqs) for (const det of [-4, 4]) {
      const os = c.createOscillator(); os.type = "sine"; os.frequency.value = f; os.detune.value = det;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      os.connect(g); g.connect(this.out);
      const s = c.createGain(); s.gain.value = 0.8; g.connect(s); s.connect(this.rev);
      os.start(t0); os.stop(t0 + dur + 0.1);
    }
  },
  SCALE: [146.83, 164.81, 185, 220, 246.94, 293.66, 329.63, 369.99, 440, 493.88, 587.33, 659.25, 739.99, 880],
  noteFor(len) { return this.SCALE[clamp(Math.round(((4.2 - len) / 3.4) * (this.SCALE.length - 1)), 0, this.SCALE.length - 1)]; },
  pluck(len, t, vol) { this.tone(this.noteFor(len) * 2, { t: t || 0, dur: 2.2, vol: vol || 0.11, bright: 3800, bell: true, att: 0.003 }); },
  pick() { this.tone(220, { dur: 0.2, vol: 0.05, bright: 1100, rev: 0.25 }); },
  seat() { this.tone(392, { dur: 0.25, vol: 0.05, bright: 1600, rev: 0.3 }); this.tone(196, { dur: 0.3, vol: 0.04, bright: 700, rev: 0.2 }); },
  back() { this.tone(196, { dur: 0.3, vol: 0.035, bright: 800, rev: 0.2 }); },
  snag() { const t = now(); if (t - this.last < 160) return; this.last = t; this.tone(123.47, { dur: 0.5, vol: 0.05, bright: 500, rev: 0.25 }); },
  tick() { this.tone(1567.98, { dur: 0.08, vol: 0.03, bright: 4000, rev: 0.1 }); },
  win() { this.pad([146.83, 220, 293.66, 369.99], 0.05, 4.5, 0.022); },
  star(i) { this.tone([1174.66, 1318.5, 1760][i], { dur: 1.8, vol: 0.06, bright: 6000, bell: true, rev: 0.9 }); },
  lose() {
    this.tone(220, { dur: 2.4, vol: 0.07, bright: 900, rev: 0.8 });
    this.tone(174.61, { t: 0.18, dur: 2.6, vol: 0.06, bright: 800, rev: 0.8 });
    this.tone(146.83, { t: 0.36, dur: 3, vol: 0.06, bright: 700, rev: 0.8 });
  },
};

/* ---------- Haptik (Android: vibrate, iOS 18+: Schalter-Trick) ---------- */
function haptic(ms) {
  if (!save.vib) return;
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} return; }
  try {
    const l = document.createElement("label"); l.ariaHidden = "true"; l.style.display = "none";
    const i = document.createElement("input"); i.type = "checkbox"; i.setAttribute("switch", "");
    l.appendChild(i); document.head.appendChild(l); l.click(); document.head.removeChild(l);
  } catch (e) {}
}

/* =====================================================================
   Grafik-Vorlagen
   ===================================================================== */
const canvas = $("#c"), ctx = canvas.getContext("2d");
let W = 0, H = 0, DPR = 1;
const safe = { t: 0, r: 0, b: 0, l: 0 };
const T = { x: 0, y: 0, w: 1, h: 1 };
const cam = { s: 1, ox: 0, oy: 0, tw: null };
let SP = 60, RW = 9, HOLE = 13, PEG = 9, LAND = false, BX = 0, BY = 0;
let sprites = {};

function makeGlow(inner, outer) {
  const s = 64, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d"), gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, outer); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return cv;
}
function makeHole(r) {
  const size = Math.ceil(r * 2 + 8), cv = document.createElement("canvas");
  cv.width = cv.height = Math.ceil(size * DPR);
  const g = cv.getContext("2d"); g.scale(DPR, DPR);
  const c = size / 2;
  g.beginPath(); g.arc(c, c + 1, r + 1.5, 0, TAU); g.fillStyle = "rgba(0,0,0,0.35)"; g.fill();
  const ring = g.createLinearGradient(c - r, c - r, c + r, c + r);
  ring.addColorStop(0, "#f1dcaa"); ring.addColorStop(0.45, "#b8955a"); ring.addColorStop(1, "#5e4726");
  g.beginPath(); g.arc(c, c, r, 0, TAU); g.fillStyle = ring; g.fill();
  const inner = g.createRadialGradient(c, c - r * 0.25, 0, c, c, r * 0.66);
  inner.addColorStop(0, "#050404"); inner.addColorStop(0.75, "#0d0b09"); inner.addColorStop(1, "#2a2117");
  g.beginPath(); g.arc(c, c, r * 0.64, 0, TAU); g.fillStyle = inner; g.fill();
  g.beginPath(); g.arc(c, c, r * 0.64, Math.PI * 1.05, Math.PI * 1.75); g.lineWidth = 1; g.strokeStyle = "rgba(0,0,0,0.6)"; g.stroke();
  g.beginPath(); g.arc(c, c, r - 0.6, Math.PI * 1.1, Math.PI * 1.6); g.lineWidth = 1; g.strokeStyle = "rgba(255,245,220,0.55)"; g.stroke();
  return { cv, size };
}
function makeGrain() {
  const s = 180, cv = document.createElement("canvas"); cv.width = cv.height = s;
  const g = cv.getContext("2d"), img = g.createImageData(s, s);
  for (let i = 0; i < s * s; i++) { const v = 110 + Math.random() * 40; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 40; }
  g.putImageData(img, 0, 0);
  return cv.toDataURL();
}
$("#grain").style.backgroundImage = `url(${makeGrain()})`;
function buildSprites() {
  sprites = {
    hole: makeHole(HOLE),
    glow: makeGlow("rgba(255,244,214,1)", "rgba(232,196,128,0.5)"),
    coral: makeGlow("rgba(232,137,106,0.9)", "rgba(224,138,109,0.35)"),
  };
}

/* =====================================================================
   Layout
   ===================================================================== */
function readSafe() {
  const p = document.createElement("div");
  p.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  safe.t = parseFloat(cs.paddingTop) || 0; safe.r = parseFloat(cs.paddingRight) || 0;
  safe.b = parseFloat(cs.paddingBottom) || 0; safe.l = parseFloat(cs.paddingLeft) || 0;
  p.remove();
}
function layoutBoard() {
  const d = state.def; if (!d) return;
  LAND = T.w > T.h * 1.05;
  const dc = LAND ? d.rows : d.cols, dr = LAND ? d.cols : d.rows;
  SP = Math.min(T.w / dc, T.h / dr, Math.min(W, H) >= 600 ? 130 : 96);
  BX = (T.w - SP * (dc - 1)) / 2; BY = (T.h - SP * (dr - 1)) / 2;
  RW = clamp(SP * 0.13, 7, 15); HOLE = RW * 1.45; PEG = RW * 1.02;
  buildSprites();
}
function g2w(gx, gy) {
  const d = state.def;
  const x = LAND ? gy : gx, y = LAND ? d.cols - 1 - gx : gy;
  return { x: BX + x * SP, y: BY + y * SP };
}
function w2g(wx, wy) {
  const d = state.def, x = (wx - BX) / SP, y = (wy - BY) / SP;
  return LAND ? { x: d.cols - 1 - y, y: x } : { x, y };
}
const toScreen = (x, y) => ({ x: cam.ox + x * cam.s, y: cam.oy + y * cam.s });
const toWorld = (x, y) => ({ x: (x - cam.ox) / cam.s, y: (y - cam.oy) / cam.s });
const g2s = (p) => { const w = g2w(p.x, p.y); return toScreen(w.x, w.y); };
function camTo(s, ox, oy, dur) {
  if (!dur) { cam.s = s; cam.ox = ox; cam.oy = oy; cam.tw = null; return; }
  cam.tw = { f: { s: cam.s, ox: cam.ox, oy: cam.oy }, t: { s, ox, oy }, t0: now(), dur };
  wake();
}
function resetCam(anim) { camTo(1, T.x, T.y, anim ? 520 : 0); }
function resize() {
  readSafe();
  W = window.innerWidth; H = window.innerHeight; DPR = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  T.x = safe.l + 18; T.w = Math.max(100, W - safe.l - safe.r - 36);
  T.y = safe.t + 112; T.h = Math.max(100, H - T.y - safe.b - 64);
  layoutBoard();
  if (state.phase !== "play") frameBoard(false); else resetCam(false);
  wake();
}

/* =====================================================================
   Level (vorab mit der Seilphysik geknüpft und geprüft – siehe tools/)
   ===================================================================== */
const LEVELS = window.KNOTEN_LEVELS || [];
const LEVEL_COUNT = LEVELS.length;
const defCache = new Map();
function levelDef(level) {
  if (defCache.has(level)) return defCache.get(level);
  const L = LEVELS[level - 1];
  if (!L) return null;
  const cells = L.c * L.h, r = L.k.split("|")[0].split(";").length;
  const pal = chapterOf(level).cords, rng = mulberry32(level * 7919 + 3);
  const def = {
    cols: L.c, rows: L.h, cells, r, time: L.t, moves: L.m, k: L.k,
    P: range(cells).map((h) => ({ x: h % L.c, y: Math.floor(h / L.c) })),
    colors: cordColors(pal, r, rng),
  };
  defCache.set(level, def);
  return def;
}
// Kapitelfarben zuerst, dann weitere gedeckte Töne, die sich deutlich davon abheben
const EXTRA = ["#c7905b", "#7f8fb5", "#c4566a", "#8fb08f", "#d8c49c", "#9c86c4", "#5fa3a8", "#d9963f", "#b07aa4", "#a8794f", "#9cc0b0", "#c88f84"];
function cordColors(pal, r, rng) {
  const out = shuffle(pal.slice(), rng);
  const far = (c) => out.every((o) => { const a = hex(c), b = hex(o); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 60; });
  for (const c of shuffle(EXTRA.slice(), rng)) if (out.length < r && far(c)) out.push(c);
  for (const c of EXTRA) if (out.length < r) out.push(c);
  return shuffle(out.slice(0, r), rng);
}
const starsFor = (left, total) => (left >= total * 0.5 ? 3 : left >= total * 0.25 ? 2 : 1);

/* =====================================================================
   Spielzustand
   ===================================================================== */
const state = {
  level: 1, def: null, world: null, look: [], cross: [],
  phase: "play", moves: 0, timeLeft: 60, started: false, paused: false,
  undo: [], flashes: [], particles: [], rings: [], hint: null,
  tangled: new Set(), freeAt: new Map(), activeUntil: 0, zeroSince: 0,
  win: null, lost: null, outro: null, lastTick: 0, lowSec: -1, lastSave: 0,
};
let drag = null; // { pid, r, e, dx, dy, x, y, target, from, snap }
const N = Rope.N;

function wakePhysics(ms) { state.activeUntil = Math.max(state.activeUntil, now() + (ms || 600)); wake(); }
function ropeLen(r) { const x = state.world.ropes[r].x, i = (N - 1) * 3; return Math.hypot(x[i] - x[0], x[i + 1] - x[1]); }
// Kordel anzupfen: Schwung quer zur Kordel – die Physik lässt sie schwingen
function pluck(r, strength, silent) {
  const R = state.world.ropes[r], x = R.x, p = R.p, i = (N - 1) * 3;
  let nx = -(x[i + 1] - x[1]), ny = x[i] - x[0];
  const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
  const amp = 0.035 * strength;
  for (let k = 1; k < N - 1; k++) {
    const s = Math.sin((Math.PI * k) / (N - 1)) * amp;
    p[k * 3] -= nx * s; p[k * 3 + 1] -= ny * s; p[k * 3 + 2] -= s * 0.6;
  }
  state.look[r].glowT = now();
  if (!silent) Sound.pluck(ropeLen(r), 0, 0.06 + 0.06 * strength);
  wakePhysics(1500);
}

function loadLevel(level, opts = {}) {
  if (level > LEVEL_COUNT) level = LEVEL_COUNT;
  state.level = level;
  const d = (state.def = levelDef(level));
  layoutBoard();
  const ends = d.k.split("|")[0].split(";").map((s) => s.split(",").map(Number));
  const w = (state.world = Rope.createWorld(d.cols, d.rows, ends));
  const cur = save.cur;
  if (!opts.fresh && cur && cur.level === level && cur.k) {
    try { Rope.unpack(w, cur.k); } catch (e) { Rope.unpack(w, d.k); }
    state.moves = cur.m || 0; state.timeLeft = cur.left ?? d.time; state.started = !!cur.started;
  } else {
    Rope.unpack(w, d.k);
    state.moves = 0; state.timeLeft = d.time; state.started = false;
  }
  const t = now();
  state.look = d.colors.map((hx, i) => {
    const col = hex(hx), c = lum(col) < 110 ? mix(col, [255, 248, 236], 0.25) : col;
    return { col: c, dark: mix(c, [10, 8, 6], 0.55), light: mix(c, [255, 252, 245], 0.45), intro: t + 120 + i * Math.min(60, 700 / d.r), alpha: 0, glowT: 0 };
  });
  state.phase = "play"; state.win = null; state.lost = null; state.undo = []; state.flashes = []; state.rings = [];
  state.particles = []; state.hint = null; state.outro = null; drag = null; state.lowSec = -1;
  state.cross = Rope.crossings(w); state.tangled = tangledOf(state.cross); state.freeAt = new Map(); state.zeroSince = 0;
  wakePhysics(800);
  saveCur();
  resetCam(false);
  setChapterBg(level, opts.instantBg);
  $("#tChap").textContent = chapterName(level);
  $("#tLevel").textContent = "Level " + level;
  $("#card").classList.remove("show");
  updateHud(); updateTimer(); updateUndo();
  showTipFor(level);
  wake();
}
function tangledOf(cross) { const s = new Set(); for (const c of cross) { s.add(c.a); s.add(c.b); } return s; }

let bgFront = "A";
function bgCss(ch) { return `radial-gradient(ellipse 120% 90% at 50% 38%, ${ch.bg[0]} 0%, ${ch.bg[1]} 78%)`; }
function setChapterBg(level, instant) {
  const css = bgCss(chapterOf(level));
  const front = $("#bg" + bgFront), back = $("#bg" + (bgFront === "A" ? "B" : "A"));
  if (front.dataset.css === css) return;
  if (instant || !front.dataset.css) { front.style.background = css; front.dataset.css = css; front.style.opacity = 1; back.style.opacity = 0; }
  else { back.style.background = css; back.dataset.css = css; back.style.opacity = 1; front.style.opacity = 0; bgFront = bgFront === "A" ? "B" : "A"; }
  document.querySelector('meta[name="theme-color"]').content = chapterOf(level).bg[1];
}

/* ---------- Anzeige ---------- */
let pillTimer = 0, pillMsg = null, lastCount = -1;
function updateHud() {
  const c = state.cross.length, pill = $("#pill");
  $("#bHint").disabled = state.phase !== "play";
  if (state.phase !== "play") { pill.classList.add("hide"); return; }
  pill.classList.remove("hide");
  if (pillMsg) { pill.textContent = pillMsg; pill.className = "info"; return; }
  if (c === lastCount && pill.dataset.drag === String(!!drag)) return;
  lastCount = c; pill.dataset.drag = String(!!drag);
  pill.className = c === 0 ? "zero" : "";
  pill.textContent = c === 0 ? (drag ? "Frei – jetzt loslassen" : "Frei") : c === 1 ? "1 Kreuzung" : c + " Kreuzungen";
}
function updateTimer() {
  const d = state.def, f = clamp(state.timeLeft / d.time, 0, 1);
  $("#tFill").style.transform = `scaleX(${f})`;
  const low = state.timeLeft <= 10 && state.started && state.phase === "play";
  $("#tBar").classList.toggle("low", low);
  const marks = $("#tBar").querySelectorAll("b");
  marks[0].classList.toggle("off", f < 0.25); marks[1].classList.toggle("off", f < 0.5);
  const tt = $("#tTxt"), txt = fmtTime(state.timeLeft);
  if (tt.textContent !== txt) tt.textContent = txt;
  tt.classList.toggle("low", low);
}
function flashPill(msg, ms) {
  pillMsg = msg; lastCount = -1; updateHud();
  clearTimeout(flashPill.t); flashPill.t = setTimeout(() => { pillMsg = null; lastCount = -1; updateHud(); }, ms || 1800);
}
function bumpPill() {
  const p = $("#pill"); p.classList.add("bump"); clearTimeout(pillTimer);
  pillTimer = setTimeout(() => p.classList.remove("bump"), 160);
}
function updateUndo() { $("#bUndo").disabled = !state.undo.length || state.phase !== "play"; }

const TIPS = {
  1: "Ziehe ein Kordelende in eine freie Öse. Die Kordeln sind wirklich verknotet – sie verfangen sich ineinander.",
  2: "Schau, wie die Kordeln umeinander laufen, und führe ein Ende den Weg zurück, den es gekommen ist.",
  4: "Die Uhr läuft ab dem ersten Griff. Die Rauten zeigen, wie viele Sterne noch drin sind.",
  7: "Die Glühbirne zeigt eine Kordel, die obenauf liegt – sie kostet aber zehn Sekunden.",
};
let tipTimer = 0;
function showTipFor(level) {
  const tip = $("#tip"); clearTimeout(tipTimer); tip.classList.remove("show");
  const text = TIPS[level];
  if (!text || save.tips[level]) return;
  tip.textContent = text;
  tipTimer = setTimeout(() => tip.classList.add("show"), 1100);
}
function tipDone() {
  if (!TIPS[state.level] || save.tips[state.level]) return;
  save.tips[state.level] = 1; persist(true);
  clearTimeout(tipTimer); tipTimer = setTimeout(() => $("#tip").classList.remove("show"), 1800);
}
function saveCur() {
  if (state.phase !== "play" || !state.world) return;
  save.cur = { level: state.level, k: Rope.pack(state.world), m: state.moves, left: Math.round(state.timeLeft * 10) / 10, started: state.started };
  persist(true);
}

/* =====================================================================
   Eingabe – Kordelende greifen, angehoben in eine freie Öse ziehen
   ===================================================================== */
const HIT = () => Math.max(26, SP * 0.42);
function endGrid(r, e) { const x = state.world.ropes[r].x, j = (e ? N - 1 : 0) * 3; return { x: x[j], y: x[j + 1], z: x[j + 2] }; }
function ropeOrder() {
  const w = state.world;
  const z = w.ropes.map((R) => { let s = 0; for (let i = 0; i < N; i++) s += R.x[i * 3 + 2]; return s / N; });
  return range(w.ropes.length).sort((a, b) => z[a] - z[b]);
}
function hitEnd(x, y) {
  let best = null, bd = HIT() ** 2;
  const order = ropeOrder();
  for (let k = order.length - 1; k >= 0; k--) {
    const r = order[k];
    for (let e = 0; e < 2; e++) {
      const s = g2s(endGrid(r, e)), d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d < bd - 1) { bd = d; best = { r, e, s }; }
    }
  }
  return best;
}
function freeHoleNear(gx, gy, own) {
  const occ = new Set(); state.world.ropes.forEach((R) => { occ.add(R.e[0]); occ.add(R.e[1]); });
  let best = -1, bd = 0.45 * 0.45;
  for (let h = 0; h < state.def.cells; h++) {
    if (occ.has(h) && h !== own) continue;
    const p = state.def.P[h], d = (p.x - gx) ** 2 + (p.y - gy) ** 2;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}
const canAct = () => state.phase === "play" && !state.outro && !state.paused;
function startClock() { if (!state.started) { state.started = true; state.lastTick = now(); } }
function fingerGrid() { const w = toWorld(drag.x + drag.dx, drag.y + drag.dy); return w2g(w.x, w.y); }

canvas.addEventListener("pointerdown", (e) => {
  Sound.init();
  if (!canAct() || drag) return;
  const x = e.clientX, y = e.clientY, hit = hitEnd(x, y);
  if (!hit) return;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
  for (const L of state.look) L.intro = 0;
  const R = state.world.ropes[hit.r];
  drag = { pid: e.pointerId, r: hit.r, e: hit.e, x, y, dx: hit.s.x - x, dy: hit.s.y - y, target: -1, from: R.e[hit.e], snap: Rope.snapshot(state.world) };
  const g = fingerGrid();
  state.world.drag = { r: hit.r, e: hit.e, x: g.x, y: g.y };
  state.hint = null;
  startClock();
  Sound.pick(); haptic(6);
  wakePhysics(); updateHud();
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag || drag.pid !== e.pointerId) return;
  drag.x = e.clientX; drag.y = e.clientY;
  const g = fingerGrid(), prev = drag.target;
  state.world.drag.x = clamp(g.x, -0.8, state.def.cols - 0.2); state.world.drag.y = clamp(g.y, -0.8, state.def.rows - 0.2);
  drag.target = freeHoleNear(g.x, g.y, drag.from);
  if (drag.target !== prev && drag.target >= 0 && drag.target !== drag.from) haptic(3);
  wakePhysics();
});
function endPointer(e) {
  if (!drag || drag.pid !== e.pointerId) return;
  const d = drag, R = state.world.ropes[d.r];
  drag = null; state.world.drag = null;
  const moved = e.type !== "pointercancel" && d.target >= 0 && d.target !== d.from;
  if (moved) {
    R.e[d.e] = d.target;
    state.undo.push(d.snap); if (state.undo.length > 60) state.undo.shift();
    state.moves++;
    Sound.seat(); haptic(10);
    tipDone();
  } else Sound.back();
  state.zeroSince = 0;
  wakePhysics(1200); updateUndo(); updateHud();
  setTimeout(saveCur, 900);
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());

function undo() {
  if (!canAct() || drag || !state.undo.length) return;
  Rope.restore(state.world, state.undo.pop());
  state.cross = Rope.crossings(state.world); state.tangled = tangledOf(state.cross); state.freeAt.clear();
  wakePhysics(800); updateUndo(); updateHud(); saveCur();
  Sound.tone(392, { dur: 0.5, vol: 0.05, bright: 1500 }); haptic(5);
}
// Tipp: die Kordel, die am meisten obenauf liegt
function hint() {
  if (!canAct() || drag || !state.cross.length) return;
  Sound.init();
  const score = new Array(state.def.r).fill(0), has = new Array(state.def.r).fill(0);
  for (const c of state.cross) {
    const bottom = c.top === c.a ? c.b : c.a;
    score[c.top] += 1; score[bottom] -= 1.2; has[c.a] = has[c.b] = 1;
  }
  let best = -1; score.forEach((s, r) => { if (has[r] && (best < 0 || s > score[best])) best = r; });
  if (best < 0) return;
  state.hint = { r: best, t0: now() };
  startClock();
  state.timeLeft = Math.max(1, state.timeLeft - 10);
  updateTimer(); saveCur();
  flashPill("Tipp · diese Kordel liegt obenauf");
  Sound.tone(659.25, { dur: 1.2, vol: 0.06, bright: 2600, bell: true });
  const b = $("#bHint"); b.classList.remove("hint-on"); void b.offsetWidth; b.classList.add("hint-on");
  wake();
}
function restart() { if (state.outro) return; closeMenu(); nextLevel(state.level); }

/* =====================================================================
   Gelöst!  /  Zeit abgelaufen
   ===================================================================== */
const TITLES = ["Entwirrt", "Gelöst", "Wie gestimmt", "Fein gelöst", "Gelungen", "Wunderbar", "Frei"];
function solve() {
  if (state.phase !== "play" || state.cross.length || drag) return;
  state.phase = "won";
  const d = state.def, w = state.world;
  const midX = (r) => { const x = w.ropes[r].x; return x[0] + x[(N - 1) * 3]; };
  const order = range(d.r).sort((a, b) => midX(a) - midX(b));
  const STEP = clamp(1400 / d.r, 90, 160);
  const delay = new Array(d.r).fill(0);
  order.forEach((r, k) => (delay[r] = 250 + k * STEP));
  state.win = { t0: now(), delay, STEP, done: new Uint8Array(d.r), ringDone: false };
  const used = d.time - state.timeLeft, stars = starsFor(state.timeLeft, d.time);
  const prev = save.solved[state.level];
  const better = !prev || stars > prev.st || (stars === prev.st && used < prev.t);
  save.solved[state.level] = better ? { ends: w.ropes.map((R) => R.e.slice()), st: stars, t: Math.round(used), m: state.moves } : prev;
  save.unlocked = Math.min(LEVEL_COUNT, Math.max(save.unlocked, state.level + 1));
  save.cur = null;
  persist();
  Sound.win();
  haptic([12, 60, 18]);
  updateHud(); updateUndo(); updateTimer();
  $("#tip").classList.remove("show");
  const card = $("#card");
  card.classList.remove("lost"); card.dataset.mode = "won";
  $("#cCap").textContent = `Level ${state.level} · ${chapterName(state.level)}`;
  $("#cTitle").textContent = stars === 3 ? (state.level === 1 ? "Entwirrt" : TITLES[(state.level * 5) % TITLES.length]) : stars === 2 ? "Gelöst" : "Gerade noch";
  $("#cTime").textContent = fmtTime(used);
  $("#cMoves").textContent = state.moves;
  $("#cRopes").textContent = d.r;
  let note = stars === 3 ? "" : stars === 2 ? "Drei Sterne gibt es, wenn noch die halbe Zeit übrig ist." : "Mehr Sterne gibt es fürs schnellere Lösen.";
  if (prev && better && prev.st) note = "Neue Bestzeit.";
  if (state.level % 10 === 0) note = `Kapitel ${chapterName(state.level)} vollendet` + (state.level < LEVEL_COUNT ? ` – als Nächstes: ${chapterName(state.level + 1)}.` : ".");
  if (state.level === LEVEL_COUNT) note = `Alle ${LEVEL_COUNT} Knoten gelöst. Wunderbar.`;
  $("#cNote").textContent = note;
  $("#cAlt").textContent = "Nochmal"; $("#cMain").textContent = state.level < LEVEL_COUNT ? "Weiter" : "Galerie";
  const starEls = [...$("#cStars").children];
  starEls.forEach((s) => s.classList.remove("in", "on"));
  const showAt = 250 + d.r * STEP + 600;
  setTimeout(() => frameBoard(true), Math.max(200, showAt - 900));
  setTimeout(() => {
    if (state.phase !== "won") return;
    card.classList.add("show");
    starEls.forEach((s, k) => setTimeout(() => {
      s.classList.add("in");
      if (k < stars) { s.classList.add("on"); Sound.star(k); haptic(6); }
    }, 450 + k * 260));
  }, showAt);
  wakePhysics(showAt + 2000);
}
function lose() {
  if (state.phase !== "play") return;
  if (drag) { drag = null; state.world.drag = null; }
  state.phase = "lost";
  state.lost = { t0: now() };
  state.timeLeft = 0;
  save.cur = null; persist();
  Sound.lose(); haptic([30, 80, 30]);
  updateHud(); updateUndo(); updateTimer();
  $("#tip").classList.remove("show");
  const card = $("#card");
  card.classList.add("lost"); card.dataset.mode = "lost";
  $("#cCap").textContent = `Level ${state.level} · ${chapterName(state.level)}`;
  $("#cTitle").textContent = "Zeit um";
  $("#cTime").textContent = fmtTime(state.def.time);
  $("#cMoves").textContent = state.moves;
  $("#cRopes").textContent = state.def.r;
  const c = state.cross.length;
  $("#cNote").textContent = `${c === 1 ? "Eine Kreuzung blieb" : c + " Kreuzungen blieben"}. Beim nächsten Versuch liegt der Knoten wieder genauso.`;
  $("#cAlt").textContent = "Level"; $("#cMain").textContent = "Nochmal";
  setTimeout(() => { if (state.phase === "lost") { card.classList.add("show"); frameBoard(true); } }, 900);
  wakePhysics(1500);
}
function frameBoard(anim) {
  if (!state.def) return;
  const ch = $("#card").offsetHeight || 260;
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of state.def.P) { const w = g2w(p.x, p.y); minx = Math.min(minx, w.x); maxx = Math.max(maxx, w.x); miny = Math.min(miny, w.y); maxy = Math.max(maxy, w.y); }
  const m = HOLE + 12;
  minx -= m; miny -= m; maxx += m; maxy += m;
  const top = safe.t + 104, bottom = H - safe.b - ch - 22, left = safe.l + 14, right = W - safe.r - 14;
  const aw = right - left, ah = Math.max(80, bottom - top);
  const s = Math.min(aw / (maxx - minx), ah / (maxy - miny), 1);
  const ox = (left + right) / 2 - ((minx + maxx) / 2) * s, oy = top + ah / 2 - ((miny + maxy) / 2) * s;
  camTo(s, ox, oy, anim ? 1000 : 0);
}
function nextLevel(level) {
  if (state.outro) return;
  if (level > LEVEL_COUNT) { openMenu(); return; }
  $("#card").classList.remove("show");
  state.outro = { t0: now(), dur: 480, then: () => loadLevel(level, { fresh: true }) };
  Sound.tone(440, { dur: 0.8, vol: 0.04, bright: 1800 });
  wake();
}

/* =====================================================================
   Animation & Zeichnen
   ===================================================================== */
let raf = 0, lastFrame = 0, frameNo = 0;
function wake() { if (!raf) { lastFrame = now(); raf = requestAnimationFrame(frame); } }
function frame() {
  raf = 0;
  const t = now(), dt = Math.min(0.05, (t - lastFrame) / 1000); lastFrame = t;
  const busy = update(t, dt);
  draw(t);
  if (busy) raf = requestAnimationFrame(frame);
}

function update(t, dt) {
  let busy = !!drag;
  frameNo++;
  // Uhr
  if (state.phase === "play" && state.started && !state.paused && !document.hidden && !state.outro) {
    state.timeLeft -= Math.min(0.25, (t - (state.lastTick || t)) / 1000);
    const sec = Math.ceil(state.timeLeft);
    if (sec <= 10 && sec !== state.lowSec && sec > 0) { state.lowSec = sec; Sound.tick(); }
    updateTimer();
    if (t - state.lastSave > 3000 && !drag) { state.lastSave = t; saveCur(); }
    if (state.timeLeft <= 0) lose();
    busy = true;
  }
  state.lastTick = t;
  if (cam.tw) {
    const k = clamp((t - cam.tw.t0) / cam.tw.dur, 0, 1), e = eInOut(k);
    cam.s = lerp(cam.tw.f.s, cam.tw.t.s, e); cam.ox = lerp(cam.tw.f.ox, cam.tw.t.ox, e); cam.oy = lerp(cam.tw.f.oy, cam.tw.t.oy, e);
    if (k >= 1) cam.tw = null; busy = true;
  }
  // Physik, solange sich etwas bewegt
  if (state.world && (drag || t < state.activeUntil)) {
    Rope.step(state.world, dt || 1 / 60);
    if (Rope.motion(state.world) > 4e-4) state.activeUntil = Math.max(state.activeUntil, t + 250);
    if (frameNo % 2 === 0 || !drag) {
      state.cross = Rope.crossings(state.world);
      const tg = tangledOf(state.cross);
      if (state.phase === "play") {
        for (const r of state.tangled) if (!tg.has(r) && !state.freeAt.has(r)) state.freeAt.set(r, t);
        for (const r of tg) state.freeAt.delete(r);
        for (const [r, t0] of state.freeAt) if (t - t0 > 220 && !(drag && drag.r === r)) {   // wirklich frei geworden
          state.freeAt.delete(r); state.tangled.delete(r);
          pluck(r, 1); state.flashes.push({ r, t0: t }); bumpPill(); haptic(8);
        }
        for (const r of tg) state.tangled.add(r);
      }
      updateHud();
    }
    busy = true;
  }
  // gelöst? – erst wenn nichts mehr kreuzt und die Kordeln zur Ruhe kommen
  if (state.phase === "play" && !drag && state.world) {
    if (state.cross.length === 0) {
      if (!state.zeroSince) state.zeroSince = t;
      if (t - state.zeroSince > 450) solve();
      busy = true;
    } else state.zeroSince = 0;
  }
  for (const L of state.look) {
    L.alpha = L.intro ? clamp((t - L.intro) / 450, 0, 1) : 1;
    if (L.alpha < 1) busy = true;
  }
  state.flashes = state.flashes.filter((f) => t - f.t0 < 800);
  state.rings = state.rings.filter((r) => t - r.t0 < r.dur);
  for (const p of state.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 6 * dt; p.vx *= 1 - dt * 0.6; }
  state.particles = state.particles.filter((p) => t - p.t0 < p.life);
  if (state.flashes.length || state.rings.length || state.particles.length) busy = true;
  if (state.cross.length && state.phase === "play") busy = true;
  if (state.hint && t - state.hint.t0 > 3200) state.hint = null;
  if (state.hint) busy = true;
  if (state.lost && t - state.lost.t0 < 1500) busy = true;
  if (state.win) {
    const w = state.win, el = t - w.t0;
    if (!w.ringDone) {
      w.ringDone = true;
      const c = g2s({ x: (state.def.cols - 1) / 2, y: (state.def.rows - 1) / 2 });
      state.rings.push({ x: c.x, y: c.y, t0: t, dur: 1700, r: Math.max(W, H) * 0.75 });
    }
    for (let r = 0; r < state.def.r; r++) {
      if (w.done[r] || el < w.delay[r]) continue;
      w.done[r] = 1;
      pluck(r, 1.4);
      for (let e = 0; e < 2; e++) {
        const s = g2s(endGrid(r, e));
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * TAU, v = 12 + Math.random() * 36;
          state.particles.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 24, t0: t, life: 1300 + Math.random() * 1400, size: 5 + Math.random() * 9 });
        }
      }
      haptic(4);
    }
    if (el < 6000) busy = true;
  }
  if (state.outro) {
    busy = true;
    if (t - state.outro.t0 >= state.outro.dur) { const f = state.outro.then; state.outro = null; f(); }
  }
  return busy;
}

/* ---------- Kordeln zeichnen ---------- */
function ropePts(r) {
  const x = state.world.ropes[r].x, pts = new Array(N);
  for (let i = 0; i < N; i++) { const s = g2s({ x: x[i * 3], y: x[i * 3 + 1] }); s.z = x[i * 3 + 2]; pts[i] = s; }
  return pts;
}
function tracePts(pts, ox, oy, zk) {
  const X = (p) => p.x + (ox || 0) + (zk ? p.z * zk : 0), Y = (p) => p.y + (oy || 0) + (zk ? p.z * zk * 1.6 : 0);
  ctx.beginPath();
  ctx.moveTo(X(pts[0]), Y(pts[0]));
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    ctx.quadraticCurveTo(X(a), Y(a), (X(a) + X(b)) / 2, (Y(a) + Y(b)) / 2);
  }
  ctx.lineTo(X(pts[pts.length - 1]), Y(pts[pts.length - 1]));
}
function glowAt(spr, x, y, size, alpha) { ctx.globalAlpha = alpha; ctx.drawImage(spr, x - size / 2, y - size / 2, size, size); }
function drawPeg(x, y, L, s, a, goldK) {
  const r = PEG * s;
  ctx.globalAlpha = a;
  ctx.beginPath(); ctx.arc(x + 0.8, y + 2, r + 1, 0, TAU); ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fill();
  const body = goldK ? mix(L.col, GOLD_HI, goldK * 0.35) : L.col;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, rgba(mix(body, [255, 255, 255], 0.55), 1)); g.addColorStop(0.55, rgba(body, 1)); g.addColorStop(1, rgba(L.dark, 1));
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.18);
  ctx.strokeStyle = goldK ? rgba(mix([200, 166, 104], GOLD_HI, goldK), 1) : "rgba(200,166,104,0.9)";
  ctx.beginPath(); ctx.arc(x, y, r * 0.92, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.38, r * 0.3, r * 0.17, -0.6, 0, TAU); ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.fill();
}
function drawRope(r, pts, t, base, lostK, w, shadow) {
  const L = state.look[r], s = cam.s;
  const a = base * L.alpha * (1 - lostK * 0.4);
  if (a <= 0) return;
  const goldK = w && w.done[r] ? eOut(clamp((t - w.t0 - w.delay[r]) / 500, 0, 1)) : 0;
  const col = mix(mix(L.col, ASH, lostK * 0.55), GOLD_HI, goldK * 0.25);
  const rw = RW * s * (L.alpha < 1 ? 0.6 + 0.4 * L.alpha : 1);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  if (shadow) {
    ctx.globalAlpha = a * 0.42; tracePts(pts, 1.2 * s, 2.5 * s, SP * s * 0.12);
    ctx.lineWidth = rw + 2; ctx.strokeStyle = "#000"; ctx.stroke();
  }
  ctx.globalAlpha = a; tracePts(pts);
  ctx.lineWidth = rw + 1.8; ctx.strokeStyle = rgba(L.dark, 1); ctx.stroke();
  ctx.lineWidth = rw; ctx.strokeStyle = rgba(col, 1); ctx.stroke();
  ctx.setLineDash([rw * 0.55, rw * 0.75]);
  ctx.globalAlpha = a * 0.22; ctx.lineWidth = rw * 0.62; ctx.strokeStyle = rgba(L.light, 1); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = a * 0.5; tracePts(pts, -rw * 0.16, -rw * 0.2); ctx.lineWidth = rw * 0.22; ctx.strokeStyle = rgba(L.light, 1); ctx.stroke();
  const gk = goldK > 0 && goldK < 1 ? 1 - goldK : 0, pk = L.glowT ? clamp(1 - (t - L.glowT) / 900, 0, 1) : 0;
  if (gk || pk) {
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a * Math.max(gk * 0.6, pk * 0.35);
    tracePts(pts); ctx.lineWidth = rw + 6; ctx.strokeStyle = rgba(GOLD_HI, 1); ctx.stroke(); ctx.restore();
  }
  for (let e = 0; e < 2; e++) {
    const p = e ? pts[N - 1] : pts[0], lift = 1 + p.z * 0.45;
    if (drag && drag.r === r && drag.e === e) glowAt(sprites.glow, p.x, p.y, PEG * 7 * s, a * 0.25);
    drawPeg(p.x, p.y, L, s * lift * (L.alpha < 1 ? eBack(L.alpha) : 1), a, goldK);
  }
}
function glowRope(pts, alpha) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
  tracePts(pts); ctx.lineCap = "round"; ctx.lineWidth = RW * cam.s + 7; ctx.strokeStyle = rgba(GOLD_HI, 1); ctx.stroke();
  ctx.restore();
}

function draw(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const d = state.def, world = state.world; if (!d || !world) return;
  ctx.save();
  if (state.outro) {
    const k = eIn(clamp((t - state.outro.t0) / state.outro.dur, 0, 1));
    ctx.globalAlpha = 1 - k;
    ctx.translate(W / 2, H / 2); ctx.scale(1 - 0.06 * k, 1 - 0.06 * k); ctx.translate(-W / 2, -H / 2);
  }
  const base = ctx.globalAlpha;
  const w = state.win, el = w ? t - w.t0 : 0;
  const lostK = state.lost ? eOut(clamp((t - state.lost.t0) / 1200, 0, 1)) : 0;
  const s = cam.s;

  /* --- Brett --- */
  {
    const a = toScreen(BX - SP * 0.55, BY - SP * 0.55);
    const dc = LAND ? d.rows : d.cols, dr = LAND ? d.cols : d.rows;
    const bw = (SP * (dc - 1) + SP * 1.1) * s, bh = (SP * (dr - 1) + SP * 1.1) * s, rad = 22 * s;
    ctx.globalAlpha = base;
    const g = ctx.createLinearGradient(0, a.y, 0, a.y + bh);
    g.addColorStop(0, "rgba(255,248,235,0.05)"); g.addColorStop(1, "rgba(255,248,235,0.018)");
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(a.x, a.y, bw, bh, rad); else ctx.rect(a.x, a.y, bw, bh);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = "rgba(236,228,212,0.09)"; ctx.stroke();
  }
  /* --- Ösen --- */
  const hs = sprites.hole.size * s;
  for (let h = 0; h < d.cells; h++) {
    const p = g2s(d.P[h]);
    ctx.globalAlpha = base;
    ctx.drawImage(sprites.hole.cv, p.x - hs / 2, p.y - hs / 2, hs, hs);
    if (drag && drag.target === h && h !== drag.from) {
      glowAt(sprites.glow, p.x, p.y, HOLE * 6 * s, base * 0.45);
      ctx.globalAlpha = base * 0.9; ctx.strokeStyle = rgba(GOLD_HI, 1); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, HOLE * 1.35 * s, 0, TAU); ctx.stroke();
    }
    if (w) {
      const k = (el - 200 - (p.x / W) * 900) / 900;
      if (k > 0 && k < 1) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glowAt(sprites.glow, p.x, p.y, HOLE * 4 * s, base * Math.sin(Math.PI * k) * 0.6); ctx.restore(); }
    }
  }
  /* --- Kordeln: nach Höhe, dann jede Überkreuzung richtig herum --- */
  const order = ropeOrder(), idx = {}, P = [];
  order.forEach((r, i) => (idx[r] = i));
  for (let r = 0; r < d.r; r++) P[r] = ropePts(r);
  for (const r of order) drawRope(r, P[r], t, base, lostK, w, true);
  const crossR = RW * 2.2 * s;
  for (const c of state.cross) {
    const bottom = c.top === c.a ? c.b : c.a;
    if (idx[c.top] > idx[bottom]) continue;
    const X = g2s(c);
    ctx.save(); ctx.beginPath(); ctx.arc(X.x, X.y, crossR, 0, TAU); ctx.clip();
    drawRope(c.top, P[c.top], t, base, lostK, w, false);
    ctx.restore();
  }
  /* --- Kreuzungen markieren --- */
  if (!w && !drag) {
    const pulse = 0.8 + 0.2 * Math.sin(t * 0.005), fade = 1 - lostK * 0.5;
    for (const c of state.cross) {
      const X = g2s(c);
      glowAt(sprites.coral, X.x, X.y, RW * 2.2 * s, base * 0.35 * pulse * fade);
      ctx.globalAlpha = base * 0.85 * fade;
      ctx.beginPath(); ctx.arc(X.x, X.y, RW * 0.21 * s * (0.9 + 0.2 * pulse), 0, TAU);
      ctx.fillStyle = "#e8896a"; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(40,14,8,0.7)"; ctx.stroke();
    }
  }
  /* --- Tipp --- */
  if (state.hint) {
    const hn = state.hint, el2 = t - hn.t0, a = base * clamp(el2 / 250, 0, 1) * clamp((3200 - el2) / 400, 0, 1);
    glowRope(P[hn.r], a * (0.3 + 0.15 * Math.sin(el2 * 0.01)));
    ctx.strokeStyle = rgba(GOLD_HI, 1);
    for (let e = 0; e < 2; e++) {
      const from = e ? P[hn.r][N - 1] : P[hn.r][0];
      for (let k = 0; k < 2; k++) {
        const p = ((el2 + k * 600) % 1200) / 1200;
        ctx.globalAlpha = a * (1 - p); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(from.x, from.y, PEG * s * (1.4 + p * 1.6), 0, TAU); ctx.stroke();
      }
    }
  }
  /* --- Effekte --- */
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (const f of state.flashes) {
    const k = clamp((t - f.t0) / 750, 0, 1), pts = P[f.r];
    ctx.globalAlpha = base * (1 - k) * 0.45; tracePts(pts); ctx.lineWidth = RW * s + 6 * (1 - k); ctx.strokeStyle = rgba(GOLD_HI, 1); ctx.stroke();
    const i1 = Math.round((N - 1) * (0.5 - 0.5 * eOut(k))), i2 = Math.round((N - 1) * (0.5 + 0.5 * eOut(k)));
    glowAt(sprites.glow, pts[i1].x, pts[i1].y, 30, base * (1 - k)); glowAt(sprites.glow, pts[i2].x, pts[i2].y, 30, base * (1 - k));
  }
  if (w) {
    for (let r = 0; r < d.r; r++) {
      const k = (el - w.delay[r]) / 650;
      if (k <= 0 || k >= 1) continue;
      const p = P[r][Math.round((N - 1) * eOut(k))];
      glowAt(sprites.glow, p.x, p.y, 34, base * Math.sin(Math.PI * k));
    }
  }
  for (const r of state.rings) {
    const k = eOut(clamp((t - r.t0) / r.dur, 0, 1));
    ctx.globalAlpha = base * (1 - k) * 0.4; ctx.strokeStyle = rgba(GOLD_HI, 1); ctx.lineWidth = 1.5 + (1 - k) * 3;
    ctx.beginPath(); ctx.arc(r.x, r.y, 8 + k * r.r, 0, TAU); ctx.stroke();
  }
  for (const p of state.particles) {
    const k = (t - p.t0) / p.life, fl = 0.75 + 0.25 * Math.sin(t * 0.012 + p.size * 7);
    glowAt(sprites.glow, p.x, p.y, p.size * (1 - k * 0.4), base * Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.9 * fl);
  }
  ctx.restore();
  ctx.restore();
}

/* =====================================================================
   Galerie / Levelauswahl
   ===================================================================== */
function renderThumb(cv, level) {
  const d = levelDef(level), sv = save.solved[level];
  const px = 128; cv.width = cv.height = px;
  const c = cv.getContext("2d");
  const sp = Math.min((px - 28) / (d.cols - 1), (px - 28) / (d.rows - 1));
  const ox = (px - sp * (d.cols - 1)) / 2, oy = (px - sp * (d.rows - 1)) / 2;
  const P = d.P.map((p) => ({ x: ox + p.x * sp, y: oy + p.y * sp }));
  c.fillStyle = chapterOf(level).bg[1]; c.fillRect(0, 0, px, px);
  for (const p of P) { c.beginPath(); c.arc(p.x, p.y, 2.6, 0, TAU); c.fillStyle = "rgba(200,166,104,0.55)"; c.fill(); }
  c.lineCap = "round";
  sv.ends.forEach(([a, b], i) => {
    const col = d.colors[i];
    c.beginPath(); c.moveTo(P[a].x, P[a].y); c.lineTo(P[b].x, P[b].y);
    c.lineWidth = 6; c.strokeStyle = "rgba(0,0,0,0.6)"; c.stroke();
    c.lineWidth = 4; c.strokeStyle = col; c.stroke();
    for (const h of [a, b]) { c.beginPath(); c.arc(P[h].x, P[h].y, 3.6, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 1; c.strokeStyle = "#d8b878"; c.stroke(); }
  });
}
function openMenu() {
  Sound.init();
  state.paused = true;
  const box = $("#chapters"); box.innerHTML = "";
  const maxLvl = Math.min(LEVEL_COUNT, Math.max(save.unlocked, state.level));
  const chapters = Math.min(Math.ceil(LEVEL_COUNT / 10), chapterIdx(maxLvl) + 1);
  const pending = [];
  let total = 0; for (const k in save.solved) total += save.solved[k].st || 0;
  $("#mTotal").textContent = total ? `${total} ◆` : "";
  for (let c = 0; c < chapters; c++) {
    const first = c * 10 + 1;
    const stars = range(10).map((k) => save.solved[first + k]?.st || 0).reduce((a, b) => a + b, 0);
    const sec = document.createElement("section"); sec.className = "chap";
    sec.innerHTML = `<h3><b>${chapterName(first)}</b><span>${first}–${first + 9}</span><em>${stars}/30 ◆</em></h3><div class="grid"></div>`;
    const grid = sec.querySelector(".grid");
    for (let k = 0; k < 10; k++) {
      const lvl = first + k, b = document.createElement("button");
      if (lvl > LEVEL_COUNT) break;
      const sv = save.solved[lvl], open = lvl <= save.unlocked;
      b.className = "tile" + (sv ? " solved" : "") + (lvl === state.level ? " cur" : "") + (!open ? " locked" : "");
      b.innerHTML = `<span class="n">${lvl}</span>` + (sv ? `<span class="st">${[0, 1, 2].map((j) => `<i class="${j < sv.st ? "on" : ""}"></i>`).join("")}</span>` : "");
      if (sv) { const cv = document.createElement("canvas"); b.prepend(cv); pending.push([cv, lvl]); }
      if (open) b.addEventListener("click", () => { closeMenu(); if (lvl !== state.level || state.phase !== "play") nextLevel(lvl); });
      grid.appendChild(b);
    }
    box.prepend(sec);
  }
  $("#oSound").classList.toggle("on", !!save.sound);
  $("#oVib").classList.toggle("on", !!save.vib);
  $("#menu").classList.add("open");
  $("#menu").scrollTop = 0;
  let i = 0;
  const step = () => { const end = Math.min(pending.length, i + 4); for (; i < end; i++) renderThumb(pending[i][0], pending[i][1]); if (i < pending.length) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function closeMenu() { $("#menu").classList.remove("open"); state.paused = false; state.lastTick = now(); wake(); }

/* ---------- Knöpfe ---------- */
$("#bMenu").addEventListener("click", openMenu);
$("#mClose").addEventListener("click", closeMenu);
$("#menu").addEventListener("click", (e) => { if (e.target.id === "menu") closeMenu(); });
$("#bUndo").addEventListener("click", undo);
$("#bHint").addEventListener("click", hint);
$("#oRestart").addEventListener("click", restart);
$("#cMain").addEventListener("click", () => { if ($("#card").dataset.mode === "lost") nextLevel(state.level); else nextLevel(state.level + 1); });
$("#cAlt").addEventListener("click", () => { if ($("#card").dataset.mode === "lost") openMenu(); else nextLevel(state.level); });
$("#oSound").addEventListener("click", (e) => { save.sound = !save.sound; e.currentTarget.classList.toggle("on", save.sound); persist(); if (save.sound) { Sound.init(); Sound.tone(587.33, { dur: 1, vol: 0.08, bell: true }); } });
$("#oVib").addEventListener("click", (e) => { save.vib = !save.vib; e.currentTarget.classList.toggle("on", save.vib); persist(); haptic(10); });
document.addEventListener("keydown", (e) => {
  if ((e.key === "z" && (e.metaKey || e.ctrlKey)) || e.key === "Backspace") { e.preventDefault(); undo(); }
  else if (e.key === "h") hint();
  else if (e.key === "Escape") closeMenu();
  else if (e.key === "Enter" && state.phase === "won") nextLevel(state.level + 1);
  else if (e.key === "Enter" && state.phase === "lost") nextLevel(state.level);
});
window.addEventListener("resize", () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 60); });
document.addEventListener("visibilitychange", () => { state.lastTick = now(); if (document.hidden) saveCur(); else wake(); });
window.addEventListener("pagehide", () => saveCur());

/* ---------- Start ---------- */
resize();
const startLevel = save.cur && save.cur.level ? save.cur.level : Math.max(1, save.unlocked);
loadLevel(startLevel, { instantBg: true });

// Für Tests
window.__knoten = {
  state, save, levelDef, Rope,
  level: (n) => loadLevel(n, { fresh: true }),
  holeScreen: (h) => g2s(state.def.P[h]),
  endScreen: (r, e) => g2s(endGrid(r, e)),
};
})();
