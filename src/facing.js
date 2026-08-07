// ════════════════════════════════════════════════════════════
// VIRUZ — SPRITE FACING
//
// A battle sprite has to look at its opponent: the ally on the left
// must face RIGHT, the foe on the right must face LEFT. combat.js's
// renderBattleSide() does that by comparing how the art was DRAWN
// (`pet.faces`) against the side the unit stands on, and adding the
// `flip` class when the two disagree.
//
// That mechanism is sound, but the inputs were not:
//
//   • Monsters take `faces` from their ANTIVIRUZ def (spawnAntiviruz
//     copies `def.faces || 'right'`). The 16 celestial monsters are
//     registered by cloning an existing template, so they inherited the
//     TEMPLATE's facing instead of their own — and the whole celestial
//     pack happens to be drawn facing left, so every one of them got
//     mirrored into staring away from the player.
//
//   • Pets never had a facing at all. createPet() does not set `faces`,
//     so `pet.faces || 'right'` is always 'right' for a pet, which
//     always equals what the ally side wants, so an ally is NEVER
//     mirrored. A pet drawn facing left therefore could not be fixed by
//     any amount of data editing — the field was unreachable.
//
// So facing is treated here as a property of the ARTWORK, which is what
// it actually is. The tables below were read off the sprite files
// themselves. The correction is applied from the image's own src path,
// which means pets and monsters flow through one code path and neither
// depends on data.js declaring anything.
//
// Only sprites listed as 'left' behave differently from before; every
// omitted sprite defaults to 'right', which is exactly the old
// behaviour, so this can never silently disturb art that already read
// correctly.
// ════════════════════════════════════════════════════════════

// Keyed by ART FOLDER under assets/sprites (which is not always the
// species id — e.g. butler_vamp draws from `butler`). Front-facing
// sprites with no meaningful left/right read (golems, imps, chests,
// the vampires) are deliberately left out: mirroring them is harmless
// either way, and listing them would only invite churn.
const MONSTER_FACING = {
  // ── original roster ──
  beetle:        'left',
  black_beast:   'right',
  flying_fish:   'right',
  greenworm:     'right',
  kappa:         'left',
  oasis_otter:   'right',
  rainbow_frog:  'right',
  sand_turtle:   'right',
  sand_worm:     'right',
  tank_imp:      'left',

  // ── celestial pack (Galaxy realm) — uniformly drawn facing left ──
  ember_pup:          'left',
  solar_moth:         'left',
  magma_golem:        'left',
  corona_dragon:      'left',
  crystal_crab:       'left',
  comet_bunny:        'left',
  orbit_ray:          'left',
  ring_guardian:      'left',
  azure_slime:        'left',
  plasma_fox:         'left',
  star_jelly:         'left',
  frostflare_phoenix: 'left',
  cable_rat:          'left',
  repair_drone:       'left',
  void_mimic:         'left',
  corrupted_captain:  'left',
};

// Keyed by species folder under assets/sprites_v2. A species keeps one
// facing across its attribute colours and its mutation art sets — the
// art is redrawn per form but the pose is preserved. Add a
// '<species>:<form>' key here if that ever stops being true for a
// particular form; it is checked first.
const PET_FACING = {
  // Drawn head-left in stage1, overclock, bulwark and corrupted alike
  // (phantom is a featureless ghost, so it reads the same either way).
  dustmoth: 'left',
};

// assets/sprites_v2/<species>/<form>_<attr>.<ext>  →  pet
// assets/sprites/<folder>/<anim>.<ext>             →  monster
// Returns null for anything else (procedural SVG creatures, icons,
// effects) so those keep whatever the renderer already decided.
function drawnFacingFor(src) {
  if (!src) return null;

  const pet = src.match(/\/sprites_v2\/([^/]+)\/([^/]+?)(?:_[^_/]+)?\.[a-z0-9]+(?:[?#]|$)/i);
  if (pet) {
    const species = pet[1];
    const form = pet[2];
    return PET_FACING[species + ':' + form] || PET_FACING[species] || 'right';
  }

  const mon = src.match(/\/sprites\/([^/]+)\//);
  if (mon) return MONSTER_FACING[mon[1]] || 'right';

  return null;
}

// Re-decides the `flip` class for one battle unit. This deliberately
// SETS the class rather than toggling it, so it lands on the same
// answer no matter how many times it runs, and so it can correct a
// decision the renderer already made in either direction.
function applyFacing(unitEl) {
  const img = unitEl.querySelector('img.bu-sprite');
  if (!img) return; // procedural SVG unit — not ours to touch
  const drawn = drawnFacingFor(img.getAttribute('src'));
  if (!drawn) return;
  const want = unitEl.dataset.side === 'foe' ? 'left' : 'right';
  img.classList.toggle('flip', drawn !== want);
}

function scan(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches && node.matches('.bunit')) applyFacing(node);
  const inner = node.querySelectorAll && node.querySelectorAll('.bunit');
  if (inner) inner.forEach(applyFacing);
}

function install() {
  scan(document.body);
  // childList ONLY. Watching attributes would mean our own class change
  // re-entered this observer; renderBattleSide() rebuilds the whole
  // .bunit element on every paint anyway, so additions are all we need.
  new MutationObserver(records => {
    for (const r of records) {
      if (!r.addedNodes) continue;
      r.addedNodes.forEach(scan);
    }
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', install);
} else {
  install();
}

export { MONSTER_FACING, PET_FACING, drawnFacingFor };
