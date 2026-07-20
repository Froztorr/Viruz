// ═══════════════════════════════════════════════════════════
// VIRUZ PET — SPRITES
// Creatures are drawn as inline SVG rather than shipped as image
// files. Two reasons: (1) no asset upload can flatten or collide,
// (2) every creature can be recolored per-attribute for free.
//
// Each builder returns SVG *markup* for a 100x100 viewBox, drawn
// facing RIGHT. The renderer flips enemies horizontally.
// ═══════════════════════════════════════════════════════════

// Palette derived from the pet's attribute colour so a Red octopus
// and a Green octopus read as different creatures at a glance.
export function paletteFor(color) {
  return {
    body: color,
    dark: shade(color, -38),
    light: shade(color, 26),
    eye: '#0b0f1c',
    glint: '#ffffff',
  };
}

function shade(hex, amt) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// Shared eye pair. `sq` renders the wide oval "surprised" eyes from
// the reference sheet; otherwise round pupils.
function eyes(cx1, cx2, cy, r, p, sq = false) {
  const w = sq ? r * 1.25 : r;
  return `
    <ellipse cx="${cx1}" cy="${cy}" rx="${w}" ry="${r}" fill="${p.glint}"/>
    <ellipse cx="${cx2}" cy="${cy}" rx="${w}" ry="${r}" fill="${p.glint}"/>
    <circle cx="${cx1 + 1}" cy="${cy + 1}" r="${r * 0.55}" fill="${p.eye}"/>
    <circle cx="${cx2 + 1}" cy="${cy + 1}" r="${r * 0.55}" fill="${p.eye}"/>`;
}

// ── CREATURE BUILDERS ──
const SHAPES = {
  // Round blob with two big eyes
  blob: p => `
    <ellipse cx="50" cy="62" rx="34" ry="28" fill="${p.body}"/>
    <ellipse cx="50" cy="55" rx="30" ry="22" fill="${p.light}" opacity=".45"/>
    <ellipse cx="50" cy="72" rx="30" ry="16" fill="${p.dark}" opacity=".35"/>
    ${eyes(40, 61, 56, 7, p, true)}`,

  // Octopus: dome head, curling legs
  octopus: p => `
    <path d="M18 62 Q18 26 50 26 Q82 26 82 62 Z" fill="${p.body}"/>
    <path d="M24 58 Q28 30 50 29 Q44 44 44 58 Z" fill="${p.light}" opacity=".4"/>
    ${[22, 33, 44, 56, 67, 78].map((x, i) =>
      `<path d="M${x} 60 q-3 14 ${i % 2 ? 6 : -6} 22 q4 6 8 2"
             stroke="${p.body}" stroke-width="7" fill="none" stroke-linecap="round"/>`).join('')}
    ${eyes(41, 60, 50, 7.5, p, true)}`,

  // Worm / serpent
  worm: p => `
    <path d="M20 82 q10 -20 26 -18 q16 2 10 -14 q-5 -14 12 -18"
          stroke="${p.body}" stroke-width="15" fill="none"
          stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M20 82 q10 -20 26 -18" stroke="${p.dark}" stroke-width="15"
          fill="none" stroke-linecap="round" opacity=".35"/>
    <circle cx="70" cy="30" r="13" fill="${p.body}"/>
    <circle cx="67" cy="26" r="9" fill="${p.light}" opacity=".45"/>
    ${eyes(66, 76, 29, 5, p)}`,

  // Crab: wide body, two claws
  crab: p => `
    <ellipse cx="50" cy="60" rx="27" ry="21" fill="${p.body}"/>
    <ellipse cx="50" cy="54" rx="23" ry="14" fill="${p.light}" opacity=".4"/>
    <path d="M25 52 q-16 -6 -18 -18 q10 -4 16 4 q6 8 4 14 Z" fill="${p.body}"/>
    <path d="M75 52 q16 -6 18 -18 q-10 -4 -16 4 q-6 8 -4 14 Z" fill="${p.body}"/>
    ${[30, 44, 58, 70].map(x =>
      `<path d="M${x} 78 l-3 9" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/>`).join('')}
    ${eyes(41, 60, 55, 6.5, p, true)}`,

  // Rabbit-ish: tall ears
  bunny: p => `
    <path d="M36 40 q-4 -26 3 -28 q8 -2 8 24 Z" fill="${p.body}"/>
    <path d="M58 38 q6 -25 12 -24 q6 3 -3 26 Z" fill="${p.body}"/>
    <ellipse cx="50" cy="62" rx="26" ry="24" fill="${p.body}"/>
    <ellipse cx="50" cy="56" rx="22" ry="16" fill="${p.light}" opacity=".4"/>
    <ellipse cx="76" cy="72" rx="9" ry="7" fill="${p.dark}"/>
    ${eyes(42, 60, 58, 6.5, p, true)}`,

  // Squid: pointed mantle, tentacle fringe
  squid: p => `
    <path d="M50 20 q22 16 22 42 q0 12 -22 12 q-22 0 -22 -12 q0 -26 22 -42 Z" fill="${p.body}"/>
    <path d="M50 24 q12 14 14 34 q-8 4 -14 2 Z" fill="${p.light}" opacity=".4"/>
    ${[32, 41, 50, 59, 68].map((x, i) =>
      `<path d="M${x} 72 q${i % 2 ? 5 : -5} 12 ${i % 2 ? -3 : 3} 18"
             stroke="${p.body}" stroke-width="6" fill="none" stroke-linecap="round"/>`).join('')}
    ${eyes(41, 60, 54, 7, p, true)}`,

  // Beetle / bug with antennae
  bug: p => `
    <path d="M30 34 q-8 -10 -12 -12" stroke="${p.dark}" stroke-width="3.5"
          fill="none" stroke-linecap="round"/>
    <path d="M70 34 q8 -10 12 -12" stroke="${p.dark}" stroke-width="3.5"
          fill="none" stroke-linecap="round"/>
    <ellipse cx="50" cy="60" rx="30" ry="24" fill="${p.body}"/>
    <path d="M50 36 v48" stroke="${p.dark}" stroke-width="3" opacity=".5"/>
    <ellipse cx="38" cy="52" rx="9" ry="7" fill="${p.light}" opacity=".5"/>
    <ellipse cx="62" cy="52" rx="9" ry="7" fill="${p.light}" opacity=".5"/>
    ${[26, 74].map(x =>
      `<path d="M${x} 68 l${x < 50 ? -8 : 8} 12" stroke="${p.dark}"
             stroke-width="4" stroke-linecap="round"/>`).join('')}
    ${eyes(41, 60, 44, 6, p, true)}`,

  // Bat: body plus scalloped wings
  bat: p => `
    <path d="M28 52 q-22 -14 -24 -2 q10 2 12 12 q8 -4 12 -10 Z" fill="${p.body}"/>
    <path d="M72 52 q22 -14 24 -2 q-10 2 -12 12 q-8 -4 -12 -10 Z" fill="${p.body}"/>
    <path d="M38 34 l4 -12 l6 11 Z" fill="${p.body}"/>
    <path d="M62 34 l-4 -12 l-6 11 Z" fill="${p.body}"/>
    <ellipse cx="50" cy="58" rx="23" ry="24" fill="${p.body}"/>
    <ellipse cx="50" cy="52" rx="18" ry="15" fill="${p.light}" opacity=".38"/>
    ${eyes(42, 59, 54, 6.5, p, true)}`,

  // Moth: broad upper wings
  moth: p => `
    <path d="M32 48 q-26 -18 -26 4 q0 16 24 14 Z" fill="${p.body}" opacity=".92"/>
    <path d="M68 48 q26 -18 26 4 q0 16 -24 14 Z" fill="${p.body}" opacity=".92"/>
    <path d="M34 62 q-18 8 -12 20 q10 4 16 -10 Z" fill="${p.dark}" opacity=".7"/>
    <path d="M66 62 q18 8 12 20 q-10 4 -16 -10 Z" fill="${p.dark}" opacity=".7"/>
    <ellipse cx="50" cy="58" rx="12" ry="24" fill="${p.body}"/>
    <path d="M44 30 q-6 -10 -10 -12" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M56 30 q6 -10 10 -12" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${eyes(45, 56, 42, 5, p, true)}`,

  // Fish with tail fin
  fish: p => `
    <path d="M22 60 l-14 -14 v28 Z" fill="${p.dark}"/>
    <ellipse cx="54" cy="60" rx="32" ry="21" fill="${p.body}"/>
    <ellipse cx="54" cy="54" rx="26" ry="13" fill="${p.light}" opacity=".4"/>
    <path d="M48 40 q8 -12 16 -6 q-6 4 -6 10 Z" fill="${p.dark}" opacity=".65"/>
    ${eyes(66, 77, 56, 6, p, true)}`,

  // Small humanoid
  imp: p => `
    <ellipse cx="50" cy="40" rx="21" ry="19" fill="${p.body}"/>
    <path d="M34 26 l-3 -12 l11 7 Z" fill="${p.body}"/>
    <path d="M66 26 l3 -12 l-11 7 Z" fill="${p.body}"/>
    <path d="M40 58 q10 -5 20 0 l4 24 q-14 5 -28 0 Z" fill="${p.body}"/>
    <path d="M40 62 q-12 6 -14 18" stroke="${p.body}" stroke-width="7"
          fill="none" stroke-linecap="round"/>
    <path d="M60 62 q12 6 14 18" stroke="${p.body}" stroke-width="7"
          fill="none" stroke-linecap="round"/>
    ${eyes(42, 59, 38, 6.5, p, true)}`,

  // Spiky lizard
  spike: p => `
    ${[34, 44, 54, 64].map((x, i) =>
      `<path d="M${x} 44 l6 -${12 + (i % 2) * 5} l6 ${12 + (i % 2) * 5} Z" fill="${p.dark}"/>`).join('')}
    <ellipse cx="50" cy="62" rx="31" ry="22" fill="${p.body}"/>
    <ellipse cx="50" cy="56" rx="25" ry="14" fill="${p.light}" opacity=".38"/>
    <path d="M19 66 q-12 6 -14 16" stroke="${p.body}" stroke-width="8"
          fill="none" stroke-linecap="round"/>
    ${[36, 52, 66].map(x =>
      `<path d="M${x} 82 l-2 8" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/>`).join('')}
    ${eyes(58, 73, 57, 6, p, true)}`,

  // Slime trailing small orbs
  orb: p => `
    <circle cx="22" cy="76" r="8" fill="${p.body}" opacity=".75"/>
    <circle cx="36" cy="82" r="5" fill="${p.body}" opacity=".55"/>
    <ellipse cx="58" cy="58" rx="30" ry="27" fill="${p.body}"/>
    <ellipse cx="58" cy="50" rx="24" ry="18" fill="${p.light}" opacity=".42"/>
    ${eyes(50, 69, 54, 7.5, p, true)}`,

  // Ghost with wavy hem
  wisp: p => `
    <path d="M22 62 q0 -34 28 -34 q28 0 28 34 v20
             q-7 -8 -14 0 q-7 8 -14 0 q-7 -8 -14 0 q-7 8 -14 0 Z" fill="${p.body}"/>
    <path d="M30 58 q0 -26 20 -27 q-9 12 -9 27 Z" fill="${p.light}" opacity=".4"/>
    ${eyes(42, 60, 52, 7, p, true)}`,
};

// ── ANTIVIRUZ (shield-guard enemies, visually distinct from pets) ──
const GUARD_SHAPES = {
  shield: p => `
    <path d="M50 16 l30 10 v26 q0 26 -30 34 q-30 -8 -30 -34 v-26 Z" fill="${p.body}"/>
    <path d="M50 22 l24 8 v22 q0 20 -24 27 Z" fill="${p.dark}" opacity=".35"/>
    <path d="M38 52 l8 9 l17 -19" stroke="${p.glint}" stroke-width="6"
          fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${eyes(41, 60, 42, 6, p, true)}`,

  scanner: p => `
    <rect x="20" y="34" width="60" height="42" rx="10" fill="${p.body}"/>
    <rect x="27" y="41" width="46" height="21" rx="5" fill="${p.dark}" opacity=".55"/>
    <path d="M50 34 v-12" stroke="${p.body}" stroke-width="4" stroke-linecap="round"/>
    <circle cx="50" cy="18" r="6" fill="${p.light}"/>
    ${eyes(40, 60, 51, 6, p, true)}
    ${[32, 50, 68].map(x =>
      `<rect x="${x - 4}" y="66" width="8" height="5" rx="2" fill="${p.dark}" opacity=".6"/>`).join('')}`,

  turret: p => `
    <path d="M26 78 q24 -10 48 0 v6 h-48 Z" fill="${p.dark}"/>
    <ellipse cx="50" cy="56" rx="24" ry="22" fill="${p.body}"/>
    <rect x="70" y="50" width="24" height="11" rx="4" fill="${p.dark}"/>
    <ellipse cx="50" cy="50" rx="18" ry="14" fill="${p.light}" opacity=".38"/>
    ${eyes(42, 59, 53, 6.5, p, true)}`,

  sentinel: p => `
    <path d="M50 14 l26 14 v28 q0 22 -26 30 q-26 -8 -26 -30 v-28 Z" fill="${p.body}"/>
    <path d="M50 26 l14 8 v18 q0 12 -14 17 q-14 -5 -14 -17 v-18 Z"
          fill="${p.dark}" opacity=".45"/>
    <circle cx="50" cy="48" r="8" fill="${p.glint}" opacity=".9"/>
    <circle cx="50" cy="48" r="4" fill="${p.eye}"/>`,
};

export const SHAPE_KEYS = Object.keys(SHAPES);
export const GUARD_KEYS = Object.keys(GUARD_SHAPES);

// Build the full SVG for a creature.
export function creatureSVG(shape, color, opts = {}) {
  const p = paletteFor(color);
  const builder = SHAPES[shape] || GUARD_SHAPES[shape] || SHAPES.blob;
  const cls = opts.className || '';
  return `<svg class="${cls}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <ellipse cx="50" cy="93" rx="26" ry="5" fill="#000" opacity=".28"/>
    <g class="cr-body">${builder(p)}</g>
  </svg>`;
}

// ── UNIFIED CREATURE RENDERER ──
// A species is drawn from EITHER a `gif` (real animated art under
// assets/sprites/<gif>/) or a procedural `shape` (inline SVG above).
// Everything else in the game calls creatureMarkup() and never needs
// to know which. To convert an SVG species to real art later, just
// add `gif:'<folder>'` to it in data.js — no renderer changes needed.

const SPRITE_BASE = 'assets/sprites';

export function gifURL(gif, anim) {
  return `${SPRITE_BASE}/${gif}/${anim}.gif`;
}

// CSS filter that recolours raster art toward the attribute hue.
// SVG creatures don't need this (their fills are already themed),
// but GIFs are fixed-colour so they get tinted here.
export function hueFilter(attr) {
  const h = attr && attr.hue;
  if (!h) return '';
  return `hue-rotate(${h.rotate}deg) saturate(${h.sat}) brightness(${h.bright})`;
}

// Returns markup for a creature in either format.
//   species : entry from SPECIES (has .gif or .shape)
//   attr    : entry from ATTR (colour + hue)
export function creatureMarkupFor(species, attr, cls = '', anim = 'still') {
  const color = (attr && attr.color) || '#8fa8c8';
  if (species && species.gif) {
    const filt = hueFilter(attr);
    const style = filt ? ` style="filter:${filt}"` : '';
    return `<img class="${cls} is-gif" src="${gifURL(species.gif, anim)}"` +
           ` alt="${species.name || ''}"${style}>`;
  }
  return creatureSVG((species && species.shape) || 'blob', color, { className: cls });
}
