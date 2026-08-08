// ═════════════════════════════════════════════════════════
// VIRUZ — SPRITE POSE (facing + grounding + per-character offset)
//
// Owns the questions about a battle sprite that the renderer gets wrong
// by default: WHICH WAY IT LOOKS, WHETHER IT HOVERS, and WHERE IT SITS.
//
// ── 1. FACING ──
// An ally on the left must face RIGHT, a foe on the right must face
// LEFT. renderBattleSide() does that by comparing how the art was DRAWN
// (`pet.faces`) against the side the unit stands on, adding `flip` when
// they disagree. Sound mechanism, bad inputs:
//
//   • Monsters take `faces` from their ANTIVIRUZ def. The 16 celestial
//     monsters are registered by cloning a template, so they inherited
//     the TEMPLATE's facing — and almost the whole celestial pack is
//     drawn facing left, so they were mirrored into staring away from
//     the player.
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
// — planted unless listed as airborne — and planted units are also
// nudged down by GROUND_DROP so they rest on the floor instead of
// hanging just above it.
//
// ── 3. PER-CHARACTER OFFSET AND SIZE ──
// Art comes in at different sizes and with different amounts of empty
// space around the creature, so some sprites land too high, too low or
// too large for the stage even when everything else is right. That is
// a fact about one art set, not about the battle screen, so it is
// keyed and resolved here exactly like facing and float.
//
// All three answers are properties of the ARTWORK, so all three are
// resolved from the sprite's own src path. Pets and monsters flow
// through one code path and none of it depends on data.js declaring
// anything.
// ═════════════════════════════════════════════════════════

// How far a planted sprite sits below where the renderer put it.
// Applied as a margin PAIR, never as a transform: `flip` is a transform
// and the sprite scale (--cr-scale) is a transform, so an inline
// transform here would clobber whichever of the two lives on that
// element. The negative bottom margin cancels the top one, so the
// HP/MP bars underneath do not move with it.
const GROUND_DROP = '0.5cm';

// ───────────────────────── FACING ─────────────────────────

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

  // ── celestial pack (Galaxy realm) — drawn facing left, with one
  // exception noted below ──
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
  // The odd one out: this art already points right, so the blanket
  // 'left' the rest of the pack uses was mirroring it into facing away
  // from the player.
  void_mimic:         'right',
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

  // Squid, drawn with its arms trailing to the left. Keyed to the BASE
  // form ONLY, on purpose: that is the art that was actually checked
  // on screen, and a bare `inkarm` key would mirror the four evolved
  // art sets on nothing but an assumption. Promote it to a plain
  // `inkarm: 'left'` once the other forms are confirmed to match.
  'inkarm:stage1': 'left',
};

// ─────────────────────── GROUNDING ───────────────────────

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
//
// This list was originally written from what each creature IS — a
// phoenix flies, a comet streaks, a hovering construct hovers. Seen on
// the stage, four of those read better planted: their art already sits
// high in its frame, so the hover bob lifted them off the top of the
// scene rather than making them look airborne.
const FLOAT_MONSTERS = new Set([
  // ── original roster ──
  'flying_fish',

  // ── celestial pack ──
  'solar_moth',    // wings
  'orbit_ray',     // manta ray gliding
  'star_jelly',    // jellyfish, drifts
  'repair_drone',  // literally a drone
]);
// Grounded celestials: ember_pup, magma_golem, crystal_crab,
// azure_slime, plasma_fox, cable_rat, void_mimic, corrupted_captain,
// and — by eye on the stage rather than by biology — corona_dragon,
// comet_bunny, ring_guardian and frostflare_phoenix.

// ──────────────── PER-CHARACTER OFFSET AND SIZE ───────────────

// { dx, dy, scale } per art set. dx/dy are pixels, scale is a
// multiplier where 1 means untouched. Keys match the facing tables
// exactly: pets by '<species>' or the more specific '<species>:<form>',
// monsters by art folder.
//
// Both start EMPTY — nothing here overrides the renderer until a value
// is actually tuned. Fill them from the battle simulator, which writes
// straight into these objects and can print them back out for pasting
// in here.
//
// Deliberately per ART SET, not per battle slot: "this creature is
// drawn too big" is true of the creature everywhere it appears, so the
// same correction should hold in the arena, in a raid and on the bench
// without being re-entered for each.
const PET_TWEAKS = {};
const MONSTER_TWEAKS = {};

// translate/scale as INDEPENDENT properties where they exist, so they
// compose with any transform the stylesheet or an animation already
// puts on the wrapper rather than replacing it. Same reasoning as the
// battle simulator's layout rules.
const HAS_TRANSFORM_PROPS = (() => {
  try { return !!(window.CSS && CSS.supports && CSS.supports('translate', '1px')); }
  catch { return false; }
})();

const numOf = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function tweakFor(info) {
  if (!info) return null;
  if (info.kind === 'pet') {
    return PET_TWEAKS[info.id + ':' + info.form] || PET_TWEAKS[info.id] || null;
  }
  return MONSTER_TWEAKS[info.id] || null;
}

// ────────────────────── RESOLUTION ────────────────────────

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

// Writes one art set's offset and size onto the sprite wrapper.
//
// The WRAPPER, not the img: the img already carries `flip` and the
// creature scale as transforms, and this would overwrite them. The
// wrapper carries only the grounding margins, which are margins and so
// do not collide.
//
// Scaled from `center bottom` so growing a sprite makes it taller
// rather than pushing it through the floor — the feet stay where the
// renderer put them, which is the whole point of GROUND_DROP.
//
// Values are always SET or CLEARED, never adjusted from what is
// already there, so this stays correct however many times it runs.
function applyTweak(wrap, info) {
  const tw = tweakFor(info);
  const dx = Math.round(numOf(tw && tw.dx));
  const dy = Math.round(numOf(tw && tw.dy));
  const sc = numOf(tw && tw.scale, 1) || 1;

  if (!dx && !dy && sc === 1) {
    wrap.style.translate = '';
    wrap.style.scale = '';
    wrap.style.transformOrigin = '';
    if (!HAS_TRANSFORM_PROPS) wrap.style.transform = '';
    return;
  }

  wrap.style.transformOrigin = 'center bottom';
  if (HAS_TRANSFORM_PROPS) {
    wrap.style.translate = dx + 'px ' + dy + 'px';
    wrap.style.scale = String(sc);
  } else {
    // Older engines only: this one DOES take over the wrapper's
    // transform. Nothing in the battle CSS puts a transform there
    // today, but an animation added to .bu-sprite-wrap later would be
    // suppressed on a tweaked character in these browsers.
    wrap.style.transform = `translate(${dx}px,${dy}px) scale(${sc})`;
  }
}

// Re-decides facing, floating, ground offset and per-character tweak
// for one battle unit. These are SET rather than toggled, so this
// lands on the same answer however many times it runs, and can correct
// the renderer in either direction.
function applyPose(unitEl) {
  const img = unitEl.querySelector('img.bu-sprite');
  if (!img) return; // procedural SVG unit — not ours to touch
  const info = spriteInfo(img.getAttribute('src'));
  if (!info) return;

  const want = unitEl.dataset.side === 'foe' ? 'left' : 'right';
  const airborne = isAirborne(info);

  img.classList.toggle('flip', drawnFacing(info) !== want);
  img.classList.toggle('float', airborne);

  // Sit planted sprites down onto the floor. Applied to the wrapper so
  // the img's own transform (flip / scale) is never overwritten.
  const wrap = img.closest('.bu-sprite-wrap') || img.parentElement;
  if (!wrap) return;
  wrap.classList.toggle('grounded', !airborne);
  wrap.style.marginTop = airborne ? '' : GROUND_DROP;
  wrap.style.marginBottom = airborne ? '' : '-' + GROUND_DROP;

  applyTweak(wrap, info);
}

function scan(node) {
  if (!node || node.nodeType !== 1) return;
  if (node.matches && node.matches('.bunit')) applyPose(node);
  const inner = node.querySelectorAll && node.querySelectorAll('.bunit');
  if (inner) inner.forEach(applyPose);
}

// Re-runs the pose pass over everything currently on screen. The
// observer below only fires on newly inserted units, which is all the
// game itself ever needs; an editor changing one of the tables above
// needs the units that are ALREADY standing there to pick the change
// up without a full repaint.
function refreshPoses() {
  scan(document.body);
}

function install() {
  scan(document.body);
  // childList ONLY. Watching attributes would mean our own class and
  // style writes re-entered this observer; renderBattleSide() rebuilds
  // the whole .bunit element on every paint anyway, so additions are
  // all we need.
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
  GROUND_DROP,
  MONSTER_FACING,
  PET_FACING,
  FLOAT_FORMS,
  FLOAT_PETS,
  FLOAT_MONSTERS,
  PET_TWEAKS,
  MONSTER_TWEAKS,
  drawnFacingFor,
  refreshPoses,
  spriteInfo,
  tweakFor,
};
