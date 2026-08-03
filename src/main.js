// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

import { hackState } from './battle/combat.js';
import { startArena } from './battle/encounters.js';
import { boot } from './state.js';
import { closeModal, showScreen } from './ui-shell.js';

window.VIRUZ = {
  startArena,
  showScreen,
  closeModal,
  resetGame: async () => {
    if (!confirm('ลบข้อมูลทั้งหมดและเริ่มใหม่?')) return;
    localStorage.clear();
    location.reload();
  },
  // test/debug hook — current hack puzzle answer, if any
  _hackAnswer: () => hackState && hackState.puzzle && hackState.puzzle.answer,
};

boot();
