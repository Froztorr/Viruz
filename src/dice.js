// ═══════════════════════════════════════════════════════════
// VIRUZ — D20 ROUND DICE (Tabletop Realm)
//
// Every 3 rounds a d20 is rolled and the result buffs one stat for the
// next 3 rounds, on a theme picked at random when the battle starts.
//
// HOW THE RESULT IS APPLIED (and why there is no new combat maths):
// the game already has a per-unit stat-modifier system -- ailments carry
// fractional stat deltas, e.g. the Demon habit does
//     addAilment(target, { id:'corrupt', turns:3, atk:-0.15, def:-0.15 })
// for -15% attack. So a dice result of "x2 attack" is just an ailment
// carrying atk:+1.00. Consequences of routing it this way:
//   - computeDamage() needs no changes at all
//   - the buff renders itself: statBuffChips() in turn-loop.js already
//     draws a coloured ATK/DEF/SPD/EVA/CRIT chip with a turn counter for
//     any active ailment, so the player can see the boon and its timer
//     without a single new DOM node
//   - it expires on its own through the normal tickAilments() path
//
// WHY THE OLD BOON IS FILTERED OUT BEFORE THE NEW ONE IS ADDED:
// addAilment() dedupes by id -- a second instance of an existing id
// refreshes its turn count. What it does NOT clearly do is overwrite the
// stat numbers, which would let a x3 boon linger while a later x1 result
// silently did nothing. Stripping the id first (the same technique
// applyFreezeShatter() uses on 'freeze') makes each roll authoritative.
//
// CRIT AND EVA ARE SCALED DOWN DELIBERATELY:
// ATK/DEF/SPD are multipliers where +100% is meaningful. CRIT and EVA are
// already percentages, so a literal +100% would mean "always crit" /
// "never get hit" and end the fight on the spot. Those two themes apply a
// quarter of the nominal gain -- see `scale` below.
//
// LIFESTEAL/BLOODPACT IS DELIBERATELY ABSENT: it cannot be expressed as a
// stat delta and would need a hook inside the damage application path.
// Every theme here is reachable through the existing ailment system, so
// this whole module stays out of combat internals.
//
// PRESENTATION: the roll plays as a full-screen animation (dice-fx.js)
// that darkens the battle and holds the turn loop until it finishes --
// the loop is suspended simply because turn-loop.js awaits
// onRoundComplete(). This previously fired two showBanner() flashes,
// which were far too easy to miss and read as "the dice never happened".
// ═══════════════════════════════════════════════════════════

import { addAilment } from './engine.js';
import { playDiceRoll } from './dice-fx.js';
import { G } from './state.js';
import { blog } from './ui-shell.js';

// Maps where the dice mechanic is live. Everywhere else is untouched.
export const DICE_MAPS = new Set(['board']);

// Roll cadence, in full rounds.
export const ROLL_EVERY = 3;

// One shared id so a new result always replaces the previous one.
const BOON_ID = 'dice_boon';

// `stat` must be one of the keys STAT_BUFF_META knows how to draw in
// turn-loop.js (atk / def / spd / eva / crit), or the boon will apply
// invisibly with no chip.
const THEMES = [
  { id: 'power',   stat: 'atk',  scale: 1,    icon: '⚔️', name: 'Power Surge',    thai: 'คลื่นพลังโจมตี' },
  { id: 'ward',    stat: 'def',  scale: 1,    icon: '🛡️', name: 'Iron Ward',      thai: 'กำแพงเหล็ก' },
  { id: 'haste',   stat: 'spd',  scale: 1,    icon: '💨', name: 'Haste',          thai: 'เร่งความเร็ว' },
  { id: 'fortune', stat: 'crit', scale: 0.25, icon: '✨', name: "Fortune's Edge", thai: 'คมแห่งโชค' },
  { id: 'phantom', stat: 'eva',  scale: 0.25, icon: '🌫️', name: 'Phantom Step',   thai: 'ก้าวเงา' },
];

// The bands from the spec. `you` and `foe` are multipliers, so 2 means
// "double". A 1 means that side gets nothing this roll -- it is still
// applied, because applying a zero boon is what clears the previous one.
const BANDS = [
  { max: 10, you: 2,   foe: 2   },
  { max: 15, you: 2,   foe: 1.5 },
  { max: 19, you: 2.5, foe: 1   },
  { max: 20, you: 3,   foe: 1   },
];

export function rollD20() {
  return 1 + Math.floor(Math.random() * 20);
}

function bandFor(roll) {
  return BANDS.find(b => roll <= b.max) || BANDS[BANDS.length - 1];
}

function randomTheme() {
  return THEMES[Math.floor(Math.random() * THEMES.length)];
}

// True when the fight the player is currently in should use dice.
export function diceActive() {
  return DICE_MAPS.has(G.currentMapId);
}

// Picks this battle's theme once, on first use, and announces it.
export function themeFor(b) {
  if (!b) return null;
  if (!b._diceTheme) b._diceTheme = randomTheme();
  return b._diceTheme;
}

function applySide(units, theme, mult) {
  const delta = (mult - 1) * theme.scale;
  (units || []).forEach(u => {
    if (!u || u.hp <= 0) return;
    // Authoritative replace -- see the header note on addAilment dedupe.
    u.ailments = (u.ailments || []).filter(a => a.id !== BOON_ID);
    if (delta === 0) return;
    addAilment(u, { id: BOON_ID, turns: ROLL_EVERY, [theme.stat]: delta });
  });
}

// Called at the end of every completed round by turn-loop.js. Rolls only
// on rounds 3, 6, 9, ... and only on a dice map.
export async function onRoundComplete(b, roundNo) {
  if (!b || b.over || !diceActive()) return;
  if (!roundNo || roundNo % ROLL_EVERY !== 0) return;

  const theme = themeFor(b);
  const roll = rollD20();
  const band = bandFor(roll);

  applySide(b.team, theme, band.you);
  applySide(b.enemies, theme, band.foe);

  // The stats are already applied above, so a failure in the animation
  // must not swallow the roll itself -- worst case the boon lands with
  // no visual and the battle log still explains it.
  try {
    await playDiceRoll({ roll, theme, band });
  } catch (err) {
    console.warn('[dice] roll animation failed:', err);
  }

  const foeText = band.foe > 1 ? ` · ศัตรู ×${band.foe}` : ' · ศัตรูไม่ได้รับผล';
  blog(`🎲 ทอย d20 ได้ ${roll} — ${theme.thai} ฝั่งคุณ ×${band.you}${foeText}`, roll === 20 ? 'buff' : 'sys');
}

// Mimic reward scaling for this realm. Returns a value multiplier for a
// d20 roll, so a natural 20 is a genuine jackpot. Consumed by the mimic
// reward path in a follow-up commit.
export function mimicRollMultiplier(roll) {
  if (roll >= 20) return 5;
  if (roll >= 16) return 3;
  if (roll >= 11) return 2;
  if (roll >= 6) return 1.35;
  return 1;
}

export { THEMES, BANDS };
