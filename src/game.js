// ═══════════════════════════════════════════════════════════
// VIRUZ PET — GAME
// State, screens, battle loop, DOM rendering.
// ═══════════════════════════════════════════════════════════

import {
  ATTR, ATTR_KEYS, RARITY, RARITY_KEYS, SPECIES, SPECIES_KEYS,
  HACK_TARGETS, EGGS, ITEMS, DEFENSE_BOTS, MAP_NODES, TUNING,
  SYNERGY, WHITE_TRAITS,
} from './data.js';
import {
  createPet, rollEgg, statsOf, combatStats, powerOf, teamPower,
  synergyOf, supportOf, computeDamage, turnOrder, grantExp,
  canEvolve, evolve, buildHackRun, resolveRaid, healTeam,
  teamAlive, availableSkills, clamp,
} from './engine.js';
import { NET } from './net.js';
import { creatureMarkupFor, gifURL } from './sprites.js';

// Creatures come from either real GIF art or procedural SVG —
// creatureMarkupFor() picks per species, so both coexist.
function creatureMarkup(pet, cls, anim = 'still') {
  const sp = SPECIES[pet.speciesId] || { shape: pet.shape, gif: pet.gif, name: pet.name };
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
const SCREENS = ['intro','map','home','clinic','shop','hack','battle','arena','raid'];
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
  if (id === 'hack')   renderHackTargets();
  if (id === 'raid')   renderRaidList();
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
  setText('hud-roster', G.roster.length);
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
  card.innerHTML = `
    <div class="pc-top">
      <span class="pc-attr" title="${a.desc}">${a.icon}</span>
      <span class="pc-rar">${r.name}</span>
    </div>
    ${creatureMarkup(pet, 'pc-sprite float')}
    <div class="pc-name">${pet.name}${trait ? ` <span class="pc-trait" title="${trait.desc}">${trait.icon}</span>` : ''}</div>
    <div class="pc-lv">Lv.${pet.level}/${pet.maxLv} · St.${pet.stage+1}</div>
    <div class="pc-bar"><i style="width:${hpPct}%"></i></div>
    <div class="pc-hp">${pet.hp}/${s.mhp}</div>
    <div class="pc-stats">
      <span>⚔ ${s.atk}</span><span>🛡 ${s.def}</span><span>⚡ ${s.spd}</span>
    </div>`;
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
function renderHackTargets() {
  const wrap = $('hack-list');
  wrap.innerHTML = '';
  HACK_TARGETS.forEach(t => {
    const card = el('div','hack-card');
    card.style.setProperty('--tier', t.color);
    card.innerHTML = `
      <div class="hc-head">
        <span class="hc-name">${t.name}</span>
        <span class="hc-tier">${t.tier}</span>
      </div>
      <div class="hc-desc">${t.desc}</div>
      <div class="hc-meta">
        <span>คลื่น ${t.waves[0]}–${t.waves[1]}</span>
        <span>Lv ${t.enemyLv[0]}–${t.enemyLv[1]}</span>
        <span>Bitz ×${t.reward.bitzMult}</span>
      </div>
      <button class="btn wide">เริ่มเจาะระบบ</button>`;
    card.querySelector('button').onclick = () => startHack(t);
    wrap.appendChild(card);
  });
}

// ═══════════════ BATTLE ═══════════════
function startHack(target) {
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
  const a = activeAlly(), f = activeFoe();
  [[a,'plate-ally'],[f,'plate-foe']].forEach(([pet, plateId]) => {
    if (!pet) return;
    const plate = $(plateId);
    const b = plate && plate.querySelector('.np-hp b');
    if (b) b.textContent = Math.max(0, pet.hp);
    const u = document.querySelector(`.bunit[data-uid="${pet.uid}"]`);
    if (u) u.classList.toggle('dead', pet.hp <= 0);
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

    const skills = availableSkills(attacker);
    const skill = skills[Math.floor(Math.random() * skills.length)] || { n:'Strike', pw:35 };
    const res = computeDamage(attacker, side==='ally'?battle.team:battle.enemies,
                              target, side==='ally'?battle.enemies:battle.team,
                              skill, !!skill.special);

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

    const atkSpecies = SPECIES[attacker.speciesId];
    if (img) {
      img.classList.remove('float');
      img.classList.add('attacking');
      if (atkSpecies && atkSpecies.gif && img.tagName === 'IMG') {
        img.dataset.stillSrc = img.getAttribute('src');
        img.setAttribute('src', gifURL(atkSpecies.gif, 'attack'));
      }
    }

    // wind up, then lunge
    aEl.classList.add('wind-up');
    setTimeout(() => {
      aEl.classList.remove('wind-up');
      aEl.classList.add('lunge-out');

      setTimeout(() => {
        // ── CONTACT ──
        impactBurst(tEl, res.crit);
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

  if (win) {
    G.wins++;
    G.bitz += battle.totalBitz;
    const share = Math.floor(battle.totalExp / Math.max(1, battle.team.length));
    battle.team.forEach(p => {
      const evs = grantExp(p, share);
      evs.forEach(e => {
        if (e.type === 'levelup') blog(`⬆️ ${p.name} → Lv.${e.level} (+${e.pts} แต้ม)`, 'buff');
        if (e.type === 'skill')   blog(`✨ ${p.name} ปลดล็อก ${e.name}`, 'buff');
      });
    });
    blog(`สำเร็จ! +${battle.totalExp} EXP · +${battle.totalBitz} Bitz`, 'win');
    toast(`เจาะสำเร็จ!\n+${battle.totalBitz} Bitz`);
    log(`ชนะ ${battle.mode === 'hack' ? battle.target.name : 'Arena'} · +${battle.totalBitz} Bitz`, 'win');
  } else {
    battle.team.forEach(p => {
      if (p.hp <= 0) p.hp = Math.max(1, Math.floor(statsOf(p).mhp * TUNING.loseHpRestore));
    });
    blog('การเจาะล้มเหลว — ทีมถูกตรวจจับ', 'lose');
    toast('ล้มเหลว\nทีมกลับมาพร้อม HP 10%');
    log(`แพ้ ${battle.mode === 'hack' ? battle.target.name : 'Arena'}`, 'lose');
  }
  save();
  const done = $('battle-done');
  done.style.display = '';
  done.onclick = () => {
    done.style.display = 'none';
    battle = null;
    showScreen('map');
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

async function doRaid(rival) {
  const team = activeTeam();
  if (!teamAlive(team)) { toast('ทีมหมด HP'); return; }
  const res = resolveRaid(team, { ...rival.defense, loot: rival.loot });
  G.raids++;
  if (res.win) G.bitz += res.loot;
  // Attacking costs HP regardless of outcome
  team.forEach(p => {
    const m = statsOf(p).mhp;
    const cost = Math.floor(m * (res.win ? 0.18 : 0.32));
    p.hp = clamp(p.hp - cost, 1, m);
  });
  await NET.submitRaid(rival.uid, res);
  await save();

  modal(res.win ? '✅ เจาะฐานสำเร็จ' : '❌ การเจาะล้มเหลว', wrap => {
    const box = el('div','raid-result');
    box.innerHTML = `
      <div class="rr-vs">
        <span>คุณ ${res.atkPower.toLocaleString()}</span>
        <span class="rr-x">VS</span>
        <span>${rival.name} ${res.defPower.toLocaleString()}</span>
      </div>
      <div class="rr-log">${res.log.map(l =>
        `<div class="rr-line ${l.t}">${l.m}</div>`).join('')}</div>`;
    wrap.appendChild(box);
  });
  log(res.win ? `เจาะฐาน ${rival.name} สำเร็จ +${res.loot} Bitz`
              : `เจาะฐาน ${rival.name} ล้มเหลว`, res.win ? 'win' : 'lose');
  renderHUD();
  renderRaidList();
}

// ═══════════════ LOG / TOAST / MODAL ═══════════════
function log(msg, cls = 'info') {
  const box = $('log-box');
  if (!box) return;
  const line = el('div', 'log-line ' + cls, msg);
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 60) box.removeChild(box.firstChild);
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
};

boot();
