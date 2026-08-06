// Galaxy realm expansion. Final media filenames are registered now; missing
// files fall back to Hell until the generated videos are uploaded and reloaded.
import { MAPS, ZONES } from './data.js';
import { G, save } from './state.js';

const fallbackVideo = 'assets/maps/hell.mp4';
const fallbackPoster = 'assets/maps/hell.jpg';
const media = (video, poster) => ({ video, poster, fallbackVideo, fallbackPoster });

const galaxyMaps = [
  { id:'galaxy', name:'Galaxy Gate', thai:'ประตูแห่งดาราจักร',
    ...media('assets/maps/galaxy.mp4','assets/maps/galaxy.jpg'), levelRange:[101,165],
    desc:'ศูนย์กลางดาราจักร — เลือกดาวหรือยานเพื่อเข้าสู่แผนที่ย่อย',
    warpIn:{x:12,y:88}, warpOut:null },
  { id:'galaxy_red', parentMapId:'galaxy', parentGateId:'galaxy_red_gate',
    name:'Red Giant', thai:'เขตดาวยักษ์แดง',
    ...media('assets/maps/galaxy_red.mp4','assets/maps/galaxy_red.jpg'), levelRange:[101,120],
    desc:'ทางเดินเหนือเปลวสุริยะของดาวยักษ์แดง', warpIn:{x:50,y:88}, warpOut:null },
  { id:'galaxy_rings', parentMapId:'galaxy', parentGateId:'galaxy_rings_gate',
    name:'Ringed Star', thai:'เขตวงแหวนดารา',
    ...media('assets/maps/galaxy_rings.mp4','assets/maps/galaxy_rings.jpg'), levelRange:[121,135],
    desc:'วงแหวนผลึกและซากโบราณที่โคจรรอบดาวสีทอง', warpIn:{x:50,y:88}, warpOut:null },
  { id:'galaxy_dwarf', parentMapId:'galaxy', parentGateId:'galaxy_dwarf_gate',
    name:'Blue Dwarf', thai:'เขตดาวแคระสีน้ำเงิน',
    ...media('assets/maps/galaxy_dwarf.mp4','assets/maps/galaxy_dwarf.jpg'), levelRange:[136,147],
    desc:'สะพานผลึกท่ามกลางโคโรนาสีน้ำเงิน', warpIn:{x:50,y:88}, warpOut:null },
  { id:'galaxy_ship', parentMapId:'galaxy', parentGateId:'galaxy_ship_gate',
    name:'Derelict Starship', thai:'ยานร้างกลางอวกาศ',
    ...media('assets/maps/galaxy_ship.mp4','assets/maps/galaxy_ship.jpg'), levelRange:[148,165],
    desc:'โถงภายในยานร้างที่ยังมีระบบบางส่วนทำงานอยู่', warpIn:{x:50,y:88}, warpOut:null },
];

// Hub gates use ordinary zone IDs so the existing player-position marker can
// track them. Their click action is upgraded below to enter a child map.
const galaxyGates = [
  {id:'galaxy_red_gate',targetMapId:'galaxy_red',icon:'🔴',name:'Red Giant',thai:'ดาวยักษ์แดง',x:30,y:28},
  {id:'galaxy_rings_gate',targetMapId:'galaxy_rings',icon:'🪐',name:'Ringed Star',thai:'ดาวแห่งวงแหวน',x:70,y:45},
  {id:'galaxy_dwarf_gate',targetMapId:'galaxy_dwarf',icon:'⭐',name:'Blue Dwarf',thai:'ดาวแคระสีน้ำเงิน',x:34,y:62},
  {id:'galaxy_ship_gate',targetMapId:'galaxy_ship',icon:'🚀',name:'Derelict Starship',thai:'ยานร้างกลางอวกาศ',x:78,y:80},
].map(g => ({...g,map:'galaxy',kind:'safe',order:0,desc:'เข้าสู่แผนที่ย่อย'}));

const battle = (id,map,order,name,thai,x,y,lv,waves,pool,bitzMult,expMult,desc) => ({
  id,map,kind:'battle',order,name,thai,x,y,lv,waves,pool,reward:{bitzMult,expMult},desc,
});
const safe = (id,map,name,thai,x,y,desc) => ({id,map,kind:'safe',order:0,name,thai,x,y,desc});

const galaxyZones = [
  // Red Giant · 5 nodes
  battle('gr_corona','galaxy_red',1,'Corona Reach','ขอบโคโรนา',26,30,[101,105],[3,4],['fire_golem','black_beast'],7,6.5,'ทางผ่านเหนือขอบโคโรนาที่ปั่นป่วน'),
  battle('gr_sunspots','galaxy_red',2,'Sunspot Basin','แอ่งจุดมืดสุริยะ',70,34,[106,110],[3,4],['black_beast','vampire_lady'],7.4,6.9,'แอ่งมืดที่ซ่อนศัตรูจากแสงดาว'),
  battle('gr_prominence','galaxy_red',3,'Prominence Arch','ซุ้มเปลวสุริยะ',40,50,[111,115],[3,4],['fire_golem','vampire_lord'],7.8,7.3,'เปลวสุริยะโค้งสูงเหนือเส้นทาง'),
  battle('gr_corepath','galaxy_red',4,'Crimson Coreway','ทางแกนสีชาด',32,72,[116,120],[4,4],['fire_golem','vampire_lord','black_beast'],8.3,7.8,'เส้นทางที่ร้อนที่สุดใกล้แกนดาว'),
  safe('gr_station','galaxy_red','Corona Station','สถานีโคโรนา',74,62,'สถานีโคจรสำหรับพักฟื้นและซื้อยา'),

  // Ringed Star · 4 nodes
  battle('gg_iceband','galaxy_rings',1,'Ice Band','แนววงแหวนน้ำแข็ง',28,32,[121,125],[3,4],['rock_golem','sand_turtle'],8.6,8,'ทางวงแหวนที่เต็มไปด้วยผลึกน้ำแข็ง'),
  battle('gg_ruins','galaxy_rings',2,'Orbital Ruins','ซากโคจรโบราณ',66,44,[126,130],[3,4],['rock_golem','flying_fish'],9,8.4,'ซากหอดูดาวโบราณกลางวงแหวน'),
  battle('gg_debris','galaxy_rings',3,'Debris Crown','มงกุฎเศษดาว',72,70,[131,135],[4,4],['rock_golem','sand_turtle','flying_fish'],9.5,8.9,'แนวเศษดาวหนาแน่นที่หมุนด้วยความเร็วสูง'),
  safe('gg_outpost','galaxy_rings','Crystal Outpost','ฐานผลึก',36,58,'ฐานขุดผลึกสำหรับพักฟื้นและซื้อยา'),

  // Blue Dwarf · 3 nodes
  battle('gd_bridge','galaxy_dwarf',1,'Celestial Bridge','สะพานดารา',30,40,[136,139],[3,4],['kappa','flying_fish'],9.8,9.2,'สะพานผลึกที่สั่นตามคลื่นพลังงาน'),
  battle('gd_storm','galaxy_dwarf',2,'Corona Storm','พายุโคโรนา',70,52,[140,143],[4,4],['fire_golem','rainbow_frog'],10.2,9.6,'พายุพลังงานสีน้ำเงินรอบดาวแคระ'),
  battle('gd_nexus','galaxy_dwarf',3,'Azure Nexus','ศูนย์รวมสีคราม',38,68,[144,147],[4,5],['fire_golem','vampire_lady','flying_fish'],10.7,10,'จุดรวมสายฟ้าและคลื่นกระแทกจากดาว'),

  // Derelict Starship · 4 nodes
  safe('gs_medbay','galaxy_ship','Restored Med-Bay','ห้องพยาบาลที่กู้คืน',32,30,'ระบบพยาบาลที่ยังใช้พักฟื้นและซื้อยาได้'),
  battle('gs_navigation','galaxy_ship',1,'Navigation Chamber','ห้องนำทาง',68,42,[148,153],[4,4],['goblin_miner','butler_vamp'],11,10.3,'ห้องนำทางที่ถูกระบบไวรัสยึดครอง'),
  battle('gs_engine','galaxy_ship',2,'Engine Vault','ห้องเครื่องปฏิกรณ์',34,56,[154,159],[4,5],['fire_golem','rock_golem'],11.5,10.8,'ห้องเครื่องที่พลังงานกำลังไม่เสถียร'),
  battle('gs_command','galaxy_ship',3,'Sealed Command Bridge','สะพานบัญชาการปิดผนึก',70,68,[160,165],[5,5],['vampire_lord','fire_golem','black_beast'],12.2,11.5,'ศูนย์บัญชาการสุดท้ายของยานร้าง'),
];

// Register once. This also coexists safely with a future native data.js move.
const hell = MAPS.find(m => m.id === 'hell');
if (hell) hell.warpOut = {x:88,y:10};
for (const map of galaxyMaps) if (!MAPS.some(m => m.id === map.id)) MAPS.push(map);
const nativeHub = MAPS.find(m => m.id === 'galaxy');
const zonesToAdd = nativeHub?.gates?.length ? galaxyZones : [...galaxyGates,...galaxyZones];
for (const zone of zonesToAdd) if (!ZONES.some(z => z.id === zone.id)) ZONES.push(zone);

const gateByName = new Map(galaxyGates.map(g => [g.name,g]));
let armedKey = null;
let armedTimer = null;
function clearArmed() {
  clearTimeout(armedTimer);
  armedTimer = null;
  armedKey = null;
  document.querySelectorAll('.zone-pin.galaxy-armed').forEach(pin => pin.classList.remove('armed','galaxy-armed'));
}
function armOrConfirm(pin,key,action) {
  if (armedKey === key) { clearArmed(); action(); return; }
  clearArmed();
  armedKey = key;
  pin.classList.add('armed','galaxy-armed');
  armedTimer = setTimeout(clearArmed,5000);
}
async function redrawWorld() {
  const {renderWorld} = await import('./screens/world.js');
  renderWorld();
}
function enterChild(gate) {
  G.currentMapId = gate.targetMapId;
  G.worldPos = {mapId:gate.targetMapId,nodeId:'warpIn'};
  save();
  redrawWorld();
}
function returnToHub(map) {
  G.currentMapId = map.parentMapId;
  G.worldPos = {mapId:map.parentMapId,nodeId:map.parentGateId};
  save();
  redrawWorld();
}

function decorateGates() {
  if (G.currentMapId !== 'galaxy') return;
  document.querySelectorAll('#world-pins .zone-pin').forEach(pin => {
    if (pin.dataset.galaxyGate) return; // prevents observer feedback loops
    const title = pin.querySelector('.pin-card b')?.textContent?.trim();
    const gate = gateByName.get(title);
    if (!gate) return;
    pin.dataset.galaxyGate = gate.id;
    pin.classList.remove('safe');
    pin.classList.add('warp-out','galaxy-gate');
    const target = MAPS.find(m => m.id === gate.targetMapId);
    const extra = pin.querySelector('.pin-extra');
    if (extra && target) extra.innerHTML = `<i>${gate.icon} ${gate.thai}</i><em>แผนที่ย่อย · Lv ${target.levelRange[0]}–${target.levelRange[1]}</em>`;
  });
}

const pinLayer = document.getElementById('world-pins');
if (pinLayer && !nativeHub?.gates?.length) {
  new MutationObserver(decorateGates).observe(pinLayer,{childList:true,subtree:true});
  queueMicrotask(decorateGates);
}

document.addEventListener('click',event => {
  const pin = event.target.closest?.('.zone-pin');
  if (!pin) return;
  if (G.currentMapId === 'galaxy' && pin.dataset.galaxyGate) {
    const gate = galaxyGates.find(g => g.id === pin.dataset.galaxyGate);
    if (!gate) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    armOrConfirm(pin,gate.id,() => enterChild(gate));
    return;
  }
  const child = galaxyMaps.find(m => m.id === G.currentMapId && m.parentMapId);
  if (child && pin.classList.contains('warp-in')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    armOrConfirm(pin,`${child.id}:return`,() => returnToHub(child));
  }
},true);

// Direct-src video errors bubble unreliably, so listen in capture phase.
const worldVideo = document.getElementById('world-video');
if (worldVideo) worldVideo.addEventListener('error',() => {
  const map = MAPS.find(m => m.id === G.currentMapId);
  if (!map?.fallbackVideo) return;
  const current = worldVideo.getAttribute('src') || '';
  if (current.endsWith(map.fallbackVideo)) return;
  worldVideo.setAttribute('poster',map.fallbackPoster || fallbackPoster);
  worldVideo.setAttribute('src',map.fallbackVideo);
  worldVideo.load();
  worldVideo.play().catch(() => {});
},true);

export {galaxyMaps,galaxyGates,galaxyZones};
