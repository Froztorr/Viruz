// Safe Dev Mode — standalone battle simulator scene.
// It does not touch the live fight DOM. It builds a separate sandbox scene
// with real game sprite art, then exports JSON positions/sizes/hover flags.

import { ANTIVIRUZ, ATTR, SPECIES } from './data.js';
import { G } from './state.js';
import { creatureMarkupFor } from './sprites.js';

const DEV_FLAG_KEY = 'viruz.devMode.enabled';
const SIM_KEY = 'viruz.devMode.battleSim.v1';
const PATCH_KEY = 'viruz.devMode.patchExport.v3';

const $ = id => document.getElementById(id);
const clone = x => JSON.parse(JSON.stringify(x));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
const round = n => Math.round(Number(n || 0) * 100) / 100;
const ENEMY_KEYS = Object.keys(ANTIVIRUZ).filter(id => !id.startsWith('guard_'));
const PET_KEYS = Object.keys(SPECIES);

const DEFAULT = {
  selected: 'ally1',
  actors: {
    ally1:{ kind:'pet', speciesId:'blobyte', attr:'green', label:'My pet 1', x:24, y:58, scale:1.0, hover:true, visible:true },
    ally2:{ kind:'pet', speciesId:'hopbit', attr:'red', label:'My pet 2', x:16, y:72, scale:.75, hover:true, visible:true },
    ally3:{ kind:'pet', speciesId:'orbling', attr:'white', label:'My pet 3', x:34, y:75, scale:.75, hover:true, visible:false },
    foe1:{ kind:'enemy', speciesId:'greenworm', attr:'green', label:'Enemy 1', x:74, y:55, scale:1.0, hover:true, visible:true },
    foe2:{ kind:'enemy', speciesId:'beetle', attr:'yellow', label:'Enemy 2', x:84, y:70, scale:.8, hover:true, visible:false },
    foe3:{ kind:'enemy', speciesId:'stone_imp', attr:'yellow', label:'Enemy 3', x:64, y:73, scale:.8, hover:true, visible:false },
  },
  ui: {
    allyPlate:{ label:'My HP / MP / name', x:7, y:8 },
    foePlate:{ label:'Enemy HP / SPD / CRT', x:62, y:8 },
    skillBar:{ label:'Skill buttons', x:20, y:86 },
    itemBar:{ label:'Potion / poison buttons', x:2, y:83 },
    log:{ label:'Message / battle log', x:31, y:3 },
    banner:{ label:'Skill name / notify banner', x:35, y:42 },
    bench:{ label:'Bench row', x:38, y:78 },
  }
};

let drag = null;

function load() {
  try { return merge(DEFAULT, JSON.parse(localStorage.getItem(SIM_KEY) || '{}')); }
  catch { return clone(DEFAULT); }
}
function save(cfg) {
  localStorage.setItem(SIM_KEY, JSON.stringify(cfg));
  const patch = loadPatch();
  patch.battleSimulator = clone(cfg);
  savePatch(patch);
}
function loadPatch() { try { return Object.assign({ battleSimulator:{} }, JSON.parse(localStorage.getItem(PATCH_KEY) || '{}')); } catch { return { battleSimulator:{} }; } }
function savePatch(p) { localStorage.setItem(PATCH_KEY, JSON.stringify(p)); }
function merge(a,b) {
  const out = clone(a);
  Object.keys(b || {}).forEach(k => {
    if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && out[k]) out[k] = merge(out[k], b[k]);
    else out[k] = b[k];
  });
  return out;
}
function speciesDef(actor) {
  return actor.kind === 'enemy' ? ANTIVIRUZ[actor.speciesId] : SPECIES[actor.speciesId];
}
function actorArt(actor, cls='dbs-sprite') {
  const def = speciesDef(actor) || ANTIVIRUZ.greenworm;
  const attr = ATTR[actor.attr || def.attr || 'green'] || ATTR.green;
  return creatureMarkupFor(Object.assign({}, def, { scale:actor.scale, noFloat:!actor.hover }), attr, cls + (actor.hover ? ' float' : ' no-float'), 'still', 0, null);
}
function ensureButton() {
  let btn = $('dev-battle-sim-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'dev-battle-sim-btn';
    btn.type = 'button';
    btn.textContent = '🎛️ SIM';
    btn.onclick = openSim;
    document.body.appendChild(btn);
  }
  btn.style.display = localStorage.getItem(DEV_FLAG_KEY) === '1' ? 'block' : 'none';
}
function openSim() {
  injectStyles();
  document.querySelector('.dev-battle-sim')?.remove();
  const cfg = load();
  const root = document.createElement('div');
  root.className = 'dev-battle-sim';
  root.innerHTML = `<div class="dbs-top"><b>Battle Simulator Scene</b><span>Move real objects freely — safe export only</span><button id="dbs-copy">Copy JSON</button><button id="dbs-close">Close</button></div><div class="dbs-wrap"><div id="dbs-stage" class="dbs-stage"></div><div id="dbs-panel" class="dbs-panel"></div></div>`;
  document.body.appendChild(root);
  $('dbs-close').onclick = () => root.remove();
  $('dbs-copy').onclick = copyPatch;
  renderStage(cfg); renderPanel(cfg);
}
function renderStage(cfg) {
  const stage = $('dbs-stage'); if (!stage) return;
  stage.innerHTML = `<div class="dbs-bg"></div><div class="dbs-ground"></div>`;
  Object.entries(cfg.actors).forEach(([key,a]) => {
    if (!a.visible) return;
    const node = document.createElement('button');
    node.className = 'dbs-actor' + (cfg.selected === key ? ' on' : '') + (a.hover ? ' hover' : ' grounded');
    node.dataset.key = key;
    node.style.left = a.x + '%'; node.style.top = a.y + '%'; node.style.setProperty('--s', a.scale || 1);
    node.innerHTML = `${actorArt(a)}<small>${esc(a.label || key)}</small>`;
    node.onpointerdown = e => startDrag(e, cfg, 'actor', key);
    node.onclick = e => { e.stopPropagation(); cfg.selected = key; save(cfg); renderStage(cfg); renderPanel(cfg); };
    stage.appendChild(node);
  });
  Object.entries(cfg.ui).forEach(([key,u]) => {
    const node = document.createElement('button');
    node.className = 'dbs-ui ' + key;
    node.dataset.key = key;
    node.style.left = u.x + '%'; node.style.top = u.y + '%';
    node.innerHTML = sampleUi(key, u.label);
    node.onpointerdown = e => startDrag(e, cfg, 'ui', key);
    stage.appendChild(node);
  });
}
function sampleUi(key, label) {
  if (key.includes('Plate')) return `<b>${esc(label)}</b><i>Lv.120</i><em class="hp"></em><em class="mp"></em>`;
  if (key === 'skillBar') return `<b>Skills</b><span>Slash</span><span>Poison</span><span>Heal</span>`;
  if (key === 'itemBar') return `<b>Items</b><span>🧪</span><span>☠️</span><span>❄️</span>`;
  if (key === 'banner') return `<b>CRITICAL HIT!</b>`;
  if (key === 'bench') return `<b>Bench</b><span>1</span><span>2</span><span>3</span>`;
  return `<b>${esc(label)}</b><p>Skill used / damage / notify text appears here</p>`;
}
function startDrag(e, cfg, type, key) {
  e.preventDefault(); e.stopPropagation();
  const stage = $('dbs-stage'); const r = stage.getBoundingClientRect();
  const obj = type === 'actor' ? cfg.actors[key] : cfg.ui[key];
  drag = { cfg, type, key, rect:r, dx:e.clientX, dy:e.clientY, sx:obj.x, sy:obj.y };
  e.currentTarget.setPointerCapture?.(e.pointerId);
  window.addEventListener('pointermove', onDrag, true);
  window.addEventListener('pointerup', endDrag, true);
}
function onDrag(e) {
  if (!drag) return;
  const obj = drag.type === 'actor' ? drag.cfg.actors[drag.key] : drag.cfg.ui[drag.key];
  obj.x = round(Math.max(0, Math.min(100, drag.sx + ((e.clientX - drag.dx) / drag.rect.width) * 100)));
  obj.y = round(Math.max(0, Math.min(100, drag.sy + ((e.clientY - drag.dy) / drag.rect.height) * 100)));
  save(drag.cfg); renderStage(drag.cfg);
}
function endDrag() { window.removeEventListener('pointermove', onDrag, true); window.removeEventListener('pointerup', endDrag, true); drag = null; }
function renderPanel(cfg) {
  const p = $('dbs-panel'); if (!p) return;
  const key = cfg.selected; const a = cfg.actors[key] || cfg.actors.ally1;
  p.innerHTML = `<h3>Selected object</h3><label>Slot<select id="dbs-slot">${Object.keys(cfg.actors).map(k => `<option value="${k}" ${k===key?'selected':''}>${k} — ${cfg.actors[k].label}</option>`).join('')}</select></label><label>Kind<select id="dbs-kind"><option value="pet">pet</option><option value="enemy">enemy</option></select></label><label>Picture<select id="dbs-species"></select></label><div class="dbs-preview">${actorArt(a, 'dbs-preview-sprite')}</div><label>Name<label><input id="dbs-label" value="${esc(a.label)}"></label><div class="dbs-grid"><label>X<input id="dbs-x" type="number" step="0.01" value="${a.x}"></label><label>Y<input id="dbs-y" type="number" step="0.01" value="${a.y}"></label></div><label>Size / scale<input id="dbs-scale" type="range" min="0.35" max="2.5" step="0.01" value="${a.scale}"><span id="dbs-scale-val">${a.scale}</span></label><label class="dbs-check"><input id="dbs-hover" type="checkbox" ${a.hover?'checked':''}> Hover / floating animation</label><label class="dbs-check"><input id="dbs-visible" type="checkbox" ${a.visible?'checked':''}> Visible</label><button class="btn primary wide" id="dbs-save-actor">Save object</button><hr><h3>UI objects</h3><p class="muted">Drag the boxes inside the simulator: HP/MP, SPD/CRT, skill buttons, item buttons, bench, log, and notify banner.</p><button class="btn wide" id="dbs-reset">Reset simulator</button>`;
  $('dbs-kind').value = a.kind;
  fillSpeciesSelect(a);
  $('dbs-slot').onchange = e => { cfg.selected = e.target.value; save(cfg); renderStage(cfg); renderPanel(cfg); };
  $('dbs-kind').onchange = () => { a.kind = $('dbs-kind').value; a.speciesId = a.kind === 'enemy' ? ENEMY_KEYS[0] : PET_KEYS[0]; fillSpeciesSelect(a); save(cfg); renderStage(cfg); renderPanel(cfg); };
  $('dbs-species').onchange = e => { a.speciesId = e.target.value; save(cfg); renderStage(cfg); renderPanel(cfg); };
  $('dbs-scale').oninput = e => { $('dbs-scale-val').textContent = e.target.value; a.scale = Number(e.target.value); save(cfg); renderStage(cfg); };
  $('dbs-save-actor').onclick = () => { Object.assign(a, { label:$('dbs-label').value.trim() || key, x:round($('dbs-x').value), y:round($('dbs-y').value), scale:Number($('dbs-scale').value), hover:$('dbs-hover').checked, visible:$('dbs-visible').checked }); save(cfg); renderStage(cfg); renderPanel(cfg); };
  $('dbs-hover').onchange = $('dbs-visible').onchange = $('dbs-save-actor').onclick;
  $('dbs-reset').onclick = () => { if (!confirm('Reset simulator layout?')) return; localStorage.removeItem(SIM_KEY); openSim(); };
}
function fillSpeciesSelect(a) {
  const sel = $('dbs-species'); if (!sel) return;
  const keys = a.kind === 'enemy' ? ENEMY_KEYS : PET_KEYS;
  const table = a.kind === 'enemy' ? ANTIVIRUZ : SPECIES;
  sel.innerHTML = keys.map(id => `<option value="${id}" ${id===a.speciesId?'selected':''}>${table[id].name} — ${id}</option>`).join('');
}
async function copyPatch() {
  const patch = loadPatch(); patch.battleSimulator = load(); savePatch(patch);
  const text = JSON.stringify(patch, null, 2);
  try { await navigator.clipboard.writeText(text); alert('Battle simulator JSON copied. Paste it in chat.'); }
  catch { prompt('Copy this JSON:', text); }
}
function injectStyles() {
  if ($('dev-battle-sim-style')) return;
  const st = document.createElement('style'); st.id = 'dev-battle-sim-style';
  st.textContent = `#dev-battle-sim-btn{position:fixed;top:calc(env(safe-area-inset-top,0px) + 48px);right:8px;z-index:9999;padding:8px 10px;border-radius:999px;border:2px solid #fff;background:#6c5cff;color:#fff;font:12px var(--pixel,monospace);box-shadow:0 3px 12px rgba(0,0,0,.25)}.dev-battle-sim{position:fixed;inset:0;z-index:200000;background:#050713;color:#fff;font-family:var(--mono,monospace);display:flex;flex-direction:column}.dbs-top{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #334;background:#11162a}.dbs-top span{opacity:.7;font-size:12px;flex:1}.dbs-top button{border:1px solid #778;background:#222b55;color:#fff;border-radius:8px;padding:7px 9px}.dbs-wrap{display:grid;grid-template-columns:minmax(0,1fr) 285px;min-height:0;flex:1}.dbs-stage{position:relative;overflow:hidden;background:linear-gradient(#132047,#291b45 58%,#120d20);touch-action:none}.dbs-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 28%,rgba(95,232,255,.25),transparent 28%),radial-gradient(circle at 30% 70%,rgba(255,112,215,.18),transparent 30%)}.dbs-ground{position:absolute;left:5%;right:5%;bottom:13%;height:18%;border-radius:50%;background:rgba(0,0,0,.25);filter:blur(6px)}.dbs-actor{position:absolute;transform:translate(-50%,-100%) scale(var(--s));transform-origin:50% 100%;border:0;background:transparent;color:#fff;touch-action:none;z-index:4}.dbs-actor.on{filter:drop-shadow(0 0 8px #ff70d7)}.dbs-actor small{display:block;background:rgba(0,0,0,.65);border:1px solid #fff;border-radius:999px;padding:2px 6px;white-space:nowrap}.dbs-sprite{width:112px;height:112px;object-fit:contain;image-rendering:pixelated}.dbs-actor.hover .dbs-sprite{animation:dbsFloat 1.6s ease-in-out infinite}.dbs-actor.grounded .dbs-sprite{animation:none!important}.dbs-ui{position:absolute;min-width:90px;min-height:34px;z-index:5;border:2px dashed #ff70d7;background:rgba(0,0,0,.58);color:#fff;border-radius:10px;padding:5px;touch-action:none;text-align:left}.dbs-ui b{display:block;font-size:11px}.dbs-ui i{font-style:normal;font-size:10px;opacity:.8}.dbs-ui span{display:inline-block;margin:2px;padding:3px 5px;border:1px solid #778;border-radius:6px}.dbs-ui .hp,.dbs-ui .mp{display:block;height:5px;border-radius:999px;margin-top:3px}.dbs-ui .hp{background:#ff3b5c;width:80px}.dbs-ui .mp{background:#3fe4ff;width:55px}.dbs-ui.banner{text-align:center;background:rgba(255,220,70,.85);color:#201000}.dbs-panel{overflow:auto;background:#0f1324;border-left:1px solid #334;padding:10px}.dbs-panel label{display:flex;flex-direction:column;gap:4px;margin:8px 0}.dbs-panel input,.dbs-panel select{width:100%;padding:7px;background:#060916;color:#fff;border:1px solid #445;border-radius:7px}.dbs-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dbs-check{flex-direction:row!important;align-items:center}.dbs-check input{width:auto}.dbs-preview{text-align:center;background:#070a15;border:1px solid #334;border-radius:12px;padding:8px}.dbs-preview-sprite{width:120px;height:120px;object-fit:contain;image-rendering:pixelated}@keyframes dbsFloat{0%,100%{translate:0 0}50%{translate:0 -8px}}@media(max-width:760px){.dbs-wrap{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 42vh}.dbs-panel{border-left:0;border-top:1px solid #334}.dbs-sprite{width:86px;height:86px}.dbs-top span{display:none}}`;
  document.head.appendChild(st);
}
function boot() {
  injectStyles(); ensureButton();
  setInterval(ensureButton, 800);
  window.VIRUZ_OPEN_BATTLE_SIM = openSim;
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
