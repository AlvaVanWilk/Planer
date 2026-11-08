// Erzeugt knoten/src/levels.js: geprüfte, lösbare Knoten-Level.
//   node knoten/tools/levels.js [bis=60] [parallel=4]
// Jedes Level wird mit der Seilphysik verknotet und zur Probe rückwärts wieder gelöst.
const fs = require("fs"), path = require("path"), { fork } = require("child_process");
const out = path.join(__dirname, "..", "src", "levels.js");

if (process.argv[2] === "--worker") {
  const { generate } = require("./gen.js");
  const target = (L) => ({ curl: Math.min(7, 0.4 + L * 0.14), wraps: L < 15 ? 1 : L < 30 ? 2 : 3, free: 0 });
  process.on("message", (L) => {
    let best = null; const t0 = Date.now(), T = target(L);
    for (let k = 0; k < 20; k++) {
      const g = generate(L, k);
      if (!g || !g.solvedBack) continue;
      const ok = g.curl >= T.curl && g.wraps >= T.wraps && g.freeRopes <= T.free;
      const sc = g.curl * 2 + g.wraps * 3 + g.maxWrap - g.freeRopes * 4;
      if (!best || (ok && !best.ok) || (ok === best.ok && sc > best.sc)) best = { ...g, ok, sc };
      if (ok && k >= 1) break;
    }
    const time = Math.min(240, Math.max(45, Math.round((30 + 9 * best.moves + 2 * best.cross + 4 * best.curl) / 5) * 5));
    process.send({
      L, data: {
        c: best.cols, h: best.rows, k: best.packed, m: best.moves, t: time,
        // Lösungsweg: die Verwirr-Züge rückwärts, jeweils mit umgekehrtem Bogen
        s: best.hist.slice().reverse().map((m) => [m.r, m.e, m.from, m.via.slice().reverse().map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)])]),
      },
      log: `L${L}\tKordeln ${best.r}\tZüge ${best.moves} (Haken ${best.loops})\tKreuzungen ${best.cross}\tcurl ${best.curl.toFixed(1)}\tumschlungen ${best.wraps} (max ${best.maxWrap})\tfrei ${best.freeRopes}\tZeit ${time}s\t${best.ok ? "" : "(Ziel verfehlt) "}${Math.round((Date.now() - t0) / 1000)}s`,
    });
  });
} else {
  const UNTIL = +(process.argv[2] || 60), PAR = +(process.argv[3] || 4);
  const done = new Map(); let next = 1;
  const write = () => {
    const arr = []; for (let L = 1; done.has(L); L++) arr.push(done.get(L));
    fs.writeFileSync(out, "window.KNOTEN_LEVELS = " + JSON.stringify(arr) + ";\n");
  };
  for (let i = 0; i < PAR; i++) {
    const w = fork(__filename, ["--worker"]);
    const feed = () => { if (next <= UNTIL) w.send(next++); else w.kill(); };
    w.on("message", (m) => { done.set(m.L, m.data); console.log(m.log); write(); feed(); });
    feed();
  }
}
