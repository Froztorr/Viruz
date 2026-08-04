// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { ALL_EQUIP_SLOT_KEYS, ATTR, EQUIP_GRADES, EQUIP_GRADE_KEYS, EQUIP_SLOTS, HABIT_COLORS, HABIT_TYPES, PAYLOAD_EFFECTS, POTIONS, RARITY, STAT_KEYS, STAT_META, THROW_POISONS, THROW_UTILITY_POTIONS, loyaltyProgress, loyaltyTier, rollEquipment, treeFor, treeForMutation } from '../data.js';
import { canEvolve, equipmentBonuses, statsOf, treeBonuses, uid, unlockedSpecials } from '../engine.js';
import { equipGradeMeta, equipItem, unequipItem } from '../battle/equipment.js';
import { addToBench, addToTeam, dismissPet, removeFromBench, removeFromTeam, wireCharSlotDrag } from './home-character.js';
import { openCookingMenu } from './shop.js';
import { openSkillExplainer, renderTree, setTreePetId, treePetId } from './skilltree.js';
import { $, G, activeTeam, attrIcon, creatureMarkup, el, habitIcon, petById, save, setText } from '../state.js';
import { closeModal, currentMainId, modal } from '../ui-shell.js';

// ── PET DETAIL WINDOW (Stats / Equipment / Skill Tree) ──
let PD = null;
let pdPage = 0;

export function openPetDetail(pet, startPage) {
  PD = { pet };
  const overlay = $('pet-detail');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.classList.add('pet-detail-open');
  setText('pd-title', pet.name);
  renderPdStats();
  renderPdEquip();
  setTreePetId(pet.uid);
  renderTree();
  goPdPage(startPage || 0, true);
}
export function closePetDetail() {
  const overlay = $('pet-detail');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('pet-detail-open');
  PD = null;
}
const PD_PAGE_RENDER = [renderPdStats, renderPdEquip, renderTree];
function goPdPage(i, instant) {
  const track = $('pd-track');
  if (!track) return;
  pdPage = Math.max(0, Math.min(2, i));
  if (instant) track.style.transition = 'none';
  track.style.transform = `translateX(-${pdPage * 100}%)`;
  if (instant) { void track.offsetWidth; track.style.transition = ''; }
  document.querySelectorAll('.pd-tab').forEach((t, idx) => t.classList.toggle('on', idx === pdPage));
  const render = PD_PAGE_RENDER[pdPage];
  if (render) render();
}
export function wirePetDetail() {
  const close = $('pd-close');
  if (close) close.onclick = closePetDetail;
  document.querySelectorAll('.pd-tab').forEach(t => {
    t.onclick = () => goPdPage(+t.dataset.page);
  });
  const overlay = $('pet-detail');
  if (overlay) overlay.onclick = (e) => { if (e.target === overlay) closePetDetail(); };
  const vp = $('pd-viewport');
  if (vp) {
    let x0 = null;
    vp.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive:true});
    vp.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) goPdPage(pdPage + (dx < 0 ? 1 : -1));
      x0 = null;
    }, {passive:true});
  }
  const treeBtn = $('home-tree-btn');
  if (treeBtn) treeBtn.onclick = () => {
    const pet = petById(treePetId) || activeTeam()[0] || G.roster[0];
    if (pet) openPetDetail(pet, 2);
  };
  const cookBtn = $('home-cook-btn');
  if (cookBtn) cookBtn.onclick = openCookingMenu;
}

// ── Page 1: Stats ──
function renderPdStats() {
  const pet = PD.pet;
  const a = ATTR[pet.attr];
  const r = RARITY[pet.rarity];
  const s = statsOf(pet);
  const eq = equipmentBonuses(pet);
  const tb = treeBonuses(pet);
  const tier = loyaltyTier(pet.loyalty);
  const loyProg = loyaltyProgress(pet.loyalty);
  const tree = treeFor(pet.attr);
  const specials = unlockedSpecials(pet);
  const evoReady = canEvolve(pet).ok;
  const habitCard = pet.equip && pet.equip.habit;
  const habitColor = habitCard && HABIT_COLORS[habitCard.color];
  const habitType = habitCard && HABIT_TYPES[habitCard.type];
  const page = $('pd-page-stats');
  if (!page) return;

  page.innerHTML = `
    <div class="ps-head">
      ${creatureMarkup(pet, 'ps-sprite float')}
      <div class="ps-headinfo">
        <div class="ps-rar" style="color:${r.color}">${r.name} · ${attrIcon(a, 24)} ${a.name}${evoReady ? ` <span class="pc-evo-ready" title="พร้อมวิวัฒน์ — ไปที่ Tech Lab">▲ พร้อมวิวัฒน์</span>` : ''}</div>
        <div class="ps-habits">Habits: ${habitCard
          ? `${habitIcon(habitColor, 24)} ${habitColor.name} ${habitIcon(habitType, 24)} ${habitType.name}`
          : `<span class="muted">ยังไม่ติดตั้งการ์ดข้อมูล</span>`}</div>
        <div class="ps-lv">Lv.${pet.level}/${pet.maxLv} · EXP ${pet.exp}/${pet.expNeed}</div>
        <div class="ps-loy">${tier.icon} ${tier.name}
          <span class="pc-loy-bar" style="width:60px;display:inline-block"><i style="width:${loyProg.pct}%"></i></span>
        </div>
      </div>
    </div>
    <div class="ps-stats">
      ${STAT_KEYS.map(k => {
        const meta = STAT_META[k];
        const suffix = (k === 'crit' || k === 'eva') ? '%' : '';
        const x = eq[k] || 0, y = tb[k] || 0;
        let delta = '';
        if (x || y) {
          const parts = [];
          if (x) parts.push(`<span class="pd-x">+${x}</span>`);
          if (y) parts.push(`<span class="pd-y">+${y}</span>`);
          delta = `<i class="ps-delta">(${parts.join('')})</i>`;
        }
        return `<span class="ps-stat"><i>${meta.icon}</i>${meta.name}<b>${s[k]}${suffix}</b>${delta}</span>`;
      }).join('')}
    </div>
    <div class="ps-skills-title">// เอฟเฟกต์พาสซีฟ //</div>
    <div class="ps-passives"></div>
    <div class="ps-skills-title">// สกิลพิเศษ //</div>
    <div class="ps-skills"></div>
    <div class="pd-team-btns">
      <button class="btn pd-team-btn" id="pd-team-btn"></button>
      <button class="btn pd-team-btn" id="pd-bench-btn"></button>
    </div>
    <button class="btn wide" id="pd-dismiss-btn">🗑 สลายเป็น Bitz</button>`;

  const passiveList = page.querySelector('.ps-passives');
  const passiveEntries = [];
  ['payload', 'exploit', 'rootkit'].forEach(slotId => {
    const item = pet.equip && pet.equip[slotId];
    const eff = item && item.effectId && PAYLOAD_EFFECTS[item.effectId];
    if (eff) passiveEntries.push({ icon: eff.icon, name: eff.name, desc: eff.desc });
  });
  if (habitType) passiveEntries.push({ icon: habitIcon(habitType, 21), name: habitType.name, desc: habitType.desc });
  specials.forEach(sp => passiveEntries.push({ icon: '✦', name: sp.name, desc: sp.desc }));
  if (!passiveEntries.length) {
    passiveList.innerHTML = `<div class="muted" style="padding:8px">ยังไม่มีเอฟเฟกต์พาสซีฟ</div>`;
  } else {
    passiveList.innerHTML = passiveEntries.map(p =>
      `<div class="ps-passive-row"><i>${p.icon}</i><div><b>${p.name}</b><span>${p.desc}</span></div></div>`
    ).join('');
  }

  const list = page.querySelector('.ps-skills');
  if (!specials.length) {
    list.innerHTML = `<div class="muted" style="padding:8px">ยังไม่ปลดล็อกสกิลพิเศษ — ดูที่หน้าผังสกิล</div>`;
  }
  pet.autoCast = pet.autoCast || {};
  specials.forEach(sp => {
    const on = !!pet.autoCast[sp.id];
    const row = el('div', 'ps-skill-row');
    row.innerHTML = `
      <button class="ps-skill-name">✦ ${sp.name}</button>
      <label class="ps-toggle">
        <input type="checkbox" ${on ? 'checked' : ''}>
        <span>${on ? 'อัตโนมัติ' : 'ปิด'}</span>
      </label>`;
    row.querySelector('.ps-skill-name').onclick = () => {
      const mutTree = (pet.stage >= 2 && pet.mutation) ? treeForMutation(pet.mutation) : null;
      const node = tree.nodes.find(n => n.kind === 'skill' && n.skill === sp.id)
        || (mutTree && mutTree.nodes.find(n => n.kind === 'skill' && n.skill === sp.id));
      if (node) {
        const ownerTree = tree.nodes.includes(node) ? tree : mutTree;
        openSkillExplainer(pet, ownerTree, node.id, 'status');
      }
    };
    const cb = row.querySelector('input');
    cb.onchange = () => {
      pet.autoCast[sp.id] = cb.checked;
      row.querySelector('.ps-toggle span').textContent = cb.checked ? 'อัตโนมัติ' : 'ปิด';
      save();
    };
    list.appendChild(row);
  });

  refreshPdTeamBtn();
}
export function refreshPdTeamBtn() {
  const teamBtn = $('pd-team-btn');
  const benchBtn = $('pd-bench-btn');
  if (!teamBtn || !benchBtn || !PD) return;
  const teamBtns = teamBtn.closest('.pd-team-btns');
  const dismissBtn = $('pd-dismiss-btn');
  if (currentMainId === 'character') {
    if (teamBtns) teamBtns.style.display = 'none';
    if (dismissBtn) dismissBtn.style.display = 'none';
    return;
  }
  if (teamBtns) teamBtns.style.display = '';
  if (dismissBtn) dismissBtn.style.display = '';
  const uid = PD.pet.uid;
  const inTeam = G.teamIds.includes(uid);
  const inBench = (G.benchIds || []).includes(uid);
  teamBtn.textContent = inTeam ? '➖ นำออกจากทีมหลัก' : '➕ ทีมหลัก';
  teamBtn.classList.toggle('primary', !inTeam);
  teamBtn.classList.toggle('danger', inTeam);
  teamBtn.onclick = () => {
    if (inTeam) removeFromTeam(uid);
    else addToTeam(uid);
    closePetDetail();
  };
  benchBtn.textContent = inBench ? '➖ นำออกจากสำรอง' : '➕ ตัวสำรอง';
  benchBtn.classList.toggle('primary', !inBench && !inTeam);
  benchBtn.classList.toggle('danger', inBench);
  benchBtn.disabled = inTeam;
  benchBtn.onclick = () => {
    if (inBench) removeFromBench(uid);
    else addToBench(uid);
    closePetDetail();
  };
  if (dismissBtn) {
    const canDismiss = !inTeam && !inBench && G.roster.length > 1;
    dismissBtn.disabled = !canDismiss;
    dismissBtn.onclick = () => {
      const pet = PD.pet;
      if (!confirm(`สลาย ${pet.name} เป็น Bitz ถาวร?`)) return;
      dismissPet(pet);
      closePetDetail();
    };
  }
}

// ── Page 2: Equipment ──
const RADIANT_GRADES = ['zeroday', 'apt'];
export function equipIconHtml(item, fallbackEmoji) {
  if (!item || !item.icon) return fallbackEmoji;
  const g = EQUIP_GRADES[item.grade] || EQUIP_GRADES.script;
  const radiant = RADIANT_GRADES.includes(item.grade);
  return `<img src="${item.icon}" class="eq-icon-img${radiant ? ' grade-radiant' : ''}" style="--eq-glow:${g.glow}" alt="">`;
}
export function potionIconHtml(item, cls = '') {
  if (!item) return '';
  if (item.img) return `<img src="${item.img}" class="${cls} pot-icon-img" alt="">`;
  return `<span class="${cls}">${item.icon}</span>`;
}
export function equipStatLine(item) {
  if (item.slotId === 'habit') {
    const c = HABIT_COLORS[item.color], t = HABIT_TYPES[item.type];
    if (!c || !t) return '';
    return `${habitIcon(c, 14)} ${c.name} · ${habitIcon(t, 14)} ${t.name}<br><span class="muted">${t.desc}</span>`;
  }
  if (item.effectId) {
    const eff = PAYLOAD_EFFECTS[item.effectId];
    if (!eff) return '';
    const gi = EQUIP_GRADE_KEYS.indexOf(item.grade);
    const mag = (eff.mag || [])[gi] || 0;
    const pct = mag > 0 ? ` (${Math.round(mag * 100)}%)` : '';
    return `${eff.icon} ${eff.name}${pct} — ${eff.desc}`;
  }
  return Object.keys(item.stats || {}).map(k => `${STAT_META[k].icon}+${item.stats[k]}`).join(' ');
}

// ── Habit card sprite — used ONLY in the picker modal rows ──
// The circuit board socket still shows habitIcon (the creature type icon).
// The picker (both equipped row + options list) shows the card PNG sprite.
//   lvlReq  1–5  → green  (common)
//   lvlReq  6–12 → blue   (rare)
//   lvlReq 13+   → purple (most rare)
function habitCardSpriteHtml(item, size) {
  const lvl = item.lvlReq || 1;
  const src = lvl <= 5  ? 'assets/ui/habit_card_green.png'
             : lvl <= 12 ? 'assets/ui/habit_card_blue.png'
             :              'assets/ui/habit_card_purple.png';
  return `<img src="${src}" class="eq-habit-card-sprite" style="width:${size}px;height:${size}px;object-fit:contain" alt="">`;
}

const EQ_SOCKET_LAYOUT = {
  payload:  { left: 27.5, top: 20.3, size: 17.5, round: false },
  exploit:  { left: 72.4, top: 20.3, size: 17.5, round: false },
  rootkit:  { left: 49.9, top: 49.9, size: 17.5, round: false },
  habit:    { left: 50.0, top: 79.2, size: 25.0, round: true },
};
function renderPdEquip() {
  const pet = PD.pet;
  const page = $('pd-page-equip');
  if (!page) return;
  page.innerHTML = '';
  const board = el('div', 'eq-board');
  board.innerHTML = `<img class="eq-board-bg" src="assets/ui/equip_circuit_bg.jpg" alt="">`;
  ALL_EQUIP_SLOT_KEYS.forEach(slotId => {
    const slot = EQUIP_SLOTS[slotId];
    const pos = EQ_SOCKET_LAYOUT[slotId];
    const item = pet.equip && pet.equip[slotId];
    const socket = el('div', 'eq-socket' + (pos.round ? ' eq-socket-round' : ' eq-socket-sq') + (item ? ' filled' : ''));
    socket.style.left = pos.left + '%';
    socket.style.top = pos.top + '%';
    socket.style.width = pos.size + '%';
    let inner;
    if (item) {
      // Circuit board: habit socket always shows the habit TYPE icon (goblin, bug, etc.).
      // Card sprites only appear inside the picker modal.
      inner = slotId === 'habit'
        ? habitIcon(HABIT_TYPES[item.type], 44)
        : equipIconHtml(item, slot.icon);
    } else {
      inner = `<span class="eq-socket-plus">+</span>`;
    }
    socket.innerHTML = `<span class="eq-socket-label">${slot.name}</span><span class="eq-socket-inner">${inner}</span>`;
    socket.onclick = () => openEquipPicker(pet, slotId);
    board.appendChild(socket);
  });
  page.appendChild(board);
  const hint = el('div', 'muted', `กระเป๋าอุปกรณ์: ${(G.equipBag||[]).length} ชิ้น — จัดการ/ขาย/สลาย ได้ที่คลัง`);
  hint.style.cssText = 'text-align:center;font-size:15px;margin-top:10px';
  page.appendChild(hint);
}
function openEquipPicker(pet, slotId) {
  modal(`เลือก ${EQUIP_SLOTS[slotId].name}`, body => {
    const current = pet.equip && pet.equip[slotId];
    if (current) {
      const g = equipGradeMeta(current);
      const row = el('div', 'eq-slot-row');
      row.style.setProperty('--grade', g.color);
      // Picker: habit shows card sprite (green/blue/purple by lvlReq).
      const iconHtml = slotId === 'habit'
        ? habitCardSpriteHtml(current, 26)
        : equipIconHtml(current, EQUIP_SLOTS[slotId].icon);
      row.innerHTML = `
        <div class="eq-slot-icon">${iconHtml}</div>
        <div class="eq-slot-info">
          <div class="eq-slot-name" style="color:${g.color}">${current.name}</div>
          <div class="eq-slot-sub">Lv.${current.lvlReq || 1} <span class="muted">(สวมอยู่)</span></div>
          <div class="eq-slot-stats">${equipStatLine(current)}</div>
        </div>
        <button class="btn small">ถอด</button>`;
      row.querySelector('button').onclick = () => { unequipItem(pet, slotId); closeModal(); renderPdEquip(); };
      body.appendChild(row);
    }
    const options = (G.equipBag || [])
      .filter(it => it.slotId === slotId && it.lvlReq <= pet.level)
      .sort((a,b) => EQUIP_GRADE_KEYS.indexOf(b.grade) - EQUIP_GRADE_KEYS.indexOf(a.grade));
    if (!options.length) {
      const empty = el('div', 'muted', 'ไม่มีอุปกรณ์ที่ใส่ได้ตอนนี้ (ต้องเลเวลถึง หรือดรอปจากศัตรูก่อน)');
      empty.style.cssText = 'padding:14px;text-align:center';
      body.appendChild(empty);
    } else {
      const list = el('div', 'eq-picker-list');
      options.forEach(item => {
        const g = equipGradeMeta(item);
        const row = el('div', 'eq-slot-row');
        row.style.setProperty('--grade', g.color);
        // Picker: habit shows card sprite (green/blue/purple by lvlReq).
        const itemIconHtml = slotId === 'habit'
          ? habitCardSpriteHtml(item, 26)
          : equipIconHtml(item, EQUIP_SLOTS[item.slotId].icon);
        row.innerHTML = `
          <div class="eq-slot-icon">${itemIconHtml}</div>
          <div class="eq-slot-info">
            <div class="eq-slot-name" style="color:${g.color}">${item.name}</div>
            <div class="eq-slot-sub">Lv.${item.lvlReq}</div>
            <div class="eq-slot-stats">${equipStatLine(item)}</div>
          </div>
          <button class="btn small primary">ใส่</button>`;
        row.querySelector('button').onclick = () => { equipItem(pet, item); closeModal(); renderPdEquip(); };
        list.appendChild(row);
      });
      body.appendChild(list);
    }
    const back = el('button', 'btn wide', '← กลับ');
    back.style.marginTop = '10px';
    back.onclick = () => closeModal();
    body.appendChild(back);
  });
}
