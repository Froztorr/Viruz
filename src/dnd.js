// ═══════════════════════════════════════════════════════════
// VIRUZ — TABLETOP REALM (fantasy board-game map)
// ═══════════════════════════════════════════════════════════

import * as DATA from './data.js';
import { MAPS, ZONES } from './data.js';
import { MONSTER_FACING } from './facing.js';
import { G, save } from './state.js';

const MAP_ID = 'board';
const HUB_ID = 'galaxy';
const GATE_ID = 'board_gate';
const TEMPLATE_ID = 'vampire_lord';

const boardMap = {
  id: MAP_ID, parentMapId: HUB_ID, parentGateId: GATE_ID,
  name: 'Tabletop Realm', thai: 'อาณาจักรกระดาน',
  video: 'assets/maps/board.mp4', poster: 'assets/maps/board.jpg',
  fallbackVideo: 'assets/maps/hell.mp4', fallbackPoster: 'assets/maps/hell.jpg',
  levelRange: [166, 190],
  desc: 'กระดานผจญภัยบนโต๊ะไม้ — ที่นี่คุณคือฝ่ายมอนสเตอร์',
  warpIn: { x: 18.6, y: 25.5 }, warpOut: null,
};

const boardGate = {
  id: GATE_ID, map: HUB_ID, kind: 'safe', order: 0,
  targetMapId: MAP_ID, icon: '🎲',
  name: 'Tabletop Realm', thai: 'อาณาจักรกระดาน',
  x: 52, y: 18, desc: 'เข้าสู่แผนที่ย่อย',
};

const battle = (id, order, name, thai, x, y, lv, waves, pool, bitzMult, expMult, desc) => ({
  id, map: MAP_ID, kind: 'battle', order, name, thai, x, y, lv, waves, pool,
  reward: { bitzMult, expMult }, desc,
});

const boardZones = [
  { id: 'bd_tavern', map: MAP_ID, kind: 'safe', order: 0,
    name: "Adventurers' Rest", thai: 'โรงเตี๊ยมนักผจญภัย', x: 80.95, y: 42.14,
    desc: 'โต๊ะมุมโรงเตี๊ยมสำหรับพักฟื้นและซื้อยา' },
  battle('bd_gate', 1, 'Starting Square', 'ช่องเริ่มต้น', 43.62, 23.77, [166, 169], [3, 4],
    ['vampire_lord', 'black_beast'], 12.5, 11.8, 'ช่องแรกของกระดาน — หน่วยลาดตระเวนของปาร์ตี้'),
  battle('bd_fortress', 2, 'Grey Fortress', 'ป้อมปราการสีเทา', 29.85, 36.26, [170, 173], [3, 4],
    ['vampire_lord', 'fire_golem'], 12.9, 12.1, 'ป้อมหินสีเทา — ที่มั่นของนักรบ อัศวิน และกวี'),
  battle('bd_chapel', 3, 'Candlelit Chapel', 'โบสถ์แสงเทียน', 19.81, 48.98, [174, 177], [4, 4],
    ['vampire_lady', 'vampire_lord'], 13.2, 12.4, 'แท่นบูชาที่สวดภาวนาขับไล่ไวรัส'),
  battle('bd_pit', 4, 'Skeleton Pit', 'หลุมโครงกระดูก', 37.84, 61.42, [178, 181], [4, 4],
    ['black_beast', 'vampire_lady'], 13.6, 12.8, 'หลุมมืดเต็มไปด้วยโครงกระดูก — ที่ซุ่มของโจรและผู้วิเศษ'),
  battle('bd_tower', 5, 'Arcane Tower', 'หอคอยเวทมนตร์', 19.81, 75.24, [182, 184], [4, 5],
    ['fire_golem', 'rock_golem'], 14, 13.1, 'หอคอยที่คลื่นเวทมนตร์แปรปรวนตลอดเวลา'),
  battle('bd_ridge', 6, 'Dragonfoot Ridge', 'สันเขาเชิงมังกร', 73, 79.3, [185, 187], [4, 5],
    ['rock_golem', 'fire_golem'], 14.5, 13.5, 'เชิงเขามังกร — ด่านสุดท้ายก่อนขึ้นสู่ยอด'),
  battle('bd_hall', 7, "Dungeon Master's Hall", 'ห้องโถงเจ้าแห่งดันเจี้ยน', 68, 70, [188, 190], [5, 5],
    ['vampire_lord', 'fire_golem', 'black_beast'], 15, 14, 'ยอดเขามังกร โต๊ะสุดท้าย ที่ลูกเต๋าตัดสินทุกอย่าง'),
];

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
  bd_gate:     ['hero_warrior', 'hero_rogue'],
  bd_fortress: ['hero_warrior', 'hero_paladin', 'hero_bard'],
  bd_chapel:   ['hero_priest', 'hero_paladin'],
  bd_pit:      ['hero_rogue', 'hero_sorcerer'],
  bd_tower:    ['hero_wizard', 'hero_sorcerer'],
  bd_ridge:    ['hero_sorcerer', 'hero_wizard'],
  bd_hall:     ['hero_dungeon_master', 'hero_ranger'],
};

HEROES.forEach(h => { MONSTER_FACING[h.id] = 'left'; });

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
    if (roster[def.id]) { ready.add(def.id); return; }

    const entry = { ...template, id: def.id, name: def.name };
    entry.gif = def.id;
    entry.ext = 'gif';
    entry.faces = 'left';
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
