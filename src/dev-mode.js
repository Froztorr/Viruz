// VIRUZ PET — safe in-game dev patch exporter
// This tool NEVER rewrites game files in-browser. It saves local edits and exports
// a small JSON patch the developer can paste into chat for manual code edits.
//
// SCOPE: city nodes, world nodes and enemy overrides. The battle screen
// is NOT edited here any more -- see src/dev-battle-sim.js. The editor
// that used to live in this file moved battle UI with position:absolute
// + left/top, which pulls an element out of normal flow and collapses
// the rows laid out around it, and it painted its own drag dots over
// the simulator's. One owner per screen; the 🎛️ button below just opens
// the simulator.
//
// ui-shell is imported as a NAMESPACE on purpose. main.js imports this
// module statically, so a named import of something ui-shell does not
// export would fail at link time and take the entire game down with it
// -- a dev tool must never be able to do that.

import { MAP_NODES, ZONES, ANTIVIRUZ, ATTR } from './data.js';
import { $, G, el } from './state.js';
import * as UI from './ui-shell.js';
import { creatureMarkupFor } from './sprites.js';

const DEV_FLAG_KEY = 'viruz.devMode.enabled';
const PATCH_KEY = 'viruz.devMode.patchExport.v3';
const OLD_PATCH_KEY = 'viruz.devMode.patchExport.v2';

// Nodes authored here that have since been written into the real source
// files. Without this, applySavedPatch() keeps re-injecting the local
// draft on every boot and the map shows two pins on the same spot: the
// real one, and the stale draft still carrying the placeholder level
// range and rewards it was exported with. Listing the id retires just
// that draft, on every device, with no need to remember to press
// "Clear local dev edits" (which would also throw away unrelated work).
const PROMOTED_LOCAL_IDS = ['zone_mskmkaqw'];   // -> gs_commander (Commander's Room)

let enabled = localStorage.getItem(DEV_FLAG_KEY) === '1';
let wired = false;
let dragging = null;

const clone = x => JSON.parse(JSON.stringify(x));
const round = n => Math.round(Number(n || 0) * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const baseCity = new Map(MAP_NODES.map(n => [n.id, clone(n)]));
const baseZones = new Map(ZONES.map(z => [z.id, clone(z)]));
const ENEMY_KEYS = Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_'));

// ── SHELL HELPERS ──
// Use the game's own modal when it has one, and a small self-contained
// sheet when it does not, so the DEV panel is always reachable.
function toast(msg) { if (typeof UI.toast === 'function') UI.toast(msg); else console.log('[dev]', msg); }
function closeModal() {
  document.getElementById('dev-fallback-modal')?.remove();
  if (typeof UI.closeModal === 'function') UI.closeModal();
}
function modal(title, build) {
  if (typeof UI.modal === 'function') { UI.modal(title, build); return; }
  closeModal();
  const back = el('div');
  back.id = 'dev-fallback-modal';
  back.innerHTML = `<div class="dev-fb-card"><div class="dev-fb-head"><b></b><button type="button" class="dev-fb-x">×</button></div><div class="dev-fb-body"></div></div>`;
  back.querySelector('b').textContent = title;
  back.querySelector('.dev-fb-x').onclick = closeModal;
  document.body.appendChild(back);
  build(back.querySelector('.dev-fb-body'));
}

function blankPatch() {
  return {
    city:{}, zones:{}, newCity:[], newZones:[], deletedCity:[], deletedZones:[],
    enemyOverrides:{}, notes:'Safe Dev Mode export only. Paste this JSON in chat so code can be edited manually.'
  };
}
function loadPatch() {
  try {
    const raw = localStorage.getItem(PATCH_KEY) || localStorage.getItem(OLD_PATCH_KEY) || '{}';
    return Object.assign(blankPatch(), JSON.parse(raw));
  } catch { return blankPatch(); }
}
function savePatch(p) { localStorage.setItem(PATCH_KEY, JSON.stringify(Object.assign(blankPatch(), p))); }
// Absolute positions written by the retired battle editor. Left in
// place they would keep re-applying over the simulator's transforms.
function dropLegacyBattleLayout() {
  const p = loadPatch();
  if (p.battleLayout && Object.keys(p.battleLayout).length) { delete p.battleLayout; savePatch(p); }
  document.querySelectorAll('.dev-moved-battle-ui').forEach(node => {
    node.classList.remove('dev-moved-battle-ui');
    node.style.left = ''; node.style.top = ''; node.style.right = ''; node.style.bottom = '';
  });
}
// Runs before anything is applied, so a promoted draft never reaches the
// map. Also removes it if an earlier applySavedPatch() already pushed it.
function dropPromotedLocalEdits() {
  const p = loadPatch();
  let changed = false;
  PROMOTED_LOCAL_IDS.forEach(id => {
    if ((p.newZones || []).some(z => z.id === id)) { p.newZones = p.newZones.filter(z => z.id !== id); changed = true; }
    if ((p.newCity || []).some(n => n.id === id)) { p.newCity = p.newCity.filter(n => n.id !== id); changed = true; }
    if (p.zones?.[id]) { delete p.zones[id]; changed = true; }
    if (p.city?.[id]) { delete p.city[id]; changed = true; }
    if (p.enemyOverrides?.[id]) { delete p.enemyOverrides[id]; changed = true; }
    const zi = ZONES.findIndex(z => z.id === id); if (zi >= 0) ZONES.splice(zi, 1);
    const ci = MAP_NODES.findIndex(n => n.id === id); if (ci >= 0) MAP_NODES.splice(ci, 1);
  });
  // Saving a node without editing it records an empty diff against the
  // base values. It applies as a no-op, but it rides along in every
  // later export and reads like a change that was made.
  ['zones', 'city'].forEach(k => Object.keys(p[k] || {}).forEach(id => {
    if (!Object.keys(p[k][id] || {}).length) { delete p[k][id]; changed = true; }
  }));
  if (changed) savePatch(p);
}
function changedOnly(base, now, keys) {
  const out = {};
  keys.forEach(k => { if (JSON.stringify(base?.[k]) !== JSON.stringify(now?.[k])) out[k] = clone(now[k]); });
  return out;
}
function upsertCityPatch(node) {
  const p = loadPatch();
  if (baseCity.has(node.id)) p.city[node.id] = changedOnly(baseCity.get(node.id), node, ['label','x','y','textX','textY','zoneR','screen','hint']);
  else { const i = p.newCity.findIndex(n => n.id === node.id); if (i >= 0) p.newCity[i] = clone(node); else p.newCity.push(clone(node)); }
  p.deletedCity = p.deletedCity.filter(id => id !== node.id); savePatch(p);
}
function upsertZonePatch(zone) {
  const p = loadPatch();
  if (baseZones.has(zone.id)) p.zones[zone.id] = changedOnly(baseZones.get(zone.id), zone, ['map','kind','order','name','thai','x','y','lv','waves','pool','reward','desc','targetMapId','icon','enemyOverrides']);
  else { const i = p.newZones.findIndex(z => z.id === zone.id); if (i >= 0) p.newZones[i] = clone(zone); else p.newZones.push(clone(zone)); }
  p.deletedZones = p.deletedZones.filter(id => id !== zone.id); savePatch(p);
}
function saveEnemyOverride(zoneId, enemyId, over) {
  const p = loadPatch();
  p.enemyOverrides[zoneId] = p.enemyOverrides[zoneId] || {};
  p.enemyOverrides[zoneId][enemyId] = over;
  savePatch(p);
  const z = ZONES.find(x => x.id === zoneId);
  if (z) { z.enemyOverrides = z.enemyOverrides || {}; z.enemyOverrides[enemyId] = over; upsertZonePatch(z); }
}
function removeCity(id) { const p = loadPatch(); delete p.city[id]; p.newCity = p.newCity.filter(n => n.id !== id); if (baseCity.has(id) && !p.deletedCity.includes(id)) p.deletedCity.push(id); savePatch(p); const i = MAP_NODES.findIndex(n => n.id === id); if (i >= 0) MAP_NODES.splice(i, 1); }
function removeZone(id) { const p = loadPatch(); delete p.zones[id]; p.newZones = p.newZones.filter(z => z.id !== id); if (baseZones.has(id) && !p.deletedZones.includes(id)) p.deletedZones.push(id); savePatch(p); const i = ZONES.findIndex(z => z.id === id); if (i >= 0) ZONES.splice(i, 1); }
function applySavedPatch() {
  dropPromotedLocalEdits();
  const p = loadPatch();
  Object.entries(p.city || {}).forEach(([id, diff]) => { const n = MAP_NODES.find(x => x.id === id); if (n) Object.assign(n, clone(diff)); });
  Object.entries(p.zones || {}).forEach(([id, diff]) => { const z = ZONES.find(x => x.id === id); if (z) Object.assign(z, clone(diff)); });
  (p.newCity || []).forEach(n => { if (!MAP_NODES.some(x => x.id === n.id)) MAP_NODES.push(clone(n)); });
  (p.newZones || []).forEach(z => { if (!ZONES.some(x => x.id === z.id)) ZONES.push(clone(z)); });
  (p.deletedCity || []).forEach(id => { const i = MAP_NODES.findIndex(n => n.id === id); if (i >= 0) MAP_NODES.splice(i, 1); });
  (p.deletedZones || []).forEach(id => { const i = ZONES.findIndex(z => z.id === id); if (i >= 0) ZONES.splice(i, 1); });
  Object.entries(p.enemyOverrides || {}).forEach(([zid, map]) => { const z = ZONES.find(x => x.id === zid); if (z) z.enemyOverrides = clone(map); });
}
function currentScreen() { return $('app')?.dataset.screen; }
function currentMapId() { return G.currentMapId || 'forest'; }
function refresh() { window.VIRUZ?.showScreen?.(currentScreen() || 'map'); setTimeout(installOverlays, 100); }
function uniqueId(prefix, list) { let id; do { id = `${prefix}_${Date.now().toString(36)}`; } while (list.some(x => x.id === id)); return id; }
function enemyPool() { return ENEMY_KEYS.slice(0, 2); }
function stageFor(kind) { return kind === 'city' ? $('map-stage') : $('world-stage'); }
function pos(e, stage) { const r = stage.getBoundingClientRect(); return { x: round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))), y: round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))) }; }
function setEnabled(on) { enabled = !!on; localStorage.setItem(DEV_FLAG_KEY, enabled ? '1' : '0'); renderButton(); installOverlays(); toast(enabled ? 'Dev Mode ON' : 'Dev Mode OFF'); }
function renderButton() { let btn = $('dev-mode-btn'); if (!btn) { btn = document.createElement('button'); btn.id = 'dev-mode-btn'; btn.type = 'button'; btn.textContent = '⚙️ DEV'; document.body.appendChild(btn); } btn.classList.toggle('on', enabled); btn.onclick = openPanel; }
// The battle screen is deliberately absent here: src/dev-battle-sim.js
// owns it and installs its own handles.
function installOverlays() { document.querySelectorAll('.dev-overlay').forEach(x => x.remove()); if (!enabled) return; if (currentScreen() === 'map') installCityOverlay(); if (currentScreen() === 'world') installWorldOverlay(); }
function installCityOverlay() { const stage = $('map-stage'); if (!stage) return; const layer = el('div', 'dev-overlay'); MAP_NODES.forEach(n => dot(layer, 'city', n.id, n.x, n.y, n.label)); stage.appendChild(layer); }
function installWorldOverlay() { const stage = $('world-stage'); if (!stage) return; const layer = el('div', 'dev-overlay'); ZONES.filter(z => z.map === currentMapId()).forEach(z => dot(layer, 'zone', z.id, z.x, z.y, z.name)); stage.appendChild(layer); }
function dot(layer, kind, id, x, y, label) { const b = el('button', 'dev-dot', '✥'); b.style.left = x + '%'; b.style.top = y + '%'; b.title = label || id; b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); dragging = { kind, id }; b.setPointerCapture?.(e.pointerId); }; b.onpointermove = e => { if (!dragging || dragging.id !== id) return; const p = pos(e, stageFor(kind)); b.style.left = p.x + '%'; b.style.top = p.y + '%'; if (kind === 'city') { const n = MAP_NODES.find(v => v.id === id); if (n) { n.x = p.x; n.y = p.y; upsertCityPatch(n); } } else { const z = ZONES.find(v => v.id === id); if (z) { z.x = p.x; z.y = p.y; upsertZonePatch(z); } } }; b.onpointerup = e => { e.preventDefault(); e.stopPropagation(); dragging = null; openEditor(kind, id); }; layer.appendChild(b); }
function openPanel() { modal('⚙️ Safe Dev Mode', wrap => { const box = el('div', 'dev-panel'); box.innerHTML = `<label class="ps-toggle"><input id="dev-toggle" type="checkbox" ${enabled ? 'checked' : ''}><span>Show dev tools</span></label><button class="btn wide" id="dev-add-city">+ City node</button><button class="btn wide" id="dev-add-zone">+ World node</button><button class="btn wide" id="dev-battle">🎛️ Battle scene simulator</button><button class="btn wide" id="dev-copy">📋 Copy changed-parts JSON</button><button class="btn danger wide" id="dev-clear">Clear local dev edits</button><p class="muted">Safe mode exports changed parts only. The simulator opens a frozen sandbox fight built from the real battle screen — drag anything in it, then copy its JSON from there.</p>`; wrap.appendChild(box); $('dev-toggle').onchange = e => setEnabled(e.target.checked); $('dev-add-city').onclick = addCity; $('dev-add-zone').onclick = addZone; $('dev-battle').onclick = () => { closeModal(); openBattleSim(); }; $('dev-copy').onclick = copyPatch; $('dev-clear').onclick = () => { if (!confirm('Clear local dev edits?')) return; localStorage.removeItem(PATCH_KEY); localStorage.removeItem(OLD_PATCH_KEY); toast('Local dev edits cleared'); closeModal(); location.reload(); }; }); }
// dev-battle-sim.js publishes this global when it boots; if it is
// missing, that module failed to load and saying so beats a dead button.
function openBattleSim() { if (typeof window.VIRUZ_OPEN_BATTLE_SIM === 'function') window.VIRUZ_OPEN_BATTLE_SIM(); else toast('โหลด Battle Simulator ไม่สำเร็จ'); }
function addCity() { const n = { id:uniqueId('city_node', MAP_NODES), label:'New Node', x:50, y:50, textX:50, textY:44, zoneR:12, screen:'home', hint:'Dev-created node' }; MAP_NODES.push(n); upsertCityPatch(n); closeModal(); refresh(); }
function addZone() { const z = { id:uniqueId('zone', ZONES), map:currentMapId(), kind:'battle', order:99, name:'New Zone', thai:'โหนดใหม่', x:50, y:50, lv:[1,3], waves:[1,1], pool:enemyPool(), reward:{ bitzMult:1, expMult:1 }, desc:'Dev-created zone' }; ZONES.push(z); upsertZonePatch(z); closeModal(); refresh(); }
function enemyCard(id, on) { const d = ANTIVIRUZ[id]; if (!d) return ''; const art = creatureMarkupFor(d, ATTR[d.attr] || ATTR.green, 'dev-enemy-sprite', 'still', 0, null); return `<button class="dev-enemy-card ${on?'on':''}" data-enemy="${id}">${art}<b>${esc(d.name)}</b><small>${id}</small></button>`; }
function openEditor(kind, id) { const isCity = kind === 'city'; const obj = isCity ? MAP_NODES.find(n => n.id === id) : ZONES.find(z => z.id === id); if (!obj) return; modal(isCity ? 'Edit city node' : 'Edit world node', wrap => { const box = el('div', 'dev-form'); if (isCity) box.innerHTML = `<label>ID<input value="${esc(obj.id)}" disabled></label><label>Label<input id="dev-label" value="${esc(obj.label)}"></label><label>Screen<input id="dev-screen" value="${esc(obj.screen)}"></label><label>Hint<input id="dev-hint" value="${esc(obj.hint || '')}"></label><div class="dev-grid2"><label>X<input id="dev-x" type="number" step="0.01" value="${obj.x}"></label><label>Y<input id="dev-y" type="number" step="0.01" value="${obj.y}"></label></div><div class="dev-grid2"><label>Text X<input id="dev-textx" type="number" step="0.01" value="${obj.textX ?? obj.x}"></label><label>Text Y<input id="dev-texty" type="number" step="0.01" value="${obj.textY ?? obj.y}"></label></div><label>Radius<input id="dev-r" type="number" value="${obj.zoneR || 12}"></label>`; else box.innerHTML = `<label>ID<input value="${esc(obj.id)}" disabled></label><label>Name<input id="dev-name" value="${esc(obj.name)}"></label><label>Thai<input id="dev-thai" value="${esc(obj.thai || '')}"></label><label>Kind<select id="dev-kind"><option value="battle">battle</option><option value="safe">safe</option></select></label><div class="dev-grid2"><label>X<input id="dev-x" type="number" step="0.01" value="${obj.x}"></label><label>Y<input id="dev-y" type="number" step="0.01" value="${obj.y}"></label></div><div class="dev-grid2"><label>Lv min<input id="dev-lv0" type="number" value="${obj.lv?.[0] || 1}"></label><label>Lv max<input id="dev-lv1" type="number" value="${obj.lv?.[1] || 3}"></label></div><div class="dev-grid2"><label>Waves min<input id="dev-w0" type="number" value="${obj.waves?.[0] || 1}"></label><label>Waves max<input id="dev-w1" type="number" value="${obj.waves?.[1] || 1}"></label></div><div class="dev-enemy-head"><b>Enemy pool with real art</b><button class="btn small" id="dev-edit-enemy" type="button">Edit selected enemy</button></div><div class="dev-enemy-grid">${ENEMY_KEYS.map(eid => enemyCard(eid, (obj.pool || []).includes(eid))).join('')}</div><label>Enemy IDs<textarea id="dev-pool">${esc((obj.pool || []).join(', '))}</textarea></label><label>Description<textarea id="dev-desc">${esc(obj.desc || '')}</textarea></label>`; box.innerHTML += `<button class="btn primary wide" id="dev-save">Save locally</button><button class="btn danger wide" id="dev-delete">Delete locally</button>`; wrap.appendChild(box); const ks = $('dev-kind'); if (ks) ks.value = obj.kind || 'battle'; box.querySelectorAll('[data-enemy]').forEach(btn => btn.onclick = () => { btn.classList.toggle('on'); $('dev-pool').value = [...box.querySelectorAll('[data-enemy].on')].map(b => b.dataset.enemy).join(', '); }); const editEnemy = $('dev-edit-enemy'); if (editEnemy) editEnemy.onclick = () => { const first = ($('dev-pool').value.split(',').map(s=>s.trim()).filter(Boolean)[0]) || ENEMY_KEYS[0]; closeModal(); openEnemyEditor(obj.id, first); }; $('dev-save').onclick = () => { if (isCity) { Object.assign(obj, { label:$('dev-label').value.trim() || obj.label, screen:$('dev-screen').value.trim() || 'map', hint:$('dev-hint').value.trim(), x:round($('dev-x').value), y:round($('dev-y').value), textX:round($('dev-textx').value), textY:round($('dev-texty').value), zoneR:parseInt($('dev-r').value,10) || 12 }); upsertCityPatch(obj); } else { Object.assign(obj, { name:$('dev-name').value.trim() || obj.name, thai:$('dev-thai').value.trim(), kind:$('dev-kind').value, x:round($('dev-x').value), y:round($('dev-y').value), lv:[parseInt($('dev-lv0').value,10)||1, parseInt($('dev-lv1').value,10)||1], waves:[parseInt($('dev-w0').value,10)||1, parseInt($('dev-w1').value,10)||1], pool:$('dev-pool').value.split(',').map(s=>s.trim()).filter(Boolean), reward:obj.reward || { bitzMult:1, expMult:1 }, desc:$('dev-desc').value.trim() }); if (obj.kind === 'safe') { delete obj.lv; delete obj.waves; delete obj.pool; delete obj.reward; } upsertZonePatch(obj); } closeModal(); refresh(); toast('Saved locally'); }; $('dev-delete').onclick = () => { if (!confirm('Delete this node locally?')) return; isCity ? removeCity(id) : removeZone(id); closeModal(); refresh(); }; }); }
function openEnemyEditor(zoneId, enemyId) { const z = ZONES.find(x => x.id === zoneId); const d = ANTIVIRUZ[enemyId] || ANTIVIRUZ[ENEMY_KEYS[0]]; const over = (z?.enemyOverrides?.[enemyId]) || {}; const base = Object.assign({}, d.base || {}, over.base || {}); modal(`Edit enemy: ${d.name}`, wrap => { const box = el('div','dev-form'); const art = creatureMarkupFor(Object.assign({}, d, over), ATTR[over.attr || d.attr] || ATTR.green, 'dev-preview-sprite', 'still', 0, null); box.innerHTML = `<div class="dev-preview">${art}</div><label>Enemy<select id="de-id">${ENEMY_KEYS.map(id => `<option value="${id}" ${id===enemyId?'selected':''}>${ANTIVIRUZ[id].name} — ${id}</option>`).join('')}</select></label><div class="dev-grid2"><label>Level min<input id="de-lv0" type="number" value="${over.lv?.[0] || z?.lv?.[0] || 1}"></label><label>Level max<input id="de-lv1" type="number" value="${over.lv?.[1] || z?.lv?.[1] || 1}"></label></div><label>Hue / color note<input id="de-hue" value="${esc(over.hue || '')}" placeholder="blue hue, red tint, dark green..."></label><div class="dev-grid2"><label>Scale<input id="de-scale" type="number" step="0.01" value="${over.scale ?? d.scale ?? 1}"></label><label>Height/Y offset<input id="de-height" type="number" step="1" value="${over.heightOffset ?? 0}"></label></div><div class="dev-grid2"><label>ATK<input id="de-atk" type="number" value="${base.atk || 1}"></label><label>DEF<input id="de-def" type="number" value="${base.def || 1}"></label><label>SPD<input id="de-spd" type="number" value="${base.spd || 1}"></label><label>MHP<input id="de-mhp" type="number" value="${base.mhp || 1}"></label></div><label>Skills<textarea id="de-skills" placeholder="Bite:40, Poison:80">${esc((over.skills || d.skills || []).map(s => `${s.n}:${s.pw || 40}`).join(', '))}</textarea></label><button class="btn primary wide" id="de-save">Save enemy override</button><button class="btn wide" id="de-back">Back to node</button>`; wrap.appendChild(box); $('de-id').onchange = e => { closeModal(); openEnemyEditor(zoneId, e.target.value); }; $('de-back').onclick = () => { closeModal(); openEditor('zone', zoneId); }; $('de-save').onclick = () => { const eid = $('de-id').value; const skills = $('de-skills').value.split(',').map(s => { const [n,pw] = s.split(':'); return n?.trim() ? { n:n.trim(), pw:parseFloat(pw)||40, special:false } : null; }).filter(Boolean); const next = { lv:[parseInt($('de-lv0').value,10)||1, parseInt($('de-lv1').value,10)||1], hue:$('de-hue').value.trim(), scale:parseFloat($('de-scale').value)||1, heightOffset:parseInt($('de-height').value,10)||0, base:{ atk:parseInt($('de-atk').value,10)||1, def:parseInt($('de-def').value,10)||1, spd:parseInt($('de-spd').value,10)||1, mhp:parseInt($('de-mhp').value,10)||1 }, skills }; saveEnemyOverride(zoneId, eid, next); if (z && !(z.pool||[]).includes(eid)) { z.pool = [...(z.pool||[]), eid]; upsertZonePatch(z); } toast('Enemy override saved locally'); closeModal(); openEditor('zone', zoneId); }; }); }
async function copyPatch() { const text = JSON.stringify(loadPatch(), null, 2); try { await navigator.clipboard.writeText(text); toast('Patch JSON copied'); } catch { prompt('Copy this patch JSON:', text); } }
function styles() { if ($('dev-mode-styles')) return; const st = document.createElement('style'); st.id = 'dev-mode-styles'; st.textContent = `#dev-mode-btn{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:9999;padding:8px 10px;border-radius:999px;border:2px solid #d9b24c;background:#fff3bf;color:#392400;font:12px var(--pixel,monospace);box-shadow:0 3px 12px rgba(0,0,0,.25)}#dev-mode-btn.on{background:#ff70d7;color:#fff;border-color:#fff}.dev-overlay{position:absolute;inset:0;z-index:30;pointer-events:none}.dev-dot{position:absolute;transform:translate(-50%,-50%);z-index:31;pointer-events:auto;width:26px;height:26px;border-radius:50%;background:rgba(255,40,180,.9);border:2px solid #fff;color:#fff;touch-action:none}.dev-form label{display:flex;flex-direction:column;gap:4px;margin:8px 0}.dev-form input,.dev-form textarea,.dev-form select{width:100%;font:16px var(--mono);padding:8px;background:var(--panel-solid);border:1px solid var(--line2);color:var(--txt)}.dev-form textarea{min-height:70px}.dev-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dev-enemy-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px}.dev-enemy-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;max-height:260px;overflow:auto}.dev-enemy-card{border:1px solid var(--line2);background:rgba(255,255,255,.05);color:var(--txt);border-radius:10px;padding:6px;display:flex;flex-direction:column;align-items:center;gap:3px}.dev-enemy-card.on{outline:2px solid #ff70d7;background:rgba(255,112,215,.18)}.dev-enemy-sprite{width:64px;height:64px;object-fit:contain;image-rendering:pixelated}.dev-preview{text-align:center}.dev-preview-sprite{width:128px;height:128px;object-fit:contain;image-rendering:pixelated}#dev-fallback-modal{position:fixed;inset:0;z-index:200003;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}#dev-fallback-modal .dev-fb-card{width:100%;max-width:560px;max-height:80vh;display:flex;flex-direction:column;background:#0f1324;color:#fff;border:2px solid #ff70d7;border-bottom:0;border-radius:12px 12px 0 0}#dev-fallback-modal .dev-fb-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #334}#dev-fallback-modal .dev-fb-head b{flex:1;font:12px var(--mono,monospace)}#dev-fallback-modal .dev-fb-x{background:none;border:0;color:#fff;font-size:20px}#dev-fallback-modal .dev-fb-body{overflow:auto;padding:10px}#dev-fallback-modal .btn{display:block;width:100%;margin:6px 0;padding:9px;border-radius:8px;border:1px solid #778;background:#222b55;color:#fff;font:12px var(--mono,monospace)}#dev-fallback-modal .btn.danger{background:#4a1230;border-color:#ff70d7}`; document.head.appendChild(st); }
export function applyDevMapPatch() { applySavedPatch(); }
export function wireDevMode() { if (wired) return; wired = true; styles(); applySavedPatch(); dropLegacyBattleLayout(); renderButton(); const app = $('app'); if (app) new MutationObserver(() => setTimeout(installOverlays, 0)).observe(app, { attributes:true, attributeFilter:['data-screen'] }); document.addEventListener('click', () => setTimeout(installOverlays, 0), true); window.addEventListener('resize', () => setTimeout(installOverlays, 0)); setTimeout(installOverlays, 300); }
