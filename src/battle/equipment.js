// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { AILMENTS, ANTIVIRUZ, BOSS_TUNING, CODE_PART_IDS, EQUIP_DROP_CHANCE, EQUIP_GRADES, EQUIP_GRADE_KEYS, EQUIP_SLOTS, HABIT_CARD_DROP_CHANCE, MATERIALS, MEAT_DROP_CHANCE, MEAT_ITEM, PAYLOAD_EFFECTS, SPECIES, codePartDropChance, craftEquipment, dustValueOf, rollEquipment, sellValueOf } from '../data.js';
import { addAilment, grantExp, habitOf, maxMP, restoreMP, statsOf, uid } from '../engine.js';
import { showDropBanner } from '../drop-banner.js';
import { rarityOf, rarityOfGrade } from '../item-rarity.js';
import { BASE_CARD_TIER, cardTierMeta, normalizeHabitCard } from '../habit-fusion.js';
import { HEAT_TUNING, IMP_EMBLEM, emblemCount, grantImpEmblem, rollEliteGuaranteedDrop } from '../heat.js';
import { healPop } from './combat.js';
import { startArena, startBossFight, startRaidFight, startZone } from './encounters.js';
import { checkBattleEnd } from './turn-loop.js';
import { renderEquipBag } from '../screens/inventory.js';
import { $, G, activeTeam, battle, save } from '../state.js';
import { blog, toast } from '../ui-shell.js';

// ═══════════════ EQUIPMENT: battle procs ═══════════════
// Returns { item, affix } for the equipped item (if any) whose attr
// affinity matches this pet's OWN attribute, or null. A green (speed)
// item is a speed-themed named item — it only procs on a green pet.
function payloadEffectOf(pet) {
  const item = pet && pet.equip && pet.equip.payload;
  if (!item || !item.effectId) return null;
  const eff = PAYLOAD_EFFECTS[item.effectId];
  if (!eff) return null;
  const gi = EQUIP_GRADE_KEYS.indexOf(item.grade);
  return { item, eff, mag: (eff.mag || [])[gi] || 0 };
}

// Resets every per-fight fighter field at the start of a battle: the
// first-strike flag (Overclock/Adaptive Strike are consumed on that
// fighter's first attack, see firstStrikeProc() below; Data Leech/Kill
// Reboot/Toxin Injector are per-hit, handled in applyPayloadOnHit()
// instead), MP, the speed/crit gauges, ailments (poison/frenzy now
// persist until the fight ends, so a stale stack from a PREVIOUS fight
// must not survive into this one), and the block/cooldown trackers.
// Previously only startBossFight/startZone hand-rolled this reset
// inline and startRaidFight/startArena skipped it entirely — a
// leftover poison/frenzy stack (or a full crit gauge) from a fight that
// just ended could otherwise carry straight into the next one.
export function applyBattleStartEquip(team) {
  (team || []).forEach(pet => {
    if (!pet) return;
    pet._firstStrikeUsed = false;
    pet.mp = statsOf(pet).int;
    pet.spdCounter = 0;
    pet.critGauge = 0;
    pet.ailments = [];
    pet._shield = 0;
    pet._cooldowns = {};
    pet._habitAtkCount = 0;
    pet._habitUndeadUsed = false;
    pet._tookDamageThisTurn = false;
  });
}

// Overclock (guaranteed crit) / Adaptive Strike (guaranteed double
// hit) — consumed on the fighter's first ACTUAL attack roll of the
// battle (basic or special), not on non-damaging specials. Works for
// any pet regardless of attribute — only the Payload slot matters.
function firstStrikeProc(attacker) {
  if (!attacker || attacker._firstStrikeUsed) return null;
  const info = payloadEffectOf(attacker);
  if (!info) return null;
  if (info.item.effectId === 'overclock') {
    attacker._firstStrikeUsed = true;
    blog(`⚔️ ${attacker.name} — ${info.eff.name}!`, 'buff');
    return { forceCrit: true };
  }
  if (info.item.effectId === 'adaptive') {
    attacker._firstStrikeUsed = true;
    blog(`🌪️ ${attacker.name} — ${info.eff.name}!`, 'buff');
    return { forceHits: 2 };
  }
  return null;
}

// Merges the equipment first-strike proc with the two Habit Type
// passives that force a guaranteed crit rather than reducing to a flat
// stat multiplier: Insect (every 5th attack this fight) and Goblin (any
// attack against a target under 50% HP). Equipment wins if it also has
// something queued — kept simple, no stacking of forced outcomes.
export function buildAttackProc(attacker, target) {
  const equipProc = firstStrikeProc(attacker);
  if (equipProc) return equipProc;
  const hab = habitOf(attacker);
  if (!hab) return null;
  if (hab.type === 'insect') {
    attacker._habitAtkCount = (attacker._habitAtkCount || 0) + 1;
    if (attacker._habitAtkCount % 5 === 0) return { forceCrit: true };
  }
  if (hab.type === 'goblin' && target && target.hp > 0) {
    const mhp = statsOf(target).vit;
    if (target.hp / mhp < 0.5) return { forceCrit: true };
  }
  return null;
}

// Data Leech (lifesteal) / Kill Reboot (MP on kill) / Toxin Injector
// (poison chance) — all per-hit, checked after damage lands. `target`
// is expected to already have res.dmg subtracted from its hp.
export function applyPayloadOnHit(attacker, target, res, side) {
  if (!res || res.evaded || !res.dmg) return;
  const info = payloadEffectOf(attacker);
  if (!info || info.mag <= 0) return;
  if (info.item.effectId === 'leech') {
    const heal = Math.max(1, Math.floor(res.dmg * info.mag));
    const mx = statsOf(attacker).vit;
    attacker.hp = Math.min(mx, attacker.hp + heal);
    healPop(attacker, heal);
    blog(`🩸 ${attacker.name} — ${info.eff.name}: +${heal} HP`, 'buff');
  } else if (info.item.effectId === 'manaregen' && target.hp <= 0) {
    const before = attacker.mp || 0;
    restoreMP(attacker, Math.floor(maxMP(attacker) * info.mag));
    if (attacker.mp > before) blog(`🔌 ${attacker.name} — ${info.eff.name}: +${attacker.mp - before} MP`, 'buff');
  } else if (info.item.effectId === 'toxin' && target.hp > 0 && Math.random() < info.mag) {
    addAilment(target, { ...AILMENTS.poison, turns: 2 });
    blog(`☠️ ${target.name} ติดพิษจาก ${attacker.name}!`, side);
  }
}

// ═══════════════ HEAT: elite & hunter kill bonuses ═══════════════
// Paid out when a starred elite (or the hunter) dies. Lives here, and
// is called from rollEquipDrop() below, because that function already
// runs exactly once per newly-credited kill — piggybacking on it beats
// threading a new hook through all ~44KB of turn-loop.js.
//
// The turn loop credits the NORMAL per-kill exp/bitz on its own, so
// what this adds is only the premium on top, which is how the total
// lands on the x5 the spec asks for.
function applyHeatKillBonus(enemy) {
  if (!enemy || !enemy.isElite) return;
  const lvl = Math.max(1, enemy.level || 1);
  const mult = enemy.rewardMult || HEAT_TUNING.eliteRewardMult;
  const extra = Math.max(0, mult - 1);

  const bonusBitz = Math.floor(lvl * 11 * extra);
  const alive = activeTeam().filter(p => p && p.hp > 0);
  const bonusExpEach = Math.floor((lvl * 8 * extra) / Math.max(1, alive.length));
  G.bitz += bonusBitz;
  alive.forEach(p => grantExp(p, bonusExpEach));
  blog(`⭐ โบนัสตัวให้ญ่: +${bonusBitz} Bitz · +${bonusExpEach} EXP ต่อตัว`, 'win');

  // Confirmed epic-or-better. Deliberately NOT gated behind
  // EQUIP_DROP_CHANCE — "guaranteed" has to mean guaranteed.
  const item = rollEliteGuaranteedDrop(lvl);
  if (item) {
    G.equipBag = G.equipBag || [];
    G.equipBag.push(item);
    const slot = EQUIP_SLOTS[item.slotId] || EQUIP_SLOTS.payload;
    showDropBanner({
      entry: item, fallback: slot.icon, name: item.name,
      rarityId: rarityOfGrade(item.grade), sub: `${slot.name} · ดรอปการันตี`,
    });
    blog(`⭐ ดรอปการันตี: ${item.name}`, 'win');
  }

  // The hunter's whole point. One emblem per kill, banked in G.emblems
  // for a future exchange shop.
  if (enemy.isHunter) {
    grantImpEmblem(G);
    showDropBanner({
      entry: IMP_EMBLEM, fallback: IMP_EMBLEM.icon, name: IMP_EMBLEM.name,
      rarityId: IMP_EMBLEM.rarityId, sub: 'สังหารนักล่าสำเร็จ',
    });
    blog(`🎖️ ได้รับ ${IMP_EMBLEM.name}! (รวม ${emblemCount(G)} ชิ้น)`, 'win');
  }
  save();
}

// ═══════════════ EQUIPMENT: drops, sell, dust, craft ═══════════════
// Every drop below announces itself with showDropBanner() rather than
// toast(): a toast sets textContent, so it could never show the item's
// real icon art, and had no way to carry a rarity colour. The banner
// shows the icon, the name, and a frame in the item's own tier colour —
// the same ladder the inventory grid uses. The battle log line still
// goes through blog() as before, so the written history is unchanged.
// Rolled once per newly-credited enemy kill (see checkBattleEnd).
// Capped at the dropping enemy's own level, per spec.
export function rollEquipDrop(enemy) {
  if (!enemy) return;
  // Heat premiums first: they are guaranteed, so they must not sit
  // behind the drop-chance gate on the next line.
  applyHeatKillBonus(enemy);
  if (Math.random() >= EQUIP_DROP_CHANCE) return;
  // Bosses roll one grade tier above what their level alone would
  // give — reuses the Deep Craft weighting as a stand-in "better loot"
  // table rather than inventing a new one.
  const item = enemy.isBoss
    ? craftEquipment('deep', Math.max(1, enemy.level || 1))
    : rollEquipment(Math.max(1, enemy.level || 1));
  G.equipBag = G.equipBag || [];
  G.equipBag.push(item);
  const slot = EQUIP_SLOTS[item.slotId];
  // Gear grades map 1:1 onto the rarity ladder, so a dropped zeroday
  // flashes the same gold an inventory zeroday box glows.
  showDropBanner({
    entry: item, fallback: slot.icon, name: item.name,
    rarityId: rarityOfGrade(item.grade), sub: `${slot.name} · Lv.${item.lvlReq}`,
  });
  blog(`${slot.icon} ดรอปอุปกรณ์: ${item.name}`, 'win');
}

// Evolution materials — Code Parts drop from any Lv1-50 kill (5%→50%,
// scaled by the enemy's level), Malware Cores ONLY from a region boss
// (25% flat, on top of everything else it drops). See MATERIALS/
// codePartDropChance()/BOSS_TUNING in data.js.
export function addMaterial(matId, n = 1) {
  G.materials = G.materials || {};
  G.materials[matId] = (G.materials[matId] || 0) + n;
}
export function rollMaterialDrop(enemy) {
  if (!enemy) return;
  if (Math.random() < codePartDropChance(Math.max(1, enemy.level || 1))) {
    const matId = CODE_PART_IDS[Math.floor(Math.random() * CODE_PART_IDS.length)];
    addMaterial(matId);
    const m = MATERIALS[matId];
    showDropBanner({ entry: m, fallback: m.icon, name: m.name, rarityId: rarityOf(matId) });
    blog(`${m.icon} ดรอป: ${m.name}`, 'win');
  }
  if (enemy.isBoss && Math.random() < BOSS_TUNING.malwareCoreChance) {
    addMaterial('malware_core');
    const m = MATERIALS.malware_core;
    showDropBanner({
      entry: m, fallback: m.icon, name: m.name,
      rarityId: rarityOf('malware_core'), sub: 'บอสดรอป',
    });
    blog(`${m.icon} บอสดรอป: ${m.name}!`, 'win');
  }
}

// Habit/Data-Sync card — low-rate drop named after whichever wild
// ANTIVIRUZ enemy (world zone, boss, or raid guard — anything with a
// habitColor/habitType fixed on its ANTIVIRUZ entry) landed the kill.
// An Arena opponent (built from a player SPECIES, not ANTIVIRUZ) has no
// such entry and never drops one. Lands in the same G.equipBag as
// regular gear — same slotId-keyed equip/unequip flow, see equipItem().
//
// Every card drops at the BASE tier (green) no matter where it fell.
// Climbing green → blue → purple is done exclusively through fusion
// (src/habit-fusion.js). Previously a card's rarity was derived from
// its lvlReq, which meant a deep-zone kill silently handed out a better
// card and left fusion with nothing to do.
export function rollHabitCard(enemy) {
  if (!enemy || Math.random() >= HABIT_CARD_DROP_CHANCE) return;
  const def = ANTIVIRUZ[enemy.speciesId];
  if (!def || !def.habitColor) return;
  // normalizeHabitCard fills in grade, the type-themed stat block, and
  // forces lvlReq to 1 so any card fits any pet.
  const item = normalizeHabitCard({
    uid: uid(), slotId: 'habit', sourceId: enemy.speciesId,
    name: `${def.name} Card`, color: def.habitColor, type: def.habitType,
    cardTier: BASE_CARD_TIER, cardPower: 1,
  });
  G.equipBag = G.equipBag || [];
  G.equipBag.push(item);
  const tier = cardTierMeta(item);
  showDropBanner({
    entry: item, fallback: '🎴', name: item.name,
    rarityId: tier.rarityId,
    sub: `${EQUIP_SLOTS.habit.name} · ${tier.icon} ${tier.name}`,
  });
  blog(`🎴 ดรอปการ์ด: ${item.name}`, 'win');
}

// Meat is the one cooking ingredient that can't be bought — hunting
// is the only source, same drop-per-kill shape as equipment above.
export function rollMeatDrop(enemy) {
  if (!enemy || Math.random() >= MEAT_DROP_CHANCE) return;
  G.ingredients = G.ingredients || { veg:0, bun:0, meat:0 };
  G.ingredients.meat = (G.ingredients.meat || 0) + 1;
  showDropBanner({
    entry: MEAT_ITEM, fallback: MEAT_ITEM.icon, name: MEAT_ITEM.name,
    rarityId: rarityOf(MEAT_ITEM), sub: 'วัตถุดิบ',
  });
  blog(`${MEAT_ITEM.icon} ดรอปวัตถุดิบ: ${MEAT_ITEM.name}`, 'win');
}

export function equipGradeMeta(item) { return EQUIP_GRADES[item.grade] || EQUIP_GRADES.script; }

// Equip `item` (from G.equipBag) onto `pet`'s slot. Whatever was
// there before goes back into the bag — nothing is ever destroyed by
// swapping.
export function equipItem(pet, item) {
  if (!pet || !item) return;
  pet.equip = pet.equip || { payload:null, exploit:null, rootkit:null, habit:null };
  const prev = pet.equip[item.slotId];
  G.equipBag = (G.equipBag || []).filter(x => x.uid !== item.uid);
  if (prev) G.equipBag.push(prev);
  pet.equip[item.slotId] = item;
  save();
}
export function unequipItem(pet, slotId) {
  if (!pet || !pet.equip) return;
  const item = pet.equip[slotId];
  if (!item) return;
  pet.equip[slotId] = null;
  G.equipBag = G.equipBag || [];
  G.equipBag.push(item);
  save();
}
// Locking an item is purely a guard against your OWN future taps —
// blocks the single sell/dust actions below and gets skipped by
// Sell All, so gear you actually care about can't be liquidated by an
// accidental tap or a careless bulk-sell. Fusion respects it too.
export function toggleEquipLock(item) {
  item.locked = !item.locked;
  save();
  toast(item.locked ? `🔒 ล็อก ${item.name}` : `🔓 ปลดล็อก ${item.name}`);
}
// Both return true/false so callers (the equipment detail modal) know
// whether to actually close/refresh, or leave the modal open on a
// blocked (locked) attempt so the toast explaining why is visible
// instead of just bouncing back to the grid.
export function sellEquip(item) {
  if (item.locked) { toast('ล็อกอยู่ — ปลดล็อกก่อนขาย'); return false; }
  G.equipBag = (G.equipBag || []).filter(x => x.uid !== item.uid);
  G.bitz += sellValueOf(item);
  save();
  toast(`💰 ขาย ${item.name} +${sellValueOf(item)} Bitz`);
  return true;
}
export function dustEquip(item) {
  if (item.locked) { toast('ล็อกอยู่ — ปลดล็อกก่อนสลาย'); return false; }
  G.equipBag = (G.equipBag || []).filter(x => x.uid !== item.uid);
  G.dust = (G.dust || 0) + dustValueOf(item);
  save();
  toast(`🧬 สลาย ${item.name} +${dustValueOf(item)} Dust`);
  return true;
}

// Bulk-sell button — off by default (G.sellAllIncludeRare falsy) only
// ever touches the lowest/"normal" grade (script), so it can't
// accidentally liquidate rare gear; the checkbox opts into selling
// every grade in the bag instead, and always asks to confirm first
// since that's the one destructive path here. Locked items are always
// skipped regardless of the grade filter.
//
// Habit cards are ALWAYS excluded: they now ride the same grade ladder
// as gear (trojan/polymorphic/zeroday by tier), so a "sell all grades"
// sweep would otherwise vaporise a fusion collection in one tap.
function sellAllEquip() {
  const bag = G.equipBag || [];
  const includeRare = !!G.sellAllIncludeRare;
  const sellable = bag.filter(x => x.slotId !== 'habit');
  const pool = includeRare ? sellable : sellable.filter(x => x.grade === EQUIP_GRADE_KEYS[0]);
  const targets = pool.filter(x => !x.locked);
  const lockedSkipped = pool.length - targets.length;
  if (!targets.length) { toast(lockedSkipped ? '🔒 ไอเทมทั้งหมดถูกล็อกไว้' : 'ไม่มีไอเทมให้ขาย'); return; }
  const total = targets.reduce((s, x) => s + sellValueOf(x), 0);
  const label = includeRare ? 'ทุกเกรด' : EQUIP_GRADES[EQUIP_GRADE_KEYS[0]].thai;
  const lockNote = lockedSkipped ? ` (ข้าม ${lockedSkipped} ชิ้นที่ล็อกไว้)` : '';
  if (!confirm(`ขายอุปกรณ์ ${targets.length} ชิ้น (${label}) รวม 💰${total} Bitz?${lockNote}`)) return;
  const uids = new Set(targets.map(x => x.uid));
  G.equipBag = bag.filter(x => !uids.has(x.uid));
  G.bitz += total;
  save();
  toast(`💰 ขาย ${targets.length} ชิ้น +${total} Bitz`);
  renderEquipBag();
}
function updateSellAllBtnLabel() {
  const btn = $('sellall-btn');
  if (!btn) return;
  btn.textContent = G.sellAllIncludeRare ? '💰 ขายทั้งหมด (ทุกเกรด)' : '💰 ขายทั้งหมด (เกรดต่ำสุด)';
}
export function wireEquipControls() {
  document.querySelectorAll('#eq-sort-row .chip-btn').forEach(btn => {
    btn.onclick = () => {
      G.equipSortMode = (G.equipSortMode === btn.dataset.sort) ? null : btn.dataset.sort;
      save();
      renderEquipBag();
    };
  });
  const toggle = $('sellall-rare-toggle');
  if (toggle) {
    toggle.checked = !!G.sellAllIncludeRare;
    toggle.onchange = () => { G.sellAllIncludeRare = toggle.checked; save(); updateSellAllBtnLabel(); };
  }
  const btn = $('sellall-btn');
  if (btn) btn.onclick = sellAllEquip;
  updateSellAllBtnLabel();
}
