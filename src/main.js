// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.
import './img-fallback.js';  // retries failed .gif creature art as .png
import './sprites-gif.js';  // switches pets + monsters over to the animated .gif art
import './icons.js';        // stamps img/iconImg onto data.js tables
import './icon-style.js';   // injects .data-icon sizing rule
import './menu-icons.js';   // swaps hardcoded shell/pet-detail emoji for PNGs
import './inv-layout.js';   // fits + centres the inventory grids
import './galaxy.js';       // Galaxy hub/submaps; final videos can be uploaded later

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
    if (!confirm('ลบข้อมูลทั้งหมดและเริ่มใหม่?')) return;
    localStorage.clear(); location.reload();
  },
  _hackAnswer: () => hackState && hackState.puzzle && hackState.puzzle.answer,
};
boot();
