// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { ATTR, GUARD_TIERS, MAPS, POTIONS, SPECIES_KEYS, THROW_UTILITY_POTIONS, ZONES, guardTierForLevel, randomBossZone, zoneById } from '../data.js';
import { buildHackRun, clamp, createPet, petState, reviveDownPet, spawnAntiviruz, spawnBoss, statsOf, supportOf, synergyOf, teamAlive, teamPower, uid } from '../engine.js';
import { eliteChanceAt, heatMeterPct, makeElite, registerNodeFight, spawnHunter } from '../heat.js';
import { refreshBattleUnits, renderBattle, renderBattleSide } from './combat.js';
import { applyBattleStartEquip } from './equipment.js';
import { startSkillCooldownTicker, throwItemAvailable, wait } from './extras.js';
import { checkBattleEnd, endBattle, scheduleTurn, startRegen } from './turn-loop.js';
import { potionIconHtml } from '../screens/pet-detail.js';
import { renderClinic } from '../screens/shop.js';
import { travelTo } from '../screens/world.js';
import { $, G, activeTeam, battle, el, save, setText, setBattle } from '../state.js';
import { blog, clearBattleLog, renderHUD, showScreen, toast } from '../ui-shell.js';

// ── SAFE SPOT ──
export function renderSafeSpot() {
  const z = zoneById(G.lastSafe) || ZONES.find(x => x.kind === 'safe');
  if (!z) return;
  setText('safe-name', z.name);
  setText('safe-thai', z.thai);
  setText('npc-greet', `สวัสดี ${G.name || 'นักผจญภัย'} ให้ข้าช่วยอะไรได้บ้าง?`);

  // Error/incubating/ready pets can't be fixed here — only a Real
  // World Clinic incubation chamber brings them back (see
  // renderClinic()). Down pets (still within their 5-min window) heal
  // here same as any hurt-but-conscious pet.
  const fixableHere = p => !['error', 'incubating', 'ready'].includes(petState(p));
  const hurt = G.roster.filter(p => fixableHere(p) && p.hp < statsOf(p).mhp).length;
  const restBtn = $('npc-opt-rest');
  if (restBtn) {
    restBtn.textContent = hurt ? `พักฟื้น (${hurt} ตัวบาดเจ็บ)` : 'ทุกตัวสมบูรณ์แล้ว';
    restBtn.disabled = !hurt;
    restBtn.onclick = () => {
      G.roster.forEach(p => { if (fixableHere(p)) reviveDownPet(p); });
      G.day++;
      save(); renderSafeSpot(); renderHUD();
      toast('พักฟื้นเรียบร้อย\nHP เต็มทุกตัว');
    };
  }

  const npcScene = $('safe-npc-scene');
  const shopWrap = $('safe-potions-wrap');
  const shopBtn = $('npc-opt-shop');
  const openShop = () => {
    if (npcScene) npcScene.hidden = true;
    if (shopWrap) shopWrap.hidden = false;
  };
  const closeShop = () => {
    if (npcScene) npcScene.hidden = false;
    if (shopWrap) shopWrap.hidden = true;
  };
  if (shopBtn) shopBtn.onclick = openShop;
  const backBtn = $('safe-potions-back');
  if (backBtn) backBtn.onclick = closeShop;

  // Potion shop — heal potions plus the free-slot utility potions
  // (MP/Speed/Crit/Cleanse) that now also need to be bought and
  // stocked to show up in the battle wheel (see throwItemAvailable()).
  const shop = $('safe-potions');
  if (!shop) return;
  shop.innerHTML = '';
  [...POTIONS, ...THROW_UTILITY_POTIONS].forEach(pt => {
    const owned = (G.potions && G.potions[pt.id]) || 0;
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${potionIconHtml(pt)}</div>
      <div class="sc-name">${pt.name}</div>
      <div class="sc-desc">${pt.desc}</div>
      <div class="sc-cost">${pt.cost} Bitz</div>
      <div class="sc-owned">มี ${owned} ชิ้น</div>
      <button class="btn">ซื้อ</button>`;
    card.querySelector('button').onclick = () => {
      if (G.bitz < pt.cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= pt.cost;
      G.potions = G.potions || {};
      G.potions[pt.id] = (G.potions[pt.id] || 0) + 1;
      save(); renderSafeSpot(); renderHUD();
    };
    shop.appendChild(card);
  });
}

// ── RAID FIGHT ──
// A single-pet defense battle. The enemy is the rival's hired
// AntiviruZ security guard — one of the 4 GUARD_TIERS, picked by
// their level back in net.js's _generateRivals() (older saved rivals
// without a guardTier fall back to computing one here).
export function startRaidFight(rival, sendPet, loot, mult) {
  // Build a defender scaled to the rival's level and the difficulty mult.
  const defLevel = Math.max(1, rival.level);
  const tier = rival.guardTier || guardTierForLevel(defLevel);
  const tierDef = GUARD_TIERS.find(g => g.tier === tier) || GUARD_TIERS[0];
  const foe = spawnAntiviruz(tierDef.defId, defLevel);
  foe.name = `${rival.name}'s ${foe.name}`;
  // scale enemy stats by the multiplier from the chosen loot's risk
  foe.base = {
    atk: Math.round(foe.base.atk * mult),
    def: Math.round(foe.base.def * mult),
    spd: Math.round(foe.base.spd * mult),
    mhp: Math.round(foe.base.mhp * mult),
  };
  foe.hp = statsOf(foe).mhp;

  setBattle({
    mode: 'raid',
    raid: { rival, loot, mult },
    team: [sendPet],
    enemies: [foe],
    wave: 0, run: { waveCount: 1, waves: [[foe]] },
    turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  });
  showScreen('battle');
  setText('battle-title', `เจาะบ้าน ${rival.name}`);
  setText('battle-wave', `เสี่ยง ×${mult.toFixed(2)}`);
  clearBattleLog();
  blog(`บุกเข้าบ้าน ${rival.name}!`, 'sys');
  blog(`ส่ง ${sendPet.name} เข้าเจาะ`, 'buff');
  applyBattleStartEquip(battle.team);
  renderBattle();
  startRegen();
  startSkillCooldownTicker();
  scheduleTurn(1200);
}

// ── REGION BOSSES ──
// One wandering boss per map/region. Spawns at a random battle zone
// within that region (see randomBossZone() in data.js); defeating it
// "resets its position" — immediately rolls a fresh spot elsewhere in
// the same region rather than respawning in place.
export function ensureBossSpawned(mapId) {
  G.bossState = G.bossState || {};
  const st = G.bossState[mapId];
  if (st && st.alive) return st;
  return rollBossSpawn(mapId);
}
function rollBossSpawn(mapId) {
  const zone = randomBossZone(mapId);
  if (!zone) return null;
  const map = MAPS.find(m => m.id === mapId);
  const level = (zone.lv && zone.lv[1]) || (map && map.levelRange[1]) || 10;
  const st = { alive: true, zoneId: zone.id, level, uid: uid() };
  G.bossState = G.bossState || {};
  G.bossState[mapId] = st;
  return st;
}
export function onBossDefeated(enemy) {
  const mapId = enemy.mapId;
  if (!mapId) return;
  const st = G.bossState[mapId];
  if (st) st.alive = false;
  rollBossSpawn(mapId);
  save();
}

export function startBossFight(mapId) {
  const st = G.bossState[mapId];
  if (!st || !st.alive) { toast('บอสไม่อยู่ตรงนี้แล้ว'); return; }
  const team = activeTeam();
  if (!team.length) { toast('ยังไม่ได้จัดทีม'); return; }
  if (!teamAlive(team)) { toast('ทีมหมด HP — ไปรักษาที่ Clinic'); return; }
  const boss = spawnBoss(mapId, st.level);
  if (!boss) { toast('เกิดข้อผิดพลาด'); return; }
  setBattle({
    mode: 'boss',
    target: { name: boss.name },
    team, enemies: [boss],
    wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  });
  showScreen('battle');
  setText('battle-title', `${boss.name} · BOSS`);
  setText('battle-wave', 'บอสประจำภูมิพาค');
  clearBattleLog();
  blog(`⚠️ บอส ${boss.name} ปรากฏตัว! (Lv.${boss.level})`, 'sys');
  const syn = synergyOf(team);
  if (syn.label) blog(`${ATTR[syn.attr].icon} ${syn.label} — สเตตัส ×${syn.mult}`, 'buff');
  const sup = supportOf(team);
  if (sup.auraPct > 0) blog(`➕ บัฟซัพพอร์ต +${Math.round(sup.auraPct*100)}%`, 'buff');
  applyBattleStartEquip(battle.team);
  renderBattle();
  startRegen();
  startSkillCooldownTicker();
  scheduleTurn(1200);
}

export function startZone(target) {
  const team = activeTeam();
  if (!team.length) { toast('ยังไม่ได้จัดทีม'); return; }
  if (!teamAlive(team)) { toast('ทีมหมด HP — ไปรักษาที่ Clinic'); return; }

  // ── HEAT / TRACE ──
  // Counted per fight STARTED at this node, and counted BEFORE the
  // waves are built so the roll can upgrade what actually spawns.
  // Grinding one node past 5 fights grows an elite chance and fills a
  // Trace meter; at 100% the hunter comes instead. See src/heat.js.
  const heat = registerNodeFight(G, target.id);
  const run = buildHackRun(target);
  let heatKind = null;
  let heatUnit = null;
  if (heat.hunter) {
    // The hunter REPLACES the whole encounter — it is scaled off the
    // player's own lead pet rather than the zone, so it stays a real
    // threat wherever the meter happened to fill up.
    const hunter = spawnHunter(team[0].level);
    if (hunter) {
      run.waves = [[hunter]];
      run.waveCount = 1;
      heatKind = 'hunter';
      heatUnit = hunter;
    }
  } else if (heat.elite) {
    // Upgrade one enemy in the FINAL wave, so the payoff sits at the
    // end of the run instead of ambushing on wave 1.
    const lastWave = run.waves[run.waves.length - 1];
    if (lastWave && lastWave.length) {
      heatUnit = makeElite(lastWave[Math.floor(Math.random() * lastWave.length)]);
      heatKind = 'elite';
    }
  }

  setBattle({
    mode: 'hack',
    run,
    target,
    team,
    enemies: run.waves[0],
    wave: 0,
    turn: 0,
    activeIdx: 0,      // which team member is currently fighting
    phase: 'ally',     // whose swing is next
    round: 0,
    over: false,
    totalExp: 0,
    totalBitz: 0,
    heatKind,
  });
  showScreen('battle');
  setText('battle-title', heatKind === 'hunter' ? `🚨 ${heatUnit.name} · HUNTER` : target.name);
  setText('battle-wave', heatKind === 'hunter' ? 'นักล่าตามรอย' : `คลื่น 1 / ${run.waveCount}`);
  clearBattleLog();
  if (heatKind === 'hunter') {
    blog(`🚨 Trace เต็ม 100% — ${heatUnit.name} ตามรอยคุณมา! (Lv.${heatUnit.level})`, 'sys');
    blog('ชนะมันเพื่อชิง Imp\'s Emblem', 'buff');
  } else {
    blog(`เริ่มเจาะ ${target.name}`, 'sys');
    if (heatKind === 'elite') {
      blog(`⭐ ${heatUnit.name} ตัวให้ญ่โผล่ออกมา! (Lv.${heatUnit.level} · สเตตัส ×2 · รางวัล ×5)`, 'sys');
    } else {
      // Quiet warning so the player can feel the meter climbing before
      // it actually bites.
      const pct = heatMeterPct(G, target.id);
      if (pct > 0) {
        const ec = Math.round(eliteChanceAt(G, target.id) * 100);
        blog(`🔥 Trace ที่นี่: ${pct}% · โอกาสเจอตัวให้ญ่ ${ec}%`, 'sys');
      }
    }
  }
  const syn = synergyOf(team);
  if (syn.label) blog(`${ATTR[syn.attr].icon} ${syn.label} — สเตตัส ×${syn.mult}`, 'buff');
  const sup = supportOf(team);
  if (sup.auraPct > 0) blog(`➕ บัฟซัพพอร์ต +${Math.round(sup.auraPct*100)}%`, 'buff');
  applyBattleStartEquip(battle.team);
  renderBattle();
  startRegen();
  startSkillCooldownTicker();
  scheduleTurn(1200);
  save();
}

// ── TRAIN-RIDE MIMIC AMBUSH ──
// A single-enemy fight identical in shape to startBossFight(), except
// it resolves through a Promise instead of the normal battle-report
// screen -- see the battle.mode === 'mimic' branch in endBattle() and
// travelTo() in the World map section, which awaits this.
export function startMimicAmbush(level) {
  return new Promise(resolve => {
    const team = activeTeam();
    const mimic = spawnAntiviruz('mimic', level);
    setBattle({
      mode: 'mimic',
      team, enemies: [mimic],
      wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
      totalExp: 0, totalBitz: 0,
      mimicResolve: resolve,
    });
    showScreen('battle');
    setText('battle-title', `Mimic! (Lv.${mimic.level})`);
    setText('battle-wave', 'ซุ่มโจมตีกลางทาง');
    clearBattleLog();
    blog('⚠️ Mimic ซุ่มโจมตีระหว่างทาง!', 'sys');
    applyBattleStartEquip(battle.team);
    renderBattle();
    startRegen();
    startSkillCooldownTicker();
    scheduleTurn(1200);
  });
}

export function startArena() {
  const team = activeTeam();
  if (team.length < 1) { toast('ยังไม่ได้จัดทีม'); return; }
  if (!teamAlive(team)) { toast('ทีมหมด HP'); return; }
  // Build a mirror-ish 3v3 opponent scaled to the player
  const myPower = teamPower(team);
  const enemies = [];
  for (let i = 0; i < 3; i++) {
    const sid = SPECIES_KEYS[Math.floor(Math.random()*SPECIES_KEYS.length)];
    const rarPool = ['normal','rare','epic'];
    const rar = rarPool[Math.min(2, Math.floor(myPower / 900))];
    const p = createPet(sid, rar);
    p.level = clamp(Math.floor(team[0].level * (0.85 + Math.random()*0.4)), 1, 99);
    p.hp = statsOf(p).mhp;
    p.isEnemy = true;
    enemies.push(p);
  }
  setBattle({
    mode: 'arena',
    team, enemies,
    wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  });
  showScreen('battle');
  setText('battle-title', '⚔️ Arena 3v3');
  setText('battle-wave', 'แมตช์เดี่ยว');
  clearBattleLog();
  blog('เริ่มการต่อสู้ Arena', 'sys');
  applyBattleStartEquip(battle.team);
  renderBattle();
  startRegen();
  startSkillCooldownTicker();
  scheduleTurn(1200);
}

// Full (re)build of the battlefield DOM. Call this only when the unit
// LIST changes — battle start, or a new wave. Never call it after a
// single attack: rebuilding innerHTML mid-animation destroys the
// lunge/hit classes and the swapped sprite src before the browser
// paints a frame, which is why attacks used to look like nothing
// happened. Use refreshBattleUnits() for per-turn updates instead.
// VR2-style stage: ONE fighter per side, name plate + heart, no bars.
// ── BATTLE ENTRANCE ──
// Called right after showScreen('battle') has painted the DOM. Both
// fighters start off-stage (translated + pixelated), step in with a
// stomp, kick up a dust puff on landing, then a VS banner slams
// through the middle before the first turn begins. Skippable on tap.
export function playArenaEntrance() {
  const stage = $('battle-stage');
  const allySide = $('battle-allies');
  const foeSide = $('battle-enemies');
  if (!stage || !allySide || !foeSide) return;

  // Entrance only plays once the units exist — renderBattle() runs
  // right after this from showScreen, so wait a tick for them to paint.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const allyUnit = allySide.querySelector('.bunit');
    const foeUnit = foeSide.querySelector('.bunit');
    if (!allyUnit || !foeUnit) return;

    stage.classList.add('entrance-lock');   // hides HP text/plates till landed
    allyUnit.classList.add('enter-from-l');
    foeUnit.classList.add('enter-from-r');

    let skipped = false;
    const skip = () => {
      if (skipped) return; skipped = true;
      allyUnit.classList.remove('enter-from-l');
      foeUnit.classList.remove('enter-from-r');
      stage.classList.remove('entrance-lock');
      vsEl.remove();
      stage.removeEventListener('pointerdown', skip);
    };
    const vsEl = el('div', 'vs-slam', 'VS');
    stage.addEventListener('pointerdown', skip, { once: true });

    setTimeout(() => {
      if (skipped) return;
      allyUnit.classList.remove('enter-from-l');
      foeUnit.classList.remove('enter-from-r');
      allyUnit.classList.add('enter-land');
      foeUnit.classList.add('enter-land');
      dustPuff(allyUnit); dustPuff(foeUnit);
    }, 520);

    setTimeout(() => {
      if (skipped) return;
      stage.appendChild(vsEl);
    }, 620);

    setTimeout(() => {
      if (skipped) return;
      allyUnit.classList.remove('enter-land');
      foeUnit.classList.remove('enter-land');
      stage.classList.remove('entrance-lock');
      vsEl.classList.add('out');
      setTimeout(() => vsEl.remove(), 220);
      stage.removeEventListener('pointerdown', skip);
    }, 1050);
  }));
}

// Small pixel dust burst at a unit's feet when it lands.
function dustPuff(unitEl) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  const cx = r.left - host.left + r.width / 2;
  const cy = r.bottom - host.top - 4;
  const puff = el('div', 'dust-puff');
  puff.style.left = cx + 'px';
  puff.style.top = cy + 'px';
  let inner = '';
  for (let i = 0; i < 6; i++) {
    const ang = -160 - Math.random() * 200;
    inner += `<i style="--pa:${ang}deg;--pd:${(18+Math.random()*16).toFixed(0)}px;--pdel:${(i*0.02).toFixed(2)}s"></i>`;
  }
  puff.innerHTML = inner;
  layer.appendChild(puff);
  setTimeout(() => puff.remove(), 500);
}

// ── ENEMY DEATH: shatter into pixel shards ──
// Works for both raster (img) and procedural (inline SVG) sprites
// because it clones the whole sprite-wrap element rather than reading
// pixels — a grid of small "viewport" cells each show one slice of a
// full-size clone via overflow:hidden, then fly outward and fade.
async function explodeUnit(unitEl) {
  return new Promise(resolve => {
    const layer = $('fx-layer');
    const stage = $('battle-stage');
    const spriteWrap = unitEl && unitEl.querySelector('.bu-sprite-wrap');
    if (!layer || !stage || !spriteWrap) { if (unitEl) unitEl.remove(); resolve(); return; }

    const host = stage.getBoundingClientRect();
    const r = spriteWrap.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) { unitEl.remove(); resolve(); return; }

    unitEl.classList.add('exploding'); // instantly hides the real sprite (CSS)

    const GRID = 4;
    const shardW = r.width / GRID, shardH = r.height / GRID;
    const burst = el('div', 'explode-burst');
    burst.style.left = (r.left - host.left) + 'px';
    burst.style.top  = (r.top  - host.top)  + 'px';
    burst.style.width  = r.width + 'px';
    burst.style.height = r.height + 'px';

    for (let gy = 0; gy < GRID; gy++) {
      for (let gx = 0; gx < GRID; gx++) {
        const shard = el('div', 'explode-shard');
        shard.style.left = (gx * shardW) + 'px';
        shard.style.top  = (gy * shardH) + 'px';
        shard.style.width  = shardW + 'px';
        shard.style.height = shardH + 'px';
        const clone = spriteWrap.cloneNode(true);
        clone.className = 'explode-clone';
        clone.style.left = (-gx * shardW) + 'px';
        clone.style.top  = (-gy * shardH) + 'px';
        clone.style.width  = r.width + 'px';
        clone.style.height = r.height + 'px';
        shard.appendChild(clone);
        const angle = Math.random() * Math.PI * 2;
        const dist = 34 + Math.random() * 60;
        shard.style.setProperty('--ex', (Math.cos(angle) * dist).toFixed(0) + 'px');
        shard.style.setProperty('--ey', (Math.sin(angle) * dist - 16).toFixed(0) + 'px');
        shard.style.setProperty('--er', (Math.random() * 300 - 150).toFixed(0) + 'deg');
        shard.style.animationDelay = (Math.random() * 60) + 'ms';
        burst.appendChild(shard);
      }
    }
    layer.appendChild(burst);
    setTimeout(() => {
      burst.remove();
      unitEl.remove();
      resolve();
    }, 620);
  });
}

// ── Next enemy steps up: same slide-in/land beat as the opening arena
// entrance, but foe-only (ally side and the VS slam are untouched). ──
export async function playFoeEntrance(unitEl) {
  return new Promise(resolve => {
    const stage = $('battle-stage');
    if (!stage || !unitEl) { resolve(); return; }
    stage.classList.add('foe-entrance-lock');
    unitEl.classList.add('enter-from-r');
    setTimeout(() => {
      unitEl.classList.remove('enter-from-r');
      unitEl.classList.add('enter-land');
      dustPuff(unitEl);
    }, 420);
    setTimeout(() => {
      unitEl.classList.remove('enter-land');
      stage.classList.remove('foe-entrance-lock');
      resolve();
    }, 760);
  });
}

// Orchestrates one foe's death → the next foe's entrance. Called from
// checkBattleEnd() whenever the enemy currently shown on screen no
// longer matches the battle's active foe (i.e. it just died and
// battle.enemies has another one ready). `nextPet` may be null when
// the whole encounter is being cleared (last enemy of a wave/dungeon).
export async function playFoeDeathTransition(deadPet, nextPet) {
  const wrap = $('battle-enemies');
  if (!wrap) return;
  const deadEl = wrap.querySelector('.bunit');
  if (deadEl) await explodeUnit(deadEl);
  if (!nextPet) return;
  renderBattleSide(nextPet, 'battle-enemies', true);
  const newEl = wrap.querySelector('.bunit');
  if (newEl) await playFoeEntrance(newEl);
}
