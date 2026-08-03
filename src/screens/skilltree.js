// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { AILMENTS, MUTATIONS, SPECIALS, STAT_META, treeFor, treeForMutation } from '../data.js';
import { canTakeNode, healTeam, takeNode, uid } from '../engine.js';
import { renderSkillBar } from '../battle/extras.js';
import { $, G, activeTeam, creatureMarkup, el, save, setText } from '../state.js';
import { closeModal, log, modal, renderHUD, toast } from '../ui-shell.js';

// ── SKILL TREE SCREEN ──
// Circular nodes connected by branches, coloured by attribute.
// Taking a node costs 1 growth point and requires its parents maxed.
export let treePetId = null;
export function setTreePetId(v) { treePetId = v; }
// Which tree is currently displayed: 'attr' (always available) or
// 'mutation' (only once stage 2 + a mutation has rolled). Reset
// whenever a different pet is viewed so switching pets doesn't leave
// you stuck on a tree that pet doesn't have.
let treeViewMode = 'attr';

export function renderTree() {
  const pet = G.roster.find(p => p.uid === treePetId) || activeTeam()[0] || G.roster[0];
  if (!pet) return;
  if (pet.uid !== treePetId) treeViewMode = 'attr';
  treePetId = pet.uid;

  const attrTree = treeFor(pet.attr);
  const mutTree = (pet.stage >= 2 && pet.mutation) ? treeForMutation(pet.mutation) : null;
  const tree = (treeViewMode === 'mutation' && mutTree) ? mutTree : attrTree;
  const spent = pet.tree || {};

  // Toggle between the two trees — only shown once a mutation tree
  // actually exists for this pet.
  const titleEl = $('tree-name');
  const toggleHost = titleEl && titleEl.parentElement;
  if (toggleHost) {
    let toggle = document.getElementById('tree-mode-toggle');
    if (!mutTree) {
      if (toggle) toggle.remove();
    } else {
      if (!toggle) {
        toggle = el('span', 'tree-mode-toggle');
        toggle.id = 'tree-mode-toggle';
        toggleHost.appendChild(toggle);
      }
      const mInfo = MUTATIONS[pet.mutation] || {};
      toggle.innerHTML = `
        <button class="chip-btn${treeViewMode==='attr'?' on':''}" data-mode="attr">${attrTree.name}</button>
        <button class="chip-btn${treeViewMode==='mutation'?' on':''}" data-mode="mutation">${mInfo.name || 'Mutation'}</button>`;
      toggle.querySelectorAll('button').forEach(b => {
        b.onclick = () => { treeViewMode = b.dataset.mode; renderTree(); };
      });
    }
  }

  // pet picker
  const picker = $('tree-picker');
  if (picker) {
    picker.innerHTML = '';
    G.roster.forEach(p => {
      const chip = el('button','care-chip' + (p.uid === treePetId ? ' on' : ''));
      chip.innerHTML = `${creatureMarkup(p,'care-chip-sprite')}<span>${p.name}</span>`;
      chip.onclick = () => { treePetId = p.uid; renderTree(); };
      picker.appendChild(chip);
    });
  }

  setText('tree-name', tree.name);
  setText('tree-thai', tree.thai);
  setText('tree-pts', pet.growthPts || 0);

  // canvas
  const host = $('tree-canvas');
  if (!host) return;
  host.style.setProperty('--tree-color', tree.color);
  // Stained-glass background art, one per attribute/mutation — matches
  // the tree currently being viewed (toggle switches attr <-> mutation).
  const bgKey = (treeViewMode === 'mutation' && mutTree) ? pet.mutation : pet.attr;

  // branches first (SVG under the nodes)
  const lines = tree.nodes.flatMap(n =>
    n.req.map(r => {
      const p = tree.nodes.find(x => x.id === r);
      if (!p) return '';
      const taken = (spent[n.id] || 0) > 0;
      return `<line x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}"
                class="tree-line${taken ? ' on' : ''}" />`;
    })
  ).join('');

  const nodesHtml = tree.nodes.map(n => {
    const rank = spent[n.id] || 0;
    const maxed = rank >= n.max;
    const chk = canTakeNode(pet, n.id);
    const state = maxed ? 'maxed' : rank > 0 ? 'part' : chk.ok ? 'open' : 'locked';
    // Skill nodes get the uploaded magic-circle art as a background
    // (visually distinct from a plain stat node), with the sparkle
    // glyph layered on top so it's still readable at small sizes.
    const label = n.kind === 'stat' ? `${STAT_META[n.stat].icon}` : '✦';
    const sub = n.kind === 'stat'
      ? `+${n.per} ${STAT_META[n.stat].name}`
      : SPECIALS[n.skill].name;
    const nodeStyle = `left:${n.x}%;top:${n.y}%` +
      (n.kind === 'skill' ? `;background-image:url('assets/icons/skillnode.png')` : '');
    return `
      <button class="tree-node ${state} ${n.kind}" data-node="${n.id}"
              style="${nodeStyle}">
        <span class="tn-icon">${label}</span>
        <span class="tn-rank">${rank}/${n.max}</span>
        <span class="tn-tip">${sub}<br><i>Lv.${n.reqLv}+</i></span>
      </button>`;
  }).join('');

  host.innerHTML = `
    <img class="tree-canvas-bg" src="assets/ui/tree_bg_${bgKey}.jpg" alt="">
    <div class="tree-canvas-scrim"></div>
    <svg class="tree-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>
    ${nodesHtml}`;

  host.querySelectorAll('.tree-node').forEach(btn => {
    btn.onclick = () => openSkillExplainer(pet, tree, btn.dataset.node, 'tree');
  });
}

// ── SKILL EXPLAINER FLOATING WINDOW ──
// Opened from the skill tree (a node) or from the pet status window (an
// unlocked special). Shows what the node/skill actually does, and for
// tree nodes a confirm button that actually spends the point — so a
// point never gets spent by an accidental tap.
export function openSkillExplainer(pet, tree, nodeId, originScreen) {
  const node = tree.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const spent = pet.tree || {};
  const rank = spent[nodeId] || 0;
  const chk = canTakeNode(pet, nodeId);

  let title, body;
  if (node.kind === 'stat') {
    const meta = STAT_META[node.stat];
    title = `${meta.icon} +${meta.name}`;
    body = `
      <div class="se-desc">เพิ่ม ${meta.name} (${meta.thai}) ทีละ ${node.per} แต้มต่อระดับ</div>
      <div class="se-meta">
        <span>ระดับปัจจุบัน <b>${rank}/${node.max}</b></span>
        <span>ต้องการเลเวล <b>${node.reqLv}+</b></span>
      </div>
      ${node.max > 3 ? `<div class="se-note">ลงถึง 3/${node.max} จะปลดล็อกโหนดถัดไปให้เลือกเล่นต่อได้ทันที — ไม่ต้องเต็มก่อน</div>` : ''}`;
  } else {
    const sp = SPECIALS[node.skill];
    title = `✦ ${sp.name}`;
    const parts = [];
    if (sp.pw > 0) parts.push(`ดาเมจ ${Math.round(sp.pw*100)}% ${sp.hits>1?`x${sp.hits} ครั้ง`:''}`);
    if (sp.heal) parts.push(`ฟื้น HP ${Math.round(sp.heal*100)}% ให้ตัวเอง`);
    if (sp.healTeam) parts.push(`ฟื้น HP ${Math.round(sp.healTeam*100)}% ให้ทั้งทีม`);
    if (sp.shieldSelf) parts.push(`ลดดาเมจ ${Math.round(sp.shieldSelf*100)}% 3 เทิร์น`);
    if (sp.ailment) { const A = AILMENTS[sp.ailment.id]; if (A) parts.push(`ทำให้ศัตรู${A.thai} ${sp.ailment.turns} เทิร์น`); }
    if (sp.buffSelf) parts.push(`เสริมพลังตัวเอง ${sp.buffSelf.turns} เทิร์น`);
    if (sp.cleanse) parts.push('ล้างสถานะผิดปกติ');
    if (sp.reviveTeam) parts.push(`ชุบชีวิตเพื่อน ${Math.round(sp.reviveTeam*100)}% HP`);
    body = `
      <div class="se-desc">${sp.thai} — ${sp.desc}</div>
      <div class="se-meta">
        <span>MP <b>${sp.mp}</b></span>
        <span>ต้องการเลเวล <b>${node.reqLv}+</b></span>
      </div>
      ${parts.length ? `<ul class="se-effects">${parts.map(p=>`<li>${p}</li>`).join('')}</ul>` : ''}
      ${rank > 0 ? '<div class="se-note">ปลดล็อกแล้ว — ตั้งค่าอัตโนมัติได้ในหน้าสถานะ</div>' : ''}`;
  }

  modal(title, body_el => {
    body_el.innerHTML = body;
    if (originScreen === 'tree' && rank < node.max) {
      const btn = el('button', 'btn primary wide', chk.ok ? `ลงแต้ม (เหลือ ${pet.growthPts||0})` : chk.why);
      btn.disabled = !chk.ok;
      btn.onclick = () => {
        const res = takeNode(pet, nodeId);
        if (!res.ok) { toast(res.why); return; }
        if (node.kind === 'skill') {
          const sp = SPECIALS[node.skill];
          // Unlocking a skill no longer force-enables auto-cast — it used
          // to flip this on immediately, so a fresh unlock could silently
          // burn a pet's MP on turn 1 of its very next fight before the
          // player ever touched the skill bar. Stays off until they
          // explicitly toggle it on (see renderSkillBar()), matching the
          // note below this button.
          toast(`ปลดล็อก ${sp.name}!\n${sp.desc}`);
          log(`✦ ${pet.name} ปลดล็อก ${sp.name}`, 'win');
        } else {
          toast(`+${node.per} ${STAT_META[node.stat].name}`);
        }
        save(); closeModal(); renderTree(); renderHUD();
      };
      body_el.appendChild(btn);
    }
  });
}

