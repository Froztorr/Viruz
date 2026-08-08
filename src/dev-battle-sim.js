// VIRUZ PET — Battle Scene Simulator (dev tool)
//
// The simulator does not imitate the fight screen. It builds a real
// battle object with setBattle(), paints it with the real
// renderBattle(), and hangs an editing layer on top. Every plate,
// gauge, skill card, bench chip and sprite in here is the same DOM a
// live fight renders, so the preview cannot drift from the game the
// way the old hand-drawn mock-up did.
//
// It deliberately does NOT call scheduleTurn(), startRegen() or
// startSkillCooldownTicker(). Nothing takes a turn, so the scene is
// live but frozen -- which is exactly what makes it editable.
//
// THREE PETS, NOT ONE. renderBench() draws one chip per battle.team
// entry, so a one-pet sandbox could only ever draw one chip and the
// bench row could not be positioned honestly. The sandbox squad is a
// full three, like a real fight, and the chips are clickable to change
// which pet is standing on stage.
//
// THREE SCOPES OF EDIT, AND THEY ARE NOT INTERCHANGEABLE:
//   • a PANEL or GAUGE is one box in the interface, moved by CSS rule;
//   • a WHOLE SIDE moves every character standing on it at once, which
//     is what you want for pushing the two fighters apart;
//   • a CHARACTER is one art set, moved and resized on its own.
// The third is keyed per art set rather than per battle slot, exactly
// like hover and facing, because "this creature is drawn too big" is
// true of the creature wherever it shows up -- so the fix follows it
// into the arena, a raid and a boss fight without being re-entered.
// The trade is that the same species in two slots cannot be given two
// different sizes; that is a property of a scene, not of the art, and
// this tool edits art.
//
// HOVER, FACING AND SIZE ARE NOT PREVIEWS. They are written straight
// into the live tables exported by facing.js, which is the only
// authority the renderer consults -- applyPose() re-derives flip,
// float and the per-character offset from those tables on every DOM
// change and overrides whatever combat.js decided. The keys are read
// back out of the sprite that is actually on screen, using facing.js's
// own spriteInfo(), because facing.js resolves everything from the ART
// PATH rather than from the pet object; deriving the key any other way
// would tick a box that the renderer then never looks up. Saved edits
// are replayed at boot, so they survive a reload and show up in real
// fights too.
//
// THE LAYOUT IS CSS, NOT INLINE STYLE. Individual gauges live inside
// the name plates, and renderBattleSide() rebuilds plate.innerHTML
// from scratch on every paint -- an inline transform on .np-hp is
// destroyed by the very next HP tick. (Inline style worked for the
// containers only because #plate-ally, #skill-bar and friends are
// never themselves rebuilt.) Writing the layout as real CSS rules in
// one stylesheet sidesteps the whole problem: the rules re-match the
// new elements the moment they exist, no re-application needed.
// Characters are the exception and go through facing.js instead, which
// re-applies itself on every insertion for the same reason.
//
// A TUNED LAYOUT BELONGS IN SOURCE, NOT IN localStorage. Positions
// that have been settled on are written into SHIPPED below (and into
// facing.js for characters), so every player gets them on every
// device. localStorage then holds only what a developer is still
// moving around. See SHIPPED for how the two layer.
//
// combat.js is pulled in with a dynamic import rather than a static
// one. This module is loaded early and combat.js sits in a dense
// import cycle (combat -> turn-loop -> combat, combat -> ui-shell);
// deferring it to the moment the tool is opened keeps this file out of
// that graph entirely.

import { ANTIVIRUZ, SPECIES, SPECIES_KEYS } from './data.js';
import { createPet, spawnAntiviruz, statsOf } from './engine.js';
import {
  FLOAT_FORMS, FLOAT_MONSTERS, FLOAT_PETS,
  MONSTER_FACING, MONSTER_TWEAKS,
  PET_FACING, PET_TWEAKS,
  refreshPoses, spriteInfo,
} from './facing.js';
import { $, battle, setBattle } from './state.js';
import { showScreen, toast } from './ui-shell.js';

const DEV_FLAG_KEY = 'viruz.devMode.enabled';
const SIM_KEY = 'viruz.devMode.battleSim.v3';
const OLD_SIM_KEY = 'viruz.devMode.battleSim.v2';
const PATCH_KEY = 'viruz.devMode.patchExport.v3';
const STYLE_ID = 'dev-battle-sim-style';
const LAYOUT_STYLE_ID = 'dev-battle-sim-layout';
const PANEL_ID = 'dbs-panel';
const TEAM_SIZE = 3;

// Every editable box in the real battle screen, as [key, label,
// selector]. These are the actual game elements -- not stand-ins.
const UI_TARGETS = [
  ['plateAlly', 'My plate (whole block)', '#plate-ally'],
  ['plateFoe',  'Enemy plate (whole block)', '#plate-foe'],
  ['top',       'Title / wave text', '#battle-top'],
  ['skills',    'Skill cards', '#skill-bar'],
  ['potions',   'Bag / poison buttons', '#potion-bar'],
  ['bench',     'Bench row', '#battle-bench'],
  ['log',       'Battle log', '#battle-log'],
  ['hit',       'HIT button', '#hit-btn-row'],
  ['ctrl',      'Flee / speed row', '#battle-ctrl'],
];
// Whole-side offsets. These move the CONTAINER, so every character
// standing on that side travels together -- the right tool for pushing
// the two fighters apart, the wrong one for fixing a single sprite.
const SIDE_TARGETS = [
  ['ally', 'My whole side (all allies together)', '#battle-allies'],
  ['foe',  'Enemy whole side (all foes together)', '#battle-enemies'],
];
// The gauges inside the plates, individually, as
// [key, label, selector, short]. Selectors come straight from
// renderBattleSide()/vitalHtml()/gaugeBarHtml() in battle/combat.js.
// The ally keeps HP as a heart and MP as a circle; when its sprite is
// large those two get wrapped in .np-vitals-inline, which a descendant
// selector still matches. The foe plate is built WITHOUT an .np-mp at
// all, so there is deliberately no enemy MP target here -- a handle
// for an element the game never renders would just be a lie.
const BAR_TARGETS = [
  ['allyHp',   'My HP heart',    '#plate-ally .np-hp',          'HP'],
  ['allyMp',   'My MP orb',      '#plate-ally .np-mp',          'MP'],
  ['allySpd',  'My SPD bar',     '#plate-ally .gauge-bar.spd',  'SPD'],
  ['allyCrit', 'My CRT bar',     '#plate-ally .gauge-bar.crit', 'CRT'],
  ['foeHp',    'Enemy HP heart', '#plate-foe .np-hp',           'HP'],
  ['foeSpd',   'Enemy SPD bar',  '#plate-foe .gauge-bar.spd',   'SPD'],
  ['foeCrit',  'Enemy CRT bar',  '#plate-foe .gauge-bar.crit',  'CRT'],
];

// ── THE LAYOUT THAT SHIPS WITH THE GAME ──
// Tuned in this tool, then promoted here so it applies to every player
// on every device instead of living in whichever browser did the
// tuning. A developer's own saved edit is layered ON TOP of these, per
// key and per field, so dragging still overrides a shipped value and
// "Reset this" puts a box back to what is written here rather than to
// the bare CSS position. An edit that merely restates a shipped value
// is dropped at boot (see dropRedundantEdits) so it cannot mask a
// later change made in this file.
//
// Per-character offsets are NOT here -- they live in facing.js's
// PET_TWEAKS / MONSTER_TWEAKS, next to that character's facing and
// hover, because they are the same kind of fact.
//
// These are absolute pixel offsets, not percentages, measured on one
// screen. Nearly all of them are small relative to the box they move,
// which is why they travel well; the one exception is called out
// below.
const SHIPPED = {
  ui: {
    plateAlly: { dx: -7, dy: -8 },
    plateFoe:  { dx: -5, dy: -9 },
    top:       { dx: 3,  dy: 7  },
  },
  sides: {
    // Both fighters pulled in toward the middle of the stage.
    ally: { dx: 41,  dy: 0 },
    foe:  { dx: -21, dy: 2, scale: 1.01 },
  },
  bars: {
    allyMp:   { dx: -29, dy: 0 },
    allySpd:  { dx: -2, dy: -10, scale: 0.71 },
    allyCrit: { dx: -8, dy: -10, scale: 0.72 },
    // The enemy's two gauges are lifted clear out of its plate. 129px
    // is a large fixed offset and it was measured against a
    // phone-sized stage: on a much taller viewport these will not land
    // in the same spot relative to the sprite, because the distance
    // they need to travel scales with the stage and this number does
    // not. Kept exactly as tuned -- worth re-checking on a tablet.
    foeSpd:   { dx: 4,  dy: -129, scale: 0.71 },
    foeCrit:  { dx: -2, dy: -129, scale: 0.71 },
  },
};

// facing.js's per-character tables as they arrive from source, taken
// BEFORE any saved edit is folded in. Without this snapshot there
// would be no way back: applying a saved tweak overwrites the table
// entry, so "Reset this" would have nothing to restore and would leave
// the character at the edit it was meant to undo.
const SHIPPED_TWEAKS = {
  pets: JSON.parse(JSON.stringify(PET_TWEAKS)),
  monsters: JSON.parse(JSON.stringify(MONSTER_TWEAKS)),
};

const PET_KEYS = (SPECIES_KEYS && SPECIES_KEYS.length ? SPECIES_KEYS : Object.keys(SPECIES));
const ENEMY_KEYS = Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_'));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = x => JSON.parse(JSON.stringify(x));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round2 = n => Math.round(num(n) * 100) / 100;

// ── SAVED LAYOUT ──
// Everything defaults to empty. What load() returns is ONLY the
// developer's own edits -- the shipped layout is folded in by
// effective() at the point of use, so a saved file never accumulates a
// stale copy of values this module already states in source.
function blank() {
  return {
    ui: {},
    sides: {},
    bars: {},
    chars: { pets: {}, monsters: {} },
    facing: { pets: {}, monsters: {} },
    float: { pets: {}, forms: {}, monsters: {} },
    actors: { team: [], foe: {} },
  };
}
function load() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(SIM_KEY) || localStorage.getItem(OLD_SIM_KEY) || '{}') || {}; }
  catch { raw = {}; }
  const cfg = blank();
  Object.assign(cfg.ui, raw.ui || {});
  Object.assign(cfg.sides, raw.sides || {});
  Object.assign(cfg.bars, raw.bars || {});
  if (raw.chars) {
    Object.assign(cfg.chars.pets, raw.chars.pets || {});
    Object.assign(cfg.chars.monsters, raw.chars.monsters || {});
  }
  // v2 stored facing/float as one flat id->value map with no way to
  // tell a pet id from a form name from a monster folder. Those cannot
  // be replayed safely, so only the box positions carry over.
  if (raw.facing && !Array.isArray(raw.facing)) {
    Object.assign(cfg.facing.pets, raw.facing.pets || {});
    Object.assign(cfg.facing.monsters, raw.facing.monsters || {});
  }
  if (raw.float) {
    Object.assign(cfg.float.pets, raw.float.pets || {});
    Object.assign(cfg.float.forms, raw.float.forms || {});
    Object.assign(cfg.float.monsters, raw.float.monsters || {});
  }
  if (raw.actors) {
    cfg.actors.team = Array.isArray(raw.actors.team) ? raw.actors.team.slice(0, TEAM_SIZE) : [];
    cfg.actors.foe = raw.actors.foe || {};
  }
  return cfg;
}
function store(cfg) {
  localStorage.setItem(SIM_KEY, JSON.stringify(cfg));
  // Keep feeding the shared patch export so dev-mode.js's
  // "Copy changed-parts JSON" still carries the battle layout.
  try {
    const patch = JSON.parse(localStorage.getItem(PATCH_KEY) || '{}');
    patch.battleSimulator = clone(cfg);
    localStorage.setItem(PATCH_KEY, JSON.stringify(patch));
  } catch { /* patch export is best-effort only */ }
}

// ── ONE ADDRESS FOR EVERY EDITABLE THING ──
// A selection key is either a plain key into cfg.ui / cfg.sides /
// cfg.bars, or 'char:<pets|monsters>:<art key>' for a character. The
// art key itself contains colons for pets ('inkarm:stage1'), so it is
// always rejoined from the tail rather than read as one field.
function splitChar(selKey) {
  const parts = String(selKey).split(':');
  return { scope: parts[1] === 'monsters' ? 'monsters' : 'pets', key: parts.slice(2).join(':') };
}

// What is actually in force for one box: the shipped position with the
// developer's saved edit written over the top of it, field by field.
// Merging per FIELD matters -- a drag saves dx/dy only, and must not
// silently discard a shipped scale.
function effective(cfg, group, key) {
  if (group === 'chars') {
    const { scope, key: k } = splitChar(key);
    return Object.assign({}, (SHIPPED_TWEAKS[scope] || {})[k], (cfg.chars[scope] || {})[k]);
  }
  return Object.assign({}, (SHIPPED[group] || {})[key], (cfg[group] || {})[key]);
}
function writeVal(cfg, group, key, patch) {
  if (group === 'chars') {
    const { scope, key: k } = splitChar(key);
    cfg.chars[scope][k] = Object.assign({}, cfg.chars[scope][k], patch);
    return;
  }
  cfg[group][key] = Object.assign({}, cfg[group][key], patch);
}
function clearVal(cfg, group, key) {
  if (group === 'chars') {
    const { scope, key: k } = splitChar(key);
    delete cfg.chars[scope][k];
    return;
  }
  delete cfg[group][key];
}
// Layout is CSS, characters go through facing.js. Anything that
// changes a value calls this rather than picking one.
function applyAll() {
  applyBattleSimLayout();
  applyCharTweaks();
}

// A saved edit that says exactly what SHIPPED already says is dead
// weight twice over: it pins the box to today's value even if this
// file changes tomorrow, and it fills "Copy JSON" with lines that no
// longer need pasting anywhere. Same for a pose that facing.js now
// states outright. Cleared once, at boot.
function dropRedundantEdits() {
  const cfg = load();
  let changed = false;
  const same = (a, b) =>
    Math.round(num(a.dx)) === Math.round(num(b.dx)) &&
    Math.round(num(a.dy)) === Math.round(num(b.dy)) &&
    num(a.scale, 1) === num(b.scale, 1) &&
    (a.origin || '') === (b.origin || '');
  ['ui', 'sides', 'bars'].forEach(group => {
    Object.keys(cfg[group]).forEach(key => {
      const ship = (SHIPPED[group] || {})[key];
      if (ship && same(cfg[group][key] || {}, ship)) { delete cfg[group][key]; changed = true; }
    });
  });
  ['pets', 'monsters'].forEach(scope => {
    Object.keys(cfg.chars[scope]).forEach(key => {
      const ship = (SHIPPED_TWEAKS[scope] || {})[key];
      if (ship && same(cfg.chars[scope][key] || {}, ship)) { delete cfg.chars[scope][key]; changed = true; }
    });
  });
  // Must run BEFORE applySavedPose(), which would otherwise write the
  // saved copy back over the tables and make every comparison match.
  Object.keys(cfg.facing.pets).forEach(k => {
    const id = k.split(':')[0];
    const shipped = PET_FACING[k] || PET_FACING[id];
    if (shipped && shipped === cfg.facing.pets[k]) { delete cfg.facing.pets[k]; changed = true; }
  });
  Object.keys(cfg.facing.monsters).forEach(k => {
    if (MONSTER_FACING[k] && MONSTER_FACING[k] === cfg.facing.monsters[k]) {
      delete cfg.facing.monsters[k]; changed = true;
    }
  });
  // Hover is a boolean, so unlike facing there is no "unset" value to
  // test against -- a saved `false` is only redundant once facing.js
  // itself stops listing that id as airborne. Comparing against the
  // live Sets catches exactly that case.
  const floatSame = (map, set) => {
    Object.keys(map).forEach(id => {
      if (set.has(id) === !!map[id]) { delete map[id]; changed = true; }
    });
  };
  floatSame(cfg.float.pets, FLOAT_PETS);
  floatSame(cfg.float.forms, FLOAT_FORMS);
  floatSame(cfg.float.monsters, FLOAT_MONSTERS);
  if (changed) store(cfg);
}

// ── APPLYING THE LAYOUT TO THE REAL SCREEN ──
// Movement is a transform, never position:absolute + left/top. An
// absolute position rips the element out of normal flow, which is what
// made the older battle-UI editor collapse the rows around whatever it
// moved. A transform leaves layout completely intact.
//
// Where the browser supports them, the INDEPENDENT translate/scale
// properties are used instead of the transform shorthand. The gauges
// are animated by the game itself (the crit bar pulses when ready, a
// struck unit shakes), and those keyframes drive `transform`; writing
// the offset into the same property would mean either the animation
// snapping the bar back to its old spot, or an !important that kills
// the animation outright. translate/scale compose with transform
// rather than competing with it, so a moved gauge keeps its pulse.
// Engines without them fall back to the shorthand.
const HAS_INDEPENDENT_TRANSFORMS = (() => {
  try { return !!(window.CSS && CSS.supports && CSS.supports('translate', '1px')); }
  catch { return false; }
})();

function ruleFor(sel, v) {
  if (!v) return '';
  const dx = Math.round(num(v.dx));
  const dy = Math.round(num(v.dy));
  const s = num(v.scale, 1) || 1;
  if (!dx && !dy && s === 1) return '';
  const origin = v.origin || 'center bottom';
  if (HAS_INDEPENDENT_TRANSFORMS) {
    return `${sel}{translate:${dx}px ${dy}px;scale:${s};transform-origin:${origin};}\n`;
  }
  return `${sel}{transform:translate(${dx}px,${dy}px) scale(${s})!important;transform-origin:${origin}!important;}\n`;
}

export function applyBattleSimLayout() {
  const cfg = load();
  let css = '';
  SIDE_TARGETS.forEach(([key, , sel]) => { css += ruleFor(sel, effective(cfg, 'sides', key)); });
  UI_TARGETS.forEach(([key, , sel]) => { css += ruleFor(sel, effective(cfg, 'ui', key)); });
  BAR_TARGETS.forEach(([key, , sel]) => { css += ruleFor(sel, effective(cfg, 'bars', key)); });
  let st = document.getElementById(LAYOUT_STYLE_ID);
  if (!st) {
    st = document.createElement('style');
    st.id = LAYOUT_STYLE_ID;
    document.head.appendChild(st);
  }
  if (st.textContent !== css) st.textContent = css;
}

// Rebuilds facing.js's per-character tables from scratch every time:
// shipped values first, saved edits merged over the top. Rebuilding
// rather than patching is what makes deletion work -- clearing a saved
// tweak has to be able to put the shipped value BACK, and a table that
// is only ever written to cannot do that.
function syncTweakTable(live, shipped, saved) {
  Object.keys(live).forEach(k => { delete live[k]; });
  Object.entries(shipped).forEach(([k, v]) => { live[k] = Object.assign({}, v); });
  Object.entries(saved).forEach(([k, v]) => { live[k] = Object.assign({}, shipped[k], v); });
}
export function applyCharTweaks() {
  const cfg = load();
  syncTweakTable(PET_TWEAKS, SHIPPED_TWEAKS.pets, cfg.chars.pets);
  syncTweakTable(MONSTER_TWEAKS, SHIPPED_TWEAKS.monsters, cfg.chars.monsters);
  // facing.js only re-poses units as they are inserted, so units
  // already standing on the stage have to be told to look again.
  refreshPoses();
}

// The previous battle-UI editor (in dev-mode.js) wrote absolute
// left/top onto these same elements and saved them under
// patch.battleLayout. Anything still sitting in that key would fight
// this module's transforms for the rest of the session, so it is
// cleared out once, on boot, and any inline leftovers are stripped.
function dropLegacyBattleLayout() {
  try {
    const patch = JSON.parse(localStorage.getItem(PATCH_KEY) || '{}');
    if (patch && patch.battleLayout && Object.keys(patch.battleLayout).length) {
      patch.battleLayout = {};
      localStorage.setItem(PATCH_KEY, JSON.stringify(patch));
    }
  } catch { /* nothing worth saving in a corrupt patch */ }
  document.querySelectorAll('.dev-moved-battle-ui').forEach(node => {
    node.classList.remove('dev-moved-battle-ui');
    node.style.left = '';
    node.style.top = '';
    node.style.right = '';
    node.style.bottom = '';
  });
}

// ── HOVER + FACING + THE CHARACTERS ON STAGE ──
// facing.js keys everything off the sprite's own src path, so the key
// is read from the sprite currently rendered on that side rather than
// guessed from the pet object (a pet's mutation form and its art
// folder are not the same field).
function liveInfo(isEnemy) {
  const img = document.querySelector(`#battle-${isEnemy ? 'enemies' : 'allies'} .bunit img.bu-sprite`);
  return img ? spriteInfo(img.getAttribute('src')) : null;
}

// Every character currently drawn from an art file, on either side,
// with the key facing.js will look it up under. Units rendered as
// procedural SVG are skipped: facing.js does not manage those, so a
// handle on one would move nothing.
//
// Only the pets actually on stage appear here. To edit a benched one,
// tap its bench chip to bring it out first -- renderBattleSide() draws
// the active pet and nothing else, so there is no sprite to grab until
// then.
function liveChars() {
  const out = [];
  document.querySelectorAll('#battle-allies .bunit, #battle-enemies .bunit').forEach(el => {
    const img = el.querySelector('img.bu-sprite');
    if (!img) return;
    const info = spriteInfo(img.getAttribute('src'));
    if (!info) return;
    const scope = info.kind === 'pet' ? 'pets' : 'monsters';
    const key = info.kind === 'pet' ? `${info.id}:${info.form}` : info.id;
    const isEnemy = el.dataset.side === 'foe';
    out.push({
      el, info, scope, key, isEnemy,
      sel: `char:${scope}:${key}`,
      label: `${isEnemy ? 'Enemy' : 'Ally'}: ${key}`,
    });
  });
  return out;
}

function isFloating(info) {
  if (!info) return false;
  if (info.kind === 'pet') return FLOAT_FORMS.has(info.form) || FLOAT_PETS.has(info.id);
  return FLOAT_MONSTERS.has(info.id);
}
function setFloating(info, on) {
  if (!info) return;
  const cfg = load();
  if (info.kind === 'monster') {
    on ? FLOAT_MONSTERS.add(info.id) : FLOAT_MONSTERS.delete(info.id);
    cfg.float.monsters[info.id] = !!on;
  } else if (FLOAT_FORMS.has(info.form) && !on) {
    // A whole mutation form floats (e.g. every phantom). Turning it off
    // here turns it off for that form across the game -- say so plainly
    // rather than silently doing nothing.
    FLOAT_FORMS.delete(info.form);
    cfg.float.forms[info.form] = false;
    toast(`ปิดการลอยของร่าง ${info.form} ทั้งหมด`);
  } else {
    on ? FLOAT_PETS.add(info.id) : FLOAT_PETS.delete(info.id);
    cfg.float.pets[info.id] = !!on;
  }
  store(cfg);
}
function drawnFacing(info) {
  if (!info) return 'right';
  if (info.kind === 'pet') return PET_FACING[`${info.id}:${info.form}`] || PET_FACING[info.id] || 'right';
  return MONSTER_FACING[info.id] || 'right';
}
function setDrawnFacing(info, dir) {
  if (!info) return;
  const cfg = load();
  if (info.kind === 'pet') {
    // Written per FORM, the most specific key facing.js checks, so
    // fixing one mutation's art never mirrors the other four.
    const key = `${info.id}:${info.form}`;
    PET_FACING[key] = dir;
    cfg.facing.pets[key] = dir;
  } else {
    MONSTER_FACING[info.id] = dir;
    cfg.facing.monsters[info.id] = dir;
  }
  store(cfg);
}
// Replays saved pose edits into facing.js's tables at boot, so they
// hold across reloads and inside real fights -- not just in the tool.
function applySavedPose() {
  const cfg = load();
  Object.entries(cfg.facing.pets).forEach(([k, v]) => { PET_FACING[k] = v; });
  Object.entries(cfg.facing.monsters).forEach(([k, v]) => { MONSTER_FACING[k] = v; });
  Object.entries(cfg.float.pets).forEach(([id, on]) => { on ? FLOAT_PETS.add(id) : FLOAT_PETS.delete(id); });
  Object.entries(cfg.float.forms).forEach(([id, on]) => { on ? FLOAT_FORMS.add(id) : FLOAT_FORMS.delete(id); });
  Object.entries(cfg.float.monsters).forEach(([id, on]) => { on ? FLOAT_MONSTERS.add(id) : FLOAT_MONSTERS.delete(id); });
}

// ── THE FROZEN SANDBOX FIGHT ──
let simState = null;   // { prevScreen, prevBattle, team, foe, sel }

function makeAlly(speciesId, level) {
  const p = createPet(speciesId, 'rare');
  p.level = Math.max(1, num(level, 30));
  p.hp = statsOf(p).mhp;
  p.mp = statsOf(p).int;
  return p;
}
function makeFoe(enemyId, level) {
  const f = spawnAntiviruz(enemyId, Math.max(1, num(level, 30)));
  f.isEnemy = true;
  f.hp = statsOf(f).mhp;
  return f;
}
function buildTeam(cfg) {
  const team = [];
  for (let i = 0; i < TEAM_SIZE; i++) {
    const fallback = PET_KEYS[i % PET_KEYS.length];
    const want = Object.assign({ speciesId: fallback, level: 30 }, cfg.actors.team[i] || {});
    team.push(makeAlly(SPECIES[want.speciesId] ? want.speciesId : fallback, want.level));
  }
  return team;
}
function activePet() {
  if (!simState) return null;
  const idx = battle ? num(battle.activeIdx) : 0;
  return simState.team[idx] || simState.team[0];
}

async function paint() {
  if (!simState) return;
  try {
    const { renderBattle } = await import('./battle/combat.js');
    renderBattle();
  } catch (err) {
    console.warn('[battle-sim] renderBattle failed:', err);
  }
  // The layout itself is CSS and re-matches the rebuilt plate on its
  // own, but the drag handles are absolutely positioned from measured
  // rectangles, so those do have to be re-measured after a repaint.
  setTimeout(() => { applyAll(); wireBench(); installHandles(); }, 30);
}

// Real bench chips, made selectable. renderBench() paints one per
// battle.team entry and rings whichever matches battle.activeIdx, so
// pointing activeIdx at another pet is all it takes to swap who is on
// stage -- same mechanism the live swap menu uses. This is also how
// you reach a benched pet's own size and position.
function wireBench() {
  const bench = $('battle-bench');
  if (!bench || !simState) return;
  [...bench.querySelectorAll('.bench-chip')].forEach((chip, i) => {
    chip.style.cursor = 'pointer';
    chip.title = 'SIM: สลับตัวที่ยืนอยู่หน้าเวที';
    chip.onclick = () => setActive(i);
  });
}
async function setActive(i) {
  if (!simState || !battle) return;
  if (i < 0 || i >= battle.team.length) return;
  battle.activeIdx = i;
  if (simState) simState.sel = 'ally';
  await paint();
  buildPanel();
  installHandles();
}

async function openSim() {
  if (battle && !battle.__sim) { toast('ออกจากการต่อสู้ก่อนจึงเปิด SIM ได้'); return; }
  if (simState) return;
  injectStyles();
  dropLegacyBattleLayout();

  const cfg = load();
  const f = Object.assign({ speciesId: ENEMY_KEYS[0], level: 30 }, cfg.actors.foe);
  let team, foe;
  try {
    team = buildTeam(cfg);
    foe = makeFoe(ANTIVIRUZ[f.speciesId] ? f.speciesId : ENEMY_KEYS[0], f.level);
  } catch (err) {
    console.error('[battle-sim] could not build sandbox fighters:', err);
    toast('สร้างฉากทดสอบไม่สำเร็จ');
    return;
  }

  simState = {
    prevScreen: $('app')?.dataset.screen || 'map',
    prevBattle: battle || null,
    team, foe,
    sel: 'ally',
  };

  // Same shape every real encounter builds (see startZone/startArena in
  // battle/encounters.js) plus a __sim marker so nothing else mistakes
  // this for a genuine fight.
  setBattle({
    __sim: true,
    mode: 'arena',
    team, enemies: [foe],
    wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  });
  showScreen('battle');
  const title = $('battle-title'); if (title) title.textContent = '🎛️ Battle Simulator';
  const wave = $('battle-wave'); if (wave) wave.textContent = 'โหมดแก้ไข — หยุดทุกเทิร์น';
  await paint();
  buildPanel();
  installHandles();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', installHandles);
}

function closeSim() {
  const st = simState;
  simState = null;
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('resize', installHandles);
  document.getElementById(PANEL_ID)?.remove();
  document.querySelectorAll('.dbs-handle').forEach(h => h.remove());
  document.querySelectorAll('.dbs-lit').forEach(n => n.classList.remove('dbs-lit'));
  document.body.classList.remove('dbs-editing');
  if (!st) return;
  setBattle(st.prevBattle || null);
  showScreen(st.prevScreen === 'battle' ? 'map' : st.prevScreen);
}

// ── DRAG HANDLES OVER THE REAL ELEMENTS ──
let drag = null;

// [group, key, label, selector, short?] for every draggable box. The
// characters are not in here: they are found by scanning the stage,
// because which ones exist depends on who is standing on it.
function targetsAll() {
  return [
    ...SIDE_TARGETS.map(r => ['sides', ...r]),
    ...UI_TARGETS.map(r => ['ui', ...r]),
    ...BAR_TARGETS.map(r => ['bars', ...r]),
  ];
}

function placeHandle(group, key, label, el, opts) {
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  const on = simState.sel === key;
  if (on) el.classList.add('dbs-lit');
  const h = document.createElement('button');
  h.type = 'button';
  h.className = 'dbs-handle' + (opts.cls ? ' ' + opts.cls : '') + (on ? ' on' : '');
  h.dataset.key = key;
  h.textContent = opts.text;
  h.title = label;
  h.style.left = opts.x + 'px';
  h.style.top = opts.y + 'px';
  h.onpointerdown = e => beginDrag(e, group, key, h);
  document.body.appendChild(h);
  return h;
}

function installHandles() {
  document.querySelectorAll('.dbs-handle').forEach(h => h.remove());
  document.querySelectorAll('.dbs-lit').forEach(n => n.classList.remove('dbs-lit'));
  if (!simState) return;
  document.body.classList.add('dbs-editing');

  // Characters first, so a sprite handle sits under the panel handles
  // rather than swallowing their clicks.
  liveChars().forEach(c => {
    const r = c.el.getBoundingClientRect();
    placeHandle('chars', c.sel, c.label, c.el, {
      cls: 'char',
      text: '✥ ' + c.key,
      x: r.left + r.width / 2,
      // Pinned near the top of the sprite: the middle of a large
      // creature is usually behind its own name plate.
      y: r.top + Math.min(18, r.height / 2),
    });
  });

  const placed = [];
  targetsAll().forEach(([group, key, label, sel, short]) => {
    const t = document.querySelector(sel);
    if (!t) return;                       // e.g. the foe plate has no .np-mp
    const r = t.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const isBar = group === 'bars';
    let x = r.left + r.width / 2;
    let y = r.top + r.height / 2;
    // A gauge can be a few pixels wide, so several bar handles would
    // land on top of each other and only the last one would be
    // clickable. Push each one clear of whatever is already there.
    if (isBar) {
      let guard = 0;
      while (placed.some(p => Math.abs(p.x - x) < 34 && Math.abs(p.y - y) < 17) && guard++ < 8) y += 18;
      placed.push({ x, y });
    }
    placeHandle(group, key, label, t, {
      cls: isBar ? 'mini' : '',
      text: isBar ? (short || label) : ('✥ ' + label),
      x, y,
    });
  });
}
function beginDrag(e, group, key, handle) {
  e.preventDefault(); e.stopPropagation();
  // Starts from where the box actually IS, shipped offset included --
  // otherwise the first pixel of a drag would snap a shipped box back
  // to the bare CSS position.
  const cur = effective(load(), group, key);
  drag = { group, key, handle, x0: e.clientX, y0: e.clientY, dx0: num(cur.dx), dy0: num(cur.dy), hx: parseFloat(handle.style.left), hy: parseFloat(handle.style.top) };
  if (simState) simState.sel = key;
  document.querySelectorAll('.dbs-handle').forEach(h => h.classList.toggle('on', h.dataset.key === key));
  handle.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', onDrag, true);
  window.addEventListener('pointerup', endDrag, true);
  buildPanel();
}
function onDrag(e) {
  if (!drag) return;
  const cfg = load();
  writeVal(cfg, drag.group, drag.key, {
    dx: Math.round(drag.dx0 + (e.clientX - drag.x0)),
    dy: Math.round(drag.dy0 + (e.clientY - drag.y0)),
  });
  store(cfg);
  applyAll();
  drag.handle.style.left = (drag.hx + (e.clientX - drag.x0)) + 'px';
  drag.handle.style.top = (drag.hy + (e.clientY - drag.y0)) + 'px';
}
function endDrag() {
  window.removeEventListener('pointermove', onDrag, true);
  window.removeEventListener('pointerup', endDrag, true);
  drag = null;
  buildPanel();
}

// Arrow keys nudge the selected box by 1px, Shift+arrow by 10 -- a drag
// is fine for roughing a position in, useless for the last few pixels,
// and a gauge is far too small to drag accurately in the first place.
function onKey(e) {
  if (!simState) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!step) return;
  e.preventDefault();
  const mult = e.shiftKey ? 10 : 1;
  const info = selInfo();
  const cfg = load();
  const cur = effective(cfg, info.group, info.key);
  writeVal(cfg, info.group, info.key, {
    dx: num(cur.dx) + step[0] * mult,
    dy: num(cur.dy) + step[1] * mult,
  });
  store(cfg);
  applyAll();
  installHandles();
  buildPanel();
}

// ── EDITOR PANEL ──
function selInfo() {
  const key = simState?.sel || 'ally';
  if (String(key).startsWith('char:')) {
    const ch = liveChars().find(c => c.sel === key);
    // The selected character can walk off stage -- swap the species and
    // its art key changes underneath the selection. Fall back rather
    // than editing a key nothing on screen uses.
    if (ch) {
      return { group: 'chars', key, label: ch.label, isSprite: true, isChar: true, isEnemy: ch.isEnemy, pose: ch.info };
    }
    return { group: 'sides', key: 'ally', label: SIDE_TARGETS[0][1], isSprite: true, isChar: false, isEnemy: false, pose: liveInfo(false) };
  }
  const side = SIDE_TARGETS.find(r => r[0] === key);
  if (side) return { group: 'sides', key, label: side[1], isSprite: true, isChar: false, isEnemy: key === 'foe', pose: liveInfo(key === 'foe') };
  const bar = BAR_TARGETS.find(r => r[0] === key);
  if (bar) return { group: 'bars', key, label: bar[1], isSprite: false, isChar: false, isEnemy: false, pose: null };
  const ui = UI_TARGETS.find(r => r[0] === key);
  return { group: 'ui', key, label: ui ? ui[1] : key, isSprite: false, isChar: false, isEnemy: false, pose: null };
}

function buildPanel() {
  if (!simState) return;
  document.getElementById(PANEL_ID)?.remove();
  const cfg = load();
  const info = selInfo();
  const v = Object.assign({ dx: 0, dy: 0, scale: 1 }, effective(cfg, info.group, info.key));
  const idx = battle ? num(battle.activeIdx) : 0;
  const pet = info.isEnemy ? simState.foe : activePet();

  const p = document.createElement('div');
  p.id = PANEL_ID;
  p.className = 'dbs-sheet';

  // Grouped, because there are now characters, sides, seven gauges and
  // nine panels, and a flat list of twenty-odd is unreadable. Gauges
  // the current scene does not render (the foe has no MP) are dropped
  // from the list rather than offered and then ignored.
  const optsFor = rows => rows
    .filter(([, , sel]) => !!document.querySelector(sel))
    .map(([key, label]) => `<option value="${key}" ${key === info.key ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');
  const charOpts = liveChars()
    .map(c => `<option value="${esc(c.sel)}" ${c.sel === info.key ? 'selected' : ''}>${esc(c.label)}</option>`)
    .join('');
  const options = `
    <optgroup label="Characters — one at a time">${charOpts}</optgroup>
    <optgroup label="Whole side — moves everyone on it">${optsFor(SIDE_TARGETS)}</optgroup>
    <optgroup label="Bars — one at a time">${optsFor(BAR_TARGETS)}</optgroup>
    <optgroup label="Panels">${optsFor(UI_TARGETS)}</optgroup>`;

  const scopeNote = info.isChar
    ? `<p class="dbs-note">Moving and resizing <b>${esc(info.key.replace(/^char:(pets|monsters):/, ''))}</b> only. Saved against the artwork, so it holds for this character in every fight, on every screen — not just this scene. Size grows from the feet, so a bigger sprite still stands on the ground.</p>`
    : info.group === 'sides'
      ? `<p class="dbs-note">This moves the <b>whole side</b> — every character standing on it travels together. To move one character on its own, pick it under “Characters”.</p>`
      : '';

  let spriteRows = '';
  if (info.isSprite && pet) {
    const pose = info.pose;
    const keys = info.isEnemy ? ENEMY_KEYS : PET_KEYS;
    const table = info.isEnemy ? ANTIVIRUZ : SPECIES;
    const curId = info.isEnemy ? (simState.foe.gif || simState.foe.speciesId) : pet.speciesId;
    const slots = info.isEnemy ? '' : `
      <label>Bench slot (who is on stage)
        <select id="dbs-slot">${simState.team.map((t, i) => `<option value="${i}" ${i === idx ? 'selected' : ''}>${i + 1} — ${esc(t.name || t.speciesId)}</option>`).join('')}</select>
      </label>`;
    const poseRows = pose ? `
      <label class="dbs-check"><input id="dbs-hover" type="checkbox" ${isFloating(pose) ? 'checked' : ''}> Hover / floating (applies game-wide)</label>
      <label class="dbs-check"><input id="dbs-faceleft" type="checkbox" ${drawnFacing(pose) === 'left' ? 'checked' : ''}> Art is drawn facing LEFT</label>
      <p class="dbs-note">Pose key: <b>${esc(pose.kind === 'pet' ? pose.id + ':' + pose.form : pose.id)}</b>. Tick “drawn facing LEFT” if this art already points left — the game flips whatever disagrees with the side it stands on.</p>`
      : `<p class="dbs-note">This unit renders as a procedural SVG, not an art file, so facing.js does not manage its pose — size, hover and flip all come from the renderer.</p>`;
    spriteRows = `
      ${slots}
      <label>Character
        <select id="dbs-species">${keys.map(id => `<option value="${id}" ${id === curId ? 'selected' : ''}>${esc(table[id]?.name || id)} — ${id}</option>`).join('')}</select>
      </label>
      <label>Level<input id="dbs-level" type="number" min="1" max="200" value="${pet.level}"></label>
      ${poseRows}`;
  }

  const barNote = info.group === 'bars'
    ? `<p class="dbs-note">Moving a gauge does not move the rest of its plate — the plate keeps its own layout, so nothing else shifts to fill the gap. Arrow keys are usually easier than dragging something this small.</p>`
    : '';

  p.innerHTML = `
    <div class="dbs-bar">
      <b>🎛️ Simulator</b>
      <button id="dbs-fold" type="button">–</button>
      <button id="dbs-copy" type="button">Copy JSON</button>
      <button id="dbs-close" type="button">Close</button>
    </div>
    <div class="dbs-body">
      <label>Editing<select id="dbs-target">${options}</select></label>
      ${scopeNote}
      <div class="dbs-grid">
        <label>Move X<input id="dbs-dx" type="number" step="1" value="${Math.round(num(v.dx))}"></label>
        <label>Move Y<input id="dbs-dy" type="number" step="1" value="${Math.round(num(v.dy))}"></label>
      </div>
      <label>Size <span class="dbs-val" id="dbs-scale-val">${round2(v.scale || 1)}×</span>
        <input id="dbs-scale" type="range" min="0.35" max="2.5" step="0.01" value="${num(v.scale, 1) || 1}">
      </label>
      ${barNote}
      ${spriteRows}
      <div class="dbs-grid">
        <button class="dbs-btn" id="dbs-reset-one" type="button">Reset this</button>
        <button class="dbs-btn danger" id="dbs-reset-all" type="button">Reset all</button>
      </div>
      <p class="dbs-note">Green tags are individual characters, pink are panels, small yellow ones are the HP / MP / SPD / CRT gauges. Drag them, or nudge with arrow keys (Shift for 10px). Bench chips swap who is on stage — that is also how you reach a benched pet's own size. Reset returns something to what ships with the game, not to zero. Everything here is the real fight UI, not a mock-up.</p>
    </div>`;
  document.body.appendChild(p);

  const g = id => document.getElementById(id);
  g('dbs-close').onclick = closeSim;
  g('dbs-copy').onclick = copyJson;
  g('dbs-fold').onclick = () => p.classList.toggle('folded');
  g('dbs-target').onchange = e => {
    simState.sel = e.target.value;
    installHandles();
    buildPanel();
  };

  const write = patch => {
    const c = load();
    writeVal(c, info.group, info.key, patch);
    store(c);
    applyAll();
    installHandles();
  };
  g('dbs-dx').onchange = e => write({ dx: Math.round(num(e.target.value)) });
  g('dbs-dy').onchange = e => write({ dy: Math.round(num(e.target.value)) });
  g('dbs-scale').oninput = e => {
    g('dbs-scale-val').textContent = round2(e.target.value) + '×';
    write({ scale: round2(e.target.value) });
  };
  g('dbs-reset-one').onclick = () => {
    const c = load();
    clearVal(c, info.group, info.key);
    store(c);
    applyAll(); installHandles(); buildPanel();
  };
  g('dbs-reset-all').onclick = () => {
    if (!confirm('Reset every battle layout and character edit back to what ships with the game?')) return;
    const c = load();
    c.ui = {}; c.sides = {}; c.bars = {};
    c.chars = { pets: {}, monsters: {} };
    store(c);
    applyAll(); installHandles(); buildPanel();
  };

  if (info.isSprite && pet) {
    const slot = g('dbs-slot');
    if (slot) slot.onchange = e => setActive(parseInt(e.target.value, 10) || 0);
    g('dbs-species').onchange = async e => {
      const c = load();
      if (info.isEnemy) c.actors.foe = Object.assign({}, c.actors.foe, { speciesId: e.target.value });
      else c.actors.team[idx] = Object.assign({}, c.actors.team[idx], { speciesId: e.target.value });
      store(c);
      await swapFighter(info.isEnemy, idx, e.target.value, pet.level);
    };
    g('dbs-level').onchange = async e => {
      const lv = Math.max(1, num(e.target.value, 30));
      const c = load();
      if (info.isEnemy) c.actors.foe = Object.assign({}, c.actors.foe, { level: lv });
      else c.actors.team[idx] = Object.assign({}, c.actors.team[idx], { level: lv });
      store(c);
      const id = info.isEnemy ? (simState.foe.gif || simState.foe.speciesId) : pet.speciesId;
      await swapFighter(info.isEnemy, idx, id, lv);
    };
    const hover = g('dbs-hover');
    if (hover) hover.onchange = async e => {
      setFloating(info.pose, e.target.checked);
      await paint(); installHandles(); buildPanel();
    };
    const face = g('dbs-faceleft');
    if (face) face.onchange = async e => {
      setDrawnFacing(info.pose, e.target.checked ? 'left' : 'right');
      await paint(); installHandles(); buildPanel();
    };
  }
}

async function swapFighter(isEnemy, idx, speciesId, level) {
  if (!simState || !battle) return;
  try {
    if (isEnemy) {
      simState.foe = makeFoe(ANTIVIRUZ[speciesId] ? speciesId : ENEMY_KEYS[0], level);
      battle.enemies = [simState.foe];
    } else {
      const fallback = PET_KEYS[idx % PET_KEYS.length];
      simState.team[idx] = makeAlly(SPECIES[speciesId] ? speciesId : fallback, level);
      battle.team = simState.team;
    }
  } catch (err) {
    console.warn('[battle-sim] swap failed:', err);
    toast('เปลี่ยนตัวละครไม่สำเร็จ');
    return;
  }
  await paint();
  buildPanel();
  installHandles();
}

// Exports the developer's own edits only. Anything already written
// into SHIPPED, or into facing.js's tables, is deliberately absent --
// it does not need pasting anywhere, it is already in the repository.
async function copyJson() {
  const text = JSON.stringify({ battleSimulator: load() }, null, 2);
  try { await navigator.clipboard.writeText(text); toast('Battle layout JSON copied'); }
  catch { prompt('Copy this JSON:', text); }
}

// ── SIM BUTTON ──
function ensureButton() {
  let btn = document.getElementById('dev-battle-sim-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'dev-battle-sim-btn';
    btn.type = 'button';
    btn.textContent = '🎛️ SIM';
    btn.onclick = openSim;
    document.body.appendChild(btn);
  }
  btn.style.display = localStorage.getItem(DEV_FLAG_KEY) === '1' ? 'block' : 'none';
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
#dev-battle-sim-btn{position:fixed;top:calc(env(safe-area-inset-top,0px) + 48px);right:8px;z-index:9999;padding:8px 10px;border-radius:999px;border:2px solid #fff;background:#6c5cff;color:#fff;font:12px var(--pixel,monospace);box-shadow:0 3px 12px rgba(0,0,0,.25)}
.dbs-handle{position:fixed;z-index:200001;transform:translate(-50%,-50%);pointer-events:auto;touch-action:none;border:2px solid #fff;background:rgba(255,64,182,.92);color:#fff;border-radius:999px;padding:3px 8px;font:11px var(--mono,monospace);white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.4)}
.dbs-handle.on{background:#ffd23f;color:#2a1400;border-color:#2a1400}
.dbs-handle.mini{padding:1px 6px;font-size:10px;border-width:1px;background:rgba(108,92,255,.95)}
.dbs-handle.char{background:rgba(38,190,120,.95)}
.dbs-handle.mini.on,.dbs-handle.char.on{background:#ffd23f;color:#2a1400}
body.dbs-editing #battle-stage{outline:1px dashed rgba(255,112,215,.5);outline-offset:-1px}
body.dbs-editing .bunit{outline:1px dashed rgba(38,190,120,.45)}
body.dbs-editing #plate-ally .np-hp,body.dbs-editing #plate-ally .np-mp,body.dbs-editing #plate-ally .gauge-bar,body.dbs-editing #plate-foe .np-hp,body.dbs-editing #plate-foe .gauge-bar{outline:1px dashed rgba(108,92,255,.6)}
body.dbs-editing .dbs-lit{outline:2px solid #ffd23f!important;outline-offset:2px}
body.dbs-editing .dev-battle-overlay{display:none!important}
.dev-moved-battle-ui{position:static!important;left:auto!important;top:auto!important;right:auto!important;bottom:auto!important}
.dbs-sheet{position:fixed;left:0;right:0;bottom:0;z-index:200002;background:#0f1324;color:#fff;border-top:2px solid #ff70d7;font-family:var(--mono,monospace);max-height:52vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px)}
.dbs-sheet.folded .dbs-body{display:none}
.dbs-bar{display:flex;gap:6px;align-items:center;padding:7px 8px;background:#161c34;border-bottom:1px solid #334}
.dbs-bar b{flex:1;font-size:12px}
.dbs-bar button{border:1px solid #778;background:#222b55;color:#fff;border-radius:7px;padding:5px 8px;font:11px var(--mono,monospace)}
.dbs-body{overflow:auto;padding:8px 10px 12px}
.dbs-body label{display:flex;flex-direction:column;gap:3px;margin:7px 0;font-size:11px;opacity:.95}
.dbs-body input,.dbs-body select{width:100%;padding:7px;background:#060916;color:#fff;border:1px solid #445;border-radius:7px;font:13px var(--mono,monospace)}
.dbs-body input[type=range]{padding:0}
.dbs-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dbs-check{flex-direction:row!important;align-items:center;gap:7px}
.dbs-check input{width:auto}
.dbs-val{float:right;opacity:.75}
.dbs-btn{border:1px solid #778;background:#222b55;color:#fff;border-radius:8px;padding:9px;font:12px var(--mono,monospace)}
.dbs-btn.danger{background:#4a1230;border-color:#ff70d7}
.dbs-note{font-size:10px;opacity:.6;line-height:1.45;margin:8px 0 0}
`;
  document.head.appendChild(st);
}

// ── BOOT ──
// The layout stylesheet is written once at boot and lives for the
// whole session, so saved positions are in force during real fights,
// not just inside the tool. It is refreshed on screen changes as well
// in case a saved edit was made in another tab.
function watchBattleScreen() {
  const run = () => setTimeout(applyBattleSimLayout, 40);
  const app = document.getElementById('app');
  if (app) new MutationObserver(run).observe(app, { attributes: true, attributeFilter: ['data-screen'] });
  const win = document.getElementById('win-main');
  if (win) new MutationObserver(run).observe(win, { attributes: true, attributeFilter: ['data-pane'] });
  run();
}

function boot() {
  injectStyles();
  dropRedundantEdits();   // before applySavedPose, which would mask it
  applySavedPose();
  // Only needs to run once at boot: from here on facing.js re-applies
  // the tables to every unit it sees inserted, in real fights as well
  // as in the tool.
  applyCharTweaks();
  dropLegacyBattleLayout();
  applyBattleSimLayout();
  ensureButton();
  setInterval(ensureButton, 800);
  watchBattleScreen();
  window.VIRUZ_OPEN_BATTLE_SIM = openSim;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
