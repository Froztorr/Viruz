// ═══════════════════════════════════════════════════════════
// VIRUZ — CELESTIAL MONSTERS (Galaxy realm roster)
//
// The four Galaxy child maps originally borrowed their enemies from the
// Forest and Hell rosters, so a level 165 fight on the Derelict Starship
// still spawned a goblin. This registers the 16 purpose-made celestial
// monsters and hands each child map its own themed pool.
//
// WHY CLONE INSTEAD OF DECLARING SPECIES LITERALLY:
// data.js is ~105KB and its species records carry a lot of fields that
// the battle code depends on. Rather than hand-write new records and
// risk missing a required field, each new monster is a shallow copy of
// an existing high-tier species with only identity, art and stats
// overridden. Whatever fields the engine needs are inherited verbatim.
//
// This also means data.js is never edited, so the change is contained
// to one file and is trivial to revert.
//
// LOAD ORDER: must be imported AFTER galaxy.js in main.js, because the
// Galaxy zones it retunes are pushed into ZONES by that module.
// ═══════════════════════════════════════════════════════════

import * as DATA from './data.js';

// Cloned for its stat block and field set. vampire_lord is the strongest
// existing monster, which is the closest starting point for Lv 101-165.
const TEMPLATE_ID = 'vampire_lord';

// power scales the template's numeric stats. Ramps 1.00 -> 2.00 across
// the realm so each child map is a step up, with a spike on each boss.
const NEW_MONSTERS = [
  // Red Giant · Lv 101-120
  { id: 'ember_pup',          name: 'Ember Pup',          thai: '\u0e25\u0e39\u0e01\u0e2a\u0e38\u0e19\u0e31\u0e02\u0e16\u0e48\u0e32\u0e19\u0e44\u0e1f',      power: 1.00 },
  { id: 'solar_moth',         name: 'Solar Moth',         thai: '\u0e1c\u0e35\u0e40\u0e2a\u0e37\u0e49\u0e2d\u0e2a\u0e38\u0e23\u0e34\u0e22\u0e30',          power: 1.05 },
  { id: 'magma_golem',        name: 'Magma Golem',        thai: '\u0e42\u0e01\u0e40\u0e25\u0e21\u0e2b\u0e34\u0e19\u0e2b\u0e25\u0e2d\u0e21',          power: 1.12 },
  { id: 'corona_dragon',      name: 'Corona Dragon',      thai: '\u0e21\u0e31\u0e07\u0e01\u0e23\u0e42\u0e04\u0e42\u0e23\u0e19\u0e32',          power: 1.30, boss: true },

  // Ringed Star · Lv 121-135
  { id: 'crystal_crab',       name: 'Crystal Crab',       thai: '\u0e1b\u0e39\u0e1c\u0e25\u0e36\u0e01',                power: 1.18 },
  { id: 'comet_bunny',        name: 'Comet Bunny',        thai: '\u0e01\u0e23\u0e30\u0e15\u0e48\u0e32\u0e22\u0e14\u0e32\u0e27\u0e2b\u0e32\u0e07',       power: 1.24 },
  { id: 'orbit_ray',          name: 'Orbit Ray',          thai: '\u0e01\u0e23\u0e30\u0e40\u0e1a\u0e19\u0e42\u0e04\u0e08\u0e23',            power: 1.30 },
  { id: 'ring_guardian',      name: 'Ring Guardian',      thai: '\u0e1c\u0e39\u0e49\u0e1e\u0e34\u0e17\u0e31\u0e01\u0e29\u0e4c\u0e27\u0e07\u0e41\u0e2b\u0e27\u0e19', power: 1.50, boss: true },

  // Blue Dwarf · Lv 136-147
  { id: 'azure_slime',        name: 'Azure Slime',        thai: '\u0e2a\u0e44\u0e25\u0e21\u0e4c\u0e2a\u0e35\u0e04\u0e23\u0e32\u0e21',           power: 1.38 },
  { id: 'plasma_fox',         name: 'Plasma Fox',         thai: '\u0e08\u0e34\u0e49\u0e07\u0e08\u0e2d\u0e01\u0e1e\u0e25\u0e32\u0e2a\u0e21\u0e32',       power: 1.45 },
  { id: 'star_jelly',         name: 'Star Jelly',         thai: '\u0e27\u0e38\u0e49\u0e19\u0e14\u0e32\u0e23\u0e32',                power: 1.52 },
  { id: 'frostflare_phoenix', name: 'Frostflare Phoenix', thai: '\u0e1f\u0e35\u0e19\u0e34\u0e01\u0e0b\u0e4c\u0e40\u0e1b\u0e25\u0e27\u0e40\u0e22\u0e37\u0e2d\u0e01\u0e41\u0e02\u0e47\u0e07', power: 1.72, boss: true },

  // Derelict Starship · Lv 148-165
  { id: 'cable_rat',          name: 'Cable Rat',          thai: '\u0e2b\u0e19\u0e39\u0e2a\u0e32\u0e22\u0e44\u0e1f',              power: 1.60 },
  { id: 'repair_drone',       name: 'Repair Drone',       thai: '\u0e42\u0e14\u0e23\u0e19\u0e0b\u0e48\u0e2d\u0e21\u0e1a\u0e33\u0e23\u0e38\u0e07',       power: 1.68 },
  { id: 'void_mimic',         name: 'Void Mimic',         thai: '\u0e21\u0e34\u0e21\u0e34\u0e01\u0e2a\u0e38\u0e0d\u0e0d\u0e32\u0e01\u0e32\u0e28',        power: 1.78 },
  { id: 'corrupted_captain',  name: 'Corrupted Captain',  thai: '\u0e01\u0e31\u0e1b\u0e15\u0e31\u0e19\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01\u0e22\u0e36\u0e14\u0e04\u0e23\u0e2d\u0e07', power: 2.00, boss: true },
];

// Each Galaxy battle zone gets a themed pool. Boss-tier monsters are
// reserved for the final node of their map.
const ZONE_POOLS = {
  // Red Giant
  gr_corona:     ['ember_pup', 'solar_moth'],
  gr_sunspots:   ['solar_moth', 'magma_golem'],
  gr_prominence: ['magma_golem', 'ember_pup'],
  gr_corepath:   ['corona_dragon', 'magma_golem', 'solar_moth'],

  // Ringed Star
  gg_iceband:    ['crystal_crab', 'comet_bunny'],
  gg_ruins:      ['comet_bunny', 'orbit_ray'],
  gg_debris:     ['ring_guardian', 'orbit_ray', 'crystal_crab'],

  // Blue Dwarf
  gd_bridge:     ['azure_slime', 'plasma_fox'],
  gd_storm:      ['plasma_fox', 'star_jelly'],
  gd_nexus:      ['frostflare_phoenix', 'star_jelly', 'azure_slime'],

  // Derelict Starship
  gs_navigation: ['cable_rat', 'repair_drone'],
  gs_engine:     ['repair_drone', 'void_mimic'],
  gs_command:    ['corrupted_captain', 'void_mimic', 'cable_rat'],
};

// Multiply every number in a stat block, leaving non-numeric fields alone.
function scaleNumbers(source, mult) {
  if (!source || typeof source !== 'object') return source;
  const out = Array.isArray(source) ? [] : {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = typeof value === 'number' ? Math.max(1, Math.round(value * mult)) : value;
  }
  return out;
}

// data.js keeps its monsters in an exported array whose name this module
// deliberately does not hardcode. Find it by looking for the template.
function findSpeciesList() {
  for (const value of Object.values(DATA)) {
    if (!Array.isArray(value)) continue;
    if (value.some(entry => entry && entry.id === TEMPLATE_ID)) return value;
  }
  return null;
}

function registerMonsters() {
  const list = findSpeciesList();
  if (!list) {
    console.warn('[galaxy-monsters] species list not found; roster unchanged');
    return 0;
  }
  const template = list.find(entry => entry.id === TEMPLATE_ID);
  if (!template) return 0;

  let added = 0;
  for (const def of NEW_MONSTERS) {
    if (list.some(entry => entry && entry.id === def.id)) continue;

    const entry = { ...template, id: def.id, gif: def.id, ext: 'gif' };

    // Only set fields the template actually uses, so nothing foreign is
    // introduced into a record shape the engine may validate.
    if ('name' in template) entry.name = def.name;
    if ('thai' in template) entry.thai = def.thai;
    if ('boss' in template) entry.boss = Boolean(def.boss);
    if (template.stats) entry.stats = scaleNumbers(template.stats, def.power);

    // The template's auto-flip would mirror art that is already drawn
    // facing the correct way.
    delete entry.faces;

    list.push(entry);
    added += 1;
  }
  return added;
}

function retuneZones() {
  const zones = DATA.ZONES;
  if (!Array.isArray(zones)) return 0;

  let retuned = 0;
  for (const [zoneId, pool] of Object.entries(ZONE_POOLS)) {
    const zone = zones.find(z => z && z.id === zoneId);
    if (!zone || !Array.isArray(zone.pool)) continue;
    zone.pool = [...pool];
    retuned += 1;
  }
  return retuned;
}

try {
  registerMonsters();
  retuneZones();
} catch (err) {
  console.warn('[galaxy-monsters] registration skipped:', err);
}

export { NEW_MONSTERS, ZONE_POOLS };
