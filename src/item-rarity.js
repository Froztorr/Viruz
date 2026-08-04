// ── ITEM RARITY ──
// Every inventory item gets a rarity tier so its box can be outlined
// and glowed in that tier's colour. Reuses the existing RARITY table
// (data.js) rather than inventing a second colour ladder, so an Epic
// dish reads the same purple as an Epic pet.
//
// EQUIP_GRADES already uses colours identical to RARITY (script =
// normal, trojan = rare, polymorphic = epic, zeroday = legendary,
// apt = mythic), so equipment slots into the same visual scale for
// free -- see GRADE_RARITY below.

import {
  CRAFT_RECIPES, EGGS, FOODS, INGREDIENTS, ITEMS, MATERIALS, MEAT_ITEM,
  POTIONS, RARITY, RECIPES, REVIVE_POTION, THROW_POISONS,
  THROW_UTILITY_POTIONS, TOYS,
} from './data.js';

export const GRADE_RARITY = {
  script: 'normal', trojan: 'rare', polymorphic: 'epic',
  zeroday: 'legendary', apt: 'mythic',
};

// ── COOKED FOOD ──
// Rarity is COMPUTED, never hand-assigned, so any recipe added to
// data.js later classifies itself with no edit here.
//
// Two things make a dish rare, exactly as they do in play:
//   1. how much loyalty it grants (its whole point), and
//   2. how hard it is to actually produce.
//
// Meat is weighted 3x a pantry item because it is deliberately NOT
// purchasable -- it only drops from hunting (MEAT_DROP_CHANCE 0.35),
// so every meat in a recipe means another trip into battle. Veggies
// and buns are pure Bitz and cost only a shop tap, hence 0.5.
const MEAT_WEIGHT = 3;
const PANTRY_WEIGHT = 0.5;

export function cookEffort(need) {
  if (!need) return 0;   // precooked shop food takes no effort at all
  return (need.meat || 0) * MEAT_WEIGHT +
    ((need.veg || 0) + (need.bun || 0)) * PANTRY_WEIGHT;
}

export function foodScore(f) {
  return (f.loyalty || 0) + cookEffort(f.need);
}

// Upper bound of each band; anything above the last one is mythic.
// Tuned against the real tables: shop food lands normal -> epic, every
// homemade recipe (which all beat the best shop food) lands epic and
// up, and only the two priciest meat dishes reach mythic.
const FOOD_BANDS = [
  [5,  'normal'],       // Data Crumbs 3
  [12, 'rare'],         // Byte Burger 7
  [32, 'epic'],         // Golden Cache 14, Quantum Feast 24, Taco 29, Sandwich 31.5
  [40, 'legendary'],    // Fried Rice 33, Meat Burger 37.5
];                      // Spaghetti 41, Hearty Stew 45.5 -> mythic

export function bandOf(score) {
  for (const [max, id] of FOOD_BANDS) if (score <= max) return id;
  return 'mythic';
}

// ── THE LOOKUP TABLE ──
const BY_ID = {};
function set(id, rarity) { if (id) BY_ID[id] = rarity; }
function setAll(list, rarity) { (list || []).forEach(x => set(x.id, rarity)); }

// Food + recipes: computed from loyalty and cooking effort.
[...FOODS, ...RECIPES].forEach(f => set(f.id, bandOf(foodScore(f))));

// Toys: permanent purchases, so price is the honest difficulty signal
// (400 / 1100 / 2400 / 4800 -> normal / rare / epic / legendary).
TOYS.forEach(t => {
  const c = t.cost || 0;
  set(t.id, c <= 500 ? 'normal' : c <= 1500 ? 'rare' : c <= 3000 ? 'epic' : 'legendary');
});

// Cooking stock: bought veg/bun are trivial, meat is drop-only.
setAll(INGREDIENTS, 'normal');
set(MEAT_ITEM.id, 'rare');

// Healing potions, by how much of the bar they restore.
set('pot_s', 'normal');    // 35%
set('pot_m', 'rare');      // 70%
set('pot_f', 'epic');      // full
set(REVIVE_POTION.id, 'legendary');   // 5000 Bitz, undoes a Down pet

// Throwables. Utility potions scale with price; every curse is a
// 5-turn hard disable, which is strong enough to sit at epic.
set('tp_mp', 'normal');
set('tp_cleanse', 'rare');
set('tp_spd', 'rare');
set('tp_crit', 'epic');
setAll(THROW_POISONS, 'epic');
setAll(THROW_UTILITY_POTIONS.filter(p => !BY_ID[p.id]), 'rare');

// Shop consumables.
set('hp_s', 'normal');
set('hp_l', 'rare');
set('hp_all', 'epic');
set('exp_b', 'epic');
set('evo_s', 'legendary');   // hands over a Malware Core
setAll(ITEMS.filter(i => !BY_ID[i.id]), 'normal');

// Evolution materials: code parts scale with enemy level, the core
// only drops from a region boss at 25%.
Object.keys(MATERIALS).forEach(id => set(id, 'epic'));
set('malware_core', 'legendary');

// Craft recipes, ranked by how far each one skews the grade roll.
set('quick', 'normal');
set('standard', 'rare');
set('deep', 'epic');

// Eggs, by the best rarity each can actually hatch.
set('egg_n', 'normal');
set('egg_r', 'rare');
set('egg_e', 'epic');
setAll(EGGS.filter(e => !BY_ID[e.id]), 'normal');

// Accepts an item object or a bare id. Unknown things read as normal
// rather than throwing, so a new item never breaks the grid.
export function rarityOf(entry) {
  if (!entry) return 'normal';
  const id = typeof entry === 'string' ? entry : entry.id;
  return BY_ID[id] || 'normal';
}
export function rarityOfGrade(gradeId) {
  return GRADE_RARITY[gradeId] || 'normal';
}
export function rarityMeta(rarityId) {
  return RARITY[rarityId] || RARITY.normal;
}

// Stamps the tier onto a box element. Kept as a helper so callers
// never have to know the CSS variable names.
export function applyItemRarity(box, rarityId) {
  if (!box || !rarityId) return box;
  const meta = rarityMeta(rarityId);
  box.dataset.rarity = rarityId;
  box.style.setProperty('--rarity-color', meta.color);
  box.style.setProperty('--rarity-glow', meta.glow);
  return box;
}

// Small coloured tier label for the item detail modal, so the border
// colours are self-explanatory instead of a code the player has to
// guess at.
export function rarityChipHtml(rarityId) {
  if (!rarityId) return '';
  const meta = rarityMeta(rarityId);
  return `<div class="rarity-chip-wrap"><span class="rarity-chip" style="color:${meta.color};border-color:${meta.color};box-shadow:0 0 8px ${meta.glow}">${meta.name}</span></div>`;
}

export function injectRarityCss() {
  if (document.getElementById('item-rarity-css')) return;
  const style = document.createElement('style');
  style.id = 'item-rarity-css';
  style.textContent = `
.inv-box[data-rarity]{
  border:2px solid var(--rarity-color,#9aa4b8) !important;
  box-shadow:0 0 7px var(--rarity-glow,transparent),
             inset 0 0 8px var(--rarity-glow,transparent) !important;
}
.inv-box[data-rarity="mythic"]{ border-width:2.5px !important; }
.inv-box[data-rarity="legendary"],
.inv-box[data-rarity="mythic"]{ animation:rarity-pulse 2.4s ease-in-out infinite; }
@keyframes rarity-pulse{
  0%,100%{ box-shadow:0 0 6px var(--rarity-glow,transparent),
                     inset 0 0 6px var(--rarity-glow,transparent); }
  50%    { box-shadow:0 0 15px var(--rarity-glow,transparent),
                     inset 0 0 11px var(--rarity-glow,transparent); }
}
@media (prefers-reduced-motion:reduce){
  .inv-box[data-rarity]{ animation:none !important; }
}
.rarity-chip-wrap{ text-align:center; margin-bottom:8px; }
.rarity-chip{
  display:inline-block; font-size:11px; letter-spacing:.08em;
  text-transform:uppercase; padding:2px 10px; border-radius:999px;
  border:1px solid currentColor;
}
`;
  document.head.appendChild(style);
}

injectRarityCss();
