// ═══════════════════════════════════════════════════════════
// VIRUZ PET — ICON MAP
// One place that says "this data entry is drawn by this PNG".
//
// data.js stays untouched: it keeps declaring emoji, and this module
// stamps `img`/`iconImg` onto those same exported objects at import
// time. Adding art is therefore a one-line edit here, not a hunt
// through fifteen tables.
//
// ATTR, HABIT_COLORS and HABIT_TYPES are deliberately absent — they
// already carry their own iconImg in data.js and habitIcon() already
// resolves them, so there is nothing to add.
//
// NOTHING here changes behaviour on its own. Every path below may or
// may not exist yet; iconHtml() renders the emoji whenever the file is
// missing or fails to load, so the game looks exactly the same until
// the art actually lands in assets/.
// ═══════════════════════════════════════════════════════════

import {
  AILMENTS,
  CARE_CLEAN,
  CRAFT_RECIPES,
  DEFENSE_BOTS,
  EGGS,
  EQUIP_SLOTS,
  FOODS,
  HACK_LOOT_KINDS,
  INGREDIENTS,
  ITEMS,
  LOYALTY_TIERS,
  MAP_NODES,
  MATERIALS,
  MEAT_ITEM,
  PAYLOAD_EFFECTS,
  RECIPES,
  REVIVE_POTION,
  STAT_META,
  TOYS,
  WHITE_TRAITS,
} from './data.js';

const ICONS = 'assets/icons';
const POTIONS_DIR = 'assets/potions';
const FX = 'assets/fx';
const UI = 'assets/ui';

// ── ID-KEYED TABLES ──
// Anything whose entries carry an `id`, whether it is stored as an
// array or an object, resolves through this single map.
export const ICON_BY_ID = {
  // Precooked food (FOODS)
  food_basic:   `${ICONS}/food_basic.png`,
  food_good:    `${ICONS}/food_good.png`,
  food_premium: `${ICONS}/food_premium.png`,
  food_feast:   `${ICONS}/food_feast.png`,

  // Cooking ingredients (INGREDIENTS + MEAT_ITEM)
  ing_veg:  `${ICONS}/ing_veg.png`,
  ing_bun:  `${ICONS}/ing_bun.png`,
  ing_meat: `${ICONS}/ing_meat.png`,

  // Homemade dishes (RECIPES)
  recipe_taco:      `${ICONS}/recipe_taco.png`,
  recipe_sandwich:  `${ICONS}/recipe_sandwich.png`,
  recipe_burger:    `${ICONS}/recipe_burger.png`,
  recipe_friedrice: `${ICONS}/recipe_friedrice.png`,
  recipe_spaghetti: `${ICONS}/recipe_spaghetti.png`,
  recipe_stew:      `${ICONS}/recipe_stew.png`,

  // Toys + cleaning (TOYS, CARE_CLEAN)
  toy_ball:   `${ICONS}/toy_ball.png`,
  toy_laser:  `${ICONS}/toy_laser.png`,
  toy_puzzle: `${ICONS}/toy_puzzle.png`,
  toy_arcade: `${ICONS}/toy_arcade.png`,
  clean:      `${ICONS}/care_clean.png`,

  // Shop consumables (ITEMS)
  hp_s:   `${ICONS}/hp_s.png`,
  hp_l:   `${ICONS}/hp_l.png`,
  hp_all: `${ICONS}/hp_all.png`,
  exp_b:  `${ICONS}/exp_b.png`,
  evo_s:  `${ICONS}/evo_s.png`,

  // Eggs (EGGS)
  egg_n: `${ICONS}/egg_n.png`,
  egg_r: `${ICONS}/egg_r.png`,
  egg_e: `${ICONS}/egg_e.png`,

  // Evolution materials (MATERIALS)
  malware_core:        `${ICONS}/malware_core.png`,
  code_part_overclock: `${ICONS}/code_part_overclock.png`,
  code_part_bulwark:   `${ICONS}/code_part_bulwark.png`,
  code_part_phantom:   `${ICONS}/code_part_phantom.png`,
  code_part_corrupted: `${ICONS}/code_part_corrupted.png`,

  // Revive potion — sold at the Tech Shop, not a safe-spot potion, so
  // it lives outside POTIONS and never got an img field.
  revive_potion: `${POTIONS_DIR}/revive.png`,

  // Loyalty tiers (LOYALTY_TIERS)
  stranger: `${ICONS}/loyalty_stranger.png`,
  friendly: `${ICONS}/loyalty_friendly.png`,
  trusted:  `${ICONS}/loyalty_trusted.png`,
  loyal:    `${ICONS}/loyalty_loyal.png`,

  // White support traits (WHITE_TRAITS)
  aura:  `${ICONS}/trait_aura.png`,
  regen: `${ICONS}/trait_regen.png`,
  both:  `${ICONS}/trait_both.png`,

  // Crafting recipes (CRAFT_RECIPES)
  quick:    `${ICONS}/craft_quick.png`,
  standard: `${ICONS}/craft_standard.png`,
  deep:     `${ICONS}/craft_deep.png`,

  // Base defense bots (DEFENSE_BOTS)
  bot_lite: `${ICONS}/bot_turret.png`,
  bot_mid:  `${ICONS}/bot_guard.png`,
  bot_max:  `${ICONS}/bot_fortress.png`,

  // Raid loot menu (HACK_LOOT_KINDS)
  // The small and large bitz drops finally look different from each
  // other: bitz_l gets the fuller pile.
  bitz_s:    `${UI}/bitz.png`,
  bitz_l:    `${UI}/bitz_large.png`,
  pot_hp:    `${POTIONS_DIR}/pot_m.png`,
  pot_full:  `${POTIONS_DIR}/pot_f.png`,
  exp_boost: `${ICONS}/exp_b.png`,
};

// ── AILMENTS ──
// Keyed by ailment id, kept separate because these live in assets/fx
// alongside the battle effects rather than in assets/icons.
// ailment_stoned.png also supersedes the assets/fx/stoned.gif
// placeholder the .stoned-overlay CSS rule still points at.
export const AILMENT_ICONS = {
  poison:    `${FX}/ailment_poison.png`,
  freeze:    `${FX}/ailment_freeze.png`,
  frenzy:    `${FX}/ailment_frenzy.png`,
  charm:     `${FX}/ailment_charm.png`,
  corrupt:   `${FX}/ailment_corrupt.png`,
  stoned:    `${FX}/ailment_stoned.png`,
  lastStand: `${FX}/ailment_laststand.png`,
};

// ── STATS ──
// STAT_META entries have no `id` field (the object key IS the id), so
// they get their own map. Note stat_atk/stat_def/stat_spd are the
// STAT sheet art and are deliberately different files from the
// same-named ATTR icons (atk.png / def.png / spd.png).
export const STAT_ICONS = {
  atk:  `${ICONS}/stat_atk.png`,
  def:  `${ICONS}/stat_def.png`,
  crit: `${ICONS}/stat_crit.png`,
  eva:  `${ICONS}/stat_eva.png`,
  spd:  `${ICONS}/stat_spd.png`,
  int:  `${ICONS}/stat_int.png`,
  vit:  `${ICONS}/stat_vit.png`,
};

// ── EQUIP SLOTS ──
// habit already resolves through HABIT_CARD_ICON in data.js, so it is
// not repeated here.
export const SLOT_ICONS = {
  payload: `${ICONS}/slot_payload.png`,
  exploit: `${ICONS}/slot_exploit.png`,
  rootkit: `${ICONS}/slot_rootkit.png`,
};

// ── PAYLOAD EFFECTS ──
// These are the effect badges shown next to a Payload item's own
// generated equipment art (EQUIP_ICONS in data.js), not a replacement
// for it.
export const PAYLOAD_ICONS = {
  leech:     `${ICONS}/payload_leech.png`,
  manaregen: `${ICONS}/payload_manaregen.png`,
  overclock: `${ICONS}/payload_overclock.png`,
  adaptive:  `${ICONS}/payload_adaptive.png`,
  toxin:     `${ICONS}/payload_toxin.png`,
};

// ── CITY MAP LANDMARKS ──
// MAP_NODES entries render as labelled hotspots over the city art;
// these are the little building badges.
export const MAP_NODE_ICONS = {
  warp_gate: `${UI}/warp.png`,
  clinic:    `${UI}/nav_clinic.png`,
  apartment: `${UI}/nav_home.png`,
  hacking:   `${UI}/nav_raid.png`,
  tech_shop: `${UI}/nav_shop.png`,
  food_shop: `${UI}/nav_foodshop.png`,
};

// ── SHARED UI CHROME ──
// Interface art with no data.js entry at all. Exported for renderers
// to reference directly instead of hardcoding paths at call sites.
export const UI_ICONS = {
  bitz:          `${UI}/bitz.png`,
  bitzLarge:     `${UI}/bitz_large.png`,
  menu:          `${UI}/menu.png`,
  close:         `${UI}/close.png`,
  closeLight:    `${UI}/close_light.png`,
  check:         `${UI}/check.png`,
  warning:       `${UI}/warning.png`,
  success:       `${UI}/success.png`,
  failure:       `${UI}/failure.png`,
  hit:           `${UI}/hit.png`,
  miss:          `${UI}/miss.png`,
  heart:         `${UI}/heart.png`,
  star:          `${UI}/star.png`,
  reward:        `${UI}/reward.png`,
  flee:          `${UI}/flee.png`,
  play:          `${UI}/play.png`,
  chevronLeft:   `${UI}/chevron_left.png`,
  chevronRight:  `${UI}/chevron_right.png`,
  levelUp:       `${UI}/level_up.png`,
  rankUp:        `${UI}/rank_up.png`,
  rankDown:      `${UI}/rank_down.png`,
  sync:          `${UI}/sync.png`,
  refresh:       `${UI}/refresh.png`,
  add:           `${UI}/add.png`,
  remove:        `${UI}/remove.png`,
  trash:         `${UI}/trash.png`,
  hourglass:     `${UI}/hourglass.png`,
  capsule:       `${UI}/capsule.png`,
  lockLocked:    `${UI}/lock_locked.png`,
  lockUnlocked:  `${UI}/lock_unlocked.png`,
  settings:      `${UI}/settings.png`,
  skilltree:     `${UI}/skilltree.png`,
  hudPlayer:     `${UI}/hud_player.png`,
  navCity:       `${UI}/nav_city.png`,
  navWorld:      `${UI}/nav_world.png`,
  navInventory:  `${UI}/nav_inventory.png`,
  navFoodshop:   `${UI}/nav_foodshop.png`,
};

// ── APPLY ──
// Writes `img` and `iconImg` onto the data objects themselves. Both
// keys are set because the existing renderers disagree: potionIconHtml()
// reads `img`, habitIcon() reads `iconImg`. Setting both means either
// convention works and no existing call site has to change.
//
// Never overwrites a path already declared in data.js — POTIONS,
// THROW_UTILITY_POTIONS and THROW_POISONS already have `img`, and the
// three habit/attribute tables already have `iconImg`.
function stamp(entry, path) {
  if (!entry || !path) return;
  if (!entry.img) entry.img = path;
  if (!entry.iconImg) entry.iconImg = path;
}

// Tables whose entries carry their own `id`, looked up in ICON_BY_ID.
function stampById(table) {
  for (const entry of Object.values(table || {})) stamp(entry, ICON_BY_ID[entry?.id]);
}

// Tables keyed by the object key rather than an inner `id`.
function stampByKey(table, map) {
  for (const [key, entry] of Object.entries(table || {})) stamp(entry, map[key]);
}

export function applyIconPaths() {
  // Arrays and objects both work — Object.values() flattens either.
  [FOODS, INGREDIENTS, RECIPES, TOYS, ITEMS, EGGS, MATERIALS,
   LOYALTY_TIERS, WHITE_TRAITS, CRAFT_RECIPES, DEFENSE_BOTS,
   HACK_LOOT_KINDS].forEach(stampById);

  // Singletons.
  stamp(MEAT_ITEM, ICON_BY_ID[MEAT_ITEM.id]);
  stamp(CARE_CLEAN, ICON_BY_ID[CARE_CLEAN.id]);
  stamp(REVIVE_POTION, ICON_BY_ID[REVIVE_POTION.id]);

  // Key-addressed tables.
  stampByKey(AILMENTS, AILMENT_ICONS);
  stampByKey(STAT_META, STAT_ICONS);
  stampByKey(EQUIP_SLOTS, SLOT_ICONS);
  stampByKey(PAYLOAD_EFFECTS, PAYLOAD_ICONS);

  // MAP_NODES is an array keyed by its own id.
  for (const node of MAP_NODES) stamp(node, MAP_NODE_ICONS[node.id]);
}

// Run on import. main.js imports this module before boot().
applyIconPaths();

// ── RENDER HELPER ──
// Drop-in replacement for writing `${entry.icon}` straight into a
// template string. Renders the PNG when there is one and silently
// falls back to the emoji if the file 404s, which is what makes it
// safe to merge this before any art is committed.
//
//   `<span>${iconHtml(food)} ${food.name}</span>`
//
export function iconHtml(entry, opts = {}) {
  if (!entry) return '';
  const { cls = '', size = null, alt = entry.name || '' } = opts;
  const emoji = entry.icon || '';
  const path = entry.img || entry.iconImg;
  if (!path) return emoji;
  const style = size ? ` style="width:${size};height:${size}"` : '';
  const esc = String(emoji).replace(/'/g, "\\'");
  return `<img src="${path}" alt="${alt}" class="data-icon ${cls}"${style}`
    + ` onerror="this.outerHTML='${esc}'">`;
}

// Same fallback logic, for callers that need the resolved path rather
// than markup (CSS background-image, canvas draws, preloading).
export function iconPath(entry) {
  return (entry && (entry.img || entry.iconImg)) || null;
}

// ── BITZ COINS ──
// Two coin pictures exist: a small stack and a fuller pile. Which one
// is shown depends on the amount being displayed, so a 300 bitz reward
// reads as pocket change and a 1000 bitz one reads as a haul.
//
// The threshold is exported rather than inlined so a balance readout,
// a loot drop and a shop price can never disagree about where "a lot"
// starts.
export const BITZ_LARGE_THRESHOLD = 1000;

// Path only — for background-image, canvas, or an existing <img> whose
// src you want to swap in place.
export function bitzIcon(amount) {
  return Number(amount) >= BITZ_LARGE_THRESHOLD
    ? UI_ICONS.bitzLarge
    : UI_ICONS.bitz;
}

// Ready-made markup, sized like every other .data-icon. Falls back to
// the money emoji if the art is missing, matching iconHtml().
//
//   `${bitzIconHtml(reward)} ${reward}`
//
export function bitzIconHtml(amount, opts = {}) {
  const { cls = '', size = null, alt = 'bitz' } = opts;
  const style = size ? ` style="width:${size};height:${size}"` : '';
  return `<img src="${bitzIcon(amount)}" alt="${alt}" class="data-icon ${cls}"${style}`
    + ` onerror="this.outerHTML='\u{1F4B0}'">`;
}
