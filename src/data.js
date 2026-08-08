// ═══════════════════════════════════════════════════════════
// VIRUZ PET — DATA
// Pure data. No DOM, no logic. Safe to edit without touching code.
// ═══════════════════════════════════════════════════════════

// ── ATTRIBUTES (replaces the old elemental system entirely) ──
export const ATTR = {
  red: {
    id: 'red', name: 'Red', icon: '⚔️', iconImg: 'assets/icons/atk.png', color: '#ff6a2b',
    glow: 'rgba(255,106,43,.45)',
    desc: 'โจมตีสูง ป้องกันต่ำ',
    mult: { atk: 1.35, def: 0.75, spd: 1.00, mhp: 0.95 },
  },
  green: {
    id: 'green', name: 'Green', icon: '🌪️', iconImg: 'assets/icons/spd.png', color: '#3ddc84',
    glow: 'rgba(61,220,132,.45)',
    desc: 'เร็วมาก มีโอกาสตีสองครั้ง',
    mult: { atk: 1.00, def: 0.75, spd: 1.40, mhp: 0.90 },
    doubleHit: 0.28,           // chance to strike twice
  },
  yellow: {
    id: 'yellow', name: 'Yellow', icon: '🛡️', iconImg: 'assets/icons/def.png', color: '#c98f1e',
    glow: 'rgba(201,143,30,.45)',
    desc: 'ป้องกันสูง แต่ช้า',
    mult: { atk: 0.85, def: 1.45, spd: 0.70, mhp: 1.25 },
  },
  white: {
    id: 'white', name: 'White', icon: '➕', iconImg: 'assets/icons/healer.png', color: '#f6ecd8',
    glow: 'rgba(246,236,216,.5)',
    desc: 'สายซัพพอร์ต บัฟทีมและฟื้นฟู',
    mult: { atk: 0.70, def: 0.90, spd: 0.90, mhp: 1.05 },
  },
};
export const ATTR_KEYS = ['red', 'green', 'yellow', 'white'];

// ══════════════════════════════════════════════════════════════
// HABIT / DATA-SYNC CARDS — a second, independent system layered on
// top of ATTR. Every wild enemy has a fixed Color + Type ("Habits");
// killing one has a low chance to drop a card named after it (see
// HABIT_CARD_DROP_CHANCE/rollHabitCard() below). Socketing that card
// into a pet's new `habit` equip slot (see EQUIP_SLOTS) grants the
// pet BOTH habits plus that card's own unique passive — none of which
// apply until it's actually equipped.
//
// Every iconImg below points at a PNG that doesn't exist yet —
// habitIcon() (game.js) renders the emoji fallback until one actually
// lands at that path, then switches over automatically. No code
// changes needed to add the real art later, just drop the file in.
// ══════════════════════════════════════════════════════════════

// ── HABIT COLORS (6) ──
// A 4-way cycle (Green > Red > Yellow > Blue > Green, each +20%) plus
// Dark/White as a separate pair: Dark edges everything else by +10%,
// but White beats Dark outright (+20%) and is neutral against the
// four-cycle colors. See habitColorMult() below for the actual lookup.
export const HABIT_COLORS = {
  green:  { id:'green',  name:'Green',  thai:'เขียว', icon:'🌿', iconImg:'assets/icons/habit_green.png',
    color:'#3ddc84', desc:'ชนะ Red +20%' },
  red:    { id:'red',    name:'Red',    thai:'แดง',   icon:'🔥', iconImg:'assets/icons/habit_red.png',
    color:'#ff6a2b', desc:'ชนะ Yellow +20%' },
  yellow: { id:'yellow', name:'Yellow', thai:'เหลือง', icon:'🌍', iconImg:'assets/icons/habit_yellow.png',
    color:'#c98f1e', desc:'ชนะ Blue +20%' },
  blue:   { id:'blue',   name:'Blue',   thai:'น้ำเงิน', icon:'💧', iconImg:'assets/icons/habit_blue.png',
    color:'#4fc3f7', desc:'ชนะ Green +20%' },
  white:  { id:'white',  name:'White',  thai:'ขาว',   icon:'⚪', iconImg:'assets/icons/habit_white.png',
    color:'#f6ecd8', desc:'ชนะ Dark +20% — เป็นกลางกับสีอื่น' },
  dark:   { id:'dark',   name:'Dark',   thai:'ดำมืด', icon:'🌑', iconImg:'assets/icons/habit_dark.png',
    color:'#7a4de0', desc:'ชนะทุกสี (ยกเว้น White) +10%' },
};
export const HABIT_COLOR_KEYS = ['green', 'red', 'yellow', 'blue', 'white', 'dark'];
// attacker color -> defender color it beats, at what bonus.
const HABIT_COLOR_CYCLE = { green:'red', red:'yellow', yellow:'blue', blue:'green' };
// Damage multiplier when `atkColor` attacks `defColor` (1 = no advantage).
// Either side may be null/undefined (no card equipped) — always neutral.
export function habitColorMult(atkColor, defColor) {
  if (!atkColor || !defColor || atkColor === defColor) return 1;
  if (atkColor === 'white') return defColor === 'dark' ? 1.2 : 1;
  if (atkColor === 'dark') return defColor === 'white' ? 1 : 1.1;
  if (HABIT_COLOR_CYCLE[atkColor] === defColor) return 1.2;
  return 1;
}

// ── HABIT TYPES (17) ──
// Each grants one passive, active only while its card is socketed.
// Implemented across three hook points depending on shape:
//  - statMods: folded into combatStats() (engine.js), like ailmentMods.
//  - proc:     pre-hit forced outcome, merged into computeDamage's
//              `proc` argument — see buildAttackProc() (game.js).
//  - onHit/onHurt: post-resolution triggers — see applyHabitPostHit()
//              (game.js), run after a hit lands.
// Both `beast` and `magicalBeast` check the OPPONENT's type, which is
// the one case here that's a relationship rather than a self trait.
export const HABIT_TYPES = {
  beast:        { id:'beast', name:'Beast', thai:'สัตว์', icon:'🐾', iconImg:'assets/icons/habit_beast.png',
    desc:'ATK/SPD +10% เมื่อสู้กับ Beast/Magical Beast อีกตัว' },
  magicalBeast: { id:'magicalBeast', name:'Magical Beast', thai:'สัตว์วิเศษ', icon:'🐾✨', iconImg:'assets/icons/habit_magicalbeast.png',
    desc:'ATK/SPD +18% + เจาะเกราะ 15% เมื่อสู้กับ Beast/Magical Beast อีกตัว' },
  insect:       { id:'insect', name:'Insect', thai:'แมลง', icon:'🪲', iconImg:'assets/icons/habit_insect.png',
    desc:'โจมตีครั้งที่ 5 ทุกครั้งเป็นคริติคอลรับประกัน' },
  fish:         { id:'fish', name:'Fish', thai:'ปลา', icon:'🐟', iconImg:'assets/icons/habit_fish.png',
    desc:'EVA +12% ขณะ HP เกิน 50%' },
  myth:         { id:'myth', name:'Myth', thai:'เทพนิยาย', icon:'⭐', iconImg:'assets/icons/habit_myth.png',
    desc:'สแตตที่สูงสุด (ATK/DEF/SPD) +15%' },
  goblin:       { id:'goblin', name:'Goblin', thai:'ก็อบลิน', icon:'👺', iconImg:'assets/icons/habit_goblin.png',
    desc:'คริติคอลรับประกันเมื่อศัตรู HP ต่ำกว่า 50%' },
  demon:        { id:'demon', name:'Demon', thai:'ปีศาจ', icon:'😈', iconImg:'assets/icons/habit_demon.png',
    desc:'ทุกการโจมตี 15% ติดสถานะ Corrupted ให้ศัตรู' },
  vampire:      { id:'vampire', name:'Vampire', thai:'แวมไพร์', icon:'🧛', iconImg:'assets/icons/habit_vampire.png',
    desc:'ฟื้น HP 10% ของดาเมจที่สร้างได้' },
  elemental:    { id:'elemental', name:'Elemental', thai:'ธาตุ', icon:'💎', iconImg:'assets/icons/habit_elemental.png',
    desc:'DEF +15% ขณะ HP เกิน 75%' },
  humanoid:     { id:'humanoid', name:'Humanoid', thai:'มนุษย์', icon:'🧍', iconImg:'assets/icons/habit_humanoid.png',
    desc:'ทุกสแตต +6% เสมอ' },
  undead:       { id:'undead', name:'Undead', thai:'อันเดด', icon:'💀', iconImg:'assets/icons/habit_undead.png',
    desc:'รอดจากดาเมจถึงตายครั้งแรก เหลือ HP 1 (ครั้งเดียวต่อไฟต์)' },
  plants:       { id:'plants', name:'Plants', thai:'พืช', icon:'🌱', iconImg:'assets/icons/habit_plants.png',
    desc:'ฟื้น HP 5% เมื่อจบเทิร์นที่ไม่โดนโจมตี' },
  fungi:        { id:'fungi', name:'Fungi', thai:'เชื้อรา', icon:'🍄', iconImg:'assets/icons/habit_fungi.png',
    desc:'ทุกการโจมตี 12% ติดพิษ 1 สแตคให้ศัตรู' },
  machine:      { id:'machine', name:'Machine', thai:'จักรกล', icon:'⚙️', iconImg:'assets/icons/habit_machine.png',
    desc:'ต้านทาน Freeze/Stoned แต่รับดาเมจ +15% ขณะติด Corrupted' },
  conjuration:  { id:'conjuration', name:'Conjuration', thai:'เวทเรียกของ', icon:'👻', iconImg:'assets/icons/habit_conjuration.png',
    desc:'20% โอกาสไม่รับดาเมจเลยจากการโจมตี (ภาพลวงตา)' },
  aberration:   { id:'aberration', name:'Aberration', thai:'สิ่งพิกล', icon:'👁️', iconImg:'assets/icons/habit_aberration.png',
    desc:'EVA/CRIT +12% แต่ DEF -10%' },
  dragon:       { id:'dragon', name:'Dragon', thai:'มังกร', icon:'🐉', iconImg:'assets/icons/habit_dragon.png',
    desc:'ATK +15% ขณะ HP เกิน 50%, ATK -15% เมื่อต่ำกว่า' },
  fey:          { id:'fey', name:'Fey', thai:'เฟย์', icon:'🧚', iconImg:'assets/icons/habit_fey.png',
    desc:'เมื่อโดนโจมตี 15% โอกาสสะกดผู้โจมตีกลับ (Charm)' },
};
export const HABIT_TYPE_KEYS = [
  'beast', 'magicalBeast', 'insect', 'fish', 'myth', 'goblin', 'demon',
  'vampire', 'elemental', 'humanoid', 'undead', 'plants', 'fungi',
  'machine', 'conjuration', 'aberration', 'dragon', 'fey',
];

// Generic UI badges for the new equip slot + "has an active card
// passive" indicator — see EQUIP_SLOTS.habit and wherever a pet's
// roster card renders its equipped gear.
export const HABIT_CARD_ICON = { icon:'🎴', iconImg:'assets/icons/habit_card.png' };
export const HABIT_PASSIVE_ICON = { icon:'⚡', iconImg:'assets/icons/habit_passive.png' };

// Low-rate drop, per kill, from a wild World/Raid encounter — see
// rollHabitCard() (engine.js) and its call site in checkBattleEnd()
// (game.js), same pattern as EQUIP_DROP_CHANCE/codePartDropChance.
export const HABIT_CARD_DROP_CHANCE = 0.05;

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
    id:'blobyte', name:'BloByte', shape:'royalslime', palette:'slime_royal', art2:true, scale:0.75,
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
    id:'inkarm', name:'InkArm', shape:'frostsquid', palette:'frost_squid', art2:true, scale:1,
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
    id:'nulworm', name:'NulWorm', shape:'crimworm', palette:'crimson_worm', art2:true, scale:0.75,
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
    id:'clampr', name:'Clampr', shape:'steelcrab', palette:'steel_crab', art2:true, scale:0.75,
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
    id:'hopbit', name:'HopBit', shape:'violetbeast', palette:'beast_violet', art2:true, scale:1.25,
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
    id:'jetsquid', name:'JetSquid', shape:'frostsquid', palette:'deep_fish', art2:true, scale:1,
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
    id:'chitbug', name:'ChitBug', shape:'sandbug', palette:'sand_bug', art2:true, scale:0.75,
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
    id:'echowing', name:'EchoWing', shape:'shadowbat', palette:'shadow_bat', art2:true, scale:0.75,
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
    id:'dustmoth', name:'DustMoth', shape:'embermoth', palette:'ember_moth', art2:true, scale:0.75,
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
    id:'finbyte', name:'FinByte', shape:'deepfish', palette:'deep_fish', art2:true, scale:1,
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
    id:'glitchimp', name:'GlitchImp', shape:'angelwing', palette:'angel_light', art2:true, scale:1,
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
    id:'spikeling', name:'Spikeling', shape:'spikelizard', palette:'spike_lizard', art2:true, scale:1,
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
    id:'orbling', name:'Orbling', shape:'toxinblob', palette:'toxin_green', art2:true, scale:1,
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
    id:'haunbit', name:'HaunBit', shape:'voidwisp', palette:'void_wisp', art2:true, scale:1,
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

};
export const SPECIES_KEYS = Object.keys(SPECIES);

// ── HACK TARGETS (dungeons) ──
// Sequential waves. HP carries over between waves.
// ── WORLD MAPS ──
// Each map has a looping video background and clickable pin locations.
// Pin x/y are PERCENTAGES of the video frame so they scale on any screen.
// Coordinates were measured directly from the marked reference images.
// warpIn: where the player lands the first time they ever open this
// map — sits near the lowest-level zone. warpOut: the red gate that
// leads to the NEXT map in this array, sitting near the highest-level
// zone (the last map has none — nowhere further to go yet). Both are
// nudged off the zone's own pin so they don't overlap it.
export const MAPS = [
  {
    id:'forest', name:'Verdant Realm', thai:'ดินแดนพงไพร',
    video:'assets/maps/forest.mp4', poster:'assets/maps/forest.jpg',
    levelRange:[1,50],
    desc:'ดินแดนเริ่มต้น — ป่า ภูเขา ทะเลทราย และเกาะกลางทะเล',
    warpIn:{ x:12, y:9 }, warpOut:{ x:55, y:91 },
  },
  {
    id:'hell', name:'Infernal Realm', thai:'ดินแดนนรก',
    video:'assets/maps/hell.mp4', poster:'assets/maps/hell.jpg',
    levelRange:[51,100],
    desc:'ดินแดนขั้นสูง — ลาวา ปีศาจ และปราสาทจอมมาร',
    warpIn:{ x:10, y:90 }, warpOut:null,
  },
];

// ── ZONES ──
// `kind:'battle'` = fight zone, `kind:'safe'` = rest + shop.
// `order` drives the recommended progression path drawn on the map.
export const ZONES = [
  {
    id: 'f_forest',
    map: 'forest',
    kind: 'battle',
    order: 1,
    name: 'The Forest',
    thai: 'ป่าใหญ่',
    x: 33.84,
    y: 13.46,
    lv: [
      1,
      3
    ],
    waves: [
      1,
      2
    ],
    pool: [
      'greenworm',
      'beetle'
    ],
    reward: {
      bitzMult: 1,
      expMult: 1
    },
    desc: 'ป่าทึบ จุดเริ่มต้นของการผจญภัย'
  },

  {
    id: 'f_mountain',
    map: 'forest',
    kind: 'battle',
    order: 2,
    name: 'The Mountain',
    thai: 'ภูเขา',
    x: 36.25,
    y: 39.77,
    lv: [
      4,
      9
    ],
    waves: [
      2,
      2
    ],
    pool: [
      'beetle',
      'stone_imp'
    ],
    reward: {
      bitzMult: 1.3,
      expMult: 1.25
    },
    desc: 'ทางลาดชัน มีสัตว์หินอาศัยอยู่'
  },

  {
    id: 'f_riverfall',
    map: 'forest',
    kind: 'battle',
    order: 3,
    name: 'Riverfall Mountain',
    thai: 'ภูเขาน้ำตก',
    x: 74.56,
    y: 31,
    lv: [
      10,
      16
    ],
    waves: [
      2,
      3
    ],
    pool: [
      'kappa',
      'stone_imp'
    ],
    reward: {
      bitzMult: 1.6,
      expMult: 1.5
    },
    desc: 'น้ำตกสูง อากาศชื้นและหมอกหนา'
  },

  {
    id: 'f_wolfden',
    map: 'forest',
    kind: 'battle',
    order: 4,
    name: 'The Wolf Den',
    thai: 'ถ้ำหมาป่า',
    x: 85.52,
    y: 53.19,
    lv: [
      17,
      24
    ],
    waves: [
      2,
      3
    ],
    pool: [
      'fang_stalker',
      'kappa'
    ],
    reward: {
      bitzMult: 1.9,
      expMult: 1.8
    },
    desc: 'ถ้ำมืด กลิ่นสัตว์ร้ายคละคลุ้ง'
  },

  {
    id: 'f_desert',
    map: 'forest',
    kind: 'battle',
    order: 5,
    name: 'The Desert',
    thai: 'ทะเลทราย',
    x: 48.76,
    y: 68.18,
    lv: [
      25,
      32
    ],
    waves: [
      2,
      3
    ],
    pool: [
      'sand_worm',
      'sand_turtle'
    ],
    reward: {
      bitzMult: 2.2,
      expMult: 2.1
    },
    desc: 'ผืนทรายร้อนระอุ ไร้ที่กำบัง'
  },

  {
    id: 'f_oasis',
    map: 'forest',
    kind: 'battle',
    order: 6,
    name: 'The Oasis',
    thai: 'โอเอซิส',
    x: 24.59,
    y: 69.05,
    lv: [
      33,
      41
    ],
    waves: [
      2,
      3
    ],
    pool: [
      'oasis_otter',
      'rainbow_frog'
    ],
    reward: {
      bitzMult: 2.6,
      expMult: 2.4
    },
    desc: 'บ่อน้ำกลางทะเลทราย — ดูสงบเกินจริง'
  },

  {
    id: 'f_island',
    map: 'forest',
    kind: 'battle',
    order: 7,
    name: 'The Island',
    thai: 'เกาะร้าง',
    x: 26.43,
    y: 91.04,
    lv: [
      42,
      50
    ],
    waves: [
      3,
      3
    ],
    pool: [
      'flying_fish',
      'island_monkey'
    ],
    reward: {
      bitzMult: 3,
      expMult: 2.8
    },
    desc: 'เกาะโดดเดี่ยวกลางทะเล บทสุดท้ายของดินแดนนี้'
  },

  {
    id: 'f_harbor',
    map: 'forest',
    kind: 'safe',
    order: 0,
    name: 'Harbor Village',
    thai: 'หมู่บ้านท่าเรือ',
    x: 82.11,
    y: 84.84,
    desc: 'พักฟื้น VIRUZ และซื้อยา'
  },

  {
    id: 'h_village',
    map: 'hell',
    kind: 'battle',
    order: 1,
    name: 'Outer Ruined Village',
    thai: 'หมู่บ้านร้างชั้นนอก',
    x: 76.71,
    y: 88.18,
    lv: [
      51,
      58
    ],
    waves: [
      2,
      3
    ],
    pool: [
      'goblin_grunt',
      'goblin_miner'
    ],
    reward: {
      bitzMult: 3.4,
      expMult: 3.2
    },
    desc: 'ซากหมู่บ้านที่ถูกเผาจนราบ'
  },

  {
    id: 'h_crossroads',
    map: 'hell',
    kind: 'battle',
    order: 2,
    name: 'The Crossroads',
    thai: 'สี่แยกนรก',
    x: 59.24,
    y: 75.34,
    lv: [
      59,
      66
    ],
    waves: [
      3,
      3
    ],
    pool: [
      'goblin_miner',
      'black_beast'
    ],
    reward: {
      bitzMult: 3.8,
      expMult: 3.6
    },
    desc: 'ทางแยกกลางธารลาวา'
  },

  {
    id: 'h_beastden',
    map: 'hell',
    kind: 'battle',
    order: 3,
    name: 'Demonbeast Den',
    thai: 'รังอสูรสัตว์',
    x: 83.36,
    y: 63.15,
    lv: [
      67,
      74
    ],
    waves: [
      2,
      3
    ],
    pool: [
      'black_beast',
      'rock_golem'
    ],
    reward: {
      bitzMult: 4.3,
      expMult: 4
    },
    desc: 'ฝูงอสูรสัตว์รวมตัวกันอยู่'
  },

  {
    id: 'h_quarter',
    map: 'hell',
    kind: 'battle',
    order: 4,
    name: 'Servant Demon Quarter',
    thai: 'เขตปีศาจรับใช้',
    x: 49.93,
    y: 51.65,
    lv: [
      75,
      82
    ],
    waves: [
      3,
      3
    ],
    pool: [
      'hobgoblin',
      'fire_golem'
    ],
    reward: {
      bitzMult: 4.8,
      expMult: 4.5
    },
    desc: 'หอคอยกลางทะเลลาวา ที่พำนักของปีศาจรับใช้'
  },

  {
    id: 'h_manor',
    map: 'hell',
    kind: 'battle',
    order: 5,
    name: 'Vice Manor Castle',
    thai: 'ปราสาทอุปราช',
    x: 81.82,
    y: 34.54,
    lv: [
      83,
      90
    ],
    waves: [
      3,
      3
    ],
    pool: [
      'butler_vamp',
      'vampire_lady'
    ],
    reward: {
      bitzMult: 5.4,
      expMult: 5
    },
    desc: 'ปราสาทของรองจอมมาร'
  },

  {
    id: 'h_castle',
    map: 'hell',
    kind: 'battle',
    order: 6,
    name: 'Demon Lord Castle',
    thai: 'ปราสาทจอมมาร',
    x: 34.7,
    y: 14.82,
    lv: [
      91,
      100
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'vampire_lord',
      'vampire_lady',
      'butler_vamp'
    ],
    reward: {
      bitzMult: 6.5,
      expMult: 6
    },
    desc: 'ที่สุดของดินแดนนรก — จอมมารรออยู่'
  },

  {
    id: 'h_campfire',
    map: 'hell',
    kind: 'safe',
    order: 0,
    name: 'Crossroads Campfire',
    thai: 'กองไฟสี่แยก',
    x: 29.98,
    y: 87.78,
    desc: 'กองไฟปลอดภัย พักฟื้นและซื้อยา'
  },

  {
    id: 'galaxy_red_gate',
    targetMapId: 'galaxy_red',
    icon: '🔴',
    name: 'Red Giant',
    thai: 'ดาวยักษ์แดง',
    x: 30,
    y: 28,
    map: 'galaxy',
    kind: 'safe',
    order: 0,
    desc: 'เข้าสู่แผนที่ย่อย'
  },

  {
    id: 'galaxy_rings_gate',
    targetMapId: 'galaxy_rings',
    icon: '🪐',
    name: 'Ringed Star',
    thai: 'ดาวแห่งวงแหวน',
    x: 70,
    y: 45,
    map: 'galaxy',
    kind: 'safe',
    order: 0,
    desc: 'เข้าสู่แผนที่ย่อย'
  },

  {
    id: 'galaxy_dwarf_gate',
    targetMapId: 'galaxy_dwarf',
    icon: '⭐',
    name: 'Blue Dwarf',
    thai: 'ดาวแคระสีน้ำเงิน',
    x: 34,
    y: 62,
    map: 'galaxy',
    kind: 'safe',
    order: 0,
    desc: 'เข้าสู่แผนที่ย่อย'
  },

  {
    id: 'galaxy_ship_gate',
    targetMapId: 'galaxy_ship',
    icon: '🚀',
    name: 'Derelict Starship',
    thai: 'ยานร้างกลางอวกาศ',
    x: 78,
    y: 80,
    map: 'galaxy',
    kind: 'safe',
    order: 0,
    desc: 'เข้าสู่แผนที่ย่อย'
  },

  {
    id: 'gr_corona',
    map: 'galaxy_red',
    kind: 'battle',
    order: 1,
    name: 'Corona Reach',
    thai: 'ขอบโคโรนา',
    x: 26,
    y: 30,
    lv: [
      101,
      105
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'ember_pup',
      'solar_moth'
    ],
    reward: {
      bitzMult: 7,
      expMult: 6.5
    },
    desc: 'ทางผ่านเหนือขอบโคโรนาที่ปั่นป่วน'
  },

  {
    id: 'gr_sunspots',
    map: 'galaxy_red',
    kind: 'battle',
    order: 2,
    name: 'Sunspot Basin',
    thai: 'แอ่งจุดมืดสุริยะ',
    x: 70,
    y: 34,
    lv: [
      106,
      110
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'solar_moth',
      'magma_golem'
    ],
    reward: {
      bitzMult: 7.4,
      expMult: 6.9
    },
    desc: 'แอ่งมืดที่ซ่อนศัตรูจากแสงดาว'
  },

  {
    id: 'gr_prominence',
    map: 'galaxy_red',
    kind: 'battle',
    order: 3,
    name: 'Prominence Arch',
    thai: 'ซุ้มเปลวสุริยะ',
    x: 40,
    y: 50,
    lv: [
      111,
      115
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'magma_golem',
      'ember_pup'
    ],
    reward: {
      bitzMult: 7.8,
      expMult: 7.3
    },
    desc: 'เปลวสุริยะโค้งสูงเหนือเส้นทาง'
  },

  {
    id: 'gr_corepath',
    map: 'galaxy_red',
    kind: 'battle',
    order: 4,
    name: 'Crimson Coreway',
    thai: 'ทางแกนสีชาด',
    x: 32,
    y: 72,
    lv: [
      116,
      120
    ],
    waves: [
      4,
      4
    ],
    pool: [
      'corona_dragon',
      'magma_golem',
      'solar_moth'
    ],
    reward: {
      bitzMult: 8.3,
      expMult: 7.8
    },
    desc: 'เส้นทางที่ร้อนที่สุดใกล้แกนดาว'
  },

  {
    id: 'gr_station',
    map: 'galaxy_red',
    kind: 'safe',
    order: 0,
    name: 'Corona Station',
    thai: 'สถานีโคโรนา',
    x: 74,
    y: 62,
    desc: 'สถานีโคจรสำหรับพักฟื้นและซื้อยา'
  },

  {
    id: 'gg_iceband',
    map: 'galaxy_rings',
    kind: 'battle',
    order: 1,
    name: 'Ice Band',
    thai: 'แนววงแหวนน้ำแข็ง',
    x: 28,
    y: 32,
    lv: [
      121,
      125
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'crystal_crab',
      'comet_bunny'
    ],
    reward: {
      bitzMult: 8.6,
      expMult: 8
    },
    desc: 'ทางวงแหวนที่เต็มไปด้วยผลึกน้ำแข็ง'
  },

  {
    id: 'gg_ruins',
    map: 'galaxy_rings',
    kind: 'battle',
    order: 2,
    name: 'Orbital Ruins',
    thai: 'ซากโคจรโบราณ',
    x: 66,
    y: 44,
    lv: [
      126,
      130
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'comet_bunny',
      'orbit_ray'
    ],
    reward: {
      bitzMult: 9,
      expMult: 8.4
    },
    desc: 'ซากหอดูดาวโบราณกลางวงแหวน'
  },

  {
    id: 'gg_debris',
    map: 'galaxy_rings',
    kind: 'battle',
    order: 3,
    name: 'Debris Crown',
    thai: 'มงกุฎเศษดาว',
    x: 72,
    y: 70,
    lv: [
      131,
      135
    ],
    waves: [
      4,
      4
    ],
    pool: [
      'ring_guardian',
      'orbit_ray',
      'crystal_crab'
    ],
    reward: {
      bitzMult: 9.5,
      expMult: 8.9
    },
    desc: 'แนวเศษดาวหนาแน่นที่หมุนด้วยความเร็วสูง'
  },

  {
    id: 'gg_outpost',
    map: 'galaxy_rings',
    kind: 'safe',
    order: 0,
    name: 'Crystal Outpost',
    thai: 'ฐานผลึก',
    x: 36,
    y: 58,
    desc: 'ฐานขุดผลึกสำหรับพักฟื้นและซื้อยา'
  },

  {
    id: 'gd_bridge',
    map: 'galaxy_dwarf',
    kind: 'battle',
    order: 1,
    name: 'Celestial Bridge',
    thai: 'สะพานดารา',
    x: 30,
    y: 40,
    lv: [
      136,
      139
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'azure_slime',
      'plasma_fox'
    ],
    reward: {
      bitzMult: 9.8,
      expMult: 9.2
    },
    desc: 'สะพานผลึกที่สั่นตามคลื่นพลังงาน'
  },

  {
    id: 'gd_storm',
    map: 'galaxy_dwarf',
    kind: 'battle',
    order: 2,
    name: 'Corona Storm',
    thai: 'พายุโคโรนา',
    x: 70,
    y: 52,
    lv: [
      140,
      143
    ],
    waves: [
      4,
      4
    ],
    pool: [
      'plasma_fox',
      'star_jelly'
    ],
    reward: {
      bitzMult: 10.2,
      expMult: 9.6
    },
    desc: 'พายุพลังงานสีน้ำเงินรอบดาวแคระ'
  },

  {
    id: 'gd_nexus',
    map: 'galaxy_dwarf',
    kind: 'battle',
    order: 3,
    name: 'Azure Nexus',
    thai: 'ศูนย์รวมสีคราม',
    x: 38,
    y: 68,
    lv: [
      144,
      147
    ],
    waves: [
      4,
      5
    ],
    pool: [
      'frostflare_phoenix',
      'star_jelly',
      'azure_slime'
    ],
    reward: {
      bitzMult: 10.7,
      expMult: 10
    },
    desc: 'จุดรวมสายฟ้าและคลื่นกระแทกจากดาว'
  },

  {
    id: 'gs_medbay',
    map: 'galaxy_ship',
    kind: 'safe',
    order: 0,
    name: 'Restored Med-Bay',
    thai: 'ห้องพยาบาลที่กู้คืน',
    x: 32,
    y: 30,
    desc: 'ระบบพยาบาลที่ยังใช้พักฟื้นและซื้อยาได้'
  },

  {
    id: 'gs_navigation',
    map: 'galaxy_ship',
    kind: 'battle',
    order: 1,
    name: 'Navigation Chamber',
    thai: 'ห้องนำทาง',
    x: 68,
    y: 42,
    lv: [
      148,
      153
    ],
    waves: [
      4,
      4
    ],
    pool: [
      'cable_rat',
      'repair_drone'
    ],
    reward: {
      bitzMult: 11,
      expMult: 10.3
    },
    desc: 'ห้องนำทางที่ถูกระบบไวรัสยึดครอง'
  },

  {
    id: 'gs_engine',
    map: 'galaxy_ship',
    kind: 'battle',
    order: 2,
    name: 'Engine Vault',
    thai: 'ห้องเครื่องปฏิกรณ์',
    x: 34,
    y: 56,
    lv: [
      154,
      159
    ],
    waves: [
      4,
      5
    ],
    pool: [
      'repair_drone',
      'void_mimic'
    ],
    reward: {
      bitzMult: 11.5,
      expMult: 10.8
    },
    desc: 'ห้องเครื่องที่พลังงานกำลังไม่เสถียร'
  },

  {
    id: 'gs_command',
    map: 'galaxy_ship',
    kind: 'battle',
    order: 3,
    name: 'Sealed Command Bridge',
    thai: 'สะพานบัญชาการปิดผนึก',
    x: 70,
    y: 68,
    lv: [
      160,
      165
    ],
    waves: [
      5,
      5
    ],
    pool: [
      'corrupted_captain',
      'void_mimic',
      'cable_rat'
    ],
    reward: {
      bitzMult: 12.2,
      expMult: 11.5
    },
    desc: 'ศูนย์บัญชาการสุดท้ายของยานร้าง'
  },

  {
    id: 'board_gate',
    map: 'galaxy',
    kind: 'safe',
    order: 0,
    targetMapId: 'board',
    icon: '🎲',
    name: 'Tabletop Realm',
    thai: 'อาณาจักรกระดาน',
    x: 52,
    y: 18,
    desc: 'เข้าสู่แผนที่ย่อย'
  },

  {
    id: 'bd_tavern',
    map: 'board',
    kind: 'safe',
    order: 0,
    name: 'Adventurers' Rest',
    thai: 'โรงเตี๊ยมนักผจญภัย',
    x: 81.15,
    y: 42.3,
    desc: 'โต๊ะมุมโรงเตี๊ยมสำหรับพักฟื้นและซื้อยา'
  },

  {
    id: 'bd_gate',
    map: 'board',
    kind: 'battle',
    order: 1,
    name: 'Starting Square',
    thai: 'ช่องเริ่มต้น',
    x: 44.15,
    y: 22.98,
    lv: [
      166,
      169
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'hero_warrior',
      'hero_rogue'
    ],
    reward: {
      bitzMult: 12.5,
      expMult: 11.8
    },
    desc: 'ช่องแรกของกระดาน — หน่วยลาดตระเวนของปาร์ตี้'
  },

  {
    id: 'bd_fortress',
    map: 'board',
    kind: 'battle',
    order: 2,
    name: 'Grey Fortress',
    thai: 'ป้อมปราการสีเทา',
    x: 31.03,
    y: 35.77,
    lv: [
      170,
      173
    ],
    waves: [
      3,
      4
    ],
    pool: [
      'hero_warrior',
      'hero_paladin',
      'hero_bard'
    ],
    reward: {
      bitzMult: 12.9,
      expMult: 12.1
    },
    desc: 'ป้อมหินสีเทา — ที่มั่นของนักรบ อัศวิน และกวี'
  },

  {
    id: 'bd_chapel',
    map: 'board',
    kind: 'battle',
    order: 3,
    name: 'Candlelit Chapel',
    thai: 'โบสถ์แสงเทียน',
    x: 18.85,
    y: 49.23,
    lv: [
      174,
      177
    ],
    waves: [
      4,
      4
    ],
    pool: [
      'hero_priest',
      'hero_paladin'
    ],
    reward: {
      bitzMult: 13.2,
      expMult: 12.4
    },
    desc: 'แท่นบูชาที่สวดภาวนาขับไล่ไวรัส'
  },

  {
    id: 'bd_pit',
    map: 'board',
    kind: 'battle',
    order: 4,
    name: 'Skeleton Pit',
    thai: 'หลุมโครงกระดูก',
    x: 34.31,
    y: 60.52,
    lv: [
      178,
      181
    ],
    waves: [
      4,
      4
    ],
    pool: [
      'hero_rogue',
      'hero_sorcerer'
    ],
    reward: {
      bitzMult: 13.6,
      expMult: 12.8
    },
    desc: 'หลุมมืดเต็มไปด้วยโครงกระดูก — ที่ซุ่มของโจรและผู้วิเศษ'
  },

  {
    id: 'bd_tower',
    map: 'board',
    kind: 'battle',
    order: 5,
    name: 'Arcane Tower',
    thai: 'หอคอยเวทมนตร์',
    x: 20.49,
    y: 77.11,
    lv: [
      182,
      184
    ],
    waves: [
      4,
      5
    ],
    pool: [
      'hero_wizard',
      'hero_sorcerer'
    ],
    reward: {
      bitzMult: 14,
      expMult: 13.1
    },
    desc: 'หอคอยที่คลื่นเวทมนตร์แปรปรวนตลอดเวลา'
  },

  {
    id: 'bd_ridge',
    map: 'board',
    kind: 'battle',
    order: 6,
    name: 'Dragonfoot Ridge',
    thai: 'สันเขาเชิงมังกร',
    x: 73,
    y: 79.3,
    lv: [
      185,
      187
    ],
    waves: [
      4,
      5
    ],
    pool: [
      'hero_sorcerer',
      'hero_wizard'
    ],
    reward: {
      bitzMult: 14.5,
      expMult: 13.5
    },
    desc: 'เชิงเขามังกร — ด่านสุดท้ายก่อนขึ้นสู่ยอด'
  },

  {
    id: 'bd_hall',
    map: 'board',
    kind: 'battle',
    order: 7,
    name: 'Dungeon Master's Hall',
    thai: 'ห้องโถงเจ้าแห่งดันเจี้ยน',
    x: 68,
    y: 70,
    lv: [
      188,
      190
    ],
    waves: [
      5,
      5
    ],
    pool: [
      'hero_dungeon_master',
      'hero_ranger'
    ],
    reward: {
      bitzMult: 15,
      expMult: 14
    },
    desc: 'ยอดเขามังกร โต๊ะสุดท้าย ที่ลูกเต๋าตัดสินทุกอย่าง'
  },

  {
    id: 'zone_mskcz1mq_1',
    map: 'forest',
    kind: 'battle',
    order: 99,
    name: 'New Zone',
    thai: 'โหนดใหม่',
    x: 50,
    y: 50,
    lv: [
      1,
      3
    ],
    waves: [
      1,
      1
    ],
    pool: [
      'greenworm',
      'beetle'
    ],
    reward: {
      bitzMult: 1,
      expMult: 1
    },
    desc: 'Dev-created zone'
  }
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
  greenworm:    { id:'greenworm',    name:'GreenWorm',   gif:'greenworm',     ext:'png', faces:'left', scale:0.54, base:{atk:15,def:7, spd:10, mhp:38}, attr:'green'  , habitColor:'green', habitType:'insect' },
  beetle:       { id:'beetle',       name:'JadeBeetle',  gif:'beetle',        ext:'png', faces:'right', scale:0.5, base:{atk:18,def:12,spd:9,  mhp:48}, attr:'yellow' , habitColor:'green', habitType:'insect' },
  stone_imp:    { id:'stone_imp',    name:'StoneImp',    shape:'steelcrab',   palette:'steel_crab',   base:{atk:19,def:14,spd:8,  mhp:58}, attr:'yellow' , habitColor:'yellow', habitType:'elemental' },
  kappa:        { id:'kappa',        name:'Kappa',       gif:'kappa',         ext:'png', faces:'right', scale:0.69, base:{atk:23,def:13,spd:14, mhp:60}, attr:null     , habitColor:'blue', habitType:'myth' },
  fang_stalker: { id:'fang_stalker', name:'FangStalker', shape:'shadowbat',   palette:'shadow_bat',   base:{atk:26,def:10,spd:17, mhp:54}, attr:'red'    , habitColor:'dark', habitType:'beast' },
  // Source art for these two is drawn the OPPOSITE of what `faces` said —
  // SandWorm/SandTurtle were rendering mirrored (backwards) as enemies.
  sand_worm:    { id:'sand_worm',    name:'SandWorm',    gif:'sand_worm',     ext:'png', faces:'left', scale:1.31, base:{atk:30,def:12,spd:13, mhp:68}, attr:'yellow' , habitColor:'yellow', habitType:'insect' },
  sand_turtle:  { id:'sand_turtle',  name:'SandTurtle',  gif:'sand_turtle',   ext:'png', faces:'right', scale:1.23, base:{atk:26,def:22,spd:7,  mhp:88}, attr:'yellow' , habitColor:'yellow', habitType:'beast' },
  oasis_otter:  { id:'oasis_otter',  name:'OasisOtter',  gif:'oasis_otter',   ext:'png', faces:'right', scale:0.62, base:{atk:33,def:14,spd:19, mhp:70}, attr:'green'  , habitColor:'blue', habitType:'beast' },
  rainbow_frog: { id:'rainbow_frog', name:'RainbowFrog', gif:'rainbow_frog',  ext:'png', faces:'right', scale:0.56, base:{atk:35,def:15,spd:16, mhp:74}, attr:null     , habitColor:'blue', habitType:'beast' },
  // Same mirrored-facing fix as SandWorm/SandTurtle above.
  flying_fish:  { id:'flying_fish',  name:'FlyingFish',  gif:'flying_fish',   ext:'png', faces:'right', scale:0.59, base:{atk:36,def:14,spd:21, mhp:72}, attr:'green'  , habitColor:'blue', habitType:'fish' },
  island_monkey:{ id:'island_monkey',name:'IslandMonkey',gif:'island_monkey', ext:'png', faces:'right', scale:0.66, base:{atk:40,def:18,spd:18, mhp:84}, attr:'red'    , habitColor:'red', habitType:'beast' },

  // ══ HELL ══
  // These use real art (assets/sprites/<gif>/still.png + attack.png).
  // `ext:'png'` tells the renderer which extension to load.
  // Same mirrored-facing fix as SandWorm/SandTurtle/FlyingFish above.
  goblin_grunt: { id:'goblin_grunt', name:'Goblin',        gif:'goblin',       ext:'png', faces:'right', scale:0.6, base:{atk:38,def:14,spd:15, mhp:70},  attr:'green'  , habitColor:'yellow', habitType:'goblin' },
  goblin_miner: { id:'goblin_miner', name:'MinerGoblin',   gif:'miner_goblin', ext:'png', faces:'right', scale:0.63, base:{atk:43,def:17,spd:13, mhp:80},  attr:'yellow' , habitColor:'yellow', habitType:'goblin' },
  black_beast:  { id:'black_beast',  name:'BlackBeast',    gif:'black_beast',  ext:'png', faces:'right', scale:1.44, base:{atk:50,def:16,spd:20, mhp:86},  attr:'red'    , habitColor:'dark', habitType:'beast' },
  rock_golem:   { id:'rock_golem',   name:'RockGolem',     gif:'rock_golem',   ext:'png', faces:'right', scale:1.78, base:{atk:46,def:28,spd:8,  mhp:118}, attr:'yellow' , habitColor:'yellow', habitType:'elemental' },
  hobgoblin:    { id:'hobgoblin',    name:'RedHobgoblin',  gif:'hobgoblin',    ext:'png', faces:'right', scale:1.1, base:{atk:56,def:20,spd:16, mhp:98},  attr:'red'    , habitColor:'red', habitType:'goblin' },
  fire_golem:   { id:'fire_golem',   name:'FireGolem',     gif:'fire_golem',   ext:'png', faces:'right', scale:1.85, base:{atk:60,def:26,spd:11, mhp:126}, attr:'red'    , habitColor:'red', habitType:'elemental' },
  butler_vamp:  { id:'butler_vamp',  name:'ManorButler',   gif:'butler',       ext:'png', faces:'right', scale:1.0, base:{atk:64,def:22,spd:19, mhp:110}, attr:null     , habitColor:'dark', habitType:'humanoid' },
  vampire_lady: { id:'vampire_lady', name:'VampireLady',   gif:'vampire_lady', ext:'png', faces:'right', scale:1.06, base:{atk:72,def:24,spd:22, mhp:130}, attr:null     , habitColor:'dark', habitType:'vampire' },
  vampire_lord: { id:'vampire_lord', name:'VampireLord',   gif:'vampire_lord', ext:'png', faces:'right', scale:1.18, base:{atk:82,def:32,spd:21, mhp:160}, attr:'red'    , habitColor:'dark', habitType:'vampire' },

  // ── TRAIN AMBUSH ──
  // Never appears in a zone `pool` — spawned only by the 30% surprise-
  // attack roll mid train-ride (see rollTrainAmbush() in game.js), at
  // teamLevel + a random 5-10, not the zone's own level range. Stays
  // grounded (no float animation) unlike every other creature — see
  // the `.bu-sprite.no-float` CSS rule keyed off this species.
  mimic: { id:'mimic', name:'Mimic', gif:'mimic', ext:'png', faces:'right', scale:1.1,
    base:{atk:30,def:16,spd:10,mhp:70}, attr:null, habitColor:'dark', habitType:'conjuration',
    noFloat:true, specials:['mesmerise'] },

  // ── SECURITY GUARDS (raid defense) ──
  // Not wild encounters — never appear in a zone `pool`, so they never
  // show up as boss/hack fodder. Spawned only by startRaidFight() in
  // game.js as the gate battle before a rival's own pet team, per the
  // tier GUARD_TIERS below assigns to that rival (by level bracket).
  // `faces` corrects each source image to how it was actually drawn —
  // see GUARD_TIERS comment for which ones needed a flip.
  guard_imp:   { id:'guard_imp',   name:'GuardImp',   gif:'guard_imp',   ext:'png', faces:'left',  scale:0.75, base:{atk:24,def:18,spd:11,mhp:72},  attr:null , habitColor:'dark', habitType:'demon' },
  gunner_imp:  { id:'gunner_imp',  name:'GunnerImp',  gif:'gunner_imp',  ext:'png', faces:'right', scale:1.15, base:{atk:38,def:20,spd:15,mhp:95},  attr:null , habitColor:'dark', habitType:'demon' },
  tank_imp:    { id:'tank_imp',    name:'TankImp',    gif:'tank_imp',    ext:'png', faces:'left',  scale:1.69, base:{atk:46,def:32,spd:9, mhp:135}, attr:null , habitColor:'yellow', habitType:'demon' },
  marshal_imp: { id:'marshal_imp', name:'MarshalImp', gif:'marshal_imp', ext:'png', faces:'right', scale:0.9,  base:{atk:68,def:30,spd:20,mhp:155}, attr:null , habitColor:'red', habitType:'demon' },
};

// ── RAID DEFENSE TIERS ──
// 4 purchasable "AntiviruZ Security Package" tiers, sold at the Tech
// Shop and gated by player level (15/30/45/60). `defId` is the
// ANTIVIRUZ entry startRaidFight() spawns as the gate battle before a
// rival's own pets. A rival's tier is picked from their level in
// net.js's _generateRivals(); the player's OWN equipped tier
// (G.guardTier) is what a future live-backend "your base was raided"
// flow would use as the defender. `lootMult` scales buildLootMenu()'s
// reward for beating that tier's guard — tougher gate, better payout.
// Source art: turret/tank/marshal were drawn facing right and get
// auto-flipped via the `faces` field above (matches the ally/enemy
// flip convention already used everywhere else); the tank's mirrored
// "DEFENDER-1" hull text is why that one PNG was flipped at the pixel
// level instead — flipping the pixels the same way the CSS would
// have also un-mirrors the text.
export const GUARD_TIERS = [
  { tier:1, defId:'guard_imp',   name:'Security Package I',   minLevel:15, cost:5000,   lootMult:1.0  },
  { tier:2, defId:'gunner_imp',  name:'Security Package II',  minLevel:30, cost:15000,  lootMult:1.25 },
  { tier:3, defId:'tank_imp',    name:'Security Package III', minLevel:45, cost:40000,  lootMult:1.55 },
  { tier:4, defId:'marshal_imp', name:'Security Package IV',  minLevel:60, cost:100000, lootMult:2.0  },
];
export function guardTierForLevel(level) {
  let t = 1;
  for (const g of GUARD_TIERS) if (level >= g.minLevel) t = g.tier;
  return t;
}

// ── REGION BOSSES ──
// One wandering boss per MAP (region), not per zone. Pool = the 3
// highest-power monsters belonging to that region (across all its
// zones), scaled 1.5x size with a two-phase HP bar. Position is
// re-rolled among that region's battle zones each time the boss
// (re)spawns — see rollBossSpawn() in engine.js.
function monsterPower(m) {
  const b = m.base;
  return b.atk + b.def + b.spd * 0.5 + b.mhp * 0.3;
}
export function bossPoolForMap(mapId) {
  const ids = new Set();
  zonesOfMap(mapId).forEach(z => (z.pool || []).forEach(id => ids.add(id)));
  return [...ids]
    .map(id => ANTIVIRUZ[id])
    .filter(Boolean)
    .sort((a, b) => monsterPower(b) - monsterPower(a))
    .slice(0, 3)
    .map(m => m.id);
}
// A boss "resets its position" by respawning at a random battle zone
// within its region each time it (re)appears.
export function randomBossZone(mapId) {
  const battle = zonesOfMap(mapId).filter(z => z.kind === 'battle');
  if (!battle.length) return null;
  return battle[Math.floor(Math.random() * battle.length)];
}

export const BOSS_TUNING = {
  sizeMult: 1.5,             // "0.5x bigger than normal"
  phase2HpPct: 0.70,         // second bar's max, as % of the normal max HP
  phase2AtkMult: 1.50,       // +50% attack once in rage state
  malwareCoreChance: 0.25,
  moneyMult: 2.0,            // "2x better money" vs the same enemy's normal drop
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

// ── HOMEMADE COOKING ──
// Ingredients are bought at the Food Shop like anything else — except
// meat, which is deliberately NOT purchasable there. It only drops
// from hunting monsters, so cooking always costs a trip into battle
// first, not just Bitz. That's the tradeoff for homemade food being
// stronger than anything precooked.
export const INGREDIENTS = [
  { id:'ing_veg', name:'Data Veggies', icon:'🥬', cost:40, desc:'ผักสด — ใช้ทำอาหารโฮมเมด' },
  { id:'ing_bun', name:'Byte Bun',     icon:'🍞', cost:35, desc:'ขนมปัง — ใช้ทำอาหารโฮมเมด' },
];
export const MEAT_ITEM = { id:'ing_meat', name:'Viral Meat', icon:'🥩',
  desc:'เนื้อไวรัส — ดรอปจากการล่าสัตว์ประหลาดเท่านั้น ซื้อไม่ได้' };
export const MEAT_DROP_CHANCE = 0.35;

// Recipes cook into regular food items (they land in the same G.foods
// bag FOODS do, and use the same care-screen feeding minigame) but
// every one of them beats every precooked tier — the best precooked
// food (Quantum Feast) is 24 loyalty; the cheapest recipe here already
// clears that.
export const RECIPES = [
  { id:'recipe_taco',      name:'Meat Taco',              icon:'🌮',
    need:{ veg:1, bun:1, meat:1 }, loyalty:25, desc:'ทาโก้เนื้อ — โฮมเมด +25 ความผูกพัน' },
  { id:'recipe_sandwich',  name:'Meat Sandwich',          icon:'🥪',
    need:{ veg:1, bun:2, meat:1 }, loyalty:27, desc:'แซนด์วิชเนื้อ — โฮมเมด +27 ความผูกพัน' },
  { id:'recipe_burger',    name:'Meat Burger',            icon:'🍔',
    need:{ veg:1, bun:2, meat:2 }, loyalty:30, desc:'เบอร์เกอร์เนื้อ — โฮมเมด +30 ความผูกพัน' },
  { id:'recipe_friedrice', name:'Fried Rice',             icon:'🍛',
    need:{ veg:2, bun:0, meat:1 }, loyalty:29, desc:'ข้าวผัดเนื้อ — โฮมเมด +29 ความผูกพัน' },
  { id:'recipe_spaghetti', name:'Spaghetti & Meatballs',  icon:'🍝',
    need:{ veg:2, bun:0, meat:2 }, loyalty:34, desc:'สปาเก็ตตี้ลูกชิ้น — โฮมเมด +34 ความผูกพัน' },
  { id:'recipe_stew',      name:'Hearty Stew',            icon:'🍲',
    need:{ veg:3, bun:0, meat:2 }, loyalty:38, desc:'สตูว์เนื้อ — โฮมเมด +38 ความผูกพัน (สูงสุด)' },
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


// ── HACK MINIGAME ──
// Two stages: a Fallout-style password crack, then a loot-and-raid.

// Tech-themed word bank for the password screen. Same-length words only
// (the game picks a length, then draws words of that length).
export const HACK_WORDS = {
  4: ['PORK','PINE','BYTE','CORE','DATA','ROOT','HACK','WORM','LOAD','PING',
      'GRID','NODE','LINK','CODE','DISK','BOOT','FORK','HASH','LOOP','VOID'],
  5: ['VIRUZ','LOGIN','CACHE','PROXY','SHELL','STACK','TRACE','DEBUG','CRASH',
      'PATCH','QUERY','TOKEN','FLASH','DRIVE','FROST','EMBER','GHOST','PIXEL'],
  6: ['PACKET','KERNEL','CIPHER','DAEMON','BUFFER','SOCKET','SCRIPT','BINARY',
      'MEMORY','THREAD','ROOTKT','MALWRE','FIREWL','SERVER','DECODE','ENCODE'],
};

// ASCII "junk" that fills the terminal between words.
export const HACK_JUNK = "!@#$%^&*()_+-={}[]|:;<>,.?/~`\\'\"";

// Difficulty scales the word count and word length with the target level.
export function hackDifficulty(targetLevel) {
  if (targetLevel >= 60) return { len: 6, words: 12, attempts: 4 };
  if (targetLevel >= 30) return { len: 5, words: 10, attempts: 4 };
  return { len: 4, words: 8, attempts: 4 };
}

// Likeness = number of positions where two equal-length words share the
// same letter. This is the Fallout hint mechanic.
export function wordLikeness(guess, answer) {
  let n = 0;
  for (let i = 0; i < answer.length; i++) if (guess[i] === answer[i]) n++;
  return n;
}

// ── LOOT + SUCCESS % ──
// Each lootable's success % becomes the combat outcome:
//   100% → auto-win (no fight)
//   below 100% → enemy stats ×(1 + (100-pct)/100 * 1.0) up to ~×1.9
// The % is driven by: base value of the loot (pricier = lower %),
// plus the level gap (you higher than target = easier).
export const HACK_LOOT_KINDS = [
  { id:'bitz_s', kind:'bitz', icon:'💰', baseAmt:400,  baseChance:70 },
  { id:'bitz_l', kind:'bitz', icon:'💰', baseAmt:1200, baseChance:45 },
  { id:'pot_hp', kind:'potion', potId:'pot_m', icon:'⚗️', baseAmt:1, baseChance:55 },
  { id:'pot_full', kind:'potion', potId:'pot_f', icon:'🍶', baseAmt:1, baseChance:35 },
  { id:'exp_boost', kind:'exp', icon:'⚡', baseAmt:600, baseChance:40 },
];

// Compute the actual steal menu for a given target, factoring level gap.
// hackerLv > targetLv raises %, the reverse lowers it. Never returns 0%.
// `tierMult` (from the rival's GUARD_TIERS.lootMult, see startRaidFight
// in game.js) rewards clearing a tougher security-guard gate with a
// bigger payout, independent of the target's own level/wealth.
export function buildLootMenu(targetLevel, hackerLevel, tierMult = 1) {
  const gap = hackerLevel - targetLevel;         // + = advantage
  const gapMod = Math.max(-30, Math.min(30, gap * 2));  // ±30 points
  // richer targets carry more, scaled by their level and guard tier
  const wealth = (1 + targetLevel / 40) * tierMult;
  return HACK_LOOT_KINDS.map(l => {
    let chance = l.baseChance + gapMod;
    chance = Math.max(5, Math.min(100, Math.round(chance)));  // never 0
    const amount = l.kind === 'bitz' || l.kind === 'exp'
      ? Math.floor(l.baseAmt * wealth)
      : l.baseAmt;
    return { ...l, chance, amount, targetLevel };
  });
}

// Success % → enemy stat multiplier for the raid fight.
//   100% → 0 (auto-win, no fight)   |   5% → ~1.9
export function chanceToEnemyMult(chance) {
  if (chance >= 100) return 0;               // auto-win
  return 1 + ((100 - chance) / 100) * 1.0;   // 1.0 .. ~1.95
}

// Penalty when you LOSE a raid you committed to.
export const RAID_LOSS_BITZ = 300;


// ── AILMENTS ──
// Applied by special skills. Each is stored on a unit as
// { id, turns, ...params } in unit.ailments[].
//
// POISON and FRENZY are STACKING ailments (see STACKING_AILMENT_IDS in
// engine.js): instead of `turns`, their instances carry a `stacks` count
// that ADDS UP across repeat applications (3 stacks + a fresh 3-stack
// cast = 6, not a refreshed 3) and never expires on a turn countdown —
// they last until the fight ends (or a cleanse). Their magnitude scales
// with the `perStack` table below × current stacks, applied generically
// by ailmentMods()/tickAilments() in engine.js.
export const AILMENTS = {
  poison: {
    id:'poison', name:'Poison', thai:'พิษ', icon:'☠️', color:'#7ddc4a',
    desc:'เสีย HP คงที่ทุกเทิร์นตามจำนวนสแตค ไม่หมดอายุจนจบไฟต์',
    perStack: { dmg: 5 },   // flat HP loss per stack per turn
  },
  freeze: {
    id:'freeze', name:'Freeze', thai:'แช่แข็ง', icon:'❄️', color:'#7fd6ff',
    desc:'โจมตีหรือใช้สกิลไม่ได้ — โดนตีซ้ำจะ SHATTER รับดาเมจ x1.2 และหลุดสถานะทันที',
  },
  frenzy: {
    id:'frenzy', name:'Frenzy', thai:'คลั่ง', icon:'🔥', color:'#ff6a2b',
    desc:'ATK/SPD เพิ่ม DEF ลด ตามจำนวนสแตค ไม่หมดอายุจนจบไฟต์',
    perStack: { atk: 0.12, def: -0.08, spd: 0.08 },
  },
  charm: {
    id:'charm', name:'Charmed', thai:'เสน่ห์', icon:'💗', color:'#ff6ab0',
    desc:'ทำทุกอย่างกลับตาลปัตร — โจมตีตัวเอง และสกิลบัฟ/ฮีลจะไปเข้าฝั่งศัตรูแทน',
  },
  // Stage-2 "Corrupted" mutation debuff. Generic multi-stat drain —
  // ailmentMods() applies atk/def/spd/eva/crit off ANY ailment object
  // that carries those keys, so this needs no special-case engine code.
  corrupt: {
    id:'corrupt', name:'Corrupted', thai:'เสื่อมสภาพ', icon:'🦠', color:'#a05fe0',
    desc:'ATK/DEF/SPD ของศัตรูลดลง',
  },
  // Hard stun — unlike freeze, taking damage never breaks it early and
  // it grants no bonus damage; it just runs its full `turns` count down.
  // Rendered as a large overlay above the sprite (see .stoned-overlay in
  // index.html) rather than just a small corner badge, since it's meant
  // to read as a bigger deal than a normal ailment icon. Placeholder
  // emoji until a real gif is dropped in at assets/fx/stoned.gif (see
  // the CSS rule right next to .stoned-overlay for the one-line swap).
  stoned: {
    id:'stoned', name:'Stoned', thai:'กลายเป็นหิน', icon:'🗿', color:'#9c8a6e',
    desc:'ขยับไม่ได้แม้จะโดนโจมตี ไม่หลุดก่อนเวลา',
  },
  // Self-buff granted by w_failsafe. Persists (no turns countdown) until
  // consumed — see the "Last Stand" check in applyDamage() (game.js):
  // the instant this unit's HP first dips below 40% of max, the token is
  // consumed and HP is restored to full, once.
  lastStand: {
    id:'lastStand', name:'Last Stand', thai:'ยืนหยัดครั้งสุดท้าย', icon:'🛟', color:'#4ade80',
    desc:'เมื่อ HP ต่ำกว่า 40% ครั้งแรก จะฟื้นเต็ม HP ทันที (ใช้ได้ครั้งเดียว)',
  },
};
// Ailments that stack (add up) instead of just refreshing duration, and
// never expire on their own — see addAilment()/tickAilments() in
// engine.js. lastStand also persists without a turns countdown but
// isn't a "stack" (it's a single consume-once flag), so it's tracked
// separately in tickAilments() rather than listed here.
export const STACKING_AILMENT_IDS = ['poison', 'frenzy'];

// ── STAT KEYS ──
// atk  — attack power
// def  — damage reduction
// crit — critical CHANCE (%); crits deal 2x
// eva  — evasion chance (%)
// spd  — drives the speed counter (extra actions)
// int  — max MP (skill fuel)
// vit  — max HP
export const STAT_KEYS = ['atk','def','crit','eva','spd','int','vit'];
export const STAT_META = {
  atk:  { name:'ATK',  icon:'⚔️', thai:'พลังโจมตี' },
  def:  { name:'DEF',  icon:'🛡️', thai:'พลังป้องกัน' },
  crit: { name:'CRIT', icon:'💥', thai:'โอกาสคริติคอล (x2)' },
  eva:  { name:'EVA',  icon:'💨', thai:'โอกาสหลบ' },
  spd:  { name:'SPD',  icon:'⚡', thai:'ความเร็ว (ตัวนับโจมตีซ้ำ)' },
  int:  { name:'INT',  icon:'🔮', thai:'พลังเวท (MP สูงสุด)' },
  vit:  { name:'VIT',  icon:'❤️', thai:'พลังชีวิต (HP สูงสุด)' },
};

// ── SYNCHRONIZE ──
// Sacrificing 2 same-rarity, fully-leveled pets fuses them into 1 new
// pet at the next rarity tier — a shortcut past the RNG of hatching a
// rare egg, at the cost of two already-invested pets. Rolled once per
// successful synchronize and stamped onto the resulting pet (see
// synchronizePets() in engine.js) — a small permanent stat percentage,
// on top of (not instead of) everything else that rarity/level/gear
// already grant.
export const SYNC_BONUSES = [
  { stat:'atk',  pct:0.10, name:'ระบบโจมตีเสริม' },
  { stat:'def',  pct:0.10, name:'เกราะเสริม' },
  { stat:'spd',  pct:0.10, name:'วงจรเร่งความเร็ว' },
  { stat:'crit', pct:0.15, name:'โปรเซสเซอร์คริติคอล' },
  { stat:'eva',  pct:0.15, name:'ระบบพรางตัว' },
];

// ── EQUIPMENT ──
// 3 slots per pet, named after the real components of a computer
// virus. Each slot has a flavor bias (which stats it rolls more
// often) but isn't hard-restricted to them, so builds stay varied.
export const EQUIP_SLOTS = {
  payload: { id:'payload', name:'Payload', icon:'💣', thai:'เพย์โหลด',
    desc:'ชุดคำสั่งทำลาย — เน้นโจมตี', bias:['atk','crit'] },
  exploit: { id:'exploit', name:'Exploit', icon:'🧬', thai:'ช่องโหว่',
    desc:'ช่องโหว่เจาะระบบ — เน้นความเร็ว', bias:['spd','crit','eva'] },
  rootkit: { id:'rootkit', name:'Rootkit', icon:'🗝️', thai:'รูทคิต',
    desc:'ฝังตัวลึกในระบบ — เน้นป้องกัน/พลังชีวิต', bias:['def','vit'] },
  // Deliberately NOT in EQUIP_SLOT_KEYS — that list drives rollEquipment()'s
  // random slot pick for ordinary stat gear, and a habit card is a
  // completely separate drop (rollHabitCard(), low rate, named after and
  // shaped by the specific enemy it fell from — see HABIT_CARDS above).
  // Rendered as a 4th slot alongside the other three via ALL_EQUIP_SLOT_KEYS.
  habit: { id:'habit', name:'Habit', icon: HABIT_CARD_ICON.icon, thai:'นิสัย',
    desc:'การ์ดข้อมูลจากศัตรู — ให้สี+ประเภท+พาสซีฟพิเศษ', bias:[] },
};
export const EQUIP_SLOT_KEYS = ['payload', 'exploit', 'rootkit'];
export const ALL_EQUIP_SLOT_KEYS = ['payload', 'exploit', 'rootkit', 'habit'];

// Grade ladder — same shape as RARITY (color/glow for UI chrome),
// plus statMult (roll strength), dust (disenchant yield), and weight
// (relative drop odds).
export const EQUIP_GRADES = {
  script:      { id:'script',      name:'Script Kiddie', thai:'สคริปต์มือใหม่',    color:'#9aa4b8', glow:'rgba(154,164,184,.3)',  statMult:1.0, dust:2,  weight:100 },
  trojan:      { id:'trojan',      name:'Trojan',        thai:'โทรจัน',            color:'#4fc3f7', glow:'rgba(79,195,247,.4)',   statMult:1.4, dust:5,  weight:55  },
  polymorphic: { id:'polymorphic', name:'Polymorphic',   thai:'โพลีมอร์ฟิก',       color:'#ce93d8', glow:'rgba(206,147,216,.45)', statMult:1.9, dust:12, weight:25  },
  zeroday:     { id:'zeroday',     name:'Zero-Day',      thai:'ซีโร่เดย์',         color:'#ffd54a', glow:'rgba(255,213,74,.5)',   statMult:2.5, dust:26, weight:9   },
  apt:         { id:'apt',         name:'A.P.T.',        thai:'ภัยคุกคามขั้นสูง',  color:'#ff5470', glow:'rgba(255,84,112,.55)',  statMult:3.3, dust:55, weight:2   },
};
export const EQUIP_GRADE_KEYS = ['script', 'trojan', 'polymorphic', 'zeroday', 'apt'];

// Payload special effects. Payload gear never rolls stats — it rolls
// ONE of these instead. Unlike the old system, these are NOT gated by
// the wearer's attribute — level requirement is the only gate now.
// Exploit and Rootkit stay pure stat-boost slots (see EQUIP_STAT_BASE
// below); this is what distinguishes Payload from the other two.
export const PAYLOAD_EFFECTS = {
  leech:     { id:'leech',     name:'Data Leech',      icon:'🩸',
    desc:'ฟื้น HP ตามเปอร์เซ็นต์ดาเมจที่สร้างทุกครั้งที่โจมตี',
    mag:[0.08, 0.12, 0.16, 0.22, 0.30] },
  manaregen: { id:'manaregen', name:'Kill Reboot',     icon:'🔌',
    desc:'ฟื้น MP ทันทีเมื่อโจมตีสังหารศัตรู',
    mag:[0.20, 0.30, 0.40, 0.55, 0.75] },
  overclock: { id:'overclock', name:'Overclock',       icon:'⚔️',
    desc:'โจมตีแรกของการต่อสู้ คริติคอลเสมอ',
    mag:[0, 0, 0, 0, 0] },
  adaptive:  { id:'adaptive',  name:'Adaptive Strike', icon:'🌪️',
    desc:'โจมตีแรกของการต่อสู้ ตีซ้ำ 2 ครั้งเสมอ',
    mag:[0, 0, 0, 0, 0] },
  toxin:     { id:'toxin',     name:'Toxin Injector',  icon:'☠️',
    desc:'มีโอกาสวางพิษให้ศัตรูเมื่อโจมตีติด',
    mag:[0.10, 0.15, 0.20, 0.28, 0.38] },
};
export const PAYLOAD_EFFECT_KEYS = ['leech', 'manaregen', 'overclock', 'adaptive', 'toxin'];

const EQUIP_NAME_PARTS = {
  payload: ['Warhead', 'Detonator', 'Strikecode', 'Bombshell'],
  exploit: ['Backdoor', 'Injector', 'Skeleton Key', 'Zero-Click'],
  rootkit: ['Cloak', 'Anchor', 'Deepshell', 'Firmware'],
};

// Base per-level roll strength for each rollable stat. `int` is left
// out — equipment boosts combat power, not MP pool. Only Exploit and
// Rootkit ever roll these now — see rollEquipment().
const EQUIP_STAT_BASE = { atk:0.9, def:0.7, spd:0.6, crit:0.7, eva:0.5, vit:3.2 };
const EQUIP_ROLLABLE_STATS = Object.keys(EQUIP_STAT_BASE);

// Chance an enemy drops equipment on death (checked once per kill).
export const EQUIP_DROP_CHANCE = 0.32;

function rollWeighted(weights) {
  const keys = Object.keys(weights);
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = Math.random() * total;
  for (const k of keys) {
    if (r < weights[k]) return k;
    r -= weights[k];
  }
  return keys[0];
}

// Generates one equipment instance. `maxLevel` caps the level
// requirement (e.g. the dropping enemy's level, or the player's
// highest pet level for crafting) — equipment never asks for more
// than that. `forcedGradeId` lets crafting skew the grade roll.
// Any pet of any attribute can equip anything — level requirement is
// the only gate.
// Generated pixel-art icons for equipment. Payload is keyed by
// EFFECT (its art identifies what it does — grade shows as a colored
// frame in the UI instead, since any effect can roll any grade).
// Exploit/Rootkit are keyed by GRADE instead, since those slots are
// pure stat power that scales with grade. Multiple variants per key
// are fine — a random one is picked per roll so repeated drops of
// the same effect/grade don't all look identical.
export const EQUIP_ICONS = {
  payload: {
    leech:     ['assets/equipment/payload/leech_1.png'],
    manaregen: ['assets/equipment/payload/manaregen_1.png'],
    overclock: ['assets/equipment/payload/overclock_1.png'],
    adaptive:  ['assets/equipment/payload/adaptive_1.png', 'assets/equipment/payload/adaptive_2.png'],
    toxin:     ['assets/equipment/payload/toxin_1.png', 'assets/equipment/payload/toxin_2.png', 'assets/equipment/payload/toxin_3.png'],
  },
  exploit: {
    script:      ['assets/equipment/exploit/script_1.png'],
    trojan:      ['assets/equipment/exploit/trojan_1.png', 'assets/equipment/exploit/trojan_2.png'],
    polymorphic: ['assets/equipment/exploit/polymorphic_1.png'],
    zeroday:     ['assets/equipment/exploit/zeroday_1.png'],
    apt:         ['assets/equipment/exploit/apt_1.png', 'assets/equipment/exploit/apt_2.png'],
  },
  rootkit: {
    script:      ['assets/equipment/rootkit/script_1.png'],
    trojan:      ['assets/equipment/rootkit/trojan_1.png', 'assets/equipment/rootkit/trojan_2.png'],
    polymorphic: ['assets/equipment/rootkit/polymorphic_1.png', 'assets/equipment/rootkit/polymorphic_2.png'],
    zeroday:     ['assets/equipment/rootkit/zeroday_1.png'],
    apt:         ['assets/equipment/rootkit/apt_1.png'],
  },
};
function pickEquipIcon(slotId, effectId, gradeId) {
  const key = slotId === 'payload' ? effectId : gradeId;
  const variants = (EQUIP_ICONS[slotId] || {})[key];
  if (!variants || !variants.length) return null;
  return variants[Math.floor(Math.random() * variants.length)];
}

// For items saved before the icon system existed. Only ever ADDS an
// icon — never touches stats/effectId/grade, so it can't change what
// an existing item actually does. A legacy Payload item that predates
// the effects rework (stats instead of effectId) has no valid key to
// look up an icon for and is left exactly as it was; Exploit/Rootkit
// items always have a grade, so those backfill cleanly every time.
export function backfillEquipIcon(item) {
  if (!item || item.icon) return item;
  const icon = pickEquipIcon(item.slotId, item.effectId, item.grade);
  if (icon) item.icon = icon;
  return item;
}

export function rollEquipment(maxLevel, forcedGradeId) {
  maxLevel = Math.max(1, Math.floor(maxLevel || 1));
  const slotId = EQUIP_SLOT_KEYS[Math.floor(Math.random() * EQUIP_SLOT_KEYS.length)];
  const slot = EQUIP_SLOTS[slotId];
  const gradeId = forcedGradeId || rollWeighted(
    EQUIP_GRADE_KEYS.reduce((w, k) => { w[k] = EQUIP_GRADES[k].weight; return w; }, {}));
  const grade = EQUIP_GRADES[gradeId];
  const lvlReq = 1 + Math.floor(Math.random() * maxLevel);

  let stats = {};
  let effectId = null;
  let name;

  if (slotId === 'payload') {
    effectId = PAYLOAD_EFFECT_KEYS[Math.floor(Math.random() * PAYLOAD_EFFECT_KEYS.length)];
    name = `${grade.name} ${PAYLOAD_EFFECTS[effectId].name}`;
  } else {
    const useBias = Math.random() < 0.7 && slot.bias.length >= 2;
    const pool = useBias ? slot.bias : EQUIP_ROLLABLE_STATS;
    const statCount = Math.min(pool.length, 2 + (Math.random() < 0.35 ? 1 : 0));
    const chosen = [];
    while (chosen.length < statCount) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      if (!chosen.includes(k)) chosen.push(k);
    }
    chosen.forEach(k => {
      const base = EQUIP_STAT_BASE[k] || 1;
      stats[k] = Math.max(1, Math.round(base * lvlReq * grade.statMult * (0.85 + Math.random() * 0.3)));
    });
    const namePart = EQUIP_NAME_PARTS[slotId][Math.floor(Math.random() * EQUIP_NAME_PARTS[slotId].length)];
    name = `${grade.name} ${namePart}`;
  }

  return {
    uid: 'eq_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    slotId, grade: gradeId, lvlReq, stats, effectId, name,
    icon: pickEquipIcon(slotId, effectId, gradeId),
  };
}

// Disenchanting an item yields Dust (crafting currency); its grade
// sets the yield. Selling yields Bitz instead, scaled by grade+level.
export function dustValueOf(item) {
  return (EQUIP_GRADES[item.grade] || EQUIP_GRADES.script).dust;
}
export function sellValueOf(item) {
  const g = EQUIP_GRADES[item.grade] || EQUIP_GRADES.script;
  return Math.round(g.dust * 18 * (1 + item.lvlReq * 0.08));
}

// Crafting: spend Dust on one of a few fixed recipes, each biasing
// the grade roll upward. Slot/stats/level/affix still roll randomly
// via rollEquipment — crafting buys better ODDS, not a guaranteed tier.
export const CRAFT_RECIPES = [
  { id:'quick',    name:'Quick Craft',    icon:'🔧', dust:10, weights:{ script:70, trojan:25, polymorphic:5,  zeroday:0,  apt:0 } },
  { id:'standard', name:'Standard Craft', icon:'⚙️', dust:30, weights:{ script:35, trojan:40, polymorphic:20, zeroday:5,  apt:0 } },
  { id:'deep',     name:'Deep Craft',     icon:'🛠️', dust:80, weights:{ script:10, trojan:25, polymorphic:35, zeroday:25, apt:5 } },
];
export function craftEquipment(recipeId, maxLevel) {
  const recipe = CRAFT_RECIPES.find(r => r.id === recipeId) || CRAFT_RECIPES[0];
  const gradeId = rollWeighted(recipe.weights);
  return rollEquipment(maxLevel, gradeId);
}

// ── SPEED COUNTER ──
// Each turn a unit accrues speed points based on the SPD gap with its
// opponent. Equal speed (even if both high) accrues 0. When the counter
// reaches >= 1 the unit acts TWICE that turn, then the counter resets.
export const SPEED_GAP_DIVISOR = 45;   // larger = slower accrual
export function speedGain(mySpd, foeSpd) {
  const gap = mySpd - foeSpd;
  if (gap <= 0) return 0;
  return gap / SPEED_GAP_DIVISOR;
}


// ── SKILL TREES ──
// One fixed tree per attribute. Each node is either a STAT node (+n to a
// stat, up to `max` ranks) or a SKILL node (unlocks an active special).
// `req` lists node ids that must be maxed/unlocked first — you cannot
// take a node until its parents are done.
//
// Layout: x/y are polar-ish coordinates in a 0-100 box used by the UI
// to draw the tree with connecting branches.
//
// Skills unlock from level 5 upward; the deeper the node, the stronger.
// Rarer pets get better skills via SKILL_TIER_BONUS below.

function statNode(id, stat, per, max, x, y, req, lv) {
  return { id, kind:'stat', stat, per, max, x, y, req: req||[], reqLv: lv||1 };
}
function skillNode(id, skill, x, y, req, lv) {
  return { id, kind:'skill', skill, max:1, x, y, req: req||[], reqLv: lv||5 };
}

// ══ SPECIAL SKILLS ══
// mp   — cost
// pw   — damage multiplier vs a normal hit (1 = normal)
// hits — number of strikes
// vfx  — which effect to play
// heal / shield / ailment / buff — non-damage payloads
export const SPECIALS = {
  // ── RED: raw damage ──
  r_slash:    { id:'r_slash',    name:'Ember Slash',    thai:'ฟันเพลิง',     mp:10, cd:3.5,  pw:1.4, hits:1, vfx:'fire',   desc:'ฟันไฟ x1.4' },
  r_double:   { id:'r_double',   name:'Twin Fang',      thai:'เขี้ยวคู่',     mp:13, cd:3.7,  pw:0.9, hits:2, vfx:'slash',  desc:'โจมตี 2 ครั้ง' },
  r_burn:     { id:'r_burn',     name:'Cinder Touch',   thai:'สัมผัสเถ้า',   mp:14, cd:3.4, pw:1.1, hits:1, vfx:'fire',   ailment:{ id:'poison', stacks:3 }, desc:'ติดพิษ 3 สแตค (สะสมได้ ไม่หมดอายุ)' },
  r_frenzy:   { id:'r_frenzy',   name:'Blood Rage',     thai:'คลั่งเลือด',   mp:17, cd:3.8, pw:0,   hits:0, vfx:'aura',   buffSelf:{ id:'frenzy', stacks:3 }, desc:'คลั่ง 3 สแตค (ATK/SPD ขึ้น DEF ลง สะสมได้)' },
  r_pierce:   { id:'r_pierce',   name:'Kernel Pierce',  thai:'เจาะเคอร์เนล', mp:20, cd:3.7, pw:1.8, hits:1, vfx:'pierce', ignoreDef:0.5, desc:'เจาะเกราะ 50% x1.8' },
  r_triple:   { id:'r_triple',   name:'Triple Fang',    thai:'สามเขี้ยว',    mp:23, cd:4.0, pw:0.85,hits:3, vfx:'slash',  desc:'โจมตี 3 ครั้ง' },
  r_meteor:   { id:'r_meteor',   name:'Meteor Byte',    thai:'อุกกาบาต',     mp:29, cd:3.9, pw:2.4, hits:1, vfx:'meteor', desc:'ระเบิดใหญ่ x2.4' },
  r_phoenix:  { id:'r_phoenix',  name:'Phoenix Dance',  thai:'ระบำหงส์ไฟ',   mp:35, cd:4.5, pw:2.0, hits:2, vfx:'phoenix',desc:'ท่าไม้ตาย x2 สองครั้ง' },
  r_ragnarok: { id:'r_ragnarok', name:'Ragnarok Core',  thai:'แกนรักนาร็อค', mp:46, cd:4.2, pw:3.2, hits:1, vfx:'meteor', ignoreDef:0.35, desc:'ทำลายล้าง x3.2' },

  // ── GREEN: speed, evasion, multi-hit ──
  g_dash:     { id:'g_dash',     name:'Static Dash',    thai:'พุ่งไฟฟ้า',    mp:10, cd:3.5,  pw:1.3, hits:1, vfx:'wind',   desc:'พุ่งเร็ว x1.3' },
  g_gust:     { id:'g_gust',     name:'Gust Cutter',    thai:'ใบมีดลม',      mp:13, cd:3.6,  pw:0.8, hits:2, vfx:'wind',   desc:'ลมคม 2 ครั้ง' },
  g_blur:     { id:'g_blur',     name:'Blur Step',      thai:'ก้าวเลือน',    mp:14, cd:3.6, pw:0,   hits:0, vfx:'aura',   buffSelf:{ id:'frenzy', stacks:2 }, desc:'คลั่ง 2 สแตค (ATK/SPD ขึ้น DEF ลง สะสมได้)' },
  g_venom:    { id:'g_venom',    name:'Venom Spray',    thai:'พ่นพิษ',       mp:16, cd:3.4, pw:1.0, hits:1, vfx:'poison', ailment:{ id:'poison', stacks:4 }, desc:'ติดพิษ 4 สแตค (สะสมได้ ไม่หมดอายุ)' },
  g_flurry:   { id:'g_flurry',   name:'Wind Flurry',    thai:'พายุหมุน',     mp:20, cd:3.9, pw:0.75,hits:3, vfx:'wind',   desc:'โจมตี 3 ครั้ง' },
  g_cyclone:  { id:'g_cyclone',  name:'Cyclone Rip',    thai:'ไซโคลน',       mp:26, cd:4.2, pw:0.8, hits:4, vfx:'wind',   desc:'โจมตี 4 ครั้ง' },
  g_charm:    { id:'g_charm',    name:'Siren Pulse',    thai:'คลื่นเสน่ห์',  mp:29, cd:4.3, pw:0,   hits:0, vfx:'charm',  ailment:{ id:'charm', turns:2 }, desc:'สะกดศัตรู 2 เทิร์น' },
  g_tempest:  { id:'g_tempest',  name:'Tempest Storm',  thai:'พายุคลั่ง',    mp:38, cd:4.7, pw:0.9, hits:5, vfx:'wind',   desc:'โจมตี 5 ครั้ง' },

  // ── YELLOW: defense, control ──
  y_bash:     { id:'y_bash',     name:'Bulwark Bash',   thai:'ทุบโล่',       mp:11, cd:3.5,  pw:1.35,hits:1, vfx:'impact', desc:'ทุบหนัก x1.35' },
  y_guard:    { id:'y_guard',    name:'Iron Guard',     thai:'เกราะเหล็ก',   mp:13, cd:3.5,  pw:0,   hits:0, vfx:'shield', shieldSelf:0.35, desc:'ลดดาเมจ 35% 3 เทิร์น' },
  y_frost:    { id:'y_frost',    name:'Frost Lock',     thai:'ล็อคน้ำแข็ง',  mp:19, cd:3.3, pw:0.9, hits:1, vfx:'ice',    ailment:{ id:'freeze', turns:1 }, desc:'แช่แข็ง 1 เทิร์น' },
  y_quake:    { id:'y_quake',    name:'Fault Quake',    thai:'แผ่นดินไหว',   mp:22, cd:3.7, pw:1.7, hits:1, vfx:'impact', desc:'สั่นสะเทือน x1.7' },
  y_fortress: { id:'y_fortress', name:'Fortress Mode',  thai:'โหมดป้อม',     mp:26, cd:4.2, pw:0,   hits:0, vfx:'shield', shieldSelf:0.55, desc:'ลดดาเมจ 55% 3 เทิร์น' },
  y_glacier:  { id:'y_glacier',  name:'Glacier Prison', thai:'คุกน้ำแข็ง',   mp:32, cd:3.5, pw:1.2, hits:1, vfx:'ice',    ailment:{ id:'freeze', turns:2 }, desc:'แช่แข็ง 2 เทิร์น' },
  y_bastion:  { id:'y_bastion',  name:'Bastion Crush',  thai:'ป้อมบดขยี้',   mp:41, cd:4.0, pw:2.6, hits:1, vfx:'impact', ignoreDef:0.3, desc:'บดขยี้ x2.6' },
  // A harder disable than Frost Lock/Glacier Prison: doesn't shatter or
  // grant bonus damage when hit, and runs its full duration no matter
  // what happens to the target meanwhile — see the 'stoned' ailment
  // entry above and its skip-turn handling in runTurn() (game.js).
  y_petrify: { id:'y_petrify', name:'Petrify Command', thai:'คำสั่งกลายหิน', mp:36, cd:4.6, pw:0, hits:0, vfx:'impact', ailment:{ id:'stoned', turns:2 }, desc:'กลายเป็นหิน 2 เทิร์น (ไม่หลุดแม้โดนโจมตี)' },

  // ── WHITE: support / heal ──
  w_mend:     { id:'w_mend',     name:'Patch Mend',     thai:'ปะแผล',        mp:11, cd:3.4,  pw:0, hits:0, vfx:'heal',  heal:0.25, desc:'ฟื้น HP 25% ตัวเอง' },
  w_cleanse:  { id:'w_cleanse',  name:'Purge Protocol', thai:'ล้างสถานะ',    mp:13, cd:3.6,  pw:0, hits:0, vfx:'heal',  cleanse:true, desc:'ล้างสถานะผิดปกติ' },
  w_ward:     { id:'w_ward',     name:'Aegis Ward',     thai:'พรเกราะ',      mp:16, cd:3.7, pw:0, hits:0, vfx:'shield',shieldSelf:0.3, desc:'ลดดาเมจ 30% 3 เทิร์น' },
  w_bless:    { id:'w_bless',    name:'Data Bless',     thai:'พรข้อมูล',     mp:19, cd:3.8, pw:0, hits:0, vfx:'bless', buffTeam:{ turns:4, atk:0.2, def:0.2 }, desc:'ทีม ATK/DEF +20%' },
  w_healall:  { id:'w_healall',  name:'Radiant Cascade',thai:'สายธารแสง',    mp:26, cd:4.2, pw:0, hits:0, vfx:'heal',  healTeam:0.35, desc:'ฟื้น HP 35% ทั้งทีม' },
  w_smite:    { id:'w_smite',    name:'Judgment Ray',   thai:'ลำแสงตัดสิน',  mp:23, cd:3.7, pw:1.9, hits:1, vfx:'holy', desc:'ลำแสงศักดิ์สิทธิ์ x1.9' },
  w_revive:   { id:'w_revive',   name:'System Restore', thai:'กู้ระบบ',      mp:44, cd:4.9, pw:0, hits:0, vfx:'bless', reviveTeam:0.5, desc:'ชุบชีวิตเพื่อนที่ล้ม 50% HP' },
  w_sanctuary:{ id:'w_sanctuary',name:'Sanctuary',      thai:'วิหารศักดิ์สิทธิ์',mp:38, cd:4.7,pw:0,hits:0,vfx:'bless', healTeam:0.5, buffTeam:{ turns:3, def:0.3 }, desc:'ฟื้น 50% + DEF+30%' },
  // Doesn't act like Pokémon's "target lowest-HP ally" — this is 1v1,
  // one fighter on stage at a time, so instead it's a condition attached
  // to the CASTER: arm it once, and the instant your own HP first dips
  // below 40%, it silently consumes itself and heals you to full — a
  // one-shot safety net rather than a per-turn AI decision.
  w_failsafe: { id:'w_failsafe', name:'Failsafe Protocol', thai:'โพรโทคอลฉุกเฉิน', mp:24, cd:5.5, pw:0, hits:0, vfx:'shield', buffSelf:{ id:'lastStand' }, desc:'ตั้งระบบฉุกเฉิน — HP ต่ำกว่า 40% ครั้งแรกจะฟื้นเต็มทันที (ครั้งเดียว)' },

  // ── STAGE-2 MUTATIONS ──
  // Unlocked only once a pet reaches stage 2 and rolls a mutation
  // (see evolve() in engine.js). A second, smaller skill tree layered
  // on top of the attribute tree — reuses the exact same payload keys
  // (ailment / buffSelf / shieldSelf / heal) so no new application
  // logic is needed in game.js's cast-resolution code.

  // OVERCLOCK: speed + freeze (system lockup)
  oc_surge:       { id:'oc_surge',       name:'Clock Surge',     thai:'เร่งรอบ',        mp:12, cd:3.5, pw:0,   hits:0, vfx:'wind', buffSelf:{ id:'overclock_surge', turns:3, spd:0.45, atk:0.15, def:-0.10 }, desc:'SPD+45% ATK+15% DEF-10% 3 เทิร์น' },
  oc_lockup:      { id:'oc_lockup',      name:'System Lockup',   thai:'ระบบค้าง',       mp:18, cd:3.6, pw:1.0, hits:1, vfx:'ice',  ailment:{ id:'freeze', turns:1 }, desc:'x1.0 + แช่แข็งศัตรู 1 เทิร์น' },
  oc_shortcircuit:{ id:'oc_shortcircuit',name:'Short Circuit',   thai:'ลัดวงจร',        mp:27, cd:3.9, pw:1.3, hits:1, vfx:'ice',  ailment:{ id:'freeze', turns:2 }, desc:'x1.3 + แช่แข็งศัตรู 2 เทิร์น' },
  oc_singularity: { id:'oc_singularity', name:'Clock Singularity',thai:'ภาวะเร่งสุดขีด', mp:40, cd:4.4, pw:1.0, hits:3, vfx:'wind', ailment:{ id:'freeze', turns:1 }, desc:'โจมตี 3 ครั้ง + แช่แข็ง' },

  // BULWARK: heavy hitting + endurance
  bw_slam:        { id:'bw_slam',        name:'Bulwark Slam',    thai:'ทุบเกราะ',       mp:12, cd:3.6, pw:1.5, hits:1, vfx:'impact', ignoreDef:0.15, desc:'x1.5 เจาะเกราะ 15%' },
  bw_bracing:     { id:'bw_bracing',     name:'Brace Protocol',  thai:'ตั้งรับ',        mp:15, cd:3.7, pw:0,   hits:0, vfx:'shield',  shieldSelf:0.40, heal:0.15, desc:'ลดดาเมจ 40% + ฟื้น HP 15%' },
  bw_juggernaut:  { id:'bw_juggernaut',  name:'Juggernaut Charge',thai:'พุ่งชนมหึมา',   mp:26, cd:4.0, pw:1.9, hits:1, vfx:'impact', ignoreDef:0.35, desc:'x1.9 เจาะเกราะ 35%' },
  bw_unbreakable: { id:'bw_unbreakable', name:'Unbreakable Core',thai:'แกนทำลายไม่ได้', mp:42, cd:4.6, pw:2.4, hits:1, vfx:'impact', shieldSelf:0.5, ignoreDef:0.25, desc:'x2.4 + เกราะ 50%' },

  // PHANTOM: evasion
  ph_veil:        { id:'ph_veil',        name:'Phantom Veil',    thai:'ม่านเงา',        mp:12, cd:3.5, pw:0,   hits:0, vfx:'aura', buffSelf:{ id:'phantom_veil', turns:3, eva:0.50, spd:0.20 }, desc:'EVA+50% SPD+20% 3 เทิร์น' },
  ph_shadowstep:  { id:'ph_shadowstep',  name:'Shadowstep',      thai:'ก้าวเงา',        mp:17, cd:3.6, pw:1.1, hits:2, vfx:'wind', buffSelf:{ id:'phantom_veil', turns:2, eva:0.25 }, desc:'จู่โจม 2 ครั้ง + EVA+25%' },
  ph_mirage:      { id:'ph_mirage',      name:'Mirage Flicker',  thai:'ภาพลวงตา',       mp:25, cd:3.9, pw:0.85,hits:3, vfx:'wind', buffSelf:{ id:'phantom_veil', turns:2, eva:0.35 }, desc:'โจมตี 3 ครั้ง + EVA+35%' },
  ph_voidwalk:    { id:'ph_voidwalk',    name:'Voidwalk',        thai:'เดินทะลุมิติ',   mp:39, cd:4.5, pw:2.6, hits:1, vfx:'pierce', buffSelf:{ id:'phantom_veil', turns:3, eva:0.60 }, desc:'x2.6 + EVA+60% 3 เทิร์น' },

  // CORRUPTED: debuff
  cp_decay:       { id:'cp_decay',       name:'Data Decay',      thai:'ข้อมูลเสื่อม',   mp:13, cd:3.6, pw:0.9, hits:1, vfx:'poison', ailment:{ id:'corrupt', turns:3, atk:-0.20, def:-0.15 }, desc:'x0.9 + ATK-20% DEF-15% ศัตรู' },
  cp_corruptstrike:{ id:'cp_corruptstrike',name:'Corrupt Strike', thai:'จู่โจมเสื่อม',   mp:19, cd:3.8, pw:1.2, hits:1, vfx:'poison', ailment:{ id:'corrupt', turns:3, atk:-0.25, spd:-0.20 }, desc:'x1.2 + ATK-25% SPD-20% ศัตรู' },
  cp_plague:      { id:'cp_plague',      name:'Plague Protocol', thai:'ไวรัสระบาด',     mp:28, cd:4.1, pw:1.3, hits:1, vfx:'poison', ailment:{ id:'corrupt', turns:4, atk:-0.25, def:-0.20, spd:-0.20 }, desc:'x1.3 + ATK/DEF/SPD-20~25% 4 เทิร์น' },
  cp_oblivion:    { id:'cp_oblivion',    name:'Oblivion Protocol',thai:'ล่มระบบสมบูรณ์', mp:44, cd:4.8, pw:1.8, hits:1, vfx:'meteor', ailment:{ id:'corrupt', turns:4, atk:-0.35, def:-0.30, spd:-0.25 }, desc:'x1.8 + ลดสถานะระบบสมบูรณ์ 4 เทิร์น' },

  // ── MONSTER-ONLY (granted natively via ANTIVIRUZ.specials, not the
  // skill tree — see spawnAntiviruz() in engine.js) ──
  mesmerise: { id:'mesmerise', name:'Mesmerise', thai:'สะกดจิต', mp:0, cd:6, pw:0, hits:0,
    vfx:'charm', ailment:{ id:'charm', turns:3 }, ailmentChance:0.30,
    desc:'มีโอกาส 30% สะกดให้ VIRUZ หลงเสน่ห์ 3 เทิร์น' },
};

// Rarer pets unlock a bonus tier of skills at the deep nodes.
export const SKILL_TIER_BONUS = {
  normal:    0,
  rare:      1,
  epic:      2,
  legendary: 3,
  mythic:    4,
};

export const SKILL_TREES = {
  red: {
    name:'Inferno Path', thai:'สายเพลิง', color:'#ff6a2b',
    nodes: [
      statNode ('r1', 'atk',  2, 5, 50, 88, [],            1),
      statNode ('r2', 'crit', 2, 5, 34, 74, ['r1'],        2),
      skillNode('r3', 'r_slash',       66, 74, ['r1'],     5),
      statNode ('r4', 'atk',  3, 5, 22, 60, ['r2'],        6),
      skillNode('r5', 'r_double',      50, 60, ['r2','r3'],8),
      statNode ('r6', 'crit', 3, 5, 78, 60, ['r3'],        8),
      skillNode('r7', 'r_burn',        14, 46, ['r4'],    12),
      statNode ('r8', 'atk',  4, 5, 36, 44, ['r5'],       14),
      skillNode('r9', 'r_frenzy',      64, 44, ['r5','r6'],16),
      statNode ('r10','vit',  4, 5, 86, 46, ['r6'],       16),
      skillNode('r11','r_pierce',      22, 30, ['r7','r8'],20),
      skillNode('r12','r_triple',      50, 28, ['r8','r9'],24),
      statNode ('r13','crit', 4, 5, 78, 30, ['r9','r10'], 24),
      skillNode('r14','r_meteor',      34, 16, ['r11','r12'],30),
      skillNode('r15','r_phoenix',     66, 16, ['r12','r13'],36),
      skillNode('r16','r_ragnarok',    50,  4, ['r14','r15'],45),
    ],
  },
  green: {
    name:'Gale Path', thai:'สายพายุ', color:'#3ddc84',
    nodes: [
      statNode ('g1', 'spd',  2, 5, 50, 88, [],            1),
      statNode ('g2', 'eva',  2, 5, 34, 74, ['g1'],        2),
      skillNode('g3', 'g_dash',        66, 74, ['g1'],     5),
      statNode ('g4', 'spd',  3, 5, 22, 60, ['g2'],        6),
      skillNode('g5', 'g_gust',        50, 60, ['g2','g3'],8),
      statNode ('g6', 'eva',  3, 5, 78, 60, ['g3'],        8),
      skillNode('g7', 'g_blur',        14, 46, ['g4'],    12),
      statNode ('g8', 'spd',  4, 5, 36, 44, ['g5'],       14),
      skillNode('g9', 'g_venom',       64, 44, ['g5','g6'],16),
      statNode ('g10','crit', 3, 5, 86, 46, ['g6'],       16),
      skillNode('g11','g_flurry',      22, 30, ['g7','g8'],20),
      statNode ('g12','eva',  4, 5, 50, 28, ['g8','g9'],  24),
      skillNode('g13','g_cyclone',     78, 30, ['g9','g10'],24),
      skillNode('g14','g_charm',       34, 16, ['g11','g12'],30),
      skillNode('g15','g_tempest',     66, 16, ['g12','g13'],38),
      statNode ('g16','spd',  6, 5, 50,  4, ['g14','g15'],45),
    ],
  },
  yellow: {
    name:'Bastion Path', thai:'สายป้อมปราการ', color:'#c98f1e',
    nodes: [
      statNode ('y1', 'def',  2, 5, 50, 88, [],            1),
      statNode ('y2', 'vit',  3, 5, 34, 74, ['y1'],        2),
      skillNode('y3', 'y_bash',        66, 74, ['y1'],     5),
      statNode ('y4', 'def',  3, 5, 22, 60, ['y2'],        6),
      skillNode('y5', 'y_guard',       50, 60, ['y2','y3'],8),
      statNode ('y6', 'vit',  4, 5, 78, 60, ['y3'],        8),
      skillNode('y7', 'y_frost',       14, 46, ['y4'],    12),
      statNode ('y8', 'def',  4, 5, 36, 44, ['y5'],       14),
      skillNode('y9', 'y_quake',       64, 44, ['y5','y6'],16),
      statNode ('y10','vit',  5, 5, 86, 46, ['y6'],       16),
      skillNode('y11','y_fortress',    22, 30, ['y7','y8'],20),
      statNode ('y12','def',  5, 5, 50, 28, ['y8','y9'],  24),
      skillNode('y13','y_glacier',     78, 30, ['y9','y10'],26),
      statNode ('y14','vit',  6, 5, 34, 16, ['y11','y12'],32),
      skillNode('y15','y_bastion',     66, 16, ['y12','y13'],40),
      statNode ('y16','def',  6, 5, 50,  4, ['y14','y15'],45),
      skillNode('y17','y_petrify',     26,  4, ['y16'],     50),
    ],
  },
  white: {
    name:'Radiance Path', thai:'สายแสง', color:'#f6ecd8',
    nodes: [
      statNode ('w1', 'int',  3, 5, 50, 88, [],            1),
      statNode ('w2', 'vit',  2, 5, 34, 74, ['w1'],        2),
      skillNode('w3', 'w_mend',        66, 74, ['w1'],     5),
      statNode ('w4', 'int',  4, 5, 22, 60, ['w2'],        6),
      skillNode('w5', 'w_cleanse',     50, 60, ['w2','w3'],8),
      statNode ('w6', 'def',  3, 5, 78, 60, ['w3'],        8),
      skillNode('w7', 'w_ward',        14, 46, ['w4'],    12),
      statNode ('w8', 'vit',  4, 5, 36, 44, ['w5'],       14),
      skillNode('w9', 'w_bless',       64, 44, ['w5','w6'],16),
      statNode ('w10','int',  5, 5, 86, 46, ['w6'],       16),
      skillNode('w11','w_healall',     22, 30, ['w7','w8'],20),
      statNode ('w12','def',  4, 5, 50, 28, ['w8','w9'],  24),
      skillNode('w13','w_smite',       78, 30, ['w9','w10'],24),
      skillNode('w14','w_revive',      34, 16, ['w11','w12'],34),
      skillNode('w15','w_sanctuary',   66, 16, ['w12','w13'],40),
      statNode ('w16','int',  6, 5, 50,  4, ['w14','w15'],45),
      skillNode('w17','w_failsafe',    74,  4, ['w16'],     50),
    ],
  },
};

export function treeFor(attr) { return SKILL_TREES[attr] || SKILL_TREES.red; }
export function nodeById(attr, id) {
  return treeFor(attr).nodes.find(n => n.id === id) || null;
}

// ── STAGE-2 MUTATIONS ──
// Rolled once when a pet reaches evolution stage 2 (see evolve() in
// engine.js). Purely cosmetic identity (art variant) PLUS a second,
// smaller skill tree layered on top of the pet's attribute tree —
// same node shape (statNode/skillNode), just a shorter path (8 nodes,
// Lv50-75) since it's a bonus tier rather than a full progression.
export const MUTATION_KEYS = ['overclock', 'bulwark', 'phantom', 'corrupted'];

// Equal odds by default. A future catalyst item can bias this the
// same way CRAFT_RECIPES biases equipment grade — see rollWeighted()
// in engine.js.
export const MUTATION_ROLL = MUTATION_KEYS.map(k => [k, 25]);

export const MUTATIONS = {
  overclock: { id:'overclock', name:'Overclock', thai:'โอเวอร์คล็อก', color:'#5fe8ff',
    desc:'เร่งความเร็ว ลัดวงจรและแช่แข็งศัตรู' },
  bulwark:   { id:'bulwark',   name:'Bulwark',   thai:'ปราการ',       color:'#c97a3d',
    desc:'โจมตีหนัก ทนทาน ตั้งรับแกร่ง' },
  phantom:   { id:'phantom',   name:'Phantom',   thai:'ภูตเงา',       color:'#b89aff',
    desc:'หลบหลีกสูง จู่โจมจากที่ซ่อน' },
  corrupted: { id:'corrupted', name:'Corrupted', thai:'เสื่อมสภาพ',   color:'#a05fe0',
    desc:'บ่อนทำลายสถานะศัตรู' },
};

export const MUTATION_TREES = {
  overclock: {
    name:'Overclock Path', thai:'สายโอเวอร์คล็อก', color:'#5fe8ff',
    nodes: [
      statNode ('oc1', 'spd',  2, 5, 50, 90, [],          50),
      statNode ('oc2', 'crit', 2, 5, 30, 74, ['oc1'],      52),
      skillNode('oc3', 'oc_surge',           70, 74, ['oc1'],      55),
      statNode ('oc4', 'spd',  3, 5, 50, 58, ['oc2'],      58),
      skillNode('oc5', 'oc_lockup',          30, 42, ['oc2','oc3'],60),
      statNode ('oc6', 'crit', 3, 5, 70, 42, ['oc4'],      64),
      skillNode('oc7', 'oc_shortcircuit',    50, 24, ['oc5','oc6'],68),
      skillNode('oc8', 'oc_singularity',     50,  6, ['oc7'],      75),
    ],
  },
  bulwark: {
    name:'Bulwark Path', thai:'สายปราการ', color:'#c97a3d',
    nodes: [
      statNode ('bw1', 'def',  2, 5, 50, 90, [],          50),
      statNode ('bw2', 'vit',  3, 5, 30, 74, ['bw1'],      52),
      skillNode('bw3', 'bw_slam',            70, 74, ['bw1'],      55),
      statNode ('bw4', 'def',  3, 5, 50, 58, ['bw2'],      58),
      skillNode('bw5', 'bw_bracing',         30, 42, ['bw2','bw3'],60),
      statNode ('bw6', 'vit',  4, 5, 70, 42, ['bw4'],      64),
      skillNode('bw7', 'bw_juggernaut',      50, 24, ['bw5','bw6'],68),
      skillNode('bw8', 'bw_unbreakable',     50,  6, ['bw7'],      75),
    ],
  },
  phantom: {
    name:'Phantom Path', thai:'สายภูตเงา', color:'#b89aff',
    nodes: [
      statNode ('ph1', 'eva',  2, 5, 50, 90, [],          50),
      statNode ('ph2', 'spd',  2, 5, 30, 74, ['ph1'],      52),
      skillNode('ph3', 'ph_veil',            70, 74, ['ph1'],      55),
      statNode ('ph4', 'eva',  3, 5, 50, 58, ['ph2'],      58),
      skillNode('ph5', 'ph_shadowstep',      30, 42, ['ph2','ph3'],60),
      statNode ('ph6', 'spd',  3, 5, 70, 42, ['ph4'],      64),
      skillNode('ph7', 'ph_mirage',          50, 24, ['ph5','ph6'],68),
      skillNode('ph8', 'ph_voidwalk',        50,  6, ['ph7'],      75),
    ],
  },
  corrupted: {
    name:'Corrupted Path', thai:'สายเสื่อมสภาพ', color:'#a05fe0',
    nodes: [
      statNode ('cp1', 'atk',  2, 5, 50, 90, [],          50),
      statNode ('cp2', 'crit', 2, 5, 30, 74, ['cp1'],      52),
      skillNode('cp3', 'cp_decay',           70, 74, ['cp1'],      55),
      statNode ('cp4', 'atk',  3, 5, 50, 58, ['cp2'],      58),
      skillNode('cp5', 'cp_corruptstrike',   30, 42, ['cp2','cp3'],60),
      statNode ('cp6', 'crit', 3, 5, 70, 42, ['cp4'],      64),
      skillNode('cp7', 'cp_plague',          50, 24, ['cp5','cp6'],68),
      skillNode('cp8', 'cp_oblivion',        50,  6, ['cp7'],      75),
    ],
  },
};

export function treeForMutation(mutation) { return MUTATION_TREES[mutation] || null; }

// ── STAGE-2 ART ──
// The 14 upgraded species render from real per-attribute PNG art
// instead of the fixed-palette SVG — see spriteV2Path() below and
// creatureMarkupFor() in sprites.js. `shape`/`palette` stay on each
// SPECIES entry as a fallback for anything that fails to load.
export const ART2_SPECIES = [
  'blobyte','inkarm','nulworm','clampr','hopbit','jetsquid','chitbug',
  'echowing','dustmoth','finbyte','glitchimp','spikeling','orbling','haunbit',
];
const ART2_BASE = 'assets/sprites_v2';
// Stage 0/1 (no mutation yet): <species>/stage1_<attr>.png
// Stage 2 (mutation rolled):   <species>/<mutation>_<attr>.png
export function spriteV2Path(speciesId, attr, mutation = null) {
  const file = mutation ? `${mutation}_${attr}` : `stage1_${attr}`;
  return `${ART2_BASE}/${speciesId}/${file}.png`;
}

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
  // NOTE: this used to instant-evolve a pet directly (type:'evo',
  // bypassing level/loyalty/materials). Evolution is now gated behind
  // the Tech Lab exclusively, so this instead hands over one Malware
  // Core — still a Bitz shortcut, just one that feeds the same gate
  // everyone else uses rather than skipping it.
  { id:'evo_s', name:'Evo Stone',   icon:'💎', cost:3000, type:'material', val:1, matId:'malware_core', combat:false, desc:'รับ Malware Core x1' },
];

// ── EVOLUTION MATERIALS ──
// Drop-only, never sold in the shop — tracked as simple stackable
// counts in G.materials (see engine.js/game.js), not the unique-
// instance equipment bag pattern. Required by the Tech Lab to evolve
// a stage-2-ready pet: 1 Malware Core + 3 Code Parts (any mix of the
// 4 mutation types — see mutationWeightsFromParts() below).
export const MATERIALS = {
  malware_core: { id:'malware_core', name:'Malware Core', icon:'🧿',
    desc:'ดรอปจากบอสประจำภูมิภาค — ใช้วิวัฒน์ที่ Tech Lab' },
  code_part_overclock: { id:'code_part_overclock', name:'Code Part: Overclock', icon:'🔷', mutation:'overclock',
    desc:'ชิ้นส่วนโค้ด — เพิ่มโอกาสได้ Overclock' },
  code_part_bulwark:   { id:'code_part_bulwark',   name:'Code Part: Bulwark',   icon:'🟤', mutation:'bulwark',
    desc:'ชิ้นส่วนโค้ด — เพิ่มโอกาสได้ Bulwark' },
  code_part_phantom:   { id:'code_part_phantom',   name:'Code Part: Phantom',   icon:'🟣', mutation:'phantom',
    desc:'ชิ้นส่วนโค้ด — เพิ่มโอกาสได้ Phantom' },
  code_part_corrupted: { id:'code_part_corrupted', name:'Code Part: Corrupted', icon:'🟢', mutation:'corrupted',
    desc:'ชิ้นส่วนโค้ด — เพิ่มโอกาสได้ Corrupted' },
};
export const CODE_PART_IDS = ['code_part_overclock','code_part_bulwark','code_part_phantom','code_part_corrupted'];

// Code part drop chance per kill scales from 5% at Lv1 up to 50% at
// Lv50, linear, capped at 50 beyond that (matches "5% to 50% from
// Lv1 to Lv50 enemy" — bosses use their own separate roll, see
// BOSS_TUNING below).
export function codePartDropChance(enemyLevel) {
  const t = Math.max(0, Math.min(1, (enemyLevel - 1) / 49));
  return 0.05 + t * 0.45;
}

// Each Code Part slotted for a given mutation adds a flat 30
// percentage points to that mutation's odds; whatever's left over
// (100 - 30*n) splits evenly across the mutation(s) that got ZERO
// parts. `parts` is an array of 1-3 mutation-type strings (e.g.
// ['bulwark','bulwark','bulwark'] or ['bulwark','phantom','bulwark']).
export function mutationWeightsFromParts(parts) {
  const per = {};
  MUTATION_KEYS.forEach(k => { per[k] = 0; });
  parts.forEach(k => { if (per[k] != null) per[k] += 30; });
  const used = MUTATION_KEYS.filter(k => per[k] > 0);
  const unused = MUTATION_KEYS.filter(k => per[k] === 0);
  const spent = used.reduce((s, k) => s + per[k], 0);
  const leftover = Math.max(0, 100 - spent);
  if (unused.length) {
    const each = leftover / unused.length;
    unused.forEach(k => { per[k] = each; });
  } else if (leftover > 0) {
    MUTATION_KEYS.forEach(k => { per[k] += leftover / MUTATION_KEYS.length; });
  }
  return MUTATION_KEYS.map(k => [k, per[k]]);
}

// Potions sold at safe spots. Bought here, consumed in battle.
export const POTIONS = [
  { id:'pot_s', name:'Small Potion', icon:'🧪', img:'assets/potions/pot_s.png', cost:120, heal:0.35, desc:'ฟื้น HP 35% ระหว่างสู้' },
  { id:'pot_m', name:'Large Potion', icon:'⚗️', img:'assets/potions/pot_m.png', cost:320, heal:0.70, desc:'ฟื้น HP 70% ระหว่างสู้' },
  { id:'pot_f', name:'Full Elixir',  icon:'🍶', img:'assets/potions/pot_f.png', cost:700, heal:1.00, desc:'ฟื้น HP เต็ม ระหว่างสู้' },
];
// ── THROWABLE BATTLE ITEMS ──
// The in-battle potion/poison bar is now two pouches (see #potion-bar
// in index.html, wireThrowPouches() in game.js): press-hold-drag opens
// a radial wheel of up to 5 slotted items, dragging past the wheel
// locks a selection and the icon follows your finger until you flick
// it at a side of the battlefield. Whichever unit it actually lands
// on gets the effect — flick a heal/buff potion at the enemy and it
// heals THEM; flick a curse at your own ally and it curses THEM. Every
// item shares one 10s real-time cooldown per its own id (see
// itemOnCooldown()/startItemCooldown() in game.js).
//
// The wheel only ever shows items you actually have stock of, and an
// item drops out of the wheel the instant its stock hits 0 (see
// throwItemAvailable() in game.js) — same stock model as the existing
// POTIONS above (bought at the Safe Spot, kept in G.potions), just
// extended to these too. Poisons are bought at the Tech Shop instead,
// kept in their own G.poisons bag.
export const THROW_UTILITY_POTIONS = [
  { id:'tp_mp',      name:'MP Potion',     icon:'💧', img:'assets/potions/tp_mp.png',      kind:'mp',       amt:0.5,  cost:180, desc:'ฟื้น MP 50% ของสูงสุด' },
  { id:'tp_spd',     name:'Speed Draught', icon:'🥤', img:'assets/potions/tp_spd.png',     kind:'spd_buff', amt:0.40, cost:260, desc:'SPD +40% ตลอดการต่อสู้นี้' },
  { id:'tp_crit',    name:'Crit Elixir',   icon:'🍸', img:'assets/potions/tp_crit.png',    kind:'crit_buff',amt:0.5,  cost:280, desc:'CRIT +50% ตลอดการต่อสู้นี้' },
  { id:'tp_cleanse', name:'Cleanse Tonic', icon:'✨', img:'assets/potions/tp_cleanse.png', kind:'cleanse',  cost:220, desc:'ล้างสถานะติดลบทั้งหมด' },
];
// The poison pouch's whole pool — bought at the Tech Shop, kept in
// G.poisons (separate bag from G.potions).
export const THROW_POISONS = [
  { id:'tx_freeze', name:'Freeze Curse', icon:'❄️', img:'assets/potions/tx_freeze.png', kind:'ailment', ailment:'freeze', turns:5, cost:240, desc:'แช่แข็ง 5 เทิร์น' },
  { id:'tx_stone',  name:'Stone Curse',  icon:'🗿', img:'assets/potions/tx_stone.png',  kind:'ailment', ailment:'stoned', turns:5, cost:240, desc:'กลายเป็นหิน 5 เทิร์น' },
  { id:'tx_charm',  name:'Charm Curse',  icon:'💗', img:'assets/potions/tx_charm.png',  kind:'ailment', ailment:'charm',  turns:5, cost:260, desc:'สะกดให้หลงเสน่ห์ 5 เทิร์น' },
];

// Sold separately at the Tech Shop (not a safe-spot potion) — an
// emergency out for a Down pet (see petState()/DOWN_MS in engine.js)
// bought in advance and used later from the Inventory bag's Potions
// tab (see useRevivePotion() in game.js). Doesn't touch Error state —
// that always needs a Real World Clinic incubation chamber.
export const REVIVE_POTION = { id:'revive_potion', name:'Revive Potion', icon:'✨', cost:5000,
  revive:true, desc:'ชุบชีวิต VIRUZ ที่อยู่ในสถานะ Down ทันที — ใช้ได้จากกระเป๋าไอเทม (ไม่ได้ผลกับสถานะ Error)' };

// ── BASE DEFENSE BOTS ──
export const DEFENSE_BOTS = [
  { id:'bot_lite', name:'Sentry Bot',   icon:'🤖', cost:1200, power:{atk:14,def:16,spd:10,mhp:140}, desc:'บอทป้องกันพื้นฐาน' },
  { id:'bot_mid',  name:'Warden Bot',   icon:'🛡️', cost:3000, power:{atk:22,def:26,spd:12,mhp:230}, desc:'บอทป้องกันระดับกลาง' },
  { id:'bot_max',  name:'Fortress Bot', icon:'🏰', cost:7500, power:{atk:34,def:40,spd:14,mhp:380}, desc:'บอทป้องกันระดับสูง' },
];

// ── CITY MAP HOTSPOTS ──
// Re-measured directly from the user's second annotation pass (colored
// dot = click target center, colored line = where the text caption
// should render). Every landmark here uses an explicit textX/textY
// rather than a generic direction, because the distances aren't
// uniform. Every node's clickable area is now a large invisible
// circle (zoneR, in vmin) centred on x/y — see buildMapNodes().
export const MAP_NODES = [
  {
    id: 'warp_gate',
    label: 'Warp Gate',
    x: 25.5,
    y: 20.3,
    textX: 25.3,
    textY: 5,
    zoneR: 14,
    screen: 'world',
    hint: 'ออกผจญภัย · แผนที่โลก',
    img: 'assets/ui/warp.png',
    iconImg: 'assets/ui/warp.png'
  },

  {
    id: 'clinic',
    label: 'Clinic',
    x: 72.2,
    y: 25.1,
    textX: 77.3,
    textY: 8.5,
    zoneR: 14,
    screen: 'clinic',
    hint: 'รักษา VIRUZ · ฟักไข่',
    img: 'assets/ui/nav_clinic.png',
    iconImg: 'assets/ui/nav_clinic.png'
  },

  {
    id: 'apartment',
    label: 'Your Home',
    x: 54.9,
    y: 49.6,
    textX: 53.1,
    textY: 33.7,
    zoneR: 14,
    screen: 'home',
    hint: 'ฐานของคุณ · ทีม · ป้องกัน',
    img: 'assets/ui/nav_home.png',
    iconImg: 'assets/ui/nav_home.png'
  },

  {
    id: 'hacking',
    label: 'Hacking Center',
    x: 22.9,
    y: 53.4,
    textX: 22.9,
    textY: 39.1,
    zoneR: 15,
    screen: 'raid',
    hint: 'เจาะบ้านผู้เล่นคนอื่น',
    img: 'assets/ui/nav_raid.png',
    iconImg: 'assets/ui/nav_raid.png'
  },

  {
    id: 'tech_shop',
    label: 'Tech Shop',
    x: 87,
    y: 64.8,
    textX: 87,
    textY: 55.5,
    zoneR: 13,
    screen: 'shop',
    hint: 'ไอเทม · บูสเตอร์ (ในอนาคต: คราฟต์อุปกรณ์ · การ์ดอัพเกรด)',
    img: 'assets/ui/nav_shop.png',
    iconImg: 'assets/ui/nav_shop.png'
  },

  {
    id: 'food_shop',
    label: 'Food Shop',
    x: 16,
    y: 83.5,
    textX: 16,
    textY: 74.2,
    zoneR: 14,
    screen: 'foodshop',
    hint: 'ซื้ออาหารสำเร็จรูปและวัตถุดิบทำอาหาร',
    img: 'assets/ui/nav_foodshop.png',
    iconImg: 'assets/ui/nav_foodshop.png'
  }
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
  turnBaseMs: 700,   // gap BETWEEN exchanges; the attack sequence itself
                     // (banner + wind-up + lunge + hit-stop + return) adds ~1.5s,
                     // so this stays short or the fight drags
  fleePenalty: 0.0,

  // ── CRIT GAUGE (manual-trigger ultimate) ──
  // Fills every time a unit takes its own turn; a higher CRIT stat fills
  // it faster. At 100% an ally becomes tappable to fire a guaranteed-crit
  // bonus strike on demand (see fireBonusCrit() in game.js); a foe just
  // auto-fires the instant its gauge is full, since there's no player to
  // tap for it.
  critGaugeBaseGain: 0.16,     // flat portion gained per own turn
  critGaugeCritScale: 260,     // + (unit's CRIT stat / this) per own turn
  // Frozen units take bonus damage when hit (the ice "shatters"), which
  // also breaks the freeze immediately — see applyFreezeShatter() in
  // game.js.
  freezeShatterMult: 1.2,
  // HP fraction that arms w_failsafe's one-shot full heal (see the
  // "Last Stand" check in applyDamage(), game.js).
  lastStandThreshold: 0.4,
};
