// ═══════════════════════════════════════════════════════════
// VIRUZ PET — GAME
// State, screens, battle loop, DOM rendering.
// ═══════════════════════════════════════════════════════════

import {
  ATTR, ATTR_KEYS, RARITY, RARITY_KEYS, SPECIES, SPECIES_KEYS,
  MAPS, ZONES, zonesOfMap, zoneById, ANTIVIRUZ, EGGS, ITEMS, POTIONS, DEFENSE_BOTS, MAP_NODES, TUNING,
  GUARD_TIERS, guardTierForLevel,
  SYNERGY, WHITE_TRAITS,
  LOYALTY_TIERS, loyaltyTier, loyaltyProgress, SIGNATURE_SKILLS,
  FOODS, TOYS, CARE_CLEAN, CARE_COOLDOWN_MS, LOYALTY_PER_WIN,
  INGREDIENTS, MEAT_ITEM, MEAT_DROP_CHANCE, RECIPES,
  buildLootMenu, chanceToEnemyMult, RAID_LOSS_BITZ,
  SKILL_TREES, SPECIALS, AILMENTS, STAT_KEYS, STAT_META, treeFor,
  MUTATIONS, MUTATION_KEYS, treeForMutation,
  MATERIALS, CODE_PART_IDS, codePartDropChance, mutationWeightsFromParts,
  bossPoolForMap, BOSS_TUNING, randomBossZone,
  EQUIP_SLOTS, EQUIP_SLOT_KEYS, EQUIP_GRADES, EQUIP_GRADE_KEYS,
  PAYLOAD_EFFECTS, PAYLOAD_EFFECT_KEYS, EQUIP_DROP_CHANCE, CRAFT_RECIPES,
  rollEquipment, craftEquipment, dustValueOf, sellValueOf, backfillEquipIcon } from './data.js';
import {
  createPet, rollEgg, statsOf, combatStats, powerOf, teamPower, spawnAntiviruz,
  spawnBoss, enterBossRage,
  synergyOf, supportOf, computeDamage, turnOrder, grantExp,
  canEvolve, evolve, buildHackRun, resolveRaid, healTeam,
  teamAlive, availableSkills, clamp, loyaltyBuffs, signatureSkillOf, buildHackPuzzle, checkHackGuess,
  unlockedSpecials, canTakeNode, takeNode, treeBonuses,
  addAilment, hasAilment, clearAilments, tickAilments,
  advanceSpeedCounter, maxMP, canCast, spendMP, restoreMP, uid, equipmentBonuses } from './engine.js';
import { NET } from './net.js';
import { creatureMarkupFor, gifURL } from './sprites.js';

// Creatures come from either real GIF art or procedural SVG —
// creatureMarkupFor() picks per species, so both coexist.
function creatureMarkup(pet, cls, anim = 'still') {
  // Enemies aren't in SPECIES, so fall back to the fields copied onto
  // the spawned unit. Must include ext/palette or PNG art resolves to
  // a .gif path and 404s.
  const sp = SPECIES[pet.speciesId] ||
    { shape: pet.shape, palette: pet.palette, gif: pet.gif, ext: pet.ext,
      faces: pet.faces, scale: pet.scale, name: pet.name };
  const attr = ATTR[pet.attr] || ATTR.red;
  return creatureMarkupFor(sp, attr, cls, anim, pet.stage, pet.mutation);
}

// ═══════════════ STATE ═══════════════
let G = {
  uid: null,
  name: 'Hacker',
  started: false,
  bitz: 0,
  day: 1,
  wins: 0,
  raids: 0,
  roster: [],        // all owned pets
  teamIds: [],       // up to 3 uids — the active squad
  defenseIds: [],    // up to 3 uids stationed at base
  bots: [],          // purchased defense bots
  guardTier: 0,      // 0-4, owned AntiviruZ Security Package tier (GUARD_TIERS)
  inbox: [],
  raidHistory: [],
  potions: {},      // combat potions, bought at safe spots
  lastSafe: null,   // which safe zone the player last visited
  foods: {},        // consumable care food counts
  toys: [],         // permanently owned toy ids
  care: {},         // { petUid: { activityId: lastUsedTimestamp } }
  feed: [],         // persistent PROCESS activity records
  equipBag: [],     // owned, unequipped gear
  dust: 0,          // crafting currency from disenchanting gear
  careWaste: false, // ambient mess flag on the care screen's living area
  ingredients: { veg:0, bun:0, meat:0 }, // veg/bun bought at Food Shop, meat hunt-only
  materials: {},    // { malware_core: n, code_part_overclock: n, ... } — Tech Lab evolution
  bossState: {},    // { mapId: { alive, zoneId, defId, level, uid } } — wandering region bosses
};

let battle = null;   // active battle state
let battleTimer = null;
let regenTimer = null;
let battleSpeed = 1;

// ═══════════════ DOM HELPERS ═══════════════
const $ = id => document.getElementById(id);

// Render an attribute's icon as a real image when one exists, falling
// back to the emoji otherwise. `size` in px.
function attrIcon(a, size = 16) {
  if (a.iconImg) return `<img src="${a.iconImg}" class="attr-icon-img" style="width:${size}px;height:${size}px" alt="${a.name}">`;
  return `<span class="attr-icon-emoji">${a.icon}</span>`;
}
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
function setText(id, v) { const e = $(id); if (e) e.textContent = v; }

// ═══════════════ TEAM ACCESS ═══════════════
function petById(id) { return G.roster.find(p => p.uid === id) || null; }
function activeTeam() { return G.teamIds.map(petById).filter(Boolean); }
function defenseTeam() { return G.defenseIds.map(petById).filter(Boolean); }

// ═══════════════ BOOT ═══════════════
async function boot() {
  G.uid = await NET.init();
  const saved = await NET.getProfile();
  if (saved && saved.started) {
    G = { ...G, ...saved };
    // Migrate saves written by older builds. Fields like `sprite` and
    // `name` are DERIVED from SPECIES — they must never be trusted from
    // disk, because an older build may have written different values
    // (this caused every viruz to render the same sprite, and made
    // attack.gif resolve to the wrong path so attacks looked frozen).
    // Re-derive them from the current data tables on every load.
    // Species were renamed when creatures became procedural SVG.
    // Map retired ids onto their closest replacement so existing
    // saves keep their roster instead of being silently wiped.
    const LEGACY_SPECIES = {
      slimebyte:'blobyte', aquagolem:'clampr', flamegolem:'spikeling',
      darkbat:'echowing', stormwing:'jetsquid',
    };
    G.roster = (G.roster || []).map(p => {
      if (!p) return null;
      if (!SPECIES[p.speciesId] && LEGACY_SPECIES[p.speciesId]) {
        p.speciesId = LEGACY_SPECIES[p.speciesId];
        p.name = null;          // re-derive below
        p.base = null;          // re-derive below
        p.skills = null;        // re-derive below
      }
      return SPECIES[p.speciesId] ? p : null;
    }).filter(Boolean);
    G.roster.forEach(p => {
      const sp = SPECIES[p.speciesId];
      // Art source is authoritative from SPECIES — a species may use
      // either procedural SVG (`shape`) or real art (`gif`), and can
      // switch between them in a later build without breaking saves.
      if (typeof p.loyalty !== 'number') p.loyalty = 0;
      // New stat/skill system fields
      p.tree      = p.tree      || {};
      p.autoCast  = p.autoCast  || {};
      p.ailments  = [];
      p.spdCounter = 0;
      if (typeof p.growthPts !== 'number') {
        // Retro-grant one point per level already earned so existing
        // pets aren't stuck with an empty tree.
        p.growthPts = Math.max(0, (p.level || 1) - 1);
      }
      if (typeof p.mp !== 'number') p.mp = 0;
      p.equip = p.equip || { payload:null, exploit:null, rootkit:null };
      EQUIP_SLOT_KEYS.forEach(sk => { if (p.equip[sk]) backfillEquipIcon(p.equip[sk]); });
      p.shape = sp.shape || null;
      p.gif   = sp.gif   || null;
      if (!p.name) p.name = sp.name;
      if (!ATTR[p.attr]) p.attr = 'red';    // guard against removed attrs
      if (!RARITY[p.rarity]) p.rarity = 'normal';
      p.stage = clamp(p.stage || 0, 0, 2);
      p.maxLv = RARITY[p.rarity].maxLv;
      if (!Array.isArray(p.skills) || !p.skills.length) {
        p.skills = sp.skills.map(s => ({ ...s }));
      }
      if (!p.base) p.base = { ...sp.base };
      if (!p.name) p.name = sp.name;
      if (p.mutation === undefined) p.mutation = null;
      const m = statsOf(p).mhp;
      if (typeof p.hp !== 'number' || p.hp > m) p.hp = m;
    });
    // Drop team/defense references to pets that no longer exist
    const ids = new Set(G.roster.map(p => p.uid));
    G.potions = G.potions || {};
    G.foods   = G.foods   || {};
    G.toys    = G.toys    || [];
    G.care    = G.care    || {};
    G.feed    = G.feed    || [];
    G.equipBag = G.equipBag || [];
    G.equipBag.forEach(backfillEquipIcon);
    G.dust     = G.dust     || 0;
    G.ingredients = G.ingredients || { veg:0, bun:0, meat:0 };
    G.materials = G.materials || {};
    G.bossState = G.bossState || {};
    G.teamIds    = (G.teamIds || []).filter(id => ids.has(id));
    G.defenseIds = (G.defenseIds || []).filter(id => ids.has(id));
    if (!G.teamIds.length && G.roster.length) G.teamIds = [G.roster[0].uid];
    // Resume where the player actually left off, not always the city.
    const resumeScreen = G.lastScreen && ['map','world','safe','home','clinic','shop','foodshop','care','raid'].includes(G.lastScreen)
      ? G.lastScreen : 'map';
    showScreen(resumeScreen);
    renderAll();
    save();
    log('โหลดข้อมูลสำเร็จ', 'sys');
  } else {
    showScreen('intro');
    buildStarterPicker();
  }
  wireGlobalUI();
  wireDrawer();
  wireCareGame();
  wirePetDetail();
  startTopBarClock();
  wireClickRipple();
}

async function save() {
  await NET.saveProfile({ ...G });
}

// ═══════════════ STARTER ═══════════════
let starterChoice = null;
function buildStarterPicker() {
  const wrap = $('starter-grid');
  wrap.innerHTML = '';
  // Offer three random normal-tier species
  const normals = SPECIES_KEYS.filter(k => SPECIES[k].rarities.includes('normal'));
  normals.forEach(sid => {
    const sp = SPECIES[sid];
    const card = el('div', 'starter-card');
    card.innerHTML = `
      ${creatureMarkupFor(sp, null, 'starter-sprite float')}
      <div class="starter-name">${sp.name}</div>
      <div class="starter-hint">ธาตุจะสุ่มตอนรับ</div>`;
    card.onclick = () => {
      document.querySelectorAll('.starter-card').forEach(c => c.classList.remove('sel'));
      card.classList.add('sel');
      starterChoice = sid;
      $('start-btn').disabled = false;
    };
    wrap.appendChild(card);
  });
}

async function claimStarter() {
  if (!starterChoice) return;
  const name = ($('player-name').value || '').trim() || 'Hacker';
  const pet = createPet(starterChoice, 'normal');
  G.name = name;
  G.roster = [pet];
  G.teamIds = [pet.uid];
  G.bitz = TUNING.startBitz;
  G.started = true;
  await save();
  showScreen('map');
  renderAll();
  const a = ATTR[pet.attr];
  toast(`ได้รับ ${pet.name}\nธาตุ ${a.icon} ${a.name}`);
  log(`เริ่มต้นด้วย ${pet.name} [${a.name}] · ${TUNING.startBitz} Bitz`, 'win');
}

// ═══════════════ SCREENS ═══════════════
const SCREENS = ['intro','map','home','clinic','shop','foodshop','world','battle','arena','raid','safe','care','hack','steal','inventory'];

// Rough navigation depth so a transition can tell "going deeper" from
// "coming back" and slide the right direction. Screens not listed count
// as depth 1 (same level as map). Battle/hack/steal are treated as
// full-screen takeovers (depth 9) so they always feel like an overlay
// sliding UP rather than sideways.
const SCREEN_DEPTH = {
  intro:0, map:1,
  home:2, world:2, care:2, raid:2, shop:2,
  clinic:3, safe:3, tree:3,
  arena:4,
  battle:9, hack:9, steal:9,
};

let currentScreenId = null;
let screenTransitioning = false;

function showScreen(id) {
  closeCareGame();
  closePetDetail();
  if (id !== 'care') stopCareWander();
  if (screenTransitioning || id === currentScreenId) {
    // Still allow a hard switch if nothing is currently shown (boot).
    if (currentScreenId != null) return;
  }
  const fromId = currentScreenId;
  const fromEl = fromId ? $('screen-' + fromId) : null;
  const toEl = $('screen-' + id);
  if (!toEl) return;

  const fromDepth = SCREEN_DEPTH[fromId] ?? 1;
  const toDepth = SCREEN_DEPTH[id] ?? 1;
  const goingDeeper = toDepth >= fromDepth;

  const finishSwitch = () => {
    SCREENS.forEach(s => {
      const e = $('screen-' + s);
      if (e) e.classList.toggle('on', s === id);
    });
    toEl.classList.remove('nav-in-l','nav-in-r','nav-in-up');
    toEl.classList.add(id === 'battle' || id === 'hack' || id === 'steal' ? 'nav-in-up'
                        : goingDeeper ? 'nav-in-r' : 'nav-in-l');
    // Let the browser register the starting position before animating.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      toEl.classList.add('nav-settle');
      setTimeout(() => {
        toEl.classList.remove('nav-in-l','nav-in-r','nav-in-up','nav-settle');
        screenTransitioning = false;
      }, 260);
    }));

    currentScreenId = id;
    // Persist "where the player is" for LOCATION screens only — never
    // a transient state like battle/hack/steal. On next load, boot()
    // restores here instead of always dropping the player back at the
    // city map, so warping to Hell and closing the app keeps you in
    // Hell until you travel back yourself.
    const PERSISTABLE = ['map','world','safe','home','clinic','shop','foodshop','care','raid'];
    if (PERSISTABLE.includes(id)) { G.lastScreen = id; save(); }
    const vid = $('bg-video');
    if (vid) { if (id === 'map') vid.play().catch(()=>{}); else vid.pause(); }
    $('app').dataset.screen = id;
    if (id === 'home')   renderHome();
    if (id === 'clinic') renderClinic();
    if (id === 'shop')   renderShop();
    if (id === 'foodshop') renderFoodShop();
    if (id === 'world')  renderWorld();
    if (id === 'safe')   renderSafeSpot();
    if (id === 'care')   renderCare();
    if (id === 'inventory') renderInventory();
    if (id === 'raid')   renderRaidList();
    if (id === 'map')    renderFeed();
    if (id === 'battle') playArenaEntrance();
  };

  if (!fromEl || fromEl === toEl) { finishSwitch(); return; }

  screenTransitioning = true;
  fromEl.classList.add(id === 'battle' || id === 'hack' || id === 'steal' ? 'nav-out-up'
                        : goingDeeper ? 'nav-out-l' : 'nav-out-r');
  setTimeout(() => {
    fromEl.classList.remove('on','nav-out-l','nav-out-r','nav-out-up');
    finishSwitch();
  }, 170);
  return;
}

// ── GLOBAL CLICK RIPPLE ──
// Event-delegated so it covers every current and future tappable
// element without wiring each one individually.
function wireClickRipple() {
  const TAPPABLE = '.btn, .qb, .zone-pin, .care-ring-btn, .loot-card, .steal-pet, ' +
                   '.swap-card, .pet-card, .shop-card, .tree-node, .sk-btn, ' +
                   '.potion-btn, .raid-card, .map-tab, .cg-close, ' +
                   '.cg-ball, .cg-laser, .cg-face, .cg-cell, .cg-food';
  document.addEventListener('pointerdown', e => {
    const target = e.target.closest(TAPPABLE);
    if (!target || target.disabled) return;
    const d = document.createElement('div');
    d.className = 'click-ripple';
    d.style.left = e.clientX + 'px';
    d.style.top = e.clientY + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 460);
  }, { passive: true });
}

// ── PULL-OUT DRAWER ──
function openDrawer() {
  document.body.classList.add('drawer-open');
  setText('drawer-bitz', G.bitz.toLocaleString());
  setText('drawer-power', teamPower(activeTeam()).toLocaleString());
  renderFeed();
}
function closeDrawer() { document.body.classList.remove('drawer-open'); }
function toggleDrawer() {
  document.body.classList.contains('drawer-open') ? closeDrawer() : openDrawer();
}
function wireDrawer() {
  const knob = $('drawer-knob');
  const backdrop = $('drawer-backdrop');
  const closeBtn = $('drawer-close');
  if (knob) knob.onclick = toggleDrawer;
  if (backdrop) backdrop.onclick = closeDrawer;
  if (closeBtn) closeBtn.onclick = closeDrawer;

  // Same convention for the generic modal — click the dark backdrop
  // (not the content box itself) to dismiss it.
  const modalBack = $('modal-back');
  if (modalBack) modalBack.onclick = (e) => { if (e.target === modalBack) closeModal(); };
}

function wireGlobalUI() {
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.onclick = () => showScreen(b.dataset.goto);
  });
  $('start-btn').onclick = claimStarter;

  document.querySelectorAll('.speed-btn').forEach(b => {
    b.onclick = () => {
      battleSpeed = Number(b.dataset.speed);
      document.querySelectorAll('.speed-btn').forEach(x =>
        x.classList.toggle('on', x === b));
    };
  });
  $('flee-btn').onclick = fleeBattle;
}

function buildMapNodes() {
  const layer = $('map-nodes');
  layer.innerHTML = '';
  MAP_NODES.forEach(n => {
    // Every node's clickable area is now the invisible circle itself
    // (sized in vmin so it scales with the video), centred on the
    // measured landmark position — clicking anywhere within it works,
    // not just a small dot. The label is a separately positioned
    // element (textX/textY), independent of the circle's size.
    const node = el('button', 'map-node zone');
    node.style.left = n.x + '%';
    node.style.top  = n.y + '%';
    const r = n.zoneR || 14;
    node.style.width  = (r * 2) + 'vmin';
    node.style.height = (r * 2) + 'vmin';
    node.title = n.hint;
    node.onclick = () => showScreen(n.screen);
    layer.appendChild(node);

    const label = el('div', 'map-node-label', n.label);
    label.style.left = (n.textX != null ? n.textX : n.x) + '%';
    label.style.top  = (n.textY != null ? n.textY : n.y) + '%';
    label.onclick = () => showScreen(n.screen);
    layer.appendChild(label);
  });
}

// ═══════════════ RENDER: SHARED ═══════════════
function renderAll() {
  renderHUD();
  renderHome();
  buildMapNodes();
}

function renderHUD() {
  setText('hud-bitz', G.bitz.toLocaleString());
  setText('hud-name', G.name);
  setText('hud-power', teamPower(activeTeam()).toLocaleString());
  renderDrawerTeam();
  syncQuickbar();
  renderTopBar();
}

// ── PERSISTENT TOP BAR ──
// Left: live clock + whichever timed activity is closest to finishing
// (care cooldowns for now — the only source of "activity with a
// delay" that currently exists). Right: player identity.
let topBarTimer = null;
function renderTopBar() {
  const bar = $('topbar');
  if (!bar) return;
  bar.classList.toggle('hidden', currentScreenId === 'intro' || !currentScreenId);

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  setText('tb-clock', `${hh}:${mm}`);

  setText('tb-name', G.name || '-');
  setText('tb-bitz', (G.bitz || 0).toLocaleString());
  setText('tb-pets', (G.roster || []).length);

  // Find the soonest-finishing care cooldown across all pets/activities.
  const actEl = $('tb-activity');
  if (actEl) {
    let soonest = null;
    const care = G.care || {};
    Object.keys(care).forEach(petUid => {
      const pet = G.roster.find(p => p.uid === petUid);
      if (!pet) return;
      Object.keys(care[petUid]).forEach(actId => {
        const remain = careRemaining(petUid, actId);
        if (remain > 0 && (!soonest || remain < soonest.remain)) {
          soonest = { remain, petName: pet.name, actId };
        }
      });
    });
    if (soonest) {
      const mins = Math.ceil(soonest.remain / 60000);
      const label = mins >= 60
        ? `${Math.floor(mins / 60)} ชม. ${mins % 60} น.`
        : `${mins} น.`;
      actEl.innerHTML = `<span class="tb-act-icon">⏳</span>${soonest.petName} · เหลือ ${label}`;
      actEl.hidden = false;
    } else {
      actEl.hidden = true;
    }
  }
}
function startTopBarClock() {
  clearInterval(topBarTimer);
  topBarTimer = setInterval(renderTopBar, 15000);   // refresh every 15s
}

// Highlight the quickbar button for the current screen
function syncQuickbar() {
  const cur = $('app').getAttribute('data-screen');
  document.querySelectorAll('#quickbar .qb').forEach(b =>
    b.classList.toggle('on', b.dataset.goto === cur));
}

// ── PERSISTENT TEAM STRIP ──
// Shows one active-team pet at a time; arrows/dots/scroll cycle through
// the (up to 3) team members. Lives under the HUD on every main screen.
function renderDrawerTeam() {
  const list = $('drawer-team');
  if (!list) return;
  const team = activeTeam();
  list.innerHTML = '';
  if (!team.length) {
    list.innerHTML = `<div class="muted" style="padding:8px">ยังไม่มีทีมออกรบ</div>`;
    return;
  }
  team.forEach(pet => {
    const s = statsOf(pet);
    const tier = loyaltyTier(pet.loyalty);
    const hpPct = Math.round(pet.hp / s.mhp * 100);
    const expPct = Math.min(100, Math.round(pet.exp / Math.max(1, pet.expNeed) * 100));
    const a = ATTR[pet.attr];
    const cell = el('div','ts-cell');
    cell.style.setProperty('--attr', a.color);
    cell.innerHTML = `
      <div class="ts-sprite">${creatureMarkup(pet,'ts-art')}</div>
      <div class="ts-body">
        <div class="ts-name">${pet.name} <span class="ts-attr">${attrIcon(a, 15)}</span></div>
        <div class="ts-lv">Lv.${pet.level}<span class="muted">/${pet.maxLv}</span> · ${tier.icon}${tier.name}</div>
        <div class="ts-baropts">
          <span class="ts-lab">HP</span>
          <span class="ts-bar hp"><i style="width:${hpPct}%"></i></span>
          <span class="ts-val">${pet.hp}/${s.mhp}</span>
        </div>
        <div class="ts-baropts">
          <span class="ts-lab">XP</span>
          <span class="ts-bar xp"><i style="width:${expPct}%"></i></span>
          <span class="ts-val">${pet.exp}/${pet.expNeed}</span>
        </div>
        <div class="ts-stats">⚔${s.atk} 🛡${s.def} ⚡${s.spd}</div>
      </div>`;
    list.appendChild(cell);
  });
}

function petCard(pet, opts = {}) {
  const a = ATTR[pet.attr];
  const r = RARITY[pet.rarity];
  const s = statsOf(pet);
  const hpPct = Math.round(pet.hp / s.mhp * 100);
  const card = el('div', 'pet-card');
  card.style.setProperty('--attr', a.color);
  card.style.setProperty('--rar', r.color);
  card.style.setProperty('--glow', a.glow);
  if (opts.selected) card.classList.add('sel');
  if (pet.hp <= 0) card.classList.add('down');

  const trait = pet.whiteTrait ? WHITE_TRAITS[pet.whiteTrait] : null;
  const expPct = Math.min(100, Math.round((pet.exp / Math.max(1, pet.expNeed)) * 100));
  const tier = loyaltyTier(pet.loyalty);
  const loyProg = loyaltyProgress(pet.loyalty);
  const sig = signatureSkillOf(pet);
  const evoReady = canEvolve(pet).ok;
  card.innerHTML = `
    <div class="pc-top">
      <span class="pc-attr" title="${a.desc}">${attrIcon(a, 18)}</span>
      <span class="pc-rar">${r.name}</span>
    </div>
    ${creatureMarkup(pet, 'pc-sprite float')}
    <div class="pc-name">${pet.name}${evoReady ? ` <span class="pc-evo-ready" title="พร้อมวิวัฒน์ — ไปที่ Tech Lab">▲</span>` : ''}${trait ? ` <span class="pc-trait" title="${trait.desc}">${trait.icon}</span>` : ''}</div>
    <div class="pc-lv">Lv.${pet.level}<span class="pc-cap">/${pet.maxLv}</span> · St.${pet.stage+1}</div>
    <div class="pc-bar"><i style="width:${hpPct}%"></i></div>
    <div class="pc-hp">HP ${pet.hp}/${s.mhp}</div>
    <div class="pc-xpbar" title="EXP ${pet.exp}/${pet.expNeed}">
      <i style="width:${expPct}%"></i></div>
    <div class="pc-xp">EXP ${pet.exp}/${pet.expNeed}</div>
    <div class="pc-stats">
      <span title="Attack">⚔ ${s.atk}</span>
      <span title="Defense">🛡 ${s.def}</span>
      <span title="Speed">⚡ ${s.spd}</span>
    </div>
    <div class="pc-loy" title="${tier.perk || 'ยังไม่มีโบนัส'}">
      ${tier.icon} ${tier.name}
      <span class="pc-loy-bar"><i style="width:${loyProg.pct}%"></i></span>
    </div>
    ${sig ? `<div class="pc-sig" title="${sig.desc}">✦ ${sig.n}</div>` : ''}
    <button class="pc-equip" title="อุปกรณ์">🧩</button>
    <button class="pc-info" title="สถานะ">ℹ</button>`;
  if (opts.onClick) card.onclick = () => opts.onClick(pet);
  // The info/equip buttons always open their own window, independent
  // of whatever the card's main click does (team swap, defense pick).
  card.querySelector('.pc-info').onclick = (ev) => {
    ev.stopPropagation();
    openPetDetail(pet, 0);
  };
  card.querySelector('.pc-equip').onclick = (ev) => {
    ev.stopPropagation();
    openPetDetail(pet, 1);
  };
  return card;
}

// ── PET DETAIL WINDOW (Stats / Equipment / Skill Tree) ──
// Opened by tapping a pet card on ฐานของคุณ. Three horizontally
// swipeable pages sharing one pet for the whole session — no in-modal
// pet switcher, since the card tap already picked which pet. Replaces
// the old separate status modal, equip modal, and tree screen.
let PD = null; // { pet } while open, else null
let pdPage = 0;

function openPetDetail(pet, startPage) {
  PD = { pet };
  const overlay = $('pet-detail');
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.classList.add('pet-detail-open');
  setText('pd-title', pet.name);
  renderPdStats();
  renderPdEquip();
  treePetId = pet.uid;
  renderTree();
  goPdPage(startPage || 0, true);
}
function closePetDetail() {
  const overlay = $('pet-detail');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('pet-detail-open');
  PD = null;
}
function goPdPage(i, instant) {
  const track = $('pd-track');
  if (!track) return;
  pdPage = Math.max(0, Math.min(2, i));
  if (instant) track.style.transition = 'none';
  track.style.transform = `translateX(-${pdPage * 100}%)`;
  if (instant) { void track.offsetWidth; track.style.transition = ''; }
  document.querySelectorAll('.pd-tab').forEach((t, idx) => t.classList.toggle('on', idx === pdPage));
}
function wirePetDetail() {
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

// ── Page 1: Stats — full readout + specials + the team toggle ──
function renderPdStats() {
  const pet = PD.pet;
  const a = ATTR[pet.attr];
  const r = RARITY[pet.rarity];
  const s = statsOf(pet);
  const tier = loyaltyTier(pet.loyalty);
  const loyProg = loyaltyProgress(pet.loyalty);
  const tree = treeFor(pet.attr);
  const specials = unlockedSpecials(pet);
  const evoReady = canEvolve(pet).ok;
  const page = $('pd-page-stats');
  if (!page) return;

  page.innerHTML = `
    <div class="ps-head">
      ${creatureMarkup(pet, 'ps-sprite float')}
      <div class="ps-headinfo">
        <div class="ps-rar" style="color:${r.color}">${r.name} · ${attrIcon(a, 16)} ${a.name}${evoReady ? ` <span class="pc-evo-ready" title="พร้อมวิวัฒน์ — ไปที่ Tech Lab">▲ พร้อมวิวัฒน์</span>` : ''}</div>
        <div class="ps-lv">Lv.${pet.level}/${pet.maxLv} · EXP ${pet.exp}/${pet.expNeed}</div>
        <div class="ps-loy">${tier.icon} ${tier.name}
          <span class="pc-loy-bar" style="width:60px;display:inline-block"><i style="width:${loyProg.pct}%"></i></span>
        </div>
      </div>
    </div>
    <div class="ps-stats">
      ${STAT_KEYS.map(k => {
        const meta = STAT_META[k];
        const val = (k === 'crit' || k === 'eva') ? s[k] + '%' : s[k];
        return `<span class="ps-stat"><i>${meta.icon}</i>${meta.name}<b>${val}</b></span>`;
      }).join('')}
    </div>
    <div class="ps-skills-title">// สกิลพิเศษ //</div>
    <div class="ps-skills"></div>
    <button class="btn wide pd-team-btn" id="pd-team-btn"></button>`;

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
function refreshPdTeamBtn() {
  const btn = $('pd-team-btn');
  if (!btn || !PD) return;
  const inTeam = G.teamIds.includes(PD.pet.uid);
  btn.textContent = inTeam ? '➖ นำออกจากทีม' : '➕ เพิ่มเข้าทีม';
  btn.classList.toggle('primary', !inTeam);
  btn.classList.toggle('danger', inTeam);
  btn.onclick = () => {
    if (inTeam) removeFromTeam(PD.pet.uid);
    else addToTeam(PD.pet.uid);
    refreshPdTeamBtn();
  };
}

// ── Page 2: Equipment — same 3 slots as before, now embedded ──
// Generated pixel art when the item has one (rollEquipment() picks a
// random variant per roll — see EQUIP_ICONS in data.js), else falls
// back to the slot's emoji glyph (older saved items, or an empty slot).
// Grade glow — no new art needed, EQUIP_GRADES already carries a glow
// color per tier. Script/Trojan/Polymorphic get a static glow scaled
// to their own alpha; Zero-Day (Epic) and A.P.T. (Legendary) — the
// top 2 of 5 grades — additionally pulse, so only the genuinely rare
// drops feel like they're radiating.
const RADIANT_GRADES = ['zeroday', 'apt'];
function equipIconHtml(item, fallbackEmoji) {
  if (!item || !item.icon) return fallbackEmoji;
  const g = EQUIP_GRADES[item.grade] || EQUIP_GRADES.script;
  const radiant = RADIANT_GRADES.includes(item.grade);
  return `<img src="${item.icon}" class="eq-icon-img${radiant ? ' grade-radiant' : ''}" style="--eq-glow:${g.glow}" alt="">`;
}
function equipStatLine(item) {
  if (item.effectId) {
    const eff = PAYLOAD_EFFECTS[item.effectId];
    if (!eff) return '';
    // mag is per-grade (EQUIP_GRADE_KEYS index) — a Script-Kiddie Data
    // Leech and an A.P.T. one drain very different %, but the desc
    // text never showed which, so a look at any leech item's tooltip
    // just said "restores HP" with no number to size it up against.
    const gi = EQUIP_GRADE_KEYS.indexOf(item.grade);
    const mag = (eff.mag || [])[gi] || 0;
    const pct = mag > 0 ? ` (${Math.round(mag * 100)}%)` : '';
    return `${eff.icon} ${eff.name}${pct} — ${eff.desc}`;
  }
  return Object.keys(item.stats || {}).map(k => `${STAT_META[k].icon}+${item.stats[k]}`).join(' ');
}
function renderPdEquip() {
  const pet = PD.pet;
  const page = $('pd-page-equip');
  if (!page) return;
  page.innerHTML = '';
  const wrap = el('div', 'eq-slots');
  EQUIP_SLOT_KEYS.forEach(slotId => {
    const slot = EQUIP_SLOTS[slotId];
    const item = pet.equip && pet.equip[slotId];
    const row = el('div', 'eq-slot-row');
    if (item) {
      const g = equipGradeMeta(item);
      row.style.setProperty('--grade', g.color);
      row.innerHTML = `
        <div class="eq-slot-icon">${equipIconHtml(item, slot.icon)}</div>
          <div class="eq-slot-stats">${equipStatLine(item)}</div>
        </div>
        <button class="btn small">ถอด</button>`;
      row.querySelector('button').onclick = () => { unequipItem(pet, slotId); renderPdEquip(); };
    } else {
      row.innerHTML = `
        <div class="eq-slot-icon empty">${slot.icon}</div>
        <div class="eq-slot-info">
          <div class="eq-slot-name muted">${slot.name} — ว่าง</div>
          <div class="eq-slot-sub">${slot.desc}</div>
        </div>
        <button class="btn small primary">ใส่</button>`;
      row.querySelector('button').onclick = () => openEquipPicker(pet, slotId);
    }
    wrap.appendChild(row);
  });
  page.appendChild(wrap);
  const hint = el('div', 'muted', `กระเป๋าอุปกรณ์: ${(G.equipBag||[]).length} ชิ้น — จัดการ/ขาย/สลาย ได้ที่คลัง`);
  hint.style.cssText = 'text-align:center;font-size:13px;margin-top:10px';
  page.appendChild(hint);
}
function openEquipPicker(pet, slotId) {
  modal(`เลือก ${EQUIP_SLOTS[slotId].name}`, body => {
    const options = (G.equipBag || [])
      .filter(it => it.slotId === slotId && it.lvlReq <= pet.level)
      .sort((a,b) => EQUIP_GRADE_KEYS.indexOf(b.grade) - EQUIP_GRADE_KEYS.indexOf(a.grade));
    if (!options.length) {
      body.innerHTML = `<div class="muted" style="padding:14px;text-align:center">ไม่มีอุปกรณ์ที่ใส่ได้ตอนนี้<br>(ต้องเลเวลถึง หรือดรอปจากศัตรูก่อน)</div>`;
    } else {
      const list = el('div', 'eq-picker-list');
      options.forEach(item => {
        const g = equipGradeMeta(item);
        const row = el('div', 'eq-slot-row');
        row.style.setProperty('--grade', g.color);
        row.innerHTML = `
          <div class="eq-slot-icon">${equipIconHtml(item, EQUIP_SLOTS[item.slotId].icon)}</div>
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

// ═══════════════ SCREEN: HOME ═══════════════
function renderHome() {
  const team = activeTeam();
  const syn = synergyOf(team);
  const sup = supportOf(team);

  // Synergy banner
  const banner = $('synergy-banner');
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
  const supLine = $('support-line');
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

  // Team slots
  const slots = $('team-slots');
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

  // Roster
  const roster = $('roster-grid');
  roster.innerHTML = '';
  G.roster.forEach(pet => {
    const inTeam = G.teamIds.includes(pet.uid);
    const c = petCard(pet, {
      selected: inTeam,
      onClick: p => openPetDetail(p, 0),
    });
    roster.appendChild(c);
  });

  renderDefensePanel();
  renderHUD();
}

function addToTeam(id) {
  if (G.teamIds.includes(id)) return;
  if (G.teamIds.length >= 3) { toast('ทีมเต็มแล้ว (สูงสุด 3)'); return; }
  G.teamIds.push(id);
  save(); renderHome();
}
function removeFromTeam(id) {
  G.teamIds = G.teamIds.filter(x => x !== id);
  save(); renderHome();
}

function renderDefensePanel() {
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

// ═══════════════ SCREEN: CLINIC ═══════════════
function renderClinic() {
  // Healing
  const heal = $('clinic-heal');
  heal.innerHTML = '';
  G.roster.forEach(pet => {
    const s = statsOf(pet);
    if (pet.hp >= s.mhp) return;
    const cost = Math.max(30, Math.floor((s.mhp - pet.hp) * 1.2));
    const row = el('div','clinic-row');
    row.innerHTML = `
      ${creatureMarkup(pet, 'cr-sprite')}
      <div class="cr-info">
        <b>${pet.name}</b>
        <span>${pet.hp}/${s.mhp} HP</span>
      </div>
      <button class="btn small">${cost} Bitz</button>`;
    row.querySelector('button').onclick = () => {
      if (G.bitz < cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= cost; pet.hp = s.mhp;
      save(); renderClinic(); renderHUD();
      log(`รักษา ${pet.name} เต็ม HP`, 'heal');
    };
    heal.appendChild(row);
  });
  if (!heal.children.length) {
    heal.appendChild(el('div','muted','ทุกตัวสุขภาพเต็มแล้ว ✓'));
  }
  const healAllCost = G.roster.reduce((sum,p) => {
    const s = statsOf(p);
    return sum + Math.max(0, Math.floor((s.mhp - p.hp) * 1.0));
  }, 0);
  const ha = $('heal-all-btn');
  ha.textContent = healAllCost > 0 ? `รักษาทั้งหมด — ${healAllCost} Bitz` : 'ทุกตัวเต็มแล้ว';
  ha.disabled = healAllCost <= 0;
  ha.onclick = () => {
    if (G.bitz < healAllCost) { toast('Bitz ไม่พอ'); return; }
    G.bitz -= healAllCost;
    G.roster.forEach(p => p.hp = statsOf(p).mhp);
    save(); renderClinic(); renderHUD();
    log('รักษาทีมทั้งหมด', 'heal');
  };

  // Eggs
  const eggs = $('clinic-eggs');
  eggs.innerHTML = '';
  EGGS.forEach(egg => {
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${egg.icon}</div>
      <div class="sc-name">${egg.name}</div>
      <div class="sc-desc">${egg.desc}</div>
      <div class="sc-cost">${egg.cost.toLocaleString()} Bitz</div>
      <button class="btn">ฟัก</button>`;
    card.querySelector('button').onclick = () => hatchEgg(egg);
    eggs.appendChild(card);
  });
}

function hatchEgg(egg) {
  if (G.bitz < egg.cost) { toast('Bitz ไม่พอ'); return; }
  G.bitz -= egg.cost;
  const pet = rollEgg(egg);
  G.roster.push(pet);
  if (G.teamIds.length < 3) G.teamIds.push(pet.uid);
  save();
  const a = ATTR[pet.attr], r = RARITY[pet.rarity];
  hatchReveal(pet);
  log(`ฟัก ${egg.name} → ${pet.name} [${r.name}·${a.name}]`, 'win');
  renderClinic(); renderHUD();
}

function hatchReveal(pet) {
  const a = ATTR[pet.attr], r = RARITY[pet.rarity];
  const trait = pet.whiteTrait ? WHITE_TRAITS[pet.whiteTrait] : null;
  const expPct = Math.min(100, Math.round((pet.exp / Math.max(1, pet.expNeed)) * 100));
  const tier = loyaltyTier(pet.loyalty);
  const loyProg = loyaltyProgress(pet.loyalty);
  const sig = signatureSkillOf(pet);
  modal('🥚 ฟักสำเร็จ!', wrap => {
    const box = el('div','reveal');
    box.style.setProperty('--attr', a.color);
    box.style.setProperty('--rar', r.color);
    box.innerHTML = `
      ${creatureMarkup(pet, 'reveal-sprite float')}
      <div class="reveal-name">${pet.name}</div>
      <div class="reveal-rar">${r.name}</div>
      <div class="reveal-attr">${attrIcon(a, 18)} ${a.name} — ${a.desc}</div>
      ${trait ? `<div class="reveal-trait">${trait.icon} ${trait.name} — ${trait.desc}</div>` : ''}`;
    wrap.appendChild(box);
  });
}

// ═══════════════ SCREEN: SHOP ═══════════════
function renderShop() {
  const items = $('shop-items');
  items.innerHTML = '';
  ITEMS.forEach(it => {
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${it.icon}</div>
      <div class="sc-name">${it.name}</div>
      <div class="sc-desc">${it.desc}</div>
      <div class="sc-cost">${it.cost.toLocaleString()} Bitz</div>
      <button class="btn">ซื้อ</button>`;
    card.querySelector('button').onclick = () => buyItem(it);
    items.appendChild(card);
  });

  const bots = $('shop-bots');
  bots.innerHTML = '';
  DEFENSE_BOTS.forEach(b => {
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${b.icon}</div>
      <div class="sc-name">${b.name}</div>
      <div class="sc-desc">${b.desc}<br>ATK ${b.power.atk} · DEF ${b.power.def}</div>
      <div class="sc-cost">${b.cost.toLocaleString()} Bitz</div>
      <button class="btn">ซื้อ</button>`;
    card.querySelector('button').onclick = () => {
      if (G.bitz < b.cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= b.cost;
      G.bots.push({ id: b.id, t: Date.now() });
      save(); renderShop(); renderHUD();
      log(`ซื้อ ${b.name} ป้องกันฐาน`, 'win');
      toast(`${b.icon} ${b.name} เข้าประจำการแล้ว`);
    };
    bots.appendChild(card);
  });

  renderGuardShop();
  renderTechLab();
}

// ── ANTIVIRUZ SECURITY PACKAGES ──
// 4-tier home-defense guard, gated by player level (GUARD_TIERS in
// data.js). Sequential upgrade path: buying tier N requires already
// owning tier N-1 (or being at tier 0 for tier 1), costs Bitz, and
// replaces the equipped tier — there's no reason to keep a lower one
// once a higher one is owned. The equipped tier (G.guardTier) is also
// what a rival's own hired guard is compared against thematically;
// the actual guard a raider FIGHTS is the rival's own tier (see
// startRaidFight), not the player's.
function renderGuardShop() {
  const wrap = $('shop-guards');
  if (!wrap) return;
  wrap.innerHTML = '';
  const myLv = Math.max(1, ...activeTeam().map(p => p.level), 1);
  GUARD_TIERS.forEach(g => {
    const def = ANTIVIRUZ[g.defId];
    const owned = G.guardTier === g.tier;
    const locked = myLv < g.minLevel;
    const needsPrev = g.tier > 1 && G.guardTier < g.tier - 1;
    const card = el('div', 'shop-card guard-card' + (owned ? ' owned' : ''));
    card.innerHTML = `
      <div class="sc-icon guard-icon">${creatureMarkupFor(def, ATTR.red, 'guard-icon-sprite')}</div>
      <div class="sc-name">${g.name}</div>
      <div class="sc-desc">${def.name} · ATK ${def.base.atk} · DEF ${def.base.def}<br>ต้องเลเวล ${g.minLevel}+</div>
      <div class="sc-cost">${g.cost.toLocaleString()} Bitz</div>
      <button class="btn" ${owned ? 'disabled' : ''}>${owned ? 'ประจำการอยู่' : locked ? `ปลดล็อก Lv.${g.minLevel}` : needsPrev ? 'ต้องซื้อระดับก่อนหน้า' : 'ซื้อ'}</button>`;
    const btn = card.querySelector('button');
    if (!owned && !locked && !needsPrev) {
      btn.onclick = () => {
        if (G.bitz < g.cost) { toast('Bitz ไม่พอ'); return; }
        G.bitz -= g.cost;
        G.guardTier = g.tier;
        save(); renderGuardShop(); renderHUD(); renderDefensePanel();
        log(`ซื้อ ${g.name} ป้องกันฐาน`, 'win');
        toast(`🛡️ ${g.name} เข้าประจำการแล้ว`);
      };
    } else {
      btn.disabled = true;
    }
    wrap.appendChild(card);
  });
}

function buyItem(it) {
  if (G.bitz < it.cost) { toast('Bitz ไม่พอ'); return; }
  const team = activeTeam();
  if (it.type === 'hpall') {
    G.bitz -= it.cost;
    healTeam(G.roster, it.val);
    log(`ใช้ ${it.name} — ฟื้น HP ทีม`, 'heal');
    save(); renderShop(); renderHUD();
    return;
  }
  // Target-selecting items
  modal('เลือกเป้าหมาย', wrap => {
    const grid = el('div','modal-grid');
    G.roster.forEach(p => {
      const c = petCard(p, { onClick: pet => {
        G.bitz -= it.cost;
        applyItem(it, pet);
        save(); closeModal(); renderShop(); renderHUD();
      }});
      grid.appendChild(c);
    });
    wrap.appendChild(grid);
  });
}

// ── FOOD SHOP ──
// Precooked foods (bought here, same items the care screen used to
// sell inline) and cooking ingredients (veg/bun — meat is hunt-only,
// see rollMeatDrop, and is never sold here).
function renderFoodShop() {
  const pre = $('foodshop-precooked');
  if (pre) {
    pre.innerHTML = '';
    FOODS.forEach(f => {
      const owned = (G.foods && G.foods[f.id]) || 0;
      const card = el('div','shop-card');
      card.innerHTML = `
        <div class="sc-icon">${f.icon}</div>
        <div class="sc-name">${f.name}</div>
        <div class="sc-desc">${f.desc}</div>
        ${owned ? `<div class="sc-owned">มี ${owned} ชิ้น</div>` : ''}
        <div class="sc-cost">${f.cost.toLocaleString()} Bitz</div>
        <button class="btn">ซื้อ</button>`;
      card.querySelector('button').onclick = () => buyFood(f);
      pre.appendChild(card);
    });
  }
  const ingBox = $('foodshop-ingredients');
  if (ingBox) {
    ingBox.innerHTML = '';
    INGREDIENTS.forEach(i => {
      const key = i.id.replace('ing_','');
      const owned = (G.ingredients && G.ingredients[key]) || 0;
      const card = el('div','shop-card');
      card.innerHTML = `
        <div class="sc-icon">${i.icon}</div>
        <div class="sc-name">${i.name}</div>
        <div class="sc-desc">${i.desc}</div>
        <div class="sc-owned">มี ${owned} ชิ้น</div>
        <div class="sc-cost">${i.cost.toLocaleString()} Bitz</div>
        <button class="btn">ซื้อ</button>`;
      card.querySelector('button').onclick = () => buyIngredient(i);
      ingBox.appendChild(card);
    });
  }
}
function buyFood(f) {
  if (G.bitz < f.cost) { toast('Bitz ไม่พอ'); return; }
  G.bitz -= f.cost;
  G.foods = G.foods || {};
  G.foods[f.id] = (G.foods[f.id] || 0) + 1;
  save(); renderFoodShop(); renderHUD();
  toast(`✅ ซื้อ ${f.name} แล้ว`);
}
function buyIngredient(i) {
  if (G.bitz < i.cost) { toast('Bitz ไม่พอ'); return; }
  G.bitz -= i.cost;
  const key = i.id.replace('ing_','');
  G.ingredients = G.ingredients || { veg:0, bun:0, meat:0 };
  G.ingredients[key] = (G.ingredients[key] || 0) + 1;
  save(); renderFoodShop(); renderHUD();
  toast(`✅ ซื้อ ${i.name} แล้ว`);
}

// ── HOMEMADE COOKING (accessed from ฐานของคุณ) ──
function openCookingMenu() {
  modal('👨‍🍳 ทำอาหารโฮมเมด', body => {
    const inv = G.ingredients || { veg:0, bun:0, meat:0 };
    const hint = el('div', 'muted',
      `วัตถุดิบที่มี: 🥬${inv.veg||0} 🍞${inv.bun||0} 🥩${inv.meat||0}`);
    hint.style.cssText = 'text-align:center;margin-bottom:10px;font-size:14px';
    body.appendChild(hint);

    const list = el('div', 'eq-picker-list');
    RECIPES.forEach(r => {
      const canCook = (r.need.veg||0) <= (inv.veg||0)
        && (r.need.bun||0) <= (inv.bun||0)
        && (r.need.meat||0) <= (inv.meat||0);
      const needParts = [];
      if (r.need.veg)  needParts.push(`🥬${r.need.veg}`);
      if (r.need.bun)  needParts.push(`🍞${r.need.bun}`);
      if (r.need.meat) needParts.push(`🥩${r.need.meat}`);
      const row = el('div', 'eq-slot-row');
      row.innerHTML = `
        <div class="eq-slot-icon">${r.icon}</div>
        <div class="eq-slot-info">
          <div class="eq-slot-name">${r.name}</div>
          <div class="eq-slot-sub">ต้องการ: ${needParts.join(' ')} · +${r.loyalty} ผูกพัน</div>
        </div>
        <button class="btn small${canCook ? ' primary' : ''}"${canCook ? '' : ' disabled'}>ทำ</button>`;
      row.querySelector('button').onclick = () => { cookRecipe(r); openCookingMenu(); };
      list.appendChild(row);
    });
    body.appendChild(list);
  });
}
function cookRecipe(r) {
  const inv = G.ingredients || { veg:0, bun:0, meat:0 };
  if ((r.need.veg||0) > (inv.veg||0) || (r.need.bun||0) > (inv.bun||0) || (r.need.meat||0) > (inv.meat||0)) {
    toast('วัตถุดิบไม่พอ'); return;
  }
  inv.veg  -= (r.need.veg  || 0);
  inv.bun  -= (r.need.bun  || 0);
  inv.meat -= (r.need.meat || 0);
  G.ingredients = inv;
  G.foods = G.foods || {};
  G.foods[r.id] = (G.foods[r.id] || 0) + 1;
  save(); renderHUD();
  toast(`🍳 ทำ ${r.name} สำเร็จ!`);
}

function applyItem(it, pet) {
  const s = statsOf(pet);
  if (it.type === 'hp') {
    const amt = Math.floor(s.mhp * it.val);
    pet.hp = clamp(pet.hp + amt, 0, s.mhp);
    log(`${it.icon} ${pet.name} +${amt} HP`, 'heal');
  } else if (it.type === 'exp') {
    const evs = grantExp(pet, it.val);
    log(`${it.icon} ${pet.name} +${it.val} EXP`, 'info');
    evs.forEach(e => {
      if (e.type === 'levelup') log(`${pet.name} → Lv.${e.level} (+${e.pts} แต้ม)`, 'win');
      if (e.type === 'skill')   log(`สกิลใหม่: ${e.name}`, 'win');
    });
  } else if (it.type === 'material') {
    // Evolution materials (e.g. the repurposed Evo Stone) aren't
    // pet-targeted — they just go straight into the shared bag.
    addMaterial(it.matId, it.val || 1);
    const m = MATERIALS[it.matId];
    log(`${m.icon} ได้รับ ${m.name}`, 'win');
  }
}

// ═══════════════ TECH LAB — FINAL EVOLUTION ═══════════════
// The ONLY way to evolve a stage-1 pet into stage 2 (which also rolls
// its mutation). Requires the pet itself to be ready (canEvolve —
// full level for its rarity + max loyalty) AND 1 Malware Core + 3
// Code Parts (any mix of the 4 types) spent here.
let techLabPetId = null;
let techLabParts = [null, null, null];   // each slot: a mutation-type string, or null
let techLabCoreUsed = false;

function techLabReadyPets() {
  return G.roster.filter(p => canEvolve(p).ok);
}

function renderTechLab() {
  const picker = $('techlab-pet-picker');
  const panel = $('techlab-panel');
  if (!picker || !panel) return;

  // Default to a ready pet if the current selection isn't (anymore).
  const readyPets = techLabReadyPets();
  if (!techLabPetId || !G.roster.find(p => p.uid === techLabPetId)) {
    techLabPetId = (readyPets[0] || G.roster[0] || {}).uid || null;
  }
  const pet = G.roster.find(p => p.uid === techLabPetId);

  picker.innerHTML = '';
  G.roster.forEach(p => {
    const ready = canEvolve(p).ok;
    const chip = el('button', 'care-chip' + (p.uid === techLabPetId ? ' on' : ''));
    chip.innerHTML = `${creatureMarkup(p, 'care-chip-sprite')}<span>${p.name}${ready ? ' ▲' : ''}</span>`;
    chip.onclick = () => { techLabPetId = p.uid; techLabParts = [null,null,null]; techLabCoreUsed = false; renderTechLab(); };
    picker.appendChild(chip);
  });

  if (!pet) { panel.innerHTML = `<div class="muted">ยังไม่มี VIRUZ</div>`; return; }

  const chk = canEvolve(pet);
  G.materials = G.materials || {};
  const coreCount = G.materials.malware_core || 0;

  const coreSlotOn = techLabCoreUsed && coreCount > 0;
  const coreSlotHtml = `
    <button class="tl-slot ${coreSlotOn ? 'filled' : ''}" data-slot="core">
      ${coreSlotOn ? `<span class="tl-slot-icon">${MATERIALS.malware_core.icon}</span>` : '<span class="tl-slot-plus">+</span>'}
      <span class="tl-slot-label">Malware Core</span>
      <span class="tl-slot-count">${coreCount} มี</span>
    </button>`;

  const partSlotsHtml = techLabParts.map((matType, i) => {
    const filled = !!matType;
    const m = filled ? MATERIALS['code_part_' + matType] : null;
    return `
      <button class="tl-slot ${filled ? 'filled' : ''}" data-slot="part${i}">
        ${filled ? `<span class="tl-slot-icon">${m.icon}</span>` : '<span class="tl-slot-plus">+</span>'}
        <span class="tl-slot-label">${filled ? m.name.replace('Code Part: ','') : 'Code Part'}</span>
      </button>`;
  }).join('');

  const usedParts = techLabParts.filter(Boolean);
  const weights = mutationWeightsFromParts(usedParts);
  const oddsHtml = weights.map(([k, w]) => {
    const info = MUTATIONS[k];
    return `<div class="tl-odds-row"><span style="color:${info.color}">${info.name}</span><b>${w.toFixed(1)}%</b></div>`;
  }).join('');

  const canConfirm = chk.ok && coreSlotOn && usedParts.length === 3;

  panel.innerHTML = `
    <div class="tl-status ${chk.ok ? 'ok' : 'bad'}">${chk.ok ? '✅ พร้อมวิวัฒน์' : `🔒 ${chk.reason}`}</div>
    <div class="tl-slots">
      ${coreSlotHtml}
      ${partSlotsHtml}
    </div>
    ${usedParts.length ? `<div class="tl-odds"><div class="tl-odds-title">โอกาสได้รับแต่ละฟอร์ม</div>${oddsHtml}</div>` : ''}
    <button class="btn primary wide" id="techlab-evolve-btn" ${canConfirm ? '' : 'disabled'}>
      🧪 วิวัฒน์ขั้นสุดท้าย
    </button>`;

  panel.querySelector('[data-slot="core"]').onclick = () => {
    if (techLabCoreUsed) { techLabCoreUsed = false; renderTechLab(); return; }
    if (coreCount < 1) { toast('ไม่มี Malware Core'); return; }
    techLabCoreUsed = true;
    renderTechLab();
  };
  techLabParts.forEach((_, i) => {
    panel.querySelector(`[data-slot="part${i}"]`).onclick = () => openCodePartPicker(i);
  });
  const evoBtn = panel.querySelector('#techlab-evolve-btn');
  if (evoBtn) evoBtn.onclick = () => confirmTechLabEvolve(pet);
}

function openCodePartPicker(slotIdx) {
  modal('เลือก Code Part', wrap => {
    const grid = el('div', 'modal-grid');
    // How many of each type are already committed to OTHER slots,
    // so we don't offer more than the player actually owns.
    const committedElsewhere = {};
    techLabParts.forEach((t, i) => { if (t && i !== slotIdx) committedElsewhere[t] = (committedElsewhere[t]||0)+1; });
    CODE_PART_IDS.forEach(matId => {
      const m = MATERIALS[matId];
      const owned = (G.materials && G.materials[matId]) || 0;
      const available = owned - (committedElsewhere[m.mutation] || 0);
      const card = el('div', 'shop-card' + (available <= 0 ? ' disabled' : ''));
      card.innerHTML = `
        <div class="sc-icon">${m.icon}</div>
        <div class="sc-name">${m.name.replace('Code Part: ','')}</div>
        <div class="sc-desc">มี ${Math.max(0,available)} ชิ้น</div>`;
      if (available > 0) {
        card.onclick = () => { techLabParts[slotIdx] = m.mutation; closeModal(); renderTechLab(); };
      }
      grid.appendChild(card);
    });
    if (techLabParts[slotIdx]) {
      const clearBtn = el('button', 'btn wide', 'เอาออกจากช่อง');
      clearBtn.onclick = () => { techLabParts[slotIdx] = null; closeModal(); renderTechLab(); };
      wrap.appendChild(grid);
      wrap.appendChild(clearBtn);
    } else {
      wrap.appendChild(grid);
    }
  });
}

function confirmTechLabEvolve(pet) {
  const chk = canEvolve(pet);
  const usedParts = techLabParts.filter(Boolean);
  if (!chk.ok || !techLabCoreUsed || usedParts.length !== 3) { toast('ยังไม่พร้อม'); return; }
  const weights = mutationWeightsFromParts(usedParts);

  // Spend materials now — evolve() below can't fail once we're here
  // (canEvolve() already confirmed eligibility).
  G.materials.malware_core -= 1;
  usedParts.forEach(mut => { G.materials['code_part_' + mut] -= 1; });
  techLabCoreUsed = false;
  techLabParts = [null, null, null];

  playEvolveAnimation(pet, () => evolve(pet, false, weights)).then(res => {
    save();
    renderTechLab();
    renderHUD();
    if (res) {
      const mInfo = MUTATIONS[pet.mutation];
      log(`🧪 ${pet.name} วิวัฒน์ขั้นสุดท้าย → ${res.label} · กลายพันธุ์: ${mInfo.name}`, 'win');
      toast(`✨ ${pet.name} วิวัฒน์แล้ว!\n${res.label} · ${mInfo.name}`);
    }
  });
}

// ── EVOLVE ANIMATION ──
// White glowing pulse around the body, 3x (~1s each), then the
// original form shatters into pixel-like shards revealing the new
// (mutated) form underneath. Runs as a full-screen overlay so it
// works from the Tech Lab (not just mid-battle). `doEvolve` is called
// (and its result returned) mid-explosion, so the reveal underneath
// shows the actual new form.
async function playEvolveAnimation(pet, doEvolve) {
  const overlay = el('div', 'evo-overlay');
  document.body.appendChild(overlay);
  overlay.innerHTML = `
    <div class="evo-stage">
      <div class="evo-sprite-wrap">${creatureMarkup(pet, 'evo-sprite')}</div>
      <div class="evo-shards"></div>
      <div class="evo-label">วิวัฒน์...</div>
    </div>`;
  const wrap = overlay.querySelector('.evo-sprite-wrap');
  const label = overlay.querySelector('.evo-label');

  for (let i = 0; i < 3; i++) {
    wrap.classList.add('evo-pulse');
    await wait(950);
    wrap.classList.remove('evo-pulse');
    await wait(130);
  }

  const rect = wrap.getBoundingClientRect();
  const imgEl = wrap.querySelector('img');
  const bgUrl = imgEl ? imgEl.src : null;
  const w = Math.max(40, rect.width), h = Math.max(40, rect.height);
  const cols = 7, rows = 7;
  const shardW = w / cols, shardH = h / rows;
  const shardsHost = overlay.querySelector('.evo-shards');
  shardsHost.style.width = w + 'px';
  shardsHost.style.height = h + 'px';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const shard = document.createElement('div');
      shard.className = 'evo-shard';
      shard.style.width = shardW + 'px';
      shard.style.height = shardH + 'px';
      shard.style.left = (c * shardW) + 'px';
      shard.style.top = (r * shardH) + 'px';
      if (bgUrl) {
        shard.style.backgroundImage = `url('${bgUrl}')`;
        shard.style.backgroundSize = `${w}px ${h}px`;
        shard.style.backgroundPosition = `-${c * shardW}px -${r * shardH}px`;
      }
      const dx = (Math.random() - 0.5) * 280;
      const dy = (Math.random() - 0.5) * 220 - 40;
      const rot = (Math.random() - 0.5) * 200;
      shard.style.setProperty('--dx', dx + 'px');
      shard.style.setProperty('--dy', dy + 'px');
      shard.style.setProperty('--rot', rot + 'deg');
      shard.style.animationDelay = (Math.random() * 0.12) + 's';
      shardsHost.appendChild(shard);
    }
  }

  label.textContent = '';
  wrap.style.visibility = 'hidden';
  shardsHost.classList.add('go');

  const result = doEvolve();
  wrap.innerHTML = creatureMarkup(pet, 'evo-sprite evo-reveal');

  await wait(750);
  wrap.style.visibility = 'visible';
  await wait(600);
  overlay.remove();
  return result;
}

// ═══════════════ SCREEN: HACK ═══════════════
// ── WORLD MAP ──
// Looping video background with clickable pins positioned by percentage.
let currentMapId = 'forest';   // synced with G.currentMapId, see renderWorld()

function renderWorld() {
  currentMapId = G.currentMapId || currentMapId;
  const map = MAPS.find(m => m.id === currentMapId) || MAPS[0];
  const vid = $('world-video');
  if (vid) {
    const want = map.video;
    if (!vid.getAttribute('src') || !vid.getAttribute('src').endsWith(want)) {
      vid.setAttribute('src', want);
      vid.setAttribute('poster', map.poster);
      vid.load();
    }
    vid.play().catch(()=>{});
  }
  setText('world-name', map.name);
  setText('world-thai', map.thai);
  setText('world-lv', `Lv ${map.levelRange[0]}–${map.levelRange[1]}`);

  // map switcher
  const tabs = $('world-tabs');
  if (tabs) {
    tabs.innerHTML = '';
    MAPS.forEach(m => {
      const b = el('button','map-tab' + (m.id === currentMapId ? ' on' : ''), m.name);
      b.onclick = () => { currentMapId = m.id; G.currentMapId = m.id; save(); renderWorld(); };
      tabs.appendChild(b);
    });
  }

  const layer = $('world-pins');
  layer.innerHTML = '';
  const teamLv = Math.max(1, ...activeTeam().map(p => p.level));

  zonesOfMap(map.id).forEach(z => {
    const pin = el('button', 'zone-pin ' + (z.kind === 'safe' ? 'safe' : 'battle'));
    pin.style.left = z.x + '%';
    pin.style.top  = z.y + '%';

    if (z.kind === 'safe') {
      pin.innerHTML = `
        <span class="pin-dot"></span>
        <span class="pin-card">
          <b>${z.name}</b>
          <i>${z.thai}</i>
          <em>พักฟื้น · ร้านยา</em>
        </span>`;
      pin.onclick = () => { G.lastSafe = z.id; showScreen('safe'); };
    } else {
      // Warn when the zone is well above the team's level
      const gap = z.lv[0] - teamLv;
      const tier = gap > 8 ? 'hard' : gap > 0 ? 'warn' : 'ok';
      pin.classList.add(tier);
      pin.innerHTML = `
        <span class="pin-dot"></span>
        <span class="pin-card">
          <b>${z.name}</b>
          <i>${z.thai}</i>
          <em>Lv ${z.lv[0]}–${z.lv[1]}</em>
        </span>`;
      pin.onclick = () => openZone(z);
    }
    layer.appendChild(pin);
  });

  // Region boss — one wandering pin per map, near whichever battle
  // zone it's currently occupying. Offset from the zone's own
  // coordinates (clamped on-canvas) so it sits NEXT TO that pin
  // instead of exactly on top of it — stacking them at identical
  // coordinates made the zone underneath unclickable.
  const bossSt = ensureBossSpawned(map.id);
  if (bossSt && bossSt.alive) {
    const bz = zoneById(bossSt.zoneId);
    if (bz) {
      const bx = Math.max(6, Math.min(94, bz.x + 9));
      const by = Math.max(6, Math.min(94, bz.y - 9));
      const pin = el('button', 'zone-pin boss-pin');
      pin.style.left = bx + '%';
      pin.style.top  = by + '%';
      pin.innerHTML = `
        <span class="pin-dot boss-dot"></span>
        <span class="pin-card boss-card">
          <b>⚠ Region Boss</b>
          <i>${bz.name}</i>
          <em>Boss Lv???</em>
        </span>`;
      pin.onclick = () => openBossBrief(map.id, bossSt, bz);
      layer.appendChild(pin);
    }
  }
}

// Boss briefing — same spirit as openZone()'s briefing but for the
// wandering region boss. Real level/stats are revealed here (the
// map pin itself only ever shows "Lv???").
function openBossBrief(mapId, bossSt, zone) {
  modal(`⚠ Region Boss · ${zone.name}`, wrap => {
    const box = el('div', 'zone-brief');
    box.innerHTML = `
      <div class="zb-desc">บอสประจำภูมิภาค — สุ่มจาก 3 มอนสเตอร์ที่แข็งแกร่งที่สุดในพื้นที่นี้
        ขนาดใหญ่กว่าปกติ 1.5 เท่า มี HP 2 ชั้น — เมื่อแถบแรกหมด จะเข้าสู่สภาวะคลั่ง (ATK +50%)</div>
      <div class="zb-meta">
        <span>ระดับ <b>ประมาณ Lv ${bossSt.level}</b></span>
        <span>รางวัล <b>Bitz ×${BOSS_TUNING.moneyMult}</b></span>
        <span>Malware Core <b>${Math.round(BOSS_TUNING.malwareCoreChance*100)}%</b></span>
      </div>
    `;
    const go = el('button', 'btn primary wide', '⚔ ท้าดวลบอส');
    go.onclick = () => { closeModal(); startBossFight(mapId); };
    box.appendChild(go);
    wrap.appendChild(box);
  });
}

// Zone briefing before committing to the fight
function openZone(z) {
  modal(`${z.name} · ${z.thai}`, wrap => {
    const teamLv = Math.max(1, ...activeTeam().map(p => p.level));
    const gap = z.lv[0] - teamLv;
    const box = el('div','zone-brief');
    box.innerHTML = `
      <div class="zb-desc">${z.desc}</div>
      <div class="zb-meta">
        <span>ระดับศัตรู <b>Lv ${z.lv[0]}–${z.lv[1]}</b></span>
        <span>คลื่น <b>${z.waves[0]}–${z.waves[1]}</b></span>
        <span>Bitz <b>×${z.reward.bitzMult}</b></span>
      </div>
      <div class="zb-mons">
        ${z.pool.map(id => {
          const m = ANTIVIRUZ[id];
          return `<div class="zb-mon">${creatureMarkupFor(m, null, 'zb-sprite')}<span>${m.name}</span></div>`;
        }).join('')}
      </div>
      ${gap > 8 ? `<div class="zb-warn">⚠ ศัตรูสูงกว่าทีมคุณมาก (ทีม Lv ${teamLv})</div>` : ''}
    `;
    const go = el('button','btn primary wide','⚔ เข้าสู้');
    go.onclick = () => { closeModal(); startZone(z); };
    box.appendChild(go);
    wrap.appendChild(box);
  });
}

// ── SKILL TREE SCREEN ──
// Circular nodes connected by branches, coloured by attribute.
// Taking a node costs 1 growth point and requires its parents maxed.
let treePetId = null;
// Which tree is currently displayed: 'attr' (always available) or
// 'mutation' (only once stage 2 + a mutation has rolled). Reset
// whenever a different pet is viewed so switching pets doesn't leave
// you stuck on a tree that pet doesn't have.
let treeViewMode = 'attr';

function renderTree() {
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

  // current stats readout
  const st = statsOf(pet);
  const sb = $('tree-stats');
  if (sb) {
    sb.innerHTML = STAT_KEYS.map(k => {
      const meta = STAT_META[k];
      const val = k === 'crit' || k === 'eva' ? st[k] + '%' : st[k];
      return `<span class="ts-stat"><i>${meta.icon}</i>${meta.name} <b>${val}</b></span>`;
    }).join('');
  }

  // canvas
  const host = $('tree-canvas');
  if (!host) return;
  host.style.setProperty('--tree-color', tree.color);

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
function openSkillExplainer(pet, tree, nodeId, originScreen) {
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
          pet.autoCast = pet.autoCast || {};
          pet.autoCast[sp.id] = true;
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

// ── CARE (TAMAGOTCHI MINIGAME) ──
// Each activity is on its own 1-hour cooldown, tracked per pet in
// G.care[petUid][activityId] = timestamp. Foods deplete when used;
// toys are kept forever but each has its own cooldown.
let carePetId = null;

function careReady(petUid, actId) {
  const rec = (G.care && G.care[petUid] && G.care[petUid][actId]) || 0;
  return Date.now() - rec >= CARE_COOLDOWN_MS;
}
function careRemaining(petUid, actId) {
  const rec = (G.care && G.care[petUid] && G.care[petUid][actId]) || 0;
  return Math.max(0, CARE_COOLDOWN_MS - (Date.now() - rec));
}
function fmtCooldown(ms) {
  const m = Math.ceil(ms / 60000);
  if (m >= 60) return `${Math.floor(m/60)} ชม. ${m%60} น.`;
  return `${m} นาที`;
}
function markCare(petUid, actId) {
  G.care = G.care || {};
  G.care[petUid] = G.care[petUid] || {};
  G.care[petUid][actId] = Date.now();
}

function addLoyalty(pet, amount) {
  const before = loyaltyTier(pet.loyalty).id;
  pet.loyalty = clamp((pet.loyalty || 0) + amount, 0, 100);
  const t = loyaltyTier(pet.loyalty);
  if (t.id !== before) {
    toast(`${pet.name} → ${t.icon} ${t.name}!\n${t.perk || ''}`);
    log(`${t.icon} ${pet.name} เลื่อนขั้นเป็น ${t.name}`, 'win');
  }
  return t;
}

// ── INVENTORY ── read-only view of owned potions/foods/toys, opened
// from the drawer's Inventory tab.
function renderInventory() {
  const potBox = $('inv-potions');
  if (potBox) {
    potBox.innerHTML = '';
    const owned = G.potions || {};
    const any = POTIONS.some(p => (owned[p.id] || 0) > 0);
    if (!any) potBox.innerHTML = `<div class="muted" style="padding:10px">ยังไม่มียา</div>`;
    POTIONS.forEach(p => {
      const n = owned[p.id] || 0;
      if (!n) return;
      const card = el('div', 'shop-card');
      card.innerHTML = `<div class="sc-icon">${p.icon}</div><div class="sc-name">${p.name}</div>
        <div class="sc-desc">${p.desc}</div><div class="sc-owned">มี ${n} ชิ้น</div>`;
      potBox.appendChild(card);
    });
  }
  const foodBox = $('inv-foods');
  if (foodBox) {
    foodBox.innerHTML = '';
    const owned = G.foods || {};
    const allFoods = [...FOODS, ...RECIPES];
    const any = allFoods.some(f => (owned[f.id] || 0) > 0);
    if (!any) foodBox.innerHTML = `<div class="muted" style="padding:10px">ยังไม่มีอาหาร</div>`;
    allFoods.forEach(f => {
      const n = owned[f.id] || 0;
      if (!n) return;
      const card = el('div', 'shop-card');
      card.innerHTML = `<div class="sc-icon">${f.icon}</div><div class="sc-name">${f.name}</div>
        <div class="sc-desc">${f.desc}</div><div class="sc-owned">มี ${n} ชิ้น</div>`;
      foodBox.appendChild(card);
    });
  }
  const toyBox = $('inv-toys');
  if (toyBox) {
    toyBox.innerHTML = '';
    const owned = G.toys || [];
    if (!owned.length) toyBox.innerHTML = `<div class="muted" style="padding:10px">ยังไม่มีของเล่น</div>`;
    TOYS.forEach(t => {
      if (!owned.includes(t.id)) return;
      const card = el('div', 'shop-card');
      card.innerHTML = `<div class="sc-icon">${t.icon}</div><div class="sc-name">${t.name}</div>
        <div class="sc-desc">${t.desc}</div><div class="sc-owned">มีแล้ว</div>`;
      toyBox.appendChild(card);
    });
  }
  renderEquipBag();
  renderCraft();
}

// Item cards in the equipment bag — each can be sold for Bitz or
// dusted (disenchanted) into Dust, the crafting currency below.
function renderEquipBag() {
  const box = $('inv-equip');
  if (!box) return;
  box.innerHTML = '';
  const bag = G.equipBag || [];
  if (!bag.length) {
    box.innerHTML = `<div class="muted" style="padding:10px">ยังไม่มีอุปกรณ์ — ดรอปจากศัตรู หรือคราฟต์เองด้านล่าง</div>`;
    return;
  }
  const sorted = [...bag].sort((a,b) => EQUIP_GRADE_KEYS.indexOf(b.grade) - EQUIP_GRADE_KEYS.indexOf(a.grade));
  sorted.forEach(item => {
    const g = equipGradeMeta(item);
    const slot = EQUIP_SLOTS[item.slotId];
    const card = el('div', 'shop-card eq-card');
    card.style.setProperty('--grade', g.color);
    card.innerHTML = `
      <div class="sc-icon">${equipIconHtml(item, slot.icon)}</div>
      <div class="sc-name" style="color:${g.color}">${item.name}</div>
      <div class="sc-desc">${slot.name} · Lv.${item.lvlReq}<br>${equipStatLine(item)}</div>
      <div class="eq-card-btns">
        <button class="btn small" data-act="sell">💰 ${sellValueOf(item)}</button>
        <button class="btn small" data-act="dust">🧬 ${dustValueOf(item)}</button>
      </div>`;
    card.querySelector('[data-act="sell"]').onclick = () => { sellEquip(item); renderEquipBag(); };
    card.querySelector('[data-act="dust"]').onclick = () => { dustEquip(item); renderEquipBag(); renderCraft(); };
    box.appendChild(card);
  });
}

// Spend Dust on one of a few fixed recipes to self-craft a random
// piece of gear — better recipes skew toward higher grades but never
// guarantee one; slot/stats/level/affix still roll randomly.
function renderCraft() {
  setText('craft-dust', G.dust || 0);
  const box = $('inv-craft');
  if (!box) return;
  box.innerHTML = '';
  const maxLevel = Math.max(1, ...G.roster.map(p => p.level || 1));
  CRAFT_RECIPES.forEach(r => {
    const afford = (G.dust || 0) >= r.dust;
    const card = el('div', 'shop-card');
    card.innerHTML = `<div class="sc-icon">${r.icon}</div><div class="sc-name">${r.name}</div>
      <div class="sc-desc">โอกาสได้เกรดสูงขึ้นตามด่าน</div><div class="sc-cost">🧬 ${r.dust} Dust</div>`;
    const btn = el('button', 'btn small' + (afford ? ' primary' : ''), afford ? 'คราฟต์' : 'Dust ไม่พอ');
    if (!afford) btn.disabled = true;
    btn.onclick = () => {
      if ((G.dust || 0) < r.dust) { toast('Dust ไม่พอ'); return; }
      G.dust -= r.dust;
      const item = craftEquipment(r.id, maxLevel);
      G.equipBag = G.equipBag || [];
      G.equipBag.push(item);
      save();
      toast(`✨ ได้ ${item.name}!`);
      renderCraft(); renderEquipBag();
    };
    card.appendChild(btn);
    box.appendChild(card);
  });
}

function renderCare() {
  const pet = G.roster.find(p => p.uid === carePetId) || activeTeam()[0] || G.roster[0];
  if (!pet) return;
  const petChanged = carePetId !== pet.uid;
  carePetId = pet.uid;

  // pet picker
  const picker = $('care-picker');
  if (picker) {
    picker.innerHTML = '';
    G.roster.forEach(p => {
      const chip = el('button','care-chip' + (p.uid === carePetId ? ' on' : ''));
      chip.innerHTML = `${creatureMarkup(p,'care-chip-sprite')}<span>${p.name}</span>`;
      chip.onclick = () => { carePetId = p.uid; renderCare(); };
      picker.appendChild(chip);
    });
  }

  genCareBackground(pet);

  const tier = loyaltyTier(pet.loyalty);
  const prog = loyaltyProgress(pet.loyalty);
  const info = $('care-info');
  if (info) {
    info.innerHTML = `
      <div class="care-name">${pet.name} <span class="muted">Lv.${pet.level}</span></div>
      <div class="care-tier">${tier.icon} ${tier.name}</div>
      <div class="loy-bar"><i style="width:${prog.pct}%"></i></div>`;
  }
  const petEl = $('care-pet');
  if (petEl) {
    petEl.innerHTML = creatureMarkup(pet, 'care-sprite float');
    if (petChanged) { petEl.style.left = '50%'; petEl.style.top = '52%'; }
  }

  // Activities — a free clean + owned foods + owned toys, scattered
  // in a ring around the stage border instead of a listed grid.
  const acts = $('care-acts');
  if (acts) {
    acts.innerHTML = '';
    const btns = [];
    btns.push(careRingBtn({
      id: CARE_CLEAN.id, icon: CARE_CLEAN.icon, name: CARE_CLEAN.name,
      desc: CARE_CLEAN.desc, loyalty: CARE_CLEAN.loyalty, kind: 'free',
    }, pet));
    // Food no longer offers a "buy" state here at all — that flow
    // moved to the Food Shop. Only foods (precooked or homemade) the
    // player currently has any of actually appear as ring buttons.
    [...FOODS, ...RECIPES].forEach(f => {
      const owned = (G.foods && G.foods[f.id]) || 0;
      if (owned > 0) btns.push(careRingBtn({ ...f, kind:'food', owned }, pet));
    });
    TOYS.forEach(t => {
      const owned = (G.toys || []).includes(t.id);
      btns.push(careRingBtn({ ...t, kind:'toy', owned: owned ? 1 : 0 }, pet));
    });
    btns.forEach(b => acts.appendChild(b));
    layoutCareRing(btns);
  }

  refreshWasteIndicator();
  startCareWander();
  checkWasteSpawn();
}

// ── LIVING-AREA BACKGROUND ──
// Purely visual — a backdrop themed to the pet's attribute, randomly
// re-scattered every time the screen renders so it feels alive
// rather than static wallpaper.
const CARE_THEMES = {
  red:    { bg:['#4a1408','#2a0d08','#1a0604'], props:['🔥','🌋','⚡','💥','🪨'] },
  green:  { bg:['#0d3b2a','#07241d','#04120e'], props:['🍃','🌿','🌪️','✨','🍀'] },
  yellow: { bg:['#3c2a08','#241a06','#150e03'], props:['⚙️','🔩','🛡️','🧱','🔧'] },
  white:  { bg:['#2c2440','#1c1826','#100d18'], props:['✨','🌸','💫','➕','🕊️'] },
};
function genCareBackground(pet) {
  const bg = $('care-bg');
  if (!bg) return;
  const theme = CARE_THEMES[pet.attr] || CARE_THEMES.red;
  bg.style.background =
    `radial-gradient(ellipse 90% 70% at 50% 38%, ${theme.bg[0]}, ${theme.bg[1]} 65%, ${theme.bg[2]} 100%)`;
  bg.innerHTML = '';
  const N = 10 + Math.floor(Math.random() * 5); // 10-14 props, fresh each render
  for (let i = 0; i < N; i++) {
    const prop = el('div', 'care-prop', theme.props[Math.floor(Math.random()*theme.props.length)]);
    // Keep a clear zone around the center so props never sit on the pet.
    let x, y;
    do { x = 6 + Math.random()*88; y = 8 + Math.random()*84; }
    while (Math.hypot(x-50, (y-46)*1.3) < 22);
    prop.style.left = x + '%';
    prop.style.top = y + '%';
    prop.style.setProperty('--sz', (16 + Math.random()*20).toFixed(0) + 'px');
    prop.style.setProperty('--rot', (Math.random()*40-20).toFixed(0) + 'deg');
    prop.style.opacity = (0.35 + Math.random()*0.4).toFixed(2);
    prop.style.animationDelay = (Math.random()*3).toFixed(2) + 's';
    bg.appendChild(prop);
  }
}

// Scattered (not a perfectly even ring) placement around the stage
// border, pet centered. Base angle spacing keeps buttons from
// overlapping; jitter on top keeps it from looking like a rigid,
// mechanical dial.
function layoutCareRing(buttons) {
  const n = buttons.length;
  if (!n) return;
  const baseStep = 360 / n;
  buttons.forEach((b, i) => {
    const jitterA = (Math.random() - 0.5) * baseStep * 0.5;
    const ang = (i * baseStep + jitterA - 90) * Math.PI / 180; // start pointing up
    const rx = 40 + (Math.random()*6 - 3);
    const ry = 37 + (Math.random()*6 - 3);
    const x = clamp(50 + Math.cos(ang) * rx, 8, 92);
    const y = clamp(50 + Math.sin(ang) * ry, 10, 90);
    b.style.left = x + '%';
    b.style.top  = y + '%';
  });
}

function careRingBtn(act, pet) {
  const ready = careReady(pet.uid, act.id);
  const needBuy = act.kind !== 'free' && !act.owned;
  const btn = el('button', 'care-ring-btn' + (needBuy ? ' need-buy' : ready ? ' ready' : ' cooling'));
  btn.dataset.act = act.id;
  btn.title = act.name;
  let badge;
  if (needBuy) badge = `<span class="crb-badge buy">${act.cost}</span>`;
  else if (!ready) badge = `<span class="crb-badge cd">${fmtCooldown(careRemaining(pet.uid, act.id))}</span>`;
  else badge = `<span class="crb-badge loy">+${act.loyalty}</span>`;
  btn.innerHTML = `<span class="crb-icon">${act.icon}</span>${badge}`;
  btn.onclick = () => {
    if (needBuy) {
      if (G.bitz < act.cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= act.cost;
      if (act.kind === 'food') {
        G.foods = G.foods || {};
        G.foods[act.id] = (G.foods[act.id] || 0) + 1;
      } else {
        G.toys = G.toys || [];
        if (!G.toys.includes(act.id)) G.toys.push(act.id);
      }
      save(); renderCare(); renderHUD();
      toast(`✅ ซื้อ ${act.name} แล้ว`);
      return;
    }
    if (!ready) { toast(`⏳ รออีก ${fmtCooldown(careRemaining(pet.uid, act.id))}`); return; }
    if (act.kind === 'food' && !((G.foods && G.foods[act.id]) > 0)) { toast('ไม่มีอาหารนี้'); return; }
    openCareGame(act, pet);
  };
  return btn;
}

// ── AUTONOMOUS WANDER ──
// The pet is never fully static: while idle it picks a random point
// within the stage, walks there over a CSS transition, waits a beat,
// and repeats. Paused (not stopped) whenever a care minigame overlay
// is open or the care screen isn't the active one, so it never
// animates uselessly behind something else — see the guard at the
// top of wanderStep().
let careWander = null; // { timer } or null when torn down entirely
function startCareWander() {
  if (careWander) return; // already running — renderCare() re-runs often
  careWander = { timer: null };
  scheduleWanderStep(900 + Math.random() * 800);
}
function stopCareWander() {
  if (careWander && careWander.timer) clearTimeout(careWander.timer);
  careWander = null;
}
function scheduleWanderStep(delay) {
  if (!careWander) return;
  clearTimeout(careWander.timer);
  careWander.timer = setTimeout(wanderStep, delay != null ? delay : 2200 + Math.random() * 2600);
}
function wanderStep() {
  if (!careWander) return;
  // Don't move the pet while it's off-screen behind a minigame
  // overlay, or while some other screen is showing.
  const overlayOpen = CG != null || ($('care-game') && $('care-game').classList.contains('open'));
  const petEl = $('care-pet');
  if (currentScreenId !== 'care' || overlayOpen || !petEl) { scheduleWanderStep(1200); return; }
  checkWasteSpawn();
  const x = 20 + Math.random() * 58;
  const y = 30 + Math.random() * 46;
  petEl.classList.add('wandering');
  const facingLeft = parseFloat(petEl.style.left || '50') > x;
  petEl.classList.toggle('face-l', facingLeft);
  petEl.style.left = x + '%';
  petEl.style.top = y + '%';
  setTimeout(() => { if (petEl) petEl.classList.remove('wandering'); }, 1300);
  scheduleWanderStep();
}

// ── AMBIENT WASTE / MESS ──
// No new stat, no failure state — just a "glitch grime" prop that
// occasionally appears in the living area as a visual nag. The
// existing Clean activity's ring button pulses while it's present;
// finishing any Clean run (the minigame you already have) sweeps it
// away, whether or not that particular clean was "for" the mess.
// Uses a persisted timestamp rather than an in-memory timer, so it
// isn't reset every time renderCare() re-runs (which is often) and
// survives navigating away or reloading.
function checkWasteSpawn() {
  if (G.careWaste) return;
  if (!G.wasteNextAt) { G.wasteNextAt = Date.now() + 45000 + Math.random()*60000; save(); return; }
  if (Date.now() >= G.wasteNextAt) {
    G.careWaste = true;
    G.wasteNextAt = null;
    save();
    refreshWasteIndicator();
  }
}
function spawnWasteProp() {
  const bg = $('care-bg');
  if (!bg || bg.querySelector('.care-waste')) return;
  const prop = el('div', 'care-waste', '🟢');
  let x, y;
  do { x = 10 + Math.random()*80; y = 12 + Math.random()*76; }
  while (Math.hypot(x-50, (y-46)*1.3) < 20);
  prop.style.left = x + '%';
  prop.style.top = y + '%';
  bg.appendChild(prop);
}
function refreshWasteIndicator() {
  const btn = document.querySelector('.care-ring-btn[data-act="clean"]');
  if (btn) btn.classList.toggle('needs-clean', !!G.careWaste);
  if (!G.careWaste) {
    const w = document.querySelector('.care-waste');
    if (w) w.remove();
  } else if (!document.querySelector('.care-waste')) {
    spawnWasteProp();
  }
}
function clearWaste() {
  if (!G.careWaste) return;
  G.careWaste = false;
  save();
  const w = document.querySelector('.care-waste');
  if (w) { w.classList.add('gone'); setTimeout(() => w.remove(), 260); }
  refreshWasteIndicator();
  checkWasteSpawn();
}

// Little burst of the activity icon as feedback
function careFx(icon) {
  const host = $('care-pet');
  if (!host) return;
  for (let i = 0; i < 6; i++) {
    const d = el('div','care-particle', icon);
    d.style.left = (30 + Math.random()*40) + '%';
    d.style.animationDelay = (i*0.07) + 's';
    host.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }
}

// ── CARE MINIGAMES ──
// Using a care activity no longer grants its reward on click — it
// opens a small interactive game over the pet instead. The loyalty
// gain, food deduction, and cooldown stamp only land once the game
// is actually finished (finishCareGame), via the exact same path the
// old instant-click used. Backing out early with ✕ costs nothing —
// nothing was spent yet, so there's nothing to lose by trying.
let CG = null; // active minigame state, or null when the overlay is closed

function openCareGame(act, pet) {
  const overlay = $('care-game'), stage = $('care-game-stage');
  if (!overlay || !stage) { finishCareGame(act, pet); return; } // safety net
  if (CG) closeCareGame();

  stage.innerHTML = '';
  CG = { act, pet, cleanup: [] };
  overlay.classList.add('open');
  document.body.classList.add('care-game-open');
  setText('care-game-title',
    act.kind === 'toy' ? `เล่นกับ ${pet.name}` : act.kind === 'food' ? `ป้อน ${pet.name}` : `อาบน้ำ ${pet.name}`);
  setCareGameProgress(0);
  setText('care-game-hint', '');

  const petWrap = el('div','cg-pet');
  petWrap.innerHTML = creatureMarkup(pet,'cg-pet-sprite float');
  stage.appendChild(petWrap);
  CG.petWrap = petWrap;

  if (act.id === 'clean')          startBathGame(stage, act, pet);
  else if (act.kind === 'food')    startFeedGame(stage, act, pet);
  else if (act.id === 'toy_ball')  startBallGame(stage, act, pet);
  else if (act.id === 'toy_laser') startLaserGame(stage, act, pet);
  else if (act.id === 'toy_puzzle')startPuzzleGame(stage, act, pet);
  else if (act.id === 'toy_arcade')startArcadeGame(stage, act, pet);
  else finishCareGame(act, pet); // unknown activity id — never trap the player
}

function setCareGameProgress(pct) {
  const bar = $('care-game-bar-fill');
  if (bar) bar.style.width = clamp(pct, 0, 100) + '%';
}

function closeCareGame() {
  if (CG) CG.cleanup.forEach(fn => { try { fn(); } catch (e) {} });
  CG = null;
  const overlay = $('care-game');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('care-game-open');
}

// Pet reacts with a little happy bounce — shared by every minigame.
function cgReact() {
  if (!CG || !CG.petWrap) return;
  CG.petWrap.classList.remove('chomp');
  void CG.petWrap.offsetWidth; // restart the animation
  CG.petWrap.classList.add('chomp');
}

function finishCareGame(act, pet) {
  if (act.kind === 'food') { G.foods = G.foods || {}; G.foods[act.id]--; }
  if (act.id === CARE_CLEAN.id) clearWaste();
  addLoyalty(pet, act.loyalty);
  markCare(pet.uid, act.id);
  save(); renderCare(); renderHUD();
  setCareGameProgress(100);
  setText('care-game-hint', `สำเร็จ! +${act.loyalty} ❤`);
  const stage = $('care-game-stage');
  if (stage) cgFx(stage, act.icon);
  setTimeout(() => {
    careFx(act.icon);
    closeCareGame();
    const petEl = $('care-pet');
    if (petEl) {
      petEl.classList.remove('happy'); void petEl.offsetWidth;
      petEl.classList.add('happy');
      setTimeout(() => petEl.classList.remove('happy'), 700);
    }
  }, 900);
}

function wireCareGame() {
  const close = $('care-game-close');
  if (close) close.onclick = () => closeCareGame();
}

// Little burst of the activity icon over the pet, mirrors careFx.
function cgFx(host, icon) {
  for (let i = 0; i < 6; i++) {
    const d = el('div','care-particle', icon);
    d.style.left = (30 + Math.random()*40) + '%';
    d.style.bottom = '46%';
    d.style.animationDelay = (i*0.07) + 's';
    host.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }
}

// ── 1) BATHING — brush the dirty spots clean ──
// Dirt spots are scattered around the pet. Holding the pointer down
// and dragging over a spot scrubs it (throttled per-spot so a single
// pass doesn't insta-clean it); once every spot is scrubbed away the
// bath is done. Tapping without dragging still works, just slower.
function startBathGame(stage, act, pet) {
  CG.petWrap.style.top = '44%';
  const N = 4 + Math.floor(Math.random()*3); // 4–6 spots
  const spots = [];
  for (let i = 0; i < N; i++) {
    const ang = (i/N)*Math.PI*2 + Math.random()*0.6;
    const cx = clamp(50 + Math.cos(ang)*(16+Math.random()*10), 12, 88);
    const cy = clamp(46 + Math.sin(ang)*(12+Math.random()*10), 18, 76);
    const d = el('div','dirt-spot','<span class="dirt-blob"></span>');
    d.style.left = cx + '%'; d.style.top = cy + '%';
    d.style.setProperty('--grime', 1);
    stage.appendChild(d);
    spots.push({ el:d, x:cx, y:cy, grime:100, lastHit:0 });
  }
  setText('care-game-hint', 'ลากนิ้วถูจุดสกปรกให้สะอาด');

  let down = false;
  const brushAt = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    const px = ((clientX - r.left)/r.width)*100;
    const py = ((clientY - r.top)/r.height)*100;
    const now = performance.now();
    let anyCleaned = false;
    spots.forEach(s => {
      if (s.grime <= 0) return;
      const dx = px - s.x, dy = (py - s.y)*1.4;
      if (Math.sqrt(dx*dx + dy*dy) > 8.5) return;
      if (now - s.lastHit < 55) return;
      s.lastHit = now;
      s.grime -= 12;
      d_setGrime(s);
      spawnScrubSpark(stage, px, py);
      if (s.grime <= 0) {
        s.el.classList.add('gone');
        setTimeout(() => s.el.remove(), 260);
        anyCleaned = true;
      }
    });
    if (anyCleaned) {
      const remaining = spots.filter(s => s.grime > 0).length;
      setCareGameProgress(Math.round(((N-remaining)/N)*100));
      if (remaining === 0) {
        setText('care-game-hint', 'สะอาดหมดจด! ✨');
        setTimeout(() => finishCareGame(act, pet), 500);
      }
    }
  };
  function d_setGrime(s) {
    s.el.style.setProperty('--grime', Math.max(0, s.grime)/100);
    s.el.classList.add('scrub');
    setTimeout(() => s.el.classList.remove('scrub'), 180);
  }
  const onDown = e => { down = true; brushAt(e.clientX, e.clientY); };
  const onMove = e => { if (down) brushAt(e.clientX, e.clientY); };
  const onUp = () => { down = false; };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  CG.cleanup.push(() => {
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  });
}
function spawnScrubSpark(stage, px, py) {
  const s = el('div','scrub-spark');
  s.style.left = px + '%'; s.style.top = py + '%';
  stage.appendChild(s);
  setTimeout(() => s.remove(), 340);
}

// ── 2) FEEDING — tap the food until it's gone ──
// Bite count scales gently with the food's tier so a Quantum Feast
// takes a bit more work (and feels more special) than Data Crumbs.
function startFeedGame(stage, act, pet) {
  const tierIdx = Math.max(0, FOODS.findIndex(f => f.id === act.id));
  const bites = 5 + tierIdx;
  let taken = 0;

  // Food lands off to one side; the pet walks over to stand beside
  // it (CSS transition on .cg-pet's left/top) before eating begins.
  const foodX = 28 + Math.random() * 44, foodY = 58;
  const food = el('div','cg-food', `<span class="cg-food-icon">${act.icon}</span>`);
  food.style.left = foodX + '%'; food.style.top = foodY + '%';
  stage.appendChild(food);
  setText('care-game-hint', `${pet.name} เดินไปหาอาหาร...`);

  const standX = clamp(foodX + (foodX > 50 ? -10 : 10), 12, 88);
  CG.petWrap.style.left = standX + '%';
  CG.petWrap.style.top = '48%';

  setTimeout(() => {
    setText('care-game-hint', `แตะอาหารให้ ${pet.name} กิน`);
    const onTap = e => {
      e.preventDefault();
      taken++;
      food.style.setProperty('--bite', Math.max(0, 1 - taken/bites));
      food.classList.remove('bite'); void food.offsetWidth; food.classList.add('bite');
      cgReact();
      spawnCrumbs(food);
      setCareGameProgress(Math.round((taken/bites)*100));
      if (taken >= bites) {
        food.removeEventListener('pointerdown', onTap);
        food.remove();
        setText('care-game-hint', 'อิ่มแล้ว! 😋');
        setTimeout(() => finishCareGame(act, pet), 450);
      }
    };
    food.addEventListener('pointerdown', onTap);
    CG.cleanup.push(() => food.removeEventListener('pointerdown', onTap));
  }, 700);
}
function spawnCrumbs(food) {
  for (let i = 0; i < 4; i++) {
    const c = el('div','crumb-bit');
    c.style.setProperty('--dx', (Math.random()*60-30) + 'px');
    c.style.setProperty('--dy', (20+Math.random()*30) + 'px');
    c.style.animationDelay = (i*0.03) + 's';
    food.appendChild(c);
    setTimeout(() => c.remove(), 500);
  }
}

// ── 3) TOY: PACKET BALL — catch what the pet throws back ──
function startBallGame(stage, act, pet) {
  CG.petWrap.style.top = '44%';
  const TARGET = 5;
  let caught = 0, phase = 'idle', timer = null;
  const ball = el('div','cg-ball','⚽');
  stage.appendChild(ball);
  setText('care-game-hint', `แตะลูกบอลตอนที่ ${pet.name} โยนมาให้!`);

  function throwBall() {
    phase = 'flying';
    ball.classList.remove('landed','caught');
    ball.style.transitionDuration = '.55s';
    ball.style.left = (20+Math.random()*60) + '%';
    ball.style.top  = (25+Math.random()*40) + '%';
    clearTimeout(timer);
    timer = setTimeout(() => {
      phase = 'catchable';
      ball.classList.add('landed');
      timer = setTimeout(returnBall, 1100);
    }, 560);
  }
  function returnBall() {
    phase = 'returning';
    ball.classList.remove('landed');
    ball.style.transitionDuration = '.45s';
    ball.style.left = '50%'; ball.style.top = '44%';
    clearTimeout(timer);
    timer = setTimeout(() => { phase = 'idle'; timer = setTimeout(throwBall, 420); }, 460);
  }
  function onCatch(e) {
    if (phase !== 'catchable') return;
    e.preventDefault();
    caught++;
    ball.classList.add('caught');
    cgReact();
    setCareGameProgress(Math.round((caught/TARGET)*100));
    if (caught >= TARGET) {
      clearTimeout(timer);
      ball.removeEventListener('pointerdown', onCatch);
      ball.remove();
      setText('care-game-hint', `${pet.name} พอใจมาก! 🎾`);
      setTimeout(() => finishCareGame(act, pet), 450);
      return;
    }
    returnBall();
  }
  ball.addEventListener('pointerdown', onCatch);
  CG.cleanup.push(() => { clearTimeout(timer); ball.removeEventListener('pointerdown', onCatch); });
  timer = setTimeout(throwBall, 500);
}

// ── 4) TOY: LASER POINTER — pounce on the dot before it jumps ──
function startLaserGame(stage, act, pet) {
  CG.petWrap.style.top = '44%';
  const TARGET = 8;
  let hits = 0, timer = null;
  const dot = el('div','cg-laser');
  stage.appendChild(dot);
  setText('care-game-hint', `แตะจุดเลเซอร์ให้ ${pet.name} ตะปบ!`);

  function jump() {
    dot.classList.remove('pounced');
    dot.style.left = (15+Math.random()*70) + '%';
    dot.style.top  = (20+Math.random()*55) + '%';
    clearTimeout(timer);
    timer = setTimeout(jump, 780);
  }
  function onHit(e) {
    e.preventDefault();
    hits++;
    dot.classList.add('pounced');
    cgReact();
    setCareGameProgress(Math.round((hits/TARGET)*100));
    if (hits >= TARGET) {
      clearTimeout(timer);
      dot.removeEventListener('pointerdown', onHit);
      dot.remove();
      setText('care-game-hint', `${pet.name} สนุกมาก! 🔦`);
      setTimeout(() => finishCareGame(act, pet), 450);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(jump, 260);
  }
  dot.addEventListener('pointerdown', onHit);
  CG.cleanup.push(() => { clearTimeout(timer); dot.removeEventListener('pointerdown', onHit); });
  jump();
}

// ── 5) TOY: LOGIC CUBE — Simon-says memory sequence ──
function startPuzzleGame(stage, act, pet) {
  CG.petWrap.style.top = '20%';
  const TARGET_LEN = 5;
  const FACES = ['a','b','c','d'];
  let sequence = [], inputIdx = 0, showing = true;

  const cube = el('div','cg-cube');
  cube.style.top = '62%';
  FACES.forEach(c => cube.appendChild(el('div', `cg-face cg-face-${c}`)));
  stage.appendChild(cube);
  setText('care-game-hint', 'ดูลำดับ แล้วแตะตาม');

  function flash(c) {
    const f = cube.querySelector('.cg-face-'+c);
    if (!f) return;
    f.classList.add('flash');
    setTimeout(() => f.classList.remove('flash'), 340);
  }
  function playSequence() {
    showing = true; inputIdx = 0;
    cube.classList.add('locked');
    let i = 0;
    const step = () => {
      if (i >= sequence.length) { showing = false; cube.classList.remove('locked'); return; }
      flash(sequence[i]); i++;
      setTimeout(step, 560);
    };
    setTimeout(step, 400);
  }
  function addStep() {
    sequence.push(FACES[Math.floor(Math.random()*4)]);
    playSequence();
  }
  function onTap(e) {
    if (showing) return;
    const f = e.target.closest('.cg-face');
    if (!f) return;
    const c = FACES.find(x => f.classList.contains('cg-face-'+x));
    flash(c);
    if (c === sequence[inputIdx]) {
      inputIdx++;
      if (inputIdx < sequence.length) return;
      cgReact();
      setCareGameProgress(Math.round((sequence.length/TARGET_LEN)*100));
      if (sequence.length >= TARGET_LEN) {
        cube.removeEventListener('pointerdown', onTap);
        cube.remove();
        setText('care-game-hint', `${pet.name} ไขได้แล้ว! 🧩`);
        setTimeout(() => finishCareGame(act, pet), 500);
        return;
      }
      setText('care-game-hint', 'เก่งมาก! ต่อไป...');
      setTimeout(addStep, 700);
    } else {
      setText('care-game-hint', 'พลาด! ลองใหม่');
      sequence = [];
      setCareGameProgress(0);
      setTimeout(addStep, 700);
    }
  }
  cube.addEventListener('pointerdown', onTap);
  CG.cleanup.push(() => cube.removeEventListener('pointerdown', onTap));
  addStep();
}

// ── 6) TOY: MINI ARCADE — whack the bugs before they vanish ──
function startArcadeGame(stage, act, pet) {
  CG.petWrap.style.top = '20%';
  const TARGET = 8;
  let hits = 0, popTimer = null, active = null;
  const grid = el('div','cg-arcade');
  grid.style.top = '64%';
  const cells = [];
  for (let i = 0; i < 9; i++) { const c = el('div','cg-cell'); grid.appendChild(c); cells.push(c); }
  stage.appendChild(grid);
  setText('care-game-hint', 'แตะบั๊กที่โผล่มาให้ทัน!');

  function pop() {
    if (active) { active.classList.remove('up'); active.innerHTML=''; active.onpointerdown = null; }
    active = cells[Math.floor(Math.random()*cells.length)];
    active.classList.add('up');
    active.innerHTML = '👾';
    active.onpointerdown = e => {
      e.preventDefault();
      clearTimeout(popTimer);
      hits++;
      active.classList.add('hit');
      cgReact();
      setCareGameProgress(Math.round((hits/TARGET)*100));
      if (hits >= TARGET) {
        clearTimeout(popTimer);
        cells.forEach(c => { c.onpointerdown = null; });
        grid.remove();
        setText('care-game-hint', `กำจัดบั๊กหมด! ${pet.name} สนุกมาก 🕹️`);
        setTimeout(() => finishCareGame(act, pet), 500);
        return;
      }
      active.classList.remove('up'); active.innerHTML = ''; active.onpointerdown = null;
      popTimer = setTimeout(pop, 260);
    };
    popTimer = setTimeout(() => {
      if (active) { active.classList.remove('up'); active.innerHTML=''; active.onpointerdown = null; }
      pop();
    }, 700);
  }
  CG.cleanup.push(() => { clearTimeout(popTimer); cells.forEach(c => { c.onpointerdown = null; }); });
  popTimer = setTimeout(pop, 400);
}

// ── SAFE SPOT ──
function renderSafeSpot() {
  const z = zoneById(G.lastSafe) || ZONES.find(x => x.kind === 'safe');
  if (!z) return;
  setText('safe-name', z.name);
  setText('safe-thai', z.thai);
  setText('npc-greet', `สวัสดี ${G.name || 'นักผจญภัย'} ให้ข้าช่วยอะไรได้บ้าง?`);

  const hurt = G.roster.filter(p => p.hp < statsOf(p).mhp).length;
  const restBtn = $('npc-opt-rest');
  if (restBtn) {
    restBtn.textContent = hurt ? `พักฟื้น (${hurt} ตัวบาดเจ็บ)` : 'ทุกตัวสมบูรณ์แล้ว';
    restBtn.disabled = !hurt;
    restBtn.onclick = () => {
      G.roster.forEach(p => p.hp = statsOf(p).mhp);
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

  // Potion shop
  const shop = $('safe-potions');
  if (!shop) return;
  shop.innerHTML = '';
  POTIONS.forEach(pt => {
    const owned = (G.potions && G.potions[pt.id]) || 0;
    const card = el('div','shop-card');
    card.innerHTML = `
      <div class="sc-icon">${pt.icon}</div>
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
function startRaidFight(rival, sendPet, loot, mult) {
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

  battle = {
    mode: 'raid',
    raid: { rival, loot, mult },
    team: [sendPet],
    enemies: [foe],
    wave: 0, run: { waveCount: 1, waves: [[foe]] },
    turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  };
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
function ensureBossSpawned(mapId) {
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
function onBossDefeated(enemy) {
  const mapId = enemy.mapId;
  if (!mapId) return;
  const st = G.bossState[mapId];
  if (st) st.alive = false;
  rollBossSpawn(mapId);
  save();
}

function startBossFight(mapId) {
  const st = G.bossState[mapId];
  if (!st || !st.alive) { toast('บอสไม่อยู่ตรงนี้แล้ว'); return; }
  const team = activeTeam();
  if (!team.length) { toast('ยังไม่ได้จัดทีม'); return; }
  if (!teamAlive(team)) { toast('ทีมหมด HP — ไปรักษาที่ Clinic'); return; }
  const boss = spawnBoss(mapId, st.level);
  if (!boss) { toast('เกิดข้อผิดพลาด'); return; }
  battle = {
    mode: 'boss',
    target: { name: boss.name },
    team, enemies: [boss],
    wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  };
  battle.team.forEach(p => {
    p.mp = statsOf(p).int;
    p.spdCounter = 0;
    p.ailments = [];
    p._shield = 0;
    p._cooldowns = {};
  });
  showScreen('battle');
  setText('battle-title', `${boss.name} · BOSS`);
  setText('battle-wave', 'บอสประจำภูมิภาค');
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

function startZone(target) {
  const team = activeTeam();
  if (!team.length) { toast('ยังไม่ได้จัดทีม'); return; }
  if (!teamAlive(team)) { toast('ทีมหมด HP — ไปรักษาที่ Clinic'); return; }

  const run = buildHackRun(target);
  battle = {
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
  };
  // Fresh MP, cleared ailments and speed counters at the start of a run
  battle.team.forEach(p => {
    p.mp = statsOf(p).int;
    p.spdCounter = 0;
    p.ailments = [];
    p._shield = 0;
    p._cooldowns = {};
  });
  showScreen('battle');
  setText('battle-title', target.name);
  setText('battle-wave', `คลื่น 1 / ${run.waveCount}`);
  clearBattleLog();
  blog(`เริ่มเจาะ ${target.name}`, 'sys');
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

function startArena() {
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
  battle = {
    mode: 'arena',
    team, enemies,
    wave: 0, turn: 0, activeIdx: 0, phase: 'ally', round: 0, over: false,
    totalExp: 0, totalBitz: 0,
  };
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
function playArenaEntrance() {
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
async function playFoeEntrance(unitEl) {
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
async function playFoeDeathTransition(deadPet, nextPet) {
  const wrap = $('battle-enemies');
  if (!wrap) return;
  const deadEl = wrap.querySelector('.bunit');
  if (deadEl) await explodeUnit(deadEl);
  if (!nextPet) return;
  renderBattleSide(nextPet, 'battle-enemies', true);
  const newEl = wrap.querySelector('.bunit');
  if (newEl) await playFoeEntrance(newEl);
}

// ═══════════════ EQUIPMENT: battle procs ═══════════════
// Returns { item, affix } for the equipped item (if any) whose attr
// affinity matches this pet's OWN attribute, or null. A green (speed)
// item is a speed-themed named item — it only procs on a green pet.
function payloadEffectOf(pet) {
  const item = pet && pet.equip && pet.equip.payload;
  if (!item || !item.effectId) return null;
  const eff = PAYLOAD_EFFECTS[item.effectId];
  if (!eff) return null;
  const gi = EQUIP_GRADE_KEYS.indexOf(item.grade);
  return { item, eff, mag: (eff.mag || [])[gi] || 0 };
}

// Just resets the first-strike flag for every fighter at battle
// start — Overclock/Adaptive Strike are consumed on that fighter's
// first attack, see firstStrikeProc() below. (Data Leech/Kill Reboot/
// Toxin Injector are per-hit, handled in applyPayloadOnHit() instead.)
function applyBattleStartEquip(team) {
  (team || []).forEach(pet => { if (pet) pet._firstStrikeUsed = false; });
}

// Overclock (guaranteed crit) / Adaptive Strike (guaranteed double
// hit) — consumed on the fighter's first ACTUAL attack roll of the
// battle (basic or special), not on non-damaging specials. Works for
// any pet regardless of attribute — only the Payload slot matters.
function firstStrikeProc(attacker) {
  if (!attacker || attacker._firstStrikeUsed) return null;
  const info = payloadEffectOf(attacker);
  if (!info) return null;
  if (info.item.effectId === 'overclock') {
    attacker._firstStrikeUsed = true;
    blog(`⚔️ ${attacker.name} — ${info.eff.name}!`, 'buff');
    return { forceCrit: true };
  }
  if (info.item.effectId === 'adaptive') {
    attacker._firstStrikeUsed = true;
    blog(`🌪️ ${attacker.name} — ${info.eff.name}!`, 'buff');
    return { forceHits: 2 };
  }
  return null;
}

// Data Leech (lifesteal) / Kill Reboot (MP on kill) / Toxin Injector
// (poison chance) — all per-hit, checked after damage lands. `target`
// is expected to already have res.dmg subtracted from its hp.
function applyPayloadOnHit(attacker, target, res, side) {
  if (!res || res.evaded || !res.dmg) return;
  const info = payloadEffectOf(attacker);
  if (!info || info.mag <= 0) return;
  if (info.item.effectId === 'leech') {
    const heal = Math.max(1, Math.floor(res.dmg * info.mag));
    const mx = statsOf(attacker).vit;
    attacker.hp = Math.min(mx, attacker.hp + heal);
    healPop(attacker, heal);
    blog(`🩸 ${attacker.name} — ${info.eff.name}: +${heal} HP`, 'buff');
  } else if (info.item.effectId === 'manaregen' && target.hp <= 0) {
    const before = attacker.mp || 0;
    restoreMP(attacker, Math.floor(maxMP(attacker) * info.mag));
    if (attacker.mp > before) blog(`🔌 ${attacker.name} — ${info.eff.name}: +${attacker.mp - before} MP`, 'buff');
  } else if (info.item.effectId === 'toxin' && target.hp > 0 && Math.random() < info.mag) {
    addAilment(target, { ...AILMENTS.poison, turns: 2 });
    blog(`☠️ ${target.name} ติดพิษจาก ${attacker.name}!`, side);
  }
}

// ═══════════════ EQUIPMENT: drops, sell, dust, craft ═══════════════
// Rolled once per newly-credited enemy kill (see checkBattleEnd).
// Capped at the dropping enemy's own level, per spec.
function rollEquipDrop(enemy) {
  if (!enemy || Math.random() >= EQUIP_DROP_CHANCE) return;
  // Bosses roll one grade tier above what their level alone would
  // give — reuses the Deep Craft weighting as a stand-in "better loot"
  // table rather than inventing a new one.
  const item = enemy.isBoss
    ? craftEquipment('deep', Math.max(1, enemy.level || 1))
    : rollEquipment(Math.max(1, enemy.level || 1));
  G.equipBag = G.equipBag || [];
  G.equipBag.push(item);
  const slot = EQUIP_SLOTS[item.slotId];
  toast(`🎁 ${item.name} (Lv.${item.lvlReq})`);
  blog(`${slot.icon} ดรอปอุปกรณ์: ${item.name}`, 'win');
}

// Evolution materials — Code Parts drop from any Lv1-50 kill (5%→50%,
// scaled by the enemy's level), Malware Cores ONLY from a region boss
// (25% flat, on top of everything else it drops). See MATERIALS/
// codePartDropChance()/BOSS_TUNING in data.js.
function addMaterial(matId, n = 1) {
  G.materials = G.materials || {};
  G.materials[matId] = (G.materials[matId] || 0) + n;
}
function rollMaterialDrop(enemy) {
  if (!enemy) return;
  if (Math.random() < codePartDropChance(Math.max(1, enemy.level || 1))) {
    const matId = CODE_PART_IDS[Math.floor(Math.random() * CODE_PART_IDS.length)];
    addMaterial(matId);
    const m = MATERIALS[matId];
    toast(`${m.icon} ${m.name}`);
    blog(`${m.icon} ดรอป: ${m.name}`, 'win');
  }
  if (enemy.isBoss && Math.random() < BOSS_TUNING.malwareCoreChance) {
    addMaterial('malware_core');
    const m = MATERIALS.malware_core;
    toast(`${m.icon} ${m.name}!`);
    blog(`${m.icon} บอสดรอป: ${m.name}!`, 'win');
  }
}

// Meat is the one cooking ingredient that can't be bought — hunting
// is the only source, same drop-per-kill shape as equipment above.
function rollMeatDrop(enemy) {
  if (!enemy || Math.random() >= MEAT_DROP_CHANCE) return;
  G.ingredients = G.ingredients || { veg:0, bun:0, meat:0 };
  G.ingredients.meat = (G.ingredients.meat || 0) + 1;
  toast(`${MEAT_ITEM.icon} ได้ ${MEAT_ITEM.name}`);
  blog(`${MEAT_ITEM.icon} ดรอปวัตถุดิบ: ${MEAT_ITEM.name}`, 'win');
}

function equipGradeMeta(item) { return EQUIP_GRADES[item.grade] || EQUIP_GRADES.script; }

// Equip `item` (from G.equipBag) onto `pet`'s slot. Whatever was
// there before goes back into the bag — nothing is ever destroyed by
// swapping.
function equipItem(pet, item) {
  if (!pet || !item) return;
  pet.equip = pet.equip || { payload:null, exploit:null, rootkit:null };
  const prev = pet.equip[item.slotId];
  G.equipBag = (G.equipBag || []).filter(x => x.uid !== item.uid);
  if (prev) G.equipBag.push(prev);
  pet.equip[item.slotId] = item;
  save();
}
function unequipItem(pet, slotId) {
  if (!pet || !pet.equip) return;
  const item = pet.equip[slotId];
  if (!item) return;
  pet.equip[slotId] = null;
  G.equipBag = G.equipBag || [];
  G.equipBag.push(item);
  save();
}
function sellEquip(item) {
  G.equipBag = (G.equipBag || []).filter(x => x.uid !== item.uid);
  G.bitz += sellValueOf(item);
  save();
  toast(`💰 ขาย ${item.name} +${sellValueOf(item)} Bitz`);
}
function dustEquip(item) {
  G.equipBag = (G.equipBag || []).filter(x => x.uid !== item.uid);
  G.dust = (G.dust || 0) + dustValueOf(item);
  save();
  toast(`🧬 สลาย ${item.name} +${dustValueOf(item)} Dust`);
}

// ═══════════════ LOG / TOAST / MODAL ═══════════════
function log(msg, cls = 'info') {
  const box = $('log-box');
  if (box) {
    const line = el('div', 'log-line ' + cls, msg);
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 60) box.removeChild(box.firstChild);
  }
  feed(msg, cls);
}
function blog(msg, cls = 'info') {
  const box = $('battle-log');
  if (!box) return;
  const line = el('div', 'blog-line ' + cls, msg);
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 80) box.removeChild(box.firstChild);
}
function clearBattleLog() { const b = $('battle-log'); if (b) b.innerHTML = ''; }

// ── PROCESS ACTIVITY FEED ──
function feed(msg, cls = 'info') {
  G.feed = G.feed || [];
  G.feed.unshift({ t: Date.now(), msg, cls });
  if (G.feed.length > 40) G.feed.length = 40;
  renderFeed();
}
function feedTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderFeed() {
  const box = $('process-feed');
  if (!box) return;
  const items = G.feed || [];
  if (!items.length) { box.innerHTML = `<div class="pf-empty">ยังไม่มีความเคลื่อนไหว</div>`; return; }
  box.innerHTML = items.map(it =>
    `<div class="pf-line ${it.cls}"><span class="pf-time">${feedTime(it.t)}</span><span class="pf-msg">${it.msg}</span></div>`).join('');
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

function modal(title, buildFn) {
  const back = $('modal-back');
  const body = $('modal-body');
  if (!back || !body) return;
  setText('modal-title', title);
  body.innerHTML = '';
  buildFn(body);
  back.classList.add('on');
  $('modal-close').onclick = closeModal;
}
function closeModal() {
  const back = $('modal-back');
  if (back) back.classList.remove('on');
}

// ═══════════════ BATTLE TURN LOOP ═══════════════
function activeAlly() {
  if (!battle) return null;
  const p = battle.team[battle.activeIdx];
  return p && p.hp > 0 ? p : null;
}
function activeFoe() {
  if (!battle) return null;
  return battle.enemies.find(e => e.hp > 0) || null;
}

function startRegen() {
  clearInterval(regenTimer);
  regenTimer = setInterval(() => {
    if (!battle || battle.over) { clearInterval(regenTimer); return; }
  }, 1000);
}

function scheduleTurn(delayMs) {
  clearTimeout(battleTimer);
  if (!battle || battle.over) return;
  const ms = delayMs != null ? delayMs : TUNING.turnBaseMs / battleSpeed;
  battleTimer = setTimeout(runTurn, ms);
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
function markSpecialUsed(unit, sp) {
  unit._cooldowns = unit._cooldowns || {};
  unit._cooldowns[sp.id] = Date.now() + (sp.cd || 3.5) * 1000;
}

async function runTurn() {
  if (!battle || battle.over) return;
  if (!battle._openingBuffsDone) {
    battle._openingBuffsDone = true;
    await runOpeningBuffs();
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

  if (hasAilment(goesFirst, 'freeze')) {
    blog(`❄️ ${goesFirst.name} ถูกแช่แข็ง ขยับไม่ได้`, side);
    await endOfTurnTicks(goesFirst);
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

  // Only specials that are auto-cast ON, affordable, AND off cooldown
  // are eligible. Without the cooldown check a pet would burn every
  // point of MP on specials back-to-back instead of ever throwing a
  // normal attack, since specials were picked with flat 55% odds every
  // single turn regardless of how recently one was used.
  const specials = unlockedSpecials(attacker)
    .filter(sp => attacker.autoCast?.[sp.id] && canCast(attacker, sp) && specialReady(attacker, sp));
  const sig = signatureSkillOf(attacker);
  const sigReady = sig && specialReady(attacker, sig);
  let usedSpecial = null;

  if (specials.length && Math.random() < 0.55) {
    usedSpecial = specials[Math.floor(Math.random() * specials.length)];
    markSpecialUsed(attacker, usedSpecial);
    await castSpecial(attacker, target, usedSpecial, side, atkTeam, defTeam);
  } else if (sigReady && Math.random() < 0.3) {
    markSpecialUsed(attacker, sig);
    await castSpecial(attacker, target, sig, side, atkTeam, defTeam);
  } else {
    await basicAttack(attacker, target, side, atkTeam, defTeam);
  }

  await endOfTurnTicks(attacker);
  await endOfTurnTicks(target);

  if (await checkBattleEnd()) return;
  scheduleTurn();
}

// ── OPENING TEAM BUFFS (bench healers) ──
// A team-wide buff (buffTeam — Data Bless / Sanctuary) only ever fired
// on ITS caster's own turn, so a healer sitting on the bench never
// got to use it — the buff a support pet is meant to open a fight
// with was stuck waiting for a swap-in that might not happen for
// several turns. Now: once, before the very first attack of a fight,
// every BENCH pet (the active fighter's own turn already covers
// itself via the normal autoCast path below) with a buffTeam special
// toggled to auto-cast fires it if it's affordable — no VFX on an
// off-field caster, just a small portrait pop over the active ally
// and a log line, then the buff (and any healTeam) applies exactly
// like it would mid-fight.
async function runOpeningBuffs() {
  if (!battle || !battle.team) return;
  const activePet = activeAlly();
  const bench = battle.team.filter(p => p !== activePet && p.hp > 0);
  for (const caster of bench) {
    const sp = unlockedSpecials(caster).find(s =>
      s.buffTeam && caster.autoCast?.[s.id] && canCast(caster, s) && specialReady(caster, s));
    if (!sp) continue;
    spendMP(caster, sp);
    markSpecialUsed(caster, sp);
    battle.team.forEach(p => { if (p.hp > 0) addAilment(p, { id: 'frenzy', ...sp.buffTeam }); });
    if (sp.healTeam) {
      battle.team.forEach(p => {
        if (p.hp <= 0) return;
        const mx = statsOf(p).vit;
        p.hp = Math.min(mx, p.hp + Math.floor(mx * sp.healTeam));
      });
    }
    blog(`✨ ${caster.name} ใช้ ${sp.name} ก่อนเริ่มต่อสู้ · เสริมพลังทั้งทีม`, 'buff');
    supportCasterPop(caster);
    refreshBattleUnits();
    await wait(2000 / battleSpeed);
  }
}

// Small portrait box over the active ally's head — the only visual
// tell an off-field pet gets when it opens a fight with a buff, since
// it has no on-stage unit of its own to animate.
function supportCasterPop(caster) {
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
    <div class="support-cast-name">${caster.name}</div>`;
  layer.appendChild(d);
  setTimeout(() => d.remove(), 2000 / battleSpeed);
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
async function applyDamage(target, dmg, blogSide) {
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
  const res = computeDamage(attacker, atkTeam, target, defTeam, skill, false, firstStrikeProc(attacker));

  if (res.evaded) {
    await playAttack(attacker, target, res, side);
    blog(`${target.name} หลบ ${attacker.name} ได้!`, side);
    return;
  }

  // Crit on a NORMAL attack: NO white-out self VFX anymore. Instead the
  // attacker itself swells to 2x, tilts, and charges (handled inside
  // playAttack via the crit-attack class), with the big impact burst
  // landing on the enemy at the same beat.
  await playAttack(attacker, target, res, side);
  playSpellVFX('impact', attacker, target, side);   // gold hit-flash, every landed normal hit

  await applyDamage(target, res.dmg, side);
  refreshBattleUnits();
  applyPayloadOnHit(attacker, target, res, side);
  let line = `${attacker.name} → ${skill.n}`;
  if (res.hits > 1) line += ` ×${res.hits}`;
  if (res.crit) line += ' CRIT';
  line += ` · -${res.dmg}`;
  blog(line, side);
}

// Casts a special: self-effect plays FIRST (per spec — self-buffs,
// shields, heals, and the visual "wind-up" for an attack skill all
// read on the caster), then after a short delay the enemy-facing
// effect and damage/ailment resolve. This matches "apply self effect
// first then for a small delay apply attack skill to enemy."
async function castSpecial(caster, target, sp, side, atkTeam, defTeam) {
  spendMP(caster, sp);
  await showBanner(`✦ ${sp.name} ✦`, 'sig');

  // ── SELF-SIDE FIRST ──
  const selfVfxMs = playSpellVFX(sp.vfx, caster, target, side);
  if (sp.heal) {
    const mx = statsOf(caster).vit;
    const amt = Math.floor(mx * sp.heal);
    caster.hp = Math.min(mx, caster.hp + amt);
    healPop(caster, amt);
    blog(`💚 ${caster.name} ใช้ ${sp.name} · +${amt} HP`, 'buff');
  }
  if (sp.healTeam) {
    atkTeam.forEach(p => {
      if (p.hp <= 0) return;
      const mx = statsOf(p).vit;
      const amt = Math.floor(mx * sp.healTeam);
      p.hp = Math.min(mx, p.hp + amt);
    });
    blog(`💚 ${caster.name} ใช้ ${sp.name} · ฟื้นทั้งทีม`, 'buff');
  }
  if (sp.reviveTeam) {
    let n = 0;
    atkTeam.forEach(p => {
      if (p.hp > 0) return;
      p.hp = Math.floor(statsOf(p).vit * sp.reviveTeam); n++;
    });
    blog(`✨ ${caster.name} กู้ระบบ · ชุบชีวิต ${n} ตัว`, 'buff');
  }
  if (sp.cleanse) { clearAilments(caster); blog(`🧼 ${caster.name} ล้างสถานะ`, 'buff'); }
  if (sp.shieldSelf) {
    caster._shield = sp.shieldSelf;
    caster._shieldTurns = 3;
    blog(`🛡 ${caster.name} ตั้งเกราะ ${Math.round(sp.shieldSelf * 100)}%`, 'buff');
  }
  if (sp.buffSelf) {
    addAilment(caster, { ...sp.buffSelf });
    blog(`🔥 ${caster.name} เข้าสู่สภาวะ ${sp.buffSelf.id}`, 'buff');
  }
  if (sp.buffTeam) {
    atkTeam.forEach(p => { if (p.hp > 0) addAilment(p, { id: 'frenzy', ...sp.buffTeam }); });
    blog(`✨ ${caster.name} เสริมพลังทั้งทีม`, 'buff');
  }
  refreshBattleUnits();

  // ── WAIT FOR SELF ANIMATION TO FULLY FINISH, THEN A REAL PAUSE ──
  // Previously this only waited a capped fraction of the self-effect's
  // duration (max ~200ms), so the enemy-side hit was firing while the
  // self animation was still playing. Now: wait out the self clip's
  // real duration in full, THEN a full extra second before the
  // enemy-facing effect/damage — exactly the beat the user asked for.
  const hasEnemyEffect = (sp.pw > 0 && sp.hits > 0) || sp.ailment;
  if (hasEnemyEffect) {
    await wait((selfVfxMs || 0) / battleSpeed);
    await wait(1000 / battleSpeed);
  }

  if (sp.pw > 0 && sp.hits > 0) {
    const res = computeDamage(caster, atkTeam, target, defTeam, sp, true, firstStrikeProc(caster));
    if (res.evaded) {
      await showBanner('MISS!', 'miss');
      blog(`${target.name} หลบ ${sp.name} ได้!`, side);
    } else {
      if (res.crit) {
        // No white-out VFX — the crit swell+charge on the attacker (via
        // playAttack's crit-attack class) is the crit tell now.
        await showBanner('CRITICAL!!', 'crit');
      }
      await playAttack(caster, target, res, side);
      await applyDamage(target, res.dmg, side);
      applyPayloadOnHit(caster, target, res, side);
      let line = `✦ ${caster.name} → ${sp.name}`;
      if (res.hits > 1) line += ` ×${res.hits}`;
      if (res.crit) line += ' CRIT';
      line += ` · -${res.dmg}`;
      blog(line, side);
    }
  }
  if (sp.ailment && target.hp > 0) {
    addAilment(target, { ...sp.ailment });
    const A = AILMENTS[sp.ailment.id];
    if (A) blog(`${A.icon} ${target.name} ติด${A.thai}`, side);
  }
  refreshBattleUnits();
}

// Poison tick, shield countdown, frenzy/charm/freeze duration — run at
// the end of a unit's turn for BOTH participants.
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

async function checkBattleEnd() {
  if (!battle) return true;
  const alliesAlive = battle.team.some(p => p.hp > 0);
  const enemiesAlive = battle.enemies.some(e => e.hp > 0);

  // Credit exp for any enemy that just died THIS check, priced against
  // whichever ally fighter is currently active (the one that would have
  // landed the blow). Each enemy is credited once via _expCredited.
  const fighter = activeAlly();
  if (fighter) {
    battle.enemies.forEach(e => {
      if (e.hp <= 0 && !e._expCredited) {
        e._expCredited = true;
        const gained = expForKill(e, fighter);
        battle.totalExp = (battle.totalExp || 0) + gained;
        battle.expGapBlocked = battle.expGapBlocked || (gained === 0 && fighter.level - e.level > EXP_GAP_MAX);
        const wave = (battle.run && battle.run.waves[battle.wave]) || battle.enemies;
        const waveBitz = Math.round(6 * Math.max(1, e.level) * (e.isBoss ? BOSS_TUNING.moneyMult : 1));
        battle.totalBitz = (battle.totalBitz || 0) + waveBitz;
        rollEquipDrop(e);
        rollMeatDrop(e);
        rollMaterialDrop(e);
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

function endBattle(win) {
  if (!battle) return;
  battle.over = true;
  clearTimeout(battleTimer);
  clearInterval(regenTimer);
  cameraReset(300);
  setTimeScale(1);

  if (battle.mode === 'raid') {
    const { rival, loot } = battle.raid;
    battle.team.forEach(p => { if (p.hp <= 0) p.hp = Math.max(1, Math.floor(statsOf(p).mhp * 0.1)); });
    const done = $('battle-done');
    if (done) {
      done.style.display = '';
      done.onclick = () => {
        done.style.display = 'none';
        battle = null;
        finishRaid(win, win ? loot : null);
      };
    }
    save();
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
    battle.team.forEach(p => {
      if (p.hp <= 0) p.hp = Math.max(1, Math.floor(statsOf(p).mhp * (TUNING.loseHpRestore || 0.1)));
    });
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
      done.onclick = () => { done.style.display = 'none'; battle = null; showScreen(returnTo); renderAll(); };
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
    battle = null;
    showScreen(returnTo);
    renderAll();
  };
}

function fleeBattle() {
  if (!battle || battle.over) return;
  battle.over = true;
  clearTimeout(battleTimer);
  clearInterval(regenTimer);
  cameraReset(300); setTimeScale(1);
  blog('ถอนตัวออกจากระบบ', 'sys');
  save();
  battle = null;
  showScreen('map');
  renderAll();
}

// ── DAMAGE/IMPACT PRESENTATION ──
function showBanner(text, cls = '') {
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

function floatDamage(anchorEl, res) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !anchorEl) return;
  const host = stage.getBoundingClientRect();
  const r = anchorEl.getBoundingClientRect();
  const wrap = el('div', 'dmg-big' + (res.crit ? ' crit' : ''));
  wrap.style.left = (r.left - host.left + r.width / 2) + 'px';
  wrap.style.top = (r.top - host.top + r.height * 0.2) + 'px';
  wrap.style.setProperty('--tilt', (Math.random() * 14 - 7).toFixed(1) + 'deg');
  wrap.innerHTML = `<span class="dmg-num">${res.dmg}${res.crit ? '!!' : ''}</span>${res.hits > 1 ? `<span class="dmg-mult">× ${res.hits}</span>` : ''}`;
  layer.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1050);
}

function healPop(pet, amount) {
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

function poisonPop(pet, amount) {
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

async function playAttack(attacker, target, res, side) {
  const aEl = document.querySelector(`.bunit[data-uid="${attacker.uid}"]`);
  const tEl = document.querySelector(`.bunit[data-uid="${target.uid}"]`);
  if (!aEl || !tEl) return;
  // Slowed down significantly — the previous defaults (220/320/260ms)
  // combined with a 120/130ms JS wait made the whole swing nearly
  // imperceptible. The CSS keyframes read duration from --wind-ms/
  // --lunge-ms/--return-ms custom properties, which were never being
  // set from JS, so they silently used their short defaults regardless
  // of any wait() change here — fixed by setting them explicitly so
  // the animation and the JS timing agree.
  const windMs = 260, lungeMs = 320, returnMs = 300;
  aEl.style.setProperty('--wind-ms', (windMs / battleSpeed) + 'ms');
  aEl.style.setProperty('--lunge-ms', (lungeMs / battleSpeed) + 'ms');
  aEl.style.setProperty('--return-ms', (returnMs / battleSpeed) + 'ms');
  // Direction the charge should travel: ally lunges right (+1), foe
  // lunges left (-1). Crit adds the swell+tilt+charge class.
  aEl.style.setProperty('--dir', side === 'ally' ? 1 : -1);
  if (res.crit) aEl.classList.add('crit-attack');

  aEl.classList.add('wind-up');
  await wait(windMs / battleSpeed);
  aEl.classList.remove('wind-up');
  aEl.classList.add('lunge-out');
  await wait(lungeMs / battleSpeed);
  aEl.classList.remove('lunge-out');
  aEl.classList.add('lunge-back');
  impactBurst(tEl, res.crit);
  if (!res.evaded) floatDamage(tEl, res);
  tEl.classList.add('hit');
  await wait(480 / battleSpeed);
  tEl.classList.remove('hit');
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

function refreshBattleUnits() {
  if (!battle) return;
  ['ally', 'foe'].forEach(which => {
    const pet = which === 'ally' ? activeAlly() : activeFoe();
    const plate = $(`plate-${which === 'ally' ? 'ally' : 'foe'}`);
    if (!pet || !plate) return;
    const hpMax = pet.isBoss ? (pet.bossPhase === 2 ? pet.hpPhase2Max : statsOf(pet).mhp) : statsOf(pet).mhp;
    const hpPct = Math.max(0, Math.min(100, Math.round(pet.hp / Math.max(1, hpMax) * 100)));
    updateVital(plate.querySelector('.np-hp .vital'), hpPct, Math.max(0, pet.hp));
    if (which === 'ally') {
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
  });
  renderBench();
}

function renderBench() {
  const bench = $('battle-bench');
  if (!bench || !battle) return;
  bench.innerHTML = '';
  battle.team.forEach((p, i) => {
    const chip = el('div', 'bench-chip' + (i === battle.activeIdx ? ' active' : '') + (p.hp <= 0 ? ' down' : ''));
    chip.innerHTML = creatureMarkup(p, 'bench-sprite');
    bench.appendChild(chip);
  });
}

let hackState = null;

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

async function renderRaidList() {
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

function finishRaid(win, loot) {
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

function renderBattleSide(pet, elId, isEnemy) {
  const wrap = $(elId);
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!pet) return;
  const unit = el('div','bunit');
  unit.dataset.uid = pet.uid;
  unit.dataset.side = isEnemy ? 'foe' : 'ally';
  unit.style.setProperty('--float-delay', (Math.random() * 1.6).toFixed(2) + 's');
  if (pet.hp <= 0) unit.classList.add('dead');
  const badges = (pet.ailments || []).map(a => {
    const A = AILMENTS[a.id];
    return A ? `<span class="ail-badge" title="${A.thai} (${a.turns})">${A.icon}</span>` : '';
  }).join('');
  // FACING: sprites are authored facing either way. The player's side
  // must look right, the enemy side must look left. `faces` says how the
  // art was drawn, so we only flip when it disagrees with the side.
  const drawnFaces = pet.faces || (pet.gif ? 'right' : 'right');
  const wantFaces  = isEnemy ? 'left' : 'right';
  const needFlip   = drawnFaces !== wantFaces;

  // SIZE: scale by the creature's expected physical size.
  const sc = pet.scale || 1;

  unit.style.setProperty('--cr-scale', sc);
  const rageMarks = (pet.isBoss && pet.bossPhase === 2)
    ? `<div class="rage-marks"><span>💢</span><span>😡</span><span>💢</span></div>` : '';
  unit.innerHTML = `
    ${badges ? `<div class="ail-badges">${badges}</div>` : ''}
    ${rageMarks}
    <div class="bu-sprite-wrap${pet.isBoss ? ' is-boss' : ''}">
      ${creatureMarkup(pet, 'bu-sprite float' + (needFlip ? ' flip' : ''))}
    </div>`;
  wrap.appendChild(unit);

  // Name plate lives outside the sprite so it never moves with a lunge
  const plate = $(isEnemy ? 'plate-foe' : 'plate-ally');
  if (plate) {
    const mpMax = statsOf(pet).int;
    const mpPct = Math.round((pet.mp || 0) / Math.max(1, mpMax) * 100);
    const spdPct = Math.round(Math.min(1, pet.spdCounter || 0) * 100);
    // Kept deliberately compact (one bar, no separate phase-pip row) —
    // the boss's enlarged sprite sits right below this plate, and a
    // taller plate was overlapping it.
    const hpMax = pet.isBoss ? (pet.bossPhase === 2 ? pet.hpPhase2Max : statsOf(pet).mhp) : statsOf(pet).mhp;
    const hpPct = Math.max(0, Math.min(100, Math.round(pet.hp / Math.max(1, hpMax) * 100)));
    let bossBar = '';
    if (pet.isBoss) {
      bossBar = `<div class="boss-hpbar phase${pet.bossPhase}"><i style="width:${hpPct}%"></i></div>`;
    }
    plate.innerHTML = `
      ${pet.isBoss ? `<div class="np-boss-tag">⚠ BOSS${pet.bossPhase===2?' · RAGE':''}</div>` : ''}
      <div class="np-name">${pet.name}</div>
      <div class="np-lv">Lv.${pet.level}</div>
      <div class="np-hp">${vitalHtml('heart', hpPct, Math.max(0, pet.hp))}</div>
      ${bossBar}
      ${!isEnemy ? `<div class="np-mp">${vitalHtml('circle', mpPct, Math.max(0, pet.mp || 0))}</div>` : ''}
      ${spdPct > 0 ? `<div class="spd-pip">⚡ ${spdPct}%</div>` : ''}`;
  }
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

function renderBattle() {
  if (!battle) return;
  renderBattleSide(activeAlly(), 'battle-allies', false);
  renderBattleSide(activeFoe(),  'battle-enemies', true);
  renderBench();
  renderPotionBar();
  renderSkillBar();
}

// ── SPECIAL SKILL BAR ──
// Unlocked specials for the ACTIVE fighter. Tapping toggles auto-cast:
// when on, the pet uses it automatically each turn until MP runs out.
function renderSkillBar() {
  const bar = $('skill-bar');
  if (!bar || !battle) return;
  const pet = activeAlly();
  bar.innerHTML = '';
  if (!pet) return;
  const list = unlockedSpecials(pet);
  if (!list.length) {
    bar.innerHTML = `<div class="sk-empty">ยังไม่มีสกิลพิเศษ — ปลดล็อกในผังสกิล</div>`;
    return;
  }
  pet.autoCast = pet.autoCast || {};
  list.forEach(sp => {
    const on = !!pet.autoCast[sp.id];
    const afford = (pet.mp || 0) >= sp.mp;
    const b = el('button','sk-btn' + (on ? ' on' : '') + (afford ? '' : ' poor'));
    b.dataset.petUid = pet.uid;
    b.dataset.spId = sp.id;
    b.innerHTML = `
      <span class="sk-name">${sp.name}</span>
      <span class="sk-cost-cd">MP ${sp.mp} · ${(sp.cd || 3.5).toFixed(1)}s</span>
      <span class="sk-auto">${on ? '● AUTO' : '○ ปิด'}</span>
      <span class="sk-cd-overlay"><b class="sk-cd-num"></b></span>`;
    b.title = `${sp.thai} — ${sp.desc}`;
    b.onclick = () => {
      pet.autoCast[sp.id] = !pet.autoCast[sp.id];
      save(); renderSkillBar();
    };
    bar.appendChild(b);
  });
  refreshSkillCooldownUI();
}

// Ticks every skill button's darken-overlay + live countdown number,
// reading directly from the unit's _cooldowns map (set by
// markSpecialUsed). Runs on an interval while a battle is active so
// the number counts down smoothly rather than jumping.
let skillCdTimer = null;
function refreshSkillCooldownUI() {
  const pet = activeAlly();
  if (!pet) return;
  document.querySelectorAll('#skill-bar .sk-btn').forEach(btn => {
    const spId = btn.dataset.spId;
    const until = pet._cooldowns && pet._cooldowns[spId];
    const remainMs = until ? Math.max(0, until - Date.now()) : 0;
    const overlay = btn.querySelector('.sk-cd-overlay');
    const num = btn.querySelector('.sk-cd-num');
    if (remainMs > 0) {
      btn.classList.add('on-cooldown');
      overlay.style.opacity = '1';
      num.textContent = (remainMs / 1000).toFixed(1) + 's';
    } else {
      btn.classList.remove('on-cooldown');
      overlay.style.opacity = '0';
    }
  });
}
function startSkillCooldownTicker() {
  clearInterval(skillCdTimer);
  skillCdTimer = setInterval(() => {
    if (battle && !battle.over) refreshSkillCooldownUI();
    else clearInterval(skillCdTimer);
  }, 100);
}

// ── COMBAT POTIONS ──
// Click during a fight to heal the ACTIVE VIRUZ. Using one costs the
// player their tempo — the enemy still gets its swing — so it's a real
// decision rather than a free heal.
function renderPotionBar() {
  const bar = $('potion-bar');
  if (!bar || !battle) return;
  bar.innerHTML = '';
  const owned = G.potions || {};
  const any = POTIONS.some(p => (owned[p.id] || 0) > 0);
  if (!any) {
    bar.innerHTML = `<div class="potion-empty">ไม่มียา — ซื้อได้ที่จุดพัก</div>`;
    return;
  }
  POTIONS.forEach(pt => {
    const n = owned[pt.id] || 0;
    if (!n) return;
    const b = el('button','potion-btn');
    b.innerHTML = `<span class="pb-icon">${pt.icon}</span>
                   <span class="pb-n">${n}</span>`;
    b.title = `${pt.name} — ${pt.desc}`;
    b.onclick = () => usePotion(pt);
    bar.appendChild(b);
  });
}

function usePotion(pt) {
  if (!battle || battle.over) return;
  const pet = activeAlly();
  if (!pet) { toast('ไม่มี VIRUZ ที่สู้อยู่'); return; }
  const owned = G.potions || {};
  if (!(owned[pt.id] > 0)) return;
  const mhp = statsOf(pet).mhp;
  if (pet.hp >= mhp) { toast('HP เต็มแล้ว'); return; }

  owned[pt.id]--;
  G.potions = owned;
  const before = pet.hp;
  pet.hp = clamp(Math.floor(pet.hp + mhp * pt.heal), 0, mhp);
  const healed = pet.hp - before;

  healPop(pet, healed);
  blog(`${pt.icon} ใช้ ${pt.name} · +${healed} HP`, 'buff');
  refreshBattleUnits();
  renderPotionBar();
  save();
}

// ── CAMERA ──
// Pans/zooms the stage toward a unit for dramatic moments (crits and
// special skills), then eases back out. Purely visual — it transforms a
// wrapper, so hit detection and layout are untouched.
function cameraTo(unitEl, { zoom = 1.5, ms = 320 } = {}) {
  const cam = $('stage-cam');
  const stage = $('battle-stage');
  if (!cam || !stage || !unitEl) return;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();
  // offset needed to bring the unit to stage centre, pre-zoom
  const dx = (host.width / 2) - (r.left - host.left + r.width / 2);
  const dy = (host.height / 2) - (r.top - host.top + r.height / 2);
  cam.style.transition = `transform ${ms}ms cubic-bezier(.3,.9,.3,1)`;
  cam.style.transform = `scale(${zoom}) translate(${dx / zoom}px, ${dy / zoom}px)`;
}
function cameraReset(ms = 380) {
  const cam = $('stage-cam');
  if (!cam) return;
  cam.style.transition = `transform ${ms}ms cubic-bezier(.3,.9,.3,1)`;
  cam.style.transform = 'scale(1) translate(0,0)';
}
// Slow-motion: scales every running animation on the stage.
function setTimeScale(v) {
  const stage = $('battle-stage');
  if (stage) stage.style.setProperty('--time-scale', v);
}

// Full dramatic beat: pan to attacker, slow down, hold for the skill
// animation, then pan out to reveal the damage on the target.
// Timing matters here. The pan-out must be UNDERWAY before the hit
// lands, otherwise the damage number appears while the camera is still
// framing the attacker and the player never sees it. So: short pan in,
// brief slow-mo on the wind-up, then start pulling back to a wide shot
// concurrently with the strike rather than after it.
async function cinematicStrike(attackerEl, targetEl, playFn) {
  cameraTo(attackerEl, { zoom: 1.4, ms: 190 });
  setTimeScale(0.6);
  await wait(190);

  // Kick off the attack, and 140ms later (mid-lunge, before contact)
  // start easing out to a wide framing that shows BOTH fighters.
  const strike = playFn();
  setTimeout(() => { setTimeScale(1); cameraReset(300); }, 140);
  await strike;
  cameraReset(260);
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SPELL VFX ──
// Each special names a vfx key; this draws it over the stage.
// ── VFX ASSET REGISTRY ──
// Maps a vfx key to real uploaded art (WebP, transparent) plus where it
// anchors and how big it renders. `target` says whether the clip plays
// on the caster ('self') or the target ('enemy'). Effects without a
// registry entry fall back to the procedural CSS builders below.
const VFX_ASSETS = {
  shield_self:     { file:'shield_self.webp',     target:'self',  w:150, ms:1100 },
  wind_self:       { file:'wind_self.webp',       target:'self',  w:140, ms:640  },
  circle_self:     { file:'circle_self.webp',     target:'self',  w:150, ms:900  },
  heal_self:       { file:'heal_self.webp',       target:'self',  w:150, ms:1150 },
  crit_self:       { file:'crit_self.webp',       target:'self',  w:160, ms:1000 },
  pierce_enemy:    { file:'pierce_enemy.webp',    target:'enemy', w:190, ms:260  },
  ice_enemy:       { file:'ice_enemy.webp',       target:'enemy', w:150, ms:960  },
  fire_enemy:      { file:'fire_enemy.webp',      target:'enemy', w:150, ms:1000 },
  charm_enemy:     { file:'charm_enemy.webp',     target:'enemy', w:140, ms:1080 },
  poison_enemy:    { file:'poison_enemy.webp',    target:'enemy', w:150, ms:1040 },
  meteor_enemy:    { file:'meteor_enemy.webp',    target:'enemy', w:170, ms:1120,
                      // impact anchor measured from the source clip's last
                      // frame (% of frame size), used so the strike lands
                      // exactly on the target rather than centred generically
                      anchorPct:{ x:23.6, y:77.2 } },
  hit_normal_enemy:{ file:'hit_normal_enemy.webp',target:'enemy', w:120, ms:480,
                      // fades immediately and is fully gone well under 2s
                      fadeFrom:0 },
};

// Attribute-keyed aliases so existing SPECIALS vfx tags ('fire','ice',
// 'heal','holy','shield','poison','charm','wind','meteor','pierce',
// 'aura','bless') resolve to the new uploaded assets. 'holy'/'bless'
// reuse the plain self-circle per spec — no dedicated holy asset.
const VFX_ALIAS = {
  fire:'fire_enemy', ice:'ice_enemy', heal:'heal_self',
  holy:'circle_self', bless:'circle_self', shield:'shield_self',
  poison:'poison_enemy', charm:'charm_enemy', wind:'wind_self',
  meteor:'meteor_enemy', pierce:'pierce_enemy', slash:'pierce_enemy', aura:'circle_self',
  impact:'hit_normal_enemy',
};

function resolveVfxKey(kind) {
  if (VFX_ASSETS[kind]) return kind;
  if (VFX_ALIAS[kind]) return VFX_ALIAS[kind];
  return null;
}

// Plays a registered WebP clip anchored to a unit. Returns the ms the
// caller should wait before the next beat (so self-cast → delay →
// enemy-impact sequencing has a real number to wait on).
function playVfxAsset(key, unitEl, opts = {}) {
  const asset = VFX_ASSETS[key];
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!asset || !layer || !stage || !unitEl) return 0;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();

  const img = document.createElement('img');
  img.className = 'vfx-clip';
  img.src = `assets/fx/${asset.file}`;
  img.style.width = asset.w + 'px';

  let leftPx, topPx;
  if (asset.anchorPct) {
    // Anchor the effect's OWN impact point (from anchorPct) onto the
    // unit's centre, and flip horizontally when the unit is on the
    // right side so the effect still reads as coming from offscreen
    // toward the target rather than always pointing one way.
    const flip = opts.flip || false;
    const ax = flip ? (100 - asset.anchorPct.x) : asset.anchorPct.x;
    const scale = asset.w / (asset.naturalW || asset.w);
    leftPx = r.left - host.left + r.width / 2 - (ax / 100) * asset.w;
    topPx = r.top - host.top + r.height * 0.6 - (asset.anchorPct.y / 100) * asset.w;
    img.style.transform = flip ? 'scaleX(-1)' : 'none';
  } else {
    leftPx = r.left - host.left + r.width / 2 - asset.w / 2;
    topPx = r.top - host.top + r.height * 0.5 - asset.w / 2;
  }
  img.style.left = leftPx + 'px';
  img.style.top = topPx + 'px';

  if (asset.fadeFrom === 0) img.classList.add('vfx-instant-fade');
  layer.appendChild(img);
  setTimeout(() => img.remove(), asset.ms + 120);
  return asset.ms;
}

function playSpellVFX(kind, caster, target, side) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !kind) return 0;
  const host = stage.getBoundingClientRect();
  const cEl = document.querySelector(`.bunit[data-uid="${caster.uid}"]`);
  const tEl = document.querySelector(`.bunit[data-uid="${target.uid}"]`);
  const at = (elm, yFactor = 0.5) => {
    if (!elm) return { x: host.width/2, y: host.height/2 };
    const r = elm.getBoundingClientRect();
    return { x: r.left - host.left + r.width/2, y: r.top - host.top + r.height*yFactor };
  };

  // Prefer real uploaded art when this vfx key has a registered asset.
  const resolved = resolveVfxKey(kind);
  if (resolved) {
    const asset = VFX_ASSETS[resolved];
    const unitEl = asset.target === 'self' ? cEl : tEl;
    const flip = asset.target === 'enemy' && side === 'ally';  // enemy stands on the right
    return playVfxAsset(resolved, unitEl, { flip });
  }

  const mk = (cls, pos, inner='') => {
    const d = el('div', 'vfx ' + cls, '');
    d.style.left = pos.x + 'px';
    d.style.top  = pos.y + 'px';
    if (inner) d.innerHTML = inner;
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1400);
    return d;
  };

  switch (kind) {
    case 'fire': {
      const p = at(tEl, .55);
      let inner = '';
      for (let i = 0; i < 10; i++) {
        inner += `<i class="flame" style="--fx:${(Math.random()*70-35).toFixed(0)}px;--fd:${(i*0.05).toFixed(2)}s"></i>`;
      }
      mk('vfx-fire', p, inner);
      break;
    }
    case 'ice': {
      const p = at(tEl, .5);
      let inner = '';
      for (let i = 0; i < 7; i++) {
        inner += `<i class="shard" style="--sa:${(360/7*i).toFixed(0)}deg;--sd:${(i*0.04).toFixed(2)}s"></i>`;
      }
      mk('vfx-ice', p, inner + '<b class="frost-ring"></b>');
      break;
    }
    case 'heal': {
      const p = at(cEl, .55);
      let inner = '<b class="heal-ring"></b>';
      for (let i = 0; i < 8; i++) {
        inner += `<i class="sparkle" style="--sx:${(Math.random()*60-30).toFixed(0)}px;--sd:${(i*0.07).toFixed(2)}s"></i>`;
      }
      mk('vfx-heal', p, inner);
      break;
    }
    case 'bless': case 'holy': {
      const p = at(kind === 'holy' ? tEl : cEl, .5);
      mk('vfx-holy', p, '<b class="holy-beam"></b><b class="holy-ring"></b>');
      break;
    }
    case 'shield': {
      const p = at(cEl, .5);
      mk('vfx-shield', p, '<b class="shield-hex"></b>');
      break;
    }
    case 'poison': {
      const p = at(tEl, .55);
      let inner = '';
      for (let i = 0; i < 9; i++) {
        inner += `<i class="bubble" style="--bx:${(Math.random()*60-30).toFixed(0)}px;--bd:${(i*0.06).toFixed(2)}s"></i>`;
      }
      mk('vfx-poison', p, inner);
      break;
    }
    case 'charm': {
      const p = at(tEl, .45);
      let inner = '';
      for (let i = 0; i < 7; i++) {
        inner += `<i class="heartp" style="--hx:${(Math.random()*70-35).toFixed(0)}px;--hd:${(i*0.08).toFixed(2)}s">♥</i>`;
      }
      mk('vfx-charm', p, inner);
      break;
    }
    case 'wind': {
      const p = at(tEl, .5);
      let inner = '';
      for (let i = 0; i < 6; i++) {
        inner += `<i class="gust" style="--gy:${(i*11-30)}px;--gd:${(i*0.05).toFixed(2)}s"></i>`;
      }
      mk('vfx-wind', p, inner);
      break;
    }
    case 'meteor': {
      const p = at(tEl, .5);
      mk('vfx-meteor', p, '<b class="rock"></b><b class="boom"></b>');
      break;
    }
    case 'phoenix': {
      const p = at(tEl, .5);
      mk('vfx-phoenix', p, '<b class="wing left"></b><b class="wing right"></b><b class="boom"></b>');
      break;
    }
    case 'pierce': {
      const p = at(tEl, .5);
      mk('vfx-pierce', p, '<b class="lance"></b>');
      break;
    }
    case 'aura': {
      const p = at(cEl, .55);
      mk('vfx-aura', p, '<b class="aura-ring"></b><b class="aura-ring d2"></b>');
      break;
    }
    default: {
      const p = at(tEl, .5);
      mk('vfx-impact', p, '<b class="boom"></b>');
    }
  }
}

window.VIRUZ = {
  startArena,
  showScreen,
  closeModal,
  resetGame: async () => {
    if (!confirm('ลบข้อมูลทั้งหมดและเริ่มใหม่?')) return;
    localStorage.clear();
    location.reload();
  },
  // test/debug hook — current hack puzzle answer, if any
  _hackAnswer: () => hackState && hackState.puzzle && hackState.puzzle.answer,
};

boot();
