// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { AILMENTS, ALL_EQUIP_SLOT_KEYS, ANTIVIRUZ, ART2_SPECIES, ATTR, ATTR_KEYS, BOSS_TUNING, CARE_CLEAN, CARE_COOLDOWN_MS, CODE_PART_IDS, CRAFT_RECIPES, DEFENSE_BOTS, EGGS, EQUIP_DROP_CHANCE, EQUIP_GRADES, EQUIP_GRADE_KEYS, EQUIP_SLOTS, EQUIP_SLOT_KEYS, FOODS, GUARD_TIERS, HABIT_CARD_DROP_CHANCE, HABIT_CARD_ICON, HABIT_COLORS, HABIT_COLOR_KEYS, HABIT_PASSIVE_ICON, HABIT_TYPES, HABIT_TYPE_KEYS, INGREDIENTS, ITEMS, LOYALTY_PER_WIN, LOYALTY_TIERS, MAPS, MAP_NODES, MATERIALS, MEAT_DROP_CHANCE, MEAT_ITEM, MUTATIONS, MUTATION_KEYS, PAYLOAD_EFFECTS, PAYLOAD_EFFECT_KEYS, POTIONS, RAID_LOSS_BITZ, RARITY, RARITY_KEYS, RECIPES, REVIVE_POTION, SIGNATURE_SKILLS, SKILL_TREES, SPECIALS, SPECIES, SPECIES_KEYS, STAT_KEYS, STAT_META, SYNERGY, THROW_POISONS, THROW_UTILITY_POTIONS, TOYS, TUNING, WHITE_TRAITS, ZONES, backfillEquipIcon, bossPoolForMap, buildLootMenu, chanceToEnemyMult, codePartDropChance, craftEquipment, dustValueOf, guardTierForLevel, loyaltyProgress, loyaltyTier, mutationWeightsFromParts, randomBossZone, rollEquipment, sellValueOf, treeFor, treeForMutation, zoneById, zonesOfMap } from './data.js';
import { DOWN_MS, INCUBATE_MS, addAilment, advanceSpeedCounter, availableSkills, buildHackPuzzle, buildHackRun, canCast, canEvolve, canTakeNode, checkHackGuess, clamp, clearAilments, combatStats, computeDamage, createPet, enterBossRage, equipmentBonuses, evolve, grantExp, habitOf, hasAilment, healTeam, loyaltyBuffs, markDown, maxMP, petState, powerOf, resolveRaid, restoreMP, reviveDownPet, rollEgg, signatureSkillOf, spawnAntiviruz, spawnBoss, spendMP, startIncubation, statsOf, supportOf, synergyOf, takeNode, teamAlive, teamPower, tickAilments, treeBonuses, turnOrder, uid, unlockedSpecials } from './engine.js';
import { NET } from './net.js';
import { creatureMarkupFor, gifURL } from './sprites.js';
import { wireEquipControls } from './battle/equipment.js';
import { wireThrowPouches } from './battle/extras.js';
import { wireCareGame } from './screens/care.js';
import { wireCharSlotDrag } from './screens/home-character.js';
import { wireInventoryTabs } from './screens/inventory.js';
import { wirePetDetail } from './screens/pet-detail.js';
import { feed, log, renderAll, showScreen, startDownStateTicker, startTopBarClock, toast, wireClickRipple, wireDayNightTheme, wireDoubleTapGuard, wireDrawer, wireGlobalUI, wireMainWindow } from './ui-shell.js';

// ═══════════════════════════════════════════════════════════
// VIRUZ PET — GAME
// State, screens, battle loop, DOM rendering.
// ═══════════════════════════════════════════════════════════


// Creatures come from either real GIF art or procedural SVG —
// creatureMarkupFor() picks per species, so both coexist.
export function creatureMarkup(pet, cls, anim = 'still') {
  // Enemies aren't in SPECIES, so fall back to the fields copied onto
  // the spawned unit. Must include ext/palette or PNG art resolves to
  // a .gif path and 404s.
  const sp = SPECIES[pet.speciesId] ||
    { shape: pet.shape, palette: pet.palette, gif: pet.gif, ext: pet.ext,
      faces: pet.faces, scale: pet.scale, name: pet.name };
  const attr = ATTR[pet.attr] || ATTR.red;
  return creatureMarkupFor(sp, attr, cls, anim, pet.stage, pet.mutation);
}

// ═══════════════ STATE ═══════════════
export let G = {
  uid: null,
  name: 'Hacker',
  started: false,
  bitz: 0,
  day: 1,
  wins: 0,
  raids: 0,
  roster: [],        // all owned pets
  teamIds: [],       // up to 3 uids — the active squad
  defenseIds: [],    // up to 3 uids stationed at base
  bots: [],          // purchased defense bots
  guardTier: 0,      // 0-4, owned AntiviruZ Security Package tier (GUARD_TIERS)
  inbox: [],
  raidHistory: [],
  potions: {},      // combat potions, bought at safe spots
  lastSafe: null,   // which safe zone the player last visited
  foods: {},        // consumable care food counts
  toys: [],         // permanently owned toy ids
  care: {},         // { petUid: { activityId: lastUsedTimestamp } }
  feed: [],         // persistent PROCESS activity records
  equipBag: [],     // owned, unequipped gear
  dust: 0,          // crafting currency from disenchanting gear
  careWaste: false, // ambient mess flag on the care screen's living area
  ingredients: { veg:0, bun:0, meat:0 }, // veg/bun bought at Food Shop, meat hunt-only
  materials: {},    // { malware_core: n, code_part_overclock: n, ... } — Tech Lab evolution
  bossState: {},    // { mapId: { alive, zoneId, defId, level, uid } } — wandering region bosses
};

export let battle = null;   // active battle state
// Setter for cross-module writes -- an imported `let` binding is
// read-only from outside its own module, so anything that needs to
// reassign `battle`/`battleSpeed` from another file goes through here.
export function setBattle(v) { battle = v; }
export let battleSpeed = 1;
export function setBattleSpeed(v) { battleSpeed = v; }

// ═══════════════ DOM HELPERS ═══════════════
export const $ = id => document.getElementById(id);

// Render an attribute's icon as a real image when one exists, falling
// back to the emoji otherwise. `size` in px.
export function attrIcon(a, size = 16) {
  if (a.iconImg) return `<img src="${a.iconImg}" class="attr-icon-img" style="width:${size}px;height:${size}px" alt="${a.name}">`;
  return `<span class="attr-icon-emoji">${a.icon}</span>`;
}

// Same idea as attrIcon(), but for the new Habit colors/types/card/
// passive icons (data.js): each entry's iconImg already points at the
// exact path its real PNG should land at (no file there yet). Renders
// an <img> with an onerror fallback to the emoji, so dropping the
// actual art in later just starts working with zero code changes, and
// until then it quietly shows the emoji instead of a broken image.
export function habitIcon(entry, size = 16) {
  if (!entry) return '';
  if (entry.iconImg) {
    const emoji = (entry.icon || '').replace(/"/g, '');
    return `<img src="${entry.iconImg}" class="habit-icon-img" style="width:${size}px;height:${size}px" alt="${entry.name || ''}" ` +
      `onerror="this.outerHTML='&lt;span class=&quot;habit-icon-emoji&quot;&gt;${emoji}&lt;/span&gt;'">`;
  }
  return `<span class="habit-icon-emoji">${entry.icon || ''}</span>`;
}
export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
export function setText(id, v) { const e = $(id); if (e) e.textContent = v; }

// ── HAPTICS ──
// navigator.vibrate is unsupported (desktop, iOS Safari) or user-denied
// often enough that every call site would need its own try/guard —
// centralized here instead. Pattern presets:
//   TAP    — light tick for any meaningful button/card press
//   SKILL  — one long buzz when the player's own pet casts a skill
//   DEATH  — a short double-buzz when a unit (either side) goes down
export const VIBE_TAP = 12;
export const VIBE_SKILL = 220;
export const VIBE_DEATH = [40, 60, 40];
export function vibrate(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

// ═══════════════ TEAM ACCESS ═══════════════
export function petById(id) { return G.roster.find(p => p.uid === id) || null; }
export function activeTeam() { return G.teamIds.map(petById).filter(Boolean); }
export function defenseTeam() { return G.defenseIds.map(petById).filter(Boolean); }

// ═══════════════ BOOT ═══════════════
export async function boot() {
  G.uid = await NET.init();
  const saved = await NET.getProfile();
  if (saved && saved.started) {
    G = { ...G, ...saved };
    // Migrate saves written by older builds. Fields like `sprite` and
    // `name` are DERIVED from SPECIES — they must never be trusted from
    // disk, because an older build may have written different values
    // (this caused every viruz to render the same sprite, and made
    // attack.gif resolve to the wrong path so attacks looked frozen).
    // Re-derive them from the current data tables on every load.
    // Species were renamed when creatures became procedural SVG.
    // Map retired ids onto their closest replacement so existing
    // saves keep their roster instead of being silently wiped.
    const LEGACY_SPECIES = {
      slimebyte:'blobyte', aquagolem:'clampr', flamegolem:'spikeling',
      darkbat:'echowing', stormwing:'jetsquid',
    };
    G.roster = (G.roster || []).map(p => {
      if (!p) return null;
      if (!SPECIES[p.speciesId] && LEGACY_SPECIES[p.speciesId]) {
        p.speciesId = LEGACY_SPECIES[p.speciesId];
        p.name = null;          // re-derive below
        p.base = null;          // re-derive below
        p.skills = null;        // re-derive below
      }
      return SPECIES[p.speciesId] ? p : null;
    }).filter(Boolean);
    G.roster.forEach(p => {
      const sp = SPECIES[p.speciesId];
      // Art source is authoritative from SPECIES — a species may use
      // either procedural SVG (`shape`) or real art (`gif`), and can
      // switch between them in a later build without breaking saves.
      if (typeof p.loyalty !== 'number') p.loyalty = 0;
      // New stat/skill system fields
      p.tree      = p.tree      || {};
      p.autoCast  = p.autoCast  || {};
      p.ailments  = [];
      p.spdCounter = 0;
      p.critGauge = 0;
      if (typeof p.growthPts !== 'number') {
        // Retro-grant one point per level already earned so existing
        // pets aren't stuck with an empty tree.
        p.growthPts = Math.max(0, (p.level || 1) - 1);
      }
      if (typeof p.mp !== 'number') p.mp = 0;
      p.equip = p.equip || { payload:null, exploit:null, rootkit:null, habit:null };
      if (!('habit' in p.equip)) p.equip.habit = null;   // pre-Habit-System saves
      ALL_EQUIP_SLOT_KEYS.forEach(sk => { if (p.equip[sk]) backfillEquipIcon(p.equip[sk]); });
      p.shape = sp.shape || null;
      p.gif   = sp.gif   || null;
      p.scale = sp.scale || 1;
      if (!p.name) p.name = sp.name;
      if (!ATTR[p.attr]) p.attr = 'red';    // guard against removed attrs
      if (!RARITY[p.rarity]) p.rarity = 'normal';
      p.stage = clamp(p.stage || 0, 0, 2);
      // Mirrors the uncap in evolve() (engine.js) — a mutated (stage 2)
      // pet's maxLv was being unconditionally reset from its rarity's
      // base cap on every load, silently undoing that uncap the very
      // next time the game booted.
      p.maxLv = p.stage === 2 ? 999 : RARITY[p.rarity].maxLv;
      if (!Array.isArray(p.skills) || !p.skills.length) {
        p.skills = sp.skills.map(s => ({ ...s }));
      }
      if (!p.base) p.base = { ...sp.base };
      if (!p.name) p.name = sp.name;
      if (p.mutation === undefined) p.mutation = null;
      const m = statsOf(p).mhp;
      if (typeof p.hp !== 'number' || p.hp > m) p.hp = m;
    });
    // Drop team/defense references to pets that no longer exist
    const ids = new Set(G.roster.map(p => p.uid));
    G.potions = G.potions || {};
    G.poisons = G.poisons || {};
    G.foods   = G.foods   || {};
    G.toys    = G.toys    || [];
    G.care    = G.care    || {};
    G.feed    = G.feed    || [];
    G.equipBag = G.equipBag || [];
    G.equipBag.forEach(backfillEquipIcon);
    G.dust     = G.dust     || 0;
    G.ingredients = G.ingredients || { veg:0, bun:0, meat:0 };
    G.materials = G.materials || {};
    G.bossState = G.bossState || {};
    G.teamIds    = (G.teamIds || []).filter(id => ids.has(id));
    G.defenseIds = (G.defenseIds || []).filter(id => ids.has(id));
    if (!G.teamIds.length && G.roster.length) G.teamIds = [G.roster[0].uid];
    // Bench: up to 2 reserve pets, swappable into the active team any
    // time — must not overlap the active team itself.
    G.benchIds = (G.benchIds || []).filter(id => ids.has(id) && !G.teamIds.includes(id)).slice(0, 2);
    // Resume where the player actually left off, not always the city.
    const resumeScreen = G.lastScreen && ['map','world','safe','home','clinic','shop','foodshop','care','raid'].includes(G.lastScreen)
      ? G.lastScreen : 'map';
    showScreen(resumeScreen);
    renderAll();
    save();
    log('โหลดข้อมูลสำเร็จ', 'sys');
  } else {
    showScreen('intro');
    buildStarterPicker();
  }
  wireGlobalUI();
  wireMainWindow();
  wireDrawer();
  wireCareGame();
  wirePetDetail();
  wireInventoryTabs();
  wireEquipControls();
  wireThrowPouches();
  wireCharSlotDrag();
  startTopBarClock();
  startDownStateTicker();
  wireClickRipple();
  wireDoubleTapGuard();
  wireDayNightTheme();
}

export async function save() {
  await NET.saveProfile({ ...G });
}

// ═══════════════ STARTER ═══════════════
let starterChoice = null;
function buildStarterPicker() {
  const wrap = $('starter-grid');
  wrap.innerHTML = '';
  // Offer three random normal-tier species
  const normals = SPECIES_KEYS.filter(k => SPECIES[k].rarities.includes('normal'));
  normals.forEach(sid => {
    const sp = SPECIES[sid];
    const card = el('div', 'starter-card');
    card.innerHTML = `
      ${creatureMarkupFor(sp, null, 'starter-sprite float')}
      <div class="starter-name">${sp.name}</div>
      <div class="starter-hint">ธาตุจะสุ่มตอนรับ</div>`;
    card.onclick = () => {
      document.querySelectorAll('.starter-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      starterChoice = sid;
      $('start-btn').disabled = false;
    };
    wrap.appendChild(card);
  });
}

export async function claimStarter() {
  if (!starterChoice) return;
  const name = ($('player-name').value || '').trim() || 'Hacker';
  const pet = createPet(starterChoice, 'normal');
  G.name = name;
  G.roster = [pet];
  G.teamIds = [pet.uid];
  G.bitz = TUNING.startBitz;
  G.started = true;
  await save();
  showScreen('map');
  renderAll();
  const a = ATTR[pet.attr];
  toast(`ได้รับ ${pet.name}\nธาตุ ${a.icon} ${a.name}`);
  log(`เริ่มต้นด้วย ${pet.name} [${a.name}] · ${TUNING.startBitz} Bitz`, 'win');
}

