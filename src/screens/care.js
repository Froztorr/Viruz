// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { CARE_CLEAN, CARE_COOLDOWN_MS, FOODS, RECIPES, TOYS, loyaltyProgress, loyaltyTier } from '../data.js';
import { clamp, uid } from '../engine.js';
import { $, G, activeTeam, creatureMarkup, el, save, setText } from '../state.js';
import { currentMainId, log, renderHUD, toast } from '../ui-shell.js';

// ── CARE (TAMAGOTCHI MINIGAME) ──
// Each activity is on its own 1-hour cooldown, tracked per pet in
// G.care[petUid][activityId] = timestamp. Foods deplete when used;
// toys are kept forever but each has its own cooldown.
let carePetId = null;

function careReady(petUid, actId) {
  const rec = (G.care && G.care[petUid] && G.care[petUid][actId]) || 0;
  return Date.now() - rec >= CARE_COOLDOWN_MS;
}
export function careRemaining(petUid, actId) {
  const rec = (G.care && G.care[petUid] && G.care[petUid][actId]) || 0;
  return Math.max(0, CARE_COOLDOWN_MS - (Date.now() - rec));
}
function fmtCooldown(ms) {
  const m = Math.ceil(ms / 60000);
  if (m >= 60) return `${Math.floor(m/60)} ชม. ${m%60} น.`;
  return `${m} นาที`;
}
function markCare(petUid, actId) {
  G.care = G.care || {};
  G.care[petUid] = G.care[petUid] || {};
  G.care[petUid][actId] = Date.now();
}

function addLoyalty(pet, amount) {
  const before = loyaltyTier(pet.loyalty).id;
  pet.loyalty = clamp((pet.loyalty || 0) + amount, 0, 100);
  const t = loyaltyTier(pet.loyalty);
  if (t.id !== before) {
    toast(`${pet.name} → ${t.icon} ${t.name}!\n${t.perk || ''}`);
    log(`${t.icon} ${pet.name} เลื่อนขั้นเป็น ${t.name}`, 'win');
  }
  return t;
}

export function renderCare() {
  const pet = G.roster.find(p => p.uid === carePetId) || activeTeam()[0] || G.roster[0];
  if (!pet) return;
  const petChanged = carePetId !== pet.uid;
  carePetId = pet.uid;

  // pet picker
  const picker = $('care-picker');
  if (picker) {
    picker.innerHTML = '';
    G.roster.forEach(p => {
      const chip = el('button','care-chip' + (p.uid === carePetId ? ' on' : ''));
      chip.innerHTML = `${creatureMarkup(p,'care-chip-sprite')}<span>${p.name}</span>`;
      chip.onclick = () => { carePetId = p.uid; renderCare(); };
      picker.appendChild(chip);
    });
  }

  genCareBackground(pet);

  const tier = loyaltyTier(pet.loyalty);
  const prog = loyaltyProgress(pet.loyalty);
  const info = $('care-info');
  if (info) {
    info.innerHTML = `
      <div class="care-name">${pet.name} <span class="muted">Lv.${pet.level}</span></div>
      <div class="care-tier">${tier.icon} ${tier.name}</div>
      <div class="loy-bar"><i style="width:${prog.pct}%"></i></div>`;
  }
  const petEl = $('care-pet');
  if (petEl) {
    petEl.innerHTML = creatureMarkup(pet, 'care-sprite float');
    if (petChanged) { petEl.style.left = '50%'; petEl.style.top = '52%'; }
  }

  // Activities — a free clean + owned foods + owned toys, scattered
  // in a ring around the stage border instead of a listed grid.
  const acts = $('care-acts');
  if (acts) {
    acts.innerHTML = '';
    const btns = [];
    btns.push(careRingBtn({
      id: CARE_CLEAN.id, icon: CARE_CLEAN.icon, name: CARE_CLEAN.name,
      desc: CARE_CLEAN.desc, loyalty: CARE_CLEAN.loyalty, kind: 'free',
    }, pet));
    // Food no longer offers a "buy" state here at all — that flow
    // moved to the Food Shop. Only foods (precooked or homemade) the
    // player currently has any of actually appear as ring buttons.
    [...FOODS, ...RECIPES].forEach(f => {
      const owned = (G.foods && G.foods[f.id]) || 0;
      if (owned > 0) btns.push(careRingBtn({ ...f, kind:'food', owned }, pet));
    });
    TOYS.forEach(t => {
      const owned = (G.toys || []).includes(t.id);
      btns.push(careRingBtn({ ...t, kind:'toy', owned: owned ? 1 : 0 }, pet));
    });
    btns.forEach(b => acts.appendChild(b));
    layoutCareRing(btns);
  }

  refreshWasteIndicator();
  startCareWander();
  checkWasteSpawn();
}

// ── LIVING-AREA BACKGROUND ──
// Purely visual — a backdrop themed to the pet's attribute, randomly
// re-scattered every time the screen renders so it feels alive
// rather than static wallpaper.
const CARE_THEMES = {
  red:    { bg:['#4a1408','#2a0d08','#1a0604'], props:['🔥','🌋','⚡','💥','🪨'] },
  green:  { bg:['#0d3b2a','#07241d','#04120e'], props:['🍃','🌿','🌪️','✨','🍀'] },
  yellow: { bg:['#3c2a08','#241a06','#150e03'], props:['⚙️','🔩','🛡️','🧱','🔧'] },
  white:  { bg:['#2c2440','#1c1826','#100d18'], props:['✨','🌸','💫','➕','🕊️'] },
};
function genCareBackground(pet) {
  const bg = $('care-bg');
  if (!bg) return;
  const theme = CARE_THEMES[pet.attr] || CARE_THEMES.red;
  bg.style.background =
    `radial-gradient(ellipse 90% 70% at 50% 38%, ${theme.bg[0]}, ${theme.bg[1]} 65%, ${theme.bg[2]} 100%)`;
  bg.innerHTML = '';
  const N = 10 + Math.floor(Math.random() * 5); // 10-14 props, fresh each render
  for (let i = 0; i < N; i++) {
    const prop = el('div', 'care-prop', theme.props[Math.floor(Math.random()*theme.props.length)]);
    // Keep a clear zone around the center so props never sit on the pet.
    let x, y;
    do { x = 6 + Math.random()*88; y = 8 + Math.random()*84; }
    while (Math.hypot(x-50, (y-46)*1.3) < 22);
    prop.style.left = x + '%';
    prop.style.top = y + '%';
    prop.style.setProperty('--sz', (16 + Math.random()*20).toFixed(0) + 'px');
    prop.style.setProperty('--rot', (Math.random()*40-20).toFixed(0) + 'deg');
    prop.style.opacity = (0.35 + Math.random()*0.4).toFixed(2);
    prop.style.animationDelay = (Math.random()*3).toFixed(2) + 's';
    bg.appendChild(prop);
  }
}

// Scattered (not a perfectly even ring) placement around the stage
// border, pet centered. Base angle spacing keeps buttons from
// overlapping; jitter on top keeps it from looking like a rigid,
// mechanical dial.
function layoutCareRing(buttons) {
  const n = buttons.length;
  if (!n) return;
  const baseStep = 360 / n;
  buttons.forEach((b, i) => {
    const jitterA = (Math.random() - 0.5) * baseStep * 0.5;
    const ang = (i * baseStep + jitterA - 90) * Math.PI / 180; // start pointing up
    const rx = 40 + (Math.random()*6 - 3);
    const ry = 37 + (Math.random()*6 - 3);
    const x = clamp(50 + Math.cos(ang) * rx, 8, 92);
    const y = clamp(50 + Math.sin(ang) * ry, 10, 90);
    b.style.left = x + '%';
    b.style.top  = y + '%';
  });
}

function careRingBtn(act, pet) {
  const ready = careReady(pet.uid, act.id);
  const needBuy = act.kind !== 'free' && !act.owned;
  const btn = el('button', 'care-ring-btn' + (needBuy ? ' need-buy' : ready ? ' ready' : ' cooling'));
  btn.dataset.act = act.id;
  btn.title = act.name;
  let badge;
  if (needBuy) badge = `<span class="crb-badge buy">${act.cost}</span>`;
  else if (!ready) badge = `<span class="crb-badge cd">${fmtCooldown(careRemaining(pet.uid, act.id))}</span>`;
  else badge = `<span class="crb-badge loy">+${act.loyalty}</span>`;
  btn.innerHTML = `<span class="crb-icon">${act.icon}</span>${badge}`;
  btn.onclick = () => {
    if (needBuy) {
      if (G.bitz < act.cost) { toast('Bitz ไม่พอ'); return; }
      G.bitz -= act.cost;
      if (act.kind === 'food') {
        G.foods = G.foods || {};
        G.foods[act.id] = (G.foods[act.id] || 0) + 1;
      } else {
        G.toys = G.toys || [];
        if (!G.toys.includes(act.id)) G.toys.push(act.id);
      }
      save(); renderCare(); renderHUD();
      toast(`✅ ซื้อ ${act.name} แล้ว`);
      return;
    }
    if (!ready) { toast(`⏳ รออีก ${fmtCooldown(careRemaining(pet.uid, act.id))}`); return; }
    if (act.kind === 'food' && !((G.foods && G.foods[act.id]) > 0)) { toast('ไม่มีอาหารนี้'); return; }
    openCareGame(act, pet);
  };
  return btn;
}

// ── AUTONOMOUS WANDER ──
// The pet is never fully static: while idle it picks a random point
// within the stage, walks there over a CSS transition, waits a beat,
// and repeats. Paused (not stopped) whenever a care minigame overlay
// is open or the care screen isn't the active one, so it never
// animates uselessly behind something else — see the guard at the
// top of wanderStep().
let careWander = null; // { timer } or null when torn down entirely
function startCareWander() {
  if (careWander) return; // already running — renderCare() re-runs often
  careWander = { timer: null };
  scheduleWanderStep(900 + Math.random() * 800);
}
export function stopCareWander() {
  if (careWander && careWander.timer) clearTimeout(careWander.timer);
  careWander = null;
}
function scheduleWanderStep(delay) {
  if (!careWander) return;
  clearTimeout(careWander.timer);
  careWander.timer = setTimeout(wanderStep, delay != null ? delay : 2200 + Math.random() * 2600);
}
function wanderStep() {
  if (!careWander) return;
  // Don't move the pet while it's off-screen behind a minigame
  // overlay, or while some other screen is showing.
  const overlayOpen = CG != null || ($('care-game') && $('care-game').classList.contains('open'));
  const petEl = $('care-pet');
  if (currentMainId !== 'care' || overlayOpen || !petEl) { scheduleWanderStep(1200); return; }
  checkWasteSpawn();
  const x = 20 + Math.random() * 58;
  const y = 30 + Math.random() * 46;
  petEl.classList.add('wandering');
  const facingLeft = parseFloat(petEl.style.left || '50') > x;
  petEl.classList.toggle('face-l', facingLeft);
  petEl.style.left = x + '%';
  petEl.style.top = y + '%';
  setTimeout(() => { if (petEl) petEl.classList.remove('wandering'); }, 1300);
  scheduleWanderStep();
}

// ── AMBIENT WASTE / MESS ──
// No new stat, no failure state — just a "glitch grime" prop that
// occasionally appears in the living area as a visual nag. The
// existing Clean activity's ring button pulses while it's present;
// finishing any Clean run (the minigame you already have) sweeps it
// away, whether or not that particular clean was "for" the mess.
// Uses a persisted timestamp rather than an in-memory timer, so it
// isn't reset every time renderCare() re-runs (which is often) and
// survives navigating away or reloading.
function checkWasteSpawn() {
  if (G.careWaste) return;
  if (!G.wasteNextAt) { G.wasteNextAt = Date.now() + 45000 + Math.random()*60000; save(); return; }
  if (Date.now() >= G.wasteNextAt) {
    G.careWaste = true;
    G.wasteNextAt = null;
    save();
    refreshWasteIndicator();
  }
}
function spawnWasteProp() {
  const bg = $('care-bg');
  if (!bg || bg.querySelector('.care-waste')) return;
  const prop = el('div', 'care-waste', '🟢');
  let x, y;
  do { x = 10 + Math.random()*80; y = 12 + Math.random()*76; }
  while (Math.hypot(x-50, (y-46)*1.3) < 20);
  prop.style.left = x + '%';
  prop.style.top = y + '%';
  bg.appendChild(prop);
}
function refreshWasteIndicator() {
  const btn = document.querySelector('.care-ring-btn[data-act="clean"]');
  if (btn) btn.classList.toggle('needs-clean', !!G.careWaste);
  if (!G.careWaste) {
    const w = document.querySelector('.care-waste');
    if (w) w.remove();
  } else if (!document.querySelector('.care-waste')) {
    spawnWasteProp();
  }
}
function clearWaste() {
  if (!G.careWaste) return;
  G.careWaste = false;
  save();
  const w = document.querySelector('.care-waste');
  if (w) { w.classList.add('gone'); setTimeout(() => w.remove(), 260); }
  refreshWasteIndicator();
  checkWasteSpawn();
}

// Little burst of the activity icon as feedback
function careFx(icon) {
  const host = $('care-pet');
  if (!host) return;
  for (let i = 0; i < 6; i++) {
    const d = el('div','care-particle', icon);
    d.style.left = (30 + Math.random()*40) + '%';
    d.style.animationDelay = (i*0.07) + 's';
    host.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }
}

// ── CARE MINIGAMES ──
// Using a care activity no longer grants its reward on click — it
// opens a small interactive game over the pet instead. The loyalty
// gain, food deduction, and cooldown stamp only land once the game
// is actually finished (finishCareGame), via the exact same path the
// old instant-click used. Backing out early with ✕ costs nothing —
// nothing was spent yet, so there's nothing to lose by trying.
let CG = null; // active minigame state, or null when the overlay is closed

function openCareGame(act, pet) {
  const overlay = $('care-game'), stage = $('care-game-stage');
  if (!overlay || !stage) { finishCareGame(act, pet); return; } // safety net
  if (CG) closeCareGame();

  stage.innerHTML = '';
  CG = { act, pet, cleanup: [] };
  overlay.classList.add('open');
  document.body.classList.add('care-game-open');
  setText('care-game-title',
    act.kind === 'toy' ? `เล่นกับ ${pet.name}` : act.kind === 'food' ? `ป้อน ${pet.name}` : `อาบน้ำ ${pet.name}`);
  setCareGameProgress(0);
  setText('care-game-hint', '');

  const petWrap = el('div','cg-pet');
  petWrap.innerHTML = creatureMarkup(pet,'cg-pet-sprite float');
  stage.appendChild(petWrap);
  CG.petWrap = petWrap;

  if (act.id === 'clean')          startBathGame(stage, act, pet);
  else if (act.kind === 'food')    startFeedGame(stage, act, pet);
  else if (act.id === 'toy_ball')  startBallGame(stage, act, pet);
  else if (act.id === 'toy_laser') startLaserGame(stage, act, pet);
  else if (act.id === 'toy_puzzle')startPuzzleGame(stage, act, pet);
  else if (act.id === 'toy_arcade')startArcadeGame(stage, act, pet);
  else finishCareGame(act, pet); // unknown activity id — never trap the player
}

function setCareGameProgress(pct) {
  const bar = $('care-game-bar-fill');
  if (bar) bar.style.width = clamp(pct, 0, 100) + '%';
}

export function closeCareGame() {
  if (CG) CG.cleanup.forEach(fn => { try { fn(); } catch (e) {} });
  CG = null;
  const overlay = $('care-game');
  if (overlay) overlay.classList.remove('open');
  document.body.classList.remove('care-game-open');
}

// Pet reacts with a little happy bounce — shared by every minigame.
function cgReact() {
  if (!CG || !CG.petWrap) return;
  CG.petWrap.classList.remove('chomp');
  void CG.petWrap.offsetWidth; // restart the animation
  CG.petWrap.classList.add('chomp');
}

function finishCareGame(act, pet) {
  if (act.kind === 'food') { G.foods = G.foods || {}; G.foods[act.id]--; }
  if (act.id === CARE_CLEAN.id) clearWaste();
  addLoyalty(pet, act.loyalty);
  markCare(pet.uid, act.id);
  save(); renderCare(); renderHUD();
  setCareGameProgress(100);
  setText('care-game-hint', `สำเร็จ! +${act.loyalty} ❤`);
  const stage = $('care-game-stage');
  if (stage) cgFx(stage, act.icon);
  setTimeout(() => {
    careFx(act.icon);
    closeCareGame();
    const petEl = $('care-pet');
    if (petEl) {
      petEl.classList.remove('happy'); void petEl.offsetWidth;
      petEl.classList.add('happy');
      setTimeout(() => petEl.classList.remove('happy'), 700);
    }
  }, 900);
}

export function wireCareGame() {
  const close = $('care-game-close');
  if (close) close.onclick = () => closeCareGame();
}

// Little burst of the activity icon over the pet, mirrors careFx.
function cgFx(host, icon) {
  for (let i = 0; i < 6; i++) {
    const d = el('div','care-particle', icon);
    d.style.left = (30 + Math.random()*40) + '%';
    d.style.bottom = '46%';
    d.style.animationDelay = (i*0.07) + 's';
    host.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }
}

// ── 1) BATHING — brush the dirty spots clean ──
// Dirt spots are scattered around the pet. Holding the pointer down
// and dragging over a spot scrubs it (throttled per-spot so a single
// pass doesn't insta-clean it); once every spot is scrubbed away the
// bath is done. Tapping without dragging still works, just slower.
function startBathGame(stage, act, pet) {
  CG.petWrap.style.top = '44%';
  const N = 4 + Math.floor(Math.random()*3); // 4–6 spots
  const spots = [];
  for (let i = 0; i < N; i++) {
    const ang = (i/N)*Math.PI*2 + Math.random()*0.6;
    const cx = clamp(50 + Math.cos(ang)*(16+Math.random()*10), 12, 88);
    const cy = clamp(46 + Math.sin(ang)*(12+Math.random()*10), 18, 76);
    const d = el('div','dirt-spot','<span class="dirt-blob"></span>');
    d.style.left = cx + '%'; d.style.top = cy + '%';
    d.style.setProperty('--grime', 1);
    stage.appendChild(d);
    spots.push({ el:d, x:cx, y:cy, grime:100, lastHit:0 });
  }
  setText('care-game-hint', 'ลากนิ้วถูจุดสกปรกให้สะอาด');

  let down = false;
  const brushAt = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    const px = ((clientX - r.left)/r.width)*100;
    const py = ((clientY - r.top)/r.height)*100;
    const now = performance.now();
    let anyCleaned = false;
    spots.forEach(s => {
      if (s.grime <= 0) return;
      const dx = px - s.x, dy = (py - s.y)*1.4;
      if (Math.sqrt(dx*dx + dy*dy) > 8.5) return;
      if (now - s.lastHit < 55) return;
      s.lastHit = now;
      s.grime -= 12;
      d_setGrime(s);
      spawnScrubSpark(stage, px, py);
      if (s.grime <= 0) {
        s.el.classList.add('gone');
        setTimeout(() => s.el.remove(), 260);
        anyCleaned = true;
      }
    });
    if (anyCleaned) {
      const remaining = spots.filter(s => s.grime > 0).length;
      setCareGameProgress(Math.round(((N-remaining)/N)*100));
      if (remaining === 0) {
        setText('care-game-hint', 'สะอาดหมดจด! ✨');
        setTimeout(() => finishCareGame(act, pet), 500);
      }
    }
  };
  function d_setGrime(s) {
    s.el.style.setProperty('--grime', Math.max(0, s.grime)/100);
    s.el.classList.add('scrub');
    setTimeout(() => s.el.classList.remove('scrub'), 180);
  }
  const onDown = e => { down = true; brushAt(e.clientX, e.clientY); };
  const onMove = e => { if (down) brushAt(e.clientX, e.clientY); };
  const onUp = () => { down = false; };
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  CG.cleanup.push(() => {
    stage.removeEventListener('pointerdown', onDown);
    stage.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  });
}
function spawnScrubSpark(stage, px, py) {
  const s = el('div','scrub-spark');
  s.style.left = px + '%'; s.style.top = py + '%';
  stage.appendChild(s);
  setTimeout(() => s.remove(), 340);
}

// ── 2) FEEDING — tap the food until it's gone ──
// Bite count scales gently with the food's tier so a Quantum Feast
// takes a bit more work (and feels more special) than Data Crumbs.
function startFeedGame(stage, act, pet) {
  const tierIdx = Math.max(0, FOODS.findIndex(f => f.id === act.id));
  const bites = 5 + tierIdx;
  let taken = 0;

  // Food lands off to one side; the pet walks over to stand beside
  // it (CSS transition on .cg-pet's left/top) before eating begins.
  const foodX = 28 + Math.random() * 44, foodY = 58;
  const food = el('div','cg-food', `<span class="cg-food-icon">${act.icon}</span>`);
  food.style.left = foodX + '%'; food.style.top = foodY + '%';
  stage.appendChild(food);
  setText('care-game-hint', `${pet.name} เดินไปหาอาหาร...`);

  const standX = clamp(foodX + (foodX > 50 ? -10 : 10), 12, 88);
  CG.petWrap.style.left = standX + '%';
  CG.petWrap.style.top = '48%';

  setTimeout(() => {
    setText('care-game-hint', `แตะอาหารให้ ${pet.name} กิน`);
    const onTap = e => {
      e.preventDefault();
      taken++;
      food.style.setProperty('--bite', Math.max(0, 1 - taken/bites));
      food.classList.remove('bite'); void food.offsetWidth; food.classList.add('bite');
      cgReact();
      spawnCrumbs(food);
      setCareGameProgress(Math.round((taken/bites)*100));
      if (taken >= bites) {
        food.removeEventListener('pointerdown', onTap);
        food.remove();
        setText('care-game-hint', 'อิ่มแล้ว! 😋');
        setTimeout(() => finishCareGame(act, pet), 450);
      }
    };
    food.addEventListener('pointerdown', onTap);
    CG.cleanup.push(() => food.removeEventListener('pointerdown', onTap));
  }, 700);
}
function spawnCrumbs(food) {
  for (let i = 0; i < 4; i++) {
    const c = el('div','crumb-bit');
    c.style.setProperty('--dx', (Math.random()*60-30) + 'px');
    c.style.setProperty('--dy', (20+Math.random()*30) + 'px');
    c.style.animationDelay = (i*0.03) + 's';
    food.appendChild(c);
    setTimeout(() => c.remove(), 500);
  }
}

// ── 3) TOY: PACKET BALL — catch what the pet throws back ──
function startBallGame(stage, act, pet) {
  CG.petWrap.style.top = '44%';
  const TARGET = 5;
  let caught = 0, phase = 'idle', timer = null;
  const ball = el('div','cg-ball','⚽');
  stage.appendChild(ball);
  setText('care-game-hint', `แตะลูกบอลตอนที่ ${pet.name} โยนมาให้!`);

  function throwBall() {
    phase = 'flying';
    ball.classList.remove('landed','caught');
    ball.style.transitionDuration = '.55s';
    ball.style.left = (20+Math.random()*60) + '%';
    ball.style.top  = (25+Math.random()*40) + '%';
    clearTimeout(timer);
    timer = setTimeout(() => {
      phase = 'catchable';
      ball.classList.add('landed');
      timer = setTimeout(returnBall, 1100);
    }, 560);
  }
  function returnBall() {
    phase = 'returning';
    ball.classList.remove('landed');
    ball.style.transitionDuration = '.45s';
    ball.style.left = '50%'; ball.style.top = '44%';
    clearTimeout(timer);
    timer = setTimeout(() => { phase = 'idle'; timer = setTimeout(throwBall, 420); }, 460);
  }
  function onCatch(e) {
    if (phase !== 'catchable') return;
    e.preventDefault();
    caught++;
    ball.classList.add('caught');
    cgReact();
    setCareGameProgress(Math.round((caught/TARGET)*100));
    if (caught >= TARGET) {
      clearTimeout(timer);
      ball.removeEventListener('pointerdown', onCatch);
      ball.remove();
      setText('care-game-hint', `${pet.name} พอใจมาก! 🎾`);
      setTimeout(() => finishCareGame(act, pet), 450);
      return;
    }
    returnBall();
  }
  ball.addEventListener('pointerdown', onCatch);
  CG.cleanup.push(() => { clearTimeout(timer); ball.removeEventListener('pointerdown', onCatch); });
  timer = setTimeout(throwBall, 500);
}

// ── 4) TOY: LASER POINTER — pounce on the dot before it jumps ──
function startLaserGame(stage, act, pet) {
  CG.petWrap.style.top = '44%';
  const TARGET = 8;
  let hits = 0, timer = null;
  const dot = el('div','cg-laser');
  stage.appendChild(dot);
  setText('care-game-hint', `แตะจุดเลเซอร์ให้ ${pet.name} ตะปบ!`);

  function jump() {
    dot.classList.remove('pounced');
    dot.style.left = (15+Math.random()*70) + '%';
    dot.style.top  = (20+Math.random()*55) + '%';
    clearTimeout(timer);
    timer = setTimeout(jump, 780);
  }
  function onHit(e) {
    e.preventDefault();
    hits++;
    dot.classList.add('pounced');
    cgReact();
    setCareGameProgress(Math.round((hits/TARGET)*100));
    if (hits >= TARGET) {
      clearTimeout(timer);
      dot.removeEventListener('pointerdown', onHit);
      dot.remove();
      setText('care-game-hint', `${pet.name} สนุกมาก! 🔦`);
      setTimeout(() => finishCareGame(act, pet), 450);
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(jump, 260);
  }
  dot.addEventListener('pointerdown', onHit);
  CG.cleanup.push(() => { clearTimeout(timer); dot.removeEventListener('pointerdown', onHit); });
  jump();
}

// ── 5) TOY: LOGIC CUBE — Simon-says memory sequence ──
function startPuzzleGame(stage, act, pet) {
  CG.petWrap.style.top = '20%';
  const TARGET_LEN = 5;
  const FACES = ['a','b','c','d'];
  let sequence = [], inputIdx = 0, showing = true;

  const cube = el('div','cg-cube');
  cube.style.top = '62%';
  FACES.forEach(c => cube.appendChild(el('div', `cg-face cg-face-${c}`)));
  stage.appendChild(cube);
  setText('care-game-hint', 'ดูลำดับ แล้วแตะตาม');

  function flash(c) {
    const f = cube.querySelector('.cg-face-'+c);
    if (!f) return;
    f.classList.add('flash');
    setTimeout(() => f.classList.remove('flash'), 340);
  }
  function playSequence() {
    showing = true; inputIdx = 0;
    cube.classList.add('locked');
    let i = 0;
    const step = () => {
      if (i >= sequence.length) { showing = false; cube.classList.remove('locked'); return; }
      flash(sequence[i]); i++;
      setTimeout(step, 560);
    };
    setTimeout(step, 400);
  }
  function addStep() {
    sequence.push(FACES[Math.floor(Math.random()*4)]);
    playSequence();
  }
  function onTap(e) {
    if (showing) return;
    const f = e.target.closest('.cg-face');
    if (!f) return;
    const c = FACES.find(x => f.classList.contains('cg-face-'+x));
    flash(c);
    if (c === sequence[inputIdx]) {
      inputIdx++;
      if (inputIdx < sequence.length) return;
      cgReact();
      setCareGameProgress(Math.round((sequence.length/TARGET_LEN)*100));
      if (sequence.length >= TARGET_LEN) {
        cube.removeEventListener('pointerdown', onTap);
        cube.remove();
        setText('care-game-hint', `${pet.name} ไขได้แล้ว! 🧩`);
        setTimeout(() => finishCareGame(act, pet), 500);
        return;
      }
      setText('care-game-hint', 'เก่งมาก! ต่อไป...');
      setTimeout(addStep, 700);
    } else {
      setText('care-game-hint', 'พลาด! ลองใหม่');
      sequence = [];
      setCareGameProgress(0);
      setTimeout(addStep, 700);
    }
  }
  cube.addEventListener('pointerdown', onTap);
  CG.cleanup.push(() => cube.removeEventListener('pointerdown', onTap));
  addStep();
}

// ── 6) TOY: MINI ARCADE — whack the bugs before they vanish ──
function startArcadeGame(stage, act, pet) {
  CG.petWrap.style.top = '20%';
  const TARGET = 8;
  let hits = 0, popTimer = null, active = null;
  const grid = el('div','cg-arcade');
  grid.style.top = '64%';
  const cells = [];
  for (let i = 0; i < 9; i++) { const c = el('div','cg-cell'); grid.appendChild(c); cells.push(c); }
  stage.appendChild(grid);
  setText('care-game-hint', 'แตะบั๊กที่โผล่มาให้ทัน!');

  function pop() {
    if (active) { active.classList.remove('up'); active.innerHTML=''; active.onpointerdown = null; }
    active = cells[Math.floor(Math.random()*cells.length)];
    active.classList.add('up');
    active.innerHTML = '👾';
    active.onpointerdown = e => {
      e.preventDefault();
      clearTimeout(popTimer);
      hits++;
      active.classList.add('hit');
      cgReact();
      setCareGameProgress(Math.round((hits/TARGET)*100));
      if (hits >= TARGET) {
        clearTimeout(popTimer);
        cells.forEach(c => { c.onpointerdown = null; });
        grid.remove();
        setText('care-game-hint', `กำจัดบั๊กหมด! ${pet.name} สนุกมาก 🕹️`);
        setTimeout(() => finishCareGame(act, pet), 500);
        return;
      }
      active.classList.remove('up'); active.innerHTML = ''; active.onpointerdown = null;
      popTimer = setTimeout(pop, 260);
    };
    popTimer = setTimeout(() => {
      if (active) { active.classList.remove('up'); active.innerHTML=''; active.onpointerdown = null; }
      pop();
    }, 700);
  }
  CG.cleanup.push(() => { clearTimeout(popTimer); cells.forEach(c => { c.onpointerdown = null; }); });
  popTimer = setTimeout(pop, 400);
}

