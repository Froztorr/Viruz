// ════════════════════════════════════════════════════════════
// VIRUZ — SPRITE POSE (facing + grounding)
//
// Owns two questions about a battle sprite that the renderer gets wrong
// by default: WHICH WAY IT LOOKS, and WHETHER IT HOVERS.
//
// ── 1. FACING ──
// An ally on the left must face RIGHT, a foe on the right must face
// LEFT. renderBattleSide() does that by comparing how the art was DRAWN
// (`pet.faces`) against the side the unit stands on, adding `flip` when
// they disagree. Sound mechanism, bad inputs:
//
//   • Monsters take `faces` from their ANTIVIRUZ def. The 16 celestial
//     monsters are registered by cloning a template, so they inherited
//     the TEMPLATE's facing — and the whole celestial pack is drawn
//     facing left, so every one of them was mirrored into staring away
//     from the player.
//
//   • Pets never had a facing at all. createPet() does not set `faces`,
//     so `pet.faces || 'right'` is always 'right' for a pet, which
//     always equals what the ally side wants, so an ally is NEVER
//     mirrored. A left-drawn pet could not be fixed by any data edit —
//     the field was unreachable.
//
// ── 2. GROUNDING ──
// The renderer adds `float` to everything unless a def opts out with
// `noFloat`, so rock golems, crabs, turtles and beetles all bobbed in
// mid-air. That default is backwards: most creatures stand on the
// ground and only a few genuinely fly. So the default is inverted here
// — planted unless listed as airborne.
//
// Both answers are properties of the ARTWORK, so both are resolved from
// the sprite's own src path. Pets and monsters flow through one code
// path and neither depends on data.js declaring anything.
// ════════════════════════════════════════════════════════════

// ───────────────────────────── FACING ─────────────────────────────

// Keyed by ART FOLDER under assets/sprites (not always the species id —
// e.g. butler_vamp draws from `butler`). Front-facing sprites with no
// meaningful left/right read (golems, imps, chests, the vampires) are
// deliberately left out: mirroring them is harmless either way.
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
// '<species>:<form>' key if that ever stops holding; it is checked first.
const PET_FACING = {
  // Drawn head-left in stage1, overclock, bulwark and corrupted alike
  // (phantom is a featureless ghost, so it reads the same either way).
  dustmoth: 'left',
};

// ─────────────────────────── GROUNDING ──────────────────────────

// Any pet in this mutation form hovers regardless of species — a
// phantom is a ghost, it has no business standing on anything.
const FLOAT_FORMS = new Set(['phantom']);

// Pets that fly or hover as their normal state: wings, jets, or simply
// no legs to stand on. Everything else is planted.
const FLOAT_PETS = new Set([
  'dustmoth',   // moth — wings
  'echowing',   // bat — wings
  'glitchimp',  // winged imp with a halo
  'finbyte',    // fish — swims, would look wrong lying on dirt
  'inkarm',     // squid — drifts upright
  'jetsquid',   // squid under jet propulsion
  'haunbit',    // bomb trailing a wisp, no feet
  'orbling',    // disembodied floating eye
]);
// Grounded pets, for the record: blobyte, chitbug, clampr, hopbit,
// nulworm, spikeling — all have legs or sit on the floor.

// Monsters that fly. Keyed by art folder, same as MONSTER_FACING.
const FLOAT_MONSTERS = new Set([
  // ── original roster ──
  'flying_fish',

  // ── celestial pack ──
  'solar_moth',         // wings
  'corona_dragon',      // winged serpent riding its sun ring
  'comet_bunny',        // streaking on a comet trail
  'orbit_ray',          // manta ray gliding
  'ring_guardian',      // hovering construct
  'star_jelly',         // jellyfish, drifts
  'frostflare_phoenix', // bird of fire
  'repair_drone',       // literally a drone
]);
// Grounded celestials: ember_pup, magma_golem, crystal_crab,
// azure_slime, plasma_fox, cable_rat, void_mimic, corrupted_captain.

// ─────────────────────────── RESOLUTION ─────────────────────────

// assets/sprites_v2/<species>/<form>_<attr>.<ext>  →  pet
// assets/sprites/<folder>/<anim>.<ext>             →  monster
// null for anything else (procedural SVG creatures, icons, effects) so
// those keep whatever the renderer already decided.
function spriteInfo(src) {
  if (!src) return null;

  const pet = src.match(/\/sprites_v2\/([^/]+)\/([^/]+?)(?:_[^_/]+)?\.[a-z0-9]+(?:[?#]|$)/i);
  if (pet) return { kind: 'pet', id: pet[1], form: pet[2] };

  const mon = src.match(/\/sprites\/([^/]+)\//);
  if (mon) return { kind: 'monster', id: mon[1], form: null };

  return null;
}

function drawnFacing(info) {
  if (info.kind === 'pet') {
    return PET_FACING[info.id + ':' + info.form] || PET_FACING[info.id] || 'right';
  }
  return MONSTER_FACING[info.id] || 'right';
}

function isAirborne(info) {
  if (info.kind === 'pet') {
    return FLOAT_FORMS.has(info.form) || FLOAT_PETS.has(info.id);
  }
  return FLOAT_MONSTERS.has(info.id);
}

// Backwards-compatible helper kept from the facing-only version.
function drawnFacingFor(src) {
  const info = spriteInfo(src);
  return info ? drawnFacing(info) : null;
}

// Re-decides both classes for one battle unit. These are SET rather
// than toggled, so this lands on the same answer however many times it
// runs, and can correct the renderer in either direction.
function applyPose(unitEl) {
  const img = unitEl.querySelector('img.bu-sprite');
  if (!img) return; // procedural SVG unit — not ours to touch
  const info = spriteInfo(img.getAttribute('src'));
  if (!info) return;
  const want = unitEl.dataset.side === 'foe' ? 'left' : 'right';
  img.classList.toggle('flip', drawnFacing(info) !== want);
  img.classList.toggle('float', isAirborne(info));
}

function scan(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches && node.matches('.bunit')) applyPose(node);
  const inner = node.querySelectorAll && node.querySelectorAll('.bunit');
  if (inner) inner.forEach(applyPose);
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

export {
  MONSTER_FACING,
  PET_FACING,
  FLOAT_FORMS,
  FLOAT_PETS,
  FLOAT_MONSTERS,
  drawnFacingFor,
  spriteInfo,
};
