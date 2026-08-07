// ═══════════════════════════════════════════════════════════
// VIRUZ — ANIMATED SPRITE SWITCH (.png → .gif)
//
// The full animated idle art now ships in the repo:
//   • pets     — assets/sprites_v2/<species>/<form>_<attr>.gif
//                (14 species x 5 forms x 4 attributes = 280 files)
//   • monsters — assets/sprites/<folder>/still.gif  (25 files)
//
// sprites.js still builds .png paths, and it is a very large file whose
// bulk is hand-tuned inline SVG. Rather than rewrite all of that, this
// module flips the art over at startup in two small, reversible steps:
//
//   1. SPECIES PATCH — every monster species object gains `gif` (its art
//      folder) and `ext:'gif'`, so creatureMarkupFor() emits
//      assets/sprites/<folder>/still.gif directly. This is also what
//      finally gives stone_imp and fang_stalker real art; they had no
//      art folder before and rendered as procedural SVG.
//
//   2. DOM UPGRADE — any creature <img> that still points at a .png is
//      re-pointed at the matching .gif. This covers the pets, whose
//      paths come from spriteV2Path() in data.js, plus any monster
//      markup built before the species patch could run.
//
// SAFETY: img-fallback.js (imported first in main.js) already retries a
// failed .gif as .png, so a missing or still-uploading GIF degrades to
// the old still art instead of a broken image. This module never
// re-upgrades an image that img-fallback has already reverted, so the
// two cannot fight each other in a loop.
// ═══════════════════════════════════════════════════════════

import * as DATA from './data.js';

// species id -> art folder under assets/sprites
const MONSTER_GIF_FOLDERS = {
  greenworm:     'greenworm',
  beetle:        'beetle',
  stone_imp:     'stone_imp',
  kappa:         'kappa',
  fang_stalker:  'fang_stalker',
  sand_worm:     'sand_worm',
  sand_turtle:   'sand_turtle',
  oasis_otter:   'oasis_otter',
  rainbow_frog:  'rainbow_frog',
  flying_fish:   'flying_fish',
  island_monkey: 'island_monkey',
  goblin_grunt:  'goblin',
  goblin_miner:  'miner_goblin',
  black_beast:   'black_beast',
  rock_golem:    'rock_golem',
  hobgoblin:     'hobgoblin',
  fire_golem:    'fire_golem',
  butler_vamp:   'butler',
  vampire_lady:  'vampire_lady',
  vampire_lord:  'vampire_lord',
  mimic:         'mimic',
  guard_imp:     'guard_imp',
  gunner_imp:    'gunner_imp',
  tank_imp:      'tank_imp',
  marshal_imp:   'marshal_imp',
};

// ── 1. SPECIES PATCH ───────────────────────────────────────
// data.js keeps its species in exported arrays. Rather than depend on a
// specific export name, walk every exported array once and patch any
// object whose id is a known monster. Pets (ART2_SPECIES) are never
// touched because their ids are not in the table above.
function patchSpecies() {
  const patched = new Set();
  for (const value of Object.values(DATA)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.id !== 'string' || patched.has(entry)) continue;
      const folder = MONSTER_GIF_FOLDERS[entry.id];
      if (!folder) continue;
      patched.add(entry);
      try {
        entry.gif = folder;
        entry.ext = 'gif';
      } catch (err) {
        // frozen species table — the DOM upgrade below still covers it
        return patched.size;
      }
    }
  }
  return patched.size;
}

// ── 2. DOM UPGRADE ─────────────────────────────────────────
const FROM = 'gifUpgradeFrom';           // last .png path we upgraded
const FALLBACK_FLAG = 'imgFallbackTried'; // set by img-fallback.js

function upgrade(img) {
  if (!img || img.tagName !== 'IMG') return;
  // img-fallback.js already sent this one back to .png — leave it alone.
  if (img.dataset[FALLBACK_FLAG]) return;
  if (!img.classList.contains('is-art2') && !img.classList.contains('is-gif')) return;

  const src = img.getAttribute('src') || '';
  if (!/\.png(\?.*)?$/i.test(src)) return;
  if (img.dataset[FROM] === src) return;  // already handled this exact path

  img.dataset[FROM] = src;
  img.setAttribute('src', src.replace(/\.png(\?.*)?$/i, '.gif$1'));
}

function scan(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.tagName === 'IMG') upgrade(root);
  if (typeof root.querySelectorAll !== 'function') return;
  const imgs = root.querySelectorAll('img.is-art2, img.is-gif');
  for (let i = 0; i < imgs.length; i++) upgrade(imgs[i]);
}

function install() {
  scan(document.documentElement);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        upgrade(record.target);
        continue;
      }
      const added = record.addedNodes;
      for (let i = 0; i < added.length; i++) scan(added[i]);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });
}

try {
  patchSpecies();
} catch (err) {
  console.warn('[sprites-gif] species patch skipped:', err);
}

try {
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true });
      install(); // also catch anything already rendered
    } else {
      install();
    }
  }
} catch (err) {
  console.warn('[sprites-gif] DOM upgrade skipped:', err);
}
