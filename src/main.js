// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.
import './icons.js';          // stamps img/iconImg onto data.js tables
import './icon-style.js';     // injects .data-icon sizing rule
import './menu-icons.js';     // swaps hardcoded shell/pet-detail emoji for PNGs
import './inv-layout.js';     // fits + centres the inventory grids
import './equip-board-bg.js'; // draws the equip circuit board (art file missing)

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
