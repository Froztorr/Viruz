// ════════════════════════════════════════════════════════
// BOTNET — expedition screen
//
// Rendered as a modal rather than a registered screen: the whole flow
// is a short sequence of decisions (node → package → squad → wait →
// collect) and keeping it in a modal means index.html and ui-shell.js
// need no new markup or nav entry.
//
// All rules//math live in src/botnet.js — this file only renders them
// and banks the results.
// ════════════════════════════════════════════════════════

import {
  BOTNET_MAX_PETS, BOTNET_PACKAGES, RESCUE_FAIL_REWARD_MULT,
  applyExpeditionDamage, botnetNodes, choiceUnlocked, createExpedition,
  damagePctPerHour, eventById, expeditionProgressPct, expeditionReady,
  expeditionRemainingMs, hasAnimalHabit, nodeLevel, packageById,
  projectedDamage, projectedRewards, rescueSuccessChance, settleExpedition,
} from '../botnet.js';
import { zoneById } from '../data.js';
import { petState, statsOf } from '../engine.js';
import { equipIconHtml } from './pet-detail.js';
import { $, G, creatureMarkup, el, petById, save } from '../state.js';
import { closeModal, log, modal, renderHUD, toast } from '../ui-shell.js';

// ── draft state for the setup view (not persisted — only the launched
// run is, on G.botnet) ──
let draft = { zoneId: null, packageId: BOTNET_PACKAGES[0].id, petIds: [] };
let tickTimer = null;

function stopTick() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function fmtMs(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}ชม. ${m}น.`;
  if (m > 0) return `${m}น. ${s}ว.`;
  return `${s}ว.`;
}

// Pets eligible to be deployed: everything in the roster that is alive
// and not currently in the active battle team. Deploying a fighter
// would silently gut the team the player fights with, so the active
// team is held back rather than merely warned about.
function eligiblePets() {
  const teamIds = G.teamIds || [];
  return (G.roster || []).filter(p =>
    p && !teamIds.includes(p.uid) && petState(p) === 'alive');
}

function runPets(run) {
  return (run.petIds || []).map(id => petById(id)).filter(Boolean);
}

// ═══════════════ ENTRY ═══════════════
export function openBotnetModal() {
  stopTick();
  modal('🤖 Botnet', () => {});
  render();
  // The status view shows a live countdown, so repaint once a second.
  // Bail out (and stop) the moment the modal body is gone, which is
  // how closeModal() is detected without hooking into ui-shell.
  tickTimer = setInterval(() => {
    if (!$('modal-body')) { stopTick(); return; }
    if (G.botnet) render();
  }, 1000);
}

function render() {
  const body = $('modal-body');
  if (!body) { stopTick(); return; }
  if (G.botnet) renderStatus(body);
  else renderSetup(body);
}

// ═══════════════ SETUP ═══════════════
function renderSetup(body) {
  const nodes = botnetNodes();
  if (!draft.zoneId) draft.zoneId = (G.worldPos && G.worldPos.nodeId) || nodes[0].id;
  // The remembered node may not be a battle zone (e.g. the player is
  // standing in a safe spot), so fall back rather than render nothing.
  if (!nodes.some(z => z.id === draft.zoneId)) draft.zoneId = nodes[0].id;

  const zone = zoneById(draft.zoneId);
  const pkg = packageById(draft.packageId);
  const pool = eligiblePets();
  // Drop any queued pet that is no longer eligible (died, got added to
  // the team, etc. while this draft sat around).
  draft.petIds = draft.petIds.filter(id => pool.some(p => p.uid === id));
  const chosen = draft.petIds.map(id => petById(id)).filter(Boolean);
  const rw = projectedRewards(chosen, zone, pkg);

  const nodeChips = nodes.map(z => `
    <button class="chip-btn${z.id === draft.zoneId ? ' on' : ''}" data-node="${z.id}">
      ${z.thai || z.name} <span class="muted">Lv.${nodeLevel(z)}</span>
    </button>`).join('');

  const pkgChips = BOTNET_PACKAGES.map(p => `
    <button class="chip-btn${p.id === draft.packageId ? ' on' : ''}" data-pkg="${p.id}">
      ${p.short} <span class="muted">×${p.rewardMult}</span>
    </button>`).join('');

  let petRows = '';
  if (!pool.length) {
    petRows = `<div class="inv-empty-msg">ไม่มี VIRUZ ว่าง — ตัวที่อยู่ในทีมหลักหรือกำลังบาเจ็บ ส่งออกไปไม่ได้</div>`;
  } else {
    petRows = pool.map(p => {
      const on = draft.petIds.includes(p.uid);
      const dmg = projectedDamage(p, zone, pkg);
      const mhp = statsOf(p).mhp;
      const pctPerH = Math.round(damagePctPerHour(p, zone, pkg) * 100);
      // Flag anyone the run would actually knock out, so a squad isn't
      // wiped by a package the player didn't realise was lethal.
      const fatal = dmg >= p.hp;
      const animal = hasAnimalHabit(p);
      return `
        <div class="bn-row${on ? ' on' : ''}" data-pet="${p.uid}">
          <div class="bn-row-main">
            <b>${p.name}</b> <span class="muted">Lv.${p.level}</span>
            ${animal ? ' <span title="มีการ์ดนิสัยสัตว์ — ปลดล็อกตัวเลือกพิเศษเมื่อขอความช่วย">🐾</span>' : ''}
            <div class="muted" style="font-size:11px">
              HP ${p.hp}/${mhp} · คาดเสียหาย −${dmg} (${pctPerH}%/ชม.)
              ${fatal ? ' · <span style="color:#ff4d4d">อันตราย: อาจหมดสติ</span>' : ''}
            </div>
          </div>
          <div class="bn-row-check">${on ? '✅' : '➕'}</div>
        </div>`;
    }).join('');
  }

  body.innerHTML = `
    <div class="muted" style="margin-bottom:8px">
      ส่ง VIRUZ ที่ว่างไปยิงโหนดเพื่อเก็บ Bitz / EXP / อุปกรณ์ ระหว่างที่ออกไปพวกมันจะค่อย ๆ เสีย HP
      และอาจเรียกขอความช่วยกลับมา (สูงสุด ${BOTNET_MAX_PETS} ตัว)
    </div>

    <div class="bn-label">เลือกโหนด</div>
    <div class="bn-chips">${nodeChips}</div>

    <div class="bn-label">ระยะเวลา</div>
    <div class="bn-chips">${pkgChips}</div>

    <div class="bn-label">เลือกทีม (${draft.petIds.length}/${BOTNET_MAX_PETS})</div>
    <div class="bn-list">${petRows}</div>

    <div class="eqd" style="margin-top:10px;padding:8px">
      <div class="eqd-stat-row"><span>💰 Bitz</span><b>${rw.bitz}</b></div>
      <div class="eqd-stat-row"><span>✨ EXP (รวม)</span><b>${rw.exp}</b></div>
      <div class="eqd-stat-row"><span>🎁 อุปกรณ์</span><b>${chosen.length ? rw.gearRolls : 0} ชิ้น</b></div>
      <div class="eqd-stat-row"><span>⚠ โอกาสเรียกขอความช่วย</span><b>${Math.round(pkg.rescueChance * 100)}%</b></div>
    </div>

    <button class="btn wide primary" id="bn-launch" style="margin-top:10px"
      ${chosen.length ? '' : 'disabled'}>🚀 ส่งออกไป (${fmtMs(pkg.ms)})</button>`;

  body.querySelectorAll('[data-node]').forEach(b => {
    b.onclick = () => { draft.zoneId = b.dataset.node; render(); };
  });
  body.querySelectorAll('[data-pkg]').forEach(b => {
    b.onclick = () => { draft.packageId = b.dataset.pkg; render(); };
  });
  body.querySelectorAll('[data-pet]').forEach(row => {
    row.onclick = () => {
      const id = row.dataset.pet;
      const i = draft.petIds.indexOf(id);
      if (i !== -1) draft.petIds.splice(i, 1);
      else {
        if (draft.petIds.length >= BOTNET_MAX_PETS) {
          toast(`ส่งได้สูงสุด ${BOTNET_MAX_PETS} ตัว`);
          return;
        }
        draft.petIds.push(id);
      }
      render();
    };
  });
  const launch = $('bn-launch');
  if (launch) launch.onclick = () => {
    const pets = draft.petIds.map(id => petById(id)).filter(Boolean);
    if (!pets.length) { toast('เลือก VIRUZ ก่อน'); return; }
    G.botnet = createExpedition(pets, zoneById(draft.zoneId), packageById(draft.packageId));
    draft.petIds = [];
    save();
    log(`🤖 ส่ง ${pets.length} ตัวไปยิงโหนด`, 'info');
    render();
  };
}

// ═══════════════ STATUS ═══════════════
function renderStatus(body) {
  const run = G.botnet;
  const zone = zoneById(run.zoneId);
  const pkg = packageById(run.packageId);
  const pets = runPets(run);
  const ready = expeditionReady(run);
  const pct = expeditionProgressPct(run);
  const rw = projectedRewards(pets, zone, pkg);

  const petRows = pets.map(p => {
    const dmg = projectedDamage(p, zone, pkg);
    const mhp = statsOf(p).mhp;
    // Damage is only actually applied at collection, so show it as a
    // projection rather than pretending HP has already dropped.
    const after = Math.max(0, p.hp - dmg);
    return `
      <div class="bn-row">
        <div class="bn-row-main">
          <b>${p.name}</b> <span class="muted">Lv.${p.level}</span>
          <div class="muted" style="font-size:11px">HP ${p.hp} → ${after}/${mhp}${after <= 0 ? ' · <span style="color:#ff4d4d">จะหมดสติ</span>' : ''}</div>
        </div>
      </div>`;
  }).join('');

  body.innerHTML = `
    <div class="bn-label">${zone.thai || zone.name} <span class="muted">Lv.${nodeLevel(zone)} · ${pkg.label}</span></div>

    <div class="bn-progress"><div class="bn-progress-fill" style="width:${pct}%"></div></div>
    <div style="text-align:center;margin:6px 0 10px">
      ${ready
        ? '<b style="color:#3ddc84">กลับถึงแล้ว — พร้อมเก็บเกี่ยว</b>'
        : `<b>${pct}%</b> <span class="muted">· เหลืออีก ${fmtMs(expeditionRemainingMs(run))}</span>`}
    </div>

    <div class="bn-list">${petRows}</div>

    <div class="eqd" style="margin-top:10px;padding:8px">
      <div class="eqd-stat-row"><span>💰 Bitz</span><b>${rw.bitz}</b></div>
      <div class="eqd-stat-row"><span>✨ EXP (รวม)</span><b>${rw.exp}</b></div>
      <div class="eqd-stat-row"><span>🎁 อุปกรณ์</span><b>${rw.gearRolls} ชิ้น</b></div>
    </div>

    ${ready
      ? `<button class="btn wide primary" id="bn-collect" style="margin-top:10px">📦 เก็บเกี่ยวผล</button>`
      : `<button class="btn wide" id="bn-abort" style="margin-top:10px">✖ เรียกกลับ (ไม่ได้รางวัล)</button>`}`;

  const collect = $('bn-collect');
  if (collect) collect.onclick = () => onCollect(run);
  const abort = $('bn-abort');
  if (abort) abort.onclick = () => {
    // Recalling early still applies the damage taken so far would be
    // punishing twice over; the run is simply abandoned with no payout
    // and no damage, which is the least surprising outcome.
    G.botnet = null;
    save();
    toast('เรียกทีมกลับแล้ว');
    render();
  };
}

// ── collection: rescue prompt first (if one was pre-rolled), then payout
function onCollect(run) {
  if (run.rescue && !run.rescue.resolved) { renderRescue(run); return; }
  finishRun(run, run.rescue && !run.rescue.success ? RESCUE_FAIL_REWARD_MULT : 1);
}

function renderRescue(run) {
  const body = $('modal-body');
  if (!body) return;
  stopTick();   // freeze the countdown while the player is deciding
  const ev = eventById(run.rescue.eventId);
  const zone = zoneById(run.zoneId);
  const pet = petById(run.rescue.petId) || runPets(run)[0];
  if (!pet) { finishRun(run, 1); return; }

  const choices = ev.choices.map(c => {
    const unlocked = choiceUnlocked(pet, c);
    const chance = Math.round(rescueSuccessChance(pet, c, zone) * 100);
    return `
      <button class="btn wide bn-choice${unlocked ? '' : ' locked'}"
        data-choice="${c.id}" ${unlocked ? '' : 'disabled'} style="margin-bottom:8px;text-align:left">
        <div>${c.icon} ${c.label}</div>
        <div class="muted" style="font-size:11px">
          ${c.hint} · ${unlocked ? `สำเร็จ <b>${chance}%</b>` : '🔒 ล็อกอยู่'}
        </div>
      </button>`;
  }).join('');

  body.innerHTML = `
    <div class="eqd" style="padding:8px;margin-bottom:10px">
      <div style="font-weight:700;margin-bottom:4px">🆘 ${ev.title}</div>
      <div class="muted">${ev.text}</div>
    </div>
    <div style="text-align:center;margin-bottom:8px">
      <b>${pet.name}</b> <span class="muted">Lv.${pet.level} กำลังรอคำตอบ</span>
    </div>
    ${choices}
    <div class="muted" style="text-align:center;font-size:11px">
      ตอบผิด การเดินทางจบลง แต่ได้รางวัลเพียง ${Math.round(RESCUE_FAIL_REWARD_MULT * 100)}%
    </div>`;

  body.querySelectorAll('[data-choice]').forEach(btn => {
    btn.onclick = () => {
      const choice = ev.choices.find(c => c.id === btn.dataset.choice);
      if (!choice || !choiceUnlocked(pet, choice)) return;
      const chance = rescueSuccessChance(pet, choice, zone);
      const success = Math.random() < chance;
      run.rescue.resolved = true;
      run.rescue.success = success;
      save();
      log(success
        ? `🆘 ${pet.name} หนีออกมาได้สำเร็จ!`
        : `🆘 ${pet.name} ตัดสินผิดพลาด รางวัลลดลง`, success ? 'heal' : 'bad');
      finishRun(run, success ? 1 : RESCUE_FAIL_REWARD_MULT, { choice, success, pet });
    };
  });
}

// Applies damage, banks the payout, clears the run, then shows a
// summary. Order matters: damage first so a pet that drops is already
// Down before anything re-renders it.
function finishRun(run, rewardMult, rescueOutcome) {
  const pets = runPets(run);
  const downed = applyExpeditionDamage(run, pets);
  const res = settleExpedition(run, pets, rewardMult);

  G.bitz = (G.bitz || 0) + res.bitz;
  G.equipBag = G.equipBag || [];
  res.gear.forEach(g => G.equipBag.push(g));
  G.botnet = null;
  save();
  renderHUD();
  stopTick();

  const body = $('modal-body');
  if (!body) return;
  const gearRows = res.gear.map(g =>
    `<div class="eqd-stat-row"><span>${equipIconHtml(g, '🎁')} ${g.name}</span><b>Lv.${g.lvlReq}</b></div>`).join('');

  body.innerHTML = `
    <div style="text-align:center;font-size:34px;margin-bottom:6px">📦</div>
    <div style="text-align:center;font-weight:700;margin-bottom:8px">
      กลับจาก ${res.zone.thai || res.zone.name}
    </div>
    ${rescueOutcome ? `<div class="muted" style="text-align:center;margin-bottom:8px">
      ${rescueOutcome.success
        ? `✅ ${rescueOutcome.pet.name} รอดมาได้ — รางวัลเต็มจำนวน`
        : `❌ ${rescueOutcome.pet.name} ติดอยู่นาน — รางวัลเหลือ ${Math.round(RESCUE_FAIL_REWARD_MULT * 100)}%`}
    </div>` : ''}
    <div class="eqd" style="padding:8px">
      <div class="eqd-stat-row"><span>💰 Bitz</span><b>+${res.bitz}</b></div>
      <div class="eqd-stat-row"><span>✨ EXP (รวม)</span><b>+${res.exp}</b></div>
      ${gearRows}
    </div>
    ${downed.length ? `<div class="muted" style="text-align:center;margin-top:8px;color:#ff4d4d">
      ⚠ หมดสติ ${downed.length} ตัว: ${downed.map(p => p.name).join(', ')}
    </div>` : ''}
    <button class="btn wide primary" id="bn-again" style="margin-top:10px">🤖 ส่งรอบใหม่</button>`;

  log(`📦 Botnet กลับ: +${res.bitz} Bitz · +${res.exp} EXP · ${res.gear.length} อุปกรณ์`, 'info');
  const again = $('bn-again');
  if (again) again.onclick = () => openBotnetModal();
}
