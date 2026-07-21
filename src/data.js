// ═══════════════════════════════════════════════════════════
// VIRUZ PET — DATA
// Pure data. No DOM, no logic. Safe to edit without touching code.
// ═══════════════════════════════════════════════════════════

// ── ATTRIBUTES (replaces the old elemental system entirely) ──
export const ATTR = {
  red: {
    id: 'red', name: 'Red', icon: '⚔️', color: '#ff6a2b',
    glow: 'rgba(255,106,43,.45)',
    desc: 'โจมตีสูง ป้องกันต่ำ',
    mult: { atk: 1.35, def: 0.75, spd: 1.00, mhp: 0.95 },
  },
  green: {
    id: 'green', name: 'Green', icon: '🌪️', color: '#3ddc84',
    glow: 'rgba(61,220,132,.45)',
    desc: 'เร็วมาก มีโอกาสตีสองครั้ง',
    mult: { atk: 1.00, def: 0.75, spd: 1.40, mhp: 0.90 },
    doubleHit: 0.28,           // chance to strike twice
  },
  yellow: {
    id: 'yellow', name: 'Yellow', icon: '🛡️', color: '#c98f1e',
    glow: 'rgba(201,143,30,.45)',
    desc: 'ป้องกันสูง แต่ช้า',
    mult: { atk: 0.85, def: 1.45, spd: 0.70, mhp: 1.25 },
  },
  white: {
    id: 'white', name: 'White', icon: '➕', color: '#f6ecd8',
    glow: 'rgba(246,236,216,.5)',
    desc: 'สายซัพพอร์ต บัฟทีมและฟื้นฟู',
    mult: { atk: 0.70, def: 0.90, spd: 0.90, mhp: 1.05 },
  },
};
export const ATTR_KEYS = ['red', 'green', 'yellow', 'white'];

// White support traits. Every white viruz has `buff` (scales with level).
// One of these is rolled on top at hatch time.
export const WHITE_TRAITS = {
  aura:  { id:'aura',  name:'Aura',      icon:'✨', desc:'บัฟสเตตัสทีมแบบคงที่' },
  regen: { id:'regen', name:'Regen',     icon:'💗', desc:'ฟื้น HP ทีมเป็นระยะ' },
  both:  { id:'both',  name:'Harmonic',  icon:'🌟', desc:'บัฟ + ฟื้นฟู (อย่างละครึ่ง)' },
};
// weights for rolling a trait
export const WHITE_TRAIT_ROLL = [
  ['aura', 0.45], ['regen', 0.45], ['both', 0.10],
];

// Support tuning
export const SUPPORT = {
  auraBasePct:   0.10,   // +10% at level 1
  auraPerLevel:  0.004,  // +0.4% per level
  auraCap:       0.35,
  regenBasePct:  0.03,   // heal 3% max HP per tick
  regenPerLevel: 0.0015,
  regenCap:      0.12,
  regenEveryMs:  8000,
  bothScale:     0.55,   // 'both' gets 55% of each
};

// ── SYNERGY ──
// Counts of the most common attribute in a team of 3.
export const SYNERGY = {
  2: { mult: 1.15, label: '2 ธาตุเดียวกัน' },
  3: { mult: 1.30, label: '3 ธาตุเดียวกัน' },
};

// ── RARITY ──
export const RARITY = {
  normal:    { id:'normal',    name:'Normal',    color:'#9aa4b8', glow:'rgba(154,164,184,.3)',  statPL:1, maxLv:30  },
  rare:      { id:'rare',      name:'Rare',      color:'#4fc3f7', glow:'rgba(79,195,247,.4)',   statPL:2, maxLv:50  },
  epic:      { id:'epic',      name:'Epic',      color:'#ce93d8', glow:'rgba(206,147,216,.45)', statPL:3, maxLv:70  },
  legendary: { id:'legendary', name:'Legendary', color:'#ffd54a', glow:'rgba(255,213,74,.5)',   statPL:4, maxLv:90  },
  mythic:    { id:'mythic',    name:'Mythic',    color:'#ff5470', glow:'rgba(255,84,112,.55)',  statPL:5, maxLv:120 },
};
export const RARITY_KEYS = ['normal','rare','epic','legendary','mythic'];

// ── SPECIES ──
// `shape` maps to a builder in src/sprites.js (drawn as inline SVG,
// so there are no image files to upload or lose).
// Attributes are NOT fixed here — they are rolled at hatch (surprise).
// To pin an attribute later, add `fixedAttr:'red'` to a species.
export const SPECIES = {
  blobyte: {
    id:'blobyte', name:'BloByte', shape:'royalslime', palette:'slime_royal',
    rarities:['normal','rare','epic'],
    base:{ atk:20, def:9, spd:11, mhp:70 },
    skills:[
      { n:'Goo Packet', pw:38, special:false },
      { n:'Split Fork', pw:58, special:true, reqLv:3, desc:'แยกร่างโจมตี x1.5' },
    ],
    evos:[ null,
      { label:'Prime',  mult:1.5, reqLv:20, skill:{ n:'Mass Overflow', pw:78,  special:true, reqLv:20, desc:'ล้นหน่วยความจำ x1.8' } },
      { label:'Omega',  mult:2.0, reqLv:50, skill:{ n:'Total Corrupt', pw:104, special:true, reqLv:50, desc:'ทุจริตทั้งระบบ x2' } },
    ],
  },
  inkarm: {
    id:'inkarm', name:'InkArm', shape:'frostsquid', palette:'frost_squid',
    rarities:['normal','rare','epic','legendary'],
    base:{ atk:22, def:10, spd:13, mhp:66 },
    skills:[
      { n:'Ink Flood', pw:40, special:false },
      { n:'Eight Grip', pw:60, special:true, reqLv:3, desc:'รัดแปดขา x1.5' },
    ],
    evos:[ null,
      { label:'Deep',   mult:1.5, reqLv:20, skill:{ n:'Abyss Pull',  pw:80,  special:true, reqLv:20, desc:'ดึงลงเหว x1.8' } },
      { label:'Kraken', mult:2.0, reqLv:50, skill:{ n:'Black Tide',  pw:108, special:true, reqLv:50, desc:'คลื่นดำ x2' } },
    ],
  },
  nulworm: {
    id:'nulworm', name:'NulWorm', shape:'crimworm', palette:'crimson_worm',
    rarities:['normal','rare','epic'],
    base:{ atk:24, def:7, spd:15, mhp:58 },
    skills:[
      { n:'Buffer Bite', pw:42, special:false },
      { n:'Chain Crawl', pw:62, special:true, reqLv:3, desc:'ไต่ลูกโซ่ x1.5' },
    ],
    evos:[ null,
      { label:'Coil',   mult:1.5, reqLv:20, skill:{ n:'Stack Smash', pw:82,  special:true, reqLv:20, desc:'ทุบสแต็ก x1.8' } },
      { label:'Hydra',  mult:2.0, reqLv:50, skill:{ n:'Root Access', pw:110, special:true, reqLv:50, desc:'ยึดสิทธิ์รูท x2' } },
    ],
  },
  clampr: {
    id:'clampr', name:'Clampr', shape:'steelcrab', palette:'steel_crab',
    rarities:['normal','rare','epic'],
    base:{ atk:19, def:16, spd:8, mhp:82 },
    skills:[
      { n:'Pincer Cut', pw:38, special:false },
      { n:'Shell Guard', pw:56, special:true, reqLv:3, desc:'ตั้งเกราะกระดอง x1.5' },
    ],
    evos:[ null,
      { label:'Bulwark', mult:1.5, reqLv:20, skill:{ n:'Iron Claw',  pw:78,  special:true, reqLv:20, desc:'ก้ามเหล็ก x1.8' } },
      { label:'Fortress',mult:2.0, reqLv:50, skill:{ n:'Total Lock', pw:102, special:true, reqLv:50, desc:'ล็อกทั้งระบบ x2' } },
    ],
  },
  hopbit: {
    id:'hopbit', name:'HopBit', shape:'violetbeast', palette:'beast_violet',
    rarities:['normal','rare','epic'],
    base:{ atk:21, def:9, spd:18, mhp:62 },
    skills:[
      { n:'Quick Ping', pw:36, special:false },
      { n:'Double Hop', pw:56, special:true, reqLv:3, desc:'กระโดดสองครั้ง x1.5' },
    ],
    evos:[ null,
      { label:'Dasher',  mult:1.5, reqLv:20, skill:{ n:'Blink Rush', pw:76,  special:true, reqLv:20, desc:'พุ่งวาร์ป x1.8' } },
      { label:'Phantom', mult:2.0, reqLv:50, skill:{ n:'Ghost Step', pw:100, special:true, reqLv:50, desc:'ก้าวเงา x2' } },
    ],
  },
  jetsquid: {
    id:'jetsquid', name:'JetSquid', shape:'frostsquid', palette:'deep_fish',
    rarities:['rare','epic','legendary'],
    base:{ atk:25, def:10, spd:16, mhp:68 },
    skills:[
      { n:'Jet Burst', pw:42, special:false },
      { n:'Ink Screen', pw:64, special:true, reqLv:3, desc:'ม่านหมึก x1.5' },
    ],
    evos:[ null,
      { label:'Torrent', mult:1.5, reqLv:20, skill:{ n:'Pressure Jet', pw:84,  special:true, reqLv:20, desc:'พ่นแรงดัน x1.8' } },
      { label:'Leviath', mult:2.0, reqLv:50, skill:{ n:'Deep Surge',   pw:112, special:true, reqLv:50, desc:'คลื่นลึก x2' } },
    ],
  },
  chitbug: {
    id:'chitbug', name:'ChitBug', shape:'sandbug', palette:'sand_bug',
    rarities:['normal','rare','epic'],
    base:{ atk:20, def:14, spd:12, mhp:76 },
    skills:[
      { n:'Mandible', pw:38, special:false },
      { n:'Carapace', pw:58, special:true, reqLv:3, desc:'เปลือกแข็ง x1.5' },
    ],
    evos:[ null,
      { label:'Scarab',  mult:1.5, reqLv:20, skill:{ n:'Swarm Call', pw:78,  special:true, reqLv:20, desc:'เรียกฝูง x1.8' } },
      { label:'Titan',   mult:2.0, reqLv:50, skill:{ n:'Hive Mind',  pw:104, special:true, reqLv:50, desc:'จิตรวมรัง x2' } },
    ],
  },
  echowing: {
    id:'echowing', name:'EchoWing', shape:'shadowbat', palette:'shadow_bat',
    rarities:['normal','rare','epic','legendary'],
    base:{ atk:23, def:9, spd:17, mhp:64 },
    skills:[
      { n:'Sonic Ping', pw:40, special:false },
      { n:'Night Dive', pw:60, special:true, reqLv:3, desc:'ดิ่งกลางคืน x1.5' },
    ],
    evos:[ null,
      { label:'Shriek',  mult:1.5, reqLv:20, skill:{ n:'Echo Storm', pw:80,  special:true, reqLv:20, desc:'พายุเสียง x1.8' } },
      { label:'Specter', mult:2.0, reqLv:50, skill:{ n:'Soul Echo',  pw:106, special:true, reqLv:50, desc:'เสียงวิญญาณ x2' } },
    ],
  },
  dustmoth: {
    id:'dustmoth', name:'DustMoth', shape:'embermoth', palette:'ember_moth',
    rarities:['rare','epic','legendary'],
    base:{ atk:18, def:11, spd:14, mhp:72 },
    skills:[
      { n:'Scale Dust', pw:36, special:false },
      { n:'Lull Powder', pw:56, special:true, reqLv:3, desc:'ผงสะกด x1.5' },
    ],
    evos:[ null,
      { label:'Silk',    mult:1.5, reqLv:20, skill:{ n:'Silk Bind',  pw:76,  special:true, reqLv:20, desc:'พันธนาการไหม x1.8' } },
      { label:'Lumen',   mult:2.0, reqLv:50, skill:{ n:'Moon Flare', pw:104, special:true, reqLv:50, desc:'แสงจันทร์ x2' } },
    ],
  },
  finbyte: {
    id:'finbyte', name:'FinByte', shape:'deepfish', palette:'deep_fish',
    rarities:['normal','rare','epic'],
    base:{ atk:20, def:12, spd:14, mhp:70 },
    skills:[
      { n:'Stream Cut', pw:38, special:false },
      { n:'Flow State', pw:58, special:true, reqLv:3, desc:'ไหลลื่น x1.5' },
    ],
    evos:[ null,
      { label:'Current', mult:1.5, reqLv:20, skill:{ n:'Riptide',   pw:78,  special:true, reqLv:20, desc:'กระแสวน x1.8' } },
      { label:'Tsunami', mult:2.0, reqLv:50, skill:{ n:'Flood Gate',pw:106, special:true, reqLv:50, desc:'เปิดประตูน้ำ x2' } },
    ],
  },
  glitchimp: {
    id:'glitchimp', name:'GlitchImp', shape:'angelwing', palette:'angel_light',
    rarities:['rare','epic','legendary','mythic'],
    base:{ atk:26, def:11, spd:15, mhp:70 },
    skills:[
      { n:'Hex Poke', pw:44, special:false },
      { n:'Fault Line', pw:66, special:true, reqLv:3, desc:'รอยร้าวระบบ x1.5' },
    ],
    evos:[ null,
      { label:'Trickster', mult:1.5, reqLv:20, skill:{ n:'Logic Bomb', pw:86,  special:true, reqLv:20, desc:'ระเบิดตรรกะ x1.8' } },
      { label:'Archon',    mult:2.0, reqLv:50, skill:{ n:'Kernel Rift',pw:116, special:true, reqLv:50, desc:'รอยแยกเคอร์เนล x2' } },
    ],
  },
  spikeling: {
    id:'spikeling', name:'Spikeling', shape:'spikelizard', palette:'spike_lizard',
    rarities:['normal','rare','epic'],
    base:{ atk:22, def:13, spd:10, mhp:78 },
    skills:[
      { n:'Barb Lash', pw:40, special:false },
      { n:'Quill Wall', pw:60, special:true, reqLv:3, desc:'กำแพงหนาม x1.5' },
    ],
    evos:[ null,
      { label:'Ridge',   mult:1.5, reqLv:20, skill:{ n:'Spine Storm', pw:80,  special:true, reqLv:20, desc:'พายุหนาม x1.8' } },
      { label:'Draco',   mult:2.0, reqLv:50, skill:{ n:'Thorn Crown', pw:108, special:true, reqLv:50, desc:'มงกุฎหนาม x2' } },
    ],
  },
  orbling: {
    id:'orbling', name:'Orbling', shape:'toxinblob', palette:'toxin_green',
    rarities:['normal','rare','epic'],
    base:{ atk:17, def:12, spd:12, mhp:80 },
    skills:[
      { n:'Orb Toss', pw:36, special:false },
      { n:'Cluster Sync', pw:54, special:true, reqLv:3, desc:'ซิงก์กลุ่ม x1.5' },
    ],
    evos:[ null,
      { label:'Cluster', mult:1.5, reqLv:20, skill:{ n:'Node Link', pw:74,  special:true, reqLv:20, desc:'เชื่อมโหนด x1.8' } },
      { label:'Nexus',   mult:2.0, reqLv:50, skill:{ n:'Mesh Pulse',pw:100, special:true, reqLv:50, desc:'คลื่นเมช x2' } },
    ],
  },
  haunbit: {
    id:'haunbit', name:'HaunBit', shape:'voidwisp', palette:'void_wisp',
    rarities:['epic','legendary','mythic'],
    base:{ atk:24, def:10, spd:16, mhp:68 },
    skills:[
      { n:'Cold Ping', pw:42, special:false },
      { n:'Phase Slip', pw:64, special:true, reqLv:3, desc:'ลอดมิติ x1.5' },
    ],
    evos:[ null,
      { label:'Revenant', mult:1.5, reqLv:20, skill:{ n:'Dread Wave', pw:84,  special:true, reqLv:20, desc:'คลื่นสยอง x1.8' } },
      { label:'Wraith',   mult:2.0, reqLv:50, skill:{ n:'Null Void',  pw:114, special:true, reqLv:50, desc:'ความว่างเปล่า x2' } },
    ],
  },

  // ── GIF-based species ──
  // These use real animated art from assets/sprites/<gif>/{still,attack}.gif
  // instead of a procedural `shape`. Both kinds coexist: the renderer
  // checks for `gif` first and falls back to `shape`.
  bytehound: {
    id:'bytehound', name:'ByteHound', gif:'dog',
    rarities:['normal','rare','epic'],
    base:{ atk:21, def:11, spd:12, mhp:72 },
    skills:[
      { n:'Packet Bite', pw:38, special:false },
      { n:'Firewall Fang', pw:58, special:true, reqLv:3, desc:'เจาะไฟร์วอลล์ x1.5' },
    ],
    evos:[ null,
      { label:'Guard',  mult:1.5, reqLv:20, skill:{ n:'Sentry Howl', pw:78,  special:true, reqLv:20, desc:'เห่าเตือนภัย x1.8' } },
      { label:'Warden', mult:2.0, reqLv:50, skill:{ n:'Kernel Maul', pw:104, special:true, reqLv:50, desc:'ขย้ำเคอร์เนล x2' } },
    ],
  },
  armorhound: {
    id:'armorhound', name:'ArmorHound', gif:'dog2',
    rarities:['rare','epic','legendary'],
    base:{ atk:20, def:17, spd:9, mhp:88 },
    skills:[
      { n:'Shield Rush', pw:42, special:false },
      { n:'Plated Charge', pw:62, special:true, reqLv:3, desc:'พุ่งชนเกราะ x1.5' },
    ],
    evos:[ null,
      { label:'Bulwark', mult:1.5, reqLv:20, skill:{ n:'Aegis Slam', pw:82,  special:true, reqLv:20, desc:'ทุบอีจิส x1.8' } },
      { label:'Paladin', mult:2.0, reqLv:50, skill:{ n:'Last Stand', pw:110, special:true, reqLv:50, desc:'ยืนหยัดครั้งสุดท้าย x2' } },
    ],
  },
  tabbyproc: {
    id:'tabbyproc', name:'TabbyProc', gif:'cat',
    rarities:['normal','rare','epic'],
    base:{ atk:22, def:10, spd:16, mhp:66 },
    skills:[
      { n:'Claw Script', pw:36, special:false },
      { n:'Pounce Exploit', pw:56, special:true, reqLv:3, desc:'จู่โจมช่องโหว่ x1.5' },
    ],
    evos:[ null,
      { label:'Prowler', mult:1.5, reqLv:20, skill:{ n:'Shadow Dash', pw:76,  special:true, reqLv:20, desc:'พุ่งเงา x1.8' } },
      { label:'Stalker', mult:2.0, reqLv:50, skill:{ n:'Zero Day',    pw:100, special:true, reqLv:50, desc:'ช่องโหว่ศูนย์วัน x2' } },
    ],
  },
  mysticproc: {
    id:'mysticproc', name:'MysticProc', gif:'cat3',
    rarities:['epic','legendary','mythic'],
    base:{ atk:24, def:13, spd:14, mhp:76 },
    skills:[
      { n:'Arcane Ping', pw:40, special:false },
      { n:'Spirit Flux', pw:64, special:true, reqLv:3, desc:'กระแสวิญญาณ x1.5' },
    ],
    evos:[ null,
      { label:'Oracle',    mult:1.5, reqLv:20, skill:{ n:'Nine Tails',   pw:86,  special:true, reqLv:20, desc:'เก้าหาง x1.8' } },
      { label:'Ascendant', mult:2.0, reqLv:50, skill:{ n:'Total Recall', pw:118, special:true, reqLv:50, desc:'เรียกคืนทั้งระบบ x2' } },
    ],
  },
};
export const SPECIES_KEYS = Object.keys(SPECIES);

// ── HACK TARGETS (dungeons) ──
// Sequential waves. HP carries over between waves.
// ── WORLD MAPS ──
// Each map has a looping video background and clickable pin locations.
// Pin x/y are PERCENTAGES of the video frame so they scale on any screen.
// Coordinates were measured directly from the marked reference images.
export const MAPS = [
  {
    id:'forest', name:'Verdant Realm', thai:'ดินแดนพงไพร',
    video:'assets/maps/forest.mp4', poster:'assets/maps/forest.jpg',
    levelRange:[1,50],
    desc:'ดินแดนเริ่มต้น — ป่า ภูเขา ทะเลทราย และเกาะกลางทะเล',
  },
  {
    id:'hell', name:'Infernal Realm', thai:'ดินแดนนรก',
    video:'assets/maps/hell.mp4', poster:'assets/maps/hell.jpg',
    levelRange:[51,100],
    desc:'ดินแดนขั้นสูง — ลาวา ปีศาจ และปราสาทจอมมาร',
  },
];

// ── ZONES ──
// `kind:'battle'` = fight zone, `kind:'safe'` = rest + shop.
// `order` drives the recommended progression path drawn on the map.
export const ZONES = [
  // ══ FOREST (Lv 1-50) ══
  { id:'f_forest',   map:'forest', kind:'battle', order:1,
    name:'The Forest', thai:'ป่าใหญ่', x:34.69, y:14.80,
    lv:[1,3], waves:[1,2], pool:['greenworm','beetle'],
    reward:{ bitzMult:1.0, expMult:1.0 },
    desc:'ป่าทึบ จุดเริ่มต้นของการผจญภัย' },

  { id:'f_mountain', map:'forest', kind:'battle', order:2,
    name:'The Mountain', thai:'ภูเขา', x:36.25, y:39.77,
    lv:[4,9], waves:[2,2], pool:['beetle','stone_imp'],
    reward:{ bitzMult:1.3, expMult:1.25 },
    desc:'ทางลาดชัน มีสัตว์หินอาศัยอยู่' },

  { id:'f_riverfall', map:'forest', kind:'battle', order:3,
    name:'Riverfall Mountain', thai:'ภูเขาน้ำตก', x:74.56, y:31.00,
    lv:[10,16], waves:[2,3], pool:['kappa','stone_imp'],
    reward:{ bitzMult:1.6, expMult:1.5 },
    desc:'น้ำตกสูง อากาศชื้นและหมอกหนา' },

  { id:'f_wolfden',  map:'forest', kind:'battle', order:4,
    name:'The Wolf Den', thai:'ถ้ำหมาป่า', x:85.52, y:53.19,
    lv:[17,24], waves:[2,3], pool:['fang_stalker','kappa'],
    reward:{ bitzMult:1.9, expMult:1.8 },
    desc:'ถ้ำมืด กลิ่นสัตว์ร้ายคละคลุ้ง' },

  { id:'f_desert',   map:'forest', kind:'battle', order:5,
    name:'The Desert', thai:'ทะเลทราย', x:48.76, y:68.18,
    lv:[25,32], waves:[3,3], pool:['sand_worm','sand_turtle'],
    reward:{ bitzMult:2.2, expMult:2.1 },
    desc:'ผืนทรายร้อนระอุ ไร้ที่กำบัง' },

  { id:'f_oasis',    map:'forest', kind:'battle', order:6,
    name:'The Oasis', thai:'โอเอซิส', x:24.59, y:69.05,
    lv:[33,41], waves:[3,4], pool:['oasis_otter','rainbow_frog'],
    reward:{ bitzMult:2.6, expMult:2.4 },
    desc:'บ่อน้ำกลางทะเลทราย — ดูสงบเกินจริง' },

  { id:'f_island',   map:'forest', kind:'battle', order:7,
    name:'The Island', thai:'เกาะร้าง', x:26.43, y:91.04,
    lv:[42,50], waves:[3,4], pool:['flying_fish','island_monkey'],
    reward:{ bitzMult:3.0, expMult:2.8 },
    desc:'เกาะโดดเดี่ยวกลางทะเล บทสุดท้ายของดินแดนนี้' },

  { id:'f_harbor',   map:'forest', kind:'safe', order:0,
    name:'Harbor Village', thai:'หมู่บ้านท่าเรือ', x:82.11, y:84.84,
    desc:'พักฟื้น VIRUZ และซื้อยา' },

  // ══ HELL (Lv 51-100) ══
  { id:'h_village',  map:'hell', kind:'battle', order:1,
    name:'Outer Ruined Village', thai:'หมู่บ้านร้างชั้นนอก', x:76.71, y:88.18,
    lv:[51,58], waves:[2,3], pool:['goblin_grunt','goblin_miner'],
    reward:{ bitzMult:3.4, expMult:3.2 },
    desc:'ซากหมู่บ้านที่ถูกเผาจนราบ' },

  { id:'h_crossroads', map:'hell', kind:'battle', order:2,
    name:'The Crossroads', thai:'สี่แยกนรก', x:59.24, y:75.34,
    lv:[59,66], waves:[3,3], pool:['goblin_miner','black_beast'],
    reward:{ bitzMult:3.8, expMult:3.6 },
    desc:'ทางแยกกลางธารลาวา' },

  { id:'h_beastden', map:'hell', kind:'battle', order:3,
    name:'Demonbeast Den', thai:'รังอสูรสัตว์', x:83.36, y:63.15,
    lv:[67,74], waves:[3,4], pool:['black_beast','rock_golem'],
    reward:{ bitzMult:4.3, expMult:4.0 },
    desc:'ฝูงอสูรสัตว์รวมตัวกันอยู่' },

  { id:'h_quarter',  map:'hell', kind:'battle', order:4,
    name:'Servant Demon Quarter', thai:'เขตปีศาจรับใช้', x:49.93, y:51.65,
    lv:[75,82], waves:[3,4], pool:['hobgoblin','fire_golem'],
    reward:{ bitzMult:4.8, expMult:4.5 },
    desc:'หอคอยกลางทะเลลาวา ที่พำนักของปีศาจรับใช้' },

  { id:'h_manor',    map:'hell', kind:'battle', order:5,
    name:'Vice Manor Castle', thai:'ปราสาทอุปราช', x:81.82, y:34.54,
    lv:[83,90], waves:[4,4], pool:['butler_vamp','vampire_lady'],
    reward:{ bitzMult:5.4, expMult:5.0 },
    desc:'ปราสาทของรองจอมมาร' },

  { id:'h_castle',   map:'hell', kind:'battle', order:6,
    name:'Demon Lord Castle', thai:'ปราสาทจอมมาร', x:34.70, y:14.82,
    lv:[91,100], waves:[4,5], pool:['vampire_lord','vampire_lady','butler_vamp'],
    reward:{ bitzMult:6.5, expMult:6.0 },
    desc:'ที่สุดของดินแดนนรก — จอมมารรออยู่' },

  { id:'h_campfire', map:'hell', kind:'safe', order:0,
    name:'Crossroads Campfire', thai:'กองไฟสี่แยก', x:29.98, y:87.78,
    desc:'กองไฟปลอดภัย พักฟื้นและซื้อยา' },
];

export function zonesOfMap(mapId) {
  return ZONES.filter(z => z.map === mapId);
}
export function zoneById(id) {
  return ZONES.find(z => z.id === id) || null;
}

// ── MONSTERS ──
// Themed per region. `attr` may be null → rolled at spawn.
// Stats are BASE values; spawnAntiviruz() scales them by level.
export const ANTIVIRUZ = {
  // ══ FOREST ══
  // Hand-drawn art (assets/sprites/<gif>/still.png + attack.png).
  // Placement follows habitat: bugs in the woods, a kappa at the
  // waterfall, reptiles in the sand, otter/frog at the water, and
  // island wildlife out at sea.
  greenworm:    { id:'greenworm',    name:'GreenWorm',   gif:'greenworm',     ext:'png', base:{atk:15,def:7, spd:10, mhp:38}, attr:'green'  },
  beetle:       { id:'beetle',       name:'JadeBeetle',  gif:'beetle',        ext:'png', base:{atk:18,def:12,spd:9,  mhp:48}, attr:'yellow' },
  stone_imp:    { id:'stone_imp',    name:'StoneImp',    shape:'steelcrab',   palette:'steel_crab',   base:{atk:19,def:14,spd:8,  mhp:58}, attr:'yellow' },
  kappa:        { id:'kappa',        name:'Kappa',       gif:'kappa',         ext:'png', base:{atk:23,def:13,spd:14, mhp:60}, attr:null     },
  fang_stalker: { id:'fang_stalker', name:'FangStalker', shape:'shadowbat',   palette:'shadow_bat',   base:{atk:26,def:10,spd:17, mhp:54}, attr:'red'    },
  sand_worm:    { id:'sand_worm',    name:'SandWorm',    gif:'sand_worm',     ext:'png', base:{atk:30,def:12,spd:13, mhp:68}, attr:'yellow' },
  sand_turtle:  { id:'sand_turtle',  name:'SandTurtle',  gif:'sand_turtle',   ext:'png', base:{atk:26,def:22,spd:7,  mhp:88}, attr:'yellow' },
  oasis_otter:  { id:'oasis_otter',  name:'OasisOtter',  gif:'oasis_otter',   ext:'png', base:{atk:33,def:14,spd:19, mhp:70}, attr:'green'  },
  rainbow_frog: { id:'rainbow_frog', name:'RainbowFrog', gif:'rainbow_frog',  ext:'png', base:{atk:35,def:15,spd:16, mhp:74}, attr:null     },
  flying_fish:  { id:'flying_fish',  name:'FlyingFish',  gif:'flying_fish',   ext:'png', base:{atk:36,def:14,spd:21, mhp:72}, attr:'green'  },
  island_monkey:{ id:'island_monkey',name:'IslandMonkey',gif:'island_monkey', ext:'png', base:{atk:40,def:18,spd:18, mhp:84}, attr:'red'    },

  // ══ HELL ══
  // These use real art (assets/sprites/<gif>/still.png + attack.png).
  // `ext:'png'` tells the renderer which extension to load.
  goblin_grunt: { id:'goblin_grunt', name:'Goblin',        gif:'goblin',       ext:'png', base:{atk:38,def:14,spd:15, mhp:70},  attr:'green'  },
  goblin_miner: { id:'goblin_miner', name:'MinerGoblin',   gif:'miner_goblin', ext:'png', base:{atk:43,def:17,spd:13, mhp:80},  attr:'yellow' },
  black_beast:  { id:'black_beast',  name:'BlackBeast',    gif:'black_beast',  ext:'png', base:{atk:50,def:16,spd:20, mhp:86},  attr:'red'    },
  rock_golem:   { id:'rock_golem',   name:'RockGolem',     gif:'rock_golem',   ext:'png', base:{atk:46,def:28,spd:8,  mhp:118}, attr:'yellow' },
  hobgoblin:    { id:'hobgoblin',    name:'RedHobgoblin',  gif:'hobgoblin',    ext:'png', base:{atk:56,def:20,spd:16, mhp:98},  attr:'red'    },
  fire_golem:   { id:'fire_golem',   name:'FireGolem',     gif:'fire_golem',   ext:'png', base:{atk:60,def:26,spd:11, mhp:126}, attr:'red'    },
  butler_vamp:  { id:'butler_vamp',  name:'ManorButler',   gif:'butler',       ext:'png', base:{atk:64,def:22,spd:19, mhp:110}, attr:null     },
  vampire_lady: { id:'vampire_lady', name:'VampireLady',   gif:'vampire_lady', ext:'png', base:{atk:72,def:24,spd:22, mhp:130}, attr:null     },
  vampire_lord: { id:'vampire_lord', name:'VampireLord',   gif:'vampire_lord', ext:'png', base:{atk:82,def:32,spd:21, mhp:160}, attr:'red'    },
};


// ── LOYALTY ──
// Every VIRUZ tracks a loyalty score (0-100). Crossing a threshold
// promotes it to the next tier. At "Loyal Buddy" it gains a 1.5x stat
// multiplier AND unlocks a named special attack plus a battle-start buff.
export const LOYALTY_TIERS = [
  { id:'stranger', name:'Stranger',    thai:'คนแปลกหน้า', min:0,  mult:1.00, icon:'🤍',
    perk:null },
  { id:'friendly', name:'Friendly',    thai:'เป็นมิตร',   min:25, mult:1.10, icon:'💛',
    perk:'เริ่มต้นด้วย DEF +8%' },
  { id:'trusted',  name:'Trusted',     thai:'ไว้ใจ',      min:55, mult:1.25, icon:'🧡',
    perk:'เริ่มต้นด้วย DEF +15% · SPD +10%' },
  { id:'loyal',    name:'Loyal Buddy', thai:'เพื่อนแท้',  min:85, mult:1.50, icon:'❤️',
    perk:'สเตตัส ×1.5 · ปลดล็อกท่าไม้ตาย · DEF +20% · SPD +15%' },
];

export function loyaltyTier(loyalty) {
  const v = Math.max(0, Math.min(100, loyalty || 0));
  let t = LOYALTY_TIERS[0];
  for (const tier of LOYALTY_TIERS) if (v >= tier.min) t = tier;
  return t;
}
// Progress toward the NEXT tier, for the UI bar.
export function loyaltyProgress(loyalty) {
  const v = Math.max(0, Math.min(100, loyalty || 0));
  const i = LOYALTY_TIERS.findIndex(t => t.id === loyaltyTier(v).id);
  const cur = LOYALTY_TIERS[i], nxt = LOYALTY_TIERS[i + 1];
  if (!nxt) return { pct: 100, next: null, need: 0 };
  const span = nxt.min - cur.min;
  return { pct: Math.round(((v - cur.min) / span) * 100), next: nxt, need: nxt.min - v };
}

// Signature attacks unlocked at Loyal Buddy, keyed by attribute so
// each VIRUZ gets a move that suits it.
export const SIGNATURE_SKILLS = {
  red:    { n:'Overclock Fang',  pw:118, special:true, sig:true, desc:'ท่าไม้ตาย — เขี้ยวโอเวอร์คล็อก' },
  green:  { n:'Phantom Rush',    pw:104, special:true, sig:true, desc:'ท่าไม้ตาย — จู่โจมสายฟ้า' },
  yellow: { n:'Bastion Crush',   pw:112, special:true, sig:true, desc:'ท่าไม้ตาย — ทุบป้อมปราการ' },
  white:  { n:'Radiant Cascade', pw:108, special:true, sig:true, desc:'ท่าไม้ตาย — สายธารแสง' },
};

// ── TAMAGOTCHI CARE ──
// Each activity has its own 1-hour cooldown, tracked per pet.
// Foods are consumables (bought, depleted on use). Toys are permanent
// purchases but each toy has its own cooldown before it can be used again.
export const CARE_COOLDOWN_MS = 60 * 60 * 1000;   // 1 hour

export const FOODS = [
  { id:'food_basic',  name:'Data Crumbs',   icon:'🍪', cost:80,   loyalty:3,  desc:'ขนมพื้นฐาน +3 ความผูกพัน' },
  { id:'food_good',   name:'Byte Burger',   icon:'🍔', cost:220,  loyalty:7,  desc:'อาหารอย่างดี +7 ความผูกพัน' },
  { id:'food_premium',name:'Golden Cache',  icon:'🍰', cost:600,  loyalty:14, desc:'ของหวานชั้นเลิศ +14 ความผูกพัน' },
  { id:'food_feast',  name:'Quantum Feast', icon:'🍱', cost:1400, loyalty:24, desc:'มื้อพิเศษสุด +24 ความผูกพัน' },
];

export const TOYS = [
  { id:'toy_ball',   name:'Packet Ball',   icon:'⚽', cost:400,  loyalty:5,  desc:'ลูกบอล +5 ความผูกพัน' },
  { id:'toy_laser',  name:'Laser Pointer', icon:'🔦', cost:1100, loyalty:10, desc:'เลเซอร์ +10 ความผูกพัน' },
  { id:'toy_puzzle', name:'Logic Cube',    icon:'🧩', cost:2400, loyalty:16, desc:'ลูกบาศก์ปริศนา +16 ความผูกพัน' },
  { id:'toy_arcade', name:'Mini Arcade',   icon:'🕹️', cost:4800, loyalty:26, desc:'ตู้เกมจิ๋ว +26 ความผูกพัน' },
];

// Cleaning is free but gives the least — always available as a fallback.
export const CARE_CLEAN = { id:'clean', name:'Clean', icon:'🧼', loyalty:4,
  desc:'ทำความสะอาด +4 ความผูกพัน (ฟรี)' };

// Loyalty earned per battle won — deliberately slow, so care activities
// are the fast path and fighting is the passive one.
export const LOYALTY_PER_WIN = 1;

// ── SHOP ──
export const EGGS = [
  { id:'egg_n', name:'Normal Egg', icon:'🥚', cost:500,
    pool:['normal'], rates:[1.0], desc:'สุ่ม Normal' },
  { id:'egg_r', name:'Rare Egg', icon:'🔵', cost:1500,
    pool:['normal','rare'], rates:[0.70,0.30], desc:'70% Normal · 30% Rare' },
  { id:'egg_e', name:'Epic Egg', icon:'🟣', cost:4000,
    pool:['normal','rare','epic'], rates:[0.50,0.35,0.15], desc:'50% N · 35% R · 15% E' },
];

export const ITEMS = [
  // combat:true → usable DURING a fight from the potion bar
  { id:'hp_s',  name:'HP Patch',    icon:'💊', cost:200,  type:'hp',   val:0.30, combat:true,  desc:'ฟื้น HP 30%' },
  { id:'hp_l',  name:'HP Core',     icon:'💉', cost:500,  type:'hp',   val:0.80, combat:true,  desc:'ฟื้น HP 80%' },
  { id:'hp_all',name:'Team Repair', icon:'🧬', cost:900,  type:'hpall',val:0.60, combat:true,  desc:'ฟื้น HP 60% ทั้งทีม' },
  { id:'exp_b', name:'EXP Booster', icon:'⚡', cost:800,  type:'exp',  val:500,  combat:false, desc:'+500 EXP' },
  { id:'evo_s', name:'Evo Stone',   icon:'💎', cost:3000, type:'evo',  val:1,    combat:false, desc:'วิวัฒน์ทันที' },
];

// Potions sold at safe spots. Bought here, consumed in battle.
export const POTIONS = [
  { id:'pot_s', name:'Small Potion', icon:'🧪', cost:120, heal:0.35, desc:'ฟื้น HP 35% ระหว่างสู้' },
  { id:'pot_m', name:'Large Potion', icon:'⚗️', cost:320, heal:0.70, desc:'ฟื้น HP 70% ระหว่างสู้' },
  { id:'pot_f', name:'Full Elixir',  icon:'🍶', cost:700, heal:1.00, desc:'ฟื้น HP เต็ม ระหว่างสู้' },
];

// ── BASE DEFENSE BOTS ──
export const DEFENSE_BOTS = [
  { id:'bot_lite', name:'Sentry Bot',   icon:'🤖', cost:1200, power:{atk:14,def:16,spd:10,mhp:140}, desc:'บอทป้องกันพื้นฐาน' },
  { id:'bot_mid',  name:'Warden Bot',   icon:'🛡️', cost:3000, power:{atk:22,def:26,spd:12,mhp:230}, desc:'บอทป้องกันระดับกลาง' },
  { id:'bot_max',  name:'Fortress Bot', icon:'🏰', cost:7500, power:{atk:34,def:40,spd:14,mhp:380}, desc:'บอทป้องกันระดับสูง' },
];

// ── CITY MAP HOTSPOTS ──
// Percentages relative to the video frame, so it scales on any screen.
export const MAP_NODES = [
  { id:'clinic', label:'Clinic',      icon:'🏥', x:29.0, y:64.5, screen:'clinic',
    hint:'รักษา VIRUZ · ฟักไข่' },
  { id:'shop',   label:'Shop',        icon:'🛒', x:61.8, y:78.0, screen:'shop',
    hint:'ไอเทม · บูสเตอร์' },
  { id:'tower',  label:'World Gate', icon:'🌐', x:15.4, y:28.0, screen:'world',
    hint:'ออกผจญภัย · แผนที่โลก' },
  { id:'home',   label:'Your Home',   icon:'🏠', x:87.4, y:44.0, screen:'home',
    hint:'ฐานของคุณ · ทีม · ป้องกัน' },
];

// ── PROGRESSION TUNING ──
export const TUNING = {
  startBitz: 300,
  // EXP curve. The old formula was exponential (1.35^lv) which hit
  // 243 MILLION exp by Lv50 — unreachable. This is a polynomial curve:
  // very cheap for the first few levels so a new player levels after
  // 1-2 fights, then ramping steadily so progression still has weight.
  expCurve: (lv) => Math.floor(28 * Math.pow(lv, 1.55) + lv * 12),
  statPerPoint: 3,
  turnBaseMs: 900,   // gap BETWEEN exchanges; the attack sequence itself
                     // (banner + wind-up + lunge + hit-stop + return) adds ~1.5s,
                     // so this stays short or the fight drags
  fleePenalty: 0.0,
  loseHpRestore: 0.10,
};
