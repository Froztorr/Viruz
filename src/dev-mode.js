// VIRUZ PET — in-game developer map editor
// Client-side only: edits are applied live, saved in localStorage, and can be
// exported/downloaded as a replacement src/data.js so the changes become code.

import { ANTIVIRUZ, MAP_NODES, ZONES } from './data.js';
import { $, G, el } from './state.js';
import { closeModal, modal, toast } from './ui-shell.js';

const STORAGE_KEY = 'viruz.devMode.mapPatch.v1';
const DEV_FLAG_KEY = 'viruz.devMode.enabled';

let devEnabled = localStorage.getItem(DEV_FLAG_KEY) === '1';
let dragging = null;
let editorReady = false;

const deepClone = obj => JSON.parse(JSON.stringify(obj));
const pct = (v, d = 2) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

const baseCityIds = new Set(MAP_NODES.map(n => n.id));
const baseZoneIds = new Set(ZONES.map(z => z.id));

function loadPatch() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {}; }
  catch { return {}; }
}
function storePatch(patch) { localStorage.setItem(STORAGE_KEY, JSON.stringify(patch)); }
function currentPatch() {
  const p = loadPatch();
  p.city = p.city || {};
  p.zones = p.zones || {};
  p.deletedCity = p.deletedCity || [];
  p.deletedZones = p.deletedZones || [];
  return p;
}

function applyPatchToArray(arr, changes, deleted, baseIds) {
  Object.entries(changes || {}).forEach(([id, next]) => {
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) Object.assign(arr[i], deepClone(next));
    else if (!deleted?.includes(id)) arr.push(deepClone(next));
  });
  (deleted || []).forEach(id => {
    const i = arr.findIndex(x => x.id === id);
    if (i >= 0) arr.splice(i, 1);
  });
  arr.sort((a, b) => (baseIds.has(a.id) ? 0 : 1) - (baseIds.has(b.id) ? 0 : 1));
}

export function applyDevMapPatch() {
  const p = currentPatch();
  applyPatchToArray(MAP_NODES, p.city, p.deletedCity, baseCityIds);
  applyPatchToArray(ZONES, p.zones, p.deletedZones, baseZoneIds);
}

function saveCityNode(node) {
  const p = currentPatch();
  p.city[node.id] = deepClone(node);
  p.deletedCity = p.deletedCity.filter(id => id !== node.id);
  storePatch(p);
}
function saveZone(zone) {
  const p = currentPatch();
  p.zones[zone.id] = deepClone(zone);
  p.deletedZones = p.deletedZones.filter(id => id !== zone.id);
  storePatch(p);
}
function removeCityNode(id) {
  const p = currentPatch();
  delete p.city[id];
  if (baseCityIds.has(id) && !p.deletedCity.includes(id)) p.deletedCity.push(id);
  storePatch(p);
  const i = MAP_NODES.findIndex(n => n.id === id);
  if (i >= 0) MAP_NODES.splice(i, 1);
}
function removeZone(id) {
  const p = currentPatch();
  delete p.zones[id];
  if (baseZoneIds.has(id) && !p.deletedZones.includes(id)) p.deletedZones.push(id);
  storePatch(p);
  const i = ZONES.findIndex(z => z.id === id);
  if (i >= 0) ZONES.splice(i, 1);
}

function stageForKind(kind) { return kind === 'city' ? $('map-stage') : $('world-stage'); }
function posFromEvent(e, stage) {
  const r = stage.getBoundingClientRect();
  return {
    x: pct(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100))),
    y: pct(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100))),
  };
}
function getMapIdForWorld() { return G.currentMapId || 'forest'; }
function battlePoolDefault() { return Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_')).slice(0, 2); }
function uniqueId(prefix, arr) {
  let i = 1, id;
  do { id = `${prefix}_${Date.now().toString(36)}_${i++}`; } while (arr.some(x => x.id === id));
  return id;
}
function refreshScreens() { window.VIRUZ?.showScreen?.($('app')?.dataset.screen || 'map'); setTimeout(installOverlays, 80); }

function enableDev(on) {
  devEnabled = !!on;
  localStorage.setItem(DEV_FLAG_KEY, devEnabled ? '1' : '0');
  document.documentElement.classList.toggle('dev-mode', devEnabled);
  renderDevButton();
  installOverlays();
  toast(devEnabled ? 'Dev Mode ON' : 'Dev Mode OFF');
}

function renderDevButton() {
  let btn = $('dev-mode-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'dev-mode-btn';
    btn.type = 'button';
    btn.title = 'Dev Mode';
    btn.setAttribute('aria-label', 'Dev Mode');
    btn.textContent = '⚙️ DEV';
    btn.onclick = openDevPanel;
    document.body.appendChild(btn);
  }
  btn.classList.toggle('on', devEnabled);
}

function installOverlays() {
  document.querySelectorAll('.dev-overlay').forEach(x => x.remove());
  if (!devEnabled) return;
  const appScreen = $('app')?.dataset.screen;
  if (appScreen === 'map') installCityOverlay();
  if (appScreen === 'world') installWorldOverlay();
}
function installCityOverlay() {
  const stage = $('map-stage'); if (!stage) return;
  const layer = el('div', 'dev-overlay dev-city-overlay');
  MAP_NODES.forEach(n => addDevDot(layer, 'city', n.id, n.x, n.y, n.label));
  stage.appendChild(layer);
}
function installWorldOverlay() {
  const stage = $('world-stage'); if (!stage) return;
  const mapId = getMapIdForWorld();
  const layer = el('div', 'dev-overlay dev-world-overlay');
  ZONES.filter(z => z.map === mapId).forEach(z => addDevDot(layer, 'zone', z.id, z.x, z.y, z.name));
  stage.appendChild(layer);
}
function addDevDot(layer, kind, id, x, y, label) {
  const dot = el('button', 'dev-dot', '✥');
  dot.style.left = x + '%'; dot.style.top = y + '%'; dot.title = label || id;
  dot.onpointerdown = e => { e.preventDefault(); e.stopPropagation(); dragging = { kind, id, dot }; dot.setPointerCapture?.(e.pointerId); };
  dot.onpointermove = e => {
    if (!dragging || dragging.id !== id) return;
    const stage = stageForKind(kind === 'city' ? 'city' : 'zone');
    const p = posFromEvent(e, stage);
    dot.style.left = p.x + '%'; dot.style.top = p.y + '%';
    if (kind === 'city') { const n = MAP_NODES.find(v => v.id === id); if (n) { n.x = p.x; n.y = p.y; saveCityNode(n); } }
    else { const z = ZONES.find(v => v.id === id); if (z) { z.x = p.x; z.y = p.y; saveZone(z); } }
  };
  dot.onpointerup = e => { e.preventDefault(); e.stopPropagation(); dragging = null; openNodeEditor(kind, id); };
  layer.appendChild(dot);
}

function openDevPanel() {
  modal('⚙️ Dev Mode', wrap => {
    const box = el('div', 'dev-panel');
    box.innerHTML = `
      <label class="ps-toggle dev-toggle"><input id="dev-enabled-toggle" type="checkbox" ${devEnabled ? 'checked' : ''}><span>Show dev options</span></label>
      <button class="btn wide" id="dev-add-city">+ City map node</button>
      <button class="btn wide" id="dev-add-zone">+ World battle/safe node</button>
      <button class="btn wide" id="dev-export">⬇ Download patched src/data.js</button>
      <button class="btn wide" id="dev-copy">📋 Copy patch JSON</button>
      <button class="btn danger wide" id="dev-clear">Reset local dev edits</button>
      <p class="muted">Drag the pink ✥ handles directly on the map to move nodes. Edits save locally right away. Use Download to replace src/data.js on GitHub.</p>`;
    wrap.appendChild(box);
    $('dev-enabled-toggle').onchange = e => enableDev(e.target.checked);
    $('dev-add-city').onclick = addCityNode;
    $('dev-add-zone').onclick = addWorldNode;
    $('dev-export').onclick = downloadPatchedData;
    $('dev-copy').onclick = copyPatch;
    $('dev-clear').onclick = () => { if (!confirm('Clear all local dev map edits?')) return; localStorage.removeItem(STORAGE_KEY); toast('Dev edits cleared. Reload to restore original code data.'); closeModal(); };
  });
}
function addCityNode() {
  const id = uniqueId('city_node', MAP_NODES);
  const n = { id, label:'New Node', x:50, y:50, textX:50, textY:44, zoneR:12, screen:'home', hint:'Dev-created node' };
  MAP_NODES.push(n); saveCityNode(n); closeModal(); refreshScreens(); toast('City node added');
}
function addWorldNode() {
  const id = uniqueId('zone', ZONES);
  const z = { id, map:getMapIdForWorld(), kind:'battle', order:99, name:'New Zone', thai:'โหนดใหม่', x:50, y:50, lv:[1,3], waves:[1,1], pool:battlePoolDefault(), reward:{ bitzMult:1, expMult:1 }, desc:'Dev-created zone' };
  ZONES.push(z); saveZone(z); closeModal(); refreshScreens(); toast('World node added');
}

function openNodeEditor(kind, id) {
  const isCity = kind === 'city';
  const obj = isCity ? MAP_NODES.find(n => n.id === id) : ZONES.find(z => z.id === id);
  if (!obj) return;
  modal(isCity ? 'Edit city node' : 'Edit world node', wrap => {
    const box = el('div', 'dev-form');
    if (isCity) {
      box.innerHTML = `
        <label>ID<input id="dev-id" value="${esc(obj.id)}" disabled></label>
        <label>Label<input id="dev-label" value="${esc(obj.label)}"></label>
        <label>Screen<input id="dev-screen" value="${esc(obj.screen)}"></label>
        <label>Hint<input id="dev-hint" value="${esc(obj.hint || '')}"></label>
        <div class="dev-grid2"><label>X<input id="dev-x" type="number" step="0.01" value="${obj.x}"></label><label>Y<input id="dev-y" type="number" step="0.01" value="${obj.y}"></label></div>
        <div class="dev-grid2"><label>Text X<input id="dev-textx" type="number" step="0.01" value="${obj.textX ?? obj.x}"></label><label>Text Y<input id="dev-texty" type="number" step="0.01" value="${obj.textY ?? obj.y}"></label></div>
        <label>Click radius<input id="dev-r" type="number" step="1" value="${obj.zoneR || 12}"></label>`;
    } else {
      box.innerHTML = `
        <label>ID<input id="dev-id" value="${esc(obj.id)}" disabled></label>
        <label>Name<input id="dev-name" value="${esc(obj.name)}"></label>
        <label>Thai / subtitle<input id="dev-thai" value="${esc(obj.thai || '')}"></label>
        <label>Kind<select id="dev-kind"><option value="battle">battle</option><option value="safe">safe</option></select></label>
        <div class="dev-grid2"><label>X<input id="dev-x" type="number" step="0.01" value="${obj.x}"></label><label>Y<input id="dev-y" type="number" step="0.01" value="${obj.y}"></label></div>
        <div class="dev-grid2"><label>Lv min<input id="dev-lv0" type="number" value="${obj.lv?.[0] || 1}"></label><label>Lv max<input id="dev-lv1" type="number" value="${obj.lv?.[1] || 3}"></label></div>
        <div class="dev-grid2"><label>Waves min<input id="dev-w0" type="number" value="${obj.waves?.[0] || 1}"></label><label>Waves max<input id="dev-w1" type="number" value="${obj.waves?.[1] || 1}"></label></div>
        <label>Enemy IDs, comma-separated<textarea id="dev-pool">${esc((obj.pool || []).join(', '))}</textarea></label>
        <label>Description<textarea id="dev-desc">${esc(obj.desc || '')}</textarea></label>`;
    }
    box.innerHTML += `<button class="btn primary wide" id="dev-save-node">Save node</button><button class="btn danger wide" id="dev-delete-node">Delete node</button>`;
    wrap.appendChild(box);
    const kindSel = $('dev-kind'); if (kindSel) kindSel.value = obj.kind || 'battle';
    $('dev-save-node').onclick = () => {
      if (isCity) {
        Object.assign(obj, { label: $('dev-label').value.trim() || obj.label, screen: $('dev-screen').value.trim() || 'map', hint: $('dev-hint').value.trim(), x: pct(parseFloat($('dev-x').value) || obj.x), y: pct(parseFloat($('dev-y').value) || obj.y), textX: pct(parseFloat($('dev-textx').value) || obj.x), textY: pct(parseFloat($('dev-texty').value) || obj.y), zoneR: Math.max(4, parseInt($('dev-r').value, 10) || 12) });
        saveCityNode(obj);
      } else {
        Object.assign(obj, { name: $('dev-name').value.trim() || obj.name, thai: $('dev-thai').value.trim(), kind: $('dev-kind').value, x: pct(parseFloat($('dev-x').value) || obj.x), y: pct(parseFloat($('dev-y').value) || obj.y), lv: [parseInt($('dev-lv0').value, 10) || 1, parseInt($('dev-lv1').value, 10) || 1], waves: [parseInt($('dev-w0').value, 10) || 1, parseInt($('dev-w1').value, 10) || 1], pool: $('dev-pool').value.split(',').map(s => s.trim()).filter(Boolean), desc: $('dev-desc').value.trim(), reward: obj.reward || { bitzMult:1, expMult:1 } });
        if (obj.kind === 'safe') { delete obj.lv; delete obj.waves; delete obj.pool; delete obj.reward; }
        saveZone(obj);
      }
      closeModal(); refreshScreens(); toast('Node saved');
    };
    $('dev-delete-node').onclick = () => { if (!confirm('Delete this node?')) return; isCity ? removeCityNode(id) : removeZone(id); closeModal(); refreshScreens(); toast('Node deleted'); };
  });
}

function objectLiteral(obj) { return JSON.stringify(obj, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, '$1:').replace(/"/g, "'"); }
function arrayLiteral(arr) { return '[\n' + arr.map(o => '  ' + objectLiteral(o).replace(/\n/g, '\n  ')).join(',\n\n') + '\n]'; }
async function getOriginalDataText() { const res = await fetch('src/data.js?devExport=' + Date.now()); if (!res.ok) throw new Error('Cannot fetch src/data.js'); return await res.text(); }
function replaceExportArray(src, exportName, arrText) {
  const re = new RegExp(`export const ${exportName} = \\[\\n[\\s\\S]*?\\n\\];`);
  const next = `export const ${exportName} = ${arrText};`;
  if (!re.test(src)) throw new Error(`Could not find export const ${exportName}`);
  return src.replace(re, next);
}
async function downloadPatchedData() {
  try {
    let src = await getOriginalDataText();
    src = replaceExportArray(src, 'ZONES', arrayLiteral(ZONES));
    src = replaceExportArray(src, 'MAP_NODES', arrayLiteral(MAP_NODES));
    const blob = new Blob([src], { type:'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'data.js'; a.click(); URL.revokeObjectURL(a.href);
    toast('Downloaded patched data.js');
  } catch (err) { console.error(err); toast('Export failed: ' + err.message); }
}
async function copyPatch() { await navigator.clipboard?.writeText(JSON.stringify(currentPatch(), null, 2)); toast('Patch JSON copied'); }

function injectStyles() {
  if ($('dev-mode-styles')) return;
  const st = document.createElement('style');
  st.id = 'dev-mode-styles';
  st.textContent = `
    #dev-mode-btn{position:fixed;top:38px;right:8px;z-index:10000;padding:7px 10px;border-radius:999px;border:2px solid var(--gold,#ffcf3f);background:linear-gradient(180deg,#fff6c9,#e8a91c);color:#231602;font:12px var(--pixel,monospace);box-shadow:0 3px 12px rgba(0,0,0,.35);opacity:.95}
    #dev-mode-btn.on{background:linear-gradient(180deg,#ff5ce0,#7a4de0);color:#fff;border-color:#fff;box-shadow:0 0 16px rgba(255,92,224,.9)}
    .dev-overlay{position:absolute;inset:0;z-index:30;pointer-events:none}.dev-dot{position:absolute;transform:translate(-50%,-50%);z-index:31;pointer-events:auto;width:26px;height:26px;border-radius:50%;background:rgba(255,40,180,.88);border:2px solid #fff;color:#fff;font-size:14px;box-shadow:0 0 14px rgba(255,40,180,.8);touch-action:none;cursor:grab}.dev-dot:active{cursor:grabbing;transform:translate(-50%,-50%) scale(1.2)}
    .dev-panel .btn,.dev-form .btn{margin-top:8px}.dev-form label{display:flex;flex-direction:column;gap:4px;margin:8px 0;color:var(--muted);font-size:14px}.dev-form input,.dev-form textarea,.dev-form select{width:100%;font:16px var(--mono);padding:8px;background:var(--panel-solid);border:1px solid var(--line2);color:var(--txt);user-select:text;-webkit-user-select:text}.dev-form textarea{min-height:74px}.dev-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  `;
  document.head.appendChild(st);
}

export function wireDevMode() {
  if (editorReady) return;
  editorReady = true;
  injectStyles();
  applyDevMapPatch();
  renderDevButton();
  document.documentElement.classList.toggle('dev-mode', devEnabled);
  const mo = new MutationObserver(() => setTimeout(() => { renderDevButton(); installOverlays(); }, 0));
  const app = $('app');
  if (app) mo.observe(app, { attributes:true, attributeFilter:['data-screen'] });
  document.addEventListener('click', () => setTimeout(installOverlays, 0), true);
  setTimeout(() => { renderDevButton(); installOverlays(); }, 500);
}
