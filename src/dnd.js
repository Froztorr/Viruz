// ═══════════════════════════════════════════════════════════
// VIRUZ — TABLETOP REALM (fantasy board-game map)
//
// The role reversal of this realm: the player's VIRUZ are the monsters,
// and the enemies are classic adventuring-party classes -- warrior,
// rogue, priest, wizard, sorcerer, ranger, paladin, bard, and the
// Dungeon Master as the final boss.
//
// Structure copied deliberately from galaxy.js + galaxy-monsters.js,
// which are the two working precedents in this codebase:
//
// 1. MAPS/ZONES are pushed, never edited in place, and never from
//    data.js -- that file is ~105KB and stays untouched.
// 2. Enemies are CLONED from an existing monster rather than declared
//    from scratch. spawnAntiviruz() reads a dozen fields off a monster
//    record (base, shape, palette, faces, scale, noFloat, specials,
//    habitColor, habitType...); cloning inherits all of them so none can
//    be missed. ANTIVIRUZ is an OBJECT KEYED BY ID, not an array --
//    getting that wrong once already registered zero monsters and left
//    the Galaxy zone pools pointing at ids that did not resolve.
// 3. retuneZones() runs ONLY if every id it references registered
//    successfully. A pool can never point at a missing monster, because
//    an unknown id makes spawnAntiviruz() return null and those nulls go
//    straight into the wave list.
//
// TEMPLATE CHOICE: vampire_lord, the strongest monster native to
// data.js. Deliberately not one of the celestials from
// galaxy-monsters.js -- those are themselves clones registered at
// runtime, so depending on them would make this file's correctness
// depend on another module's load order succeeding first.
//
// FACING: every hero is drawn facing LEFT (it is baked into the art
// prompts), which is the direction an enemy needs to face on the battle
// stage. `faces: 'left'` is set explicitly here so src/facing.js needs no
// new table entry. If one ever renders backwards, adding its id to
// MONSTER_FACING in facing.js overrides this.
//
// FLOAT: heroes all stand on the ground. facing.js is planted-unless-
// listed-airborne, so no entry is needed for that either.
//
// ART PENDING: the map video, battle backdrop and nine sprite GIFs are
// being generated. Until they are uploaded the map falls back to the
// Hell video (same fallback galaxy.js shipped with), and the enemies
// will show missing art. Expected paths:
//   assets/maps/board.mp4 + board.jpg
//   assets/battle/board.mp4        (picked up automatically by battle-bg.js)
//   assets/sprites/<id>/still.gif  (one folder per hero id below)
// ═══════════════════════════════════════════════════════════

import * as DATA from './data.js';
import { MAPS, ZONES } from './data.js';
import { G, save } from './state.js';

const MAP_ID = 'board';
const HUB_ID = 'galaxy';           // the realm this map is entered from
const GATE_ID = 'board_gate';
const TEMPLATE_ID = 'vampire_lord';

// ── MAP ──
const boardMap = {
  id: MAP_ID, parentMapId: HUB_ID, parentGateId: GATE_ID,
  name: 'Tabletop Realm', thai: 'อาณาจักรกระดาน',
  video: 'assets/maps/board.mp4', poster: 'assets/maps/board.jpg',
  fallbackVideo: 'assets/maps/hell.mp4', fallbackPoster: 'assets/maps/hell.jpg',
  levelRange: [166, 190],
  desc: 'กระดานผจญภัยบนโต๊ะไม้ — ที่นี่คุณคือฝ่ายมอนสเตอร์',
  warpIn: { x: 50, y: 88 }, warpOut: null,
};

// ── GATE on the hub map ──
const boardGate = {
  id: GATE_ID, map: HUB_ID, kind: 'safe', order: 0,
  targetMapId: MAP_ID, icon: '🎲',
  name: 'Tabletop Realm', thai: 'อาณาจักรกระดาน',
  x: 52, y: 18, desc: 'เข้าสู่แผนที่ย่อย',
};

// ── ZONES ──
// Pools are seeded with EXISTING monsters and only swapped to the hero
// roster by retuneZones() once registration is confirmed.
const battle = (id, order, name, thai, x, y, lv, waves, pool, bitzMult, expMult, desc) => ({
  id, map: MAP_ID, kind: 'battle', order, name, thai, x, y, lv, waves, pool,
  reward: { bitzMult, expMult }, desc,
});

const boardZones = [
  { id: 'bd_tavern', map: MAP_ID, kind: 'safe', order: 0,
    name: "Adventurers' Rest", thai: 'โรงเตี๊ยมนักผจญภัย', x: 30, y: 26,
    desc: 'โต๊ะมุมโรงเตี๊ยมสำหรับพักฟื้นและซื้อยา' },
  battle('bd_gate', 1, 'Starting Square', 'ช่องเริ่มต้น', 68, 30, [166, 171], [3, 4],
    ['vampire_lord', 'black_beast'], 12.5, 11.8, 'ช่องแรกของกระดาน — หน่วยลาดตระเวนของปาร์ตี้'),
  battle('bd_chapel', 2, 'Candlelit Chapel', 'โบสถ์แสงเทียน', 34, 48, [172, 177], [4, 4],
    ['vampire_lady', 'vampire_lord'], 13.2, 12.4, 'แท่นบูชาที่สวดภาวนาขับไล่ไวรัส'),
  battle('bd_tower', 3, 'Arcane Tower', 'หอคอยเวทมนตร์', 70, 60, [178, 183], [4, 5],
    ['fire_golem', 'rock_golem'], 14, 13.1, 'หอคอยที่คลื่นเวทมนตร์แปรปรวนตลอดเวลา'),
  battle('bd_hall', 4, "Dungeon Master's Hall", 'ห้องโถงเจ้าแห่งดันเจี้ยน', 38, 74, [184, 190], [5, 5],
    ['vampire_lord', 'fire_golem', 'black_beast'], 15, 14, 'โต๊ะสุดท้าย ที่ลูกเต๋าตัดสินทุกอย่าง'),
];

// ── HERO ENEMIES ──
// `power` scales the template's base stat line, ramping across Lv 166-190
// and spiking on the boss. Continues the Galaxy ramp, which ended at 2.00.
const HEROES = [
  { id: 'hero_warrior',        name: 'Warrior',        thai: 'นักรบ',              power: 2.05 },
  { id: 'hero_rogue',          name: 'Rogue',          thai: 'โจรเงา',             power: 2.12 },
  { id: 'hero_priest',         name: 'Priest',         thai: 'นักบวช',             power: 2.20 },
  { id: 'hero_paladin',        name: 'Paladin',        thai: 'อัศวินศักดิ์สิทธิ์',   power: 2.32 },
  { id: 'hero_wizard',         name: 'Wizard',         thai: 'จอมเวท',             power: 2.40 },
  { id: 'hero_sorcerer',       name: 'Sorcerer',       thai: 'ผู้วิเศษ',            power: 2.48 },
  { id: 'hero_ranger',         name: 'Ranger',         thai: 'พรานธนู',            power: 2.55 },
  { id: 'hero_bard',           name: 'Bard',           thai: 'กวีนักดนตรี',         power: 2.62 },
  { id: 'hero_dungeon_master', name: 'Dungeon Master', thai: 'เจ้าแห่งดันเจี้ยน',   power: 3.00 },
];

const ZONE_POOLS = {
  bd_gate:   ['hero_warrior', 'hero_rogue'],
  bd_chapel: ['hero_priest', 'hero_paladin'],
  bd_tower:  ['hero_wizard', 'hero_sorcerer'],
  bd_hall:   ['hero_dungeon_master', 'hero_ranger', 'hero_bard'],
};

function scaleNumbers(source, mult) {
  if (!source || typeof source !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = typeof value === 'number' ? Math.max(1, Math.round(value * mult)) : value;
  }
  return out;
}

function registerHeroes() {
  const roster = DATA.ANTIVIRUZ;
  if (!roster || typeof roster !== 'object' || Array.isArray(roster)) {
    console.warn('[dnd] ANTIVIRUZ map not found; roster unchanged');
    return new Set();
  }
  const template = roster[TEMPLATE_ID];
  if (!template) {
    console.warn(`[dnd] template "${TEMPLATE_ID}" missing; roster unchanged`);
    return new Set();
  }

  const attrKeys = Array.isArray(DATA.ATTR_KEYS) && DATA.ATTR_KEYS.length ? DATA.ATTR_KEYS : null;
  const ready = new Set();

  HEROES.forEach((def, i) => {
    if (roster[def.id]) { ready.add(def.id); return; }   // never clobber

    const entry = { ...template, id: def.id, name: def.name };
    // sprites.js resolves a monster folder as
    // MONSTER_GIF_FOLDERS[speciesId] || species.gif, so pointing `gif` at
    // the id yields assets/sprites/<id>/still.gif.
    entry.gif = def.id;
    entry.ext = 'gif';
    entry.faces = 'left';                                 // art is drawn facing left
    if ('thai' in template) entry.thai = def.thai;
    if (attrKeys) entry.attr = attrKeys[i % attrKeys.length];
    const scaled = scaleNumbers(template.base, def.power);
    if (scaled) entry.base = scaled;

    roster[def.id] = entry;
    ready.add(def.id);
  });

  return ready;
}

function retuneZones(ready) {
  const zones = DATA.ZONES;
  if (!Array.isArray(zones)) return 0;
  let retuned = 0;
  for (const [zoneId, pool] of Object.entries(ZONE_POOLS)) {
    if (!pool.every(id => ready.has(id))) {
      console.warn(`[dnd] skipping ${zoneId}; unresolved enemies`);
      continue;
    }
    const zone = zones.find(z => z && z.id === zoneId);
    if (!zone || !Array.isArray(zone.pool)) continue;
    zone.pool = [...pool];
    retuned += 1;
  }
  return retuned;
}

// ── REGISTER ──
if (!MAPS.some(m => m.id === MAP_ID)) MAPS.push(boardMap);
for (const zone of [boardGate, ...boardZones]) {
  if (!ZONES.some(z => z.id === zone.id)) ZONES.push(zone);
}
try {
  const ready = registerHeroes();
  if (ready.size) retuneZones(ready);
} catch (err) {
  console.warn('[dnd] registration skipped:', err);
}

// ── GATE BEHAVIOUR ──
// Mirrors galaxy.js: the gate is an ordinary zone pin so the existing
// player-position marker can track it, then its appearance and click
// action are upgraded here. Two-tap confirm, matching the world map's own
// pin behaviour.
let armedKey = null;
let armedTimer = null;

function clearArmed() {
  clearTimeout(armedTimer);
  armedTimer = null;
  armedKey = null;
  document.querySelectorAll('.zone-pin.dnd-armed').forEach(pin => pin.classList.remove('armed', 'dnd-armed'));
}

function armOrConfirm(pin, key, action) {
  if (armedKey === key) { clearArmed(); action(); return; }
  clearArmed();
  armedKey = key;
  pin.classList.add('armed', 'dnd-armed');
  armedTimer = setTimeout(clearArmed, 5000);
}

async function redrawWorld() {
  const { renderWorld } = await import('./screens/world.js');
  renderWorld();
}

function enterBoard() {
  G.currentMapId = MAP_ID;
  G.worldPos = { mapId: MAP_ID, nodeId: 'warpIn' };
  save();
  redrawWorld();
}

function returnToHub() {
  G.currentMapId = HUB_ID;
  G.worldPos = { mapId: HUB_ID, nodeId: GATE_ID };
  save();
  redrawWorld();
}

// `pin.dataset.dndGate` doubles as the re-entry guard that stops the
// MutationObserver below from re-triggering on its own writes.
function decorateGate() {
  if (G.currentMapId !== HUB_ID) return;
  document.querySelectorAll('#world-pins .zone-pin').forEach(pin => {
    if (pin.dataset.dndGate) return;
    const title = pin.querySelector('.pin-card b')?.textContent?.trim();
    if (title !== boardGate.name) return;
    pin.dataset.dndGate = GATE_ID;
    pin.classList.remove('safe');
    pin.classList.add('warp-out', 'dnd-gate');
    const extra = pin.querySelector('.pin-extra');
    if (extra) {
      extra.innerHTML = `<i>${boardGate.icon} ${boardGate.thai}</i><em>แผนที่ย่อย · Lv ${boardMap.levelRange[0]}–${boardMap.levelRange[1]}</em>`;
    }
  });
}

const pinLayer = document.getElementById('world-pins');
if (pinLayer) {
  new MutationObserver(decorateGate).observe(pinLayer, { childList: true, subtree: true });
  queueMicrotask(decorateGate);
}

// Capture phase, same as galaxy.js. That module's handler runs first and
// falls through harmlessly for this pin, since it only acts on pins
// carrying its own dataset.galaxyGate marker.
document.addEventListener('click', event => {
  const pin = event.target.closest?.('.zone-pin');
  if (!pin) return;
  if (G.currentMapId === HUB_ID && pin.dataset.dndGate) {
    event.preventDefault();
    event.stopImmediatePropagation();
    armOrConfirm(pin, GATE_ID, enterBoard);
    return;
  }
  if (G.currentMapId === MAP_ID && pin.classList.contains('warp-in')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    armOrConfirm(pin, `${MAP_ID}:return`, returnToHub);
  }
}, true);

// Direct-src video errors do not bubble reliably, so listen in capture.
const worldVideo = document.getElementById('world-video');
if (worldVideo) worldVideo.addEventListener('error', () => {
  if (G.currentMapId !== MAP_ID) return;
  const current = worldVideo.getAttribute('src') || '';
  if (current.endsWith(boardMap.fallbackVideo)) return;
  worldVideo.setAttribute('poster', boardMap.fallbackPoster);
  worldVideo.setAttribute('src', boardMap.fallbackVideo);
  worldVideo.load();
  worldVideo.play().catch(() => {});
}, true);

export { boardMap, boardGate, boardZones, HEROES, ZONE_POOLS };
