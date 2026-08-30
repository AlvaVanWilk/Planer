import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";

const KEY = "planer:aufgaben:v5";
const ALT_KEYS = ["reihenfolge:v4", "reihenfolge:v3"];
const GLAS_KEY = "planer:glaeser:v2";

const AXES = [
  { id: "aufwand", label: "Aufwand", farbe: "#6E56CF", stufen: ["in einem Rutsch", "ein Zeitblock", "mehrere Sitzungen"] },
  { id: "wirkung", label: "Wirkung", farbe: "#0E9F6E", stufen: ["kaum wahrnehmbar", "spürbar", "offensichtlich"] },
];
const FRIST_FARBE = "#E0484D";

/* ---------- Datum ---------- */
const isoVon = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const heuteIso = () => isoVon(new Date());
const plusTage = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return isoVon(d); };
const bisSonntag = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return isoVon(d); };
const tageBis = (iso, heute) => Math.round((Date.parse(`${iso}T00:00:00`) - Date.parse(`${heute}T00:00:00`)) / 86400000);
const huebsch = (iso) => {
  try { return new Date(`${iso}T00:00:00`).toLocaleDateString("de-DE", { day: "numeric", month: "short" }); }
  catch { return iso; }
};

/* ---------- Rechnung ---------- */
const dringlichkeit = (t, heute) => {
  if (!t.frist) return 1;
  const r = tageBis(t.frist, heute);
  const hart = r < 0 ? 4 : 1 + 2.5 / (1 + r / 7);
  return t.fristHart === false ? 1 + 0.55 * (hart - 1) : hart;
};
const W_BONUS = { 1: -6, 2: 0, 3: 2 };
const bewertet = (t) => t.aufwand && t.wirkung;
const wert = (t, heute) => bewertet(t) ? 6 * dringlichkeit(t, heute) + (4 - t.aufwand) + W_BONUS[t.wirkung] : null;
const nachRang = (heute) => (a, b) =>
  wert(b, heute) - wert(a, heute) || dringlichkeit(b, heute) - dringlichkeit(a, heute) ||
  b.wirkung - a.wirkung || a.aufwand - b.aufwand || a.angelegt - b.angelegt;

// Von Hand nach unten geschoben heisst: "sitz hinter DIESER Aufgabe" - nicht
// "habe diesen Wert". Werte versagen bei Gleichstand, Anker nicht. Der Schub
// gilt nur am Tag des Schiebens; danach zaehlt wieder die reine Rechnung.
const geschobenAm = (t, heute) => t.schubTag === heute && !!t.schubNach;

function ordne(liste, heute) {
  const alle = [...liste].sort(nachRang(heute));
  const ids = new Set(alle.map((t) => t.id));
  const aktiv = alle.filter((t) => geschobenAm(t, heute) && ids.has(t.schubNach));
  if (!aktiv.length) return alle;

  const raus = new Set(aktiv.map((t) => t.id));
  const reihe = alle.filter((t) => !raus.has(t.id));
  let offen = [...aktiv], weiter = true;
  while (offen.length && weiter) {           // Ketten aufloesen: erst Anker, dann Anhaenger
    weiter = false;
    offen = offen.filter((t) => {
      const j = reihe.findIndex((x) => x.id === t.schubNach);
      if (j < 0) return true;
      reihe.splice(j + 1, 0, t);
      weiter = true;
      return false;
    });
  }
  offen.forEach((t) => reihe.push(t));       // Notausgang, falls sich etwas im Kreis dreht
  return reihe;
}

/* ---------- Murmeln ---------- */
const STUFEN = {
  klar: { name: "Klar", fund: false },
  geaedert: { name: "Geädert", fund: false },
  schimmernd: { name: "Schimmernd", fund: true },
  galaxie: { name: "Galaxie", fund: true },
};
const streu = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) / 4294967295;
};
const murmelAus = (t, w) => {
  const basis = streu(t.id + t.name);
  const q = Math.max(0, Math.min(1, (w - 5) / 24));
  const r = Math.random();
  const stufe =
    r < 0.018 + q * 0.062 ? "galaxie" :
    r < 0.06 + q * 0.20 ? "schimmernd" :
    r < 0.17 + q * 0.33 ? "geaedert" : "klar";
  return {
    id: t.id, name: t.name, wert: Math.max(1, Math.round(w)), stufe,
    ton: Math.round((t.wirkung * 71 + t.aufwand * 133 + basis * 360) % 360),
    ton2: Math.round((basis * 613 + 140) % 360),
    hell: 0.52 + streu(t.id + "h") * 0.18,
    dreh: Math.round(streu(t.id + "d") * 360),
    wann: Date.now(),
  };
};

function packe(murmeln, breite, hoehe, kapazitaet, anteil) {
  const proPunkt = (breite * hoehe * anteil) / Math.max(kapazitaet, 1);
  const gelegt = [];
  for (const m of murmeln) {
    const r = Math.min(breite / 2.5, Math.max(3.5, Math.sqrt((m.wert * proPunkt) / Math.PI)));
    if (breite - 2 * r <= 0) { gelegt.push({ ...m, x: breite / 2, y: hoehe - r, r }); continue; }
    let bx = breite / 2, by = -Infinity;
    for (let k = 0; k < 46; k++) {
      const x = r + (breite - 2 * r) * ((k + 0.5) / 46);
      let y = hoehe - r;
      for (const p of gelegt) {
        const dx = Math.abs(p.x - x), rr = p.r + r;
        if (dx < rr) y = Math.min(y, p.y - Math.sqrt(rr * rr - dx * dx));
      }
      const kitzel = streu(m.id + k) * 0.9;
      if (y + kitzel > by) { by = y + kitzel; bx = x; }
    }
    gelegt.push({ ...m, x: bx, y: Math.min(by, hoehe - r), r });
  }
  return gelegt;
}

// Ein Haufen ungleich großer Kugeln ist oben zackig: die höchste Spitze liegt
// deutlich über dem Mittel. Also messen wir nach und verkleinern, bis alles
// vollständig im Glas liegt. Höhe skaliert linear zum Radius, Fläche quadratisch.
function packeFit(murmeln, breite, hoehe, kapazitaet) {
  if (!murmeln.length || breite <= 0 || hoehe <= 0) return [];
  let anteil = 0.56;
  let gelegt = packe(murmeln, breite, hoehe, kapazitaet, anteil);
  for (let i = 0; i < 6; i++) {
    let oben = Infinity;
    for (const m of gelegt) oben = Math.min(oben, m.y - m.r);
    if (oben >= 0.5) break;
    const stapel = Math.max(1, hoehe - oben);
    anteil *= Math.max(0.3, Math.pow((hoehe - 1) / stapel, 2) * 0.98);
    gelegt = packe(murmeln, breite, hoehe, kapazitaet, anteil);
  }
  return gelegt;
}

/* ---------- Klang ----------
   Bewusst nicht realistisch. Reine Sinustoene mit weichem Einsatz, harmonisch
   statt unharmonisch, ohne Anschlaggeraeusch und ohne Hall. Alle Tonhoehen
   liegen auf einer Pentatonik: dadurch klingen auch mehrere Toene kurz
   hintereinander nie schief, egal in welcher Reihenfolge sie kommen.       */
let AC = null, MEISTER = null;

const holeCtx = () => {
  const K = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
  if (!K) return null;
  if (!AC) AC = new K();
  if (AC.state === "suspended") AC.resume();
  return AC;
};

function meister(ctx) {
  if (!MEISTER) {
    MEISTER = ctx.createGain();
    MEISTER.gain.value = 0.34; // einzige Schraube fuer die Gesamtlautstaerke
    const weich = ctx.createBiquadFilter();
    weich.type = "lowpass"; weich.frequency.value = 2400; weich.Q.value = 0.4;
    MEISTER.connect(weich);
    weich.connect(ctx.destination);
  }
  return MEISTER;
}

const LEITER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // Pentatonik, gut zwei Oktaven
const hz = (stufe) => 261.63 * Math.pow(2, LEITER[Math.max(0, Math.min(LEITER.length - 1, stufe))] / 12);

function note(ctx, { f, start = 0, dauer = 0.3, laut = 0.1, anstieg = 0.016, ober = 0.18, gleit = 0 }) {
  const t0 = ctx.currentTime + start;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(laut, t0 + anstieg);          // weicher Einsatz statt Knall
  g.gain.setTargetAtTime(0.0001, t0 + anstieg, dauer / 3.6);   // natuerlich auslaufend
  g.connect(meister(ctx));

  const stimme = (freq, amp) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (gleit) o.frequency.exponentialRampToValueAtTime(freq * gleit, t0 + dauer * 0.9);
    const og = ctx.createGain(); og.gain.value = amp;
    o.connect(og); og.connect(g);
    o.start(t0);
    o.stop(t0 + dauer + 0.4);
  };
  stimme(f, 1);
  if (ober) stimme(f * 2, ober); // nur die Oktave, nichts Schraeges
}

const klang = {
  an: true,
  haken() {
    if (!this.an) return; const c = holeCtx(); if (!c) return;
    note(c, { f: hz(7), dauer: 0.13, laut: 0.05, anstieg: 0.009, ober: 0.1 });
  },
  murmel(w) {
    if (!this.an) return; const c = holeCtx(); if (!c) return;
    // Groessere Aufgabe klingt tiefer, bleibt aber immer auf der Leiter.
    const stufe = Math.max(1, Math.min(9, 9 - Math.round((Math.min(w, 29) / 29) * 8)));
    note(c, { f: hz(stufe), dauer: 0.44, laut: 0.105, anstieg: 0.018, ober: 0.22, gleit: 0.985 });
    note(c, { f: hz(stufe) * 1.5, start: 0.055, dauer: 0.3, laut: 0.032, anstieg: 0.022, ober: 0 });
  },
  schub() {
    if (!this.an) return; const c = holeCtx(); if (!c) return;
    note(c, { f: hz(3), dauer: 0.2, laut: 0.045, anstieg: 0.012, ober: 0.12, gleit: 0.86 });
  },
  fund() {
    if (!this.an) return; const c = holeCtx(); if (!c) return;
    [2, 4, 7].forEach((st, i) =>
      note(c, { f: hz(st), start: i * 0.135, dauer: i === 2 ? 0.85 : 0.42, laut: 0.07, anstieg: 0.022, ober: 0.26 })
    );
  },
  siegel() {
    if (!this.an) return; const c = holeCtx(); if (!c) return;
    note(c, { f: hz(0) / 2, dauer: 0.75, laut: 0.095, anstieg: 0.032, ober: 0.3 });
    note(c, { f: hz(4), start: 0.14, dauer: 0.8, laut: 0.055, anstieg: 0.045, ober: 0.2 });
  },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap');

.rf, .rf * { box-sizing:border-box; }
.rf {
  --paper:#F7F7F5; --surface:#FFF; --ink:#16181A; --muted:#8A8F92; --line:#E6E7E3;
  min-height:100vh; background:var(--paper); color:var(--ink);
  font-family:'Instrument Sans', ui-sans-serif, system-ui, sans-serif;
  font-size:15px; line-height:1.45; padding:44px 20px 90px; -webkit-font-smoothing:antialiased;
}
.rf-wrap { max-width:660px; margin:0 auto; }
.rf-title {
  font-family:'Bricolage Grotesque','Instrument Sans',sans-serif; font-weight:800;
  font-size:clamp(30px,6vw,40px); letter-spacing:-.035em; margin:0 0 20px; line-height:1;
}

.rf-tabs { display:flex; gap:3px; flex-wrap:wrap; margin:0 0 18px; }
.rf-tabs button {
  font-family:inherit; font-size:12.5px; color:var(--muted); background:none; border:0;
  padding:6px 11px; border-radius:8px; cursor:pointer;
}
.rf-tabs button:hover { background:#EDEEEA; color:var(--ink); }
.rf-tabs button[aria-current="true"] { background:var(--ink); color:#fff; font-weight:600; }

.rf-neu { display:flex; gap:8px; }
.rf-neu input {
  flex:1; font:inherit; color:var(--ink); background:var(--surface);
  border:1px solid var(--line); border-radius:11px; padding:12px 15px;
}
.rf-neu input::placeholder { color:#B0B5B7; }
.rf-neu input:focus { outline:2px solid var(--ink); outline-offset:-1px; border-color:transparent; }
.rf-neu button {
  font:inherit; font-weight:600; background:var(--ink); color:#fff;
  border:0; border-radius:11px; padding:0 20px; cursor:pointer;
}
.rf-neu button:disabled { background:#D3D6D4; cursor:default; }

.rf-legende {
  display:flex; gap:18px; flex-wrap:wrap; align-items:center;
  padding:20px 2px 12px; font-size:12px; color:var(--muted); border-bottom:1px solid var(--line);
}
.rf-leg { display:flex; align-items:center; gap:7px; }
.rf-leg i { width:9px; height:9px; border-radius:50%; display:block; }

.rf-liste { list-style:none; margin:0; padding:0; }
.rf-row {
  display:flex; gap:10px; align-items:center; padding:11px 2px;
  border-bottom:1px solid var(--line); background:var(--paper);
}
.rf-row[data-weg="true"] { animation:rf-weg 520ms cubic-bezier(.5,0,.75,0) forwards; }
@keyframes rf-weg {
  0% { opacity:1; }
  25% { opacity:.85; transform:translateX(-3px); }
  100% { opacity:0; transform:translateX(46px); filter:blur(2px); }
}
.rf-rang {
  font-family:'JetBrains Mono',monospace; font-weight:500; font-size:12px; color:#B8BDBF;
  width:20px; flex:none; text-align:right; font-variant-numeric:tabular-nums;
  border:0; background:none; padding:0; line-height:1.4;
}
.rf-rang { position:relative; }
.rf-rang:not(:disabled) { cursor:pointer; }
/* Unsichtbar vergroesserte Tippflaeche: rund 44px, ohne das Layout zu aendern */
.rf-rang:not(:disabled)::before { content:""; position:absolute; inset:-14px -12px -14px -16px; }
.rf-rang:focus-visible { outline:2px solid var(--ink); outline-offset:2px; border-radius:4px; }
.rf-rang i { display:none; font-style:normal; }
.rf-rang b { font-weight:500; }
.rf-rang[data-geschoben="true"] b { color:#98A0A3; }
@media (hover:hover) {
  .rf-rang:not(:disabled):hover { color:var(--ink); }
  .rf-rang:not(:disabled):hover b { display:none; }
  .rf-rang:not(:disabled):hover i { display:inline; }
}
.rf-rang[data-geschoben="true"] b::after { content:"·"; margin-left:1px; }
.rf-name {
  flex:1; min-width:0; font-size:15.5px; font-weight:500; border:0; background:none;
  font-family:inherit; color:var(--ink); padding:4px 0; border-radius:4px;
}
.rf-name:focus { outline:2px solid var(--ink); outline-offset:3px; }
.rf-erledigt .rf-name { text-decoration:line-through; color:var(--muted); }

.rf-dials { display:flex; gap:5px; flex:none; }
.rf-dial-huelle { position:relative; }
.rf-dial {
  width:28px; height:28px; padding:0; border:0; background:none; cursor:pointer;
  display:grid; place-items:center; border-radius:50%; touch-action:none;
  -webkit-touch-callout:none; user-select:none; -webkit-user-select:none;
}
.rf-dial:hover { background:#EDEEEA; }
.rf-dial:focus-visible { outline:2px solid var(--ink); outline-offset:1px; }
.rf-dial svg { display:block; }
.rf-dial-zahl {
  position:absolute; inset:0; display:grid; place-items:center; pointer-events:none;
  font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:600;
}
.rf-dial-zahl[data-lang="true"] { font-size:8px; }

.rf-slot { display:flex; gap:1px; flex:none; min-width:26px; justify-content:flex-end; }
.rf-slot button {
  width:25px; height:25px; border:0; background:none; border-radius:7px; cursor:pointer;
  color:#C2C7C9; font-size:12px; display:grid; place-items:center; padding:0;
}
.rf-zurueck {
  position:relative; width:30px; height:30px; flex:none; border:2px solid #D6DAD7;
  background:var(--surface); border-radius:50%; cursor:pointer; padding:0; color:var(--muted);
  display:grid; place-items:center; font-size:14px; line-height:1;
  transition:border-color 140ms, color 140ms, transform 160ms cubic-bezier(.3,1.6,.5,1);
}
.rf-zurueck::before { content:""; position:absolute; inset:-8px; }
.rf-zurueck:hover { border-color:var(--ink); color:var(--ink); transform:scale(1.08); }
.rf-zurueck:active { transform:scale(.9); }
.rf-slot button:hover { background:#EDEEEA; color:var(--ink); }
.rf-slot button.rf-loeschen:hover { background:#F3E3E3; color:${FRIST_FARBE}; }

.rf-haken {
  position:relative; width:32px; height:32px; flex:none; border-radius:50%; cursor:pointer;
  padding:0; border:2px solid #D6DAD7; background:var(--surface); display:grid; place-items:center;
  color:transparent; font-size:16px; line-height:1;
  transition:border-color 140ms, background 140ms, transform 160ms cubic-bezier(.3,1.6,.5,1);
}
.rf-haken:hover { border-color:var(--ink); color:#C3C8C4; transform:scale(1.09); }
.rf-haken:active { transform:scale(.88); }
.rf-erledigt .rf-haken { background:var(--ink); border-color:var(--ink); color:#fff; }

.rf-pop {
  position:absolute; right:-2px; width:212px; padding:5px; background:var(--surface);
  border:1px solid var(--line); border-radius:14px; box-shadow:0 10px 28px rgba(20,25,22,.16);
  z-index:30; animation:rf-auf 130ms cubic-bezier(.2,.9,.3,1);
}
.rf-pop[data-wo="oben"] { bottom:calc(100% + 8px); }
.rf-pop[data-wo="unten"] { top:calc(100% + 8px); }
@keyframes rf-auf { from { opacity:0; transform:translateY(6px) scale(.97); } }
.rf-pop-kopf {
  display:block; padding:6px 9px 7px; font-size:10.5px; letter-spacing:.07em;
  text-transform:uppercase; color:var(--muted);
}
.rf-pop-zeile {
  display:flex; align-items:center; gap:10px; width:100%; padding:7px 9px; border:0;
  background:none; border-radius:10px; cursor:pointer; text-align:left;
  font-family:inherit; font-size:13.5px; color:var(--ink);
}
.rf-pop-zeile:hover { background:#F2F3EF; }
.rf-pop-zeile[aria-checked="true"] { background:#F2F3EF; font-weight:600; }
.rf-pop-zeile b {
  font-family:'JetBrains Mono',monospace; font-size:11px; font-weight:600;
  width:20px; height:20px; border-radius:50%; display:grid; place-items:center;
  flex:none; color:#fff; background:#C6CBCD;
}
.rf-pop-zeile em { margin-left:auto; font-style:normal; color:var(--muted); font-size:11.5px; }
.rf-art { display:flex; gap:3px; padding:3px; margin:2px 4px 6px; background:#F2F3EF; border-radius:9px; }
.rf-art button {
  flex:1; border:0; background:none; border-radius:7px; padding:6px 4px; cursor:pointer;
  font-family:inherit; font-size:11.5px; color:var(--muted);
}
.rf-art button[aria-pressed="true"] { background:var(--surface); color:var(--ink); font-weight:600; box-shadow:0 1px 3px rgba(20,25,22,.1); }
.rf-datum { padding:4px 9px 7px; }
.rf-datum input {
  width:100%; font-family:inherit; font-size:13px; color:var(--ink); background:#F2F3EF;
  border:0; border-radius:9px; padding:8px 9px;
}
.rf-pop hr { border:0; border-top:1px solid var(--line); margin:5px 6px; }
.rf-leer { padding:38px 2px; color:var(--muted); border-bottom:1px solid var(--line); }

/* ---- Glas ---- */
.rf-glasbereich { margin-top:52px; display:flex; gap:26px; align-items:flex-end; flex-wrap:wrap; }
.rf-glas-huelle { position:relative; }
.rf-glas-huelle[data-huepf="true"] { animation:rf-huepf 620ms cubic-bezier(.28,1.5,.5,1); }
@keyframes rf-huepf {
  22% { transform:translateY(4px) scaleY(.965) scaleX(1.025); }
  55% { transform:translateY(-2px) scaleY(1.015) scaleX(.99); }
  100% { transform:none; }
}
.rf-glas-schein {
  position:absolute; inset:-14px; border-radius:50%; pointer-events:none;
  background:radial-gradient(circle, rgba(255,214,120,.55), rgba(255,214,120,0) 68%);
  animation:rf-schein 700ms ease-out forwards;
}
@keyframes rf-schein { from { opacity:0; transform:scale(.5); } 35% { opacity:1; } to { opacity:0; transform:scale(1.25); } }
.rf-glas-neben { flex:1; min-width:190px; padding-bottom:6px; }
.rf-glas-name {
  font-family:'Bricolage Grotesque','Instrument Sans',sans-serif; font-weight:700;
  font-size:19px; letter-spacing:-.02em; border:0; background:none; color:var(--ink);
  width:100%; padding:2px 0; border-radius:4px;
}
.rf-glas-name:focus { outline:2px solid var(--ink); outline-offset:3px; }
.rf-glas-stand { font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--muted); margin:4px 0 0; }
.rf-glas-knoepfe { display:flex; gap:7px; flex-wrap:wrap; margin-top:13px; }
.rf-glas-tat {
  font:inherit; font-size:13px; font-weight:600; background:var(--surface);
  border:1px solid var(--line); border-radius:10px; padding:8px 14px; cursor:pointer; color:var(--ink);
}
.rf-glas-tat:hover { border-color:#C9CFCA; }
.rf-glas-tat[data-voll="true"] { background:var(--ink); color:#fff; border-color:var(--ink); }
.rf-plus { width:36px; padding:0; display:grid; place-items:center; font-size:19px; font-weight:400; color:var(--muted); }
.rf-plus:hover { color:var(--ink); }

.rf-glas-platz { position:relative; }
.rf-siegel-schicht { position:absolute; inset:0; pointer-events:none; z-index:5; }
.rf-glas-huelle[data-siegel="true"] { animation:rf-siegeln 1360ms cubic-bezier(.3,.75,.35,1) forwards; }
@keyframes rf-siegeln {
  0% { transform:none; }
  14% { transform:translateY(-7px) scale(1.055); filter:drop-shadow(0 0 20px rgba(246,198,86,.95)); }
  30% { transform:translateY(3px) scale(.985); filter:drop-shadow(0 0 30px rgba(246,198,86,1)); }
  46% { transform:translateY(0) scale(1.015); filter:drop-shadow(0 0 22px rgba(246,198,86,.8)); }
  66% { transform:translateY(0) scale(1); filter:drop-shadow(0 0 10px rgba(246,198,86,.45)); opacity:1; }
  100% { transform:translateY(52px) scale(.26) rotate(-6deg); opacity:0; }
}
.rf-siegel-funke {
  position:absolute; border-radius:50%; background:#F5C64E; pointer-events:none;
  box-shadow:0 0 7px rgba(246,198,86,.9); animation:rf-siegel-funke 1150ms ease-out forwards;
}
@keyframes rf-siegel-funke {
  0% { opacity:0; transform:translate(0,0) scale(.35); }
  22% { opacity:1; }
  100% { opacity:0; transform:translate(var(--fx), var(--fy)) scale(.85); }
}
.rf-regal { display:flex; gap:10px; flex-wrap:wrap; margin-top:22px; align-items:flex-end; }
.rf-regal-glas[data-neu="true"] { animation:rf-regal-pop 660ms cubic-bezier(.2,1.6,.4,1); }
@keyframes rf-regal-pop { from { opacity:0; transform:scale(.35) translateY(-28px); } }
.rf-regal-glas { text-align:center; }
.rf-regal-glas span {
  display:block; font-size:10.5px; color:var(--muted); margin-top:3px; max-width:54px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}

/* ---- Belohnung ---- */
.rf-puls {
  position:fixed; border-radius:50%; border:2px solid var(--ink); z-index:70; pointer-events:none;
  animation:rf-puls 620ms cubic-bezier(.2,.7,.3,1) forwards;
}
@keyframes rf-puls { from { opacity:.6; transform:scale(.6); } to { opacity:0; transform:scale(3.1); } }
.rf-funke { position:fixed; border-radius:50%; z-index:70; pointer-events:none; animation:rf-funke 640ms ease-out forwards; }
@keyframes rf-funke { from { opacity:1; transform:translate(0,0) scale(1); } to { opacity:0; transform:translate(var(--fx), var(--fy)) scale(.2); } }
.rf-flug { position:fixed; z-index:80; pointer-events:none; animation:rf-bogen 820ms cubic-bezier(.36,.1,.4,1) forwards; }
@keyframes rf-bogen {
  0% { transform:translate(0,0) scale(1) rotate(0deg); }
  45% { transform:translate(calc(var(--dx) * .5), calc(var(--dy) * .5 - 104px)) scale(1.3) rotate(160deg); }
  100% { transform:translate(var(--dx), var(--dy)) scale(.62) rotate(370deg); opacity:.9; }
}
.rf-flug[data-gross="true"] { z-index:140; animation:rf-bogen-gross 940ms cubic-bezier(.42,.02,.4,1) forwards; }
@keyframes rf-bogen-gross {
  0% { transform:translate(0,0) scale(1) rotate(0deg); }
  38% { transform:translate(calc(var(--dx) * .4), calc(var(--dy) * .34 - 56px)) scale(.66) rotate(150deg); }
  100% { transform:translate(var(--dx), var(--dy)) scale(.16) rotate(345deg); opacity:.9; }
}

/* ---- Fund ---- */
.rf-fund {
  position:fixed; inset:0; z-index:120; display:grid; place-items:center; cursor:pointer;
  background:rgba(16,18,20,.72); backdrop-filter:blur(7px); animation:rf-fund-auf 320ms ease-out;
  padding:24px;
}
@keyframes rf-fund-auf { from { opacity:0; } }
.rf-fund-mitte { position:relative; display:grid; place-items:center; text-align:center; }
.rf-fund-strahlen {
  position:absolute; width:520px; height:520px; border-radius:50%; pointer-events:none;
  background:conic-gradient(from 0deg, transparent 0deg 8deg, rgba(255,255,255,.16) 8deg 15deg,
    transparent 15deg 30deg, rgba(255,255,255,.11) 30deg 36deg, transparent 36deg 60deg);
  animation:rf-drehen 14s linear infinite, rf-fund-auf 700ms ease-out;
  mask-image:radial-gradient(circle, #000 26%, transparent 70%);
  -webkit-mask-image:radial-gradient(circle, #000 26%, transparent 70%);
}
@keyframes rf-drehen { to { transform:rotate(360deg); } }
.rf-fund[data-weg="true"] { animation:rf-fund-zu 440ms ease-in forwards; pointer-events:none; }
@keyframes rf-fund-zu { to { opacity:0; } }
.rf-fund-murmel {
  position:relative; animation:rf-fund-pop 820ms cubic-bezier(.2,1.5,.4,1), rf-schweben 3.4s 820ms ease-in-out infinite;
}
.rf-fund-murmel[data-weg="true"] { opacity:0; animation:none; }
@keyframes rf-fund-pop { 0% { transform:scale(.15) rotate(-40deg); opacity:0; } 60% { opacity:1; } 100% { transform:scale(1) rotate(0); } }
@keyframes rf-schweben { 0%,100% { transform:translateY(0) rotate(0); } 50% { transform:translateY(-9px) rotate(4deg); } }
.rf-glitzer { position:absolute; border-radius:50%; background:#fff; pointer-events:none; animation:rf-glitzer 1.7s ease-in-out infinite; }
@keyframes rf-glitzer { 0%,100% { opacity:0; transform:scale(.3); } 45% { opacity:.95; transform:scale(1); } }

.rf-abschnitt {
  font-size:12px; letter-spacing:.03em; color:var(--muted); margin:34px 2px 0;
  background:none; border:0; padding:0; cursor:pointer; font-family:inherit;
}
.rf-abschnitt:hover { color:var(--ink); }
.rf-fuss { margin:26px 2px 0; color:var(--muted); font-size:12.5px; max-width:62ch; }

.rf-toast {
  position:fixed; left:50%; bottom:26px; transform:translateX(-50%); display:flex;
  align-items:center; gap:14px; background:var(--ink); color:#fff; padding:11px 12px 11px 17px;
  border-radius:13px; font-size:14px; z-index:100; box-shadow:0 8px 26px rgba(20,25,22,.24);
  animation:rf-hoch 180ms cubic-bezier(.2,.9,.3,1);
}
@keyframes rf-hoch { from { opacity:0; transform:translateX(-50%) translateY(9px); } }
.rf-toast button {
  font:inherit; font-weight:600; background:rgba(255,255,255,.14); color:#fff;
  border:0; border-radius:8px; padding:6px 12px; cursor:pointer;
}

@media (prefers-reduced-motion:reduce) {
  .rf-row, .rf-pop, .rf-toast, .rf-flug, .rf-glas-huelle, .rf-puls, .rf-funke,
  .rf-fund, .rf-fund-murmel, .rf-fund-strahlen, .rf-glitzer, .rf-glas-schein {
    transition:none !important; animation:none !important;
  }
}
`;

const U = 2 * Math.PI * 9;

function useAussenklick(offen, ref, zu) {
  useEffect(() => {
    if (!offen) return;
    const weg = (e) => ref.current && !ref.current.contains(e.target) && zu();
    const esc = (e) => e.key === "Escape" && zu();
    document.addEventListener("pointerdown", weg);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", weg); document.removeEventListener("keydown", esc); };
  }, [offen]);
}

/* ---------- Murmel-Grafik ---------- */
function Murmel({ m, cx, cy, r, pre }) {
  const gid = `${pre}-${m.id}`;
  const hell = Math.round(m.hell * 100);
  const sterne = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ({
      dx: (streu(m.id + "x" + i) - 0.5) * 1.35,
      dy: (streu(m.id + "y" + i) - 0.5) * 1.35,
      s: 0.06 + streu(m.id + "s" + i) * 0.1,
    })),
    [m.id]
  );

  return (
    <g>
      <defs>
        <radialGradient id={`g${gid}`} cx="34%" cy="30%" r="78%">
          {m.stufe === "galaxie" ? (
            <>
              <stop offset="0%" stopColor={`hsl(${m.ton2} 90% 78%)`} />
              <stop offset="38%" stopColor={`hsl(${(m.ton + 250) % 360} 68% 34%)`} />
              <stop offset="100%" stopColor="#10121F" />
            </>
          ) : m.stufe === "schimmernd" ? (
            <>
              <stop offset="0%" stopColor={`hsl(${m.ton} 96% 88%)`} />
              <stop offset="34%" stopColor={`hsl(${(m.ton + 55) % 360} 88% 68%)`} />
              <stop offset="68%" stopColor={`hsl(${(m.ton + 165) % 360} 82% 62%)`} />
              <stop offset="100%" stopColor={`hsl(${(m.ton + 255) % 360} 74% 54%)`} />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor={`hsl(${m.ton} 72% ${Math.min(92, hell + 26)}%)`} />
              <stop offset="62%" stopColor={`hsl(${m.ton} 62% ${hell}%)`} />
              <stop offset="100%" stopColor={`hsl(${m.ton} 56% ${Math.max(24, hell - 22)}%)`} />
            </>
          )}
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r={r} fill={`url(#g${gid})`} />

      {m.stufe === "geaedert" && (
        <g clipPath={`url(#k${gid})`} opacity=".82">
          <defs><clipPath id={`k${gid}`}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
          <ellipse cx={cx} cy={cy} rx={r * 0.92} ry={r * 0.3}
            fill={`hsl(${m.ton2} 74% ${Math.min(88, hell + 24)}%)`}
            transform={`rotate(${m.dreh} ${cx} ${cy})`} />
          <ellipse cx={cx} cy={cy} rx={r * 0.72} ry={r * 0.14}
            fill={`hsl(${(m.ton2 + 40) % 360} 84% 90%)`} opacity=".75"
            transform={`rotate(${m.dreh + 22} ${cx} ${cy})`} />
        </g>
      )}

      {m.stufe === "galaxie" && (
        <g clipPath={`url(#k${gid})`}>
          <defs><clipPath id={`k${gid}`}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
          {sterne.map((s, i) => (
            <circle key={i} cx={cx + s.dx * r} cy={cy + s.dy * r} r={Math.max(0.5, s.s * r)}
              fill="#fff" opacity={0.55 + (i % 3) * 0.15} />
          ))}
        </g>
      )}

      {m.stufe === "schimmernd" && (
        <circle cx={cx} cy={cy} r={r * 0.99} fill="none" stroke="#fff" strokeWidth={r * 0.07} opacity=".55" />
      )}

      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={m.stufe === "galaxie" ? "#2A2F52" : `hsl(${m.ton} 50% 30%)`}
        strokeWidth={r * 0.12} opacity=".3" />
      <ellipse cx={cx - r * 0.34} cy={cy - r * 0.4} rx={r * 0.29} ry={r * 0.19} fill="#fff" opacity=".72"
        transform={`rotate(-32 ${cx - r * 0.34} ${cy - r * 0.4})`} />
      <ellipse cx={cx + r * 0.3} cy={cy + r * 0.42} rx={r * 0.17} ry={r * 0.1} fill="#fff" opacity=".28"
        transform={`rotate(-28 ${cx + r * 0.3} ${cy + r * 0.42})`} />
    </g>
  );
}

function Glas({ murmeln, kapazitaet, breite = 168, hoehe = 214, versteckt, frisch, klein }) {
  const w = klein ? 42 : breite, h = klein ? 54 : hoehe;
  const rand = klein ? 3 : 9, deckel = klein ? 4 : 12;
  const innenB = w - rand * 2, innenH = h - rand * 2 - deckel;
  const gelegt = useMemo(() => packeFit(murmeln, innenB, innenH, kapazitaet),
    [murmeln, innenB, innenH, kapazitaet]);
  const cid = `cl${klein ? "k" : "g"}${murmeln.length}`;

  return (
    <svg width={w} height={h + (klein ? 3 : 8)} viewBox={`0 0 ${w} ${h + (klein ? 3 : 8)}`} aria-hidden="true">
      <defs>
        <clipPath id={cid}><rect x={rand} y={rand + deckel} width={innenB} height={innenH} rx={klein ? 5 : 14} /></clipPath>
        <linearGradient id={`glas${cid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity=".95" />
          <stop offset="42%" stopColor="#F4F7F5" stopOpacity=".5" />
          <stop offset="100%" stopColor="#E9EEEB" stopOpacity=".7" />
        </linearGradient>
      </defs>
      <rect x={rand - (klein ? 2 : 5)} y={klein ? 1 : 2} width={innenB + (klein ? 4 : 10)}
        height={klein ? 5 : 11} rx={klein ? 2 : 5} fill="#DDE2DD" />
      <rect x={rand} y={rand + deckel} width={innenB} height={innenH} rx={klein ? 5 : 14}
        fill={`url(#glas${cid})`} stroke="#DCE1DC" strokeWidth={klein ? 1 : 1.5} />
      <g clipPath={`url(#${cid})`}>
        <g transform={`translate(${rand} ${rand + deckel})`}>
          {gelegt.map((m) => (
            <g key={m.id} opacity={versteckt === m.id ? 0 : 1}
              style={frisch === m.id ? { animation: "rf-fallen 620ms cubic-bezier(.3,1.35,.5,1)" } : undefined}>
              <Murmel m={m} cx={m.x} cy={m.y} r={m.r} pre={klein ? "k" : "g"} />
            </g>
          ))}
        </g>
      </g>
      <rect x={rand + innenB * 0.13} y={rand + deckel + innenH * 0.06} width={Math.max(2, innenB * 0.065)}
        height={innenH * 0.5} rx={innenB * 0.033} fill="#fff" opacity=".7" />
      <style>{`@keyframes rf-fallen { 0% { transform:translateY(-${innenH}px); } 70% { transform:translateY(3px);} 100% { transform:translateY(0);} }`}</style>
    </svg>
  );
}

function Ring({ anteil, farbe, blass, text, lang }) {
  const o = blass ? 0.4 : 1;
  return (
    <>
      <svg width="24" height="24" viewBox="0 0 24 24">
        {anteil > 0 && <circle cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" stroke="#E6E7E3" />}
        {anteil === 0 && <circle cx="12" cy="12" r="9" fill="none" strokeWidth="1.6" stroke={farbe} opacity=".42" strokeDasharray="2.4 3.3" />}
        {anteil > 0 && (
          <circle cx="12" cy="12" r="9" fill="none" stroke={farbe} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={`${Math.min(anteil, 1) * U} ${U}`} transform="rotate(-90 12 12)" opacity={o} />
        )}
      </svg>
      <span className="rf-dial-zahl" data-lang={lang || undefined}
        style={{ color: farbe, opacity: anteil > 0 ? o : 0.55 }}>{text}</span>
    </>
  );
}

function StufenDial({ achse, value, onChange }) {
  const [offen, setOffen] = useState(false);
  const [wo, setWo] = useState("oben");
  const huelle = useRef(null), timer = useRef(null), lang = useRef(false);
  useAussenklick(offen, huelle, () => setOffen(false));
  return (
    <span className="rf-dial-huelle" ref={huelle}>
      <button className="rf-dial"
        aria-label={`${achse.label}: ${value ? `${value} von 3, ${achse.stufen[value - 1]}` : "noch nicht bewertet"}. Tippen wechselt, gedrückt halten öffnet die Auswahl.`}
        onPointerDown={() => {
          lang.current = false;
          timer.current = setTimeout(() => {
            lang.current = true;
            const r = huelle.current?.getBoundingClientRect();
            setWo(r && r.top < 260 ? "unten" : "oben"); setOffen(true);
          }, 280);
        }}
        onPointerUp={() => { clearTimeout(timer.current); if (!lang.current && !offen) onChange(!value || value === 3 ? 1 : value + 1); }}
        onPointerLeave={() => clearTimeout(timer.current)}
        onPointerCancel={() => clearTimeout(timer.current)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (["1", "2", "3"].includes(e.key)) { e.preventDefault(); onChange(Number(e.key)); } }}>
        <Ring anteil={value ? value / 3 : 0} farbe={achse.farbe} text={value || "?"} />
      </button>
      {offen && (
        <div className="rf-pop" data-wo={wo} role="radiogroup" aria-label={achse.label}>
          <span className="rf-pop-kopf">{achse.label}</span>
          {[1, 2, 3].map((n) => (
            <button key={n} className="rf-pop-zeile" role="radio" aria-checked={value === n}
              onClick={() => { onChange(n); setOffen(false); }}>
              <b style={value === n ? { background: achse.farbe } : undefined}>{n}</b>{achse.stufen[n - 1]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function FristDial({ task, heute, onChange }) {
  const [offen, setOffen] = useState(false);
  const [wo, setWo] = useState("oben");
  const huelle = useRef(null);
  useAussenklick(offen, huelle, () => setOffen(false));
  const hart = task.fristHart !== false;
  const D = dringlichkeit(task, heute);
  const r = task.frist ? tageBis(task.frist, heute) : null;
  const text = !task.frist ? "–" : r < 0 ? "!" : r > 99 ? "99+" : String(r);
  const setzen = (iso) => { onChange({ frist: iso, fristHart: hart }); setOffen(false); };
  const schnell = [["Heute", plusTage(0)], ["Morgen", plusTage(1)], ["Diese Woche", bisSonntag()], ["In einer Woche", plusTage(7)]];
  return (
    <span className="rf-dial-huelle" ref={huelle}>
      <button className="rf-dial"
        aria-label={`Dringlichkeit: ${task.frist ? `${hart ? "Deadline" : "Wunschtermin"} ${huebsch(task.frist)}` : "kein Termin"}.`}
        onClick={() => {
          const b = huelle.current?.getBoundingClientRect();
          setWo(b && b.top < 320 ? "unten" : "oben"); setOffen((v) => !v);
        }}>
        <Ring anteil={(D - 1) / 3} farbe={FRIST_FARBE} blass={!hart} text={text} lang={text.length > 2} />
      </button>
      {offen && (
        <div className="rf-pop" data-wo={wo}>
          <span className="rf-pop-kopf">Dringlichkeit</span>
          <div className="rf-art">
            <button aria-pressed={hart} onClick={() => onChange({ frist: task.frist, fristHart: true })}>Deadline</button>
            <button aria-pressed={!hart} onClick={() => onChange({ frist: task.frist, fristHart: false })}>Wunschtermin</button>
          </div>
          {schnell.map(([label, iso]) => (
            <button key={label} className="rf-pop-zeile" role="radio" aria-checked={task.frist === iso}
              onClick={() => setzen(iso)}>
              <b style={task.frist === iso ? { background: FRIST_FARBE } : undefined}>·</b>{label}<em>{huebsch(iso)}</em>
            </button>
          ))}
          <div className="rf-datum">
            <input type="date" value={task.frist || ""} aria-label="Datum wählen"
              onChange={(e) => e.target.value && setzen(e.target.value)} />
          </div>
          <hr />
          <button className="rf-pop-zeile" onClick={() => { onChange({ frist: null, fristHart: hart }); setOffen(false); }}>
            <b style={!task.frist ? { background: "#C6CBCD" } : undefined}>–</b>Kein Termin
          </button>
        </div>
      )}
    </span>
  );
}

function VerschiebeMenu({ glaeser, aktiv, onWaehl }) {
  const [offen, setOffen] = useState(false);
  const [wo, setWo] = useState("oben");
  const huelle = useRef(null);
  useAussenklick(offen, huelle, () => setOffen(false));
  return (
    <span className="rf-dial-huelle" ref={huelle}>
      <button aria-label="In ein anderes Murmelglas verschieben"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => {
          const b = huelle.current?.getBoundingClientRect();
          setWo(b && b.top < 300 ? "unten" : "oben"); setOffen((v) => !v);
        }}>⇄</button>
      {offen && (
        <div className="rf-pop" data-wo={wo} role="radiogroup" aria-label="Murmelglas">
          <span className="rf-pop-kopf">Verschieben nach</span>
          {glaeser.map((g) => (
            <button key={g.id} className="rf-pop-zeile" role="radio" aria-checked={g.id === aktiv}
              onClick={() => { onWaehl(g.id); setOffen(false); }}>
              <b style={g.id === aktiv ? { background: "#16181A" } : undefined}>·</b>{g.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

export default function Planer() {
  const [tasks, setTasks] = useState([]);
  const [glaeser, setGlaeser] = useState([{ id: "g1", name: "Murmelglas 1", murmeln: [] }]);
  const [regal, setRegal] = useState([]);
  const [aktivesGlas, setAktivesGlas] = useState("g1");
  const [entwurf, setEntwurf] = useState("");
  const [geladen, setGeladen] = useState(false);
  const [heute, setHeute] = useState(heuteIso());
  const [zeigeErledigt, setZeigeErledigt] = useState(false);
  const [zeigeRechnung, setZeigeRechnung] = useState(false);
  const [fokus, setFokus] = useState(null);
  const [weg, setWeg] = useState(null);
  const [effekte, setEffekte] = useState(null);
  const [flug, setFlug] = useState(null);
  const [frisch, setFrisch] = useState(null);
  const [huepf, setHuepf] = useState(false);
  const [schein, setSchein] = useState(false);
  const [fund, setFund] = useState(null);
  const [fundWeg, setFundWeg] = useState(false);
  const [siegel, setSiegel] = useState(false);
  const [neuImRegal, setNeuImRegal] = useState(null);
  const [tonAn, setTonAn] = useState(true);
  const [rueckgang, setRueckgang] = useState(null);
  const [hinweis, setHinweis] = useState("");
  const glasRef = useRef(null);
  const wartet = useRef(null);
  const eingabe = useRef(null);

  const ruhig = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    const tick = () => setHeute(heuteIso());
    const i = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", tick); };
  }, []);

  useEffect(() => {
    (async () => {
      let daten = null;
      for (const k of [KEY, ...ALT_KEYS]) {
        try { const r = await window.storage.get(k); if (r && r.value) { daten = JSON.parse(r.value); break; } }
        catch (e) { /* weiter */ }
      }
      let gl = null, rg = [];
      try {
        const g = await window.storage.get(GLAS_KEY);
        if (g && g.value) { const p = JSON.parse(g.value); gl = p.glaeser; rg = p.regal || []; if (p.tonAn === false) setTonAn(false); }
      } catch (e) { /* nichts */ }
      if (!gl || !gl.length) gl = [{ id: "g1", name: "Murmelglas 1", murmeln: [] }];
      if (daten) setTasks(daten.map((t) => ({ ...t, glas: t.glas || gl[0].id })));
      setGlaeser(gl); setRegal(rg); setAktivesGlas(gl[0].id);
      setGeladen(true);
    })();
  }, []);

  useEffect(() => {
    if (!geladen) return;
    (async () => {
      try { await window.storage.set(KEY, JSON.stringify(tasks)); }
      catch (e) { setHinweis("Speichern hat nicht geklappt. Die Liste bleibt in diesem Tab erhalten."); }
    })();
  }, [tasks, geladen]);

  useEffect(() => { klang.an = tonAn; }, [tonAn]);

  useEffect(() => {
    if (!geladen) return;
    (async () => {
      try { await window.storage.set(GLAS_KEY, JSON.stringify({ glaeser, regal, tonAn })); } catch (e) { /* still */ }
    })();
  }, [glaeser, regal, tonAn, geladen]);

  useEffect(() => {
    if (!rueckgang) return;
    const t = setTimeout(() => setRueckgang(null), 6000);
    return () => clearTimeout(t);
  }, [rueckgang]);

  const glas = glaeser.find((g) => g.id === aktivesGlas) || glaeser[0];
  const meine = tasks.filter((t) => t.glas === glas.id);
  const aktiv = meine.filter((t) => !t.fertig);
  const neu = aktiv.filter((t) => !bewertet(t)).sort((a, b) => b.angelegt - a.angelegt);
  const sortiert = ordne(aktiv.filter(bewertet), heute);
  const fertig = meine.filter((t) => t.fertig);

  // Kapazität lebt: Murmeln plus der aktuelle Wert aller noch offenen Aufgaben.
  const drin = glas.murmeln.reduce((s, m) => s + m.wert, 0);
  const offenerWert = aktiv.reduce((s, t) => s + (wert(t, heute) || 6), 0);
  const kapazitaet = Math.max(1, Math.round(drin + offenerWert));
  const anteil = drin / kapazitaet;
  const voll = aktiv.length === 0 && glas.murmeln.length > 0;

  const refs = useRef(new Map()), letzte = useRef(new Map());
  useLayoutEffect(() => {
    if (ruhig()) return;
    refs.current.forEach((el, id) => {
      if (!el || !el.isConnected) return;
      const jetzt = el.getBoundingClientRect().top;
      const vorher = letzte.current.get(id);
      if (vorher !== undefined && Math.abs(vorher - jetzt) > 1) {
        el.style.transition = "none";
        el.style.transform = `translateY(${vorher - jetzt}px)`;
        requestAnimationFrame(() => {
          el.style.transition = "transform 380ms cubic-bezier(.2,.85,.25,1)";
          el.style.transform = "";
        });
      }
      letzte.current.set(id, jetzt);
    });
  });

  const anlegen = () => {
    const name = entwurf.trim();
    if (!name) return;
    setTasks((v) => [...v, {
      id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name,
      aufwand: null, wirkung: null, frist: null, fristHart: true,
      fertig: false, angelegt: Date.now(), glas: glas.id,
    }]);
    setEntwurf("");
    eingabe.current?.focus();
  };

  const aendern = (id, felder) => setTasks((alt) => alt.map((t) => (t.id === id ? { ...t, ...felder } : t)));

  const runter = (t) => {
    const i = sortiert.findIndex((x) => x.id === t.id);
    if (i < 0 || i >= sortiert.length - 1) return;
    const n = sortiert[i + 1];
    setTasks((alt) => alt.map((x) => {
      if (x.id === t.id) return { ...x, schubNach: n.id, schubTag: heute };
      // Haengt der Nachbar seinerseits an dieser Aufgabe, entstuende ein Kreis.
      if (x.id === n.id && x.schubNach === t.id) return { ...x, schubNach: null, schubTag: null };
      return x;
    }));
    klang.schub();
  };

  const zurueckSchieben = (t) => {
    aendern(t.id, { schubNach: null, schubTag: null });
    klang.haken();
  };

  const landen = (t, m) => {
    klang.murmel(m.wert);
    setGlaeser((gs) => gs.map((g) => (g.id === t.glas ? { ...g, murmeln: [...g.murmeln, m] } : g)));
    setTasks((alt) => alt.map((x) => (x.id === t.id ? { ...x, fertig: true } : x)));
    setWeg(null); setFlug(null); setFrisch(m.id);
    setHuepf(true); setSchein(STUFEN[m.stufe].fund);
    setTimeout(() => { setHuepf(false); setSchein(false); }, 700);
    setTimeout(() => setFrisch(null), 700);
  };

  const fliegen = (t, m, von, gross) => {
    if (ruhig() || !von || !glasRef.current) { landen(t, m); return; }
    const b = glasRef.current.getBoundingClientRect();
    const zielY = Math.min(b.top + b.height * 0.55, window.innerHeight - 70);
    const d = gross ? 188 : Math.max(18, Math.min(40, 10 + m.wert * 0.9));
    setFlug({
      m, d, gross, x: von.x - d / 2, y: von.y - d / 2,
      dx: b.left + b.width / 2 - von.x, dy: zielY - von.y,
    });
    setTimeout(() => landen(t, m), gross ? 930 : 810);
  };

  const abhaken = (t, el) => {
    const w = wert(t, heute) || 6;
    const m = murmelAus(t, w);
    const r = el?.getBoundingClientRect();
    const von = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
    klang.haken();

    if (!ruhig() && von) {
      setEffekte({
        x: von.x, y: von.y,
        funken: Array.from({ length: 9 }, (_, i) => {
          const w2 = (i / 9) * Math.PI * 2 + Math.random();
          const l = 34 + Math.random() * 30;
          return { fx: Math.cos(w2) * l, fy: Math.sin(w2) * l, ton: m.ton + i * 14, d: 4 + Math.random() * 4 };
        }),
      });
      setTimeout(() => setEffekte(null), 660);
    }
    setWeg(t.id);

    if (STUFEN[m.stufe].fund && !ruhig()) {
      wartet.current = { t, m, von };
      setTimeout(() => { setFund(m); klang.fund(); }, 380);
    } else {
      setTimeout(() => fliegen(t, m, von), ruhig() ? 0 : 380);
    }
  };

  const fundWeiter = () => {
    const w = wartet.current;
    if (!w) return;
    wartet.current = null;
    setFundWeg(true);
    fliegen(w.t, w.m, { x: window.innerWidth / 2, y: window.innerHeight / 2 }, true);
    setTimeout(() => { setFund(null); setFundWeg(false); }, 460);
  };

  // Die besondere Murmel bleibt einen Moment stehen und geht dann von selbst ins Glas.
  useEffect(() => {
    if (!fund) return;
    const t = setTimeout(fundWeiter, 2100);
    return () => clearTimeout(t);
  }, [fund]);

  const wiederOeffnen = (t) => {
    setGlaeser((gs) => gs.map((g) => (g.id === t.glas ? { ...g, murmeln: g.murmeln.filter((m) => m.id !== t.id) } : g)));
    aendern(t.id, { fertig: false });
  };

  const loeschen = (id) => {
    const i = tasks.findIndex((t) => t.id === id);
    if (i < 0) return;
    setRueckgang({ task: tasks[i], index: i });
    setGlaeser((gs) => gs.map((g) => ({ ...g, murmeln: g.murmeln.filter((m) => m.id !== id) })));
    refs.current.delete(id); letzte.current.delete(id);
    setTasks((alt) => alt.filter((t) => t.id !== id));
  };

  const zurueckholen = () => {
    if (!rueckgang) return;
    setTasks((alt) => { const k = [...alt]; k.splice(Math.min(rueckgang.index, k.length), 0, rueckgang.task); return k; });
    setRueckgang(null);
  };

  const neuesGlas = () => {
    const id = `g${Date.now()}`;
    const nr = glaeser.length + regal.length + 1;
    setGlaeser((gs) => [...gs, { id, name: `Murmelglas ${nr}`, murmeln: [] }]);
    setAktivesGlas(id);
  };

  const verschliessen = () => {
    klang.siegel();
    if (ruhig()) { verschliessenJetzt(); return; }
    setSiegel(true);
    setTimeout(() => { setSiegel(false); verschliessenJetzt(); }, 1340);
  };

  const verschliessenJetzt = () => {
    setNeuImRegal(glas.id);
    setTimeout(() => setNeuImRegal(null), 700);
    setRegal((r) => [...r, { ...glas, kapazitaet, geschlossen: Date.now() }]);
    setTasks((alt) => alt.filter((t) => t.glas !== glas.id));
    const rest = glaeser.filter((g) => g.id !== glas.id);
    if (rest.length) { setGlaeser(rest); setAktivesGlas(rest[0].id); }
    else {
      const id = `g${Date.now()}`;
      setGlaeser([{ id, name: `Murmelglas ${regal.length + 2}`, murmeln: [] }]);
      setAktivesGlas(id);
    }
  };

  const Zeile = (t, rang) => {
    const w = wert(t, heute);
    const geschoben = geschobenAm(t, heute);
    return (
      <li key={t.id} ref={(el) => el && refs.current.set(t.id, el)}
        data-weg={weg === t.id || undefined} className={`rf-row${t.fertig ? " rf-erledigt" : ""}`}>
        <button className="rf-rang" disabled={rang == null || t.fertig}
          data-geschoben={geschoben || undefined}
          onClick={() => runter(t)}
          aria-label={rang == null ? "noch nicht eingeordnet" : `Platz ${rang}, eine Position nach unten schieben`}
          title={rang == null ? "noch nicht eingeordnet"
            : geschoben ? `Wert ${Math.round(w)} · heute von Hand nach unten geschoben`
            : `Wert ${Math.round(w)} · tippen schiebt eine Position nach unten`}>
          <b>{rang ?? "?"}</b><i>&darr;</i>
        </button>
        <input className="rf-name" value={t.name} aria-label="Aufgabe"
          onFocus={() => setFokus(t.id)} onBlur={() => setFokus((f) => (f === t.id ? null : f))}
          onChange={(e) => aendern(t.id, { name: e.target.value })} />
        {!t.fertig && (
          <div className="rf-dials">
            {AXES.map((a) => (
              <StufenDial key={a.id} achse={a} value={t[a.id]} onChange={(n) => aendern(t.id, { [a.id]: n })} />
            ))}
            <FristDial task={t} heute={heute} onChange={(f) => aendern(t.id, f)} />
          </div>
        )}
        <span className="rf-slot">
          {fokus === t.id && glaeser.length > 1 && (
            <VerschiebeMenu glaeser={glaeser} aktiv={t.glas} onWaehl={(gid) => aendern(t.id, { glas: gid })} />
          )}
          {fokus === t.id && (
            <button className="rf-loeschen" title="Löschen" aria-label="Aufgabe löschen"
              onPointerDown={(e) => e.preventDefault()} onClick={() => loeschen(t.id)}>✕</button>
          )}
        </span>
        {geschoben && !t.fertig && (
          <button className="rf-zurueck" title="Zurück an den berechneten Platz"
            aria-label="Handverschiebung zurücknehmen" onClick={() => zurueckSchieben(t)}>&uarr;</button>
        )}
        <button className="rf-haken" aria-label={t.fertig ? "Wieder öffnen" : "Erledigt"}
          onClick={(e) => (t.fertig ? wiederOeffnen(t) : abhaken(t, e.currentTarget))}>✓</button>
      </li>
    );
  };

  return (
    <div className="rf">
      <style>{CSS}</style>
      <div className="rf-wrap">
        <h1 className="rf-title">Planer</h1>

        {glaeser.length > 1 && (
          <div className="rf-tabs">
            {glaeser.map((g) => (
              <button key={g.id} aria-current={g.id === glas.id}
                onClick={() => setAktivesGlas(g.id)}>{g.name}</button>
            ))}
          </div>
        )}

        <div className="rf-neu">
          <input ref={eingabe} value={entwurf} placeholder="Aufgabe" aria-label="Neue Aufgabe"
            onChange={(e) => setEntwurf(e.target.value)} onKeyDown={(e) => e.key === "Enter" && anlegen()} />
          <button onClick={anlegen} disabled={!entwurf.trim()}>Eintragen</button>
        </div>

        <div className="rf-legende">
          {AXES.map((a) => <span className="rf-leg" key={a.id}><i style={{ background: a.farbe }} />{a.label}</span>)}
          <span className="rf-leg"><i style={{ background: FRIST_FARBE }} />Dringlichkeit</span>
        </div>

        <ul className="rf-liste">
          {geladen && aktiv.length === 0 && <li className="rf-leer">Noch nichts eingetragen.</li>}
          {neu.map((t) => Zeile(t, null))}
          {sortiert.map((t, i) => Zeile(t, i + 1))}
        </ul>

        <div className="rf-glasbereich">
          <div className="rf-glas-platz">
            <div className="rf-glas-huelle" ref={glasRef} data-huepf={huepf || undefined}
              data-siegel={siegel || undefined}>
              {schein && <span className="rf-glas-schein" />}
              <Glas murmeln={glas.murmeln} kapazitaet={kapazitaet} versteckt={flug?.m.id} frisch={frisch} />
            </div>
            {siegel && (
              <span className="rf-siegel-schicht">
                {Array.from({ length: 18 }, (_, i) => {
                  const a = (i / 18) * Math.PI * 2;
                  const l = 52 + (i % 4) * 18;
                  const g = 5 + (i % 3) * 2;
                  return (
                    <span key={i} className="rf-siegel-funke" style={{
                      left: `calc(50% - ${g / 2}px)`, top: `calc(50% - ${g / 2}px)`, width: g, height: g,
                      "--fx": `${Math.cos(a) * l}px`, "--fy": `${Math.sin(a) * l - 34}px`,
                      animationDelay: `${i * 30}ms`,
                    }} />
                  );
                })}
              </span>
            )}
          </div>
          <div className="rf-glas-neben">
            <input className="rf-glas-name" value={glas.name} aria-label="Name des Murmelglases"
              onChange={(e) => setGlaeser((gs) => gs.map((g) => (g.id === glas.id ? { ...g, name: e.target.value } : g)))} />
            <p className="rf-glas-stand">
              {drin} / {kapazitaet} · {Math.round(anteil * 100)} %
              {glas.murmeln.length > 0 && ` · ${glas.murmeln.length} Murmeln`}
            </p>
            <div className="rf-glas-knoepfe">
              <button className="rf-glas-tat rf-plus" onClick={neuesGlas}
                title="Neues Murmelglas" aria-label="Neues Murmelglas">+</button>
              <button className="rf-glas-tat rf-plus" aria-pressed={tonAn}
                title={tonAn ? "Ton aus" : "Ton an"} aria-label={tonAn ? "Ton ausschalten" : "Ton einschalten"}
                onClick={() => { setTonAn((v) => !v); if (!tonAn) { klang.an = true; klang.murmel(14); } }}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7.5h2.6L10.5 4v12L6.6 12.5H4z" />
                  {tonAn
                    ? <><path d="M13.4 7.2a4 4 0 0 1 0 5.6" /><path d="M15.7 5.2a7 7 0 0 1 0 9.6" /></>
                    : <><path d="M13.6 8l4 4" /><path d="M17.6 8l-4 4" /></>}
                </svg>
              </button>
              {voll && <button className="rf-glas-tat" data-voll="true" onClick={verschliessen}>Voll — verschließen</button>}
            </div>
            {regal.length > 0 && (
              <div className="rf-regal">
                {regal.map((g) => (
                  <div className="rf-regal-glas" key={g.id} data-neu={neuImRegal === g.id || undefined}>
                    <Glas murmeln={g.murmeln} kapazitaet={g.kapazitaet} klein />
                    <span title={g.name}>{g.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {fertig.length > 0 && (
          <>
            <button className="rf-abschnitt" onClick={() => setZeigeErledigt((v) => !v)}>
              {zeigeErledigt ? "▾" : "▸"} Erledigt ({fertig.length})
            </button>
            {zeigeErledigt && <ul className="rf-liste">{fertig.map((t) => Zeile(t, null))}</ul>}
          </>
        )}

        <button className="rf-abschnitt" onClick={() => setZeigeRechnung((v) => !v)}>
          {zeigeRechnung ? "▾" : "▸"} Rechnung
        </button>
        {(zeigeRechnung || hinweis) && (
          <p className="rf-fuss">
            {hinweis ||
              "Wert = 6 × Dringlichkeit + (4 − Aufwand) + Wirkungsbonus (3 → +2, 2 → 0, 1 → −6). Dringlichkeit wächst hyperbolisch zum Termin: heute 3,5 — in einer Woche 2,25 — ohne Termin 1. Überfällig 4, Wunschtermin 55 Prozent. Ein Murmelglas fasst den Wert aller ihm zugeordneten Aufgaben; die Murmelgröße entspricht dem Wert beim Abhaken. Die Chance auf eine seltene Murmel steigt mit diesem Wert."}
          </p>
        )}
      </div>

      {effekte && (
        <>
          <span className="rf-puls" style={{ left: effekte.x - 17, top: effekte.y - 17, width: 34, height: 34 }} />
          {effekte.funken.map((f, i) => (
            <span key={i} className="rf-funke" style={{
              left: effekte.x - f.d / 2, top: effekte.y - f.d / 2, width: f.d, height: f.d,
              background: `hsl(${f.ton} 78% 62%)`, "--fx": `${f.fx}px`, "--fy": `${f.fy}px`,
              animationDelay: `${i * 12}ms`,
            }} />
          ))}
        </>
      )}

      {flug && (
        <div className="rf-flug" data-gross={flug.gross || undefined} style={{
          left: flug.x, top: flug.y, width: flug.d, height: flug.d,
          "--dx": `${flug.dx}px`, "--dy": `${flug.dy}px`,
        }}>
          <svg width={flug.d} height={flug.d} viewBox="0 0 40 40">
            <Murmel m={flug.m} cx={20} cy={20} r={19} pre="f" />
          </svg>
        </div>
      )}

      {fund && (
        <div className="rf-fund" data-weg={fundWeg || undefined} onClick={fundWeiter}
          role="img" aria-label={`Besondere Murmel: ${STUFEN[fund.stufe].name}`}>
          <div className="rf-fund-mitte">
            <span className="rf-fund-strahlen" />
            {Array.from({ length: 16 }, (_, i) => (
              <span key={i} className="rf-glitzer" style={{
                left: `${50 + Math.cos((i / 16) * 6.28) * (34 + (i % 4) * 10)}%`,
                top: `${50 + Math.sin((i / 16) * 6.28) * (32 + (i % 3) * 12)}%`,
                width: 3 + (i % 3) * 2, height: 3 + (i % 3) * 2,
                animationDelay: `${i * 105}ms`,
              }} />
            ))}
            <div className="rf-fund-murmel" data-weg={fundWeg || undefined}>
              <svg width="188" height="188" viewBox="0 0 200 200">
                <Murmel m={fund} cx={100} cy={100} r={92} pre="fund" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {rueckgang && (
        <div className="rf-toast" role="status">
          <span>Gelöscht</span>
          <button onClick={zurueckholen}>Rückgängig</button>
        </div>
      )}
    </div>
  );
}
