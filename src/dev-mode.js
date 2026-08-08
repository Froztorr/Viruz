// VIRUZ PET — safe in-game dev patch exporter
// This tool NEVER rewrites src/data.js. It only saves local edits and exports
// a small JSON patch the developer can paste into chat for manual code edits.

import { MAP_NODES, ZONES, ANTIVIRUZ } from './data.js';
import { $, G, el } from './state.js';
import { closeModal, modal, toast } from './ui-shell.js';

const DEV_FLAG_KEY = 'viruz.devMode.enabled';
const PATCH_KEY = 'viruz.devMode.patchExport.v2';

let enabled = localStorage.getItem(DEV_FLAG_KEY) === '1';
let wired = false;
let dragging = null;

const clone = x => JSON.parse(JSON.stringify(x));
const round = n => Math.round(Number(n || 0) * 100) / 100;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const baseCity = new Map(MAP_NODES.map(n => [n.id, clone(n)]));
const baseZones = new Map(ZONES.map(z => [z.id, clone(z)]));

function blankPatch() { return { city:{}, zones:{}, newCity:[], newZones:[], deletedCity:[], deletedZones:[] }; }
function loadPatch() {
  try { return Object.assign(blankPatch(), JSON.parse(localStorage.getItem(PATCH_KEY) || '{}')); }
  catch { return blankPatch(); }
}
function savePatch(p) { localStorage.setItem(PATCH_KEY, JSON.stringify(p)); }
function changedOnly(base, now, keys) {
  const out = {};
  keys.forEach(k => {
    if (JSON.stringify(base?.[k]) !== JSON.stringify(now?.[k])) out[k] = clone(now[k]);
  });
  return out;
}
function upsertCityPatch(node) {
  const p = loadPatch();
  if (baseCity.has(node.id)) p.city[node.id] = changedOnly(baseCity.get(node.id), node, ['label','x','y','textX','textY','zoneR','screen','hint']);
  else {
    const i = p.newCity.findIndex(n => n.id === node.id);
    if (i >= 0) p.newCity[i] = clone(node); else p.newCity.push(clone(node));
  }
  p.deletedCity = p.deletedCity.filter(id => id !== node.id);
  savePatch(p);
}
function upsertZonePatch(zone) {
  const p = loadPatch();
  if (baseZones.has(zone.id)) p.zones[zone.id] = changedOnly(baseZones.get(zone.id), zone, ['map','kind','order','name','thai','x','y','lv','waves','pool','reward','desc','targetMapId','icon']);
  else {
    const i = p.newZones.findIndex(z => z.id === zone.id);
    if (i >= 0) p.newZones[i] = clone(zone); else p.newZones.push(clone(zone));
  }
  p.deletedZones = p.deletedZones.filter(id => id !== zone.id);
  savePatch(p);
}
function removeCity(id) {
  const p = loadPatch();
  delete p.city[id]; p.newCity = p.newCity.filter(n => n.id !== id);
  if (baseCity.has(id) && !p.deletedCity.includes(id)) p.deletedCity.push(id);
  savePatch(p);
  const i = MAP_NODES.findIndex(n => n.id === id); if (i >= 0) MAP_NODES.splice(i, 1);
}
function removeZone(id) {
  const p = loadPatch();
  delete p.zones[id]; p.newZones = p.newZones.filter(z => z.id !== id);
  if (baseZones.has(id) && !p.deletedZones.includes(id)) p.deletedZones.push(id);
  savePatch(p);
  const i = ZONES.findIndex(z => z.id === id); if (i >= 0) ZONES.splice(i, 1);
}
function applySavedPatch() {
  const p = loadPatch();
  Object.entries(p.city || {}).forEach(([id, diff]) => { const n = MAP_NODES.find(x => x.id === id); if (n) Object.assign(n, clone(diff)); });
  Object.entries(p.zones || {}).forEach(([id, diff]) => { const z = ZONES.find(x => x.id === id); if (z) Object.assign(z, clone(diff)); });
  (p.newCity || []).forEach(n => { if (!MAP_NODES.some(x => x.id === n.id)) MAP_NODES.push(clone(n)); });
  (p.newZones || []).forEach(z => { if (!ZONES.some(x => x.id === z.id)) ZONES.push(clone(z)); });
  (p.deletedCity || []).forEach(id => { const i = MAP_NODES.findIndex(n => n.id === id); if (i >= 0) MAP_NODES.splice(i, 1); });
  (p.deletedZones || []).forEach(id => { const i = ZONES.findIndex(z => z.id === id); if (i >= 0) ZONES.splice(i, 1); });
}
function currentScreen() { return $('app')?.dataset.screen; }
function currentMapId() { return G.currentMapId || 'forest'; }
function refresh() { window.VIRUZ?.showScreen?.(currentScreen() || 'map'); setTimeout(installOverlays, 100); }
function uniqueId(prefix, list) { let id; do { id = `${prefix}_${Date.now().toString(36)}`; } while (list.some(x => x.id === id)); return id; }
function enemyPool() { return Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_')).slice(0, 2); }
function stageFor(kind) { return kind === 'city' ? $('map-stage') : $('world-stage'); }
function pos(e, stage) {
  const r = stage.getBoundingClientRect();
  return { x: round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))), y: round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))) };
}
function setEnabled(on) {
  enabled = !!on;
  localStorage.setItem(DEV_FLAG_KEY, enabled ? '1' : '0');
  renderButton(); installOverlays();
  toast(enabled ? 'Dev Mode ON' : 'Dev Mode OFF');
}
function renderButton() {
  let btn = $('dev-mode-btn');
  if (!btn) { btn = document.createElement('button'); btn.id = 'dev-mode-btn'; btn.type = 'button'; btn.textContent = '⚙️ DEV'; document.body.appendChild(btn); }
  btn.classList.toggle('on', enabled);
  btn.onclick = openPanel;
}
function installOverlays() {
  document.querySelectorAll('.dev-overlay').forEach(x => x.remove());
  if (!enabled) return;
  if (currentScreen() === 'map') installCityOverlay();
  if (currentScreen() === 'world') installWorldOverlay();
}
function installCityOverlay() {
  const stage = $('map-stage'); if (!stage) return;
  const layer = el('div', 'dev-overlay');
  MAP_NODES.forEach(n => dot(layer, 'city', n.id, n.x, n.y, n.label));
  stage.appendChild(layer);
}
function installWorldOverlay() {
  const stage = $('world-stage'); if (!stage) return;
  const layer = el('div', 'dev-overlay');
  ZONES.filter(z => z.map === currentMapId()).forEach(z => dot(layer, 'zone', z.id, z.x, z.y, z.name));
  stage.appendChild(layer);
}
function dot(layer, kind, id, x, y, label) {
  const b = el('button', 'dev-dot', '✥');
  b.style.left = x + '%'; b.style.top = y + '%'; b.title = label || id;
  b.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); dragging = { kind, id }; b.setPointerCapture?.(e.pointerId); };
  b.onpointermove = e => {
    if (!dragging || dragging.id !== id) return;
    const p = pos(e, stageFor(kind)); b.style.left = p.x + '%'; b.style.top = p.y + '%';
    if (kind === 'city') { const n = MAP_NODES.find(v => v.id === id); if (n) { n.x = p.x; n.y = p.y; upsertCityPatch(n); } }
    else { const z = ZONES.find(v => v.id === id); if (z) { z.x = p.x; z.y = p.y; upsertZonePatch(z); } }
  };
  b.onpointerup = e => { e.preventDefault(); e.stopPropagation(); dragging = null; openEditor(kind, id); };
  layer.appendChild(b);
}
function openPanel() {
  modal('⚙️ Safe Dev Mode', wrap => {
    const box = el('div', 'dev-panel');
    box.innerHTML = `<label class="ps-toggle"><input id="dev-toggle" type="checkbox" ${enabled ? 'checked' : ''}><span>Show dev tools</span></label>
      <button class="btn wide" id="dev-add-city">+ City node</button>
      <button class="btn wide" id="dev-add-zone">+ World node</button>
      <button class="btn wide" id="dev-copy">📋 Copy changed-parts JSON</button>
      <button class="btn danger wide" id="dev-clear">Clear local dev edits</button>
      <p class="muted">Safe mode: this only exports changed parts. Paste the JSON in chat; it does not rewrite game code.</p>`;
    wrap.appendChild(box);
    $('dev-toggle').onchange = e => setEnabled(e.target.checked);
    $('dev-add-city').onclick = addCity;
    $('dev-add-zone').onclick = addZone;
    $('dev-copy').onclick = copyPatch;
    $('dev-clear').onclick = () => { if (!confirm('Clear local dev edits?')) return; localStorage.removeItem(PATCH_KEY); toast('Local dev edits cleared'); closeModal(); location.reload(); };
  });
}
function addCity() {
  const n = { id:uniqueId('city_node', MAP_NODES), label:'New Node', x:50, y:50, textX:50, textY:44, zoneR:12, screen:'home', hint:'Dev-created node' };
  MAP_NODES.push(n); upsertCityPatch(n); closeModal(); refresh();
}
function addZone() {
  const z = { id:uniqueId('zone', ZONES), map:currentMapId(), kind:'battle', order:99, name:'New Zone', thai:'โหนดใหม่', x:50, y:50, lv:[1,3], waves:[1,1], pool:enemyPool(), reward:{ bitzMult:1, expMult:1 }, desc:'Dev-created zone' };
  ZONES.push(z); upsertZonePatch(z); closeModal(); refresh();
}
function openEditor(kind, id) {
  const isCity = kind === 'city';
  const obj = isCity ? MAP_NODES.find(n => n.id === id) : ZONES.find(z => z.id === id);
  if (!obj) return;
  modal(isCity ? 'Edit city node' : 'Edit world node', wrap => {
    const box = el('div', 'dev-form');
    if (isCity) box.innerHTML = `<label>ID<input value="${esc(obj.id)}" disabled></label><label>Label<input id="dev-label" value="${esc(obj.label)}"></label><label>Screen<input id="dev-screen" value="${esc(obj.screen)}"></label><label>Hint<input id="dev-hint" value="${esc(obj.hint || '')}"></label><div class="dev-grid2"><label>X<input id="dev-x" type="number" step="0.01" value="${obj.x}"></label><label>Y<input id="dev-y" type="number" step="0.01" value="${obj.y}"></label></div><div class="dev-grid2"><label>Text X<input id="dev-textx" type="number" step="0.01" value="${obj.textX ?? obj.x}"></label><label>Text Y<input id="dev-texty" type="number" step="0.01" value="${obj.textY ?? obj.y}"></label></div><label>Radius<input id="dev-r" type="number" value="${obj.zoneR || 12}"></label>`;
    else box.innerHTML = `<label>ID<input value="${esc(obj.id)}" disabled></label><label>Name<input id="dev-name" value="${esc(obj.name)}"></label><label>Thai<input id="dev-thai" value="${esc(obj.thai || '')}"></label><label>Kind<select id="dev-kind"><option value="battle">battle</option><option value="safe">safe</option></select></label><div class="dev-grid2"><label>X<input id="dev-x" type="number" step="0.01" value="${obj.x}"></label><label>Y<input id="dev-y" type="number" step="0.01" value="${obj.y}"></label></div><div class="dev-grid2"><label>Lv min<input id="dev-lv0" type="number" value="${obj.lv?.[0] || 1}"></label><label>Lv max<input id="dev-lv1" type="number" value="${obj.lv?.[1] || 3}"></label></div><div class="dev-grid2"><label>Waves min<input id="dev-w0" type="number" value="${obj.waves?.[0] || 1}"></label><label>Waves max<input id="dev-w1" type="number" value="${obj.waves?.[1] || 1}"></label></div><label>Enemy IDs<textarea id="dev-pool">${esc((obj.pool || []).join(', '))}</textarea></label><label>Description<textarea id="dev-desc">${esc(obj.desc || '')}</textarea></label>`;
    box.innerHTML += `<button class="btn primary wide" id="dev-save">Save locally</button><button class="btn danger wide" id="dev-delete">Delete locally</button>`;
    wrap.appendChild(box);
    const ks = $('dev-kind'); if (ks) ks.value = obj.kind || 'battle';
    $('dev-save').onclick = () => { if (isCity) { Object.assign(obj, { label:$('dev-label').value.trim() || obj.label, screen:$('dev-screen').value.trim() || 'map', hint:$('dev-hint').value.trim(), x:round($('dev-x').value), y:round($('dev-y').value), textX:round($('dev-textx').value), textY:round($('dev-texty').value), zoneR:parseInt($('dev-r').value,10) || 12 }); upsertCityPatch(obj); } else { Object.assign(obj, { name:$('dev-name').value.trim() || obj.name, thai:$('dev-thai').value.trim(), kind:$('dev-kind').value, x:round($('dev-x').value), y:round($('dev-y').value), lv:[parseInt($('dev-lv0').value,10)||1, parseInt($('dev-lv1').value,10)||1], waves:[parseInt($('dev-w0').value,10)||1, parseInt($('dev-w1').value,10)||1], pool:$('dev-pool').value.split(',').map(s=>s.trim()).filter(Boolean), reward:obj.reward || { bitzMult:1, expMult:1 }, desc:$('dev-desc').value.trim() }); if (obj.kind === 'safe') { delete obj.lv; delete obj.waves; delete obj.pool; delete obj.reward; } upsertZonePatch(obj); } closeModal(); refresh(); toast('Saved locally'); };
    $('dev-delete').onclick = () => { if (!confirm('Delete this node locally?')) return; isCity ? removeCity(id) : removeZone(id); closeModal(); refresh(); };
  });
}
async function copyPatch() {
  const text = JSON.stringify(loadPatch(), null, 2);
  try { await navigator.clipboard.writeText(text); toast('Patch JSON copied'); }
  catch { prompt('Copy this patch JSON:', text); }
}
function styles() {
  if ($('dev-mode-styles')) return;
  const st = document.createElement('style'); st.id = 'dev-mode-styles';
  st.textContent = `#dev-mode-btn{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;z-index:9999;padding:8px 10px;border-radius:999px;border:2px solid #d9b24c;background:#fff3bf;color:#392400;font:12px var(--pixel,monospace);box-shadow:0 3px 12px rgba(0,0,0,.25)}#dev-mode-btn.on{background:#ff70d7;color:#fff;border-color:#fff}.dev-overlay{position:absolute;inset:0;z-index:30;pointer-events:none}.dev-dot{position:absolute;transform:translate(-50%,-50%);z-index:31;pointer-events:auto;width:26px;height:26px;border-radius:50%;background:rgba(255,40,180,.9);border:2px solid #fff;color:#fff;touch-action:none}.dev-form label{display:flex;flex-direction:column;gap:4px;margin:8px 0}.dev-form input,.dev-form textarea,.dev-form select{width:100%;font:16px var(--mono);padding:8px;background:var(--panel-solid);border:1px solid var(--line2);color:var(--txt)}.dev-form textarea{min-height:70px}.dev-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}`;
  document.head.appendChild(st);
}
export function applyDevMapPatch() { applySavedPatch(); }
export function wireDevMode() {
  if (wired) return; wired = true;
  styles(); applySavedPatch(); renderButton();
  const app = $('app'); if (app) new MutationObserver(() => setTimeout(installOverlays, 0)).observe(app, { attributes:true, attributeFilter:['data-screen'] });
  document.addEventListener('click', () => setTimeout(installOverlays, 0), true);
  setTimeout(installOverlays, 300);
}
