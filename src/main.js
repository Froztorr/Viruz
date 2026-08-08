// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.
//
// IMPORT ORDER MATTERS HERE. preload.js comes first and deliberately has
// no static imports of its own: its module body paints the loading
// screen, so the overlay is up before data.js (~100 KB) and the rest of
// the graph are parsed. Everything below it is the same side-effect
// import list as before.
import { finishPreload, runPreload, startBackgroundPreload } from './preload.js';  // loading screen + asset preload
import './img-fallback.js';  // retries failed .gif creature art as .png
import './sprites-gif.js';  // switches pets + monsters over to the animated .gif art
import './facing.js';       // sprite pose: which way art faces, and what floats
import './battle-bg.js';    // per-map fight backdrops from assets/battle/
import './battle-hud.js';   // pixel HP/MP icons + Rockman-style SPD/CRT bars
import './icons.js';        // stamps img/iconImg onto data.js tables
import './icon-style.js';   // injects .data-icon sizing rule
import './menu-icons.js';   // swaps hardcoded shell/pet-detail emoji for PNGs
import './inv-layout.js';   // fits + centres the inventory grids
import './win-chrome.js';   // no traffic-light dots on the world + city map panes
import './galaxy.js';       // Galaxy hub/submaps; final videos can be uploaded later
import './galaxy-monsters.js'; // celestial roster; must load AFTER galaxy.js
import './dnd.js';          // Tabletop Realm + hero-class enemies; gate sits on the Galaxy hub, so must load AFTER galaxy.js
import './safe-scene.js';   // per-map merchant portrait + tavern-door entrance; needs every map registered, so AFTER galaxy.js/dnd.js

// ── DEV TOOLS ──
// These two files existed in the repo but nothing ever imported them.
// index.html has a single script tag (this file), so an unimported
// module is simply never fetched: wireDevMode() never ran, the SIM
// module never self-booted, and neither the ⚙️ DEV button nor the
// 🎛️ SIM button was ever put in the DOM. That -- not a CSS or z-index
// problem -- is why the dev icons could not be found anywhere.
//
// Imported LAST, and every call below is individually guarded, so a
// dev tool that throws can never stop the game from booting.
import './dev-battle-sim.js';                              // battle-scene simulator; self-boots its own button
import { applyDevMapPatch, wireDevMode } from './dev-mode.js';  // map/enemy patch exporter + the ⚙️ DEV button

// NOTE: equip-board-bg.js is deliberately NOT imported. It drew a stand-in
// circuit board in SVG while assets/ui/equip_circuit_bg.jpg was missing from
// the repo. The original art has been restored from git history, so the real
// file is used again. The module is kept only as a fallback -- import it if
// that asset ever goes missing a second time.

import { hackState } from './battle/combat.js';
import { startArena } from './battle/encounters.js';
import { boot } from './state.js';
import { closeModal, showScreen } from './ui-shell.js';

window.VIRUZ = {
  startArena, showScreen, closeModal,
  resetGame: async () => {
    if (!confirm('\u0e25\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e17\u0e31\u0e49\u0e07\u0e2b\u0e21\u0e14\u0e41\u0e25\u0e30\u0e40\u0e23\u0e34\u0e48\u0e21\u0e43\u0e2b\u0e21\u0e48?')) return;
    localStorage.clear(); location.reload();
  },
  _hackAnswer: () => hackState && hackState.puzzle && hackState.puzzle.answer,
};

// ── BOOT ──
// Preload the art, THEN boot. The loading screen stays up across boot()
// as well, so the first frame the player sees is a fully painted screen
// with its assets already cached -- not a map filling in as files land.
// Every step is guarded: a failed preload, or a failed boot, still ends
// with the overlay removed rather than a permanently blank screen.
//
// The saved dev map patch is applied BEFORE boot() so the first paint
// of the city/world already carries the developer's node edits; the
// ⚙️ DEV button is wired AFTER, once the screens it overlays exist.
runPreload()
  .catch(err => console.warn('[boot] preload failed, starting anyway:', err))
  .then(() => {
    try { applyDevMapPatch(); } catch (err) { console.warn('[dev] map patch skipped:', err); }
  })
  .then(() => boot())
  .catch(err => console.error('[boot] failed:', err))
  .then(() => {
    finishPreload();
    startBackgroundPreload();   // quietly fetch whatever was left for later
    try { wireDevMode(); } catch (err) { console.warn('[dev] dev mode not wired:', err); }
  });
