// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { ANTIVIRUZ, ATTR, CODE_PART_IDS, DEFENSE_BOTS, EGGS, FOODS, GUARD_TIERS, INGREDIENTS, ITEMS, MATERIALS, MUTATIONS, RARITY, RARITY_KEYS, RECIPES, REVIVE_POTION, STAT_META, THROW_POISONS, WHITE_TRAITS, loyaltyProgress, loyaltyTier, mutationWeightsFromParts } from '../data.js';
import { canEvolve, canSynchronize, clamp, evolve, grantExp, healTeam, petState, reviveDownPet, rollEgg, signatureSkillOf, startIncubation, statsOf, synchronizePets, uid } from '../engine.js';
import { creatureMarkupFor } from '../sprites.js';
import { startRaidFight } from '../battle/encounters.js';
import { addMaterial, rollMeatDrop } from '../battle/equipment.js';
import { throwItemAvailable, wait } from '../battle/extras.js';
import { renderDefensePanel, renderCharacter, renderHome } from './home-character.js';
import { potionIconHtml } from './pet-detail.js';
import { $, G, activeTeam, attrIcon, battle, creatureMarkup, el, save } from '../state.js';
import { closeModal, log, modal, petCard, renderHUD, toast } from '../ui-shell.js';

// ═══════════════ SCREEN: CLINIC ═══════════════
// mm:ss, or h:mm:ss once it's over an hour (the incubation chamber).
export function fmtCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : m;
  return (h > 0 ? `${h}:${mm}:` : `${mm}:`) + String(s).padStart(2, '0');
}
function errorIncubateCost(pet) { return 200 + pet.level * 15; }

export function renderClinic() {
  // Healing — includes the Down/Error/incubation-chamber flow. A Down
  // pet (still inside its 5-min window) heals the same as any other
  // hurt-but-conscious one; Error can't be fixed with a normal heal at
  // all — it needs the incubation chamber, a real hour, paid up front.
  const heal = $('clinic-heal');
  heal.innerHTML = '';
  G.roster.forEach(pet => {
    const s = statsOf(pet);
    const state = petState(pet);

    if (state === 'incubating') {
      const row = el('div', 'clinic-row incubating');
      row.innerHTML = `
        ${creatureMarkup(pet, 'cr-sprite')}
        <div class="cr-info"><b>${pet.name}</b><span>🧊 อยู่ในห้องบ่ม — เหลือ ${fmtCountdown(pet.incubatingUntil - Date.now())}</span></div>
        <button class="btn small" disabled>กำลังบ่ม</button>`;
      heal.appendChild(row);
      return;
    }
    if (state === 'ready') {
      const row = el('div', 'clinic-row ready');
      row.innerHTML = `
        ${creatureMarkup(pet, 'cr-sprite')}
        <div class="cr-info"><b>${pet.name}</b><span>✅ บ่มเสร็จแล้ว — พร้อมนำกลับมาใช้</span></div>
        <button class="btn small primary">รับคืน</button>`;
      row.querySelector('button').onclick = () => {
        reviveDownPet(pet);
        save(); renderClinic(); renderHUD();
        toast(`${pet.name} ฟื้นคืนชีพแล้ว!`);
        log(`✨ ${pet.name} ฟื้นจากห้องบ่ม`, 'heal');
      };
      heal.appendChild(row);
      return;
    }
    if (state === 'error') {
      const cost = errorIncubateCost(pet);
      const row = el('div', 'clinic-row error');
      row.innerHTML = `
        ${creatureMarkup(pet, 'cr-sprite')}
        <div class="cr-info"><b>${pet.name}</b><span>⚠️ Error — ต้องเข้าห้องบ่ม 1 ชม.</span></div>
        <button class="btn small danger">${cost} Bitz</button>`;
      row.querySelector('button').onclick = () => {
        if (G.bitz < cost) { toast('Bitz ไม่พอ'); return; }
        G.bitz -= cost;
        startIncubation(pet);
        save(); renderClinic(); renderHUD();
        toast(`${pet.name} เข้าห้องบ่ม — ใช้เวลา 1 ชั่วโมง`);
        log(`🧊 ${pet.name} เข้าห้องบ่ม`, 'sys');
      };
      heal.appendChild(row);
      return;
    }
    if (pet.hp >= s.mhp) return;
    const cost = Math.max(30, Math.floor((s.mhp - pet.hp) * 1.2));
    const row = el('div', 'clinic-row' + (state === 'down' ? ' down' : ''));
    row.innerHTML = `
      ${creatureMarkup(pet, 'cr-sprite')}
      <div class="cr-info">
        <b>${pet.name}</b>
        <span>${pet.hp}/${s.mhp} HP${state === 'down' ? ` · ⬇ Down เหลือ ${fmtCountdown(pet.downUntil - Date.now())}` : ''}</span>
      </div>
      <button class="btn small">${cost} Bitz</button>`;
    row.querySelector('button').onclick = () => {
      if (G.bitz < cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= cost;
      reviveDownPet(pet);
      save(); renderClinic(); renderHUD();
      log(`รักษา ${pet.name} เต็ม HP`, 'heal');
    };
    heal.appendChild(row);
  });
  if (!heal.children.length) {
    heal.appendChild(el('div','muted','ทุกตัวสุขภาพเต็มแล้ว ✓'));
  }
  const fixableHere = p => !['error', 'incubating', 'ready'].includes(petState(p));
  const healAllCost = G.roster.reduce((sum,p) => {
    if (!fixableHere(p)) return sum;
    const s = statsOf(p);
    return sum + Math.max(0, Math.floor((s.mhp - p.hp) * 1.0));
  }, 0);
  const ha = $('heal-all-btn');
  ha.textContent = healAllCost > 0 ? `รักษาทั้งหมด — ${healAllCost} Bitz` : 'ทุกตัวเต็มแล้ว';
  ha.disabled = healAllCost <= 0;
  ha.onclick = () => {
    if (G.bitz < healAllCost) { toast('Bitz ไม่พอ'); return; }
    G.bitz -= healAllCost;
    G.roster.forEach(p => { if (fixableHere(p)) reviveDownPet(p); });
    save(); renderClinic(); renderHUD();
    log('รักษาทีมทั้งหมด', 'heal');
  };

  // Eggs
  const eggs = $('clinic-eggs');
  eggs.innerHTML = '';
  EGGS.forEach(egg => {
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${egg.icon}</div>
      <div class="sc-name">${egg.name}</div>
      <div class="sc-desc">${egg.desc}</div>
      <div class="sc-cost">${egg.cost.toLocaleString()} Bitz</div>
      <button class="btn">ฟัก</button>`;
    card.querySelector('button').onclick = () => hatchEgg(egg);
    eggs.appendChild(card);
  });
}

function hatchEgg(egg) {
  if (G.bitz < egg.cost) { toast('Bitz ไม่พอ'); return; }
  G.bitz -= egg.cost;
  const pet = rollEgg(egg);
  G.roster.push(pet);
  if (G.teamIds.length < 3) G.teamIds.push(pet.uid);
  save();
  const a = ATTR[pet.attr], r = RARITY[pet.rarity];
  hatchReveal(pet);
  log(`ฟัก ${egg.name} → ${pet.name} [${r.name}·${a.name}]`, 'win');
  renderClinic(); renderHUD();
}

function hatchReveal(pet) {
  const a = ATTR[pet.attr], r = RARITY[pet.rarity];
  const trait = pet.whiteTrait ? WHITE_TRAITS[pet.whiteTrait] : null;
  const expPct = Math.min(100, Math.round((pet.exp / Math.max(1, pet.expNeed)) * 100));
  const tier = loyaltyTier(pet.loyalty);
  const loyProg = loyaltyProgress(pet.loyalty);
  const sig = signatureSkillOf(pet);
  modal('🥚 ฟักสำเร็จ!', wrap => {
    const box = el('div','reveal');
    box.style.setProperty('--attr', a.color);
    box.style.setProperty('--rar', r.color);
    box.innerHTML = `
      ${creatureMarkup(pet, 'reveal-sprite float')}
      <div class="reveal-name">${pet.name}</div>
      <div class="reveal-rar">${r.name}</div>
      <div class="reveal-attr">${attrIcon(a, 18)} ${a.name} — ${a.desc}</div>
      ${trait ? `<div class="reveal-trait">${trait.icon} ${trait.name} — ${trait.desc}</div>` : ''}`;
    wrap.appendChild(box);
  });
}

// ═══════════════ SCREEN: SHOP ═══════════════
export function renderShop() {
  const items = $('shop-items');
  items.innerHTML = '';
  ITEMS.forEach(it => {
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${it.icon}</div>
      <div class="sc-name">${it.name}</div>
      <div class="sc-desc">${it.desc}</div>
      <div class="sc-cost">${it.cost.toLocaleString()} Bitz</div>
      <button class="btn">ซื้อ</button>`;
    card.querySelector('button').onclick = () => buyItem(it);
    items.appendChild(card);
  });

  // Revive Potion — bought here for Bitz like anything else in this
  // shop, but stored in the Potions bag instead of applied instantly,
  // since it's meant to be kept in reserve and used later (from the
  // Inventory tab) on whichever pet actually goes Down.
  const revive = $('shop-revive');
  if (revive) {
    revive.innerHTML = '';
    const owned = (G.potions && G.potions[REVIVE_POTION.id]) || 0;
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${REVIVE_POTION.icon}</div>
      <div class="sc-name">${REVIVE_POTION.name}</div>
      <div class="sc-desc">${REVIVE_POTION.desc}</div>
      <div class="sc-cost">${REVIVE_POTION.cost.toLocaleString()} Bitz</div>
      <div class="sc-owned">มี ${owned} ชิ้น</div>
      <button class="btn">ซื้อ</button>`;
    card.querySelector('button').onclick = () => {
      if (G.bitz < REVIVE_POTION.cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= REVIVE_POTION.cost;
      G.potions = G.potions || {};
      G.potions[REVIVE_POTION.id] = (G.potions[REVIVE_POTION.id] || 0) + 1;
      save(); renderShop(); renderHUD();
      toast(`ซื้อ ${REVIVE_POTION.name} แล้ว — ใช้ได้จากกระเป๋าไอเทม`);
    };
    revive.appendChild(card);
  }

  // Poison curses — kept in their own G.poisons bag (separate from
  // G.potions), same buy-then-stock model, feeding the poison pouch's
  // battle wheel (see throwItemAvailable() in the battle section).
  const poisons = $('shop-poisons');
  if (poisons) {
    poisons.innerHTML = '';
    THROW_POISONS.forEach(px => {
      const owned = (G.poisons && G.poisons[px.id]) || 0;
      const card = el('div', 'shop-card');
      card.innerHTML = `
        <div class="sc-icon">${potionIconHtml(px)}</div>
        <div class="sc-name">${px.name}</div>
        <div class="sc-desc">${px.desc}</div>
        <div class="sc-cost">${px.cost.toLocaleString()} Bitz</div>
        <div class="sc-owned">มี ${owned} ชิ้น</div>
        <button class="btn">ซื้อ</button>`;
      card.querySelector('button').onclick = () => {
        if (G.bitz < px.cost) { toast('Bitz ไม่พอ'); return; }
        G.bitz -= px.cost;
        G.poisons = G.poisons || {};
        G.poisons[px.id] = (G.poisons[px.id] || 0) + 1;
        save(); renderShop(); renderHUD();
      };
      poisons.appendChild(card);
    });
  }

  const bots = $('shop-bots');
  bots.innerHTML = '';
  DEFENSE_BOTS.forEach(b => {
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${b.icon}</div>
      <div class="sc-name">${b.name}</div>
      <div class="sc-desc">${b.desc}<br>ATK ${b.power.atk} · DEF ${b.power.def}</div>
      <div class="sc-cost">${b.cost.toLocaleString()} Bitz</div>
      <button class="btn">ซื้อ</button>`;
    card.querySelector('button').onclick = () => {
      if (G.bitz < b.cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= b.cost;
      G.bots.push({ id: b.id, t: Date.now() });
      save(); renderShop(); renderHUD();
      log(`ซื้อ ${b.name} ป้องกันฐาน`, 'win');
      toast(`${b.icon} ${b.name} เข้าประจำการแล้ว`);
    };
    bots.appendChild(card);
  });

  renderGuardShop();
  renderTechLab();
  renderSynchronize();
}

// ── ANTIVIRUZ SECURITY PACKAGES ──
// 4-tier home-defense guard, gated by player level (GUARD_TIERS in
// data.js). Sequential upgrade path: buying tier N requires already
// owning tier N-1 (or being at tier 0 for tier 1), costs Bitz, and
// replaces the equipped tier — there's no reason to keep a lower one
// once a higher one is owned. The equipped tier (G.guardTier) is also
// what a rival's own hired guard is compared against thematically;
// the actual guard a raider FIGHTS is the rival's own tier (see
// startRaidFight), not the player's.
function renderGuardShop() {
  const wrap = $('shop-guards');
  if (!wrap) return;
  wrap.innerHTML = '';
  const myLv = Math.max(1, ...activeTeam().map(p => p.level), 1);
  GUARD_TIERS.forEach(g => {
    const def = ANTIVIRUZ[g.defId];
    const owned = G.guardTier === g.tier;
    const locked = myLv < g.minLevel;
    const needsPrev = g.tier > 1 && G.guardTier < g.tier - 1;
    const card = el('div', 'shop-card guard-card' + (owned ? ' owned' : ''));
    card.innerHTML = `
      <div class="sc-icon guard-icon">${creatureMarkupFor(def, ATTR.red, 'guard-icon-sprite')}</div>
      <div class="sc-name">${g.name}</div>
      <div class="sc-desc">${def.name} · ATK ${def.base.atk} · DEF ${def.base.def}<br>ต้องเลเวล ${g.minLevel}+</div>
      <div class="sc-cost">${g.cost.toLocaleString()} Bitz</div>
      <button class="btn" ${owned ? 'disabled' : ''}>${owned ? 'ประจำการอยู่' : locked ? `ปลดล็อก Lv.${g.minLevel}` : needsPrev ? 'ต้องซื้อระดับก่อนหน้า' : 'ซื้อ'}</button>`;
    const btn = card.querySelector('button');
    if (!owned && !locked && !needsPrev) {
      btn.onclick = () => {
        if (G.bitz < g.cost) { toast('Bitz ไม่พอ'); return; }
        G.bitz -= g.cost;
        G.guardTier = g.tier;
        save(); renderGuardShop(); renderHUD(); renderDefensePanel();
        log(`ซื้อ ${g.name} ป้องกันฐาน`, 'win');
        toast(`🛡️ ${g.name} เข้าประจำการแล้ว`);
      };
    } else {
      btn.disabled = true;
    }
    wrap.appendChild(card);
  });
}

function buyItem(it) {
  if (G.bitz < it.cost) { toast('Bitz ไม่พอ'); return; }
  const team = activeTeam();
  if (it.type === 'hpall') {
    G.bitz -= it.cost;
    healTeam(G.roster, it.val);
    log(`ใช้ ${it.name} — ฟื้น HP ทีม`, 'heal');
    save(); renderShop(); renderHUD();
    return;
  }
  // Target-selecting items
  modal('เลือกเป้าหมาย', wrap => {
    const grid = el('div','modal-grid');
    G.roster.forEach(p => {
      const c = petCard(p, { onClick: pet => {
        G.bitz -= it.cost;
        applyItem(it, pet);
        save(); closeModal(); renderShop(); renderHUD();
      }});
      grid.appendChild(c);
    });
    wrap.appendChild(grid);
  });
}

// ── FOOD SHOP ──
// Precooked foods (bought here, same items the care screen used to
// sell inline) and cooking ingredients (veg/bun — meat is hunt-only,
// see rollMeatDrop, and is never sold here).
export function renderFoodShop() {
  const pre = $('foodshop-precooked');
  if (pre) {
    pre.innerHTML = '';
    FOODS.forEach(f => {
      const owned = (G.foods && G.foods[f.id]) || 0;
      const card = el('div','shop-card');
      card.innerHTML = `
        <div class="sc-icon">${f.icon}</div>
        <div class="sc-name">${f.name}</div>
        <div class="sc-desc">${f.desc}</div>
        ${owned ? `<div class="sc-owned">มี ${owned} ชิ้น</div>` : ''}
        <div class="sc-cost">${f.cost.toLocaleString()} Bitz</div>
        <button class="btn">ซื้อ</button>`;
      card.querySelector('button').onclick = () => buyFood(f);
      pre.appendChild(card);
    });
  }
  const ingBox = $('foodshop-ingredients');
  if (ingBox) {
    ingBox.innerHTML = '';
    INGREDIENTS.forEach(i => {
      const key = i.id.replace('ing_','');
      const owned = (G.ingredients && G.ingredients[key]) || 0;
      const card = el('div','shop-card');
      card.innerHTML = `
        <div class="sc-icon">${i.icon}</div>
        <div class="sc-name">${i.name}</div>
        <div class="sc-desc">${i.desc}</div>
        <div class="sc-owned">มี ${owned} ชิ้น</div>
        <div class="sc-cost">${i.cost.toLocaleString()} Bitz</div>
        <button class="btn">ซื้อ</button>`;
      card.querySelector('button').onclick = () => buyIngredient(i);
      ingBox.appendChild(card);
    });
  }
}
function buyFood(f) {
  if (G.bitz < f.cost) { toast('Bitz ไม่พอ'); return; }
  G.bitz -= f.cost;
  G.foods = G.foods || {};
  G.foods[f.id] = (G.foods[f.id] || 0) + 1;
  save(); renderFoodShop(); renderHUD();
  toast(`✅ ซื้อ ${f.name} แล้ว`);
}
function buyIngredient(i) {
  if (G.bitz < i.cost) { toast('Bitz ไม่พอ'); return; }
  G.bitz -= i.cost;
  const key = i.id.replace('ing_','');
  G.ingredients = G.ingredients || { veg:0, bun:0, meat:0 };
  G.ingredients[key] = (G.ingredients[key] || 0) + 1;
  save(); renderFoodShop(); renderHUD();
  toast(`✅ ซื้อ ${i.name} แล้ว`);
}

// ── HOMEMADE COOKING (accessed from ฐานของคุณ) ──
export function openCookingMenu() {
  modal('👨‍🍳 ทำอาหารโฮมเมด', body => {
    const inv = G.ingredients || { veg:0, bun:0, meat:0 };
    const hint = el('div', 'muted',
      `วัตถุดิบที่มี: 🥬${inv.veg||0} 🍞${inv.bun||0} 🥩${inv.meat||0}`);
    hint.style.cssText = 'text-align:center;margin-bottom:10px;font-size:16px';
    body.appendChild(hint);

    const list = el('div', 'eq-picker-list');
    RECIPES.forEach(r => {
      const canCook = (r.need.veg||0) <= (inv.veg||0)
        && (r.need.bun||0) <= (inv.bun||0)
        && (r.need.meat||0) <= (inv.meat||0);
      const needParts = [];
      if (r.need.veg)  needParts.push(`🥬${r.need.veg}`);
      if (r.need.bun)  needParts.push(`🍞${r.need.bun}`);
      if (r.need.meat) needParts.push(`🥩${r.need.meat}`);
      const row = el('div', 'eq-slot-row');
      row.innerHTML = `
        <div class="eq-slot-icon">${r.icon}</div>
        <div class="eq-slot-info">
          <div class="eq-slot-name">${r.name}</div>
          <div class="eq-slot-sub">ต้องการ: ${needParts.join(' ')} · +${r.loyalty} ผูกพัน</div>
        </div>
        <button class="btn small${canCook ? ' primary' : ''}"${canCook ? '' : ' disabled'}>ทำ</button>`;
      row.querySelector('button').onclick = () => { cookRecipe(r); openCookingMenu(); };
      list.appendChild(row);
    });
    body.appendChild(list);
  });
}
function cookRecipe(r) {
  const inv = G.ingredients || { veg:0, bun:0, meat:0 };
  if ((r.need.veg||0) > (inv.veg||0) || (r.need.bun||0) > (inv.bun||0) || (r.need.meat||0) > (inv.meat||0)) {
    toast('วัตถุดิบไม่พอ'); return;
  }
  inv.veg  -= (r.need.veg  || 0);
  inv.bun  -= (r.need.bun  || 0);
  inv.meat -= (r.need.meat || 0);
  G.ingredients = inv;
  G.foods = G.foods || {};
  G.foods[r.id] = (G.foods[r.id] || 0) + 1;
  save(); renderHUD();
  toast(`🍳 ทำ ${r.name} สำเร็จ!`);
}

function applyItem(it, pet) {
  const s = statsOf(pet);
  if (it.type === 'hp') {
    const amt = Math.floor(s.mhp * it.val);
    pet.hp = clamp(pet.hp + amt, 0, s.mhp);
    log(`${it.icon} ${pet.name} +${amt} HP`, 'heal');
  } else if (it.type === 'exp') {
    const evs = grantExp(pet, it.val);
    log(`${it.icon} ${pet.name} +${it.val} EXP`, 'info');
    evs.forEach(e => {
      if (e.type === 'levelup') log(`${pet.name} → Lv.${e.level} (+${e.pts} แต้ม)`, 'win');
      if (e.type === 'skill')   log(`สกิลใหม่: ${e.name}`, 'win');
    });
  } else if (it.type === 'material') {
    // Evolution materials (e.g. the repurposed Evo Stone) aren't
    // pet-targeted — they just go straight into the shared bag.
    addMaterial(it.matId, it.val || 1);
    const m = MATERIALS[it.matId];
    log(`${m.icon} ได้รับ ${m.name}`, 'win');
  }
}

// ═══════════════ TECH LAB — FINAL EVOLUTION ═══════════════
// The ONLY way to evolve a stage-1 pet into stage 2 (which also rolls
// its mutation). Requires the pet itself to be ready (canEvolve —
// full level for its rarity + max loyalty) AND 1 Malware Core + 3
// Code Parts (any mix of the 4 types) spent here.
let techLabPetId = null;
let techLabParts = [null, null, null];   // each slot: a mutation-type string, or null
let techLabCoreUsed = false;

function techLabReadyPets() {
  return G.roster.filter(p => canEvolve(p).ok);
}

function renderTechLab() {
  const picker = $('techlab-pet-picker');
  const panel = $('techlab-panel');
  if (!picker || !panel) return;

  // Default to a ready pet if the current selection isn't (anymore).
  const readyPets = techLabReadyPets();
  if (!techLabPetId || !G.roster.find(p => p.uid === techLabPetId)) {
    techLabPetId = (readyPets[0] || G.roster[0] || {}).uid || null;
  }
  const pet = G.roster.find(p => p.uid === techLabPetId);

  picker.innerHTML = '';
  G.roster.forEach(p => {
    const ready = canEvolve(p).ok;
    const chip = el('button', 'care-chip' + (p.uid === techLabPetId ? ' on' : ''));
    chip.innerHTML = `${creatureMarkup(p, 'care-chip-sprite')}<span>${p.name}${ready ? ' ▲' : ''}</span>`;
    chip.onclick = () => { techLabPetId = p.uid; techLabParts = [null,null,null]; techLabCoreUsed = false; renderTechLab(); };
    picker.appendChild(chip);
  });

  if (!pet) { panel.innerHTML = `<div class="muted">ยังไม่มี VIRUZ</div>`; return; }

  const chk = canEvolve(pet);
  G.materials = G.materials || {};
  const coreCount = G.materials.malware_core || 0;

  const coreSlotOn = techLabCoreUsed && coreCount > 0;
  const coreSlotHtml = `
    <button class="tl-slot ${coreSlotOn ? 'filled' : ''}" data-slot="core">
      ${coreSlotOn ? `<span class="tl-slot-icon">${MATERIALS.malware_core.icon}</span>` : '<span class="tl-slot-plus">+</span>'}
      <span class="tl-slot-label">Malware Core</span>
      <span class="tl-slot-count">${coreCount} มี</span>
    </button>`;

  const partSlotsHtml = techLabParts.map((matType, i) => {
    const filled = !!matType;
    const m = filled ? MATERIALS['code_part_' + matType] : null;
    return `
      <button class="tl-slot ${filled ? 'filled' : ''}" data-slot="part${i}">
        ${filled ? `<span class="tl-slot-icon">${m.icon}</span>` : '<span class="tl-slot-plus">+</span>'}
        <span class="tl-slot-label">${filled ? m.name.replace('Code Part: ','') : 'Code Part'}</span>
      </button>`;
  }).join('');

  const usedParts = techLabParts.filter(Boolean);
  const weights = mutationWeightsFromParts(usedParts);
  const oddsHtml = weights.map(([k, w]) => {
    const info = MUTATIONS[k];
    return `<div class="tl-odds-row"><span style="color:${info.color}">${info.name}</span><b>${w.toFixed(1)}%</b></div>`;
  }).join('');

  const canConfirm = chk.ok && coreSlotOn && usedParts.length === 3;

  panel.innerHTML = `
    <div class="tl-status ${chk.ok ? 'ok' : 'bad'}">${chk.ok ? '✅ พร้อมวิวัฒน์' : `🔒 ${chk.reason}`}</div>
    <div class="tl-slots">
      ${coreSlotHtml}
      ${partSlotsHtml}
    </div>
    ${usedParts.length ? `<div class="tl-odds"><div class="tl-odds-title">โอกาสได้รับแต่ละฟอร์ม</div>${oddsHtml}</div>` : ''}
    <button class="btn primary wide" id="techlab-evolve-btn" ${canConfirm ? '' : 'disabled'}>
      🧪 วิวัฒน์ขั้นสุดท้าย
    </button>`;

  panel.querySelector('[data-slot="core"]').onclick = () => {
    if (techLabCoreUsed) { techLabCoreUsed = false; renderTechLab(); return; }
    if (coreCount < 1) { toast('ไม่มี Malware Core'); return; }
    techLabCoreUsed = true;
    renderTechLab();
  };
  techLabParts.forEach((_, i) => {
    panel.querySelector(`[data-slot="part${i}"]`).onclick = () => openCodePartPicker(i);
  });
  const evoBtn = panel.querySelector('#techlab-evolve-btn');
  if (evoBtn) evoBtn.onclick = () => confirmTechLabEvolve(pet);
}

function openCodePartPicker(slotIdx) {
  modal('เลือก Code Part', wrap => {
    const grid = el('div', 'modal-grid');
    // How many of each type are already committed to OTHER slots,
    // so we don't offer more than the player actually owns.
    const committedElsewhere = {};
    techLabParts.forEach((t, i) => { if (t && i !== slotIdx) committedElsewhere[t] = (committedElsewhere[t]||0)+1; });
    CODE_PART_IDS.forEach(matId => {
      const m = MATERIALS[matId];
      const owned = (G.materials && G.materials[matId]) || 0;
      const available = owned - (committedElsewhere[m.mutation] || 0);
      const card = el('div', 'shop-card' + (available <= 0 ? ' disabled' : ''));
      card.innerHTML = `
        <div class="sc-icon">${m.icon}</div>
        <div class="sc-name">${m.name.replace('Code Part: ','')}</div>
        <div class="sc-desc">มี ${Math.max(0,available)} ชิ้น</div>`;
      if (available > 0) {
        card.onclick = () => { techLabParts[slotIdx] = m.mutation; closeModal(); renderTechLab(); };
      }
      grid.appendChild(card);
    });
    if (techLabParts[slotIdx]) {
      const clearBtn = el('button', 'btn wide', 'เอาออกจากช่อง');
      clearBtn.onclick = () => { techLabParts[slotIdx] = null; closeModal(); renderTechLab(); };
      wrap.appendChild(grid);
      wrap.appendChild(clearBtn);
    } else {
      wrap.appendChild(grid);
    }
  });
}

function confirmTechLabEvolve(pet) {
  const chk = canEvolve(pet);
  const usedParts = techLabParts.filter(Boolean);
  if (!chk.ok || !techLabCoreUsed || usedParts.length !== 3) { toast('ยังไม่พร้อม'); return; }
  const weights = mutationWeightsFromParts(usedParts);

  // Spend materials now — evolve() below can't fail once we're here
  // (canEvolve() already confirmed eligibility).
  G.materials.malware_core -= 1;
  usedParts.forEach(mut => { G.materials['code_part_' + mut] -= 1; });
  techLabCoreUsed = false;
  techLabParts = [null, null, null];

  playEvolveAnimation(pet, () => evolve(pet, false, weights)).then(res => {
    save();
    renderTechLab();
    renderHUD();
    if (res) {
      const mInfo = MUTATIONS[pet.mutation];
      log(`🧪 ${pet.name} วิวัฒน์ขั้นสุดท้าย → ${res.label} · กลายพันธุ์: ${mInfo.name}`, 'win');
      toast(`✨ ${pet.name} วิวัฒน์แล้ว!\n${res.label} · ${mInfo.name}`);
    }
  });
}

// ── SYNCHRONIZE ──
// Fuse 2 same-rarity, fully-leveled pets into 1 new pet a rarity tier
// higher (see canSynchronize()/synchronizePets() in engine.js) — a
// faster, deterministic alternative to hatching for a higher rarity,
// at the cost of two already-invested pets. Picking a pet toggles it
// into whichever of the 2 slots is open (or clears it if it's already
// in one); once both slots hold an eligible pair, choosing which one's
// species/attribute the fused pet keeps unlocks the confirm button.
let syncAId = null;
let syncBId = null;
let syncBaseId = null;

function syncSlotPet(which) {
  const id = which === 'a' ? syncAId : syncBId;
  return id ? G.roster.find(p => p.uid === id) : null;
}

function renderSynchronize() {
  const picker = $('sync-pet-picker');
  const panel = $('sync-panel');
  if (!picker || !panel) return;

  picker.innerHTML = '';
  G.roster.forEach(p => {
    const slot = p.uid === syncAId ? 'a' : p.uid === syncBId ? 'b' : null;
    const chip = el('button', 'care-chip' + (slot ? ' on' : ''));
    chip.innerHTML = `${creatureMarkup(p, 'care-chip-sprite')}<span>${p.name}${slot ? ` (${slot.toUpperCase()})` : ''}</span>`;
    chip.onclick = () => {
      if (slot) {
        if (slot === 'a') syncAId = null; else syncBId = null;
      } else if (!syncAId) {
        syncAId = p.uid;
      } else if (!syncBId) {
        syncBId = p.uid;
      } else {
        toast('เลือกได้สูงสุด 2 ตัว — เอาตัวที่เลือกไว้ออกก่อน');
        return;
      }
      if (syncAId !== p.uid && syncBId !== p.uid) syncBaseId = null;
      renderSynchronize();
    };
    picker.appendChild(chip);
  });

  const petA = syncSlotPet('a'), petB = syncSlotPet('b');
  const slotHtml = (pet, label) => pet
    ? `<div class="tl-slot filled sync-slot">${creatureMarkup(pet, 'sync-slot-sprite')}
        <span class="tl-slot-label">${pet.name}<br>${RARITY[pet.rarity].name} · Lv.${pet.level}</span></div>`
    : `<div class="tl-slot sync-slot"><span class="tl-slot-plus">+</span><span class="tl-slot-label">${label}</span></div>`;

  let bodyHtml = `<div class="sync-slots">${slotHtml(petA, 'VIRUZ ตัวที่ 1')}<div class="sync-plus">+</div>${slotHtml(petB, 'VIRUZ ตัวที่ 2')}</div>`;

  let canConfirm = false;
  if (petA && petB) {
    const chk = canSynchronize(petA, petB);
    bodyHtml += `<div class="tl-status ${chk.ok ? 'ok' : 'bad'}">${chk.ok ? `✅ พร้อมซิงค์ → ${RARITY[chk.nextRarity].name}` : `🔒 ${chk.reason}`}</div>`;
    if (chk.ok) {
      if (!syncBaseId) syncBaseId = petA.uid;
      bodyHtml += `
        <div class="sync-base-label">เลือกรูปร่าง/ธาตุที่จะสืบทอด:</div>
        <div class="sync-base-pick">
          ${[petA, petB].map(p => `
            <button class="sync-base-btn${syncBaseId === p.uid ? ' on' : ''}" data-uid="${p.uid}">
              ${creatureMarkup(p, 'sync-base-sprite')}<span>${p.name}</span>
            </button>`).join('')}
        </div>`;
      canConfirm = true;
    }
  }

  panel.innerHTML = bodyHtml + `
    <button class="btn primary wide" id="sync-confirm-btn" ${canConfirm ? '' : 'disabled'}>
      🔄 ซิงโครไนซ์
    </button>`;

  if (petA && petB && canConfirm) {
    panel.querySelectorAll('.sync-base-btn').forEach(btn => {
      btn.onclick = () => { syncBaseId = btn.dataset.uid; renderSynchronize(); };
    });
  }
  const btn = $('sync-confirm-btn');
  if (btn) btn.onclick = () => confirmSynchronize(petA, petB);
}

function confirmSynchronize(petA, petB) {
  if (!petA || !petB) return;
  const chk = canSynchronize(petA, petB);
  if (!chk.ok) { toast(chk.reason); return; }
  // Same guard dismissPet() uses — pull both out of team/bench/defense
  // first rather than silently unslotting them out from under the
  // player.
  const slotted = [petA, petB].filter(p =>
    G.teamIds.includes(p.uid) || (G.benchIds || []).includes(p.uid) || (G.defenseIds || []).includes(p.uid));
  if (slotted.length) { toast(`ถอด ${slotted.map(p => p.name).join(', ')} ออกจากทีม/สำรอง/ฐานก่อน`); return; }

  const base = syncBaseId === petB.uid ? petB : petA;
  const fused = synchronizePets(petA, petB, base.speciesId, base.attr);
  if (!fused) { toast('ซิงค์ไม่สำเร็จ'); return; }

  G.roster = G.roster.filter(p => p.uid !== petA.uid && p.uid !== petB.uid);
  G.roster.push(fused);
  syncAId = null; syncBId = null; syncBaseId = null;
  save();
  syncReveal(fused, petA.name, petB.name);
  log(`🔄 ซิงโครไนซ์ ${petA.name} + ${petB.name} → ${fused.name} [${RARITY[fused.rarity].name}]`, 'win');
  renderSynchronize();
  renderHome(); renderCharacter(); renderHUD();
}

function syncReveal(pet, nameA, nameB) {
  const a = ATTR[pet.attr], r = RARITY[pet.rarity];
  const bonus = pet.syncBonus;
  const bonusMeta = bonus ? STAT_META[bonus.stat] : null;
  modal('🔄 ซิงโครไนซ์สำเร็จ!', wrap => {
    const box = el('div', 'reveal');
    box.style.setProperty('--attr', a.color);
    box.style.setProperty('--rar', r.color);
    box.innerHTML = `
      <div class="muted" style="margin-bottom:6px">${nameA} + ${nameB} →</div>
      ${creatureMarkup(pet, 'reveal-sprite float')}
      <div class="reveal-name">${pet.name}</div>
      <div class="reveal-rar">${r.name} · Lv.${pet.level}</div>
      <div class="reveal-attr">${attrIcon(a, 18)} ${a.name} — ${a.desc}</div>
      ${bonusMeta ? `<div class="reveal-trait">${bonusMeta.icon} ${bonus.name} — ${bonusMeta.name} +${Math.round(bonus.pct*100)}%</div>` : ''}`;
    wrap.appendChild(box);
  });
}

// ── EVOLVE ANIMATION ──
// White glowing pulse around the body, 3x (~1s each), then the
// original form shatters into pixel-like shards revealing the new
// (mutated) form underneath. Runs as a full-screen overlay so it
// works from the Tech Lab (not just mid-battle). `doEvolve` is called
// (and its result returned) mid-explosion, so the reveal underneath
// shows the actual new form.
async function playEvolveAnimation(pet, doEvolve) {
  const overlay = el('div', 'evo-overlay');
  document.body.appendChild(overlay);
  overlay.innerHTML = `
    <div class="evo-stage">
      <div class="evo-sprite-wrap">${creatureMarkup(pet, 'evo-sprite')}</div>
      <div class="evo-shards"></div>
      <div class="evo-label">วิวัฒน์...</div>
    </div>`;
  const wrap = overlay.querySelector('.evo-sprite-wrap');
  const label = overlay.querySelector('.evo-label');

  for (let i = 0; i < 3; i++) {
    wrap.classList.add('evo-pulse');
    await wait(950);
    wrap.classList.remove('evo-pulse');
    await wait(130);
  }

  const rect = wrap.getBoundingClientRect();
  const imgEl = wrap.querySelector('img');
  const bgUrl = imgEl ? imgEl.src : null;
  const w = Math.max(40, rect.width), h = Math.max(40, rect.height);
  const cols = 7, rows = 7;
  const shardW = w / cols, shardH = h / rows;
  const shardsHost = overlay.querySelector('.evo-shards');
  shardsHost.style.width = w + 'px';
  shardsHost.style.height = h + 'px';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shard = document.createElement('div');
      shard.className = 'evo-shard';
      shard.style.width = shardW + 'px';
      shard.style.height = shardH + 'px';
      shard.style.left = (c * shardW) + 'px';
      shard.style.top = (r * shardH) + 'px';
      if (bgUrl) {
        shard.style.backgroundImage = `url('${bgUrl}')`;
        shard.style.backgroundSize = `${w}px ${h}px`;
        shard.style.backgroundPosition = `-${c * shardW}px -${r * shardH}px`;
      }
      const dx = (Math.random() - 0.5) * 280;
      const dy = (Math.random() - 0.5) * 220 - 40;
      const rot = (Math.random() - 0.5) * 200;
      shard.style.setProperty('--dx', dx + 'px');
      shard.style.setProperty('--dy', dy + 'px');
      shard.style.setProperty('--rot', rot + 'deg');
      shard.style.animationDelay = (Math.random() * 0.12) + 's';
      shardsHost.appendChild(shard);
    }
  }

  label.textContent = '';
  wrap.style.visibility = 'hidden';
  shardsHost.classList.add('go');

  const result = doEvolve();
  wrap.innerHTML = creatureMarkup(pet, 'evo-sprite evo-reveal');

  await wait(750);
  wrap.style.visibility = 'visible';
  await wait(600);
  overlay.remove();
  return result;
}

