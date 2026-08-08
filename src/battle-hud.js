// ────────────────────────────────────────────────────────────────
// VIRUZ — PIXEL BATTLE HUD
// 8-bit HP/MP icons + Rockman-style segmented SPD/CRT bars.
//
// WHY THIS IS A SEPARATE MODULE (read before moving any of it):
//
// 1. styles.css is 144 KB and owns the original .vital / .gauge-bar
//    rules. Rewriting that whole file to restyle six selectors is a
//    much bigger blast radius than overriding them from here, so this
//    module injects its own sheet and wins on specificity by prefixing
//    every selector with #battle-stage (plus !important where the
//    legacy rule is equally specific).
//
// 2. The DOM is NOT rebuilt here, and no class is renamed. combat.js
//    keeps ownership of the markup: renderBattleSide() paints .vital /
//    .gauge-bar once, then updateVital() / updateGaugeBar() mutate
//    .vital-fill, .vital-num and .gauge-bar-fill IN PLACE on every
//    turn. If this module replaced those elements or renamed their
//    classes, those in-place updaters would silently stop finding them
//    and every gauge would freeze at its first painted value. So:
//    same elements, same class names, new skin. The clip-path-from-
//    the-top drain mechanic still does all the work — the Rockman
//    segments are just a repeating-linear-gradient sitting behind it,
//    so the clip reveals them one cell at a time for free.
//
// 3. The only two DOM changes are structural moves:
//      - ally HP + MP are wrapped in .np-vitals-inline so the MP orb
//        sits BESIDE the HP heart. That wrapper and its CSS already
//        existed in combat.js for the enlarged-sprite case; now it is
//        simply always used.
//      - the foe's .gauge-bars is pinned to the bottom-right corner of
//        #battle-stage so it stops sitting on top of the enemy sprite.
//        It deliberately stays a CHILD of #plate-foe, because
//        refreshUnitVitals() finds it with
//        plate.querySelector('.gauge-bar.spd') — reparenting it would
//        break the per-turn refresh (exactly the bug class in note 2).
//        Position is measured from getBoundingClientRect, not guessed,
//        because the plate's own box is defined in the unreadable
//        styles.css.
//
// 4. Observer safety: the body observer watches childList ONLY, and
//    both fixups are idempotent — a second pass makes no childList
//    mutations at all (class + inline style are attribute writes, which
//    this observer does not watch), so it settles instead of looping.
//    See the galaxy.js gate comment for the original hazard.
//
// NOT here: the enemy bonus crit. runTurn() in battle/turn-loop.js
// already auto-fires it for a foe the instant critGauge reaches 1
// (`if (attacker.critGauge >= 1 && side === 'foe' ...)`), so there is
// nothing to add — only to make the full bar read clearly, which the
// .ready flash below does.
// ────────────────────────────────────────────────────────────────

const STYLE_ID  = 'px-hud-style';
const LABEL_PAD = 15;  // room under each bar for its SPD / CRT label
const EDGE_PAD  = 4;   // gap from the stage edge for the foe gauges

// True pixel art, authored as hard-edged 1px-tall rects on a tiny grid
// and used as a MASK on the existing fill layers. A mask (not a
// background image) is what lets the heart keep the clip-path drain:
// the mask decides the silhouette, the inline clip-path decides how
// much of it is full. Kept free of '#' and '%' so it survives being
// embedded raw in a data: URI.
const HEART_MASK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 7' shape-rendering='crispEdges'>" +
  "<g fill='white'>" +
  "<rect x='1' y='0' width='2' height='1'/><rect x='5' y='0' width='2' height='1'/>" +
  "<rect x='0' y='1' width='8' height='3'/>" +
  "<rect x='1' y='4' width='6' height='1'/>" +
  "<rect x='2' y='5' width='4' height='1'/>" +
  "<rect x='3' y='6' width='2' height='1'/>" +
  "</g></svg>";

const ORB_MASK =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'>" +
  "<g fill='white'>" +
  "<rect x='2' y='0' width='4' height='1'/>" +
  "<rect x='1' y='1' width='6' height='1'/>" +
  "<rect x='0' y='2' width='8' height='4'/>" +
  "<rect x='1' y='6' width='6' height='1'/>" +
  "<rect x='2' y='7' width='4' height='1'/>" +
  "</g></svg>";

function css() {
  return [
    // The repo already ships a pixel font (assets/fonts/ByteBounce.*).
    // Declared under our own family name because whatever family
    // styles.css registers it as is unreadable from here — this way the
    // HUD text cannot silently fall back to a rounded system font.
    // URLs resolve against index.html, since this sheet is injected
    // into the document, not fetched as a module-relative file.
    "@font-face{font-family:'PxHud';font-display:swap;" +
      "src:url('assets/fonts/ByteBounce.woff2') format('woff2')," +
          "url('assets/fonts/ByteBounce.ttf') format('truetype');}",

    // Plates must not clip the bar labels or the corner-pinned gauges.
    '#battle-stage .name-plate{overflow:visible!important;}',

    // ── HP / MP: pixel icon + pixel number ──
    // .vital becomes a fixed icon box; the number is pulled out beside
    // it and the parent reserves room for it (see .np-hp/.np-mp).
    '#battle-stage .vital{position:relative!important;display:inline-block!important;' +
      'width:26px!important;height:23px!important;background:none!important;border:0!important;' +
      'border-radius:0!important;box-shadow:none!important;overflow:visible!important;' +
      'clip-path:none!important;-webkit-clip-path:none!important;' +
      'filter:drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000);}',
    '#battle-stage .vital-circle{width:23px!important;height:23px!important;}',

    '#battle-stage .vital-fill-bg,#battle-stage .vital-fill{position:absolute!important;' +
      'left:0!important;top:0!important;right:auto!important;bottom:auto!important;' +
      'width:100%!important;height:100%!important;border-radius:0!important;' +
      'mask-repeat:no-repeat!important;-webkit-mask-repeat:no-repeat!important;' +
      'mask-size:100% 100%!important;-webkit-mask-size:100% 100%!important;' +
      'mask-position:center!important;-webkit-mask-position:center!important;}',

    '#battle-stage .vital-heart .vital-fill-bg,#battle-stage .vital-heart .vital-fill{' +
      'mask-image:url("' + HEART_MASK + '")!important;' +
      '-webkit-mask-image:url("' + HEART_MASK + '")!important;}',
    '#battle-stage .vital-circle .vital-fill-bg,#battle-stage .vital-circle .vital-fill{' +
      'mask-image:url("' + ORB_MASK + '")!important;' +
      '-webkit-mask-image:url("' + ORB_MASK + '")!important;}',

    // Drained portion stays visible as a dark socket of the same shape,
    // so a nearly-dead heart still reads as a heart.
    '#battle-stage .vital-heart .vital-fill-bg{background:#3a0c18!important;}',
    '#battle-stage .vital-heart .vital-fill{background:#ff3b5c!important;}',
    '#battle-stage .vital-circle .vital-fill-bg{background:#0b1c33!important;}',
    '#battle-stage .vital-circle .vital-fill{background:#3fe4ff!important;}',

    '#battle-stage .vital-num{position:absolute!important;left:100%!important;top:50%!important;' +
      'transform:translateY(-50%)!important;margin-left:5px!important;' +
      "font-family:'PxHud','Press Start 2P','Courier New',monospace!important;" +
      'font-size:15px!important;line-height:1!important;font-weight:400!important;' +
      'color:#fff!important;text-shadow:1px 1px 0 #000,-1px 1px 0 #000!important;' +
      'white-space:nowrap!important;}',

    // Reserve the number's space so HP and MP cannot collide.
    '#battle-stage .np-hp,#battle-stage .np-mp{padding-right:42px!important;}',
    // Foe plate is right-aligned and near the stage edge, so its number
    // goes on the INNER side of the heart or it would be clipped.
    '#battle-stage #plate-foe .vital-num{left:auto!important;right:100%!important;' +
      'margin-left:0!important;margin-right:5px!important;}',
    '#battle-stage #plate-foe .np-hp{padding-right:0!important;padding-left:52px!important;}',

    // MP beside HP (wrapper applied by inlineAllyVitals below).
    '#battle-stage .np-vitals-inline{display:flex!important;flex-direction:row!important;' +
      'align-items:center!important;gap:10px!important;flex-wrap:nowrap!important;}',

    // ── ROCKMAN-STYLE SPD / CRT BARS ──
    '#battle-stage .gauge-bars{display:flex!important;flex-direction:row!important;' +
      'align-items:flex-start!important;gap:11px!important;' +
      'padding:2px 0 ' + LABEL_PAD + 'px 0!important;background:none!important;}',

    // Black inner well, bright pixel rim, hard corners.
    '#battle-stage .gauge-bar{position:relative!important;width:15px!important;height:58px!important;' +
      'min-width:15px!important;flex:0 0 auto!important;overflow:visible!important;' +
      'border-radius:0!important;background:#05080f!important;border:2px solid #000!important;' +
      'box-shadow:0 0 0 2px #cfe6ff,0 0 0 4px #000!important;image-rendering:pixelated;}',

    // Empty track: dark cells with a 2px gutter between them (5px pitch
    // over 54px of well = 11 Rockman segments).
    '#battle-stage .gauge-bar-bg{position:absolute!important;left:0!important;top:0!important;' +
      'width:100%!important;height:100%!important;border-radius:0!important;' +
      'background:repeating-linear-gradient(to bottom,#1e2c44 0,#1e2c44 3px,#070b12 3px,#070b12 5px)!important;}',

    // Filled cells. Same segment pitch, so the inline clip-path that
    // combat.js writes reveals them one whole cell at a time.
    '#battle-stage .gauge-bar-fill{position:absolute!important;left:0!important;top:0!important;' +
      'width:100%!important;height:100%!important;border-radius:0!important;' +
      'background:repeating-linear-gradient(to bottom,var(--px-hi) 0,var(--px-hi) 3px,var(--px-lo) 3px,var(--px-lo) 5px)!important;}',

    '#battle-stage .gauge-bar.spd{--px-hi:#8ff0ff;--px-lo:#1b6ea6;}',
    '#battle-stage .gauge-bar.crit{--px-hi:#ffe15c;--px-lo:#c8600f;}',

    // Pixel label under each bar. Uses ::after so no markup changes and
    // nothing for combat.js's re-render to wipe out.
    "#battle-stage .gauge-bar::after{content:'SPD';position:absolute;left:50%;top:100%;" +
      'transform:translateX(-50%);margin-top:3px;' +
      "font-family:'PxHud','Press Start 2P','Courier New',monospace;font-size:12px;line-height:1;" +
      'letter-spacing:.5px;color:#e6f3ff;text-shadow:1px 1px 0 #000,-1px 1px 0 #000;' +
      'white-space:nowrap;pointer-events:none;}',
    "#battle-stage .gauge-bar.crit::after{content:'CRT';}",

    // Gauge full. For an ally this means "tap me"; for a foe it is the
    // one-frame tell before turn-loop.js auto-fires the bonus crit.
    '#battle-stage .gauge-bar.ready{animation:pxGaugeReady .36s steps(1,end) infinite;}',
    '#battle-stage .gauge-bar.ready .gauge-bar-fill{--px-hi:#ffffff;--px-lo:#ffae3a;}',
    '@keyframes pxGaugeReady{0%,49%{box-shadow:0 0 0 2px #fff,0 0 0 4px #000}' +
      '50%,100%{box-shadow:0 0 0 2px #ffe15c,0 0 0 4px #000}}',

    // Foe gauges pinned into the stage corner (offsets measured in JS).
    '#battle-stage .gauge-bars.px-corner{position:absolute!important;margin:0!important;' +
      'z-index:9!important;pointer-events:none!important;}',
  ].join('\n');
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = css();
  document.head.appendChild(st);
}

// Wraps the ally plate's HP and MP blocks in .np-vitals-inline so the
// MP orb sits beside the HP heart instead of under it. Idempotent: once
// wrapped, .np-hp's parent is no longer the plate, so this returns
// immediately and produces no further childList mutations.
function inlineAllyVitals() {
  const plate = document.getElementById('plate-ally');
  if (!plate) return;
  const hp = plate.querySelector('.np-hp');
  if (!hp || hp.parentElement !== plate) return;
  const mp = plate.querySelector('.np-mp');
  const wrap = document.createElement('div');
  wrap.className = 'np-vitals-inline';
  plate.insertBefore(wrap, hp);
  wrap.appendChild(hp);
  if (mp) wrap.appendChild(mp);
}

// Pins the foe's SPD/CRT pair to the bottom-right corner of the stage,
// clear of the enemy sprite. Stays inside #plate-foe (see header note
// 3) and is offset in the plate's own coordinate space, so the plate
// box never has to be known ahead of time. Any transform scale on the
// plate is divided out, since getBoundingClientRect reports post-
// transform pixels while left/top are applied pre-transform.
function placeFoeGauges() {
  const stage = document.getElementById('battle-stage');
  const plate = document.getElementById('plate-foe');
  if (!stage || !plate) return;
  const bars = plate.querySelector('.gauge-bars');
  if (!bars) return;
  bars.classList.add('px-corner');
  const sr = stage.getBoundingClientRect();
  const pr = plate.getBoundingClientRect();
  // Battle screen not visible yet (or plate hidden) — nothing to measure.
  if (!sr.width || !sr.height || !pr.width) return;
  const w = bars.offsetWidth;
  const h = bars.offsetHeight;
  if (!w || !h) return;
  const raw = plate.offsetWidth ? pr.width / plate.offsetWidth : 1;
  const s = (raw > 0.01 && raw < 100) ? raw : 1;
  bars.style.left = Math.round((sr.right - pr.left) / s - w - EDGE_PAD) + 'px';
  bars.style.top  = Math.round((sr.bottom - pr.top) / s - h - EDGE_PAD) + 'px';
}

let applying = false;
function apply() {
  if (applying) return;
  applying = true;
  try {
    injectStyle();
    inlineAllyVitals();
    placeFoeGauges();
  } finally {
    applying = false;
  }
}

function install() {
  apply();
  // childList only — see header note 4.
  new MutationObserver(() => apply()).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  // Screen switches happen via an attribute on #app, which the observer
  // above deliberately does not watch. A slow poll re-measures the
  // corner offsets after a screen becomes visible; it only ever writes
  // inline styles, so it can never feed the observer.
  setInterval(placeFoeGauges, 700);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install);
} else {
  install();
}
