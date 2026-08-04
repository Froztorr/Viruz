// ═══════════════════════════════════════════════════════════
// VIRUZ PET — ICON STYLESHEET
// The one CSS rule that iconHtml() (src/icons.js) depends on.
//
// Injected from JS instead of being added to styles.css on purpose:
// that file is ~143 KB, and editing a file through the GitHub API
// means rewriting it in full, which is a lot of risk for one rule.
// This is self-contained and runs before the first render.
//
// Sizing is deliberately 1em. Every icon used to be an emoji glyph
// sized by its container's font-size, so 1em reproduces the old
// dimensions everywhere at once -- dense inventory boxes, the 40px
// modal header, the tiny inline stat rows -- with no per-container
// overrides to maintain.
// ═══════════════════════════════════════════════════════════

const CSS = `
.data-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  line-height: 1;
  vertical-align: -0.15em;
  object-fit: contain;
  image-rendering: pixelated;
}
`;

export function injectIconCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('data-icon-css')) return;
  const style = document.createElement('style');
  style.id = 'data-icon-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

injectIconCss();
