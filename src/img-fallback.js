// ═══════════════════════════════════════════════════════════
// VIRUZ — IMAGE FALLBACK (.gif → .png)
//
// The "animated idle" pass rewrote every creature image path to .gif:
//   • pets    — spriteV2Path(...).replace(/\.png$/, '.gif')  (sprites.js)
//   • monsters— MONSTER_GIF_FOLDERS → assets/sprites/<folder>/still.gif
//
// The .gif art itself is not in the repo (assets/sprites and
// assets/sprites_v2 still hold only .png), so every one of those
// requests 404s and the entire roster renders as a broken image.
//
// This installs ONE capture-phase error listener that retries a failed
// .gif as the .png that IS present. It is self-healing: once the real
// .gif files are committed they load first and this never fires, so no
// second code change is needed when the animated art lands.
//
// If the retry also fails (e.g. stone_imp / fang_stalker have no art
// folder at all) the image is hidden rather than showing the browser's
// broken-image icon.
// ═══════════════════════════════════════════════════════════

const RETRY_FLAG = 'imgFallbackTried';

function onImageError(e) {
  const img = e.target;
  if (!img || img.tagName !== 'IMG') return;

  // Second failure — the .png is missing too. Hide it quietly.
  if (img.dataset[RETRY_FLAG]) {
    img.style.visibility = 'hidden';
    return;
  }

  const src = img.getAttribute('src') || '';
  if (!/\.gif(\?.*)?$/i.test(src)) return;

  img.dataset[RETRY_FLAG] = '1';
  img.setAttribute('src', src.replace(/\.gif(\?.*)?$/i, '.png$1'));
}

// Capture phase is required: image load errors do not bubble, so a
// normal document-level listener would never see them.
document.addEventListener('error', onImageError, true);
