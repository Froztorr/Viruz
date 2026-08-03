// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { ANTIVIRUZ, ATTR, DEFENSE_BOTS, GUARD_TIERS, RARITY, sellValueOf } from '../data.js';
import { powerOf, supportOf, synergyOf, uid } from '../engine.js';
import { openPetDetail, refreshPdTeamBtn } from './pet-detail.js';
import { $, G, activeTeam, attrIcon, defenseTeam, el, petById, save, setText } from '../state.js';
import { closeModal, currentMainId, modal, petCard, renderHUD, toast } from '../ui-shell.js';

// ═══════════════ SCREEN: HOME ═══════════════
function benchTeam() { return (G.benchIds || []).map(petById).filter(Boolean); }

// Shared by both the full Home Base screen and the lightweight
// Character screen (reachable from anywhere via the drawer knob) —
// both let the player rearrange their active team (max 3) and bench
// (max 2 reserves, swappable in any time), just via differently-
// prefixed element ids so the two screens' DOM stays independent.
function renderTeamBenchPanel(prefix) {
  const team = activeTeam();
  const bench = benchTeam();
  const syn = synergyOf(team);
  const sup = supportOf(team);

  const banner = $(prefix + 'synergy-banner');
  if (banner) {
    if (syn.label) {
      const a = ATTR[syn.attr];
      banner.className = 'syn-banner active';
      banner.style.setProperty('--attr', a.color);
      banner.innerHTML = `<b>${attrIcon(a, 15)} ${syn.label}</b> — สเตตัสทีม ×${syn.mult}`;
    } else {
      banner.className = 'syn-banner';
      banner.innerHTML = `ยังไม่มีซินเนอร์จี — จัดทีมให้มีธาตุซ้ำ 2 หรือ 3 ตัว`;
    }
  }
  const supLine = $(prefix + 'support-line');
  if (supLine) {
    if (sup.auraPct > 0 || sup.regenPct > 0) {
      const bits = [];
      if (sup.auraPct > 0)  bits.push(`บัฟ +${Math.round(sup.auraPct*100)}%`);
      if (sup.regenPct > 0) bits.push(`ฟื้น ${Math.round(sup.regenPct*100)}% ทุก 8 วิ`);
      supLine.textContent = '➕ ซัพพอร์ต: ' + bits.join(' · ');
      supLine.style.display = '';
    } else {
      supLine.style.display = 'none';
    }
  }

  const slots = $(prefix + 'team-slots');
  if (slots) {
    slots.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const pet = team[i];
      if (pet) {
        const c = petCard(pet, { onClick: p => openPetDetail(p, 0) });
        c.classList.add('in-team');
        slots.appendChild(c);
      } else {
        const empty = el('div', 'pet-card empty', `<div class="empty-mark">+</div><div class="empty-t">ช่องว่าง</div>`);
        slots.appendChild(empty);
      }
    }
  }

  const benchSlots = $(prefix + 'bench-slots');
  if (benchSlots) {
    benchSlots.innerHTML = '';
    for (let i = 0; i < 2; i++) {
      const pet = bench[i];
      if (pet) {
        const c = petCard(pet, { onClick: p => openPetDetail(p, 0) });
        c.classList.add('in-bench');
        benchSlots.appendChild(c);
      } else {
        const empty = el('div', 'pet-card empty small', `<div class="empty-mark">+</div><div class="empty-t">สำรอง</div>`);
        benchSlots.appendChild(empty);
      }
    }
  }

  const roster = $(prefix + 'roster-grid');
  if (roster) {
    roster.innerHTML = '';
    G.roster.forEach(pet => {
      const inTeam = G.teamIds.includes(pet.uid);
      const inBench = (G.benchIds || []).includes(pet.uid);
      const c = petCard(pet, {
        selected: inTeam || inBench,
        onClick: p => openPetDetail(p, 0),
      });
      if (inBench) c.classList.add('in-bench');
      roster.appendChild(c);
    });
  }
}

// ── CHARACTER SCREEN: DRAG-TO-SWAP ──
// The Character screen (drawer knob) only shows the current 5 team/
// bench slots — no wider roster, no add/remove (see refreshPdTeamBtn()
// hiding those buttons when currentMainId==='character' and the
// roster-grid removed from #screen-character in index.html). The only
// way to rearrange here is dragging one of the 5 onto another, which
// swaps their positions outright. A plain tap (no real drag) still
// falls through to the card's own onclick (open detail, read-only).
let charDragState = null;
function charSlotIndexOf(cardEl) {
  const teamWrap = $('char-team-slots'), benchWrap = $('char-bench-slots');
  if (teamWrap) { const i = Array.from(teamWrap.children).indexOf(cardEl); if (i !== -1) return i; }
  if (benchWrap) { const i = Array.from(benchWrap.children).indexOf(cardEl); if (i !== -1) return 3 + i; }
  return -1;
}
const CHAR_DRAG_THRESHOLD = 12;
export function wireCharSlotDrag() {
  ['char-team-slots', 'char-bench-slots'].forEach(id => {
    const wrap = $(id);
    if (!wrap) return;
    wrap.addEventListener('pointerdown', e => {
      const card = e.target.closest('.pet-card');
      if (!card || card.classList.contains('empty')) return;
      const idx = charSlotIndexOf(card);
      if (idx === -1) return;
      charDragState = { idx, startX: e.clientX, startY: e.clientY, dragging: false, ghost: null, pointerId: e.pointerId, sourceCard: card };
      try { card.setPointerCapture(e.pointerId); } catch (err) {}
    });
  });
  window.addEventListener('pointermove', onCharSlotDragMove);
  window.addEventListener('pointerup', onCharSlotDragEnd);
}
// Team and bench sit in separate stacked sections that don't both fit
// on a typical phone screen at once (each pet-card row alone can run
// ~300px tall) — dragging from one to the other needs the page to
// scroll while a finger is still down and can't also swipe. Auto-
// scrolls #win-main-body while the drag point sits near its top/bottom
// edge, same idea as any drag-and-drop list on a scrollable page.
let charAutoScrollTimer = null;
function updateCharAutoScroll(clientY) {
  const body = $('win-main-body');
  if (!body) return;
  const r = body.getBoundingClientRect();
  const EDGE = 70, MAXSPD = 14;
  let spd = 0;
  if (clientY < r.top + EDGE) spd = -MAXSPD * (1 - Math.max(0, clientY - r.top) / EDGE);
  else if (clientY > r.bottom - EDGE) spd = MAXSPD * (1 - Math.max(0, r.bottom - clientY) / EDGE);
  clearInterval(charAutoScrollTimer);
  charAutoScrollTimer = null;
  if (spd !== 0) {
    charAutoScrollTimer = setInterval(() => { body.scrollTop += spd; }, 16);
  }
}
function onCharSlotDragMove(e) {
  const s = charDragState;
  if (!s || e.pointerId !== s.pointerId) return;
  const dx = e.clientX - s.startX, dy = e.clientY - s.startY;
  if (!s.dragging) {
    if (Math.hypot(dx, dy) < CHAR_DRAG_THRESHOLD) return;
    s.dragging = true;
    // Carry just the creature sprite under the finger (same idea as
    // the battle potion/poison wheel's carried icon) instead of a
    // clone of the whole stat card -- cloning the full card centered
    // its large translucent body on the pointer with the actual
    // artwork sitting well above it, so nothing that looked like "the
    // pet" was ever actually under your finger.
    const spriteWrap = s.sourceCard.querySelector('.pc-sprite-wrap');
    const ghost = el('div', 'char-drag-ghost');
    ghost.innerHTML = spriteWrap ? spriteWrap.innerHTML : s.sourceCard.innerHTML;
    document.body.appendChild(ghost);
    s.ghost = ghost;
    s.sourceCard.classList.add('char-drag-source');
  }
  // Once a real drag has started, stop the gesture from also being
  // read as a page-scroll — touch-action:none on the cards (see CSS)
  // is the main guard, this is just a belt-and-suspenders backstop so
  // the ghost never stutters/loses tracking mid-drag.
  if (e.cancelable) e.preventDefault();
  if (s.ghost) {
    s.ghost.style.left = e.clientX + 'px';
    s.ghost.style.top = e.clientY + 'px';
  }
  updateCharAutoScroll(e.clientY);
  document.querySelectorAll('#char-team-slots .pet-card, #char-bench-slots .pet-card')
    .forEach(c => c.classList.remove('char-drop-hover'));
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const targetCard = under && under.closest('.pet-card');
  if (targetCard && targetCard !== s.sourceCard &&
      (targetCard.parentElement.id === 'char-team-slots' || targetCard.parentElement.id === 'char-bench-slots')) {
    targetCard.classList.add('char-drop-hover');
  }
}
function onCharSlotDragEnd(e) {
  const s = charDragState;
  if (!s || e.pointerId !== s.pointerId) return;
  charDragState = null;
  clearInterval(charAutoScrollTimer);
  charAutoScrollTimer = null;
  if (s.ghost) s.ghost.remove();
  if (s.sourceCard) s.sourceCard.classList.remove('char-drag-source');
  document.querySelectorAll('.char-drop-hover').forEach(c => c.classList.remove('char-drop-hover'));
  if (!s.dragging) return; // plain tap -- let the card's own onclick handle it
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const targetCard = under && under.closest('.pet-card');
  if (!targetCard) return;
  const toIdx = charSlotIndexOf(targetCard);
  if (toIdx === -1 || toIdx === s.idx) return;
  // Rebuild both arrays from scratch out of a padded 5-slot model
  // (3 team + 2 bench, empty slots as null) instead of poking a raw
  // index directly into G.teamIds/G.benchIds — those arrays are
  // normally *compacted* (no gaps) by every other code path, so a
  // partial write that left a hole behind (e.g. dragging into an
  // empty slot) would silently desync compacted display-index reads
  // from raw storage-index writes on the very next drag, duplicating
  // one pet and dropping another. Always deriving both arrays fresh
  // from actual pet references here makes that class of bug
  // impossible regardless of how many empty slots are involved.
  const slots = [0, 1, 2].map(i => activeTeam()[i] || null)
    .concat([0, 1].map(i => benchTeam()[i] || null));
  const tmp = slots[s.idx];
  slots[s.idx] = slots[toIdx];
  slots[toIdx] = tmp;
  G.teamIds = slots.slice(0, 3).filter(Boolean).map(p => p.uid);
  G.benchIds = slots.slice(3).filter(Boolean).map(p => p.uid);
  save();
  renderCharacter();
  renderHUD();
}

export function renderHome() {
  renderTeamBenchPanel('');
  renderDefensePanel();
  renderHUD();
}
export function renderCharacter() {
  renderTeamBenchPanel('char-');
  renderHUD();
}

export function addToTeam(id) {
  if (G.teamIds.includes(id)) return;
  if (G.teamIds.length >= 3) { toast('ทีมเต็มแล้ว (สูงสุด 3)'); return; }
  G.benchIds = (G.benchIds || []).filter(x => x !== id);
  G.teamIds.push(id);
  save(); renderHome(); renderCharacter();
}
export function removeFromTeam(id) {
  G.teamIds = G.teamIds.filter(x => x !== id);
  save(); renderHome(); renderCharacter();
}
export function addToBench(id) {
  G.benchIds = G.benchIds || [];
  if (G.benchIds.includes(id) || G.teamIds.includes(id)) return;
  if (G.benchIds.length >= 2) { toast('ตัวสำรองเต็มแล้ว (สูงสุด 2)'); return; }
  G.benchIds.push(id);
  save(); renderHome(); renderCharacter();
}
export function removeFromBench(id) {
  G.benchIds = (G.benchIds || []).filter(x => x !== id);
  save(); renderHome(); renderCharacter();
}

// Dismissing a spare pet for Bitz — only ever offered for pets that
// aren't on the active team or bench (those must be pulled first),
// scaled the same way equipment's sellValueOf() is: a flat rate off
// level, nudged up for rarer pets.
function bitzValueOfPet(pet) {
  const rar = RARITY[pet.rarity] || {};
  return Math.round(20 * pet.level * (1 + (rar.statPL || 0) * 0.3));
}
export function dismissPet(pet) {
  if (G.teamIds.includes(pet.uid) || (G.benchIds || []).includes(pet.uid)) {
    toast('ถอดออกจากทีม/สำรองก่อนสลาย'); return;
  }
  if (G.roster.length <= 1) { toast('ต้องมี VIRUZ อย่างน้อย 1 ตัว'); return; }
  const val = bitzValueOfPet(pet);
  G.roster = G.roster.filter(p => p.uid !== pet.uid);
  G.bitz += val;
  save();
  toast(`สลาย ${pet.name} +${val} Bitz`);
  renderHome(); renderCharacter();
}

export function renderDefensePanel() {
  const wrap = $('defense-slots');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const pet = petById(G.defenseIds[i]);
    if (pet) {
      const c = petCard(pet, { onClick: p => {
        G.defenseIds = G.defenseIds.filter(x => x !== p.uid);
        save(); renderDefensePanel();
      }});
      c.classList.add('in-def');
      wrap.appendChild(c);
    } else {
      const e = el('div', 'pet-card empty small', `<div class="empty-mark">🛡</div><div class="empty-t">ว่าง</div>`);
      e.onclick = () => openDefensePicker();
      wrap.appendChild(e);
    }
  }
  const botWrap = $('bot-list');
  if (botWrap) {
    botWrap.innerHTML = '';
    if (!G.bots.length) {
      botWrap.appendChild(el('div','muted','ยังไม่มีบอทป้องกัน'));
    }
    G.bots.forEach((b, i) => {
      const def = DEFENSE_BOTS.find(d => d.id === b.id);
      if (!def) return;
      botWrap.appendChild(el('div','bot-chip',
        `${def.icon} ${def.name} <small>DEF ${def.power.def}</small>`));
    });
  }
  const guardWrap = $('guard-status');
  if (guardWrap) {
    const tierDef = GUARD_TIERS.find(g => g.tier === G.guardTier);
    guardWrap.innerHTML = tierDef
      ? `<div class="bot-chip">🛡️ ${tierDef.name} <small>ATK ${ANTIVIRUZ[tierDef.defId].base.atk} · DEF ${ANTIVIRUZ[tierDef.defId].base.def}</small></div>`
      : `<div class="muted">ยังไม่มี Security Package — ซื้อได้ที่ Tech Shop</div>`;
  }
  const guardTierDef = GUARD_TIERS.find(g => g.tier === G.guardTier);
  const guardDefBase = guardTierDef ? ANTIVIRUZ[guardTierDef.defId].base : null;
  const dp = defenseTeam().reduce((s,p) => s + powerOf(p), 0) +
             G.bots.reduce((s,b) => {
               const d = DEFENSE_BOTS.find(x => x.id === b.id);
               return s + (d ? d.power.atk*2 + d.power.def*1.6 : 0);
             }, 0) +
             (guardDefBase ? guardDefBase.atk*2 + guardDefBase.def*1.6 : 0);
  setText('defense-power', Math.floor(dp).toLocaleString());
}

function openDefensePicker() {
  const avail = G.roster.filter(p => !G.defenseIds.includes(p.uid));
  if (!avail.length) { toast('ไม่มี VIRUZ ว่าง'); return; }
  modal('เลือก VIRUZ ป้องกันฐาน', wrap => {
    const grid = el('div','modal-grid');
    avail.forEach(p => {
      const c = petCard(p, { onClick: pet => {
        if (G.defenseIds.length < 3) G.defenseIds.push(pet.uid);
        save(); renderDefensePanel(); closeModal();
      }});
      grid.appendChild(c);
    });
    wrap.appendChild(grid);
  });
}

