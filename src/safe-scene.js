// ═══════════════════════════════════════════════════════════
// SAFE SPOT SCENE — per-map merchant + tavern-door entrance
//
// ── 1. THE MERCHANT WAS THE SAME EVERYWHERE ──
// The portrait is hardcoded in index.html as a single
// <img class="npc-portrait" src="assets/ui/merchant.webp">, and
// renderSafeSpot() (src/battle/encounters.js) only ever fills in the
// name, the greeting, the rest button and the potion list -- it never
// touches that src. So every safe spot in every realm showed the same
// face no matter which map you were standing in, and the pictures in
// assets/merchant were never loaded by anything.
//
// This module points the portrait at the picture belonging to whichever
// map the safe node lives in. Maps with no art of their own (the three
// Galaxy sub-map safe spots) keep the original default, so adding a
// picture later is a one-line change to MERCHANT_BY_MAP.
//
// ── 2. THE DOORS ──
// Walking into a safe spot now opens a pair of tavern doors over the
// scene, and the safe-spot page is what is behind them.
//
// They are drawn in CSS/DOM instead of played from the supplied clip.
// The reason is the clip itself: despite the name, that mp4 is NOT
// transparent -- it is h264/yuv420p, a format that cannot carry an alpha
// channel at all, and every pixel around the doors is solid black.
// Dropping it on top of the scene would have dropped a black rectangle
// on top of the scene. Blending the black away (mix-blend-mode:screen)
// does not work here either, because the doors themselves are dark brown
// -- they would come out as a faint ghost. The black can be keyed into a
// real alpha channel and re-encoded as VP9 WebM, but that is a binary
// file that has to be committed to the repo.
//
// So the doors are drawn instead: no asset to download, sharp at any
// screen size, a few KB of markup, and it cannot 404. If
// assets/fx/tavern_doors.webm ever is uploaded, playDoors() finds it on
// its own and plays that instead of the drawn version.
//
// The drawn doors follow the reference frame-for-frame: bevel-topped
// leaves, four planks each with seams, three recessed panels, three
// riveted iron bands, gold ring handles either side of the centre seam,
// a plank lintel above, and the gold dust that drifts up through the gap
// as they swing.
//
// ── HOOKING IN ──
// No edits to world.js or encounters.js. openWindow() in ui-shell.js
// stamps the visible page onto #win-main as data-pane, so one
// MutationObserver on that one attribute is enough to know a safe spot
// was entered -- and because observer callbacks run after the current
// task, runScreenRenderer('safe') has already painted by the time we
// swap the portrait and raise the doors.
// ═══════════════════════════════════════════════════════════

import { zoneById } from './data.js';
import { G } from './state.js';

// Map id -> portrait. Arrays are tried in order, so the Red Giant entry
// covers both the current filename (which has a SPACE in it, hence the
// %20) and the underscored name it should really be renamed to.
const MERCHANT_BY_MAP = {
  forest:     ['assets/merchant/merchant_forest.jpeg'],
  hell:       ['assets/merchant/merchant_hell.jpeg'],
  galaxy_red: ['assets/merchant/merchant_red_star.jpeg',
               'assets/merchant/merchant_red%20star.jpeg'],
  board:      ['assets/merchant/merchant_board.jpeg'],
};
const DEFAULT_MERCHANT = 'assets/ui/merchant.webp';

// Optional real clip. Absent from the repo today; if it is ever added,
// it wins over the drawn doors automatically.
const DOOR_VIDEO = 'assets/fx/tavern_doors.webm';

const OPEN_MS = 900;    // how long the leaves take to swing
const HOLD_MS = 260;    // closed beat before they move, so they read as doors
const FADE_MS = 420;

let doorVideoUrl = null;   // set by probeDoorVideo() if the file exists
let activeDoors = null;

// ═══════════════ MERCHANT PORTRAIT ═══════════════

// Which map's safe spot is being shown. G.lastSafe is the zone id the
// world map just sent us to, and every zone carries its own map id --
// more reliable than G.currentMapId, which a Galaxy hub jump can leave
// pointing at the parent map.
function safeMapId() {
  const zone = G.lastSafe ? zoneById(G.lastSafe) : null;
  return (zone && zone.map) || G.currentMapId || null;
}

function applyMerchantPortrait() {
  const img = document.querySelector('#safe-npc-scene .npc-portrait');
  if (!img) return;
  const mapId = safeMapId();
  const candidates = [...(MERCHANT_BY_MAP[mapId] || []), DEFAULT_MERCHANT];

  // Walk the candidate list on error. img-fallback.js only handles the
  // .gif -> .png creature case, so the portrait needs its own chain --
  // and without one, a typo'd filename would leave a broken image icon
  // sitting in the middle of the scene.
  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) { img.onerror = null; return; }
    const url = candidates[i++];
    img.onerror = tryNext;
    img.src = url;
  };

  img.dataset.merchantMap = mapId || '';
  tryNext();
}

// ═══════════════ TAVERN DOORS ═══════════════

const CSS = `
.tavern-doors{position:absolute;inset:0;z-index:80;overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  --wood:#6b3b18;--wood-d:#40210d;--wood-l:#8a5024;--wood-x:#2a1408;
  --iron:#15100c;--gold:#e2a83e;--wall:#07040a;
  transition:opacity ${FADE_MS}ms ease;}
.tavern-doors.td-out{opacity:0;}

/* The frame casts one enormous shadow, which IS the wall: everything
   outside the doorway is covered, and the doorway itself stays a real
   hole -- so the safe-spot page is genuinely revealed through it as the
   leaves swing, not faded in behind a picture of a hole. */
.td-frame{position:relative;height:84%;aspect-ratio:.6;
  box-shadow:0 0 0 9999px var(--wall);}
.td-frame.td-creak{animation:tdCreak ${HOLD_MS}ms ease-in-out;}

.td-doorway{position:absolute;inset:7.5% 6% 2.5% 6%;
  perspective:1300px;transform-style:preserve-3d;}

.td-jamb{position:absolute;background:
  linear-gradient(90deg,var(--wood-x),var(--wood) 45%,var(--wood-l) 60%,var(--wood-d));
  box-shadow:inset 0 0 0 2px rgba(0,0,0,.55);}
.td-j-l{left:0;top:6%;bottom:0;width:6%;}
.td-j-r{right:0;top:6%;bottom:0;width:6%;}
.td-j-b{left:0;right:0;bottom:0;height:3%;background:
  linear-gradient(180deg,var(--wood-l),var(--wood-d));}

/* Lintel: a beam of angled planks sitting proud of the frame, same as
   the reference. */
.td-lintel{position:absolute;left:-2%;right:-2%;top:0;height:7.5%;
  background:linear-gradient(180deg,var(--wood) 0%,var(--wood-d) 100%);
  border:2px solid #170b04;border-radius:3px;overflow:hidden;
  box-shadow:0 3px 10px rgba(0,0,0,.6);}
.td-lintel i{position:absolute;top:-20%;height:140%;width:2px;
  background:rgba(0,0,0,.42);transform:rotate(14deg);}

.td-leaf{position:absolute;top:0;bottom:0;width:50%;
  background:
    repeating-linear-gradient(90deg,rgba(0,0,0,.34) 0 1.5px,transparent 1.5px 24%),
    linear-gradient(180deg,#7a4319,#5d3315 55%,#4a2610);
  border:2px solid #170b04;
  backface-visibility:hidden;will-change:transform;}
/* Bevelled top and bottom edges -- the leaves are not plain rectangles */
.td-l-left{left:0;transform-origin:left center;
  clip-path:polygon(0 2%,100% 0,100% 100%,0 98%);}
.td-l-right{right:0;transform-origin:right center;
  clip-path:polygon(0 0,100% 2%,100% 98%,0 100%);}
.td-open .td-l-left{animation:tdOpenL ${OPEN_MS}ms cubic-bezier(.45,.02,.2,1) forwards;}
.td-open .td-l-right{animation:tdOpenR ${OPEN_MS}ms cubic-bezier(.45,.02,.2,1) forwards;}

.td-panel{position:absolute;left:14%;right:14%;height:19%;
  background:linear-gradient(180deg,#834a1e,#6a3a16);
  border:2px solid #33190a;border-radius:7px;
  box-shadow:inset 0 2px 5px rgba(255,190,120,.14),inset 0 -3px 6px rgba(0,0,0,.4);}
.td-band{position:absolute;left:-2%;right:-2%;height:5.5%;
  background:linear-gradient(180deg,#241c16,var(--iron));
  border-top:1px solid rgba(255,255,255,.06);
  box-shadow:0 2px 5px rgba(0,0,0,.5);
  display:flex;align-items:center;justify-content:space-around;}
.td-band b{width:9%;max-width:11px;aspect-ratio:1;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#4b4038,#0c0907 70%);}
.td-ring{position:absolute;top:47%;width:15%;aspect-ratio:1;border-radius:50%;
  border:3px solid var(--gold);
  box-shadow:0 0 8px rgba(226,168,62,.5),inset 0 0 4px rgba(0,0,0,.6);}
.td-ring::after{content:'';position:absolute;inset:32%;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#f3cd7c,var(--gold) 70%);}
.td-l-left .td-ring{right:8%;}
.td-l-right .td-ring{left:8%;}

/* Warm light and gold dust spilling out of the widening gap. */
.td-glow{position:absolute;inset:0;opacity:0;pointer-events:none;
  background:radial-gradient(ellipse 42% 60% at 50% 55%,rgba(255,196,102,.55),transparent 70%);}
.td-open .td-glow{animation:tdGlow ${OPEN_MS + HOLD_MS}ms ease-out forwards;}
.td-dust{position:absolute;inset:0;pointer-events:none;overflow:hidden;}
.td-dust i{position:absolute;bottom:22%;width:4px;height:4px;border-radius:50%;
  background:var(--gold);opacity:0;box-shadow:0 0 6px rgba(226,168,62,.9);}
.td-open .td-dust i{animation:tdMote 1.5s ease-out forwards;}

.td-skip{position:absolute;right:12px;bottom:10px;z-index:2;
  font:12px/1 'Share Tech Mono',ui-monospace,monospace;color:#7b6a52;
  background:none;border:0;padding:6px;}

.td-video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;}

@keyframes tdCreak{0%,100%{transform:translateX(0)}30%{transform:translateX(-3px)}60%{transform:translateX(2px)}}
@keyframes tdOpenL{from{transform:rotateY(0)}to{transform:rotateY(-116deg)}}
@keyframes tdOpenR{from{transform:rotateY(0)}to{transform:rotateY(116deg)}}
@keyframes tdGlow{0%{opacity:0}55%{opacity:.85}100%{opacity:.3}}
@keyframes tdMote{0%{opacity:0;transform:translateY(0) scale(.5)}
  25%{opacity:1}100%{opacity:0;transform:translateY(-190px) scale(1.1)}}

@media (prefers-reduced-motion:reduce){
  .td-frame.td-creak{animation:none;}
  .td-open .td-l-left,.td-open .td-l-right{animation-duration:1ms;}
  .td-open .td-dust i{animation:none;}
}
`;

function injectCss() {
  if (document.getElementById('tavern-doors-css')) return;
  const style = document.createElement('style');
  style.id = 'tavern-doors-css';
  style.textContent = CSS;
  (document.head || document.documentElement).appendChild(style);
}

function leafHtml(side) {
  const panels = [9, 39, 69].map(top => `<i class="td-panel" style="top:${top}%"></i>`).join('');
  const rivets = '<b></b>'.repeat(4);
  const bands = [4, 46, 88].map(top => `<i class="td-band" style="top:${top}%">${rivets}</i>`).join('');
  return `<div class="td-leaf td-l-${side}">${panels}${bands}<i class="td-ring"></i></div>`;
}

function doorsMarkup() {
  const slashes = Array.from({ length: 9 },
    (_, i) => `<i style="left:${6 + i * 11}%"></i>`).join('');
  const motes = Array.from({ length: 14 }, () => {
    const left = 32 + Math.random() * 36;
    const delay = (0.25 + Math.random() * 0.7).toFixed(2);
    const scale = (0.5 + Math.random()).toFixed(2);
    return `<i style="left:${left.toFixed(1)}%;animation-delay:${delay}s;transform:scale(${scale})"></i>`;
  }).join('');
  return `
    <div class="td-frame td-creak">
      <div class="td-doorway">
        <div class="td-glow"></div>
        ${leafHtml('left')}${leafHtml('right')}
        <div class="td-dust">${motes}</div>
      </div>
      <span class="td-jamb td-j-l"></span>
      <span class="td-jamb td-j-r"></span>
      <span class="td-jamb td-j-b"></span>
      <div class="td-lintel">${slashes}</div>
    </div>
    <button class="td-skip" type="button">ข้าม ›</button>`;
}

function videoMarkup() {
  return `<video class="td-video" src="${doorVideoUrl}" muted playsinline autoplay></video>
    <button class="td-skip" type="button">ข้าม ›</button>`;
}

// Mount over the safe-spot pane. The pane is the "scene" the doors sit
// on top of; the overlay is absolute inside it, so the window chrome,
// the top bar and the drawer knob all stay reachable.
export function playDoors(host) {
  const stage = host || document.getElementById('screen-safe');
  if (!stage) return;
  injectCss();
  removeDoors();

  // .pane is laid out by the stylesheet and may be position:static;
  // an absolute overlay needs a positioned ancestor or it would escape
  // to the window and cover the titlebar.
  if (getComputedStyle(stage).position === 'static') stage.style.position = 'relative';

  const root = document.createElement('div');
  root.className = 'tavern-doors';
  root.innerHTML = doorVideoUrl ? videoMarkup() : doorsMarkup();
  stage.appendChild(root);
  activeDoors = root;

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    root.classList.add('td-out');
    setTimeout(() => { root.remove(); if (activeDoors === root) activeDoors = null; }, FADE_MS);
  };

  root.querySelector('.td-skip').onclick = finish;
  root.addEventListener('pointerdown', finish);

  if (doorVideoUrl) {
    const vid = root.querySelector('video');
    vid.onended = finish;
    vid.onerror = () => { doorVideoUrl = null; finish(); };
    vid.play().catch(() => {});
    setTimeout(finish, 4000);   // never leave the overlay up if the clip stalls
    return;
  }

  // Closed beat with a creak, then the swing, then out of the way.
  setTimeout(() => root.classList.add('td-open'), HOLD_MS);
  setTimeout(finish, HOLD_MS + OPEN_MS - 120);
}

function removeDoors() {
  if (!activeDoors) return;
  activeDoors.remove();
  activeDoors = null;
}

// One HEAD request, once, at idle: if the real clip was uploaded, use it
// from the next safe spot onward.
function probeDoorVideo() {
  const run = () => {
    fetch(new URL(DOOR_VIDEO, document.baseURI).href, { method: 'HEAD' })
      .then(res => { if (res.ok) doorVideoUrl = DOOR_VIDEO; })
      .catch(() => {});
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 6000 });
  else setTimeout(run, 4000);
}

// The portraits are big photos, so pull them into cache while the player
// is still walking around the map rather than at the moment the scene
// opens. preload.js also finds them by crawling this file's source, but
// this keeps the module self-sufficient.
function warmPortraits() {
  const run = () => {
    Object.values(MERCHANT_BY_MAP).forEach(list => { new Image().src = list[0]; });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 10000 });
  else setTimeout(run, 6000);
}

// ═══════════════ HOOK ═══════════════

function onPaneChange(pane) {
  if (pane !== 'safe') { removeDoors(); return; }
  applyMerchantPortrait();
  playDoors();
}

function start() {
  const win = document.getElementById('win-main');
  if (!win) return;
  new MutationObserver(() => onPaneChange(win.dataset.pane))
    .observe(win, { attributes: true, attributeFilter: ['data-pane'] });
  // Resuming a save directly into a safe spot sets data-pane during
  // boot, which may already have happened by now.
  if (win.dataset.pane === 'safe') onPaneChange('safe');
  probeDoorVideo();
  warmPortraits();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}

// Console helpers: VIRUZ_SAFE.doors() replays the animation over
// whatever is on screen, VIRUZ_SAFE.portraits shows the current mapping.
if (typeof window !== 'undefined') {
  window.VIRUZ_SAFE = {
    doors: () => playDoors(document.getElementById('win-main-body')),
    portraits: MERCHANT_BY_MAP,
    refresh: applyMerchantPortrait,
  };
}
