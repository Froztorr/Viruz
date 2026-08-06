// Galaxy realm expansion.
//
// The final map files do not need to exist yet. The world first requests the
// filenames below, then this module falls back to the existing Hell media if
// a video is missing. Uploading the final files and reloading is enough to
// activate them; no code change is required.

import { MAPS, ZONES } from './data.js';
import { G, save } from './state.js';

const FALLBACK_VIDEO = 'assets/maps/hell.mp4';
const FALLBACK_POSTER = 'assets/maps/hell.jpg';

const galaxyMaps = [
  {
    id:'galaxy', name:'Galaxy Gate', thai:'ประตูแห่งดาราจักร',
    video:'assets/maps/galaxy.mp4', poster:'assets/maps/galaxy.jpg',
    fallbackVideo:FALLBACK_VIDEO, fallbackPoster:FALLBACK_POSTER,
    levelRange:[101,165],
    desc:'ศูนย์กลางดาราจักร — เลือกดาวหรือยานเพื่อเข้าสู่แผนที่ย่อย',
    warpIn:{ x:12, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_red', parentMapId:'galaxy', parentGateId:'galaxy_red_gate',
    name:'Red Giant', thai:'เขตดาวยักษ์แดง',
    video:'assets/maps/galaxy_red.mp4', poster:'assets/maps/galaxy_red.jpg',
    fallbackVideo:FALLBACK_VIDEO, fallbackPoster:FALLBACK_POSTER,
    levelRange:[101,120], desc:'ทางเดินเหนือเปลวสุริยะของดาวยักษ์แดง',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_rings', parentMapId:'galaxy', parentGateId:'galaxy_rings_gate',
    name:'Ringed Star', thai:'เขตวงแหวนดารา',
    video:'assets/maps/galaxy_rings.mp4', poster:'assets/maps/galaxy_rings.jpg',
    fallbackVideo:FALLBACK_VIDEO, fallbackPoster:FALLBACK_POSTER,
    levelRange:[121,135], desc:'วงแหวนผลึกและซากโบราณที่โคจรรอบดาวสีทอง',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_dwarf', parentMapId:'galaxy', parentGateId:'galaxy_dwarf_gate',
    name:'Blue Dwarf', thai:'เขตดาวแคระสีน้ำเงิน',
    video:'assets/maps/galaxy_dwarf.mp4', poster:'assets/maps/galaxy_dwarf.jpg',
    fallbackVideo:FALLBACK_VIDEO, fallbackPoster:FALLBACK_POSTER,
    levelRange:[136,147], desc:'สะพานผลึกท่ามกลางโคโรนาสีน้ำเงิน',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_ship', parentMapId:'galaxy', parentGateId:'galaxy_ship_gate',
    name:'Derelict Starship', thai:'ยานร้างกลางอวกาศ',
    video:'assets/maps/galaxy_ship.mp4', poster:'assets/maps/galaxy_ship.jpg',
    fallbackVideo:FALLBACK_VIDEO, fallbackPoster:FALLBACK_POSTER,
    levelRange:[148,165], desc:'โถงภายในยานร้างที่ยังมีระบบบางส่วนทำงานอยู่',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
];

// The four hub gates are regular world nodes so the existing position and
// "you are here" systems can track them. Their clicks are upgraded below to
// open the corresponding full child map rather than the safe-zone screen.
const galaxyGates = [
  { id:'galaxy_red_gate', map:'galaxy', kind:'safe', order:0,
    targetMapId:'galaxy_red', icon:'🔴', name:'Red Giant', thai:'ดาวยักษ์แดง', x:30, y:28,
    desc:'เข้าสู่แผนที่ย่อยดาวยักษ์แดง' },
  { id:'galaxy_rings_gate', map:'galaxy', kind:'safe', order:0,
    targetMapId:'galaxy_rings', icon:'🪐', name:'Ringed Star', thai:'ดาวแห่งวงแหวน', x:70, y:45,
    desc:'เข้าสู่แผนที่ย่อยดาวแห่งวงแหวน' },
  { id:'galaxy_dwarf_gate', map:'galaxy', kind:'safe', order:0,
    targetMapId:'galaxy_dwarf', icon:'⭐', name:'Blue Dwarf', thai:'ดาวแคระสีน้ำเงิน', x:34, y:62,
    desc:'เข้าสู่แผนที่ย่อยดาวแคระสีน้ำเงิน' },
  { id:'galaxy_ship_gate', map:'galaxy', kind:'safe', order:0,
    targetMapId:'galaxy_ship', icon:'🚀', name:'Derelict Starship', thai:'ยานร้างกลางอวกาศ', x:78, y:80,
    desc:'เข้าสู่แผนที่ย่อยยานร้าง' },
];

const galaxyZones = [
  // Red Giant · 5 nodes
  { id:'gr_corona', map:'galaxy_red', kind:'battle', order:1,
    name:'Corona Reach', thai:'ขอบโคโรนา', x:26, y:30, lv:[101,105], waves:[3,4],
    pool:['fire_golem','black_beast'], reward:{ bitzMult:7.0, expMult:6.5 },
    desc:'ทางผ่านเหนือขอบโคโรนาที่ปั่นป่วน' },
  { id:'gr_sunspots', map:'galaxy_red', kind:'battle', order:2,
    name:'Sunspot Basin', thai:'แอ่งจุดมืดสุริยะ', x:70, y:34, lv:[106,110], waves:[3,4],
    pool:['black_beast','vampire_lady'], reward:{ bitzMult:7.4, expMult:6.9 },
    desc:'แอ่งมืดที่ซ่อนศัตรูจากแสงดาว' },
  { id:'gr_prominence', map:'galaxy_red', kind:'battle', order:3,
    name:'Prominence Arch', thai:'ซุ้มเปลวสุริยะ', x:40, y:50, lv:[111,115], waves:[3,4],
    pool:['fire_golem','vampire_lord'], reward:{ bitzMult:7.8, expMult:7.3 },
    desc:'เปลวสุริยะโค้งสูงเหนือเส้นทาง' },
  { id:'gr_corepath', map:'galaxy_red', kind:'battle', order:4,
    name:'Crimson Coreway', thai:'ทางแกนสีชาด', x:32, y:72, lv:[116,120], waves:[4,4],
    pool:['fire_golem','vampire_lord','black_beast'], reward:{ bitzMult:8.3, expMult:7.8 },
    desc:'เส้นทางที่ร้อนที่สุดใกล้แกนดาว' },
  { id:'gr_station', map:'galaxy_red', kind:'safe', order:0,
    name:'Corona Station', thai:'สถานีโคโรนา', x:74, y:62,
    desc:'สถานีโคจรสำหรับพักฟื้นและซื้อยา' },

  // Ringed Star · 4 nodes
  { id:'gg_iceband', map:'galaxy_rings', kind:'battle', order:1,
    name:'Ice Band', thai:'แนววงแหวนน้ำแข็ง', x:28, y:32, lv:[121,125], waves:[3,4],
    pool:['rock_golem','sand_turtle'], reward:{ bitzMult:8.6, expMult:8.0 },
    desc:'ทางวงแหวนที่เต็มไปด้วยผลึกน้ำแข็ง' },
  { id:'gg_ruins', map:'galaxy_rings', kind:'battle', order:2,
    name:'Orbital Ruins', thai:'ซากโคจรโบราณ', x:66, y:44, lv:[126,130], waves:[3,4],
    pool:['rock_golem','flying_fish'], reward:{ bitzMult:9.0, expMult:8.4 },
    desc:'ซากหอดูดาวโบราณกลางวงแหวน' },
  { id:'gg_debris', map:'galaxy_rings', kind:'battle', order:3,
    name:'Debris Crown', thai:'มงกุฎเศษดาว', x:72, y:70, lv:[131,135], waves:[4,4],
    pool:['rock_golem','sand_turtle','flying_fish'], reward:{ bitzMult:9.5, expMult:8.9 },
    desc:'แนวเศษดาวหนาแน่นที่หมุนด้วยความเร็วสูง' },
  { id:'gg_outpost', map:'galaxy_rings', kind:'safe', order:0,
    name:'Crystal Outpost', thai:'ฐานผลึก', x:36, y:58,
    desc:'ฐานขุดผลึกสำหรับพักฟื้นและซื้อยา' },

  // Blue Dwarf · 3 nodes
  { id:'gd_bridge', map:'galaxy_dwarf', kind:'battle', order:1,
    name:'Celestial Bridge', thai:'สะพานดารา', x:30, y:40, lv:[136,139], waves:[3,4],
    pool:['kappa','flying_fish'], reward:{ bitzMult:9.8, expMult:9.2 },
    desc:'สะพานผลึกที่สั่นตามคลื่นพลังงาน' },
  { id:'gd_storm', map:'galaxy_dwarf', kind:'battle', order:2,
    name:'Corona Storm', thai:'พายุโคโรนา', x:70, y:52, lv:[140,143], waves:[4,4],
    pool:['fire_golem','rainbow_frog'], reward:{ bitzMult:10.2, expMult:9.6 },
    desc:'พายุพลังงานสีน้ำเงินรอบดาวแคระ' },
  { id:'gd_nexus', map:'galaxy_dwarf', kind:'battle', order:3,
    name:'Azure Nexus', thai:'ศูนย์รวมสีคราม', x:38, y:68, lv:[144,147], waves:[4,5],
    pool:['fire_golem','vampire_lady','flying_fish'], reward:{ bitzMult:10.7, expMult:10.0 },
    desc:'จุดรวมสายฟ้าและคลื่นกระแทกจากดาว' },

  // Derelict Starship · 4 nodes
  { id:'gs_medbay', map:'galaxy_ship', kind:'safe', order:0,
    name:'Restored Med-Bay', thai:'ห้องพยาบาลที่กู้คืน', x:32, y:30,
    desc:'ระบบพยาบาลที่ยังใช้พักฟื้นและซื้อยาได้' },
  { id:'gs_navigation', map:'galaxy_ship', kind:'battle', order:1,
    name:'Navigation Chamber', thai:'ห้องนำทาง', x:68, y:42, lv:[148,153], waves:[4,4],
    pool:['goblin_miner','butler_vamp'], reward:{ bitzMult:11.0, expMult:10.3 },
    desc:'ห้องนำทางที่ถูกระบบไวรัสยึดครอง' },
  { id:'gs_engine', map:'galaxy_ship', kind:'battle', order:2,
    name:'Engine Vault', thai:'ห้องเครื่องปฏิกรณ์', x:34, y:56, lv:[154,159], waves:[4,5],
    pool:['fire_golem','rock_golem'], reward:{ bitzMult:11.5, expMult:10.8 },
    desc:'ห้องเครื่องที่พลังงานกำลังไม่เสถียร' },
  { id:'gs_command', map:'galaxy_ship', kind:'battle', order:3,
    name:'Sealed Command Bridge', thai:'สะพานบัญชาการปิดผนึก', x:70, y:68, lv:[160,165], waves:[5,5],
    pool:['vampire_lord','fire_golem','black_beast'], reward:{ bitzMult:12.2, expMult:11.5 },
    desc:'ศูนย์บัญชาการสุดท้ายของยานร้าง' },
];

// Idempotent data registration keeps hot reloads/tests from duplicating maps.
const hell = MAPS.find(map => map.id === 'hell');
if (hell) hell.warpOut = { x:88, y:10 };
for (const map of galaxyMaps) if (!MAPS.some(existing => existing.id === map.id)) MAPS.push(map);
for (const zone of [...galaxyGates, ...galaxyZones]) {
  if (!ZONES.some(existing => existing.id === zone.id)) ZONES.push(zone);
}

const gateByName = new Map(galaxyGates.map(gate => [gate.name, gate]));
const childMapIds = new Set(galaxyMaps.filter(map => map.parentMapId).map(map => map.id));
let armedGalaxyPin = null;
let armedTimer = null;

function clearArmedGalaxyPin() {
  clearTimeout(armedTimer);
  armedTimer = null;
  armedGalaxyPin = null;
  document.querySelectorAll('.zone-pin.galaxy-armed').forEach(pin => {
    pin.classList.remove('armed', 'galaxy-armed');
  });
}

function armOrConfirm(pin, key, action) {
  if (armedGalaxyPin === key) {
    clearArmedGalaxyPin();
    action();
    return;
  }
  clearArmedGalaxyPin();
  armedGalaxyPin = key;
  pin.classList.add('armed', 'galaxy-armed');
  armedTimer = setTimeout(clearArmedGalaxyPin, 5000);
}

async function redrawWorld() {
  const { renderWorld } = await import('./screens/world.js');
  renderWorld();
}

function enterChildMap(gate) {
  G.currentMapId = gate.targetMapId;
  G.worldPos = { mapId:gate.targetMapId, nodeId:'warpIn' };
  save();
  redrawWorld();
}

function returnToGalaxy(childMap) {
  G.currentMapId = childMap.parentMapId;
  G.worldPos = { mapId:childMap.parentMapId, nodeId:childMap.parentGateId };
  save();
  redrawWorld();
}

function decorateGalaxyGates() {
  if (G.currentMapId !== 'galaxy') return;
  document.querySelectorAll('#world-pins .zone-pin').forEach(pin => {
    const title = pin.querySelector('.pin-card b')?.textContent?.trim();
    const gate = gateByName.get(title);
    if (!gate) return;
    pin.dataset.galaxyTarget = gate.targetMapId;
    pin.dataset.galaxyGate = gate.id;
    pin.classList.remove('safe');
    pin.classList.add('warp-out', 'galaxy-gate');
    const target = MAPS.find(map => map.id === gate.targetMapId);
    const extra = pin.querySelector('.pin-extra');
    if (extra && target) {
      extra.innerHTML = `<i>${gate.icon} ${gate.thai}</i><em>แผนที่ย่อย · Lv ${target.levelRange[0]}–${target.levelRange[1]}</em>`;
    }
  });
}

// Upgrade the four hub nodes and each child map's entry gate without changing
// the existing Forest/Hell click and two-tap behavior.
const pinLayer = document.getElementById('world-pins');
if (pinLayer) {
  new MutationObserver(decorateGalaxyGates).observe(pinLayer, { childList:true, subtree:true });
  queueMicrotask(decorateGalaxyGates);
}

document.addEventListener('click', event => {
  const pin = event.target.closest?.('.zone-pin');
  if (!pin) return;

  if (G.currentMapId === 'galaxy' && pin.dataset.galaxyGate) {
    const gate = galaxyGates.find(item => item.id === pin.dataset.galaxyGate);
    if (!gate) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    armOrConfirm(pin, gate.id, () => enterChildMap(gate));
    return;
  }

  const childMap = galaxyMaps.find(map => map.id === G.currentMapId && map.parentMapId);
  if (childMap && pin.classList.contains('warp-in')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    armOrConfirm(pin, `${childMap.id}:return`, () => returnToGalaxy(childMap));
  }
}, true);

// Missing final media never leaves the world screen on a broken video. This
// handler switches once to a valid shipped map until the next map entry/reload.
const worldVideo = document.getElementById('world-video');
if (worldVideo) {
  worldVideo.addEventListener('error', () => {
    const map = MAPS.find(item => item.id === G.currentMapId);
    if (!map?.fallbackVideo) return;
    const current = worldVideo.getAttribute('src') || '';
    if (current.endsWith(map.fallbackVideo)) return;
    worldVideo.setAttribute('poster', map.fallbackPoster || FALLBACK_POSTER);
    worldVideo.setAttribute('src', map.fallbackVideo);
    worldVideo.load();
    worldVideo.play().catch(() => {});
  }, true);
}

export { galaxyMaps, galaxyGates, galaxyZones };
