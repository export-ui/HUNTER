// Generates a faithful vector preview (preview.svg) of the Rift Hunter dashboard
// using the real design-system palette. This is a layout preview — the live
// Henry is an animated <canvas>; here particles are rendered statically.
import { writeFileSync } from "node:fs";

const W = 1440,
  H = 940;
const C = {
  bg: "#f5f7fe",
  ink: "#16203a",
  muted: "#67708c",
  line: "#e6eaf6",
  sky: "#5aa9ff",
  azure: "#2e7bf6",
  violet: "#8a7bff",
  mint: "#2fd0a6",
  rose: "#ff6b8b",
  amber: "#ffb02e",
};
let s = "";
const add = (x) => (s += x);
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const glass = (x, y, w, h, r = 22) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#ffffff" fill-opacity="0.72" stroke="#ffffff" stroke-opacity="0.9"/>` +
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="${C.line}" stroke-opacity="0.7"/>`;
const text = (x, y, t, o = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter, system-ui, sans-serif" font-size="${o.size || 13}" font-weight="${o.w || 500}" fill="${o.fill || C.ink}" ${o.anchor ? `text-anchor="${o.anchor}"` : ""} ${o.spacing ? `letter-spacing="${o.spacing}"` : ""}>${esc(t)}</text>`;
const chip = (x, y, w, t, fill, txt) =>
  `<rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="${fill}" fill-opacity="0.14"/>` +
  text(x + w / 2, y + 16, t, { size: 11, w: 600, fill: txt, anchor: "middle" });

// ── background ──
add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, system-ui, sans-serif">`);
add(`<defs>
  <radialGradient id="bg" cx="50%" cy="0%" r="80%"><stop offset="0%" stop-color="#ece9ff"/><stop offset="60%" stop-color="${C.bg}"/></radialGradient>
  <linearGradient id="brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${C.sky}"/><stop offset="55%" stop-color="${C.azure}"/><stop offset="100%" stop-color="${C.violet}"/></linearGradient>
  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${C.mint}" stop-opacity="0.32"/><stop offset="100%" stop-color="${C.mint}" stop-opacity="0"/></linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stop-color="${C.sky}" stop-opacity="0"/><stop offset="50%" stop-color="${C.azure}"/><stop offset="100%" stop-color="${C.violet}" stop-opacity="0"/></linearGradient>
  <radialGradient id="p" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#fff" stop-opacity="0.95"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>`);
add(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
// subtle grid
for (let x = 0; x < W; x += 28) add(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${C.azure}" stroke-opacity="0.04"/>`);
for (let y = 0; y < H; y += 28) add(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${C.azure}" stroke-opacity="0.04"/>`);

// ── header ──
add(`<rect x="28" y="30" width="44" height="44" rx="14" fill="url(#brand)"/>`);
add(text(50, 57, "◢", { size: 20, fill: "#fff", anchor: "middle" }));
add(text(86, 50, "Rift Hunter", { size: 22, w: 700, fill: C.ink }));
add(text(86, 70, "Autonomous AI trading intelligence", { size: 12, fill: C.muted }));
add(chip(1086, 38, 132, "DEMO · simulated", C.amber, C.amber));
add(chip(1226, 38, 96, "TRENDING", C.mint, C.mint));
add(chip(1330, 38, 82, "Jun 16", C.muted, C.muted));

// ── stat strip ──
const stats = [
  ["Equity", "$1,284,500", "Total portfolio value", C.violet],
  ["Today's P&L", "+$44,500", "+3.59%", C.mint],
  ["Win Rate", "74%", "Trailing 30 days", C.ink],
  ["Sharpe", "3.10", "Risk-adjusted", C.ink],
  ["Open Positions", "5", "Global markets", C.ink],
];
const sw = (1384 - 4 * 14) / 5;
stats.forEach((st, i) => {
  const x = 28 + i * (sw + 14);
  add(glass(x, 92, sw, 80, 18));
  add(`<rect x="${x + 16}" y="112" width="36" height="36" rx="11" fill="${C.sky}" fill-opacity="0.14"/>`);
  add(text(x + 64, 116, st[0].toUpperCase(), { size: 10, w: 600, fill: C.muted, spacing: 0.5 }));
  add(text(x + 64, 140, st[1], { size: 22, w: 700, fill: st[3] }));
  add(text(x + 64, 158, st[2], { size: 11, fill: C.muted }));
});

// ── left column ──
const LX = 28,
  LW = 360;
// control dock
add(glass(LX, 188, LW, 150));
add(`<rect x="${LX + 16}" y="206" width="120" height="42" rx="13" fill="url(#brand)"/>`);
add(text(LX + 76, 232, "▮▮  Hunting", { size: 13, w: 700, fill: "#fff", anchor: "middle" }));
add(`<rect x="${LX + 150}" y="206" width="194" height="42" rx="13" fill="${C.bg}"/>`);
["Guarded", "Balanced", "Aggr."].forEach((r, i) => {
  const bx = LX + 156 + i * 62;
  const on = i === 1;
  if (on) add(`<rect x="${bx}" y="212" width="58" height="30" rx="9" fill="#fff" stroke="${C.line}"/>`);
  add(text(bx + 29, 231, r, { size: 11, w: 600, fill: on ? C.ink : C.muted, anchor: "middle" }));
});
add(`<rect x="${LX + 16}" y="262" width="${LW - 32}" height="58" rx="14" fill="${C.mint}" fill-opacity="0.10" stroke="${C.mint}" stroke-opacity="0.4"/>`);
add(text(LX + 38, 286, "🤖 Autonomous trading", { size: 13, w: 600, fill: C.ink }));
add(text(LX + 38, 304, "Henry is placing real orders", { size: 10, fill: C.muted }));
add(`<rect x="${LX + LW - 58}" y="282" width="36" height="20" rx="10" fill="${C.mint}"/><circle cx="${LX + LW - 30}" cy="292" r="8" fill="#fff"/>`);
// flatten / kill switch
add(`<rect x="${LX + 16}" y="298" width="${LW - 32}" height="0" />`);

// equity chart
add(glass(LX, 350, LW, 150));
add(text(LX + 18, 376, "PORTFOLIO EQUITY", { size: 10, w: 600, fill: C.muted, spacing: 0.5 }));
add(text(LX + 18, 398, "$1,284,500", { size: 22, w: 700, fill: C.ink }));
add(text(LX + LW - 18, 388, "↑ +$44,500 (+3.59%)", { size: 13, w: 600, fill: C.mint, anchor: "end" }));
// sparkline
const pts = [];
let v = 60;
for (let i = 0; i <= 40; i++) {
  v += Math.sin(i * 0.5) * 4 + (i * 0.6) + (Math.random() * 4 - 2);
  pts.push(v);
}
const min = Math.min(...pts),
  max = Math.max(...pts),
  sp = max - min || 1;
const cx0 = LX + 16,
  cw = LW - 32,
  cy0 = 410,
  ch = 74;
const xy = pts.map((p, i) => [cx0 + (i / 40) * cw, cy0 + ch - ((p - min) / sp) * ch]);
const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
add(`<path d="${line} L${cx0 + cw},${cy0 + ch} L${cx0},${cy0 + ch} Z" fill="url(#eq)"/>`);
add(`<path d="${line}" fill="none" stroke="${C.mint}" stroke-width="2.5" stroke-linejoin="round"/>`);

// strategy panel
add(glass(LX, 512, LW, 400));
add(text(LX + 18, 540, "Strategy Ensemble", { size: 14, w: 700 }));
add(chip(LX + LW - 84, 526, 68, "6/6 live", C.violet, C.violet));
const strat = [
  ["Quantum Momentum", "+$3,240", 0.6],
  ["Mean Reversion", "-$820", -0.3],
  ["Liquidity Breakout", "+$2,110", 0.45],
  ["Cross-Venue Arb", "+$640", 0.15],
  ["Neural Sentiment", "+$1,980", 0.5],
  ["Volatility Harvest", "-$430", -0.2],
];
strat.forEach((st, i) => {
  const y = 556 + i * 58;
  add(`<rect x="${LX + 16}" y="${y}" width="${LW - 32}" height="48" rx="12" fill="#fff" fill-opacity="0.7" stroke="${C.line}"/>`);
  add(`<circle cx="${LX + 30}" cy="${y + 18}" r="3" fill="${C.mint}"/>`);
  add(text(LX + 42, y + 22, st[0], { size: 12, w: 600 }));
  add(text(LX + LW - 28, y + 22, st[1], { size: 12, w: 700, fill: st[1][0] === "-" ? C.rose : C.mint, anchor: "end" }));
  // bias meter
  const mx = LX + 42,
    mw = LW - 84,
    my = y + 34;
  add(`<rect x="${mx}" y="${my}" width="${mw}" height="6" rx="3" fill="${C.line}"/>`);
  const b = st[2];
  const half = mw / 2;
  if (b >= 0) add(`<rect x="${mx + half}" y="${my}" width="${b * half}" height="6" rx="3" fill="${C.mint}"/>`);
  else add(`<rect x="${mx + half + b * half}" y="${my}" width="${-b * half}" height="6" rx="3" fill="${C.rose}"/>`);
  add(`<rect x="${mx + half - 0.5}" y="${my - 2}" width="1" height="10" fill="${C.muted}" fill-opacity="0.4"/>`);
});

// ── center: Henry ──
const HX = 410,
  HW = 600;
add(glass(HX, 188, HW, 724));
const ccx = HX + HW / 2;
const barY = 188 + 724 * 0.62;
// ambient rings
add(`<circle cx="${ccx}" cy="${barY - 150}" r="250" fill="none" stroke="${C.violet}" stroke-opacity="0.12"/>`);
add(`<circle cx="${ccx}" cy="${barY - 150}" r="185" fill="none" stroke="${C.azure}" stroke-opacity="0.14"/>`);
// face particles: sample head + bust
function lerpColor(t) {
  // sky -> violet across t 0..1
  const a = [90, 169, 255],
    b = [138, 123, 255];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const headCy = barY - 230,
  headR = 150;
let particles = "";
for (let i = 0; i < 1400; i++) {
  // pick a point in head ellipse or bust
  let px, py, ok = false, tries = 0;
  while (!ok && tries++ < 5) {
    const region = Math.random();
    if (region < 0.62) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random());
      px = ccx + Math.cos(ang) * rr * headR * 0.92;
      py = headCy + Math.sin(ang) * rr * headR * 1.12;
      ok = true;
    } else {
      // shoulders triangle-ish
      const t = Math.random();
      const spreadX = headR * (0.7 + t * 1.7);
      px = ccx + (Math.random() * 2 - 1) * spreadX;
      py = headCy + headR * 1.0 + t * (barY - (headCy + headR));
      if (py < barY) ok = true;
    }
  }
  if (!ok) continue;
  const ty = (py - (headCy - headR * 1.12)) / (barY - (headCy - headR * 1.12));
  const r = 1 + Math.random() * 2.4;
  const op = 0.5 + Math.random() * 0.4;
  particles += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="${lerpColor(Math.min(1, ty))}" fill-opacity="${op.toFixed(2)}"/>`;
}
add(particles);
// bar line
add(`<rect x="${ccx - HW * 0.4}" y="${barY - 1.5}" width="${HW * 0.8}" height="3" fill="url(#bar)"/>`);
add(`<rect x="${ccx - HW * 0.4}" y="${barY - 5}" width="${HW * 0.8}" height="10" fill="url(#bar)" opacity="0.3"/>`);
// dust below
let dust = "";
for (let i = 0; i < 700; i++) {
  const t = Math.random();
  const dx = ccx + (Math.random() * 2 - 1) * (HW * 0.22) * (1 + t * 0.5);
  const dy = barY + t * (912 - barY - 20);
  const r = 0.5 + Math.random() * 1.6 * (1 - t * 0.5);
  const op = (1 - t) * 0.6 * Math.random();
  const col = Math.random() < 0.5 ? "#9db9ff" : "#b9a9ff";
  dust += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}" fill-opacity="${op.toFixed(2)}"/>`;
}
add(dust);
// name + status
add(text(ccx, 224, "H E N R Y", { size: 16, w: 700, fill: C.ink, anchor: "middle", spacing: 4 }));
add(`<circle cx="${ccx - 38}" cy="240" r="3" fill="${C.mint}"/>`);
add(text(ccx + 6, 244, "Speaking", { size: 12, fill: C.muted, anchor: "middle" }));
// caption bubble
add(`<rect x="${HX + 60}" y="858" width="${HW - 120}" height="40" rx="18" fill="#fff" fill-opacity="0.8" stroke="${C.line}"/>`);
add(text(ccx, 883, "“Momentum and sentiment agree — scaling into EUR/USD.”", { size: 13, w: 600, fill: C.ink, anchor: "middle" }));

// ── right column ──
const RX = 1032,
  RW = 380;
add(glass(RX, 188, RW, 360));
add(text(RX + 18, 216, "Open Trades", { size: 14, w: 700 }));
add(chip(RX + RW - 76, 202, 60, "5 live", C.azure, C.azure));
const trades = [
  ["EUR/USD", "LONG", "+$1,240", "+2.1%", true, C.mint],
  ["XAU/USD", "SHORT", "-$320", "-0.6%", true, C.rose],
  ["BTC/USDT", "LONG", "+$3,580", "+5.4%", true, C.mint],
  ["USD/JPY", "SHORT", "+$640", "+1.2%", false, C.mint],
];
const tw = (RW - 32 - 12) / 2;
trades.forEach((t, i) => {
  const x = RX + 16 + (i % 2) * (tw + 12);
  const y = 234 + Math.floor(i / 2) * 148;
  add(`<rect x="${x}" y="${y}" width="${tw}" height="136" rx="16" fill="#fff" fill-opacity="0.7" stroke="${C.line}"/>`);
  add(`<rect x="${x}" y="${y}" width="${tw}" height="3" rx="1.5" fill="${t[5]}" fill-opacity="0.6"/>`);
  const lc = t[1] === "LONG" ? C.mint : C.rose;
  add(`<rect x="${x + 12}" y="${y + 12}" width="26" height="26" rx="8" fill="${lc}" fill-opacity="0.15"/>`);
  add(text(x + 25, y + 29, t[1] === "LONG" ? "↗" : "↘", { size: 14, w: 700, fill: lc, anchor: "middle" }));
  add(text(x + 46, y + 26, t[0], { size: 13, w: 700 }));
  add(text(x + 46, y + 40, `${t[1]} · 5x`, { size: 9, w: 600, fill: C.muted, spacing: 0.5 }));
  add(text(x + 12, y + 74, t[2], { size: 18, w: 700, fill: lc }));
  add(text(x + 12, y + 92, t[3], { size: 12, w: 600, fill: lc }));
  add(`<line x1="${x + 12}" y1="${y + 104}" x2="${x + tw - 12}" y2="${y + 104}" stroke="${C.line}"/>`);
  if (t[4]) add(text(x + 12, y + 124, "🛡 TP/SL set", { size: 10, fill: C.muted }));
  else add(text(x + 12, y + 124, "＋ Add TP/SL", { size: 10, w: 600, fill: C.azure }));
});

// henry's mind
add(glass(RX, 560, RW, 352));
add(text(RX + 18, 588, "✦ Henry's Mind", { size: 14, w: 700, fill: C.ink }));
const mind = [
  ["Momentum and sentiment agree — scaling into EUR/USD.", C.mint],
  ["Liquidity Breakout signal on BTC. Hunting the move.", C.azure],
  ["Vol spiking on XAU/USD — trimming risk now.", C.rose],
  ["Re-weighting the ensemble in real time.", C.azure],
  ["Connected to OANDA (practice). Monitoring only.", C.azure],
  ["Scanning 312 markets across 14 venues…", C.azure],
];
mind.forEach((m, i) => {
  const y = 614 + i * 46;
  add(`<circle cx="${RX + 24}" cy="${y - 3}" r="3" fill="${m[1]}"/>`);
  add(text(RX + 38, y, m[0], { size: 12, fill: "#3a435e" }));
});

// footer
add(text(W / 2, 928, "Rift Hunter · Henry runs the world's best strategies, all at once. Simulated — not financial advice.", { size: 11, fill: C.muted, anchor: "middle" }));

add(`</svg>`);
writeFileSync(new URL("../preview.svg", import.meta.url), s);
console.log("wrote preview.svg", s.length, "bytes");
