// ══════════════════════════════════════════════════════════════
// HABIT CARD FUSION
//
// Replaces the old "rarity is derived from the card's lvlReq" idea
// entirely. Every habit card now DROPS as green (common) regardless of
// where it fell, and the only way up the ladder is fusing two cards of
// the SAME tier into one of the next tier:
//
//   🟢 green  ×2  →  🔵 blue
//   🔵 blue   ×2  →  🟣 purple
//
// Each step multiplies the card's power (and any stat block it carries)
// by a random 1.20–1.30, so two identical fusions are never worth
// exactly the same — the roll is stamped onto the card at fusion time.
//
// The fused card inherits its Color + Type from ONE of the two
// ingredients at random, which is the gamble: fusing a card you like
// with one you don't might not keep the one you wanted.
//
// Pure logic + data. No DOM.
// ══════════════════════════════════════════════════════════════

import { HABIT_COLORS, HABIT_TYPES } from './data.js';
import { uid } from './engine.js';

// ── TIER LADDER ──
// Ordered lowest → highest. `rarityId` maps onto the existing RARITY
// table (data.js) so a card's frame colour reuses the same ladder every
// other item in the game already uses, rather than inventing a second one.
export const CARD_TIER_KEYS = ['green', 'blue', 'purple'];
export const CARD_TIERS = {
  green: {
    id:'green', name:'Common', thai:'สามัญ', icon:'🟢',
    sprite:'assets/ui/habit_card_green.png',
    rarityId:'rare', color:'#3ddc84',
    desc:'การ์ดพื้นฐาน — ดรอปจากศัตรูทุกตัว',
  },
  blue: {
    id:'blue', name:'Rare', thai:'หายาก', icon:'🔵',
    sprite:'assets/ui/habit_card_blue.png',
    rarityId:'epic', color:'#4fc3f7',
    desc:'หลอมจากการ์ดสามัญ 2 ใบ — พลังพาสซีฟและสเตตัสแรงขึ้น',
  },
  purple: {
    id:'purple', name:'Most Rare', thai:'หายากที่สุด', icon:'🟣',
    sprite:'assets/ui/habit_card_purple.png',
    rarityId:'legendary', color:'#ce93d8',
    desc:'หลอมจากการ์ดหายาก 2 ใบ — ขั้นสูงสุดของการ์ดนิสัย',
  },
};

// Every card that predates this system (and every fresh drop) is green.
export const BASE_CARD_TIER = 'green';

// Power gain per fusion step, rolled per fusion.
export const FUSION_GAIN_MIN = 0.20;
export const FUSION_GAIN_MAX = 0.30;
function rollFusionGain() {
  return 1 + FUSION_GAIN_MIN + Math.random() * (FUSION_GAIN_MAX - FUSION_GAIN_MIN);
}

// ── ACCESSORS ──
// Always go through these rather than reading item.cardTier directly —
// they tolerate legacy cards saved before this system existed.
export function cardTierOf(item) {
  if (!item) return BASE_CARD_TIER;
  return CARD_TIERS[item.cardTier] ? item.cardTier : BASE_CARD_TIER;
}
export function cardTierMeta(item) {
  return CARD_TIERS[cardTierOf(item)];
}
export function cardTierIndex(item) {
  return CARD_TIER_KEYS.indexOf(cardTierOf(item));
}
export function cardPowerOf(item) {
  const p = item && item.cardPower;
  return (typeof p === 'number' && p > 0) ? p : 1;
}
export function cardSpriteSrc(item) {
  return cardTierMeta(item).sprite;
}
export function isHabitCard(item) {
  return !!item && item.slotId === 'habit';
}
export function isMaxTier(item) {
  return cardTierIndex(item) >= CARD_TIER_KEYS.length - 1;
}

// ── STAT BLOCK ──
// Habit cards historically carried NO stats at all — only a color and
// a type passive. Fusion is supposed to improve "the effects AND stats
// given", so a card now also carries a small stat block. It is
// deliberately modest: the card's real value is still its passive.
//
// equipmentBonuses() (engine.js) already sums `item.stats` for every
// equipped item including the habit slot, so this needs no engine
// change to take effect.
const BASE_CARD_STATS = { vit: 6, def: 2 };
// A few types lean somewhere other than bulk, so the base block is
// nudged to match the passive's own theme.
const TYPE_STAT_LEAN = {
  beast:        { atk: 3 },
  magicalBeast: { atk: 4, spd: 2 },
  insect:       { crit: 3 },
  fish:         { eva: 3 },
  myth:         { atk: 2, def: 2 },
  goblin:       { crit: 4 },
  demon:        { atk: 3 },
  vampire:      { atk: 2, vit: 3 },
  elemental:    { def: 4 },
  humanoid:     { atk: 1, def: 1, spd: 1 },
  undead:       { vit: 5 },
  plants:       { vit: 4 },
  fungi:        { crit: 2 },
  machine:      { def: 3 },
  conjuration:  { eva: 4 },
  aberration:   { crit: 2, eva: 2 },
  dragon:       { atk: 5 },
  fey:          { eva: 2, spd: 2 },
};

// The stat block a brand-new green card of this type should carry.
export function baseStatsForType(typeId) {
  const out = { ...BASE_CARD_STATS };
  const lean = TYPE_STAT_LEAN[typeId] || {};
  Object.keys(lean).forEach(k => { out[k] = (out[k] || 0) + lean[k]; });
  return out;
}

function scaleStats(stats, mult) {
  const out = {};
  Object.keys(stats || {}).forEach(k => {
    out[k] = Math.max(1, Math.round(stats[k] * mult));
  });
  return out;
}

// ── MIGRATION ──
// Brings any habit card — a fresh drop or one loaded from an old save —
// up to the current shape. Idempotent, so it is safe to run on every
// boot and on every drop.
//
// NOTE: `lvlReq` is intentionally forced to 1. Under the old system a
// card's lvlReq doubled as its rarity, which meant a card could be
// un-equippable on a low-level pet for no good reason. Tier is now the
// only thing that separates cards, so every card fits any pet.
export function normalizeHabitCard(item) {
  if (!isHabitCard(item)) return item;
  if (!CARD_TIERS[item.cardTier]) item.cardTier = BASE_CARD_TIER;
  if (typeof item.cardPower !== 'number' || !(item.cardPower > 0)) item.cardPower = 1;
  if (!item.stats || !Object.keys(item.stats).length) {
    item.stats = scaleStats(baseStatsForType(item.type), item.cardPower);
  }
  item.lvlReq = 1;
  // Grade is what the inventory/drop banner colours off. Keep it in
  // lockstep with the card's own tier instead of the old flat 'trojan'.
  item.grade = gradeForTier(cardTierOf(item));
  return item;
}

// Habit cards ride the existing EQUIP_GRADES ladder for their frame
// colour. green→trojan (rare), blue→polymorphic (epic),
// purple→zeroday (legendary) — matching CARD_TIERS[].rarityId.
export function gradeForTier(tierId) {
  switch (tierId) {
    case 'purple': return 'zeroday';
    case 'blue':   return 'polymorphic';
    default:       return 'trojan';
  }
}

// ── FUSION ──
export function canFuse(a, b) {
  if (!a || !b) return { ok:false, why:'เลือกการ์ด 2 ใบ' };
  if (a.uid === b.uid) return { ok:false, why:'ต้องเป็นการ์ดคนละใบ' };
  if (!isHabitCard(a) || !isHabitCard(b)) return { ok:false, why:'ใช้ได้กับการ์ดนิสัยเท่านั้น' };
  if (a.locked || b.locked) return { ok:false, why:'ปลดล็อกการ์ดก่อนหลอม' };
  const ta = cardTierOf(a), tb = cardTierOf(b);
  if (ta !== tb) return { ok:false, why:'ต้องเป็นระดับเดียวกันทั้งสองใบ' };
  if (isMaxTier(a)) return { ok:false, why:'ระดับสูงสุดแล้ว หลอมต่อไม่ได้' };
  return { ok:true, nextTier: CARD_TIER_KEYS[cardTierIndex(a) + 1] };
}

// Produces the NEW card. Callers are responsible for removing the two
// ingredients from G.equipBag and pushing the result — this function
// deliberately touches no global state so it stays testable.
export function fuseCards(a, b) {
  const chk = canFuse(a, b);
  if (!chk.ok) return null;
  // Identity (color + type + source name) comes from one parent at
  // random — that is the gamble.
  const parent = Math.random() < 0.5 ? a : b;
  const gain = rollFusionGain();
  const power = cardPowerOf(parent) * gain;
  const tierId = chk.nextTier;
  const tier = CARD_TIERS[tierId];
  const baseStats = baseStatsForType(parent.type);
  const colorName = (HABIT_COLORS[parent.color] || {}).name || parent.color;
  const typeName = (HABIT_TYPES[parent.type] || {}).name || parent.type;
  return {
    uid: uid(),
    slotId: 'habit',
    sourceId: parent.sourceId || null,
    // Keeps the enemy's own card name but stamps the new tier on it so
    // two cards from the same enemy at different tiers read differently.
    name: `${parent.name.replace(/\s*\[(Common|Rare|Most Rare)\]$/, '')} [${tier.name}]`,
    color: parent.color,
    type: parent.type,
    cardTier: tierId,
    cardPower: power,
    stats: scaleStats(baseStats, power),
    grade: gradeForTier(tierId),
    lvlReq: 1,
    // Recorded purely so the fusion result screen can show what the
    // roll actually was.
    fusionGain: gain,
    fusedFrom: [a.uid, b.uid],
    inheritedFrom: { color: colorName, type: typeName },
  };
}

// Groups a bag into fusable pairs, for the fusion screen's "fuse all"
// style affordances. Only ever pairs cards of identical tier AND
// identical color+type, so a bulk action can never silently destroy a
// combination the player was collecting.
export function findFusablePairs(bag) {
  const cards = (bag || []).filter(x => isHabitCard(x) && !x.locked && !isMaxTier(x));
  const buckets = {};
  cards.forEach(c => {
    const key = `${cardTierOf(c)}|${c.color}|${c.type}`;
    (buckets[key] = buckets[key] || []).push(c);
  });
  const pairs = [];
  Object.values(buckets).forEach(list => {
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  });
  return pairs;
}

// How much a card's type passive should be scaled by. Applied in
// engine.js's habitStatMods() so a fused card's passive is genuinely
// stronger, not just its flat stats.
//   green  → 1.00
//   blue   → ~1.20–1.30
//   purple → ~1.44–1.69
export function habitPassiveScale(pet) {
  const card = pet && pet.equip && pet.equip.habit;
  if (!card) return 1;
  return cardPowerOf(card);
}
