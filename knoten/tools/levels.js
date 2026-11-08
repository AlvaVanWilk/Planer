// Erzeugt knoten/src/levels.js: geprüfte, lösbare Knoten-Level.
//   node knoten/tools/levels.js [bis=60]
const fs = require("fs"), path = require("path");
const { generate } = require("./gen.js");
const UNTIL = +(process.argv[2] || 60);
const out = path.join(__dirname, "..", "src", "levels.js");
let levels = [];
try { levels = JSON.parse(fs.readFileSync(out, "utf8").replace(/^[^[]*/, "").replace(/;\s*$/, "")); } catch (e) {}
const minCross = (L) => Math.max(2, Math.min(24, Math.round(1 + L * 0.5)));
const minTw = (L) => (L < 3 ? 0 : L < 10 ? 1 : L < 25 ? 2 : 3);
for (let L = levels.length + 1; L <= UNTIL; L++) {
  let best = null, t0 = Date.now();
  for (let k = 0; k < 30; k++) {
    const g = generate(L, k);
    if (!g || !g.solvedBack) continue;
    const ok = g.cross >= minCross(L) && g.twisted >= minTw(L);
    const sc = g.cross + g.twisted * 3 + g.maxTw * 2;
    if (!best || (ok && !best.ok) || (ok === best.ok && sc > best.sc)) best = { ...g, ok, sc };
    if (ok && k >= 2) break;
  }
  const time = Math.min(240, Math.max(40, Math.round((30 + 9 * best.moves + 2 * best.cross) / 5) * 5));
  levels.push({ c: best.cols, h: best.rows, k: best.packed, m: best.moves, t: time });
  fs.writeFileSync(out, "window.KNOTEN_LEVELS = " + JSON.stringify(levels) + ";\n");
  console.log(`L${L}\tKordeln ${best.r}\tZüge ${best.moves}\tKreuzungen ${best.cross}\tverdreht ${best.twisted} (max ${best.maxTw})\tZeit ${time}s\t${best.ok ? "" : "(Ziel verfehlt) "}${Math.round((Date.now() - t0) / 1000)}s`);
}
