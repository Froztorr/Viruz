// ── EQUIPMENT CIRCUIT BOARD BACKGROUND ──
// renderPdEquip() renders:
//   <img class="eq-board-bg" src="assets/ui/equip_circuit_bg.jpg">
// but that file is not in the repository (checked the whole assets tree).
// So the Equipment tab was loading a broken image and the sockets ended up
// floating on the plain panel colour. Nothing deleted it in the rarity work
// -- the reference has simply been pointing at a missing file.
//
// The board is drawn here as an inline SVG data URI instead of shipping a
// JPEG, because binary files cannot be pushed from this environment. Being
// vector, it also stays sharp at any screen size and costs ~3 KB instead of
// a few hundred.
//
// This only sets the src of the existing <img>. It does not touch layout,
// and it adds no CSS, so nothing else on the screen can be overridden.
// If a real painted board is added at assets/ui/equip_circuit_bg.jpg later,
// delete this module's import from main.js and the original art loads again.

// Socket centres, as percentages, MUST match EQ_SOCKET_LAYOUT in
// screens/pet-detail.js. The board is drawn on a 1000x1300 grid, so a
// percentage maps to x*10 and y*13.
const SOCKETS = [
  { x: 27.5, y: 20.3, size: 17.5, round: false },   // payload
  { x: 72.4, y: 20.3, size: 17.5, round: false },   // exploit
  { x: 49.9, y: 49.9, size: 17.5, round: false },   // rootkit
  { x: 50.0, y: 79.2, size: 25.0, round: true  },   // habit data card
];

const W = 1000, H = 1300;
const px = p => Math.round(p * 10);
const py = p => Math.round(p * 13);

const CYAN = '#3df0ff';
const VIOLET = '#a56bff';
const GOLD = '#ffcf3f';

function gridLines() {
  let out = '';
  for (let x = 50; x < W; x += 50) out += `<path d="M${x},0 V${H}"/>`;
  for (let y = 50; y < H; y += 50) out += `<path d="M0,${y} H${W}"/>`;
  return `<g stroke="${CYAN}" stroke-opacity=".055" stroke-width="2">${out}</g>`;
}

// Traces run socket-to-socket so the board reads as one circuit feeding the
// pet, rather than as decorative noise behind unrelated slots.
function traces() {
  const pay = { x: px(27.5), y: py(20.3) };
  const exp = { x: px(72.4), y: py(20.3) };
  const root = { x: px(49.9), y: py(49.9) };
  const hab = { x: px(50.0), y: py(79.2) };
  const padHalf = Math.round(px(17.5) / 2) + 12;   // socket half-width + margin
  const busY = Math.round((pay.y + root.y) / 2);
  const d = [
    // payload and exploit both drop into a shared bus, then into rootkit
    `M${pay.x},${pay.y + padHalf} V${busY} H${root.x}`,
    `M${exp.x},${exp.y + padHalf} V${busY} H${root.x}`,
    `M${root.x},${busY} V${root.y - padHalf}`,
    // rootkit feeds the habit card
    `M${root.x},${root.y + padHalf} V${hab.y - px(25) / 2 - 14}`,
    // side rails, so the bus does not float unconnected in the middle
    `M120,${busY} H${pay.x}`,
    `M${exp.x},${busY} H880`,
    `M120,${busY} V200 H${pay.x - padHalf}`,
    `M880,${busY} V200 H${exp.x + padHalf}`,
    `M120,${busY} V${hab.y} H${hab.x - px(25) / 2 - 14}`,
    `M880,${busY} V${hab.y} H${hab.x + px(25) / 2 + 14}`,
    `M${hab.x},${hab.y + px(25) / 2 + 14} V1210`,
  ].join(' ');
  return (
    `<path d="${d}" fill="none" stroke="${CYAN}" stroke-opacity=".14" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${CYAN}" stroke-opacity=".55" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

// Solder pads sit under each socket so an empty slot still looks like a
// place where something belongs.
function pads() {
  let out = '';
  SOCKETS.forEach(s => {
    const cx = px(s.x), cy = py(s.y);
    if (s.round) {
      const r = Math.round(px(s.size) / 2);
      out +=
        `<circle cx="${cx}" cy="${cy}" r="${r + 14}" fill="#0b1a26" fill-opacity=".8" stroke="${VIOLET}" stroke-opacity=".5" stroke-width="5"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="none" stroke="${GOLD}" stroke-opacity=".3" stroke-width="3" stroke-dasharray="14 12"/>`;
    } else {
      const h = Math.round(px(s.size) / 2) + 14;
      out +=
        `<rect x="${cx - h}" y="${cy - h}" width="${h * 2}" height="${h * 2}" rx="18" fill="#0b1a26" fill-opacity=".8" stroke="${VIOLET}" stroke-opacity=".5" stroke-width="5"/>` +
        `<rect x="${cx - h + 16}" y="${cy - h + 16}" width="${(h - 16) * 2}" height="${(h - 16) * 2}" rx="10" fill="none" stroke="${GOLD}" stroke-opacity=".28" stroke-width="3" stroke-dasharray="14 12"/>`;
    }
    // corner solder points
    [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx, sy]) => {
      const o = Math.round(px(s.size) / 2) + 30;
      out += `<circle cx="${cx + sx * o}" cy="${cy + sy * o}" r="6" fill="${CYAN}" fill-opacity=".45"/>`;
    });
  });
  return out;
}

// Mounting holes and a couple of surface chips, purely so the empty areas
// of the board are not dead space.
function furniture() {
  const hole = (x, y) =>
    `<circle cx="${x}" cy="${y}" r="18" fill="#050a10" stroke="${CYAN}" stroke-opacity=".3" stroke-width="4"/>`;
  const chip = (x, y, w, h) => {
    let pins = '';
    for (let i = x + 12; i < x + w - 6; i += 16) {
      pins += `<path d="M${i},${y} V${y - 10} M${i},${y + h} V${y + h + 10}"/>`;
    }
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#0a1420" stroke="${CYAN}" stroke-opacity=".28" stroke-width="3"/>` +
      `<g stroke="${GOLD}" stroke-opacity=".35" stroke-width="3">${pins}</g>`
    );
  };
  return (
    hole(62, 62) + hole(W - 62, 62) + hole(62, H - 62) + hole(W - 62, H - 62) +
    chip(120, 980, 130, 60) + chip(W - 250, 980, 130, 60) +
    chip(px(50) - 65, 120, 130, 52)
  );
}

function boardSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<defs>` +
      `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#0e1c26"/><stop offset="1" stop-color="#070c13"/>` +
      `</linearGradient>` +
      `<radialGradient id="vig" cx=".5" cy=".42" r=".72">` +
        `<stop offset="0" stop-color="#14384c" stop-opacity=".85"/>` +
        `<stop offset="1" stop-color="#050a10" stop-opacity="0"/>` +
      `</radialGradient>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" rx="28" fill="url(#bg)"/>` +
    `<rect width="${W}" height="${H}" rx="28" fill="url(#vig)"/>` +
    gridLines() +
    traces() +
    furniture() +
    pads() +
    `<rect x="6" y="6" width="${W - 12}" height="${H - 12}" rx="26" fill="none" stroke="${CYAN}" stroke-opacity=".35" stroke-width="5"/>` +
    `</svg>`
  );
}

let DATA_URI = null;
function dataUri() {
  if (!DATA_URI) {
    DATA_URI = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(boardSvg());
  }
  return DATA_URI;
}

// The Equipment page is rebuilt on every equip/unequip and on every tab
// swipe, so a fresh <img> appears each time -- hence an observer rather than
// a one-off pass. data-board marks the ones already swapped.
function applyBoard(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('img.eq-board-bg:not([data-board])').forEach(img => {
    img.dataset.board = 'svg';
    img.src = dataUri();
  });
}

let queued = false;
function queueApply() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; applyBoard(document); });
}

function observe() {
  if (!document.body) return;
  new MutationObserver(queueApply).observe(document.body, { childList: true, subtree: true });
  queueApply();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe);
else observe();
