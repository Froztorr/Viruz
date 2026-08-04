// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { ANTIVIRUZ, BOSS_TUNING, MAPS, rollEquipment, zoneById, zonesOfMap } from '../data.js';
import { grantExp } from '../engine.js';
import { creatureMarkupFor } from '../sprites.js';
import { eliteChanceAt, heatBadge, heatMeterPct } from '../heat.js';
import { ensureBossSpawned, startBossFight, startMimicAmbush, startZone } from '../battle/encounters.js';
import { wait } from '../battle/extras.js';
import { openBotnetModal } from './botnet.js';
import { $, G, activeTeam, battle, creatureMarkup, el, save, setText } from '../state.js';
import { closeModal, modal, renderHUD, showScreen, toast } from '../ui-shell.js';

// ═══════════════ SCREEN: HACK ═══════════════
// ── WORLD MAP ──
// Looping video background with clickable pins positioned by percentage.
let currentMapId = 'forest';   // synced with G.currentMapId, see renderWorld()

// G.worldPos = { mapId, nodeId } tracks exactly where the player is
// currently standing — a zone id, or the synthetic ids 'warpIn'/
// 'warpOut'. Tapping the node you're already at skips the train ride
// entirely; tapping anywhere else rides the train there first (see
// travelTo()). The region boss never touches this — its position is
// random and fighting it doesn't move the player (see openBossBrief()).
function worldNodeCoords(map, nodeId) {
  if (nodeId === 'warpIn') return map.warpIn;
  if (nodeId === 'warpOut') return map.warpOut;
  const z = zoneById(nodeId);
  return z ? { x: z.x, y: z.y } : null;
}
function isAtWorldNode(nodeId) {
  return !!(G.worldPos && G.worldPos.mapId === currentMapId && G.worldPos.nodeId === nodeId);
}

// ── TWO-TAP NODE CONFIRM ──
// Tapping a node no longer fires travel/the fight briefing straight
// away — the first tap just "arms" that node, expanding its pin-card
// (name/level/kind, the .pin-extra detail) same as the old hover/active
// reveal, and auto-disarms after 5s if never confirmed. Tapping the
// SAME node again within that window is the actual confirm and runs
// the real action; tapping any OTHER node re-arms fresh on that one
// instead (whichever pin is armed, only one at a time). The region
// boss pin is unaffected — it was never a travel target to begin with.
let armedPinId = null;
let armedPinTimer = null;
function disarmPin() {
  clearTimeout(armedPinTimer);
  armedPinTimer = null;
  armedPinId = null;
  document.querySelectorAll('.zone-pin.armed').forEach(p => p.classList.remove('armed'));
}
function wireArmedPinTap(pin, id, action) {
  pin.onclick = () => {
    if (armedPinId === id) { disarmPin(); action(); return; }
    disarmPin();
    armedPinId = id;
    pin.classList.add('armed');
    armedPinTimer = setTimeout(disarmPin, 5000);
  };
}

// Trace/heat readout for a battle node. Farming one node builds heat
// toward an elite and eventually the hunter (see src/heat.js) — that
// was previously invisible, so the player had no way to know an
// ambush was building. Returns '' below the first warning threshold so
// a freshly-visited node stays uncluttered.
function heatLineFor(zoneId) {
  const pct = heatMeterPct(G, zoneId);
  const badge = heatBadge(pct);
  if (!badge) return '';
  return `<em style="color:${badge.color}">${badge.icon} ${badge.label}</em>`;
}

export function renderWorld() {
  currentMapId = G.currentMapId || currentMapId;
  const map = MAPS.find(m => m.id === currentMapId) || MAPS[0];
  if (!G.worldPos || !MAPS.some(m => m.id === G.worldPos.mapId)) {
    G.worldPos = { mapId: map.id, nodeId: 'warpIn' };
  }
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
          <span class="pin-extra"><i>${z.thai}</i><em>พักฟื้น · ร้านยา</em></span>
        </span>`;
      const go = () => { G.lastSafe = z.id; showScreen('safe'); };
      wireArmedPinTap(pin, z.id, () => { if (isAtWorldNode(z.id)) go(); else travelTo(z.id, go); });
    } else {
      // Warn when the zone is well above the team's level
      const gap = z.lv[0] - teamLv;
      const tier = gap > 8 ? 'hard' : gap > 0 ? 'warn' : 'ok';
      pin.classList.add(tier);
      pin.innerHTML = `
        <span class="pin-dot"></span>
        <span class="pin-card">
          <b>${z.name}</b>
          <span class="pin-extra"><i>${z.thai}</i><em>Lv ${z.lv[0]}–${z.lv[1]}</em>${heatLineFor(z.id)}</span>
        </span>`;
      wireArmedPinTap(pin, z.id, () => { if (isAtWorldNode(z.id)) openZone(z); else travelTo(z.id, () => openZone(z)); });
    }
    layer.appendChild(pin);
  });

  // Warp gates — warpIn is where the player lands on their first ever
  // visit to this map; warpOut (only if this isn't the last map) rides
  // to the next one. Both use the same travel-or-direct routing as a
  // normal zone.
  if (map.warpIn) {
    const pin = el('button', 'zone-pin warp-in');
    pin.style.left = map.warpIn.x + '%';
    pin.style.top  = map.warpIn.y + '%';
    pin.innerHTML = `
      <span class="pin-dot"></span>
      <span class="pin-card"><b>🌀 Warp Gate</b><span class="pin-extra"><i>จุดเริ่มต้น</i></span></span>`;
    wireArmedPinTap(pin, 'warpIn', () => { if (isAtWorldNode('warpIn')) openWarpInMenu(map); else travelTo('warpIn', () => {}); });
    layer.appendChild(pin);
  }
  const mapIdx = MAPS.findIndex(m => m.id === map.id);
  const nextMap = MAPS[mapIdx + 1];
  if (map.warpOut && nextMap) {
    const pin = el('button', 'zone-pin warp-out');
    pin.style.left = map.warpOut.x + '%';
    pin.style.top  = map.warpOut.y + '%';
    pin.innerHTML = `
      <span class="pin-dot"></span>
      <span class="pin-card"><b>🌀 Warp Gate</b><span class="pin-extra"><em>ไปยัง ${nextMap.name}</em></span></span>`;
    const go = () => openWarpGate(map, nextMap);
    wireArmedPinTap(pin, 'warpOut', () => { if (isAtWorldNode('warpOut')) go(); else travelTo('warpOut', go); });
    layer.appendChild(pin);
  }

  // Region boss — one wandering pin per map, near whichever battle
  // zone it's currently occupying. Offset from the zone's own
  // coordinates (clamped on-canvas) so it sits NEXT TO that pin
  // instead of exactly on top of it — stacking them at identical
  // coordinates made the zone underneath unclickable. Unlike every
  // other pin, this one is a direct fight, never a train ride — its
  // spot is random each time, not a real "place" to travel to — and
  // winning/losing leaves the player's position untouched.
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
          <span class="pin-extra"><i>${bz.name}</i><em>Boss Lv???</em></span>
        </span>`;
      pin.onclick = () => openBossBrief(map.id, bossSt, bz);
      layer.appendChild(pin);
    }
  }

  // "You are here" marker — sits on top of whichever node the player
  // is currently standing at, a small crop of their first team pet.
  if (G.worldPos && G.worldPos.mapId === map.id) {
    const coords = worldNodeCoords(map, G.worldPos.nodeId);
    const pet = activeTeam()[0] || G.roster[0];
    if (coords && pet) {
      const marker = el('div', 'here-marker');
      marker.style.left = coords.x + '%';
      marker.style.top  = coords.y + '%';
      marker.innerHTML = `<div class="here-marker-ring">${creatureMarkup(pet, '')}</div><div class="here-marker-tail"></div>`;
      layer.appendChild(marker);
    }
  }
}

// Confirmation before actually stepping through a warpOut gate into
// the next map — resets G.worldPos to that map's own warpIn.
function openWarpGate(map, nextMap) {
  modal(`🌀 Warp Gate`, wrap => {
    const box = el('div', 'zone-brief');
    box.innerHTML = `
      <div class="zb-desc">ประตูมิติเชื่อมสู่ ${nextMap.name} (${nextMap.thai})</div>
      <div class="zb-meta"><span>ระดับศัตรู <b>Lv ${nextMap.levelRange[0]}–${nextMap.levelRange[1]}</b></span></div>`;
    const go = el('button', 'btn primary wide', '🌀 ก้าวเข้าประตู');
    go.onclick = () => {
      closeModal();
      currentMapId = nextMap.id;
      G.currentMapId = nextMap.id;
      G.worldPos = { mapId: nextMap.id, nodeId: 'warpIn' };
      save();
      renderWorld();
    };
    box.appendChild(go);
    wrap.appendChild(box);
  });
}

// Standing at a map's own warpIn gate (the entry point) offers two
// exits instead of a plain travel target: step back to the PREVIOUS
// realm (arriving at ITS warpOut, mirroring the forward warpOut trip),
// or leave the warp-gate world entirely for the Real World hub map.
function openWarpInMenu(map) {
  const mapIdx = MAPS.findIndex(m => m.id === map.id);
  const prevMap = MAPS[mapIdx - 1];
  modal('🌀 Warp Gate', wrap => {
    const box = el('div', 'zone-brief');
    box.innerHTML = `<div class="zb-desc">จุดเริ่มต้นของ ${map.name} (${map.thai})</div>`;
    if (prevMap) {
      const back = el('button', 'btn wide', `◀ ย้อนกลับไปยัง ${prevMap.name}`);
      back.onclick = () => {
        closeModal();
        currentMapId = prevMap.id;
        G.currentMapId = prevMap.id;
        G.worldPos = { mapId: prevMap.id, nodeId: 'warpOut' };
        save();
        renderWorld();
      };
      box.appendChild(back);
    }
    // Botnet is also reachable from here so an idle expedition can be
    // checked on without first walking to a battle node.
    const bn = el('button', 'btn wide', G.botnet ? '🤖 Botnet (กำลังทำงาน)' : '🤖 Botnet');
    bn.onclick = () => { closeModal(); openBotnetModal(); };
    box.appendChild(bn);
    const home = el('button', 'btn primary wide', '🏠 กลับสู่โลกจริง');
    home.onclick = () => { closeModal(); showScreen('map'); };
    box.appendChild(home);
    wrap.appendChild(box);
  });
}

// ── TRAIN TRAVEL ──
// A pixel-style train rides from the player's current node to the
// destination, drawing a broken trail line behind it (a "rail" div
// whose width grows and whose dashed top border reads as the track),
// 3-5s scaled by on-screen distance. 30% chance of a single Mimic
// ambush partway through — battle plays out for real, a win offers a
// 3-card reward choice, then the ride resumes to the same destination.
const TRAIN_SVG = `<svg viewBox="0 0 40 30" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="9" width="25" height="15" fill="#2b2f3a" stroke="#000" stroke-width="1"/>
  <rect x="5" y="3" width="11" height="8" fill="#3df0ff" stroke="#000" stroke-width="1"/>
  <rect x="26" y="13" width="9" height="9" fill="#ffd23f" stroke="#000" stroke-width="1"/>
  <circle cx="8" cy="25" r="3.4" fill="#111" stroke="#666" stroke-width="1"/>
  <circle cx="18" cy="25" r="3.4" fill="#111" stroke="#666" stroke-width="1"/>
</svg>`;
let worldTravelBusy = false;
function animateRailTo(rail, totalDist, ms, fromDist) {
  return new Promise(resolve => {
    rail.style.transition = 'none';
    rail.style.width = fromDist + 'px';
    void rail.offsetWidth;
    requestAnimationFrame(() => {
      rail.style.transition = `width ${ms}ms linear`;
      rail.style.width = totalDist + 'px';
    });
    setTimeout(resolve, ms);
  });
}
export async function travelTo(destNodeId, onArrive) {
  if (worldTravelBusy) return;
  const map = MAPS.find(m => m.id === currentMapId);
  if (!map || !G.worldPos) return;
  const fromCoords = worldNodeCoords(map, G.worldPos.nodeId);
  const toCoords = worldNodeCoords(map, destNodeId);
  if (!fromCoords || !toCoords) return;

  worldTravelBusy = true;
  const stage = $('world-stage');
  const trainLayer = $('world-train-layer');
  const rect = stage.getBoundingClientRect();
  const x0 = (fromCoords.x / 100) * rect.width, y0 = (fromCoords.y / 100) * rect.height;
  const x1 = (toCoords.x / 100) * rect.width, y1 = (toCoords.y / 100) * rect.height;
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const angle = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
  const maxDist = Math.hypot(rect.width, rect.height);
  const duration = 3000 + Math.min(1, dist / maxDist) * 2000;

  const rail = el('div', 'train-rail');
  rail.style.left = x0 + 'px';
  rail.style.top = y0 + 'px';
  rail.style.transform = `rotate(${angle}deg)`;
  rail.innerHTML = `<div class="train-sprite">${TRAIN_SVG}</div>`;
  trainLayer.innerHTML = '';
  trainLayer.appendChild(rail);

  const ambush = Math.random() < 0.3;
  const ambushFrac = 0.4 + Math.random() * 0.3;

  await animateRailTo(rail, ambush ? dist * ambushFrac : dist, ambush ? duration * ambushFrac : duration, 0);

  if (ambush) {
    const flash = el('div', 'train-ambush-flash', '<span>⚠ MIMIC!</span>');
    trainLayer.appendChild(flash);
    await wait(650);
    flash.remove();
    const teamLv = Math.max(1, ...activeTeam().map(p => p.level));
    const mimicLevel = teamLv + 10 + Math.floor(Math.random() * 6);
    const { win, mimic } = await startMimicAmbush(mimicLevel);
    if (win) await showMimicRewardCards(mimic);
    await animateRailTo(rail, dist, duration * (1 - ambushFrac), dist * ambushFrac);
  }

  trainLayer.innerHTML = '';
  worldTravelBusy = false;
  G.worldPos = { mapId: currentMapId, nodeId: destNodeId };
  save();
  renderWorld();
  onArrive();
}

// Pick exactly one reward — gold coin (Bitz), thunder (EXP split
// across the team), or sword (a guaranteed rare-or-better equip roll).
export function showMimicRewardCards(mimic) {
  return new Promise(resolve => {
    const bitzAmt = Math.round(20 * mimic.level * (1 + Math.random() * 0.4));
    const expAmt = Math.round(15 * mimic.level * (1 + Math.random() * 0.4));
    modal('🎁 เอาชนะ Mimic!', wrap => {
      const box = el('div');
      box.innerHTML = `
        <div class="muted" style="text-align:center;margin-bottom:8px">เลือกรางวัลได้ 1 อย่าง</div>
        <div class="reward-cards">
          <div class="reward-card" data-t="bitz"><div class="rc-icon">💰</div><div class="rc-label">+${bitzAmt} Bitz</div></div>
          <div class="reward-card" data-t="exp"><div class="rc-icon">⚡</div><div class="rc-label">+${expAmt} EXP</div></div>
          <div class="reward-card" data-t="item"><div class="rc-icon">⚔️</div><div class="rc-label">ไอเทมหายาก+</div></div>
        </div>`;
      box.querySelectorAll('.reward-card').forEach(c => {
        c.onclick = () => {
          const t = c.dataset.t;
          if (t === 'bitz') {
            G.bitz += bitzAmt;
            toast(`💰 +${bitzAmt} Bitz`);
          } else if (t === 'exp') {
            const team = activeTeam();
            const share = Math.floor(expAmt / Math.max(1, team.length));
            team.forEach(p => grantExp(p, share));
            toast(`⚡ +${expAmt} EXP`);
          } else {
            const grade = ['polymorphic', 'zeroday', 'apt'][Math.floor(Math.random() * 3)];
            const maxLevel = Math.max(1, ...activeTeam().map(p => p.level));
            const item = rollEquipment(maxLevel, grade);
            G.equipBag = G.equipBag || [];
            G.equipBag.push(item);
            toast(`⚔️ ได้ ${item.name}!`);
          }
          save(); renderHUD();
          closeModal();
          resolve();
        };
      });
      wrap.appendChild(box);
    }, { dismissable: false });
  });
}

// Boss briefing — same spirit as openZone()'s briefing but for the
// wandering region boss. Real level/stats are revealed here (the
// map pin itself only ever shows "Lv???").
function openBossBrief(mapId, bossSt, zone) {
  modal(`⚠ Region Boss · ${zone.name}`, wrap => {
    const box = el('div', 'zone-brief');
    box.innerHTML = `
      <div class="zb-desc">บอสประจำธูมิบาค — สุ่มจาก 3 มอนสเตอร์ที่แข็งแกร่งที่สุดในพื้นที่นี้
        ขนาดใหม่กว่าปกติ 1.5 เท่า มี HP 2 ชั้น — เมื่อแถบแรกหมด จะเข้าสู่สพาวะคลั่ง (ATK +50%)</div>
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
    const pct = heatMeterPct(G, z.id);
    const eliteChance = Math.round(eliteChanceAt(G, z.id) * 100);
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
      ${pct > 0 ? `<div class="zb-meta">
        <span>🔥 Trace <b>${pct}%</b></span>
        <span>โอกาสเจอตัวใหน่ <b>${eliteChance}%</b></span>
      </div>` : ''}
      ${pct >= 60 ? `<div class="zb-warn">🚨 Trace สูง — ถ้าเต็ม 100% นักล่า (Marshal Imp) จะโผล่ออกมา</div>` : ''}
    `;
    const go = el('button','btn primary wide','⚔ เข้าสู้');
    go.onclick = () => { closeModal(); startZone(z); };
    box.appendChild(go);
    // Send an idle squad here instead of fighting in person. Placed as
    // the secondary action so the primary tap target stays the fight.
    const bn = el('button','btn wide', G.botnet ? '🤖 Botnet (กำลังทำงาน)' : '🤖 ส่ง Botnet มาที่นี่');
    bn.onclick = () => { closeModal(); openBotnetModal(); };
    box.appendChild(bn);
    wrap.appendChild(box);
  });
}

