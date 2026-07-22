// ═══════════════════════════════════════════════════════════
// VIRUZ PET — GAME
// State, screens, battle loop, DOM rendering.
// ═══════════════════════════════════════════════════════════

import {
  ATTR, ATTR_KEYS, RARITY, RARITY_KEYS, SPECIES, SPECIES_KEYS,
  MAPS, ZONES, zonesOfMap, zoneById, ANTIVIRUZ, EGGS, ITEMS, POTIONS, DEFENSE_BOTS, MAP_NODES, TUNING,
  SYNERGY, WHITE_TRAITS,
  LOYALTY_TIERS, loyaltyTier, loyaltyProgress, SIGNATURE_SKILLS,
  FOODS, TOYS, CARE_CLEAN, CARE_COOLDOWN_MS, LOYALTY_PER_WIN,
  buildLootMenu, chanceToEnemyMult, RAID_LOSS_BITZ } from './data.js';
import {
  createPet, rollEgg, statsOf, combatStats, powerOf, teamPower, spawnAntiviruz,
  synergyOf, supportOf, computeDamage, turnOrder, grantExp,
  canEvolve, evolve, buildHackRun, resolveRaid, healTeam,
  teamAlive, availableSkills, clamp, loyaltyBuffs, signatureSkillOf, buildHackPuzzle, checkHackGuess } from './engine.js';
import { NET } from './net.js';
import { creatureMarkupFor, gifURL } from './sprites.js';

// Creatures come from either real GIF art or procedural SVG —
// creatureMarkupFor() picks per species, so both coexist.
function creatureMarkup(pet, cls, anim = 'still') {
  // Enemies aren't in SPECIES, so fall back to the fields copied onto
  // the spawned unit. Must include ext/palette or PNG art resolves to
  // a .gif path and 404s.
  const sp = SPECIES[pet.speciesId] ||
    { shape: pet.shape, palette: pet.palette, gif: pet.gif, ext: pet.ext, name: pet.name };
  const attr = ATTR[pet.attr] || ATTR.red;
  return creatureMarkupFor(sp, attr, cls, anim);
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
  inbox: [],
  raidHistory: [],
  potions: {},      // combat potions, bought at safe spots
  lastSafe: null,   // which safe zone the player last visited
  foods: {},        // consumable care food counts
  toys: [],         // permanently owned toy ids
  care: {},         // { petUid: { activityId: lastUsedTimestamp } }
  feed: [],         // persistent PROCESS activity records
};

let battle = null;   // active battle state
let battleTimer = null;
let regenTimer = null;
let battleSpeed = 1;

// ═══════════════ DOM HELPERS ═══════════════
const $ = id => document.getElementById(id);
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
      dog:'bytehound', dog2:'armorhound', cat:'tabbyproc', cat3:'mysticproc',
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
    G.teamIds    = (G.teamIds || []).filter(id => ids.has(id));
    G.defenseIds = (G.defenseIds || []).filter(id => ids.has(id));
    if (!G.teamIds.length && G.roster.length) G.teamIds = [G.roster[0].uid];
    showScreen('map');
    renderAll();
    log('โหลดข้อมูลสำเร็จ', 'sys');
  } else {
    showScreen('intro');
    buildStarterPicker();
  }
  wireGlobalUI();
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
const SCREENS = ['intro','map','home','clinic','shop','world','battle','arena','raid','safe','care','hack','steal'];
function showScreen(id) {
  SCREENS.forEach(s => {
    const e = $('screen-' + s);
    if (e) e.classList.toggle('on', s === id);
  });
  // Background video only plays on the map
  const vid = $('bg-video');
  if (vid) {
    if (id === 'map') { vid.play().catch(()=>{}); }
    else { vid.pause(); }
  }
  $('app').dataset.screen = id;
  if (id === 'home')   renderHome();
  if (id === 'clinic') renderClinic();
  if (id === 'shop')   renderShop();
  if (id === 'world')  renderWorld();
  if (id === 'safe')   renderSafeSpot();
  if (id === 'care')   renderCare();
  if (id === 'raid')   renderRaidList();
  if (id === 'map')    renderFeed();
}

function wireGlobalUI() {
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.onclick = () => showScreen(b.dataset.goto);
  });
  $('start-btn').onclick = claimStarter;

  // team strip nav
  const tp = $('ts-prev'), tn = $('ts-next');
  if (tp) tp.onclick = () => stripStep(-1);
  if (tn) tn.onclick = () => stripStep(1);
  // swipe on touch
  const vp = $('ts-viewport');
  if (vp) {
    let x0 = null;
    vp.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, {passive:true});
    vp.addEventListener('touchend', e => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) stripStep(dx < 0 ? 1 : -1);
      x0 = null;
    }, {passive:true});
  }
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
    const node = el('button', 'map-node');
    node.style.left = n.x + '%';
    node.style.top  = n.y + '%';
    node.innerHTML = `
      <span class="node-pin"></span>
      <span class="node-label">
        <span class="node-icon">${n.icon}</span>
        <span class="node-text">${n.label}</span>
        <span class="node-hint">${n.hint}</span>
      </span>`;
    node.onclick = () => showScreen(n.screen);
    layer.appendChild(node);
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
  renderTeamStrip();
  syncQuickbar();
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
let stripIdx = 0;
function renderTeamStrip() {
  const track = $('ts-track');
  const strip = $('teamstrip');
  if (!track || !strip) return;
  const team = activeTeam();
  if (!team.length) { strip.style.display = 'none'; return; }
  strip.style.display = '';
  stripIdx = Math.max(0, Math.min(stripIdx, team.length - 1));

  track.innerHTML = '';
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
        <div class="ts-name">${pet.name} <span class="ts-attr">${a.icon}</span></div>
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
    track.appendChild(cell);
  });
  track.style.transform = `translateX(-${stripIdx * 100}%)`;

  const dots = $('ts-dots');
  if (dots) {
    dots.innerHTML = '';
    team.forEach((_, i) => {
      const d = el('span','ts-dot' + (i === stripIdx ? ' on' : ''));
      d.onclick = () => { stripIdx = i; renderTeamStrip(); };
      dots.appendChild(d);
    });
  }
}

function stripStep(dir) {
  const n = activeTeam().length;
  if (!n) return;
  stripIdx = (stripIdx + dir + n) % n;
  renderTeamStrip();
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
  card.innerHTML = `
    <div class="pc-top">
      <span class="pc-attr" title="${a.desc}">${a.icon}</span>
      <span class="pc-rar">${r.name}</span>
    </div>
    ${creatureMarkup(pet, 'pc-sprite float')}
    <div class="pc-name">${pet.name}${trait ? ` <span class="pc-trait" title="${trait.desc}">${trait.icon}</span>` : ''}</div>
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
    ${sig ? `<div class="pc-sig" title="${sig.desc}">✦ ${sig.n}</div>` : ''}`;
  if (opts.onClick) card.onclick = () => opts.onClick(pet);
  return card;
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
      banner.innerHTML = `<b>${a.icon} ${syn.label}</b> — สเตตัสทีม ×${syn.mult}`;
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
      const c = petCard(pet, { onClick: p => removeFromTeam(p.uid) });
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
      onClick: p => inTeam ? removeFromTeam(p.uid) : addToTeam(p.uid),
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
  const dp = defenseTeam().reduce((s,p) => s + powerOf(p), 0) +
             G.bots.reduce((s,b) => {
               const d = DEFENSE_BOTS.find(x => x.id === b.id);
               return s + (d ? d.power.atk*2 + d.power.def*1.6 : 0);
             }, 0);
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
      <div class="reveal-attr">${a.icon} ${a.name} — ${a.desc}</div>
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
  } else if (it.type === 'evo') {
    const res = evolve(pet, true);
    if (res) {
      log(`💎 ${pet.name} วิวัฒน์ → ${res.label} (สเตตัส ×${res.mult})`, 'win');
      toast(`✨ ${pet.name}\nStage ${pet.stage+1} — ${res.label}`);
    } else {
      log('ไม่สามารถวิวัฒน์ได้', 'sys');
    }
  }
}

// ═══════════════ SCREEN: HACK ═══════════════
// ── WORLD MAP ──
// Looping video background with clickable pins positioned by percentage.
let currentMapId = 'forest';

function renderWorld() {
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
      b.onclick = () => { currentMapId = m.id; renderWorld(); };
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

function renderCare() {
  const pet = G.roster.find(p => p.uid === carePetId) || activeTeam()[0] || G.roster[0];
  if (!pet) return;
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

  const tier = loyaltyTier(pet.loyalty);
  const prog = loyaltyProgress(pet.loyalty);
  const head = $('care-head');
  if (head) {
    head.innerHTML = `
      <div class="care-portrait">${creatureMarkup(pet,'care-sprite float')}</div>
      <div class="care-info">
        <div class="care-name">${pet.name} <span class="muted">Lv.${pet.level}</span></div>
        <div class="care-tier">${tier.icon} ${tier.name} <i>${tier.thai}</i></div>
        <div class="loy-bar"><i style="width:${prog.pct}%"></i></div>
        <div class="care-next">${prog.next
          ? `อีก ${prog.need} แต้มถึง ${prog.next.name}`
          : 'ความผูกพันสูงสุดแล้ว'}</div>
        ${tier.perk ? `<div class="care-perk">✦ ${tier.perk}</div>` : ''}
      </div>`;
  }

  // activities
  const acts = $('care-acts');
  if (!acts) return;
  acts.innerHTML = '';

  // free cleaning
  acts.appendChild(careCard({
    id: CARE_CLEAN.id, icon: CARE_CLEAN.icon, name: CARE_CLEAN.name,
    desc: CARE_CLEAN.desc, loyalty: CARE_CLEAN.loyalty, kind: 'free',
  }, pet));

  // owned foods
  FOODS.forEach(f => {
    const owned = (G.foods && G.foods[f.id]) || 0;
    acts.appendChild(careCard({ ...f, kind:'food', owned }, pet));
  });
  // owned toys
  TOYS.forEach(t => {
    const owned = (G.toys || []).includes(t.id);
    acts.appendChild(careCard({ ...t, kind:'toy', owned: owned ? 1 : 0 }, pet));
  });
}

function careCard(act, pet) {
  const ready = careReady(pet.uid, act.id);
  const card = el('div','care-card' + (ready ? '' : ' cooling'));
  const stock = act.kind === 'food'
    ? `<div class="cc-stock">มี ${act.owned} ชิ้น</div>`
    : act.kind === 'toy'
      ? `<div class="cc-stock">${act.owned ? 'เป็นเจ้าของแล้ว' : 'ยังไม่มี'}</div>`
      : `<div class="cc-stock">ฟรี</div>`;
  card.innerHTML = `
    <div class="cc-icon">${act.icon}</div>
    <div class="cc-name">${act.name}</div>
    <div class="cc-loy">+${act.loyalty} ❤</div>
    ${stock}
    <div class="cc-action"></div>`;

  const slot = card.querySelector('.cc-action');
  if (act.kind !== 'free' && !act.owned) {
    const buy = el('button','btn small', `ซื้อ ${act.cost}`);
    buy.onclick = () => {
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
    };
    slot.appendChild(buy);
  } else if (!ready) {
    slot.innerHTML = `<span class="cc-cd">⏳ ${fmtCooldown(careRemaining(pet.uid, act.id))}</span>`;
  } else {
    const use = el('button','btn small primary', act.kind==='toy' ? 'เล่น' : act.kind==='food' ? 'ให้กิน' : 'ทำ');
    use.onclick = () => {
      if (act.kind === 'food') {
        if (!((G.foods && G.foods[act.id]) > 0)) { toast('ไม่มีอาหารนี้'); return; }
        G.foods[act.id]--;
      }
      addLoyalty(pet, act.loyalty);
      markCare(pet.uid, act.id);
      save(); renderCare(); renderHUD();
      careFx(act.icon);
    };
    slot.appendChild(use);
  }
  return card;
}

// Little burst of the activity icon as feedback
function careFx(icon) {
  const host = $('care-head');
  if (!host) return;
  for (let i = 0; i < 6; i++) {
    const d = el('div','care-particle', icon);
    d.style.left = (30 + Math.random()*40) + '%';
    d.style.animationDelay = (i*0.07) + 's';
    host.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }
}

// ── SAFE SPOT ──
function renderSafeSpot() {
  const z = zoneById(G.lastSafe) || ZONES.find(x => x.kind === 'safe');
  if (!z) return;
  setText('safe-name', z.name);
  setText('safe-thai', z.thai);

  // Rest — full heal, costs nothing but advances the day counter
  const restBtn = $('safe-rest');
  if (restBtn) {
    const hurt = G.roster.filter(p => p.hp < statsOf(p).mhp).length;
    restBtn.textContent = hurt ? `🔥 พักฟื้น (${hurt} ตัวบาดเจ็บ)` : '🔥 ทุกตัวสมบูรณ์แล้ว';
    restBtn.disabled = !hurt;
    restBtn.onclick = () => {
      G.roster.forEach(p => p.hp = statsOf(p).mhp);
      G.day++;
      save(); renderSafeSpot(); renderHUD();
      toast('พักฟื้นเรียบร้อย\nHP เต็มทุกตัว');
    };
  }

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
// A single-pet defense battle. The enemy is the target's antiviruz
// defenders (a themed monster stand-in), scaled by the loot multiplier.
function startRaidFight(rival, sendPet, loot, mult) {
  // Build a defender scaled to the rival's level and the difficulty mult.
  const defLevel = Math.max(1, rival.level);
  const pool = defLevel >= 51
    ? ['vampire_lord','fire_golem','hobgoblin']
    : ['stone_imp','fang_stalker','tide_warden'];
  const defId = pool[Math.floor(Math.random() * pool.length)];
  const foe = spawnAntiviruz(defId, defLevel);
  foe.name = rival.name + "'s Guard";
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
  renderBattle();
  startRegen();
  scheduleTurn(900);
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
  showScreen('battle');
  setText('battle-title', target.name);
  setText('battle-wave', `คลื่น 1 / ${run.waveCount}`);
  clearBattleLog();
  blog(`เริ่มเจาะ ${target.name}`, 'sys');
  const syn = synergyOf(team);
  if (syn.label) blog(`${ATTR[syn.attr].icon} ${syn.label} — สเตตัส ×${syn.mult}`, 'buff');
  const sup = supportOf(team);
  if (sup.auraPct > 0) blog(`➕ บัฟซัพพอร์ต +${Math.round(sup.auraPct*100)}%`, 'buff');
  renderBattle();
  startRegen();
  scheduleTurn(900);
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
  renderBattle();
  startRegen();
  scheduleTurn(900);
}

// Full (re)build of the battlefield DOM. Call this only when the unit
// LIST changes — battle start, or a new wave. Never call it after a
// single attack: rebuilding innerHTML mid-animation destroys the
// lunge/hit classes and the swapped sprite src before the browser
// paints a frame, which is why attacks used to look like nothing
// happened. Use refreshBattleUnits() for per-turn updates instead.
// VR2-style stage: ONE fighter per side, name plate + heart, no bars.
function renderBattle() {
  if (!battle) return;
  const side = (pet, elId, isEnemy) => {
    const wrap = $(elId);
    wrap.innerHTML = '';
    if (!pet) return;
    const s = statsOf(pet);
    const unit = el('div','bunit');
    unit.dataset.uid = pet.uid;
    unit.dataset.side = isEnemy ? 'foe' : 'ally';
    unit.style.setProperty('--float-delay', (Math.random() * 1.6).toFixed(2) + 's');
    if (pet.hp <= 0) unit.classList.add('dead');
    unit.innerHTML = `
      <div class="bu-sprite-wrap">
        ${creatureMarkup(pet, 'bu-sprite float' + (isEnemy ? ' flip' : ''))}
      </div>`;
    wrap.appendChild(unit);

    // Name plate lives outside the sprite so it never moves with a lunge
    const plate = $(isEnemy ? 'plate-foe' : 'plate-ally');
    if (plate) {
      plate.innerHTML = `
        <div class="np-name">${pet.name}</div>
        <div class="np-lv">Lv.${pet.level}</div>
        <div class="np-hp"><span class="np-heart">♥</span><b>${Math.max(0,pet.hp)}</b></div>`;
    }
  };
  side(activeAlly(), 'battle-allies', false);
  side(activeFoe(),  'battle-enemies', true);
  renderBench();
  renderPotionBar();
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

// Green rising number for heals, mirroring the damage number style
function healPop(pet, amount) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  const unit = document.querySelector(`.bunit[data-uid="${pet.uid}"]`);
  if (!layer || !stage || !unit) return;
  const host = stage.getBoundingClientRect();
  const r = unit.getBoundingClientRect();
  const d = el('div','heal-pop', `+${amount}`);
  d.style.left = (r.left - host.left + r.width/2) + 'px';
  d.style.top  = (r.top - host.top + r.height*0.25) + 'px';
  layer.appendChild(d);
  setTimeout(() => d.remove(), 1000);
}

// The ally currently fighting (one at a time, VR2 style)
function activeAlly() {
  if (!battle) return null;
  const cur = battle.team[battle.activeIdx];
  if (cur && cur.hp > 0) return cur;
  return null;
}
function activeFoe() {
  if (!battle) return null;
  return battle.enemies.find(e => e.hp > 0) || null;
}

// Small row of your remaining VIRUZ under the stage
function renderBench() {
  const bench = $('battle-bench');
  if (!bench || !battle) return;
  bench.innerHTML = '';
  battle.team.forEach((p, i) => {
    const chip = el('div','bench-chip');
    if (i === battle.activeIdx) chip.classList.add('active');
    if (p.hp <= 0) chip.classList.add('down');
    chip.innerHTML = `
      ${creatureMarkup(p, 'bench-sprite')}
      <span class="bench-hp">${Math.max(0,p.hp)}</span>`;
    bench.appendChild(chip);
  });
}

function refreshBattleUnits() {
  if (!battle) return;
  // Resolve by the unit actually ON STAGE, not by activeAlly()/activeFoe():
  // those return null the moment a fighter hits 0 HP, which left the name
  // plate frozen on its last value and hid the killing blow.
  ['plate-ally','plate-foe'].forEach(plateId => {
    const wrapId = plateId === 'plate-ally' ? 'battle-allies' : 'battle-enemies';
    const unit = $(wrapId) && $(wrapId).querySelector('.bunit');
    if (!unit) return;
    const uid = unit.dataset.uid;
    const pet = [...battle.team, ...battle.enemies].find(p => p.uid === uid);
    if (!pet) return;
    const plate = $(plateId);
    const b = plate && plate.querySelector('.np-hp b');
    if (b) b.textContent = Math.max(0, pet.hp);
    unit.classList.toggle('dead', pet.hp <= 0);
  });
  renderBench();
}

// ── VR2 TURN BANNER ──
// Grey pill announcing what is about to happen. Slides in, holds, fades.
function showBanner(text, kind = '') {
  return new Promise(resolve => {
    const host = $('banner-layer');
    if (!host) { resolve(); return; }
    const b = el('div', 'turn-banner ' + kind, text);
    host.appendChild(b);
    const hold = 620 / battleSpeed;
    setTimeout(() => {
      b.classList.add('out');
      setTimeout(() => { b.remove(); resolve(); }, 220 / battleSpeed);
    }, hold);
  });
}

// ── VR2 IMPACT BURST ──
// White radiating streak lines across the stage + a yellow slash arc
// at the contact point. This is what sells the hit in VR2 — the
// effect crosses the field, not the fighter.
function impactBurst(targetEl, crit) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !targetEl) return;
  const host = stage.getBoundingClientRect();
  const r = targetEl.getBoundingClientRect();
  const cx = r.left - host.left + r.width / 2;
  const cy = r.top - host.top + r.height / 2;

  const burst = el('div', 'impact-burst' + (crit ? ' crit' : ''));
  burst.style.left = cx + 'px';
  burst.style.top  = cy + 'px';

  // radiating streak lines
  let inner = '';
  const n = crit ? 14 : 10;
  for (let i = 0; i < n; i++) {
    const ang = (360 / n) * i + (Math.random() * 12 - 6);
    const len = 70 + Math.random() * 90;
    inner += `<i class="streak" style="transform:rotate(${ang}deg);--len:${len}px"></i>`;
  }
  // slash arc
  inner += `<b class="slash"></b>`;
  // sparks
  for (let i = 0; i < (crit ? 10 : 6); i++) {
    const ang = Math.random() * 360, dist = 30 + Math.random() * 55;
    inner += `<s class="spark" style="--a:${ang}deg;--d:${dist}px"></s>`;
  }
  burst.innerHTML = inner;
  layer.appendChild(burst);
  setTimeout(() => burst.remove(), 620);
}

// ── CRIT "POW!" ──
// Comic-style starburst with POW! text, fired only on crits.
function powEffect(targetEl) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !targetEl) return;
  const host = stage.getBoundingClientRect();
  const r = targetEl.getBoundingClientRect();
  const pow = el('div','pow-burst');
  pow.style.left = (r.left - host.left + r.width/2) + 'px';
  pow.style.top  = (r.top - host.top + r.height*0.42) + 'px';
  pow.style.setProperty('--spin', (Math.random()*20-10).toFixed(1) + 'deg');
  pow.innerHTML = `<span class="pow-star"></span><b class="pow-text">POW!</b>`;
  layer.appendChild(pow);
  setTimeout(() => pow.remove(), 780);
}

// ── VR2 DAMAGE NUMBER ──
// Huge, red-orange, thick black stroke, tilted, scale-punch on entry.
// Multi-hits stack a "× N" underneath. Crits append "!".
function floatDamage(anchor, res) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !anchor) return;
  const host = stage.getBoundingClientRect();
  const r = anchor.getBoundingClientRect();

  const wrap = el('div', 'dmg-big' + (res.crit ? ' crit' : ''));
  wrap.style.left = (r.left - host.left + r.width / 2) + 'px';
  wrap.style.top  = (r.top - host.top + r.height * 0.18) + 'px';
  wrap.style.setProperty('--tilt', (Math.random() * 14 - 7).toFixed(1) + 'deg');
  wrap.innerHTML = `
    <span class="dmg-num">${res.dmg}${res.crit ? '!' : ''}</span>
    ${res.hits > 1 ? `<span class="dmg-mult">× ${res.hits}</span>` : ''}`;
  layer.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1100);
}

function scheduleTurn(delay) {
  clearTimeout(battleTimer);
  const ms = delay != null ? delay : (TUNING.turnBaseMs / battleSpeed);
  battleTimer = setTimeout(runTurn, ms);
}

// runTurn is async now: it AWAITS the attack animation before
// scheduling the next turn, so animations can never be interrupted
// or skipped by the next action firing early.
// One-at-a-time duel loop. Your active VIRUZ trades blows with the
// current antiviruz until one falls. No skill input — fully automatic,
// paced so each hit is readable.
async function runTurn() {
  if (!battle || battle.over) return;

  const ally = activeAlly();
  const foe  = activeFoe();

  if (!ally) { promptSwap(); return; }
  if (!foe)  { checkBattleEnd(); return; }

  // Alternate: ally strikes, then foe strikes back.
  const allyFirst = combatStats(ally, battle.team).spd >= combatStats(foe, battle.enemies).spd;
  const seq = battle.phase === 'foe' ? [[foe, ally, 'foe']] : [[ally, foe, 'ally']];
  battle.phase = battle.phase === 'foe' ? 'ally' : 'foe';

  for (const [attacker, target, side] of seq) {
    if (attacker.hp <= 0 || target.hp <= 0) continue;

    await showBanner(side === 'ally' ? `${attacker.name} โจมตี!` : `${attacker.name} ตอบโต้!`,
                     side === 'ally' ? 'ally' : 'foe');
    if (!battle || battle.over) return;

    // Signature moves are powerful, so they fire only ~25% of the time
    // rather than competing equally in the random pick.
    const all = availableSkills(attacker);
    const sig = all.find(sk => sk.sig);
    const normal = all.filter(sk => !sk.sig);
    let skill;
    if (sig && Math.random() < 0.25) skill = sig;
    else skill = normal[Math.floor(Math.random() * normal.length)] || { n:'Strike', pw:35 };
    const res = computeDamage(attacker, side==='ally'?battle.team:battle.enemies,
                              target, side==='ally'?battle.enemies:battle.team,
                              skill, !!skill.special);

    if (skill.sig) await showBanner(`✦ ${skill.n} ✦`, 'sig');
    if (res.crit) await showBanner('CRITICAL!!', 'crit');
    if (!battle || battle.over) return;

    await playAttack(attacker, target, res, side);
    target.hp = Math.max(0, target.hp - res.dmg);
    refreshBattleUnits();

    let line = `${attacker.name} → ${skill.n}`;
    if (res.hits > 1) line += ` ×${res.hits}`;
    if (res.crit) line += ' CRIT';
    line += ` · -${res.dmg}`;
    blog(line, side);

    if (target.hp <= 0) {
      await showBanner(`${target.name} ถูกกำจัด`, 'ko');
      const koEl = document.querySelector(`.bunit[data-uid="${target.uid}"]`);
      if (koEl) koEl.classList.add('dead');
      break;
    }
  }

  if (checkBattleEnd()) return;

  // If our fighter fell, let the player pick the next one.
  if (!activeAlly() && battle.team.some(p => p.hp > 0)) { promptSwap(); return; }
  // If the foe fell but more remain, refresh onto the next one.
  if (!activeFoe()) { checkBattleEnd(); return; }

  renderBattle();
  scheduleTurn();
}

// Attack sequence with hit-stop. Fighters barely travel — VR2 sells
// the hit through the burst effect, not by crossing the field — so
// the lunge is a short forward push and the burst does the rest.
function playAttack(attacker, target, res, side) {
  return new Promise(resolve => {
    const stage = $('battle-stage');
    const aEl = document.querySelector(`.bunit[data-uid="${attacker.uid}"]`);
    const tEl = document.querySelector(`.bunit[data-uid="${target.uid}"]`);
    if (!aEl || !tEl || !stage) { resolve(); return; }

    const img = aEl.querySelector('.bu-sprite');
    const dir = side === 'ally' ? 1 : -1;

    const windMs   = 220 / battleSpeed;   // pull back
    const lungeMs  = 190 / battleSpeed;   // drive forward
    const stopMs   =  90 / battleSpeed;   // hit-stop freeze
    const returnMs = 300 / battleSpeed;

    aEl.style.setProperty('--wind-ms',   windMs.toFixed(0) + 'ms');
    aEl.style.setProperty('--lunge-ms',  lungeMs.toFixed(0) + 'ms');
    aEl.style.setProperty('--return-ms', returnMs.toFixed(0) + 'ms');
    aEl.style.setProperty('--dir', dir);

    // Same fallback as creatureMarkup — enemies live outside SPECIES.
    const atkSpecies = SPECIES[attacker.speciesId] ||
      { gif: attacker.gif, ext: attacker.ext };
    if (img) {
      img.classList.remove('float');
      img.classList.add('attacking');
      if (atkSpecies && atkSpecies.gif && img.tagName === 'IMG') {
        img.dataset.stillSrc = img.getAttribute('src');
        img.setAttribute('src', gifURL(atkSpecies.gif, 'attack', atkSpecies.ext || 'gif'));
      }
    }

    // wind up, then lunge
    // Crits get an exaggerated version of the whole sequence: the
    // attacker swells during wind-up and slams across with a bigger,
    // faster strike.
    if (res.crit) aEl.classList.add('crit-attack');

    aEl.classList.add('wind-up');
    setTimeout(() => {
      aEl.classList.remove('wind-up');
      aEl.classList.add('lunge-out');

      setTimeout(() => {
        // ── CONTACT ──
        impactBurst(tEl, res.crit);
        if (res.crit) powEffect(tEl);
        floatDamage(tEl, res);
        tEl.classList.add('hit');
        stage.classList.add('shake' + (res.crit ? '-hard' : ''));

        // Hit-stop: freeze everything briefly so the blow lands with weight
        stage.classList.add('hitstop');
        setTimeout(() => stage.classList.remove('hitstop'), stopMs);

        setTimeout(() => {
          tEl.classList.remove('hit');
          stage.classList.remove('shake','shake-hard');
        }, 380 / battleSpeed);

        aEl.classList.remove('lunge-out');
        aEl.classList.add('lunge-back');
        setTimeout(() => {
          aEl.classList.remove('lunge-back');
          aEl.classList.remove('crit-attack');
          if (img) {
            img.classList.remove('attacking');
            img.classList.add('float');
            if (img.dataset.stillSrc) {
              img.setAttribute('src', img.dataset.stillSrc);
              delete img.dataset.stillSrc;
            }
          }
          resolve();
        }, returnMs + stopMs);
      }, lungeMs);
    }, windMs);
  });
}

// ── SWAP MENU ──
// When your fighter falls, choose which VIRUZ steps up next.
function promptSwap() {
  if (!battle || battle.over) return;
  clearTimeout(battleTimer);
  const alive = battle.team.map((p,i) => ({p,i})).filter(x => x.p.hp > 0);
  if (!alive.length) { endBattle(false); return; }

  const host = $('swap-menu');
  if (!host) { battle.activeIdx = alive[0].i; renderBattle(); scheduleTurn(400); return; }
  host.innerHTML = `<div class="swap-title">เลือก VIRUZ ตัวถัดไป</div>`;
  const row = el('div','swap-row');
  alive.forEach(({p,i}) => {
    const s = statsOf(p);
    const card = el('button','swap-card');
    card.innerHTML = `
      ${creatureMarkup(p, 'swap-sprite')}
      <div class="swap-name">${p.name}</div>
      <div class="swap-hp">♥ ${p.hp}/${s.mhp}</div>`;
    card.onclick = () => {
      host.classList.remove('on');
      battle.activeIdx = i;
      battle.phase = 'ally';
      renderBattle();
      showBanner(`${p.name} ออกสู้!`, 'ally').then(() => scheduleTurn(200));
    };
    row.appendChild(card);
  });
  host.appendChild(row);
  host.classList.add('on');
}

function startRegen() {
  clearInterval(regenTimer);
  regenTimer = setInterval(() => {
    if (!battle || battle.over) return;
    const sup = supportOf(battle.team);
    if (sup.regenPct <= 0) return;
    let healed = 0;
    battle.team.filter(p => p.hp > 0).forEach(p => {
      const m = statsOf(p).mhp;
      const amt = Math.floor(m * sup.regenPct);
      const before = p.hp;
      p.hp = clamp(p.hp + amt, 0, m);
      healed += p.hp - before;
    });
    if (healed > 0) {
      blog(`💗 ซัพพอร์ตฟื้นฟู +${healed} HP`, 'buff');
      refreshBattleUnits(); // HP-only change — no rebuild needed
    }
  }, 8000);
}

function checkBattleEnd() {
  if (!battle || battle.over) return true;
  const alliesUp = battle.team.some(p => p.hp > 0);
  const foesUp   = battle.enemies.some(p => p.hp > 0);

  if (!foesUp) {
    // Wave cleared
    const waveExp  = battle.enemies.reduce((s,e) => s + 18 + e.level * 4, 0);
    const waveBitz = battle.enemies.reduce((s,e) => s + 14 + e.level * 3, 0);
    const mult = battle.mode === 'hack'
      ? battle.target.reward
      : { expMult: 1.8, bitzMult: 1.8 };
    battle.totalExp  += Math.floor(waveExp  * mult.expMult);
    battle.totalBitz += Math.floor(waveBitz * mult.bitzMult);

    if (battle.mode === 'hack' && battle.wave + 1 < battle.run.waveCount) {
      battle.wave++;
      battle.enemies = battle.run.waves[battle.wave];
      battle.turn = 0;
      battle.phase = 'ally';
      setText('battle-wave', `คลื่น ${battle.wave+1} / ${battle.run.waveCount}`);
      blog(`คลื่นถัดไป (${battle.wave+1}/${battle.run.waveCount}) — HP คงเดิม`, 'sys');
      renderBattle();
      scheduleTurn(1000);
      return false;
    }
    endBattle(true);
    return true;
  }
  if (!alliesUp) { endBattle(false); return true; }
  return false;
}

function endBattle(win) {
  battle.over = true;
  clearTimeout(battleTimer);
  clearInterval(regenTimer);

  // Raid fights resolve through the hack flow, not the normal reward path.
  if (battle.mode === 'raid') {
    const { rival, loot } = battle.raid;
    // heal the sent pet a little so a loss isn't punishing beyond the Bitz hit
    battle.team.forEach(p => {
      if (p.hp <= 0) p.hp = Math.max(1, Math.floor(statsOf(p).mhp * 0.1));
    });
    if (win) grantLoot(loot);
    const done = $('battle-done');
    if (done) {
      done.style.display = '';
      done.onclick = () => {
        done.style.display = 'none';
        const b = battle; battle = null;
        finishRaid(win, b.raid.loot);
      };
    }
    save();
    return;
  }

  let results = null;
  if (win) {
    G.wins++;
    G.bitz += battle.totalBitz;
    const share = Math.floor(battle.totalExp / Math.max(1, battle.team.length));
    // Snapshot each pet's exp before/after so the results panel can show
    // an animated bar and how close each is to the next level.
    results = battle.team.map(p => {
      const beforeLv = p.level;
      const beforeExp = p.exp;
      const beforeNeed = p.expNeed;
      const beforeLoyId = loyaltyTier(p.loyalty).id;
      const evs = grantExp(p, share);
      const leveled = evs.filter(e => e.type === 'levelup').length;
      const skills  = evs.filter(e => e.type === 'skill').map(e => e.name);
      evs.forEach(e => {
        if (e.type === 'levelup') blog(`⬆️ ${p.name} → Lv.${e.level} (+${e.pts} แต้ม)`, 'buff');
        if (e.type === 'skill')   blog(`✨ ${p.name} ปลดล็อก ${e.name}`, 'buff');
      });
      // loyalty from fighting
      p.loyalty = clamp((p.loyalty || 0) + LOYALTY_PER_WIN, 0, 100);
      const loyPromo = loyaltyTier(p.loyalty).id !== beforeLoyId ? loyaltyTier(p.loyalty) : null;
      if (loyPromo) blog(`${loyPromo.icon} ${p.name} → ${loyPromo.name}!`, 'buff');
      return {
        pet: p, gained: share,
        beforeLv, beforeExp, beforeNeed,
        afterLv: p.level, afterExp: p.exp, afterNeed: p.expNeed,
        maxed: p.level >= p.maxLv,
        leveled, skills, loyPromo,
      };
    });
    blog(`สำเร็จ! +${battle.totalExp} EXP · +${battle.totalBitz} Bitz`, 'win');
    log(`ชนะ ${battle.mode === 'hack' ? battle.target.name : 'Arena'} · +${battle.totalBitz} Bitz`, 'win');
  } else {
    battle.team.forEach(p => {
      if (p.hp <= 0) p.hp = Math.max(1, Math.floor(statsOf(p).mhp * TUNING.loseHpRestore));
    });
    blog('การเจาะล้มเหลว — ทีมถูกตรวจจับ', 'lose');
    log(`แพ้ ${battle.mode === 'hack' ? battle.target.name : 'Arena'}`, 'lose');
  }
  save();

  // Where "done" should return to: zone fights go back to the world map,
  // arena/other go to the city map. This is the fix for the "kicked to
  // city hub, have to re-open the map" annoyance.
  const returnTo = (battle.mode === 'hack' && battle.target && battle.target.map) ? 'world'
                 : (battle.mode === 'hack') ? 'world'
                 : 'map';

  showBattleResults(win, battle.totalBitz, battle.totalExp, results, returnTo);
}

// ── BATTLE RESULTS PANEL ──
// Overlay showing win/lose, Bitz, and per-pet EXP bars that animate from
// their pre-fight fill to the new one so you can see progress to level-up.
function showBattleResults(win, bitz, exp, results, returnTo) {
  const panel = $('battle-results');
  if (!panel) {
    // Fallback: no panel in DOM, just leave via the done button.
    const done = $('battle-done');
    done.style.display = '';
    done.onclick = () => { done.style.display='none'; battle=null; showScreen(returnTo); renderAll(); };
    return;
  }

  const rows = (results || []).map(r => {
    const pct0 = r.maxed ? 100 : Math.round(r.beforeExp / Math.max(1, r.beforeNeed) * 100);
    const pct1 = r.maxed ? 100 : Math.round(r.afterExp  / Math.max(1, r.afterNeed)  * 100);
    const lvUp = r.leveled > 0
      ? `<span class="br-lvup">▲ Lv.${r.beforeLv} → ${r.afterLv}</span>` : '';
    const extra = [
      ...(r.skills || []).map(n => `<span class="br-skill">✨ ${n}</span>`),
      r.loyPromo ? `<span class="br-loy">${r.loyPromo.icon} ${r.loyPromo.name}</span>` : '',
    ].join('');
    return `
      <div class="br-row" data-pct0="${pct0}" data-pct1="${pct1}" data-leveled="${r.leveled}">
        <div class="br-art">${creatureMarkup(r.pet,'br-sprite')}</div>
        <div class="br-info">
          <div class="br-name">${r.pet.name} ${lvUp}</div>
          <div class="br-xpbar"><i style="width:${pct0}%"></i></div>
          <div class="br-xptext">
            ${r.maxed ? 'ระดับสูงสุด' : `EXP ${r.afterExp}/${r.afterNeed}`}
            <span class="br-gain">+${r.gained}</span>
          </div>
          ${extra ? `<div class="br-extra">${extra}</div>` : ''}
        </div>
      </div>`;
  }).join('');

  panel.innerHTML = `
    <div class="br-card ${win ? 'win' : 'lose'}">
      <div class="br-title">${win ? '✅ ชนะ!' : '❌ พ่ายแพ้'}</div>
      ${win ? `<div class="br-loot">💰 +${bitz} Bitz · ⚡ +${exp} EXP รวม</div>` : ''}
      <div class="br-rows">${rows || '<div class="br-empty">ทีมกลับมาพร้อม HP บางส่วน</div>'}</div>
      <button class="btn primary wide" id="br-continue">ต่อไป →</button>
    </div>`;
  panel.classList.add('on');

  // Animate each xp bar from pre-fight to post-fight fill.
  requestAnimationFrame(() => {
    panel.querySelectorAll('.br-row').forEach(row => {
      const bar = row.querySelector('.br-xpbar i');
      const pct1 = +row.dataset.pct1, leveled = +row.dataset.leveled;
      if (!bar) return;
      // If they leveled, sweep to 100 first, then drop to the new fill.
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
  blog('ถอนตัวออกจากระบบ', 'sys');
  save();
  battle = null;
  showScreen('map');
  renderAll();
}

// ═══════════════ SCREEN: RAID ═══════════════
async function renderRaidList() {
  const wrap = $('raid-list');
  wrap.innerHTML = '<div class="muted">กำลังค้นหาเป้าหมาย…</div>';
  const myPower = teamPower(activeTeam());
  const rivals = await NET.listRivals(12, myPower);
  wrap.innerHTML = '';
  if (!rivals.length) {
    wrap.appendChild(el('div','muted','ยังไม่พบผู้เล่นคนอื่น'));
    return;
  }
  rivals.forEach(r => {
    const diff = r.power / Math.max(1, myPower);
    const tier = diff < 0.8 ? ['ง่าย','#3ddc84'] : diff < 1.2 ? ['สูสี','#4fc3f7'] : ['ยาก','#ff4d5e'];
    const card = el('div','raid-card');
    card.style.setProperty('--tier', tier[1]);
    card.innerHTML = `
      <div class="rc-head">
        <span class="rc-name">${r.name}</span>
        <span class="rc-tier">${tier[0]}</span>
      </div>
      <div class="rc-meta">
        <span>Lv.${r.level}</span>
        <span>พลัง ${r.power.toLocaleString()}</span>
        <span>🛡 ${r.defense.botCount} บอท</span>
      </div>
      <div class="rc-loot">รางวัล ~${r.loot} Bitz</div>
      <button class="btn wide">โจมตีฐาน</button>`;
    card.querySelector('button').onclick = () => doRaid(r);
    wrap.appendChild(card);
  });

  setText('raid-mypower', myPower.toLocaleString());
}

// ── HACK STAGE 1: PASSWORD MINIGAME ──
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
  setText('hack-attempts', h.attempts);

  // attempts as blocks
  const ab = $('hack-attempt-blocks');
  if (ab) {
    ab.innerHTML = '';
    for (let i = 0; i < h.puzzle.attempts; i++) {
      ab.appendChild(el('span','atk-block' + (i < h.attempts ? '' : ' spent')));
    }
  }

  // Build the terminal grid. Words are clickable spans; junk is inert.
  const grid = $('hack-grid');
  const { stream, rows, cols, addrs, placements } = h.puzzle;
  // map each cell index → word placement (if part of a word)
  const cellWord = {};
  placements.forEach((p, wi) => {
    for (let k = 0; k < p.len; k++) cellWord[p.start + k] = wi;
  });

  let html = '';
  for (let r = 0; r < rows; r++) {
    html += `<div class="hg-row"><span class="hg-addr">${addrs[r]}</span><span class="hg-cells">`;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const wi = cellWord[idx];
      if (wi != null) {
        const p = placements[wi];
        const used = h.guessed.includes(p.word);
        const first = idx === p.start;
        html += `<span class="hg-ch word${used ? ' used' : ''}" data-wi="${wi}"${first ? '' : ''}>${stream[idx]}</span>`;
      } else {
        html += `<span class="hg-ch">${stream[idx]}</span>`;
      }
    }
    html += `</span></div>`;
  }
  grid.innerHTML = html;

  // hover + click by word
  grid.querySelectorAll('.hg-ch.word').forEach(ch => {
    const wi = ch.dataset.wi;
    ch.onmouseenter = () => grid.querySelectorAll(`.hg-ch.word[data-wi="${wi}"]`).forEach(x => x.classList.add('hot'));
    ch.onmouseleave = () => grid.querySelectorAll(`.hg-ch.word[data-wi="${wi}"]`).forEach(x => x.classList.remove('hot'));
    ch.onclick = () => guessHackWord(h.puzzle.placements[wi].word);
  });

  // clear the readout
  const out = $('hack-readout');
  if (out) out.innerHTML = '<div class="hr-line">&gt; เลือกคำเพื่อลองรหัส</div>';
}

function pushReadout(text, cls='') {
  const out = $('hack-readout');
  if (!out) return;
  const line = el('div','hr-line ' + cls, '> ' + text);
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

function guessHackWord(word) {
  const h = hackState;
  if (!h || h.done) return;
  if (h.guessed.includes(word)) return;
  h.guessed.push(word);

  const res = checkHackGuess(h.puzzle, word);
  pushReadout(word);
  if (res.correct) {
    h.done = true;
    pushReadout('เข้าถึงระบบสำเร็จ!', 'ok');
    setTimeout(() => enterStealStage(), 900);
    return;
  }
  h.attempts--;
  pushReadout(`ตรงกัน ${res.likeness}/${h.puzzle.len}`, 'warn');
  setText('hack-attempts', h.attempts);
  renderHackTerminal._refreshBlocks && renderHackTerminal._refreshBlocks();
  // grey the guessed word + update attempt blocks
  const grid = $('hack-grid');
  if (grid) grid.querySelectorAll('.hg-ch.word').forEach(ch => {
    const w = h.puzzle.placements[ch.dataset.wi].word;
    if (w === word) ch.classList.add('used');
  });
  const ab = $('hack-attempt-blocks');
  if (ab && ab.children[h.attempts]) ab.children[h.attempts].classList.add('spent');

  if (h.attempts <= 0) {
    h.done = true;
    pushReadout('ล็อกเอาต์ — การเจาะล้มเหลว', 'bad');
    log(`เจาะบ้าน ${h.rival.name} ล้มเหลว (รหัสผิด)`, 'lose');
    setTimeout(() => { toast('เจาะไม่สำเร็จ\nระบบล็อก'); showScreen('raid'); }, 1400);
  }
}

// ── HACK STAGE 2: STEAL MENU ──
function enterStealStage() {
  const h = hackState;
  if (!h) return;
  showScreen('steal');
  const myLv = Math.max(1, ...activeTeam().map(p => p.level));
  const menu = buildLootMenu(h.rival.level, myLv);
  h.loot = menu;

  setText('steal-target', h.rival.name);

  // pick which single pet to send
  const petRow = $('steal-pets');
  petRow.innerHTML = '<div class="steal-lab">เลือก VIRUZ 1 ตัวไปเจาะ:</div>';
  const row = el('div','steal-petrow');
  h.sendPet = null;
  activeTeam().filter(p => p.hp > 0).forEach(p => {
    const card = el('button','steal-pet');
    card.innerHTML = `${creatureMarkup(p,'sp-art')}<span>${p.name}</span><i>Lv.${p.level}</i>`;
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
  if (!h.sendPet) {
    box.innerHTML = '<div class="muted" style="padding:10px">เลือก VIRUZ ก่อน</div>';
    return;
  }
  h.loot.forEach(l => {
    const label = l.kind === 'bitz' ? `${l.amount} Bitz`
      : l.kind === 'exp' ? `EXP Booster +${l.amount}`
      : POTIONS.find(p => p.id === l.potId)?.name || 'Potion';
    const card = el('button','loot-card');
    const autoWin = l.chance >= 100;
    card.innerHTML = `
      <div class="lc-icon">${l.icon}</div>
      <div class="lc-name">${label}</div>
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

  if (mult === 0) {
    // auto-win
    grantLoot(loot);
    finishRaid(true, loot);
    return;
  }
  // Build a defense fight scaled by the multiplier, using the chosen pet.
  startRaidFight(h.rival, h.sendPet, loot, mult);
}

function grantLoot(loot) {
  if (loot.kind === 'bitz') G.bitz += loot.amount;
  else if (loot.kind === 'exp') { grantExp(hackState.sendPet, loot.amount); }
  else if (loot.kind === 'potion') {
    G.potions = G.potions || {};
    G.potions[loot.potId] = (G.potions[loot.potId] || 0) + loot.amount;
  }
}

async function finishRaid(win, loot) {
  const h = hackState;
  G.raids++;
  if (win) {
    const label = loot.kind === 'bitz' ? `${loot.amount} Bitz`
      : loot.kind === 'exp' ? 'EXP Booster' : 'Potion';
    log(`💀 เจาะบ้าน ${h.rival.name} สำเร็จ — ขโมย ${label}`, 'win');
    toast(`เจาะสำเร็จ!\nขโมย ${label}`);
  } else {
    G.bitz = Math.max(0, G.bitz - RAID_LOSS_BITZ);
    log(`เจาะบ้าน ${h.rival.name} ล้มเหลว — เสีย ${RAID_LOSS_BITZ} Bitz`, 'lose');
    toast(`ป้องกันไว้ได้!\nเสีย ${RAID_LOSS_BITZ} Bitz`);
  }
  renderHUD();
  await save();                       // persist bitz/loot BEFORE submitRaid
  await NET.submitRaid(h.rival.uid, { win, loot: win ? loot : null });
  hackState = null;
  showScreen('raid');
  renderRaidList();
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
  // Also record to the persistent PROCESS feed
  feed(msg, cls);
}

// ── PROCESS ACTIVITY FEED ──
// A persistent, timestamped event log shown on the city hub. Built to
// become a chat box later (multiplayer), so it's stored as records.
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
  if (!items.length) {
    box.innerHTML = `<div class="pf-empty">ยังไม่มีความเคลื่อนไหว</div>`;
    return;
  }
  box.innerHTML = items.map(it =>
    `<div class="pf-line ${it.cls}">
       <span class="pf-time">${feedTime(it.t)}</span>
       <span class="pf-msg">${it.msg}</span>
     </div>`).join('');
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

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 3000);
}

function modal(title, builder) {
  const back = $('modal-back');
  const body = $('modal-body');
  setText('modal-title', title);
  body.innerHTML = '';
  builder(body);
  back.classList.add('on');
  $('modal-close').onclick = closeModal;
  back.onclick = e => { if (e.target === back) closeModal(); };
}
function closeModal() { $('modal-back').classList.remove('on'); }

// ═══════════════ EXPOSE FOR HTML ═══════════════
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
