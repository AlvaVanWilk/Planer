// Rendert alle Bilder als Kontaktbogen (PNG), zum Prüfen der Pixel-Art.
// node mosaik/tools/preview.js [ausgabe.png] [weltId]
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
global.window = global;
require(path.join(__dirname, "../src/images.js"));
const W = global.MOSAIK_WORLDS;
const out = process.argv[2] || "preview.png";
const only = process.argv[3];

const worlds = only && only.endsWith(".json") ? [{ id: "neu", pics: JSON.parse(fs.readFileSync(only, "utf8")) }] : W.filter(w => !only || w.id === only);
const html = `<html><body style="margin:0;background:#222;color:#eee;font:13px sans-serif">
<div id=root style="display:flex;flex-wrap:wrap;gap:14px;padding:14px;width:1500px"></div>
<script>
const worlds = ${JSON.stringify(worlds)};
const root = document.getElementById('root');
function lerp(a,b,t){const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);
 const r=(pa>>16)+(((pb>>16)-(pa>>16))*t), g=((pa>>8)&255)+((((pb>>8)&255)-((pa>>8)&255))*t), bl=(pa&255)+(((pb&255)-(pa&255))*t);
 return 'rgb('+r+','+g+','+bl+')';}
for (const w of worlds) for (const p of w.pics) {
  const H=p.art.length, Wd=p.art[0].length, s=Math.floor(${only ? 16 : 14}*20/Math.max(H,Wd));
  const box=document.createElement('div');
  const c=document.createElement('canvas'); c.width=Wd*s*2+10; c.height=H*s;
  const x=c.getContext('2d');
  for(let r=0;r<H;r++)for(let q=0;q<Wd;q++){
    const ch=p.art[r][q]; let col;
    if(ch==='.') col=lerp(p.bg[0],p.bg[1],H>1?r/(H-1):0); else col=p.pal[ch]||'#f0f';
    x.fillStyle=col; x.fillRect(q*s,r*s,s,s);
    const filled = ch!=='.' && ch===ch.toUpperCase() && !(/[a-z]/.test(ch));
    x.fillStyle=filled?'#111':'#eee'; x.fillRect(Wd*s+10+q*s,r*s,s-1,s-1);
  }
  box.appendChild(c);
  const l=document.createElement('div'); l.textContent=w.id+' / '+p.id+' – '+p.title+' ('+Wd+'×'+H+')'; box.appendChild(l);
  root.appendChild(box);
}
</script></body></html>`;
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1530, height: 400 } });
  await pg.setContent(html);
  await pg.screenshot({ path: out, fullPage: true });
  await b.close();
})();
