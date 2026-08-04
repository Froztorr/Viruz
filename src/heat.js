// ══════════════════════════════════════════════════════════════
// HEAT / TRACE METER
//
// Farming the same node over and over is no longer free. Past a grace
// window of 5 fights, every additional fight at that SAME node both:
//   1. rolls a growing chance to upgrade the encounter into an ELITE
//      (⭐ + red name, level +5, stats ×2, rewards ×5, one guaranteed
//      epic-or-better item), and
//   2. pushes that node's Trace meter up.
//
// At 100% Trace the hunter — MarshalImp — shows up instead. It is
// always the player's own level +20 with double stats, and beating it
// is the only source of Imp's Emblem, a legendary collectible meant
// to be exchanged for special items later.
//
// Fighting a DIFFERENT node bleeds heat off the others, so the counter
// rewards rotating nodes rather than parking on one.
//
// Pure logic + data. No DOM.
// ══════════════════════════════════════════════════════════════

import { EQUIP_GRADES, rollEquipment } from './data.js';
import { spawnAntiviruz, statsOf } from './engine.js';

export const HEAT_TUNING = {
  // Fights at one node before heat starts building at all.
  freeFights: 5,
  // Elite chance added per fight beyond the grace window.
  elitePerFight: 0.12,
  eliteChanceCap: 0.75,
  // Trace meter percentage added per fight beyond the grace window.
  meterPerFight: 8,
  // Heat shed from every OTHER node each time you fight somewhere new.
  decayPerOtherNode: 4,

  // ── ELITE ("big enemy") ──
  eliteLevelBonus: 5,
  eliteStatMult: 2,
  eliteRewardMult: 5,
  // "at least epic" — polymorphic is the epic rung of EQUIP_GRADES
  // (see GRADE_RARITY in item-rarity.js).
  eliteMinGrade: 'polymorphic',

  // ── HUNTER ──
  hunterDefId: 'marshal_imp',
  hunterLevelBonus: 20,
  hunterStatMult: 2,
};

// The legendary collectible dropped by the hunter. Kept here rather
// than in data.js's MATERIALS so this system stays self-contained;
// counts live on G.emblems.
export const IMP_EMBLEM = {
  id:'imp_emblem',
  name:"Imp's Emblem",
  thai:'ตราปีศาจ',
  icon:'🎖️',
  rarityId:'legendary',
  desc:'ตราจาก MarshalImp — เก็บสะสมไว้แลกไอเทมพิเศษในภายหลัง',
};

// Grades at or above the elite guarantee, for the confirmed drop.
const GRADE_ORDER = ['script', 'trojan', 'polymorphic', 'zeroday', 'apt'];
function rollEliteGuaranteedGrade() {
  const minIdx = GRADE_ORDER.indexOf(HEAT_TUNING.eliteMinGrade);
  const pool = GRADE_ORDER.slice(minIdx);
  // Weight toward the floor so epic stays the common outcome and
  // A.P.T. remains a genuine surprise.
  const weights = [100, 34, 9];
  const total = weights.slice(0, pool.length).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    if (r < weights[i]) return pool[i];
    r -= weights[i];
  }
  return pool[0];
}

// ── STATE ──
// G.heat = { [zoneId]: { fights, meter } }
export function ensureHeatState(G) {
  G.heat = G.heat || {};
  return G.heat;
}
export function heatOf(G, zoneId) {
  const all = ensureHeatState(G);
  all[zoneId] = all[zoneId] || { fights: 0, meter: 0 };
  return all[zoneId];
}
export function heatMeterPct(G, zoneId) {
  return Math.max(0, Math.min(100, Math.round(heatOf(G, zoneId).meter)));
}
export function eliteChanceAt(G, zoneId) {
  const h = heatOf(G, zoneId);
  const over = Math.max(0, h.fights - HEAT_TUNING.freeFights);
  return Math.min(HEAT_TUNING.eliteChanceCap, over * HEAT_TUNING.elitePerFight);
}

// Called once per fight STARTED at a node, before the encounter is
// built. Returns what the encounter should be upgraded to.
//   { elite:boolean, hunter:boolean, meter:number, eliteChance:number }
// The hunter takes precedence and consumes the whole meter.
export function registerNodeFight(G, zoneId) {
  const all = ensureHeatState(G);
  const h = heatOf(G, zoneId);

  // Rotating nodes cools everything else down.
  Object.keys(all).forEach(id => {
    if (id === zoneId) return;
    all[id].meter = Math.max(0, all[id].meter - HEAT_TUNING.decayPerOtherNode);
    if (all[id].meter === 0) all[id].fights = Math.max(0, all[id].fights - 1);
  });

  h.fights += 1;
  const over = Math.max(0, h.fights - HEAT_TUNING.freeFights);
  if (over > 0) h.meter = Math.min(100, h.meter + HEAT_TUNING.meterPerFight);

  const eliteChance = eliteChanceAt(G, zoneId);

  if (h.meter >= 100) {
    // Hunter consumes the meter and resets the farm counter — surviving
    // it buys the player a fresh grace window.
    h.meter = 0;
    h.fights = 0;
    return { elite:false, hunter:true, meter:0, eliteChance };
  }
  const elite = over > 0 && Math.random() < eliteChance;
  return { elite, hunter:false, meter: h.meter, eliteChance };
}

// Manual reset, e.g. after the player leaves a region entirely.
export function clearHeat(G, zoneId) {
  const all = ensureHeatState(G);
  if (zoneId) delete all[zoneId];
  else G.heat = {};
}

// ── ELITE UPGRADE ──
// Mutates a freshly spawned unit in place. Marked with `isElite` so
// the battle UI can render the ⭐ and the red name, and the loot code
// can apply the ×5 reward multiplier and the confirmed drop.
//
// Stats are doubled by scaling `base` (the same lever spawnAntiviruz
// and startRaidFight already use) then re-deriving HP, rather than
// trying to patch statsOf()'s output.
export function makeElite(unit) {
  if (!unit) return unit;
  unit.isElite = true;
  unit.level = (unit.level || 1) + HEAT_TUNING.eliteLevelBonus;
  const m = HEAT_TUNING.eliteStatMult;
  unit.base = {
    atk: Math.floor(unit.base.atk * m),
    def: Math.floor(unit.base.def * m),
    spd: Math.floor(unit.base.spd * m),
    mhp: Math.floor(unit.base.mhp * m),
  };
  unit.rewardMult = HEAT_TUNING.eliteRewardMult;
  unit.hp = statsOf(unit).mhp;
  return unit;
}

// ── HUNTER ──
// Always scaled off the PLAYER's current level, never the zone's, so
// it is a real threat no matter where the meter filled up.
export function spawnHunter(playerLevel) {
  const level = Math.max(1, (playerLevel || 1) + HEAT_TUNING.hunterLevelBonus);
  const unit = spawnAntiviruz(HEAT_TUNING.hunterDefId, level);
  if (!unit) return null;
  unit.isHunter = true;
  unit.isElite = true;              // reuses the ⭐ / red-name treatment
  const m = HEAT_TUNING.hunterStatMult;
  unit.base = {
    atk: Math.floor(unit.base.atk * m),
    def: Math.floor(unit.base.def * m),
    spd: Math.floor(unit.base.spd * m),
    mhp: Math.floor(unit.base.mhp * m),
  };
  unit.rewardMult = HEAT_TUNING.eliteRewardMult;
  unit.hp = statsOf(unit).mhp;
  return unit;
}

// ── DROPS ──
// The elite's one guaranteed epic-or-better item.
export function rollEliteGuaranteedDrop(enemyLevel) {
  return rollEquipment(Math.max(1, enemyLevel || 1), rollEliteGuaranteedGrade());
}

// Emblem counter. Kept off G.materials so it never has to exist in
// data.js's MATERIALS table to render correctly.
export function emblemCount(G) {
  return (G.emblems && G.emblems[IMP_EMBLEM.id]) || 0;
}
export function grantImpEmblem(G, n = 1) {
  G.emblems = G.emblems || {};
  G.emblems[IMP_EMBLEM.id] = (G.emblems[IMP_EMBLEM.id] || 0) + n;
  return G.emblems[IMP_EMBLEM.id];
}

// Display helpers so the battle UI and the world map agree on how an
// elite reads.
export const ELITE_NAME_COLOR = '#ff4d4d';
export function eliteDisplayName(unit) {
  if (!unit) return '';
  return unit.isElite ? `⭐ ${unit.name}` : unit.name;
}
export function heatBadge(pct) {
  if (pct >= 100) return { icon:'🚨', label:'HUNTER', color:'#ff4d4d' };
  if (pct >= 60)  return { icon:'🔥', label:`Trace ${pct}%`, color:'#ff8a3d' };
  if (pct >= 25)  return { icon:'⚠', label:`Trace ${pct}%`, color:'#ffd23f' };
  return null;
}
