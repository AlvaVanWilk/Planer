// Baut knoten/index.html aus src/.
//   node knoten/tools/build.js
// Die Level selbst erzeugt tools/levels.js (dauert, weil jedes Level mit der Seilphysik geknüpft
// und zur Probe wieder entknotet wird).
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const src = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");

const js = [src("rope.js"), src("levels.js"), src("game.js")].join("\n").replace(/<\/script/gi, "<\\/script");
const [head, body] = src("template.html").split("<!--BODY-->");
const fill = (s) => s.replace("/*CSS*/", () => src("style.css")).replace("/*JS*/", () => js);
const page = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<!-- Erzeugt von tools/build.js aus src/. Nicht von Hand bearbeiten. -->
${fill(head.trim())}
</head>
<body>
${fill(body.trim())}
</body>
</html>
`;
fs.writeFileSync(path.join(root, "index.html"), page);
console.log("index.html geschrieben,", Math.round(page.length / 1024), "KB");
