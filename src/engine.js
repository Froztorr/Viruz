// ═══════════════════════════════════════════════════════════
// VIRUZ PET — ENGINE
// Stat math, team synergy, support effects, combat resolution.
// No DOM access. Pure functions where possible so this stays
// testable and reusable server-side later.
// ═══════════════════════════════════════════════════════════

import {
  ATTR, ATTR_KEYS, WHITE_TRAIT_ROLL, SUPPORT, SYNERGY,
  RARITY, RARITY_KEYS, SPECIES, ANTIVIRUZ, TUNING, loyaltyTier, SIGNATURE_SKILLS, LOYALTY_TIERS,
  HACK_WORDS, HACK_JUNK, hackDifficulty, wordLikeness,
  SKILL_TREES, SPECIALS, AILMENTS, STAT_KEYS, treeFor, nodeById,
  speedGain, SKILL_TIER_BONUS } from './data.js';

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
    loyalty: 0,            // 0-100, drives LOYALTY_TIERS
    tree: {},              // { nodeId: rank } — skill tree spend
    growthPts: 0,          // unspent growth points (1 per level)
    autoCast: {},          // { specialId: true } — auto-use in battle
    mp: 0,                 // current MP (max = int stat)
    spdCounter: 0,         // speed accrual toward a double action
    ailments: [],
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
const DMG_SCALE = 1.55;
const HP_LEVEL_GROWTH = 2.6;   // flat HP gained per level, before rarity/attr mult

export function statsOf(pet) {
  const lv = pet.level - 1;
  const rar = RARITY[pet.rarity];
  const am = ATTR[pet.attr].mult;
  const stageMult = [1, 1.5, 2.0][pet.stage] || 1;
  const growth = 1 + rar.statPL * 0.18;
  const loyMult = loyaltyTier(pet.loyalty).mult;

  const hpBase = pet.base.mhp / HP_SCALE;
  const raw = {
    atk: pet.base.atk + lv * 1.2 * growth,
    def: pet.base.def + lv * 0.9 * growth,
    spd: pet.base.spd + lv * 0.8 * growth,
    vit: hpBase + lv * HP_LEVEL_GROWTH * (1 + rar.statPL * 0.14),
    // New stats. crit/eva are PERCENTAGES; int is the MP pool.
    crit: 5 + rar.statPL * 1.5,
    eva:  3 + rar.statPL * 1.0,
    int:  20 + lv * 1.6 * growth,
  };

  // Points spent in the skill tree add flat bonuses on top.
  const tb = treeBonuses(pet);

  const out = {
    atk: Math.max(1, Math.floor(raw.atk * am.atk * stageMult * loyMult) + tb.atk),
    def: Math.max(1, Math.floor(raw.def * am.def * stageMult * loyMult) + tb.def),
    spd: Math.max(1, Math.floor(raw.spd * am.spd * stageMult * loyMult) + tb.spd),
    vit: Math.max(8, Math.floor(raw.vit * am.mhp * stageMult * loyMult) + tb.vit),
    crit: Math.min(75, Math.round(raw.crit + tb.crit)),
    eva:  Math.min(60, Math.round(raw.eva  + tb.eva)),
    int:  Math.max(10, Math.floor(raw.int * loyMult) + tb.int),
  };
  // `mhp` kept as an alias so older call sites keep working.
  out.mhp = out.vit;
  return out;
}

// Sum the flat stat bonuses a pet has bought in its skill tree.
export function treeBonuses(pet) {
  const z = { atk:0, def:0, spd:0, vit:0, crit:0, eva:0, int:0 };
  const spent = pet.tree || {};
  const tree = treeFor(pet.attr);
  for (const nid in spent) {
    const rank = spent[nid];
    if (!rank) continue;
    const node = tree.nodes.find(n => n.id === nid);
    if (!node || node.kind !== 'stat') continue;
    z[node.stat] = (z[node.stat] || 0) + node.per * rank;
  }
  return z;
}

// Which specials a pet has unlocked (skill-node ids taken).
export function unlockedSpecials(pet) {
  const spent = pet.tree || {};
  const tree = treeFor(pet.attr);
  const out = [];
  tree.nodes.forEach(n => {
    if (n.kind === 'skill' && spent[n.id]) {
      const sp = SPECIALS[n.skill];
      if (sp) out.push(sp);
    }
  });
  return out;
}

// Can this node be taken right now?
export function canTakeNode(pet, nodeId) {
  const tree = treeFor(pet.attr);
  const node = tree.nodes.find(n => n.id === nodeId);
  if (!node) return { ok:false, why:'ไม่พบโหนด' };
  const spent = pet.tree || {};
  const rank = spent[nodeId] || 0;
  if (rank >= node.max) return { ok:false, why:'สูงสุดแล้ว' };
  if (pet.level < node.reqLv) return { ok:false, why:`ต้องเลเวล ${node.reqLv}` };
  if ((pet.growthPts || 0) < 1) return { ok:false, why:'ไม่มีแต้ม' };
  for (const r of node.req) {
    const parent = tree.nodes.find(n => n.id === r);
    const pr = spent[r] || 0;
    if (!parent) continue;
    if (pr < parent.max) return { ok:false, why:`ต้องปลดล็อก ${r} ให้เต็มก่อน` };
  }
  return { ok:true };
}

export function takeNode(pet, nodeId) {
  const chk = canTakeNode(pet, nodeId);
  if (!chk.ok) return chk;
  pet.tree = pet.tree || {};
  pet.tree[nodeId] = (pet.tree[nodeId] || 0) + 1;
  pet.growthPts = (pet.growthPts || 0) - 1;
  return { ok:true };
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
  const list = pet.skills.filter(s => !s.reqLv || pet.level >= s.reqLv);
  // Loyal Buddy unlocks a signature attack chosen by attribute.
  const sig = signatureSkillOf(pet);
  if (sig) list.push(sig);
  return list;
}

// The named special a pet has earned, or null if not yet Loyal Buddy.
export function signatureSkillOf(pet) {
  if (!pet) return null;
  if (loyaltyTier(pet.loyalty).id !== 'loyal') return null;
  return SIGNATURE_SKILLS[pet.attr] || null;
}

// Battle-start buffs from loyalty tier. Applied once when a fighter
// steps onto the stage, not per-turn.
export function loyaltyBuffs(pet) {
  const tier = loyaltyTier(pet && pet.loyalty);
  switch (tier.id) {
    case 'friendly': return { def: 1.08, spd: 1.00 };
    case 'trusted':  return { def: 1.15, spd: 1.10 };
    case 'loyal':    return { def: 1.20, spd: 1.15 };
    default:         return { def: 1.00, spd: 1.00 };
  }
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
  const lb = loyaltyBuffs(pet);
  const ail = ailmentMods(pet);
  return {
    atk:  Math.floor(s.atk * m * ail.atk),
    def:  Math.floor(s.def * m * lb.def * ail.def),
    spd:  Math.floor(s.spd * m * lb.spd * ail.spd),
    crit: s.crit,
    eva:  s.eva,
    int:  s.int,
    vit:  s.vit,
    mhp:  s.vit,
  };
}

// ── DAMAGE ──
export function computeDamage(attacker, atkTeam, defender, defTeam, skill, isSpecial) {
  const a = combatStats(attacker, atkTeam);
  const d = combatStats(defender, defTeam);

  // ── EVASION ── checked before anything else
  if (Math.random() * 100 < d.eva) {
    return { dmg: 0, hits: 0, crit: false, evaded: true };
  }

  const pw = skill.pw != null ? skill.pw : 1;
  const specialMult = isSpecial ? 1.35 : 1.0;
  const variance = 0.9 + Math.random() * 0.2;

  // Skills may ignore a fraction of DEF.
  const defFactor = 1 - (skill.ignoreDef || 0);
  const effDef = d.def * defFactor;

  // RATIO-based mitigation instead of flat subtraction. The old
  // `atk - def*0.5` model floored to 1 damage whenever DEF outgrew ATK
  // (monsters double-scale their base DEF, so a Lv30 tank hit 224 DEF
  // against a 55 ATK pet and every hit did 1). A ratio can never go
  // negative and keeps tanks tanky without making them immortal.
  const mitigation = effDef / (effDef + 140);          // 0..~0.8
  let base = (a.atk * pw * specialMult) * (1 - mitigation) / (DMG_SCALE * 0.35);
  base = Math.max(1, base * variance);

  // ── CRIT ── now driven by the crit STAT (a percentage), x2 damage
  const crit = Math.random() * 100 < a.crit;
  if (crit) base *= 2;

  // Multi-hit skills strike `hits` times; each hit rolls its own value.
  const hits = Math.max(1, skill.hits || 1);
  let total = 0;
  for (let i = 0; i < hits; i++) {
    total += Math.max(1, Math.floor(base * (0.94 + Math.random() * 0.12)));
  }

  return { dmg: total, hits, crit, evaded: false };
}

// ── AILMENTS ──
export function addAilment(unit, spec) {
  if (!spec || !spec.id) return null;
  unit.ailments = unit.ailments || [];
  // refresh if already present
  const found = unit.ailments.find(x => x.id === spec.id);
  if (found) { found.turns = Math.max(found.turns, spec.turns); return found; }
  const inst = { ...spec };
  unit.ailments.push(inst);
  return inst;
}
export function hasAilment(unit, id) {
  return !!(unit.ailments || []).find(a => a.id === id);
}
export function clearAilments(unit) { unit.ailments = []; }

// Tick every ailment down one turn; returns events for the UI/log.
export function tickAilments(unit) {
  const events = [];
  if (!unit.ailments || !unit.ailments.length) return events;
  const stats = statsOf(unit);
  unit.ailments = unit.ailments.filter(a => {
    if (a.id === 'poison') {
      const dmg = Math.max(1, Math.floor(stats.vit * (a.val || 0.05)));
      unit.hp = Math.max(0, unit.hp - dmg);
      events.push({ type:'poison', dmg });
    }
    a.turns -= 1;
    if (a.turns <= 0) { events.push({ type:'expire', id:a.id }); return false; }
    return true;
  });
  return events;
}

// Ailment/buff modifiers folded into combat stats.
export function ailmentMods(unit) {
  const m = { atk:1, def:1, spd:1 };
  (unit.ailments || []).forEach(a => {
    if (a.id === 'frenzy') {
      m.atk *= 1 + (a.atk || 0);
      m.spd *= 1 + (a.spd || 0);
      m.def *= 1 + (a.def || 0);   // def is negative for frenzy
    }
  });
  if (unit._shield) m.def *= 1 + unit._shield;
  return m;
}

// ── SPEED COUNTER ──
// Called once per turn for a unit. Accrues based on the SPD gap with its
// current opponent; at >= 1 the unit acts twice and the counter resets.
export function advanceSpeedCounter(unit, mySpd, foeSpd) {
  unit.spdCounter = (unit.spdCounter || 0) + speedGain(mySpd, foeSpd);
  if (unit.spdCounter >= 1) {
    unit.spdCounter -= 1;
    return 2;      // double action this turn
  }
  return 1;
}

// ── MP ──
export function maxMP(pet) { return statsOf(pet).int; }
export function canCast(pet, sp) { return (pet.mp || 0) >= sp.mp; }
export function spendMP(pet, sp) { pet.mp = Math.max(0, (pet.mp || 0) - sp.mp); }
export function restoreMP(pet, amount) {
  pet.mp = Math.min(maxMP(pet), (pet.mp || 0) + amount);
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
    // One growth point per level, spent in the skill tree.
    pet.growthPts = (pet.growthPts || 0) + 1;
    events.push({ type: 'levelup', level: pet.level, pts: RARITY[pet.rarity].statPL, growth: 1 });
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
    gif: def.gif || null,
    ext: def.ext || null,
    faces: def.faces || 'right',
    scale: def.scale || 1,
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
  const [lMin, lMax] = target.lv || target.enemyLv;
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


// ── HACK: PASSWORD PUZZLE ──
// Builds a Fallout-style terminal: a grid of hex addresses, each row
// padded with junk characters, with `wordCount` real words hidden in
// the stream. One of them is the password.
export function buildHackPuzzle(targetLevel) {
  const diff = hackDifficulty(targetLevel);
  const pool = HACK_WORDS[diff.len].slice();
  // pick unique words
  const words = [];
  while (words.length < diff.words && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    words.push(pool.splice(i, 1)[0]);
  }
  const answer = words[Math.floor(Math.random() * words.length)];

  // Build a character stream: junk with words embedded at random slots.
  const rows = 16, cols = diff.len + 6;
  const totalCells = rows * cols;
  const stream = [];
  for (let i = 0; i < totalCells; i++) {
    stream.push(HACK_JUNK[Math.floor(Math.random() * HACK_JUNK.length)]);
  }
  // Place each word so it doesn't overlap another
  const placements = [];
  const slots = [];
  for (const w of words) {
    let tries = 0, pos;
    do {
      pos = Math.floor(Math.random() * (totalCells - w.length));
      tries++;
    } while (tries < 60 && slots.some(s => pos < s.end + 1 && pos + w.length + 1 > s.start));
    slots.push({ start: pos, end: pos + w.length });
    for (let k = 0; k < w.length; k++) stream[pos + k] = w[k];
    placements.push({ word: w, start: pos, len: w.length });
  }

  // Hex address per row (cosmetic, Fallout-style)
  const baseAddr = 0x5B00 + Math.floor(Math.random() * 0x200);
  const addrs = [];
  for (let r = 0; r < rows; r++) addrs.push('0x' + (baseAddr + r * cols).toString(16).toUpperCase());

  return {
    answer, words, stream, rows, cols, addrs, placements,
    attempts: diff.attempts, len: diff.len,
  };
}

// Given a guessed word, return likeness + whether it's correct.
export function checkHackGuess(puzzle, word) {
  const correct = word === puzzle.answer;
  return { correct, likeness: wordLikeness(word, puzzle.answer) };
}
