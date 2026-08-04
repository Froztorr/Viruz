// ══════════════════════════════════════════════════════════════
// BOTNET — idle expedition system
//
// Benched/idle pets are sent to "infect" a world node for a fixed
// real-time package. While deployed they earn Bitz + EXP, but take
// continuous corruption damage scaled by how far out of their depth
// the node is. At the end of the run there is a chance the squad gets
// STUCK and calls home for help — the player must answer a 3-choice
// prompt, and the pet's own stats/habits decide whether the answer
// actually works. Fail the rescue and the run's rewards are cut.
//
// This file is pure logic + data. No DOM. The screen that renders it
// lives in src/screens/botnet.js.
// ══════════════════════════════════════════════════════════════

import { ANTIVIRUZ, EQUIP_GRADE_KEYS, ZONES, rollEquipment, zoneById } from './data.js';
import { grantExp, habitOf, markDown, statsOf, uid } from './engine.js';

// Hard cap on squad size, per design.
export const BOTNET_MAX_PETS = 10;

// ── DURATION PACKAGES ──
// rewardMult is deliberately SUPER-linear (10h pays more than 20x the
// 30m run) so committing a long block is worth the risk, while
// riskMult and rescueChance both climb to keep it from being free.
export const BOTNET_PACKAGES = [
  { id:'bn_30m', label:'30 นาที', short:'30m', ms:        30 * 60 * 1000, rewardMult:  1.0, riskMult:1.00, rescueChance:0.10 },
  { id:'bn_1h',  label:'1 ชั่วโมง',  short:'1h',  ms:        60 * 60 * 1000, rewardMult:  2.2, riskMult:1.15, rescueChance:0.16 },
  { id:'bn_3h',  label:'3 ชั่วโมง',  short:'3h',  ms:  3 * 60 * 60 * 1000, rewardMult:  7.2, riskMult:1.35, rescueChance:0.26 },
  { id:'bn_6h',  label:'6 ชั่วโมง',  short:'6h',  ms:  6 * 60 * 60 * 1000, rewardMult: 15.6, riskMult:1.60, rescueChance:0.38 },
  { id:'bn_8h',  label:'8 ชั่วโมง',  short:'8h',  ms:  8 * 60 * 60 * 1000, rewardMult: 21.6, riskMult:1.80, rescueChance:0.46 },
  { id:'bn_10h', label:'10 ชั่วโมง', short:'10h', ms: 10 * 60 * 60 * 1000, rewardMult: 28.0, riskMult:2.00, rescueChance:0.55 },
];
export function packageById(id) {
  return BOTNET_PACKAGES.find(p => p.id === id) || BOTNET_PACKAGES[0];
}

// ── NODE DIFFICULTY ──
// A node's "power" is the average power of the monsters in its pool,
// using the same shape as data.js's own monsterPower() rather than
// inventing a second formula.
function monsterPower(m) {
  const b = m.base;
  return b.atk + b.def + b.spd * 0.5 + b.mhp * 0.3;
}
export function nodePower(zone) {
  const pool = (zone && zone.pool) || [];
  const mons = pool.map(id => ANTIVIRUZ[id]).filter(Boolean);
  if (!mons.length) return 1;
  return mons.reduce((s, m) => s + monsterPower(m), 0) / mons.length;
}
// The level a botnet run is measured against — the TOP of the zone's
// range, so a node is never trivialised by its own easiest spawn.
export function nodeLevel(zone) {
  return (zone && zone.lv && zone.lv[1]) || 1;
}

// Only battle zones can be infected — safe spots have no pool.
export function botnetNodes() {
  return ZONES.filter(z => z.kind === 'battle');
}

// ── DAMAGE MODEL ──
// "Each one can constantly receive damage from the selected nodes the
// more gap of lvl and stats are." Two independent gaps feed one
// damage-per-hour percentage:
//   levelGap — node level minus pet level
//   statGap  — node power vs the pet's own defensive bulk (def+vit)
// A pet comfortably above the node still chips a little (there is no
// completely free farm), but stays far from Down even on a 10h run.
const DMG_BASE_PCT_PER_HOUR = 0.02;   // 2%/h even when overqualified
const DMG_PER_LEVEL_GAP     = 0.011;  // +1.1%/h per level the node is higher
const DMG_PER_STAT_RATIO    = 0.05;   // scaled by how outmatched the bulk is
const DMG_MAX_PCT_PER_HOUR  = 0.34;

export function damagePctPerHour(pet, zone, pkg) {
  if (!pet || !zone) return 0;
  const s = statsOf(pet);
  const levelGap = Math.max(0, nodeLevel(zone) - (pet.level || 1));
  // Defensive bulk vs the node's raw threat. Ratio > 1 means the node
  // out-muscles the pet.
  const bulk = Math.max(1, s.def * 1.6 + s.vit * 0.5);
  const ratio = Math.max(0, nodePower(zone) / bulk - 0.6);
  const raw = DMG_BASE_PCT_PER_HOUR
    + levelGap * DMG_PER_LEVEL_GAP
    + ratio * DMG_PER_STAT_RATIO;
  return Math.min(DMG_MAX_PCT_PER_HOUR, raw * (pkg ? pkg.riskMult : 1));
}

// Total HP a pet will lose across a whole run, as an absolute number.
export function projectedDamage(pet, zone, pkg) {
  const hours = (pkg ? pkg.ms : 0) / 3600000;
  const pct = damagePctPerHour(pet, zone, pkg) * hours;
  return Math.floor(statsOf(pet).mhp * Math.min(0.95, pct));
}

// ── REWARDS ──
// Built off the zone's OWN reward multipliers so a deep node always
// pays better, then scaled by the package and the squad size.
const BITZ_PER_NODE_LEVEL = 9;
const EXP_PER_NODE_LEVEL  = 7;

export function projectedRewards(pets, zone, pkg) {
  const n = (pets || []).length;
  if (!n || !zone || !pkg) return { bitz:0, exp:0, gearRolls:0 };
  const lv = nodeLevel(zone);
  const rw = zone.reward || { bitzMult:1, expMult:1 };
  const bitz = Math.floor(BITZ_PER_NODE_LEVEL * lv * rw.bitzMult * pkg.rewardMult * n);
  const exp  = Math.floor(EXP_PER_NODE_LEVEL  * lv * rw.expMult  * pkg.rewardMult * n);
  // One gear roll per ~3 pets, plus a bonus roll on the longest runs.
  const gearRolls = Math.max(1, Math.floor(n / 3)) + (pkg.ms >= 6 * 3600000 ? 1 : 0);
  return { bitz, exp, gearRolls };
}

// ══════════════════════════════════════════════════════════════
// RESCUE EVENTS
// Rolled once per expedition. One deployed pet gets into trouble and
// the player picks one of three ways out. Every choice resolves
// against that pet's REAL stats (see STAT_KEYS in data.js — note there
// is no `str` stat in this codebase, `atk` is the strength analogue).
// The third choice is always a "special" that only unlocks when the
// stuck pet has an animal-flavoured habit card socketed.
// ══════════════════════════════════════════════════════════════

// Habit types that count as "wild animal / higher animal" for the
// special choice — both of the beast entries in HABIT_TYPES.
export const ANIMAL_HABIT_TYPES = ['beast', 'magicalBeast'];
export function hasAnimalHabit(pet) {
  const h = habitOf(pet);
  return !!(h && ANIMAL_HABIT_TYPES.includes(h.type));
}

// Each choice declares which stats decide it and their weights. The
// weighted stat total is compared against a difficulty derived from
// the node's level, so the same choice gets harder deeper in the map.
export const RESCUE_EVENTS = [
  {
    id:'jungle_stuck',
    title:'ติดอยู่ในป่าทึบ',
    text:'ทีมบอตเน็ตหลงเข้าไปในดงไม้หนาทึบ เถาวัลย์พันขาไว้แน่น — ต้องหาทางออกก่อนพระอาทิตย์ตก',
    choices:[
      { id:'jump',   icon:'💪', label:'กระโดดข้ามยอดไม้เพื่อหนีออกมา',
        stats:{ atk:1.0 }, hint:'ใช้พลังโจมตี (ATK)' },
      { id:'swing',  icon:'🤸', label:'ใช้ความคล่องแคล่วโหนกิ่งไม้ผ่านสิ่งกีดขวาง',
        stats:{ spd:0.6, eva:0.4 }, hint:'ใช้ความเร็ว + การหลบ (SPD/EVA)' },
      { id:'friend', icon:'🐾', label:'ผูกมิตรกับสัตว์ท้องถิ่นให้ช่วยนำทาง',
        special:true, stats:{ spd:0.3, def:0.3, vit:0.4 }, bonus:0.35,
        hint:'ต้องมีการ์ดนิสัย Beast / Magical Beast' },
    ],
  },
  {
    id:'ravine',
    title:'หน้าผาขาด',
    text:'ทางกลับถูกตัดขาดด้วยเหวลึก สัญญาณเริ่มขาดหาย — ต้องข้ามไปให้ได้',
    choices:[
      { id:'smash',  icon:'💪', label:'ทุบก้อนหินทำสะพานข้ามเหว',
        stats:{ atk:0.7, def:0.3 }, hint:'ใช้พลังโจมตี + ป้องกัน (ATK/DEF)' },
      { id:'leap',   icon:'🤸', label:'วิ่งเร่งความเร็วแล้วกระโจนข้ามไป',
        stats:{ spd:0.7, eva:0.3 }, hint:'ใช้ความเร็ว + การหลบ (SPD/EVA)' },
      { id:'friend', icon:'🐾', label:'เรียกสัตว์บินท้องถิ่นให้พาข้ามเหว',
        special:true, stats:{ spd:0.4, vit:0.6 }, bonus:0.35,
        hint:'ต้องมีการ์ดนิสัย Beast / Magical Beast' },
    ],
  },
  {
    id:'firewall_maze',
    title:'ติดอยู่ในเขตไฟร์วอลล์',
    text:'โหนดปล่อยกำแพงไฟร์วอลล์ล้อมทีมไว้ ทางออกเปลี่ยนตำแหน่งทุกไม่กี่วินาที',
    choices:[
      { id:'break',  icon:'💪', label:'ทุบกำแพงไฟร์วอลล์ให้แตกออกตรง ๆ',
        stats:{ atk:0.8, vit:0.2 }, hint:'ใช้พลังโจมตี (ATK)' },
      { id:'slip',   icon:'🤸', label:'อ่านจังหวะแล้วลอดช่องว่างออกไป',
        stats:{ spd:0.5, eva:0.5 }, hint:'ใช้ความเร็ว + การหลบ (SPD/EVA)' },
      { id:'friend', icon:'🐾', label:'ให้สัตว์ท้องถิ่นดึงความสนใจระบบไว้',
        special:true, stats:{ eva:0.5, def:0.5 }, bonus:0.35,
        hint:'ต้องมีการ์ดนิสัย Beast / Magical Beast' },
    ],
  },
  {
    id:'sand_sink',
    title:'จมอยู่ในทรายดูด',
    text:'พื้นทรายยุบตัวลงกลางทาง ยิ่งขยับยิ่งจมลึก',
    choices:[
      { id:'pull',   icon:'💪', label:'ฝืนแรงดึงตัวเองขึ้นจากทราย',
        stats:{ atk:0.5, vit:0.5 }, hint:'ใช้พลังโจมตี + พลังชีวิต (ATK/VIT)' },
      { id:'roll',   icon:'🤸', label:'กระจายน้ำหนักแล้วกลิ้งออกด้านข้าง',
        stats:{ spd:0.5, eva:0.5 }, hint:'ใช้ความเร็ว + การหลบ (SPD/EVA)' },
      { id:'friend', icon:'🐾', label:'ให้สัตว์ขุดรูท้องถิ่นเปิดทางหนีใต้ทราย',
        special:true, stats:{ def:0.4, vit:0.6 }, bonus:0.35,
        hint:'ต้องมีการ์ดนิสัย Beast / Magical Beast' },
    ],
  },
];

// Difficulty target the weighted stat total is measured against.
// Tuned so a pet AT the node's level sits near a coin flip, an
// over-levelled pet is comfortable, and an under-levelled one is a
// genuine gamble.
function rescueDifficulty(zone) {
  return 14 + nodeLevel(zone) * 2.1;
}

// Weighted stat total for one choice.
function choiceScore(pet, choice) {
  const s = statsOf(pet);
  let total = 0;
  Object.keys(choice.stats || {}).forEach(k => {
    total += (s[k] || 0) * choice.stats[k];
  });
  return total;
}

// Is this choice even selectable for this pet?
export function choiceUnlocked(pet, choice) {
  if (!choice.special) return true;
  return hasAnimalHabit(pet);
}

// Success chance for a given pet/choice/node, as 0..1. Never a
// guaranteed win or loss — every route keeps some tension.
export function rescueSuccessChance(pet, choice, zone) {
  if (!pet || !choice) return 0;
  if (!choiceUnlocked(pet, choice)) return 0;
  const need = rescueDifficulty(zone);
  const score = choiceScore(pet, choice);
  // Ratio 1.0 (exactly meeting the target) lands at 55%.
  const ratio = score / Math.max(1, need);
  let pct = 0.55 * ratio;
  if (choice.bonus) pct += choice.bonus;   // the animal-habit route is meant to feel strong
  return Math.max(0.08, Math.min(0.95, pct));
}

export function rollRescueEvent() {
  return RESCUE_EVENTS[Math.floor(Math.random() * RESCUE_EVENTS.length)];
}

// Reward penalty when the rescue answer fails — the run still returns,
// just with a fraction of the haul.
export const RESCUE_FAIL_REWARD_MULT = 0.35;

// ══════════════════════════════════════════════════════════════
// EXPEDITION LIFECYCLE
// Stored on G.botnet as a single active run (null when idle):
//   { petIds, zoneId, packageId, startedAt, endsAt, rescue }
// `rescue` is pre-rolled at LAUNCH time rather than on collection so
// the outcome can't be re-rolled by reloading the page.
// ══════════════════════════════════════════════════════════════

export function createExpedition(pets, zone, pkg) {
  const now = Date.now();
  const ids = pets.map(p => p.uid);
  // Pre-roll whether this run ends in a rescue prompt, and who is
  // stuck, so the result is fixed the moment the player commits.
  const willNeedRescue = Math.random() < pkg.rescueChance;
  const stuckId = willNeedRescue ? ids[Math.floor(Math.random() * ids.length)] : null;
  return {
    petIds: ids,
    zoneId: zone.id,
    packageId: pkg.id,
    startedAt: now,
    endsAt: now + pkg.ms,
    rescue: willNeedRescue
      ? { eventId: rollRescueEvent().id, petId: stuckId, resolved: false, success: false }
      : null,
    runId: uid(),
  };
}

export function expeditionReady(run) {
  return !!run && Date.now() >= run.endsAt;
}
export function expeditionRemainingMs(run) {
  return run ? Math.max(0, run.endsAt - Date.now()) : 0;
}
export function expeditionProgressPct(run) {
  if (!run) return 0;
  const total = Math.max(1, run.endsAt - run.startedAt);
  return Math.max(0, Math.min(100, Math.round(((Date.now() - run.startedAt) / total) * 100)));
}
export function eventById(id) {
  return RESCUE_EVENTS.find(e => e.id === id) || RESCUE_EVENTS[0];
}

// Applies the accumulated corruption damage to every deployed pet.
// Uses markDown() so a pet that drops to 0 enters the same Down state
// a lost battle would produce — no special-case "botnet death".
export function applyExpeditionDamage(run, pets) {
  const zone = zoneById(run.zoneId);
  const pkg = packageById(run.packageId);
  const downed = [];
  pets.forEach(pet => {
    if (!pet) return;
    const dmg = projectedDamage(pet, zone, pkg);
    if (dmg <= 0) return;
    pet.hp = Math.max(0, pet.hp - dmg);
    if (pet.hp <= 0) { markDown(pet); downed.push(pet); }
  });
  return downed;
}

// Final payout. `rewardMult` lets the caller apply
// RESCUE_FAIL_REWARD_MULT after a botched rescue.
export function settleExpedition(run, pets, rewardMult = 1) {
  const zone = zoneById(run.zoneId);
  const pkg = packageById(run.packageId);
  const base = projectedRewards(pets, zone, pkg);
  const bitz = Math.floor(base.bitz * rewardMult);
  const exp = Math.floor(base.exp * rewardMult);
  const share = Math.floor(exp / Math.max(1, pets.length));
  pets.forEach(p => { if (p) grantExp(p, share); });
  // Gear: rolled at the node's level so a deep node yields deep gear.
  const gear = [];
  const rolls = Math.max(0, Math.round(base.gearRolls * rewardMult));
  for (let i = 0; i < rolls; i++) gear.push(rollEquipment(nodeLevel(zone)));
  return { bitz, exp, gear, zone, pkg };
}
