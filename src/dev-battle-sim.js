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
// HOVER AND FACING ARE NOT PREVIEWS. They are written straight into
// the live tables exported by facing.js, which is the only authority
// the renderer consults -- applyPose() re-derives flip and float from
// those tables on every DOM change and overrides whatever combat.js
// decided. The keys are read back out of the sprite that is actually
// on screen, using facing.js's own spriteInfo(), because facing.js
// resolves everything from the ART PATH rather than from the pet
// object; deriving the key any other way would tick a box that the
// renderer then never looks up. Saved poses are replayed at boot, so
// an edit survives a reload and shows up in real fights too.
//
// combat.js is pulled in with a dynamic import rather than a static
// one. This module is loaded early and combat.js sits in a dense
// import cycle (combat -> turn-loop -> combat, combat -> ui-shell);
// deferring it to the moment the tool is opened keeps this file out of
// that graph entirely.

import { ANTIVIRUZ, SPECIES, SPECIES_KEYS } from './data.js';
import { createPet, spawnAntiviruz, statsOf } from './engine.js';
import { FLOAT_FORMS, FLOAT_MONSTERS, FLOAT_PETS, MONSTER_FACING, PET_FACING, spriteInfo } from './facing.js';
import { $, battle, setBattle } from './state.js';
import { showScreen, toast } from './ui-shell.js';

const DEV_FLAG_KEY = 'viruz.devMode.enabled';
const SIM_KEY = 'viruz.devMode.battleSim.v3';
const OLD_SIM_KEY = 'viruz.devMode.battleSim.v2';
const PATCH_KEY = 'viruz.devMode.patchExport.v3';
const STYLE_ID = 'dev-battle-sim-style';
const PANEL_ID = 'dbs-panel';
const TEAM_SIZE = 3;

// Every editable box in the real battle screen, as [key, label,
// selector]. These are the actual game elements -- not stand-ins.
const UI_TARGETS = [
  ['plateAlly', 'My plate (HP / MP / name)', '#plate-ally'],
  ['plateFoe',  'Enemy plate (HP / SPD / CRT)', '#plate-foe'],
  ['top',       'Title / wave text', '#battle-top'],
  ['skills',    'Skill cards', '#skill-bar'],
  ['potions',   'Bag / poison buttons', '#potion-bar'],
  ['bench',     'Bench row', '#battle-bench'],
  ['log',       'Battle log', '#battle-log'],
  ['hit',       'HIT button', '#hit-btn-row'],
  ['ctrl',      'Flee / speed row', '#battle-ctrl'],
];
const SIDE_TARGETS = [
  ['ally', 'My pet (sprite)', '#battle-allies'],
  ['foe',  'Enemy (sprite)',  '#battle-enemies'],
];

const PET_KEYS = (SPECIES_KEYS && SPECIES_KEYS.length ? SPECIES_KEYS : Object.keys(SPECIES));
const ENEMY_KEYS = Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_'));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = x => JSON.parse(JSON.stringify(x));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round2 = n => Math.round(num(n) * 100) / 100;

// ── SAVED LAYOUT ──
// Everything defaults to empty. A fresh install therefore changes
// nothing about the live game until the developer actually moves
// something -- no baked-in "default" positions to fight the real CSS.
function blank() {
  return {
    ui: {},
    sides: {},
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

// ── APPLYING THE LAYOUT TO THE REAL SCREEN ──
// Uses transform rather than position:absolute + left/top. An absolute
// position rips the element out of normal flow, which is what made the
// older battle-UI editor collapse the rows around whatever it moved.
// A transform leaves layout completely intact and still moves + scales.
function applyOne(sel, v) {
  const t = document.querySelector(sel);
  if (!t) return;
  if (!v || (!v.dx && !v.dy && (v.scale == null || v.scale === 1))) {
    t.style.transform = '';
    t.style.transformOrigin = '';
    return;
  }
  const s = num(v.scale, 1) || 1;
  t.style.transform = `translate(${num(v.dx)}px, ${num(v.dy)}px) scale(${s})`;
  t.style.transformOrigin = v.origin || 'center bottom';
}
export function applyBattleSimLayout() {
  const cfg = load();
  UI_TARGETS.forEach(([key, , sel]) => applyOne(sel, cfg.ui[key]));
  SIDE_TARGETS.forEach(([key, , sel]) => applyOne(sel, cfg.sides[key]));
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

// ── HOVER + FACING ──
// facing.js keys everything off the sprite's own src path, so the key
// is read from the sprite currently rendered on that side rather than
// guessed from the pet object (a pet's mutation form and its art
// folder are not the same field).
function liveInfo(isEnemy) {
  const img = document.querySelector(`#battle-${isEnemy ? 'enemies' : 'allies'} .bunit img.bu-sprite`);
  return img ? spriteInfo(img.getAttribute('src')) : null;
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
  // Let facing.js's observer settle, then re-assert the saved layout --
  // renderBattle() rebuilds the units but not their containers, so the
  // transforms survive; this is belt and braces for the UI boxes.
  setTimeout(() => { applyBattleSimLayout(); wireBench(); }, 30);
}

// Real bench chips, made selectable. renderBench() paints one per
// battle.team entry and rings whichever matches battle.activeIdx, so
// pointing activeIdx at another pet is all it takes to swap who is on
// stage -- same mechanism the live swap menu uses.
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
  document.body.classList.remove('dbs-editing');
  if (!st) return;
  setBattle(st.prevBattle || null);
  showScreen(st.prevScreen === 'battle' ? 'map' : st.prevScreen);
}

// ── DRAG HANDLES OVER THE REAL ELEMENTS ──
let drag = null;

function targetsAll() { return [...SIDE_TARGETS.map(r => ['sides', ...r]), ...UI_TARGETS.map(r => ['ui', ...r])]; }

function installHandles() {
  document.querySelectorAll('.dbs-handle').forEach(h => h.remove());
  if (!simState) return;
  document.body.classList.add('dbs-editing');
  targetsAll().forEach(([group, key, label, sel]) => {
    const t = document.querySelector(sel);
    if (!t) return;
    const r = t.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const h = document.createElement('button');
    h.type = 'button';
    h.className = 'dbs-handle' + (simState.sel === key ? ' on' : '');
    h.dataset.key = key;
    h.textContent = '✥ ' + label;
    h.style.left = (r.left + r.width / 2) + 'px';
    h.style.top = (r.top + r.height / 2) + 'px';
    h.onpointerdown = e => beginDrag(e, group, key, h);
    document.body.appendChild(h);
  });
}
function beginDrag(e, group, key, handle) {
  e.preventDefault(); e.stopPropagation();
  const cfg = load();
  const cur = (cfg[group][key] ||= {});
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
  const v = (cfg[drag.group][drag.key] ||= {});
  v.dx = Math.round(drag.dx0 + (e.clientX - drag.x0));
  v.dy = Math.round(drag.dy0 + (e.clientY - drag.y0));
  store(cfg);
  applyBattleSimLayout();
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
// is fine for roughing a position in, useless for the last few pixels.
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
  const v = (cfg[info.group][info.key] ||= {});
  v.dx = num(v.dx) + step[0] * mult;
  v.dy = num(v.dy) + step[1] * mult;
  store(cfg);
  applyBattleSimLayout();
  installHandles();
  buildPanel();
}

// ── EDITOR PANEL ──
function selInfo() {
  const key = simState?.sel || 'ally';
  const side = SIDE_TARGETS.find(r => r[0] === key);
  if (side) return { group: 'sides', key, label: side[1], isSprite: true, isEnemy: key === 'foe' };
  const ui = UI_TARGETS.find(r => r[0] === key);
  return { group: 'ui', key, label: ui ? ui[1] : key, isSprite: false, isEnemy: false };
}

function buildPanel() {
  if (!simState) return;
  document.getElementById(PANEL_ID)?.remove();
  const cfg = load();
  const info = selInfo();
  const v = Object.assign({ dx: 0, dy: 0, scale: 1 }, cfg[info.group][info.key]);
  const idx = battle ? num(battle.activeIdx) : 0;
  const pet = info.isEnemy ? simState.foe : activePet();

  const p = document.createElement('div');
  p.id = PANEL_ID;
  p.className = 'dbs-sheet';

  const options = targetsAll()
    .map(([, key, label]) => `<option value="${key}" ${key === info.key ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');

  let spriteRows = '';
  if (info.isSprite && pet) {
    const pose = liveInfo(info.isEnemy);
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
      : `<p class="dbs-note">This unit renders as a procedural SVG, not an art file, so facing.js does not manage its pose — hover and flip come from the renderer.</p>`;
    spriteRows = `
      ${slots}
      <label>Character
        <select id="dbs-species">${keys.map(id => `<option value="${id}" ${id === curId ? 'selected' : ''}>${esc(table[id]?.name || id)} — ${id}</option>`).join('')}</select>
      </label>
      <label>Level<input id="dbs-level" type="number" min="1" max="200" value="${pet.level}"></label>
      ${poseRows}`;
  }

  p.innerHTML = `
    <div class="dbs-bar">
      <b>🎛️ Simulator</b>
      <button id="dbs-fold" type="button">–</button>
      <button id="dbs-copy" type="button">Copy JSON</button>
      <button id="dbs-close" type="button">Close</button>
    </div>
    <div class="dbs-body">
      <label>Editing<select id="dbs-target">${options}</select></label>
      <div class="dbs-grid">
        <label>Move X<input id="dbs-dx" type="number" step="1" value="${Math.round(num(v.dx))}"></label>
        <label>Move Y<input id="dbs-dy" type="number" step="1" value="${Math.round(num(v.dy))}"></label>
      </div>
      <label>Size <span class="dbs-val" id="dbs-scale-val">${round2(v.scale || 1)}×</span>
        <input id="dbs-scale" type="range" min="0.35" max="2.5" step="0.01" value="${num(v.scale, 1) || 1}">
      </label>
      ${spriteRows}
      <div class="dbs-grid">
        <button class="dbs-btn" id="dbs-reset-one" type="button">Reset this</button>
        <button class="dbs-btn danger" id="dbs-reset-all" type="button">Reset all</button>
      </div>
      <p class="dbs-note">Drag the pink labels on the scene, arrow keys nudge 1px (Shift 10px), and the bench chips swap who is on stage. Everything you see is the real fight UI — not a mock-up.</p>
    </div>`;
  document.body.appendChild(p);

  const g = id => document.getElementById(id);
  g('dbs-close').onclick = closeSim;
  g('dbs-copy').onclick = copyJson;
  g('dbs-fold').onclick = () => p.classList.toggle('folded');
  g('dbs-target').onchange = e => {
    simState.sel = e.target.value;
    document.querySelectorAll('.dbs-handle').forEach(h => h.classList.toggle('on', h.dataset.key === simState.sel));
    buildPanel();
  };

  const write = patch => {
    const c = load();
    c[info.group][info.key] = Object.assign({}, c[info.group][info.key], patch);
    store(c);
    applyBattleSimLayout();
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
    delete c[info.group][info.key];
    store(c);
    applyBattleSimLayout(); installHandles(); buildPanel();
  };
  g('dbs-reset-all').onclick = () => {
    if (!confirm('Reset every battle layout edit?')) return;
    const c = load();
    c.ui = {}; c.sides = {};
    store(c);
    UI_TARGETS.concat(SIDE_TARGETS).forEach(([, , sel]) => applyOne(sel, null));
    installHandles(); buildPanel();
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
      setFloating(liveInfo(info.isEnemy), e.target.checked);
      await paint(); installHandles(); buildPanel();
    };
    const face = g('dbs-faceleft');
    if (face) face.onchange = async e => {
      setDrawnFacing(liveInfo(info.isEnemy), e.target.checked ? 'left' : 'right');
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
body.dbs-editing #battle-stage{outline:1px dashed rgba(255,112,215,.5);outline-offset:-1px}
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
// The saved layout is re-applied every time the battle screen appears,
// so edits are live in real fights and not just inside the tool.
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
  applySavedPose();
  dropLegacyBattleLayout();
  ensureButton();
  setInterval(ensureButton, 800);
  watchBattleScreen();
  window.VIRUZ_OPEN_BATTLE_SIM = openSim;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
