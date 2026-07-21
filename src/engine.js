// ═══════════════════════════════════════════════════════════
// VIRUZ PET — ENGINE
// Stat math, team synergy, support effects, combat resolution.
// No DOM access. Pure functions where possible so this stays
// testable and reusable server-side later.
// ═══════════════════════════════════════════════════════════

import {
  ATTR, ATTR_KEYS, WHITE_TRAIT_ROLL, SUPPORT, SYNERGY,
  RARITY, RARITY_KEYS, SPECIES, ANTIVIRUZ, TUNING,
} from './data.js';

// ── Helpers ──
export function uid() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export function rollWeighted(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [k, w] of pairs) { r -= w; if (r <= 0) return k; }
  return pairs[pairs.length - 1][0];
}
export function randAttr() {
  return ATTR_KEYS[Math.floor(Math.random() * ATTR_KEYS.length)];
}
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── PET CREATION ──
export function createPet(speciesId, rarity, forcedAttr = null) {
  const sp = SPECIES[speciesId];
  if (!sp) return null;
  const attr = forcedAttr || sp.fixedAttr || randAttr();
  const pet = {
    uid: uid(),
    speciesId,
    name: sp.name,
    shape: sp.shape,
    palette: sp.palette,
    gif: sp.gif || null,
    rarity,
    attr,
    stage: 0,
    level: 1,
    exp: 0,
    expNeed: TUNING.expCurve(1),
    statPts: 0,
    base: { ...sp.base },
    skills: sp.skills.map(s => ({ ...s })),
    maxLv: RARITY[rarity].maxLv,
    hp: 0,          // set below
    whiteTrait: null,
  };
  if (attr === 'white') {
    pet.whiteTrait = rollWeighted(WHITE_TRAIT_ROLL);
  }
  pet.hp = statsOf(pet).mhp;
  return pet;
}

export function rollEgg(egg) {
  let cum = 0, chosen = egg.pool[0];
  const r = Math.random();
  for (let i = 0; i < egg.pool.length; i++) {
    cum += egg.rates[i];
    if (r < cum) { chosen = egg.pool[i]; break; }
  }
  const pool = Object.keys(SPECIES).filter(k => SPECIES[k].rarities.includes(chosen));
  const speciesId = pool[Math.floor(Math.random() * pool.length)];
  return createPet(speciesId, chosen);
}

// ── STATS ──
// Base + level growth, then rarity growth bonus, then attribute
// multipliers, then evolution stage multiplier.
// HP_SCALE: species `base.mhp` values (62-150) were tuned for the old
// "start at full stats" curve. Dividing by this constant compresses
// level-1 max HP down to roughly 10-20, per design — everything else
// (atk/def/spd, rarity, evolution) is untouched, so relative power
// between species/rarities/stages is preserved; only the HP *number*
// is rescaled. Growth per level is then added on top in real units,
// so HP still climbs meaningfully as the pet levels.
const HP_SCALE = 4;
// Damage is divided by a SMALLER constant than HP, so each hit removes
// a bigger slice of the health bar. This is what keeps fights short
// enough that the attack animation stays watchable instead of the
// battle dragging for dozens of turns.
const DMG_SCALE = 2.6;
const HP_LEVEL_GROWTH = 2.6;   // flat HP gained per level, before rarity/attr mult

export function statsOf(pet) {
  const lv = pet.level - 1;
  const rar = RARITY[pet.rarity];
  const am = ATTR[pet.attr].mult;
  const stageMult = [1, 1.5, 2.0][pet.stage] || 1;
  const growth = 1 + rar.statPL * 0.18;

  const hpBase = pet.base.mhp / HP_SCALE;
  const raw = {
    atk: pet.base.atk + lv * 1.2 * growth,
    def: pet.base.def + lv * 0.9 * growth,
    spd: pet.base.spd + lv * 0.8 * growth,
    mhp: hpBase + lv * HP_LEVEL_GROWTH * (1 + rar.statPL * 0.14),
  };
  return {
    atk: Math.max(1, Math.floor(raw.atk * am.atk * stageMult)),
    def: Math.max(1, Math.floor(raw.def * am.def * stageMult)),
    spd: Math.max(1, Math.floor(raw.spd * am.spd * stageMult)),
    mhp: Math.max(8, Math.floor(raw.mhp * am.mhp * stageMult)),
  };
}

// Single number used for matchmaking and power comparisons.
export function powerOf(pet) {
  const s = statsOf(pet);
  return Math.floor(s.atk * 2 + s.def * 1.6 + s.spd * 1.2 + s.mhp * 0.35);
}
export function teamPower(team) {
  const base = team.reduce((sum, p) => sum + (p ? powerOf(p) : 0), 0);
  return Math.floor(base * synergyOf(team).mult);
}

export function availableSkills(pet) {
  return pet.skills.filter(s => !s.reqLv || pet.level >= s.reqLv);
}

// ── SYNERGY ──
// Looks at the most frequent attribute in the team.
export function synergyOf(team) {
  const live = team.filter(Boolean);
  if (live.length < 2) return { mult: 1, count: 0, attr: null, label: null };
  const counts = {};
  live.forEach(p => { counts[p.attr] = (counts[p.attr] || 0) + 1; });
  let bestAttr = null, bestN = 0;
  for (const k in counts) if (counts[k] > bestN) { bestN = counts[k]; bestAttr = k; }
  const entry = SYNERGY[bestN];
  if (!entry) return { mult: 1, count: bestN, attr: bestAttr, label: null };
  return { mult: entry.mult, count: bestN, attr: bestAttr, label: entry.label };
}

// ── WHITE SUPPORT ──
// Returns aggregated support numbers from all living white viruz.
export function supportOf(team) {
  let auraPct = 0, regenPct = 0;
  team.filter(p => p && p.hp > 0 && p.attr === 'white').forEach(p => {
    const t = p.whiteTrait;
    const aura = clamp(
      SUPPORT.auraBasePct + p.level * SUPPORT.auraPerLevel,
      0, SUPPORT.auraCap);
    const regen = clamp(
      SUPPORT.regenBasePct + p.level * SUPPORT.regenPerLevel,
      0, SUPPORT.regenCap);
    if (t === 'aura')  auraPct  += aura;
    if (t === 'regen') regenPct += regen;
    if (t === 'both')  { auraPct += aura * SUPPORT.bothScale; regenPct += regen * SUPPORT.bothScale; }
  });
  return { auraPct, regenPct };
}

// Effective combat stats for one pet inside a team context.
export function combatStats(pet, team) {
  const s = statsOf(pet);
  const syn = synergyOf(team).mult;
  const sup = supportOf(team);
  const m = syn * (1 + sup.auraPct);
  return {
    atk: Math.floor(s.atk * m),
    def: Math.floor(s.def * m),
    spd: Math.floor(s.spd * m),
    mhp: s.mhp,          // max HP is not buffed, only offense/defense/speed
  };
}

// ── DAMAGE ──
export function computeDamage(attacker, atkTeam, defender, defTeam, skill, isSpecial) {
  const a = combatStats(attacker, atkTeam);
  const d = combatStats(defender, defTeam);
  const specialMult = isSpecial ? 1.5 : 1.0;
  const variance = 0.9 + Math.random() * 0.2;

  // HP was compressed by HP_SCALE (see statsOf) so pets start at
  // ~10-20 HP instead of ~100. Dividing the whole damage expression
  // by the same constant keeps the atk-vs-def trade ratio exactly
  // as it was before the HP change (mathematically: (x-y)/k is the
  // same shape as x/k - y/k) — only the final number is smaller, so
  // low-level fights resolve in a similar number of turns as before.
  //
  // Note: high-level/high-DEF matchups (e.g. Lv30 epic vs a tanky
  // yellow defender) were already slow to resolve in the ORIGINAL
  // formula — 20+ hits to kill — this is a pre-existing balance
  // characteristic of the def*0.5 constant, not something this
  // change introduced. Worth tuning separately if it feels bad in
  // actual play; out of scope for the "start at low HP" request.
  let dmg = ((a.atk * (skill.pw / 50) * specialMult) - (d.def * 0.5)) / DMG_SCALE;
  dmg = Math.max(1, Math.floor(dmg * variance));

  // Green attribute: chance to strike twice
  let hits = 1;
  const cfg = ATTR[attacker.attr];
  if (cfg.doubleHit && Math.random() < cfg.doubleHit) hits = 2;

  // Crit based on speed difference
  const spdGap = a.spd - d.spd;
  const critChance = clamp(0.05 + spdGap * 0.006, 0.02, 0.35);
  const crit = Math.random() < critChance;
  if (crit) dmg = Math.floor(dmg * 1.6);

  return { dmg: dmg * hits, hits, crit };
}

// Turn order: fastest first, ties broken randomly.
export function turnOrder(units) {
  return units
    .filter(u => u.pet && u.pet.hp > 0)
    .map(u => ({ ...u, _spd: combatStats(u.pet, u.team).spd + Math.random() * 2 }))
    .sort((a, b) => b._spd - a._spd);
}

// ── LEVELING ──
export function grantExp(pet, amount) {
  const events = [];
  if (pet.level >= pet.maxLv) return events;
  pet.exp += amount;
  while (pet.exp >= pet.expNeed && pet.level < pet.maxLv) {
    pet.exp -= pet.expNeed;
    pet.level++;
    pet.expNeed = TUNING.expCurve(pet.level);
    pet.statPts += RARITY[pet.rarity].statPL;
    events.push({ type: 'levelup', level: pet.level, pts: RARITY[pet.rarity].statPL });
    pet.skills.forEach(sk => {
      if (sk.reqLv === pet.level) events.push({ type: 'skill', name: sk.n });
    });
  }
  if (pet.level >= pet.maxLv) { pet.exp = 0; }
  return events;
}

export function canEvolve(pet) {
  const sp = SPECIES[pet.speciesId];
  if (!sp) return { ok: false, reason: 'unknown species' };
  if (pet.stage >= 2) return { ok: false, reason: 'ถึงขั้นสูงสุดแล้ว' };
  const next = sp.evos[pet.stage + 1];
  if (!next) return { ok: false, reason: 'ไม่มีวิวัฒนาการ' };
  if (pet.level < next.reqLv) return { ok: false, reason: `ต้องถึง Lv.${next.reqLv}` };
  return { ok: true, next };
}

export function evolve(pet, force = false) {
  const sp = SPECIES[pet.speciesId];
  if (!sp || pet.stage >= 2) return null;
  const next = sp.evos[pet.stage + 1];
  if (!next) return null;
  if (!force && pet.level < next.reqLv) return null;
  pet.stage++;
  ['atk', 'def', 'spd', 'mhp'].forEach(k => {
    pet.base[k] = Math.floor(pet.base[k] * next.mult);
  });
  if (next.skill) pet.skills.push({ ...next.skill });
  pet.hp = statsOf(pet).mhp;
  return next;
}

// ── ANTIVIRUZ SPAWN ──
export function spawnAntiviruz(defId, level) {
  const def = ANTIVIRUZ[defId];
  if (!def) return null;
  const attr = def.attr || randAttr();
  const scale = 0.85 + level * 0.16;
  const pet = {
    uid: uid(),
    speciesId: defId,
    name: def.name,
    shape: def.shape,
    palette: def.palette,
    rarity: 'normal',
    attr,
    stage: 0,
    level,
    exp: 0, expNeed: 9e9, statPts: 0,
    base: {
      atk: Math.floor(def.base.atk * scale),
      def: Math.floor(def.base.def * scale),
      spd: Math.floor(def.base.spd * scale),
      mhp: Math.floor(def.base.mhp * scale),
    },
    skills: [{ n: 'Scan Strike', pw: 40, special: false }],
    maxLv: 999,
    hp: 0,
    whiteTrait: attr === 'white' ? rollWeighted(WHITE_TRAIT_ROLL) : null,
    isEnemy: true,
  };
  pet.hp = statsOf(pet).mhp;
  return pet;
}

// Build the full wave list for a hack target.
export function buildHackRun(target) {
  const [wMin, wMax] = target.waves;
  const waveCount = wMin + Math.floor(Math.random() * (wMax - wMin + 1));
  const [lMin, lMax] = target.enemyLv;
  const waves = [];
  for (let w = 0; w < waveCount; w++) {
    // Later waves get bigger and stronger
    const size = clamp(1 + Math.floor(w / 1.5), 1, 3);
    const units = [];
    for (let i = 0; i < size; i++) {
      const id = target.pool[Math.floor(Math.random() * target.pool.length)];
      const t = waveCount > 1 ? w / (waveCount - 1) : 0;
      const lv = Math.max(1, Math.round(lMin + (lMax - lMin) * t));
      units.push(spawnAntiviruz(id, lv));
    }
    waves.push(units);
  }
  return { target, waves, waveIndex: 0, waveCount };
}

// ── RAID RESOLUTION (instant, with a readable log) ──
// Used for attacking another player's base. Deterministic enough
// to be re-run server-side later for validation.
export function resolveRaid(attackTeam, defense) {
  const atkPower = teamPower(attackTeam);
  const defPower = (defense.petPower || 0) + (defense.botPower || 0);
  const log = [];

  log.push({ t: 'info', m: `พลังโจมตี ${atkPower} vs ป้องกัน ${defPower}` });

  // Rounds of attrition; each round the stronger side chips the other.
  let atkHp = atkPower * 1.0;
  let defHp = defPower * 1.0;
  let round = 0;
  while (atkHp > 0 && defHp > 0 && round < 12) {
    round++;
    const swingA = atkPower * (0.16 + Math.random() * 0.10);
    const swingD = defPower * (0.16 + Math.random() * 0.10);
    defHp -= swingA;
    atkHp -= swingD;
    log.push({
      t: 'round',
      m: `รอบ ${round}: เจาะ -${Math.floor(swingA)} · โดนตอบ -${Math.floor(swingD)}`,
    });
  }

  const win = defHp <= 0 && atkHp > 0;
  const ratio = clamp(atkPower / Math.max(1, defPower), 0.3, 2.5);
  const loot = win ? Math.floor((defense.loot || 200) * clamp(ratio, 0.5, 1.5)) : 0;

  log.push({
    t: win ? 'win' : 'lose',
    m: win ? `เจาะฐานสำเร็จ! ได้ ${loot} Bitz` : 'การเจาะล้มเหลว ระบบป้องกันแข็งเกินไป',
  });

  return { win, loot, rounds: round, log, atkPower, defPower };
}

// ── TEAM UTILITIES ──
export function healTeam(team, pct) {
  team.filter(Boolean).forEach(p => {
    const mhp = statsOf(p).mhp;
    p.hp = clamp(Math.floor(p.hp + mhp * pct), 0, mhp);
  });
}
export function teamAlive(team) {
  return team.some(p => p && p.hp > 0);
}
export function firstAlive(team) {
  return team.find(p => p && p.hp > 0) || null;
}
