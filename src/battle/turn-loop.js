// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.
//
// ── WHAT "ONE TURN" MEANS (changed) ──
// A turn is ONE FULL ROUND: both sides having acted once. It is not one
// side's action. Every duration in the game -- ailment `turns`, shield
// countdowns, the stat-buff chips' "3t" readout -- is counted in these
// rounds, so `turns: 3` lasts three exchanges.
//
// This used to be wrong in a way that was easy to miss. runTurn() runs
// once per HALF-turn, and it used to end with:
//     await endOfTurnTicks(attacker);
//     await endOfTurnTicks(target);
// Both participants ticked on every half-turn, so each unit was ticked
// TWICE per round and a `turns: 3` poison actually expired after a turn
// and a half. Ticks are now gated behind finishRound(), which only fires
// on the foe's half -- the one that closes a round.

import { AILMENTS, BOSS_TUNING, LOYALTY_PER_WIN, TUNING, loyaltyTier } from '../data.js';
import { addAilment, advanceSpeedCounter, availableSkills, canCast, clamp, clearAilments, combatStats, computeDamage, enterBossRage, grantExp, habitOf, hasAilment, healTeam, markDown, petState, signatureSkillOf, spendMP, statsOf, tickAilments, uid, unlockedSpecials } from '../engine.js';
import { finishRaid, healPop, playAttackSequence, playHit, poisonPop, refreshBattleUnits, renderBattle, renderBattleSide, renderBench, showBanner, wireCritGaugeTap } from './combat.js';
import { onBossDefeated, playFoeDeathTransition, playFoeEntrance, renderSafeSpot, startArena, startMimicAmbush, startRaidFight, startZone } from './encounters.js';
import { applyPayloadOnHit, buildAttackProc, rollEquipDrop, rollHabitCard, rollMaterialDrop, rollMeatDrop } from './equipment.js';
import { VFX_ASSETS, cameraReset, playSpellVFX, renderPotionBar, renderSkillBar, resolveVfxKey, setTimeScale, wait } from './extras.js';
import { renderClinic } from '../screens/shop.js';
import { showMimicRewardCards, travelTo } from '../screens/world.js';
import { $, G, VIBE_DEATH, VIBE_SKILL, activeTeam, battle, battleSpeed, creatureMarkup, el, save, setText, vibrate, setBattle } from '../state.js';
import { blog, log, renderAll, showScreen, toast } from '../ui-shell.js';
import { onRoundComplete } from '../dice.js';

// Purely internal to the turn loop -- nothing outside this file reads
// or writes these, so they live here rather than in shared state.
let battleTimer = null;
let regenTimer = null;

// ═══════════════ BATTLE TURN LOOP ═══════════════
export function activeAlly() {
  if (!battle) return null;
  const p = battle.team[battle.activeIdx];
  return p && p.hp > 0 ? p : null;
}
export function activeFoe() {
  if (!battle) return null;
  return battle.enemies.find(e => e.hp > 0) || null;
}

export function startRegen() {
  clearInterval(regenTimer);
  regenTimer = setInterval(() => {
    if (!battle || battle.over) { clearInterval(regenTimer); return; }
  }, 1000);
}

export function scheduleTurn(delayMs) {
  clearTimeout(battleTimer);
  if (!battle || battle.over) return;
  const ms = delayMs != null ? delayMs : TUNING.turnBaseMs / battleSpeed;
  battleTimer = setTimeout(runTurn, ms);
}

// Mutex around anything that mutates battle state / plays an attack
// animation — runTurn holds it for its whole body, so a manually-tapped
// bonus crit (fireBonusCrit, via a ready ally — see wireCritGaugeTap)
// never races an in-flight auto-turn. A tap that arrives while busy
// doesn't just get silently dropped (a real player's tap essentially
// never lines up with the auto-loop's own internal cadence, and most
// of any given turn IS spent "busy" mid-animation) — it's queued via
// pendingCritTap and serviced the instant the lock clears, in
// releaseBattleBusy() below.
let battleBusy = false;
let pendingCritTap = false;
function releaseBattleBusy() {
  battleBusy = false;
  if (pendingCritTap) {
    pendingCritTap = false;
    const ally = activeAlly();
    if (ally) requestBonusCrit(ally);
  }
}

// ── SPECIAL SKILL COOLDOWNS ──
// Real wall-clock seconds (per your spec: 3-5s depending on power),
// tracked per unit per skill id in unit._cooldowns. Reset whenever a
// fight starts fresh (see startZone/startArena/startRaidFight).
function specialReady(unit, sp) {
  const cds = unit._cooldowns;
  if (!cds || !cds[sp.id]) return true;
  return Date.now() >= cds[sp.id];
}
export function markSpecialUsed(unit, sp) {
  unit._cooldowns = unit._cooldowns || {};
  unit._cooldowns[sp.id] = Date.now() + (sp.cd || 3.5) * 1000;
}

// Picks and executes ONE action for `attacker` this exchange — specials-
// vs-basic selection extracted out of runTurn so a speed-gauge bonus
// action (see advanceSpeedCounter below) can run through the exact same
// logic a second time in a row without duplicating it.
async function resolveAction(attacker, target, side, atkTeam, defTeam) {
  // Only specials that are auto-cast ON, affordable, AND off cooldown
  // are eligible. Without the cooldown check a pet would burn every
  // point of MP on specials back-to-back instead of ever throwing a
  // normal attack, since specials were picked with flat 55% odds every
  // single turn regardless of how recently one was used.
  const specials = unlockedSpecials(attacker)
    .filter(sp => attacker.autoCast?.[sp.id] && canCast(attacker, sp) && specialReady(attacker, sp));
  const sig = signatureSkillOf(attacker);
  const sigReady = sig && specialReady(attacker, sig);

  if (specials.length && Math.random() < 0.55) {
    const usedSpecial = specials[Math.floor(Math.random() * specials.length)];
    markSpecialUsed(attacker, usedSpecial);
    await castSpecial(attacker, target, usedSpecial, side, atkTeam, defTeam);
  } else if (sigReady && Math.random() < 0.3) {
    markSpecialUsed(attacker, sig);
    await castSpecial(attacker, target, sig, side, atkTeam, defTeam);
  } else {
    await basicAttack(attacker, target, side, atkTeam, defTeam);
  }
}

export async function runTurn() {
  if (!battle || battle.over) return;
  // A manual bonus-crit tap (or its queued service) is currently
  // running — retry shortly rather than stepping on the same state.
  if (battleBusy) { scheduleTurn(50); return; }
  battleBusy = true;
  try {
    if (battle.phase === 'ally') {
      await runTeamBuffCheck();
      if (!battle || battle.over) return;
    }
    const ally = activeAlly();
    const foe = activeFoe();
    if (!ally) { promptSwap(); return; }
    if (!foe) { await checkBattleEnd(); return; }

    const goesFirst = battle.phase === 'ally' ? ally : foe;
    const other = battle.phase === 'ally' ? foe : ally;
    const side = battle.phase === 'ally' ? 'ally' : 'foe';
    battle.phase = battle.phase === 'ally' ? 'foe' : 'ally';

    // Freeze and Stoned both skip the turn entirely, but only freeze
    // shatters (bonus damage + early removal) when hit — see
    // applyFreezeShatter(). Stoned runs its full duration no matter
    // what happens to it meanwhile.
    if (hasAilment(goesFirst, 'freeze') || hasAilment(goesFirst, 'stoned')) {
      const stunId = hasAilment(goesFirst, 'stoned') ? 'stoned' : 'freeze';
      const stunLabel = stunId === 'stoned' ? 'กลายเป็นหิน ขยับไม่ได้' : 'ถูกแช่แข็ง ขยับไม่ได้';
      blog(`${AILMENTS[stunId].icon} ${goesFirst.name} ${stunLabel}`, side);
      // A skipped action still has to be able to CLOSE a round, or a
      // stun would freeze every other duration in the fight alongside
      // it — including its own, making it permanent.
      await finishRound(goesFirst, other, side);
      if (await checkBattleEnd()) return;
      scheduleTurn();
      return;
    }

    let target = other;
    let attacker = goesFirst;
    if (hasAilment(attacker, 'charm')) {
      target = attacker;
      blog(`💗 ${attacker.name} ถูกมนต์เสน่ห์ หันมาโจมตีตัวเอง`, side);
    }

    const atkTeam = side === 'ally' ? battle.team : battle.enemies;
    const defTeam = side === 'ally' ? battle.enemies : battle.team;

    await resolveAction(attacker, target, side, atkTeam, defTeam);

    // ── SPEED GAUGE: charges toward a bonus second action this exchange ──
    if (attacker.hp > 0 && target.hp > 0 && !battle.over) {
      const mySpd = combatStats(attacker, atkTeam).spd;
      const foeSpd = combatStats(target, defTeam).spd;
      if (advanceSpeedCounter(attacker, mySpd, foeSpd) === 2) {
        await showBanner('SPEED UP!', 'speed');
        blog(`⚡ ${attacker.name} เร็วกว่า — โจมตีซ้ำ!`, side);
        await resolveAction(attacker, target, side, atkTeam, defTeam);
      }
    }

    // ── CRIT GAUGE: fills toward a bonus guaranteed-crit strike ──
    // An ally just gets marked ready (see refreshBattleUnits/renderBattleSide
    // for the tappable glow) and waits for a tap — fireBonusCrit() only
    // auto-fires here for a foe, since there's no player to tap for it.
    if (attacker.hp > 0 && !battle.over) {
      attacker.critGauge = Math.min(1, (attacker.critGauge || 0)
        + TUNING.critGaugeBaseGain + statsOf(attacker).crit / TUNING.critGaugeCritScale);
      if (attacker.critGauge >= 1 && side === 'foe' && target.hp > 0) {
        await fireBonusCrit(attacker, target, side, atkTeam, defTeam);
      }
    }

    // goesFirst/other, NOT attacker/target: while charmed those two are
    // the SAME unit, which used to tick the charmed unit twice and its
    // opponent not at all.
    await finishRound(goesFirst, other, side);
    refreshBattleUnits();

    if (await checkBattleEnd()) return;
    scheduleTurn();
  } finally {
    releaseBattleBusy();
  }
}

// Closes a round. Only the FOE's half does that — an exchange is not
// complete until both sides have acted, which is the definition every
// duration in the game is now counted in.
//
// Everything that steps once per turn hangs off this: ailment durations
// and poison damage, shield countdowns, the Plants regen check, the
// round counter, and the d20 roll on dice maps.
async function finishRound(unitA, unitB, side) {
  if (!battle || side !== 'foe') return;
  battle.roundNo = (battle.roundNo || 0) + 1;
  await endOfTurnTicks(unitA);
  await endOfTurnTicks(unitB);
  // Dice maps only (see DICE_MAPS in dice.js); a no-op everywhere else.
  await onRoundComplete(battle, battle.roundNo);
}

// Guaranteed-crit bonus strike, fired once a unit's crit gauge fills —
// automatically for a foe (see runTurn), or via a tap on a ready ally
// (see wireCritGaugeTap()). An EXTRA action layered on top of the
// normal alternating turn order, not a replacement for it: battle.phase
// and the scheduleTurn loop are untouched, so this never steals or
// skips anyone's actual turn.
export async function fireBonusCrit(attacker, target, side, atkTeam, defTeam) {
  if (!battle || battle.over || !attacker || attacker.hp <= 0 || !target || target.hp <= 0) return;
  attacker.critGauge = 0;
  await showBanner('CRIT READY!!', 'crit');
  const skills = availableSkills(attacker);
  const skill = skills[Math.floor(Math.random() * skills.length)] || { n: 'Strike', pw: 40 };
  const res = computeDamage(attacker, atkTeam, target, defTeam, skill, false, { forceCrit: true });
  applyFreezeShatter(target, res);
  applyHabitPreHitMods(target, res);
  if (!res.evaded) {
    await playAttackSequence(attacker, target, res, side, 'impact');
    let line = `${attacker.name} → ${skill.n} (Bonus Crit)`;
    if (res.hits > 1) line += ` ×${res.hits}`;
    line += ` · -${res.dmg}`;
    blog(line, side);
  } else {
    await playAttackSequence(attacker, target, res, side);
    blog(`${target.name} หลบการโจมตีโบนัสของ ${attacker.name} ได้!`, side);
  }
  refreshBattleUnits();
  await checkBattleEnd();
}

// Entry point for a MANUAL bonus-crit request (a tap on a ready ally —
// see wireCritGaugeTap()) — acquires battleBusy itself (unlike the
// foe auto-fire call inside runTurn, which already holds the lock for
// its whole turn) or queues via pendingCritTap if something else is
// already running, instead of just dropping the tap.
export function requestBonusCrit(pet) {
  if (!battle || battle.over || !pet || pet.isEnemy) return;
  if ((pet.critGauge || 0) < 1) return;
  if (battleBusy) { pendingCritTap = true; return; }
  const foe = activeFoe();
  if (!foe) return;
  battleBusy = true;
  fireBonusCrit(pet, foe, 'ally', battle.team, battle.enemies).finally(releaseBattleBusy);
}

// Bumps res.dmg/hitDmgs by TUNING.freezeShatterMult and clears freeze —
// hitting a frozen target shatters the ice for bonus damage instead of
// it just quietly wearing off. Called right after computeDamage, before
// the hit animation, so the bumped number is what actually lands and
// plays. A miss (res.evaded) has nothing to shatter.
function applyFreezeShatter(target, res) {
  if (!res || res.evaded || !hasAilment(target, 'freeze')) return;
  const mult = TUNING.freezeShatterMult;
  res.dmg = Math.round(res.dmg * mult);
  res.hitDmgs = res.hitDmgs.map(d => Math.round(d * mult));
  res.shattered = true;
  target.ailments = target.ailments.filter(a => a.id !== 'freeze');
}

// Habit Type passives that modify a hit BEFORE it plays — called right
// after computeDamage, same point as applyFreezeShatter, so the
// adjusted number is what actually lands and animates.
// Conjuration: 20% flat chance the whole hit is a "phantom duplicate"
// and lands for 0 (checked BEFORE Machine's own modifier, since a fully
// blocked hit has nothing left to amplify).
// Machine: +15% damage taken while currently Corrupted.
function applyHabitPreHitMods(target, res) {
  if (!res || res.evaded) return;
  const h = habitOf(target);
  if (!h) return;
  if (h.type === 'conjuration' && Math.random() < 0.20) {
    res.dmg = 0;
    res.hitDmgs = res.hitDmgs.map(() => 0);
    res.phantomBlocked = true;
    return;
  }
  if (h.type === 'machine' && hasAilment(target, 'corrupt')) {
    res.dmg = Math.round(res.dmg * 1.15);
    res.hitDmgs = res.hitDmgs.map(d => Math.round(d * 1.15));
  }
}

// Habit Type passives triggered per-hit AFTER it actually lands (not
// evaded, not a Conjuration phantom-block) — called from
// playAttackSequence's per-hit loop, same timing as applyPayloadOnHit,
// so a multi-hit skill gets one roll per hit like the equipment procs
// already do. Vampire/Demon/Fungi read the ATTACKER's card; Fey reads
// the DEFENDER's (reacting to being hit).
export function applyHabitPostHit(attacker, target, res, side) {
  if (!res || res.evaded || res.phantomBlocked || !res.dmg) return;
  const atkHab = habitOf(attacker);
  if (atkHab) {
    if (atkHab.type === 'vampire') {
      const heal = Math.max(1, Math.round(res.dmg * 0.10));
      const mx = statsOf(attacker).vit;
      attacker.hp = Math.min(mx, attacker.hp + heal);
      healPop(attacker, heal);
    }
    if (atkHab.type === 'demon' && target.hp > 0 && Math.random() < 0.15) {
      addAilment(target, { id: 'corrupt', turns: 3, atk: -0.15, def: -0.15 });
      blog(`😈 ${attacker.name} ทำให้ ${target.name} ติด Corrupted`, side);
    }
    if (atkHab.type === 'fungi' && target.hp > 0 && Math.random() < 0.12) {
      addAilment(target, { id: 'poison', stacks: 1 });
      blog(`🍄 ${attacker.name} ทำให้ ${target.name} ติดพิษ 1 สแตค`, side);
    }
  }
  const defHab = habitOf(target);
  if (defHab && defHab.type === 'fey' && target.hp > 0 && Math.random() < 0.15) {
    addAilment(attacker, { id: 'charm', turns: 2 });
    blog(`🧚 ${target.name} สะกด ${attacker.name} กลับ (Charm)`, side === 'ally' ? 'foe' : 'ally');
  }
}

// ── TEAM BUFF ID ──
// Each buffTeam special gets its OWN ailment id (was a single shared
// 'frenzy' id for every team buff, which meant a second buffTeam skill
// couldn't coexist with the first — addAilment() dedupes same-id
// instances, so casting Sanctuary while Data Bless was still up just
// refreshed Data Bless's turns and silently dropped Sanctuary's DEF
// bonus). Per-skill ids let them stack independently AND let
// runTeamBuffCheck() below tell "is THIS specific buff still up"
// instead of "is *a* buff up".
function teamBuffAilmentId(sp) { return 'buff_' + sp.id; }

// ── PERIODIC TEAM BUFFS (bench healers) ──
// A team-wide buff (buffTeam — Data Bless / Sanctuary) only ever fired
// on ITS caster's own turn, so a healer sitting on the bench never got
// to use it, and once cast it was never refreshed — a support pet is
// meant to keep the team buffed, not spend it once and go quiet. Now:
// every ally turn, before that turn resolves, any BENCH pet (the
// active fighter's own turn already covers itself via the normal
// autoCast path in runTurn) with a buffTeam special toggled to
// auto-cast fires it if the team doesn't currently have THAT buff up
// (fresh at battle start, then again each time it wears off) and it's
// affordable. No VFX on an off-field caster — a small portrait pop
// over the active ally instead, naming the caster, the skill, and its
// effect, then the buff (and any healTeam) applies exactly like it
// would mid-fight.
async function runTeamBuffCheck() {
  if (!battle || !battle.team) return;
  const activePet = activeAlly();
  if (!activePet) return;
  const bench = battle.team.filter(p => p !== activePet && p.hp > 0);
  for (const caster of bench) {
    const sp = unlockedSpecials(caster).find(s =>
      s.buffTeam && caster.autoCast?.[s.id] && canCast(caster, s) && specialReady(caster, s)
      && !hasAilment(activePet, teamBuffAilmentId(s)));
    if (!sp) continue;
    spendMP(caster, sp);
    markSpecialUsed(caster, sp);
    battle.team.forEach(p => { if (p.hp > 0) addAilment(p, { id: teamBuffAilmentId(sp), ...sp.buffTeam }); });
    if (sp.healTeam) {
      battle.team.forEach(p => {
        if (p.hp <= 0) return;
        const mx = statsOf(p).vit;
        p.hp = Math.min(mx, p.hp + Math.floor(mx * sp.healTeam));
      });
    }
    blog(`✨ ${caster.name} ใช้ ${sp.name} · ${sp.desc} · เสริมพลังทั้งทีม`, 'buff');
    supportCasterPop(caster, sp);
    refreshBattleUnits();
    await wait(2000 / battleSpeed);
  }
}

// Small portrait box over the active ally's head — the only visual
// tell an off-field pet gets when it uses a buff, since it has no
// on-stage unit of its own to animate. Names the caster, the skill,
// and its effect text.
function supportCasterPop(caster, sp) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  const activePet = activeAlly();
  const unitEl = activePet && document.querySelector(`.bunit[data-uid="${activePet.uid}"]`);
  if (!layer || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  const d = el('div', 'support-cast-pop');
  d.style.left = (r.left - host.left + r.width / 2) + 'px';
  d.style.top = (r.top - host.top) + 'px';
  d.innerHTML = `<div class="support-cast-box">${creatureMarkup(caster, 'support-cast-sprite')}</div>
    <div class="support-cast-name">${caster.name}</div>
    <div class="support-cast-skill">✦ ${sp.name}</div>
    <div class="support-cast-desc">${sp.desc}</div>`;
  layer.appendChild(d);
  setTimeout(() => d.remove(), 2000 / battleSpeed);
}

// ── STAT BUFF READOUT (next to the level line) ──
// One colored chip per stat currently modified by ANY active ailment
// (buffs and the corrupt/frenzy-style debuffs alike), aggregated since
// more than one can now touch the same stat at once (see
// teamBuffAilmentId() above). Turn count shown is the longest-lived
// contributor — the stat stays at its current (aggregated) % until
// that expires, though the % itself may step down sooner if a
// shorter-lived contributor runs out first; recomputed fresh from
// pet.ailments on every call so that's always reflected live. The "t"
// suffix counts FULL ROUNDS -- see finishRound().
const STAT_BUFF_META = {
  atk:  { label: 'ATK',  color: '#ff5a5a' },
  def:  { label: 'DEF',  color: '#d9a066' },
  spd:  { label: 'SPD',  color: '#f5e77a' },
  eva:  { label: 'EVA',  color: '#c9c9d6' },
  crit: { label: 'CRIT', color: '#ff8ad1' },
};
export function statBuffChips(pet) {
  const totals = {};
  (pet.ailments || []).forEach(a => {
    Object.keys(STAT_BUFF_META).forEach(k => {
      if (!a[k]) return;
      const t = totals[k] || (totals[k] = { pct: 0, turns: 0 });
      t.pct += a[k];
      t.turns = Math.max(t.turns, a.turns || 0);
    });
  });
  return Object.keys(totals).map(k => {
    const meta = STAT_BUFF_META[k];
    const t = totals[k];
    const sign = t.pct >= 0 ? '+' : '';
    return `<span class="stat-buff-chip" style="color:${meta.color}">${meta.label}${sign}${Math.round(t.pct * 100)}%<i>${t.turns}t</i></span>`;
  }).join('');
}

// Applies damage to `target`, with one special case: a region boss's
// phase-1 bar hitting 0 does NOT kill it — it flips into rage (phase
// 2, hpPhase2Max, +50% atk, see enterBossRage() in engine.js) with a
// visual beat, and battle continues. A phase-2 boss dying is a normal
// death like anything else.
//
// IMPORTANT: uses target.isEnemy to pick which battle-unit slot to
// redraw, NOT the `side` of whoever attacked — attacker and target
// are almost always on OPPOSITE sides, so keying this off attacker
// side redraws the WRONG slot (this was a real bug: a raging boss
// briefly rendered into the player's own ally slot).
export async function applyDamage(target, dmg, blogSide) {
  // Last Stand (w_failsafe): checked BEFORE the hit lands, not after —
  // a lethal (or merely below-threshold) blow must never get to zero
  // HP first, or there'd be nothing left to save. The instant this
  // strike would first drop the unit under the threshold, the token is
  // consumed and the hit is negated entirely (healed to full) instead
  // of applied — a one-shot safety net, not a per-turn condition (see
  // the skill's own comment in data.js for why this replaces "AI
  // targets lowest HP" here).
  if (hasAilment(target, 'lastStand')) {
    const mhp = statsOf(target).vit;
    if ((target.hp - dmg) / mhp < TUNING.lastStandThreshold) {
      target.ailments = target.ailments.filter(a => a.id !== 'lastStand');
      target.hp = mhp;
      healPop(target, mhp);
      blog(`🛟 ${target.name} — ระบบฉุกเฉินทำงาน! ฟื้นเต็ม HP`, target.isEnemy ? 'foe' : 'ally');
      return;
    }
  }
  // Undead Habit Type: once per fight, a hit that would otherwise be
  // lethal instead leaves it clinging on at 1 HP — weaker than Last
  // Stand (no heal, one HP not full), matching the classic "undead
  // barely refuses to fall" trope.
  const undeadHab = habitOf(target);
  if (undeadHab && undeadHab.type === 'undead' && !target._habitUndeadUsed && target.hp - dmg <= 0) {
    target._habitUndeadUsed = true;
    target.hp = 1;
    target._tookDamageThisTurn = true;
    blog(`💀 ${target.name} — Undead ปฏิเสธที่จะล้ม! เหลือ HP 1`, target.isEnemy ? 'foe' : 'ally');
    return;
  }
  if (dmg > 0) target._tookDamageThisTurn = true;
  target.hp = Math.max(0, target.hp - dmg);
  if (target.hp <= 0 && target.isBoss && target.bossPhase === 1) {
    enterBossRage(target);
    const elId = target.isEnemy ? 'battle-enemies' : 'battle-allies';
    renderBattleSide(target, elId, target.isEnemy);
    await showBanner('RAGE!', 'crit');
    blog(`💢 ${target.name} เข้าสู่สภาวะคลั่ง! ATK +50%`, blogSide);
  }
}

async function basicAttack(attacker, target, side, atkTeam, defTeam) {
  const skills = availableSkills(attacker);
  const skill = skills[Math.floor(Math.random() * skills.length)] || { n: 'Strike', pw: 40 };
  const res = computeDamage(attacker, atkTeam, target, defTeam, skill, false, buildAttackProc(attacker, target));
  applyFreezeShatter(target, res);
  applyHabitPreHitMods(target, res);

  if (res.evaded) {
    await playAttackSequence(attacker, target, res, side);
    blog(`${target.name} หลบ ${attacker.name} ได้!`, side);
    return;
  }

  // Crit on a NORMAL attack: NO white-out self VFX anymore. Instead the
  // attacker itself swells to 2x, tilts, and charges (handled inside
  // playHit via the crit-attack class), with the big impact burst
  // landing on the enemy at the same beat as the damage number and HP
  // update — see playAttackSequence/playHit. 'impact' (the gold
  // hit-flash WebP) plays on every landed normal hit, once per hit for
  // a multi-hit skill, exactly at each hit's own contact frame instead
  // of once after the whole exchange finished.
  await playAttackSequence(attacker, target, res, side, 'impact');

  let line = `${attacker.name} → ${skill.n}`;
  if (res.hits > 1) line += ` ×${res.hits}`;
  if (res.crit) line += ' CRIT';
  if (res.shattered) line += ' SHATTER!';
  line += ` · -${res.dmg}`;
  blog(line, side);
}

// Is this vfx key one of the ones that actually renders ON THE ENEMY
// (fire/ice/poison/charm/meteor/pierce/slash/impact — every element/
// weapon-style key) rather than on the caster (heal/shield/bless/aura/
// wind)? castSpecial uses this to decide whether sp.vfx belongs in the
// "self effect" beat at all, or needs to be deferred to the attacker's
// contact frame — see the comment above castSpecial for why that
// distinction matters.
function isEnemyFacingVfx(kind) {
  const resolved = resolveVfxKey(kind);
  const asset = resolved && VFX_ASSETS[resolved];
  return !!asset && asset.target === 'enemy';
}

// Casts a special. Self-buffs/shields/heals genuinely read on the
// caster first. But sp.vfx is NOT always a self effect — most attack
// skills (Cinder Touch's 'fire', Twin Fang's 'slash', ...) use it to
// name the IMPACT effect that's supposed to land on the enemy, and
// playing that immediately (as this function used to, unconditionally,
// for every sp.vfx) showed the hit effect on the target well before
// the attacker had even started its approach — "the attacked effect...
// apply first even before the attacker's self apply animation". Only a
// genuinely self-targeted vfx (per VFX_ASSETS' target field) plays
// here; an enemy-facing one is deferred to the attacker's contact
// frame instead, exactly like basicAttack's 'impact' already was.
async function castSpecial(caster, target, sp, side, atkTeam, defTeam) {
  spendMP(caster, sp);
  if (side === 'ally') vibrate(VIBE_SKILL);
  await showBanner(`✦ ${sp.name} ✦`, 'sig');

  // Charmed: every BENEFICIAL effect (heal/shield/buff) goes to the
  // opposing side instead of the caster's own — damage/ailment payloads
  // are unaffected here since runTurn already redirected `target` to the
  // caster itself for those. `realFoe`/`realFoeTeam` are the caster's
  // actual opponent (not `target`, which IS the caster while charmed).
  const charmed = hasAilment(caster, 'charm');
  const realFoe = charmed ? (side === 'ally' ? activeFoe() : activeAlly()) : null;
  const realFoeTeam = charmed ? (side === 'ally' ? battle.enemies : battle.team) : null;
  const healBeneficiary = charmed ? realFoe : caster;
  const teamBeneficiary = charmed ? realFoeTeam : atkTeam;

  // ── SELF-SIDE FIRST (self-targeted vfx only) ──
  const vfxIsEnemyFacing = isEnemyFacingVfx(sp.vfx);
  const selfVfxMs = vfxIsEnemyFacing ? 0 : playSpellVFX(sp.vfx, caster, target, side);
  if (sp.heal && healBeneficiary) {
    const mx = statsOf(healBeneficiary).vit;
    const amt = Math.floor(mx * sp.heal);
    healBeneficiary.hp = Math.min(mx, healBeneficiary.hp + amt);
    healPop(healBeneficiary, amt);
    blog(`💚 ${caster.name} ใช้ ${sp.name} · ${charmed ? `${healBeneficiary.name} ได้รับ` : ''}+${amt} HP${charmed ? ' (สับสน!)' : ''}`, 'buff');
  }
  if (sp.healTeam && teamBeneficiary) {
    teamBeneficiary.forEach(p => {
      if (p.hp <= 0) return;
      const mx = statsOf(p).vit;
      const amt = Math.floor(mx * sp.healTeam);
      p.hp = Math.min(mx, p.hp + amt);
    });
    blog(`💚 ${caster.name} ใช้ ${sp.name} · ฟื้น${charmed ? 'ทีมศัตรู (สับสน!)' : 'ทั้งทีม'}`, 'buff');
  }
  if (sp.reviveTeam && teamBeneficiary) {
    let n = 0;
    teamBeneficiary.forEach(p => {
      if (p.hp > 0) return;
      p.hp = Math.floor(statsOf(p).vit * sp.reviveTeam); n++;
      p._deathVibrated = false; // so a later re-death this fight still buzzes
    });
    blog(`✨ ${caster.name} กู้ระบบ · ชุบชีวิต${charmed ? 'ฝั่งศัตรู (สับสน!)' : ''} ${n} ตัว`, 'buff');
  }
  if (sp.cleanse) { clearAilments(caster); blog(`🧼 ${caster.name} ล้างสถานะ`, 'buff'); }
  if (sp.shieldSelf && healBeneficiary) {
    healBeneficiary._shield = sp.shieldSelf;
    healBeneficiary._shieldTurns = 3;
    blog(`🛡 ${caster.name} ตั้งเกราะ${charmed ? `ให้ ${healBeneficiary.name} (สับสน!)` : ''} ${Math.round(sp.shieldSelf * 100)}%`, 'buff');
  }
  if (sp.buffSelf && healBeneficiary) {
    addAilment(healBeneficiary, { ...sp.buffSelf });
    blog(`🔥 ${charmed ? healBeneficiary.name : caster.name} เข้าสู่สภาวะ ${sp.buffSelf.id}${charmed ? ' (สับสน!)' : ''}`, 'buff');
  }
  if (sp.buffTeam && teamBeneficiary) {
    teamBeneficiary.forEach(p => { if (p.hp > 0) addAilment(p, { id: teamBuffAilmentId(sp), ...sp.buffTeam }); });
    blog(`✨ ${caster.name} เสริมพลัง${charmed ? 'ทีมศัตรู (สับสน!)' : 'ทั้งทีม'}`, 'buff');
  }
  refreshBattleUnits();

  // ── WAIT FOR SELF ANIMATION TO FINISH, THEN A SHORT BEAT ──
  // Self-buffs/heals/the skill-name banner read on the caster first,
  // then the enemy-facing swing follows close behind — NOT after a
  // full extra second like before, which read as a stall between the
  // two halves of the same skill rather than one continuous action.
  const hasEnemyEffect = (sp.pw > 0 && sp.hits > 0) || sp.ailment;
  if (hasEnemyEffect) {
    await wait((selfVfxMs || 0) / battleSpeed);
    await wait(200 / battleSpeed);
  }

  if (sp.pw > 0 && sp.hits > 0) {
    const res = computeDamage(caster, atkTeam, target, defTeam, sp, true, buildAttackProc(caster, target));
    applyFreezeShatter(target, res);
    applyHabitPreHitMods(target, res);
    if (res.evaded) {
      await showBanner('MISS!', 'miss');
      await playAttackSequence(caster, target, res, side, vfxIsEnemyFacing ? sp.vfx : null);
      blog(`${target.name} หลบ ${sp.name} ได้!`, side);
    } else {
      if (res.crit) {
        // No white-out VFX — the crit swell+charge on the attacker (via
        // playHit's crit-attack class) is the crit tell now.
        await showBanner('CRITICAL!!', 'crit');
      }
      // Enemy-facing hit(s): approach, contact (dmg number + hit-flash
      // + HP update together), repeat per hit for a multi-hit skill,
      // speeding up each time — see playAttackSequence/playHit.
      await playAttackSequence(caster, target, res, side, vfxIsEnemyFacing ? sp.vfx : null);
      let line = `✦ ${caster.name} → ${sp.name}`;
      if (res.hits > 1) line += ` ×${res.hits}`;
      if (res.crit) line += ' CRIT';
      if (res.shattered) line += ' SHATTER!';
      line += ` · -${res.dmg}`;
      blog(line, side);
    }
  }
  if (sp.ailment && target.hp > 0) {
    // Pure status skills (no pw/hits) never reach playAttackSequence, so
    // an enemy-facing vfx (e.g. Siren Pulse's 'charm') has to fire here —
    // its only chance to land on the target at all.
    if (vfxIsEnemyFacing && !(sp.pw > 0 && sp.hits > 0)) {
      playSpellVFX(sp.vfx, caster, target, side);
    }
    // ailmentChance (e.g. Mimic's Mesmerise, a flat 30%) makes the
    // status itself a coin flip instead of a guaranteed landing — most
    // ailment specials omit it and always apply, as before.
    if (sp.ailmentChance == null || Math.random() < sp.ailmentChance) {
      addAilment(target, { ...sp.ailment });
      const A = AILMENTS[sp.ailment.id];
      if (A) blog(`${A.icon} ${target.name} ติด${A.thai}`, side);
    } else {
      blog(`${caster.name} ใช้ ${sp.name} แต่ไม่สำเร็จ`, side);
    }
  }
  refreshBattleUnits();
}

// Poison tick, shield countdown, frenzy/charm/freeze duration — run
// ONCE PER FULL ROUND for both participants, from finishRound(). It
// used to run on every half-turn, which made every duration in the
// game expire in half the stated number of turns.
async function endOfTurnTicks(unit) {
  if (!unit || unit.hp <= 0) return;
  const events = tickAilments(unit);
  events.forEach(ev => {
    if (ev.type === 'poison') {
      poisonPop(unit, ev.dmg);
      blog(`☠️ ${unit.name} เสีย ${ev.dmg} HP จากพิษ`, 'sys');
    }
  });
  if (unit._shieldTurns > 0) {
    unit._shieldTurns--;
    if (unit._shieldTurns <= 0) unit._shield = 0;
  }
  // Plants Habit Type: regen if this unit wasn't actually hit this turn
  // (poison/ailment ticks above don't count — only a landed attack sets
  // _tookDamageThisTurn, see applyDamage). Reset for the next turn
  // either way.
  const plantsHab = habitOf(unit);
  if (plantsHab && plantsHab.type === 'plants' && !unit._tookDamageThisTurn && unit.hp > 0) {
    const mhp = statsOf(unit).vit;
    const heal = Math.max(1, Math.round(mhp * 0.05));
    if (unit.hp < mhp) {
      unit.hp = Math.min(mhp, unit.hp + heal);
      healPop(unit, heal);
    }
  }
  unit._tookDamageThisTurn = false;
  refreshBattleUnits();
}

// A kill's exp is priced against the ACTUAL fighter who lands the
// killing blow, at the moment it happens — not guessed afterward from
// whatever enemy the battle ended on. Gap rule: if your active fighter
// out-levels the kill by more than EXP_GAP_MAX, it's farming and grants
// nothing; the enemy being much HIGHER level than you is not penalized
// the same way, since that's a genuinely hard fight, not easy farming.
const EXP_GAP_MAX = 5;
function expForKill(enemy, fighter) {
  const gap = fighter.level - enemy.level;   // + = you outlevel the kill
  if (gap > EXP_GAP_MAX) return 0;
  const base = Math.round(28 * Math.pow(Math.max(1, enemy.level), 1.15));
  const mult = (battle && battle.target && battle.target.reward && battle.target.reward.expMult) || 1;
  return Math.round(base * mult);
}

export async function checkBattleEnd() {
  if (!battle) return true;
  const alliesAlive = battle.team.some(p => p.hp > 0);
  const enemiesAlive = battle.enemies.some(e => e.hp > 0);

  // Haptic: a short double-buzz the first time we notice a unit (either
  // side) has actually died — dedup via _deathVibrated so a unit that's
  // already been credited/exploded doesn't re-trigger on a later check.
  [...battle.team, ...battle.enemies].forEach(u => {
    if (u.hp <= 0 && !u._deathVibrated) {
      u._deathVibrated = true;
      vibrate(VIBE_DEATH);
    }
  });
  // A fallen ally goes Down for a real 5 minutes instead of the old
  // auto-patch-to-10%-HP-at-battle-end — see markDown()/petState() in
  // engine.js and renderClinic()/renderSafeSpot() for how it's fixed.
  battle.team.forEach(p => markDown(p));

  // Credit exp for any enemy that just died THIS check, priced against
  // whichever ally fighter is currently active (the one that would have
  // landed the blow). Each enemy is credited once via _expCredited.
  const fighter = activeAlly();
  if (fighter) {
    battle.enemies.forEach(e => {
      if (e.hp <= 0 && !e._expCredited) {
        e._expCredited = true;
        // A mimic ambush hands out its reward entirely through the
        // post-battle 3-card picker (see showMimicRewardCards()) --
        // skip the normal auto exp/bitz/drop-roll credit so the win
        // isn't double-rewarded.
        if (battle.mode === 'mimic') return;
        const gained = expForKill(e, fighter);
        battle.totalExp = (battle.totalExp || 0) + gained;
        battle.expGapBlocked = battle.expGapBlocked || (gained === 0 && fighter.level - e.level > EXP_GAP_MAX);
        const wave = (battle.run && battle.run.waves[battle.wave]) || battle.enemies;
        const waveBitz = Math.round(6 * Math.max(1, e.level) * (e.isBoss ? BOSS_TUNING.moneyMult : 1));
        battle.totalBitz = (battle.totalBitz || 0) + waveBitz;
        rollEquipDrop(e);
        rollMeatDrop(e);
        rollMaterialDrop(e);
        rollHabitCard(e);
        if (e.isBoss) onBossDefeated(e);
      }
    });
  }

  if (!alliesAlive) { endBattle(false); return true; }

  if (!enemiesAlive) {
    // Wave clear — explode the last enemy standing, then either bring
    // in the next wave's first foe with the same entrance beat, or end
    // the run.
    await playFoeDeathTransition(battle.enemies.find(e => e.hp <= 0) || battle.enemies[0], null);
    if (battle.mode === 'hack' && battle.wave + 1 < battle.run.waveCount) {
      battle.wave++;
      battle.enemies = battle.run.waves[battle.wave];
      battle.phase = 'ally';
      setText('battle-wave', `คลื่น ${battle.wave + 1} / ${battle.run.waveCount}`);
      renderBattleSide(activeAlly(), 'battle-allies', false);
      renderBattleSide(activeFoe(),  'battle-enemies', true);
      const newFoeEl = document.querySelector('#battle-enemies .bunit');
      if (newFoeEl) await playFoeEntrance(newFoeEl);
      renderBench(); renderPotionBar(); renderSkillBar();
      return false;
    }
    endBattle(true);
    return true;
  }

  // Mid-wave: more than one enemy in this encounter — if the foe shown
  // on screen isn't the current active foe anymore, it just died and
  // there's another one alive to bring in.
  const shownEl = document.querySelector('#battle-enemies .bunit');
  const nextFoe = activeFoe();
  if (shownEl && nextFoe && shownEl.dataset.uid !== nextFoe.uid) {
    const deadPet = battle.enemies.find(e => e.uid === shownEl.dataset.uid);
    await playFoeDeathTransition(deadPet, nextFoe);
  }
  return false;
}

function promptSwap() {
  if (!battle) return;
  const alive = battle.team.filter(p => p.hp > 0);
  if (!alive.length) { checkBattleEnd(); return; }
  const menu = $('swap-menu');
  if (!menu) { battle.activeIdx = battle.team.indexOf(alive[0]); scheduleTurn(); return; }
  menu.innerHTML = '';
  menu.classList.add('on');
  alive.forEach(p => {
    const card = el('div', 'swap-card');
    card.innerHTML = `${creatureMarkup(p, 'swap-sprite')}<div class="swap-name">${p.name}</div><div class="swap-hp">♥ ${p.hp}</div>`;
    card.onclick = () => {
      battle.activeIdx = battle.team.indexOf(p);
      menu.classList.remove('on');
      renderBattle();
      scheduleTurn(500);
    };
    menu.appendChild(card);
  });
}

export function endBattle(win) {
  if (!battle) return;
  battle.over = true;
  clearTimeout(battleTimer);
  clearInterval(regenTimer);
  cameraReset(300);
  setTimeScale(1);

  if (battle.mode === 'raid') {
    const { rival, loot } = battle.raid;
    const done = $('battle-done');
    if (done) {
      done.style.display = '';
      done.onclick = () => {
        done.style.display = 'none';
        setBattle(null);
        finishRaid(win, win ? loot : null);
      };
    }
    save();
    return;
  }

  // A train-ride ambush skips the normal battle-report screen entirely
  // -- the travel code (startMimicAmbush()'s caller, see travelTo() in
  // the World map section) is awaiting battle.mimicResolve and takes
  // it from here: reward-card picker on a win, then resume the ride.
  if (battle.mode === 'mimic') {
    save();
    const resolve = battle.mimicResolve;
    const mimic = battle.enemies[0];
    setBattle(null);
    showScreen('world');
    renderAll();
    if (resolve) resolve({ win, mimic });
    return;
  }

  let results = null;
  if (win) {
    G.wins++;
    // totalExp/totalBitz were accumulated per-kill in checkBattleEnd as
    // the fight happened, already gap-gated per kill — nothing to
    // recompute here.
    battle.totalExp = battle.totalExp || 0;
    battle.totalBitz = battle.totalBitz || Math.round((battle.target?.reward?.bitzMult || 1) * 30 * (activeTeam()[0]?.level || 1));
    G.bitz += battle.totalBitz;
    const share = Math.floor(battle.totalExp / Math.max(1, battle.team.length));
    results = battle.team.map(p => {
      const beforeLv = p.level, beforeExp = p.exp, beforeNeed = p.expNeed;
      const beforeLoyId = loyaltyTier(p.loyalty).id;
      const evs = share > 0 ? grantExp(p, share) : [];
      const leveled = evs.filter(e => e.type === 'levelup').length;
      const skills = evs.filter(e => e.type === 'skill').map(e => e.name);
      evs.forEach(e => {
        if (e.type === 'levelup') blog(`⬆️ ${p.name} → Lv.${e.level} (+${e.pts} แต้ม)`, 'buff');
        if (e.type === 'skill') blog(`✨ ${p.name} ปลดล็อก ${e.name}`, 'buff');
      });
      p.loyalty = clamp((p.loyalty || 0) + LOYALTY_PER_WIN, 0, 100);
      const loyPromo = loyaltyTier(p.loyalty).id !== beforeLoyId ? loyaltyTier(p.loyalty) : null;
      if (loyPromo) blog(`${loyPromo.icon} ${p.name} → ${loyPromo.name}!`, 'buff');
      return {
        pet: p, gained: share, beforeLv, beforeExp, beforeNeed,
        afterLv: p.level, afterExp: p.exp, afterNeed: p.expNeed,
        maxed: p.level >= p.maxLv, leveled, skills, loyPromo,
      };
    });
    if (battle.totalExp === 0 && battle.expGapBlocked) {
      blog(`ระดับสูงกว่าศัตรูเกิน ${EXP_GAP_MAX} เลเวล — ไม่ได้รับ EXP`, 'sys');
    }
    blog(`สำเร็จ! +${battle.totalExp} EXP · +${battle.totalBitz} Bitz`, 'win');
    log(`ชนะ ${battle.mode === 'hack' || battle.mode === 'boss' ? battle.target.name : 'Arena'} · +${battle.totalBitz} Bitz`, 'win');
  } else {
    blog('การเจาะล้มเหลว — ทีมถูกตรวจจับ', 'lose');
    log(`แพ้ ${battle.mode === 'hack' || battle.mode === 'boss' ? battle.target.name : 'Arena'}`, 'lose');
  }
  save();

  const returnTo = (battle.mode === 'hack' || battle.mode === 'boss') ? 'world' : 'map';
  showBattleResults(win, battle.totalBitz || 0, battle.totalExp || 0, results, returnTo);
}

function showBattleResults(win, bitz, exp, results, returnTo) {
  const panel = $('battle-results');
  if (!panel) {
    const done = $('battle-done');
    if (done) {
      done.style.display = '';
      done.onclick = () => { done.style.display = 'none'; setBattle(null); showScreen(returnTo); renderAll(); };
    }
    return;
  }
  const rows = (results || []).map(r => {
    const pct0 = r.maxed ? 100 : Math.round(r.beforeExp / Math.max(1, r.beforeNeed) * 100);
    const pct1 = r.maxed ? 100 : Math.round(r.afterExp / Math.max(1, r.afterNeed) * 100);
    const lvUp = r.leveled > 0 ? `<span class="br-lvup">▲ Lv.${r.beforeLv} → ${r.afterLv}</span>` : '';
    const extra = [
      ...(r.skills || []).map(n => `<span class="br-skill">✨ ${n}</span>`),
      r.loyPromo ? `<span class="br-loy">${r.loyPromo.icon} ${r.loyPromo.name}</span>` : '',
    ].join('');
    return `<div class="br-row" data-pct0="${pct0}" data-pct1="${pct1}" data-leveled="${r.leveled}">
      <div class="br-art">${creatureMarkup(r.pet, 'br-sprite')}</div>
      <div class="br-info">
        <div class="br-name">${r.pet.name} ${lvUp}</div>
        <div class="br-xpbar"><i style="width:${pct0}%"></i></div>
        <div class="br-xptext">${r.maxed ? 'ระดับสูงสุด' : `EXP ${r.afterExp}/${r.afterNeed}`}<span class="br-gain">+${r.gained}</span></div>
        ${extra ? `<div class="br-extra">${extra}</div>` : ''}
      </div></div>`;
  }).join('');
  panel.innerHTML = `<div class="br-card ${win ? 'win' : 'lose'}">
    <div class="br-title">${win ? '✅ ชนะ!' : '❌ พ่ายแพ้'}</div>
    ${win ? `<div class="br-loot">💰 +${bitz} Bitz · ⚡ +${exp} EXP รวม</div>` : ''}
    <div class="br-rows">${rows || '<div class="br-empty">ทีมกลับมาพร้อม HP บางส่วน</div>'}</div>
    <button class="btn primary wide" id="br-continue">ต่อไป →</button>
  </div>`;
  panel.classList.add('on');
  requestAnimationFrame(() => {
    panel.querySelectorAll('.br-row').forEach(row => {
      const bar = row.querySelector('.br-xpbar i');
      const pct1 = +row.dataset.pct1, leveled = +row.dataset.leveled;
      if (!bar) return;
      setTimeout(() => {
        if (leveled > 0) {
          bar.style.width = '100%';
          setTimeout(() => { bar.style.transition = 'none'; bar.style.width = '0%';
            requestAnimationFrame(() => { bar.style.transition = ''; bar.style.width = pct1 + '%'; });
          }, 420);
        } else {
          bar.style.width = pct1 + '%';
        }
      }, 260);
    });
  });
  $('br-continue').onclick = () => {
    panel.classList.remove('on');
    panel.innerHTML = '';
    setBattle(null);
    showScreen(returnTo);
    renderAll();
  };
}

export function fleeBattle() {
  if (!battle || battle.over) return;
  // A mimic ambush is a forced encounter mid-ride ("once a ride" per
  // spec) AND its outcome drives a pending Promise the train's resume
  // animation is awaiting (see travelTo()/startMimicAmbush()) — fleeing
  // here used to null out `battle` without ever resolving that Promise,
  // permanently hanging the ride with no way to finish the trip.
  // Blocking the flee button entirely is simpler and safer than trying
  // to resolve it correctly from every possible exit path.
  if (battle.mode === 'mimic') { toast('หนีจาก Mimic ไม่ได้ระหว่างซุ่มโจมตี!'); return; }
  battle.over = true;
  clearTimeout(battleTimer);
  clearInterval(regenTimer);
  cameraReset(300); setTimeScale(1);
  blog('ถอนตัวออกจากระบบ', 'sys');
  // Same mode -> destination mapping as the normal win/loss flow
  // (showBattleResults' returnTo) — fleeing a hack/boss fight (always
  // entered from World) used to hardcode a return to the city Map
  // instead, kicking the player out of the adventure they were on.
  const returnTo = (battle.mode === 'hack' || battle.mode === 'boss') ? 'world' : 'map';
  save();
  setBattle(null);
  showScreen(returnTo);
  renderAll();
}
