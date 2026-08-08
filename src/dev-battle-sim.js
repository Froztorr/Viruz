// VIRUZ PET — Battle Scene Simulator (dev tool)
//
// This REPLACES the old mock-up simulator. The old one hand-rebuilt an
// approximation of the fight UI out of dashed placeholder boxes, which
// meant it drifted from the real scene the moment either side changed:
// it showed a second on-stage ally and numbered "Bench 1/2/3" chips
// that do not exist in a real fight, plain coloured bars instead of the
// pixel heart/orb and the Rockman SPD/CRT gauges, pill buttons instead
// of skill cards -- and because its sprites never passed through
// facing.js, enemies faced away from the player.
//
// This version does not imitate anything. It builds a real battle
// object with setBattle(), paints it with the real renderBattle(), and
// then hangs an editing layer on top. Every plate, gauge, skill card,
// bench chip and sprite in here is the same DOM a live fight renders,
// so the preview cannot go out of sync with the game.
//
// It deliberately does NOT call scheduleTurn(), startRegen() or
// startSkillCooldownTicker(). Nothing takes a turn, so the scene is
// live but frozen -- which is exactly what makes it editable.
//
// combat.js is pulled in with a dynamic import rather than a static
// one. This module is loaded very early and combat.js sits in a dense
// import cycle (combat -> turn-loop -> combat, combat -> ui-shell);
// deferring it to the moment the tool is opened keeps this file out of
// that graph entirely.

import { ANTIVIRUZ, ATTR, SPECIES, SPECIES_KEYS } from './data.js';
import { createPet, spawnAntiviruz, statsOf } from './engine.js';
import { FLOAT_FORMS, FLOAT_MONSTERS, FLOAT_PETS, MONSTER_FACING, PET_FACING } from './facing.js';
import { $, battle, setBattle } from './state.js';
import { showScreen, toast } from './ui-shell.js';

const DEV_FLAG_KEY = 'viruz.devMode.enabled';
const SIM_KEY = 'viruz.devMode.battleSim.v2';
const PATCH_KEY = 'viruz.devMode.patchExport.v3';
const STYLE_ID = 'dev-battle-sim-style';
const PANEL_ID = 'dbs-panel';

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

const ENEMY_KEYS = Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_'));
const PET_KEYS = (SPECIES_KEYS && SPECIES_KEYS.length ? SPECIES_KEYS : Object.keys(SPECIES));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clone = x => JSON.parse(JSON.stringify(x));
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round2 = n => Math.round(num(n) * 100) / 100;

// ── SAVED LAYOUT ──
// Everything defaults to empty. A fresh install therefore changes
// nothing about the live game until the developer actually moves
// something -- no baked-in "default" positions to fight the real CSS.
function blank() {
  return { ui: {}, sides: {}, facing: {}, float: {}, actors: {} };
}
function load() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(SIM_KEY) || '{}')); }
  catch { return blank(); }
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

// ── HOVER + FACING ──
// These write into the live objects exported by facing.js. That module
// is the ONLY authority the renderer consults: applyPose() re-derives
// flip and float from these tables on every DOM change and overrides
// whatever combat.js decided. Mutating them here is therefore a
// game-wide change, not a preview-only one -- which is the whole point
// of the hover checkbox.
function petKey(pet) { return `${pet.speciesId}:${pet.form || 'stage1'}`; }
function artId(pet) { return pet.gif || pet.speciesId; }

function isFloating(pet, isEnemy) {
  if (isEnemy) return FLOAT_MONSTERS.has(artId(pet));
  return FLOAT_FORMS.has(pet.form) || FLOAT_PETS.has(pet.speciesId);
}
function setFloating(pet, isEnemy, on) {
  const cfg = load();
  if (isEnemy) {
    const id = artId(pet);
    on ? FLOAT_MONSTERS.add(id) : FLOAT_MONSTERS.delete(id);
    cfg.float[id] = !!on;
  } else if (FLOAT_FORMS.has(pet.form) && !on) {
    // A whole form floats (e.g. every phantom). Turning it off here
    // turns it off for that form across the game -- say so plainly
    // rather than silently doing nothing.
    FLOAT_FORMS.delete(pet.form);
    cfg.float[`form:${pet.form}`] = false;
    toast(`ปิด float ของร่าง ${pet.form} ทั้งหมด`);
  } else {
    on ? FLOAT_PETS.add(pet.speciesId) : FLOAT_PETS.delete(pet.speciesId);
    cfg.float[pet.speciesId] = !!on;
  }
  store(cfg);
}
function drawnFacing(pet, isEnemy) {
  if (isEnemy) return MONSTER_FACING[artId(pet)] || 'right';
  return PET_FACING[petKey(pet)] || 'right';
}
function setDrawnFacing(pet, isEnemy, dir) {
  const cfg = load();
  if (isEnemy) { MONSTER_FACING[artId(pet)] = dir; cfg.facing[artId(pet)] = dir; }
  else { PET_FACING[petKey(pet)] = dir; cfg.facing[petKey(pet)] = dir; }
  store(cfg);
}

// ── THE FROZEN SANDBOX FIGHT ──
let simState = null;   // { prevScreen, prevBattle, ally, foe }

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
  setTimeout(applyBattleSimLayout, 30);
}

async function openSim() {
  if (battle && !battle.__sim) { toast('ออกจากการต่อสู้ก่อนจึงเปิด SIM ได้'); return; }
  if (simState) return;
  injectStyles();

  const cfg = load();
  const a = Object.assign({ speciesId: PET_KEYS[0], level: 30 }, cfg.actors.ally);
  const f = Object.assign({ speciesId: ENEMY_KEYS[0], level: 30 }, cfg.actors.foe);
  let ally, foe;
  try {
    ally = makeAlly(SPECIES[a.speciesId] ? a.speciesId : PET_KEYS[0], a.level);
    foe = makeFoe(ANTIVIRUZ[f.speciesId] ? f.speciesId : ENEMY_KEYS[0], f.level);
  } catch (err) {
    console.error('[battle-sim] could not build sandbox fighters:', err);
    toast('สร้างฉากทดสอบไม่สำเร็จ');
    return;
  }

  simState = {
    prevScreen: $('app')?.dataset.screen || 'map',
    prevBattle: battle || null,
    ally, foe,
    sel: 'ally',
  };

  // Same shape every real encounter builds (see startZone/startArena in
  // battle/encounters.js) plus a __sim marker so nothing else mistakes
  // this for a genuine fight.
  setBattle({
    __sim: true,
    mode: 'arena',
    team: [ally], enemies: [foe],
    wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  });
  showScreen('battle');
  const title = $('battle-title'); if (title) title.textContent = '🎛️ Battle Simulator';
  const wave = $('battle-wave'); if (wave) wave.textContent = 'โหมดแก้ไข — หยุดทุกเทิร์น';
  await paint();
  buildPanel();
  installHandles();
}

function closeSim() {
  const st = simState;
  simState = null;
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
  const stage = $('screen-battle');
  if (!stage) return;
  document.body.classList.add('dbs-editing');
  targetsAll().forEach(([group, key, label, sel]) => {
    const t = document.querySelector(sel);
    if (!t) return;
    const r = t.getBoundingClientRect();
    if (!r.width && !r.height) return;
    const h = document.createElement('button');
    h.type = 'button';
    h.className = 'dbs-handle' + (simState && simState.sel === key ? ' on' : '');
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
  const pet = info.isEnemy ? simState.foe : simState.ally;

  const p = document.createElement('div');
  p.id = PANEL_ID;
  p.className = 'dbs-sheet';

  const options = targetsAll()
    .map(([, key, label]) => `<option value="${key}" ${key === info.key ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');

  let spriteRows = '';
  if (info.isSprite) {
    const keys = info.isEnemy ? ENEMY_KEYS : PET_KEYS;
    const table = info.isEnemy ? ANTIVIRUZ : SPECIES;
    const curId = info.isEnemy ? simState.foe.gif || simState.foe.speciesId : simState.ally.speciesId;
    spriteRows = `
      <label>Character
        <select id="dbs-species">${keys.map(id => `<option value="${id}" ${id === curId ? 'selected' : ''}>${esc(table[id]?.name || id)} — ${id}</option>`).join('')}</select>
      </label>
      <label>Level<input id="dbs-level" type="number" min="1" max="200" value="${pet.level}"></label>
      <label class="dbs-check"><input id="dbs-hover" type="checkbox" ${isFloating(pet, info.isEnemy) ? 'checked' : ''}> Hover / floating (applies game-wide)</label>
      <label class="dbs-check"><input id="dbs-faceleft" type="checkbox" ${drawnFacing(pet, info.isEnemy) === 'left' ? 'checked' : ''}> Art is drawn facing LEFT</label>
      <p class="dbs-note">Tick “drawn facing LEFT” if this art already points left. The game flips whatever disagrees with the side it stands on.</p>`;
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
      <p class="dbs-note">Drag the pink labels on the scene, or nudge with the numbers. Everything you see is the real fight UI — not a mock-up.</p>
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
    localStorage.removeItem(SIM_KEY);
    UI_TARGETS.concat(SIDE_TARGETS).forEach(([, , sel]) => applyOne(sel, null));
    installHandles(); buildPanel();
  };

  if (info.isSprite) {
    g('dbs-species').onchange = async e => {
      const c = load();
      c.actors[info.key] = Object.assign({}, c.actors[info.key], { speciesId: e.target.value });
      store(c);
      await swapFighter(info.isEnemy, e.target.value, pet.level);
    };
    g('dbs-level').onchange = async e => {
      const lv = Math.max(1, num(e.target.value, 30));
      const c = load();
      c.actors[info.key] = Object.assign({}, c.actors[info.key], { level: lv });
      store(c);
      const id = info.isEnemy ? (simState.foe.gif || simState.foe.speciesId) : simState.ally.speciesId;
      await swapFighter(info.isEnemy, id, lv);
    };
    g('dbs-hover').onchange = async e => {
      setFloating(pet, info.isEnemy, e.target.checked);
      await paint(); installHandles();
    };
    g('dbs-faceleft').onchange = async e => {
      setDrawnFacing(pet, info.isEnemy, e.target.checked ? 'left' : 'right');
      await paint(); installHandles();
    };
  }
}

async function swapFighter(isEnemy, speciesId, level) {
  if (!simState || !battle) return;
  try {
    if (isEnemy) {
      simState.foe = makeFoe(ANTIVIRUZ[speciesId] ? speciesId : ENEMY_KEYS[0], level);
      battle.enemies = [simState.foe];
    } else {
      simState.ally = makeAlly(SPECIES[speciesId] ? speciesId : PET_KEYS[0], level);
      battle.team = [simState.ally];
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
  ensureButton();
  setInterval(ensureButton, 800);
  watchBattleScreen();
  window.VIRUZ_OPEN_BATTLE_SIM = openSim;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
