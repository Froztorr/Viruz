// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.
import './img-fallback.js';  // retries failed .gif creature art as .png
import './sprites-gif.js';  // switches pets + monsters over to the animated .gif art
import './facing.js';       // sprite pose: which way art faces, and what floats
import './battle-bg.js';    // per-map fight backdrops from assets/battle/
import './icons.js';        // stamps img/iconImg onto data.js tables
import './icon-style.js';   // injects .data-icon sizing rule
import './menu-icons.js';   // swaps hardcoded shell/pet-detail emoji for PNGs
import './inv-layout.js';   // fits + centres the inventory grids
import './galaxy.js';       // Galaxy hub/submaps; final videos can be uploaded later
import './galaxy-monsters.js'; // celestial roster; must load AFTER galaxy.js

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
boot();
