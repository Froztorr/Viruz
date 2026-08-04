// ═══════════════════════════════════════════════════════════
// VIRUZ PET — INVENTORY GRID FIT
// Keeps the icon-box grids inside the window and centred.
//
// The grids were laying out a column whose right edge fell past the
// window border, clipping the last box in each row. The cause is
// sizing columns from the box rather than from the space available:
// nothing in that arrangement knows to stop before the container ends.
//
// auto-fit fixes it by construction. The browser fits as many 64px
// columns as genuinely fit and no more, and justify-content centres
// that block in whatever width is left over, so the row is centred
// whether it holds two boxes or nine. Boxes are squared with
// aspect-ratio instead of a fixed height so they scale with the
// column and never end up rectangular.
//
// Injected at runtime rather than edited into styles.css: the sheet is
// 143KB and these rules need to win against whatever is already
// declared there, which a late stylesheet does cleanly.
// ═══════════════════════════════════════════════════════════

const CSS = `
/* Fit-and-centre. minmax(0, 64px) lets a column shrink on a narrow
   phone instead of forcing an overflow, which a bare 64px would. */
.inv-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fit, minmax(0, 64px)) !important;
  justify-content: center !important;
  align-items: start !important;
  gap: 8px !important;
  width: 100% !important;
  max-width: 100% !important;
  margin: 0 auto !important;
  padding: 8px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

/* Square boxes that follow the column width. */
.inv-box {
  position: relative !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  max-width: 64px !important;
  min-width: 0 !important;
  height: auto !important;
  aspect-ratio: 1 / 1 !important;
  padding: 4px !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.inv-box-icon {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  height: 100% !important;
  font-size: 26px !important;
  line-height: 1 !important;
}

/* Covers every icon convention at once: iconHtml's .data-icon,
   equipIconHtml's .eq-icon-img and potionIconHtml's .pot-icon-img. */
.inv-box img {
  width: 34px !important;
  height: 34px !important;
  max-width: 100% !important;
  max-height: 100% !important;
  object-fit: contain !important;
}

.inv-box-num {
  font-size: 11px !important;
  line-height: 1.2 !important;
  padding: 1px 4px !important;
}

.inv-box-lock { font-size: 12px !important; }

/* The empty-state message is a grid child too, so without this it
   would be squeezed into a single 64px column. */
.inv-empty-msg {
  grid-column: 1 / -1 !important;
  text-align: center !important;
  padding: 14px 8px !important;
}

/* Same centring for the two potion/poison wheel loadout rows. */
.throw-loadout-grid {
  justify-content: center !important;
  flex-wrap: wrap !important;
}
`;

export function injectInvLayoutCss() {
  if (document.getElementById('inv-layout-css')) return;
  const style = document.createElement('style');
  style.id = 'inv-layout-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

injectInvLayoutCss();
