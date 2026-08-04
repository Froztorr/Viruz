// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { CRAFT_RECIPES, EQUIP_GRADE_KEYS, EQUIP_SLOTS, FOODS, INGREDIENTS, MATERIALS, MEAT_ITEM, PAYLOAD_EFFECTS, POTIONS, RECIPES, REVIVE_POTION, STAT_META, TOYS, craftEquipment, dustValueOf, sellValueOf } from '../data.js';
import { petState, reviveDownPet } from '../engine.js';
import { iconHtml } from '../icons.js';
import { applyItemRarity, rarityChipHtml, rarityOf, rarityOfGrade } from '../item-rarity.js';
import { dustEquip, equipGradeMeta, sellEquip, toggleEquipLock } from '../battle/equipment.js';
import { throwLoadout, throwPool } from '../battle/extras.js';
import { equipIconHtml, equipStatLine, potionIconHtml } from './pet-detail.js';
import { $, G, battle, el, save, setText } from '../state.js';
import { closeModal, log, modal, petCard, renderHUD, toast } from '../ui-shell.js';

// ── INVENTORY ── 3 swipeable sub-tabs of dense icon-box grids, opened
// from the drawer's Inventory tab. Each box shows only an icon + a
// single number badge (owned count for stackables, level for gear);
// tapping one opens the full description in the shared modal.
// `rarityId` outlines the box in its rarity colour (see item-rarity.js).
function invBox(iconMarkup, num, onClick, gradeColor, rarityId) {
  const box = el('div', 'inv-box');
  if (gradeColor) box.style.setProperty('--grade', gradeColor);
  if (rarityId) applyItemRarity(box, rarityId);
  box.innerHTML = `<div class="inv-box-icon">${iconMarkup}</div>` +
    (num != null ? `<div class="inv-box-num">${num}</div>` : '');
  if (onClick) box.onclick = onClick;
  return box;
}
function showItemDetail(iconMarkup, name, desc, extraHtml, rarityId) {
  modal(name, body => {
    body.innerHTML = `
      <div style="text-align:center;font-size:40px;margin-bottom:8px">${iconMarkup}</div>
      ${rarityChipHtml(rarityId)}
      <div class="muted" style="text-align:center;margin-bottom:10px">${desc}</div>
      ${extraHtml || ''}`;
  });
}
export function renderInventory() {
  renderInvItems();
  renderInvPotions();
  renderEquipBag();
  renderCraft();
  renderInvThrowLoadout();
}

// "Wheel" tab — pick which up-to-5 potions/poisons show up in each
// battle pouch's radial wheel (see throwLoadout() in the battle
// section). Tapping an item toggles it in/out of that side's loadout;
// the order tapped is the order it'll appear around the wheel (shown
// as a numbered badge) — a full drag-to-reorder UI would be nicer but
// tap-to-toggle-with-order is far simpler and still lets the player
// fully control which 5 (and in what order) they get.
export function renderInvThrowLoadout() {
  ['potion', 'poison'].forEach(kind => {
    const box = $(kind === 'potion' ? 'inv-loadout-potion' : 'inv-loadout-poison');
    if (!box) return;
    box.innerHTML = '';
    G.throwLoadout = G.throwLoadout || {};
    const chosen = G.throwLoadout[kind] || throwPool(kind).map(x => x.id).slice(0, 5);
    throwPool(kind).forEach(item => {
      const idx = chosen.indexOf(item.id);
      const on = idx !== -1;
      const chip = el('div', 'throw-loadout-chip' + (on ? ' on' : ''));
      chip.innerHTML = `${potionIconHtml(item, 'tlc-icon')}
        <span class="tlc-name">${item.name}</span>
        ${on ? `<span class="tlc-n">${idx + 1}</span>` : ''}`;
      chip.title = item.desc;
      chip.onclick = () => {
        const list = (G.throwLoadout[kind] || throwPool(kind).map(x => x.id).slice(0, 5)).slice();
        const i = list.indexOf(item.id);
        if (i !== -1) list.splice(i, 1);
        else {
          if (list.length >= 5) { toast('เลือกได้สูงสุด 5 อย่าง'); return; }
          list.push(item.id);
        }
        G.throwLoadout[kind] = list;
        save();
        renderInvThrowLoadout();
      };
      box.appendChild(chip);
    });
  });
}

// "Items" tab — everything that isn't a potion or gear: foods,
// recipes, toys, crafting materials, and cooking ingredients.
function renderInvItems() {
  const box = $('inv-grid-items');
  if (!box) return;
  box.innerHTML = '';
  let any = false;
  const ownedFoods = G.foods || {};
  [...FOODS, ...RECIPES].forEach(f => {
    const n = ownedFoods[f.id] || 0;
    if (!n) return;
    any = true;
    const r = rarityOf(f);
    box.appendChild(invBox(iconHtml(f), n, () => showItemDetail(iconHtml(f), f.name, f.desc, '', r), null, r));
  });
  (G.toys || []).forEach(id => {
    const t = TOYS.find(x => x.id === id);
    if (!t) return;
    any = true;
    const r = rarityOf(t);
    box.appendChild(invBox(iconHtml(t), null, () => showItemDetail(iconHtml(t), t.name, t.desc, '', r), null, r));
  });
  const ownedMats = G.materials || {};
  Object.keys(MATERIALS).forEach(id => {
    const n = ownedMats[id] || 0;
    if (!n) return;
    any = true;
    const m = MATERIALS[id];
    const r = rarityOf(m);
    box.appendChild(invBox(iconHtml(m), n, () => showItemDetail(iconHtml(m), m.name, m.desc, '', r), null, r));
  });
  const ing = G.ingredients || {};
  [['veg', INGREDIENTS[0]], ['bun', INGREDIENTS[1]], ['meat', MEAT_ITEM]].forEach(([key, def]) => {
    const n = ing[key] || 0;
    if (!n || !def) return;
    any = true;
    const r = rarityOf(def);
    box.appendChild(invBox(iconHtml(def), n, () => showItemDetail(iconHtml(def), def.name, def.desc, '', r), null, r));
  });
  if (!any) box.innerHTML = `<div class="inv-empty-msg">ยังไม่มีไอเทม</div>`;
}

function renderInvPotions() {
  const box = $('inv-grid-potions');
  if (!box) return;
  box.innerHTML = '';
  const owned = G.potions || {};
  let any = false;
  POTIONS.forEach(p => {
    const n = owned[p.id] || 0;
    if (!n) return;
    any = true;
    const r = rarityOf(p);
    box.appendChild(invBox(potionIconHtml(p), n, () => showItemDetail(potionIconHtml(p), p.name, p.desc, '', r), null, r));
  });
  const reviveN = owned[REVIVE_POTION.id] || 0;
  if (reviveN) {
    any = true;
    const r = rarityOf(REVIVE_POTION);
    box.appendChild(invBox(iconHtml(REVIVE_POTION), reviveN, () => {
      showItemDetail(iconHtml(REVIVE_POTION), REVIVE_POTION.name, REVIVE_POTION.desc,
        `<button class="btn wide primary" id="revive-use-btn">✨ ใช้</button>`, r);
      $('revive-use-btn').onclick = () => { closeModal(); useRevivePotion(); };
    }, null, r));
  }
  if (!any) box.innerHTML = `<div class="inv-empty-msg">ยังไม่มียา</div>`;
}

// Pick which Down pet to bring back — only Down pets are offered (not
// Error, not already-alive ones); the potion itself is consumed only
// once a valid target is actually chosen.
function useRevivePotion() {
  const owned = (G.potions && G.potions[REVIVE_POTION.id]) || 0;
  if (owned <= 0) { toast('ไม่มี Revive Potion'); return; }
  const targets = G.roster.filter(p => petState(p) === 'down');
  if (!targets.length) { toast('ไม่มี VIRUZ ที่อยู่ในสถานะ Down ตอนนี้'); return; }
  modal('เลือก VIRUZ ที่จะชุบชีวิต', wrap => {
    const grid = el('div', 'modal-grid');
    targets.forEach(pet => {
      const c = petCard(pet, { onClick: p => {
        G.potions[REVIVE_POTION.id]--;
        reviveDownPet(p);
        save(); closeModal(); renderHUD();
        toast(`✨ ${p.name} ฟื้นคืนชีพแล้ว!`);
        log(`✨ ใช้ Revive Potion กับ ${p.name}`, 'heal');
      }});
      grid.appendChild(c);
    });
    wrap.appendChild(grid);
  });
}

// Item boxes in the equipment bag — tapping one shows its full stats
// plus sell/dust buttons (each can be sold for Bitz or dusted
// (disenchanted) into Dust, the crafting currency used below).
// Sort compare for the equipment bag grid. With no explicit mode
// chosen (G.equipSortMode falsy — the "not selected" state, toggled
// back to by tapping an active chip again) it defaults to rarity
// first, then level, matching the un-sorted default requested.
function equipSortCompare(a, b) {
  const gi = x => EQUIP_GRADE_KEYS.indexOf(x.grade);
  switch (G.equipSortMode) {
    case 'level': return (b.lvlReq - a.lvlReq) || (gi(b) - gi(a));
    case 'value': return sellValueOf(b) - sellValueOf(a);
    default: return (gi(b) - gi(a)) || (b.lvlReq - a.lvlReq);
  }
}
export function renderEquipBag() {
  document.querySelectorAll('#eq-sort-row .chip-btn').forEach(btn => {
    btn.classList.toggle('on', G.equipSortMode === btn.dataset.sort);
  });
  const box = $('inv-grid-parts');
  if (!box) return;
  box.innerHTML = '';
  const bag = G.equipBag || [];
  if (!bag.length) {
    box.innerHTML = `<div class="inv-empty-msg">ยังไม่มีอุปกรณ์ — ดรอปจากศัตรู หรือคราฟต์เองด้านล่าง</div>`;
    return;
  }
  const sorted = [...bag].sort(equipSortCompare);
  sorted.forEach(item => {
    const g = equipGradeMeta(item);
    const slot = EQUIP_SLOTS[item.slotId];
    const markup = equipIconHtml(item, slot.icon);
    // Gear grades map 1:1 onto the rarity ladder, so equipment glows on
    // the same scale as everything else instead of its own quiet frame.
    const itemBox = invBox(markup, item.lvlReq, () => showEquipDetail(item), g.color, rarityOfGrade(item.grade));
    if (item.locked) itemBox.appendChild(el('div', 'inv-box-lock', '🔒'));
    box.appendChild(itemBox);
  });
}

// Richer equipment detail card: graded header, a rough "power" total
// (sum of the item's own stat lines — payload items roll one effect
// instead of stats, so they show that instead), a per-stat breakdown,
// a lock toggle, then the usual sell/dust actions.
function showEquipDetail(item) {
  const g = equipGradeMeta(item);
  const slot = EQUIP_SLOTS[item.slotId];
  const markup = equipIconHtml(item, slot.icon);
  const power = Object.values(item.stats || {}).reduce((s, v) => s + v, 0);

  const statRows = Object.keys(item.stats || {})
    .map(k => `<div class="eqd-stat-row"><span>${iconHtml(STAT_META[k])} ${STAT_META[k].name}</span><b>+${item.stats[k]}</b></div>`)
    .join('');

  let effectHtml = '';
  if (item.effectId) {
    const eff = PAYLOAD_EFFECTS[item.effectId];
    const gi = EQUIP_GRADE_KEYS.indexOf(item.grade);
    const mag = (eff.mag || [])[gi] || 0;
    const pct = mag > 0 ? ` (${Math.round(mag * 100)}%)` : '';
    effectHtml = `<div class="eqd-effect">${iconHtml(eff)} <b>${eff.name}${pct}</b><br><span class="muted">${eff.desc}</span></div>`;
  }
  const habitHtml = item.slotId === 'habit' ? `<div class="eqd-effect">${equipStatLine(item)}</div>` : '';

  const renderBody = () => {
    const body = $('modal-body');
    if (!body) return;
    const box = el('div', 'eqd');
    box.style.setProperty('--grade', g.color);
    box.innerHTML = `
      <div class="eqd-head">
        <div class="eqd-icon-box">${markup}</div>
        <div class="eqd-headinfo">
          <div class="eqd-name">${item.name}</div>
          <div class="eqd-slot">${slot.name} · Lv.${item.lvlReq}</div>
          <div class="eqd-grade" style="color:${g.color}">${g.thai}</div>
        </div>
        <button class="eqd-lock${item.locked ? ' on' : ''}" id="eqd-lock-btn">${item.locked ? '🔒' : '🔓'}</button>
      </div>
      ${power ? `<div class="eqd-power">พลังรวม <b>${power}</b></div>` : ''}
      ${statRows ? `<div class="eqd-stats">${statRows}</div>` : ''}
      ${effectHtml}${habitHtml}
      <div class="eq-card-btns">
        <button class="btn small" data-act="sell">💰 ${sellValueOf(item)}</button>
        <button class="btn small" data-act="dust">🧬 ${dustValueOf(item)}</button>
      </div>`;
    body.innerHTML = '';
    body.appendChild(box);
    $('eqd-lock-btn').onclick = () => { toggleEquipLock(item); renderBody(); renderEquipBag(); };
    body.querySelector('[data-act="sell"]').onclick = () => { if (sellEquip(item)) { closeModal(); renderEquipBag(); } };
    body.querySelector('[data-act="dust"]').onclick = () => { if (dustEquip(item)) { closeModal(); renderEquipBag(); renderCraft(); } };
  };
  modal(item.name, () => {});
  renderBody();
}

// Spend Dust on one of a few fixed recipes to self-craft a random
// piece of gear — better recipes skew toward higher grades but never
// guarantee one; slot/stats/level/affix still roll randomly.
function renderCraft() {
  setText('craft-dust', G.dust || 0);
  const box = $('inv-grid-craft');
  if (!box) return;
  box.innerHTML = '';
  const maxLevel = Math.max(1, ...G.roster.map(p => p.level || 1));
  CRAFT_RECIPES.forEach(r => {
    const rar = rarityOf(r);
    box.appendChild(invBox(iconHtml(r), r.dust, () => {
      const afford = (G.dust || 0) >= r.dust;
      showItemDetail(iconHtml(r), r.name, `โอกาสได้เกรดสูงขึ้นตามด่าน · 🧬 ${r.dust} Dust`, `
        <button class="btn wide${afford ? ' primary' : ''}" id="craft-go-btn">${afford ? 'คราฟต์' : 'Dust ไม่พอ'}</button>`, rar);
      const btn = $('craft-go-btn');
      if (!afford) { btn.disabled = true; return; }
      btn.onclick = () => {
        if ((G.dust || 0) < r.dust) { toast('Dust ไม่พอ'); return; }
        G.dust -= r.dust;
        const item = craftEquipment(r.id, maxLevel);
        G.equipBag = G.equipBag || [];
        G.equipBag.push(item);
        save();
        toast(`✨ ได้ ${item.name}!`);
        closeModal();
        renderCraft(); renderEquipBag();
      };
    }, null, rar));
  });
}

// ── Inventory tab bar — each category is its own separate page
// (.inv-page.on), fully display:none'd when inactive so an
// oversized/scrolled page can never bleed into a neighboring tab
// (swipe gesture wired the same way as the pet detail modal's tabs).
let invPage = 0;
function goInvPage(i) {
  invPage = Math.max(0, Math.min(2, i));
  document.querySelectorAll('.inv-page').forEach((p, idx) => p.classList.toggle('on', idx === invPage));
  document.querySelectorAll('.inv-tab').forEach((t, idx) => t.classList.toggle('on', idx === invPage));
}
export function wireInventoryTabs() {
  document.querySelectorAll('.inv-tab').forEach(t => {
    t.onclick = () => goInvPage(+t.dataset.page);
  });
  const vp = $('inv-viewport');
  if (vp) {
    let x0 = null;
    vp.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive:true});
    vp.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) goInvPage(invPage + (dx < 0 ? 1 : -1));
      x0 = null;
    }, {passive:true});
  }
}

