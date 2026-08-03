// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { ATTR, MAP_NODES, RARITY, WHITE_TRAITS, loyaltyProgress, loyaltyTier } from './data.js';
import { DOWN_MS, canEvolve, petState, signatureSkillOf, statsOf, teamPower, uid } from './engine.js';
import { renderRaidList } from './battle/combat.js';
import { playArenaEntrance, renderSafeSpot } from './battle/encounters.js';
import { activeAlly, fleeBattle, requestBonusCrit } from './battle/turn-loop.js';
import { careRemaining, closeCareGame, renderCare, stopCareWander } from './screens/care.js';
import { renderCharacter, renderHome } from './screens/home-character.js';
import { renderInventory } from './screens/inventory.js';
import { closePetDetail, openPetDetail } from './screens/pet-detail.js';
import { fmtCountdown, renderClinic, renderFoodShop, renderShop } from './screens/shop.js';
import { renderWorld, showMimicRewardCards, travelTo } from './screens/world.js';
import { $, G, VIBE_TAP, activeTeam, attrIcon, battle, battleSpeed, boot, claimStarter, creatureMarkup, el, save, setText, vibrate, setBattleSpeed } from './state.js';

// ═══════════════ MAIN SCENE + DRAWER AS WINDOWS ═══════════════
// Only two Mac-style windows ever exist now: #win-main (the map and
// everything reachable from its menu — clinic, shops, world, raid,
// etc.) and the drawer. Both are draggable/closable/minimizable/
// maximizable. Navigating between map-menu pages does NOT open another
// window — it swaps which .pane is visible inside #win-main's shared
// body, like clicking a link and staying in the same browser tab, with
// goMainBack()/win-main-back reverting to whatever page came before.
// showScreen(id) (called from ~50 places across the file, mostly via
// data-goto buttons) stays the single entry point every call site uses;
// openWindow() decides internally whether that id is a main-scene page
// (swap in place) or the drawer (its own window).
const WIN_TITLES = {
  map:'Map', home:'Home Base', clinic:'Clinic', shop:'Shop',
  foodshop:'Food Shop', world:'World Map', battle:'Battle',
  raid:'Raid', safe:'Safe Spot', care:'Care', hack:'Hack Terminal',
  steal:'Steal', inventory:'Inventory', character:'Character', drawer:'Menu',
};
const MAIN_SCENE_IDS = [
  'map', 'home', 'clinic', 'shop', 'foodshop', 'world', 'safe', 'care',
  'raid', 'hack', 'steal', 'inventory', 'character', 'battle',
];

let currentScreenId = null;        // 'intro' | 'win-main' | 'drawer'
export let currentMainId = null;          // which pane is showing inside #win-main
let mainHistory = [];              // back-button stack of previously shown panes
let windowStack = [];              // z-order, back to front — only ever 'win-main'/'drawer'
let minimizedWindows = new Set();

function winElId(id) { return id === 'drawer' ? 'drawer-panel' : 'win-main'; }
function windowEl(id) { return $(winElId(id)); }

// Kept well below the persistent chrome's own z-index (drawer knob,
// dock, topbar, menu bar — see index.html) so open windows can never
// cover the controls used to reach/close/restore them.
function restackWindowsZ() {
  windowStack.forEach((id, i) => {
    const node = windowEl(id);
    if (node) node.style.zIndex = 10 + i;
  });
}

// Swaps which main-scene page is visible inside #win-main's shared
// body — the equivalent of a browser tab navigating to a new page.
// Doesn't touch history; callers decide when to push onto mainHistory.
function showMainPane(id) {
  MAIN_SCENE_IDS.forEach(x => {
    const p = $('screen-' + x);
    if (p) p.classList.toggle('on', x === id);
  });
  currentMainId = id;
  const winMain = $('win-main');
  if (winMain) winMain.dataset.pane = id;
  setText('win-main-title', WIN_TITLES[id] || id);
  const backBtn = $('win-main-back');
  if (backBtn) backBtn.disabled = !mainHistory.length;
}

// The title-bar "‹" back button — reverts to whichever main-scene page
// was showing before the current one, browser-back style. Doesn't push
// a forward-history entry; going somewhere new after a back() simply
// starts a fresh trail from there (no forward button was asked for).
function goMainBack() {
  if (!mainHistory.length) return;
  const prevId = mainHistory.pop();
  showMainPane(prevId);
  runScreenRenderer(prevId);
  const PERSISTABLE = ['map','world','safe','home','clinic','shop','foodshop','care','raid'];
  if (PERSISTABLE.includes(prevId)) { G.lastScreen = prevId; save(); }
  $('app').dataset.screen = prevId;
}

// Every screen's own embedded "← กลับ" button used to hardcode a fixed
// data-goto target (always "map", "home", etc.) — so map/world are
// meant to feel like the same tab (leave either one, go do something
// else, come back to exactly where you were), but a hardcoded target
// would always kick you back to a fixed screen instead of wherever you
// actually came from. Falls back to a fixed screen only for the rare
// case of resuming a saved session directly into a sub-screen, where
// there's no real history to go back to yet.
function goBackSmart(fallbackId) {
  if (mainHistory.length) goMainBack();
  else showScreen(fallbackId);
}

// Runs whichever render/side-effect a given screen needs on open —
// the exact per-screen dispatch the old showScreen() did inline.
function runScreenRenderer(id) {
  const vid = $('bg-video');
  if (vid) { if (id === 'map') vid.play().catch(() => {}); else vid.pause(); }
  if (id === 'home')   renderHome();
  if (id === 'clinic') renderClinic();
  if (id === 'shop')   renderShop();
  if (id === 'foodshop') renderFoodShop();
  if (id === 'world')  renderWorld();
  if (id === 'safe')   renderSafeSpot();
  if (id === 'care')   renderCare();
  if (id === 'inventory') renderInventory();
  if (id === 'character') renderCharacter();
  if (id === 'raid')   renderRaidList();
  if (id === 'map')    renderFeed();
  if (id === 'battle') playArenaEntrance();
  if (id === 'drawer') {
    setText('drawer-bitz', G.bitz.toLocaleString());
    setText('drawer-power', teamPower(activeTeam()).toLocaleString());
    renderFeed();
  }
}

// Brings an already-open window to the front without re-rendering it
// — used when tapping anywhere inside a window that isn't currently
// focused (see wireMainWindow()/wireDrawer()'s pointerdown listeners).
function focusWindow(id) {
  if (!windowStack.includes(id) || minimizedWindows.has(id)) return;
  windowStack = windowStack.filter(x => x !== id);
  windowStack.push(id);
  restackWindowsZ();
  currentScreenId = id;
  $('app').dataset.screen = id === 'win-main' ? currentMainId : id;
}

function openWindow(id) {
  if (id === 'intro') {
    // Pre-game screen — no game state exists yet, so it stays outside
    // the window system entirely (plain show, per its own #screen-intro
    // CSS override).
    const introEl = $('screen-intro');
    if (introEl) introEl.classList.add('on');
    currentScreenId = 'intro';
    return;
  }
  closeCareGame();
  closePetDetail();
  if (id !== 'care') stopCareWander();

  const isMainScene = MAIN_SCENE_IDS.includes(id);
  const winId = isMainScene ? 'win-main' : id;
  const windowCurrentlyOpen = windowStack.includes(winId) && !minimizedWindows.has(winId);

  // Already open, already showing this exact page/window: no-op,
  // matching the old "re-showing the current screen does nothing"
  // behavior.
  if (isMainScene ? (id === currentMainId && windowCurrentlyOpen)
                  : (id === currentScreenId && windowCurrentlyOpen)) return;

  // Switching which page #win-main shows — like following a link in a
  // browser tab: push the page being left onto the back history, then
  // swap the visible pane in place. No new window opens for this.
  if (isMainScene && id !== currentMainId) {
    if (currentMainId) mainHistory.push(currentMainId);
    showMainPane(id);
  }

  const container = windowEl(winId);
  if (!container) return;

  const isNewOpen = !windowStack.includes(winId);
  minimizedWindows.delete(winId);
  container.classList.add('on');
  windowStack = windowStack.filter(x => x !== winId);
  windowStack.push(winId);
  if (isNewOpen) {
    container.classList.remove('win-pop-in'); void container.offsetWidth;
    container.classList.add('win-pop-in');
  }
  restackWindowsZ();
  renderWinDock();

  currentScreenId = winId;
  // Persist "where the player is" for LOCATION screens only — never a
  // transient state like battle/hack/steal. On next load, boot()
  // restores here instead of always dropping the player back at the
  // city map, so warping to Hell and closing the app keeps you in
  // Hell until you travel back yourself.
  const PERSISTABLE = ['map','world','safe','home','clinic','shop','foodshop','care','raid'];
  if (PERSISTABLE.includes(id)) { G.lastScreen = id; save(); }
  $('app').dataset.screen = id;

  runScreenRenderer(id);
}

function closeWindow(id) {
  // The red traffic-light dot closing the World screen used to fall
  // through to the "no windows left open" case below and land straight
  // on the Real World map — a free, immersion-breaking shortcut out of
  // the warp-gate world that completely bypassed the actual gate. Only
  // the warpIn gate's own menu is allowed to do that now.
  if (id === 'win-main' && (currentMainId === 'world' || currentMainId === 'safe')) {
    toast('ออกจากแผนที่โลกได้ที่ประตูวาร์ปเท่านั้น');
    return;
  }
  const container = windowEl(id);
  windowStack = windowStack.filter(x => x !== id);
  minimizedWindows.delete(id);
  if (container) container.classList.remove('on', 'maximized');
  renderWinDock();
  if (!windowStack.length) { openWindow('map'); return; }
  const front = windowStack[windowStack.length - 1];
  restackWindowsZ();
  currentScreenId = front;
  $('app').dataset.screen = front === 'win-main' ? currentMainId : front;
}

function minimizeWindow(id) {
  const container = windowEl(id);
  if (!container) return;
  minimizedWindows.add(id);
  container.classList.remove('on');
  renderWinDock();
  const nextVisible = [...windowStack].reverse().find(x => x !== id && !minimizedWindows.has(x));
  if (nextVisible) {
    currentScreenId = nextVisible;
    $('app').dataset.screen = nextVisible === 'win-main' ? currentMainId : nextVisible;
  }
}

function toggleMaximizeWindow(id) {
  const container = windowEl(id);
  if (!container) return;
  const wasMax = container.classList.contains('maximized');
  container.classList.toggle('maximized', !wasMax);
  // Dragging freezes explicit left/top/width/height inline — maximizing
  // has to clear those so the .maximized CSS rule (inset:0) can take
  // over, otherwise un-maximizing later would restore the stale
  // pre-drag box instead of a fresh windowed layout.
  if (!wasMax) {
    container.style.left = ''; container.style.top = '';
    container.style.width = ''; container.style.height = '';
    container.style.right = ''; container.style.bottom = '';
  }
}

function renderWinDock() {
  const dock = $('win-dock');
  if (!dock) return;
  dock.innerHTML = '';
  minimizedWindows.forEach(id => {
    const label = id === 'win-main' ? (WIN_TITLES[currentMainId] || currentMainId) : (WIN_TITLES[id] || id);
    const chip = el('button', 'win-dock-chip');
    chip.innerHTML = `<span class="wdc-dot"></span>${label}`;
    chip.onclick = () => openWindow(id === 'win-main' ? currentMainId : id);
    dock.appendChild(chip);
  });
}

// #win-main's chrome is hand-authored in index.html (like the drawer's
// own head), not JS-injected — wire its traffic lights, back button,
// and drag handle once at boot.
export function wireMainWindow() {
  const win = $('win-main');
  if (!win) return;
  win.querySelector('[data-act="close"]').onclick = (e) => { e.stopPropagation(); closeWindow('win-main'); };
  win.querySelector('[data-act="min"]').onclick = (e) => { e.stopPropagation(); minimizeWindow('win-main'); };
  win.querySelector('[data-act="max"]').onclick = (e) => { e.stopPropagation(); toggleMaximizeWindow('win-main'); };
  const backBtn = $('win-main-back');
  if (backBtn) backBtn.onclick = (e) => { e.stopPropagation(); goMainBack(); };
  makeWindowDraggable(win, win.querySelector('.win-title'));
  win.addEventListener('pointerdown', () => focusWindow('win-main'));
}

// ── DRAGGABLE WINDOW (generic) ──
// Used for every open window's title-bar drag handle. Freezes the
// window's CURRENT rendered box to explicit left/top/width/height (and
// cancels any right/bottom/margin a stylesheet's `inset` shorthand was
// still applying) the moment a drag starts — dragging only `left`
// while a stylesheet `right` was still set would resize the window
// instead of moving it. The position/offsetParent math is the same
// whether the window is position:absolute (every .screen, relative to
// #app) or position:fixed (the drawer, relative to the real viewport).
function makeWindowDraggable(winNode, handleEl) {
  const MARGIN = 50;
  let dragging = false;
  let startX = 0, startY = 0, startLeft = 0, startTop = 0;
  let dxMin = 0, dxMax = 0, dyMin = 0, dyMax = 0;

  handleEl.addEventListener('pointerdown', (e) => {
    if (winNode.classList.contains('maximized')) return;
    dragging = true;
    winNode.classList.add('dragging');
    try { handleEl.setPointerCapture(e.pointerId); } catch (err) {}

    const r = winNode.getBoundingClientRect();
    const isFixed = getComputedStyle(winNode).position === 'fixed';
    const parentRect = isFixed ? { left: 0, top: 0 } : winNode.offsetParent.getBoundingClientRect();
    const baseLeft = r.left - parentRect.left;
    const baseTop = r.top - parentRect.top;

    winNode.style.width = r.width + 'px';
    winNode.style.height = r.height + 'px';
    winNode.style.left = baseLeft + 'px';
    winNode.style.top = baseTop + 'px';
    winNode.style.right = 'auto';
    winNode.style.bottom = 'auto';
    winNode.style.margin = '0';

    startX = e.clientX; startY = e.clientY;
    startLeft = baseLeft; startTop = baseTop;

    const vw = window.innerWidth, vh = window.innerHeight;
    dxMin = MARGIN - r.right;
    dxMax = vw - MARGIN - r.left;
    dyMin = -r.top;
    dyMax = Math.max(dyMin, vh - 60 - r.top);
  });
  handleEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = Math.min(dxMax, Math.max(dxMin, e.clientX - startX));
    const dy = Math.min(dyMax, Math.max(dyMin, e.clientY - startY));
    winNode.style.left = (startLeft + dx) + 'px';
    winNode.style.top = (startTop + dy) + 'px';
  });
  const endDrag = () => { dragging = false; winNode.classList.remove('dragging'); };
  handleEl.addEventListener('pointerup', endDrag);
  handleEl.addEventListener('pointercancel', endDrag);
}

export function showScreen(id) { openWindow(id); }

// ── GLOBAL CLICK RIPPLE ──
// Event-delegated so it covers every current and future tappable
// element without wiring each one individually.
export function wireClickRipple() {
  const TAPPABLE = '.btn, .qb, .zone-pin, .care-ring-btn, .loot-card, .steal-pet, ' +
                   '.swap-card, .pet-card, .shop-card, .tree-node, .sk-btn, ' +
                   '.potion-btn, .raid-card, .map-tab, .cg-close, ' +
                   '.cg-ball, .cg-laser, .cg-face, .cg-cell, .cg-food';
  document.addEventListener('pointerdown', e => {
    const target = e.target.closest(TAPPABLE);
    if (!target || target.disabled) return;
    vibrate(VIBE_TAP);
    const d = document.createElement('div');
    d.className = 'click-ripple';
    d.style.left = e.clientX + 'px';
    d.style.top = e.clientY + 'px';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 460);
  }, { passive: true });
}

// ── DOUBLE-TAP-TO-ZOOM GUARD ──
// CSS touch-action:manipulation (index.html) already drops double-tap
// zoom on browsers that honor it. This is the belt-and-suspenders JS
// fallback for the ones that don't: two touchend events landing close
// together in time trigger the browser's double-tap zoom gesture, so
// preventDefault the second one before that gesture can fire. A tap
// followed shortly by a genuinely separate tap elsewhere on screen
// still gets swallowed by this — an acceptable trade since the whole
// point is "don't let two quick taps anywhere zoom the page."
export function wireDoubleTapGuard() {
  let lastTouchEnd = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - lastTouchEnd <= 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
}

// ── DAY/NIGHT THEME ──
// Auto-switches the macOS-style light/dark appearance by the current
// hour in THAILAND specifically (Asia/Bangkok, fixed UTC+7, no DST) —
// not the player's own device timezone/locale, since "19:00 Thailand"
// was the explicit spec. Intl's timeZone option resolves this directly
// without needing an offset table. Re-checked every minute so a
// session left open across the 19:00/06:00 boundary flips live, the
// same way macOS itself auto-switches Appearance by time of day.
function bangkokHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false,
  }).formatToParts(new Date());
  return parseInt(parts.find(p => p.type === 'hour').value, 10) % 24;
}
function applyDayNightTheme() {
  const h = bangkokHour();
  const isDark = h >= 19 || h < 6;
  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  // Keep the mobile browser chrome (status bar / task-switcher tint)
  // matching the titlebar instead of always the dark-theme color the
  // page shipped with.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDark ? '#241a3d' : '#f2e6bd');
}
export function wireDayNightTheme() {
  applyDayNightTheme();
  setInterval(applyDayNightTheme, 60000);
}

// ── DRAWER, AS A WINDOW ──
// The drawer's head is hand-authored in index.html, same as #win-main's
// (see wireMainWindow()), since it needed its own distinct content —
// but it's wired through the exact same openWindow()/closeWindow()/
// minimizeWindow()/toggleMaximizeWindow()/makeWindowDraggable() as
// #win-main, so it behaves identically: draggable, closable, minimizable
// (into #win-dock), maximizable.
function toggleDrawer() {
  if (windowStack.includes('drawer') && !minimizedWindows.has('drawer')) closeWindow('drawer');
  else openWindow('drawer');
}
export function wireDrawer() {
  const knob = $('drawer-knob');
  const panel = $('drawer-panel');
  if (knob) knob.onclick = toggleDrawer;
  if (panel) {
    panel.querySelector('[data-act="close"]').onclick = (e) => { e.stopPropagation(); closeWindow('drawer'); };
    panel.querySelector('[data-act="min"]').onclick = (e) => { e.stopPropagation(); minimizeWindow('drawer'); };
    panel.querySelector('[data-act="max"]').onclick = (e) => { e.stopPropagation(); toggleMaximizeWindow('drawer'); };
    makeWindowDraggable(panel, panel.querySelector('.proc-title'));
    panel.addEventListener('pointerdown', () => focusWindow('drawer'));
  }

  // Same convention for the generic modal — click the dark backdrop
  // (not the content box itself) to dismiss it.
  const modalBack = $('modal-back');
  if (modalBack) modalBack.onclick = (e) => {
    if (e.target === modalBack && modalBack.dataset.dismissable !== '0') closeModal();
  };
}

export function wireGlobalUI() {
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.onclick = () => showScreen(b.dataset.goto);
  });
  document.querySelectorAll('[data-fallback]').forEach(b => {
    b.onclick = () => goBackSmart(b.dataset.fallback);
  });
  $('start-btn').onclick = claimStarter;

  document.querySelectorAll('.speed-btn').forEach(b => {
    b.onclick = () => {
      setBattleSpeed(Number(b.dataset.speed));
      document.querySelectorAll('.speed-btn').forEach(x =>
        x.classList.toggle('on', x === b));
    };
  });
  $('flee-btn').onclick = fleeBattle;
  $('hit-btn').onclick = () => {
    const ally = activeAlly();
    if (ally) requestBonusCrit(ally);
  };
}

function buildMapNodes() {
  const layer = $('map-nodes');
  layer.innerHTML = '';
  MAP_NODES.forEach(n => {
    // Every node's clickable area is now the invisible circle itself
    // (sized in vmin so it scales with the video), centred on the
    // measured landmark position — clicking anywhere within it works,
    // not just a small dot. The label is a separately positioned
    // element (textX/textY), independent of the circle's size.
    const node = el('button', 'map-node zone');
    node.style.left = n.x + '%';
    node.style.top  = n.y + '%';
    const r = n.zoneR || 14;
    node.style.width  = (r * 2) + 'vmin';
    node.style.height = (r * 2) + 'vmin';
    node.title = n.hint;
    node.onclick = () => showScreen(n.screen);
    layer.appendChild(node);

    const label = el('div', 'map-node-label', n.label);
    label.style.left = (n.textX != null ? n.textX : n.x) + '%';
    label.style.top  = (n.textY != null ? n.textY : n.y) + '%';
    label.onclick = () => showScreen(n.screen);
    layer.appendChild(label);
  });
}

// ═══════════════ RENDER: SHARED ═══════════════
export function renderAll() {
  renderHUD();
  renderHome();
  buildMapNodes();
}

export function renderHUD() {
  setText('hud-bitz', G.bitz.toLocaleString());
  setText('hud-name', G.name);
  setText('hud-power', teamPower(activeTeam()).toLocaleString());
  renderDrawerTeam();
  syncQuickbar();
  renderTopBar();
}

// ── PERSISTENT TOP BAR ──
// Left: live clock + whichever timed activity is closest to finishing
// (care cooldowns for now — the only source of "activity with a
// delay" that currently exists). Right: player identity.
let topBarTimer = null;
function renderTopBar() {
  const bar = $('topbar');
  if (!bar) return;
  bar.classList.toggle('hidden', currentScreenId === 'intro' || !currentScreenId);

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  setText('tb-clock', `${hh}:${mm}`);

  setText('tb-name', G.name || '-');
  setText('tb-bitz', (G.bitz || 0).toLocaleString());
  setText('tb-pets', (G.roster || []).length);

  // Find the soonest-finishing care cooldown across all pets/activities.
  const actEl = $('tb-activity');
  if (actEl) {
    let soonest = null;
    const care = G.care || {};
    Object.keys(care).forEach(petUid => {
      const pet = G.roster.find(p => p.uid === petUid);
      if (!pet) return;
      Object.keys(care[petUid]).forEach(actId => {
        const remain = careRemaining(petUid, actId);
        if (remain > 0 && (!soonest || remain < soonest.remain)) {
          soonest = { remain, petName: pet.name, actId };
        }
      });
    });
    if (soonest) {
      const mins = Math.ceil(soonest.remain / 60000);
      const label = mins >= 60
        ? `${Math.floor(mins / 60)} ชม. ${mins % 60} น.`
        : `${mins} น.`;
      actEl.innerHTML = `<span class="tb-act-icon">⏳</span>${soonest.petName} · เหลือ ${label}`;
      actEl.hidden = false;
    } else {
      actEl.hidden = true;
    }
  }
}
export function startTopBarClock() {
  clearInterval(topBarTimer);
  topBarTimer = setInterval(renderTopBar, 15000);   // refresh every 15s
}

// Down/Error/incubation countdowns are real wall-clock timers, not
// battle turns — nothing else drives a re-render while one is ticking
// down, so poll whichever pet-card-bearing screen is currently open
// and refresh it every few seconds.
let downStateTimer = null;
export function startDownStateTicker() {
  clearInterval(downStateTimer);
  downStateTimer = setInterval(() => {
    if (currentMainId === 'home') renderHome();
    else if (currentMainId === 'character') renderCharacter();
    else if (currentMainId === 'clinic') renderClinic();
  }, 4000);
}

// Highlight the quickbar button for the current screen
function syncQuickbar() {
  const cur = $('app').getAttribute('data-screen');
  document.querySelectorAll('#quickbar .qb').forEach(b =>
    b.classList.toggle('on', b.dataset.goto === cur));
}

// ── PERSISTENT TEAM STRIP ──
// Shows one active-team pet at a time; arrows/dots/scroll cycle through
// the (up to 3) team members. Lives under the HUD on every main screen.
function renderDrawerTeam() {
  const list = $('drawer-team');
  if (!list) return;
  const team = activeTeam();
  list.innerHTML = '';
  if (!team.length) {
    list.innerHTML = `<div class="muted" style="padding:8px">ยังไม่มีทีมออกรบ</div>`;
    return;
  }
  team.forEach(pet => {
    const s = statsOf(pet);
    const tier = loyaltyTier(pet.loyalty);
    const hpPct = Math.round(pet.hp / s.mhp * 100);
    const expPct = Math.min(100, Math.round(pet.exp / Math.max(1, pet.expNeed) * 100));
    const a = ATTR[pet.attr];
    const cell = el('div','ts-cell');
    cell.style.setProperty('--attr', a.color);
    cell.innerHTML = `
      <div class="ts-sprite">${creatureMarkup(pet,'ts-art')}</div>
      <div class="ts-body">
        <div class="ts-name">${pet.name} <span class="ts-attr">${attrIcon(a, 15)}</span></div>
        <div class="ts-lv">Lv.${pet.level}<span class="muted">/${pet.maxLv}</span> · ${tier.icon}${tier.name}</div>
        <div class="ts-baropts">
          <span class="ts-lab">HP</span>
          <span class="ts-bar hp"><i style="width:${hpPct}%"></i></span>
          <span class="ts-val">${pet.hp}/${s.mhp}</span>
        </div>
        <div class="ts-baropts">
          <span class="ts-lab">XP</span>
          <span class="ts-bar xp"><i style="width:${expPct}%"></i></span>
          <span class="ts-val">${pet.exp}/${pet.expNeed}</span>
        </div>
        <div class="ts-stats">⚔${s.atk} 🛡${s.def} ⚡${s.spd}</div>
      </div>`;
    list.appendChild(cell);
  });
}

export function petCard(pet, opts = {}) {
  const a = ATTR[pet.attr];
  const r = RARITY[pet.rarity];
  const s = statsOf(pet);
  const hpPct = Math.round(pet.hp / s.mhp * 100);
  const card = el('div', 'pet-card');
  card.style.setProperty('--attr', a.color);
  card.style.setProperty('--rar', r.color);
  card.style.setProperty('--glow', a.glow);
  if (opts.selected) card.classList.add('sel');
  const state = petState(pet);
  if (state !== 'alive') card.classList.add('ps-' + state);
  // The blanket dim/greyscale (.down) is for the genuinely-unusable
  // states only (error/incubating/ready). A fresh Down pet should
  // still read as basically fine at frac=0 — the .ps-wipe overlay
  // below IS the dimming, growing from fully transparent to fully
  // grey over the real 5-minute window, so it needs the undimmed
  // starting point to actually be visible as a countdown instead of
  // disappearing into an already-grey card from the first frame.
  if (state !== 'alive' && state !== 'down') card.classList.add('down');

  // Down: a grey wipe wraps counter-clockwise around the sprite over
  // the real 5-minute window. Error: a glitch filter over the sprite.
  // Incubating/Ready just get a status line — no sprite overlay needed.
  let spriteOverlay = '', stateLine = '';
  if (state === 'down') {
    const frac = Math.min(1, Math.max(0, 1 - (pet.downUntil - Date.now()) / DOWN_MS));
    spriteOverlay = `<div class="ps-wipe" style="--frac:${frac}"></div>`;
    stateLine = `<div class="pc-state down">⬇ Down — เหลือ ${fmtCountdown(pet.downUntil - Date.now())}</div>`;
  } else if (state === 'error') {
    spriteOverlay = `<div class="ps-glitch"></div>`;
    stateLine = `<div class="pc-state error">⚠ Error — ต้องไป Clinic</div>`;
  } else if (state === 'incubating') {
    stateLine = `<div class="pc-state incubating">🧊 บ่มอยู่ — เหลือ ${fmtCountdown(pet.incubatingUntil - Date.now())}</div>`;
  } else if (state === 'ready') {
    stateLine = `<div class="pc-state ready">✅ พร้อมรับคืนที่ Clinic</div>`;
  }

  const trait = pet.whiteTrait ? WHITE_TRAITS[pet.whiteTrait] : null;
  const expPct = Math.min(100, Math.round((pet.exp / Math.max(1, pet.expNeed)) * 100));
  const tier = loyaltyTier(pet.loyalty);
  const loyProg = loyaltyProgress(pet.loyalty);
  const sig = signatureSkillOf(pet);
  const evoReady = canEvolve(pet).ok;
  card.innerHTML = `
    <div class="pc-top">
      <span class="pc-attr" title="${a.desc}">${attrIcon(a, 18)}</span>
      <span class="pc-rar">${r.name}</span>
    </div>
    <div class="pc-sprite-wrap">${creatureMarkup(pet, 'pc-sprite float')}${spriteOverlay}</div>
    <div class="pc-name">${pet.name}${evoReady ? ` <span class="pc-evo-ready" title="พร้อมวิวัฒน์ — ไปที่ Tech Lab">▲</span>` : ''}${trait ? ` <span class="pc-trait" title="${trait.desc}">${trait.icon}</span>` : ''}</div>
    <div class="pc-lv">Lv.${pet.level}<span class="pc-cap">/${pet.maxLv}</span> · St.${pet.stage+1}</div>
    <div class="pc-bar"><i style="width:${hpPct}%"></i></div>
    <div class="pc-hp">HP ${pet.hp}/${s.mhp}</div>
    ${stateLine}
    <div class="pc-xpbar" title="EXP ${pet.exp}/${pet.expNeed}">
      <i style="width:${expPct}%"></i></div>
    <div class="pc-xp">EXP ${pet.exp}/${pet.expNeed}</div>
    <div class="pc-stats">
      <span title="Attack">⚔ ${s.atk}</span>
      <span title="Defense">🛡 ${s.def}</span>
      <span title="Speed">⚡ ${s.spd}</span>
    </div>
    <div class="pc-loy" title="${tier.perk || 'ยังไม่มีโบนัส'}">
      ${tier.icon} ${tier.name}
      <span class="pc-loy-bar"><i style="width:${loyProg.pct}%"></i></span>
    </div>
    ${sig ? `<div class="pc-sig" title="${sig.desc}">✦ ${sig.n}</div>` : ''}
    <button class="pc-equip" title="อุปกรณ์">🧩</button>
    <button class="pc-info" title="สถานะ">ℹ</button>`;
  if (opts.onClick) card.onclick = () => opts.onClick(pet);
  // The info/equip buttons always open their own window, independent
  // of whatever the card's main click does (team swap, defense pick).
  card.querySelector('.pc-info').onclick = (ev) => {
    ev.stopPropagation();
    openPetDetail(pet, 0);
  };
  card.querySelector('.pc-equip').onclick = (ev) => {
    ev.stopPropagation();
    openPetDetail(pet, 1);
  };
  return card;
}

// ═══════════════ LOG / TOAST / MODAL ═══════════════
export function log(msg, cls = 'info') {
  const box = $('log-box');
  if (box) {
    const line = el('div', 'log-line ' + cls, msg);
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
    while (box.children.length > 60) box.removeChild(box.firstChild);
  }
  feed(msg, cls);
}
export function blog(msg, cls = 'info') {
  const box = $('battle-log');
  if (!box) return;
  const line = el('div', 'blog-line ' + cls, msg);
  box.appendChild(line);
  box.scrollTop = box.scrollHeight;
  while (box.children.length > 80) box.removeChild(box.firstChild);
}
export function clearBattleLog() { const b = $('battle-log'); if (b) b.innerHTML = ''; }

// ── PROCESS ACTIVITY FEED ──
export function feed(msg, cls = 'info') {
  G.feed = G.feed || [];
  G.feed.unshift({ t: Date.now(), msg, cls });
  if (G.feed.length > 40) G.feed.length = 40;
  renderFeed();
}
function feedTime(ts) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}
function renderFeed() {
  const box = $('process-feed');
  if (!box) return;
  const items = G.feed || [];
  if (!items.length) { box.innerHTML = `<div class="pf-empty">ยังไม่มีความเคลื่อนไหว</div>`; return; }
  box.innerHTML = items.map(it =>
    `<div class="pf-line ${it.cls}"><span class="pf-time">${feedTime(it.t)}</span><span class="pf-msg">${it.msg}</span></div>`).join('');
}

let toastTimer;
export function toast(msg) {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
}

// `dismissable:false` hides the × close button and disables tapping the
// dark backdrop — for the rare modal where the player MUST pick one of
// the options shown (see showMimicRewardCards()), since this modal's
// resolution drives a real pending Promise: dismissing it any other way
// used to leave that Promise unresolved forever, hanging travelTo()'s
// train mid-ride with no way to ever finish the trip.
export function modal(title, buildFn, { dismissable = true } = {}) {
  const back = $('modal-back');
  const body = $('modal-body');
  if (!back || !body) return;
  setText('modal-title', title);
  body.innerHTML = '';
  buildFn(body);
  back.classList.add('on');
  back.dataset.dismissable = dismissable ? '1' : '0';
  const closeBtn = $('modal-close');
  if (closeBtn) {
    closeBtn.style.display = dismissable ? '' : 'none';
    closeBtn.onclick = dismissable ? closeModal : null;
  }
}
export function closeModal() {
  const back = $('modal-back');
  if (back) back.classList.remove('on');
}

