from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"Anchor not found: {label}")
    return text.replace(old, new, 1)


data_path = Path("src/data.js")
data = data_path.read_text(encoding="utf-8")

if "id:'galaxy'" not in data:
    data = replace_once(
        data,
        "    warpIn:{ x:10, y:90 }, warpOut:null,",
        "    warpIn:{ x:10, y:90 }, warpOut:{ x:88, y:10 },",
        "Hell warpOut",
    )

    maps = """  {
    id:'galaxy', name:'Galaxy Gate', thai:'ประตูแห่งดาราจักร',
    video:'assets/maps/galaxy.mp4', poster:'assets/maps/galaxy.jpg',
    fallbackVideo:'assets/maps/hell.mp4', fallbackPoster:'assets/maps/hell.jpg',
    levelRange:[101,165],
    desc:'ศูนย์กลางดาราจักร — เลือกดาวหรือยานเพื่อเข้าสู่แผนที่ย่อย',
    warpIn:{ x:12, y:88 }, warpOut:null,
    gates:[
      { id:'galaxy_red_gate', targetMapId:'galaxy_red', name:'Red Giant', thai:'ดาวยักษ์แดง', icon:'🔴', x:30, y:28 },
      { id:'galaxy_rings_gate', targetMapId:'galaxy_rings', name:'Ringed Star', thai:'ดาวแห่งวงแหวน', icon:'🪐', x:70, y:45 },
      { id:'galaxy_dwarf_gate', targetMapId:'galaxy_dwarf', name:'Blue Dwarf', thai:'ดาวแคระสีน้ำเงิน', icon:'⭐', x:34, y:62 },
      { id:'galaxy_ship_gate', targetMapId:'galaxy_ship', name:'Derelict Starship', thai:'ยานร้างกลางอวกาศ', icon:'🚀', x:78, y:80 },
    ],
  },
  {
    id:'galaxy_red', parentMapId:'galaxy', parentGateId:'galaxy_red_gate',
    name:'Red Giant', thai:'เขตดาวยักษ์แดง',
    video:'assets/maps/galaxy_red.mp4', poster:'assets/maps/galaxy_red.jpg',
    fallbackVideo:'assets/maps/hell.mp4', fallbackPoster:'assets/maps/hell.jpg',
    levelRange:[101,120], desc:'ทางเดินเหนือเปลวสุริยะของดาวยักษ์แดง',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_rings', parentMapId:'galaxy', parentGateId:'galaxy_rings_gate',
    name:'Ringed Star', thai:'เขตวงแหวนดารา',
    video:'assets/maps/galaxy_rings.mp4', poster:'assets/maps/galaxy_rings.jpg',
    fallbackVideo:'assets/maps/hell.mp4', fallbackPoster:'assets/maps/hell.jpg',
    levelRange:[121,135], desc:'วงแหวนผลึกและซากโบราณที่โคจรรอบดาวสีทอง',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_dwarf', parentMapId:'galaxy', parentGateId:'galaxy_dwarf_gate',
    name:'Blue Dwarf', thai:'เขตดาวแคระสีน้ำเงิน',
    video:'assets/maps/galaxy_dwarf.mp4', poster:'assets/maps/galaxy_dwarf.jpg',
    fallbackVideo:'assets/maps/hell.mp4', fallbackPoster:'assets/maps/hell.jpg',
    levelRange:[136,147], desc:'สะพานผลึกท่ามกลางโคโรนาสีน้ำเงิน',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
  {
    id:'galaxy_ship', parentMapId:'galaxy', parentGateId:'galaxy_ship_gate',
    name:'Derelict Starship', thai:'ยานร้างกลางอวกาศ',
    video:'assets/maps/galaxy_ship.mp4', poster:'assets/maps/galaxy_ship.jpg',
    fallbackVideo:'assets/maps/hell.mp4', fallbackPoster:'assets/maps/hell.jpg',
    levelRange:[148,165], desc:'โถงภายในยานร้างที่ยังมีระบบบางส่วนทำงานอยู่',
    warpIn:{ x:50, y:88 }, warpOut:null,
  },
"""
    marker = "];\n\n// ── ZONES ──"
    data = replace_once(data, marker, maps + "];\n\n// ── ZONES ──", "end of MAPS")

if "id:'gr_corona'" not in data:
    zones = """
  // ══ GALAXY · RED GIANT (Lv 101-120) ══
  { id:'gr_corona', map:'galaxy_red', kind:'battle', order:1,
    name:'Corona Reach', thai:'ขอบโคโรนา', x:26, y:30,
    lv:[101,105], waves:[3,4], pool:['fire_golem','black_beast'],
    reward:{ bitzMult:7.0, expMult:6.5 }, desc:'ทางผ่านเหนือขอบโคโรนาที่ปั่นป่วน' },
  { id:'gr_sunspots', map:'galaxy_red', kind:'battle', order:2,
    name:'Sunspot Basin', thai:'แอ่งจุดมืดสุริยะ', x:70, y:34,
    lv:[106,110], waves:[3,4], pool:['black_beast','vampire_lady'],
    reward:{ bitzMult:7.4, expMult:6.9 }, desc:'แอ่งมืดที่ซ่อนศัตรูจากแสงดาว' },
  { id:'gr_prominence', map:'galaxy_red', kind:'battle', order:3,
    name:'Prominence Arch', thai:'ซุ้มเปลวสุริยะ', x:40, y:50,
    lv:[111,115], waves:[3,4], pool:['fire_golem','vampire_lord'],
    reward:{ bitzMult:7.8, expMult:7.3 }, desc:'เปลวสุริยะโค้งสูงเหนือเส้นทาง' },
  { id:'gr_corepath', map:'galaxy_red', kind:'battle', order:4,
    name:'Crimson Coreway', thai:'ทางแกนสีชาด', x:32, y:72,
    lv:[116,120], waves:[4,4], pool:['fire_golem','vampire_lord','black_beast'],
    reward:{ bitzMult:8.3, expMult:7.8 }, desc:'เส้นทางที่ร้อนที่สุดใกล้แกนดาว' },
  { id:'gr_station', map:'galaxy_red', kind:'safe', order:0,
    name:'Corona Station', thai:'สถานีโคโรนา', x:74, y:62,
    desc:'สถานีโคจรสำหรับพักฟื้นและซื้อยา' },

  // ══ GALAXY · RINGED STAR (Lv 121-135) ══
  { id:'gg_iceband', map:'galaxy_rings', kind:'battle', order:1,
    name:'Ice Band', thai:'แนววงแหวนน้ำแข็ง', x:28, y:32,
    lv:[121,125], waves:[3,4], pool:['rock_golem','sand_turtle'],
    reward:{ bitzMult:8.6, expMult:8.0 }, desc:'ทางวงแหวนที่เต็มไปด้วยผลึกน้ำแข็ง' },
  { id:'gg_ruins', map:'galaxy_rings', kind:'battle', order:2,
    name:'Orbital Ruins', thai:'ซากโคจรโบราณ', x:66, y:44,
    lv:[126,130], waves:[3,4], pool:['rock_golem','flying_fish'],
    reward:{ bitzMult:9.0, expMult:8.4 }, desc:'ซากหอดูดาวโบราณกลางวงแหวน' },
  { id:'gg_debris', map:'galaxy_rings', kind:'battle', order:3,
    name:'Debris Crown', thai:'มงกุฎเศษดาว', x:72, y:70,
    lv:[131,135], waves:[4,4], pool:['rock_golem','sand_turtle','flying_fish'],
    reward:{ bitzMult:9.5, expMult:8.9 }, desc:'แนวเศษดาวหนาแน่นที่หมุนด้วยความเร็วสูง' },
  { id:'gg_outpost', map:'galaxy_rings', kind:'safe', order:0,
    name:'Crystal Outpost', thai:'ฐานผลึก', x:36, y:58,
    desc:'ฐานขุดผลึกสำหรับพักฟื้นและซื้อยา' },

  // ══ GALAXY · BLUE DWARF (Lv 136-147) ══
  { id:'gd_bridge', map:'galaxy_dwarf', kind:'battle', order:1,
    name:'Celestial Bridge', thai:'สะพานดารา', x:30, y:40,
    lv:[136,139], waves:[3,4], pool:['kappa','flying_fish'],
    reward:{ bitzMult:9.8, expMult:9.2 }, desc:'สะพานผลึกที่สั่นตามคลื่นพลังงาน' },
  { id:'gd_storm', map:'galaxy_dwarf', kind:'battle', order:2,
    name:'Corona Storm', thai:'พายุโคโรนา', x:70, y:52,
    lv:[140,143], waves:[4,4], pool:['fire_golem','rainbow_frog'],
    reward:{ bitzMult:10.2, expMult:9.6 }, desc:'พายุพลังงานสีน้ำเงินรอบดาวแคระ' },
  { id:'gd_nexus', map:'galaxy_dwarf', kind:'battle', order:3,
    name:'Azure Nexus', thai:'ศูนย์รวมสีคราม', x:38, y:68,
    lv:[144,147], waves:[4,5], pool:['fire_golem','vampire_lady','flying_fish'],
    reward:{ bitzMult:10.7, expMult:10.0 }, desc:'จุดรวมสายฟ้าและคลื่นกระแทกจากดาว' },

  // ══ GALAXY · DERELICT STARSHIP (Lv 148-165) ══
  { id:'gs_medbay', map:'galaxy_ship', kind:'safe', order:0,
    name:'Restored Med-Bay', thai:'ห้องพยาบาลที่กู้คืน', x:32, y:30,
    desc:'ระบบพยาบาลที่ยังใช้พักฟื้นและซื้อยาได้' },
  { id:'gs_navigation', map:'galaxy_ship', kind:'battle', order:1,
    name:'Navigation Chamber', thai:'ห้องนำทาง', x:68, y:42,
    lv:[148,153], waves:[4,4], pool:['goblin_miner','butler_vamp'],
    reward:{ bitzMult:11.0, expMult:10.3 }, desc:'ห้องนำทางที่ถูกระบบไวรัสยึดครอง' },
  { id:'gs_engine', map:'galaxy_ship', kind:'battle', order:2,
    name:'Engine Vault', thai:'ห้องเครื่องปฏิกรณ์', x:34, y:56,
    lv:[154,159], waves:[4,5], pool:['fire_golem','rock_golem'],
    reward:{ bitzMult:11.5, expMult:10.8 }, desc:'ห้องเครื่องที่พลังงานกำลังไม่เสถียร' },
  { id:'gs_command', map:'galaxy_ship', kind:'battle', order:3,
    name:'Sealed Command Bridge', thai:'สะพานบัญชาการปิดผนึก', x:70, y:68,
    lv:[160,165], waves:[5,5], pool:['vampire_lord','fire_golem','black_beast'],
    reward:{ bitzMult:12.2, expMult:11.5 }, desc:'ศูนย์บัญชาการสุดท้ายของยานร้าง' },
"""
    marker = "];\n\nexport function zonesOfMap"
    data = replace_once(data, marker, zones + "];\n\nexport function zonesOfMap", "end of ZONES")

data_path.write_text(data, encoding="utf-8")

world_path = Path("src/screens/world.js")
world = world_path.read_text(encoding="utf-8")

if "const gate = (map.gates || []).find" not in world:
    world = replace_once(
        world,
        "  if (nodeId === 'warpOut') return map.warpOut;\n  const z = zoneById(nodeId);",
        "  if (nodeId === 'warpOut') return map.warpOut;\n  const gate = (map.gates || []).find(g => g.id === nodeId);\n  if (gate) return { x: gate.x, y: gate.y };\n  const z = zoneById(nodeId);",
        "gate coordinates",
    )

if "vid.dataset.mapId !== map.id" not in world:
    old = """  const vid = $('world-video');
  if (vid) {
    const want = map.video;
    if (!vid.getAttribute('src') || !vid.getAttribute('src').endsWith(want)) {
      vid.setAttribute('src', want);
      vid.setAttribute('poster', map.poster);
      vid.load();
    }
    vid.play().catch(()=>{});
  }"""
    new = """  const vid = $('world-video');
  if (vid) {
    // Try the final map filename once, then stay on a known-good fallback.
    // A page reload retries the final filename after new media is uploaded.
    if (vid.dataset.mapId !== map.id) {
      vid.dataset.mapId = map.id;
      vid.dataset.usingFallback = '0';
      vid.onerror = () => {
        if (!map.fallbackVideo || vid.dataset.usingFallback === '1') return;
        vid.dataset.usingFallback = '1';
        vid.setAttribute('poster', map.fallbackPoster || 'assets/maps/hell.jpg');
        vid.setAttribute('src', map.fallbackVideo);
        vid.load();
        vid.play().catch(()=>{});
      };
      vid.setAttribute('poster', map.poster || map.fallbackPoster || 'assets/maps/hell.jpg');
      vid.setAttribute('src', map.video);
      vid.load();
    }
    vid.play().catch(()=>{});
  }"""
    world = replace_once(world, old, new, "world video fallback")

if "(map.gates || []).forEach(gate =>" not in world:
    marker = """  // Warp gates — warpIn is where the player lands on their first ever
  // visit to this map; warpOut (only if this isn't the last map) rides"""
    block = """  // Galaxy hub gates open full child maps with their own nodes.
  (map.gates || []).forEach(gate => {
    const targetMap = MAPS.find(m => m.id === gate.targetMapId);
    if (!targetMap) return;
    const pin = el('button', 'zone-pin warp-out galaxy-gate');
    pin.style.left = gate.x + '%';
    pin.style.top = gate.y + '%';
    pin.innerHTML = `
      <span class=\"pin-dot\"></span>
      <span class=\"pin-card\"><b>${gate.icon || '✦'} ${gate.name}</b>
        <span class=\"pin-extra\"><i>${gate.thai || ''}</i><em>แผนที่ย่อย · Lv ${targetMap.levelRange[0]}–${targetMap.levelRange[1]}</em></span>
      </span>`;
    wireArmedPinTap(pin, gate.id, () => enterGalaxySubmap(gate, targetMap));
    layer.appendChild(pin);
  });

  // Warp gates — warpIn is where the player lands on their first ever
  // visit to this map; warpOut (only if this isn't the last map) rides"""
    world = replace_once(world, marker, block, "Galaxy gate renderer")

if "function enterGalaxySubmap(" not in world:
    marker = """// Confirmation before actually stepping through a warpOut gate into
// the next map — resets G.worldPos to that map's own warpIn.
function openWarpGate(map, nextMap) {"""
    block = """// Enter a Galaxy child map from one of the four hub gates.
function enterGalaxySubmap(gate, targetMap) {
  currentMapId = targetMap.id;
  G.currentMapId = targetMap.id;
  G.worldPos = { mapId: targetMap.id, nodeId: 'warpIn' };
  save();
  renderWorld();
}

// Confirmation before actually stepping through a warpOut gate into
// the next map — resets G.worldPos to that map's own warpIn.
function openWarpGate(map, nextMap) {"""
    world = replace_once(world, marker, block, "Galaxy submap entry")

if "const parentMap = map.parentMapId" not in world:
    world = replace_once(
        world,
        "  const prevMap = MAPS[mapIdx - 1];\n  modal('🌀 Warp Gate', wrap => {",
        "  const prevMap = MAPS[mapIdx - 1];\n  const parentMap = map.parentMapId ? MAPS.find(m => m.id === map.parentMapId) : null;\n  modal('🌀 Warp Gate', wrap => {",
        "parent map lookup",
    )
    old = """    if (prevMap) {
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
    }"""
    new = """    if (parentMap) {
      const back = el('button', 'btn wide', `◀ กลับไปยัง ${parentMap.name}`);
      back.onclick = () => {
        closeModal();
        currentMapId = parentMap.id;
        G.currentMapId = parentMap.id;
        G.worldPos = { mapId: parentMap.id, nodeId: map.parentGateId || 'warpIn' };
        save();
        renderWorld();
      };
      box.appendChild(back);
    } else if (prevMap) {
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
    }"""
    world = replace_once(world, old, new, "child-to-hub return")

world_path.write_text(world, encoding="utf-8")

combined = data_path.read_text(encoding="utf-8") + world_path.read_text(encoding="utf-8")
required = [
    "id:'galaxy'", "id:'galaxy_red'", "id:'galaxy_rings'",
    "id:'galaxy_dwarf'", "id:'galaxy_ship'", "id:'gs_command'",
    "parentMapId:'galaxy'", "function enterGalaxySubmap(",
    "const gate = (map.gates || []).find", "vid.dataset.mapId !== map.id",
    "warpOut:{ x:88, y:10 }",
]
missing = [item for item in required if item not in combined]
if missing:
    raise SystemExit("Galaxy guard failed: " + ", ".join(missing))
print("Galaxy maps and routing are prepared.")
