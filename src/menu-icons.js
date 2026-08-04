// ═══════════════════════════════════════════════════════════
// VIRUZ PET — GLYPH ART
// Draws the real PNGs in the places that hardcode an emoji as literal
// text instead of going through iconHtml().
//
// icons.js can only help renderers that ask it for a path. The app
// shell does not: index.html writes "🏙️" straight into the quickbar
// button, and renderPdStats() writes ${meta.icon} straight into its
// template. Those glyphs are plain text in the DOM, so committing art
// to assets/ changed nothing for them.
//
// So this works from the other end — it finds those glyphs in the DOM
// and replaces each one with an <img>, keeping the same onerror emoji
// fallback the rest of the icon system uses. A missing or misnamed
// file therefore degrades back to exactly what is on screen today
// rather than leaving a broken-image box.
//
// SCOPING IS DELIBERATE. Only the containers listed below are
// touched. The battle log, process feed and toasts are text sinks
// (they assign textContent, not innerHTML) and are left alone, both
// because injecting markup there would print tags as text and because
// dense log lines read better as emoji.
// ═══════════════════════════════════════════════════════════

const UI = 'assets/ui';
const ICONS = 'assets/icons';
const POTIONS = 'assets/potions';

// ── Shell chrome: top bar, quickbar, drawer, screen headers ──
const MENU_ART = {
  '🎒': `${UI}/nav_inventory.png`,
  '🏙': `${UI}/nav_city.png`,
  '🏠': `${UI}/nav_home.png`,
  '🗺': `${UI}/nav_world.png`,
  '💗': `${UI}/heart.png`,
  '💀': `${UI}/nav_raid.png`,
  '🛰': `${UI}/nav_raid.png`,
  '🛒': `${UI}/nav_shop.png`,
  '🏥': `${UI}/nav_clinic.png`,
  '🍱': `${UI}/nav_foodshop.png`,
  '💰': `${UI}/bitz.png`,
  '🌳': `${UI}/skilltree.png`,
  '🧪': `${POTIONS}/pot_m.png`,
  '⚔': `${ICONS}/stat_atk.png`,
  '☰': `${UI}/menu.png`,
  '🗑': `${UI}/trash.png`,
  '🧬': `${UI}/dna.png`,
};

// ── The HUD strip ──
// ⚡ here is team power, not the SPD stat, so it is left as emoji
// rather than picking up stat_spd art and implying the wrong thing.
const HUD_ART = {
  '👤': `${UI}/hud_player.png`,
  '💰': `${UI}/bitz.png`,
  '🧬': `${UI}/dna.png`,
};

// ── The pet detail panel ──
// Inside this panel ⚡ IS the SPD stat and ❤ IS VIT, which is why the
// pet panel needs its own table instead of sharing MENU_ART.
const PET_ART = {
  '⚔': `${ICONS}/stat_atk.png`,
  '🛡': `${ICONS}/stat_def.png`,
  '💥': `${ICONS}/stat_crit.png`,
  '💨': `${ICONS}/stat_eva.png`,
  '⚡': `${ICONS}/stat_spd.png`,
  '🔮': `${ICONS}/stat_int.png`,
  '❤': `${ICONS}/stat_vit.png`,
  '🩸': `${ICONS}/payload_leech.png`,
  '🔌': `${ICONS}/payload_manaregen.png`,
  '🌪': `${ICONS}/payload_adaptive.png`,
  '☠': `${ICONS}/payload_toxin.png`,
  '🤍': `${ICONS}/loyalty_stranger.png`,
  '💛': `${ICONS}/loyalty_friendly.png`,
  '🧡': `${ICONS}/loyalty_trusted.png`,
  '🌳': `${UI}/skilltree.png`,
  '🗑': `${UI}/trash.png`,
  '🧬': `${UI}/dna.png`,
};

// Static shell — converted once, never re-rendered by any screen.
const STATIC_SCOPES = [
  { sel: '#topbar', art: MENU_ART },
  { sel: '#hud', art: HUD_ART },
  { sel: '#quickbar', art: MENU_ART },
  { sel: '#drawer-knob', art: MENU_ART },
  { sel: '#drawer-panel', art: MENU_ART },
  { sel: '.screen-head', art: MENU_ART },
  { sel: '.inv-tabs', art: MENU_ART },
];

// Panels that rebuild their own innerHTML and so need watching. The
// pet panel re-renders on every tab swipe and every equip change (see
// goPdPage / renderPdStats in src/screens/pet-detail.js), which would
// otherwise wipe the images straight back to emoji.
const LIVE_SCOPES = [
  { sel: '#pet-detail', art: PET_ART },
];

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'TITLE', 'IMG']);

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rebuilds one text node as markup, swapping any known glyph for its
// PNG. Returns without touching the DOM when the node holds no glyph,
// so ordinary label text is never rewrapped.
function convert(node, art) {
  const raw = node.nodeValue;
  if (!raw || !raw.trim()) return;
  let html = '';
  let hit = false;
  let justConverted = false;
  for (const ch of raw) {
    // U+FE0F only exists to force the emoji presentation of the
    // preceding character. Once that character is an <img> it has no
    // glyph left to style, and leaving it in renders as a stray box.
    if (ch === '\uFE0F') {
      if (!justConverted) html += ch;
      continue;
    }
    const path = art[ch];
    if (path) {
      html += `<img src="${path}" alt="" class="data-icon glyph-icon"`
        + ` onerror="this.outerHTML='${ch}'">`;
      hit = true;
      justConverted = true;
    } else {
      html += escapeHtml(ch);
      justConverted = false;
    }
  }
  if (!hit) return;
  const span = document.createElement('span');
  span.className = 'glyph-set';
  span.innerHTML = html;
  node.parentNode.replaceChild(span, node);
}

function walk(root, art) {
  if (!root) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const parent = node.parentNode;
    if (!parent || SKIP_TAGS.has(parent.tagName)) continue;
    // Already converted on an earlier pass.
    if (parent.classList && parent.classList.contains('glyph-set')) continue;
    convert(node, art);
  }
}

function injectCss() {
  if (document.getElementById('glyph-art-css')) return;
  const style = document.createElement('style');
  style.id = 'glyph-art-css';
  style.textContent = `
.glyph-set { display: inline; }
.glyph-icon { width: 1.15em; height: 1.15em; }
#quickbar .glyph-icon { width: 1.7em; height: 1.7em; display: block; margin: 0 auto; }
.inv-tabs .glyph-icon,
.screen-head .glyph-icon { width: 1.3em; height: 1.3em; }
.drawer-grid .glyph-icon { width: 1.6em; height: 1.6em; }
#drawer-knob .glyph-icon { width: 1.4em; height: 1.4em; }
.ps-stat .glyph-icon { width: 1.1em; height: 1.1em; }
.ps-passive-row .glyph-icon { width: 1.4em; height: 1.4em; }
`;
  document.head.appendChild(style);
}

// Watches a live panel and reconverts after it rebuilds. The observer
// disconnects around its own writes, otherwise replacing a text node
// would retrigger the callback that made the replacement.
function observe(sel, art) {
  const root = document.querySelector(sel);
  if (!root || typeof MutationObserver !== 'function') return;
  let queued = false;
  const obs = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      obs.disconnect();
      walk(root, art);
      obs.observe(root, { childList: true, subtree: true });
    });
  });
  walk(root, art);
  obs.observe(root, { childList: true, subtree: true });
}

export function applyGlyphArt() {
  injectCss();
  for (const scope of STATIC_SCOPES) {
    document.querySelectorAll(scope.sel).forEach(el => walk(el, scope.art));
  }
  for (const scope of LIVE_SCOPES) observe(scope.sel, scope.art);
}

// Module scripts are deferred, so the shell is normally parsed by the
// time this runs. The readyState guard covers the case where it is
// ever imported earlier than that.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyGlyphArt, { once: true });
} else {
  applyGlyphArt();
}
