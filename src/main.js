// Auto-split from the original monolithic game.js as part of a
// codebase reorganization pass -- see git history for prior structure.

// Side-effect import: stamps img/iconImg onto the data.js tables (see
// src/icons.js). Must run before boot() so the first render already
// sees the paths. Safe with no art present -- iconHtml() falls back to
// the emoji for any file that is missing.
import './icons.js';

// Side-effect import: injects the .data-icon rule that iconHtml()
// relies on for sizing (see src/icon-style.js).
import './icon-style.js';

// Side-effect import: swaps the hardcoded emoji in the app shell and
// the pet detail panel for the real PNGs (see src/menu-icons.js).
// Those places write their glyph into markup as literal text and never
// call iconHtml(), so art alone does not reach them.
import './menu-icons.js';

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
