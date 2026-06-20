// Tablet-PORTRAIT mockup of Rift Hunter with the new flowing particle orb.
import { writeFileSync } from "node:fs";

const W = 900, H = 1280;
const C = {
  bg: "#f4f7fe", ink: "#16203a", muted: "#67708c", line: "#e6eaf6",
  sky: "#5aa9ff", azure: "#2e7bf6", violet: "#8a7bff", mint: "#2fd0a6", rose: "#ff6b8b", amber: "#ffb02e",
};
let s = "";
const add = (x) => (s += x);
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const T = (x, y, t, o = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter,system-ui,sans-serif" font-size="${o.size || 14}" font-weight="${o.w || 500}" fill="${o.fill || C.ink}" ${o.anchor ? `text-anchor="${o.anchor}"` : ""} ${o.spacing ? `letter-spacing="${o.spacing}"` : ""}>${esc(t)}</text>`;
const glass = (x, y, w, h, r = 22) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#ffffff" fill-opacity="0.66" stroke="#ffffff"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${C.line}"/>`;
const chip = (x, y, w, t, fill, txt) =>
  `<rect x="${x}" y="${y}" width="${w}" height="26" rx="13" fill="${fill}" fill-opacity="0.14"/>` + T(x + w / 2, y + 17, t, { size: 12, w: 600, fill: txt, anchor: "middle" });
const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const grad = (t) => {
  const stops = [[90,169,255],[63,134,247],[95,116,246],[138,123,255],[169,184,255],[232,240,255]];
  const f = Math.max(0, Math.min(0.999, t)) * (stops.length - 1);
  const i = Math.floor(f), k = f - i;
  const a = stops[i], b = stops[i + 1] || stops[i];
  return `rgb(${lerp(a[0],b[0],k)},${lerp(a[1],b[1],k)},${lerp(a[2],b[2],k)})`;
};

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
add(`<defs>
  <radialGradient id="bg" cx="50%" cy="0%" r="90%"><stop offset="0%" stop-color="#e9e7ff"/><stop offset="55%" stop-color="${C.bg}"/></radialGradient>
  <radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${C.violet}" stop-opacity="0.22"/><stop offset="55%" stop-color="${C.sky}" stop-opacity="0.10"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${C.sky}" stop-opacity="0"/><stop offset="50%" stop-color="${C.azure}"/><stop offset="100%" stop-color="${C.violet}" stop-opacity="0"/></linearGradient>
  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.mint}" stop-opacity="0.3"/><stop offset="100%" stop-color="${C.mint}" stop-opacity="0"/></linearGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${C.sky}"/><stop offset="55%" stop-color="${C.azure}"/><stop offset="100%" stop-color="${C.violet}"/></linearGradient>
</defs>`);
add(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);

// device frame hint
add(`<rect x="6" y="6" width="${W-12}" height="${H-12}" rx="34" fill="none" stroke="${C.line}" stroke-width="2"/>`);

// header
const M = 28;
add(`<rect x="${M}" y="28" width="46" height="46" rx="14" fill="url(#brand)"/>`);
add(T(M+23,57,"◢",{size:20,fill:"#fff",anchor:"middle"}));
add(T(M+60,50,"Rift Hunter",{size:23,w:700}));
add(T(M+60,71,"Autonomous AI trading intelligence",{size:12,fill:C.muted}));
add(chip(W-M-150,38,150,"OANDA · PRACTICE",C.azure,C.azure));

// stats row (4 compact)
const stats=[["Equity","$1,284,500",C.violet],["Today","+$44,500",C.mint],["Win","74%",C.ink],["Open","5",C.ink]];
const sw=(W-2*M-3*12)/4;
stats.forEach((st,i)=>{const x=M+i*(sw+12);add(glass(x,92,sw,76,18));add(T(x+16,118,st[0].toUpperCase(),{size:10,w:600,fill:C.muted,spacing:0.5}));add(T(x+16,148,st[1],{size:19,w:700,fill:st[2]}));});

// ── Henry orb panel ──
const PY=184, PH=560;
add(glass(M,PY,W-2*M,PH,26));
const cx=W/2, barY=PY+PH*0.66, R=150, cyOrb=barY-R*1.04;
add(`<rect x="${cx-R*1.6}" y="${cyOrb-R*1.6}" width="${R*3.2}" height="${R*3.2}" fill="url(#halo)"/>`);

// orb particles (sphere projection)
function sphere(n){const out=[];const g=Math.PI*(3-Math.sqrt(5));for(let i=0;i<n;i++){const y=1-(i/(n-1))*2;const r=Math.sqrt(Math.max(0,1-y*y));const th=g*i;out.push([Math.cos(th)*r,y,Math.sin(th)*r]);}return out;}
const rot=0.7, tilt=-0.42;
const proj=([x,y,z],rad)=>{let X=x*Math.cos(rot)-z*Math.sin(rot);let Z=x*Math.sin(rot)+z*Math.cos(rot);const Y=y*Math.cos(tilt)-Z*Math.sin(tilt);Z=y*Math.sin(tilt)+Z*Math.cos(tilt);const p=1/(1.8-Z*0.6);return{sx:cx+X*rad*p,sy:cyOrb+Y*rad*p,depth:(Z+1)/2,p,lat:(y+1)/2};};
const pts=sphere(1100).map(p=>({p,...proj(p,R)})).sort((a,b)=>a.depth-b.depth);
let orb="";
for(const q of pts){const size=(0.7+q.depth*2.1)*q.p;const col=grad(q.lat*0.6+q.depth*0.4);const op=(0.35+q.depth*0.6).toFixed(2);orb+=`<circle cx="${q.sx.toFixed(1)}" cy="${q.sy.toFixed(1)}" r="${size.toFixed(1)}" fill="${col}" fill-opacity="${op}"/>`;}
add(orb);
// flowing rings
for(let k=0;k<3;k++){const tk=(k/3)*Math.PI;let ring="";for(let i=0;i<110;i++){const a=(i/110)*Math.PI*2;const x=Math.cos(a)*1.16,z0=Math.sin(a)*1.16;const y=z0*Math.sin(tk),z=z0*Math.cos(tk);const q=proj([x,y,z],R);const size=(0.5+q.depth*1.1)*q.p;ring+=`<circle cx="${q.sx.toFixed(1)}" cy="${q.sy.toFixed(1)}" r="${size.toFixed(1)}" fill="${grad(0.8)}" fill-opacity="${(0.15+q.depth*0.35).toFixed(2)}"/>`;}add(ring);}

// bar line
add(`<rect x="${cx-R*1.7}" y="${barY-1.4}" width="${R*3.4}" height="2.8" fill="url(#bar)"/>`);
add(`<rect x="${cx-R*1.7}" y="${barY-5}" width="${R*3.4}" height="10" fill="url(#bar)" opacity="0.3"/>`);
// dust
let dust="";for(let i=0;i<420;i++){const tt=Math.random();const dx=cx+(Math.random()*2-1)*R*1.5*(0.5+tt*0.6);const dy=barY+tt*(PY+PH-barY-16);const r=(0.5+Math.random()*1.5)*(1-tt*0.5);const op=((1-tt)*0.6*Math.random()).toFixed(2);dust+=`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${r.toFixed(1)}" fill="${Math.random()<0.5?'#9db9ff':'#b9a9ff'}" fill-opacity="${op}"/>`;}
add(dust);

// name + status + voice
add(T(M+22,PY+38,"H E N R Y",{size:16,w:700,spacing:5}));
add(`<circle cx="${M+26}" cy="${PY+58}" r="3.5" fill="${C.mint}"/>`);
add(T(M+40,PY+62,"Speaking",{size:13,fill:C.muted}));
// eq bars
for(let i=0;i<4;i++)add(`<rect x="${M+108+i*5}" y="${PY+50+(i%2?4:0)}" width="3" height="${10-(i%2?4:0)}" rx="1.5" fill="${C.violet}"/>`);
// voice button
add(`<rect x="${W-M-44}" y="${PY+20}" width="40" height="40" rx="12" fill="${C.violet}" fill-opacity="0.15" stroke="${C.violet}" stroke-opacity="0.4"/>`);
add(T(W-M-24,PY+46,"🔊",{size:18,anchor:"middle"}));
// caption
add(`<rect x="${M+40}" y="${PY+PH-66}" width="${W-2*M-80}" height="44" rx="20" fill="#fff" fill-opacity="0.8" stroke="${C.line}"/>`);
add(T(cx,PY+PH-38,"“Liquidity breakout on BTC — scaling in. TP/SL set.”",{size:14,w:600,anchor:"middle"}));

// control dock
const DY=760;
add(glass(M,DY,W-2*M,84));
add(`<rect x="${M+18}" y="${DY+20}" width="150" height="44" rx="13" fill="url(#brand)"/>`);
add(T(M+93,DY+47,"▮▮  Hunting",{size:14,w:700,fill:"#fff",anchor:"middle"}));
add(`<rect x="${M+184}" y="${DY+20}" width="240" height="44" rx="13" fill="${C.bg}"/>`);
["Guarded","Balanced","Aggr."].forEach((r,i)=>{const bx=M+190+i*76;const on=i===1;if(on)add(`<rect x="${bx}" y="${DY+26}" width="72" height="32" rx="9" fill="#fff" stroke="${C.line}"/>`);add(T(bx+36,DY+47,r,{size:12,w:600,fill:on?C.ink:C.muted,anchor:"middle"}));});
add(`<rect x="${W-M-150}" y="${DY+20}" width="132" height="44" rx="13" fill="${C.rose}" fill-opacity="0.12" stroke="${C.rose}" stroke-opacity="0.4"/>`);
add(T(W-M-84,DY+47,"⛔ Flatten all",{size:13,w:700,fill:C.rose,anchor:"middle"}));

// open trades (2)
const TY=860;
add(T(M+4,TY+16,"Open Trades",{size:16,w:700}));
add(chip(M+150,TY+0,72,"5 live",C.azure,C.azure));
const trades=[["BTC/USDT","LONG","+$3,580","+5.4%",C.mint],["XAU/USD","SHORT","-$320","-0.6%",C.rose]];
const tw=(W-2*M-12)/2;
trades.forEach((tr,i)=>{const x=M+i*(tw+12);const y=TY+30;add(glass(x,y,tw,150,18));add(`<rect x="${x}" y="${y}" width="${tw}" height="4" rx="2" fill="${tr[4]}" fill-opacity="0.6"/>`);const lc=tr[1]==="LONG"?C.mint:C.rose;add(`<rect x="${x+16}" y="${y+16}" width="30" height="30" rx="9" fill="${lc}" fill-opacity="0.15"/>`);add(T(x+31,y+36,tr[1]==="LONG"?"↗":"↘",{size:16,w:700,fill:lc,anchor:"middle"}));add(T(x+56,y+32,tr[0],{size:15,w:700}));add(T(x+56,y+48,tr[1]+" · 5x",{size:10,w:600,fill:C.muted,spacing:0.5}));add(T(x+16,y+90,tr[2],{size:22,w:700,fill:lc}));add(T(x+16,y+110,tr[3],{size:13,w:600,fill:lc}));add(`<line x1="${x+16}" y1="${y+122}" x2="${x+tw-16}" y2="${y+122}" stroke="${C.line}"/>`);add(T(x+16,y+142,"🛡 TP/SL set",{size:11,fill:C.muted}));});

// henry's mind peek
const MY=1054;
add(glass(M,MY,W-2*M,H-MY-28));
add(T(M+18,MY+30,"✦ Henry's Mind",{size:16,w:700}));
const mind=[["Liquidity breakout on BTC — scaling in.",C.mint],["Vol spiking on XAU/USD — trimming risk now.",C.rose],["Re-weighting the ensemble in real time.",C.azure]];
mind.forEach((m,i)=>{const y=MY+62+i*40;add(`<circle cx="${M+24}" cy="${y-4}" r="3.5" fill="${m[1]}"/>`);add(T(M+40,y,m[0],{size:13,fill:"#3a435e"}));});

add(`</svg>`);
writeFileSync(new URL("../preview-portrait.svg", import.meta.url), s);
console.log("wrote preview-portrait.svg", s.length);
