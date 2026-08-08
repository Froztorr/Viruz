// ═══════════════════════════════════════════════════════════
// VIRUZ — CELESTIAL MONSTERS (Galaxy realm roster)
//
// The four Galaxy child maps originally borrowed their enemies from the
// Forest and Hell rosters, so a level 165 fight on the Derelict Starship
// still spawned a goblin. This registers the 16 purpose-made celestial
// monsters and hands each child map its own themed pool.
//
// HOW MONSTERS ARE STORED (learned the hard way):
// ANTIVIRUZ is an OBJECT KEYED BY ID, not an array. engine.js resolves a
// monster with `ANTIVIRUZ[defId]` in spawnAntiviruz(). An earlier version
// of this file scanned for an exported array, found nothing, and
// registered zero monsters -- while still rewriting the zone pools, which
// left the Galaxy maps pointing at ids that did not resolve. Unknown ids
// make spawnAntiviruz() return null, and buildHackRun() puts those nulls
// directly into the wave list.
//
// GUARANTEE: retuneZones() now runs ONLY if every id it references was
// successfully registered. A pool can never point at a missing monster.
//
// WHY CLONE INSTEAD OF DECLARING SPECIES LITERALLY:
// data.js is ~105KB and spawnAntiviruz() reads a dozen fields off a
// monster record (base, shape, palette, faces, scale, noFloat, specials,
// habitColor, habitType, ...). Cloning an existing high-tier monster
// inherits all of them verbatim, so no required field can be missed.
//
// data.js is never edited, so this change is contained to one file.
//
// LOAD ORDER: must be imported AFTER galaxy.js in main.js, because the
// Galaxy zones it retunes are pushed into ZONES by that module.
// ═══════════════════════════════════════════════════════════

import * as DATA from './data.js';

// Cloned for its stat block and field set. vampire_lord is the strongest
// existing monster, the closest starting point for Lv 101-165.
const TEMPLATE_ID = 'vampire_lord';

// `power` scales the template's base stat line. Ramps 1.00 -> 2.00 across
// the realm so each child map is a step up, with a spike on each boss.
const NEW_MONSTERS = [
  // Red Giant · Lv 101-120
  { id: 'ember_pup',          name: 'Ember Pup',          thai: '\u0e25\u0e39\u0e01\u0e2a\u0e38\u0e19\u0e31\u0e02\u0e16\u0e48\u0e32\u0e19\u0e44\u0e1f',      power: 1.00 },
  { id: 'solar_moth',         name: 'Solar Moth',         thai: '\u0e1c\u0e35\u0e40\u0e2a\u0e37\u0e49\u0e2d\u0e2a\u0e38\u0e23\u0e34\u0e22\u0e30',          power: 1.05 },
  { id: 'magma_golem',        name: 'Magma Golem',        thai: '\u0e42\u0e01\u0e40\u0e25\u0e21\u0e2b\u0e34\u0e19\u0e2b\u0e25\u0e2d\u0e21',          power: 1.12 },
  { id: 'corona_dragon',      name: 'Corona Dragon',      thai: '\u0e21\u0e31\u0e07\u0e01\u0e23\u0e42\u0e04\u0e42\u0e23\u0e19\u0e32',          power: 1.30 },

  // Ringed Star · Lv 121-135
  { id: 'crystal_crab',       name: 'Crystal Crab',       thai: '\u0e1b\u0e39\u0e1c\u0e25\u0e36\u0e01',                power: 1.18 },
  { id: 'comet_bunny',        name: 'Comet Bunny',        thai: '\u0e01\u0e23\u0e30\u0e15\u0e48\u0e32\u0e22\u0e14\u0e32\u0e27\u0e2b\u0e32\u0e07',       power: 1.24 },
  { id: 'orbit_ray',          name: 'Orbit Ray',          thai: '\u0e01\u0e23\u0e30\u0e40\u0e1a\u0e19\u0e42\u0e04\u0e08\u0e23',            power: 1.30 },
  { id: 'ring_guardian',      name: 'Ring Guardian',      thai: '\u0e1c\u0e39\u0e49\u0e1e\u0e34\u0e17\u0e31\u0e01\u0e29\u0e4c\u0e27\u0e07\u0e41\u0e2b\u0e27\u0e19', power: 1.50 },

  // Blue Dwarf · Lv 136-147
  { id: 'azure_slime',        name: 'Azure Slime',        thai: '\u0e2a\u0e44\u0e25\u0e21\u0e4c\u0e2a\u0e35\u0e04\u0e23\u0e32\u0e21',           power: 1.38 },
  { id: 'plasma_fox',         name: 'Plasma Fox',         thai: '\u0e08\u0e34\u0e49\u0e07\u0e08\u0e2d\u0e01\u0e1e\u0e25\u0e32\u0e2a\u0e21\u0e32',       power: 1.45 },
  { id: 'star_jelly',         name: 'Star Jelly',         thai: '\u0e27\u0e38\u0e49\u0e19\u0e14\u0e32\u0e23\u0e32',                power: 1.52 },
  { id: 'frostflare_phoenix', name: 'Frostflare Phoenix', thai: '\u0e1f\u0e35\u0e19\u0e34\u0e01\u0e0b\u0e4c\u0e40\u0e1b\u0e25\u0e27\u0e40\u0e22\u0e37\u0e2d\u0e01\u0e41\u0e02\u0e47\u0e07', power: 1.72 },

  // Derelict Starship · Lv 148-165
  { id: 'cable_rat',          name: 'Cable Rat',          thai: '\u0e2b\u0e19\u0e39\u0e2a\u0e32\u0e22\u0e44\u0e1f',              power: 1.60 },
  { id: 'repair_drone',       name: 'Repair Drone',       thai: '\u0e42\u0e14\u0e23\u0e19\u0e0b\u0e48\u0e2d\u0e21\u0e1a\u0e33\u0e23\u0e38\u0e07',       power: 1.68 },
  { id: 'void_mimic',         name: 'Void Mimic',         thai: '\u0e21\u0e34\u0e21\u0e34\u0e01\u0e2a\u0e38\u0e0d\u0e0d\u0e32\u0e01\u0e32\u0e28',        power: 1.78 },
  { id: 'corrupted_captain',  name: 'Corrupted Captain',  thai: '\u0e01\u0e31\u0e1b\u0e15\u0e31\u0e19\u0e17\u0e35\u0e48\u0e16\u0e39\u0e01\u0e22\u0e36\u0e14\u0e04\u0e23\u0e2d\u0e07', power: 2.00 },
];

// Each Galaxy battle zone gets a themed pool. The strongest monster of
// each map is reserved for that map's final node.
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
  // Authored in Safe Dev Mode; the captain appears here one room early,
  // ahead of his own bridge, guarding the drone that keeps repairing him.
  gs_commander:  ['repair_drone', 'corrupted_captain'],
  gs_command:    ['corrupted_captain', 'void_mimic', 'cable_rat'],
};

// Multiply every number in a stat block, leaving non-numeric fields alone.
function scaleNumbers(source, mult) {
  if (!source || typeof source !== 'object') return null;
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = typeof value === 'number' ? Math.max(1, Math.round(value * mult)) : value;
  }
  return out;
}

// Registers into the ANTIVIRUZ id->record map. Returns the set of ids that
// are resolvable afterwards, so the caller can refuse to wire up a pool
// that references anything missing.
function registerMonsters() {
  const roster = DATA.ANTIVIRUZ;
  if (!roster || typeof roster !== 'object' || Array.isArray(roster)) {
    console.warn('[galaxy-monsters] ANTIVIRUZ map not found; roster unchanged');
    return new Set();
  }

  const template = roster[TEMPLATE_ID];
  if (!template) {
    console.warn(`[galaxy-monsters] template "${TEMPLATE_ID}" missing; roster unchanged`);
    return new Set();
  }

  // Spread across the game's real attribute keys so the whole realm is not
  // a single element. Read from data.js rather than hardcoded, because an
  // attr outside ATTR would crash statsOf() on ATTR[pet.attr].mult.
  const attrKeys = Array.isArray(DATA.ATTR_KEYS) && DATA.ATTR_KEYS.length
    ? DATA.ATTR_KEYS
    : null;

  const ready = new Set();
  NEW_MONSTERS.forEach((def, i) => {
    // Never clobber an existing monster.
    if (roster[def.id]) { ready.add(def.id); return; }

    const entry = { ...template, id: def.id, name: def.name };

    // Art: sprites.js resolves a monster folder as
    // MONSTER_GIF_FOLDERS[speciesId] || species.gif, so pointing `gif` at
    // the id yields assets/sprites/<id>/still.gif.
    entry.gif = def.id;
    entry.ext = 'gif';

    // `faces` is deliberately INHERITED, not deleted -- spawnAntiviruz()
    // reads it for sprite direction, and the template's value is the one
    // every existing monster renders correctly with.

    if ('thai' in template) entry.thai = def.thai;
    if (attrKeys) entry.attr = attrKeys[i % attrKeys.length];

    // Stats live on `base` (atk/def/spd/mhp) -- see spawnAntiviruz().
    const scaled = scaleNumbers(template.base, def.power);
    if (scaled) entry.base = scaled;

    roster[def.id] = entry;
    ready.add(def.id);
  });

  return ready;
}

// Only rewrites a pool when every id in it resolves. This is the guard
// whose absence broke the Galaxy maps.
function retuneZones(ready) {
  const zones = DATA.ZONES;
  if (!Array.isArray(zones)) return 0;

  let retuned = 0;
  for (const [zoneId, pool] of Object.entries(ZONE_POOLS)) {
    if (!pool.every(id => ready.has(id))) {
      console.warn(`[galaxy-monsters] skipping ${zoneId}; unresolved monsters`);
      continue;
    }
    const zone = zones.find(z => z && z.id === zoneId);
    if (!zone || !Array.isArray(zone.pool)) continue;
    zone.pool = [...pool];
    retuned += 1;
  }
  return retuned;
}

try {
  const ready = registerMonsters();
  if (ready.size) retuneZones(ready);
} catch (err) {
  console.warn('[galaxy-monsters] registration skipped:', err);
}

export { NEW_MONSTERS, ZONE_POOLS };
