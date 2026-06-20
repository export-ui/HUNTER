// Mockup of Lovable's GitHub connection page in the desired (linked) state.
import { writeFileSync } from "node:fs";

const W = 1200, H = 760;
const C = {
  bg: "#fbf8f4", panel: "#ffffff", ink: "#1c1b19", muted: "#8a847c",
  line: "#ece7df", line2: "#e2ddd4", green: "#1f9d62", greenbg: "#e7f6ee",
  btn: "#1c1b19", chipbg: "#f4f1ec",
};
let s = "";
const add = (x) => (s += x);
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const T = (x, y, t, o = {}) =>
  `<text x="${x}" y="${y}" font-family="Inter,system-ui,sans-serif" font-size="${o.size || 15}" font-weight="${o.w || 400}" fill="${o.fill || C.ink}" ${o.anchor ? `text-anchor="${o.anchor}"` : ""}>${esc(t)}</text>`;

add(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
add(`<rect width="${W}" height="${H}" fill="${C.bg}"/>`);
add(`<rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="20" fill="${C.panel}" stroke="${C.line2}"/>`);

// breadcrumb
add(T(72, 92, "⌥ Git", { fill: C.muted }));
add(T(132, 92, "/", { fill: C.muted }));
add(T(150, 92, "GitHub", { fill: C.muted }));
add(T(222, 92, "/", { fill: C.muted }));
add(T(240, 92, "export-ui", { fill: C.ink, w: 600 }));
add(`<line x1="72" y1="112" x2="${W - 72}" y2="112" stroke="${C.line}"/>`);

// connection card
add(`<rect x="72" y="136" width="${W - 144}" height="116" rx="14" fill="${C.panel}" stroke="${C.line2}"/>`);
add(`<rect x="96" y="160" width="64" height="64" rx="14" fill="#f4f1ec" stroke="${C.line2}"/>`);
add(`<circle cx="128" cy="192" r="20" fill="#1c1b19"/><circle cx="128" cy="188" r="9" fill="#fff"/><rect x="123" y="196" width="10" height="12" rx="3" fill="#fff"/>`);
add(T(180, 184, "export-ui", { size: 22, w: 700 }));
add(T(180, 212, "Created by export@boncuisinebrand.com, last updated just now", { fill: C.muted, size: 14 }));
const cfgX = W - 72 - 340;
add(`<rect x="${cfgX}" y="170" width="220" height="44" rx="11" fill="${C.panel}" stroke="${C.line2}"/>`);
add(T(cfgX + 110, 197, "Configure on GitHub ↗", { anchor: "middle", w: 600, size: 14 }));
const docX = W - 72 - 108;
add(`<rect x="${docX}" y="170" width="108" height="44" rx="11" fill="${C.panel}" stroke="${C.line2}"/>`);
add(T(docX + 54, 197, "Open docs ↗", { anchor: "middle", w: 600, size: 14 }));

// Linked projects heading + badge
add(T(72, 300, "Linked projects", { size: 22, w: 700 }));
add(`<rect x="242" y="284" width="120" height="24" rx="12" fill="${C.greenbg}"/>`);
add(T(302, 301, "✓ 1 linked", { anchor: "middle", fill: C.green, w: 600, size: 13 }));

// linked project row (DESIRED STATE)
const ry = 326, rh = 96;
add(`<rect x="72" y="${ry}" width="${W - 144}" height="${rh}" rx="14" fill="${C.panel}" stroke="${C.green}" stroke-opacity="0.55"/>`);
add(`<rect x="96" y="${ry + 18}" width="60" height="60" rx="12" fill="#0e1530"/>`);
add(`<circle cx="126" cy="${ry + 44}" r="15" fill="#2e7bf6" opacity="0.9"/>`);
for (let i = 0; i < 12; i++) {
  const a = Math.random() * 6.28, r = 10 + Math.random() * 8;
  add(`<circle cx="${(126 + Math.cos(a) * r).toFixed(0)}" cy="${(ry + 44 + Math.sin(a) * r).toFixed(0)}" r="${(0.8 + Math.random()).toFixed(1)}" fill="#8a7bff" opacity="0.85"/>`);
}
add(T(176, ry + 40, "Rift Hunter", { size: 18, w: 700 }));
add(T(176, ry + 64, "export-ui/rift-hunter", { fill: C.muted, size: 14 }));
add(`<rect x="376" y="${ry + 50}" width="86" height="22" rx="11" fill="${C.chipbg}"/>`);
add(T(419, ry + 65, "⎇ main", { anchor: "middle", size: 12, w: 600 }));
const syncX = W - 72 - 260;
add(`<rect x="${syncX}" y="${ry + 36}" width="118" height="26" rx="13" fill="${C.greenbg}"/>`);
add(`<circle cx="${syncX + 18}" cy="${ry + 49}" r="4" fill="${C.green}"/>`);
add(T(syncX + 70, ry + 53, "Synced", { anchor: "middle", fill: C.green, w: 600, size: 13 }));
const openX = W - 72 - 126;
add(`<rect x="${openX}" y="${ry + 34}" width="102" height="30" rx="9" fill="${C.btn}"/>`);
add(T(openX + 51, ry + 54, "Open ↗", { anchor: "middle", fill: "#fff", w: 600, size: 13 }));

// annotation
const ay = ry + rh + 28;
add(`<rect x="72" y="${ay}" width="${W - 144}" height="72" rx="12" fill="${C.greenbg}" stroke="${C.green}" stroke-opacity="0.35"/>`);
add(T(96, ay + 30, "✓  TARGET STATE: your Rift Hunter project appears here, linked to", { fill: C.green, w: 700, size: 15 }));
add(T(96, ay + 54, "export-ui/rift-hunter on branch main, status Synced.", { fill: "#2c7a52", size: 14 }));
add(T(96, ay + 54 + 0, "", {}));

add(`</svg>`);
writeFileSync(new URL("../lovable-target.svg", import.meta.url), s);
console.log("wrote lovable-target.svg", s.length);
