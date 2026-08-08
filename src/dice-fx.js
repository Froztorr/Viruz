// ═══════════════════════════════════════════════════════════
// VIRUZ — D20 ROLL OVERLAY (Tabletop Realm)
//
// The full-screen dice roll played at the end of every 3rd round on a
// dice map. Modelled directly on the reference animation: a green
// icosahedron tumbles in from the RIGHT, growing as it travels, slightly
// overshoots, settles dead centre, and only THEN shows its number on the
// upward-facing triangle. The faces are blank while it is in the air --
// no number cycling -- because that is what the reference does and it
// reads much cleaner than a slot-machine scramble.
//
// WHY THE FIGHT ACTUALLY STOPS, with no new pause flag:
// playDiceRoll() returns a Promise. dice.js awaits it inside
// onRoundComplete(), turn-loop.js awaits that inside finishRound(), and
// runTurn() awaits finishRound() before it ever calls scheduleTurn().
// So the turn loop is genuinely suspended for the whole animation. There
// is no "paused" boolean that could drift out of sync with reality, and
// nothing to un-pause on the way out.
//
// body.dfx-freeze additionally parks every CSS animation inside
// #battle-stage -- idle bobbing, the float hover, gauge pulses -- so the
// held frame looks deliberate instead of half-alive. Animated GIF sprites
// keep playing; a browser gives no way to pause a GIF from script. That
// is a platform limit, not an oversight.
//
// PALETTE is sampled straight out of the reference GIF:
//   #085A4C body · #18915F lit number face · #023445 facets in shadow.
//
// THE OVERLAY IS TORN DOWN IN A `finally`. If any await in here throws,
// an orphaned full-screen scrim would sit over the game swallowing every
// tap, which is far worse than a missing animation.
// ═══════════════════════════════════════════════════════════

const STYLE_ID = 'dice-fx-style';
const OVERLAY_ID = 'dice-fx-overlay';
const FREEZE_CLASS = 'dfx-freeze';

// Timings. LAND_AT_MS is where the number appears -- roughly 72% through
// the tumble, matching the reference, so it lands with the overshoot
// rather than after everything has already stopped moving.
const ROLL_MS = 1500;
const LAND_AT_MS = 1080;
const HOLD_MS = 1150;
const FADE_OUT_MS = 300;

const wait = ms => new Promise(r => setTimeout(r, ms));

// ── SKIP ──
// A tap anywhere on the scrim fast-forwards. hold() polls the flag
// instead of racing a rejected promise, so there is never a stray timer
// left running after the overlay is gone.
function makeSkippable(node) {
  const state = { skipped: false };
  const flag = () => { state.skipped = true; };
  node.addEventListener('click', flag);
  node.addEventListener('touchstart', flag, { passive: true });
  return state;
}

async function hold(ms, state) {
  const STEP = 40;
  for (let t = 0; t < ms; t += STEP) {
    if (state.skipped) return;
    await wait(STEP);
  }
}

// Pointy-top hexagon silhouette (width/height = 0.866, same proportion
// the reference die settles at) split into the six surrounding facets
// plus the lit upward triangle that carries the number.
const DIE_SVG = `
<svg class="dfx-svg" viewBox="0 0 87 100" aria-hidden="true">
  <polygon class="dfx-hex" points="43.5,0 87,25 87,75 43.5,100 0,75 0,25"/>
  <polygon fill="#0a6b58" points="43.5,0 43.5,18 13,70 0,25"/>
  <polygon fill="#05503f" points="43.5,0 87,25 74,70 43.5,18"/>
  <polygon fill="#044737" points="0,25 13,70 0,75"/>
  <polygon fill="#033a2e" points="87,25 87,75 74,70"/>
  <polygon fill="#023445" points="0,75 13,70 43.5,100"/>
  <polygon fill="#0c2d33" points="87,75 74,70 43.5,100"/>
  <polygon class="dfx-face" points="43.5,18 74,70 13,70"/>
</svg>`;

function css() {
  return `
@font-face{font-family:'DiceFxFont';src:url('assets/fonts/ByteBounce.woff2') format('woff2');font-display:swap;}

#${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483000;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.6vmin;
  background:rgba(2,4,6,.88);opacity:0;transition:opacity 200ms linear;
  cursor:pointer;-webkit-tap-highlight-color:transparent;}
#${OVERLAY_ID}.dfx-in{opacity:1;}

#${OVERLAY_ID} .dfx-title{font-family:'DiceFxFont','Courier New',monospace;
  font-size:5vmin;letter-spacing:.22em;text-transform:uppercase;color:#8fe3c0;opacity:.85;}

#${OVERLAY_ID} .dfx-stage{position:relative;width:30vmin;height:34.6vmin;
  max-width:250px;max-height:288px;display:flex;align-items:center;justify-content:center;}

#${OVERLAY_ID} .dfx-die{position:relative;width:100%;height:100%;
  display:flex;align-items:center;justify-content:center;transform-origin:50% 50%;
  animation:dfxRoll ${ROLL_MS}ms linear 1 both;
  filter:drop-shadow(0 1vmin 1.4vmin rgba(0,0,0,.6));}
#${OVERLAY_ID} .dfx-svg{width:100%;height:100%;display:block;}
#${OVERLAY_ID} .dfx-hex{fill:#085a4c;stroke:#04231d;stroke-width:2;stroke-linejoin:round;}
#${OVERLAY_ID} .dfx-face{fill:#18915f;}

#${OVERLAY_ID} .dfx-num{position:absolute;top:47%;left:50%;
  transform:translate(-50%,-50%);
  font-family:'DiceFxFont','Courier New',monospace;font-size:11vmin;line-height:1;
  color:#fff;text-shadow:0 .35vmin 0 rgba(0,0,0,.45);opacity:0;pointer-events:none;}
#${OVERLAY_ID} .dfx-die.landed .dfx-num{animation:dfxNumPop 300ms ease-out 1 both;}

#${OVERLAY_ID} .dfx-res{display:flex;flex-direction:column;align-items:center;gap:.9vmin;
  font-family:'DiceFxFont','Courier New',monospace;text-align:center;
  opacity:0;transition:opacity 220ms linear;}
#${OVERLAY_ID} .dfx-res.show{opacity:1;}
#${OVERLAY_ID} .dfx-theme{font-size:5.4vmin;color:#ffd76e;}
#${OVERLAY_ID} .dfx-you{font-size:4.6vmin;color:#7dffb0;}
#${OVERLAY_ID} .dfx-foe{font-size:4.2vmin;color:#ff9a9a;}

#${OVERLAY_ID} .dfx-hint{position:absolute;left:0;right:0;bottom:4vmin;text-align:center;
  font-family:'DiceFxFont','Courier New',monospace;font-size:3.2vmin;color:rgba(255,255,255,.38);}

#${OVERLAY_ID} .dfx-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;}
#${OVERLAY_ID} .dfx-flash.on{animation:dfxFlash 300ms linear 1 both;}

#${OVERLAY_ID}.nat20 .dfx-die{filter:drop-shadow(0 0 3vmin rgba(255,215,110,.9));}
#${OVERLAY_ID}.nat20 .dfx-hex{stroke:#ffd76e;}
#${OVERLAY_ID}.nat20 .dfx-num{color:#fff3c4;}
#${OVERLAY_ID}.nat20 .dfx-title{color:#ffd76e;opacity:1;}

@keyframes dfxRoll{
  0%{transform:translate(46vmin,-9vmin) rotate(0deg) scale(.26);opacity:0;}
  10%{opacity:1;}
  55%{transform:translate(11vmin,2vmin) rotate(432deg) scale(.72);opacity:1;}
  78%{transform:translate(0,0) rotate(672deg) scale(1.14);}
  88%{transform:translate(0,0) rotate(720deg) scale(.93);}
  100%{transform:translate(0,0) rotate(720deg) scale(1);}
}
@keyframes dfxNumPop{
  0%{opacity:0;transform:translate(-50%,-50%) scale(1.9);}
  60%{opacity:1;transform:translate(-50%,-50%) scale(.9);}
  100%{opacity:1;transform:translate(-50%,-50%) scale(1);}
}
@keyframes dfxFlash{0%{opacity:.55;}100%{opacity:0;}}

/* Hold the battle scene still underneath the scrim. */
body.${FREEZE_CLASS} #battle-stage *,
body.${FREEZE_CLASS} #fx-layer *{animation-play-state:paused!important;}
`;
}

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = css();
  document.head.appendChild(style);
}

// Plays one roll and resolves when the overlay is gone. `theme` and
// `band` are the shapes declared in dice.js.
export async function playDiceRoll({ roll, theme, band } = {}) {
  if (!roll || typeof document === 'undefined' || !document.body) return;
  ensureStyle();
  document.getElementById(OVERLAY_ID)?.remove();

  const nat20 = roll === 20;
  const themeLine = theme ? `${theme.icon} ${theme.thai}` : '';
  const youLine = band ? `คุณ ×${band.you}` : '';
  const foeLine = band ? (band.foe > 1 ? `ศัตรู ×${band.foe}` : 'ศัตรูไม่ได้รับผล') : '';

  const ov = document.createElement('div');
  ov.id = OVERLAY_ID;
  if (nat20) ov.classList.add('nat20');
  ov.innerHTML = `
    <div class="dfx-title">${nat20 ? 'NAT 20' : 'D20'}</div>
    <div class="dfx-stage">
      <div class="dfx-die">${DIE_SVG}<span class="dfx-num">${roll}</span></div>
    </div>
    <div class="dfx-res">
      <span class="dfx-theme">${themeLine}</span>
      <span class="dfx-you">${youLine}</span>
      <span class="dfx-foe">${foeLine}</span>
    </div>
    <div class="dfx-hint">แตะเพื่อข้าม</div>
    <div class="dfx-flash"></div>`;

  document.body.appendChild(ov);
  document.body.classList.add(FREEZE_CLASS);
  const skip = makeSkippable(ov);

  try {
    requestAnimationFrame(() => ov.classList.add('dfx-in'));

    // Tumble in. Faces stay blank, exactly as in the reference.
    await hold(LAND_AT_MS, skip);

    // Land: number pops onto the lit face, one white flash.
    ov.querySelector('.dfx-die')?.classList.add('landed');
    ov.querySelector('.dfx-flash')?.classList.add('on');
    await hold(ROLL_MS - LAND_AT_MS, skip);

    // Then what the roll actually did.
    ov.querySelector('.dfx-res')?.classList.add('show');
    await hold(HOLD_MS, skip);

    ov.classList.remove('dfx-in');
    await wait(FADE_OUT_MS);
  } finally {
    ov.remove();
    document.body.classList.remove(FREEZE_CLASS);
  }
}

export { ROLL_MS, HOLD_MS };
