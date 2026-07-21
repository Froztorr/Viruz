// ═══════════════════════════════════════════════════════════
// VIRUZ PET — SPRITES
// Creatures are inline SVG. Each species owns a FIXED palette —
// colour is identity, not attribute. A blue whale stays blue
// whether it rolls Red or Green.
//
// Builders draw into a 100x100 viewBox facing RIGHT.
// Enemies are flipped horizontally by the renderer.
// ═══════════════════════════════════════════════════════════

const SPRITE_BASE = 'assets/sprites';

// body / dark (shadow+outline) / light (highlight) / accent / trim
export const PALETTES = {
  slime_royal:  { body:'#2b3f9e', dark:'#16215c', light:'#5f78e0', accent:'#e8ecff', trim:'#f0c04a' },
  bull_demon:   { body:'#241f28', dark:'#100d12', light:'#413647', accent:'#d02a2a', trim:'#c9a54e' },
  beast_violet: { body:'#6b4a9c', dark:'#38265a', light:'#9a76c8', accent:'#e0392b', trim:'#2a1b45' },
  angel_light:  { body:'#f7f3e6', dark:'#c9bda0', light:'#ffffff', accent:'#7fd6ff', trim:'#e8c65a' },
  toxin_green:  { body:'#4a9c3f', dark:'#255421', light:'#7fd06a', accent:'#d8f36a', trim:'#1b3a17' },
  crimson_worm: { body:'#b8323c', dark:'#6b1620', light:'#e8686f', accent:'#f0d060', trim:'#3d0c12' },
  frost_squid:  { body:'#3fa8c9', dark:'#1e5f78', light:'#7ddcf0', accent:'#e8faff', trim:'#164856' },
  ember_moth:   { body:'#d4622a', dark:'#7a2f10', light:'#f09a5c', accent:'#ffd98a', trim:'#3d1608' },
  shadow_bat:   { body:'#3a3550', dark:'#1c1828', light:'#605a7d', accent:'#b84ae0', trim:'#0f0d16' },
  steel_crab:   { body:'#7d8794', dark:'#434b56', light:'#b4bcc7', accent:'#e05a2a', trim:'#2a3038' },
  sand_bug:     { body:'#b89a4e', dark:'#6b5624', light:'#e0c77e', accent:'#4a3a14', trim:'#2e2410' },
  deep_fish:    { body:'#2f6d8c', dark:'#173a4d', light:'#5fa5c4', accent:'#f0a83c', trim:'#0d222e' },
  void_wisp:    { body:'#4a3a6b', dark:'#241b38', light:'#7d68a0', accent:'#9fe8ff', trim:'#130e1f' },
  spike_lizard: { body:'#8c5a2a', dark:'#4d2f12', light:'#c08a4e', accent:'#e0d05a', trim:'#2a1808' },
  av_shield:    { body:'#4a7fc4', dark:'#23446e', light:'#82b4e8', accent:'#e8f4ff', trim:'#16293f' },
  av_scanner:   { body:'#5a6470', dark:'#2e353d', light:'#8f99a6', accent:'#5ae0c4', trim:'#1a1f24' },
  av_turret:    { body:'#6b5a70', dark:'#382e3d', light:'#9d88a3', accent:'#e05a5a', trim:'#1f1824' },
  av_sentinel:  { body:'#3f6b8c', dark:'#1e364a', light:'#6fa3c4', accent:'#ffd45a', trim:'#101f2b' },
};

// Shared eye styles
function eyesRound(cx1, cx2, cy, r, p) {
  return `
    <ellipse cx="${cx1}" cy="${cy}" rx="${r*1.15}" ry="${r}" fill="#fff"/>
    <ellipse cx="${cx2}" cy="${cy}" rx="${r*1.15}" ry="${r}" fill="#fff"/>
    <circle cx="${cx1+1}" cy="${cy+1}" r="${r*0.52}" fill="#141018"/>
    <circle cx="${cx2+1}" cy="${cy+1}" r="${r*0.52}" fill="#141018"/>
    <circle cx="${cx1-1}" cy="${cy-1.5}" r="${r*0.2}" fill="#fff"/>
    <circle cx="${cx2-1}" cy="${cy-1.5}" r="${r*0.2}" fill="#fff"/>`;
}
function eyesGlow(cx1, cx2, cy, r, col) {
  return `
    <ellipse cx="${cx1}" cy="${cy}" rx="${r*1.3}" ry="${r*0.75}" fill="${col}" opacity=".35"/>
    <ellipse cx="${cx2}" cy="${cy}" rx="${r*1.3}" ry="${r*0.75}" fill="${col}" opacity=".35"/>
    <ellipse cx="${cx1}" cy="${cy}" rx="${r*0.8}" ry="${r*0.45}" fill="${col}"/>
    <ellipse cx="${cx2}" cy="${cy}" rx="${r*0.8}" ry="${r*0.45}" fill="${col}"/>`;
}

// ── CREATURE BUILDERS ──
const SHAPES = {
  royalslime: p => `
    <ellipse cx="50" cy="66" rx="38" ry="26" fill="${p.body}"/>
    <path d="M12 66 q0 -26 38 -26 q38 0 38 26 Z" fill="${p.light}" opacity=".35"/>
    <ellipse cx="50" cy="78" rx="34" ry="13" fill="${p.dark}" opacity=".45"/>
    <path d="M30 42 l4 -14 l7 9 l9 -13 l9 13 l7 -9 l4 14 Z" fill="${p.trim}" stroke="${p.dark}" stroke-width="1.5"/>
    <circle cx="34" cy="29" r="2.5" fill="${p.dark}"/>
    <circle cx="50" cy="25" r="2.5" fill="${p.dark}"/>
    <circle cx="66" cy="29" r="2.5" fill="${p.dark}"/>
    <path d="M28 64 q22 -8 44 0 q-4 16 -22 16 q-18 0 -22 -16 Z" fill="${p.accent}"/>
    ${[36,44,52,60,68].map(x=>`<path d="M${x} 62 v16" stroke="${p.dark}" stroke-width="1.4" opacity=".55"/>`).join('')}
    <ellipse cx="38" cy="54" rx="6" ry="4" fill="#fff" opacity=".85"/>
    <ellipse cx="62" cy="54" rx="6" ry="4" fill="#fff" opacity=".85"/>`,

  demonbull: p => `
    <ellipse cx="52" cy="62" rx="33" ry="24" fill="${p.body}"/>
    <path d="M22 60 q30 -22 60 0 q-6 -18 -30 -18 q-24 0 -30 18 Z" fill="${p.light}" opacity=".3"/>
    ${[[30,68],[44,74],[60,74],[74,68]].map(([x,y])=>
      `<rect x="${x-4}" y="${y}" width="8" height="16" rx="2" fill="${p.dark}"/>`).join('')}
    <path d="M28 44 q-10 -16 2 -22 q10 -2 12 14 Z" fill="${p.trim}" stroke="${p.dark}" stroke-width="1.5"/>
    <path d="M74 44 q10 -16 -2 -22 q-10 -2 -12 14 Z" fill="${p.trim}" stroke="${p.dark}" stroke-width="1.5"/>
    <path d="M26 22 q3 -11 7 -13 q4 9 -1 15 Z" fill="${p.accent}"/>
    <path d="M74 22 q-3 -11 -7 -13 q-4 9 1 15 Z" fill="${p.accent}"/>
    ${[[36,54],[56,50],[68,60]].map(([x,y])=>
      `<path d="M${x} ${y} q6 -8 12 -2 q-6 6 -12 2" fill="${p.accent}" opacity=".7"/>`).join('')}
    ${eyesGlow(42, 62, 56, 6, p.accent)}
    <ellipse cx="52" cy="70" rx="10" ry="6" fill="${p.dark}"/>
    <circle cx="47" cy="70" r="2" fill="${p.light}"/>
    <circle cx="57" cy="70" r="2" fill="${p.light}"/>`,

  violetbeast: p => `
    <path d="M14 78 q-6 -10 0 -16" stroke="${p.dark}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="52" cy="64" rx="34" ry="23" fill="${p.body}"/>
    ${[[26,44],[38,36],[52,32],[66,36],[78,44]].map(([x,y],i)=>
      `<path d="M${x} ${y+14} l${i<2?-3:3} -${14+i*2} l${i<2?9:-9} ${10+i*2} Z" fill="${p.dark}"/>`).join('')}
    <path d="M20 62 q32 -20 64 0 q-8 -16 -32 -16 q-24 0 -32 16 Z" fill="${p.light}" opacity=".35"/>
    ${[[34,62],[50,58],[64,64]].map(([x,y])=>
      `<path d="M${x} ${y} q5 -7 11 -1 q-5 5 -11 1" fill="${p.accent}" opacity=".75"/>`).join('')}
    <ellipse cx="60" cy="58" rx="11" ry="9" fill="${p.accent}"/>
    <ellipse cx="60" cy="58" rx="7" ry="6" fill="#fff"/>
    <circle cx="61" cy="59" r="3.5" fill="#141018"/>
    ${[[32,80],[46,84],[62,84],[76,80]].map(([x,y])=>
      `<path d="M${x} ${y-8} v10 l-3 4 h8 l-3 -4 v-10 Z" fill="${p.dark}"/>`).join('')}`,

  angelwing: p => `
    <ellipse cx="50" cy="22" rx="15" ry="4" fill="none" stroke="${p.trim}" stroke-width="3"/>
    <path d="M30 46 q-24 -6 -26 12 q14 10 26 2 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1.2"/>
    <path d="M70 46 q24 -6 26 12 q-14 10 -26 2 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1.2"/>
    <ellipse cx="50" cy="40" rx="18" ry="17" fill="${p.body}"/>
    <path d="M32 36 q6 -14 18 -14 q12 0 18 14 q-18 -6 -36 0 Z" fill="${p.trim}"/>
    <path d="M38 62 q12 -6 24 0 l3 20 q-15 5 -30 0 Z" fill="${p.light}" stroke="${p.dark}" stroke-width="1.2"/>
    <path d="M46 66 l4 8 l4 -8" stroke="${p.accent}" stroke-width="2.5" fill="none"/>
    ${eyesRound(43, 57, 40, 4.5, p)}
    <path d="M46 47 q4 3 8 0" stroke="${p.dark}" stroke-width="1.5" fill="none"/>`,

  toxinblob: p => `
    <ellipse cx="50" cy="64" rx="33" ry="26" fill="${p.body}"/>
    <path d="M17 64 q0 -26 33 -26 q33 0 33 26 Z" fill="${p.light}" opacity=".4"/>
    ${[[26,84],[42,88],[60,87],[74,83]].map(([x,y])=>
      `<ellipse cx="${x}" cy="${y}" rx="4" ry="6" fill="${p.body}" opacity=".8"/>`).join('')}
    ${[[34,52,5],[62,48,4],[70,60,3]].map(([x,y,r])=>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.accent}" opacity=".6"/>`).join('')}
    ${eyesRound(40, 60, 58, 7, p)}
    <path d="M42 74 q8 6 16 0" stroke="${p.dark}" stroke-width="2" fill="none"/>`,

  crimworm: p => `
    ${[[22,80,9],[36,74,10],[50,66,11]].map(([x,y,r])=>
      `<circle cx="${x}" cy="${y}" r="${r}" fill="${p.dark}"/>
       <circle cx="${x}" cy="${y-1}" r="${r-3}" fill="${p.body}"/>`).join('')}
    <circle cx="68" cy="52" r="16" fill="${p.dark}"/>
    <circle cx="68" cy="51" r="13" fill="${p.body}"/>
    <path d="M56 46 q12 -8 24 0 q-6 -8 -12 -8 q-6 0 -12 8 Z" fill="${p.light}" opacity=".5"/>
    ${eyesRound(62, 76, 48, 5, p)}
    <path d="M60 60 q8 5 16 0" stroke="${p.trim}" stroke-width="2.5" fill="none"/>
    <path d="M62 38 q-4 -10 -8 -12" stroke="${p.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M76 38 q4 -10 8 -12" stroke="${p.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="53" cy="25" r="3" fill="${p.trim}"/>
    <circle cx="85" cy="25" r="3" fill="${p.trim}"/>`,

  frostsquid: p => `
    <path d="M50 16 q24 18 24 44 q0 12 -24 12 q-24 0 -24 -12 q0 -26 24 -44 Z" fill="${p.body}"/>
    <path d="M50 22 q14 15 16 36 q-9 4 -16 3 Z" fill="${p.light}" opacity=".45"/>
    ${[30,39,48,57,66].map((x,i)=>
      `<path d="M${x} 70 q${i%2?6:-6} 12 ${i%2?-4:4} 20"
             stroke="${p.body}" stroke-width="7" fill="none" stroke-linecap="round"/>
       <path d="M${x} 70 q${i%2?6:-6} 12 ${i%2?-4:4} 20"
             stroke="${p.light}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".5"/>`).join('')}
    ${[[36,30],[64,30],[50,20]].map(([x,y])=>
      `<path d="M${x} ${y} l3 -7 l3 7 l-3 6 Z" fill="${p.accent}" opacity=".9"/>`).join('')}
    ${eyesRound(40, 60, 52, 7, p)}`,

  embermoth: p => `
    <path d="M34 46 q-30 -20 -30 6 q0 20 28 16 Z" fill="${p.body}"/>
    <path d="M66 46 q30 -20 30 6 q0 20 -28 16 Z" fill="${p.body}"/>
    <path d="M34 46 q-22 -14 -22 4 q0 14 20 12 Z" fill="${p.light}" opacity=".55"/>
    <path d="M66 46 q22 -14 22 4 q0 14 -20 12 Z" fill="${p.light}" opacity=".55"/>
    ${[[18,50],[26,58],[82,50],[74,58]].map(([x,y])=>
      `<circle cx="${x}" cy="${y}" r="4" fill="${p.accent}" opacity=".85"/>`).join('')}
    <path d="M36 64 q-16 10 -10 20 q10 3 15 -12 Z" fill="${p.dark}" opacity=".8"/>
    <path d="M64 64 q16 10 10 20 q-10 3 -15 -12 Z" fill="${p.dark}" opacity=".8"/>
    <ellipse cx="50" cy="58" rx="11" ry="24" fill="${p.dark}"/>
    <ellipse cx="50" cy="54" rx="7" ry="16" fill="${p.body}"/>
    ${[46,54,62].map(y=>`<path d="M43 ${y} h14" stroke="${p.trim}" stroke-width="1.5" opacity=".6"/>`).join('')}
    <path d="M44 30 q-7 -11 -12 -13" stroke="${p.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M56 30 q7 -11 12 -13" stroke="${p.dark}" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    ${eyesGlow(45, 55, 40, 5, p.accent)}`,

  shadowbat: p => `
    <path d="M28 50 q-26 -18 -26 2 q0 8 6 12 q4 -6 8 -2 q2 8 8 6 q2 -8 4 -18 Z" fill="${p.body}"/>
    <path d="M72 50 q26 -18 26 2 q0 8 -6 12 q-4 -6 -8 -2 q-2 8 -8 6 q-2 -8 -4 -18 Z" fill="${p.body}"/>
    <path d="M28 50 q-18 -12 -18 2 q0 6 5 9 Z" fill="${p.light}" opacity=".4"/>
    <path d="M72 50 q18 -12 18 2 q0 6 -5 9 Z" fill="${p.light}" opacity=".4"/>
    <path d="M38 32 l3 -14 l7 12 Z" fill="${p.body}"/>
    <path d="M62 32 l-3 -14 l-7 12 Z" fill="${p.body}"/>
    <ellipse cx="50" cy="56" rx="22" ry="23" fill="${p.body}"/>
    <ellipse cx="50" cy="50" rx="16" ry="14" fill="${p.light}" opacity=".35"/>
    ${eyesGlow(42, 58, 52, 6, p.accent)}
    <path d="M44 66 q6 5 12 0 l-3 5 h-6 Z" fill="${p.trim}"/>
    <path d="M45 68 v5 M55 68 v5" stroke="#fff" stroke-width="1.5"/>`,

  steelcrab: p => `
    <path d="M22 50 q-18 -8 -20 -22 q12 -5 19 5 q7 10 5 17 Z" fill="${p.body}" stroke="${p.dark}" stroke-width="1.5"/>
    <path d="M78 50 q18 -8 20 -22 q-12 -5 -19 5 q-7 10 -5 17 Z" fill="${p.body}" stroke="${p.dark}" stroke-width="1.5"/>
    <ellipse cx="50" cy="62" rx="30" ry="22" fill="${p.body}"/>
    <path d="M22 58 q28 -18 56 0 q-8 -14 -28 -14 q-20 0 -28 14 Z" fill="${p.light}" opacity=".45"/>
    <path d="M30 62 h40 M34 70 h32" stroke="${p.dark}" stroke-width="1.5" opacity=".6"/>
    ${[28,42,58,72].map(x=>
      `<path d="M${x} 80 l-4 10" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/>`).join('')}
    <ellipse cx="40" cy="54" rx="6" ry="7" fill="${p.accent}"/>
    <ellipse cx="60" cy="54" rx="6" ry="7" fill="${p.accent}"/>
    <circle cx="40" cy="55" r="2.5" fill="#141018"/>
    <circle cx="60" cy="55" r="2.5" fill="#141018"/>`,

  sandbug: p => `
    <path d="M32 34 q-10 -12 -16 -14" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M68 34 q10 -12 16 -14" stroke="${p.dark}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="15" cy="19" r="3.5" fill="${p.accent}"/>
    <circle cx="85" cy="19" r="3.5" fill="${p.accent}"/>
    <ellipse cx="50" cy="60" rx="32" ry="26" fill="${p.body}"/>
    <path d="M50 34 v52" stroke="${p.dark}" stroke-width="3.5"/>
    <path d="M20 56 q30 -18 60 0" stroke="${p.dark}" stroke-width="2" fill="none" opacity=".5"/>
    <ellipse cx="34" cy="52" rx="10" ry="8" fill="${p.light}" opacity=".55"/>
    <ellipse cx="66" cy="52" rx="10" ry="8" fill="${p.light}" opacity=".55"/>
    ${[[26,72],[74,72]].map(([x,y])=>
      `<path d="M${x} ${y} l${x<50?-10:10} 14" stroke="${p.dark}" stroke-width="4" stroke-linecap="round"/>`).join('')}
    ${eyesRound(41, 59, 42, 5.5, p)}`,

  deepfish: p => `
    <path d="M20 62 l-16 -16 v32 Z" fill="${p.dark}"/>
    <path d="M20 62 l-11 -10 v20 Z" fill="${p.body}"/>
    <ellipse cx="54" cy="62" rx="33" ry="23" fill="${p.body}"/>
    <ellipse cx="54" cy="56" rx="27" ry="14" fill="${p.light}" opacity=".4"/>
    <path d="M46 40 q10 -14 19 -6 q-7 4 -8 11 Z" fill="${p.dark}"/>
    <path d="M62 30 q6 -14 -2 -18 q-8 6 -4 16" stroke="${p.dark}" stroke-width="2.5" fill="none"/>
    <circle cx="58" cy="12" r="5" fill="${p.accent}"/>
    <circle cx="58" cy="12" r="8" fill="${p.accent}" opacity=".3"/>
    <path d="M70 70 q12 4 14 10 q-10 2 -16 -4 Z" fill="${p.dark}" opacity=".7"/>
    ${[62,70,76].map(x=>`<path d="M${x} 56 v14" stroke="${p.dark}" stroke-width="1.4" opacity=".45"/>`).join('')}
    ${eyesRound(66, 78, 56, 5.5, p)}
    <path d="M74 68 q6 4 10 0" stroke="${p.trim}" stroke-width="2" fill="none"/>`,

  voidwisp: p => `
    <path d="M22 60 q0 -36 28 -36 q28 0 28 36 v22
             q-7 -9 -14 0 q-7 9 -14 0 q-7 -9 -14 0 q-7 9 -14 0 Z" fill="${p.body}"/>
    <path d="M30 56 q0 -28 20 -29 q-10 13 -10 29 Z" fill="${p.light}" opacity=".4"/>
    ${[[32,38],[68,38],[50,30]].map(([x,y])=>
      `<circle cx="${x}" cy="${y}" r="2.5" fill="${p.accent}" opacity=".8"/>`).join('')}
    ${eyesGlow(41, 59, 52, 7, p.accent)}
    <ellipse cx="50" cy="66" rx="7" ry="5" fill="${p.dark}" opacity=".8"/>`,

  spikelizard: p => `
    ${[30,41,52,63].map((x,i)=>
      `<path d="M${x} 46 l6 -${14+(i%2)*6} l7 ${14+(i%2)*6} Z" fill="${p.trim}"/>`).join('')}
    <ellipse cx="52" cy="64" rx="32" ry="22" fill="${p.body}"/>
    <path d="M22 60 q30 -18 60 0 q-8 -14 -30 -14 q-22 0 -30 14 Z" fill="${p.light}" opacity=".4"/>
    <path d="M20 66 q-14 8 -16 20" stroke="${p.body}" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${[[36,84],[54,86],[70,84]].map(([x,y])=>
      `<path d="M${x} ${y-6} v8 l-3 4 h8 l-3 -4 v-8 Z" fill="${p.dark}"/>`).join('')}
    ${[[40,62],[58,58],[70,66]].map(([x,y])=>
      `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.5" fill="${p.accent}" opacity=".5"/>`).join('')}
    ${eyesRound(60, 74, 56, 5.5, p)}
    <path d="M68 68 q7 4 12 0" stroke="${p.dark}" stroke-width="2" fill="none"/>`,
};

// ── ANTIVIRUZ ──
const GUARD_SHAPES = {
  shield: p => `
    <path d="M50 12 l32 11 v28 q0 28 -32 37 q-32 -9 -32 -37 v-28 Z" fill="${p.body}" stroke="${p.trim}" stroke-width="2"/>
    <path d="M50 20 l24 8 v22 q0 21 -24 28 Z" fill="${p.dark}" opacity=".4"/>
    <path d="M36 50 l9 10 l19 -22" stroke="${p.accent}" stroke-width="7"
          fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${eyesGlow(41, 60, 38, 5, p.accent)}`,

  scanner: p => `
    <rect x="18" y="34" width="64" height="44" rx="9" fill="${p.body}" stroke="${p.trim}" stroke-width="2"/>
    <rect x="25" y="41" width="50" height="24" rx="4" fill="${p.dark}"/>
    ${[30,42,54,66].map(x=>
      `<rect x="${x}" y="46" width="3" height="14" fill="${p.accent}" opacity=".8"/>`).join('')}
    <path d="M50 34 v-14" stroke="${p.body}" stroke-width="4"/>
    <circle cx="50" cy="15" r="7" fill="${p.accent}"/>
    <circle cx="50" cy="15" r="11" fill="${p.accent}" opacity=".25"/>
    ${[28,50,72].map(x=>
      `<rect x="${x-5}" y="69" width="10" height="5" rx="2" fill="${p.dark}"/>`).join('')}`,

  turret: p => `
    <path d="M24 80 q26 -12 52 0 v6 h-52 Z" fill="${p.dark}"/>
    <ellipse cx="48" cy="56" rx="25" ry="23" fill="${p.body}" stroke="${p.trim}" stroke-width="2"/>
    <rect x="68" y="49" width="28" height="13" rx="4" fill="${p.dark}"/>
    <rect x="90" y="51" width="6" height="9" rx="2" fill="${p.accent}"/>
    <ellipse cx="48" cy="50" rx="18" ry="13" fill="${p.light}" opacity=".4"/>
    ${eyesGlow(40, 57, 54, 6, p.accent)}
    <path d="M30 72 h36" stroke="${p.dark}" stroke-width="2" opacity=".6"/>`,

  sentinel: p => `
    <path d="M50 10 l28 15 v30 q0 24 -28 33 q-28 -9 -28 -33 v-30 Z" fill="${p.body}" stroke="${p.trim}" stroke-width="2"/>
    <path d="M50 22 l16 9 v20 q0 13 -16 19 q-16 -6 -16 -19 v-20 Z" fill="${p.dark}" opacity=".5"/>
    <circle cx="50" cy="48" r="10" fill="${p.accent}" opacity=".9"/>
    <circle cx="50" cy="48" r="5" fill="#141018"/>
    <circle cx="50" cy="48" r="14" fill="${p.accent}" opacity=".2"/>
    ${[[34,30],[66,30]].map(([x,y])=>
      `<circle cx="${x}" cy="${y}" r="3" fill="${p.accent}" opacity=".7"/>`).join('')}`,
};

export const SHAPE_KEYS = Object.keys(SHAPES);
export const GUARD_KEYS = Object.keys(GUARD_SHAPES);

// Build the full SVG for a creature.
// Art folders may hold .gif (animated) or .png (still art). A species
// declares its extension via `ext`; default stays .gif so existing
// species keep working unchanged.
export function gifURL(gif, anim, ext = 'gif') {
  return `${SPRITE_BASE}/${gif}/${anim}.${ext}`;
}

// Build the SVG for a creature using its OWN fixed palette.
export function creatureSVG(shape, paletteKey, opts = {}) {
  const p = PALETTES[paletteKey] || PALETTES.slime_royal;
  const builder = SHAPES[shape] || GUARD_SHAPES[shape] || SHAPES.royalslime;
  const cls = opts.className || '';
  return `<svg class="${cls}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
    preserveAspectRatio="xMidYMax meet" aria-hidden="true">
    <ellipse cx="50" cy="94" rx="27" ry="5" fill="#000" opacity=".3"/>
    <g class="cr-body">${builder(p)}</g>
  </svg>`;
}

// Unified renderer — GIF art or procedural SVG, chosen per species.
// NOTE: attribute is intentionally ignored for colour. A creature's
// palette is part of its identity, like VR2's blue whale / red bull.
export function creatureMarkupFor(species, _attr, cls = '', anim = 'still') {
  if (species && species.gif) {
    const ext = species.ext || 'gif';
    return `<img class="${cls} is-gif" src="${gifURL(species.gif, anim, ext)}" alt="${species.name || ''}">`;
  }
  return creatureSVG(
    (species && species.shape) || 'royalslime',
    (species && species.palette) || 'slime_royal',
    { className: cls }
  );
}
