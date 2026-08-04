// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { AILMENTS, ART2_SPECIES, GUARD_TIERS, POTIONS, RAID_LOSS_BITZ, buildLootMenu, chanceToEnemyMult, guardTierForLevel } from '../data.js';
import { buildHackPuzzle, checkHackGuess, computeDamage, grantExp, hasAilment, statsOf, teamAlive, teamPower, uid } from '../engine.js';
import { ELITE_NAME_COLOR, eliteDisplayName } from '../heat.js';
import { NET } from '../net.js';
import { creatureMarkupFor } from '../sprites.js';
import { startRaidFight } from './encounters.js';
import { applyPayloadOnHit } from './equipment.js';
import { playSpellVFX, renderPotionBar, renderSkillBar, wait } from './extras.js';
import { activeAlly, activeFoe, applyDamage, applyHabitPostHit, fireBonusCrit, requestBonusCrit, runTurn, statBuffChips } from './turn-loop.js';
import { $, G, activeTeam, battle, battleSpeed, creatureMarkup, el, save, setText } from '../state.js';
import { log, renderAll, showScreen, toast } from '../ui-shell.js';

// ── DAMAGE/IMPACT PRESENTATION ──
export function showBanner(text, cls = '') {
  const layer = $('banner-layer') || $('fx-layer');
  if (!layer) return Promise.resolve();
  const b = el('div', 'turn-banner ' + cls, text);
  layer.appendChild(b);
  return new Promise(resolve => {
    setTimeout(() => {
      b.classList.add('out');
      setTimeout(() => { b.remove(); resolve(); }, 150 / battleSpeed);
    }, 150 / battleSpeed);
  });
}

function impactBurst(unitEl, crit) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  const b = el('div', 'impact-burst' + (crit ? ' crit' : ''));
  b.style.left = (r.left - host.left + r.width / 2) + 'px';
  b.style.top = (r.top - host.top + r.height * 0.5) + 'px';

  // The burst was rendering EMPTY (zero-size div, nothing visible) —
  // the inner slash/streak/spark elements the CSS styles were never
  // being created. Build them here. Bigger than before per feedback:
  // a prominent slash arc, several outward streaks, and a ring of
  // sparks so a hit actually reads on screen.
  const slash = el('div', 'slash');
  b.appendChild(slash);
  const streakCount = crit ? 7 : 5;
  for (let i = 0; i < streakCount; i++) {
    const st = el('div', 'streak');
    const ang = (360 / streakCount) * i + (Math.random() * 20 - 10);
    st.style.transform = `rotate(${ang}deg)`;
    st.style.setProperty('--len', (crit ? 150 : 110) + Math.random() * 30 + 'px');
    b.appendChild(st);
  }
  const sparkCount = crit ? 12 : 8;
  for (let i = 0; i < sparkCount; i++) {
    const sp = el('div', 'spark');
    sp.style.setProperty('--a', (360 / sparkCount * i) + 'deg');
    sp.style.setProperty('--d', (crit ? 90 : 60) + Math.random() * 30 + 'px');
    b.appendChild(sp);
  }

  layer.appendChild(b);
  setTimeout(() => b.remove(), 600);
}

// Shows ONE hit's own damage number. Multi-hit skills call this once
// per hit (see playAttackSequence) with that hit's individual roll —
// no more "×N" multiplier badge bundling every hit into a single
// number that lands well after the swing that supposedly caused it.
function floatDamage(anchorEl, amount, crit) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !anchorEl) return;
  const host = stage.getBoundingClientRect();
  const r = anchorEl.getBoundingClientRect();
  const wrap = el('div', 'dmg-big' + (crit ? ' crit' : ''));
  wrap.style.left = (r.left - host.left + r.width / 2) + 'px';
  wrap.style.top = (r.top - host.top + r.height * 0.2) + 'px';
  wrap.style.setProperty('--tilt', (Math.random() * 14 - 7).toFixed(1) + 'deg');
  wrap.innerHTML = `<span class="dmg-num">${amount}${crit ? '!!' : ''}</span>`;
  layer.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1050);
}

// "Miss!" callout on the target, paired with the evade-recoil blur —
// see playHit().
function missPop(unitEl) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  const d = el('div', 'miss-pop', 'Miss!');
  d.style.left = (r.left - host.left + r.width / 2) + 'px';
  d.style.top = (r.top - host.top + r.height * 0.25) + 'px';
  layer.appendChild(d);
  setTimeout(() => d.remove(), 800);
}

export function healPop(pet, amount) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  const unitEl = document.querySelector(`.bunit[data-uid="${pet.uid}"]`);
  if (!layer || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  const d = el('div', 'heal-pop', `+${amount}`);
  d.style.left = (r.left - host.left + r.width / 2) + 'px';
  d.style.top = (r.top - host.top + r.height * 0.2) + 'px';
  layer.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

export function poisonPop(pet, amount) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  const unitEl = document.querySelector(`.bunit[data-uid="${pet.uid}"]`);
  if (!layer || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  const d = el('div', 'poison-pop', `-${amount}`);
  d.style.left = (r.left - host.left + r.width / 2) + 'px';
  d.style.top = (r.top - host.top + r.height * 0.3) + 'px';
  layer.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

// ── ATTACK SEQUENCE ──
// Plays the full exchange for an already-resolved computeDamage()
// result: a miss (the target blurs and recoils back, "Miss!"), or one
// approach-and-strike per hit in res.hitDmgs. Each hit's damage
// number, hit-flash/shake, and HP (+MP) gauge update all land in the
// same instant as the attacker's contact frame — see playHit — and
// each hit after the first plays faster than the last, so a x2/x3/x4/
// x5 skill still resolves in a few seconds instead of multiplying the
// single-hit time by the hit count. Stops early if the target dies
// partway through a combo (no point animating hits on a corpse).
export async function playAttackSequence(attacker, target, res, side, contactVfx) {
  if (res.evaded) {
    await playHit(attacker, target, 0, res, side, 1, contactVfx);
    return;
  }
  const hits = (res.hitDmgs && res.hitDmgs.length) ? res.hitDmgs : [res.dmg];
  for (let i = 0; i < hits.length; i++) {
    if (target.hp <= 0) break;
    const speedMult = 1 + i * 0.5; // 1, 1.5, 2, 2.5, 3 — each hit faster
    await playHit(attacker, target, hits[i], res, side, speedMult, contactVfx);
    applyPayloadOnHit(attacker, target, { dmg: hits[i], evaded: false, crit: res.crit }, side);
    applyHabitPostHit(attacker, target, { dmg: hits[i], evaded: false, phantomBlocked: res.phantomBlocked }, side);
  }
}

// One approach-and-strike beat: wind-up -> lunge toward target -> the
// last frame of the lunge IS the contact frame, where the hit-flash,
// damage number, and HP/MP gauge repaint all fire together -> ease
// back. `speedMult` compresses the approach+contact timing for combo
// hits after the first (capped so it never gets too fast to read);
// `res` carries crit/evaded which apply to every hit in a combo alike
// (computeDamage rolls crit once for the whole attack, not per hit).
export async function playHit(attacker, target, hitDmg, res, side, speedMult, contactVfx) {
  const aEl = document.querySelector(`.bunit[data-uid="${attacker.uid}"]`);
  const tEl = document.querySelector(`.bunit[data-uid="${target.uid}"]`);
  if (!aEl || !tEl) return;

  // Faster baseline than before per feedback, and combo hits compress
  // further still — floored so even a x5 skill stays readable.
  const windMs   = Math.max(90,  170 / speedMult);
  const lungeMs  = Math.max(110, 210 / speedMult);
  const hitMs    = Math.max(160, 300 / speedMult);
  const returnMs = Math.max(90,  170 / speedMult);
  aEl.style.setProperty('--wind-ms', (windMs / battleSpeed) + 'ms');
  aEl.style.setProperty('--lunge-ms', (lungeMs / battleSpeed) + 'ms');
  aEl.style.setProperty('--return-ms', (returnMs / battleSpeed) + 'ms');
  tEl.style.setProperty('--hit-ms', (hitMs / battleSpeed) + 'ms');
  // Direction the charge (and, for a miss, the target's recoil) should
  // travel: ally lunges right (+1), foe lunges left (-1).
  aEl.style.setProperty('--dir', side === 'ally' ? 1 : -1);
  tEl.style.setProperty('--dir', side === 'ally' ? 1 : -1);
  if (res.crit && !res.evaded) aEl.classList.add('crit-attack');

  // Force a reflow before (re)starting each animation class so a
  // rapid combo always restarts these keyframes from frame 0 — without
  // it, re-adding a class whose animation the browser considers still
  // "current" can silently no-op the restart, which was the flakier
  // half of the "hit-flash doesn't always play" report (worse on
  // phones, where a dropped compositor frame makes it more likely the
  // browser sees the class as never having left).
  aEl.classList.remove('wind-up'); void aEl.offsetWidth;
  aEl.classList.add('wind-up');
  await wait(windMs / battleSpeed);
  aEl.classList.remove('wind-up');
  aEl.classList.add('lunge-out');
  await wait(lungeMs / battleSpeed);
  aEl.classList.remove('lunge-out');
  aEl.classList.add('lunge-back');

  // ── CONTACT — the last frame of the approach IS this instant ──
  if (res.evaded) {
    tEl.classList.remove('evade-recoil'); void tEl.offsetWidth;
    tEl.classList.add('evade-recoil');
    missPop(tEl);
    await wait(Math.min(460, hitMs) / battleSpeed);
    tEl.classList.remove('evade-recoil');
  } else {
    await applyDamage(target, hitDmg, side);
    impactBurst(tEl, res.crit);
    floatDamage(tEl, hitDmg, res.crit);
    if (contactVfx) playSpellVFX(contactVfx, attacker, target, side);
    tEl.classList.remove('hit'); void tEl.offsetWidth;
    tEl.classList.add('hit');
    refreshUnitVitals(target, !!target.isEnemy);
    await wait(hitMs / battleSpeed);
    tEl.classList.remove('hit');
  }

  aEl.classList.remove('lunge-back');
  aEl.classList.remove('crit-attack');
  await wait(returnMs / battleSpeed);
}

// Updates one .vital gauge (HP heart or MP circle) already in the DOM
// in place — same clip-path-from-the-top math as vitalHtml() above.
function updateVital(container, pct, num) {
  if (!container) return;
  const clipTop = Math.max(0, Math.min(100, 100 - pct));
  const fill = container.querySelector('.vital-fill');
  if (fill) fill.style.clipPath = `inset(${clipTop}% 0 0 0)`;
  const numEl = container.querySelector('.vital-num');
  if (numEl) numEl.textContent = num;
}

// Refreshes ONE specific pet's plate — HP heart, MP circle (ally
// only), boss bar, and stat-buff chips — keyed off the pet object
// itself rather than re-deriving "whoever's active" via activeAlly()/
// activeFoe(). That distinction matters at the instant a hit is
// lethal: activeFoe()/activeAlly() filter to hp>0, so the exact unit
// that just died is invisible to a lookup-based refresh and its plate
// was stuck showing its last positive HP forever instead of 0 — this
// is what let a corpse's heart never visibly empty before the
// explode-shard effect played. Called with the concrete attacker/
// target references at the moment of contact (see playHit) sidesteps
// that entirely.
function refreshUnitVitals(pet, isEnemy) {
  if (!pet) return;
  const plate = $(isEnemy ? 'plate-foe' : 'plate-ally');
  if (!plate) return;
  const hpMax = pet.isBoss ? (pet.bossPhase === 2 ? pet.hpPhase2Max : statsOf(pet).mhp) : statsOf(pet).mhp;
  const hpPct = Math.max(0, Math.min(100, Math.round(pet.hp / Math.max(1, hpMax) * 100)));
  updateVital(plate.querySelector('.np-hp .vital'), hpPct, Math.max(0, pet.hp));
  if (!isEnemy) {
    const mpMax = statsOf(pet).int;
    const mpPct = Math.round((pet.mp || 0) / Math.max(1, mpMax) * 100);
    updateVital(plate.querySelector('.np-mp .vital'), mpPct, Math.max(0, pet.mp || 0));
  }
  if (pet.isBoss) {
    const bar = plate.querySelector('.boss-hpbar');
    if (bar) {
      bar.className = `boss-hpbar phase${pet.bossPhase}`;
      const fill = bar.querySelector('i');
      if (fill) fill.style.width = hpPct + '%';
    }
    const tag = plate.querySelector('.np-boss-tag');
    if (tag) tag.textContent = `⚠ BOSS${pet.bossPhase===2?' · RAGE':''}`;
  }
  const buffsEl = plate.querySelector('.np-buffs');
  if (buffsEl) buffsEl.innerHTML = statBuffChips(pet);
  const spdPct = Math.round(Math.min(1, pet.spdCounter || 0) * 100);
  updateGaugeBar(plate.querySelector('.gauge-bar.spd'), spdPct, false);
  const critPct = Math.round(Math.min(1, pet.critGauge || 0) * 100);
  updateGaugeBar(plate.querySelector('.gauge-bar.crit'), critPct, critPct >= 100);
  if (!isEnemy) refreshHitButton(pet);

  // Ailment badges/stoned overlay/tappable-ready glow can all change
  // turn-to-turn (freeze/charm/corrupt expiring, poison/frenzy gaining
  // stacks, the crit gauge filling) — kept live here too instead of
  // only at the next full renderBattleSide.
  const unitEl = document.querySelector(`.bunit[data-uid="${pet.uid}"]`);
  if (unitEl) {
    const badgesHtml = ailBadgesHtml(pet);
    let badgesEl = unitEl.querySelector('.ail-badges');
    if (badgesHtml) {
      if (!badgesEl) { badgesEl = el('div', 'ail-badges'); unitEl.prepend(badgesEl); }
      badgesEl.innerHTML = badgesHtml;
    } else if (badgesEl) {
      badgesEl.remove();
    }
    const isStoned = hasAilment(pet, 'stoned');
    let stonedEl = unitEl.querySelector('.stoned-overlay');
    if (isStoned && !stonedEl) {
      stonedEl = el('div', 'stoned-overlay', AILMENTS.stoned.icon);
      unitEl.appendChild(stonedEl);
    } else if (!isStoned && stonedEl) {
      stonedEl.remove();
    }
    updateCurseTint(pet, unitEl);
    unitEl.classList.toggle('crit-ready', !isEnemy && critPct >= 100);
  }
}

export function refreshBattleUnits() {
  if (!battle) return;
  refreshUnitVitals(activeAlly(), false);
  refreshUnitVitals(activeFoe(), true);
  renderBench();
}

export function renderBench() {
  const bench = $('battle-bench');
  if (!bench || !battle) return;
  bench.innerHTML = '';
  battle.team.forEach((p, i) => {
    const chip = el('div', 'bench-chip' + (i === battle.activeIdx ? ' active' : '') + (p.hp <= 0 ? ' down' : ''));
    chip.innerHTML = creatureMarkup(p, 'bench-sprite');
    bench.appendChild(chip);
  });
}

export let hackState = null;

function doRaid(rival) {
  const team = activeTeam();
  if (!teamAlive(team)) { toast('ทีมหมด HP'); return; }
  const puzzle = buildHackPuzzle(rival.level);
  hackState = { rival, puzzle, attempts: puzzle.attempts, guessed: [] };
  showScreen('hack');
  renderHackTerminal();
}

function renderHackTerminal() {
  const h = hackState;
  if (!h) return;
  setText('hack-target', h.rival.name);
  const ab = $('hack-attempt-blocks');
  if (ab) {
    ab.innerHTML = '';
    for (let i = 0; i < h.puzzle.attempts; i++) ab.appendChild(el('span', 'atk-block' + (i < h.attempts ? '' : ' spent')));
  }
  const grid = $('hack-grid');
  const { stream, rows, cols, addrs, placements } = h.puzzle;
  const cellWord = {};
  placements.forEach((p, wi) => { for (let k = 0; k < p.len; k++) cellWord[p.start + k] = wi; });
  let html = '';
  for (let r = 0; r < rows; r++) {
    html += `<div class="hg-row"><span class="hg-addr">${addrs[r]}</span><span class="hg-cells">`;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const wi = cellWord[idx];
      if (wi != null) {
        const p = placements[wi];
        const used = h.guessed.includes(p.word);
        html += `<span class="hg-ch word${used ? ' used' : ''}" data-wi="${wi}">${stream[idx]}</span>`;
      } else {
        html += `<span class="hg-ch">${stream[idx]}</span>`;
      }
    }
    html += `</span></div>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.hg-ch.word').forEach(ch => {
    const wi = ch.dataset.wi;
    ch.onclick = () => guessHackWord(h.puzzle.placements[wi].word);
  });
  const out = $('hack-readout');
  if (out) out.innerHTML = '<div class="hr-line">&gt; เลือกคำเพื่อลองรหัส</div>';
}

function pushReadout(text, cls = '') {
  const out = $('hack-readout');
  if (!out) return;
  out.appendChild(el('div', 'hr-line ' + cls, '> ' + text));
  out.scrollTop = out.scrollHeight;
}

function guessHackWord(word) {
  const h = hackState;
  if (!h || h.done || h.guessed.includes(word)) return;
  h.guessed.push(word);
  const res = checkHackGuess(h.puzzle, word);
  pushReadout(word);
  if (res.correct) {
    h.done = true;
    pushReadout('เข้าถึงระบบสำเร็จ!', 'ok');
    setTimeout(() => enterStealStage(), 700);
    return;
  }
  h.attempts--;
  pushReadout(`ตรงกัน ${res.likeness}/${h.puzzle.len}`, 'warn');
  const grid = $('hack-grid');
  if (grid) grid.querySelectorAll('.hg-ch.word').forEach(ch => {
    if (h.puzzle.placements[ch.dataset.wi].word === word) ch.classList.add('used');
  });
  const ab = $('hack-attempt-blocks');
  if (ab && ab.children[h.attempts]) ab.children[h.attempts].classList.add('spent');
  if (h.attempts <= 0) {
    h.done = true;
    pushReadout('ล็อกเอาต์ — การเจาะล้มเหลว', 'bad');
    log(`เจาะบ้าน ${h.rival.name} ล้มเหลว (รหัสผิด)`, 'lose');
    setTimeout(() => { toast('เจาะไม่สำเร็จ\nระบบล็อก'); showScreen('raid'); }, 1200);
  }
}

function enterStealStage() {
  const h = hackState;
  if (!h) return;
  showScreen('steal');
  const myLv = Math.max(1, ...activeTeam().map(p => p.level));
  const tier = h.rival.guardTier || guardTierForLevel(Math.max(1, h.rival.level));
  const tierDef = GUARD_TIERS.find(g => g.tier === tier) || GUARD_TIERS[0];
  h.loot = buildLootMenu(h.rival.level, myLv, tierDef.lootMult);
  setText('steal-target', h.rival.name);
  const petRow = $('steal-pets');
  petRow.innerHTML = '<div class="steal-lab">เลือก VIRUZ 1 ตัวไปเจาะ:</div>';
  const row = el('div', 'steal-petrow');
  h.sendPet = null;
  activeTeam().filter(p => p.hp > 0).forEach(p => {
    const card = el('button', 'steal-pet');
    card.innerHTML = `${creatureMarkup(p, 'sp-art')}<span>${p.name}</span><i>Lv.${p.level}</i>`;
    card.onclick = () => {
      h.sendPet = p;
      row.querySelectorAll('.steal-pet').forEach(x => x.classList.remove('on'));
      card.classList.add('on');
      renderLootMenu();
    };
    row.appendChild(card);
  });
  petRow.appendChild(row);
  renderLootMenu();
}

function renderLootMenu() {
  const h = hackState;
  const box = $('steal-loot');
  if (!box) return;
  box.innerHTML = '';
  if (!h.sendPet) { box.innerHTML = '<div class="muted" style="padding:10px">เลือก VIRUZ ก่อน</div>'; return; }
  h.loot.forEach(l => {
    const label = l.kind === 'bitz' ? `${l.amount} Bitz` : l.kind === 'exp' ? `EXP Booster +${l.amount}` : (POTIONS.find(p => p.id === l.potId)?.name || 'Potion');
    const autoWin = l.chance >= 100;
    const card = el('button', 'loot-card');
    card.innerHTML = `<div class="lc-icon">${l.icon}</div><div class="lc-name">${label}</div>
      <div class="lc-chance ${autoWin ? 'auto' : ''}">${autoWin ? 'สำเร็จอัตโนมัติ' : l.chance + '% สำเร็จ'}</div>
      ${autoWin ? '' : `<div class="lc-warn">ศัตรู ×${chanceToEnemyMult(l.chance).toFixed(2)}</div>`}`;
    card.onclick = () => commitSteal(l);
    box.appendChild(card);
  });
}

function commitSteal(loot) {
  const h = hackState;
  if (!h || !h.sendPet) { toast('เลือก VIRUZ ก่อน'); return; }
  const mult = chanceToEnemyMult(loot.chance);
  if (mult === 0) { grantLoot(loot); finishRaid(true, loot); hackState = null; return; }
  startRaidFight(h.rival, h.sendPet, loot, mult);
}

function grantLoot(loot) {
  const h = hackState;
  if (loot.kind === 'bitz') G.bitz += loot.amount;
  else if (loot.kind === 'exp') grantExp(h.sendPet, loot.amount);
  else if (loot.kind === 'potion') { G.potions = G.potions || {}; G.potions[loot.potId] = (G.potions[loot.potId] || 0) + loot.amount; }
}

export async function renderRaidList() {
  const list = $('raid-list');
  if (!list) return;
  const myPower = teamPower(activeTeam());
  setText('raid-mypower', myPower.toLocaleString());
  list.innerHTML = '<div class="muted" style="padding:10px">กำลังค้นหา...</div>';
  const rivals = await NET.listRivals(12, myPower);
  list.innerHTML = '';
  rivals.forEach(rival => {
    const card = el('div', 'raid-card');
    card.innerHTML = `
      <div class="rc-name">${rival.name} <span class="muted">Lv.${rival.level}</span></div>
      <div class="rc-power">พลัง ${rival.power?.toLocaleString?.() || rival.power}</div>
      <button class="btn small">💀 เจาะ</button>`;
    card.querySelector('button').onclick = () => doRaid(rival);
    list.appendChild(card);
  });
}

export function finishRaid(win, loot) {
  if (win && loot) {
    if (loot.kind === 'bitz') G.bitz += loot.amount;
    else if (loot.kind === 'exp') { const p = activeTeam()[0]; if (p) grantExp(p, loot.amount); }
    else if (loot.kind === 'potion') { G.potions[loot.potId] = (G.potions[loot.potId] || 0) + 1; }
    log(`💀 เจาะสำเร็จ — ได้ ${loot.kind === 'bitz' ? loot.amount + ' Bitz' : loot.kind}`, 'win');
    toast('เจาะสำเร็จ!');
  } else if (!win) {
    G.bitz = Math.max(0, G.bitz - RAID_LOSS_BITZ);
    log(`เจาะล้มเหลว — เสีย ${RAID_LOSS_BITZ} Bitz`, 'lose');
    toast('เจาะล้มเหลว');
  }
  save();
  showScreen('raid');
  renderAll();
}

// Which of a pet's active ailments (if any) should tint its whole
// sprite — the 3 thrown curses (Freeze/Stone/Charm) plus the Corrupted
// mutation debuff, all thematically "afflictions" rather than plain
// combat buffs/debuffs. Picks whichever is first in the ailments list;
// battles essentially never stack more than one of these at once.
const CURSE_TINT_AILMENT_IDS = ['freeze', 'charm', 'stoned', 'corrupt'];
function curseTintColor(pet) {
  const a = (pet.ailments || []).find(x => CURSE_TINT_AILMENT_IDS.includes(x.id));
  if (!a) return null;
  const A = AILMENTS[a.id];
  return A ? A.color : null;
}
// Creates/updates/removes the pulsating tint overlay in place — shared
// by the initial renderBattleSide() paint and every later
// refreshUnitVitals() tick, so it stays in sync turn-to-turn and
// disappears the instant the curse actually lifts.
//
// A flat colored rectangle with mix-blend-mode looked like a solid box
// behind the creature instead of a tint ON it, because blend modes
// composite against whatever's already painted under the WHOLE
// rectangle, not just the sprite's own opaque pixels. Fixed by using
// the sprite itself as a CSS mask, so the color only ever shows through
// where the creature is actually opaque — works the same way for a
// raster <img> (mask-image: url(that same src)) and a procedural inline
// <svg> (no separate file to point at, so its live markup is inlined as
// a data: URI and used as the mask instead). Both ways read the sprite
// straight out of the DOM, so this never has to duplicate whatever
// creatureMarkup()/creatureMarkupFor() decided to render.
function spriteMaskUrl(spriteEl) {
  if (!spriteEl) return null;
  if (spriteEl.tagName === 'IMG') return `url("${spriteEl.src}")`;
  return `url("data:image/svg+xml,${encodeURIComponent(spriteEl.outerHTML)}")`;
}
function updateCurseTint(pet, unitEl) {
  if (!unitEl) return;
  const wrap = unitEl.querySelector('.bu-sprite-wrap');
  const spriteEl = unitEl.querySelector('.bu-sprite');
  if (!wrap) return;
  const color = curseTintColor(pet);
  let tintEl = wrap.querySelector('.curse-tint');
  if (color && spriteEl) {
    if (!tintEl) { tintEl = el('div', 'curse-tint'); wrap.appendChild(tintEl); }
    tintEl.style.setProperty('--curse-color', color);
    const maskUrl = spriteMaskUrl(spriteEl);
    tintEl.style.maskImage = maskUrl;
    tintEl.style.webkitMaskImage = maskUrl;
  } else if (tintEl) {
    tintEl.remove();
  }
}

// Shared badge-row markup for a pet's active ailments — poison/frenzy
// show a stack count (they never expire on a turn timer, see
// STACKING_AILMENT_IDS in data.js), everything else still shows its
// remaining turns.
function ailBadgesHtml(pet) {
  return (pet.ailments || []).map(a => {
    const A = AILMENTS[a.id];
    if (!A) return '';
    const meta = a.stacks != null ? ` (x${a.stacks})` : (a.turns != null ? ` (${a.turns})` : '');
    return `<span class="ail-badge" title="${A.thai}${meta}">${A.icon}</span>`;
  }).join('');
}

// Click handler for a ready (critGauge full) ally unit — see
// requestBonusCrit() for the acquire-or-queue logic (a tap that lands
// mid-animation is queued, not dropped).
export function wireCritGaugeTap(unitEl, pet) {
  unitEl.onclick = () => requestBonusCrit(pet);
}

export function renderBattleSide(pet, elId, isEnemy) {
  const wrap = $(elId);
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!pet) return;
  const unit = el('div','bunit');
  unit.dataset.uid = pet.uid;
  unit.dataset.side = isEnemy ? 'foe' : 'ally';
  unit.style.setProperty('--float-delay', (Math.random() * 1.6).toFixed(2) + 's');
  if (pet.hp <= 0) unit.classList.add('dead');
  const badges = ailBadgesHtml(pet);
  const isStoned = hasAilment(pet, 'stoned');
  // FACING: sprites are authored facing either way. The player's side
  // must look right, the enemy side must look left. `faces` says how the
  // art was drawn, so we only flip when it disagrees with the side.
  const drawnFaces = pet.faces || (pet.gif ? 'right' : 'right');
  const wantFaces  = isEnemy ? 'left' : 'right';
  const needFlip   = drawnFaces !== wantFaces;

  // SIZE: scale by the creature's expected physical size — but capped
  // so a large data-defined scale (e.g. FireGolem's 1.85x) can never
  // grow the sprite past what #stage-cam's padding actually clears
  // before #battle-stage's overflow:hidden starts cutting into it. A
  // data scale is a size INTENT; this is what keeps intent from
  // clipping the sprite (was reported: a large ally's horn/rim-light
  // rendering with a hard cut edge — the sprite was genuinely bigger
  // than the clearance available on its near side).
  const isRaster = !!pet.gif || ART2_SPECIES.includes(pet.speciesId);
  const rasterMult = isRaster ? 2 : 1;
  const safeTotalScale = window.innerWidth <= 600 ? 3.0 : 2.4;
  const sc = Math.min(pet.scale || 1, safeTotalScale / rasterMult);

  unit.style.setProperty('--cr-scale', sc);
  // Also exposed on the shared ancestor (not just the raster-specific
  // .bu-sprite class rule) so .curse-tint — a sibling of .bu-sprite,
  // not a descendant of it — can inherit the same multiplier and stay
  // sized to match the actual rendered sprite.
  unit.style.setProperty('--raster-mult', rasterMult);
  const rageMarks = (pet.isBoss && pet.bossPhase === 2)
    ? `<div class="rage-marks"><span>💢</span><span>😡</span><span>💢</span></div>` : '';
  // Stoned gets its own big overlay above the head (placeholder emoji —
  // drop a real gif at assets/fx/stoned.gif and swap the CSS background
  // on .stoned-overlay to upgrade it) instead of just a small corner
  // badge, since it's meant to read as a much bigger deal than a normal
  // ailment.
  const stonedOverlay = isStoned ? `<div class="stoned-overlay">${AILMENTS.stoned.icon}</div>` : '';
  unit.innerHTML = `
    ${badges ? `<div class="ail-badges">${badges}</div>` : ''}
    ${stonedOverlay}
    ${rageMarks}
    <div class="bu-sprite-wrap${pet.isBoss ? ' is-boss' : ''}">
      ${creatureMarkup(pet, 'bu-sprite' + (pet.noFloat ? '' : ' float') + (needFlip ? ' flip' : ''))}
    </div>`;
  wrap.appendChild(unit);
  // Needs the sprite element actually in the DOM first (reads its own
  // src/markup to build the mask — see updateCurseTint()).
  updateCurseTint(pet, unit);
  // Only an ally can be tapped to fire a ready bonus crit — a foe has no
  // player to tap for it and auto-fires the instant its gauge fills
  // (see runTurn).
  if (!isEnemy) wireCritGaugeTap(unit, pet);
  unit.classList.toggle('crit-ready', !isEnemy && (pet.critGauge || 0) >= 1);

  // Name plate lives outside the sprite so it never moves with a lunge
  const plate = $(isEnemy ? 'plate-foe' : 'plate-ally');
  if (plate) {
    const mpMax = statsOf(pet).int;
    const mpPct = Math.round((pet.mp || 0) / Math.max(1, mpMax) * 100);
    const spdPct = Math.round(Math.min(1, pet.spdCounter || 0) * 100);
    const critPct = Math.round(Math.min(1, pet.critGauge || 0) * 100);
    // Kept deliberately compact (one bar, no separate phase-pip row) —
    // the boss's enlarged sprite sits right below this plate, and a
    // taller plate was overlapping it.
    const hpMax = pet.isBoss ? (pet.bossPhase === 2 ? pet.hpPhase2Max : statsOf(pet).mhp) : statsOf(pet).mhp;
    const hpPct = Math.max(0, Math.min(100, Math.round(pet.hp / Math.max(1, hpMax) * 100)));
    let bossBar = '';
    if (pet.isBoss) {
      bossBar = `<div class="boss-hpbar phase${pet.bossPhase}"><i style="width:${hpPct}%"></i></div>`;
    }
    // A "large" sprite (sc>=1.2, e.g. the x1.25 size tier) grows tall
    // enough from the bottom of the stage to reach up into the name
    // plate and cover the MP gauge sitting below HP — so for an
    // enlarged ally, HP+MP sit side by side instead of stacked.
    const enlarged = !isEnemy && sc >= 1.2;
    const vitalsHtml = enlarged
      ? `<div class="np-vitals-inline">
           <div class="np-hp">${vitalHtml('heart', hpPct, Math.max(0, pet.hp))}</div>
           <div class="np-mp">${vitalHtml('circle', mpPct, Math.max(0, pet.mp || 0))}</div>
         </div>`
      : `<div class="np-hp">${vitalHtml('heart', hpPct, Math.max(0, pet.hp))}</div>
         ${!isEnemy ? `<div class="np-mp">${vitalHtml('circle', mpPct, Math.max(0, pet.mp || 0))}</div>` : ''}`;
    // Heat-spawned units get the star prefix + red name. The ELITE/
    // HUNTER tag reuses .np-boss-tag's styling but is suppressed for a
    // real boss so the slot never renders two competing tags.
    const eliteTag = (pet.isElite && !pet.isBoss)
      ? `<div class="np-boss-tag" style="color:${ELITE_NAME_COLOR}">${pet.isHunter ? '🚨 HUNTER' : '⭐ ELITE'}</div>`
      : '';
    plate.innerHTML = `
      ${pet.isBoss ? `<div class="np-boss-tag">⚠ BOSS${pet.bossPhase===2?' · RAGE':''}</div>` : ''}
      ${eliteTag}
      <div class="np-name"${pet.isElite ? ` style="color:${ELITE_NAME_COLOR}"` : ''}>${eliteDisplayName(pet)}</div>
      <div class="np-lv">Lv.${pet.level}</div>
      <div class="np-buffs">${statBuffChips(pet)}</div>
      ${vitalsHtml}
      ${bossBar}
      <div class="gauge-bars">
        ${gaugeBarHtml('spd', spdPct)}
        ${gaugeBarHtml('crit', critPct)}
      </div>`;
  }
  if (!isEnemy) refreshHitButton(pet);
}

// Vertical liquid-fill gauge (SPD/CRIT) — same clip-path-from-the-top
// mechanic as vitalHtml()'s HP/MP gauges, just a plain bar shape.
function gaugeBarHtml(kind, pct) {
  const clipTop = Math.max(0, Math.min(100, 100 - pct));
  const ready = kind === 'crit' && pct >= 100;
  return `<div class="gauge-bar ${kind}${ready ? ' ready' : ''}">
    <div class="gauge-bar-bg"></div>
    <div class="gauge-bar-fill" style="clip-path:inset(${clipTop}% 0 0 0)"></div>
  </div>`;
}
function updateGaugeBar(container, pct, ready) {
  if (!container) return;
  const clipTop = Math.max(0, Math.min(100, 100 - pct));
  const fill = container.querySelector('.gauge-bar-fill');
  if (fill) fill.style.clipPath = `inset(${clipTop}% 0 0 0)`;
  container.classList.toggle('ready', !!ready);
}

// Shows/hides the manual "HIT!" button (#hit-btn-row) in lockstep with
// the active ally's crit gauge — the button is the alternative entry
// point to fireBonusCrit() alongside tapping the ally's own sprite (see
// wireCritGaugeTap()), and disappears the instant the gauge is spent.
function refreshHitButton(pet) {
  const row = $('hit-btn-row');
  if (!row) return;
  const ready = pet === activeAlly() && (pet.critGauge || 0) >= 1;
  const btn = $('hit-btn');
  if (btn) btn.classList.toggle('show', ready);
}

// Shared HP/MP "liquid" gauge markup — see the .vital CSS rules for
// how the clip-path-from-the-top mechanism drains the fill. `shape`
// is 'heart' (HP) or 'circle' (MP); refreshBattleUnits() below updates
// the same two elements (.vital-fill/.vital-num) in place every turn
// instead of re-rendering, which is what the MP gauge previously
// never got — the number and fill only came from THIS function, run
// once per render, so spending MP mid-fight left it stale until the
// next full re-render (e.g. a pet swap).
function vitalHtml(shape, pct, num) {
  const clipTop = Math.max(0, Math.min(100, 100 - pct));
  return `<div class="vital vital-${shape}">
    <div class="vital-fill-bg"></div>
    <div class="vital-fill" style="clip-path:inset(${clipTop}% 0 0 0)"></div>
    <span class="vital-num">${num}</span>
  </div>`;
}

export function renderBattle() {
  if (!battle) return;
  renderBattleSide(activeAlly(), 'battle-allies', false);
  renderBattleSide(activeFoe(),  'battle-enemies', true);
  renderBench();
  renderPotionBar();
  renderSkillBar();
  const fleeBtn = $('flee-btn');
  if (fleeBtn) fleeBtn.classList.toggle('flee-locked', battle.mode === 'mimic');
}

