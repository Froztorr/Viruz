// ═══════════════════════════════════════════════════════════
// VIRUZ PET — DATA
// Pure data. No DOM, no logic. Safe to edit without touching code.
// ═══════════════════════════════════════════════════════════

// ── ATTRIBUTES (replaces the old elemental system entirely) ──
export const ATTR = {
  red: {
    id: 'red', name: 'Red', icon: '⚔️', color: '#ff4d5e',
    glow: 'rgba(255,77,94,.45)',
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
    id: 'yellow', name: 'Yellow', icon: '🛡️', color: '#e0b020',
    glow: 'rgba(224,176,32,.45)',
    desc: 'ป้องกันสูง แต่ช้า',
    mult: { atk: 0.85, def: 1.45, spd: 0.70, mhp: 1.25 },
  },
  white: {
    id: 'white', name: 'White', icon: '➕', color: '#e8f4ff',
    glow: 'rgba(232,244,255,.5)',
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
// `sprite` maps to assets/sprites/<sprite>/{still,attack}.gif
// Attributes are NOT fixed here — they are rolled at hatch (surprise).
// To pin an attribute later, add `fixedAttr:'red'` to a species.
export const SPECIES = {
  dog: {
    id:'dog', name:'ByteHound', sprite:'dog',
    rarities:['normal','rare','epic'],
    base:{ atk:12, def:11, spd:11, mhp:105 },
    skills:[
      { n:'Packet Bite', pw:38, special:false },
      { n:'Firewall Fang', pw:58, special:true, reqLv:3, desc:'เจาะไฟร์วอลล์ x1.5' },
    ],
    evos:[ null,
      { label:'Guard',   mult:1.5, reqLv:20, skill:{ n:'Sentry Howl', pw:78,  special:true, reqLv:20, desc:'เห่าเตือนภัย x1.8' } },
      { label:'Warden',  mult:2.0, reqLv:50, skill:{ n:'Kernel Maul', pw:104, special:true, reqLv:50, desc:'ขย้ำเคอร์เนล x2' } },
    ],
  },
  dog2: {
    id:'dog2', name:'ArmorHound', sprite:'dog2',
    rarities:['rare','epic','legendary'],
    base:{ atk:13, def:15, spd:9, mhp:130 },
    skills:[
      { n:'Shield Rush', pw:42, special:false },
      { n:'Plated Charge', pw:62, special:true, reqLv:3, desc:'พุ่งชนเกราะ x1.5' },
    ],
    evos:[ null,
      { label:'Bulwark',  mult:1.5, reqLv:20, skill:{ n:'Aegis Slam',  pw:82,  special:true, reqLv:20, desc:'ทุบอีจิส x1.8' } },
      { label:'Paladin',  mult:2.0, reqLv:50, skill:{ n:'Last Stand',  pw:110, special:true, reqLv:50, desc:'ยืนหยัดครั้งสุดท้าย x2' } },
    ],
  },
  cat: {
    id:'cat', name:'TabbyProc', sprite:'cat',
    rarities:['normal','rare','epic'],
    base:{ atk:11, def:9, spd:15, mhp:92 },
    skills:[
      { n:'Claw Script', pw:36, special:false },
      { n:'Pounce Exploit', pw:56, special:true, reqLv:3, desc:'จู่โจมช่องโหว่ x1.5' },
    ],
    evos:[ null,
      { label:'Prowler', mult:1.5, reqLv:20, skill:{ n:'Shadow Dash', pw:76,  special:true, reqLv:20, desc:'พุ่งเงา x1.8' } },
      { label:'Stalker', mult:2.0, reqLv:50, skill:{ n:'Zero Day',    pw:100, special:true, reqLv:50, desc:'ช่องโหว่ศูนย์วัน x2' } },
    ],
  },
  cat3: {
    id:'cat3', name:'MysticProc', sprite:'cat3',
    rarities:['epic','legendary','mythic'],
    base:{ atk:14, def:12, spd:13, mhp:112 },
    skills:[
      { n:'Arcane Ping', pw:40, special:false },
      { n:'Spirit Flux', pw:64, special:true, reqLv:3, desc:'กระแสวิญญาณ x1.5' },
    ],
    evos:[ null,
      { label:'Oracle',   mult:1.5, reqLv:20, skill:{ n:'Nine Tails',  pw:86,  special:true, reqLv:20, desc:'เก้าหาง x1.8' } },
      { label:'Ascendant',mult:2.0, reqLv:50, skill:{ n:'Total Recall',pw:118, special:true, reqLv:50, desc:'เรียกคืนทั้งระบบ x2' } },
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
    waves:[1,2], enemyLv:[1,6], pool:['guard_lite','sniffer'],
    reward:{ bitzMult:1.0, expMult:1.0 },
  },
  {
    id:'pc_office', name:'🖥️ Office Workstation', tier:'NORMAL', color:'#4fc3f7',
    desc:'เครื่องทำงานในออฟฟิศ มีแอนตี้ไวรัสพื้นฐาน',
    waves:[2,3], enemyLv:[6,16], pool:['guard_lite','sniffer','heur_scan'],
    reward:{ bitzMult:1.6, expMult:1.5 },
  },
  {
    id:'srv_corp', name:'🏢 Corporate Server', tier:'HARD', color:'#ce93d8',
    desc:'เซิร์ฟเวอร์บริษัท ป้องกันหลายชั้น',
    waves:[3,4], enemyLv:[16,34], pool:['heur_scan','sentinel_av','packet_wall'],
    reward:{ bitzMult:2.4, expMult:2.2 },
  },
  {
    id:'srv_bank', name:'🏦 Banking Core', tier:'EXTREME', color:'#ffd54a',
    desc:'แกนระบบธนาคาร ป้องกันระดับสูงสุด',
    waves:[4,5], enemyLv:[34,60], pool:['sentinel_av','packet_wall','root_guard'],
    reward:{ bitzMult:3.5, expMult:3.2 },
  },
];

// ── ANTIVIRUZ (enemies) ──
// `attr` may be null → rolled at spawn.
export const ANTIVIRUZ = {
  guard_lite:  { id:'guard_lite',  name:'GuardLite',   sprite:'dog',  base:{atk:9, def:7, spd:9,  mhp:70},  attr:'yellow' },
  sniffer:     { id:'sniffer',     name:'Sniffer',     sprite:'cat',  base:{atk:11,def:5, spd:14, mhp:62},  attr:'green'  },
  heur_scan:   { id:'heur_scan',   name:'HeurScan',    sprite:'cat3', base:{atk:13,def:9, spd:12, mhp:88},  attr:null     },
  sentinel_av: { id:'sentinel_av', name:'SentinelAV',  sprite:'dog2', base:{atk:15,def:14,spd:8,  mhp:125}, attr:'yellow' },
  packet_wall: { id:'packet_wall', name:'PacketWall',  sprite:'dog2', base:{atk:12,def:18,spd:6,  mhp:150}, attr:'yellow' },
  root_guard:  { id:'root_guard',  name:'RootGuard',   sprite:'cat3', base:{atk:20,def:13,spd:15, mhp:140}, attr:'red'    },
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
  turnBaseMs: 1600,
  fleePenalty: 0.0,
  loseHpRestore: 0.10,
};
