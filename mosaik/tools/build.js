// Baut mosaik/index.html aus src/.
//   node mosaik/tools/build.js [--fragment ziel.html]
// Berechnet für jedes Bild die Zahlen (eindeutig und ohne Raten lösbar) und bettet alles ein.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = f => fs.readFileSync(path.join(root, "src", f), "utf8");

global.window = global;
require(path.join(root, "src/images.js"));
const SV = require(path.join(root, "src/solver.js"));


// Schwierigkeit je Bild: Grundwert der Welt, innerhalb der Welt leicht ansteigend
function diffFor(w, p) {
  const pi = w.pics.indexOf(p), d = w.diff;
  return Object.assign({ seed: SV.hashStr(p.id) }, d, { remove: d.remove + (pi - 2.5) * (d.ramp || 0) });
}
const puzzles = {};
let fail = 0;
for (const w of global.MOSAIK_WORLDS) {
  for (const p of w.pics) {
    const H = p.art.length, W = p.art[0].length;
    if (p.art.some(r => r.length !== W)) throw new Error(p.id + ": Zeilen ungleich lang");
    const miss = [...new Set(p.art.join(""))].filter(c => c !== "." && !p.pal[c]);
    if (miss.length) throw new Error(p.id + ": Farbe fehlt für " + miss.join(""));
    const sol = [].concat(...p.art.map(r => [...r].map(c => (c !== "." && !(c >= "a" && c <= "z") ? 1 : 0))));
    const r = SV.build(sol, H, W, diffFor(w, p));
    // Gegenprobe: der Löser findet genau das Bild.
    const chk = SV.solve(H, W, r.clues, r.given, { pair: true });
    const same = chk.ok && sol.every((v, i) => chk.st[i] === v);
    if (!same) { fail++; console.error("NICHT LÖSBAR:", p.id); }
    puzzles[p.id] = {
      c: r.clues.map(v => (v < 0 ? "." : String(v))).join(""),
      g: Array.from(r.given, v => (v < 0 ? "." : String(v))).join(""),
    };
    const n = r.clues.filter(v => v >= 0).length;
    console.log(w.id.padEnd(8), p.id.padEnd(13), W + "×" + H, "Zahlen", String(n).padStart(3), "Paarschlüsse", r.pairSteps);
  }
}
if (fail) process.exit(1);

const tpl = src("template.html");
const css = src("style.css");
const js = [
  src("images.js"),
  src("solver.js"),
  "window.MOSAIK_PUZZLES = " + JSON.stringify(puzzles) + ";",
  src("audio.js"),
  src("app.js"),
].join("\n").replace(/<\/script/gi, "<\\/script");

const [head, body] = tpl.split("<!--BODY-->");
const fill = s => s.replace("/*CSS*/", () => css).replace("/*JS*/", () => js);
const H = fill(head.replace("<!--HEAD-->", "").trim());
const B = fill(body.trim());

const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<link rel="apple-touch-icon" href="icon.png">
<link rel="icon" href="icon.png">
<!-- Erzeugt von tools/build.js aus src/. Nicht von Hand bearbeiten. -->
${H}
</head>
<body>
${B}
</body>
</html>
`;
fs.writeFileSync(path.join(root, "index.html"), page);
console.log("index.html geschrieben,", Math.round(page.length / 1024), "KB");

const fi = process.argv.indexOf("--fragment");
if (fi > 0) {
  fs.writeFileSync(process.argv[fi + 1], H + "\n" + B + "\n");
  console.log("Fragment geschrieben:", process.argv[fi + 1]);
}
