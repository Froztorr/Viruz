// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { AILMENTS, POTIONS, SPECIALS, THROW_POISONS, THROW_UTILITY_POTIONS } from '../data.js';
import { addAilment, clamp, clearAilments, statsOf, uid, unlockedSpecials } from '../engine.js';
import { healPop, refreshBattleUnits } from './combat.js';
import { activeAlly, activeFoe, markSpecialUsed } from './turn-loop.js';
import { renderInvThrowLoadout } from '../screens/inventory.js';
import { potionIconHtml } from '../screens/pet-detail.js';
import { $, G, battle, el, save } from '../state.js';
import { blog, toast } from '../ui-shell.js';

// ── SPECIAL SKILL BAR ──
// Unlocked specials for the ACTIVE fighter. Tapping toggles auto-cast:
// when on, the pet uses it automatically each turn until MP runs out.
export function renderSkillBar() {
  const bar = $('skill-bar');
  if (!bar || !battle) return;
  const pet = activeAlly();
  bar.innerHTML = '';
  if (!pet) return;
  const list = unlockedSpecials(pet);
  if (!list.length) {
    bar.innerHTML = `<div class="sk-empty">ยังไม่มีสกิลพิเศษ — ปลดล็อกในผังสกิล</div>`;
    return;
  }
  pet.autoCast = pet.autoCast || {};
  list.forEach(sp => {
    const on = !!pet.autoCast[sp.id];
    const afford = (pet.mp || 0) >= sp.mp;
    const b = el('button','sk-btn' + (on ? ' on' : '') + (afford ? '' : ' poor'));
    b.dataset.petUid = pet.uid;
    b.dataset.spId = sp.id;
    b.innerHTML = `
      <span class="sk-name">${sp.name}</span>
      <span class="sk-cost-cd">MP ${sp.mp} · ${(sp.cd || 3.5).toFixed(1)}s</span>
      <span class="sk-auto">${on ? '● AUTO' : '○ ปิด'}</span>
      <span class="sk-cd-overlay"><b class="sk-cd-num"></b></span>`;
    b.title = `${sp.thai} — ${sp.desc}`;
    b.onclick = () => {
      pet.autoCast[sp.id] = !pet.autoCast[sp.id];
      save(); renderSkillBar();
    };
    bar.appendChild(b);
  });
  refreshSkillCooldownUI();
}

// Ticks every skill button's darken-overlay + live countdown number,
// reading directly from the unit's _cooldowns map (set by
// markSpecialUsed). Runs on an interval while a battle is active so
// the number counts down smoothly rather than jumping.
let skillCdTimer = null;
function refreshSkillCooldownUI() {
  const pet = activeAlly();
  if (!pet) return;
  document.querySelectorAll('#skill-bar .sk-btn').forEach(btn => {
    const spId = btn.dataset.spId;
    const until = pet._cooldowns && pet._cooldowns[spId];
    const remainMs = until ? Math.max(0, until - Date.now()) : 0;
    const overlay = btn.querySelector('.sk-cd-overlay');
    const num = btn.querySelector('.sk-cd-num');
    if (remainMs > 0) {
      btn.classList.add('on-cooldown');
      overlay.style.opacity = '1';
      num.textContent = (remainMs / 1000).toFixed(1) + 's';
    } else {
      btn.classList.remove('on-cooldown');
      overlay.style.opacity = '0';
    }
  });
}
export function startSkillCooldownTicker() {
  clearInterval(skillCdTimer);
  skillCdTimer = setInterval(() => {
    if (battle && !battle.over) refreshSkillCooldownUI();
    else clearInterval(skillCdTimer);
  }, 100);
}

// ── THROWABLE POTIONS / POISONS ──
// Two pouches now sit where the old tap-to-heal potion row was: a
// potion satchel (left, self-applying — heals from the same G.potions
// bag as before, plus free utility buffs) and a poison pouch (right,
// curses meant for the enemy). Press-hold-drag opens a radial wheel of
// up to 5 slotted items (see G.throwLoadout / renderInvThrowLoadout()
// for how the player picks which 5), dragging past the wheel's lock
// radius picks a wedge, then the icon follows the finger until
// released ("flicked") over a side of the battlefield — whichever unit
// is ACTUALLY under the release point gets the effect, which is what
// makes flicking a potion at the enemy heal them, or a curse at your
// own ally curse them instead, for free (see resolveThrow() below).
export function throwPool(kind) {
  return kind === 'potion' ? [...POTIONS, ...THROW_UTILITY_POTIONS] : THROW_POISONS;
}
export function throwLoadout(kind) {
  const pool = throwPool(kind);
  const ids = (G.throwLoadout && G.throwLoadout[kind] && G.throwLoadout[kind].length)
    ? G.throwLoadout[kind] : pool.map(x => x.id).slice(0, 5);
  return ids.map(id => pool.find(x => x.id === id)).filter(Boolean).slice(0, 5);
}
// Every throwable item now needs real stock to show up in its wheel —
// potions (heal AND the free-slot utility ones alike) draw from
// G.potions, poisons from G.poisons, both bought at a shop. An item
// with 0 left simply isn't offered (see startThrowGesture()'s filter).
export function throwItemAvailable(item, kind) {
  const bag = kind === 'poison' ? G.poisons : G.potions;
  return !!(bag && bag[item.id] > 0);
}
function throwItemStock(item, kind) {
  const bag = kind === 'poison' ? G.poisons : G.potions;
  return (bag && bag[item.id]) || 0;
}
function itemOnCooldown(id) {
  if (!battle) return false;
  const until = battle.itemCooldowns && battle.itemCooldowns[id];
  return !!(until && Date.now() < until);
}
function startItemCooldown(id) {
  if (!battle) return;
  battle.itemCooldowns = battle.itemCooldowns || {};
  battle.itemCooldowns[id] = Date.now() + 10000;
}

export function renderPotionBar() {
  const potionPouch = $('throw-potion-pouch');
  const poisonPouch = $('throw-poison-pouch');
  if (potionPouch) {
    const any = throwLoadout('potion').some(it => throwItemAvailable(it, 'potion') && !itemOnCooldown(it.id));
    potionPouch.classList.toggle('on-cd', !any);
  }
  if (poisonPouch) {
    const any = throwLoadout('poison').some(it => throwItemAvailable(it, 'poison') && !itemOnCooldown(it.id));
    poisonPouch.classList.toggle('on-cd', !any);
  }
}

let throwGesture = null;
export function wireThrowPouches() {
  ['potion', 'poison'].forEach(kind => {
    const pouch = $(kind === 'potion' ? 'throw-potion-pouch' : 'throw-poison-pouch');
    if (!pouch) return;
    pouch.addEventListener('pointerdown', e => startThrowGesture(e, kind));
  });
  window.addEventListener('pointermove', onThrowPointerMove);
  window.addEventListener('pointerup', onThrowPointerUp);
  window.addEventListener('pointercancel', onThrowPointerUp);
}

const THROW_LOCK_R = 34;   // px dragged from the pouch before a wedge locks in
const THROW_WHEEL_R = 78;  // px radius the wedges sit at

function startThrowGesture(e, kind) {
  if (!battle || battle.over) return;
  const items = throwLoadout(kind).filter(it => throwItemAvailable(it, kind) && !itemOnCooldown(it.id));
  if (!items.length) { toast(kind === 'potion' ? 'ยาหมดหรือติดคูลดาวน์ทั้งหมด' : 'พิษหมดหรือติดคูลดาวน์ทั้งหมด'); return; }
  e.preventDefault();
  const layer = $('throw-layer');
  if (!layer) return;
  layer.innerHTML = '';
  const cx = e.clientX, cy = e.clientY;
  const n = items.length;
  const arc = Math.min(200, 40 * n);
  const startDeg = -90 - arc / 2;
  const wedges = items.map((item, i) => {
    const deg = n === 1 ? -90 : startDeg + (arc * i) / (n - 1);
    const rad = deg * Math.PI / 180;
    const wx = cx + THROW_WHEEL_R * Math.cos(rad);
    const wy = cy + THROW_WHEEL_R * Math.sin(rad);
    const w = el('div', 'throw-wedge');
    w.style.left = wx + 'px';
    w.style.top = wy + 'px';
    w.innerHTML = `${potionIconHtml(item, 'tw-icon')}<span class="tw-name">${item.name}</span>`;
    layer.appendChild(w);
    return { item, x: wx, y: wy, el: w };
  });
  const explain = el('div', 'throw-explain');
  layer.appendChild(explain);
  throwGesture = { kind, cx, cy, wedges, explain, locked: false, item: null, carryEl: null, pointerId: e.pointerId };
}

// Positions the effect-text/remaining-count box beside whichever wedge
// is currently "hot", while the player is still deciding (hasn't
// dragged past the lock radius yet).
function updateThrowExplain(g, hotWedge) {
  if (!g.explain) return;
  if (!hotWedge) { g.explain.classList.remove('on'); return; }
  const item = hotWedge.item;
  const n = throwItemStock(item, g.kind);
  g.explain.innerHTML = `<b>${item.name}</b><span>${item.desc}</span><i>เหลือ ${n} ชิ้น</i>`;
  // Sits to whichever side of the wedge has more room, so it never
  // runs off the edge of the screen.
  const onRight = hotWedge.x < window.innerWidth / 2;
  g.explain.classList.toggle('on-right', onRight);
  g.explain.style.left = (hotWedge.x + (onRight ? 14 : -14)) + 'px';
  g.explain.style.top = hotWedge.y + 'px';
  g.explain.classList.add('on');
}

function onThrowPointerMove(e) {
  const g = throwGesture;
  if (!g || (g.pointerId != null && e.pointerId !== g.pointerId)) return;
  const dx = e.clientX - g.cx, dy = e.clientY - g.cy;
  const dist = Math.hypot(dx, dy);
  if (!g.locked) {
    // Highlight whichever wedge is currently closest, direction-wise.
    let best = null, bestScore = -Infinity;
    g.wedges.forEach(w => {
      const wdx = w.x - g.cx, wdy = w.y - g.cy;
      const score = (dx * wdx + dy * wdy) / (Math.hypot(wdx, wdy) || 1);
      w.el.classList.toggle('hot', false);
      if (score > bestScore) { bestScore = score; best = w; }
    });
    if (best) best.el.classList.add('hot');
    updateThrowExplain(g, best);
    if (dist > THROW_LOCK_R && best) {
      g.locked = true;
      g.item = best.item;
      g.wedges.forEach(w => w.el.remove());
      if (g.explain) { g.explain.remove(); g.explain = null; }
      // Enlarged 3x the instant the flick starts, so the item stays
      // clearly visible right under the finger instead of hiding under it.
      const carry = el('div', 'throw-carry throw-carry-big', potionIconHtml(best.item));
      $('throw-layer').appendChild(carry);
      g.carryEl = carry;
    }
    return;
  }
  if (g.carryEl) {
    g.carryEl.style.left = e.clientX + 'px';
    g.carryEl.style.top = e.clientY + 'px';
    g.carryEl.classList.toggle('over-target', !!throwHitSide(e.clientX, e.clientY));
  }
}

function onThrowPointerUp(e) {
  const g = throwGesture;
  if (!g || (g.pointerId != null && e.pointerId !== g.pointerId)) return;
  throwGesture = null;
  if (g.locked && g.item) {
    const side = throwHitSide(e.clientX, e.clientY);
    if (side) resolveThrow(g.kind, g.item, side, e.clientX, e.clientY);
    // Only the carried icon itself needs cleaning up here — NOT the
    // whole #throw-layer (a previous version wiped it with innerHTML,
    // which also instantly deleted the glass-break/body-flash effects
    // resolveThrow() just spawned into that same layer, before they
    // ever got a chance to actually animate — that's what looked like
    // the poison/potion icon "staying stuck" on the character instead
    // of disappearing: the wrong thing was vanishing).
    if (g.carryEl) g.carryEl.remove();
  } else {
    g.wedges.forEach(w => w.el.remove());
    if (g.explain) g.explain.remove();
  }
}

// Which side of the battlefield a screen point landed on — checked
// against the actual ally/enemy sprite containers first, falling back
// to a plain left/right split of the stage so a slightly-off flick
// still counts as long as it's over the fighting scene at all.
function throwHitSide(x, y) {
  const inRect = (elId) => {
    const r = $(elId) && $(elId).getBoundingClientRect();
    return r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  if (inRect('battle-allies')) return 'ally';
  if (inRect('battle-enemies')) return 'foe';
  const stage = $('battle-stage');
  if (!stage) return null;
  const r = stage.getBoundingClientRect();
  if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
  return x < r.left + r.width / 2 ? 'ally' : 'foe';
}

function resolveThrow(kind, item, side, x, y) {
  if (!battle || battle.over) return;
  const pet = side === 'ally' ? activeAlly() : activeFoe();
  if (!pet) return;
  const bag = kind === 'poison' ? G.poisons : G.potions;
  if (!(bag && bag[item.id] > 0)) { toast(kind === 'poison' ? 'พิษหมดแล้ว' : 'ยาหมดแล้ว'); return; }
  bag[item.id]--;

  glassBreakBurst(x, y, kind === 'potion' ? 'rgba(140,220,255,.9)' : 'rgba(200,140,255,.9)');
  bodyFlashEffect(pet, kind === 'potion' ? 'green' : 'red');
  startItemCooldown(item.id);

  const wrongSide = (kind === 'potion' && side === 'foe') || (kind === 'poison' && side === 'ally');
  const tag = wrongSide ? ' (ปาพลาด!)' : '';

  if (item.heal != null) {
    const mhp = statsOf(pet).mhp;
    const before = pet.hp;
    pet.hp = clamp(Math.floor(pet.hp + mhp * item.heal), 0, mhp);
    healPop(pet, pet.hp - before);
    blog(`${item.icon} ${item.name}${tag} · ${pet.name} +${pet.hp - before} HP`, side === 'ally' ? 'buff' : 'sys');
  } else if (item.kind === 'mp') {
    const mx = statsOf(pet).int;
    pet.mp = Math.min(mx, (pet.mp || 0) + Math.floor(mx * item.amt));
    blog(`${item.icon} ${item.name}${tag} · ${pet.name} ฟื้น MP`, side === 'ally' ? 'buff' : 'sys');
  } else if (item.kind === 'spd_buff') {
    // turns:200 reads as "for the rest of this fight" — battles never
    // run remotely that long, same trick used for other whole-fight
    // effects elsewhere, just without an actually-infinite sentinel
    // that would show a silly turn count in the buff chip.
    addAilment(pet, { id: 'throw_spd_buff', turns: 200, spd: item.amt });
    blog(`${item.icon} ${item.name}${tag} · ${pet.name} SPD+${Math.round(item.amt*100)}%`, side === 'ally' ? 'buff' : 'sys');
  } else if (item.kind === 'crit_buff') {
    addAilment(pet, { id: 'throw_crit_buff', turns: 200, crit: item.amt });
    blog(`${item.icon} ${item.name}${tag} · ${pet.name} CRIT+${Math.round(item.amt*100)}%`, side === 'ally' ? 'buff' : 'sys');
  } else if (item.kind === 'cleanse') {
    clearAilments(pet);
    blog(`${item.icon} ${item.name}${tag} · ${pet.name} ล้างสถานะ`, side === 'ally' ? 'buff' : 'sys');
  } else if (item.kind === 'ailment') {
    addAilment(pet, { id: item.ailment, turns: item.turns });
    const A = AILMENTS[item.ailment];
    blog(`${item.icon} ${item.name}${tag} · ${pet.name} ติด${A ? A.thai : item.ailment}`, side === 'ally' ? 'sys' : 'buff');
  }

  refreshBattleUnits();
  renderPotionBar();
  save();
}

function glassBreakBurst(x, y, color) {
  const layer = $('throw-layer');
  if (!layer) return;
  const burst = el('div', 'glass-break');
  burst.style.left = x + 'px';
  burst.style.top = y + 'px';
  burst.style.setProperty('--gb-color', color);
  let inner = '';
  for (let i = 0; i < 9; i++) {
    const ang = Math.random() * 360;
    inner += `<i style="--ga:${ang.toFixed(0)}deg;--gd:${(22 + Math.random() * 20).toFixed(0)}px"></i>`;
  }
  burst.innerHTML = inner;
  layer.appendChild(burst);
  setTimeout(() => burst.remove(), 550);
}

// A brief 1s colored wash over the actual struck creature's own sprite
// — green for a landed potion, red for a landed poison — on top of
// (not instead of) the glass-break burst at the contact point.
function bodyFlashEffect(pet, colorKind) {
  const unitEl = document.querySelector(`.bunit[data-uid="${pet.uid}"] .bu-sprite-wrap`);
  if (!unitEl) return;
  const flash = el('div', 'throw-body-flash ' + colorKind);
  unitEl.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
}

// ── CAMERA ──
// Pans/zooms the stage toward a unit for dramatic moments, then eases
// back out. Purely visual — it transforms a wrapper, so hit detection
// and layout are untouched.
export function cameraReset(ms = 380) {
  const cam = $('stage-cam');
  if (!cam) return;
  cam.style.transition = `transform ${ms}ms cubic-bezier(.3,.9,.3,1)`;
  cam.style.transform = 'scale(1) translate(0,0)';
}
// Slow-motion: scales every running animation on the stage.
export function setTimeScale(v) {
  const stage = $('battle-stage');
  if (stage) stage.style.setProperty('--time-scale', v);
}

// Full dramatic beat: pan to attacker, slow down, hold for the skill
// animation, then pan out to reveal the damage on the target.
export function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SPELL VFX ──
// Each special names a vfx key; this draws it over the stage.
// ── VFX ASSET REGISTRY ──
// Maps a vfx key to real uploaded art (WebP, transparent) plus where it
// anchors and how big it renders. `target` says whether the clip plays
// on the caster ('self') or the target ('enemy'). Effects without a
// registry entry fall back to the procedural CSS builders below.
export const VFX_ASSETS = {
  shield_self:     { file:'shield_self.webp',     target:'self',  w:150, ms:1100 },
  wind_self:       { file:'wind_self.webp',       target:'self',  w:140, ms:640  },
  circle_self:     { file:'circle_self.webp',     target:'self',  w:150, ms:900  },
  heal_self:       { file:'heal_self.webp',       target:'self',  w:150, ms:1150 },
  crit_self:       { file:'crit_self.webp',       target:'self',  w:160, ms:1000 },
  pierce_enemy:    { file:'pierce_enemy.webp',    target:'enemy', w:190, ms:260  },
  ice_enemy:       { file:'ice_enemy.webp',       target:'enemy', w:150, ms:960  },
  fire_enemy:      { file:'fire_enemy.webp',      target:'enemy', w:150, ms:1000 },
  charm_enemy:     { file:'charm_enemy.webp',     target:'enemy', w:140, ms:1080 },
  poison_enemy:    { file:'poison_enemy.webp',    target:'enemy', w:150, ms:1040 },
  meteor_enemy:    { file:'meteor_enemy.webp',    target:'enemy', w:170, ms:1120,
                      // impact anchor measured from the source clip's last
                      // frame (% of frame size), used so the strike lands
                      // exactly on the target rather than centred generically
                      anchorPct:{ x:23.6, y:77.2 } },
  hit_normal_enemy:{ file:'hit_normal_enemy.webp',target:'enemy', w:120, ms:480,
                      // fades immediately and is fully gone well under 2s
                      fadeFrom:0 },
};

// Attribute-keyed aliases so existing SPECIALS vfx tags ('fire','ice',
// 'heal','holy','shield','poison','charm','wind','meteor','pierce',
// 'aura','bless') resolve to the new uploaded assets. 'holy'/'bless'
// reuse the plain self-circle per spec — no dedicated holy asset.
const VFX_ALIAS = {
  fire:'fire_enemy', ice:'ice_enemy', heal:'heal_self',
  holy:'circle_self', bless:'circle_self', shield:'shield_self',
  poison:'poison_enemy', charm:'charm_enemy', wind:'wind_self',
  meteor:'meteor_enemy', pierce:'pierce_enemy', slash:'pierce_enemy', aura:'circle_self',
  impact:'hit_normal_enemy',
};

export function resolveVfxKey(kind) {
  if (VFX_ASSETS[kind]) return kind;
  if (VFX_ALIAS[kind]) return VFX_ALIAS[kind];
  return null;
}

// Plays a registered WebP clip anchored to a unit. Returns the ms the
// caller should wait before the next beat (so self-cast → delay →
// enemy-impact sequencing has a real number to wait on).
function playVfxAsset(key, unitEl, opts = {}) {
  const asset = VFX_ASSETS[key];
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!asset || !layer || !stage || !unitEl) return 0;
  const host = stage.getBoundingClientRect();
  const r = unitEl.getBoundingClientRect();

  const img = document.createElement('img');
  img.className = 'vfx-clip';
  img.src = `assets/fx/${asset.file}`;
  img.style.width = asset.w + 'px';

  let leftPx, topPx;
  if (asset.anchorPct) {
    // Anchor the effect's OWN impact point (from anchorPct) onto the
    // unit's centre, and flip horizontally when the unit is on the
    // right side so the effect still reads as coming from offscreen
    // toward the target rather than always pointing one way.
    const flip = opts.flip || false;
    const ax = flip ? (100 - asset.anchorPct.x) : asset.anchorPct.x;
    const scale = asset.w / (asset.naturalW || asset.w);
    leftPx = r.left - host.left + r.width / 2 - (ax / 100) * asset.w;
    topPx = r.top - host.top + r.height * 0.6 - (asset.anchorPct.y / 100) * asset.w;
    img.style.transform = flip ? 'scaleX(-1)' : 'none';
  } else {
    leftPx = r.left - host.left + r.width / 2 - asset.w / 2;
    topPx = r.top - host.top + r.height * 0.5 - asset.w / 2;
  }
  img.style.left = leftPx + 'px';
  img.style.top = topPx + 'px';

  if (asset.fadeFrom === 0) img.classList.add('vfx-instant-fade');
  layer.appendChild(img);
  setTimeout(() => img.remove(), asset.ms + 120);
  return asset.ms;
}

export function playSpellVFX(kind, caster, target, side) {
  const layer = $('fx-layer');
  const stage = $('battle-stage');
  if (!layer || !stage || !kind) return 0;
  const host = stage.getBoundingClientRect();
  const cEl = document.querySelector(`.bunit[data-uid="${caster.uid}"]`);
  const tEl = document.querySelector(`.bunit[data-uid="${target.uid}"]`);
  const at = (elm, yFactor = 0.5) => {
    if (!elm) return { x: host.width/2, y: host.height/2 };
    const r = elm.getBoundingClientRect();
    return { x: r.left - host.left + r.width/2, y: r.top - host.top + r.height*yFactor };
  };

  // Prefer real uploaded art when this vfx key has a registered asset.
  const resolved = resolveVfxKey(kind);
  if (resolved) {
    const asset = VFX_ASSETS[resolved];
    const unitEl = asset.target === 'self' ? cEl : tEl;
    const flip = asset.target === 'enemy' && side === 'ally';  // enemy stands on the right
    return playVfxAsset(resolved, unitEl, { flip });
  }

  const mk = (cls, pos, inner='') => {
    const d = el('div', 'vfx ' + cls, '');
    d.style.left = pos.x + 'px';
    d.style.top  = pos.y + 'px';
    if (inner) d.innerHTML = inner;
    layer.appendChild(d);
    setTimeout(() => d.remove(), 1400);
    return d;
  };

  switch (kind) {
    case 'fire': {
      const p = at(tEl, .55);
      let inner = '';
      for (let i = 0; i < 10; i++) {
        inner += `<i class="flame" style="--fx:${(Math.random()*70-35).toFixed(0)}px;--fd:${(i*0.05).toFixed(2)}s"></i>`;
      }
      mk('vfx-fire', p, inner);
      break;
    }
    case 'ice': {
      const p = at(tEl, .5);
      let inner = '';
      for (let i = 0; i < 7; i++) {
        inner += `<i class="shard" style="--sa:${(360/7*i).toFixed(0)}deg;--sd:${(i*0.04).toFixed(2)}s"></i>`;
      }
      mk('vfx-ice', p, inner + '<b class="frost-ring"></b>');
      break;
    }
    case 'heal': {
      const p = at(cEl, .55);
      let inner = '<b class="heal-ring"></b>';
      for (let i = 0; i < 8; i++) {
        inner += `<i class="sparkle" style="--sx:${(Math.random()*60-30).toFixed(0)}px;--sd:${(i*0.07).toFixed(2)}s"></i>`;
      }
      mk('vfx-heal', p, inner);
      break;
    }
    case 'bless': case 'holy': {
      const p = at(kind === 'holy' ? tEl : cEl, .5);
      mk('vfx-holy', p, '<b class="holy-beam"></b><b class="holy-ring"></b>');
      break;
    }
    case 'shield': {
      const p = at(cEl, .5);
      mk('vfx-shield', p, '<b class="shield-hex"></b>');
      break;
    }
    case 'poison': {
      const p = at(tEl, .55);
      let inner = '';
      for (let i = 0; i < 9; i++) {
        inner += `<i class="bubble" style="--bx:${(Math.random()*60-30).toFixed(0)}px;--bd:${(i*0.06).toFixed(2)}s"></i>`;
      }
      mk('vfx-poison', p, inner);
      break;
    }
    case 'charm': {
      const p = at(tEl, .45);
      let inner = '';
      for (let i = 0; i < 7; i++) {
        inner += `<i class="heartp" style="--hx:${(Math.random()*70-35).toFixed(0)}px;--hd:${(i*0.08).toFixed(2)}s">♥</i>`;
      }
      mk('vfx-charm', p, inner);
      break;
    }
    case 'wind': {
      const p = at(tEl, .5);
      let inner = '';
      for (let i = 0; i < 6; i++) {
        inner += `<i class="gust" style="--gy:${(i*11-30)}px;--gd:${(i*0.05).toFixed(2)}s"></i>`;
      }
      mk('vfx-wind', p, inner);
      break;
    }
    case 'meteor': {
      const p = at(tEl, .5);
      mk('vfx-meteor', p, '<b class="rock"></b><b class="boom"></b>');
      break;
    }
    case 'phoenix': {
      const p = at(tEl, .5);
      mk('vfx-phoenix', p, '<b class="wing left"></b><b class="wing right"></b><b class="boom"></b>');
      break;
    }
    case 'pierce': {
      const p = at(tEl, .5);
      mk('vfx-pierce', p, '<b class="lance"></b>');
      break;
    }
    case 'aura': {
      const p = at(cEl, .55);
      mk('vfx-aura', p, '<b class="aura-ring"></b><b class="aura-ring d2"></b>');
      break;
    }
    default: {
      const p = at(tEl, .5);
      mk('vfx-impact', p, '<b class="boom"></b>');
    }
  }
}

