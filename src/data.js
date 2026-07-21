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
export const HACK_TARGETS = [
  {
    id:'pc_home', name:'💻 Personal PC', tier:'EASY', color:'#3ddc84',
    desc:'คอมพิวเตอร์ส่วนตัว ระบบป้องกันอ่อน',
    waves:[1,2], enemyLv:[1,6], pool:['guard_lite','sniffer','net_probe'],
    reward:{ bitzMult:1.0, expMult:1.0 },
  },
  {
    id:'pc_office', name:'🖥️ Office Workstation', tier:'NORMAL', color:'#4fc3f7',
    desc:'เครื่องทำงานในออฟฟิศ มีแอนตี้ไวรัสพื้นฐาน',
    waves:[2,3], enemyLv:[6,16], pool:['guard_lite','sniffer','heur_scan','net_probe'],
    reward:{ bitzMult:1.6, expMult:1.5 },
  },
  {
    id:'srv_corp', name:'🏢 Corporate Server', tier:'HARD', color:'#ce93d8',
    desc:'เซิร์ฟเวอร์บริษัท ป้องกันหลายชั้น',
    waves:[3,4], enemyLv:[16,34], pool:['heur_scan','sentinel_av','packet_wall','flux_turret'],
    reward:{ bitzMult:2.4, expMult:2.2 },
  },
  {
    id:'srv_bank', name:'🏦 Banking Core', tier:'EXTREME', color:'#ffd54a',
    desc:'แกนระบบธนาคาร ป้องกันระดับสูงสุด',
    waves:[4,5], enemyLv:[34,60], pool:['sentinel_av','packet_wall','root_guard','aegis_core','ward_bastion'],
    reward:{ bitzMult:3.5, expMult:3.2 },
  },
];

// ── ANTIVIRUZ (enemies) ──
// `attr` may be null → rolled at spawn.
export const ANTIVIRUZ = {
  guard_lite:  { id:'guard_lite',  name:'GuardLite',   shape:'shield', palette:'av_shield',   base:{atk:15,def:8, spd:9,  mhp:44}, attr:'yellow' },
  sniffer:     { id:'sniffer',     name:'Sniffer',     shape:'scanner', palette:'av_scanner',  base:{atk:18,def:5, spd:14, mhp:36}, attr:'green'  },
  heur_scan:   { id:'heur_scan',   name:'HeurScan',    shape:'scanner', palette:'av_scanner',  base:{atk:20,def:9, spd:12, mhp:50}, attr:null     },
  sentinel_av: { id:'sentinel_av', name:'SentinelAV',  shape:'sentinel', palette:'av_sentinel', base:{atk:22,def:14,spd:8,  mhp:66}, attr:'yellow' },
  packet_wall: { id:'packet_wall', name:'PacketWall',  shape:'shield', palette:'av_shield',   base:{atk:19,def:18,spd:6,  mhp:80}, attr:'yellow' },
  root_guard:  { id:'root_guard',  name:'RootGuard',   shape:'turret', palette:'av_turret',   base:{atk:28,def:12,spd:15, mhp:72}, attr:'red'    },
  net_probe:   { id:'net_probe',   name:'NetProbe',    shape:'scanner', palette:'av_scanner',  base:{atk:17,def:7, spd:16, mhp:38}, attr:'green'  },
  aegis_core:  { id:'aegis_core',  name:'AegisCore',   shape:'sentinel', palette:'av_sentinel', base:{atk:26,def:16,spd:10, mhp:78}, attr:null     },
  flux_turret: { id:'flux_turret', name:'FluxTurret',  shape:'turret', palette:'av_turret',   base:{atk:30,def:10,spd:13, mhp:64}, attr:'red'    },
  ward_bastion:{ id:'ward_bastion',name:'WardBastion', shape:'shield', palette:'av_shield',   base:{atk:24,def:20,spd:7,  mhp:92}, attr:'yellow' },
};

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
  { id:'hp_s',  name:'HP Patch',    icon:'💊', cost:200,  type:'hp',   val:0.30, desc:'ฟื้น HP 30% (ตัวที่เลือก)' },
  { id:'hp_l',  name:'HP Core',     icon:'💉', cost:500,  type:'hp',   val:0.80, desc:'ฟื้น HP 80% (ตัวที่เลือก)' },
  { id:'hp_all',name:'Team Repair', icon:'🧬', cost:900,  type:'hpall',val:0.60, desc:'ฟื้น HP 60% ทั้งทีม' },
  { id:'exp_b', name:'EXP Booster', icon:'⚡', cost:800,  type:'exp',  val:500,  desc:'+500 EXP' },
  { id:'evo_s', name:'Evo Stone',   icon:'💎', cost:3000, type:'evo',  val:1,    desc:'วิวัฒน์ทันที' },
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
  { id:'tower',  label:'Data Center', icon:'📡', x:15.4, y:28.0, screen:'hack',
    hint:'เจาะระบบ · ดันเจี้ยน' },
  { id:'home',   label:'Your Home',   icon:'🏠', x:87.4, y:44.0, screen:'home',
    hint:'ฐานของคุณ · ทีม · ป้องกัน' },
];

// ── PROGRESSION TUNING ──
export const TUNING = {
  startBitz: 300,
  expCurve: (lv) => Math.floor(100 * Math.pow(1.35, lv - 1) + lv * 10),
  statPerPoint: 3,
  turnBaseMs: 420,   // gap BETWEEN exchanges; the attack sequence itself
                     // (banner + wind-up + lunge + hit-stop + return) adds ~1.5s,
                     // so this stays short or the fight drags
  fleePenalty: 0.0,
  loseHpRestore: 0.10,
};
